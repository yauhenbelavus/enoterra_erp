const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const multer = require('multer');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Логирование всех запросов для отладки
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    cb(null, `tmp-${Date.now()}-${randomSuffix}.pdf`);
  }
});

const upload = multer({ storage: storage });

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PL_SLUG_MAP = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  Ą: 'a', Ć: 'c', Ę: 'e', Ł: 'l', Ń: 'n', Ó: 'o', Ś: 's', Ź: 'z', Ż: 'z',
};

function slugifyUploadName(source) {
  const translit = String(source || '').replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (ch) => PL_SLUG_MAP[ch] || '');
  const slug = translit
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return slug || 'dostawca';
}

function nextReceiptUploadName(kind, sprzedawca) {
  const slug = slugifyUploadName(sprzedawca);
  const prefix = `${slug}-${kind}-`;
  let max = 0;
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)\\.pdf$`, 'i');
    for (const file of files) {
      const match = file.match(re);
      if (match) max = Math.max(max, parseInt(match[1], 10) || 0);
    }
  } catch (err) {
    console.error('❌ Error reading uploads for invoice name:', err.message);
  }
  let n = max + 1;
  let name = `${prefix}${n}.pdf`;
  while (fs.existsSync(path.join(UPLOADS_DIR, name))) {
    n += 1;
    name = `${prefix}${n}.pdf`;
  }
  return name;
}

function assignReceiptUploadName(tempFilename, kind, sprzedawca) {
  if (!tempFilename) return null;
  const tempPath = path.join(UPLOADS_DIR, path.basename(tempFilename));
  if (!fs.existsSync(tempPath)) return path.basename(tempFilename);
  const finalName = nextReceiptUploadName(kind, sprzedawca);
  fs.renameSync(tempPath, path.join(UPLOADS_DIR, finalName));
  console.log(`📎 Receipt upload renamed: ${path.basename(tempFilename)} → ${finalName}`);
  return finalName;
}

function unlinkReceiptUpload(filename) {
  if (!filename || typeof filename !== 'string') return;
  const base = path.basename(filename.trim());
  if (!base || base === '.' || base === '..') return;
  const filePath = path.join(UPLOADS_DIR, base);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Deleted upload: ${base}`);
    }
  } catch (err) {
    console.error(`❌ Failed to delete upload ${base}:`, err.message);
  }
}

function unlinkReplacedReceiptUpload(oldName, newName) {
  if (!newName || !oldName || oldName === newName) return;
  unlinkReceiptUpload(oldName);
}

function discardRequestReceiptUploads(req, assigned) {
  if (req.files?.product_invoice) {
    unlinkReceiptUpload(assigned && assigned.productInvoice);
    unlinkReceiptUpload(req.files.product_invoice[0] && req.files.product_invoice[0].filename);
  }
  if (req.files?.transport_invoice) {
    unlinkReceiptUpload(assigned && assigned.transportInvoice);
    unlinkReceiptUpload(req.files.transport_invoice[0] && req.files.transport_invoice[0].filename);
  }
}

const ocrUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Dozwolone są tylko pliki PDF'));
    }
  },
});

const { parsePurchaseInvoicePdf } = require('./purchaseInvoiceOcr');
const { validatePurchaseReceipt, toTitleCaseNazwa, freightLineValue, receiptFreightValueTotal } = require('./purchaseReceiptValidation.mjs');
const { isKursValueFilled, needsKursToPln, validateRequiredKurs } = require('./receiptKursValidation.mjs');
const { fetchNbpRates } = require('./nbpRates');

// Serve uploaded files from uploads directory (ДОЛЖЕН БЫТЬ ПЕРЕД ВСЕМИ API endpoints)
app.use('/uploads', (req, res, next) => {
  console.log(`📁 Uploads middleware: ${req.method} ${req.url}`);
  console.log(`📁 Looking for file: ${path.join(__dirname, 'uploads', req.url)}`);
  
  // Проверяем существование файла
  const filePath = path.join(__dirname, 'uploads', req.url);
  if (fs.existsSync(filePath)) {
    console.log(`✅ File exists: ${filePath}`);
    // Устанавливаем заголовки для PDF
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
    }
    // Отправляем файл
    res.sendFile(filePath);
  } else {
    console.log(`❌ File not found: ${filePath}`);
    res.status(404).json({ error: 'File not found', path: filePath });
  }
});

// Database setup
const dbPath = path.join(__dirname, 'enoterra_erp.db');
const db = new sqlite3.Database(dbPath);

// Устанавливаем таймаут для операций с базой данных
db.configure('busyTimeout', 30000); // 30 секунд

function normalizeProductKod(kod) {
  return String(kod || '').trim();
}

function normalizeReceiptProducts(products) {
  if (!Array.isArray(products)) return products;
  return products.map((product) => ({
    ...product,
    kod: normalizeProductKod(product.kod),
    nazwa: toTitleCaseNazwa(product.nazwa),
  }));
}

// Dokumenty, które blokują zmianę/usunięcie kodu w przyjęciu:
// zamówienie, rozchód (odpisanie), zwrot, przychód.
const KOD_CHANGE_BLOCKING_ORDER_TYPES = ['zamowienie', 'odpisanie', 'zwrot', 'przychod'];

/**
 * Sprawdza dokumenty blokujące usunięcie/zmianę kodu w przyjęciu.
 * A) były wydania z partii tej przyjemki (order_consumptions → products.receipt_id)
 * B) dokument utworzony w dniu przyjęcia lub później i zawiera ten kod
 */
function findDocumentsBlockingKodChange(receiptId, removedKod, receiptDate) {
  return new Promise((resolve, reject) => {
    const types = KOD_CHANGE_BLOCKING_ORDER_TYPES;
    const typePlaceholders = types.map(() => '?').join(',');
    const receiptDateOnly = String(receiptDate || '').substring(0, 10);

    const sql = `
      SELECT
        o.id AS order_id,
        o.numer_zamowienia,
        o.typ,
        COALESCE(
          (SELECT op.nazwa FROM order_products op
           WHERE op.orderId = o.id AND op.kod = ? LIMIT 1),
          ''
        ) AS nazwa,
        COALESCE(
          (SELECT SUM(op.ilosc) FROM order_products op
           WHERE op.orderId = o.id AND op.kod = ?),
          (SELECT SUM(oc.quantity) FROM order_consumptions oc
           WHERE oc.order_id = o.id AND oc.product_kod = ?),
          0
        ) AS ilosc
      FROM orders o
      WHERE o.typ IN (${typePlaceholders})
        AND (
          (
            date(o.data_utworzenia) >= date(?)
            AND EXISTS (
              SELECT 1 FROM order_products op
              WHERE op.orderId = o.id AND op.kod = ?
            )
          )
          OR EXISTS (
            SELECT 1
            FROM order_consumptions oc
            JOIN products p ON p.id = oc.batch_id
            WHERE oc.order_id = o.id
              AND oc.product_kod = ?
              AND p.receipt_id = ?
          )
        )
      ORDER BY o.data_utworzenia ASC, o.id ASC
    `;

    const params = [
      removedKod,
      removedKod,
      removedKod,
      ...types,
      receiptDateOnly,
      removedKod,
      removedKod,
      receiptId,
    ];

    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(
        (rows || []).map((r) => ({
          id: r.order_id,
          numer_zamowienia: r.numer_zamowienia,
          typ: r.typ,
          nazwa: r.nazwa || '',
          ilosc: Number(r.ilosc) || 0,
        }))
      );
    });
  });
}

function findDocumentsBlockingReceiptDelete(receiptId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT
         o.id AS order_id,
         o.numer_zamowienia,
         o.typ,
         oc.product_kod AS kod,
         COALESCE(
           (SELECT op.nazwa FROM order_products op
            WHERE op.orderId = o.id AND op.kod = oc.product_kod LIMIT 1),
           ''
         ) AS nazwa,
         SUM(oc.quantity) AS ilosc
       FROM order_consumptions oc
       JOIN products p ON p.id = oc.batch_id
       JOIN orders o ON o.id = oc.order_id
       WHERE p.receipt_id = ?
         AND oc.quantity > 0
       GROUP BY o.id, o.numer_zamowienia, o.typ, oc.product_kod
       ORDER BY o.data_utworzenia ASC, o.id ASC`,
      [receiptId],
      (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(
          (rows || []).map((r) => ({
            id: r.order_id,
            numer_zamowienia: r.numer_zamowienia,
            typ: r.typ,
            kod: r.kod || '',
            nazwa: r.nazwa || '',
            ilosc: Number(r.ilosc) || 0,
          }))
        );
      }
    );
  });
}

// ===== Мультивалютность фактур =====
// Код валюты фактуры в верхнем регистре, по умолчанию EUR.
function normalizeWalutaFaktury(waluta) {
  const s = String(waluta == null ? 'EUR' : waluta).trim().toUpperCase();
  return s || 'EUR';
}

function normalizeWalutaDostawy(waluta) {
  const s = String(waluta == null ? '' : waluta).trim().toUpperCase();
  if (s === 'EUR' || s === 'PLN' || s === 'DKK') return s;
  return null;
}

// Разбор курса (принимает запятую как десятичный разделитель). Курсы всегда
// приходят в стандартном направлении "1 EUR = X валюты", > 0, округление до 2 знаков.
function parseKursValue(value, fallback = 1) {
  const n = parseFloat(String(value == null ? '' : value).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n * 100) / 100;
}

function parseKursToPln(waluta, value) {
  if (!needsKursToPln(waluta)) return 1;
  return parseKursValue(value);
}

function withCenaPln(products, walutaFaktury, kursFakturyToPln) {
  if (!Array.isArray(products)) return products;
  const waluta = normalizeWalutaFaktury(walutaFaktury);
  const rate = parseKursValue(kursFakturyToPln);
  return products.map((p) => {
    const orig = roundMoney(p.cena);
    const cenaPln = waluta === 'PLN' ? orig : roundMoney(orig * rate);
    return { ...p, cena: cenaPln, cenaOryginalna: orig };
  });
}

// Пересчёт цены одной позиции из валюты фактуры в EUR.
//  - EUR: цена как есть
//  - PLN / DKK: делим на kursFaktury (курс EUR→валюта фактуры)
function convertCenaToEur(cena, walutaFaktury, aktualnyKurs, kursFaktury) {
  const price = parseFloat(String(cena == null ? '0' : cena).replace(',', '.')) || 0;
  const waluta = normalizeWalutaFaktury(walutaFaktury);
  if (waluta === 'EUR') return price;
  const divisor = parseKursValue(kursFaktury);
  return Math.round((price / divisor) * 100) / 100;
}

// Курс EUR→PLN для доставки (€ × курс).
// Для фактур в PLN берём kurs_2; kurs_1 не используется.
function getKursEurPln(walutaFaktury, aktualnyKurs, kursFaktury) {
  const waluta = normalizeWalutaFaktury(walutaFaktury);
  if (waluta === 'PLN') return parseKursValue(kursFaktury);
  return parseKursValue(aktualnyKurs);
}

function resolveReceiptRatesToPln(kursMode, walutaDostawy, walutaFaktury, kosztDostawy, aktualnyKurs, kursFaktury) {
  if (kursMode === 'toPln') {
    const dostawy = String(walutaDostawy || '').trim().toUpperCase();
    const deliveryAmount = parseFloat(String(kosztDostawy == null ? '0' : kosztDostawy).replace(',', '.')) || 0;
    if (deliveryAmount > 0 && dostawy !== 'EUR' && dostawy !== 'PLN' && dostawy !== 'DKK') {
      return { error: 'Wybierz walutę dostawy' };
    }
    if (needsKursToPln(dostawy) && !isKursValueFilled(aktualnyKurs)) {
      return { error: `Wprowadź kurs 1 PLN/${dostawy}` };
    }
    if (needsKursToPln(walutaFaktury) && !isKursValueFilled(kursFaktury)) {
      return { error: `Wprowadź kurs 2 PLN/${walutaFaktury}` };
    }
    const kursFakturyToPln = parseKursToPln(walutaFaktury, kursFaktury);
    const kursDostawyToPln = parseKursToPln(dostawy, aktualnyKurs);
    return {
      kursFakturyToPln,
      kursDostawyToPln,
      aktualnyKursForDb: kursDostawyToPln,
      kursFakturyForDb: kursFakturyToPln,
    };
  }

  const kursValidationError = validateRequiredKurs(walutaFaktury, aktualnyKurs, kursFaktury);
  if (kursValidationError) return { error: kursValidationError };
  const parsedKursFaktury = parseKursValue(kursFaktury);
  const kursEurPln = getKursEurPln(walutaFaktury, aktualnyKurs, parsedKursFaktury);
  return {
    kursFakturyToPln: parsedKursFaktury,
    kursDostawyToPln: kursEurPln,
    aktualnyKursForDb: normalizeWalutaFaktury(walutaFaktury) === 'PLN' ? 1 : parseKursValue(aktualnyKurs),
    kursFakturyForDb: parsedKursFaktury,
  };
}

// Готовит рабочую копию позиций приёмки для внутренней обработки (таблица
// products, working_sheets): цена конвертируется в EUR, а оригинальная цена в валюте
// фактуры сохраняется в cenaOryginalna.
function withCenaEur(products, walutaFaktury, aktualnyKurs, kursFaktury) {
  if (!Array.isArray(products)) return products;
  const waluta = normalizeWalutaFaktury(walutaFaktury);
  return products.map((p) => {
    const cenaOryginalna = parseFloat(String(p.cena == null ? '0' : p.cena).replace(',', '.')) || 0;
    const cenaEur = waluta === 'EUR'
      ? cenaOryginalna
      : convertCenaToEur(cenaOryginalna, waluta, aktualnyKurs, kursFaktury);
    return { ...p, cena: cenaEur, cenaOryginalna };
  });
}

function getTodayDateString() {
  return new Date().toLocaleDateString('en-CA');
}

function ensureWorkingSheetsUniqueIndex() {
  db.run('DROP INDEX IF EXISTS idx_working_sheets_kod_active', (dropErr) => {
    if (dropErr) {
      console.error('❌ Error dropping old working_sheets kod index:', dropErr.message);
    }
    db.run(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_working_sheets_kod_unique ON working_sheets(kod)',
      (err) => {
        if (err) {
          console.error('❌ Error creating working_sheets kod unique index:', err.message);
        } else {
          console.log('✅ working_sheets unique index on kod ready');
        }
      }
    );
  });
}

function roundMoney(value) {
  const n = parseFloat(String(value ?? '0').replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function formatProductCenaZakupu(row) {
  if (!row) return row;
  return {
    ...row,
    cena_zakupu_pln: row.cena_zakupu_pln == null ? row.cena_zakupu_pln : roundMoney(row.cena_zakupu_pln),
    cena_zakupu_org: row.cena_zakupu_org == null ? row.cena_zakupu_org : roundMoney(row.cena_zakupu_org),
  };
}

function mapProductReceiptApiRow(row) {
  if (!row) return row;
  const { wartosc, waluta_faktury, walutaFaktury, kosztDostawy, products, aktualny_kurs, kurs_faktury, productInvoice, transportInvoice, podatek_akcyzowy, podatekAkcyzowy, ...rest } = row;
  return {
    ...rest,
    wartosc_przyjecia_netto: rest.wartosc_przyjecia_netto ?? wartosc ?? 0,
    vat: rest.vat ?? 0,
    wartosc_przyjecia_brutto: rest.wartosc_przyjecia_brutto ?? 0,
    waluta_przyjecia: rest.waluta_przyjecia ?? waluta_faktury ?? walutaFaktury ?? 'EUR',
    waluta_dostawy: rest.waluta_dostawy || null,
    wartosc_dostawy: rest.wartosc_dostawy ?? kosztDostawy ?? 0,
    kurs_1: rest.kurs_1 ?? 1,
    kurs_2: rest.kurs_2 ?? 1,
    product_invoice: rest.product_invoice ?? productInvoice ?? null,
    transport_invoice: rest.transport_invoice ?? transportInvoice ?? null,
    stawka_podatek_akcyzowy: roundMoney(rest.stawka_podatek_akcyzowy ?? podatek_akcyzowy ?? podatekAkcyzowy),
    rabat: roundMoney(rest.rabat),
    products: [],
  };
}

function orgPurchasePrice(product) {
  const raw = product.cena_zakupu_org != null ? product.cena_zakupu_org : product.cena_faktury;
  return roundMoney(raw != null ? raw : product.cena);
}

function stampCenaZakupuOrg(products) {
  if (!Array.isArray(products)) return products;
  return products.map((p) => ({
    ...p,
    cena: roundMoney(p.cena),
    cena_zakupu_org: orgPurchasePrice(p),
  }));
}

function kosztDostawyPerUnitFromReceipt(receipt, lines) {
  const kurs = getKursEurPln(receipt.waluta_przyjecia, receipt.kurs_1, receipt.kurs_2);
  const wartosc = parseFloat(String(receipt.wartosc_dostawy ?? '0').replace(',', '.')) || 0;
  const bottles = (lines || []).reduce((total, product) => {
    if (product.typ === 'aksesoria') return total;
    return total + (product.ilosc || 0);
  }, 0);
  return bottles > 0 ? roundMoney((wartosc / bottles) * kurs) : 0;
}

function stampKosztDostawyPerUnitSrednie(products, kosztDostawyPerUnit) {
  if (!Array.isArray(products)) return products;
  const value = roundMoney(kosztDostawyPerUnit);
  for (const product of products) {
    product.koszt_dostawy_per_unit_srednie = product.typ === 'aksesoria' ? 0 : value;
  }
  return products;
}

function kosztDostawyPerUnitFromKosztBut(product, products, totalValue, kosztDostawy, kurs) {
  const qty = parseFloat(String(product == null || product.ilosc == null ? '0' : product.ilosc).replace(',', '.')) || 0;
  const lineValue = freightLineValue(product, products);
  if (totalValue <= 0 || qty <= 0) return 0;
  return roundMoney(((kosztDostawy || 0) * lineValue) / (totalValue * qty) * (kurs || 0));
}

function stampKosztDostawyPerUnit(products, kosztDostawy, kurs) {
  if (!Array.isArray(products)) return products;
  const totalValue = receiptFreightValueTotal(products);
  for (const product of products) {
    product.koszt_dostawy_per_unit = product.typ === 'aksesoria'
      ? 0
      : kosztDostawyPerUnitFromKosztBut(product, products, totalValue, kosztDostawy, kurs);
  }
  return products;
}

function isAkcyzaExemptTyp(typ) {
  return typ === 'bezalkoholowe' || typ === 'ferment' || typ === 'aksesoria';
}

function podatekAkcyzowyForProduct(product, stawkaPerLiter) {
  if (isAkcyzaExemptTyp(product && product.typ)) return 0;
  const stawka = parseFloat(String(stawkaPerLiter == null ? '0' : stawkaPerLiter).replace(',', '.')) || 0;
  if (stawka === 0) return 0;
  const objetosc = parseFloat(String(product && product.objetosc != null && product.objetosc !== '' ? product.objetosc : '1').replace(',', '.')) || 1;
  return roundMoney(stawka * objetosc);
}

function stampPodatekAkcyzowy(products, stawkaPerLiter) {
  if (!Array.isArray(products)) return products;
  for (const product of products) {
    product.podatek_akcyzowy = podatekAkcyzowyForProduct(product, stawkaPerLiter);
  }
  return products;
}

function receiptLineFields(product) {
  const dataWaznosci = product.dataWaznosci || product.data_waznosci || null;
  return {
    typ: product.typ || null,
    objetosc: product.objetosc != null && product.objetosc !== '' ? String(product.objetosc) : null,
    data_waznosci: dataWaznosci || null,
    vat: roundMoney(product.vat),
    cena_zakupu_org: orgPurchasePrice(product),
    koszt_dostawy_per_unit: roundMoney(product.koszt_dostawy_per_unit),
    koszt_dostawy_per_unit_srednie: product.typ === 'aksesoria'
      ? 0
      : roundMoney(product.koszt_dostawy_per_unit_srednie),
    podatek_akcyzowy: roundMoney(product.podatek_akcyzowy),
  };
}

function mapProductBatchToReceiptLine(row) {
  const cenaFaktury = roundMoney(row.cena_zakupu_org != null ? row.cena_zakupu_org : row.cena_zakupu_pln);
  return {
    id: row.id,
    kod: row.kod,
    nazwa: row.nazwa,
    kod_kreskowy: row.kod_kreskowy,
    ilosc: row.ilosc_pierwotna != null ? row.ilosc_pierwotna : row.ilosc,
    ilosc_aktualna: row.ilosc_aktualna,
    cena: cenaFaktury,
    dataWaznosci: row.data_waznosci || undefined,
    data_waznosci: row.data_waznosci || undefined,
    typ: row.typ || undefined,
    objetosc: row.objetosc != null && row.objetosc !== '' ? row.objetosc : undefined,
    vat: row.vat ?? 0,
    koszt_dostawy_per_unit: roundMoney(row.koszt_dostawy_per_unit),
    koszt_dostawy_per_unit_srednie: roundMoney(row.koszt_dostawy_per_unit_srednie),
    podatek_akcyzowy: roundMoney(row.podatek_akcyzowy),
  };
}

function insertProductBatchSql() {
  return 'INSERT INTO products (kod, nazwa, kod_kreskowy, cena_zakupu_pln, ilosc_pierwotna, ilosc_aktualna, receipt_id, czy_probki, created_at, typ, objetosc, data_waznosci, vat, cena_zakupu_org, koszt_dostawy_per_unit_srednie, koszt_dostawy_per_unit, podatek_akcyzowy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
}

function insertProductBatchParams(product, receiptId, iloscAktualna, date) {
  const line = receiptLineFields(product);
  return [
    product.kod,
    product.nazwa,
    product.kod_kreskowy || null,
    roundMoney(product.cena || 0),
    product.ilosc,
    iloscAktualna,
    receiptId,
    (product.cena || 0) === 0 ? 1 : 0,
    date,
    line.typ,
    line.objetosc,
    line.data_waznosci,
    line.vat,
    line.cena_zakupu_org,
    line.koszt_dostawy_per_unit_srednie,
    line.koszt_dostawy_per_unit,
    line.podatek_akcyzowy,
  ];
}

function updateProductBatchByIdSql(withQty) {
  return withQty
    ? `UPDATE products SET kod = ?, nazwa = ?, kod_kreskowy = ?, cena_zakupu_pln = ?, ilosc_pierwotna = ?, ilosc_aktualna = ?, czy_probki = ?, typ = ?, objetosc = ?, data_waznosci = ?, vat = ?, cena_zakupu_org = ?, koszt_dostawy_per_unit_srednie = ?, koszt_dostawy_per_unit = ?, podatek_akcyzowy = ? WHERE id = ?`
    : `UPDATE products SET kod = ?, nazwa = ?, kod_kreskowy = ?, cena_zakupu_pln = ?, czy_probki = ?, typ = ?, objetosc = ?, data_waznosci = ?, vat = ?, cena_zakupu_org = ?, koszt_dostawy_per_unit_srednie = ?, koszt_dostawy_per_unit = ?, podatek_akcyzowy = ? WHERE id = ?`;
}

function updateProductBatchByIdParams(product, productId, withQty, iloscAktualna) {
  const line = receiptLineFields(product);
  const values = [
    product.kod,
    product.nazwa,
    product.kod_kreskowy || null,
    roundMoney(product.cena || 0),
  ];
  if (withQty) {
    values.push(product.ilosc, iloscAktualna);
  }
  values.push(
    (product.cena || 0) === 0 ? 1 : 0,
    line.typ,
    line.objetosc,
    line.data_waznosci,
    line.vat,
    line.cena_zakupu_org,
    line.koszt_dostawy_per_unit_srednie,
    line.koszt_dostawy_per_unit,
    line.podatek_akcyzowy,
    productId
  );
  return values;
}

function productBatchPierwotna(record) {
  return Number(record && (record.ilosc_pierwotna != null ? record.ilosc_pierwotna : record.ilosc)) || 0;
}

function productBatchAktualna(record) {
  return Number(record && record.ilosc_aktualna) || 0;
}

function productBatchIssuedQty(record) {
  return Math.max(0, productBatchPierwotna(record) - productBatchAktualna(record));
}

function adjustWorkingSheetIlosc(kod, delta) {
  const amount = Number(delta) || 0;
  if (!kod || amount === 0) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
      [amount, kod],
      function (err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      }
    );
  });
}

function pairReceiptProductBatches(oldRecords, newItems) {
  const unused = (oldRecords || []).slice();
  const pairs = [];
  const unknownIds = [];
  const duplicateIds = [];
  const seenIds = new Set();
  for (const item of newItems || []) {
    const itemId = Number(item && item.id);
    if (!itemId) {
      pairs.push({ record: null, item });
      continue;
    }
    if (seenIds.has(itemId)) {
      duplicateIds.push(itemId);
      continue;
    }
    seenIds.add(itemId);
    const idx = unused.findIndex((row) => Number(row.id) === itemId);
    if (idx >= 0) {
      pairs.push({ record: unused.splice(idx, 1)[0], item });
    } else {
      unknownIds.push(itemId);
    }
  }
  for (const record of unused) {
    pairs.push({ record, item: null });
  }
  return { pairs, unknownIds, duplicateIds };
}

function attachReceiptProductsFromTable(receipts, callback) {
  if (!receipts || receipts.length === 0) {
    callback(null, []);
    return;
  }
  db.all(
    'SELECT * FROM products WHERE receipt_id IS NOT NULL ORDER BY receipt_id ASC, id ASC',
    (err, rows) => {
      if (err) {
        callback(err);
        return;
      }
      const byReceipt = new Map();
      for (const row of rows || []) {
        const list = byReceipt.get(row.receipt_id) || [];
        list.push(mapProductBatchToReceiptLine(row));
        byReceipt.set(row.receipt_id, list);
      }
      const mapped = receipts.map((receipt) => {
        const api = mapProductReceiptApiRow(receipt);
        api.products = byReceipt.get(receipt.id) || [];
        return api;
      });
      callback(null, mapped);
    }
  );
}

function loadReceiptProductBatches(receiptId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM products WHERE receipt_id = ? ORDER BY id ASC',
      [receiptId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

function uniqueReceiptKodsFromRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const kod = normalizeProductKod(row.kod);
    if (!kod || seen.has(kod)) continue;
    seen.add(kod);
    out.push({ kod, nazwa: row.nazwa });
  }
  return out;
}

function loadLatestProductBatchByKod(kod, options = {}) {
  const pricedOnly = options.pricedOnly === true;
  const pricedFilter = pricedOnly
    ? ' AND COALESCE(p.cena_zakupu_pln, 0) > 0'
    : '';
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT p.*, r.sprzedawca AS receipt_sprzedawca
       FROM products p
       LEFT JOIN product_receipts r ON r.id = p.receipt_id
       WHERE p.kod = ?${pricedFilter}
       ORDER BY COALESCE(r.data_przyjecia, p.created_at) DESC, p.id DESC
       LIMIT 1`,
      [kod],
      (err, row) => (err ? reject(err) : resolve(row || null))
    );
  });
}

function getWorkingSheetByKod(kod) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM working_sheets WHERE kod = ?', [kod], (err, row) => (
      err ? reject(err) : resolve(row || null)
    ));
  });
}

function sumProductsIloscAktualnaByKod(kod) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT SUM(ilosc_aktualna) as total_ilosc FROM products WHERE kod = ?',
      [kod],
      (err, row) => (err ? reject(err) : resolve(row && row.total_ilosc ? row.total_ilosc : 0))
    );
  });
}

function workingSheetFieldsFromLatestBatch(latest, totalIlosc, existing) {
  const fromReceipt = latest.receipt_id != null;
  return {
    nazwa: latest.nazwa,
    ilosc: totalIlosc || 0,
    kod_kreskowy: latest.kod_kreskowy || null,
    typ: latest.typ || null,
    sprzedawca: fromReceipt
      ? (latest.receipt_sprzedawca || null)
      : ((existing && existing.sprzedawca) || null),
    cena_zakupu_pln: roundMoney(latest.cena_zakupu_pln),
    data_waznosci: latest.data_waznosci || null,
    objetosc: latest.objetosc != null ? latest.objetosc : null,
    koszt_dostawy_per_unit: roundMoney(latest.koszt_dostawy_per_unit),
    koszt_dostawy_per_unit_srednie: latest.typ === 'aksesoria' ? 0 : roundMoney(latest.koszt_dostawy_per_unit_srednie),
    podatek_akcyzowy: roundMoney(latest.podatek_akcyzowy),
  };
}

function applyWorkingSheetFromLatest(kod, options = {}) {
  const insertIfMissing = options.insertIfMissing === true;
  const createdAt = options.createdAt || null;
  const createdAtOnUpdate = options.createdAtOnUpdate || null;
  const preserveIlosc = options.preserveIlosc === true;

  return Promise.all([
    sumProductsIloscAktualnaByKod(kod),
    loadLatestProductBatchByKod(kod),
    loadLatestProductBatchByKod(kod, { pricedOnly: true }),
    getWorkingSheetByKod(kod),
  ]).then(([totalIlosc, latest, priced, existing]) => {
    if (!latest) return null;
    const fields = workingSheetFieldsFromLatestBatch(priced || latest, totalIlosc, existing);
    if (!existing) {
      if (!insertIfMissing) return null;
      return new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO working_sheets (kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena_zakupu_pln, data_waznosci, objetosc, koszt_dostawy_per_unit, koszt_dostawy_per_unit_srednie, podatek_akcyzowy, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            kod, fields.nazwa, fields.ilosc, fields.kod_kreskowy, fields.typ, fields.sprzedawca,
            fields.cena_zakupu_pln, fields.data_waznosci, fields.objetosc,
            fields.koszt_dostawy_per_unit, fields.koszt_dostawy_per_unit_srednie, fields.podatek_akcyzowy,
            createdAt || latest.created_at,
          ],
          (err) => (err ? reject(err) : resolve('inserted'))
        );
      });
    }

    const setCreated = createdAtOnUpdate ? ', created_at = ?' : '';
    const iloscSql = preserveIlosc ? '' : 'ilosc = ?, ';
    const params = [
      fields.nazwa,
    ];
    if (!preserveIlosc) params.push(fields.ilosc);
    params.push(
      fields.kod_kreskowy, fields.typ, fields.sprzedawca, fields.cena_zakupu_pln,
      fields.data_waznosci, fields.objetosc, fields.koszt_dostawy_per_unit, fields.koszt_dostawy_per_unit_srednie,
      fields.podatek_akcyzowy,
    );
    if (createdAtOnUpdate) params.push(createdAtOnUpdate);
    params.push(kod);

    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE working_sheets SET
          nazwa = ?, ${iloscSql}kod_kreskowy = ?, typ = ?, sprzedawca = ?, cena_zakupu_pln = ?,
          data_waznosci = ?, objetosc = ?, koszt_dostawy_per_unit = ?, koszt_dostawy_per_unit_srednie = ?,
          podatek_akcyzowy = ?${setCreated}
         WHERE kod = ?`,
        params,
        (err) => (err ? reject(err) : resolve('updated'))
      );
    });
  });
}

function syncWorkingSheetFromRemainingProducts(kod) {
  return applyWorkingSheetFromLatest(kod, { insertIfMissing: false }).then((result) => result === 'updated');
}

function dropProductReceiptsProductsJsonColumn(done) {
  db.all('PRAGMA table_info(product_receipts)', (err, columns) => {
    if (err) {
      console.error('❌ Error reading product_receipts schema:', err.message);
      if (done) done();
      return;
    }
    if (!(columns || []).some((col) => col.name === 'products')) {
      if (done) done();
      return;
    }
    db.run('ALTER TABLE product_receipts DROP COLUMN products', (dropErr) => {
      if (dropErr) {
        console.error('❌ Error dropping product_receipts.products:', dropErr.message);
      } else {
        console.log('✅ Column product_receipts.products dropped');
      }
      if (done) done();
    });
  });
}

const PRODUCTS_RECEIPT_LINE_COLUMNS = [
  { name: 'typ', sql: 'TEXT' },
  { name: 'objetosc', sql: 'TEXT' },
  { name: 'data_waznosci', sql: 'DATE' },
  { name: 'vat', sql: 'REAL DEFAULT 0' },
  { name: 'cena_zakupu_org', sql: 'REAL' },
  { name: 'koszt_dostawy_per_unit_srednie', sql: 'REAL DEFAULT 0' },
  { name: 'koszt_dostawy_per_unit', sql: 'REAL DEFAULT 0' },
  { name: 'podatek_akcyzowy', sql: 'REAL DEFAULT 0' },
];

function backfillProductsFromReceiptJson(done) {
  db.all('PRAGMA table_info(product_receipts)', (pragmaErr, columns) => {
    if (pragmaErr) {
      console.error('❌ Error reading product_receipts schema for JSON backfill:', pragmaErr.message);
      if (done) done();
      return;
    }
    if (!(columns || []).some((col) => col.name === 'products')) {
      if (done) done();
      return;
    }
  db.all('SELECT id, products, data_przyjecia, wartosc_dostawy, kurs_1, kurs_2, waluta_przyjecia, stawka_podatek_akcyzowy FROM product_receipts', (err, receipts) => {
    if (err) {
      console.error('❌ Error reading product_receipts for products backfill:', err.message);
      if (done) done();
      return;
    }
    const processReceipt = (i) => {
      if (i >= (receipts || []).length) {
        console.log('✅ products receipt-line backfill finished');
        if (done) done();
        return;
      }
      const receipt = receipts[i];
      let lines = [];
      try {
        lines = typeof receipt.products === 'string' ? JSON.parse(receipt.products) : (receipt.products || []);
      } catch {
        lines = [];
      }
      if (!Array.isArray(lines) || lines.length === 0) {
        processReceipt(i + 1);
        return;
      }
      db.all('SELECT * FROM products WHERE receipt_id = ? ORDER BY id ASC', [receipt.id], (batchErr, batches) => {
        if (batchErr) {
          processReceipt(i + 1);
          return;
        }
        if (!batches || batches.length === 0) {
          stampCenaZakupuOrg(lines);
          const computedDelivery = kosztDostawyPerUnitFromReceipt(receipt, lines);
          stampKosztDostawyPerUnitSrednie(lines, computedDelivery);
          stampKosztDostawyPerUnit(
            lines,
            receipt.wartosc_dostawy,
            getKursEurPln(receipt.waluta_przyjecia, receipt.kurs_1, receipt.kurs_2)
          );
          stampPodatekAkcyzowy(lines, receipt.stawka_podatek_akcyzowy);
          const date = receipt.data_przyjecia || getTodayDateString();
          const runInsert = (j) => {
            if (j >= lines.length) {
              processReceipt(i + 1);
              return;
            }
            const line = lines[j];
            const kod = normalizeProductKod(line.kod);
            if (!kod) {
              runInsert(j + 1);
              return;
            }
            line.kod = kod;
            db.run(
              insertProductBatchSql(),
              insertProductBatchParams(line, receipt.id, line.ilosc || 0, date),
              (insErr) => {
                if (insErr) {
                  console.error(`❌ Error inserting missing batch for receipt ${receipt.id}:`, insErr.message);
                }
                runInsert(j + 1);
              }
            );
          };
          runInsert(0);
          return;
        }
        const unused = batches.slice();
        const computedDelivery = kosztDostawyPerUnitFromReceipt(receipt, lines);
        const updates = [];
        for (const line of lines) {
          const kod = normalizeProductKod(line.kod);
          const idx = unused.findIndex((b) => normalizeProductKod(b.kod) === kod);
          const batch = idx >= 0 ? unused.splice(idx, 1)[0] : null;
          if (!batch) continue;
          const lineCena = parseFloat(String(line.cena == null ? '' : line.cena).replace(',', '.'));
          const hasNewKosztBut = Object.prototype.hasOwnProperty.call(line, 'koszt_dostawy_per_unit');
          const jsonKosztBut = parseFloat(String(line.koszt_dostawy_per_unit == null ? '' : line.koszt_dostawy_per_unit).replace(',', '.'));
          const jsonAkcyzaAmount = parseFloat(String(line.podatek_akcyzowy == null ? '' : line.podatek_akcyzowy).replace(',', '.'));
          const jsonAkcyzaRate = parseFloat(String(receipt.stawka_podatek_akcyzowy == null ? '' : receipt.stawka_podatek_akcyzowy).replace(',', '.'));
          const lineForAkcyza = {
            typ: batch.typ || line.typ,
            objetosc: batch.objetosc || line.objetosc,
          };
          const srednie = (batch.typ || line.typ) === 'aksesoria' ? 0 : computedDelivery;
          updates.push({
            id: batch.id,
            typ: batch.typ || line.typ || null,
            objetosc: batch.objetosc || (line.objetosc != null && line.objetosc !== '' ? String(line.objetosc) : null),
            data_waznosci: batch.data_waznosci || line.dataWaznosci || line.data_waznosci || null,
            vat: batch.vat || roundMoney(line.vat),
            cena_zakupu_org: batch.cena_zakupu_org != null
              ? roundMoney(batch.cena_zakupu_org)
              : (Number.isFinite(lineCena) ? roundMoney(lineCena) : null),
            koszt_dostawy_per_unit_srednie: srednie,
            koszt_dostawy_per_unit: hasNewKosztBut && Number.isFinite(jsonKosztBut)
              ? roundMoney(jsonKosztBut)
              : srednie,
            podatek_akcyzowy: Number.isFinite(jsonAkcyzaAmount)
              ? roundMoney(jsonAkcyzaAmount)
              : podatekAkcyzowyForProduct(lineForAkcyza, Number.isFinite(jsonAkcyzaRate) ? jsonAkcyzaRate : 0),
          });
        }
        const runUpdate = (j) => {
          if (j >= updates.length) {
            processReceipt(i + 1);
            return;
          }
          const u = updates[j];
          db.run(
            'UPDATE products SET typ = ?, objetosc = ?, data_waznosci = ?, vat = ?, cena_zakupu_org = ?, koszt_dostawy_per_unit_srednie = ?, koszt_dostawy_per_unit = ?, podatek_akcyzowy = ? WHERE id = ?',
            [u.typ, u.objetosc, u.data_waznosci, u.vat, u.cena_zakupu_org, u.koszt_dostawy_per_unit_srednie, u.koszt_dostawy_per_unit, u.podatek_akcyzowy, u.id],
            () => runUpdate(j + 1)
          );
        };
        runUpdate(0);
      });
    };
    processReceipt(0);
  });
  });
}

function renameProductsColumnIfPresent(fromName, toName, done) {
  db.all('PRAGMA table_info(products)', (err, columns) => {
    if (err) {
      console.error('❌ Error reading products schema:', err.message);
      if (done) done();
      return;
    }
    const names = (columns || []).map((col) => col.name);
    if (names.includes(toName) || !names.includes(fromName)) {
      if (done) done();
      return;
    }
    db.run(
      `ALTER TABLE products RENAME COLUMN ${fromName} TO ${toName}`,
      (renameErr) => {
        if (renameErr) {
          console.error(`❌ Error renaming products.${fromName}:`, renameErr.message);
        } else {
          console.log(`✅ Column products.${fromName} renamed to ${toName}`);
        }
        if (done) done();
      }
    );
  });
}

function migrateProductsStatusToCzyProbki(done) {
  const finish = () => {
    if (done) done();
  };
  renameProductsColumnIfPresent('status', 'czy_probki', () => {
    db.all('PRAGMA table_info(products)', (err, columns) => {
      if (err) {
        console.error('❌ Error reading products schema:', err.message);
        finish();
        return;
      }
      const names = (columns || []).map((col) => col.name);
      const convertValues = () => {
        db.run(
          `UPDATE products SET czy_probki = CASE
             WHEN LOWER(TRIM(CAST(czy_probki AS TEXT))) IN ('samples', '1') THEN 1
             ELSE 0
           END`,
          function (updErr) {
            if (updErr) {
              console.error('❌ Error converting products.czy_probki values:', updErr.message);
            } else {
              console.log('✅ Column products.czy_probki ready (1 = próbki, 0 = zwykła partia)');
            }
            finish();
          }
        );
      };
      if (names.includes('czy_probki')) {
        convertValues();
        return;
      }
      db.run('ALTER TABLE products ADD COLUMN czy_probki INTEGER DEFAULT 0', (alterErr) => {
        if (alterErr && !String(alterErr.message || '').includes('duplicate column')) {
          console.error('❌ Error adding products.czy_probki:', alterErr.message);
          finish();
          return;
        }
        convertValues();
      });
    });
  });
}

function ensureProductsReceiptLineColumns(done) {
  renameProductsColumnIfPresent('cena', 'cena_zakupu_pln', () => {
    renameProductsColumnIfPresent('cena_faktury', 'cena_zakupu_org', () => {
      renameProductsColumnIfPresent('ilosc', 'ilosc_pierwotna', () => {
        migrateProductsStatusToCzyProbki(() => {
          db.all('PRAGMA table_info(products)', (err, columns) => {
            if (err) {
              console.error('❌ Error reading products schema:', err.message);
              if (done) done();
              return;
            }
            const names = new Set((columns || []).map((col) => col.name));
            const missing = PRODUCTS_RECEIPT_LINE_COLUMNS.filter((col) => !names.has(col.name));
            const next = (i) => {
              if (i >= missing.length) {
                ensureWorkingSheetsKosztDostawyPerUnitSrednie(() => {
                  backfillProductsFromReceiptJson(() => convertProductsCenaToPln(() => realignFeralMuriLegacyRates(() => roundExistingCenaZakupu(() => syncWorkingSheetsCenaFromLatestReceipt(() => backfillProductsKosztDostawyWithoutReceipt(() => backfillWorkingSheetsKosztDostawyPerUnit(() => dropProductReceiptsProductsJsonColumn(done))))))));
                });
                return;
              }
              const col = missing[i];
              db.run(`ALTER TABLE products ADD COLUMN ${col.name} ${col.sql}`, (alterErr) => {
                if (alterErr && !String(alterErr.message || '').includes('duplicate column')) {
                  console.error(`❌ Error adding products.${col.name}:`, alterErr.message);
                } else {
                  console.log(`✅ Column products.${col.name} ready`);
                }
                next(i + 1);
              });
            };
            next(0);
          });
        });
      });
    });
  });
}

let productsCenaPlnConvertStarted = false;

function nextProductsCenaPln(row) {
  const cena = roundMoney(row.cena_zakupu_pln);
  if (cena === 0) return null;

  if (row.receipt_id == null) {
    const converted = roundMoney(cena * 4.3);
    const ws = roundMoney(row.ws_cena);
    if (Math.abs(cena - ws) <= 0.15) return null;
    if (Math.abs(converted - ws) <= 0.15) return converted;
    if (ws > 0 && cena * 2 < ws) return converted;
    return null;
  }

  const faktury = roundMoney(row.cena_zakupu_org);
  const waluta = normalizeWalutaFaktury(row.waluta_przyjecia);
  const k1 = parseKursValue(row.kurs_1);
  const k2 = parseKursValue(row.kurs_2);

  if (waluta === 'PLN') {
    if (Math.abs(cena - faktury) <= 0.08) return null;
    if (k2 <= 1.05) return null;
    return roundMoney(cena * k2);
  }
  if (waluta === 'EUR') {
    if (k1 <= 1.05) return null;
    if (Math.abs(cena - roundMoney(faktury * k1)) <= 0.08) return null;
    return roundMoney(cena * k1);
  }
  if (waluta === 'DKK') {
    // New toPln: kurs_2 is PLN/DKK (< 1). Old scheme: kurs_2 is DKK per EUR (> 1).
    if (k2 <= 1.05) return null;
    if (k1 <= 1.05) return null;
    const eurFromDkk = roundMoney(faktury / k2);
    const expectedPln = roundMoney(eurFromDkk * k1);
    if (Math.abs(cena - expectedPln) <= 0.08) return null;
    return roundMoney(cena * k1);
  }
  return null;
}

function convertProductsCenaToPln(done, attempt = 0) {
  const finish = () => {
    if (done) done();
  };
  if (productsCenaPlnConvertStarted && attempt === 0) {
    finish();
    return;
  }
  db.all('PRAGMA table_info(product_receipts)', (schemaErr, columns) => {
    if (schemaErr) {
      console.error('❌ Error reading product_receipts schema for cena convert:', schemaErr.message);
      finish();
      return;
    }
    const names = new Set((columns || []).map((col) => col.name));
    if (!names.has('kurs_1') || !names.has('kurs_2') || !names.has('waluta_przyjecia')) {
      if (attempt >= 5) {
        console.log('⏳ Skip products.cena_zakupu_pln convert: receipt kurs columns not ready');
        finish();
        return;
      }
      setTimeout(() => convertProductsCenaToPln(done, attempt + 1), 1000);
      return;
    }
    productsCenaPlnConvertStarted = true;
    db.all(
      `SELECT p.id, p.cena_zakupu_pln, p.cena_zakupu_org, p.receipt_id,
              r.waluta_przyjecia, r.kurs_1, r.kurs_2,
              w.cena_zakupu_pln AS ws_cena
       FROM products p
       LEFT JOIN product_receipts r ON r.id = p.receipt_id
       LEFT JOIN working_sheets w ON w.kod = p.kod`,
      (err, rows) => {
        if (err) {
          console.error('❌ Error selecting products for cena PLN convert:', err.message);
          finish();
          return;
        }
        const updates = [];
        for (const row of rows || []) {
          const next = nextProductsCenaPln(row);
          if (next == null) continue;
          if (Math.abs(next - roundMoney(row.cena_zakupu_pln)) <= 0.005) continue;
          updates.push({ id: row.id, cena: next });
        }
        if (updates.length === 0) {
          console.log('✅ products.cena_zakupu_pln already in PLN (no rows to convert)');
          finish();
          return;
        }
        const run = (i) => {
          if (i >= updates.length) {
            console.log(`✅ Converted products.cena_zakupu_pln on ${updates.length} rows`);
            finish();
            return;
          }
          db.run('UPDATE products SET cena_zakupu_pln = ? WHERE id = ?', [updates[i].cena, updates[i].id], (updErr) => {
            if (updErr) {
              console.error(`❌ Error converting products.cena_zakupu_pln id=${updates[i].id}:`, updErr.message);
            }
            run(i + 1);
          });
        };
        run(0);
      }
    );
  });
}

function realignFeralMuriLegacyRates(done) {
  const finish = () => {
    if (done) done();
  };
  const eurPln = 4.3;
  const leftoverSql = `
    SELECT DISTINCT p.kod
    FROM products p
    JOIN product_receipts pr ON pr.id = p.receipt_id
    WHERE pr.sprzedawca IN ('Feral', 'Muri')
      AND UPPER(COALESCE(pr.waluta_przyjecia, '')) = 'EUR'
      AND COALESCE(pr.kurs_1, 1) <= 1.05
      AND COALESCE(pr.kurs_2, 1) <= 1.05
      AND COALESCE(p.cena_zakupu_org, 0) > 0
      AND ABS(p.cena_zakupu_pln - p.cena_zakupu_org) <= 0.02
  `;

  const remapDkkKurs = () => {
    db.run(
      `UPDATE product_receipts
       SET kurs_2 = ROUND(kurs_1 / kurs_2, 6),
           waluta_dostawy = CASE
             WHEN waluta_dostawy IS NULL OR TRIM(waluta_dostawy) = '' THEN 'EUR'
             ELSE waluta_dostawy
           END
       WHERE sprzedawca IN ('Feral', 'Muri')
         AND UPPER(COALESCE(waluta_przyjecia, '')) = 'DKK'
         AND COALESCE(kurs_1, 1) > 1.05
         AND COALESCE(kurs_2, 1) > 1.05`,
      function (dkkErr) {
        if (dkkErr) {
          console.error('❌ Error remapping Feral/Muri DKK kurs_2 to PLN/DKK:', dkkErr.message);
        } else if (this.changes > 0) {
          console.log(`✅ Remapped DKK kurs_2 to PLN/DKK on ${this.changes} Feral/Muri receipts`);
        }
        finish();
      }
    );
  };

  const syncWorkingSheets = (kody) => {
    const syncNext = (i) => {
      if (i >= kody.length) {
        remapDkkKurs();
        return;
      }
      const kod = kody[i];
      loadLatestProductBatchByKod(kod, { pricedOnly: true }).then((priced) => {
        return priced
          ? Promise.resolve(priced)
          : loadLatestProductBatchByKod(kod);
      }).then((latest) => {
        if (!latest) {
          syncNext(i + 1);
          return;
        }
        db.run(
          `UPDATE working_sheets
           SET cena_zakupu_pln = ?,
               koszt_dostawy_per_unit = ?,
               koszt_dostawy_per_unit_srednie = ?
           WHERE kod = ?`,
          [
            roundMoney(latest.cena_zakupu_pln),
            roundMoney(latest.koszt_dostawy_per_unit),
            latest.typ === 'aksesoria' ? 0 : roundMoney(latest.koszt_dostawy_per_unit_srednie),
            kod,
          ],
          (wsErr) => {
            if (wsErr) {
              console.error(`❌ Error syncing working_sheets cena for ${kod}:`, wsErr.message);
            }
            syncNext(i + 1);
          }
        );
      }).catch((loadErr) => {
        console.error(`❌ Error loading latest batch for ${kod}:`, loadErr.message);
        syncNext(i + 1);
      });
    };
    syncNext(0);
  };

  db.all(leftoverSql, (kodErr, kodRows) => {
    if (kodErr) {
      console.error('❌ Error listing leftover Feral/Muri EUR batches:', kodErr.message);
      remapDkkKurs();
      return;
    }
    const leftoverKody = [...new Set((kodRows || []).map((row) => row.kod).filter(Boolean))];
    db.run(
      `UPDATE product_receipts
       SET kurs_1 = ?,
           kurs_2 = ?,
           waluta_dostawy = CASE
             WHEN waluta_dostawy IS NULL OR TRIM(waluta_dostawy) = '' THEN 'EUR'
             ELSE waluta_dostawy
           END
       WHERE sprzedawca IN ('Feral', 'Muri')
         AND UPPER(COALESCE(waluta_przyjecia, '')) = 'EUR'
         AND COALESCE(kurs_1, 1) <= 1.05
         AND COALESCE(kurs_2, 1) <= 1.05
         AND EXISTS (
           SELECT 1 FROM products p
           WHERE p.receipt_id = product_receipts.id
             AND COALESCE(p.cena_zakupu_org, 0) > 0
             AND ABS(p.cena_zakupu_pln - p.cena_zakupu_org) <= 0.02
         )`,
      [eurPln, eurPln],
      function (hdrErr) {
        if (hdrErr) {
          console.error('❌ Error realigning Feral/Muri EUR kurs:', hdrErr.message);
        } else if (this.changes > 0) {
          console.log(`✅ Set missing EUR→PLN kurs 4.3 on ${this.changes} Feral/Muri receipts`);
        }
        db.run(
          `UPDATE products
           SET cena_zakupu_pln = ROUND(cena_zakupu_org * ?, 2),
               koszt_dostawy_per_unit = ROUND((
                 SELECT pr.wartosc_dostawy * ?
                 FROM product_receipts pr
                 WHERE pr.id = products.receipt_id
               ) / NULLIF((
                 SELECT SUM(p2.ilosc_pierwotna)
                 FROM products p2
                 WHERE p2.receipt_id = products.receipt_id
                   AND COALESCE(p2.typ, '') != 'aksesoria'
               ), 0), 2),
               koszt_dostawy_per_unit_srednie = ROUND((
                 SELECT pr.wartosc_dostawy * ?
                 FROM product_receipts pr
                 WHERE pr.id = products.receipt_id
               ) / NULLIF((
                 SELECT SUM(p2.ilosc_pierwotna)
                 FROM products p2
                 WHERE p2.receipt_id = products.receipt_id
                   AND COALESCE(p2.typ, '') != 'aksesoria'
               ), 0), 2)
           WHERE receipt_id IN (
             SELECT id FROM product_receipts
             WHERE sprzedawca IN ('Feral', 'Muri')
               AND UPPER(COALESCE(waluta_przyjecia, '')) = 'EUR'
           )
             AND COALESCE(cena_zakupu_org, 0) > 0
             AND ABS(cena_zakupu_pln - cena_zakupu_org) <= 0.02`,
          [eurPln, eurPln, eurPln],
          function (prodErr) {
            if (prodErr) {
              console.error('❌ Error converting leftover Feral/Muri EUR cena_zakupu_pln:', prodErr.message);
              remapDkkKurs();
              return;
            }
            if (this.changes > 0) {
              console.log(`✅ Converted leftover EUR cena_zakupu_pln on ${this.changes} Feral/Muri batches`);
            }
            syncWorkingSheets(leftoverKody);
          }
        );
      }
    );
  });
}

function ensureWorkingSheetsKosztDostawyPerUnitSrednie(done) {
  const copySrednie = () => {
    db.run(
      `UPDATE working_sheets
       SET koszt_dostawy_per_unit_srednie = ROUND(koszt_dostawy_per_unit, 2)
       WHERE (koszt_dostawy_per_unit_srednie IS NULL OR koszt_dostawy_per_unit_srednie = 0)
         AND koszt_dostawy_per_unit IS NOT NULL
         AND koszt_dostawy_per_unit != 0`,
      function (copyErr) {
        if (copyErr) {
          console.error('❌ Error copying working_sheets.koszt_dostawy_per_unit to srednie:', copyErr.message);
        } else if (this.changes > 0) {
          console.log(`✅ Copied working_sheets.koszt_dostawy_per_unit into koszt_dostawy_per_unit_srednie on ${this.changes} rows`);
        }
        if (done) done();
      }
    );
  };

  db.all('PRAGMA table_info(working_sheets)', (err, columns) => {
    if (err) {
      console.error('❌ Error reading working_sheets schema:', err.message);
      if (done) done();
      return;
    }
    const names = (columns || []).map((col) => col.name);
    if (names.includes('koszt_dostawy_per_unit_srednie')) {
      copySrednie();
      return;
    }
    db.run(
      'ALTER TABLE working_sheets ADD COLUMN koszt_dostawy_per_unit_srednie REAL DEFAULT 0',
      (alterErr) => {
        if (alterErr && !String(alterErr.message || '').includes('duplicate column')) {
          console.error('❌ Error adding working_sheets.koszt_dostawy_per_unit_srednie:', alterErr.message);
          if (done) done();
          return;
        }
        console.log('✅ Column working_sheets.koszt_dostawy_per_unit_srednie ready');
        copySrednie();
      }
    );
  });
}

function backfillWorkingSheetsKosztDostawyPerUnit(done) {
  db.all(
    `SELECT p.kod,
            AVG(p.koszt_dostawy_per_unit) AS koszt_dostawy_per_unit,
            AVG(p.koszt_dostawy_per_unit_srednie) AS koszt_dostawy_per_unit_srednie,
            AVG(p.podatek_akcyzowy) AS podatek_akcyzowy
     FROM products p
     INNER JOIN (
       SELECT kod, MAX(receipt_id) AS max_receipt
       FROM products
       WHERE receipt_id IS NOT NULL
       GROUP BY kod
     ) latest ON latest.kod = p.kod AND latest.max_receipt = p.receipt_id
     GROUP BY p.kod`,
    (err, rows) => {
      if (err) {
        console.error('❌ Error reading latest products batches for working_sheets backfill:', err.message);
        if (done) done();
        return;
      }
      const run = (i) => {
        if (i >= (rows || []).length) {
          console.log(`✅ working_sheets koszt/akcyza synced from latest products batch (${(rows || []).length} kody)`);
          if (done) done();
          return;
        }
        const row = rows[i];
        db.run(
          `UPDATE working_sheets
           SET koszt_dostawy_per_unit = ?,
               koszt_dostawy_per_unit_srednie = ?,
               podatek_akcyzowy = ?
           WHERE kod = ?`,
          [
            roundMoney(row.koszt_dostawy_per_unit),
            roundMoney(row.koszt_dostawy_per_unit_srednie),
            roundMoney(row.podatek_akcyzowy),
            row.kod,
          ],
          (updErr) => {
            if (updErr) {
              console.error(`❌ Error syncing working_sheets koszt/akcyza for ${row.kod}:`, updErr.message);
            }
            run(i + 1);
          }
        );
      };
      run(0);
    }
  );
}

function backfillProductsKosztDostawyWithoutReceipt(done) {
  db.run(
    `UPDATE products
     SET koszt_dostawy_per_unit_srednie = (
       SELECT ROUND(COALESCE(NULLIF(ws.koszt_dostawy_per_unit_srednie, 0), ws.koszt_dostawy_per_unit), 2)
       FROM working_sheets ws
       WHERE ws.kod = products.kod
     )
     WHERE receipt_id IS NULL
       AND (koszt_dostawy_per_unit_srednie IS NULL OR koszt_dostawy_per_unit_srednie = 0)
       AND EXISTS (
         SELECT 1 FROM working_sheets ws
         WHERE ws.kod = products.kod
           AND (
             (ws.koszt_dostawy_per_unit_srednie IS NOT NULL AND ws.koszt_dostawy_per_unit_srednie != 0)
             OR (ws.koszt_dostawy_per_unit IS NOT NULL AND ws.koszt_dostawy_per_unit != 0)
           )
       )`,
    function (err) {
      if (err) {
        console.error('❌ Error backfilling products.koszt_dostawy_per_unit_srednie without receipt:', err.message);
      } else if (this.changes > 0) {
        console.log(`✅ Filled products.koszt_dostawy_per_unit_srednie from working_sheets on ${this.changes} rows without receipt`);
      }
      db.run(
        `UPDATE products
         SET podatek_akcyzowy = (
           SELECT ROUND(ws.podatek_akcyzowy, 2)
           FROM working_sheets ws
           WHERE ws.kod = products.kod
         )
         WHERE receipt_id IS NULL
           AND (podatek_akcyzowy IS NULL OR podatek_akcyzowy = 0)
           AND EXISTS (
             SELECT 1 FROM working_sheets ws
             WHERE ws.kod = products.kod
               AND ws.podatek_akcyzowy IS NOT NULL
               AND ws.podatek_akcyzowy != 0
           )`,
        function (akcErr) {
          if (akcErr) {
            console.error('❌ Error backfilling products.podatek_akcyzowy without receipt:', akcErr.message);
          } else if (this.changes > 0) {
            console.log(`✅ Filled products.podatek_akcyzowy from working_sheets on ${this.changes} rows without receipt`);
          }
          db.run(
            `UPDATE products
             SET koszt_dostawy_per_unit = ROUND(koszt_dostawy_per_unit_srednie, 2)
             WHERE receipt_id IS NULL
               AND koszt_dostawy_per_unit_srednie IS NOT NULL`,
            function (eqErr) {
              if (eqErr) {
                console.error('❌ Error equalizing products koszt_dostawy without receipt:', eqErr.message);
              } else if (this.changes > 0) {
                console.log(`✅ Set products.koszt_dostawy_per_unit = srednie on ${this.changes} rows without receipt`);
              }
              if (done) done();
            }
          );
        }
      );
    }
  );
}

function roundExistingCenaZakupu(done) {
  const finish = () => {
    if (done) done();
  };
  db.run(
    'UPDATE products SET cena_zakupu_pln = ROUND(cena_zakupu_pln, 2) WHERE cena_zakupu_pln IS NOT NULL',
    function (plnErr) {
      if (plnErr) {
        console.error('❌ Error rounding products.cena_zakupu_pln:', plnErr.message);
      } else if (this.changes > 0) {
        console.log(`✅ Rounded products.cena_zakupu_pln on ${this.changes} rows`);
      }
      db.run(
        'UPDATE products SET cena_zakupu_org = ROUND(cena_zakupu_org, 2) WHERE cena_zakupu_org IS NOT NULL',
        function (orgErr) {
          if (orgErr) {
            console.error('❌ Error rounding products.cena_zakupu_org:', orgErr.message);
          } else if (this.changes > 0) {
            console.log(`✅ Rounded products.cena_zakupu_org on ${this.changes} rows`);
          }
          db.run(
            'UPDATE working_sheets SET cena_zakupu_pln = ROUND(cena_zakupu_pln, 2) WHERE cena_zakupu_pln IS NOT NULL',
            function (wsErr) {
              if (wsErr) {
                console.error('❌ Error rounding working_sheets.cena_zakupu_pln:', wsErr.message);
              } else if (this.changes > 0) {
                console.log(`✅ Rounded working_sheets.cena_zakupu_pln on ${this.changes} rows`);
              }
              db.run(
                'UPDATE products SET koszt_dostawy_per_unit_srednie = ROUND(koszt_dostawy_per_unit_srednie, 2) WHERE koszt_dostawy_per_unit_srednie IS NOT NULL',
                function (dostErr) {
                  if (dostErr) {
                    console.error('❌ Error rounding products.koszt_dostawy_per_unit_srednie:', dostErr.message);
                  } else if (this.changes > 0) {
                    console.log(`✅ Rounded products.koszt_dostawy_per_unit_srednie on ${this.changes} rows`);
                  }
                  db.run(
                    'UPDATE products SET koszt_dostawy_per_unit = ROUND(koszt_dostawy_per_unit, 2) WHERE koszt_dostawy_per_unit IS NOT NULL',
                    function (perUnitErr) {
                      if (perUnitErr) {
                        console.error('❌ Error rounding products.koszt_dostawy_per_unit:', perUnitErr.message);
                      } else if (this.changes > 0) {
                        console.log(`✅ Rounded products.koszt_dostawy_per_unit on ${this.changes} rows`);
                      }
                      db.run(
                        'UPDATE products SET podatek_akcyzowy = ROUND(podatek_akcyzowy, 2) WHERE podatek_akcyzowy IS NOT NULL',
                        function (akcErr) {
                          if (akcErr) {
                            console.error('❌ Error rounding products.podatek_akcyzowy:', akcErr.message);
                          } else if (this.changes > 0) {
                            console.log(`✅ Rounded products.podatek_akcyzowy on ${this.changes} rows`);
                          }
                          db.run(
                            'UPDATE working_sheets SET podatek_akcyzowy = ROUND(podatek_akcyzowy, 2) WHERE podatek_akcyzowy IS NOT NULL',
                            function (wsAkcErr) {
                              if (wsAkcErr) {
                                console.error('❌ Error rounding working_sheets.podatek_akcyzowy:', wsAkcErr.message);
                              } else if (this.changes > 0) {
                                console.log(`✅ Rounded working_sheets.podatek_akcyzowy on ${this.changes} rows`);
                              }
                              db.run(
                                'UPDATE working_sheets_history SET podatek_akcyzowy = ROUND(podatek_akcyzowy, 2) WHERE podatek_akcyzowy IS NOT NULL',
                                function (histAkcErr) {
                                  if (histAkcErr && !String(histAkcErr.message || '').includes('no such table') && !String(histAkcErr.message || '').includes('no such column')) {
                                    console.error('❌ Error rounding working_sheets_history.podatek_akcyzowy:', histAkcErr.message);
                                  } else if (!histAkcErr && this.changes > 0) {
                                    console.log(`✅ Rounded working_sheets_history.podatek_akcyzowy on ${this.changes} rows`);
                                  }
                                  finish();
                                }
                              );
                            }
                          );
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
}

function syncWorkingSheetsCenaFromLatestReceipt(done) {
  const finish = () => {
    if (done) done();
  };
  db.run(
    `UPDATE working_sheets
     SET cena_zakupu_pln = ROUND((
       SELECT p.cena_zakupu_pln
       FROM products p
       LEFT JOIN product_receipts r ON r.id = p.receipt_id
       WHERE p.kod = working_sheets.kod
       ORDER BY COALESCE(r.data_przyjecia, p.created_at) DESC, p.id DESC
       LIMIT 1
     ), 2)
     WHERE EXISTS (SELECT 1 FROM products p2 WHERE p2.kod = working_sheets.kod)`,
    function (err) {
      if (err) {
        console.error('❌ Error syncing working_sheets.cena_zakupu_pln from latest receipt:', err.message);
      } else if (this.changes > 0) {
        console.log(`✅ Set working_sheets.cena_zakupu_pln from latest receipt on ${this.changes} rows`);
      }
      finish();
    }
  );
}

function renameProductReceiptsColumnIfPresent(fromName, toName, done) {
  db.all('PRAGMA table_info(product_receipts)', (err, columns) => {
    if (err) {
      console.error('❌ Error reading product_receipts schema:', err.message);
      if (done) done();
      return;
    }
    const names = (columns || []).map((col) => col.name);
    if (names.includes(toName) || !names.includes(fromName)) {
      if (done) done();
      return;
    }
    db.run(
      `ALTER TABLE product_receipts RENAME COLUMN ${fromName} TO ${toName}`,
      (renameErr) => {
        if (renameErr) {
          console.error(`❌ Error renaming product_receipts.${fromName}:`, renameErr.message);
        } else {
          console.log(`✅ Column product_receipts.${fromName} renamed to ${toName}`);
        }
        if (done) done();
      }
    );
  });
}

function ensureProductReceiptsRenameKursColumns(done) {
  renameProductReceiptsColumnIfPresent('aktualny_kurs', 'kurs_1', () => {
    renameProductReceiptsColumnIfPresent('kurs_faktury', 'kurs_2', done);
  });
}

function ensureProductReceiptsRenameInvoiceColumns(done) {
  renameProductReceiptsColumnIfPresent('productInvoice', 'product_invoice', () => {
    renameProductReceiptsColumnIfPresent('transportInvoice', 'transport_invoice', done);
  });
}

function ensureProductReceiptsRenamePodatekAkcyzowyColumn(done) {
  renameProductReceiptsColumnIfPresent('podatek_akcyzowy', 'stawka_podatek_akcyzowy', done);
}

function ensureProductReceiptsRenameWalutaFakturyColumn(done) {
  db.all('PRAGMA table_info(product_receipts)', (err, columns) => {
    if (err) {
      console.error('❌ Error reading product_receipts schema:', err.message);
      if (done) done();
      return;
    }
    const hasOld = (columns || []).some((col) => col.name === 'waluta_faktury');
    const hasNew = (columns || []).some((col) => col.name === 'waluta_przyjecia');
    if (!hasOld || hasNew) {
      if (done) done();
      return;
    }
    db.run(
      'ALTER TABLE product_receipts RENAME COLUMN waluta_faktury TO waluta_przyjecia',
      (renameErr) => {
        if (renameErr) {
          console.error('❌ Error renaming product_receipts.waluta_faktury:', renameErr.message);
        } else {
          console.log('✅ Column product_receipts.waluta_faktury renamed to waluta_przyjecia');
        }
        if (done) done();
      }
    );
  });
}

function ensureProductReceiptsRenameKosztDostawyColumn(done) {
  db.all('PRAGMA table_info(product_receipts)', (err, columns) => {
    if (err) {
      console.error('❌ Error reading product_receipts schema:', err.message);
      if (done) done();
      return;
    }
    const hasOld = (columns || []).some((col) => col.name === 'kosztDostawy');
    const hasNew = (columns || []).some((col) => col.name === 'wartosc_dostawy');
    if (!hasOld || hasNew) {
      if (done) done();
      return;
    }
    db.run(
      'ALTER TABLE product_receipts RENAME COLUMN kosztDostawy TO wartosc_dostawy',
      (renameErr) => {
        if (renameErr) {
          console.error('❌ Error renaming product_receipts.kosztDostawy:', renameErr.message);
        } else {
          console.log('✅ Column product_receipts.kosztDostawy renamed to wartosc_dostawy');
        }
        if (done) done();
      }
    );
  });
}

function roundExistingProductReceiptsWartosc() {
  db.run(
    'UPDATE product_receipts SET wartosc_przyjecia_netto = ROUND(wartosc_przyjecia_netto, 2) WHERE wartosc_przyjecia_netto IS NOT NULL',
    function (err) {
      if (err) {
        console.error('❌ Error rounding product_receipts.wartosc_przyjecia_netto:', err.message);
      } else if (this.changes > 0) {
        console.log(`✅ Rounded product_receipts.wartosc_przyjecia_netto on ${this.changes} rows`);
      }
    }
  );
  db.run(
    'UPDATE product_receipts SET stawka_podatek_akcyzowy = ROUND(stawka_podatek_akcyzowy, 2) WHERE stawka_podatek_akcyzowy IS NOT NULL',
    function (err) {
      if (err) {
        console.error('❌ Error rounding product_receipts.stawka_podatek_akcyzowy:', err.message);
      } else if (this.changes > 0) {
        console.log(`✅ Rounded product_receipts.stawka_podatek_akcyzowy on ${this.changes} rows`);
      }
    }
  );
  db.run(
    'UPDATE product_receipts SET rabat = ROUND(rabat, 2) WHERE rabat IS NOT NULL',
    function (err) {
      if (err) {
        console.error('❌ Error rounding product_receipts.rabat:', err.message);
      } else if (this.changes > 0) {
        console.log(`✅ Rounded product_receipts.rabat on ${this.changes} rows`);
      }
    }
  );
}

function ensureProductReceiptsRenameWartoscColumn(done) {
  db.all('PRAGMA table_info(product_receipts)', (err, columns) => {
    if (err) {
      console.error('❌ Error reading product_receipts schema:', err.message);
      if (done) done();
      return;
    }
    const hasOld = (columns || []).some((col) => col.name === 'wartosc');
    const hasNew = (columns || []).some((col) => col.name === 'wartosc_przyjecia_netto');
    if (!hasOld || hasNew) {
      if (done) done();
      return;
    }
    db.run(
      'ALTER TABLE product_receipts RENAME COLUMN wartosc TO wartosc_przyjecia_netto',
      (renameErr) => {
        if (renameErr) {
          console.error('❌ Error renaming product_receipts.wartosc:', renameErr.message);
        } else {
          console.log('✅ Column product_receipts.wartosc renamed to wartosc_przyjecia_netto');
        }
        if (done) done();
      }
    );
  });
}

function ensureProductReceiptsRenameDataPrzyjeciaColumn() {
  db.all('PRAGMA table_info(product_receipts)', (err, columns) => {
    if (err) {
      console.error('❌ Error reading product_receipts schema:', err.message);
      return;
    }
    const hasOld = (columns || []).some((col) => col.name === 'dataPrzyjecia');
    const hasNew = (columns || []).some((col) => col.name === 'data_przyjecia');
    if (!hasOld || hasNew) return;
    db.run(
      'ALTER TABLE product_receipts RENAME COLUMN dataPrzyjecia TO data_przyjecia',
      (renameErr) => {
        if (renameErr) {
          console.error('❌ Error renaming product_receipts.dataPrzyjecia:', renameErr.message);
        } else {
          console.log('✅ Column product_receipts.dataPrzyjecia renamed to data_przyjecia');
        }
      }
    );
  });
}

function dropSchemaMigrationsTable() {
  db.run('DROP TABLE IF EXISTS schema_migrations', (err) => {
    if (err) {
      console.error('❌ Error dropping schema_migrations:', err.message);
    } else {
      console.log('✅ Table schema_migrations dropped');
    }
  });
}

function ensureWorkingSheetsRenameCenaColumn(done) {
  db.all('PRAGMA table_info(working_sheets)', (err, columns) => {
    if (err) {
      console.error('❌ Error reading working_sheets schema:', err.message);
      if (done) done();
      return;
    }
    const hasOld = (columns || []).some((col) => col.name === 'cena');
    const hasNew = (columns || []).some((col) => col.name === 'cena_zakupu_pln');
    if (!hasOld || hasNew) {
      if (done) done();
      return;
    }
    db.run(
      'ALTER TABLE working_sheets RENAME COLUMN cena TO cena_zakupu_pln',
      (renameErr) => {
        if (renameErr) {
          console.error('❌ Error renaming working_sheets.cena:', renameErr.message);
        } else {
          console.log('✅ Column working_sheets.cena renamed to cena_zakupu_pln');
        }
        if (done) done();
      }
    );
  });
}

function ensureWorkingSheetsRenameCenaSprzedazyColumn(done) {
  db.all('PRAGMA table_info(working_sheets)', (err, columns) => {
    if (err) {
      console.error('❌ Error reading working_sheets schema:', err.message);
      if (done) done();
      return;
    }
    const hasOld = (columns || []).some((col) => col.name === 'cena_sprzedazy');
    const hasNew = (columns || []).some((col) => col.name === 'cena_sprzedazy_pln');
    if (!hasOld || hasNew) {
      if (done) done();
      return;
    }
    db.run(
      'ALTER TABLE working_sheets RENAME COLUMN cena_sprzedazy TO cena_sprzedazy_pln',
      (renameErr) => {
        if (renameErr) {
          console.error('❌ Error renaming working_sheets.cena_sprzedazy:', renameErr.message);
        } else {
          console.log('✅ Column working_sheets.cena_sprzedazy renamed to cena_sprzedazy_pln');
        }
        if (done) done();
      }
    );
  });
}

function dropWorkingSheetsColumnIfPresent(columnName, done) {
  db.all('PRAGMA table_info(working_sheets)', (err, columns) => {
    if (err) {
      console.error('❌ Error reading working_sheets schema:', err.message);
      if (done) done();
      return;
    }
    const hasColumn = (columns || []).some((col) => col.name === columnName);
    if (!hasColumn) {
      if (done) done();
      return;
    }
    db.run(`ALTER TABLE working_sheets DROP COLUMN "${columnName}"`, (dropErr) => {
      if (dropErr) {
        console.error(`❌ Error dropping working_sheets.${columnName}:`, dropErr.message);
      } else {
        console.log(`✅ Column working_sheets.${columnName} dropped`);
      }
      if (done) done();
    });
  });
}

function dropWorkingSheetsColumnsIfPresent(columnNames) {
  const next = (i) => {
    if (i >= columnNames.length) return;
    dropWorkingSheetsColumnIfPresent(columnNames[i], () => next(i + 1));
  };
  next(0);
}

function ensureWorkingSheetsDropRezerwacjeColumn() {
  dropWorkingSheetsColumnIfPresent('rezerwacje');
}

function insertWorkingSheetsHistoryBeforeReceiptSql() {
  return `INSERT INTO working_sheets_history
    (kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena_zakupu_pln, data_waznosci, objetosc, koszt_dostawy_per_unit, koszt_dostawy_per_unit_srednie, podatek_akcyzowy, action, receipt_id)
    SELECT kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena_zakupu_pln, data_waznosci, objetosc, koszt_dostawy_per_unit, koszt_dostawy_per_unit_srednie, podatek_akcyzowy,
           'before_receipt', ?
    FROM working_sheets WHERE kod = ?
      AND NOT EXISTS (
        SELECT 1 FROM working_sheets_history h
        WHERE h.kod = working_sheets.kod
          AND h.action = 'before_receipt'
          AND h.receipt_id = ?
      )`;
}

function insertWorkingSheetsHistoryBeforeReceiptParams(receiptId, productCode) {
  return [receiptId, productCode, receiptId];
}

function ensureWorkingSheetsHistorySchema(done) {
  const finish = () => {
    if (done) done();
  };
  db.run(
    `CREATE TABLE IF NOT EXISTS working_sheets_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kod TEXT NOT NULL,
      nazwa TEXT,
      ilosc INTEGER,
      kod_kreskowy TEXT,
      typ TEXT,
      sprzedawca TEXT,
      cena_zakupu_pln REAL,
      data_waznosci TEXT,
      objetosc REAL,
      koszt_dostawy_per_unit REAL DEFAULT 0,
      koszt_dostawy_per_unit_srednie REAL DEFAULT 0,
      podatek_akcyzowy REAL DEFAULT 0,
      action TEXT NOT NULL,
      receipt_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (receipt_id) REFERENCES product_receipts (id)
    )`,
    (createErr) => {
      if (createErr) {
        console.error('❌ Error creating working_sheets_history:', createErr.message);
        finish();
        return;
      }
      db.all('PRAGMA table_info(working_sheets_history)', (err, columns) => {
        if (err) {
          console.error('❌ Error reading working_sheets_history schema:', err.message);
          finish();
          return;
        }
        const names = (columns || []).map((col) => col.name);
        const addSrednie = () => {
          const afterSrednie = () => {
            db.run('CREATE INDEX IF NOT EXISTS idx_working_sheets_history_kod ON working_sheets_history(kod)');
            db.run('CREATE INDEX IF NOT EXISTS idx_working_sheets_history_receipt_id ON working_sheets_history(receipt_id)');
            db.run('CREATE INDEX IF NOT EXISTS idx_working_sheets_history_action ON working_sheets_history(action)');
            finish();
          };
          if (names.includes('koszt_dostawy_per_unit_srednie')) {
            afterSrednie();
            return;
          }
          db.run(
            'ALTER TABLE working_sheets_history ADD COLUMN koszt_dostawy_per_unit_srednie REAL DEFAULT 0',
            (alterErr) => {
              if (alterErr && !String(alterErr.message || '').includes('duplicate column')) {
                console.error('❌ Error adding working_sheets_history.koszt_dostawy_per_unit_srednie:', alterErr.message);
                finish();
                return;
              }
              db.run(
                'UPDATE working_sheets_history SET koszt_dostawy_per_unit_srednie = ROUND(koszt_dostawy_per_unit, 2)',
                function (updErr) {
                  if (updErr) {
                    console.error('❌ Error backfilling working_sheets_history.koszt_dostawy_per_unit_srednie:', updErr.message);
                  } else {
                    console.log(`✅ working_sheets_history.koszt_dostawy_per_unit_srednie filled from koszt_dostawy_per_unit on ${this.changes} rows`);
                  }
                  afterSrednie();
                }
              );
            }
          );
        };
        if (names.includes('koszt_wlasny')) {
          db.run('ALTER TABLE working_sheets_history DROP COLUMN koszt_wlasny', (dropErr) => {
            if (dropErr) {
              console.error('❌ Error dropping working_sheets_history.koszt_wlasny:', dropErr.message);
            } else {
              console.log('✅ Column working_sheets_history.koszt_wlasny dropped');
            }
          });
        }
        if (names.includes('cena') && !names.includes('cena_zakupu_pln')) {
          db.run(
            'ALTER TABLE working_sheets_history RENAME COLUMN cena TO cena_zakupu_pln',
            (renameErr) => {
              if (renameErr) {
                console.error('❌ Error renaming working_sheets_history.cena:', renameErr.message);
              } else {
                console.log('✅ Column working_sheets_history.cena renamed to cena_zakupu_pln');
              }
              addSrednie();
            }
          );
          return;
        }
        addSrednie();
      });
    }
  );
}

function ensureWorkingSheetsDropUnusedColumns() {
  dropWorkingSheetsColumnsIfPresent(['produkt_id', 'data', 'archived', 'archived_at', 'koszt_wlasny']);
}

function kodExistsInOtherReceipts(kod, excludeReceiptId) {
  return new Promise((resolve, reject) => {
    const normalized = normalizeProductKod(kod);
    if (!normalized) {
      resolve(false);
      return;
    }
    db.get(
      'SELECT 1 AS found FROM products WHERE kod = ? AND receipt_id IS NOT NULL AND receipt_id != ? LIMIT 1',
      [normalized, excludeReceiptId],
      (err, row) => {
        if (err) return reject(err);
        resolve(Boolean(row));
      }
    );
  });
}

function keepWorkingSheetZeroOrDelete(kod, excludeReceiptId) {
  return kodExistsInOtherReceipts(kod, excludeReceiptId).then((existsElsewhere) => (
    new Promise((resolve, reject) => {
      if (existsElsewhere) {
        db.run(
          'UPDATE working_sheets SET ilosc = 0 WHERE kod = ?',
          [kod],
          function (err) {
            if (err) reject(err);
            else {
              console.log(`✅ Kept working_sheets ${kod} (ilosc=0), kod exists in another receipt`);
              resolve('kept');
            }
          }
        );
      } else {
        db.run('DELETE FROM working_sheets WHERE kod = ?', [kod], function (err) {
          if (err) reject(err);
          else {
            console.log(`✅ Deleted working_sheets ${kod} (no other receipts with this kod)`);
            resolve('deleted');
          }
        });
      }
    })
  ));
}

function ensureWorkingSheetsFrozenColumns() {
  db.run('ALTER TABLE working_sheets ADD COLUMN zamrozone_srednie_zuzycie REAL', (alterErr) => {
    if (alterErr && !String(alterErr.message).includes('duplicate column')) {
      console.error('❌ Error adding zamrozone_srednie_zuzycie:', alterErr.message);
    }
    db.run(
      'UPDATE working_sheets SET zamrozone_srednie_zuzycie = ROUND(zamrozone_srednie_zuzycie, 3) WHERE zamrozone_srednie_zuzycie IS NOT NULL',
      function (roundErr) {
        if (roundErr) {
          console.error('❌ Error rounding zamrozone_srednie_zuzycie:', roundErr.message);
        } else if (this.changes > 0) {
          console.log(`✅ Rounded working_sheets.zamrozone_srednie_zuzycie on ${this.changes} rows`);
        }
      }
    );
  });
  db.run('ALTER TABLE working_sheets ADD COLUMN zamrozone_data_wyczerpania TEXT', (alterErr) => {
    if (alterErr && !String(alterErr.message).includes('duplicate column')) {
      console.error('❌ Error adding zamrozone_data_wyczerpania:', alterErr.message);
    }
  });
}

function ensureOrdersClientIdColumn() {
  db.run('ALTER TABLE orders ADD COLUMN client_id INTEGER', (alterErr) => {
    if (alterErr && !String(alterErr.message).includes('duplicate column')) {
      console.error('❌ Error adding client_id to orders:', alterErr.message);
    } else if (!alterErr) {
      console.log('✅ Column client_id added to orders');
    }
  });
  db.run('CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id)', (err) => {
    if (err) {
      console.error('❌ Error creating index idx_orders_client_id:', err.message);
    } else {
      console.log('✅ Index idx_orders_client_id ready');
    }
  });
}

function ensureKomisClientIdColumn() {
  db.run('ALTER TABLE komis ADD COLUMN client_id INTEGER', (alterErr) => {
    if (alterErr && !String(alterErr.message).includes('duplicate column')) {
      console.error('❌ Error adding client_id to komis:', alterErr.message);
    } else if (!alterErr) {
      console.log('✅ Column client_id added to komis');
    }
  });
  db.run('CREATE INDEX IF NOT EXISTS idx_komis_client_id ON komis(client_id)', (err) => {
    if (err) {
      console.error('❌ Error creating index idx_komis_client_id:', err.message);
    } else {
      console.log('✅ Index idx_komis_client_id ready');
    }
  });
}

function resolveClientIdByKlient(klientName, callback) {
  const name = String(klientName || '').trim();
  if (!name) {
    return callback(null, null);
  }
  db.get(
    'SELECT id FROM clients WHERE LOWER(TRIM(nazwa)) = LOWER(?) LIMIT 1',
    [name],
    (err, row) => {
      if (err) return callback(err);
      callback(null, row ? row.id : null);
    }
  );
}

function parseClientId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function resolveOrderClientFromBody({ client_id, clientName, klient }, callback) {
  const parsed = parseClientId(client_id);
  if (parsed) {
    return resolveClientById(parsed, callback);
  }

  const name = String(clientName || klient || '').trim();
  if (!name) {
    return callback(null, { error: 'client_id is required', status: 400 });
  }

  db.get(
    'SELECT id, nazwa FROM clients WHERE LOWER(TRIM(nazwa)) = LOWER(TRIM(?)) LIMIT 1',
    [name],
    (err, row) => {
      if (err) return callback(err);
      if (!row) {
        return callback(null, { error: 'Client not found', status: 404 });
      }
      callback(null, { clientId: row.id, klientName: row.nazwa });
    }
  );
}

function resolveClientById(clientId, callback) {
  const id = parseClientId(clientId);
  if (!id) {
    return callback(null, { error: 'client_id is required', status: 400 });
  }
  db.get('SELECT id, nazwa FROM clients WHERE id = ?', [id], (err, row) => {
    if (err) return callback(err);
    if (!row) {
      return callback(null, { error: 'Client not found', status: 404 });
    }
    callback(null, { clientId: row.id, klientName: row.nazwa });
  });
}

function resolveInvoiceClient({ order_id, klient }, callback) {
  const orderId = parseClientId(order_id);
  if (orderId) {
    db.get(
      `SELECT
        o.client_id,
        COALESCE(c.nazwa, o.klient) AS klient_name,
        c.firma AS klient_firma
      FROM orders o
      LEFT JOIN clients c ON c.id = o.client_id
      WHERE o.id = ?`,
      [orderId],
      (err, row) => {
        if (err) return callback(err);
        if (!row) {
          return callback(null, { error: 'Order not found', status: 404 });
        }
        if (!row.client_id) {
          return callback(null, { error: 'Order has no client_id', status: 400 });
        }
        callback(null, {
          clientId: row.client_id,
          klientName: row.klient_name || String(klient || '').trim(),
          klientFirma: row.klient_firma || null,
        });
      }
    );
    return;
  }

  const name = String(klient || '').trim();
  if (!name) {
    return callback(null, { error: 'klient is required when order_id is missing', status: 400 });
  }

  db.get(
    'SELECT id, nazwa, firma FROM clients WHERE LOWER(TRIM(nazwa)) = LOWER(TRIM(?)) LIMIT 1',
    [name],
    (err, row) => {
      if (err) return callback(err);
      callback(null, {
        clientId: row ? row.id : null,
        klientName: row ? row.nazwa : name,
        klientFirma: row ? (row.firma || null) : null,
      });
    }
  );
}

const ORDER_WITH_CLIENT_JOIN = `
  FROM orders o
  LEFT JOIN clients c ON c.id = o.client_id
`;

function withResolvedOrderKlient(orderRow) {
  if (!orderRow) return orderRow;
  if (orderRow.klient_resolved == null) return orderRow;
  const { klient_resolved, ...rest } = orderRow;
  return { ...rest, klient: klient_resolved };
}

function attachReservationAmountsToProducts(orderId, products, callback) {
  if (!products || products.length === 0) {
    callback(null, products || []);
    return;
  }

  db.all(`
    SELECT rp.product_kod as kod, SUM(rof.quantity) as ilosc_from_reservation
    FROM reservation_order_fulfillments rof
    INNER JOIN reservation_products rp ON rof.reservation_product_id = rp.id
    WHERE rof.order_id = ?
    GROUP BY rp.product_kod
  `, [orderId], (err, rows) => {
    if (err) {
      callback(err);
      return;
    }

    const byKod = new Map((rows || []).map((row) => [row.kod, row.ilosc_from_reservation || 0]));
    callback(null, products.map((product) => ({
      ...product,
      ilosc_from_reservation: byKod.get(product.kod) || 0
    })));
  });
}

function enrichSearchRowsWithOrderReservation(orderId, rows, callback) {
  if (!orderId || !rows || rows.length === 0) {
    callback(null, rows || []);
    return;
  }

  db.all(`
    SELECT rp.product_kod as kod, SUM(rof.quantity) as ilosc_from_reservation
    FROM reservation_order_fulfillments rof
    INNER JOIN reservation_products rp ON rof.reservation_product_id = rp.id
    WHERE rof.order_id = ?
    GROUP BY rp.product_kod
  `, [orderId], (err, fulfillmentRows) => {
    if (err) {
      callback(err);
      return;
    }

    const fromReservationByKod = new Map(
      (fulfillmentRows || []).map((row) => [row.kod, row.ilosc_from_reservation || 0])
    );

    callback(null, rows.map((row) => {
      const fromReservation = fromReservationByKod.get(row.kod) || 0;
      const freeClientReservation = row.ilosc_client_reserved || 0;
      const globalReserved = row.ilosc_reserved || 0;
      const enriched = {
        ...row,
        ilosc_from_reservation: fromReservation,
        ilosc_reserved_effective: globalReserved + fromReservation
      };

      if (row.ilosc_client_reserved !== undefined) {
        enriched.ilosc_client_reserved_effective = freeClientReservation + fromReservation;
      }

      return enriched;
    }));
  });
}

function cascadeClientRename(clientId, oldNazwa, newNazwa, callback) {
  const trimmedNew = String(newNazwa || '').trim();
  const trimmedOld = String(oldNazwa || '').trim();
  if (!trimmedNew || trimmedOld === trimmedNew) {
    return callback(null);
  }

  db.run('UPDATE orders SET klient = ? WHERE client_id = ?', [trimmedNew, clientId], (ordersErr) => {
    if (ordersErr) {
      console.error(`❌ Error updating orders.klient for client ${clientId}:`, ordersErr);
      return callback(ordersErr);
    }

    db.run(
      `UPDATE komis SET klient = ?, client_id = COALESCE(client_id, ?)
       WHERE client_id = ?
          OR (client_id IS NULL AND LOWER(TRIM(klient)) = LOWER(TRIM(?)))`,
      [trimmedNew, clientId, clientId, trimmedOld],
      (komisErr) => {
      if (komisErr) {
        console.error(`❌ Error updating komis.klient for client ${clientId}:`, komisErr);
        return callback(komisErr);
      }

      db.run(
        'UPDATE invoices SET klient_nazwa = ? WHERE client_id = ?',
        [trimmedNew, clientId],
        (invoicesErr) => {
          if (invoicesErr) {
            console.error(`❌ Error updating invoices.klient_nazwa for client ${clientId}:`, invoicesErr);
            return callback(invoicesErr);
          }
          console.log(`✅ Cascaded client rename to orders/komis/invoices for client ${clientId}`);
          callback(null);
        }
      );
    });
  });
}

function parseOrderDateFromNumber(orderNumber) {
  if (!orderNumber) return null;
  const datePattern = /(\d{1,2})_(\d{1,2})_(\d{4})$/;
  const match = String(orderNumber).match(datePattern);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    const date = new Date(`${year}-${month}-${day}`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const altPattern = /(\d{1,2})-(\d{1,2})-(\d{4})$/;
  const altMatch = String(orderNumber).match(altPattern);
  if (altMatch) {
    const day = altMatch[1].padStart(2, '0');
    const month = altMatch[2].padStart(2, '0');
    const year = altMatch[3];
    const date = new Date(`${year}-${month}-${day}`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function getOrderProductSaleDate(row) {
  const fromNumber = parseOrderDateFromNumber(row.numer_zamowienia);
  if (fromNumber) return fromNumber;
  if (row.data_utworzenia) {
    const fromCreated = new Date(row.data_utworzenia);
    if (!Number.isNaN(fromCreated.getTime())) return fromCreated;
  }
  if (row.created_at) {
    const fromOpCreated = new Date(row.created_at);
    if (!Number.isNaN(fromOpCreated.getTime())) return fromOpCreated;
  }
  return null;
}

function computeAverageConsumptionFromRows(rows, startDate, endDate) {
  const salesProducts = rows.filter((row) => {
    const d = getOrderProductSaleDate(row);
    if (!d) return !startDate;
    if (startDate && d < startDate) return false;
    if (d > endDate) return false;
    return true;
  });

  if (salesProducts.length === 0) return 0;

  let firstSaleDate = null;
  for (const row of salesProducts) {
    const d = getOrderProductSaleDate(row);
    if (d && (!firstSaleDate || d < firstSaleDate)) firstSaleDate = d;
  }
  if (!firstSaleDate) return 0;

  const days = Math.max(1, Math.ceil((endDate.getTime() - firstSaleDate.getTime()) / (1000 * 60 * 60 * 24)));
  const totalSales = salesProducts.reduce((sum, row) => sum + (row.ilosc || 0), 0);
  return totalSales / days;
}

function fetchOrderProductsForKod(kod) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT op.kod, op.ilosc, op.created_at, o.numer_zamowienia, o.data_utworzenia
       FROM order_products op
       JOIN orders o ON o.id = op.orderId
       WHERE op.kod = ?`,
      [kod],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

async function computeFrozenConsumptionMetrics(kod, createdAt) {
  const rows = await fetchOrderProductsForKod(kod);
  const startDate = createdAt ? new Date(createdAt) : null;
  let lastDate = null;

  for (const row of rows) {
    const d = getOrderProductSaleDate(row);
    if (!d) continue;
    if (startDate && d < startDate) continue;
    if (!lastDate || d > lastDate) lastDate = d;
  }

  if (!lastDate) return { avg: null, depletionDate: null };

  const avg = computeAverageConsumptionFromRows(rows, startDate, lastDate);
  const depletionDate = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}-${String(lastDate.getDate()).padStart(2, '0')}`;
  return { avg, depletionDate };
}

function saveFrozenConsumptionMetrics(kod, metrics) {
  return new Promise((resolve, reject) => {
    if (metrics.avg == null || metrics.depletionDate == null) {
      resolve();
      return;
    }
    db.run(
      'UPDATE working_sheets SET zamrozone_srednie_zuzycie = ?, zamrozone_data_wyczerpania = ? WHERE kod = ?',
      [Math.round(metrics.avg * 1000) / 1000, metrics.depletionDate, kod],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

function clearFrozenConsumptionMetrics(kod) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE working_sheets SET zamrozone_srednie_zuzycie = NULL, zamrozone_data_wyczerpania = NULL WHERE kod = ?',
      [kod],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

async function handleWorkingSheetsStockDecrease(kod, saleMeta = {}) {
  return new Promise((resolve) => {
    db.get(
      'SELECT ilosc, created_at, zamrozone_srednie_zuzycie FROM working_sheets WHERE kod = ?',
      [kod],
      async (err, row) => {
        if (err || !row) {
          resolve();
          return;
        }

        try {
          if (row.ilosc <= 0) {
            const metrics = await computeFrozenConsumptionMetrics(kod, row.created_at);
            await saveFrozenConsumptionMetrics(kod, metrics);
            console.log(`🧊 Frozen consumption metrics for ${kod}:`, metrics);
          } else if (row.zamrozone_srednie_zuzycie != null && row.created_at && saleMeta.affectsConsumptionMetrics !== false) {
            const saleDate = saleMeta.saleDate
              || (saleMeta.numerZamowienia ? parseOrderDateFromNumber(saleMeta.numerZamowienia) : null)
              || new Date();
            const periodStart = new Date(row.created_at);
            if (saleDate >= periodStart) {
              await clearFrozenConsumptionMetrics(kod);
              console.log(`🔓 Cleared frozen consumption metrics for ${kod} (sale in current period)`);
            }
          }
        } catch (freezeErr) {
          console.error(`❌ handleWorkingSheetsStockDecrease(${kod}):`, freezeErr);
        }

        resolve();
      }
    );
  });
}

function runWorkingSheetsDecrease(kod, amount, saleMeta, callback) {
  db.run(
    'UPDATE working_sheets SET ilosc = ilosc - ? WHERE kod = ?',
    [amount, kod],
    function(updateErr) {
      if (updateErr) {
        callback(updateErr);
        return;
      }
      handleWorkingSheetsStockDecrease(kod, saleMeta)
        .then(() => callback(null))
        .catch(() => callback(null));
    }
  );
}

// Database initialization
db.serialize(() => {
  // Включаем поддержку внешних ключей
  db.run('PRAGMA foreign_keys = ON', (err) => {
    if (err) {
      console.error('❌ Error enabling foreign keys:', err);
    } else {
      console.log('✅ Foreign keys enabled');
    }
  });
  
  console.log('🗄️ Initializing database...');
  
  // Таблица клиентов
  db.run(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nazwa TEXT NOT NULL,
    firma TEXT,
    adres TEXT,
    kontakt TEXT,
    czas_dostawy TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating clients table:', err);
    } else {
      console.log('✅ Clients table ready');
    }
  });

  // Таблица продуктов
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kod TEXT NOT NULL,
    nazwa TEXT NOT NULL,
    kod_kreskowy TEXT,
    cena_zakupu_pln REAL DEFAULT 0,
    ilosc_pierwotna INTEGER DEFAULT 0,
    ilosc_aktualna INTEGER DEFAULT 0,
    receipt_id INTEGER,
    czy_probki INTEGER DEFAULT 0,
    typ TEXT,
    objetosc TEXT,
    data_waznosci DATE,
    vat REAL DEFAULT 0,
    cena_zakupu_org REAL,
    koszt_dostawy_per_unit_srednie REAL DEFAULT 0,
    koszt_dostawy_per_unit REAL DEFAULT 0,
    podatek_akcyzowy REAL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (receipt_id) REFERENCES product_receipts (id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating products table:', err);
    } else {
      console.log('✅ Products table ready');
    }
  });

  // Таблица заказов
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    klient TEXT NOT NULL,
    client_id INTEGER,
    numer_zamowienia TEXT NOT NULL,
    data_utworzenia DATETIME DEFAULT CURRENT_TIMESTAMP,
    laczna_ilosc INTEGER DEFAULT 0,
    typ TEXT DEFAULT 'zamowienie',
    numer_zwrotu TEXT,
    FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating orders table:', err);
    } else {
      console.log('✅ Orders table ready');
      ensureOrdersClientIdColumn();
    }
  });

  // Таблица продуктов заказов
  db.run(`CREATE TABLE IF NOT EXISTS order_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderId INTEGER NOT NULL,
    product_id INTEGER,
    kod TEXT NOT NULL,
    nazwa TEXT NOT NULL,
    kod_kreskowy TEXT,
    ilosc INTEGER NOT NULL,
    typ TEXT DEFAULT 'sprzedaz',
    product_kod TEXT,
    powod_zwrotu TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orderId) REFERENCES orders (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating order_products table:', err);
    } else {
      console.log('✅ Order products table ready');
      
      // Миграция: удаляем колонку powod_odpisania если она существует
      db.all("PRAGMA table_info(order_products)", (err, columns) => {
        if (err) {
          console.error('❌ Error checking order_products table structure:', err);
          return;
        }
        
        const hasPowodOdpisania = columns.some(col => col.name === 'powod_odpisania');
        
        if (hasPowodOdpisania) {
          console.log('🔄 Migrating order_products table: removing powod_odpisania column...');
          
          // Удаляем временную таблицу если она существует (на случай прерванной миграции)
          db.run(`DROP TABLE IF EXISTS order_products_new`, (dropErr) => {
            if (dropErr && !dropErr.message.includes('no such table')) {
              console.error('❌ Error dropping temp table:', dropErr);
              return;
            }
            
            // Создаем временную таблицу без колонки powod_odpisania
            db.run(`
              CREATE TABLE order_products_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                orderId INTEGER NOT NULL,
                product_id INTEGER,
                kod TEXT NOT NULL,
                nazwa TEXT NOT NULL,
                kod_kreskowy TEXT,
                ilosc INTEGER NOT NULL,
                typ TEXT DEFAULT 'sprzedaz',
                product_kod TEXT,
                powod_zwrotu TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (orderId) REFERENCES orders (id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
              )
            `, (err) => {
              if (err) {
                console.error('❌ Error creating new order_products table:', err);
                return;
              }
              
              // Копируем данные из старой таблицы в новую
              db.run(`
                INSERT INTO order_products_new 
                (id, orderId, product_id, kod, nazwa, kod_kreskowy, ilosc, typ, product_kod, powod_zwrotu, created_at)
                SELECT 
                  id, orderId, product_id, kod, nazwa, kod_kreskowy, ilosc, typ, product_kod, powod_zwrotu, created_at
                FROM order_products
              `, (err) => {
                if (err) {
                  console.error('❌ Error copying data to new table:', err);
                  // Удаляем временную таблицу при ошибке
                  db.run(`DROP TABLE IF EXISTS order_products_new`);
                  return;
                }
                
                // Удаляем старую таблицу
                db.run(`DROP TABLE order_products`, (err) => {
                  if (err) {
                    console.error('❌ Error dropping old table:', err);
                    // Удаляем временную таблицу при ошибке
                    db.run(`DROP TABLE IF EXISTS order_products_new`);
                    return;
                  }
                  
                  // Переименовываем новую таблицу
                  db.run(`ALTER TABLE order_products_new RENAME TO order_products`, (err) => {
                    if (err) {
                      console.error('❌ Error renaming table:', err);
                      return;
                    }
                    
                    console.log('✅ Column powod_odpisania removed from order_products');
                  });
                });
              });
            });
          });
        } else {
          console.log('✅ Column powod_odpisania does not exist in order_products (migration not needed)');
        }

        db.run(
          `UPDATE order_products SET typ = 'przesuniecie'
           WHERE typ IS NULL
             AND orderId IN (SELECT id FROM orders WHERE typ = 'przesuniecie')`,
          function (migrateTypErr) {
            if (migrateTypErr) {
              console.error('❌ Error migrating przesuniecie order_products typ:', migrateTypErr);
            } else if (this.changes > 0) {
              console.log(`✅ Migrated ${this.changes} przesuniecie order_products to typ='przesuniecie'`);
            }
          }
        );
      });
    }
  });

  // Миграция: удаляем устаревшие таблицы writeoffs и writeoff_products (если существуют)
  db.run(`DROP TABLE IF EXISTS writeoffs`, (err) => {
    if (err) {
      console.error('❌ Error dropping writeoffs table:', err);
    } else {
      console.log('✅ Table writeoffs dropped (if existed)');
    }
  });
  
  db.run(`DROP TABLE IF EXISTS writeoff_products`, (err) => {
    if (err) {
      console.error('❌ Error dropping writeoff_products table:', err);
    } else {
      console.log('✅ Table writeoff_products dropped (if existed)');
    }
  });

  // Миграция: замена префикса OP/RCH на RW в номерах rozchodu (odpisanie)
  db.run(`UPDATE orders SET numer_zamowienia = 'RW' || SUBSTR(numer_zamowienia, 3) WHERE typ = 'odpisanie' AND (numer_zamowienia LIKE 'OP%' OR numer_zamowienia LIKE 'RCH%')`, function(err) {
    if (err) {
      console.error('❌ Error migrating to RW:', err);
    } else if (this.changes > 0) {
      console.log(`✅ Migrated ${this.changes} records to RW prefix`);
    } else {
      console.log('✅ No records to migrate (migration already applied or no records)');
    }
  });

  // Таблица рабочих листов
  db.run(`CREATE TABLE IF NOT EXISTS working_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kod TEXT NOT NULL,
    nazwa TEXT NOT NULL,
    ilosc INTEGER DEFAULT 0,
    kod_kreskowy TEXT,
    data_waznosci DATE,
    objetosc TEXT,
    typ TEXT,
    sprzedawca TEXT,
    cena_zakupu_pln REAL DEFAULT 0,
    cena_sprzedazy_pln REAL DEFAULT 0,
    koszt_dostawy_per_unit REAL DEFAULT 0,
    koszt_dostawy_per_unit_srednie REAL DEFAULT 0,
    podatek_akcyzowy REAL DEFAULT 0,
    zamrozone_srednie_zuzycie REAL,
    zamrozone_data_wyczerpania TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating working_sheets table:', err);
    } else {
      console.log('✅ Working sheets table ready');
      ensureWorkingSheetsUniqueIndex();
      ensureWorkingSheetsFrozenColumns();
      ensureWorkingSheetsDropRezerwacjeColumn();
      ensureWorkingSheetsDropUnusedColumns();
      dropSchemaMigrationsTable();
      ensureWorkingSheetsRenameCenaColumn(() => {
        ensureWorkingSheetsRenameCenaSprzedazyColumn(() => {
          ensureWorkingSheetsHistorySchema();
        });
      });
    }
  });

  // Таблица приемок товаров
  db.run(`CREATE TABLE IF NOT EXISTS product_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data_przyjecia DATE NOT NULL,
    sprzedawca TEXT,
    wartosc_przyjecia_netto REAL DEFAULT 0,
    vat REAL DEFAULT 0,
    wartosc_przyjecia_brutto REAL DEFAULT 0,
    wartosc_dostawy REAL DEFAULT 0,
    kurs_1 REAL DEFAULT 1,
    stawka_podatek_akcyzowy REAL DEFAULT 0,
    rabat REAL DEFAULT 0,
    waluta_przyjecia TEXT DEFAULT 'EUR',
    waluta_dostawy TEXT,
    kurs_2 REAL DEFAULT 1,
    product_invoice TEXT,
    transport_invoice TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating product_receipts table:', err);
    } else {
      console.log('✅ Product receipts table ready');
      ensureProductReceiptsRenameDataPrzyjeciaColumn();
      ensureProductReceiptsRenameInvoiceColumns();
      ensureProductReceiptsRenameKursColumns(() => {
        db.run(`ALTER TABLE product_receipts ADD COLUMN kurs_1 REAL DEFAULT 1`, (alterErr) => {
          if (alterErr) {
            if (alterErr.message.includes('duplicate column name') || alterErr.message.includes('already exists')) {
              console.log('✅ Column kurs_1 already exists in product_receipts');
            } else {
              console.error('❌ Error adding kurs_1 column:', alterErr);
            }
          } else {
            console.log('✅ Column kurs_1 added to product_receipts');
          }
        });
        db.run(`ALTER TABLE product_receipts ADD COLUMN kurs_2 REAL DEFAULT 1`, (alterErr) => {
          if (alterErr) {
            if (alterErr.message.includes('duplicate column name') || alterErr.message.includes('already exists')) {
              console.log('✅ Column kurs_2 already exists in product_receipts');
            } else {
              console.error('❌ Error adding kurs_2 column:', alterErr);
            }
          } else {
            console.log('✅ Column kurs_2 added to product_receipts');
          }
        });
      });
      ensureProductReceiptsRenameWartoscColumn(() => {
        ensureProductReceiptsRenamePodatekAkcyzowyColumn(() => {
          db.run(`ALTER TABLE product_receipts ADD COLUMN stawka_podatek_akcyzowy REAL DEFAULT 0`, (alterErr) => {
            if (alterErr) {
              if (alterErr.message.includes('duplicate column name') || alterErr.message.includes('already exists')) {
                console.log('✅ Column stawka_podatek_akcyzowy already exists in product_receipts');
              } else {
                console.error('❌ Error adding stawka_podatek_akcyzowy column:', alterErr);
              }
            } else {
              console.log('✅ Column stawka_podatek_akcyzowy added to product_receipts');
            }
            roundExistingProductReceiptsWartosc();
          });
        });
      });
      ensureProductReceiptsRenameKosztDostawyColumn(() => {
        db.run(`ALTER TABLE product_receipts ADD COLUMN wartosc_dostawy REAL DEFAULT 0`, (alterErr) => {
          if (alterErr) {
            if (alterErr.message.includes('duplicate column name') || alterErr.message.includes('already exists')) {
              console.log('✅ Column wartosc_dostawy already exists in product_receipts');
            } else {
              console.error('❌ Error adding wartosc_dostawy column:', alterErr);
            }
          } else {
            console.log('✅ Column wartosc_dostawy added to product_receipts');
          }
        });
      });
      ensureProductReceiptsRenameWalutaFakturyColumn(() => {
        db.run(`ALTER TABLE product_receipts ADD COLUMN waluta_przyjecia TEXT DEFAULT 'EUR'`, (alterErr) => {
          if (alterErr) {
            if (alterErr.message.includes('duplicate column name') || alterErr.message.includes('already exists')) {
              console.log('✅ Column waluta_przyjecia already exists in product_receipts');
            } else {
              console.error('❌ Error adding waluta_przyjecia column:', alterErr);
            }
          } else {
            console.log('✅ Column waluta_przyjecia added to product_receipts');
          }
        });
      });

      // Страховка: если таблица уже существовала без колонки rabat (старая БД,
      // созданная до её появления в этом CREATE TABLE) — добавляем её отдельно.
      db.run(`ALTER TABLE product_receipts ADD COLUMN vat REAL DEFAULT 0`, (alterErr) => {
        if (alterErr) {
          if (alterErr.message.includes('duplicate column name') || alterErr.message.includes('already exists')) {
            console.log('✅ Column vat already exists in product_receipts');
          } else {
            console.error('❌ Error adding vat column:', alterErr);
          }
        } else {
          console.log('✅ Column vat added to product_receipts');
        }
      });
      db.run(`ALTER TABLE product_receipts ADD COLUMN wartosc_przyjecia_brutto REAL DEFAULT 0`, (alterErr) => {
        if (alterErr) {
          if (alterErr.message.includes('duplicate column name') || alterErr.message.includes('already exists')) {
            console.log('✅ Column wartosc_przyjecia_brutto already exists in product_receipts');
          } else {
            console.error('❌ Error adding wartosc_przyjecia_brutto column:', alterErr);
          }
        } else {
          console.log('✅ Column wartosc_przyjecia_brutto added to product_receipts');
        }
      });
      db.run(`ALTER TABLE product_receipts ADD COLUMN rabat REAL DEFAULT 0`, (alterErr) => {
        if (alterErr) {
          if (alterErr.message.includes('duplicate column name') || alterErr.message.includes('already exists')) {
            console.log('✅ Column rabat already exists in product_receipts');
          } else {
            console.error('❌ Error adding rabat column:', alterErr);
          }
        } else {
          console.log('✅ Column rabat added to product_receipts');
        }
      });
      db.run(`ALTER TABLE product_receipts ADD COLUMN waluta_dostawy TEXT`, (alterErr) => {
        if (alterErr) {
          if (alterErr.message.includes('duplicate column name') || alterErr.message.includes('already exists')) {
            console.log('✅ Column waluta_dostawy already exists in product_receipts');
          } else {
            console.error('❌ Error adding waluta_dostawy column:', alterErr);
          }
        } else {
          console.log('✅ Column waluta_dostawy added to product_receipts');
        }
      });
      db.run(`ALTER TABLE product_receipts ADD COLUMN version INTEGER DEFAULT 1`, (alterErr) => {
        if (alterErr) {
          if (alterErr.message.includes('duplicate column name') || alterErr.message.includes('already exists')) {
            console.log('✅ Column version already exists in product_receipts');
          } else {
            console.error('❌ Error adding version column:', alterErr);
          }
        } else {
          console.log('✅ Column version added to product_receipts');
        }
      });
    }
  });

  // Таблица оригинальных листов
  db.run(`CREATE TABLE IF NOT EXISTS original_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating original_sheets table:', err);
    } else {
      console.log('✅ Original sheets table ready');
    }
  });

  // Используется только таблица products для FIFO-списаний

  // Таблица потребления заказов (FIFO tracking)
  db.run(`CREATE TABLE IF NOT EXISTS order_consumptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_kod TEXT NOT NULL,
    batch_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    batch_price REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating order_consumptions table:', err);
    } else {
      console.log('✅ Order consumptions table ready');
    }
  });

  // Таблица резерваций
  db.run(`CREATE TABLE IF NOT EXISTS  reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    numer_rezerwacji TEXT UNIQUE NOT NULL,
    data_utworzenia DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_zakonczenia DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'aktywna',
    komentarz TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE RESTRICT
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating reservations table:', err);
    } else {
      console.log('✅ Reservations table ready');
    }
  });

  // Таблица товаров в резервациях
  db.run(`CREATE TABLE IF NOT EXISTS reservation_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_id INTEGER NOT NULL,
    product_id INTEGER,
    product_kod TEXT NOT NULL,
    product_nazwa TEXT NOT NULL,
    kod_kreskowy TEXT,
    ilosc INTEGER NOT NULL DEFAULT 1,
    komentarz TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating reservation_products table:', err);
    } else {
      console.log('✅ Reservation products table ready');
      
      // Добавляем колонку ilosc_wydane если её нет
      db.run(`ALTER TABLE reservation_products ADD COLUMN ilosc_wydane INTEGER DEFAULT 0`, (alterErr) => {
        if (alterErr) {
          // Колонка уже существует - это нормально
          if (alterErr.message.includes('duplicate column name') || alterErr.message.includes('already exists')) {
            console.log('✅ Column ilosc_wydane already exists in reservation_products');
          } else {
            console.error('❌ Error adding ilosc_wydane column:', alterErr);
          }
        } else {
          console.log('✅ Column ilosc_wydane added to reservation_products');
        }
      });
    }
  });

  // Таблица связи резерваций и заказов (для отслеживания выданных товаров)
  db.run(`CREATE TABLE IF NOT EXISTS reservation_order_fulfillments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_product_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL,
    order_product_id INTEGER,
    quantity INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_product_id) REFERENCES reservation_products (id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    FOREIGN KEY (order_product_id) REFERENCES order_products (id) ON DELETE SET NULL
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating reservation_order_fulfillments table:', err);
    } else {
      console.log('✅ Reservation order fulfillments table ready');
    }
  });

  // Индексы для таблицы reservations
  db.run(`CREATE INDEX IF NOT EXISTS idx_reservations_client_id ON reservations(client_id)`, (err) => {
    if (err) console.error('❌ Error creating index idx_reservations_client_id:', err);
  });
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status)`, (err) => {
    if (err) console.error('❌ Error creating index idx_reservations_status:', err);
  });
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_reservations_data_zakonczenia ON reservations(data_zakonczenia)`, (err) => {
    if (err) console.error('❌ Error creating index idx_reservations_data_zakonczenia:', err);
  });
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_reservations_numer_rezerwacji ON reservations(numer_rezerwacji)`, (err) => {
    if (err) console.error('❌ Error creating index idx_reservations_numer_rezerwacji:', err);
  });

  // Индексы для таблицы reservation_products
  db.run(`CREATE INDEX IF NOT EXISTS idx_reservation_products_reservation_id ON reservation_products(reservation_id)`, (err) => {
    if (err) console.error('❌ Error creating index idx_reservation_products_reservation_id:', err);
  });
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_reservation_products_product_id ON reservation_products(product_id)`, (err) => {
    if (err) console.error('❌ Error creating index idx_reservation_products_product_id:', err);
  });
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_reservation_products_product_kod ON reservation_products(product_kod)`, (err) => {
    if (err) console.error('❌ Error creating index idx_reservation_products_product_kod:', err);
  });

  // Индексы для таблицы reservation_order_fulfillments
  db.run(`CREATE INDEX IF NOT EXISTS idx_fulfillments_reservation_product_id ON reservation_order_fulfillments(reservation_product_id)`, (err) => {
    if (err) console.error('❌ Error creating index idx_fulfillments_reservation_product_id:', err);
  });
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_fulfillments_order_id ON reservation_order_fulfillments(order_id)`, (err) => {
    if (err) console.error('❌ Error creating index idx_fulfillments_order_id:', err);
  });

  // Таблица инвойсов (фактур)
  db.run(`CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numer_faktury TEXT NOT NULL,
    data_faktury TEXT,
    order_id INTEGER,
    numer_zamowienia TEXT,
    termin_platnosci TEXT,
    client_id INTEGER,
    klient_nazwa TEXT,
    klient_firma TEXT,
    suma_netto REAL,
    suma_vat REAL,
    suma_brutto REAL,
    rabat_suma REAL DEFAULT 0,
    przesuniecie_order_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL,
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating invoices table:', err);
    } else {
      console.log('✅ Invoices table ready');
    }
  });

  // Таблица позиций инвойса
  db.run(`CREATE TABLE IF NOT EXISTS invoice_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    kod TEXT,
    nazwa TEXT,
    ilosc REAL,
    cena_netto REAL,
    rabat REAL DEFAULT 0,
    vat_stawka INTEGER DEFAULT 23,
    wartosc_netto REAL,
    wartosc_vat REAL,
    wartosc_brutto REAL,
    order_product_id INTEGER,
    FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating invoice_products table:', err);
    } else {
      console.log('✅ Invoice products table ready');
    }
  });

  // Миграция: добавляем przesuniecie_order_id в invoices
  db.run(`ALTER TABLE invoices ADD COLUMN przesuniecie_order_id INTEGER`, (alterErr) => {
    if (alterErr) {
      if (alterErr.message.includes('duplicate column name') || alterErr.message.includes('already exists')) {
        console.log('✅ Column przesuniecie_order_id already exists in invoices');
      } else {
        console.error('❌ Error adding przesuniecie_order_id column:', alterErr);
      }
    } else {
      console.log('✅ Column przesuniecie_order_id added to invoices');
    }
  });

  console.log('🎉 All database tables initialized successfully');
  ensureProductsReceiptLineColumns();
});

// ===== RESERVATIONS ROUTES =====
// ВАЖНО: Регистрируем маршруты резерваций в начале, чтобы они точно обрабатывались

// Endpoint для создания резерваций (регистрируем ПЕРВЫМ!)
console.log('🔧 Registering POST /api/reservations endpoint (PRIORITY)');
app.post('/api/reservations', (req, res) => {
  console.log('✅ POST /api/reservations - ROUTE MATCHED AND EXECUTING');
  console.log('📥 Incoming request:', req.method, req.url);
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  const { client_id, numer_rezerwacji: providedNumber, data_utworzenia, data_zakonczenia, komentarz, products } = req.body;
  console.log('📋 POST /api/reservations - Creating new reservation:', { client_id, numer_rezerwacji: providedNumber, data_utworzenia, data_zakonczenia, productsCount: products?.length || 0 });
  
  if (!client_id || !data_zakonczenia) {
    console.log('❌ Validation failed: client_id and data_zakonczenia are required');
    return res.status(400).json({ error: 'Client ID and end date are required' });
  }
  
  // Используем переданную дату создания или текущую дату
  const reservationDate = data_utworzenia || new Date().toISOString().split('T')[0];
  
  if (!products || !Array.isArray(products) || products.length === 0) {
    console.log('❌ Validation failed: products array is required and must not be empty');
    return res.status(400).json({ error: 'Products array is required and must not be empty' });
  }

  // Используем переданный номер или генерируем новый
  let numer_rezerwacji = providedNumber;
  
  // Проверяем доступность товаров перед созданием резервации
  console.log('🔍 Checking product availability for reservation...');
  
  // Создаем массив для проверки доступности
  const availabilityChecks = products.map(product => {
    return new Promise((resolve, reject) => {
      const { product_kod, product_nazwa, ilosc } = product;
      
      // Проверяем доступное количество с учетом активных резерваций
      // Подзапросы: total_available суммирует ВСЕ строки по kod (основные + семплы)
      db.get(`
        SELECT 
          (SELECT COALESCE(SUM(ilosc), 0) FROM working_sheets WHERE kod = ?) as total_available,
          COALESCE((
            SELECT SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0))
            FROM reservation_products rp
            INNER JOIN reservations r ON rp.reservation_id = r.id
            WHERE rp.product_kod = ? AND r.status = 'aktywna'
          ), 0) as reserved
      `, [product_kod, product_kod], (err, row) => {
        if (err) {
          reject({ kod: product_kod, error: err.message });
        } else if (!row) {
          reject({ kod: product_kod, nazwa: product_nazwa, ilosc, available: 0, error: 'Product not found in working_sheets' });
        } else {
          const available = row.total_available - row.reserved;
          if (available < ilosc) {
            reject({ kod: product_kod, nazwa: product_nazwa, ilosc, available: available, reserved: row.reserved, total: row.total_available, error: 'Insufficient quantity' });
          } else {
            resolve({ kod: product_kod, nazwa: product_nazwa, ilosc, available: available });
          }
        }
      });
    });
  });
  
  // Выполняем все проверки
  Promise.all(availabilityChecks)
    .then((results) => {
      console.log('✅ All products are available for reservation');
      
      // Если все проверки прошли, создаем резервацию
      const createReservation = (finalNumber, retryCount = 0) => {
        // Защита от бесконечной рекурсии
        if (retryCount > 5) {
          console.error(`❌ Too many retries (${retryCount}) for reservation number generation`);
          return res.status(500).json({ 
            error: 'Failed to generate unique reservation number after multiple attempts',
            details: { attemptedNumber: finalNumber, retries: retryCount }
          });
        }

        // Создаем резервацию
        db.run(
          'INSERT INTO reservations (client_id, numer_rezerwacji, data_utworzenia, data_zakonczenia, status, komentarz) VALUES (?, ?, ?, ?, ?, ?)',
          [client_id, finalNumber, reservationDate, data_zakonczenia, 'aktywna', komentarz || null],
          function(err) {
            if (err) {
              // Если ошибка уникальности, пытаемся сгенерировать новый номер
              if (err.message.includes('UNIQUE constraint') || err.message.includes('unique')) {
                console.log(`⚠️ Reservation number ${finalNumber} already exists (attempt ${retryCount + 1}), generating new one...`);
                getNextReservationNumber(reservationDate, (retryErr, newNumber, maxNumber) => {
                  if (retryErr) {
                    console.error('❌ Error finding max reservation number on retry:', retryErr);
                    return res.status(500).json({ error: retryErr.message });
                  }
                  console.log(`✅ Retry ${retryCount + 1}: Generated new reservation number: ${newNumber} (max number: ${maxNumber})`);
                  createReservation(newNumber, retryCount + 1);
                });
                return;
              }
              
              console.error('❌ Database error creating reservation:', err);
              return res.status(500).json({ error: err.message });
            }
        
        const reservationId = this.lastID;
        console.log(`✅ Reservation created with ID: ${reservationId}, number: ${finalNumber}`);
        
        // Создаем записи для каждого продукта
        let productsCreated = 0;
        let productsFailed = 0;
        
        products.forEach((product, index) => {
          const { product_kod, product_nazwa, kod_kreskowy, ilosc } = product;
          
          // Получаем product_id из таблицы products по коду
          db.get('SELECT id FROM products WHERE kod = ? LIMIT 1', [product_kod], (err, productRow) => {
            if (err) {
              console.error(`❌ Error finding product ${product_kod}:`, err);
              productsFailed++;
              checkCompletion();
              return;
            }

            const productId = productRow ? productRow.id : null;
            
            // Создаем запись в reservation_products
            db.run(
              'INSERT INTO reservation_products (reservation_id, product_id, product_kod, product_nazwa, kod_kreskowy, ilosc) VALUES (?, ?, ?, ?, ?, ?)',
              [reservationId, productId, product_kod, product_nazwa, kod_kreskowy || null, ilosc],
              function(err) {
                if (err) {
                  console.error(`❌ Error creating reservation product ${index + 1}:`, err);
                  productsFailed++;
                  checkCompletion();
                } else {
                  productsCreated++;
                  console.log(`✅ Product ${index + 1} created for reservation ${reservationId} with ID: ${this.lastID}`);
                  checkCompletion();
                }
              }
            );
          });
        });
        
        function checkCompletion() {
          if (productsCreated + productsFailed === products.length) {
            if (res.headersSent) {
              console.log('⚠️ Response already sent, skipping checkCompletion');
              return;
            }
            
            if (productsFailed === 0) {
              console.log(`✅ All ${productsCreated} products created successfully for reservation ${reservationId}`);
              res.json({ 
                id: reservationId,
                numer_rezerwacji: finalNumber,
                message: 'Reservation and all products added successfully',
                productsCreated: productsCreated,
                success: true
              });
            } else {
              console.log(`⚠️ Reservation created but ${productsFailed} products failed to create`);
              res.status(500).json({ 
                id: reservationId,
                numer_rezerwacji: finalNumber,
                error: `Reservation created but ${productsFailed} products failed to create`,
                productsCreated: productsCreated,
                productsFailed: productsFailed
              });
            }
          }
        }
      }
    );
  };
  
      if (!numer_rezerwacji) {
        // Генерируем номер резервации: R001_день_месяц_год (глобальная нумерация)
        console.log(`🔢 Generating reservation number for date: ${reservationDate}`);
        getNextReservationNumber(reservationDate, (err, nextNumberString, maxNumber) => {
          if (err) {
            console.error('❌ Error finding max reservation number:', err);
            return res.status(500).json({ error: err.message });
          }
          numer_rezerwacji = nextNumberString;
          console.log(`✅ Generated reservation number: ${numer_rezerwacji} (max number was: ${maxNumber}, next: ${maxNumber + 1})`);
          createReservation(numer_rezerwacji);
        });
      } else {
        // Проверяем уникальность переданного номера
        db.get('SELECT id FROM reservations WHERE numer_rezerwacji = ?', [numer_rezerwacji], (err, existing) => {
          if (err) {
            console.error('❌ Error checking reservation number uniqueness:', err);
            return res.status(500).json({ error: err.message });
          }
          
          if (existing) {
            console.log(`❌ Reservation number ${numer_rezerwacji} already exists`);
            return res.status(400).json({ error: `Reservation number ${numer_rezerwacji} already exists` });
          }
          
        createReservation(numer_rezerwacji);
        });
      }
    })
    .catch((error) => {
      // Обрабатываем ошибки доступности
      // Promise.all отклоняется с первой ошибкой
      console.log('❌ Availability check failed for reservation');
      
      if (error.error === 'Insufficient quantity') {
        const { kod, nazwa, ilosc, available, reserved, total } = error;
        console.log(`❌ Product ${kod} (${nazwa}) - requested: ${ilosc}, available: ${available}, reserved: ${reserved}, total: ${total}`);
        res.status(400).json({ 
          error: 'Insufficient quantity',
          details: {
            kod,
            nazwa,
            requested: ilosc,
            available: available,
            reserved: reserved,
            total: total,
            message: `Niewystarczająca ilość produktu "${nazwa}" (kod: ${kod}). Zapytano: ${ilosc}, dostępne: ${available} (łącznie: ${total}, zarezerwowane: ${reserved})`
          }
        });
      } else if (error.error === 'Product not found in working_sheets') {
        const { kod, nazwa } = error;
        console.log(`❌ Product ${kod} (${nazwa}) not found in working_sheets`);
        res.status(400).json({ 
          error: 'Product not found',
          details: {
            kod,
            nazwa,
            message: `Produkt "${nazwa}" (kod: ${kod}) nie został znaleziony w systemie`
          }
        });
      } else {
        console.log(`❌ Database error checking availability:`, error);
        res.status(500).json({ 
          error: 'Database error during availability check',
          details: {
            kod: error.kod || 'unknown',
            message: `Błąd bazy danych podczas sprawdzania dostępności produktu ${error.kod || 'unknown'}`
          }
        });
      }
    });
});

// ===== RESERVATIONS ROUTES =====
// Endpoint для получения только числовой части следующего номера резервации (без даты)
// ВАЖНО: Регистрируем ПЕРВЫМ среди маршрутов резерваций, чтобы не перехватывался другими
console.log('🔧 Registering GET /api/reservations/next-number-only endpoint (PRIORITY)');
app.get('/api/reservations/next-number-only', (req, res) => {
  console.log('🔢 GET /api/reservations/next-number-only - Generating next reservation number (without date)');
  
  // Получаем все номера резерваций для поиска максимального номера
  db.all('SELECT numer_rezerwacji FROM reservations WHERE numer_rezerwacji LIKE ?', ['R%'], (err, allRows) => {
    if (err) {
      console.error('❌ Error finding max reservation number:', err);
      return res.status(500).json({ error: err.message });
    }
    
    console.log(`📋 Found ${allRows.length} reservations with R% pattern`);
    if (allRows.length > 0) {
      console.log('📋 Reservation numbers:', allRows.map(r => r.numer_rezerwacji).join(', '));
    }
    
    // Извлекаем числовую часть из каждого номера и находим максимум
    let maxNumber = 0;
    const numbers = [];
    allRows.forEach(row => {
      const match = row.numer_rezerwacji.match(/^R(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        numbers.push(num);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    });
    
    console.log(`📊 Extracted numbers: [${numbers.sort((a,b) => a-b).join(', ')}], max: ${maxNumber}`);
    
    const nextNumber = maxNumber + 1;
    const numer_rezerwacji_only = `R${nextNumber.toString().padStart(3, '0')}`;
    console.log(`✅ Generated next reservation number (without date): ${numer_rezerwacji_only} (max number was: ${maxNumber}, next: ${nextNumber})`);
    res.json({ numer_rezerwacji: numer_rezerwacji_only });
  });
});

// Получение всех товаров из резерваций (активных и реализованных - для истории)
// Группирует товары по product_kod и суммирует количество
app.get('/api/reservations/active-products', (req, res) => {
  console.log('📋 GET /api/reservations/active-products - Fetching reservation products history (grouped by product)');

  // Сначала получаем сгруппированные данные по товарам
  db.all(`
    SELECT 
      rp.product_kod,
      MAX(rp.product_nazwa) as product_nazwa,
      SUM(COALESCE(rp.ilosc, 0)) as ilosc,
      SUM(COALESCE(rp.ilosc_wydane, 0)) as ilosc_wydane
    FROM reservations r
    INNER JOIN reservation_products rp ON rp.reservation_id = r.id
    WHERE LOWER(TRIM(r.status)) IN ('aktywna', 'aktywny', 'zrealizowana')
    GROUP BY rp.product_kod
    ORDER BY rp.product_nazwa ASC
  `, (err, groupedRows) => {
    if (err) {
      console.error('❌ Database error fetching reservation products:', err);
      res.status(500).json({ error: err.message });
      return;
    }

    // Для каждого уникального товара собираем информацию о клиентах и заказах
    const processedRows = groupedRows.map(groupedRow => {
      return new Promise((resolve) => {
        if (!groupedRow.product_kod) {
          resolve({ ...groupedRow, klienci: [], zamowienia_z_iloscia: [] });
          return;
        }

        // Получаем список клиентов для этого товара (из активных и реализованных резерваций)
        db.all(`
          SELECT
            r.client_id as client_id,
            COALESCE(NULLIF(TRIM(c.nazwa), ''), NULLIF(TRIM(c.firma), ''), '—') as klient,
            SUM(COALESCE(rp.ilosc, 0)) as ilosc,
            SUM(COALESCE(rp.ilosc_wydane, 0)) as ilosc_wydane
          FROM reservations r
          INNER JOIN reservation_products rp ON rp.reservation_id = r.id
          LEFT JOIN clients c ON r.client_id = c.id
          WHERE LOWER(TRIM(r.status)) IN ('aktywna', 'aktywny', 'zrealizowana')
            AND rp.product_kod = ?
          GROUP BY r.client_id
          ORDER BY klient ASC
        `, [groupedRow.product_kod], (err, clientRows) => {
          if (err) {
            console.error(`❌ Error fetching clients for product ${groupedRow.product_kod}:`, err);
            resolve({ ...groupedRow, klienci: [], zamowienia_z_iloscia: [] });
            return;
          }

          const klienci = (clientRows || []).map((cr) => ({
            client_id: cr.client_id,
            klient: cr.klient || '—',
            ilosc: cr.ilosc || 0,
            ilosc_wydane: cr.ilosc_wydane || 0,
          }));

          // Получаем все заказы для этого товара из всех резерваций (активных и реализованных)
          db.all(`
            SELECT 
              o.numer_zamowienia,
              SUM(rof.quantity) as ilosc_wydane_w_zamowieniu
            FROM reservation_order_fulfillments rof
            INNER JOIN orders o ON rof.order_id = o.id
            INNER JOIN reservation_products rp ON rof.reservation_product_id = rp.id
            INNER JOIN reservations r ON rp.reservation_id = r.id
            WHERE LOWER(TRIM(r.status)) IN ('aktywna', 'aktywny', 'zrealizowana')
              AND rp.product_kod = ?
            GROUP BY o.numer_zamowienia
            ORDER BY o.data_utworzenia DESC
          `, [groupedRow.product_kod], (err, orderRows) => {
            if (err) {
              console.error(`❌ Error fetching orders for product ${groupedRow.product_kod}:`, err);
              resolve({ 
                ...groupedRow, 
                klienci,
                zamowienia_z_iloscia: [] 
              });
              return;
            }

            resolve({
              product_kod: groupedRow.product_kod,
              product_nazwa: groupedRow.product_nazwa,
              ilosc: groupedRow.ilosc || 0,
              ilosc_wydane: groupedRow.ilosc_wydane || 0,
              klienci,
              zamowienia_z_iloscia: orderRows.map(or => ({
                numer_zamowienia: or.numer_zamowienia,
                ilosc: or.ilosc_wydane_w_zamowieniu || 0
              }))
            });
          });
        });
      });
    });

    Promise.all(processedRows).then(results => {
      console.log(`✅ Found ${results.length} unique products in reservations (history)`);
      res.json(results);
    });
  });
});

// API Routes
app.get('/api/health', (req, res) => {
  console.log('🏥 Health check requested');
  res.json({ 
    status: 'OK', 
    message: 'EnoTerra ERP Server is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/nbp/rates', async (req, res) => {
  try {
    const date = String(req.query.date || '').trim();
    const codes = String(req.query.codes || '')
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean);
    const result = await fetchNbpRates(date, codes);
    if (result.error) {
      res.status(result.status || 400).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('❌ NBP rates error:', err);
    res.status(502).json({ error: 'Serwis NBP jest niedostępny. Spróbuj ponownie.' });
  }
});

// Test endpoint для проверки путей
app.get('/api/test-paths', (req, res) => {
  const uploadsDir = path.join(__dirname, 'uploads');
  let dirContents = [];
  let exists = false;

  try {
    exists = fs.existsSync(uploadsDir);
    if (exists) {
      dirContents = fs.readdirSync(uploadsDir);
    }
  } catch (error) {
    console.error('Error checking uploads directory:', error);
  }

  res.json({
    cwd: process.cwd(),
    __dirname: __dirname,
    uploadsDir: uploadsDir,
    dirContents: dirContents,
    exists: exists,
    error: exists ? null : 'Directory not found'
  });
});

// API для получения списка файлов
app.get('/api/original-sheets', (req, res) => {
  console.log('📄 GET /api/original-sheets - Fetching original sheets');
  db.all('SELECT * FROM original_sheets', (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Преобразуем данные в нужный формат
    const sheets = rows.map(row => ({
      id: row.id,
      fileName: row.file_name,
      data: JSON.parse(row.data),
      created_at: row.created_at
    }));
    
    console.log(`✅ Found ${sheets.length} original sheets`);
    res.json(sheets);
  });
});

// API для проверки существования файла
app.get('/api/check_file/:fileName', (req, res) => {
  const { fileName } = req.params;
  console.log(`🔍 GET /api/check_file/${fileName} - Checking file existence`);
  
  db.get('SELECT COUNT(*) as count FROM original_sheets WHERE file_name = ?', [fileName], (err, row) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    const exists = row.count > 0;
    console.log(`✅ File ${fileName} exists: ${exists}`);
    res.json({ exists });
  });
});

// Products API
app.get('/api/products', (req, res) => {
  console.log('📦 GET /api/products - Fetching all products');
  db.all('SELECT * FROM products ORDER BY nazwa', (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log(`✅ Found ${rows.length} products`);
    res.json((rows || []).map(formatProductCenaZakupu));
  });
});

app.post('/api/products', (req, res) => {
  const { kod, nazwa, kod_kreskowy, cena, cena_zakupu_pln, ilosc, data_waznosci } = req.body;
  console.log('📦 POST /api/products - Creating new product:', { kod, nazwa });
  
  if (!kod || !nazwa) {
    console.log('❌ Validation failed: kod and nazwa are required');
    return res.status(400).json({ error: 'Kod and nazwa are required' });
  }
  
  db.run(
    'INSERT INTO products (kod, nazwa, kod_kreskowy, cena_zakupu_pln, ilosc_pierwotna, ilosc_aktualna, data_waznosci) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [kod, nazwa, kod_kreskowy, roundMoney(cena_zakupu_pln || cena || 0), ilosc || 0, ilosc || 0, data_waznosci],
    function(err) {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Product created with ID: ${this.lastID}`);
      res.json({ id: this.lastID, message: 'Product added successfully' });
    }
  );
});

app.get('/api/products/search', (req, res) => {
  const { query } = req.query;
  console.log(`🔍 GET /api/products/search - Searching products with query: "${query}"`);
  
  if (!query) {
    console.log('❌ Validation failed: query parameter is required');
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  db.all(
    'SELECT * FROM products WHERE nazwa LIKE ? OR kod LIKE ? ORDER BY nazwa LIMIT 10',
    [`%${query}%`, `%${query}%`],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Found ${rows.length} products matching "${query}"`);
      res.json({
        products: (rows || []).map(formatProductCenaZakupu),
        query: query,
        count: rows.length,
        timestamp: new Date().toISOString()
      });
    }
  );
});

// Получение количества samples для каждого товара
app.get('/api/products/samples-count', (req, res) => {
  console.log('📦 GET /api/products/samples-count - Fetching samples count');
  db.all(
    `SELECT kod, SUM(ilosc_aktualna) as total_ilosc 
     FROM products 
     WHERE czy_probki = 1 
     GROUP BY kod`,
    [],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Found samples count for ${rows.length} products`);
      res.json(rows || []);
    }
  );
});

// Получение количества товаров в активных резервациях (невыданное количество)
app.get('/api/products/reservations-count', (req, res) => {
  console.log('📦 GET /api/products/reservations-count - Fetching reservations count');
  db.all(
    `SELECT 
      rp.product_kod as kod,
      SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as total_ilosc
     FROM reservation_products rp
     INNER JOIN reservations r ON rp.reservation_id = r.id
     WHERE r.status = 'aktywna'
     GROUP BY rp.product_kod`,
    [],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Found reservations count for ${rows.length} products`);
      res.json(rows || []);
    }
  );
});

// Клиенты с актуальным остатком в активных резервациях по каждому товару
app.get('/api/products/reservations-clients', (req, res) => {
  console.log('📦 GET /api/products/reservations-clients - Fetching active reservation clients');
  db.all(
    `SELECT 
      rp.product_kod as kod,
      r.client_id as client_id,
      COALESCE(NULLIF(TRIM(c.nazwa), ''), NULLIF(TRIM(c.firma), ''), '—') as klient,
      SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as ilosc
     FROM reservation_products rp
     INNER JOIN reservations r ON rp.reservation_id = r.id
     LEFT JOIN clients c ON r.client_id = c.id
     WHERE r.status = 'aktywna'
     GROUP BY rp.product_kod, r.client_id
     HAVING SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) > 0
     ORDER BY klient ASC`,
    [],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Found reservation clients for ${rows.length} product-client rows`);
      res.json(rows || []);
    }
  );
});

// Получение стоимости товаров (ilosc * cena_zakupu_pln для каждого kod из working_sheets)
app.get('/api/products/wartosc-towaru', (req, res) => {
  console.log('📦 GET /api/products/wartosc-towaru - Fetching product values from working_sheets');
  db.all(
    `SELECT kod, (ilosc * cena_zakupu_pln) as wartosc 
     FROM working_sheets`,
    [],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Found wartosc for ${rows.length} products from working_sheets`);
      res.json(rows || []);
    }
  );
});

// Получение самой старой даты created_at из products для каждого kod (для расчёта среднего потребления)
app.get('/api/products/oldest-date', (req, res) => {
  console.log('📦 GET /api/products/oldest-date - Fetching oldest created_at for each kod');
  db.all(
    `SELECT kod, MIN(created_at) as oldest_created_at 
     FROM products 
     GROUP BY kod`,
    [],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Found oldest dates for ${rows.length} products`);
      res.json(rows || []);
    }
  );
});

// Получение информации о конкретном товаре по ID
app.get('/api/products/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📦 GET /api/products/${id} - Fetching product details`);
  
  db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!row) {
      console.log(`❌ Product with ID ${id} not found`);
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    
    console.log(`✅ Found product: ${row.nazwa} (${row.kod})`);
    res.json({
      product: formatProductCenaZakupu(row),
      selected: true,
      timestamp: new Date().toISOString()
    });
  });
});

// Функция для проверки и обновления истекших резерваций
function checkExpiredReservations() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  db.run(`
    UPDATE reservations 
    SET status = 'wygasła' 
    WHERE status = 'aktywna' 
      AND date(data_zakonczenia) < date(?)
  `, [today], function(err) {
    if (err) {
      console.error('❌ Error checking expired reservations:', err);
    } else if (this.changes > 0) {
      console.log(`✅ ${this.changes} reservation(s) marked as 'wygasła'`);
    }
  });
}

// Запускаем проверку истекших резерваций при старте сервера
setTimeout(() => {
  checkExpiredReservations();
}, 2000);

// Запускаем проверку каждый час
setInterval(() => {
  checkExpiredReservations();
}, 60 * 60 * 1000);

// Функция для проверки и обновления статуса резервации на 'zrealizowana' или обратно на 'aktywna'
function checkAndUpdateReservationStatus(reservationId) {
  // Проверяем, все ли товары в резервации полностью выданы
  db.get(`
    SELECT 
      COUNT(*) as total_products,
      SUM(CASE WHEN COALESCE(ilosc_wydane, 0) >= ilosc THEN 1 ELSE 0 END) as completed_products
    FROM reservation_products 
    WHERE reservation_id = ?
  `, [reservationId], (err, row) => {
    if (err) {
      console.error(`❌ Error checking reservation ${reservationId} status:`, err);
      return;
    }
    
    if (row && row.total_products > 0 && row.total_products === row.completed_products) {
      // Все товары выданы - меняем статус на 'zrealizowana'
      db.run(
        'UPDATE reservations SET status = ? WHERE id = ? AND status = ?',
        ['zrealizowana', reservationId, 'aktywna'],
        function(updateErr) {
          if (updateErr) {
            console.error(`❌ Error updating reservation ${reservationId} status:`, updateErr);
          } else if (this.changes > 0) {
            console.log(`✅ Reservation ${reservationId} status changed to 'zrealizowana'`);
          }
        }
      );
    } else if (row && row.total_products > 0 && row.completed_products < row.total_products) {
      // Не все товары выданы - если статус 'zrealizowana', возвращаем на 'aktywna'
      db.run(
        'UPDATE reservations SET status = ? WHERE id = ? AND status = ?',
        ['aktywna', reservationId, 'zrealizowana'],
        function(updateErr) {
          if (updateErr) {
            console.error(`❌ Error reverting reservation ${reservationId} status:`, updateErr);
          } else if (this.changes > 0) {
            console.log(`✅ Reservation ${reservationId} status reverted to 'aktywna' (not all products fulfilled)`);
          }
        }
      );
    }
  });
}

// Вспомогательная функция для разбивки текста на строки по ширине
function wrapText(text, font, fontSize, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

// Функция генерации PDF заказа
async function generateOrderPDF(order, products, res) {
  try {
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    const fs = await import('fs');
    const path = await import('path');
    
    // Регистрируем fontkit для поддержки пользовательских шрифтов
    let fontkit;
    try {
      fontkit = require('@pdf-lib/fontkit');
    } catch (fkErr) {
      try {
        fontkit = (await import('@pdf-lib/fontkit')).default;
      } catch {
        fontkit = null;
      }
    }
    
    // Создаем новый PDF документ
    const pdfDoc = await PDFDocument.create();
    
    if (fontkit) {
      pdfDoc.registerFontkit(fontkit);
    }
    
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 размер
    
    // Получаем стандартные шрифты с поддержкой Unicode
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Встраиваем пользовательский шрифт с поддержкой Unicode
    let soraFont;
    try {
      const soraPath = path.join(__dirname, 'fonts', 'Sora-Regular.ttf');
      const soraBytes = fs.readFileSync(soraPath);
      soraFont = await pdfDoc.embedFont(soraBytes, { subset: false });
      console.log('✅ Sora font embedded');
    } catch (fontErr) {
      console.warn('⚠️ Could not embed Sora font, falling back to Helvetica:', fontErr?.message || fontErr);
      soraFont = helveticaFont;
    }
    
    const { width, height } = page.getSize();
    const margin = 50;
    let yPosition = height - margin;
    
    // Цвета для текста
    const colors = {
      white: rgb(1, 1, 1), // white
      border: rgb(0.82, 0.82, 0.82), // #d1d5db
      text: rgb(0.22, 0.22, 0.22), // #374151
      textDark: rgb(0.12, 0.12, 0.12), // #1f2937
      textLight: rgb(0.61, 0.64, 0.69), // #9ca3af
    };

    // Мягкая серая палитра (единый стиль с таблицей товаров)
    colors.headerText = rgb(0.294, 0.333, 0.388); // серые подписи капсом
    colors.hairline = rgb(0.886, 0.898, 0.918);   // тонкие линии-разделители

    // Псевдо-жирный на Sora (поддерживает польские символы) + выравнивание по правому краю
    const drawSemiBold = (pg, text, x, y, size, color) => {
      pg.drawText(text, { x, y, size, font: soraFont, color });
      pg.drawText(text, { x: x + 0.35, y, size, font: soraFont, color });
    };
    const drawRightSemiBold = (pg, text, xRight, y, size, color) => {
      const w = soraFont.widthOfTextAtSize(text, size);
      drawSemiBold(pg, text, xRight - w, y, size, color);
    };
    const drawRight = (pg, text, xRight, y, size, color) => {
      const w = soraFont.widthOfTextAtSize(text, size);
      pg.drawText(text, { x: xRight - w, y, size, font: soraFont, color });
    };
    
    // Белый фон страницы (без контейнеров и теней)
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: height,
      color: rgb(1, 1, 1)
    });
    
    const containerMargin = 24;
    
    // Рамка вверху страницы (опущена на 1 см = ~28 пикселей)
    const headerHeight = 80;
    const headerY = height - containerMargin - headerHeight - 28;
    
    const middleX = width / 2; // граница левой (логотип) и правой (номер) частей
    
    // Левая половина: логотип
    try {
      const assetsDir = path.join(__dirname, 'assets');
      const logoPath = path.join(assetsDir, 'zam_pdf_logo.jpg');

      const exists = fs.existsSync(logoPath);
      console.log('🖼 logo exists:', exists, logoPath);

      if (exists) {
        const logoBytes = fs.readFileSync(logoPath);
        console.log('🖼 logo bytes read:', logoBytes.length);
        let logoImage;
        try {
          logoImage = await pdfDoc.embedJpg(logoBytes);
        } catch (embedErr) {
          console.error('❌ embedJpg failed:', embedErr);
          throw embedErr;
        }

        // Масштабируем логотип чтобы поместился в левую половину (увеличено на 20%)
        const maxLogoWidth = (width / 2 - 2 * containerMargin) * 0.8 * 1.2;
        const maxLogoHeight = headerHeight * 0.7 * 1.2;
        const scaleFactor = Math.min(maxLogoWidth / logoImage.width, maxLogoHeight / logoImage.height, 1);
        const logoDims = logoImage.scale(scaleFactor);

        console.log('✅ logo embedded dims:', logoDims.width, logoDims.height);

        // Логотип по левому полю контента (в одну сетку с таблицей и блоком клиента)
        const logoX = containerMargin;
        const logoY = headerY + (headerHeight - logoDims.height) / 2;

        // Рисуем логотип
        page.drawImage(logoImage, {
          x: logoX,
          y: logoY,
          width: logoDims.width,
          height: logoDims.height
        });
      }
    } catch (e) {
      console.warn('⚠️ Logo not embedded:', e?.message || e);
    }
    
    // Номер заказа справа (Sora, псевдо-жирный, выравнивание по правому краю)
    const orderNumber = order.numer_zamowienia || order.id || '';
    const orderNumberY = headerY + headerHeight / 2 - 5;
    drawRightSemiBold(page, String(orderNumber), width - containerMargin, orderNumberY, 15, colors.textDark);

    // Тонкая серая линия под хедером — в стиле разделителей таблицы
    page.drawLine({
      start: { x: containerMargin, y: headerY },
      end: { x: width - containerMargin, y: headerY },
      thickness: 0.5,
      color: colors.hairline,
    });
    
    // Единый вертикальный отступ вокруг блока клиента (сверху и снизу одинаковый)
    const clientBlockGap = 28;

    // Блок с информацией о клиенте: мягкая розовая подложка, без рамки, один столбец
    const clientBlockBg = rgb(0.99, 0.94, 0.94); // фирменный розовый (очень бледный)
    const clientLabelSize = 7.5;
    const clientValueSize = 9;
    const clientRowGap = 17;
    const clientPadTop = 18;
    const clientPadBottom = 13;

    // Только заполненные поля — блок подстраивается под контент, без пустых строк
    const clientFields = [
      ['KLIENT', order.client_name || order.klient || '-'],
      ['FIRMA', order.firma],
      ['ADRES', order.adres],
      ['CZAS DOSTAWY', order.czas_dostawy],
    ].filter(([, value]) => value != null && String(value).trim() !== '');

    const clientBlockHeight =
      clientPadTop + Math.max(0, clientFields.length - 1) * clientRowGap + clientPadBottom;
    const clientBlockTop = headerY - clientBlockGap;
    const clientBlockY = clientBlockTop - clientBlockHeight;

    page.drawRectangle({
      x: containerMargin,
      y: clientBlockY,
      width: width - 2 * containerMargin,
      height: clientBlockHeight,
      color: clientBlockBg,
    });

    // Один столбец: серая подпись капсом + тёмное значение, поля друг под другом
    const clientTextX = containerMargin + 15;
    let clientY = clientBlockTop - clientPadTop;
    clientFields.forEach(([label, value]) => {
      drawSemiBold(page, label, clientTextX, clientY, clientLabelSize, colors.headerText);
      const lw = soraFont.widthOfTextAtSize(label, clientLabelSize);
      page.drawText(String(value), {
        x: clientTextX + lw + 6,
        y: clientY,
        size: clientValueSize,
        font: soraFont,
        color: colors.textDark,
      });
      clientY -= clientRowGap;
    });

    // Снизу такой же отступ, как сверху — блок ровно между линией хедера и шапкой таблицы
    yPosition = clientBlockY - clientBlockGap;

    // ===== Таблица товаров (современный стиль) =====
    const tableX = containerMargin + 10;
    const rightEdge = width - containerMargin;
    const qtyRightX = rightEdge - 10; // правый край колонки Ilość
    const colWidths = [100, 260, 140, 30]; // Kod, Nazwa, Kod kreskowy, Ilość
    const kodX = tableX + 2;
    const nazwaX = tableX + colWidths[0] + 2;
    const barcodeX = tableX + colWidths[0] + colWidths[1] + 2;
    const headersDef = [
      { label: 'KOD', x: kodX, align: 'left' },
      { label: 'NAZWA', x: nazwaX, align: 'left' },
      { label: 'KOD KRESKOWY', x: barcodeX, align: 'left' },
      { label: 'ILOŚĆ', x: qtyRightX, align: 'right' },
    ];

    // Палитра таблицы
    const tableColors = {
      headerBg: rgb(0.945, 0.949, 0.960),
      headerText: rgb(0.294, 0.333, 0.388),
      row: rgb(0.176, 0.196, 0.235),
      zebra: rgb(0.972, 0.976, 0.984),
      line: rgb(0.886, 0.898, 0.918),
      totalLine: rgb(0.74, 0.75, 0.78),
    };

    const bodySize = 9.5;
    const lineHeight = 12;
    const rowPadV = 7;
    const minBandH = 24;
    const headerBandH = 22;

    // Шапка таблицы: серая плашка + подписи; возвращает y нижней границы шапки
    const drawTableHeader = (pg, topY) => {
      pg.drawRectangle({
        x: containerMargin,
        y: topY - headerBandH,
        width: rightEdge - containerMargin,
        height: headerBandH,
        color: tableColors.headerBg,
      });
      const baseline = topY - headerBandH / 2 - 3;
      headersDef.forEach((h) => {
        if (h.align === 'right') {
          drawRightSemiBold(pg, h.label, h.x, baseline, 8.5, tableColors.headerText);
        } else {
          drawSemiBold(pg, h.label, h.x, baseline, 8.5, tableColors.headerText);
        }
      });
      return topY - headerBandH;
    };

    console.log(`🧾 PDF(main) products count: ${products?.length || 0}`);
    let currentPage = page;
    let bandTop = drawTableHeader(currentPage, yPosition);

    (products || []).forEach((p, index) => {
      const kod = p.kod || '-';
      const name = p.nazwa || p.product_name || '-';
      const barcode = p.kod_kreskowy || '-';
      const qty = Number(p.ilosc || p.qty || 0);

      // Перенос названия по ширине колонки Nazwa
      const nameLines = wrapText(name, soraFont, bodySize, colWidths[1] - 6);
      const contentH = Math.max(lineHeight, nameLines.length * lineHeight);
      const bandH = Math.max(minBandH, contentH + rowPadV * 2);

      // Перенос на новую страницу с повторной отрисовкой шапки
      if (bandTop - bandH < containerMargin + 70) {
        currentPage = pdfDoc.addPage([595.28, 841.89]);
        bandTop = drawTableHeader(currentPage, height - containerMargin - 28);
      }

      const bandBottom = bandTop - bandH;
      const centerY = bandTop - bandH / 2;

      // Зебра для нечётных строк
      if (index % 2 === 1) {
        currentPage.drawRectangle({
          x: containerMargin,
          y: bandBottom,
          width: rightEdge - containerMargin,
          height: bandH,
          color: tableColors.zebra,
        });
      }

      // Тонкий разделитель снизу строки
      currentPage.drawLine({
        start: { x: containerMargin, y: bandBottom },
        end: { x: rightEdge, y: bandBottom },
        thickness: 0.5,
        color: tableColors.line,
      });

      // Вертикальное центрирование содержимого строки
      const singleBaseline = centerY - bodySize * 0.34;
      const firstNameBaseline = centerY + ((nameLines.length - 1) * lineHeight) / 2 - bodySize * 0.34;

      // Kod
      currentPage.drawText(kod, { x: kodX, y: singleBaseline, size: bodySize, font: soraFont, color: tableColors.row });

      // Nazwa (многострочная, по центру по вертикали)
      nameLines.forEach((line, i) => {
        currentPage.drawText(line, {
          x: nazwaX,
          y: firstNameBaseline - i * lineHeight,
          size: bodySize,
          font: soraFont,
          color: tableColors.row,
        });
      });

      // Kod kreskowy
      currentPage.drawText(barcode, { x: barcodeX, y: singleBaseline, size: bodySize, font: soraFont, color: tableColors.row });

      // Ilość — выравнивание по правому краю
      drawRight(currentPage, String(qty), qtyRightX, singleBaseline, bodySize, tableColors.row);

      bandTop = bandBottom;
    });

    // Итоговая линия + Razem
    currentPage.drawLine({
      start: { x: containerMargin, y: bandTop },
      end: { x: rightEdge, y: bandTop },
      thickness: 1,
      color: tableColors.totalLine,
    });

    const razemBaseline = bandTop - 18;
    const razemValue = String(order.laczna_ilosc || 0);
    const razemValueWidth = soraFont.widthOfTextAtSize(razemValue, 12);
    drawRightSemiBold(currentPage, 'RAZEM', qtyRightX - razemValueWidth - 14, razemBaseline, 9.5, colors.textDark);
    drawRight(currentPage, razemValue, qtyRightX, razemBaseline, 12, colors.textDark);

    // Убрали подписи снизу
        
        const pdfBytes = await pdfDoc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="order_${order.numer_zamowienia}.pdf"`);
        res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Error generating PDF:', error);
    
    // Если ошибка связана с кодировкой, не используем старую разметку
    if (error.message && error.message.includes('WinAnsi cannot encode')) {
      console.error('PDF unicode encoding failed (WinAnsi). Fallback disabled.');
      return res.status(500).json({ error: 'PDF unicode encoding failed' });
    }
    
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
}

// Orders API
app.get('/api/orders', (req, res) => {
  console.log('📋 GET /api/orders - Fetching all orders');
  db.all(
    `SELECT o.*, COALESCE(c.nazwa, o.klient) AS klient_resolved ${ORDER_WITH_CLIENT_JOIN} ORDER BY o.data_utworzenia DESC`,
    (err, orderRows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`✅ Found ${orderRows.length} orders`);
    
    if (orderRows.length === 0) {
      return res.json([]);
    }
    
    // Для каждого заказа получаем продукты
    let ordersProcessed = 0;
    const ordersWithProducts = [];
    
    orderRows.forEach((order) => {
      const resolvedOrder = withResolvedOrderKlient(order);
      console.log(`🔍 Fetching products for order ${resolvedOrder.id} (${resolvedOrder.numer_zamowienia})`);
      db.all('SELECT * FROM order_products WHERE orderId = ? ORDER BY id', [resolvedOrder.id], (err, productRows) => {
        if (err) {
          console.error(`❌ Error fetching products for order ${resolvedOrder.id}:`, err);
          console.error(`❌ Error details:`, err.message);
          ordersWithProducts.push({
            ...resolvedOrder,
            products: []
          });
        } else {
          attachReservationAmountsToProducts(resolvedOrder.id, productRows || [], (attachErr, productsWithReservation) => {
            if (attachErr) {
              console.error(`❌ Error fetching reservation fulfillments for order ${resolvedOrder.id}:`, attachErr);
              ordersWithProducts.push({
                ...resolvedOrder,
                products: productRows || []
              });
            } else {
              console.log(`✅ Found ${productsWithReservation.length} products for order ${resolvedOrder.id}`);
              ordersWithProducts.push({
                ...resolvedOrder,
                products: productsWithReservation
              });
            }

            ordersProcessed++;
            if (ordersProcessed === orderRows.length) {
              console.log(`✅ All ${ordersProcessed} orders processed with products`);
              res.json(ordersWithProducts);
            }
          });
          return;
        }
        
        ordersProcessed++;
        
        // Когда все заказы обработаны, отправляем ответ
        if (ordersProcessed === orderRows.length) {
          console.log(`✅ All ${ordersProcessed} orders processed with products`);
          res.json(ordersWithProducts);
        }
      });
    });
  });
});

// Поиск заказов по номеру для возврата (частичный поиск)
app.get('/api/orders/search', (req, res) => {
  const { numer_zamowienia } = req.query;
  console.log(`🔍 GET /api/orders/search - Searching orders by number: ${numer_zamowienia}`);
  
  if (!numer_zamowienia) {
    console.log('❌ Validation failed: numer_zamowienia is required');
    return res.status(400).json({ error: 'Order number is required' });
  }
  
  // Поиск заказов по частичному совпадению номера
  const searchPattern = `%${numer_zamowienia}%`;
  db.all(
    `SELECT o.*, COALESCE(c.nazwa, o.klient) AS klient_resolved ${ORDER_WITH_CLIENT_JOIN} WHERE o.numer_zamowienia LIKE ? ORDER BY o.data_utworzenia DESC LIMIT 10`,
    [searchPattern],
    (err, orderRows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!orderRows || orderRows.length === 0) {
      console.log(`❌ No orders found matching pattern: ${searchPattern}`);
      return res.json([]);
    }
    
    console.log(`✅ Found ${orderRows.length} orders matching pattern: ${searchPattern}`);
    
    // Для каждого заказа получаем продукты
    let ordersProcessed = 0;
    const ordersWithProducts = [];
    
    orderRows.forEach((order) => {
      const resolvedOrder = withResolvedOrderKlient(order);
      db.all('SELECT * FROM order_products WHERE orderId = ? ORDER BY id', [resolvedOrder.id], (err, productRows) => {
        if (err) {
          console.error(`❌ Error fetching products for order ${resolvedOrder.id}:`, err);
          ordersWithProducts.push({
            id: resolvedOrder.id,
            numer_zamowienia: resolvedOrder.numer_zamowienia,
            klient: resolvedOrder.klient,
            client_id: resolvedOrder.client_id || null,
            klient_firma: '',
            klient_adres: '',
            klient_kontakt: '',
            data_utworzenia: resolvedOrder.data_utworzenia,
            products: []
          });
        } else {
          attachReservationAmountsToProducts(resolvedOrder.id, productRows || [], (attachErr, productsWithReservation) => {
            ordersWithProducts.push({
              id: resolvedOrder.id,
              numer_zamowienia: resolvedOrder.numer_zamowienia,
              klient: resolvedOrder.klient,
              client_id: resolvedOrder.client_id || null,
              klient_firma: '',
              klient_adres: '',
              klient_kontakt: '',
              data_utworzenia: resolvedOrder.data_utworzenia,
              products: attachErr ? (productRows || []) : productsWithReservation
            });

            ordersProcessed++;
            if (ordersProcessed === orderRows.length) {
              console.log(`✅ All ${ordersProcessed} orders processed with products`);
              res.json(ordersWithProducts);
            }
          });
          return;
        }
        
        ordersProcessed++;
        
        // Когда все заказы обработаны, отправляем ответ
        if (ordersProcessed === orderRows.length) {
          console.log(`✅ All ${ordersProcessed} orders processed with products`);
          res.json(ordersWithProducts);
        }
      });
    });
  });
});

// PDF Generation API для отчёта по остаткам
async function generateInventoryReportPDF(items, res) {
  try {
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    const fs = await import('fs');
    const path = await import('path');
    
    // Регистрируем fontkit для поддержки пользовательских шрифтов
    let fontkit;
    try {
      fontkit = require('@pdf-lib/fontkit');
    } catch (fkErr) {
      try {
        fontkit = (await import('@pdf-lib/fontkit')).default;
      } catch {
        fontkit = null;
      }
    }
    
    // Создаем новый PDF документ
    const pdfDoc = await PDFDocument.create();
    
    if (fontkit) {
      pdfDoc.registerFontkit(fontkit);
    }
    
    let currentPage = pdfDoc.addPage([792, 1224]); // Таблоид формат (11" × 17" = 792 × 1224 точек)
    
    // Получаем стандартные шрифты
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Встраиваем пользовательский шрифт с поддержкой Unicode
    let soraFont;
    try {
      const soraPath = path.join(__dirname, 'fonts', 'Sora-Regular.ttf');
      const soraBytes = fs.readFileSync(soraPath);
      soraFont = await pdfDoc.embedFont(soraBytes, { subset: false });
    } catch (fontErr) {
      soraFont = helveticaFont;
    }
    
    const { width, height } = currentPage.getSize();
    const margin = 50;
    let yPosition = height - margin;
    
    // Цвета
    const colors = {
      text: rgb(0.22, 0.22, 0.22),
      textDark: rgb(0.12, 0.12, 0.12),
      border: rgb(0.82, 0.82, 0.82),
    };
    
    // Цвета и метки для типов товаров (соответствуют TYPY_TOWARU из фронтенда)
    const typConfigs = {
      'czerwone': { label: 'Czerwone', bg: rgb(0.996, 0.886, 0.886), text: rgb(0.6, 0.106, 0.106), border: rgb(0.996, 0.792, 0.792) },
      'biale': { label: 'Białe', bg: rgb(0.953, 0.957, 0.969), text: rgb(0.122, 0.161, 0.216), border: rgb(0.898, 0.906, 0.922) },
      'musujace': { label: 'Musujące', bg: rgb(1.0, 0.984, 0.922), text: rgb(0.792, 0.541, 0.016), border: rgb(0.996, 0.953, 0.780) },
      'bezalkoholowe': { label: 'Bezalkoholowe', bg: rgb(0.863, 0.988, 0.906), text: rgb(0.086, 0.396, 0.204), border: rgb(0.733, 0.969, 0.816) },
      'ferment': { label: 'Ferment', bg: rgb(1.0, 0.929, 0.835), text: rgb(0.604, 0.204, 0.071), border: rgb(0.996, 0.843, 0.667) },
      'rozowe': { label: 'Różowe', bg: rgb(0.988, 0.906, 0.953), text: rgb(0.616, 0.090, 0.302), border: rgb(0.984, 0.812, 0.910) },
      'slodkie': { label: 'Słodkie', bg: rgb(0.953, 0.910, 1.0), text: rgb(0.420, 0.129, 0.659), border: rgb(0.914, 0.835, 1.0) },
      'aksesoria': { label: 'Aksesoria', bg: rgb(0.878, 0.906, 1.0), text: rgb(0.216, 0.188, 0.639), border: rgb(0.780, 0.824, 0.996) },
      'amber': { label: 'Amber', bg: rgb(0.996, 0.953, 0.780), text: rgb(0.573, 0.251, 0.055), border: rgb(0.992, 0.902, 0.541) }
    };
    
    // Функция для получения конфигурации типа
    const getTypConfig = (typ) => {
      return typConfigs[typ] || { label: typ || '-', bg: rgb(0.953, 0.957, 0.969), text: rgb(0.122, 0.161, 0.216), border: rgb(0.898, 0.906, 0.922) };
    };
    
    // Заголовок
    currentPage.drawText('Raport stanów magazynowych', {
      x: margin,
      y: yPosition,
      size: 19,
      font: soraFont,
      color: colors.textDark,
    });
    yPosition -= 40;
    
    // Дата генерации (день, месяц, год)
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${day}.${month}.${year}`;
    currentPage.drawText(dateStr, {
      x: margin,
      y: yPosition,
      size: 9,
      font: soraFont,
      color: colors.text,
    });
    yPosition -= 30;
    
    // Заголовки таблицы
    const tableStartY = yPosition;
    const colWidths = {
      nazwa: 300,
      sprzedawca: 150,
      objetosc: 60,
      typ: 100,
      ilosc: 35
    };
    const colX = {
      nazwa: margin,
      sprzedawca: margin + colWidths.nazwa,
      objetosc: margin + colWidths.nazwa + colWidths.sprzedawca,
      typ: margin + colWidths.nazwa + colWidths.sprzedawca + colWidths.objetosc,
      ilosc: margin + colWidths.nazwa + colWidths.sprzedawca + colWidths.objetosc + colWidths.typ
    };
    
    // Рисуем заголовки (soraFont для поддержки польских символов)
    currentPage.drawText('Nazwa', {
      x: colX.nazwa,
      y: yPosition,
      size: 9,
      font: soraFont,
      color: colors.textDark,
    });
    currentPage.drawText('Sprzedawca', {
      x: colX.sprzedawca,
      y: yPosition,
      size: 9,
      font: soraFont,
      color: colors.textDark,
    });
    currentPage.drawText('Objętość', {
      x: colX.objetosc,
      y: yPosition,
      size: 9,
      font: soraFont,
      color: colors.textDark,
    });
    currentPage.drawText('Typ', {
      x: colX.typ,
      y: yPosition,
      size: 9,
      font: soraFont,
      color: colors.textDark,
    });
    currentPage.drawText('Ilość', {
      x: colX.ilosc,
      y: yPosition,
      size: 9,
      font: soraFont,
      color: colors.textDark,
    });
    
    // Линия под заголовками
    yPosition -= 5;
    const tableTopY = yPosition;
    const tableLeftX = margin;
    const tableRightX = width - margin;
    
    // Верхняя линия таблицы
    currentPage.drawLine({
      start: { x: tableLeftX, y: yPosition },
      end: { x: tableRightX, y: yPosition },
      thickness: 1,
      color: colors.border,
    });
    
    // Боковые линии таблицы на первой странице (будут перерисованы до нижней линии в конце)
    currentPage.drawLine({
      start: { x: tableLeftX, y: tableTopY },
      end: { x: tableLeftX, y: tableTopY - 1000 },
      thickness: 1,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: tableRightX, y: tableTopY },
      end: { x: tableRightX, y: tableTopY - 1000 },
      thickness: 1,
      color: colors.border,
    });
    
    // Вертикальные линии между колонками
    currentPage.drawLine({
      start: { x: colX.sprzedawca, y: tableTopY },
      end: { x: colX.sprzedawca, y: tableTopY - 1000 }, // Достаточно длинная линия
      thickness: 0.5,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: colX.objetosc, y: tableTopY },
      end: { x: colX.objetosc, y: tableTopY - 1000 },
      thickness: 0.5,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: colX.typ, y: tableTopY },
      end: { x: colX.typ, y: tableTopY - 1000 },
      thickness: 0.5,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: colX.ilosc, y: tableTopY },
      end: { x: colX.ilosc, y: tableTopY - 1000 },
      thickness: 0.5,
      color: colors.border,
    });
    
    yPosition -= 15;
    
    // Данные
    const rowHeight = 15;
    const minY = margin + 50;
    
    // Функция для разбиения текста на строки по ширине колонки
    const wrapText = (text, maxWidth, fontSize, font) => {
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';
      
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);
        
        if (testWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            // Если одно слово длиннее ширины, разбиваем его по символам
            let wordLine = '';
            for (const char of word) {
              const testCharLine = wordLine + char;
              const testCharWidth = font.widthOfTextAtSize(testCharLine, fontSize);
              if (testCharWidth <= maxWidth) {
                wordLine = testCharLine;
              } else {
                if (wordLine) lines.push(wordLine);
                wordLine = char;
              }
            }
            if (wordLine) currentLine = wordLine;
          }
        }
      }
      
      if (currentLine) {
        lines.push(currentLine);
      }
      
      return lines.length > 0 ? lines : [''];
    };
    
    // Отслеживаем границы таблицы на каждой странице
    let pageBottomY = null;
    let pageTopY = tableTopY; // Верхняя граница таблицы на текущей странице
    
    items.forEach((item, index) => {
      // Данные строки
      const nazwaText = item.nazwa || '';
      const sprzedawca = (item.sprzedawca || '').substring(0, 15);
      const ilosc = String(item.ilosc || 0);
      const typConfig = getTypConfig(item.typ);
      const typLabel = typConfig.label || '-';
      const objetosc = item.objetosc ? `${item.objetosc} l` : '-';
      
      // Разбиваем nazwa на строки по ширине колонки (с учетом отступа)
      const nazwaMaxWidth = colWidths.nazwa - 4; // -4 для отступов
      const nazwaLines = wrapText(nazwaText, nazwaMaxWidth, 8, soraFont);
      const nazwaRowHeight = Math.max(rowHeight, nazwaLines.length * 12); // Минимум 12 точек на строку
      
      // Проверяем, нужна ли новая страница с учетом высоты строки
      if (yPosition - nazwaRowHeight < minY) {
        // Перерисовываем вертикальные линии до нижней границы на текущей странице
        if (pageBottomY !== null) {
          // Используем сохраненную верхнюю границу таблицы на этой странице
          currentPage.drawLine({
            start: { x: colX.sprzedawca, y: pageTopY },
            end: { x: colX.sprzedawca, y: pageBottomY },
            thickness: 0.5,
            color: colors.border,
          });
          currentPage.drawLine({
            start: { x: colX.objetosc, y: pageTopY },
            end: { x: colX.objetosc, y: pageBottomY },
            thickness: 0.5,
            color: colors.border,
          });
          currentPage.drawLine({
            start: { x: colX.typ, y: pageTopY },
            end: { x: colX.typ, y: pageBottomY },
            thickness: 0.5,
            color: colors.border,
          });
          currentPage.drawLine({
            start: { x: colX.ilosc, y: pageTopY },
            end: { x: colX.ilosc, y: pageBottomY },
            thickness: 0.5,
            color: colors.border,
          });
          // Боковые линии
          currentPage.drawLine({
            start: { x: tableLeftX, y: pageTopY },
            end: { x: tableLeftX, y: pageBottomY },
            thickness: 1,
            color: colors.border,
          });
          currentPage.drawLine({
            start: { x: tableRightX, y: pageTopY },
            end: { x: tableRightX, y: pageBottomY },
            thickness: 1,
            color: colors.border,
          });
          // Нижняя линия таблицы на этой странице
          currentPage.drawLine({
            start: { x: tableLeftX, y: pageBottomY },
            end: { x: tableRightX, y: pageBottomY },
            thickness: 1,
            color: colors.border,
          });
        }
        
        currentPage = pdfDoc.addPage([792, 1224]); // Таблоид формат
        yPosition = height - margin;
        pageBottomY = null; // Сбрасываем для новой страницы
        
        // Повторяем заголовки на новой странице (жирным шрифтом)
        const newTableTopY = yPosition;
        pageTopY = yPosition - 5; // Сохраняем верхнюю границу таблицы на новой странице
          currentPage.drawText('Nazwa', {
            x: colX.nazwa + 2,
            y: yPosition,
            size: 9,
            font: soraFont,
            color: colors.textDark,
          });
          currentPage.drawText('Sprzedawca', {
            x: colX.sprzedawca + 2,
            y: yPosition,
            size: 9,
            font: soraFont,
            color: colors.textDark,
          });
          currentPage.drawText('Objętość', {
            x: colX.objetosc + 2,
            y: yPosition,
            size: 9,
            font: soraFont,
            color: colors.textDark,
          });
          currentPage.drawText('Typ', {
            x: colX.typ + 2,
            y: yPosition,
            size: 9,
            font: soraFont,
            color: colors.textDark,
          });
          currentPage.drawText('Ilość', {
            x: colX.ilosc + 2,
            y: yPosition,
            size: 9,
            font: soraFont,
            color: colors.textDark,
          });
        
        // Линия под заголовками (как на первой странице)
        yPosition -= 5;
        const newTableTopYForLines = yPosition;
        pageTopY = newTableTopYForLines; // Обновляем верхнюю границу таблицы
        
        // Верхняя линия таблицы на новой странице
        currentPage.drawLine({
          start: { x: tableLeftX, y: newTableTopYForLines },
          end: { x: tableRightX, y: newTableTopYForLines },
          thickness: 1,
          color: colors.border,
        });
        
        // Вертикальные линии между колонками на новой странице (будут перерисованы до нижней границы в конце)
        currentPage.drawLine({
          start: { x: colX.sprzedawca, y: newTableTopYForLines },
          end: { x: colX.sprzedawca, y: newTableTopYForLines - 1000 },
          thickness: 0.5,
          color: colors.border,
        });
        currentPage.drawLine({
          start: { x: colX.objetosc, y: newTableTopYForLines },
          end: { x: colX.objetosc, y: newTableTopYForLines - 1000 },
          thickness: 0.5,
          color: colors.border,
        });
        currentPage.drawLine({
          start: { x: colX.typ, y: newTableTopYForLines },
          end: { x: colX.typ, y: newTableTopYForLines - 1000 },
          thickness: 0.5,
          color: colors.border,
        });
        currentPage.drawLine({
          start: { x: colX.ilosc, y: newTableTopYForLines },
          end: { x: colX.ilosc, y: newTableTopYForLines - 1000 },
          thickness: 0.5,
          color: colors.border,
        });
        
        // Боковые линии таблицы на новой странице (будут перерисованы до нижней границы в конце)
        currentPage.drawLine({
          start: { x: tableLeftX, y: newTableTopYForLines },
          end: { x: tableLeftX, y: newTableTopYForLines - 1000 },
          thickness: 1,
          color: colors.border,
        });
        currentPage.drawLine({
          start: { x: tableRightX, y: newTableTopYForLines },
          end: { x: tableRightX, y: newTableTopYForLines - 1000 },
          thickness: 1,
          color: colors.border,
        });
        
        // Устанавливаем yPosition для первой строки данных (как на первой странице)
        yPosition -= 15;
      }
      
      // Рисуем горизонтальную линию между строками (верхняя граница ячейки)
      const lineY = yPosition;
      currentPage.drawLine({
        start: { x: tableLeftX, y: lineY },
        end: { x: tableRightX, y: lineY },
        thickness: 0.5,
        color: colors.border,
      });
      
      // Рисуем nazwa на нескольких строках, если нужно
      // Вычисляем начальную позицию текста так, чтобы весь блок текста был центрирован в ячейке
      // Высота всего блока текста = nazwaLines.length * 12
      const totalTextHeight = nazwaLines.length * 12;
      const textStartY = yPosition - (nazwaRowHeight - totalTextHeight) / 2 - 8; // -8 для базовой линии текста
      
      nazwaLines.forEach((line, lineIndex) => {
        currentPage.drawText(line, {
          x: colX.nazwa + 2,
          y: textStartY - (lineIndex * 12),
          size: 8,
          font: soraFont,
          color: colors.text,
        });
      });
      
      // Вычисляем вертикальный центр для других колонок (если nazwa занимает несколько строк)
      // Центр должен быть в середине ячейки, которая имеет высоту nazwaRowHeight
      const centerY = yPosition - nazwaRowHeight / 2;
      
      // Рисуем текст typ без цветного фона
      if (item.typ) {
        // Центрируем текст по горизонтали и вертикали в ячейке
        const fontSize = 8;
        const typTextWidth = soraFont.widthOfTextAtSize(typLabel, fontSize);
        const typCellWidth = colX.ilosc - colX.typ;
        const typTextX = colX.typ + (typCellWidth - typTextWidth) / 2;
        
        currentPage.drawText(typLabel, {
          x: typTextX,
          y: centerY,
          size: fontSize,
          font: soraFont,
          color: colors.text,
        });
      } else {
        // Если нет типа, просто рисуем "-"
        currentPage.drawText('-', {
          x: colX.typ + 2,
          y: centerY,
          size: 8,
          font: soraFont,
          color: colors.text,
        });
      }
      
      currentPage.drawText(sprzedawca, {
        x: colX.sprzedawca + 2,
        y: centerY,
        size: 8,
        font: soraFont,
        color: colors.text,
      });
      
      // Центрируем objetosc по горизонтали и вертикали
      const objetoscTextWidth = soraFont.widthOfTextAtSize(objetosc, 8);
      const objetoscTextX = colX.objetosc + (colWidths.objetosc - objetoscTextWidth) / 2;
      
      currentPage.drawText(objetosc, {
        x: objetoscTextX,
        y: centerY,
        size: 8,
        font: soraFont,
        color: colors.text,
      });
      
      // Центрируем ilosc по горизонтали и вертикали
      const iloscTextWidth = soraFont.widthOfTextAtSize(ilosc, 8);
      const iloscTextX = colX.ilosc + (colWidths.ilosc - iloscTextWidth) / 2;
      
      currentPage.drawText(ilosc, {
        x: iloscTextX,
        y: centerY,
        size: 8,
        font: soraFont,
        color: colors.text,
      });
      
      yPosition -= nazwaRowHeight;
      // Обновляем нижнюю границу таблицы на текущей странице
      pageBottomY = yPosition;
    });
    
    // Итого - нижняя линия таблицы
    yPosition -= 10;
    const tableBottomY = yPosition;
    // Обновляем нижнюю границу для последней страницы
    pageBottomY = tableBottomY;
    currentPage.drawLine({
      start: { x: tableLeftX, y: yPosition },
      end: { x: tableRightX, y: yPosition },
      thickness: 1,
      color: colors.border,
    });
    
    // Перерисовываем вертикальные линии между колонками до нижней линии таблицы на последней странице
    // Используем сохраненную верхнюю границу таблицы на этой странице
    const finalPageTopY = pageTopY || tableTopY;
    currentPage.drawLine({
      start: { x: colX.sprzedawca, y: finalPageTopY },
      end: { x: colX.sprzedawca, y: tableBottomY },
      thickness: 0.5,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: colX.objetosc, y: finalPageTopY },
      end: { x: colX.objetosc, y: tableBottomY },
      thickness: 0.5,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: colX.typ, y: finalPageTopY },
      end: { x: colX.typ, y: tableBottomY },
      thickness: 0.5,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: colX.ilosc, y: finalPageTopY },
      end: { x: colX.ilosc, y: tableBottomY },
      thickness: 0.5,
      color: colors.border,
    });
    
    // Боковые линии таблицы (левая и правая) - перерисовываем до нижней линии
    currentPage.drawLine({
      start: { x: tableLeftX, y: finalPageTopY },
      end: { x: tableLeftX, y: tableBottomY },
      thickness: 1,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: tableRightX, y: finalPageTopY },
      end: { x: tableRightX, y: tableBottomY },
      thickness: 1,
      color: colors.border,
    });
    
    // Скрываем продолжение вертикальных линий после последней горизонтальной линии
    // Рисуем белые линии поверх старых длинных линий
    const white = rgb(1, 1, 1);
    const hideLineLength = 100; // Достаточно длинная линия, чтобы скрыть продолжение
    currentPage.drawLine({
      start: { x: colX.sprzedawca, y: tableBottomY },
      end: { x: colX.sprzedawca, y: tableBottomY - hideLineLength },
      thickness: 0.5,
      color: white,
    });
    currentPage.drawLine({
      start: { x: colX.objetosc, y: tableBottomY },
      end: { x: colX.objetosc, y: tableBottomY - hideLineLength },
      thickness: 0.5,
      color: white,
    });
    currentPage.drawLine({
      start: { x: colX.typ, y: tableBottomY },
      end: { x: colX.typ, y: tableBottomY - hideLineLength },
      thickness: 0.5,
      color: white,
    });
    currentPage.drawLine({
      start: { x: colX.ilosc, y: tableBottomY },
      end: { x: colX.ilosc, y: tableBottomY - hideLineLength },
      thickness: 0.5,
      color: white,
    });
    currentPage.drawLine({
      start: { x: tableLeftX, y: tableBottomY },
      end: { x: tableLeftX, y: tableBottomY - hideLineLength },
      thickness: 1,
      color: white,
    });
    currentPage.drawLine({
      start: { x: tableRightX, y: tableBottomY },
      end: { x: tableRightX, y: tableBottomY - hideLineLength },
      thickness: 1,
      color: white,
    });
    
    
    const pdfBytes = await pdfDoc.save();
    const filenameDay = String(now.getDate()).padStart(2, '0');
    const filenameMonth = String(now.getMonth() + 1).padStart(2, '0');
    const filenameDate = `${filenameDay}-${filenameMonth}`; // DD-MM
    const filename = `stany_${filenameDate}.pdf`;
    
    if (res.headersSent) {
      console.error('Response already sent, cannot send PDF');
      return;
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Error generating inventory report PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF' });
    }
  }
}

const inventoryReportOrderClause = `
       ORDER BY sprzedawca, 
         CASE typ
           WHEN 'czerwone' THEN 1
           WHEN 'biale' THEN 2
           WHEN 'musujace' THEN 3
           WHEN 'rozowe' THEN 4
           WHEN 'ferment' THEN 5
           WHEN 'bezalkoholowe' THEN 6
           WHEN 'slodkie' THEN 7
           WHEN 'amber' THEN 8
           ELSE 9
         END,
         ilosc DESC,
         nazwa`;

app.get('/api/inventory/report/pdf', async (req, res) => {
  console.log('📊 GET /api/inventory/report/pdf - Generating inventory report');
  
  try {
    // Получаем данные из working_sheets с фильтрами: ilosc > 0 и typ != 'aksesoria'
    db.all(
      `SELECT nazwa, sprzedawca, ilosc, typ, objetosc 
       FROM working_sheets 
       WHERE ilosc > 0 
         AND (typ IS NULL OR typ != 'aksesoria')
       ${inventoryReportOrderClause}`,
      [],
      async (err, rows) => {
        if (err) {
          console.error('❌ Database error:', err);
          return res.status(500).json({ error: err.message });
        }
        
        console.log(`✅ Found ${rows.length} items for report`);
        try {
          await generateInventoryReportPDF(rows || [], res);
        } catch (pdfError) {
          console.error('❌ Error generating PDF:', pdfError);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF' });
          }
        }
      }
    );
  } catch (error) {
    console.error('Error in inventory report generation:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Raport tylko dla zaznaczonych na stronie stanów (te same kolumny i filtry co GET)
app.post('/api/inventory/report/pdf', async (req, res) => {
  console.log('📊 POST /api/inventory/report/pdf - Generating inventory report (selected ids)');
  try {
    const rawIds = req.body?.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ error: 'ids (non-empty array) is required' });
    }
    const ids = [...new Set(
      rawIds
        .map((id) => parseInt(String(id), 10))
        .filter((n) => Number.isInteger(n) && n > 0)
    )];
    if (ids.length === 0) {
      return res.status(400).json({ error: 'No valid numeric ids' });
    }
    if (ids.length > 5000) {
      return res.status(400).json({ error: 'Too many ids' });
    }
    const placeholders = ids.map(() => '?').join(',');
    db.all(
      `SELECT nazwa, sprzedawca, ilosc, typ, objetosc 
       FROM working_sheets 
       WHERE ilosc > 0 
         AND (typ IS NULL OR typ != 'aksesoria')
         AND id IN (${placeholders})
       ${inventoryReportOrderClause}`,
      ids,
      async (err, rows) => {
        if (err) {
          console.error('❌ Database error:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Found ${rows.length} items for selected report`);
        if (!rows || rows.length === 0) {
          return res.status(404).json({
            error:
              'Żadna z zaznaczonych pozycji nie spełnia warunków raportu (ilość > 0, typ inny niż aksesoria).',
          });
        }
        try {
          await generateInventoryReportPDF(rows || [], res);
        } catch (pdfError) {
          console.error('❌ Error generating PDF:', pdfError);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF' });
          }
        }
      }
    );
  } catch (error) {
    console.error('Error in inventory report generation (POST):', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// PDF Generation API
app.get('/api/orders/:id/pdf', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Получаем данные заказа с продуктами
    const orderQuery = `
      SELECT o.*,
        COALESCE(c.nazwa, o.klient) AS client_name,
        c.firma, c.adres, c.kontakt, c.czas_dostawy
      FROM orders o
      LEFT JOIN clients c ON c.id = o.client_id
      WHERE o.id = ?
    `;
    
    const orderProductsQuery = `
      SELECT op.*, ws.kod_kreskowy
      FROM order_products op
      LEFT JOIN working_sheets ws ON op.kod = ws.kod
      WHERE op.orderId = ?
    `;
    
    db.get(orderQuery, [id], (err, order) => {
      if (err) {
        console.error('Error fetching order:', err);
        return res.status(500).json({ error: 'Failed to fetch order' });
      }
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      db.all(orderProductsQuery, [id], (err, products) => {
        if (err) {
          console.error('Error fetching order products:', err);
          return res.status(500).json({ error: 'Failed to fetch order products' });
        }
        
        // Генерируем PDF
        generateOrderPDF(order, products, res);
      });
    });
  } catch (error) {
    console.error('Error in PDF generation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/orders/next-number-only', (req, res) => {
  console.log('🔢 GET /api/orders/next-number-only - Generating next order number');

  db.all(
    `SELECT numer_zamowienia FROM orders WHERE COALESCE(typ, 'zamowienie') = 'zamowienie'`,
    (err, allRows) => {
      if (err) {
        console.error('❌ Error finding max order number:', err);
        return res.status(500).json({ error: err.message });
      }

      let maxNumber = 0;
      (allRows || []).forEach((row) => {
        const raw = String(row.numer_zamowienia || '').trim();
        const match = raw.match(/^(\d+)/);
        if (!match) return;
        const num = parseInt(match[1], 10);
        if (!Number.isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      });

      const nextNumber = maxNumber + 1;
      const numer_zamowienia_only = String(nextNumber);
      console.log(`✅ Generated next order number: ${numer_zamowienia_only} (max was: ${maxNumber})`);
      res.json({ numer_zamowienia: numer_zamowienia_only });
    }
  );
});

app.get('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📋 GET /api/orders/${id} - Fetching order by ID`);
  
  // Получаем основную информацию о заказе
  db.get(
    `SELECT o.*, COALESCE(c.nazwa, o.klient) AS klient_resolved ${ORDER_WITH_CLIENT_JOIN} WHERE o.id = ?`,
    [id],
    (err, orderRow) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    if (!orderRow) {
      console.log(`❌ Order with ID ${id} not found`);
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const resolvedOrder = withResolvedOrderKlient(orderRow);
    console.log(`✅ Found order: ${resolvedOrder.numer_zamowienia}`);
    
    // Теперь получаем продукты для этого заказа
    db.all('SELECT * FROM order_products WHERE orderId = ? ORDER BY id', [id], (err, productRows) => {
      if (err) {
        console.error('❌ Database error fetching products:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      attachReservationAmountsToProducts(id, productRows || [], (attachErr, productsWithReservation) => {
        if (attachErr) {
          console.error('❌ Database error fetching reservation fulfillments:', attachErr);
          res.status(500).json({ error: attachErr.message });
          return;
        }

        console.log(`✅ Found ${productsWithReservation.length} products for order ${id}`);
        
        const orderWithProducts = {
          ...resolvedOrder,
          products: productsWithReservation
        };
        
        res.json(orderWithProducts);
      });
    });
  });
});

app.post('/api/orders', (req, res) => {
  const { client_id, clientName, order_number, products } = req.body;
  console.log('📋 POST /api/orders - Creating new order:', { client_id, clientName, order_number, productsCount: products?.length || 0 });
  
  if (!order_number) {
    console.log('❌ Validation failed: order_number is required');
    return res.status(400).json({ error: 'Order number is required' });
  }
  
  if (!products || !Array.isArray(products) || products.length === 0) {
    console.log('❌ Validation failed: products array is required and must not be empty');
    return res.status(400).json({ error: 'Products array is required and must not be empty' });
  }
  
  // Вычисляем общее количество всех продуктов
  const laczna_ilosc = products.reduce((total, product) => total + (product.ilosc || 0), 0);
  
  resolveOrderClientFromBody({ client_id, clientName }, (lookupErr, clientResult) => {
    if (lookupErr) {
      console.error('❌ Database error finding client:', lookupErr);
      return res.status(500).json({ error: lookupErr.message });
    }
    if (clientResult?.error) {
      return res.status(clientResult.status || 400).json({ error: clientResult.error });
    }

    const { clientId, klientName } = clientResult;
    console.log(`🔍 Resolved client_id ${clientId} -> "${klientName}"`);
  
  // Проверяем доступность товаров перед созданием заказа
  console.log('🔍 Checking product availability...');
  
  // Группируем товары по коду и суммируем количество для корректной проверки
  // Это предотвращает проблему, когда один товар добавлен несколько раз в заказ
  const productGroups = new Map();
  products.forEach(product => {
    const { kod, nazwa, ilosc } = product;
    if (productGroups.has(kod)) {
      const existing = productGroups.get(kod);
      existing.totalIlosc += ilosc;
      existing.items.push(product);
    } else {
      productGroups.set(kod, {
        kod,
        nazwa,
        totalIlosc: ilosc,
        items: [product]
      });
    }
  });
  
  console.log(`📊 Grouped products: ${productGroups.size} unique products from ${products.length} order items`);
  productGroups.forEach((group, kod) => {
    console.log(`  - ${kod}: ${group.totalIlosc} szt. (${group.items.length} order item(s))`);
  });
  
  // Создаем массив для проверки доступности сгруппированных товаров
  const availabilityChecks = Array.from(productGroups.values()).map(group => {
    return new Promise((resolve, reject) => {
      const { kod, nazwa, totalIlosc } = group;
      
        // Проверяем доступное количество с учетом активных резерваций (используя ilosc - ilosc_wydane)
        db.get(`
          SELECT 
            ws.ilosc as total_available,
            COALESCE(SUM(CASE 
              WHEN r.status = 'aktywna' 
              THEN rp.ilosc - COALESCE(rp.ilosc_wydane, 0)
              ELSE 0 
            END), 0) as reserved
          FROM working_sheets ws
          LEFT JOIN reservation_products rp ON ws.kod = rp.product_kod
          LEFT JOIN reservations r ON rp.reservation_id = r.id
          WHERE ws.kod = ?
          GROUP BY ws.kod, ws.ilosc
        `, [kod], (err, row) => {
        if (err) {
          reject({ kod, error: err.message });
            return;
          }
          
          if (!row) {
          reject({ kod, nazwa, ilosc: totalIlosc, available: 0, error: 'Product not found in working_sheets' });
            return;
          }
          
          const availableOnWarehouse = row.total_available - row.reserved;
          
          // Если у клиента есть резервация, проверяем её
          if (clientId) {
            db.get(`
              SELECT 
                SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as available_in_reservation
              FROM reservation_products rp
              INNER JOIN reservations r ON rp.reservation_id = r.id
              WHERE rp.product_kod = ? 
                AND r.client_id = ? 
                AND r.status = 'aktywna'
            `, [kod, clientId], (err, reservationRow) => {
              if (err) {
                reject({ kod, error: err.message });
                return;
              }
              
              const availableInReservation = reservationRow ? (reservationRow.available_in_reservation || 0) : 0;
              const maxOrderable = availableOnWarehouse + availableInReservation;
              
              if (availableInReservation > 0) {
                if (totalIlosc > maxOrderable) {
                  console.log(`❌ Insufficient stock for ${kod}: requested ${totalIlosc}, max available ${maxOrderable} (reservation: ${availableInReservation}, warehouse: ${availableOnWarehouse})`);
                  reject({
                    kod,
                    nazwa,
                    ilosc: totalIlosc,
                    available: maxOrderable,
                    error: 'Insufficient quantity',
                    message: `Insufficient quantity for product ${kod}. Available: ${maxOrderable}, Requested: ${totalIlosc}`
                  });
                  return;
                }
                resolve({ 
                  kod, 
                  nazwa, 
                  ilosc: totalIlosc, 
                  available: availableInReservation,
                  fromReservation: true,
                  availableOnWarehouse: availableOnWarehouse
                });
        } else {
                // У клиента нет резервации - проверяем доступное на складе
                if (availableOnWarehouse < totalIlosc) {
                  reject({ kod, nazwa, ilosc: totalIlosc, available: availableOnWarehouse, error: 'Insufficient quantity' });
                } else {
                  resolve({ kod, nazwa, ilosc: totalIlosc, available: availableOnWarehouse, fromReservation: false });
                }
              }
            });
          } else {
            // Клиент не найден - проверяем доступное на складе
            if (availableOnWarehouse < totalIlosc) {
              reject({ kod, nazwa, ilosc: totalIlosc, available: availableOnWarehouse, error: 'Insufficient quantity' });
            } else {
              resolve({ kod, nazwa, ilosc: totalIlosc, available: availableOnWarehouse, fromReservation: false });
            }
        }
      });
    });
  });
  
  // Выполняем все проверки
  Promise.all(availabilityChecks)
    .then((results) => {
      console.log('✅ All products are available');
      
      // Создаем заказ
      db.run(
        'INSERT INTO orders (client_id, klient, numer_zamowienia, laczna_ilosc) VALUES (?, ?, ?, ?)',
        [clientId, klientName, order_number, laczna_ilosc],
        function(err) {
          if (err) {
            console.error('❌ Database error creating order:', err);
            res.status(500).json({ error: err.message });
            return;
          }
          
          const orderId = this.lastID;
          console.log(`✅ Order created with ID: ${orderId}`);
          
          const remainingReservationByKod = new Map();
          results.forEach((r) => {
            if (r.fromReservation) {
              remainingReservationByKod.set(r.kod, r.available || 0);
            }
          });
          
          // Создаем записи для каждого продукта и обновляем working_sheets
          let productsCreated = 0;
          let productsFailed = 0;
          let workingSheetsUpdated = 0;
          
          products.forEach((product, index) => {
            const { kod, nazwa, ilosc, typ, kod_kreskowy } = product;
            
            const availabilityInfo = results.find(r => r.kod === kod);
            const fromReservation = availabilityInfo?.fromReservation || false;
            const availableOnWarehouse = availabilityInfo?.availableOnWarehouse || 0;
            
            let quantityFromWarehouse = 0;
            let quantityFromReservation = 0;
            
            if (fromReservation) {
              const remainingInReservation = remainingReservationByKod.get(kod) || 0;
              quantityFromReservation = Math.min(remainingInReservation, ilosc);
              remainingReservationByKod.set(kod, remainingInReservation - quantityFromReservation);
              quantityFromWarehouse = ilosc - quantityFromReservation;
            } else {
              // Товар полностью со склада
              quantityFromWarehouse = ilosc;
              quantityFromReservation = 0;
            }
            
            // Сначала создаем запись в order_products
            console.log(`📝 Creating order_products record for: ${kod} (orderId: ${orderId}, fromWarehouse: ${quantityFromWarehouse}, fromReservation: ${quantityFromReservation})`);
            db.run(
              'INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ, kod_kreskowy) VALUES (?, ?, ?, ?, ?, ?)',
              [orderId, kod, nazwa, ilosc, typ || 'sprzedaz', kod_kreskowy || null],
              function(err) {
                if (err) {
                  console.error(`❌ Error creating product ${index + 1}:`, err);
                  console.error(`❌ Error details:`, err.message);
                  productsFailed++;
                  checkCompletion();
                } else {
                  const orderProductId = this.lastID;
                  productsCreated++;
                  console.log(`✅ Product ${index + 1} created for order ${orderId} with ID: ${orderProductId}`);

                  // Синхронизация с таблицей komis
                  if ((typ || 'sprzedaz') === 'komis') {
                    syncKomisProduct(klientName, kod, nazwa, ilosc, clientId);
                  }
                  
                  // Функция для продолжения после обновления резерваций
                  const proceedWithFIFO = () => {
                        // Определяем статус: семпл или обычный — по суффиксу в названии
                        const itemStatus = (nazwa || '').includes('(samples)') ? 'samples' : null;
                        // Теперь списываем по FIFO из products с отслеживанием
                    // Списываем всё количество заказа (фактическая отгрузка)
                        consumeFromProducts(kod, ilosc, itemStatus)
                          .then(({ consumed, remaining, consumptions }) => {
                            console.log(`🎯 FIFO consumption for ${kod}: ${consumed} szt. consumed`);
                            // Записываем списания партий в order_consumptions
                            if (consumptions && consumptions.length > 0) {
                              const placeholders = consumptions.map(() => '(?, ?, ?, ?, ?)').join(', ');
                              const values = consumptions.flatMap(c => [orderId, kod, c.batchId, c.qty, c.cena || 0]);
                              db.run(
                                `INSERT INTO order_consumptions (order_id, product_kod, batch_id, quantity, batch_price) VALUES ${placeholders}`,
                                values,
                                (consErr) => {
                                  if (consErr) {
                                    console.error('❌ Error saving order_consumptions:', consErr);
                                  } else {
                                    console.log(`✅ Saved ${consumptions.length} consumption rows for order ${orderId}`);
                                  }
                      checkCompletion();
                                }
                              );
                            } else {
                              checkCompletion();
                            }
                          })
                          .catch((fifoError) => {
                            console.error(`❌ FIFO consumption error for ${kod}:`, fifoError);
                            checkCompletion();
                          });
                  };
                  
                  // Обновляем количество в working_sheets (всегда списываем ВСЁ количество заказа)
                  runWorkingSheetsDecrease(
                    kod,
                    ilosc,
                    { numerZamowienia: order_number },
                    function(updateErr) {
                      if (updateErr) {
                        console.error(`❌ Error updating working_sheets for product ${kod}:`, updateErr);
                        checkCompletion();
                      } else {
                        console.log(`✅ Updated working_sheets: ${kod} (quantity reduced by ${ilosc})`);
                        workingSheetsUpdated++;
                        
                        // Если товар берется из резервации, увеличиваем ilosc_wydane
                        if (quantityFromReservation > 0 && clientId) {
                          // Находим резервации клиента для этого товара и обновляем их
                          db.all(`
                            SELECT rp.id, rp.reservation_id, (rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as available
                            FROM reservation_products rp
                            INNER JOIN reservations r ON rp.reservation_id = r.id
                            WHERE rp.product_kod = ? 
                              AND r.client_id = ? 
                              AND r.status = 'aktywna'
                            ORDER BY r.data_utworzenia ASC
                          `, [kod, clientId], (err, reservationProducts) => {
                            if (err) {
                              console.error(`❌ Error fetching reservation products for ${kod}:`, err);
                              // Продолжаем выполнение даже при ошибке
                              proceedWithFIFO();
                            } else if (reservationProducts.length === 0) {
                              console.log(`⚠️ No reservation products found for ${kod} and client ${clientId}`);
                              proceedWithFIFO();
                            } else {
                              // Распределяем количество по резервациям (FIFO)
                              let remainingToFulfill = quantityFromReservation;
                              let reservationsUpdated = 0;
                              
                              reservationProducts.forEach((rp) => {
                                if (remainingToFulfill <= 0) return;
                                
                                const toFulfill = Math.min(remainingToFulfill, rp.available);
                                
                                db.run(
                                  'UPDATE reservation_products SET ilosc_wydane = COALESCE(ilosc_wydane, 0) + ? WHERE id = ?',
                                  [toFulfill, rp.id],
                                  function(updateErr) {
                                    if (updateErr) {
                                      console.error(`❌ Error updating reservation_product ${rp.id}:`, updateErr);
                                    } else {
                                      console.log(`✅ Updated reservation_product ${rp.id}: ilosc_wydane increased by ${toFulfill}`);
                                      
                                      // Записываем связь между резервацией и заказом
                                      db.run(
                                        'INSERT INTO reservation_order_fulfillments (reservation_product_id, order_id, order_product_id, quantity) VALUES (?, ?, ?, ?)',
                                        [rp.id, orderId, orderProductId, toFulfill],
                                        (fulfillErr) => {
                                          if (fulfillErr) {
                                            console.error(`❌ Error creating fulfillment record for reservation_product ${rp.id}:`, fulfillErr);
                                          } else {
                                            console.log(`✅ Created fulfillment record: reservation_product ${rp.id} -> order ${orderId}, quantity: ${toFulfill}`);
                                          }
                                        }
                                      );
                                      
                                      // Проверяем, полностью ли реализована резервация
                                      checkAndUpdateReservationStatus(rp.reservation_id);
                                    }
                                    
                                    reservationsUpdated++;
                                    remainingToFulfill -= toFulfill;
                                    
                                    if (reservationsUpdated === reservationProducts.length) {
                                      proceedWithFIFO();
                                    }
                                  }
                                );
                              });
                            }
                          });
                        } else {
                          proceedWithFIFO();
                        }
                      }
                    }
                  );
                }
              }
            );
          });
          
          function checkCompletion() {
            if (productsCreated + productsFailed === products.length) {
              if (res.headersSent) {
                console.log('⚠️ Response already sent, skipping checkCompletion');
                return;
              }
              
              if (productsFailed === 0) {
                console.log(`✅ All ${productsCreated} products created successfully for order ${orderId}`);
                console.log(`📊 Working sheets updated: ${workingSheetsUpdated} products`);
                res.json({ 
                  id: orderId, 
                  message: 'Order and all products added successfully',
                  productsCreated: productsCreated,
                  workingSheetsUpdated: workingSheetsUpdated,
                  success: true,
                  shouldClearForm: true
                });
              } else {
                console.log(`⚠️ Order created but ${productsFailed} products failed to create`);
                res.json({ 
                  id: orderId, 
                  message: `Order created but ${productsFailed} products failed to create`,
                  productsCreated: productsCreated,
                  productsFailed: productsFailed,
                  workingSheetsUpdated: workingSheetsUpdated,
                  success: false,
                  shouldClearForm: false
                });
              }
            }
          }
        }
      );
    })
    .catch((errors) => {
      // Обрабатываем ошибки доступности
      console.log('❌ Product availability check failed');
      
      if (Array.isArray(errors)) {
        // Если несколько ошибок, берем первую
        errors = errors[0];
      }
      
      const { kod, nazwa, ilosc, available, error, message: customMessage } = errors;
      
      if (error === 'Insufficient quantity') {
        console.log(`❌ Insufficient quantity for product ${kod} (${nazwa}): requested ${ilosc}, available ${available}`);
        res.status(400).json({ 
          error: 'Insufficient product quantity',
          details: {
            kod,
            nazwa,
            requested: ilosc,
            available: available,
            message: customMessage || `Niewystarczająca ilość produktu "${nazwa}" (kod: ${kod}). Zamówiono: ${ilosc}, dostępne: ${available}`
          }
        });
      } else if (error === 'Product not found in working_sheets') {
        console.log(`❌ Product ${kod} (${nazwa}) not found in working_sheets`);
        res.status(400).json({ 
          error: 'Product not found',
          details: {
            kod,
            nazwa,
            message: `Produkt "${nazwa}" (kod: ${kod}) nie został znaleziony w systemie`
          }
        });
      } else {
        console.log(`❌ Database error checking availability for product ${kod}:`, error);
        res.status(500).json({ 
          error: 'Database error during availability check',
          details: {
            kod,
            message: `Błąd bazy danych podczas sprawdzania dostępności produktu ${kod}`
          }
        });
      }
    });
});

// Хелпер: получить следующий номер резервации (глобально, вне зависимости от даты)
function getNextReservationNumber(dateString, callback) {
  if (!dateString) {
    return callback(new Error('Date parameter is required'));
  }

  const [year, month, day] = dateString.split('-');

  // Получаем все номера резерваций для поиска максимального номера
  db.all('SELECT numer_rezerwacji FROM reservations WHERE numer_rezerwacji LIKE ?', ['R%'], (err, allRows) => {
    if (err) return callback(err);
    
    // Извлекаем числовую часть из каждого номера и находим максимум
    let maxNumber = 0;
    const numbers = [];
    allRows.forEach(row => {
      const match = row.numer_rezerwacji.match(/^R(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        numbers.push(num);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    });
    
    console.log(`📊 Reservation numbers analysis: found ${allRows.length} reservations, numbers: [${numbers.sort((a,b) => a-b).join(', ')}], max: ${maxNumber}`);
    
    const nextNumber = maxNumber + 1;
    const numer_rezerwacji = `R${nextNumber.toString().padStart(3, '0')}_${day}_${month}_${year}`;
    console.log(`✅ Generated next reservation number: ${numer_rezerwacji} (sequence: ${nextNumber}, date: ${day}/${month}/${year})`);
    
    callback(null, numer_rezerwacji, maxNumber, nextNumber);
  });
}

// Endpoint для получения следующего номера резервации (с датой, для обратной совместимости)
console.log('🔧 Registering GET /api/reservations/next-number endpoint');
app.get('/api/reservations/next-number', (req, res) => {
  const { date } = req.query;
  console.log('🔢 GET /api/reservations/next-number - Generating next reservation number');
  
  if (!date) {
    return res.status(400).json({ error: 'Date parameter is required' });
  }

  getNextReservationNumber(date, (err, numer_rezerwacji, maxNumber) => {
      if (err) {
      console.error('❌ Error finding max reservation number:', err);
        return res.status(500).json({ error: err.message });
      }
    console.log(`✅ Next reservation number: ${numer_rezerwacji} (max number: ${maxNumber})`);
      res.json({ numer_rezerwacji });
  });
});

});

// Endpoint для анулирования резервации
app.put('/api/reservations/:id/cancel', (req, res) => {
  const { id } = req.params;
  console.log(`📋 PUT /api/reservations/${id}/cancel - Cancelling reservation`);
  
  // Проверяем, существует ли резервация
  db.get('SELECT * FROM reservations WHERE id = ?', [id], (err, reservation) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!reservation) {
      res.status(404).json({ error: 'Rezerwacja nie znaleziona' });
      return;
    }
    
    if (reservation.status === 'anulowana') {
      res.status(400).json({ error: 'Rezerwacja jest już anulowana' });
      return;
    }
    
    // Обновляем статус на 'anulowana'
    db.run(
      'UPDATE reservations SET status = ? WHERE id = ?',
      ['anulowana', id],
      function(err) {
        if (err) {
          console.error('❌ Database error updating status:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        console.log(`✅ Reservation ${id} cancelled successfully`);
        res.json({ success: true, message: 'Rezerwacja została anulowana' });
      }
    );
  });
});

// Endpoint для обновления резервации
app.put('/api/reservations/:id', (req, res) => {
  const { id } = req.params;
  const { klient, numer_rezerwacji, data_utworzenia, data_zakonczenia, status, komentarz, products } = req.body;
  console.log(`📋 PUT /api/reservations/${id} - Updating reservation`);
  
  // Валидация обязательных полей
  if (!klient || !klient.trim()) {
    console.log('❌ Validation failed: client name is required');
    res.status(400).json({ error: 'Wybierz klienta' });
    return;
  }
  
  if (!products || products.length === 0) {
    console.log('❌ Validation failed: products are required');
    res.status(400).json({ error: 'Dodaj produkty do rezerwacji' });
    return;
  }
  
  
  // Сначала находим client_id по имени клиента
  db.get('SELECT id FROM clients WHERE nazwa = ? LIMIT 1', [klient], (err, client) => {
    if (err) {
      console.error('❌ Database error finding client:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!client) {
      console.log('❌ Client not found:', klient);
      res.status(404).json({ error: 'Klient nie znaleziony' });
      return;
    }
    
    const clientId = client.id;
    
    // Получаем текущую резервацию и её продукты
    db.get('SELECT * FROM reservations WHERE id = ?', [id], (err, currentReservation) => {
      if (err) {
        console.error('❌ Database error fetching reservation:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      if (!currentReservation) {
        res.status(404).json({ error: 'Rezerwacja nie znaleziona' });
        return;
      }
      
      // Получаем текущие продукты резервации с ilosc_wydane
      db.all('SELECT * FROM reservation_products WHERE reservation_id = ?', [id], (err, oldProducts) => {
        if (err) {
          console.error('❌ Database error fetching old products:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        // Проверяем, изменился ли клиент и есть ли выданные товары
        const hasIssuedProducts = oldProducts.some(p => (p.ilosc_wydane || 0) > 0);
        if (hasIssuedProducts && currentReservation.client_id !== clientId) {
          console.log(`❌ Cannot change client - reservation has issued products`);
          res.status(400).json({ 
            error: 'Nie można zmienić klienta - część towaru z tej rezerwacji została już wydana' 
          });
          return;
        }
        
        // Создаём карту старых продуктов для быстрого доступа
        const oldProductsMap = {};
        oldProducts.forEach(p => {
          oldProductsMap[p.product_kod] = p;
        });
        
        // Валидация: проверяем что новое количество >= ilosc_wydane
      for (const product of products) {
        const oldProduct = oldProductsMap[product.kod];
        if (oldProduct) {
          const iloscWydane = oldProduct.ilosc_wydane || 0;
          if (product.ilosc < iloscWydane) {
            console.log(`❌ Validation failed: cannot reduce ${product.kod} below issued quantity (${iloscWydane})`);
            res.status(400).json({ 
              error: `Nie można zmniejszyć ilości produktu ${product.kod} poniżej wydanej ilości (${iloscWydane} szt.)` 
            });
            return;
          }
        }
      }
      
      // Проверяем доступность на складе для увеличенных количеств
      const checkAvailability = (callback) => {
        const productsToCheck = products.filter(p => {
          const oldProduct = oldProductsMap[p.kod];
          const oldQuantity = oldProduct ? oldProduct.ilosc : 0;
          return p.ilosc > oldQuantity;
        });
        
        if (productsToCheck.length === 0) {
          callback(null);
          return;
        }
        
        let checked = 0;
        let hasError = false;
        
        productsToCheck.forEach(product => {
          const oldProduct = oldProductsMap[product.kod];
          const oldQuantity = oldProduct ? oldProduct.ilosc : 0;
          const additionalNeeded = product.ilosc - oldQuantity;
          
          // Проверяем доступность на складе
          db.get(`
            SELECT 
              ws.ilosc as stock,
              COALESCE((
                SELECT SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0))
                FROM reservation_products rp
                INNER JOIN reservations r ON rp.reservation_id = r.id
                WHERE rp.product_kod = ws.kod AND r.status = 'aktywna' AND r.id != ?
              ), 0) as other_reserved
            FROM working_sheets ws
            WHERE ws.kod = ?
          `, [id, product.kod], (err, row) => {
            if (err || hasError) {
              if (!hasError) {
                console.error('❌ Error checking availability:', err);
              }
              checked++;
              return;
            }
            
            const stockQuantity = row ? row.stock : 0;
            const otherReserved = row ? row.other_reserved : 0;
            const availableForReserve = stockQuantity - otherReserved;
            
            console.log(`📊 Product ${product.kod}: stock=${stockQuantity}, otherReserved=${otherReserved}, available=${availableForReserve}, needed=${additionalNeeded}`);
            
            if (additionalNeeded > availableForReserve) {
              hasError = true;
              callback(`Niewystarczająca ilość produktu ${product.kod} - dostępne do rezerwacji: ${availableForReserve} szt.`);
              return;
            }
            
            checked++;
            if (checked === productsToCheck.length && !hasError) {
              callback(null);
            }
          });
        });
      };
      
      checkAvailability((error) => {
        if (error) {
          res.status(400).json({ error });
          return;
        }
        
        // Обновляем резервацию
        db.run(`
          UPDATE reservations 
          SET client_id = ?, numer_rezerwacji = ?, data_zakonczenia = ?, status = ?, komentarz = ?
          WHERE id = ?
        `, [clientId, numer_rezerwacji, data_zakonczenia, status, komentarz, id], function(err) {
          if (err) {
            console.error('❌ Database error updating reservation:', err);
            res.status(500).json({ error: err.message });
            return;
          }
          
          if (this.changes === 0) {
            res.status(404).json({ error: 'Rezerwacja nie znaleziona' });
            return;
          }
          
          // Умное обновление продуктов (сохраняем ilosc_wydane)
          smartUpdateReservationProducts(oldProductsMap);
        });
      });
      
      function smartUpdateReservationProducts(oldProductsMap) {
        console.log(`🧠 Smart update: processing ${products.length} products`);
        
        // ВАЖНО: Сначала СИНХРОННО определяем какие продукты нужно удалить
        // (те что есть в oldProductsMap, но нет в новом списке products)
        const productsToKeep = new Set(products.map(p => p.kod));
        const productsToDelete = Object.keys(oldProductsMap).filter(kod => !productsToKeep.has(kod));
        
        let operationsCompleted = 0;
        const totalOperations = products.length + productsToDelete.length;
        
        if (totalOperations === 0) {
          console.log(`✅ No operations needed, reservation ${id} unchanged`);
          res.json({ success: true, id: id });
          return;
        }
        
        const checkCompletion = () => {
          operationsCompleted++;
          if (operationsCompleted >= totalOperations) {
            console.log(`✅ Reservation ${id} updated successfully with ${products.length} products`);
            res.json({ success: true, id: id });
          }
        };
        
        // Обновляем или добавляем продукты
        products.forEach(product => {
          const oldProduct = oldProductsMap[product.kod];
          
          if (oldProduct) {
            // Продукт существует - обновляем количество, сохраняем ilosc_wydane
            db.run(`
              UPDATE reservation_products 
              SET ilosc = ?, product_nazwa = ?
              WHERE reservation_id = ? AND product_kod = ?
            `, [product.ilosc, product.nazwa, id, product.kod], (err) => {
              if (err) {
                console.error(`❌ Error updating product ${product.kod}:`, err);
              } else {
                console.log(`✅ Updated product ${product.kod}: ${oldProduct.ilosc} → ${product.ilosc}`);
              }
              checkCompletion();
            });
          } else {
            // Новый продукт - добавляем
            db.run(`
              INSERT INTO reservation_products (reservation_id, product_kod, product_nazwa, ilosc, ilosc_wydane)
              VALUES (?, ?, ?, ?, 0)
            `, [id, product.kod, product.nazwa, product.ilosc], (err) => {
              if (err) {
                console.error(`❌ Error inserting product ${product.kod}:`, err);
              } else {
                console.log(`✅ Inserted new product ${product.kod}: ${product.ilosc}`);
              }
              checkCompletion();
            });
          }
        });
        
        // Удаляем только те продукты, которых НЕТ в новом списке (и только если ilosc_wydane = 0)
        productsToDelete.forEach(kod => {
          const oldProduct = oldProductsMap[kod];
          if ((oldProduct.ilosc_wydane || 0) > 0) {
            console.log(`⚠️ Cannot delete product ${kod} - has issued quantity: ${oldProduct.ilosc_wydane}`);
            checkCompletion();
          } else {
            db.run(`
              DELETE FROM reservation_products 
              WHERE reservation_id = ? AND product_kod = ?
            `, [id, kod], (err) => {
              if (err) {
                console.error(`❌ Error deleting product ${kod}:`, err);
              } else {
                console.log(`✅ Deleted product ${kod}`);
              }
              checkCompletion();
            });
          }
        });
      }
    });
    });
  });
});

// Получение резерваций клиента по конкретному товару
app.get('/api/reservations/client/:client_id/products/:product_kod', (req, res) => {
  const { client_id, product_kod } = req.params;
  console.log(`📋 GET /api/reservations/client/${client_id}/products/${product_kod} - Fetching client reservations for product`);
  
  db.all(`
    SELECT 
      rp.id,
      rp.reservation_id,
      rp.ilosc,
      rp.ilosc_wydane,
      (rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as available,
      r.numer_rezerwacji,
      r.data_utworzenia,
      r.data_zakonczenia
    FROM reservation_products rp
    INNER JOIN reservations r ON rp.reservation_id = r.id
    WHERE r.client_id = ? 
      AND rp.product_kod = ? 
      AND r.status = 'aktywna'
  `, [client_id, product_kod], (err, rows) => {
    if (err) {
      console.error('❌ Database error fetching client reservations:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!rows || rows.length === 0) {
      console.log(`✅ No active reservations found for client ${client_id} and product ${product_kod}`);
      res.json({ 
        hasReservation: false,
        totalAvailable: 0,
        reservations: []
      });
      return;
    }
    
    // Суммируем доступное количество из всех резерваций
    const totalAvailable = rows.reduce((sum, row) => sum + (row.available || 0), 0);
    
    console.log(`✅ Found ${rows.length} active reservations for client ${client_id} and product ${product_kod}, total available: ${totalAvailable}`);
    res.json({ 
      hasReservation: true,
      totalAvailable: totalAvailable,
      reservations: rows
    });
  });
});

// Получение всех резерваций с продуктами
app.get('/api/reservations-with-products', (req, res) => {
  console.log('📋 GET /api/reservations-with-products - Fetching all reservations with products');
  
  // Сначала проверяем истекшие резервации
  checkExpiredReservations();
  
  // Получаем все резервации с информацией о клиенте
  db.all(`
    SELECT 
      r.id,
      r.numer_rezerwacji,
      r.data_utworzenia,
      r.data_zakonczenia,
      r.status,
      r.komentarz,
      c.nazwa as klient_nazwa,
      c.firma as klient_firma
    FROM reservations r
    LEFT JOIN clients c ON r.client_id = c.id
    ORDER BY r.data_utworzenia DESC
  `, (err, reservations) => {
    if (err) {
      console.error('❌ Database error fetching reservations:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`✅ Found ${reservations.length} reservations`);
    
    if (reservations.length === 0) {
      res.json([]);
      return;
    }
    
    // Для каждой резервации получаем продукты
    let processedReservations = 0;
    const result = [];
    
    reservations.forEach((reservation) => {
      db.all('SELECT * FROM reservation_products WHERE reservation_id = ?', [reservation.id], (err, products) => {
        if (err) {
          console.error(`❌ Database error fetching products for reservation ${reservation.id}:`, err);
        } else {
          console.log(`✅ Found ${products.length} products for reservation ${reservation.id}`);
        }
        
        // Вычисляем общее количество продуктов
        const laczna_ilosc = products.reduce((total, product) => total + (product.ilosc || 0), 0);
        
        // Формируем структуру резервации с продуктами
        const reservationWithProducts = {
          id: reservation.id,
          numer_rezerwacji: reservation.numer_rezerwacji,
          klient: reservation.klient_nazwa || '',
          firma: reservation.klient_firma || '',
          data_utworzenia: reservation.data_utworzenia,
          data_zakonczenia: reservation.data_zakonczenia,
          status: reservation.status,
          komentarz: reservation.komentarz,
          laczna_ilosc: laczna_ilosc,
          products: products || []
        };
        
        result.push(reservationWithProducts);
        processedReservations++;
        
        // Когда все резервации обработаны, отправляем результат
        if (processedReservations === reservations.length) {
          console.log(`✅ Sending ${result.length} reservations with products`);
          res.json(result);
        }
      });
    });
    });
});

// Endpoint для создания возвратов
app.post('/api/returns', (req, res) => {
  const { klient, data_zwrotu, products, orderId: originalOrderId } = req.body;
  console.log('📦 POST /api/returns - Creating new return:', { klient, data_zwrotu, productsCount: products?.length || 0, originalOrderId });
  
  if (!klient || !data_zwrotu || !products || !Array.isArray(products) || products.length === 0) {
    console.log('❌ Validation failed: klient, data_zwrotu and products array are required');
    return res.status(400).json({ error: 'Client, return date and products array are required' });
  }
  
  // Проверяем, что для всех продуктов указана причина возврата
  const invalidProducts = products.filter(product => !product.powod_zwrotu);
  if (invalidProducts.length > 0) {
    console.log('❌ Validation failed: all products must have a return reason');
    return res.status(400).json({ error: 'All products must have a return reason' });
  }
  
  // Генерируем номер возврата: порядковый_номер_ZW_дата
  db.get('SELECT COUNT(*) as count FROM orders WHERE typ = "zwrot"', (err, row) => {
    if (err) {
      console.error('❌ Database error counting returns:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    const returnNumber = row.count + 1;
    const date = new Date(data_zwrotu);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const numer_zwrotu = `${returnNumber}_ZW_${day}.${month}.${year}`;
    
    console.log(`🔢 Generated return number: ${numer_zwrotu}`);
    
    // Вычисляем общее количество всех продуктов
    const laczna_ilosc = products.reduce((total, product) => total + (product.ilosc || 0), 0);
    
    const createReturnOrder = (clientId, klientName) => {
    db.run(
      'INSERT INTO orders (client_id, klient, numer_zamowienia, laczna_ilosc, typ, numer_zwrotu, data_utworzenia) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [clientId, klientName, returnNumber, laczna_ilosc, 'zwrot', numer_zwrotu, data_zwrotu],
      function(err) {
        if (err) {
          console.error('❌ Database error creating return:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        const returnId = this.lastID;
        console.log(`✅ Return created with ID: ${returnId}`);
        
        // Создаем записи для каждого продукта
        let productsCreated = 0;
        let productsFailed = 0;
        
        products.forEach((product, index) => {
          const { nazwa, ilosc, powod_zwrotu } = product;
          
          // Создаем запись в order_products
          db.run(
            'INSERT INTO order_products (orderId, nazwa, ilosc, powod_zwrotu, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
            [returnId, nazwa, ilosc, powod_zwrotu],
            function(err) {
              if (err) {
                console.error(`❌ Error creating return product ${index + 1}:`, err);
                productsFailed++;
                checkCompletion();
              } else {
                productsCreated++;
                console.log(`✅ Return product ${index + 1} created for return ${returnId}`);
                checkCompletion();
              }
            }
          );
        });
        
        // Восстанавливаем количество товара на склад в соответствующие партии
        if (originalOrderId) {
          restoreProductQuantitiesFromOrder(originalOrderId, products, () => {
            console.log(`✅ Product quantities restored for return ${returnId}`);
          });
        }
        
        function checkCompletion() {
          if (productsCreated + productsFailed === products.length) {
            if (res.headersSent) {
              console.log('⚠️ Response already sent, skipping checkCompletion');
              return;
            }
            
            if (productsFailed > 0) {
              console.log(`⚠️ Return created with ${productsFailed} failed products`);
              res.status(207).json({ 
                message: 'Return created with some failed products',
                returnId,
                productsCreated,
                productsFailed,
                numer_zwrotu
              });
            } else {
              console.log(`✅ Return ${returnId} completed successfully`);
              res.json({ 
                message: 'Return created successfully',
                returnId,
                productsCreated,
                numer_zwrotu
              });
            }
          }
        }
      }
    );
    };

    if (originalOrderId) {
      db.get(
        `SELECT o.client_id, COALESCE(c.nazwa, o.klient) AS klient_name
         FROM orders o
         LEFT JOIN clients c ON c.id = o.client_id
         WHERE o.id = ?`,
        [originalOrderId],
        (orderErr, orderRow) => {
          if (orderErr) {
            console.error('❌ Database error fetching original order:', orderErr);
            return res.status(500).json({ error: orderErr.message });
          }
          if (!orderRow?.client_id) {
            return res.status(400).json({ error: 'Original order has no client_id' });
          }
          createReturnOrder(orderRow.client_id, orderRow.klient_name || klient);
        }
      );
    } else {
      resolveClientById(req.body.client_id, (clientLookupErr, clientResult) => {
        if (clientLookupErr) {
          console.error('❌ Database error finding client for return:', clientLookupErr);
          return res.status(500).json({ error: clientLookupErr.message });
        }
        if (clientResult?.error) {
          return res.status(clientResult.status || 400).json({ error: clientResult.error });
        }
        createReturnOrder(clientResult.clientId, clientResult.klientName);
      });
    }
  });
});

// Функция для восстановления количества товара из заказа в соответствующие партии
function restoreProductQuantitiesFromOrder(orderId, products, callback) {
  console.log(`🔄 Restoring product quantities from order ${orderId}`);
  
  // Получаем информацию о потреблении для этого заказа
  db.all('SELECT * FROM order_consumptions WHERE order_id = ?', [orderId], (err, consumptions) => {
    if (err) {
      console.error(`❌ Error fetching consumptions for order ${orderId}:`, err);
      callback();
            return;
          }
          
    if (!consumptions || consumptions.length === 0) {
      console.log(`ℹ️ No consumptions found for order ${orderId}`);
      callback();
      return;
    }
    
    console.log(`📊 Found ${consumptions.length} consumptions for order ${orderId}`);
    
    // Группируем потребления по продукту
    const consumptionsByProduct = {};
    consumptions.forEach(consumption => {
      if (!consumptionsByProduct[consumption.product_kod]) {
        consumptionsByProduct[consumption.product_kod] = [];
      }
      consumptionsByProduct[consumption.product_kod].push(consumption);
    });
    
    // Для каждого продукта в возврате восстанавливаем количество
    let productsProcessed = 0;
    products.forEach(product => {
      // Ищем потребления по названию продукта (так как в возврате у нас только nazwa)
      const productConsumptions = consumptionsByProduct[product.nazwa] || [];
      
      if (productConsumptions.length === 0) {
        console.log(`⚠️ No consumptions found for product ${product.nazwa} in order ${orderId}`);
        productsProcessed++;
        checkCompletion();
        return;
      }
      
      // Сортируем потребления по batch_id (FIFO - сначала старые)
      productConsumptions.sort((a, b) => a.batch_id - b.batch_id);
      
      let remainingQuantity = product.ilosc;
      let consumptionsProcessed = 0;
      
      productConsumptions.forEach(consumption => {
        if (remainingQuantity <= 0) {
          consumptionsProcessed++;
          checkProductCompletion();
          return;
        }
        
        const quantityToRestore = Math.min(remainingQuantity, consumption.quantity);
        
        // Восстанавливаем количество в products (FIFO)
        restoreToProducts(product.kod, quantityToRestore)
          .then(({ restored }) => {
            console.log(`✅ Restored ${restored} units in products for ${product.kod}`);
            consumptionsProcessed++;
            checkProductCompletion();
          })
          .catch((err) => {
            console.error(`❌ Error restoring quantity in products for ${product.kod}:`, err);
            consumptionsProcessed++;
            checkProductCompletion();
          });
        
        remainingQuantity -= quantityToRestore;
      });
      
      // Обновляем общее количество в working_sheets
      // Сначала находим kod продукта по названию
      db.get('SELECT kod FROM working_sheets WHERE nazwa = ?', [product.nazwa], (err, row) => {
        if (err) {
          console.error(`❌ Error finding kod for product ${product.nazwa}:`, err);
          return;
        }
        
        if (!row) {
          console.error(`❌ Product ${product.nazwa} not found in working_sheets`);
          return;
        }
        
        // Теперь обновляем количество по найденному kod
              db.run(
                'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
          [product.ilosc, row.kod],
          function(err) {
            if (err) {
              console.error(`❌ Error updating working_sheets for product ${product.nazwa}:`, err);
                  } else {
              console.log(`✅ Updated working_sheets: ${product.nazwa} (kod: ${row.kod}, quantity increased by ${product.ilosc})`);
            }
          }
        );
      });
      
      function checkProductCompletion() {
        if (consumptionsProcessed === productConsumptions.length) {
          productsProcessed++;
          checkCompletion();
            }
          }
        });
        
    function checkCompletion() {
      if (productsProcessed === products.length) {
        console.log(`✅ All product quantities restored for order ${orderId}`);
        callback();
      }
    }
  });
}

// Endpoint для получения следующего номера списания
app.get('/api/writeoffs/next-number-only', (req, res) => {
  console.log('🔢 GET /api/writeoffs/next-number-only - Generating next write-off number');
  
  // Получаем все номера списаний для поиска максимального номера (префикс RW)
  db.all('SELECT numer_zamowienia FROM orders WHERE typ = ? AND numer_zamowienia LIKE ?', ['odpisanie', 'RW%'], (err, allRows) => {
    if (err) {
      console.error('❌ Error finding max write-off number:', err);
      return res.status(500).json({ error: err.message });
    }
    
    console.log(`📋 Found ${allRows.length} write-offs with RW% pattern`);
    
    // Извлекаем числовую часть из каждого номера и находим максимум
    let maxNumber = 0;
    const numbers = [];
    allRows.forEach(row => {
      const match = row.numer_zamowienia.match(/^RW(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        numbers.push(num);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    });
    
    console.log(`📊 Extracted numbers: [${numbers.sort((a,b) => a-b).join(', ')}], max: ${maxNumber}`);
    
    const nextNumber = maxNumber + 1;
    const numer_odpisania_only = `RW${nextNumber.toString().padStart(3, '0')}`;
    console.log(`✅ Generated next write-off number: ${numer_odpisania_only}`);
    res.json({ numer_odpisania: numer_odpisania_only });
  });
});

// Endpoint для получения следующего номера przychodu
app.get('/api/przychod/next-number-only', (req, res) => {
  console.log('🔢 GET /api/przychod/next-number-only - Generating next przychód number');
  
  // Получаем все номера przychodów для поиска максимального номера (префикс PW)
  db.all('SELECT numer_zamowienia FROM orders WHERE typ = ? AND numer_zamowienia LIKE ?', ['przychod', 'PW%'], (err, allRows) => {
    if (err) {
      console.error('❌ Error finding max przychód number:', err);
      return res.status(500).json({ error: err.message });
    }
    
    console.log(`📋 Found ${allRows.length} przychodów with PW% pattern`);
    
    // Извлекаем числовую часть из каждого номера и находим максимум
    let maxNumber = 0;
    const numbers = [];
    allRows.forEach(row => {
      const match = row.numer_zamowienia.match(/^PW(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        numbers.push(num);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    });
    
    console.log(`📊 Extracted numbers: [${numbers.sort((a,b) => a-b).join(', ')}], max: ${maxNumber}`);
    
    const nextNumber = maxNumber + 1;
    const numer_przychodu_only = `PW${nextNumber.toString().padStart(3, '0')}`;
    console.log(`✅ Generated next przychód number: ${numer_przychodu_only}`);
    res.json({ numer_przychodu: numer_przychodu_only });
  });
});

// ===== INVOICES ROUTES =====
// Список всех фактур (для вкладки Faktury)
app.get('/api/invoices', (req, res) => {
  console.log('📋 GET /api/invoices - Fetching all invoices');
  db.all(
    'SELECT id, numer_faktury, data_faktury, termin_platnosci, klient_nazwa, suma_netto, suma_vat, suma_brutto, rabat_suma FROM invoices ORDER BY data_faktury DESC, id DESC',
    (err, rows) => {
      if (err) {
        console.error('❌ Error fetching invoices:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json(rows || []);
    }
  );
});

// Следующий номер faktury: серия по data_faktury (не по data utworzenia / created_at).
app.get('/api/invoices/next-number-only', (req, res) => {
  console.log('🔢 GET /api/invoices/next-number-only - Next invoice number', req.query);
  db.all('SELECT numer_faktury, data_faktury FROM invoices', (err, rows) => {
    if (err) {
      console.error('❌ Error getting next invoice number:', err);
      return res.status(500).json({ error: err.message });
    }

    const parseDateParts = (dateStr) => {
      const match = String(dateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!match) return null;
      return { year: parseInt(match[1], 10), month: parseInt(match[2], 10) };
    };

    // Месяц/год целевой серии — из data_faktury в запросе (поле «Data faktury» в форме)
    let targetMonth;
    let targetYear;
    const dataFakturyParam = req.query.data_faktury;
    const targetParts = dataFakturyParam ? parseDateParts(dataFakturyParam) : null;
    if (targetParts) {
      targetYear = targetParts.year;
      targetMonth = targetParts.month;
    }
    if (!targetMonth || !targetYear) {
      const now = new Date();
      targetMonth = now.getMonth() + 1;
      targetYear = now.getFullYear();
    }

    // Максимальный порядковый номер среди faktur с той же data_faktury (mm/yyyy)
    let maxNum = 0;
    (rows || []).forEach((r) => {
      const str = (r.numer_faktury || '').trim();
      const numMatch = str.match(/^FS\/(\d+)\/(\d{2})\/(\d{4})$/i);
      if (!numMatch) return;

      const seq = parseInt(numMatch[1], 10);
      const dateParts = parseDateParts(r.data_faktury);
      const invoiceMonth = dateParts ? dateParts.month : parseInt(numMatch[2], 10);
      const invoiceYear = dateParts ? dateParts.year : parseInt(numMatch[3], 10);

      if (invoiceYear === targetYear && invoiceMonth === targetMonth && seq > maxNum) {
        maxNum = seq;
      }
    });

    const nextNum = maxNum + 1;
    const mm = targetMonth.toString().padStart(2, '0');
    const numer_faktury = `FS/${nextNum}/${mm}/${targetYear}`;
    console.log(`✅ Next invoice number: ${numer_faktury} (data_faktury month: ${mm}/${targetYear}, max was: ${maxNum})`);
    res.json({ numer_faktury });
  });
});

// Получение деталей конкретной фактуры с продуктами
app.get('/api/invoices/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📋 GET /api/invoices/${id} - Fetching invoice details`);
  
  // Получаем данные фактуры
  db.get(
    'SELECT * FROM invoices WHERE id = ?',
    [id],
    (err, invoice) => {
      if (err) {
        console.error(`❌ Error fetching invoice ${id}:`, err);
        return res.status(500).json({ error: err.message });
      }
      
      if (!invoice) {
        console.log(`❌ Invoice ${id} not found`);
        return res.status(404).json({ error: 'Invoice not found' });
      }
      
      // Получаем продукты фактуры
      db.all(
        'SELECT * FROM invoice_products WHERE invoice_id = ? ORDER BY id',
        [id],
        (err, products) => {
          if (err) {
            console.error(`❌ Error fetching products for invoice ${id}:`, err);
            return res.status(500).json({ error: err.message });
          }
          
          console.log(`✅ Invoice ${id} fetched with ${products?.length || 0} products`);
          res.json({
            ...invoice,
            products: products || []
          });
        }
      );
    }
  );
});

// Создание фактуры и позиций
app.post('/api/invoices', (req, res) => {
  const {
    data_faktury,
    numer_faktury,
    klient,
    order_id,
    numer_zamowienia,
    termin_platnosci,
    products,
    przesuniecie_products,
    komis_deductions,
    suma_netto,
    suma_vat,
    total: suma_brutto,
    rabat_suma
  } = req.body;

  if (!data_faktury || !numer_faktury || !klient || !products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Wymagane: data_faktury, numer_faktury, klient i niepusta tablica products' });
  }

  const totalBrutto = parseFloat(suma_brutto);
  const totalNetto = parseFloat(suma_netto);
  const totalVat = parseFloat(suma_vat);
  const totalRabat = parseFloat(rabat_suma) || 0;
  if (isNaN(totalBrutto) || isNaN(totalNetto) || isNaN(totalVat)) {
    return res.status(400).json({ error: 'suma_netto, suma_vat i total muszą być liczbami' });
  }

  resolveInvoiceClient({ order_id, klient }, (lookupErr, clientResult) => {
    if (lookupErr) {
      console.error('❌ Error resolving invoice client:', lookupErr);
      return res.status(500).json({ error: lookupErr.message });
    }
    if (clientResult?.error) {
      return res.status(clientResult.status || 400).json({ error: clientResult.error });
    }

    const client_id = clientResult.clientId;
    const klient_nazwa = clientResult.klientName;
    const klient_firma = clientResult.klientFirma;
    console.log(
      `🔍 Invoice client resolved${order_id ? ` from order ${order_id}` : ' by name'}: client_id=${client_id}, klient="${klient_nazwa}"`
    );

    db.run(
      `INSERT INTO invoices (
        numer_faktury, data_faktury, order_id, numer_zamowienia, termin_platnosci, client_id,
        klient_nazwa, klient_firma, suma_netto, suma_vat, suma_brutto, rabat_suma
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        numer_faktury,
        data_faktury,
        order_id || null,
        numer_zamowienia || null,
        termin_platnosci || null,
        client_id,
        klient_nazwa,
        klient_firma,
        totalNetto,
        totalVat,
        totalBrutto,
        totalRabat
      ],
      function (runErr) {
        if (runErr) {
          console.error('❌ Error inserting invoice:', runErr);
          return res.status(500).json({ error: runErr.message });
        }
        const invoiceId = this.lastID;

        if (products.length === 0) {
          console.log(`✅ Invoice created: id=${invoiceId} ${numer_faktury}`);
          return res.json({ id: invoiceId, numer_faktury });
        }

        let pending = products.length;
        let hasError = false;

        products.forEach((p) => {
          const ilosc = parseFloat(p.ilosc) || 0;
          const cena_netto = parseFloat(p.cena_netto) || 0;
          const rabat = parseFloat(p.rabat) || 0;
          const vat = parseInt(p.vat, 10) || 23;
          const wartosc_netto = ilosc * cena_netto * (1 - rabat / 100);
          const wartosc_vat = wartosc_netto * (vat / 100);
          const wartosc_brutto = wartosc_netto + wartosc_vat;

          db.run(
            `INSERT INTO invoice_products (
              invoice_id, kod, nazwa, ilosc, cena_netto, rabat, vat_stawka,
              wartosc_netto, wartosc_vat, wartosc_brutto, order_product_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              invoiceId,
              p.kod || '',
              p.nazwa || '',
              ilosc,
              cena_netto,
              rabat,
              vat,
              Math.round(wartosc_netto * 100) / 100,
              Math.round(wartosc_vat * 100) / 100,
              Math.round(wartosc_brutto * 100) / 100,
              null
            ],
            (prodErr) => {
              if (hasError) return;
              if (prodErr) {
                hasError = true;
                console.error('❌ Error inserting invoice product:', prodErr);
                return res.status(500).json({ error: prodErr.message });
              }
              pending -= 1;
              if (pending === 0) {
                console.log(`✅ Invoice created: id=${invoiceId} ${numer_faktury}, ${products.length} positions`);
                applyKomisDeductionsThenFinish(invoiceId, client_id, klient_nazwa);
              }
            }
          );
        });
      }
    );
  });

  function applyKomisDeductionsThenFinish(invoiceId, resolvedClientId, resolvedKlient) {
    const deductions = Array.isArray(komis_deductions) ? komis_deductions : [];
    if (deductions.length === 0) {
      return createPrzesuniecieIfNeeded(invoiceId, resolvedClientId, resolvedKlient);
    }

    let pending = deductions.length;
    deductions.forEach((d) => {
      const qty = Math.round(parseFloat(d.ilosc) || 0);
      if (qty <= 0 || !d.kod) {
        pending -= 1;
        if (pending === 0) createPrzesuniecieIfNeeded(invoiceId, resolvedClientId, resolvedKlient);
        return;
      }

      db.get('SELECT ilosc FROM komis WHERE klient = ? AND kod = ?', [resolvedKlient, d.kod], (getErr, row) => {
        if (getErr) {
          console.error(`❌ Error reading komis for ${d.kod}:`, getErr);
          pending -= 1;
          if (pending === 0) createPrzesuniecieIfNeeded(invoiceId, resolvedClientId, resolvedKlient);
          return;
        }
        if (!row) {
          pending -= 1;
          if (pending === 0) createPrzesuniecieIfNeeded(invoiceId, resolvedClientId, resolvedKlient);
          return;
        }

        const currentIlosc = row.ilosc || 0;
        const finishDeduction = (dedErr, action) => {
          if (dedErr) {
            console.error(`❌ Error ${action} komis for ${d.kod}:`, dedErr);
          } else {
            console.log(`✅ Komis ${action}: klient=${resolvedKlient}, kod=${d.kod}, ilosc=${qty}`);
          }
          pending -= 1;
          if (pending === 0) createPrzesuniecieIfNeeded(invoiceId, resolvedClientId, resolvedKlient);
        };

        if (qty >= currentIlosc) {
          db.run(
            'DELETE FROM komis WHERE klient = ? AND kod = ?',
            [resolvedKlient, d.kod],
            (delErr) => finishDeduction(delErr, 'deleted')
          );
        } else {
          db.run(
            `UPDATE komis SET
               ilosc = ilosc - ?,
               updated_at = CURRENT_TIMESTAMP
             WHERE klient = ? AND kod = ?`,
            [qty, resolvedKlient, d.kod],
            (updErr) => finishDeduction(updErr, 'deducted')
          );
        }
      });
    });
  }

  function createPrzesuniecieIfNeeded(invoiceId, resolvedClientId, resolvedKlient) {
    const items = Array.isArray(przesuniecie_products) ? przesuniecie_products : [];
    if (items.length === 0) {
      return res.json({ id: invoiceId, numer_faktury });
    }
    db.all(
      "SELECT numer_zamowienia FROM orders WHERE typ = 'przesuniecie' AND numer_zamowienia LIKE 'PS%'",
      (err, rows) => {
        if (err) {
          console.error('❌ Error fetching PS numbers:', err);
          return res.json({ id: invoiceId, numer_faktury });
        }
        let maxNum = 0;
        (rows || []).forEach((r) => {
          const m = (r.numer_zamowienia || '').match(/^PS(\d+)_/i);
          if (m) {
            const n = parseInt(m[1], 10);
            if (!isNaN(n) && n > maxNum) maxNum = n;
          }
        });
        const nextNum = maxNum + 1;
        const parts = (data_faktury || '').split('-');
        const year = parts[0] || new Date().getFullYear();
        const month = parts[1] || String(new Date().getMonth() + 1).padStart(2, '0');
        const day = parts[2] || String(new Date().getDate()).padStart(2, '0');
        const numer_ps = `PS${String(nextNum).padStart(3, '0')}_${day}_${month}_${year}`;
        const laczna = items.reduce((s, p) => s + Math.round(parseFloat(p.ilosc) || 0), 0);
        const dataUtworzenia = (data_faktury || '').trim() ? `${data_faktury} 00:00:00` : null;
        db.run(
          `INSERT INTO orders (client_id, klient, numer_zamowienia, data_utworzenia, laczna_ilosc, typ) VALUES (?, ?, ?, COALESCE(?, datetime('now')), ?, 'przesuniecie')`,
          [resolvedClientId, resolvedKlient, numer_ps, dataUtworzenia, laczna],
          function (runOrderErr) {
            if (runOrderErr) {
              console.error('❌ Error inserting Przesunięcie order:', runOrderErr);
              return res.json({ id: invoiceId, numer_faktury });
            }
            const psOrderId = this.lastID;
            // Сохраняем ссылку на przesunięcie в фактуре
            db.run('UPDATE invoices SET przesuniecie_order_id = ? WHERE id = ?', [psOrderId, invoiceId], (updErr) => {
              if (updErr) console.error('❌ Error linking przesunięcie to invoice:', updErr);
              else console.log(`✅ Invoice ${invoiceId} linked to przesunięcie order ${psOrderId}`);
            });
            let pend = items.length;
            let hasErr = false;
            items.forEach((p) => {
              const ilosc = Math.round(parseFloat(p.ilosc) || 0);
              db.run(
                `INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ) VALUES (?, ?, ?, ?, ?)`,
                [psOrderId, p.kod || '', p.nazwa || '', ilosc, 'przesuniecie'],
                (opErr) => {
                  if (hasErr) return;
                  if (opErr) {
                    hasErr = true;
                    console.error('❌ Error inserting Przesunięcie product:', opErr);
                    return res.status(500).json({ error: opErr.message });
                  }
                  pend -= 1;
                  if (pend === 0) {
                    console.log(`✅ Przesunięcie created: ${numer_ps}, orderId=${psOrderId}`);
                    res.json({ id: invoiceId, numer_faktury });
                  }
                }
              );
            });
          }
        );
      }
    );
  }
});

// Endpoint для обновления фактуры
app.put('/api/invoices/:id', (req, res) => {
  const { id } = req.params;
  const {
    data_faktury,
    numer_faktury,
    klient,
    termin_platnosci,
    products,
    suma_netto,
    suma_vat,
    suma_brutto,
    rabat_suma
  } = req.body;

  console.log(`📝 PUT /api/invoices/${id} - Updating invoice`);

  if (!data_faktury || !numer_faktury || !klient || !products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Wymagane: data_faktury, numer_faktury, klient i niepusta tablica products' });
  }

  const totalBrutto = parseFloat(suma_brutto);
  const totalNetto = parseFloat(suma_netto);
  const totalVat = parseFloat(suma_vat);
  const totalRabat = parseFloat(rabat_suma) || 0;
  
  if (isNaN(totalBrutto) || isNaN(totalNetto) || isNaN(totalVat)) {
    return res.status(400).json({ error: 'suma_netto, suma_vat i suma_brutto muszą być liczbami' });
  }

  db.get('SELECT order_id FROM invoices WHERE id = ?', [id], (invoiceErr, invoiceRow) => {
    if (invoiceErr) {
      console.error('❌ Error fetching invoice for update:', invoiceErr);
      return res.status(500).json({ error: invoiceErr.message });
    }
    if (!invoiceRow) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    resolveInvoiceClient({ order_id: invoiceRow.order_id, klient }, (lookupErr, clientResult) => {
      if (lookupErr) {
        console.error('❌ Error resolving invoice client:', lookupErr);
        return res.status(500).json({ error: lookupErr.message });
      }
      if (clientResult?.error) {
        return res.status(clientResult.status || 400).json({ error: clientResult.error });
      }

      const client_id = clientResult.clientId;
      const klient_nazwa = clientResult.klientName;
      const klient_firma = clientResult.klientFirma;

    db.run(
      `UPDATE invoices 
       SET numer_faktury = ?, data_faktury = ?, termin_platnosci = ?, client_id = ?,
           klient_nazwa = ?, klient_firma = ?, suma_netto = ?, suma_vat = ?, suma_brutto = ?, rabat_suma = ?
       WHERE id = ?`,
      [
        numer_faktury,
        data_faktury,
        termin_platnosci || null,
        client_id,
        klient_nazwa,
        klient_firma,
        totalNetto,
        totalVat,
        totalBrutto,
        totalRabat,
        id
      ],
      function (updateErr) {
        if (updateErr) {
          console.error('❌ Error updating invoice:', updateErr);
          return res.status(500).json({ error: updateErr.message });
        }

        // Удаляем старые продукты
        db.run('DELETE FROM invoice_products WHERE invoice_id = ?', [id], (delErr) => {
          if (delErr) {
            console.error('❌ Error deleting old products:', delErr);
            return res.status(500).json({ error: delErr.message });
          }

          // Вставляем новые продукты
          let pending = products.length;
          let hasError = false;

          products.forEach((p) => {
            const ilosc = parseFloat(p.ilosc) || 0;
            const cena_netto = parseFloat(p.cena_netto) || 0;
            const rabat = parseFloat(p.rabat) || 0;
            const vat = parseInt(p.vat, 10) || 23;
            const wartosc_netto = ilosc * cena_netto * (1 - rabat / 100);
            const wartosc_vat = wartosc_netto * (vat / 100);
            const wartosc_brutto = wartosc_netto + wartosc_vat;

            db.run(
              `INSERT INTO invoice_products (
                invoice_id, kod, nazwa, ilosc, cena_netto, rabat, vat_stawka,
                wartosc_netto, wartosc_vat, wartosc_brutto, order_product_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                p.kod || '',
                p.nazwa || '',
                ilosc,
                cena_netto,
                rabat,
                vat,
                Math.round(wartosc_netto * 100) / 100,
                Math.round(wartosc_vat * 100) / 100,
                Math.round(wartosc_brutto * 100) / 100,
                null
              ],
              (prodErr) => {
                if (hasError) return;
                if (prodErr) {
                  hasError = true;
                  console.error('❌ Error inserting invoice product:', prodErr);
                  return res.status(500).json({ error: prodErr.message });
                }
                pending -= 1;
                if (pending === 0) {
                  console.log(`✅ Invoice updated: id=${id} ${numer_faktury}, ${products.length} positions`);
                  res.json({ id: parseInt(id), numer_faktury });
                }
              }
            );
          });
        });
      }
    );
    });
  });
});

// Endpoint для удаления фактуры
app.delete('/api/invoices/:id', (req, res) => {
  const { id } = req.params;
  console.log(`🗑️ DELETE /api/invoices/${id} - Deleting invoice`);

  db.get('SELECT * FROM invoices WHERE id = ?', [id], (err, invoice) => {
    if (err) {
      console.error('❌ Error fetching invoice:', err);
      return res.status(500).json({ error: err.message });
    }
    if (!invoice) {
      return res.status(404).json({ error: 'Faktura nie znaleziona' });
    }

    const psOrderId = invoice.przesuniecie_order_id;

    // Удаляем фактуру (invoice_products удалятся каскадом через FK ON DELETE CASCADE)
    db.run('DELETE FROM invoices WHERE id = ?', [id], function(delErr) {
      if (delErr) {
        console.error('❌ Error deleting invoice:', delErr);
        return res.status(500).json({ error: delErr.message });
      }
      console.log(`✅ Invoice ${id} (${invoice.numer_faktury}) deleted`);

      if (!psOrderId) {
        return res.json({ message: 'Faktura usunięta', numer_faktury: invoice.numer_faktury });
      }

      // Удаляем связанный przesunięcie-заказ
      db.run('DELETE FROM order_products WHERE orderId = ?', [psOrderId], (opErr) => {
        if (opErr) console.error('❌ Error deleting PS order_products:', opErr);
        db.run('DELETE FROM orders WHERE id = ?', [psOrderId], (oErr) => {
          if (oErr) console.error('❌ Error deleting PS order:', oErr);
          else console.log(`✅ Przesunięcie order ${psOrderId} deleted`);
          res.json({ message: 'Faktura i przesunięcie usunięte', numer_faktury: invoice.numer_faktury });
        });
      });
    });
  });
});

// Endpoint для создания przychodu (прихода товара)
app.post('/api/przychod', (req, res) => {
  const { data_przychodu, numer_przychodu, products } = req.body;
  console.log('📦 POST /api/przychod - Creating new przychód:', { data_przychodu, numer_przychodu, productsCount: products?.length || 0 });
  
  if (!data_przychodu || !numer_przychodu || !products || !Array.isArray(products) || products.length === 0) {
    console.log('❌ Validation failed: data_przychodu, numer_przychodu and products array are required');
    return res.status(400).json({ error: 'Date, number and products array are required' });
  }

  // Вычисляем общее количество товаров
  const laczna_ilosc = products.reduce((total, product) => total + (product.ilosc || 0), 0);

  // Преобразуем дату в формат DATETIME SQLite
  let dataUtworzenia;
  if (data_przychodu) {
    const date = new Date(data_przychodu);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    dataUtworzenia = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } else {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    dataUtworzenia = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  // Создаем запись в таблице orders с типом 'przychod'
  resolveClientIdByKlient('VEIS', (clientLookupErr, veisClientId) => {
    if (clientLookupErr) {
      console.error('❌ Database error finding VEIS client for przychód:', clientLookupErr);
      return res.status(500).json({ error: clientLookupErr.message });
    }

  db.run(
    `INSERT INTO orders (client_id, klient, numer_zamowienia, data_utworzenia, laczna_ilosc, typ) VALUES (?, ?, ?, ?, ?, ?)`,
    [veisClientId, 'VEIS', numer_przychodu, dataUtworzenia, laczna_ilosc, 'przychod'],
    function(err) {
      if (err) {
        console.error('❌ Database error creating przychód:', err);
        return res.status(500).json({ error: err.message });
      }

      const przychodId = this.lastID;
      console.log(`✅ Przychód created with ID: ${przychodId}, number: ${numer_przychodu}`);

      // Добавляем продукты przychodu в order_products
      let productsCreated = 0;
      let productsFailed = 0;
      let workingSheetsUpdated = 0;

      products.forEach((product, index) => {
        const { kod, nazwa, ilosc, powod } = product;
        
        // Создаем запись в order_products (powod записываем в поле typ)
        console.log(`📝 Creating order_products record for przychód: ${kod} (przychodId: ${przychodId})`);
        db.run(
          `INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ) VALUES (?, ?, ?, ?, ?)`,
          [przychodId, kod || '', nazwa, ilosc, powod || ''],
          function(err) {
            if (err) {
              console.error(`❌ Error creating przychód product ${index + 1}:`, err);
              productsFailed++;
              checkCompletion();
            } else {
              productsCreated++;
              console.log(`✅ Przychód product ${index + 1} created for przychód ${przychodId}`);
              
              // Увеличиваем количество в working_sheets (ПРИХОД товара)
              if (kod) {
                db.run(
                  'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
                  [ilosc, kod],
                  function(updateErr) {
                    if (updateErr) {
                      console.error(`❌ Error updating working_sheets for product ${kod}:`, updateErr);
                    } else {
                      workingSheetsUpdated++;
                      console.log(`✅ working_sheets updated for ${kod}: increased by ${ilosc}`);
                    }
                    checkCompletion();
                  }
                );
              } else {
                checkCompletion();
              }
            }
          }
        );
      });

      function checkCompletion() {
        if (productsCreated + productsFailed === products.length) {
          if (productsFailed > 0) {
            console.log(`⚠️ Przychód created with ${productsFailed} failed products`);
            res.status(207).json({ 
              message: 'Przychód created with some failed products',
              przychodId,
              productsCreated,
              productsFailed,
              workingSheetsUpdated,
              numer_przychodu
            });
          } else {
            console.log(`✅ Przychód ${przychodId} completed successfully`);
            res.json({ 
              message: 'Przychód created successfully',
              przychodId,
              productsCreated,
              workingSheetsUpdated,
              numer_przychodu
            });
          }
        }
      }
    }
  );
  });
});

// Endpoint для создания списаний товаров (добавляем как заказ с типом 'odpisanie')
app.post('/api/writeoffs', (req, res) => {
  const { data_odpisania, numer_odpisania, products } = req.body;
  console.log('📦 POST /api/writeoffs - Creating new write-off:', { data_odpisania, numer_odpisania, productsCount: products?.length || 0 });
  
  if (!data_odpisania || !numer_odpisania || !products || !Array.isArray(products) || products.length === 0) {
    console.log('❌ Validation failed: data_odpisania, numer_odpisania and products array are required');
    return res.status(400).json({ error: 'Date, number and products array are required' });
  }

  // Вычисляем общее количество списанных товаров
  const laczna_ilosc = products.reduce((total, product) => total + (product.ilosc || 0), 0);

  // Преобразуем дату в формат DATETIME SQLite (YYYY-MM-DD HH:MM:SS)
  let dataUtworzenia;
  if (data_odpisania) {
    const date = new Date(data_odpisania);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    dataUtworzenia = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } else {
    // Если дата не указана, используем текущую дату и время
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    dataUtworzenia = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  // 1. Проверяем доступность товаров (как при создании заказа)
  console.log('🔍 Checking product availability for write-off...');
  
  const availabilityChecks = products.map(product => {
    return new Promise((resolve, reject) => {
      const { kod, nazwa, ilosc } = product;
      
      // Проверяем доступное количество в working_sheets
      db.get(`
        SELECT 
          ws.ilosc as total_available,
          COALESCE(SUM(CASE 
            WHEN r.status = 'aktywna' 
            THEN rp.ilosc - COALESCE(rp.ilosc_wydane, 0)
            ELSE 0 
          END), 0) as reserved
        FROM working_sheets ws
        LEFT JOIN reservation_products rp ON ws.kod = rp.product_kod
        LEFT JOIN reservations r ON rp.reservation_id = r.id
        WHERE ws.kod = ?
        GROUP BY ws.kod, ws.ilosc
      `, [kod], (err, row) => {
        if (err) {
          reject({ kod, error: err.message });
          return;
        }
        
        if (!row) {
          reject({ kod, nazwa, ilosc, available: 0, error: 'Product not found in working_sheets' });
          return;
        }
        
        const availableQuantity = row.total_available - row.reserved;
        
        if (availableQuantity < ilosc) {
          reject({ kod, nazwa, ilosc, available: availableQuantity, error: 'Insufficient quantity' });
        } else {
          resolve({ kod, nazwa, ilosc, available: availableQuantity });
        }
      });
    });
  });
  
  // Выполняем все проверки
  Promise.all(availabilityChecks)
    .then((results) => {
      console.log('✅ All products are available for write-off');
      
      // 2. Создаем запись в таблице orders с типом 'odpisanie'
      resolveClientIdByKlient('VEIS', (clientLookupErr, veisClientId) => {
        if (clientLookupErr) {
          console.error('❌ Database error finding VEIS client for write-off:', clientLookupErr);
          return res.status(500).json({ error: clientLookupErr.message });
        }

      db.run(
        `INSERT INTO orders (client_id, klient, numer_zamowienia, data_utworzenia, laczna_ilosc, typ) VALUES (?, ?, ?, ?, ?, ?)`,
        [veisClientId, 'VEIS', numer_odpisania, dataUtworzenia, laczna_ilosc, 'odpisanie'],
        function(err) {
          if (err) {
            console.error('❌ Database error creating write-off:', err);
            return res.status(500).json({ error: err.message });
          }

          const writeoffId = this.lastID;
          console.log(`✅ Write-off created with ID: ${writeoffId}, number: ${numer_odpisania}`);

          // 3. Добавляем продукты списания в order_products
          let productsCreated = 0;
          let productsFailed = 0;
          let workingSheetsUpdated = 0;

          products.forEach((product, index) => {
            const { kod, nazwa, ilosc, powod } = product;
            
            // Создаем запись в order_products (записываем powod в поле typ)
            console.log(`📝 Creating order_products record for write-off: ${kod} (writeoffId: ${writeoffId})`);
            db.run(
              `INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ) VALUES (?, ?, ?, ?, ?)`,
              [writeoffId, kod || '', nazwa, ilosc, powod || ''],
              function(err) {
                if (err) {
                  console.error(`❌ Error creating write-off product ${index + 1}:`, err);
                  productsFailed++;
                  checkCompletion();
                } else {
                  productsCreated++;
                  console.log(`✅ Write-off product ${index + 1} created for write-off ${writeoffId}`);
                  
                  // 4. FIFO списание через consumeFromProducts (как при создании заказа)
                  if (kod) {
                    const itemStatus = (nazwa || '').includes('(samples)') ? 'samples' : null;
                    consumeFromProducts(kod, ilosc, itemStatus)
                      .then(({ consumed, remaining, consumptions }) => {
                        console.log(`🎯 FIFO consumption for ${kod}: ${consumed} szt. consumed`);
                        
                        // 5. Записываем списания партий в order_consumptions
                        if (consumptions && consumptions.length > 0) {
                          const placeholders = consumptions.map(() => '(?, ?, ?, ?, ?)').join(', ');
                          const values = consumptions.flatMap(c => [writeoffId, kod, c.batchId, c.qty, c.cena || 0]);
                          db.run(
                            `INSERT INTO order_consumptions (order_id, product_kod, batch_id, quantity, batch_price) VALUES ${placeholders}`,
                            values,
                            (consErr) => {
                              if (consErr) {
                                console.error('❌ Error saving order_consumptions for write-off:', consErr);
                              } else {
                                console.log(`✅ Saved ${consumptions.length} consumption rows for write-off ${writeoffId}`);
                              }
                              
                              // 6. Обновляем working_sheets (как при создании заказа)
                              updateWorkingSheets();
                            }
                          );
                        } else {
                          // Обновляем working_sheets даже если нет записей в order_consumptions
                          updateWorkingSheets();
                        }
                      })
                      .catch(fifoErr => {
                        console.error(`❌ Error in FIFO consumption for ${kod}:`, fifoErr);
                        // Всё равно обновляем working_sheets
                        updateWorkingSheets();
                      });
                  } else {
                    checkCompletion();
                  }
                  
                  function updateWorkingSheets() {
                    runWorkingSheetsDecrease(
                      kod,
                      ilosc,
                      { numerZamowienia: numer_odpisania },
                      function(updateErr) {
                        if (updateErr) {
                          console.error(`❌ Error updating working_sheets for product ${kod}:`, updateErr);
                        } else {
                          workingSheetsUpdated++;
                          console.log(`✅ working_sheets updated for ${kod}: reduced by ${ilosc}`);
                        }
                        checkCompletion();
                      }
                    );
                  }
                }
              }
            );
          });

          function checkCompletion() {
            if (productsCreated + productsFailed === products.length) {
              if (productsFailed > 0) {
                console.log(`⚠️ Write-off created with ${productsFailed} failed products`);
                res.status(207).json({ 
                  message: 'Write-off created with some failed products',
                  writeoffId,
                  productsCreated,
                  productsFailed,
                  workingSheetsUpdated,
                  numer_odpisania
                });
              } else {
                console.log(`✅ Write-off ${writeoffId} completed successfully`);
                res.json({ 
                  message: 'Write-off created successfully',
                  writeoffId,
                  productsCreated,
                  workingSheetsUpdated,
                  numer_odpisania
                });
              }
            }
          }
        }
      );
      });
    })
    .catch((failedProduct) => {
      console.log(`❌ Product availability check failed:`, failedProduct);
      res.status(400).json({ 
        error: 'Insufficient quantity',
        product: failedProduct.kod,
        nazwa: failedProduct.nazwa,
        requested: failedProduct.ilosc,
        available: failedProduct.available
      });
    });
});

app.put('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  let { client_id, klient, numer_zamowienia, products } = req.body;
  console.log(`📋 PUT /api/orders/${id} - Updating order:`, { client_id, klient, numer_zamowienia, productsCount: products?.length || 0 });
  
  if (!numer_zamowienia) {
    console.log('❌ Validation failed: numer_zamowienia is required');
    return res.status(400).json({ error: 'Order number is required' });
  }

  let smartUpdateOrderProducts;

  const applyOrderUpdate = (clientId, klientName, orderType) => {
    klient = klientName;
    db.all('SELECT * FROM order_products WHERE orderId = ?', [id], (err, oldOrderProducts) => {
      if (err) {
        console.error('❌ Database error fetching old order products:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      console.log(`🔄 Found ${oldOrderProducts.length} old products to restore in working_sheets`);
      console.log(`🔍 Old order products:`, JSON.stringify(oldOrderProducts, null, 2));
      
      const laczna_ilosc = products ? products.reduce((total, product) => total + (product.ilosc || 0), 0) : 0;
      
      db.run(
        'UPDATE orders SET client_id = ?, klient = ?, numer_zamowienia = ?, laczna_ilosc = ? WHERE id = ?',
        [clientId, klientName, numer_zamowienia, laczna_ilosc, id],
        function(err) {
          if (err) {
            console.error('❌ Database error updating order:', err);
            res.status(500).json({ error: err.message });
            return;
          }
          
          console.log(`✅ Order ${id} updated successfully`);
          smartUpdateOrderProducts(oldOrderProducts, clientId, orderType);
        }
      );
    });
  };

  // Запрещаем редактирование заявки, если на её основе уже создана фактура
  db.get('SELECT id, numer_faktury FROM invoices WHERE order_id = ?', [id], (err, invoice) => {
    if (err) {
      console.error('❌ Error checking invoice for order:', err);
      return res.status(500).json({ error: err.message });
    }
    if (invoice) {
      console.log(`🚫 Cannot edit order ${id}: invoice ${invoice.numer_faktury} exists`);
      return res.status(409).json({
        error: `Nie można edytować zamówienia, ponieważ na jego podstawie została wystawiona faktura ${invoice.numer_faktury}.`
      });
    }

  // Сначала проверяем тип заказа (для списаний клиент всегда VEIS)
  db.get('SELECT typ FROM orders WHERE id = ?', [id], (err, orderRow) => {
    if (err) {
      console.error('❌ Database error fetching order type:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!orderRow) {
      console.log(`❌ Order ${id} not found`);
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Для списаний и przychodów принудительно устанавливаем клиента VEIS
    if (orderRow.typ === 'odpisanie' || orderRow.typ === 'przychod') {
      resolveClientIdByKlient('VEIS', (veisErr, veisClientId) => {
        if (veisErr) {
          console.error('❌ Database error finding VEIS client:', veisErr);
          return res.status(500).json({ error: veisErr.message });
        }
        applyOrderUpdate(veisClientId, 'VEIS', orderRow.typ);
      });
      return;
    }

    if (!client_id && !klient) {
      console.log('❌ Validation failed: client_id is required');
      return res.status(400).json({ error: 'Client ID is required' });
    }

    resolveOrderClientFromBody({ client_id, klient }, (lookupErr, clientResult) => {
      if (lookupErr) {
        console.error('❌ Database error fetching client:', lookupErr);
        return res.status(500).json({ error: lookupErr.message });
      }
      if (clientResult?.error) {
        return res.status(clientResult.status || 400).json({ error: clientResult.error });
      }
      applyOrderUpdate(clientResult.clientId, clientResult.klientName, orderRow.typ);
    });
  });

  smartUpdateOrderProducts = function(oldOrderProducts, clientId, orderType) {
    console.log(`🧠 Smart update: processing ${products.length} new products against ${oldOrderProducts.length} existing products (clientId: ${clientId}, orderType: ${orderType})`);
    
    // Создаем карты для быстрого поиска - используем массивы для каждого ключа
    const oldProductsMap = {};
    const newProductsMap = {};
    
    oldOrderProducts.forEach(product => {
      const isSample = (product.nazwa || '').includes('(samples)');
      const key = `${product.kod}_${product.typ || 'sprzedaz'}_${isSample ? 'samples' : 'main'}`;
      if (!oldProductsMap[key]) {
        oldProductsMap[key] = [];
      }
      oldProductsMap[key].push(product);
    });
    
    products.forEach(product => {
      const isSample = (product.nazwa || '').includes('(samples)');
      const key = `${product.kod}_${product.typ || 'sprzedaz'}_${isSample ? 'samples' : 'main'}`;
      if (!newProductsMap[key]) {
        newProductsMap[key] = [];
      }
      newProductsMap[key].push(product);
    });
    
    console.log(`🔍 Old products map:`, Object.keys(oldProductsMap).map(k => `${k}: ${oldProductsMap[k].length} items`));
    console.log(`🔍 New products map:`, Object.keys(newProductsMap).map(k => `${k}: ${newProductsMap[k].length} items`));
    
    let operationsCompleted = 0;
    let totalOperations = 0;
    
    // Подсчитываем общее количество операций
    const operationsToProcess = [];
    
    // 1. Обрабатываем все комбинации старых и новых продуктов
    Object.keys(newProductsMap).forEach(key => {
      const newProducts = newProductsMap[key];
      const oldProducts = oldProductsMap[key] || [];
      
      // Сопоставляем старые и новые продукты по порядку
      const maxLength = Math.max(newProducts.length, oldProducts.length);
      
      for (let i = 0; i < maxLength; i++) {
        const newProduct = newProducts[i];
        const oldProduct = oldProducts[i];
        
        if (oldProduct && newProduct) {
          // Продукт существует - обновляем
          operationsToProcess.push({
            type: 'update',
            oldProduct,
            newProduct,
            key: `${key}_${i}`
          });
        } else if (newProduct && !oldProduct) {
          // Новый продукт - добавляем
          operationsToProcess.push({
            type: 'insert',
            newProduct,
            key: `${key}_${i}`
          });
        } else if (oldProduct && !newProduct) {
          // Старый продукт больше не нужен - удаляем
          operationsToProcess.push({
            type: 'delete',
            oldProduct,
            key: `${key}_${i}`
          });
        }
      }
    });
    
    // 2. Удаляем продукты, которых больше нет в новом списке (для ключей, которых нет в newProductsMap)
    Object.keys(oldProductsMap).forEach(key => {
      if (!newProductsMap[key]) {
        oldProductsMap[key].forEach((oldProduct, index) => {
          operationsToProcess.push({
            type: 'delete',
            oldProduct,
            key: `${key}_${index}`
          });
        });
      }
    });
    
    totalOperations = operationsToProcess.length;
    console.log(`📊 Total operations to perform: ${totalOperations}`);
    
    if (totalOperations === 0) {
      console.log(`💡 No changes needed`);
      res.json({ 
        message: 'Order updated successfully - no product changes',
        operationsPerformed: 0
      });
            return;
          }
          
    // Выполняем операции
    operationsToProcess.forEach(operation => {
      switch (operation.type) {
        case 'update':
          updateExistingProduct(operation.oldProduct, operation.newProduct, operation.key);
          break;
        case 'insert':
          insertNewProduct(operation.newProduct, operation.key);
          break;
        case 'delete':
          deleteUnusedProduct(operation.oldProduct, operation.key);
          break;
      }
    });
    
    function updateExistingProduct(oldProduct, newProduct, key) {
      const { kod, nazwa, ilosc, typ, kod_kreskowy } = newProduct;
      const oldQuantity = Number(oldProduct.ilosc);
      const newQuantity = Number(ilosc);
      const quantityDiff = newQuantity - oldQuantity;
      const orderProductId = oldProduct.id;
      
      console.log(`🔄 Updating existing product ${key}: ${oldQuantity} → ${newQuantity} (diff: ${quantityDiff})`);
      
      // Обновляем запись в order_products
      db.run(
        'UPDATE order_products SET ilosc = ?, nazwa = ?, kod_kreskowy = ? WHERE id = ?',
        [ilosc, nazwa, kod_kreskowy || null, oldProduct.id],
        function(err) {
          if (err) {
            console.error(`❌ Error updating product ${key}:`, err);
            operationCompleted();
            return;
          }
          
          console.log(`✅ Updated product ${key} (ID: ${oldProduct.id})`);

          // Синхронизация с таблицей komis
          if ((oldProduct.typ || 'sprzedaz') === 'komis' && quantityDiff !== 0) {
            syncKomisProduct(klient, kod, nazwa, quantityDiff, clientId);
          }

          if (quantityDiff > 0) {
            console.log(`📈 Quantity increased by ${quantityDiff}`);
            // Для przychodu логика обратная - увеличиваем working_sheets
            if (orderType === 'przychod') {
              handlePrzychodQuantityIncrease(kod, quantityDiff, () => {
                operationCompleted();
              });
            } else {
              // Для обычных заказов и rozchodu - используем стандартную логику
              handleQuantityIncrease(kod, quantityDiff, orderProductId, nazwa, () => {
                operationCompleted();
              });
            }
          } else if (quantityDiff < 0) {
            console.log(`📉 Quantity decreased by ${Math.abs(quantityDiff)}`);
            // Для przychodu логика обратная - уменьшаем working_sheets
            if (orderType === 'przychod') {
              handlePrzychodQuantityDecrease(kod, Math.abs(quantityDiff), () => {
                operationCompleted();
              });
            } else {
              // Для обычных заказов и rozchodu - используем стандартную логику
              handleQuantityDecrease(kod, Math.abs(quantityDiff), orderProductId, nazwa, newQuantity, () => {
                operationCompleted();
              });
            }
          } else {
            console.log(`➡️ Quantity unchanged`);
            operationCompleted();
          }
        }
      );
    }
    
    // Новая функция для увеличения количества (как в POST)
    function handleQuantityIncrease(kod, quantity, orderProductId, nazwa, callback) {
      console.log(`🔄 handleQuantityIncrease: ${kod} +${quantity} (clientId: ${clientId}, nazwa: ${nazwa})`);
      
      // 1. Сначала обновляем working_sheets
      runWorkingSheetsDecrease(
        kod,
        quantity,
        { numerZamowienia: numer_zamowienia },
        function(updateErr) {
          if (updateErr) {
            console.error(`❌ Error updating working_sheets for ${kod}:`, updateErr);
            callback();
            return;
          }
          console.log(`✅ Updated working_sheets: ${kod} (quantity reduced by ${quantity})`);
          
          // 2. Проверяем, есть ли у клиента резервация
          if (clientId) {
            db.get(`
              SELECT SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as available_in_reservation
              FROM reservation_products rp
              INNER JOIN reservations r ON rp.reservation_id = r.id
              WHERE rp.product_kod = ? AND r.client_id = ? AND r.status = 'aktywna'
            `, [kod, clientId], (err, reservationRow) => {
              if (err) {
                console.error(`❌ Error checking reservation for ${kod}:`, err);
                proceedWithFIFO();
                return;
              }
              
              const availableInReservation = reservationRow?.available_in_reservation || 0;
              const quantityFromReservation = Math.min(availableInReservation, quantity);
              
              console.log(`🔍 Client ${clientId} reservation for ${kod}: available=${availableInReservation}, will use=${quantityFromReservation}`);
              
              if (quantityFromReservation > 0) {
                // Обновляем ilosc_wydane в резервациях
                db.all(`
                  SELECT rp.id, rp.reservation_id, (rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as available
                  FROM reservation_products rp
                  INNER JOIN reservations r ON rp.reservation_id = r.id
                  WHERE rp.product_kod = ? AND r.client_id = ? AND r.status = 'aktywna'
                  ORDER BY r.data_utworzenia ASC
                `, [kod, clientId], (err, reservationProducts) => {
                  if (err || reservationProducts.length === 0) {
                    console.log(`⚠️ No reservation products found for ${kod}`);
                    proceedWithFIFO();
                    return;
                  }
                  
                  let remainingToFulfill = quantityFromReservation;
                  let reservationsUpdated = 0;
                  
                  reservationProducts.forEach((rp) => {
                    if (remainingToFulfill <= 0) {
                      reservationsUpdated++;
                      if (reservationsUpdated === reservationProducts.length) {
                        proceedWithFIFO();
                      }
                      return;
                    }
                    
                    const toFulfill = Math.min(remainingToFulfill, rp.available);
                    
                    db.run(
                      'UPDATE reservation_products SET ilosc_wydane = COALESCE(ilosc_wydane, 0) + ? WHERE id = ?',
                      [toFulfill, rp.id],
                      function(updateErr) {
                        if (updateErr) {
                          console.error(`❌ Error updating reservation_product ${rp.id}:`, updateErr);
                        } else {
                          console.log(`✅ Updated reservation_product ${rp.id}: ilosc_wydane +${toFulfill}`);
                          
                          // Записываем связь резервации с заказом
                          db.run(
                            'INSERT INTO reservation_order_fulfillments (reservation_product_id, order_id, order_product_id, quantity) VALUES (?, ?, ?, ?)',
                            [rp.id, id, orderProductId, toFulfill],
                            (fulfillErr) => {
                              if (fulfillErr) {
                                console.error(`❌ Error creating fulfillment:`, fulfillErr);
                              } else {
                                console.log(`✅ Created fulfillment: reservation_product ${rp.id} -> order ${id}`);
                              }
                            }
                          );
                          
                          checkAndUpdateReservationStatus(rp.reservation_id);
                        }
                        
                        reservationsUpdated++;
                        remainingToFulfill -= toFulfill;
                        
                        if (reservationsUpdated === reservationProducts.length) {
                          proceedWithFIFO();
                        }
                      }
                    );
                  });
                });
              } else {
                proceedWithFIFO();
              }
            });
          } else {
            proceedWithFIFO();
          }
          
          function proceedWithFIFO() {
            // 3. FIFO списание из партий
            const itemStatus = (nazwa || '').includes('(samples)') ? 'samples' : null;
            consumeFromProducts(kod, quantity, itemStatus)
              .then(({ consumed, remaining, consumptions }) => {
                console.log(`🎯 FIFO consumption for ${kod}: ${consumed} szt. consumed`);
                if (consumptions && consumptions.length > 0) {
                  const placeholders = consumptions.map(() => '(?, ?, ?, ?, ?)').join(', ');
                  const values = consumptions.flatMap(c => [id, kod, c.batchId, c.qty, c.cena || 0]);
                  db.run(
                    `INSERT INTO order_consumptions (order_id, product_kod, batch_id, quantity, batch_price) VALUES ${placeholders}`,
                    values,
                    (consErr) => {
                      if (consErr) {
                        console.error('❌ Error saving order_consumptions:', consErr);
                      } else {
                        console.log(`✅ Saved ${consumptions.length} consumption rows`);
                      }
                      callback();
                    }
                  );
                } else {
                  callback();
                }
              })
              .catch((fifoError) => {
                console.error(`❌ FIFO error for ${kod}:`, fifoError);
                callback();
              });
          }
        }
      );
    }
    
    // Новая функция для уменьшения количества
    function handleQuantityDecrease(kod, quantity, orderProductId, nazwa, newQuantityInOrder, callback) {
      console.log(`🔄 handleQuantityDecrease: ${kod} -${quantity} (new qty: ${newQuantityInOrder}, nazwa: ${nazwa})`);
      processQuantityDecrease(kod, quantity, callback, nazwa, newQuantityInOrder);
    }

    // Специальные функции для przychod (обратная логика)
    function handlePrzychodQuantityIncrease(kod, quantity, callback) {
      console.log(`🔄 handlePrzychodQuantityIncrease (przychód): ${kod} +${quantity} (увеличиваем working_sheets)`);
      
      // Для przychodu увеличение количества = увеличение на складе
      db.run(
        'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
        [quantity, kod],
        function(updateErr) {
          if (updateErr) {
            console.error(`❌ Error updating working_sheets for ${kod}:`, updateErr);
          } else {
            console.log(`✅ Updated working_sheets: ${kod} (quantity increased by ${quantity})`);
          }
          callback();
        }
      );
    }

    function handlePrzychodQuantityDecrease(kod, quantity, callback) {
      console.log(`🔄 handlePrzychodQuantityDecrease (przychód): ${kod} -${quantity} (уменьшаем working_sheets)`);
      
      // Для przychodu уменьшение количества = уменьшение на складе
      runWorkingSheetsDecrease(
        kod,
        quantity,
        { affectsConsumptionMetrics: false },
        function(updateErr) {
          if (updateErr) {
            console.error(`❌ Error updating working_sheets for ${kod}:`, updateErr);
          } else {
            console.log(`✅ Updated working_sheets: ${kod} (quantity decreased by ${quantity})`);
          }
          callback();
        }
      );
    }
    
    function insertNewProduct(newProduct, key) {
      const { kod, nazwa, ilosc, typ, kod_kreskowy } = newProduct;

      console.log(`➕ Inserting new product ${key}: ${ilosc} units`);

      // Создаем новую запись в order_products
      db.run(
        'INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ, kod_kreskowy) VALUES (?, ?, ?, ?, ?, ?)',
        [id, kod, nazwa, ilosc, typ || 'sprzedaz', kod_kreskowy || null],
        function(err) {
          if (err) {
            console.error(`❌ Error inserting product ${key}:`, err);
            operationCompleted();
          } else {
            const orderProductId = this.lastID;
            console.log(`✅ Inserted new product ${key} (ID: ${orderProductId})`);

            // Синхронизация с таблицей komis
            if ((typ || 'sprzedaz') === 'komis') {
              syncKomisProduct(klient, kod, nazwa, Number(ilosc), clientId);
            }

            // Для przychodu используем специальную функцию
            if (orderType === 'przychod') {
              handlePrzychodQuantityIncrease(kod, Number(ilosc), () => {
                operationCompleted();
              });
            } else {
              // Используем новую функцию handleQuantityIncrease (как в POST)
              handleQuantityIncrease(kod, Number(ilosc), orderProductId, nazwa, () => {
                operationCompleted();
              });
            }
          }
        }
      );
    }
    
    function deleteUnusedProduct(oldProduct, key) {
      const { kod, ilosc } = oldProduct;
      const oldIsSample = (oldProduct.nazwa || '').includes('(samples)');
      
      console.log(`🗑️ Deleting unused product ${key}: ${ilosc} units (isSample: ${oldIsSample})`);
      
      // Проверяем, есть ли новый продукт с тем же кодом (замена типа)
      // ВАЖНО: sample и обычный товар с одним kod — разные позиции, замена возможна
      // только в рамках одной категории (main↔main или samples↔samples)
      const newProductWithSameCode = products.find(p => {
        const newIsSample = (p.nazwa || '').includes('(samples)');
        return p.kod === kod && p.typ !== oldProduct.typ && newIsSample === oldIsSample;
      });
      
      if (newProductWithSameCode) {
        // Это замена типа - обновляем order_consumptions вместо удаления
        console.log(`🔄 Type replacement detected: ${oldProduct.typ} → ${newProductWithSameCode.typ}`);
        
        // Обновляем order_consumptions для связи с новым продуктом
        db.run(
          'UPDATE order_consumptions SET product_kod = ? WHERE order_id = ? AND product_kod = ?',
          [kod, id, kod], // product_kod остается тем же, но связь обновляется
          function(err) {
            if (err) {
              console.error(`❌ Error updating order_consumptions for ${key}:`, err);
            } else {
              console.log(`✅ Updated order_consumptions for type replacement ${key}`);
            }
            
            // Удаляем старую запись из order_products
            db.run(
              'DELETE FROM order_products WHERE id = ?',
              [oldProduct.id],
              function(deleteErr) {
                if (deleteErr) {
                  console.error(`❌ Error deleting product ${key}:`, deleteErr);
                  operationCompleted();
                } else {
                  console.log(`✅ Deleted old product ${key} (ID: ${oldProduct.id})`);

                  // Синхронизация с таблицей komis (при замене типа)
                  if ((oldProduct.typ || 'sprzedaz') === 'komis') {
                    syncKomisProduct(klient, kod, oldProduct.nazwa, -Number(ilosc), clientId);
                  }

                  // Восстанавливаем количество в working_sheets
                  // Для przychodu используем специальную функцию
                  if (orderType === 'przychod') {
                    handlePrzychodQuantityDecrease(kod, Number(ilosc), () => {
                      operationCompleted();
                    });
                  } else {
                    processQuantityDecrease(kod, Number(ilosc), () => {
                      operationCompleted();
                    }, oldProduct.nazwa, 0);
                  }
                }
              }
            );
          }
        );
      } else {
        // Обычное удаление продукта
        db.run(
          'DELETE FROM order_products WHERE id = ?',
          [oldProduct.id],
          function(err) {
            if (err) {
              console.error(`❌ Error deleting product ${key}:`, err);
              operationCompleted();
            } else {
              console.log(`✅ Deleted unused product ${key} (ID: ${oldProduct.id})`);

              // Синхронизация с таблицей komis
              if ((oldProduct.typ || 'sprzedaz') === 'komis') {
                syncKomisProduct(klient, kod, oldProduct.nazwa, -Number(ilosc), clientId);
              }

              // Восстанавливаем количество в working_sheets
              // Для przychodu используем специальную функцию
              if (orderType === 'przychod') {
                handlePrzychodQuantityDecrease(kod, Number(ilosc), () => {
                  operationCompleted();
                });
              } else {
                processQuantityDecrease(kod, Number(ilosc), () => {
                  operationCompleted();
                }, oldProduct.nazwa, 0);
              }
            }
      }
    );
      }
    }
    
    function operationCompleted() {
      operationsCompleted++;
      console.log(`📊 Operations completed: ${operationsCompleted}/${totalOperations}`);
      
      if (operationsCompleted === totalOperations) {
        console.log(`✅ Smart update complete: ${totalOperations} operations performed`);
        res.json({ 
          message: 'Order updated successfully with smart product management',
          operationsPerformed: totalOperations
        });
      }
    }
  }
  
  function processQuantityChanges(oldOrderProducts) {
    if (!products || products.length === 0) {
      console.log('💡 No new products to process');
      res.json({ 
        message: 'Order updated successfully',
        workingSheetsUpdated: 0,
        workingSheetsRestored: 0
      });
      return;
    }
    
    console.log(`🔄 Processing quantity changes for ${products.length} products`);
    
    // Создаем map старых продуктов для быстрого поиска (по коду + типу + samples/main)
    // Включаем флаг samples в ключ, чтобы обычный и sample товары не сливались
    const oldProductsMap = {};
    oldOrderProducts.forEach(product => {
      const isSample = (product.nazwa || '').includes('(samples)');
      const key = `${product.kod}_${product.typ || 'sprzedaz'}_${isSample ? 'samples' : 'main'}`;
      oldProductsMap[key] = product;
    });
    
    console.log(`🔍 Old products map:`, JSON.stringify(oldProductsMap, null, 2));
    console.log(`🔍 New products:`, JSON.stringify(products, null, 2));
    
    // Анализируем изменения для каждого продукта
    let productsProcessed = 0;
    let totalProducts = products.length;
          
          products.forEach((product, index) => {
            const { kod, nazwa, ilosc, typ, kod_kreskowy } = product;
            const isSample = (nazwa || '').includes('(samples)');
            const key = `${kod}_${typ || 'sprzedaz'}_${isSample ? 'samples' : 'main'}`;
            const oldProduct = oldProductsMap[key];
            const oldQuantity = oldProduct ? Number(oldProduct.ilosc) : 0;
            const newQuantity = Number(ilosc);
            const quantityDiff = newQuantity - oldQuantity;
            
            console.log(`🔍 Product comparison for ${kod} (${typ || 'sprzedaz'}):`);
            console.log(`  - Search key: ${key}`);
            console.log(`  - New product: ${kod} x${newQuantity} (${typ || 'sprzedaz'})`);
            console.log(`  - Old product: ${oldProduct ? `${oldProduct.kod} x${oldProduct.ilosc} (${oldProduct.typ || 'sprzedaz'})` : 'NOT FOUND'}`);
            console.log(`  - Quantity diff: ${quantityDiff}`);
            console.log(`  - Action: ${quantityDiff > 0 ? 'INCREASE' : quantityDiff < 0 ? 'DECREASE' : 'NO CHANGE'}`);
      
              console.log(`📊 Product ${kod}: was ${oldQuantity}, now ${newQuantity}, diff: ${quantityDiff > 0 ? '+' : ''}${quantityDiff}`);
        console.log(`🔍 Debug: oldProduct = ${JSON.stringify(oldProduct)}, quantityDiff calculation: ${newQuantity} - ${oldQuantity} = ${quantityDiff}`);
            
            // Создаем запись в order_products
            db.run(
              'INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ, kod_kreskowy) VALUES (?, ?, ?, ?, ?, ?)',
              [id, kod, nazwa, ilosc, typ || 'sprzedaz', kod_kreskowy || null],
              function(err) {
                if (err) {
                  console.error(`❌ Error creating new product ${index + 1}:`, err);
            productsProcessed++;
                  checkCompletion();
                } else {
                  console.log(`✅ New product ${index + 1} created for order ${id}`);
                  
            // Обрабатываем изменения в количестве
            console.log(`🔍 Processing quantity changes for ${kod}: quantityDiff = ${quantityDiff}`);
            
            // Если продукт новый (не найден в старых), проверяем логику замены типа
            if (!oldProduct) {
              // Проверяем, есть ли продукт с таким же кодом, но другим типом
              const sameCodeProduct = oldOrderProducts.find(p => p.kod === kod && p.typ !== (typ || 'sprzedaz'));
              
              if (sameCodeProduct) {
                // Это замена типа - анализируем, что происходит
                const oldTypeQuantity = sameCodeProduct.ilosc;
                const newTypeQuantity = newQuantity;
                
                console.log(`🔄 Type replacement detected for ${kod}: ${sameCodeProduct.typ || 'sprzedaz'} → ${typ || 'sprzedaz'}`);
                console.log(`📊 Old type quantity: ${oldTypeQuantity}, New type quantity: ${newTypeQuantity}`);
                
                if (newTypeQuantity === 0) {
                  // Новый тип с количеством 0 = удаление старого типа
                  console.log(`🗑️ Removing old type ${sameCodeProduct.typ || 'sprzedaz'} (quantity: ${oldTypeQuantity})`);
                  processQuantityDecrease(kod, oldTypeQuantity, () => {
                    productsProcessed++;
                    checkCompletion();
                  }, sameCodeProduct.nazwa, 0);
                } else {
                  // Замена типа с новым количеством
                  const quantityDiff = newTypeQuantity - oldTypeQuantity;
                  console.log(`📈 Type replacement: ${quantityDiff > 0 ? 'increase' : 'decrease'} by ${Math.abs(quantityDiff)}`);
                  
                  if (quantityDiff > 0) {
                    // Новое количество больше - списываем разницу
                    processQuantityIncrease(kod, quantityDiff, () => {
                      productsProcessed++;
                      checkCompletion();
                    }, null, nazwa);
                  } else if (quantityDiff < 0) {
                    // Новое количество меньше - восстанавливаем разницу
                    processQuantityDecrease(kod, Math.abs(quantityDiff), () => {
                      productsProcessed++;
                      checkCompletion();
                    }, nazwa, newTypeQuantity);
                  } else {
                    // Количество одинаковое - только замена типа
                    console.log(`🔄 Type changed, quantity unchanged`);
                    productsProcessed++;
                    checkCompletion();
                  }
                }
              } else {
                // Действительно новый продукт
                console.log(`➕ New product ${kod}: processing ${newQuantity} units`);
                processQuantityIncrease(kod, newQuantity, () => {
                  productsProcessed++;
                  checkCompletion();
                }, null, nazwa);
              }
            } else if (quantityDiff !== 0) {
              if (quantityDiff > 0) {
                // Количество увеличилось - списываем разницу
                console.log(`📈 Product ${kod}: quantity increased by ${quantityDiff}`);
                processQuantityIncrease(kod, quantityDiff, () => {
                  productsProcessed++;
                  checkCompletion();
                }, null, nazwa);
              } else {
                // Количество уменьшилось - восстанавливаем разницу
                const restoreQuantity = Math.abs(quantityDiff);
                console.log(`📉 Product ${kod}: quantity decreased by ${restoreQuantity}`);
                processQuantityDecrease(kod, restoreQuantity, () => {
                  productsProcessed++;
                  checkCompletion();
                }, nazwa, newQuantity);
              }
            } else {
              // Количество не изменилось - проверяем синхронизацию с working_sheets
              console.log(`➡️ Product ${kod}: quantity unchanged, checking working_sheets sync`);
              db.get('SELECT ilosc FROM working_sheets WHERE kod = ?', [kod], (err, row) => {
                if (err) {
                  console.error(`❌ Error checking working_sheets for ${kod}:`, err);
              productsProcessed++;
              checkCompletion();
                  return;
                }
                
                if (!row) {
                  console.log(`⚠️ Product ${kod} not found in working_sheets`);
                  productsProcessed++;
                  checkCompletion();
                  return;
                }
                
                console.log(`📊 working_sheets sync check: order quantity = ${ilosc}, working_sheets quantity = ${row.ilosc}`);
                productsProcessed++;
                checkCompletion();
              });
            }
          }
        }
      );
    });
    
    function checkCompletion() {
      if (productsProcessed === totalProducts) {
        if (res.headersSent) {
          console.log('⚠️ Response already sent, skipping checkCompletion');
          return;
        }
        
        console.log(`✅ Order update complete: ${totalProducts} products processed`);
        res.json({ 
          message: 'Order updated successfully with smart FIFO updates',
          productsProcessed: totalProducts
        });
      }
    }
  }
  
  // Функция для обработки увеличения количества продукта
  function processQuantityIncrease(productKod, quantityDiff, callback, orderProductId = null, nazwa = null) {
    console.log(`🔄 Processing quantity increase for ${productKod}: +${quantityDiff} (clientId: ${clientId}, orderProductId: ${orderProductId})`);
    console.log(`🔍 processQuantityIncrease called with: productKod=${productKod}, quantityDiff=${quantityDiff}`);
    console.log(`🔍 processQuantityIncrease: starting FIFO consumption...`);
    
    // Проверяем, есть ли у клиента резервация на этот товар
    const checkClientReservation = (afterReservationCallback) => {
      if (!clientId) {
        console.log(`🔍 No clientId, skipping reservation check for ${productKod}`);
        afterReservationCallback(0); // quantityFromReservation = 0
        return;
      }
      
      db.get(`
        SELECT
          SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as available_in_reservation
        FROM reservation_products rp
        INNER JOIN reservations r ON rp.reservation_id = r.id
        WHERE rp.product_kod = ?
          AND r.client_id = ?
          AND r.status = 'aktywna'
      `, [productKod, clientId], (err, reservationRow) => {
        if (err) {
          console.error(`❌ Error checking client reservation for ${productKod}:`, err);
          afterReservationCallback(0);
          return;
        }
        
        const availableInReservation = reservationRow?.available_in_reservation || 0;
        const quantityFromReservation = Math.min(availableInReservation, quantityDiff);
        
        console.log(`🔍 Client ${clientId} reservation for ${productKod}: available=${availableInReservation}, will use=${quantityFromReservation}`);
        
        if (quantityFromReservation > 0) {
          // Обновляем ilosc_wydane в резервациях клиента
          db.all(`
            SELECT rp.id, rp.reservation_id, (rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as available
            FROM reservation_products rp
            INNER JOIN reservations r ON rp.reservation_id = r.id
            WHERE rp.product_kod = ?
              AND r.client_id = ?
              AND r.status = 'aktywna'
            ORDER BY r.data_utworzenia ASC
          `, [productKod, clientId], (err, reservationProducts) => {
            if (err) {
              console.error(`❌ Error fetching reservation products for ${productKod}:`, err);
              afterReservationCallback(quantityFromReservation);
              return;
            }
            
            if (reservationProducts.length === 0) {
              console.log(`⚠️ No reservation products found for ${productKod} and client ${clientId}`);
              afterReservationCallback(quantityFromReservation);
              return;
            }
            
            // Распределяем количество по резервациям (FIFO)
            let remainingToFulfill = quantityFromReservation;
            let reservationsUpdated = 0;
            
            reservationProducts.forEach((rp) => {
              if (remainingToFulfill <= 0) {
                reservationsUpdated++;
                if (reservationsUpdated === reservationProducts.length) {
                  afterReservationCallback(quantityFromReservation);
                }
                return;
              }
              
              const toFulfill = Math.min(remainingToFulfill, rp.available);
              
              db.run(
                'UPDATE reservation_products SET ilosc_wydane = COALESCE(ilosc_wydane, 0) + ? WHERE id = ?',
                [toFulfill, rp.id],
                function(updateErr) {
                  if (updateErr) {
                    console.error(`❌ Error updating reservation_product ${rp.id}:`, updateErr);
                  } else {
                    console.log(`✅ Updated reservation_product ${rp.id}: ilosc_wydane increased by ${toFulfill}`);
                    
                    // Записываем связь между резервацией и заказом
                    if (orderProductId) {
                      db.run(
                        'INSERT INTO reservation_order_fulfillments (reservation_product_id, order_id, order_product_id, quantity) VALUES (?, ?, ?, ?)',
                        [rp.id, id, orderProductId, toFulfill],
                        (fulfillErr) => {
                          if (fulfillErr) {
                            console.error(`❌ Error creating fulfillment record for reservation_product ${rp.id}:`, fulfillErr);
                          } else {
                            console.log(`✅ Created fulfillment record: reservation_product ${rp.id} -> order ${id}, quantity: ${toFulfill}`);
                          }
                        }
                      );
                    }
                    
                    // Проверяем, полностью ли реализована резервация
                    checkAndUpdateReservationStatus(rp.reservation_id);
                  }
                  
                  reservationsUpdated++;
                  remainingToFulfill -= toFulfill;
                  
                  if (reservationsUpdated === reservationProducts.length) {
                    afterReservationCallback(quantityFromReservation);
                  }
                }
              );
            });
          });
        } else {
          afterReservationCallback(0);
        }
      });
    };
    
    // Проверяем доступность товара с учетом активных резерваций
    console.log(`🔍 processQuantityIncrease: checking availability in working_sheets for ${productKod}`);
    db.get(`
      SELECT 
        ws.ilosc as total_available,
        COALESCE(SUM(CASE 
          WHEN r.status = 'aktywna' 
          THEN rp.ilosc - COALESCE(rp.ilosc_wydane, 0)
          ELSE 0 
        END), 0) as reserved,
        COALESCE(SUM(CASE 
          WHEN r.status = 'aktywna' AND r.client_id = ?
          THEN rp.ilosc - COALESCE(rp.ilosc_wydane, 0)
          ELSE 0 
        END), 0) as client_reserved
      FROM working_sheets ws
      LEFT JOIN reservation_products rp ON ws.kod = rp.product_kod
      LEFT JOIN reservations r ON rp.reservation_id = r.id
      WHERE ws.kod = ?
      GROUP BY ws.kod, ws.ilosc
    `, [clientId || 0, productKod], (err, row) => {
      if (err) {
        console.error(`❌ Error checking availability for ${productKod}:`, err);
        callback();
        return;
      }
      
      if (!row) {
        console.error(`❌ Product ${productKod} not found in working_sheets`);
        callback();
        return;
      }
      
      // Доступно: общее количество - резервации других клиентов (резервации этого клиента доступны для него)
      const reservedByOthers = row.reserved - (row.client_reserved || 0);
      const availableQuantity = row.total_available - reservedByOthers;
      console.log(`🔍 processQuantityIncrease: available quantity in working_sheets = ${availableQuantity} (total: ${row.total_available}, reserved: ${row.reserved}, client_reserved: ${row.client_reserved})`);
      
      if (availableQuantity < quantityDiff) {
        console.error(`❌ Insufficient quantity for ${productKod}: need ${quantityDiff}, available ${availableQuantity}`);
        callback();
        return;
      }
      
      // Сначала обрабатываем резервации клиента
      checkClientReservation((quantityFromReservation) => {
        // Товар доступен, списываем разницу по FIFO
        const itemStatus = (nazwa || '').includes('(samples)') ? 'samples' : null;
        console.log(`🎯 FIFO consumption for ${productKod}: ${quantityDiff} szt. (${quantityFromReservation} from reservation, status: ${itemStatus || 'main'})`);
        console.log(`🔍 processQuantityIncrease: calling consumeFromProducts...`);
        consumeFromProducts(productKod, quantityDiff, itemStatus)
          .then(({ consumed, remaining, consumptions }) => {
            console.log(`🎯 FIFO consumption for ${productKod}: ${consumed} szt. consumed`);
            // Записываем списания партий в order_consumptions
            if (consumptions && consumptions.length > 0) {
              const placeholders = consumptions.map(() => '(?, ?, ?, ?, ?)').join(', ');
              const values = consumptions.flatMap(c => [id, productKod, c.batchId, c.qty, c.cena || 0]);
              db.run(
                `INSERT INTO order_consumptions (order_id, product_kod, batch_id, quantity, batch_price) VALUES ${placeholders}`,
                values,
                (consErr) => {
                  if (consErr) {
                    console.error('❌ Error saving order_consumptions:', consErr);
                  } else {
                    console.log(`✅ Saved ${consumptions.length} consumption rows for order ${id}`);
                  }
                  // Обновляем working_sheets после FIFO списания
                  runWorkingSheetsDecrease(
                    productKod,
                    quantityDiff,
                    { numerZamowienia: numer_zamowienia },
                    function(updateErr) {
                      if (updateErr) {
                        console.error(`❌ Error updating working_sheets after FIFO for ${productKod}:`, updateErr);
                      } else {
                        console.log(`✅ Updated working_sheets after FIFO: ${productKod} (quantity reduced by ${quantityDiff})`);
                      }
                      callback();
                    }
                  );
                }
              );
            } else {
              // Обновляем working_sheets даже если нет записей в order_consumptions
              runWorkingSheetsDecrease(
                productKod,
                quantityDiff,
                { numerZamowienia: numer_zamowienia },
                function(updateErr) {
                  if (updateErr) {
                    console.error(`❌ Error updating working_sheets after FIFO for ${productKod}:`, updateErr);
                  } else {
                    console.log(`✅ Updated working_sheets after FIFO: ${productKod} (quantity reduced by ${quantityDiff})`);
                  }
                  callback();
                }
              );
            }
          })
          .catch((fifoError) => {
            console.error(`❌ FIFO consumption error for ${productKod}:`, fifoError);
            callback();
          });
      });
    });
  }
  
  // Функция для обработки уменьшения количества продукта
  function processQuantityDecrease(productKod, quantityDiff, callback, nazwa = null, newQuantityInOrder = 0) {
    const isSamples = (nazwa || '').includes('(samples)');
    console.log(`🔄 Processing quantity decrease for ${productKod}: -${quantityDiff} (new qty in order: ${newQuantityInOrder}, samples: ${isSamples})`);
    console.log(`🔍 processQuantityDecrease: starting restoration process...`);
    
    db.all(`
      SELECT rof.*, rp.product_kod, rp.reservation_id
      FROM reservation_order_fulfillments rof
      INNER JOIN reservation_products rp ON rof.reservation_product_id = rp.id
      WHERE rof.order_id = ? AND rp.product_kod = ?
      ORDER BY rof.created_at DESC
    `, [id, productKod], (err, fulfillments) => {
      if (err) {
        console.error(`❌ Error fetching fulfillments for ${productKod}:`, err);
        proceedWithConsumptions();
        return;
      }
      
      const R_old = (fulfillments || []).reduce((sum, f) => sum + f.quantity, 0);
      const R_new = Math.min(newQuantityInOrder, R_old);
      const R_restore = R_old - R_new;
      
      console.log(`📊 Reservation-first decrease: R_old=${R_old}, R_new=${R_new}, R_restore=${R_restore}, warehouse_restore=${quantityDiff}`);
      
      if (R_restore <= 0 || fulfillments.length === 0) {
        console.log(`💡 Keeping ${R_new} szt. from reservation in order for ${productKod}`);
        proceedWithConsumptions();
        return;
      }
      
      let remainingToRestoreFromReservation = R_restore;
      let fulfillmentsProcessed = 0;
      
      fulfillments.forEach((fulfillment) => {
        if (remainingToRestoreFromReservation <= 0) {
          fulfillmentsProcessed++;
          if (fulfillmentsProcessed === fulfillments.length) {
            proceedWithConsumptions();
          }
          return;
        }
        
        const toRestore = Math.min(remainingToRestoreFromReservation, fulfillment.quantity);
        const newFulfillmentQuantity = fulfillment.quantity - toRestore;
        
        db.run(
          'UPDATE reservation_products SET ilosc_wydane = COALESCE(ilosc_wydane, 0) - ? WHERE id = ?',
          [toRestore, fulfillment.reservation_product_id],
          function(updateErr) {
            if (updateErr) {
              console.error(`❌ Error restoring ilosc_wydane for reservation_product ${fulfillment.reservation_product_id}:`, updateErr);
            } else {
              console.log(`✅ Restored ilosc_wydane for reservation_product ${fulfillment.reservation_product_id}: -${toRestore}`);
              checkAndUpdateReservationStatus(fulfillment.reservation_id);
            }
            
            if (newFulfillmentQuantity <= 0) {
              db.run(
                'DELETE FROM reservation_order_fulfillments WHERE id = ?',
                [fulfillment.id],
                function(deleteErr) {
                  if (deleteErr) {
                    console.error(`❌ Error deleting fulfillment ${fulfillment.id}:`, deleteErr);
                  }
                  fulfillmentsProcessed++;
                  if (fulfillmentsProcessed === fulfillments.length) {
                    proceedWithConsumptions();
                  }
                }
              );
            } else {
              db.run(
                'UPDATE reservation_order_fulfillments SET quantity = ? WHERE id = ?',
                [newFulfillmentQuantity, fulfillment.id],
                function(updateFulfillErr) {
                  if (updateFulfillErr) {
                    console.error(`❌ Error updating fulfillment ${fulfillment.id}:`, updateFulfillErr);
                  }
                  fulfillmentsProcessed++;
                  if (fulfillmentsProcessed === fulfillments.length) {
                    proceedWithConsumptions();
                  }
                }
              );
            }
          }
        );
        
        remainingToRestoreFromReservation -= toRestore;
      });
    });
    
    function proceedWithConsumptions() {
      // Получаем существующие записи в order_consumptions для этого продукта
      // Фильтруем по статусу партии (samples/main), чтобы восстанавливать только из нужных
      // Сортируем по batch_id DESC для LIFO возвратов (сначала новые партии)
      const consumptionsSql = isSamples
        ? `SELECT oc.* FROM order_consumptions oc
           INNER JOIN products p ON p.id = oc.batch_id
           WHERE oc.order_id = ? AND oc.product_kod = ? AND p.czy_probki = 1
           ORDER BY oc.batch_id DESC`
        : `SELECT oc.* FROM order_consumptions oc
           INNER JOIN products p ON p.id = oc.batch_id
           WHERE oc.order_id = ? AND oc.product_kod = ? AND COALESCE(p.czy_probki, 0) = 0
           ORDER BY oc.batch_id DESC`;
      db.all(consumptionsSql, [id, productKod], (err, consumptions) => {
        if (err) {
          console.error(`❌ Error fetching consumptions for ${productKod}:`, err);
          callback();
          return;
        }
        
        if (consumptions.length === 0) {
          console.log(`⚠️ No consumptions found for ${productKod}, restoring only in working_sheets`);
          // Просто восстанавливаем в working_sheets
          db.run(
            'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
            [quantityDiff, productKod],
            function(updateErr) {
              if (updateErr) {
                console.error(`❌ Error updating working_sheets for ${productKod}:`, updateErr);
              } else {
                console.log(`✅ Updated working_sheets: ${productKod} (quantity restored by ${quantityDiff})`);
              }
              callback();
            }
          );
          return;
        }
        
        console.log(`📊 Found ${consumptions.length} consumptions for ${productKod}`);
        console.log(`🔍 Consumptions details:`, JSON.stringify(consumptions, null, 2));
        
        // Восстанавливаем количество в products и уменьшаем/удаляем записи в order_consumptions
        let remainingToRestore = quantityDiff;
        let consumptionsProcessed = 0;
        
        consumptions.forEach((consumption) => {
          if (remainingToRestore <= 0) {
            consumptionsProcessed++;
            checkConsumptionCompletion();
            return;
          }
          
          // Восстанавливаем то количество, которое было списано из этой партии
          const quantityToRestore = Math.min(remainingToRestore, consumption.quantity);
          const newQuantity = consumption.quantity - quantityToRestore;
          
          console.log(`🔍 Restoring from consumption ${consumption.id}: batch_id=${consumption.batch_id}, original_quantity=${consumption.quantity}, to_restore=${quantityToRestore}, new_quantity=${newQuantity}`);
          
          if (newQuantity > 0) {
            // Уменьшаем количество в существующей записи
            db.run(
              'UPDATE order_consumptions SET quantity = ? WHERE id = ?',
              [newQuantity, consumption.id],
              function(updateErr) {
                if (updateErr) {
                  console.error(`❌ Error updating consumption ${consumption.id}:`, updateErr);
                } else {
                  console.log(`✅ Updated consumption ${consumption.id}: ${consumption.quantity} → ${newQuantity}`);
                }
                
                // Восстанавливаем в конкретную партию (batch_id)
                db.run(
                  'UPDATE products SET ilosc_aktualna = ilosc_aktualna + ? WHERE id = ?',
                  [quantityToRestore, consumption.batch_id],
                  function(restoreErr) {
                    if (restoreErr) {
                      console.error(`❌ Error restoring to batch ${consumption.batch_id}:`, restoreErr);
                    } else {
                      console.log(`✅ Restored ${quantityToRestore} to batch ${consumption.batch_id} for ${productKod}`);
                    }
                    consumptionsProcessed++;
                    checkConsumptionCompletion();
                  }
                );
              }
            );
          } else {
            // Удаляем запись, если количество стало 0
            db.run(
              'DELETE FROM order_consumptions WHERE id = ?',
              [consumption.id],
              function(deleteErr) {
                if (deleteErr) {
                  console.error(`❌ Error deleting consumption ${consumption.id}:`, deleteErr);
                } else {
                  console.log(`🗑️ Deleted consumption ${consumption.id} (quantity became 0)`);
                }
                
                // Восстанавливаем в конкретную партию (batch_id)
                db.run(
                  'UPDATE products SET ilosc_aktualna = ilosc_aktualna + ? WHERE id = ?',
                  [quantityToRestore, consumption.batch_id],
                  function(restoreErr) {
                    if (restoreErr) {
                      console.error(`❌ Error restoring to batch ${consumption.batch_id}:`, restoreErr);
                    } else {
                      console.log(`✅ Restored ${quantityToRestore} to batch ${consumption.batch_id} for ${productKod}`);
                    }
                    consumptionsProcessed++;
                    checkConsumptionCompletion();
                  }
                );
              }
            );
          }
          
          remainingToRestore -= quantityToRestore;
        });
        
        function checkConsumptionCompletion() {
          if (consumptionsProcessed === consumptions.length) {
            // Обновляем working_sheets
            db.run(
              'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
              [quantityDiff, productKod],
              function(updateErr) {
                if (updateErr) {
                  console.error(`❌ Error updating working_sheets for ${productKod}:`, updateErr);
                } else {
                  console.log(`✅ Updated working_sheets: ${productKod} (quantity restored by ${quantityDiff})`);
                }
                callback();
              }
            );
          }
        }
      });
    }
  }
  }); // db.get invoice check
});

app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📋 DELETE /api/orders/${id} - Deleting order`);

  // Запрещаем удаление заявки, если на её основе уже создана фактура
  db.get('SELECT id, numer_faktury FROM invoices WHERE order_id = ?', [id], (err, invoice) => {
    if (err) {
      console.error('❌ Error checking invoice for order:', err);
      return res.status(500).json({ error: err.message });
    }
    if (invoice) {
      console.log(`🚫 Cannot delete order ${id}: invoice ${invoice.numer_faktury} exists`);
      return res.status(409).json({
        error: `Nie można usunąć zamówienia, ponieważ na jego podstawie została wystawiona faktura ${invoice.numer_faktury}. Najpierw usuń fakturę.`
      });
    }

  db.get('SELECT typ FROM orders WHERE id = ?', [id], (err, orderRow) => {
    if (err) {
      console.error('❌ Database error fetching order type:', err);
      return res.status(500).json({ error: err.message });
    }
    const orderType = orderRow ? orderRow.typ : null;
    console.log(`🔍 Order ${id} type: ${orderType}`);

  // Сначала получаем продукты заказа для восстановления количества
  db.all('SELECT * FROM order_products WHERE orderId = ?', [id], (err, orderProducts) => {
    if (err) {
      console.error('❌ Database error fetching order products:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`🔄 Found ${orderProducts.length} products to restore`);
    
    // Получаем записи о списаниях для восстановления в products
    db.all('SELECT * FROM order_consumptions WHERE order_id = ?', [id], (err, consumptions) => {
      if (err) {
        console.error('❌ Database error fetching order consumptions:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      console.log(`🔄 Found ${consumptions.length} consumptions to restore in products`);
      
      // Получаем записи о выдачах из резерваций для восстановления ilosc_wydane (включая reservation_id)
      db.all(`
        SELECT rof.*, rp.reservation_id
        FROM reservation_order_fulfillments rof
        INNER JOIN reservation_products rp ON rof.reservation_product_id = rp.id
        WHERE rof.order_id = ?
      `, [id], (err, fulfillments) => {
        if (err) {
          console.error('❌ Database error fetching reservation fulfillments:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        console.log(`🔄 Found ${fulfillments.length} reservation fulfillments to restore`);
        
        // 0. Восстанавливаем ilosc_wydane в reservation_products
        let fulfillmentsRestored = 0;
        const totalFulfillments = fulfillments.length;
        
        const proceedAfterFulfillmentsRestore = () => {
          // 1. Восстанавливаем количество в products для каждой партии
          let consumptionsRestored = 0;
          const totalConsumptions = consumptions.length;
          
          const proceedAfterProductsRestore = () => {
            // 2. Удаляем записи о выдачах из резерваций
            db.run('DELETE FROM reservation_order_fulfillments WHERE order_id = ?', [id], function(deleteFulfillmentsErr) {
              if (deleteFulfillmentsErr) {
                console.error('❌ Database error deleting reservation fulfillments:', deleteFulfillmentsErr);
                // Продолжаем даже при ошибке, так как CASCADE должен удалить их автоматически
              } else {
                console.log(`🗑️ Reservation fulfillments deleted for order ${id}`);
              }
              
              // 3. Удаляем записи о списаниях
              db.run('DELETE FROM order_consumptions WHERE order_id = ?', [id], function(deleteConsumptionsErr) {
                if (deleteConsumptionsErr) {
                  console.error('❌ Database error deleting order consumptions:', deleteConsumptionsErr);
                  res.status(500).json({ error: deleteConsumptionsErr.message });
                  return;
                }
                
                console.log(`🗑️ Order consumptions deleted for order ${id}`);
                
                // 4. Удаляем продукты заказа
                db.run('DELETE FROM order_products WHERE orderId = ?', [id], function(deleteProductsErr) {
                  if (deleteProductsErr) {
                    console.error('❌ Database error deleting order products:', deleteProductsErr);
                    res.status(500).json({ error: deleteProductsErr.message });
                    return;
                  }
                  
                  console.log(`🗑️ Order products deleted for order ${id}`);
                  
                  // 5. Удаляем заказ
                  db.run('DELETE FROM orders WHERE id = ?', [id], function(err) {
                    if (err) {
                      console.error('❌ Database error deleting order:', err);
                      res.status(500).json({ error: err.message });
                      return;
                    }
                    
                    console.log(`✅ Order ${id} deleted successfully`);
                    
                    // 6. Восстанавливаем количество в working_sheets
                    // Для przesunięcie склад не трогаем — товар был списан ещё при исходном заказе
                    if (orderType === 'przesuniecie') {
                      console.log(`💡 Przesunięcie order ${id}: skipping working_sheets restoration`);
                      return res.json({
                        message: 'Order deleted successfully',
                        workingSheetsRestored: 0,
                        productsRestored: consumptionsRestored,
                        reservationFulfillmentsRestored: fulfillmentsRestored
                      });
                    }

                    let restoredCount = 0;
                    let totalProducts = orderProducts.length;
                    
                    if (totalProducts === 0) {
                      console.log('💡 No products to restore in working_sheets');
                      res.json({ 
                        message: 'Order deleted successfully',
                        workingSheetsRestored: 0,
                        productsRestored: consumptionsRestored,
                        reservationFulfillmentsRestored: fulfillmentsRestored
                      });
                      return;
                    }
                    
                    orderProducts.forEach((product) => {
                      db.run(
                        'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
                        [product.ilosc, product.kod],
                        function(restoreErr) {
                          restoredCount++;
                          if (restoreErr) {
                            console.error(`❌ Error restoring quantity in working_sheets for product ${product.kod}:`, restoreErr);
                          } else {
                            console.log(`✅ Restored quantity in working_sheets for product ${product.kod}: +${product.ilosc}`);
                          }
                          
                          if (restoredCount === totalProducts) {
                            console.log(`📊 Working sheets restored: ${restoredCount}/${totalProducts} products`);
                            res.json({ 
                              message: 'Order deleted successfully',
                              workingSheetsRestored: restoredCount,
                              productsRestored: consumptionsRestored,
                              reservationFulfillmentsRestored: fulfillmentsRestored
                            });
                          }
                        }
                      );
                    });
                  });
                });
              });
            });
          };
          
          // Восстанавливаем каждую партию в products
          if (totalConsumptions === 0) {
            console.log('💡 No consumptions to restore in products');
            proceedAfterProductsRestore();
          } else {
            consumptions.forEach((consumption) => {
              db.run(
                'UPDATE products SET ilosc_aktualna = ilosc_aktualna + ? WHERE id = ?',
                [consumption.quantity, consumption.batch_id],
                function(restoreErr) {
                  consumptionsRestored++;
                  if (restoreErr) {
                    console.error(`❌ Error restoring quantity in products for batch ${consumption.batch_id}:`, restoreErr);
                  } else {
                    console.log(`✅ Restored ${consumption.quantity} units to batch ${consumption.batch_id} (product: ${consumption.product_kod})`);
                  }
                  
                  if (consumptionsRestored === totalConsumptions) {
                    console.log(`📊 Products restored: ${consumptionsRestored}/${totalConsumptions} batches`);
                    proceedAfterProductsRestore();
                  }
                }
              );
            });
          }
        };
        
        // Восстанавливаем ilosc_wydane для каждой записи fulfillment
        if (totalFulfillments === 0) {
          console.log('💡 No reservation fulfillments to restore');
          proceedAfterFulfillmentsRestore();
        } else {
          // Собираем уникальные reservation_id для проверки статуса после восстановления
          const reservationIdsToCheck = [...new Set(fulfillments.map(f => f.reservation_id))];
          
          fulfillments.forEach((fulfillment) => {
            db.run(
              'UPDATE reservation_products SET ilosc_wydane = COALESCE(ilosc_wydane, 0) - ? WHERE id = ?',
              [fulfillment.quantity, fulfillment.reservation_product_id],
              function(restoreErr) {
                fulfillmentsRestored++;
                if (restoreErr) {
                  console.error(`❌ Error restoring ilosc_wydane for reservation_product ${fulfillment.reservation_product_id}:`, restoreErr);
                } else {
                  console.log(`✅ Restored ilosc_wydane for reservation_product ${fulfillment.reservation_product_id}: -${fulfillment.quantity}`);
                }
                
                if (fulfillmentsRestored === totalFulfillments) {
                  console.log(`📊 Reservation fulfillments restored: ${fulfillmentsRestored}/${totalFulfillments}`);
                  
                  // Проверяем и обновляем статус каждой затронутой резервации
                  reservationIdsToCheck.forEach(reservationId => {
                    checkAndUpdateReservationStatus(reservationId);
                  });
                  
                  proceedAfterFulfillmentsRestore();
                }
              }
            );
          });
        }
      });
    });
  }); // db.all order_products
  }); // db.get order type
  }); // db.get invoice check
});

// Order Consumptions API
app.get('/api/order-consumptions', (req, res) => {
  console.log('📊 GET /api/order-consumptions - Fetching all order consumptions');
  
  const query = `
    SELECT 
      oc.*,
      o.numer_zamowienia,
      o.data_utworzenia,
      COALESCE(c.nazwa, o.klient) AS klient,
      p.nazwa as product_name,
      p.cena_zakupu_pln as batch_price
    FROM order_consumptions oc
    LEFT JOIN orders o ON oc.order_id = o.id
    LEFT JOIN clients c ON c.id = o.client_id
    LEFT JOIN products p ON oc.batch_id = p.id
    ORDER BY oc.created_at DESC
  `;
  
  db.all(query, (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`✅ Found ${rows.length} consumption records`);
    res.json(rows);
  });
});

app.get('/api/order-consumptions/search', (req, res) => {
  const { product_kod, order_id } = req.query;
  console.log(`🔍 GET /api/order-consumptions/search - Searching consumptions:`, { product_kod, order_id });
  
  let query = `
    SELECT 
      oc.*,
      o.numer_zamowienia,
      o.data_utworzenia,
      COALESCE(c.nazwa, o.klient) AS klient,
      p.nazwa as product_name,
      p.cena_zakupu_pln as batch_price
    FROM order_consumptions oc
    LEFT JOIN orders o ON oc.order_id = o.id
    LEFT JOIN clients c ON c.id = o.client_id
    LEFT JOIN products p ON oc.batch_id = p.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (product_kod) {
    query += ' AND oc.product_kod = ?';
    params.push(product_kod);
  }
  
  if (order_id) {
    query += ' AND oc.order_id = ?';
    params.push(order_id);
  }
  
  query += ' ORDER BY oc.created_at DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`✅ Found ${rows.length} consumption records`);
    res.json(rows);
  });
});

// Order Products API
app.get('/api/orders-with-products', (req, res) => {
  console.log('📋 GET /api/orders-with-products - Fetching orders with products');
  
  // Сначала получаем все заказы
  db.all(
    `SELECT o.*, COALESCE(c.nazwa, o.klient) AS klient_resolved ${ORDER_WITH_CLIENT_JOIN} ORDER BY o.data_utworzenia DESC`,
    (err, orders) => {
    if (err) {
      console.error('❌ Database error fetching orders:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`✅ Found ${orders.length} orders`);
    
    if (orders.length === 0) {
      res.json([]);
      return;
    }
    
    // Для каждого заказа получаем продукты
    let processedOrders = 0;
    const result = [];
    
    orders.forEach((order) => {
      const resolvedOrder = withResolvedOrderKlient(order);
      db.all('SELECT * FROM order_products WHERE orderId = ?', [resolvedOrder.id], (err, products) => {
        if (err) {
          console.error(`❌ Database error fetching products for order ${resolvedOrder.id}:`, err);
        } else {
          console.log(`✅ Found ${products.length} products for order ${resolvedOrder.id}`);
        }
        
        // Проверяем, есть ли фактура по этому заказу
        db.get('SELECT numer_faktury FROM invoices WHERE order_id = ? LIMIT 1', [resolvedOrder.id], (errInv, invRow) => {
          if (errInv) console.error(`❌ Error fetching invoice for order ${resolvedOrder.id}:`, errInv);
          const orderWithProducts = {
            id: resolvedOrder.id,
            client_id: resolvedOrder.client_id || null,
            klient: resolvedOrder.klient,
            numer_zamowienia: resolvedOrder.numer_zamowienia,
            data_utworzenia: resolvedOrder.data_utworzenia,
            laczna_ilosc: resolvedOrder.laczna_ilosc,
            typ: resolvedOrder.typ || 'zamowienie',
            numer_zwrotu: resolvedOrder.numer_zwrotu || null,
            numer_faktury: (errInv || !invRow) ? null : invRow.numer_faktury,
            products: products || []
          };
          
          result.push(orderWithProducts);
          processedOrders++;
          
          if (processedOrders === orders.length) {
            console.log(`✅ Sending ${result.length} orders with grouped products`);
            res.json(result);
          }
        });
      });
    });
  });
});

function extractDateFromOrderNumber(orderNumber) {
  if (!orderNumber) return null;
  const match = String(orderNumber).match(/(\d{1,2})_(\d{1,2})_(\d{4})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const year = parseInt(match[3], 10);
  const date = new Date(year, month, day);
  return isNaN(date.getTime()) ? null : date;
}

const ANALIZA_WYDAN_BASE_JOIN = `
  FROM order_products op
  JOIN orders o ON o.id = op.orderId
  LEFT JOIN working_sheets ws ON
    (TRIM(COALESCE(op.kod, '')) != '' AND ws.kod = TRIM(op.kod))
    OR (TRIM(COALESCE(op.kod, '')) = '' AND ws.nazwa = op.nazwa)
`;

const ANALIZA_WYDAN_BASE_WHERE = `
  o.typ NOT IN ('zwrot', 'przychod', 'przesuniecie')
  AND COALESCE(NULLIF(TRIM(op.kod), ''), ws.kod) IS NOT NULL
  AND TRIM(COALESCE(NULLIF(TRIM(op.kod), ''), ws.kod)) != ''
`;

function parseAnalizaWydanFilters(query) {
  return {
    klient: (query.klient || '').trim(),
    typ: (query.typ || '').trim(),
    year: (query.year || '').trim(),
    month: (query.month || '').trim()
  };
}

function orderMatchesAnalizaWydanDate(numerZamowienia, year, month) {
  if (!year && !month) return true;
  const date = extractDateFromOrderNumber(numerZamowienia);
  if (!date) return false;
  if (year && date.getFullYear().toString() !== year) return false;
  if (month && (date.getMonth() + 1).toString().padStart(2, '0') !== month.padStart(2, '0')) {
    return false;
  }
  return true;
}

function getAnalizaWydanOrderIdsForDateFilters(filters, callback) {
  if (!filters.year && !filters.month) {
    callback(null, null);
    return;
  }

  db.all(
    `SELECT id, numer_zamowienia FROM orders WHERE typ NOT IN ('zwrot', 'przychod', 'przesuniecie')`,
    [],
    (err, rows) => {
      if (err) {
        callback(err);
        return;
      }

      const ids = (rows || [])
        .filter((row) => orderMatchesAnalizaWydanDate(row.numer_zamowienia, filters.year, filters.month))
        .map((row) => row.id);

      callback(null, ids);
    }
  );
}

function buildAnalizaWydanWhere(filters, kod, orderIdsForDate) {
  const conditions = [ANALIZA_WYDAN_BASE_WHERE];
  const params = [];

  if (filters.klient) {
    conditions.push('o.klient = ?');
    params.push(filters.klient);
  }

  if (filters.typ) {
    conditions.push("COALESCE(NULLIF(TRIM(op.typ), ''), 'brak') = ?");
    params.push(filters.typ);
  }

  if (kod) {
    conditions.push("COALESCE(NULLIF(TRIM(op.kod), ''), ws.kod) = ?");
    params.push(kod);
  }

  if (orderIdsForDate !== null) {
    if (orderIdsForDate.length === 0) {
      return { empty: true, where: '', params: [] };
    }
    conditions.push(`o.id IN (${orderIdsForDate.map(() => '?').join(', ')})`);
    params.push(...orderIdsForDate);
  }

  return { empty: false, where: conditions.join(' AND '), params };
}

app.get('/api/analiza-wydan/filters', (req, res) => {
  console.log('📊 GET /api/analiza-wydan/filters - Fetching filter options');

  db.all(
    `SELECT DISTINCT
      o.klient AS klient,
      COALESCE(NULLIF(TRIM(op.typ), ''), 'brak') AS typ,
      o.numer_zamowienia AS numer_zamowienia
    ${ANALIZA_WYDAN_BASE_JOIN}
    WHERE ${ANALIZA_WYDAN_BASE_WHERE}
      AND o.klient IS NOT NULL
      AND TRIM(o.klient) != ''`,
    [],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error fetching analiza wydan filters:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      res.json(rows || []);
    }
  );
});

app.get('/api/analiza-wydan', (req, res) => {
  const filters = parseAnalizaWydanFilters(req.query);
  console.log('📊 GET /api/analiza-wydan - Fetching order products grouped by kod', filters);

  getAnalizaWydanOrderIdsForDateFilters(filters, (dateErr, orderIdsForDate) => {
    if (dateErr) {
      console.error('❌ Database error resolving analiza wydan date filters:', dateErr);
      res.status(500).json({ error: dateErr.message });
      return;
    }

    const built = buildAnalizaWydanWhere(filters, null, orderIdsForDate);
    if (built.empty) {
      res.json([]);
      return;
    }

    db.all(
      `SELECT
        COALESCE(NULLIF(TRIM(op.kod), ''), ws.kod) AS kod,
        COALESCE(ws.nazwa, MAX(op.nazwa)) AS nazwa,
        SUM(op.ilosc) AS ilosc
      ${ANALIZA_WYDAN_BASE_JOIN}
      WHERE ${built.where}
      GROUP BY COALESCE(NULLIF(TRIM(op.kod), ''), ws.kod)
      ORDER BY nazwa COLLATE NOCASE`,
      built.params,
      (err, rows) => {
        if (err) {
          console.error('❌ Database error fetching analiza wydan:', err);
          res.status(500).json({ error: err.message });
          return;
        }

        console.log(`✅ Found ${rows.length} grouped products for analiza wydan`);
        res.json(rows || []);
      }
    );
  });
});

app.get('/api/analiza-wydan/:kod', (req, res) => {
  const { kod } = req.params;
  const filters = parseAnalizaWydanFilters(req.query);
  console.log(`📊 GET /api/analiza-wydan/${kod} - Fetching typ breakdown`, filters);

  getAnalizaWydanOrderIdsForDateFilters(filters, (dateErr, orderIdsForDate) => {
    if (dateErr) {
      console.error('❌ Database error resolving analiza wydan date filters:', dateErr);
      res.status(500).json({ error: dateErr.message });
      return;
    }

    const built = buildAnalizaWydanWhere(filters, kod, orderIdsForDate);
    if (built.empty) {
      res.json({ kod, nazwa: '', ilosc: 0, by_typ: [] });
      return;
    }

    db.all(
      `WITH filtered AS (
        SELECT
          op.ilosc,
          COALESCE(NULLIF(TRIM(op.typ), ''), 'brak') AS typ,
          COALESCE(ws.nazwa, op.nazwa) AS nazwa
        ${ANALIZA_WYDAN_BASE_JOIN}
        WHERE ${built.where}
      )
      SELECT typ, SUM(ilosc) AS ilosc, MAX(nazwa) AS nazwa
      FROM filtered
      GROUP BY typ
      ORDER BY ilosc DESC, typ COLLATE NOCASE`,
      built.params,
      (err, rows) => {
        if (err) {
          console.error('❌ Database error fetching analiza wydan details:', err);
          res.status(500).json({ error: err.message });
          return;
        }

        const byTyp = (rows || []).map((row) => ({
          typ: row.typ,
          ilosc: row.ilosc,
        }));
        const nazwa = rows?.[0]?.nazwa || '';
        const totalIlosc = byTyp.reduce((sum, row) => sum + (row.ilosc || 0), 0);

        console.log(`✅ Found ${byTyp.length} typ rows for kod ${kod}`);
        res.json({ kod, nazwa, ilosc: totalIlosc, by_typ: byTyp });
      }
    );
  });
});

const ANALIZA_ZAKUPOW_BASE_JOIN = `
  FROM products p
  JOIN product_receipts pr ON pr.id = p.receipt_id
`;

const ANALIZA_ZAKUPOW_BASE_WHERE = `
  p.receipt_id IS NOT NULL
  AND TRIM(COALESCE(p.kod, '')) != ''
`;

const ANALIZA_ZAKUPOW_LINE_NETTO = `
  COALESCE(p.ilosc_pierwotna, 0) * COALESCE(p.cena_zakupu_pln, 0)
  * (1.0 - COALESCE(pr.rabat, 0) / 100.0)
`;

function parseAnalizaZakupowFilters(query) {
  return {
    sprzedawca: String(query.sprzedawca || '').trim(),
    year: String(query.year || '').trim(),
    month: String(query.month || '').trim(),
  };
}

function buildAnalizaZakupowWhere(filters, kod) {
  const conditions = [ANALIZA_ZAKUPOW_BASE_WHERE.trim()];
  const params = [];
  if (kod) {
    conditions.push('p.kod = ?');
    params.push(kod);
  }
  if (filters.sprzedawca) {
    conditions.push('pr.sprzedawca = ?');
    params.push(filters.sprzedawca);
  }
  if (filters.year) {
    conditions.push(`strftime('%Y', pr.data_przyjecia) = ?`);
    params.push(filters.year);
  }
  if (filters.month) {
    conditions.push(`strftime('%m', pr.data_przyjecia) = ?`);
    params.push(filters.month.padStart(2, '0'));
  }
  return { where: conditions.join(' AND '), params };
}

app.get('/api/analiza-zakupow/filters', (req, res) => {
  console.log('📊 GET /api/analiza-zakupow/filters - Fetching filter options');
  db.all(
    `SELECT DISTINCT
      pr.sprzedawca AS sprzedawca,
      pr.data_przyjecia AS data_przyjecia
    ${ANALIZA_ZAKUPOW_BASE_JOIN}
    WHERE ${ANALIZA_ZAKUPOW_BASE_WHERE}
      AND pr.sprzedawca IS NOT NULL
      AND TRIM(pr.sprzedawca) != ''`,
    [],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error fetching analiza zakupow filters:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows || []);
    }
  );
});

app.get('/api/analiza-zakupow', (req, res) => {
  const filters = parseAnalizaZakupowFilters(req.query);
  console.log('📊 GET /api/analiza-zakupow - Fetching purchased products grouped by kod', filters);
  const built = buildAnalizaZakupowWhere(filters, null);
  db.all(
    `SELECT
      p.kod AS kod,
      MAX(p.nazwa) AS nazwa,
      GROUP_CONCAT(DISTINCT pr.sprzedawca) AS sprzedawca,
      SUM(COALESCE(p.ilosc_pierwotna, 0)) AS ilosc,
      ROUND(SUM(${ANALIZA_ZAKUPOW_LINE_NETTO}), 2) AS netto
    ${ANALIZA_ZAKUPOW_BASE_JOIN}
    WHERE ${built.where}
    GROUP BY p.kod
    ORDER BY nazwa COLLATE NOCASE`,
    built.params,
    (err, rows) => {
      if (err) {
        console.error('❌ Database error fetching analiza zakupow:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      const mapped = (rows || []).map((row) => ({
        kod: row.kod,
        nazwa: row.nazwa || '',
        sprzedawca: String(row.sprzedawca || '')
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
          .join(', '),
        ilosc: Number(row.ilosc) || 0,
        netto: roundMoney(row.netto),
      }));
      console.log(`✅ Found ${mapped.length} grouped products for analiza zakupow`);
      res.json(mapped);
    }
  );
});

app.get('/api/analiza-zakupow/:kod', (req, res) => {
  const { kod } = req.params;
  const filters = parseAnalizaZakupowFilters(req.query);
  console.log(`📊 GET /api/analiza-zakupow/${kod} - Fetching receipt breakdown`, filters);
  const built = buildAnalizaZakupowWhere(filters, kod);
  db.all(
    `SELECT
      pr.id AS receipt_id,
      pr.data_przyjecia AS data_przyjecia,
      pr.sprzedawca AS sprzedawca,
      MAX(p.nazwa) AS nazwa,
      SUM(COALESCE(p.ilosc_pierwotna, 0)) AS ilosc,
      ROUND(SUM(${ANALIZA_ZAKUPOW_LINE_NETTO}), 2) AS netto
    ${ANALIZA_ZAKUPOW_BASE_JOIN}
    WHERE ${built.where}
    GROUP BY pr.id
    ORDER BY pr.data_przyjecia DESC, pr.id DESC`,
    built.params,
    (err, rows) => {
      if (err) {
        console.error('❌ Database error fetching analiza zakupow details:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      const byReceipt = (rows || []).map((row) => ({
        receipt_id: row.receipt_id,
        data_przyjecia: row.data_przyjecia || '',
        sprzedawca: row.sprzedawca || '',
        ilosc: Number(row.ilosc) || 0,
        netto: roundMoney(row.netto),
      }));
      const nazwa = rows?.[0]?.nazwa || '';
      const totalIlosc = byReceipt.reduce((sum, row) => sum + (row.ilosc || 0), 0);
      const totalNetto = roundMoney(byReceipt.reduce((sum, row) => sum + (row.netto || 0), 0));
      console.log(`✅ Found ${byReceipt.length} receipt rows for kod ${kod}`);
      res.json({ kod, nazwa, ilosc: totalIlosc, netto: totalNetto, by_receipt: byReceipt });
    }
  );
});

app.post('/api/order-products', (req, res) => {
  const { orderId, kod, nazwa, ilosc, typ } = req.body;
  console.log('📋 POST /api/order-products - Adding product to order:', { orderId, kod, nazwa, ilosc });
  
  if (!orderId || !kod || !nazwa || !ilosc) {
    console.log('❌ Validation failed: orderId, kod, nazwa, and ilosc are required');
    return res.status(400).json({ error: 'Order ID, kod, nazwa, and ilosc are required' });
  }
  
  db.run(
    'INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ) VALUES (?, ?, ?, ?, ?)',
    [orderId, kod, nazwa, ilosc, typ || 'sprzedaz'],
    function(err) {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Order product added with ID: ${this.lastID}`);
      res.json({ id: this.lastID, message: 'Order product added successfully' });
    }
  );
});

// Clients API
app.get('/api/clients', (req, res) => {
  console.log('👥 GET /api/clients - Fetching all clients');
  db.all('SELECT * FROM clients ORDER BY nazwa', (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log(`✅ Found ${rows.length} clients`);
    res.json(rows || []);
  });
});

app.get('/api/clients/search', (req, res) => {
  const { q } = req.query;
  console.log(`🔍 GET /api/clients/search - Searching clients with query: "${q}"`);
  
  if (!q) {
    console.log('❌ Validation failed: query parameter is required');
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  db.all(
    'SELECT * FROM clients WHERE nazwa LIKE ? OR firma LIKE ? ORDER BY nazwa LIMIT 10',
    [`%${q}%`, `%${q}%`],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Found ${rows.length} clients matching "${q}"`);
      res.json(rows || []);
    }
  );
});

// Sprzedaż klientom: sumy z nagłówków faktur + pozycje win
app.get('/api/clients/sales-by-invoices', (req, res) => {
  console.log('📊 GET /api/clients/sales-by-invoices - Fetching client sales from invoices');

  const invoiceSql = `
    SELECT
      i.id,
      i.klient_nazwa,
      i.data_faktury,
      i.suma_netto,
      i.suma_brutto,
      COALESCE(SUM(ip.ilosc), 0) AS butelki
    FROM invoices i
    LEFT JOIN invoice_products ip ON ip.invoice_id = i.id
    WHERE i.klient_nazwa IS NOT NULL AND TRIM(i.klient_nazwa) != ''
    GROUP BY i.id
    ORDER BY i.data_faktury DESC, i.id DESC`;

  const productSql = `
    SELECT
      i.klient_nazwa,
      i.data_faktury,
      ip.kod,
      ip.nazwa,
      COALESCE(ip.ilosc, 0) AS ilosc,
      COALESCE(ip.wartosc_netto, 0) AS wartosc_netto,
      COALESCE(ip.wartosc_brutto, 0) AS wartosc_brutto
    FROM invoices i
    INNER JOIN invoice_products ip ON ip.invoice_id = i.id
    WHERE i.klient_nazwa IS NOT NULL AND TRIM(i.klient_nazwa) != ''
    ORDER BY i.data_faktury DESC, i.id DESC, ip.id ASC`;

  db.all(invoiceSql, (invoiceErr, invoiceRows) => {
    if (invoiceErr) {
      console.error('❌ Error fetching client invoice sales:', invoiceErr);
      return res.status(500).json({ error: invoiceErr.message });
    }

    db.all(productSql, (productErr, productRows) => {
      if (productErr) {
        console.error('❌ Error fetching client product sales:', productErr);
        return res.status(500).json({ error: productErr.message });
      }

      res.json({
        invoices: (invoiceRows || []).map(row => ({
          id: row.id,
          klient_nazwa: row.klient_nazwa,
          data_faktury: row.data_faktury,
          suma_netto: row.suma_netto,
          suma_brutto: row.suma_brutto,
          butelki: row.butelki,
        })),
        products: (productRows || []).map(row => ({
          klient_nazwa: row.klient_nazwa,
          data_faktury: row.data_faktury,
          kod: row.kod || '',
          nazwa: row.nazwa || '',
          ilosc: row.ilosc,
          wartosc_netto: row.wartosc_netto,
          wartosc_brutto: row.wartosc_brutto,
        })),
      });
    });
  });
});

app.get('/api/clients/:id', (req, res) => {
  const { id } = req.params;
  console.log(`👥 GET /api/clients/${id} - Fetching client by ID`);
  
  db.get('SELECT * FROM clients WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      console.log(`❌ Client with ID ${id} not found`);
      return res.status(404).json({ error: 'Client not found' });
    }
    console.log(`✅ Found client: ${row.nazwa}`);
    res.json(row);
  });
});

app.post('/api/clients', (req, res) => {
  const { nazwa, firma, adres, kontakt, czasDostawy, czas_dostawy } = req.body;
  // Поддерживаем оба варианта названия поля
  const czasDostawyValue = czasDostawy || czas_dostawy;
  
  console.log('👥 POST /api/clients - Creating new client:', { nazwa, firma, czasDostawy: czasDostawyValue });
  
  if (!nazwa) {
    console.log('❌ Validation failed: nazwa is required');
    return res.status(400).json({ error: 'Nazwa is required' });
  }
  
  db.run(
    'INSERT INTO clients (nazwa, firma, adres, kontakt, czas_dostawy) VALUES (?, ?, ?, ?, ?)',
    [nazwa, firma, adres, kontakt, czasDostawyValue],
    function(err) {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Client created with ID: ${this.lastID}`);
      res.json({ id: this.lastID, message: 'Client added successfully' });
    }
  );
});

app.put('/api/clients/:id', (req, res) => {
  const { id } = req.params;
  const { nazwa, firma, adres, kontakt, czas_dostawy } = req.body;
  console.log(`👥 PUT /api/clients/${id} - Updating client:`, { nazwa, firma });
  
  // Сначала получаем старое значение nazwa клиента
  db.get('SELECT nazwa FROM clients WHERE id = ?', [id], (err, oldClient) => {
    if (err) {
      console.error('❌ Database error getting old client:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!oldClient) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    
    // Обновляем клиента
    db.run(
      'UPDATE clients SET nazwa = ?, firma = ?, adres = ?, kontakt = ?, czas_dostawy = ? WHERE id = ?',
      [nazwa, firma, adres, kontakt, czas_dostawy, id],
      function(err) {
        if (err) {
          console.error('❌ Database error updating client:', err);
          res.status(500).json({ error: err.message });
          return;
        }

        cascadeClientRename(id, oldClient.nazwa, nazwa, (cascadeErr) => {
          if (cascadeErr) {
            res.status(500).json({ error: cascadeErr.message });
            return;
          }
          console.log(`✅ Client ${id} updated successfully`);
          res.json({ message: 'Client updated successfully' });
        });
      }
    );
  });
});

app.delete('/api/clients/:id', (req, res) => {
  const { id } = req.params;
  console.log(`👥 DELETE /api/clients/${id} - Deleting client`);
  
  db.run('DELETE FROM clients WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log(`✅ Client ${id} deleted successfully`);
    res.json({ message: 'Client deleted successfully' });
  });
});

// Product Receipts API
app.get('/api/product-receipts', (req, res) => {
  console.log('📦 GET /api/product-receipts - Fetching all product receipts');
  db.all('SELECT * FROM product_receipts ORDER BY data_przyjecia DESC', (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    attachReceiptProductsFromTable(rows || [], (attachErr, processedRows) => {
      if (attachErr) {
        console.error('❌ Error attaching receipt products:', attachErr);
        res.status(500).json({ error: attachErr.message });
        return;
      }
      console.log(`✅ Found ${processedRows.length} product receipts`);
      res.json(processedRows);
    });
  });
});

app.get('/api/product-receipts/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📦 GET /api/product-receipts/${id} - Fetching product receipt by ID`);
  
  db.get('SELECT * FROM product_receipts WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      console.log(`❌ Product receipt with ID ${id} not found`);
      return res.status(404).json({ error: 'Product receipt not found' });
    }
    
    attachReceiptProductsFromTable([row], (attachErr, processedRows) => {
      if (attachErr) {
        console.error('❌ Error attaching receipt products:', attachErr);
        res.status(500).json({ error: attachErr.message });
        return;
      }
      const processedRow = processedRows[0];
      console.log(`✅ Found product receipt: ${processedRow.data_przyjecia} (${processedRow.products.length} products)`);
      res.json(processedRow);
    });
  });
});

function readReceiptRequestPayload(req) {
  try {
    const files = req.files || {};
    const rawData = req.body && req.body.data;
    const source = typeof rawData === 'string' && rawData.trim() !== ''
      ? JSON.parse(rawData)
      : (req.body || {});
    return {
      date: source.date,
      sprzedawca: source.sprzedawca,
      wartosc_przyjecia_netto: source.wartosc_przyjecia_netto,
      vat: source.vat,
      wartosc_przyjecia_brutto: source.wartosc_przyjecia_brutto,
      kosztDostawy: source.wartosc_dostawy,
      products: source.products,
      aktualnyKurs: source.kurs_1,
      podatekAkcyzowy: source.stawka_podatek_akcyzowy,
      rabat: source.rabat,
      walutaFaktury: source.waluta_przyjecia,
      kursFaktury: source.kurs_2,
      kursMode: source.kursMode,
      walutaDostawy: source.waluta_dostawy ?? source.walutaDostawy,
      productInvoice: files.product_invoice ? files.product_invoice[0].filename : source.product_invoice,
      transportInvoice: files.transport_invoice ? files.transport_invoice[0].filename : source.transport_invoice,
      version: source.version,
    };
  } catch (error) {
    console.error('❌ Error parsing JSON data from FormData:', error);
    return { error: 'Invalid JSON data in FormData' };
  }
}

function prepareReceiptWriteRequest(req, options = {}) {
  const receiptPayload = readReceiptRequestPayload(req);
  if (receiptPayload.error) {
    return { error: receiptPayload.error, assigned: null };
  }

  let {
    date, sprzedawca, wartosc_przyjecia_netto, vat, wartosc_przyjecia_brutto, kosztDostawy, products,
    productInvoice, transportInvoice, aktualnyKurs, podatekAkcyzowy, rabat, walutaFaktury, kursFaktury,
    kursMode, walutaDostawy, version,
  } = receiptPayload;

  if (req.files?.product_invoice) {
    productInvoice = assignReceiptUploadName(req.files.product_invoice[0].filename, 'towar', sprzedawca);
  }
  if (req.files?.transport_invoice) {
    transportInvoice = assignReceiptUploadName(req.files.transport_invoice[0].filename, 'transport', sprzedawca);
  }
  const assigned = { productInvoice, transportInvoice };

  walutaFaktury = normalizeWalutaFaktury(walutaFaktury);
  const walutaDostawyForDb = normalizeWalutaDostawy(walutaDostawy);
  kosztDostawy = roundMoney(kosztDostawy);
  podatekAkcyzowy = roundMoney(podatekAkcyzowy);
  rabat = roundMoney(rabat);
  kursMode = kursMode || 'toPln';

  const receiptRates = resolveReceiptRatesToPln(
    kursMode,
    walutaDostawy,
    walutaFaktury,
    kosztDostawy,
    aktualnyKurs,
    kursFaktury
  );
  if (receiptRates.error) {
    return { error: receiptRates.error, assigned };
  }

  kursFaktury = receiptRates.kursFakturyForDb;
  const kursEurPln = receiptRates.kursDostawyToPln;
  const aktualnyKursForDb = receiptRates.aktualnyKursForDb;

  if (options.defaultDateIfMissing && !date) {
    date = getTodayDateString();
  }

  if (!date || !products || !Array.isArray(products)) {
    return { error: 'Date and products array are required', assigned };
  }

  products = stampCenaZakupuOrg(normalizeReceiptProducts(products));
  const receiptError = validatePurchaseReceipt({
    hasDate: true,
    sprzedawca,
    skipDelivery: true,
    products,
    podatekAkcyzowy,
  });
  if (receiptError) {
    return { error: receiptError, assigned };
  }

  const productsForJson = products.map((p) => ({ ...p }));
  const productsInternal = kursMode === 'toPln'
    ? withCenaPln(products, walutaFaktury, receiptRates.kursFakturyToPln)
    : withCenaEur(products, walutaFaktury, aktualnyKursForDb, kursFaktury);

  const rabatValueForWartosc = parseFloat(String(rabat || '0').replace(',', '.')) || 0;
  const productsTotalValue = productsForJson.reduce((sum, p) => {
    return sum + ((p.ilosc || 0) * (parseFloat(String(p.cena || '0').replace(',', '.')) || 0));
  }, 0);
  const calculatedNetto = Math.round(productsTotalValue * (1 - rabatValueForWartosc / 100) * 100) / 100;
  const clientNetto = parseFloat(String(wartosc_przyjecia_netto ?? '0').replace(',', '.')) || 0;
  wartosc_przyjecia_netto = roundMoney(clientNetto > 0 ? clientNetto : calculatedNetto);
  vat = roundMoney(vat);
  wartosc_przyjecia_brutto = roundMoney(wartosc_przyjecia_brutto);

  const totalBottles = productsInternal.reduce((total, product) => {
    if (product.typ === 'aksesoria') return total;
    return total + (product.ilosc || 0);
  }, 0);
  const kosztDostawyPerUnit = totalBottles > 0
    ? Math.round((((kosztDostawy || 0) / totalBottles) * kursEurPln) * 100) / 100
    : 0;
  stampKosztDostawyPerUnitSrednie(productsInternal, kosztDostawyPerUnit);
  stampKosztDostawyPerUnit(productsInternal, kosztDostawy, kursEurPln);
  stampPodatekAkcyzowy(productsInternal, podatekAkcyzowy);

  return {
    date,
    sprzedawca,
    wartosc_przyjecia_netto,
    vat,
    wartosc_przyjecia_brutto,
    kosztDostawy,
    products: productsInternal,
    productsInternal,
    productsForJson,
    productInvoice,
    transportInvoice,
    aktualnyKurs,
    podatekAkcyzowy,
    rabat,
    walutaFaktury,
    kursFaktury,
    kursMode,
    walutaDostawy,
    walutaDostawyForDb,
    kursEurPln,
    aktualnyKursForDb,
    calculatedNetto,
    kosztDostawyPerUnit,
    assigned,
    version,
  };
}

function rejectPreparedReceiptWrite(req, res, prepared) {
  discardRequestReceiptUploads(req, prepared.assigned);
  console.log(`❌ ${req.method} ${req.url}: ${prepared.error}`);
  return res.status(400).json({ error: prepared.error });
}

app.post('/api/product-receipts', upload.fields([
  { name: 'product_invoice', maxCount: 1 },
  { name: 'transport_invoice', maxCount: 1 }
]), (req, res) => {
  const prepared = prepareReceiptWriteRequest(req, { defaultDateIfMissing: true });
  if (prepared.error) {
    return rejectPreparedReceiptWrite(req, res, prepared);
  }

  const {
    date,
    sprzedawca,
    wartosc_przyjecia_netto,
    vat,
    wartosc_przyjecia_brutto,
    kosztDostawy,
    productsInternal,
    productInvoice,
    transportInvoice,
    podatekAkcyzowy,
    rabat,
    walutaFaktury,
    kursFaktury,
    walutaDostawyForDb,
    aktualnyKursForDb,
  } = prepared;

  console.log(`📦 POST /api/product-receipts lines=${productsInternal.length}`);

  // Вся операция (создание документа приёмки + партии products + working_sheets)
  // выполняется в ОДНОЙ транзакции, чтобы при любом сбое откатывался и сам
  // документ product_receipts, а не оставался "призраком" без склада за ним.
  const createReceiptWithProducts = async () => {
    const startTime = Date.now();

    await new Promise((resolve, reject) => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          console.error('❌ Error starting transaction:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    try {
      const receiptId = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO product_receipts (data_przyjecia, sprzedawca, wartosc_przyjecia_netto, vat, wartosc_przyjecia_brutto, wartosc_dostawy, kurs_1, stawka_podatek_akcyzowy, rabat, waluta_przyjecia, waluta_dostawy, kurs_2, product_invoice, transport_invoice, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [date, sprzedawca || '', wartosc_przyjecia_netto || 0, vat || 0, wartosc_przyjecia_brutto || 0, kosztDostawy || 0, aktualnyKursForDb, roundMoney(podatekAkcyzowy), rabat, walutaFaktury, walutaDostawyForDb, kursFaktury, productInvoice || null, transportInvoice || null, date],
          function(err) {
            if (err) {
              reject(err);
            } else {
              resolve(this.lastID);
            }
          }
        );
      });

      // Автоматически добавляем товары в working_sheets
      let processedCount = 0;
      let productsInserted = 0;
      let workingSheetsUpdated = 0;
      let workingSheetsInserted = 0;
          // Группируем товары по коду для суммирования количества
          const productsByCode = {};
          for (const product of productsInternal) {
            if (!productsByCode[product.kod]) {
              productsByCode[product.kod] = [];
            }
            productsByCode[product.kod].push(product);
          }
          
          // Обрабатываем каждый уникальный код
          for (const [productCode, productsList] of Object.entries(productsByCode)) { 
            // Создаем записи в products для каждого товара (даже с одинаковым кодом)
            for (const product of productsList) {
            await new Promise((resolve, reject) => {
              db.run(
                  insertProductBatchSql(),
                insertProductBatchParams(product, receiptId, product.ilosc, date),
                function(err) {
                  if (err) {
                    console.error('❌ Error inserting into products:', err);
                    reject(err);
                                      } else {
                      productsInserted++;
                      resolve();
                    }
                  }
                );
              });
            }
            
            // working_sheets: qty = SUM партий; cena/typ/koszt/akcyza — с последней партии (не max, не первая строка)
            const existingProduct = await getWorkingSheetByKod(productCode);
            if (existingProduct) {
              await new Promise((resolve, reject) => {
                db.run(
                  insertWorkingSheetsHistoryBeforeReceiptSql(),
                  insertWorkingSheetsHistoryBeforeReceiptParams(receiptId, productCode),
                  (err) => {
                    if (err) {
                      console.error(`❌ Error saving snapshot for ${productCode}:`, err);
                      reject(err);
                    } else {
                      resolve();
                    }
                  }
                );
              });
            }

            const zeroStock = existingProduct && Number(existingProduct.ilosc) === 0;
            const applied = await applyWorkingSheetFromLatest(productCode, {
              insertIfMissing: true,
              createdAt: date,
              createdAtOnUpdate: zeroStock ? date : null,
            });
            if (applied === 'inserted') {
              workingSheetsInserted++;
            } else if (applied === 'updated') {
              workingSheetsUpdated++;
            }
            
            processedCount++;
          }
          
          // Коммитим транзакцию
          await new Promise((resolve, reject) => {
            db.run('COMMIT', (err) => {
              if (err) {
                console.error('❌ Error committing transaction:', err);
                reject(err);
              } else {
                resolve();
              }
            });
          });
          
          // Отправляем ответ
          const endTime = Date.now();
          const processingTime = endTime - startTime;
          console.log(`✅ POST /api/product-receipts id=${receiptId} done ${processingTime}ms ws+${workingSheetsUpdated}/${workingSheetsInserted} products=${productsInserted}`);
          res.json({ 
            id: receiptId, 
            message: 'Product receipt added successfully',
            workingSheetsUpdated: workingSheetsUpdated,
            workingSheetsInserted: workingSheetsInserted,
            productsCreated: productsInserted,
            processingTime: processingTime
          });
          
        } catch (error) {
          console.error('❌ Error during product processing:', error);
          
          // Откатываем транзакцию
          try {
            await new Promise((resolve, reject) => {
              db.run('ROLLBACK', (rollbackErr) => {
                if (rollbackErr) {
                  console.error('❌ Error rolling back transaction:', rollbackErr);
                  reject(rollbackErr);
                } else {
                  resolve();
                }
              });
            });
          } catch (rollbackError) {
            console.error('❌ Failed to rollback transaction:', rollbackError);
          }

          discardRequestReceiptUploads(req, { productInvoice, transportInvoice });
          
          // Если ответ ещё не отправлен, отправляем ошибку
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to process products: ' + error.message });
          }
        }
  };

  // Запускаем создание приёмки (документ + products + working_sheets — всё в одной транзакции)
  createReceiptWithProducts().catch((error) => {
    console.error('❌ Unhandled error creating product receipt:', error);
    discardRequestReceiptUploads(req, { productInvoice, transportInvoice });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process products: ' + error.message });
    }
  });
});

app.put('/api/product-receipts/:id', upload.fields([
  { name: 'product_invoice', maxCount: 1 },
  { name: 'transport_invoice', maxCount: 1 }
]), (req, res) => {
  const { id } = req.params;
  const prepared = prepareReceiptWriteRequest(req);
  if (prepared.error) {
    return rejectPreparedReceiptWrite(req, res, prepared);
  }

  let {
    date,
    sprzedawca,
    wartosc_przyjecia_netto,
    vat,
    wartosc_przyjecia_brutto,
    kosztDostawy,
    products,
    productInvoice,
    transportInvoice,
    podatekAkcyzowy,
    rabat,
    walutaFaktury,
    kursFaktury,
    walutaDostawyForDb,
    aktualnyKursForDb,
    kosztDostawyPerUnit,
    version,
  } = prepared;

  console.log(`📦 PUT /api/product-receipts/${id} lines=${products.length}`);

  // Вся операция обновления приёмки (документ product_receipts + партии products +
  // working_sheets) выполняется в ОДНОЙ транзакции, чтобы документ и склад не могли
  // рассинхронизироваться при частичном сбое на любом из шагов.
  const updateReceiptWithProducts = async () => {
    await new Promise((resolve, reject) => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          console.error('❌ Error starting transaction (PUT):', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    try {
      // Сначала получаем старые данные для сравнения
      const oldReceipt = await new Promise((resolve, reject) => {
        db.get('SELECT data_przyjecia, product_invoice, transport_invoice, stawka_podatek_akcyzowy, kurs_1, kurs_2, waluta_przyjecia, waluta_dostawy, wartosc_dostawy, version FROM product_receipts WHERE id = ?', [id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!oldReceipt) {
        throw Object.assign(new Error('Product receipt not found'), { statusCode: 404 });
      }

      const oldProductRows = await loadReceiptProductBatches(id);
      const oldProducts = oldProductRows.map(mapProductBatchToReceiptLine);
      const currentVersion = Number(oldReceipt.version) || 1;
      const expectedVersion = Number(version);
      if (!Number.isInteger(expectedVersion) || expectedVersion !== currentVersion) {
        throw Object.assign(new Error('Receipt version conflict'), {
          statusCode: 409,
          payload: {
            error: 'version_conflict',
            message: 'Przyjęcie zostało zmienione. Odśwież dokument i zapisz ponownie.',
            currentVersion,
          },
        });
      }

      // Blokada zmiany/usunięcia kodu, jeśli istnieją dokumenty z tym kodem
      // (zamówienie / rozchód / zwrot / przychód) — A: wydania z partii przyjęcia, B: dokumenty po dacie przyjęcia
      {
        const oldKodSet = new Set(
          oldProducts.map((p) => normalizeProductKod(p.kod)).filter(Boolean)
        );
        const newKodSet = new Set(
          products.map((p) => normalizeProductKod(p.kod)).filter(Boolean)
        );
        const removedKods = [...oldKodSet].filter((k) => !newKodSet.has(k));
        const addedKods = [...newKodSet].filter((k) => !oldKodSet.has(k));
        const singleRenameNewKod =
          removedKods.length === 1 && addedKods.length === 1 ? addedKods[0] : null;

        if (removedKods.length > 0) {
          const conflicts = [];
          for (const oldKod of removedKods) {
            const documents = await findDocumentsBlockingKodChange(
              id,
              oldKod,
              oldReceipt.data_przyjecia
            );
            if (documents.length > 0) {
              const oldItem = oldProducts.find(
                (p) => normalizeProductKod(p.kod) === oldKod
              );
              conflicts.push({
                oldKod,
                newKod: singleRenameNewKod,
                nazwa: oldItem?.nazwa || documents[0]?.nazwa || '',
                documents,
              });
            }
          }

          if (conflicts.length > 0) {
            console.log(`⛔ Kod change blocked for receipt ${id}: ${conflicts.map((c) => c.oldKod).join(', ')}`);
            throw Object.assign(new Error('Kod change blocked by existing documents'), {
              statusCode: 409,
              payload: {
                error: 'kod_change_blocked',
                message:
                  'Nie można zmienić lub usunąć kodu: istnieją dokumenty (zamówienia / rozchody / zwroty / przychody) z tym kodem',
                conflicts,
              },
            });
          }
        }
      }
      
      // Сохраняем существующие файлы, если новые не загружены
      const finalProductInvoice = productInvoice || oldReceipt.product_invoice;
      const finalTransportInvoice = transportInvoice || oldReceipt.transport_invoice;
      
      // Вычисляем курс для обновления записи (парсим с заменой запятой на точку)
      const podatekAkcyzowyParsed = roundMoney(podatekAkcyzowy);
      const rabatParsed = roundMoney(rabat);

      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE product_receipts SET data_przyjecia = ?, sprzedawca = ?, wartosc_przyjecia_netto = ?, vat = ?, wartosc_przyjecia_brutto = ?, wartosc_dostawy = ?, kurs_1 = ?, stawka_podatek_akcyzowy = ?, rabat = ?, waluta_przyjecia = ?, waluta_dostawy = ?, kurs_2 = ?, product_invoice = ?, transport_invoice = ?, created_at = ?, version = version + 1 WHERE id = ? AND version = ?',
          [date, sprzedawca || '', wartosc_przyjecia_netto || 0, vat || 0, wartosc_przyjecia_brutto || 0, kosztDostawy || 0, aktualnyKursForDb, podatekAkcyzowyParsed, rabatParsed, walutaFaktury, walutaDostawyForDb, kursFaktury, finalProductInvoice, finalTransportInvoice, date, id, expectedVersion],
          function(err) {
            if (err) {
              reject(err);
              return;
            }
            if (this.changes === 0) {
              reject(Object.assign(new Error('Receipt version conflict'), {
                statusCode: 409,
                payload: {
                  error: 'version_conflict',
                  message: 'Przyjęcie zostało zmienione. Odśwież dokument i zapisz ponownie.',
                  currentVersion,
                },
              }));
              return;
            }
            resolve();
          }
        );
      });

      const replacedUploads = [];
      if (productInvoice && oldReceipt.product_invoice && productInvoice !== oldReceipt.product_invoice) {
        replacedUploads.push(oldReceipt.product_invoice);
      }
      if (transportInvoice && oldReceipt.transport_invoice && transportInvoice !== oldReceipt.transport_invoice) {
        replacedUploads.push(oldReceipt.transport_invoice);
      }

      // Обновляем товары в working_sheets и products
      let workingSheetsUpdated = 0;
      let productsUpdated = 0;
      let productsInserted = 0;
      let productsDeleted = 0;

      {
            // Шаг 1: Берём старые партии этой приемки (уже загружены до сравнения kod)
            const oldProductsFromDb = oldProductRows;
            
            // Если изменилась дата закупки (data zakupu) — синхронизируем created_at
            // в products для этой приемки, даже если состав/количество товаров не менялись
            const data_przyjeciaChanged = String(oldReceipt.data_przyjecia || '') !== String(date || '');
            if (data_przyjeciaChanged) {
              await new Promise((resolve, reject) => {
                db.run('UPDATE products SET created_at = ? WHERE receipt_id = ?', [date, id], (err) => {
                  if (err) {
                    console.error('❌ Error syncing products.created_at with new data_przyjecia:', err);
                    reject(err);
                  } else {
                    resolve();
                  }
                });
              });
            }
            
            // Группируем старые товары по kod и суммируем количества
            const oldProductsByKod = {};
            oldProductsFromDb.forEach(p => {
              if (!oldProductsByKod[p.kod]) {
                oldProductsByKod[p.kod] = {
                  kod: p.kod,
                  nazwa: p.nazwa,
                  kod_kreskowy: p.kod_kreskowy,
                  cena: p.cena_zakupu_pln,
                  ilosc: 0,
                  typ: p.typ || null,
                  dataWaznosci: p.data_waznosci || null,
                  objetosc: p.objetosc || null,
                  vat: p.vat || 0,
                  cena_zakupu_org: p.cena_zakupu_org,
                  records: []
                };
              }
              oldProductsByKod[p.kod].ilosc += p.ilosc_pierwotna || p.ilosc || 0;
              oldProductsByKod[p.kod].records.push(p);
            });
            
            // Группируем новые товары по kod и суммируем количества
            const newProductsByKod = {};
            products.forEach(p => {
              if (!newProductsByKod[p.kod]) {
                newProductsByKod[p.kod] = {
                  kod: p.kod,
                  nazwa: p.nazwa,
                  kod_kreskowy: p.kod_kreskowy,
                  cena: p.cena,
                  ilosc: 0,
                  typ: p.typ,
                  dataWaznosci: p.dataWaznosci,
                  objetosc: p.objetosc,
                  vat: p.vat,
                  items: []
                };
              }
              newProductsByKod[p.kod].ilosc += p.ilosc || 0;
              newProductsByKod[p.kod].items.push(p);
            });
              
            const allProductCodes = [...new Set([...Object.keys(oldProductsByKod), ...Object.keys(newProductsByKod)])];
            const { pairs, unknownIds, duplicateIds } = pairReceiptProductBatches(oldProductRows, products);
            if (unknownIds.length > 0 || duplicateIds.length > 0) {
              throw Object.assign(new Error('Invalid product batch ids'), {
                statusCode: 400,
                payload: {
                  error: 'unknown_product_id',
                  message: 'Nieprawidłowe identyfikatory partii w przyjęciu',
                  unknownIds,
                  duplicateIds,
                },
              });
            }

            const qtyConflicts = [];
            for (const { record, item } of pairs) {
              if (!record) continue;
              const oldAktualna = productBatchAktualna(record);
              const oldPierwotna = productBatchPierwotna(record);
              const newPierwotna = item ? (Number(item.ilosc) || 0) : 0;
              const qtyDelta = newPierwotna - oldPierwotna;
              if (oldAktualna + qtyDelta < 0) {
                qtyConflicts.push({
                  oldKod: normalizeProductKod((item && item.kod) || record.kod),
                  nazwa: (item && item.nazwa) || record.nazwa || '',
                  issued: productBatchIssuedQty(record),
                  requested: newPierwotna,
                  remaining: oldAktualna,
                  delta: qtyDelta,
                  id: record.id,
                });
              }
            }
            if (qtyConflicts.length > 0) {
              console.log(`⛔ Receipt qty blocked for ${id}: ${qtyConflicts.map((c) => c.oldKod).join(', ')}`);
              throw Object.assign(new Error('Receipt quantity below issued amount'), {
                statusCode: 409,
                payload: {
                  error: 'receipt_qty_blocked',
                  message:
                    'Nie można zmniejszyć ilości poniżej już wydanej z partii tego przyjęcia',
                  conflicts: qtyConflicts,
                },
              });
            }

            const stanyDeltaByKod = {};
            const addStanyDelta = (kod, delta) => {
              const key = normalizeProductKod(kod);
              const amount = Number(delta) || 0;
              if (!key || amount === 0) return;
              stanyDeltaByKod[key] = (stanyDeltaByKod[key] || 0) + amount;
            };

            for (const { record, item } of pairs) {
              if (!item) {
                addStanyDelta(record.kod, -productBatchAktualna(record));
                await new Promise((resolve, reject) => {
                  db.run('DELETE FROM products WHERE id = ?', [record.id], function (err) {
                    if (err) reject(err);
                    else {
                      productsDeleted += this.changes;
                      resolve();
                    }
                  });
                });
                continue;
              }
              if (item.vat == null || item.vat === '') item.vat = record ? record.vat : 0;
              if (!record) {
                addStanyDelta(item.kod, Number(item.ilosc) || 0);
                await new Promise((resolve, reject) => {
                  db.run(
                    insertProductBatchSql(),
                    insertProductBatchParams(item, id, item.ilosc, date),
                    function (err) {
                      if (err) {
                        console.error('❌ Error inserting product batch:', err);
                        reject(err);
                      } else {
                        productsInserted++;
                        resolve();
                      }
                    }
                  );
                });
                continue;
              }
              const oldPierwotna = productBatchPierwotna(record);
              const oldAktualna = productBatchAktualna(record);
              const newPierwotna = Number(item.ilosc) || 0;
              const qtyDelta = newPierwotna - oldPierwotna;
              addStanyDelta(item.kod, qtyDelta);
              const withQty = qtyDelta !== 0;
              const itemIloscAktualna = oldAktualna + qtyDelta;
              await new Promise((resolve, reject) => {
                db.run(
                  updateProductBatchByIdSql(withQty),
                  updateProductBatchByIdParams(item, record.id, withQty, itemIloscAktualna),
                  function (err) {
                    if (err) {
                      console.error(`❌ Error updating product id=${record.id}:`, err);
                      reject(err);
                    } else {
                      productsUpdated += this.changes;
                      resolve();
                    }
                  }
                );
              });
            }

            await new Promise((resolve, reject) => {
              db.run(
                `UPDATE products SET koszt_dostawy_per_unit_srednie = CASE WHEN typ = 'aksesoria' THEN 0 ELSE ? END WHERE receipt_id = ?`,
                [roundMoney(kosztDostawyPerUnit), id],
                (err) => {
                  if (err) {
                    console.error('❌ Error updating products.koszt_dostawy_per_unit_srednie:', err);
                    reject(err);
                  } else {
                    resolve();
                  }
                }
              );
            });
            
            // Шаг 3: working_sheets — цена/тип с последней партии;
            // ilosc двигаем на ту же дельту, что и ilosc_aktualna, без пересборки SUM.
            for (const productCode of allProductCodes) {
              const oldProduct = oldProductsByKod[productCode];
              const newProduct = newProductsByKod[productCode];
              const stanyDelta = stanyDeltaByKod[normalizeProductKod(productCode)] || 0;

              if (!oldProduct && newProduct) {
                const normalizedCode = normalizeProductKod(productCode);
                const existingWs = await getWorkingSheetByKod(normalizedCode);
                if (existingWs) {
                  await new Promise((resolve, reject) => {
                    db.run(
                      insertWorkingSheetsHistoryBeforeReceiptSql(),
                      insertWorkingSheetsHistoryBeforeReceiptParams(id, normalizedCode),
                      (err) => (err ? reject(err) : resolve())
                    );
                  });
                  const applied = await applyWorkingSheetFromLatest(normalizedCode, {
                    insertIfMissing: false,
                    createdAt: date,
                    preserveIlosc: true,
                  });
                  const adjusted = await adjustWorkingSheetIlosc(normalizedCode, stanyDelta);
                  if (applied || adjusted) workingSheetsUpdated++;
                } else {
                  const applied = await applyWorkingSheetFromLatest(normalizedCode, {
                    insertIfMissing: true,
                    createdAt: date,
                  });
                  if (applied) workingSheetsUpdated++;
                }
              } else if (oldProduct && !newProduct) {
                const remainingCount = await new Promise((resolve, reject) => {
                  db.get('SELECT COUNT(*) as count FROM products WHERE kod = ?', [productCode], (err, result) => {
                    if (err) reject(err);
                    else resolve(result?.count || 0);
                  });
                });

                if (remainingCount === 0) {
                  const result = await keepWorkingSheetZeroOrDelete(productCode, id);
                  if (result === 'kept') workingSheetsUpdated++;
                } else {
                  const applied = await applyWorkingSheetFromLatest(productCode, {
                    insertIfMissing: false,
                    preserveIlosc: true,
                  });
                  const adjusted = await adjustWorkingSheetIlosc(productCode, stanyDelta);
                  if (applied || adjusted) workingSheetsUpdated++;
                }
              } else if (oldProduct && newProduct) {
                const workingSheetRecord = await getWorkingSheetByKod(productCode);
                const oldReceiptDatePart = String(oldReceipt.data_przyjecia || '').slice(0, 10);
                const wsCreatedAtPart = String((workingSheetRecord && workingSheetRecord.created_at) || '').slice(0, 10);
                const shouldSyncCreatedAt = data_przyjeciaChanged && oldReceiptDatePart && wsCreatedAtPart === oldReceiptDatePart;
                if (workingSheetRecord) {
                  await new Promise((resolve, reject) => {
                    db.run(
                      insertWorkingSheetsHistoryBeforeReceiptSql(),
                      insertWorkingSheetsHistoryBeforeReceiptParams(id, productCode),
                      (err) => {
                        if (err) reject(err);
                        else resolve();
                      }
                    );
                  });
                }
                const applied = await applyWorkingSheetFromLatest(productCode, {
                  insertIfMissing: true,
                  createdAt: date,
                  createdAtOnUpdate: shouldSyncCreatedAt ? date : null,
                  preserveIlosc: true,
                });
                const adjusted = await adjustWorkingSheetIlosc(productCode, stanyDelta);
                if (applied || adjusted) {
                  workingSheetsUpdated++;
                }
              }
            }

      }

      // Шаг 4: Коммитим транзакцию и отправляем ответ
      await new Promise((resolve, reject) => {
        db.run('COMMIT', (err) => {
          if (err) {
            console.error('❌ Error committing transaction (PUT):', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      replacedUploads.forEach((filename) => unlinkReceiptUpload(filename));

      console.log(`✅ PUT /api/product-receipts/${id} ws=${workingSheetsUpdated} products=${productsUpdated}/${productsInserted}/${productsDeleted}`);

      res.json({
        message: 'Product receipt updated successfully',
        workingSheetsUpdated: workingSheetsUpdated,
        productsUpdated: productsUpdated,
        productsCreated: productsInserted,
        productsDeleted: productsDeleted
      });

    } catch (error) {
      console.error('❌ Error during product processing (PUT):', error);

      // Откатываем транзакцию — документ и склад останутся ровно в том состоянии,
      // в котором были до начала PUT-запроса
      try {
        await new Promise((resolve, reject) => {
          db.run('ROLLBACK', (rollbackErr) => {
            if (rollbackErr) {
              console.error('❌ Error rolling back transaction (PUT):', rollbackErr);
              reject(rollbackErr);
            } else {
              resolve();
            }
          });
        });
      } catch (rollbackError) {
        console.error('❌ Failed to rollback transaction (PUT):', rollbackError);
      }

      discardRequestReceiptUploads(req, { productInvoice, transportInvoice });

      if (!res.headersSent) {
        const statusCode = error.statusCode || 500;
        if ((statusCode === 409 || statusCode === 400) && error.payload) {
          res.status(statusCode).json(error.payload);
        } else {
          res.status(statusCode).json({
            error: statusCode === 404 ? 'Product receipt not found' : 'Failed to update working sheets: ' + error.message
          });
        }
      }
    }
  };

  // Запускаем обновление приёмки (документ + products + working_sheets — всё в одной транзакции)
  updateReceiptWithProducts().catch((error) => {
    console.error('❌ Unhandled error updating product receipt:', error);
    discardRequestReceiptUploads(req, { productInvoice, transportInvoice });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to update working sheets: ' + error.message });
    }
  });
});

app.delete('/api/product-receipts/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`📦 DELETE /api/product-receipts/${id} - Deleting product receipt`);

  // Вся операция удаления приёмки (products + working_sheets + history + сам документ)
  // выполняется в ОДНОЙ транзакции, чтобы при сбое на любом шаге склад не остался
  // в наполовину удалённом/пересчитанном состоянии.
  await new Promise((resolve, reject) => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error('❌ Error starting transaction (DELETE):', err);
        reject(err);
      } else {
        console.log('🔄 Transaction started (DELETE)');
        resolve();
      }
    });
  });

  try {
    // 1) Считываем шапку приёмки и партии из таблицы products
    const receiptRow = await new Promise((resolve, reject) => {
      db.get('SELECT data_przyjecia, product_invoice, transport_invoice FROM product_receipts WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!receiptRow) {
      console.log(`❌ Receipt ${id} not found`);
      throw Object.assign(new Error('Product receipt not found'), { statusCode: 404 });
    }

    const productRows = await loadReceiptProductBatches(id);
    const products = uniqueReceiptKodsFromRows(productRows);
    const receiptDate = receiptRow.data_przyjecia;
    const receiptDateOnly = (receiptDate || '').toString().substring(0,10);
    console.log(`🔍 ${products.length} product rows, date=${receiptDateOnly}`);

    const blockingDocuments = await findDocumentsBlockingReceiptDelete(id);
    if (blockingDocuments.length > 0) {
      console.log(`⛔ Receipt ${id} delete blocked:`, JSON.stringify(blockingDocuments));
      throw Object.assign(new Error('Receipt delete blocked by existing documents'), {
        statusCode: 409,
        payload: {
          error: 'receipt_delete_blocked',
          message:
            'Nie można usunąć przyjęcia: z partii tego dokumentu były wydania (zamówienia / rozchody / zwroty / przychody)',
          conflicts: blockingDocuments,
        },
      });
    }

    // 2) Удаляем связанные строки из products
    const deletedProductsCount = await new Promise((resolve, reject) => {
      db.run('DELETE FROM products WHERE receipt_id = ?', [id], function (prodErr) {
        if (prodErr) reject(prodErr);
        else resolve(this.changes);
      });
    });
    console.log(`✅ Deleted ${deletedProductsCount} product rows`);

    // 3) Пересчитываем working_sheets для каждого товара (последовательно, а не параллельно,
    // чтобы не полагаться на порядок выполнения независимых callback'ов)
    let wsDeleted = 0;
    let wsUpdated = 0;

    for (const product of products) {
      const productKod = normalizeProductKod(product.kod);

      const wsRow = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM working_sheets WHERE kod = ?', [productKod], (wsErr, row) => {
          if (wsErr) reject(wsErr);
          else resolve(row);
        });
      });

      if (!wsRow) continue;

      const cntRow = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as cnt FROM products WHERE kod = ?', [productKod], (cntErr, row) => {
          if (cntErr) reject(cntErr);
          else resolve(row || { cnt: 0 });
        });
      });

      const leftReceipts = cntRow.cnt || 0;

      if (leftReceipts === 0) {
        // Нет партий — не откатываем ilosc из снимка (он может помнить уже удалённые приёмки).
        const result = await keepWorkingSheetZeroOrDelete(productKod, id);
        if (result === 'deleted') wsDeleted++;
        else wsUpdated++;
      } else {
        const synced = await syncWorkingSheetFromRemainingProducts(productKod);
        if (synced) {
          console.log(`✅ Synced working_sheets ${productKod} from remaining batches after deleting receipt ${id}`);
          wsUpdated++;
        }
      }
    }

    // 4) Удаляем историю working_sheets, относящуюся к этой приёмке
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM working_sheets_history WHERE receipt_id = ?', [id], (historyErr) => {
        if (historyErr) reject(historyErr);
        else resolve();
      });
    });
    console.log(`🗑️ Deleted working_sheets_history for receipt ${id}`);

    // 5) Удаляем сам документ приёмки (после того, как все связанные записи уже удалены)
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM product_receipts WHERE id = ?', [id], function (recErr) {
        if (recErr) reject(recErr);
        else resolve();
      });
    });
    console.log('✅ Product receipt row deleted');

    // 6) Коммитим транзакцию и отправляем ответ
    await new Promise((resolve, reject) => {
      db.run('COMMIT', (err) => {
        if (err) {
          console.error('❌ Error committing transaction (DELETE):', err);
          reject(err);
        } else {
          console.log('✅ Transaction committed successfully (DELETE)');
          resolve();
        }
      });
    });

    unlinkReceiptUpload(receiptRow.product_invoice);
    unlinkReceiptUpload(receiptRow.transport_invoice);

    res.json({
      message: 'Product receipt deleted successfully',
      workingSheetsDeleted: wsDeleted,
      workingSheetsUpdated: wsUpdated,
      priceHistoryDeleted: 0,
    });

  } catch (error) {
    console.error('❌ Error during receipt deletion:', error);

    // Откатываем транзакцию — ни документ, ни products, ни working_sheets
    // не должны измениться при сбое на любом из шагов
    try {
      await new Promise((resolve, reject) => {
        db.run('ROLLBACK', (rollbackErr) => {
          if (rollbackErr) {
            console.error('❌ Error rolling back transaction (DELETE):', rollbackErr);
            reject(rollbackErr);
          } else {
            console.log('🔄 Transaction rolled back (DELETE)');
            resolve();
          }
        });
      });
    } catch (rollbackError) {
      console.error('❌ Failed to rollback transaction (DELETE):', rollbackError);
    }

    if (!res.headersSent) {
      const statusCode = error.statusCode || 500;
      if (statusCode === 409 && error.payload) {
        res.status(409).json(error.payload);
      } else {
        res.status(statusCode).json({
          error: statusCode === 404 ? 'Product receipt not found' : error.message
        });
      }
    }
  }
});



// Working Sheets API
app.get('/api/working-sheets', (req, res) => {
  console.log('📝 GET /api/working-sheets - Fetching all working sheets');
  
  // Проверяем, что база данных доступна
  if (!db) {
    console.error('❌ Database not available');
    return res.status(500).json({ error: 'Database not available' });
  }
  
  db.all('SELECT * FROM working_sheets ORDER BY id DESC', (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log(`✅ Found ${rows.length} working sheets`);
    res.json((rows || []).map((row) => ({
      ...row,
      cena_zakupu_pln: row.cena_zakupu_pln == null ? row.cena_zakupu_pln : roundMoney(row.cena_zakupu_pln),
    })));
  });
});

// Simple search working sheets for invoices (includes products with zero stock)
app.get('/api/working-sheets/search-simple', (req, res) => {
  const { query } = req.query;
  console.log(`🔍 GET /api/working-sheets/search-simple - Simple search with query: "${query}"`);
  
  if (query === undefined || query === null || query.trim() === '') {
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  const searchQuery = `%${query}%`;
  
  db.all(`
    SELECT DISTINCT kod, nazwa, cena_sprzedazy_pln
    FROM working_sheets 
    WHERE (kod LIKE ? OR nazwa LIKE ? OR kod_kreskowy LIKE ?)
    ORDER BY 
      CASE 
        WHEN kod LIKE ? THEN 0
        WHEN nazwa LIKE ? THEN 1
        ELSE 2
      END,
      kod
    LIMIT 50
  `, [searchQuery, searchQuery, searchQuery, searchQuery, searchQuery], (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`✅ Found ${rows.length} products (simple search)`);
    res.json(rows || []);
  });
});

// Search working sheets
app.get('/api/working-sheets/search', (req, res) => {
  const { query, client_id, include_zero_stock, for_reservation, order_id, codes } = req.query;
  console.log(`🔍 GET /api/working-sheets/search - Searching working sheets with query: "${query}"${client_id ? `, client_id: ${client_id}` : ''}${order_id ? `, order_id: ${order_id}` : ''}${include_zero_stock ? ', include_zero_stock: true' : ''}${for_reservation ? ', for_reservation: true' : ''}${codes ? `, codes: ${codes}` : ''}`);

  // Батч-режим: инфо сразу по списку кодов (?codes=kod1,kod2,...) — один запрос вместо N.
  // Считает 3 агрегата ОДИН раз по WHERE kod IN (...) (равенство → работает индекс),
  // без LIKE '%...%'-сканов в цикле. Используется при открытии EditOrderModal.
  if (codes !== undefined) {
    // Не триммим коды: в БД встречаются kod с ведущим/хвостовым пробелом
    // (напр. " ER23R/12B"), а фронт шлёт их как есть и затем фильтрует product.kod === kod.
    const codeList = String(codes)
      .split(',')
      .filter((c) => c.length > 0);

    if (codeList.length === 0) {
      return res.json([]);
    }

    const includeZeroBatch = include_zero_stock === 'true';
    const placeholders = codeList.map(() => '?').join(', ');

    const wsPromiseB = new Promise((resolve, reject) => {
      db.all(
        `SELECT w.kod, MAX(w.nazwa) as nazwa, MAX(w.sprzedawca) as sprzedawca, SUM(w.ilosc) as ilosc_main
         FROM working_sheets w
         WHERE w.kod IN (${placeholders})
         GROUP BY w.kod`,
        codeList,
        (err, rows) => err ? reject(err) : resolve(rows || [])
      );
    });

    const samplesPromiseB = new Promise((resolve, reject) => {
      db.all(
        `SELECT kod, MAX(nazwa) as nazwa, SUM(ilosc_aktualna) as ilosc_samples
         FROM products
         WHERE kod IN (${placeholders}) AND czy_probki = 1
         GROUP BY kod
         HAVING SUM(ilosc_aktualna) > 0`,
        codeList,
        (err, rows) => err ? reject(err) : resolve(rows || [])
      );
    });

    const reservationsPromiseB = new Promise((resolve, reject) => {
      db.all(
        `SELECT rp.product_kod as kod,
                SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as ilosc_reserved,
                SUM(CASE WHEN r.client_id = ? THEN rp.ilosc - COALESCE(rp.ilosc_wydane, 0) ELSE 0 END) as ilosc_client_reserved,
                SUM(CASE WHEN r.client_id = ? THEN rp.ilosc ELSE 0 END) as ilosc_client_reserved_total
         FROM reservation_products rp
         INNER JOIN reservations r ON rp.reservation_id = r.id
         WHERE r.status = 'aktywna' AND rp.product_kod IN (${placeholders})
         GROUP BY rp.product_kod`,
        [client_id || 0, client_id || 0, ...codeList],
        (err, rows) => err ? reject(err) : resolve(rows || [])
      );
    });

    Promise.all([wsPromiseB, samplesPromiseB, reservationsPromiseB])
      .then(([wsRows, samplesRows, reservationsRows]) => {
        const samplesByKod = new Map();
        samplesRows.forEach(r => samplesByKod.set(r.kod, r.ilosc_samples || 0));

        const reservationsByKod = new Map();
        reservationsRows.forEach(r => reservationsByKod.set(r.kod, {
          ilosc_reserved: r.ilosc_reserved || 0,
          ilosc_client_reserved: r.ilosc_client_reserved || 0,
          ilosc_client_reserved_total: r.ilosc_client_reserved_total || 0
        }));

        const wsMainByKod = new Map(wsRows.map(r => [r.kod, r.ilosc_main || 0]));
        const sprzedawcaByKod = new Map(wsRows.map(r => [r.kod, r.sprzedawca || '']));

        const result = [];

        // Основные строки — working_sheets
        wsRows.forEach(ws => {
          const samplesQty = samplesByKod.get(ws.kod) || 0;
          const mainOnly = (ws.ilosc_main || 0) - samplesQty;
          if (!includeZeroBatch && mainOnly <= 0) return;

          const reserved = reservationsByKod.get(ws.kod) || { ilosc_reserved: 0, ilosc_client_reserved: 0, ilosc_client_reserved_total: 0 };
          const row = {
            kod: ws.kod,
            nazwa: ws.nazwa,
            sprzedawca: ws.sprzedawca || '',
            ilosc: mainOnly,
            ilosc_reserved: reserved.ilosc_reserved,
            czy_probki: 0,
            status: null
          };
          if (client_id) {
            row.ilosc_client_reserved = reserved.ilosc_client_reserved;
            row.ilosc_client_reserved_total = reserved.ilosc_client_reserved_total;
          }
          result.push(row);
        });

        // Строки семплов
        samplesRows.forEach(sp => {
          const sampleQty = sp.ilosc_samples || 0;
          if (sampleQty <= 0) return;
          const wsMain = wsMainByKod.get(sp.kod) || 0;
          if (wsMain <= 0) return;
          const effectiveSampleQty = Math.min(sampleQty, wsMain);
          if (effectiveSampleQty <= 0) return;

          const reserved = reservationsByKod.get(sp.kod) || { ilosc_reserved: 0, ilosc_client_reserved: 0, ilosc_client_reserved_total: 0 };
          const row = {
            kod: sp.kod,
            nazwa: `${sp.nazwa} (samples)`,
            sprzedawca: sprzedawcaByKod.get(sp.kod) || '',
            ilosc: effectiveSampleQty,
            ilosc_reserved: reserved.ilosc_reserved,
            czy_probki: 1,
            status: 'samples'
          };
          if (client_id) {
            row.ilosc_client_reserved = reserved.ilosc_client_reserved;
            row.ilosc_client_reserved_total = reserved.ilosc_client_reserved_total;
          }
          result.push(row);
        });

        enrichSearchRowsWithOrderReservation(order_id, result, (enrichErr, enrichedRows) => {
          if (enrichErr) {
            console.error('❌ Error enriching batch rows with order reservation:', enrichErr);
            return res.status(500).json({ error: enrichErr.message });
          }
          console.log(`✅ Batch search: ${enrichedRows.length} rows for ${codeList.length} codes`);
          res.json(enrichedRows);
        });
      })
      .catch(err => {
        console.error('❌ Database error (batch):', err);
        res.status(500).json({ error: err.message });
      });
    return;
  }

  if (query === undefined || query === null) {
    console.log('❌ Validation failed: query parameter is required');
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  // Если query пустой, используем '%' для поиска всех
  const searchQuery = query.trim() === '' ? '%' : `%${query}%`;
  const startsWithQuery = query.trim() === '' ? '%' : `${query}%`;

  // Режим для резервации: одна строка на товар с суммарным остатком (основной + семплы)
  if (for_reservation === 'true') {
    const reservationQuery = client_id ? `
      WITH ws_products AS (
        SELECT w.kod, MAX(w.nazwa) as nazwa, SUM(w.ilosc) as ilosc_main
        FROM working_sheets w
        WHERE (w.kod LIKE ? OR w.nazwa LIKE ? OR w.kod_kreskowy LIKE ?)
        GROUP BY w.kod
      ),
      reserved_products AS (
        SELECT rp.product_kod as kod,
          SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as ilosc_reserved
        FROM reservation_products rp
        INNER JOIN reservations r ON rp.reservation_id = r.id
        WHERE r.status = 'aktywna'
        GROUP BY rp.product_kod
      ),
      client_reservations AS (
        SELECT rp.product_kod as kod,
          SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as ilosc_client_reserved
        FROM reservation_products rp
        INNER JOIN reservations r ON rp.reservation_id = r.id
        WHERE r.status = 'aktywna' AND r.client_id = ?
        GROUP BY rp.product_kod
      )
      SELECT ws.kod, ws.nazwa,
        COALESCE(ws.ilosc_main, 0) as ilosc,
        COALESCE(rp.ilosc_reserved, 0) as ilosc_reserved,
        COALESCE(cr.ilosc_client_reserved, 0) as ilosc_client_reserved,
        NULL as status,
        CASE WHEN ws.kod LIKE ? THEN 0 WHEN ws.nazwa LIKE ? THEN 1 ELSE 2 END as match_priority
      FROM ws_products ws
      LEFT JOIN reserved_products rp ON ws.kod = rp.kod
      LEFT JOIN client_reservations cr ON ws.kod = cr.kod
      WHERE COALESCE(ws.ilosc_main, 0) > 0
      ORDER BY match_priority, ws.kod, ws.nazwa
      LIMIT ${query.trim() === '' ? 500 : 50}
    ` : `
      WITH ws_products AS (
        SELECT w.kod, MAX(w.nazwa) as nazwa, SUM(w.ilosc) as ilosc_main
        FROM working_sheets w
        WHERE (w.kod LIKE ? OR w.nazwa LIKE ? OR w.kod_kreskowy LIKE ?)
        GROUP BY w.kod
      ),
      reserved_products AS (
        SELECT rp.product_kod as kod,
          SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as ilosc_reserved
        FROM reservation_products rp
        INNER JOIN reservations r ON rp.reservation_id = r.id
        WHERE r.status = 'aktywna'
        GROUP BY rp.product_kod
      )
      SELECT ws.kod, ws.nazwa,
        COALESCE(ws.ilosc_main, 0) as ilosc,
        COALESCE(rp.ilosc_reserved, 0) as ilosc_reserved,
        NULL as status,
        CASE WHEN ws.kod LIKE ? THEN 0 WHEN ws.nazwa LIKE ? THEN 1 ELSE 2 END as match_priority
      FROM ws_products ws
      LEFT JOIN reserved_products rp ON ws.kod = rp.kod
      WHERE COALESCE(ws.ilosc_main, 0) > 0
      ORDER BY match_priority, ws.kod, ws.nazwa
      LIMIT ${query.trim() === '' ? 500 : 50}
    `;

    const reservationParams = client_id
      ? [searchQuery, searchQuery, searchQuery, client_id, startsWithQuery, searchQuery]
      : [searchQuery, searchQuery, searchQuery, startsWithQuery, searchQuery];

    db.all(reservationQuery, reservationParams, (err, rows) => {
      if (err) {
        console.error('❌ Database error (for_reservation):', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Found ${rows.length} products (for_reservation) matching "${query}"`);
      res.json(rows || []);
    });
    return;
  }

  // Упрощённая логика поиска: запускаем 3 простых запроса параллельно и объединяем в JS.
  // 1) working_sheets — основной товар (суммарно по kod)
  // 2) products (czy_probki=1) — семплы
  // 3) reservation_products + reservations — все активные резервации (общие и по клиенту)
  const includeZero = include_zero_stock === 'true';
  const limitRows = query.trim() === '' ? 500 : 50;

  const wsPromise = new Promise((resolve, reject) => {
    db.all(
      `SELECT w.kod, MAX(w.nazwa) as nazwa, MAX(w.sprzedawca) as sprzedawca, SUM(w.ilosc) as ilosc_main
       FROM working_sheets w
       WHERE (w.kod LIKE ? OR w.nazwa LIKE ? OR w.kod_kreskowy LIKE ?)
       GROUP BY w.kod`,
      [searchQuery, searchQuery, searchQuery],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });

  const samplesPromise = new Promise((resolve, reject) => {
    db.all(
      `SELECT kod, MAX(nazwa) as nazwa, SUM(ilosc_aktualna) as ilosc_samples
       FROM products
       WHERE (kod LIKE ? OR nazwa LIKE ? OR kod_kreskowy LIKE ?)
         AND czy_probki = 1
       GROUP BY kod
       HAVING SUM(ilosc_aktualna) > 0`,
      [searchQuery, searchQuery, searchQuery],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });

  const reservationsPromise = new Promise((resolve, reject) => {
    db.all(
      `SELECT rp.product_kod as kod,
              SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as ilosc_reserved,
              SUM(CASE WHEN r.client_id = ? THEN rp.ilosc - COALESCE(rp.ilosc_wydane, 0) ELSE 0 END) as ilosc_client_reserved,
              SUM(CASE WHEN r.client_id = ? THEN rp.ilosc ELSE 0 END) as ilosc_client_reserved_total
       FROM reservation_products rp
       INNER JOIN reservations r ON rp.reservation_id = r.id
       WHERE r.status = 'aktywna'
       GROUP BY rp.product_kod`,
      [client_id || 0, client_id || 0],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });

  Promise.all([wsPromise, samplesPromise, reservationsPromise])
    .then(([wsRows, samplesRows, reservationsRows]) => {
      // Маппы для быстрого поиска
      const samplesByKod = new Map();
      samplesRows.forEach(r => samplesByKod.set(r.kod, r.ilosc_samples || 0));

      const reservationsByKod = new Map();
      reservationsRows.forEach(r => reservationsByKod.set(r.kod, {
        ilosc_reserved: r.ilosc_reserved || 0,
        ilosc_client_reserved: r.ilosc_client_reserved || 0,
        ilosc_client_reserved_total: r.ilosc_client_reserved_total || 0
      }));

      // Все коды товаров, которые есть в working_sheets
      const wsCodes = new Set(wsRows.map(r => r.kod));
      // Карта: kod → ilosc_main (для проверки остатка при отображении семплов)
      const wsMainByKod = new Map(wsRows.map(r => [r.kod, r.ilosc_main || 0]));
      const sprzedawcaByKod = new Map(wsRows.map(r => [r.kod, r.sprzedawca || '']));

      // Сортировка: точное/префиксное совпадение по kod в начале, далее по nazwa
      const matchPriority = (kod, nazwa) => {
        const q = query.trim().toLowerCase();
        if (!q) return 2;
        if ((kod || '').toLowerCase().startsWith(q)) return 0;
        if ((nazwa || '').toLowerCase().includes(q)) return 1;
        return 2;
      };

      const result = [];

      // Основные строки — working_sheets
      wsRows.forEach(ws => {
        const samplesQty = samplesByKod.get(ws.kod) || 0;
        const mainOnly = (ws.ilosc_main || 0) - samplesQty;
        if (!includeZero && mainOnly <= 0) return;

        const reserved = reservationsByKod.get(ws.kod) || { ilosc_reserved: 0, ilosc_client_reserved: 0, ilosc_client_reserved_total: 0 };
        const row = {
          kod: ws.kod,
          nazwa: ws.nazwa,
          sprzedawca: ws.sprzedawca || '',
          ilosc: mainOnly,
          ilosc_reserved: reserved.ilosc_reserved,
          czy_probki: 0,
          status: null,
          _sort_priority: matchPriority(ws.kod, ws.nazwa)
        };
        if (client_id) {
          row.ilosc_client_reserved = reserved.ilosc_client_reserved;
          row.ilosc_client_reserved_total = reserved.ilosc_client_reserved_total;
        }
        result.push(row);
      });

      // Строки семплов
      samplesRows.forEach(sp => {
        const sampleQty = sp.ilosc_samples || 0;
        if (sampleQty <= 0) return;

        // Не показываем семплы если в working_sheets остаток <= 0
        const wsMain = wsMainByKod.get(sp.kod) || 0;
        if (wsMain <= 0) return;

        // Показываем не больше, чем есть в working_sheets
        const effectiveSampleQty = Math.min(sampleQty, wsMain);
        if (effectiveSampleQty <= 0) return;

        const q = query.trim().toLowerCase();
        const matchesSearch = !q
          || (sp.kod || '').toLowerCase().includes(q)
          || (sp.nazwa || '').toLowerCase().includes(q);
        // Показываем семплы, если есть основная строка по kod ИЛИ если они подходят под поиск
        if (!wsCodes.has(sp.kod) && !matchesSearch) return;

        const reserved = reservationsByKod.get(sp.kod) || { ilosc_reserved: 0, ilosc_client_reserved: 0, ilosc_client_reserved_total: 0 };
        const row = {
          kod: sp.kod,
          nazwa: `${sp.nazwa} (samples)`,
          sprzedawca: sprzedawcaByKod.get(sp.kod) || '',
          ilosc: effectiveSampleQty,
          ilosc_reserved: reserved.ilosc_reserved,
          czy_probki: 1,
          status: 'samples',
          _sort_priority: matchPriority(sp.kod, sp.nazwa)
        };
        if (client_id) {
          row.ilosc_client_reserved = reserved.ilosc_client_reserved;
          row.ilosc_client_reserved_total = reserved.ilosc_client_reserved_total;
        }
        result.push(row);
      });

      // Сортировка
      result.sort((a, b) => {
        if (a._sort_priority !== b._sort_priority) return a._sort_priority - b._sort_priority;
        if (a.kod !== b.kod) return a.kod.localeCompare(b.kod);
        // в рамках одного kod: основной (status=null) до семплов
        if ((a.czy_probki || 0) !== (b.czy_probki || 0)) return (a.czy_probki || 0) - (b.czy_probki || 0);
        return (a.nazwa || '').localeCompare(b.nazwa || '');
      });

      // Удаляем служебное поле и применяем лимит
      const finalRows = result.slice(0, limitRows).map(({ _sort_priority, ...rest }) => rest);

      enrichSearchRowsWithOrderReservation(order_id, finalRows, (enrichErr, enrichedRows) => {
        if (enrichErr) {
          console.error('❌ Error enriching search rows with order reservation:', enrichErr);
          return res.status(500).json({ error: enrichErr.message });
        }

        console.log(`✅ Found ${enrichedRows.length} products matching "${query}"`);
        res.json(enrichedRows);
      });
    })
    .catch(err => {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
    });
});

app.post('/api/working-sheets', (req, res) => {
  const { kod, nazwa, ilosc, typ } = req.body;
  const normalizedKod = normalizeProductKod(kod);
  console.log('📝 POST /api/working-sheets - Creating new working sheet:', { kod: normalizedKod, nazwa, ilosc, typ });

  if (!normalizedKod || !nazwa || !ilosc) {
    console.log('❌ Validation failed: kod, nazwa, and ilosc are required');
    return res.status(400).json({ error: 'Kod, nazwa, and ilosc are required' });
  }

  db.get(
    'SELECT id FROM working_sheets WHERE kod = ?',
    [normalizedKod],
    (findErr, existing) => {
      if (findErr) {
        console.error('❌ Database error:', findErr);
        return res.status(500).json({ error: findErr.message });
      }

      if (existing) {
        return res.status(409).json({
          error: `Produkt o kodzie "${normalizedKod}" już istnieje w working_sheets (id: ${existing.id})`,
        });
      }

      db.run(
        'INSERT INTO working_sheets (kod, nazwa, ilosc, typ) VALUES (?, ?, ?, ?)',
        [normalizedKod, nazwa, ilosc, typ || 'sprzedaz'],
        function(err) {
          if (err) {
            console.error('❌ Database error:', err);
            res.status(500).json({ error: err.message });
            return;
          }
          console.log(`✅ Working sheet created with ID: ${this.lastID}`);
          res.json({ id: this.lastID, message: 'Working sheet added successfully' });
        }
      );
    }
  );
});

// Добавляем endpoint для удаления working sheet
app.delete('/api/working-sheets/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📝 DELETE /api/working-sheets/${id} - Deleting working sheet`);
  
  // Сначала проверяем, существует ли запись
  db.get('SELECT * FROM working_sheets WHERE id = ?', [id], (err, existingRecord) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!existingRecord) {
      console.log(`❌ Working sheet with ID ${id} not found`);
      return res.status(404).json({ error: 'Working sheet not found' });
    }
    
    console.log(`🔄 Found existing record: ${existingRecord.kod} (ilosc: ${existingRecord.ilosc})`);
    
    // Удаляем запись
    db.run('DELETE FROM working_sheets WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      console.log(`✅ Working sheet ${id} (${existingRecord.kod}) deleted successfully`);
      res.json({ 
        message: 'Working sheet deleted successfully',
        id: id,
        kod: existingRecord.kod,
        nazwa: existingRecord.nazwa
      });
    });
  });
});

app.put('/api/working-sheets/update', (req, res) => {
  const { id, kod, nazwa, ilosc, typ, kod_kreskowy, data_waznosci, objetosc, sprzedawca, cena_zakupu_pln, cena_sprzedazy_pln, koszt_dostawy_per_unit, podatek_akcyzowy } = req.body;
  const normalizedKod = kod !== undefined && kod !== null ? normalizeProductKod(kod) : undefined;
  console.log(`📝 PUT /api/working-sheets/update - Updating working sheet:`, { 
    id, 
    kod: normalizedKod, 
    nazwa, 
    ilosc, 
    typ 
  });
  
  if (!id) {
    console.log('❌ Validation failed: ID is required');
    return res.status(400).json({ error: 'ID is required' });
  }
  
  // Сначала проверяем, существует ли запись
  db.get('SELECT * FROM working_sheets WHERE id = ?', [id], (err, existingRecord) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!existingRecord) {
      console.log(`❌ Working sheet with ID ${id} not found`);
      return res.status(404).json({ error: 'Working sheet not found' });
    }
    
    console.log(`🔄 Found existing record: ${existingRecord.kod} (current ilosc: ${existingRecord.ilosc})`);
    
    // Получаем тип товара (из запроса или из существующей записи)
    const finalTyp = typ !== undefined ? typ : existingRecord.typ;
    
    // Получаем значения для расчета
    const finalCena = roundMoney(cena_zakupu_pln !== undefined ? cena_zakupu_pln : existingRecord.cena_zakupu_pln);
    let finalKosztDostawyPerUnit = koszt_dostawy_per_unit !== undefined ? koszt_dostawy_per_unit : existingRecord.koszt_dostawy_per_unit;
    let finalPodatekAkcyzowy = roundMoney(podatek_akcyzowy !== undefined ? podatek_akcyzowy : existingRecord.podatek_akcyzowy);
    
    // Для bezalkoholowe, ferment и aksesoria акциз всегда 0
    const isBezalkoholoweOrFermentOrAksesoria = finalTyp === 'bezalkoholowe' || finalTyp === 'ferment' || finalTyp === 'aksesoria';
    if (isBezalkoholoweOrFermentOrAksesoria) {
      finalPodatekAkcyzowy = 0;
      console.log(`🔍 Product type is ${finalTyp}, setting podatek_akcyzowy to 0`);
    }
    
    // Для aksesoria транспорт не распределяется
    if (finalTyp === 'aksesoria') {
      finalKosztDostawyPerUnit = 0;
      console.log(`🔍 Product type is aksesoria, setting koszt_dostawy_per_unit to 0`);
    }
    
    // Используем переданный курс из формы или пытаемся получить из связанного receipt'а
    const productKod = normalizedKod !== undefined ? normalizedKod : normalizeProductKod(existingRecord.kod);
    
    if (!productKod) {
      return res.status(400).json({ error: 'Kod produktu nie może być pusty' });
    }

    db.run(
      'UPDATE working_sheets SET kod = ?, nazwa = ?, ilosc = ?, typ = ?, kod_kreskowy = ?, data_waznosci = ?, objetosc = ?, sprzedawca = ?, cena_zakupu_pln = ?, cena_sprzedazy_pln = ?, koszt_dostawy_per_unit = ?, podatek_akcyzowy = ? WHERE id = ?',
      [
        productKod,
        nazwa || existingRecord.nazwa,
        ilosc || existingRecord.ilosc,
        typ || existingRecord.typ,
        kod_kreskowy || existingRecord.kod_kreskowy,
        data_waznosci || existingRecord.data_waznosci,
        objetosc || existingRecord.objetosc,
        sprzedawca || existingRecord.sprzedawca,
        finalCena,
        cena_sprzedazy_pln !== undefined ? cena_sprzedazy_pln : existingRecord.cena_sprzedazy_pln,
        finalKosztDostawyPerUnit,
        finalPodatekAkcyzowy,
        id
      ],
      function(err) {
        if (err) {
          console.error('❌ Database error:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        console.log(`✅ Working sheet ${id} updated successfully`);
        console.log(`📊 Changes: kod=${productKod}, nazwa=${nazwa || existingRecord.nazwa}, ilosc=${ilosc || existingRecord.ilosc}`);
        
        if (cena_zakupu_pln && cena_zakupu_pln !== existingRecord.cena_zakupu_pln) {
          console.log(`💰 Price changed for ${productKod}: ${existingRecord.cena_zakupu_pln} → ${cena_zakupu_pln}`);
          console.log(`🔄 Updating price in products table for records with receipt_id = NULL`);
          
          db.run(
            'UPDATE products SET cena_zakupu_pln = ? WHERE kod = ? AND receipt_id IS NULL',
            [roundMoney(cena_zakupu_pln), productKod],
            function(updateErr) {
              if (updateErr) {
                console.error(`❌ Error updating products table:`, updateErr);
              } else if (this.changes > 0) {
                console.log(`✅ Updated ${this.changes} record(s) in products table`);
              } else {
                console.log(`ℹ️ No records with receipt_id = NULL found in products for ${productKod}`);
              }
            }
          );
        }
        
        res.json({ 
          message: 'Working sheet updated successfully',
          id: id,
          changes: {
            kod: productKod,
            nazwa: nazwa || existingRecord.nazwa,
            ilosc: ilosc || existingRecord.ilosc,
            typ: typ || existingRecord.typ
          }
        });
      }
    );
  });
});

// Добавляем новый endpoint для обновления количества товара
app.patch('/api/working-sheets/:id/quantity', (req, res) => {
  const { id } = req.params;
  const { ilosc, operation = 'set' } = req.body; // operation: 'set', 'add', 'subtract'
  console.log(`📝 PATCH /api/working-sheets/${id}/quantity - Updating quantity:`, { ilosc, operation });
  
  if (!ilosc && ilosc !== 0) {
    console.log('❌ Validation failed: ilosc is required');
    return res.status(400).json({ error: 'ilosc is required' });
  }
  
  // Сначала получаем текущую запись
  db.get('SELECT * FROM working_sheets WHERE id = ?', [id], (err, existingRecord) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!existingRecord) {
      console.log(`❌ Working sheet with ID ${id} not found`);
      return res.status(404).json({ error: 'Working sheet not found' });
    }
    
    console.log(`🔄 Found existing record: ${existingRecord.kod} (current ilosc: ${existingRecord.ilosc})`);
    
    // Вычисляем новое количество
    let newQuantity;
    switch (operation) {
      case 'add':
        newQuantity = existingRecord.ilosc + ilosc;
        console.log(`➕ Adding ${ilosc} to current quantity ${existingRecord.ilosc} = ${newQuantity}`);
        break;
      case 'subtract':
        newQuantity = existingRecord.ilosc - ilosc;
        console.log(`➖ Subtracting ${ilosc} from current quantity ${existingRecord.ilosc} = ${newQuantity}`);
        break;
      case 'set':
      default:
        newQuantity = ilosc;
        console.log(`🔄 Setting quantity from ${existingRecord.ilosc} to ${newQuantity}`);
        break;
    }
    
    // Проверяем, что количество не отрицательное
    if (newQuantity < 0) {
      console.log(`❌ Invalid quantity: ${newQuantity} (cannot be negative)`);
      return res.status(400).json({ error: 'Quantity cannot be negative' });
    }
    
    // Обновляем количество
    db.run(
      'UPDATE working_sheets SET ilosc = ? WHERE id = ?',
      [newQuantity, id],
      function(err) {
        if (err) {
          console.error('❌ Database error:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        console.log(`✅ Working sheet ${id} quantity updated: ${existingRecord.ilosc} → ${newQuantity}`);
        
        res.json({ 
          message: 'Working sheet quantity updated successfully',
          id: id,
          kod: existingRecord.kod,
          oldQuantity: existingRecord.ilosc,
          newQuantity: newQuantity,
          operation: operation
        });
      }
    );
  });
});

// Добавляем endpoint для массового обновления working_sheets
app.post('/api/working-sheets/bulk-update', (req, res) => {
  const { updates } = req.body; // массив объектов { id, ilosc, nazwa, typ, etc. }
  console.log(`📝 POST /api/working-sheets/bulk-update - Bulk updating ${updates?.length || 0} records`);
  
  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    console.log('❌ Validation failed: updates array is required');
    return res.status(400).json({ error: 'updates array is required' });
  }
  
  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  const results = [];
  
  updates.forEach((update, index) => {
    console.log(`🔄 Processing update ${index + 1}/${updates.length}:`, update);
    
    if (!update.id) {
      console.log(`❌ Update ${index + 1} failed: ID is required`);
      errorCount++;
      results.push({ id: update.id, success: false, error: 'ID is required' });
      processedCount++;
      checkCompletion();
      return;
    }
    
    // Обновляем запись
    const updateFields = [];
    const updateValues = [];
    
    if (update.ilosc !== undefined) {
      updateFields.push('ilosc = ?');
      updateValues.push(update.ilosc);
    }
    if (update.nazwa !== undefined) {
      updateFields.push('nazwa = ?');
      updateValues.push(update.nazwa);
    }
    if (update.typ !== undefined) {
      updateFields.push('typ = ?');
      updateValues.push(update.typ);
    }
    if (update.kod_kreskowy !== undefined) {
      updateFields.push('kod_kreskowy = ?');
      updateValues.push(update.kod_kreskowy);
    }
    if (update.data_waznosci !== undefined) {
      updateFields.push('data_waznosci = ?');
      updateValues.push(update.data_waznosci);
    }
    if (update.objetosc !== undefined) {
      updateFields.push('objetosc = ?');
      updateValues.push(update.objetosc);
    }
    if (update.sprzedawca !== undefined) {
      updateFields.push('sprzedawca = ?');
      updateValues.push(update.sprzedawca);
    }
    if (update.cena_zakupu_pln !== undefined) {
      updateFields.push('cena_zakupu_pln = ?');
      updateValues.push(roundMoney(update.cena_zakupu_pln));
    }
    if (update.cena_sprzedazy_pln !== undefined) {
      updateFields.push('cena_sprzedazy_pln = ?');
      updateValues.push(update.cena_sprzedazy_pln);
    }
    
    if (updateFields.length === 0) {
      console.log(`⚠️ Update ${index + 1} skipped: no fields to update`);
      results.push({ id: update.id, success: true, message: 'No fields to update' });
      successCount++;
      processedCount++;
      checkCompletion();
      return;
    }
    
    updateValues.push(update.id);
    
    db.run(
      `UPDATE working_sheets SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues,
      function(err) {
        if (err) {
          console.error(`❌ Error updating working sheet ${update.id}:`, err);
          errorCount++;
          results.push({ id: update.id, success: false, error: err.message });
        } else {
          console.log(`✅ Working sheet ${update.id} updated successfully`);
          successCount++;
          results.push({ id: update.id, success: true, changes: updateFields.length });
        }
        processedCount++;
        checkCompletion();
      }
    );
  });
  
  function checkCompletion() {
    if (processedCount === updates.length) {
      if (res.headersSent) {
        console.log('⚠️ Response already sent, skipping checkCompletion');
        return;
      }
      
      console.log(`🎉 Bulk update complete: ${successCount} successful, ${errorCount} failed`);
      res.json({ 
        message: 'Bulk update completed',
        total: updates.length,
        successful: successCount,
        failed: errorCount,
        results: results
      });
    }
  }
});

// Original Sheets API
app.get('/api/original-sheets', (req, res) => {
  db.all('SELECT * FROM original_sheets ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Преобразуем данные в формат, ожидаемый фронтендом
    const processedRows = rows.map(row => ({
      id: row.id,
      fileName: row.file_name,
      data: row.data ? JSON.parse(row.data) : { headers: [], rows: [] },
      created_at: row.created_at
    }));
    
    res.json(processedRows || []);
  });
});

app.post('/api/original-sheets', (req, res) => {
  const { file_name, data } = req.body;
  
  if (!file_name) {
    return res.status(400).json({ error: 'File name is required' });
  }
  
  db.run(
    'INSERT INTO original_sheets (file_name, data) VALUES (?, ?)',
    [file_name, data],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Original sheet added successfully' });
    }
  );
});




// DUPLICATE price-history endpoint - REMOVED


// File Upload API
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    message: 'File uploaded successfully',
    filename: req.file.filename,
    originalname: req.file.originalname
  });
});

// File Management API
app.get('/api/check_file/:fileName', (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join(__dirname, 'uploads', fileName);
  
  if (fs.existsSync(filePath)) {
    res.json({ exists: true, path: filePath });
  } else {
    res.json({ exists: false });
  }
});



// Download file API
app.get('/api/download_file/:fileName', (req, res) => {
  const { fileName } = req.params;
  
  // Ищем файл в базе данных
  db.get('SELECT * FROM original_sheets WHERE file_name = ?', [fileName], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Database error' });
      return;
    }
    
    if (!row) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    
    try {
      const data = JSON.parse(row.data);
      
             // Создаем HTML страницу с таблицей в стиле модального окна
       const htmlContent = `
         <!DOCTYPE html>
         <html>
         <head>
           <meta charset="UTF-8">
           <title>${fileName}</title>
           <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap" rel="stylesheet">
           <style>
             * {
               margin: 0;
               padding: 0;
               box-sizing: border-box;
             }
             
             body { 
               font-family: 'Sora', sans-serif; 
               margin: 0;
               padding: 24px;
               background-color: #f9fafb;
               color: #374151;
               line-height: 1.5;
             }
             
             .container {
               max-width: 1200px;
               margin: 0 auto;
               background: white;
               border-radius: 0.5rem;
               box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
               overflow: hidden;
             }
             
             .header {
               padding: 24px;
               border-bottom: 1px solid #e5e7eb;
               background: white;
             }
             
             .header h1 {
               font-size: 1rem;
               font-weight: 600;
               color: #1f2937;
               margin: 0;
             }
             
             .content {
               padding: 24px;
               overflow-x: auto;
             }
             
             table { 
               border-collapse: collapse; 
               width: 100%; 
               font-size: 0.75rem;
               font-family: 'Sora', sans-serif;
             }
             
             th, td { 
               border: 1px solid #d1d5db; 
               padding: 6px 12px; 
               text-align: left; 
               vertical-align: top;
             }
             
             th { 
               background-color: #f3f4f6; 
               font-weight: 600;
               color: #374151;
               font-size: 0.75rem;
               text-transform: uppercase;
               letter-spacing: 0.05em;
             }
             
             tr:nth-child(even) { 
               background-color: #f9fafb; 
             }
             
             tr:hover {
               background-color: #f3f4f6;
             }
             
             td {
               color: #374151;
               font-size: 0.75rem;
             }
             
             .empty-cell {
               color: #9ca3af;
               font-style: italic;
             }
             
             @media (max-width: 768px) {
               body {
                 padding: 12px;
               }
               
               .container {
                 border-radius: 0.375rem;
               }
               
               .header, .content {
                 padding: 16px;
               }
               
               table {
                 font-size: 0.625rem;
               }
               
               th, td {
                 padding: 4px 8px;
               }
             }
           </style>
         </head>
         <body>
           <div class="container">
             <div class="header">
               <h1>${fileName}</h1>
             </div>
             <div class="content">
               <table>
                 <thead>
                   <tr>
                     ${data.headers.map(header => `<th>${header || ''}</th>`).join('')}
                   </tr>
                 </thead>
                 <tbody>
                   ${data.rows.map(row => 
                     `<tr>${row.map(cell => `<td class="${!cell ? 'empty-cell' : ''}">${cell || ''}</td>`).join('')}</tr>`
                   ).join('')}
                 </tbody>
               </table>
             </div>
           </div>
         </body>
         </html>
       `;
      
      // Отправляем HTML страницу
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(htmlContent);
    } catch (error) {
      console.error('Error generating HTML:', error);
      res.status(500).json({ error: 'Error generating HTML' });
    }
  });
});

// Sheets API
app.post('/api/sheets', (req, res) => {
  const { fileName, data } = req.body;
  
  if (!fileName) {
    return res.status(400).json({ error: 'File name is required' });
  }
  
  // Проверяем, есть ли уже файл в системе
  db.get('SELECT COUNT(*) as count FROM original_sheets', (err, row) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (row.count > 0) {
      return res.status(409).json({ error: 'Only one Excel file can be uploaded at a time. Please delete the existing file first.' });
    }
    
    // Сохраняем данные в таблицу original_sheets
  db.run(
    'INSERT INTO original_sheets (file_name, data) VALUES (?, ?)',
    [fileName, JSON.stringify(data)],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      const originalSheetId = this.lastID;
      
      // Преобразуем Excel данные в формат working_sheets и сохраняем
      try {
        const { headers, rows } = data;
        
        console.log('=== ПАРСИНГ EXCEL ФАЙЛА ===');
        console.log('fileName:', fileName);
        console.log('headers:', headers);
        console.log('rows count:', rows.length);
        
        // Ищем индексы нужных колонок
        const kodIndex = headers.findIndex(h => 
          h && h.toLowerCase().includes('kod') || 
          h && h.toLowerCase().includes('код') ||
          h && h.toLowerCase().includes('code')
        );
        const nazwaIndex = headers.findIndex(h => 
          h && h.toLowerCase().includes('nazwa') || 
          h && h.toLowerCase().includes('название') ||
          h && h.toLowerCase().includes('name') ||
          h && h.toLowerCase().includes('product')
        );
        const iloscIndex = headers.findIndex(h => 
          h && h.toLowerCase().includes('ilosc') || 
          h && h.toLowerCase().includes('количество') ||
          h && h.toLowerCase().includes('quantity') ||
          h && h.toLowerCase().includes('amount')
        );
        const dataIndex = headers.findIndex(h => 
          h && h.toLowerCase().includes('data') || 
          h && h.toLowerCase().includes('дата') ||
          h && h.toLowerCase().includes('date')
        );
        
        console.log('Найденные индексы:');
        console.log('- kodIndex:', kodIndex, '(поиск: kod, код, code)');
        console.log('- nazwaIndex:', nazwaIndex, '(поиск: nazwa, название, name, product)');
        console.log('- iloscIndex:', iloscIndex, '(поиск: ilosc, количество, quantity, amount)');
        console.log('- dataIndex:', dataIndex, '(поиск: data, дата, date)');
        
        // Если не нашли нужные колонки, используем первые доступные
        const finalKodIndex = kodIndex >= 0 ? kodIndex : 0;
        const finalNazwaIndex = nazwaIndex >= 0 ? nazwaIndex : (kodIndex >= 0 ? 1 : 0);
        const finalIloscIndex = iloscIndex >= 0 ? iloscIndex : (nazwaIndex >= 0 ? 2 : 1);
        const finalDataIndex = dataIndex >= 0 ? dataIndex : (iloscIndex >= 0 ? 3 : 2);
        
        console.log('Финальные индексы:');
        console.log('- finalKodIndex:', finalKodIndex);
        console.log('- finalNazwaIndex:', finalNazwaIndex);
        console.log('- finalIloscIndex:', finalIloscIndex);
        console.log('- finalDataIndex:', finalDataIndex);
        
        // Получаем текущую дату для записей без даты
        const currentDate = new Date().toISOString().split('T')[0];
        
        // Подготавливаем данные для вставки в working_sheets
        const workingSheetData = rows.map((row, index) => {
          // Функция для проверки пустых значений
          const getValueOrNull = (value) => {
            if (value === undefined || value === null || value === '' || value === 'undefined' || value === 'null') {
              return null;
            }
            return value.toString().trim();
          };
          
          const getNumberOrNull = (value) => {
            if (value === undefined || value === null || value === '' || value === 'undefined' || value === 'null') {
              return null;
            }
            const num = parseInt(value);
            return isNaN(num) ? null : num;
          };
          
          const kod = normalizeProductKod(getValueOrNull(row[finalKodIndex]));
          const nazwa = getValueOrNull(row[finalNazwaIndex]);
          const ilosc = getNumberOrNull(row[finalIloscIndex]);
          
          // Ищем только kod_kreskowy в заголовках
          const kodKreskowyIndex = headers.findIndex(h => 
            h && h.toLowerCase().includes('kreskowy') || 
            h && h.toLowerCase().includes('штрих') ||
            h && h.toLowerCase().includes('barcode')
          );
          
          return {
            kod: kod,
            nazwa: nazwa,
            ilosc: ilosc,
            typ: null, // не копируем из Excel
            kod_kreskowy: kodKreskowyIndex >= 0 ? getValueOrNull(row[kodKreskowyIndex]) : null,
            data_waznosci: null, // не копируем из Excel
            objetosc: null, // не копируем из Excel
            sprzedawca: null // не копируем из Excel
          };
        });
        
        console.log('Обработано строк:', workingSheetData.length);
        
        // Фильтруем пустые записи
        const filteredData = workingSheetData.filter(item => item.kod && item.nazwa && item.ilosc && item.ilosc > 0);
        
        console.log('После фильтрации:', filteredData.length, 'строк');
        console.log('Отфильтровано:', workingSheetData.length - filteredData.length, 'строк');
        
        // Показываем причины фильтрации
        const filteredOut = workingSheetData.filter(item => !item.kod || !item.nazwa || !item.ilosc || item.ilosc <= 0);
        if (filteredOut.length > 0) {
          console.log('Причины фильтрации:');
          filteredOut.forEach((item, index) => {
            const reasons = [];
            if (!item.kod) reasons.push('пустой код');
            if (!item.nazwa) reasons.push('пустое название');
            if (!item.ilosc || item.ilosc <= 0) reasons.push('количество <= 0 или null');
            console.log(`- Строка ${index + 1}: ${reasons.join(', ')}`);
          });
        }
        
        // Вставляем данные в working_sheets
        if (filteredData.length > 0) {
          const placeholders = filteredData.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
          const values = filteredData.flatMap(item => [
            item.kod, item.nazwa, item.ilosc, item.kod_kreskowy, item.data_waznosci,
            item.objetosc, item.typ, item.sprzedawca,
            null, // cena_zakupu_pln (по умолчанию null)
            null, // cena_sprzedazy_pln (по умолчанию null)
          ]);
          
          db.run(
            `INSERT INTO working_sheets (kod, nazwa, ilosc, kod_kreskowy, data_waznosci, objetosc, typ, sprzedawca, cena_zakupu_pln, cena_sprzedazy_pln) VALUES ${placeholders}`,
            values,
            function(err) {
              if (err) {
                console.error('Error inserting into working_sheets:', err);
                // Не возвращаем ошибку, так как original_sheets уже сохранен
              } else {
                console.log(`✅ Copied ${filteredData.length} records from original_sheets to working_sheets`);
              }
            }
          );
        }
        
      } catch (error) {
        console.error('Error processing data for working_sheets:', error);
        // Не возвращаем ошибку, так как original_sheets уже сохранен
      }
      
      res.json({ 
        id: originalSheetId, 
        message: 'Sheet data saved successfully and copied to working sheets',
        fileName: fileName
      });
    }
  );
});







}); // Закрываем блок db.serialize

// Test endpoints - только для разработки и тестирования
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
  try {
    const { setupTestEndpoints } = require('./test-endpoints');
    setupTestEndpoints(app, db);
    console.log('🧪 Test endpoints enabled for development/test environment');
  } catch (error) {
    console.log('⚠️ Could not load test endpoints:', error.message);
  }
} else {
  console.log('🚀 Production mode - test endpoints disabled');
}

// Favicon lives in server/assets
const faviconSvgPath = path.join(__dirname, 'assets', 'favicon.svg');
const faviconIcoPath = path.join(__dirname, 'assets', 'favicon.ico');

const sendFaviconSvg = (req, res) => {
  if (!fs.existsSync(faviconSvgPath)) {
    return res.status(404).end();
  }
  res.type('image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(faviconSvgPath);
};

const sendFaviconIco = (req, res) => {
  if (!fs.existsSync(faviconIcoPath)) {
    return res.status(404).end();
  }
  res.type('image/x-icon');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(faviconIcoPath);
};

app.get('/server/assets/favicon.svg', sendFaviconSvg);
app.get('/server/assets/favicon.ico', sendFaviconIco);
app.get('/favicon.svg', sendFaviconSvg);
app.get('/favicon.ico', sendFaviconIco);

// === KOMIS API routes ===
// ВАЖНО: регистрируем ДО production SPA catch-all ниже, иначе /api/komis/* перехватывается
// fallback-роутом app.get('*') и возвращает 404. Таблица komis и syncKomisProduct — ниже по файлу.

// GET /api/komis/summary — сводка из таблицы komis
app.get('/api/komis/summary', (req, res) => {
  console.log('📦 GET /api/komis/summary - Fetching komis summary by client');

  db.all(`
    SELECT
      k.client_id,
      COALESCE(c.nazwa, k.klient) AS klient,
      k.kod,
      k.nazwa,
      k.ilosc
    FROM komis k
    LEFT JOIN clients c ON c.id = k.client_id
    ORDER BY klient, k.kod
  `, [], (err, rows) => {
    if (err) {
      console.error('❌ Error fetching komis summary:', err);
      return res.status(500).json({ error: err.message });
    }

    const groupedByClient = {};
    (rows || []).forEach(row => {
      const groupKey = row.client_id ? `id:${row.client_id}` : `name:${row.klient}`;
      if (!groupedByClient[groupKey]) {
        groupedByClient[groupKey] = {
          klient: row.klient,
          client_id: row.client_id || null,
          products: [],
          total_ilosc: 0
        };
      }
      groupedByClient[groupKey].products.push({ kod: row.kod, nazwa: row.nazwa, ilosc: row.ilosc });
      groupedByClient[groupKey].total_ilosc += row.ilosc;
    });

    const result = Object.values(groupedByClient);
    console.log(`✅ Found ${result.length} clients with komis products`);
    res.json(result);
  });
});

// GET /api/komis/client/:klient — данные по одному клиенту из таблицы komis (+ цена)
app.get('/api/komis/client/:klient', (req, res) => {
  const klient = decodeURIComponent(req.params.klient);
  const includeZero = req.query.include_zero === '1';
  console.log(`📦 GET /api/komis/client/${klient}`);

  db.all(`
    SELECT
      k.client_id,
      COALESCE(c.nazwa, k.klient) AS klient_resolved,
      k.kod,
      k.nazwa,
      k.ilosc,
      ws.cena_sprzedazy_pln
    FROM komis k
    LEFT JOIN clients c ON c.id = k.client_id
    LEFT JOIN working_sheets ws ON k.kod = ws.kod
    WHERE LOWER(TRIM(COALESCE(c.nazwa, k.klient))) = LOWER(TRIM(?))
       OR LOWER(TRIM(k.klient)) = LOWER(TRIM(?))
    ORDER BY k.kod
  `, [klient, klient], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const products = (rows || [])
      .filter(row => includeZero || row.ilosc > 0)
      .map(row => ({
      kod: row.kod,
      nazwa: row.nazwa,
      ilosc: row.ilosc,
      cena_sprzedazy_pln: row.cena_sprzedazy_pln || null
    }));
    const total_ilosc = products.reduce((sum, p) => sum + p.ilosc, 0);
    const resolvedKlient = rows && rows.length > 0 ? rows[0].klient_resolved : klient;
    const client_id = rows && rows.length > 0 ? rows[0].client_id : null;

    res.json({ klient: resolvedKlient, client_id, products, total_ilosc });
  });
});

// PUT /api/komis — сохранить ручную корректировку количества
app.put('/api/komis', (req, res) => {
  const { klient, kod, nazwa, ilosc } = req.body;
  console.log(`✏️ PUT /api/komis - Updating komis: klient=${klient}, kod=${kod}, ilosc=${ilosc}`);

  if (!klient || !kod || ilosc === undefined) {
    return res.status(400).json({ error: 'klient, kod i ilosc są wymagane' });
  }

  resolveClientIdByKlient(klient, (lookupErr, clientId) => {
    if (lookupErr) {
      console.error('❌ Error looking up client for komis:', lookupErr);
      return res.status(500).json({ error: lookupErr.message });
    }

  db.run(
    `INSERT INTO komis (client_id, klient, kod, nazwa, ilosc, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(klient, kod) DO UPDATE SET
       ilosc = excluded.ilosc,
       nazwa = excluded.nazwa,
       client_id = COALESCE(excluded.client_id, komis.client_id),
       updated_at = CURRENT_TIMESTAMP`,
    [clientId, klient, kod, nazwa || '', ilosc],
    function(err) {
      if (err) {
        console.error('❌ Error updating komis:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Komis updated: klient=${klient}, kod=${kod}, ilosc=${ilosc}`);
      res.json({ success: true });
    }
  );
  });
});

// DELETE /api/komis — сбросить корректировку (вернуть к расчётному значению)
app.delete('/api/komis', (req, res) => {
  const { klient, kod } = req.body;
  console.log(`🗑️ DELETE /api/komis - Resetting override: klient=${klient}, kod=${kod}`);

  db.run('DELETE FROM komis WHERE klient = ? AND kod = ?', [klient, kod], function(err) {
    if (err) {
      console.error('❌ Error deleting komis override:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`✅ Komis override reset: klient=${klient}, kod=${kod}`);
    res.json({ success: true });
  });
});

// Serve static files from parent directory (frontend)
// В dev режиме фронт работает на Vite (порт 3000), поэтому сервер на 3001 не должен обслуживать статику
// В production режиме обслуживаем статические файлы из dist
// ВАЖНО: В dev режиме (когда фронт на Vite) НЕ обслуживаем статику, чтобы не перехватывать API запросы
const isProduction = process.env.NODE_ENV === 'production';
console.log(`🔧 Server mode: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);

if (isProduction) {
  // Явно исключаем /api из статических файлов
  app.use((req, res, next) => {
    // КРИТИЧЕСКИ ВАЖНО: Пропускаем все API запросы - они должны обрабатываться роутами выше
    if (req.path.startsWith('/api/')) {
      console.log(`🔵 API request bypassing static middleware: ${req.method} ${req.path}`);
      return next();
    }
    // Для остальных запросов обслуживаем статические файлы
    console.log(`📁 Static file request: ${req.method} ${req.path}`);
    express.static(path.join(__dirname, '..'))(req, res, next);
  });

// ВАЖНО: SPA Fallback маршрут ДОЛЖЕН БЫТЬ ПОСЛЕДНИМ!
  // Но он не должен перехватывать API запросы
app.get('*', (req, res) => {
    // Если это API запрос, возвращаем 404
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    const indexPath = path.join(__dirname, '../index.html');
  console.log('Serving SPA fallback:', indexPath);
  res.sendFile(indexPath);
});
} else {
  // В dev режиме только API, статические файлы не обслуживаем (они на Vite на порту 3000)
  console.log('🔧 Development mode: static files served by Vite on port 3000');
  console.log('🔧 API requests will be handled by routes above, no static middleware');
  // НЕ добавляем никаких middleware для статических файлов в dev режиме
  // API роуты обрабатываются выше, а для несуществующих API endpoints Express вернет 404 автоматически
}

// Migration endpoint (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/migrate/add-working-sheets-history', (req, res) => {
    console.log('🔄 Starting migration: Add working_sheets_history table...');
    ensureWorkingSheetsHistorySchema(() => {
      console.log('✅ Migration completed successfully!');
      res.json({ message: 'Migration completed successfully' });
    });
  });
}

// WMS Integration API
const WMS_BASE_URLS = [
  'http://wms.veis.pl',           // Основной адрес
  'http://wms.veis.pl:8080',      // Альтернативный порт
  'http://wms.veis.pl:5000',      // Другой порт
  'http://api.wms.veis.pl',       // API поддомен
  'http://dataconnect.wms.veis.pl' // DataConnect поддомен
];
const WMS_API_URL = WMS_BASE_URLS[0]; // Используем первый по умолчанию
const WMS_LOGIN = 'enoterra';
const WMS_PASSWORD = 'enoterra';
const WMS_COMPANY_ID = 'enoterra';

// Возможные пути к API (попробуем по очереди)
const POSSIBLE_API_PATHS = [
  '/authorize',                           // Базовый путь из документации
  '/api/authorize',                       // С префиксом /api
  '/api/auth',                            // Сокращённое
  '/api/login',                           // Альтернативное название
  '/dataconnect/authorize',               // DataConnect модуль
  '/dataconnect/api/authorize',           // DataConnect с /api
  '/dc/authorize',                        // Сокращённое название
  '/integration/authorize',               // Интеграция
  '/integration/api/authorize',           // Интеграция с /api
  '/external/authorize',                  // Внешний API
  '/rest/authorize',                      // REST API
  '/rest/api/authorize',                  // REST с /api
  '/webapi/authorize',                    // Web API
  '/services/authorize',                  // Сервисы
  '/ws/authorize',                        // Web Service
  '/api/v6/authorize',                    // С версией
  '/api/v6.0.0/authorize',                // Полная версия
  '/v6/authorize',                        // Только версия
  '/company/enoterra/authorize',          // С companyId в пути
  '/enoterra/authorize',                  // Только companyId
  '/ExpertWMS/api/authorize',             // С названием продукта
  '/expertwms/api/authorize',             // Lowercase
  '/DC.Expert/api/authorize',             // Полное название
  '/DataConnect/authorize',               // С большой буквы
  '/Authorize',                           // С большой буквы
  '/API/Authorize'                        // Всё с большой буквы
];

// Авторизация в WMS (пробуем разные пути)
async function authenticateWMS() {
  const FormData = require('form-data');
  const fetch = require('node-fetch');
  
  // Пробуем разные комбинации параметров
  const paramVariants = [
    { username: 'Username', password: 'Password' },       // Из документации
    { username: 'username', password: 'password' },       // Lowercase
    { username: 'login', password: 'password' },          // Альтернативное название
    { username: 'user', password: 'pass' }                // Сокращённое
  ];

  // Пробуем разные пути к API
  for (const apiPath of POSSIBLE_API_PATHS) {
    for (const params of paramVariants) {
      try {
        const formData = new FormData();
        formData.append(params.username, WMS_LOGIN);
        formData.append(params.password, WMS_PASSWORD);

        const url = `${WMS_API_URL}${apiPath}`;
        console.log(`🔐 Попытка: ${url} с параметрами ${params.username}/${params.password}`);
        
        const response = await fetch(url, {
          method: 'POST',
          body: formData
        });

        console.log(`📡 Ответ (${apiPath}):`, response.status);

        const responseText = await response.text();
        
        // Если 404, пробуем следующий путь
        if (response.status === 404) {
          continue;
        }

        if (!response.ok) {
          console.log(`❌ ${response.status} на ${apiPath}`);
          continue;
        }

        console.log('📄 Тело ответа:', responseText.substring(0, 200));

        const data = JSON.parse(responseText);
        console.log('✅ Данные авторизации:', data);
        
        const token = data.token || data.access_token || data.Token || data.AccessToken || null;
        
        if (token) {
          console.log(`✅ Успешная авторизация: ${url} с ${params.username}/${params.password}`);
          return token;
        }
      } catch (error) {
        // Продолжаем пробовать другие варианты
      }
    }
  }
  
  throw new Error('Не удалось авторизоваться ни по одному из путей API');
}

// Отправка заявки в WMS
app.post('/api/wms/send-shipment', async (req, res) => {
  try {
    const { orderId } = req.body;
    
    console.log('📦 Запрос на отправку заявки в WMS, orderId:', orderId);

    // Получаем данные заявки из БД
    db.get('SELECT * FROM orders WHERE id = ?', [orderId], async (err, order) => {
      if (err) {
        console.error('❌ Ошибка БД:', err);
        return res.status(500).json({ error: 'Ошибка получения заявки из БД' });
      }

      if (!order) {
        return res.status(404).json({ error: 'Заявка не найдена' });
      }

      try {
        // Шаг 1: Авторизация
        const token = await authenticateWMS();
        if (!token) {
          throw new Error('Не удалось получить токен авторизации');
        }

        // Шаг 2: Подготовка данных
        const shipmentData = {
          type: 'PWM-K',
          state: 1,
          status: 0,
          activeDate: order.data_utworzenia || new Date().toISOString(),
          items: []
        };

        console.log('📤 Отправка заявки в WMS:', shipmentData);

        // Шаг 3: Отправка заявки
        const fetch = require('node-fetch');
        const response = await fetch(`${WMS_API_URL}/company/${WMS_COMPANY_ID}/shipments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(shipmentData)
        });

        const responseText = await response.text();
        console.log('📡 Ответ WMS shipments:', response.status, responseText);

        if (!response.ok) {
          throw new Error(`WMS вернул ошибку: ${response.status} - ${responseText}`);
        }

        const result = JSON.parse(responseText);
        console.log('✅ Заявка успешно отправлена в WMS:', result);

        res.json({ 
          success: true, 
          wmsShipmentId: result.id,
          message: 'Заявка успешно отправлена в WMS'
        });
      } catch (error) {
        console.error('❌ Ошибка отправки в WMS:', error);
        res.status(500).json({ 
          error: error.message || 'Ошибка отправки в WMS' 
        });
      }
    });
  } catch (error) {
    console.error('❌ Ошибка обработки запроса:', error);
    res.status(500).json({ error: error.message });
  }
});

// OCR — rozpoznawanie faktury zakupu z PDF
app.post('/api/ocr/purchase-invoice', ocrUpload.single('pdf'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Brak pliku PDF' });
    }

    console.log('📄 OCR purchase invoice:', req.file.originalname, req.file.size, 'bytes');
    const result = await parsePurchaseInvoicePdf(req.file.buffer, db);

    if (!result.success) {
      return res.status(422).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('❌ OCR purchase invoice error:', error);
    res.status(500).json({
      error: error.message || 'Błąd rozpoznawania faktury zakupu',
    });
  }
});

// ===== NEW CONSUME FROM PRODUCTS (FIFO) =====
// czy_probki=1 — списываем только из партий семплов
//         0/null — списываем только из обычных партий
function consumeFromProducts(productKod, quantity, status = null) {
  return new Promise((resolve, reject) => {
    const isSamples = status === 'samples' || status === 1;
    const sql = isSamples
      ? `SELECT * FROM products WHERE kod = ? AND ilosc_aktualna > 0 AND czy_probki = 1 ORDER BY created_at ASC, id ASC`
      : `SELECT * FROM products WHERE kod = ? AND ilosc_aktualna > 0 AND COALESCE(czy_probki, 0) = 0 ORDER BY created_at ASC, id ASC`;
    db.all(
      sql,
      [productKod],
      (err, batches) => {
        if (err) return reject(err);
        if (batches.length === 0) return resolve({ consumed: 0, remaining: quantity, consumptions: [] });

        let remaining = quantity;
        const consumptions = [];

        const next = () => {
          if (remaining <= 0 || batches.length === 0) {
            return resolve({ consumed: quantity - remaining, remaining, consumptions });
          }

          const batch = batches.shift();
          const take = Math.min(batch.ilosc_aktualna, remaining);
          const newLeft = batch.ilosc_aktualna - take;

          db.run('UPDATE products SET ilosc_aktualna = ? WHERE id = ?', [newLeft, batch.id], function (upErr) {
            if (upErr) return reject(upErr);
            consumptions.push({ batchId: batch.id, qty: take, cena: roundMoney(batch.cena_zakupu_pln || 0) });
            remaining -= take;
            next();
          });
        };
        next();
      }
    );
  });
}

// === Test endpoint ===
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/test-consume', (req, res) => {
    const { kod, quantity } = req.body;
    consumeFromProducts(kod, quantity)
      .then(r => res.json(r))
      .catch(e => {
        console.error(e);
        res.status(500).json({ error: e.message });
      });
  });
}

// Helper: restore quantity back to newest batch
const restoreToProducts = (productKod, quantity) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM products WHERE kod = ? ORDER BY created_at DESC, id DESC LIMIT 1',
      [productKod],
      (err, batch) => {
        if (err) return reject(err);
        if (!batch) return resolve({ restored: 0 });

        const newQty = (batch.ilosc_aktualna || 0) + quantity;
        db.run(
          'UPDATE products SET ilosc_aktualna = ? WHERE id = ?',
          [newQty, batch.id],
          upErr => (upErr ? reject(upErr) : resolve({ restored: quantity, batchId: batch.id }))
        );
      }
    );
  });
};

// Serve static files from parent directory (frontend)
app.use(express.static(path.join(__dirname, '..')));

// === KOMIS API ===

// Таблица komis — основное хранилище отгрузок типа komis
db.run(`CREATE TABLE IF NOT EXISTS komis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  klient TEXT NOT NULL,
  kod TEXT NOT NULL,
  nazwa TEXT NOT NULL,
  ilosc INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(klient, kod)
)`, (err) => {
  if (err) {
    console.error('❌ Error creating komis table:', err);
  } else {
    console.log('✅ Komis table ready');
    ensureKomisClientIdColumn();
    // Инициализация: заполнить строки которых ещё нет из существующих заказов
    db.run(`
      INSERT OR IGNORE INTO komis (client_id, klient, kod, nazwa, ilosc, updated_at)
      SELECT o.client_id, o.klient, op.kod, op.nazwa, SUM(op.ilosc), CURRENT_TIMESTAMP
      FROM orders o
      JOIN order_products op ON o.id = op.orderId
      WHERE op.typ = 'komis'
      GROUP BY o.klient, op.kod
    `, (initErr) => {
      if (initErr) console.error('❌ Error initializing komis table:', initErr);
      else console.log('✅ Komis table initialized from order_products');
    });
  }
});

// Вспомогательная функция синхронизации komis (fire-and-forget)
function syncKomisProduct(klient, kod, nazwa, deltaIlosc, clientId = null) {
  if (!klient || !kod) return;

  const writeKomis = (resolvedClientId) => {
    if (deltaIlosc > 0) {
      db.run(
        `INSERT INTO komis (client_id, klient, kod, nazwa, ilosc, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(klient, kod) DO UPDATE SET
           ilosc = ilosc + excluded.ilosc,
           nazwa = excluded.nazwa,
           client_id = COALESCE(excluded.client_id, komis.client_id),
           updated_at = CURRENT_TIMESTAMP`,
        [resolvedClientId, klient, kod, nazwa || '', deltaIlosc],
        (e) => { if (e) console.error('❌ syncKomisProduct(+):', e.message); }
      );
      return;
    }

    if (deltaIlosc < 0) {
      const parsedId = parseClientId(resolvedClientId);
      if (parsedId) {
        db.run(
          `UPDATE komis SET
             ilosc = MAX(0, ilosc + ?),
             updated_at = CURRENT_TIMESTAMP
           WHERE kod = ?
             AND (client_id = ? OR (client_id IS NULL AND LOWER(TRIM(klient)) = LOWER(TRIM(?))))`,
          [deltaIlosc, kod, parsedId, klient],
          (e) => { if (e) console.error('❌ syncKomisProduct(-):', e.message); }
        );
      } else {
        db.run(
          `UPDATE komis SET
             ilosc = MAX(0, ilosc + ?),
             updated_at = CURRENT_TIMESTAMP
           WHERE klient = ? AND kod = ?`,
          [deltaIlosc, klient, kod],
          (e) => { if (e) console.error('❌ syncKomisProduct(-):', e.message); }
        );
      }
    }
  };

  const parsedClientId = parseClientId(clientId);
  if (parsedClientId) {
    writeKomis(parsedClientId);
    return;
  }

  resolveClientIdByKlient(klient, (lookupErr, resolvedClientId) => {
    if (lookupErr) {
      console.error('❌ syncKomisProduct client lookup:', lookupErr.message);
    }
    writeKomis(resolvedClientId);
  });
}

// Роуты /api/komis/* зарегистрированы выше — ДО production SPA catch-all,
// иначе в production они перехватываются fallback-роутом и возвращают 404.

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 EnoTerra ERP Server running on port ${PORT}`);
  console.log(`💾 Database located at: ${dbPath}`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`📂 Serving static files from: ${path.join(__dirname, '..')}`);
  }
});
