/**
 * Match OCR product lines to working_sheets by nazwa and enrich with catalog fields.
 * Rules: active rows only (not archived), ilosc is ignored, no dropdown — pick one row or skip.
 */

const LEGAL_FORM_PATTERN =
  /\s+(?:spółka z ograniczoną odpowiedzialnością|spolka z ograniczona odpowiedzialnoscia|societ[aà]\s+benefit|sp\.\s*z\.?\s*o\.?\s*o\.?|s\.\s*p\.\s*a\.?|s\.\s*r\.\s*l\.?|sp\.\s*j\.?|sp\.\s*k\.?|s\.?\s*a\.?\s*s\.?|sarl|sas|eurl|snc|gmbh|ag|aps|a\/s|asa|\bas\b|a\.?\s*s\.?|oy|ab|nv|bv|ltd\.?|limited|llc|inc\.?|corp\.?|co\.?|spa|srl)(?:\s.*)?$/i;

function normalizeSupplierName(name) {
  let s = String(name || '').trim();
  if (!s) return '';
  s = s.replace(/,.*$/, '').trim();
  s = s.replace(LEGAL_FORM_PATTERN, '').trim();
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Normalize wine/product name for comparison (OCR vs working_sheets). */
function normalizeProductName(name) {
  let s = String(name || '').trim();
  if (!s) return '';
  s = s.normalize('NFKC').toLowerCase();
  s = s.replace(/\s+/g, ' ');
  // Unify volume: 0,75 l / 0.75l → 750ml; keep 750ml as 750ml
  s = s.replace(/(\d)[,.](\d+)\s*l\b/g, (_, a, b) => {
    const dec = parseFloat(`${a}.${b}`);
    if (dec > 0 && dec < 10) return ` ${Math.round(dec * 1000)}ml `;
    return ` ${a}${b}l `;
  });
  s = s.replace(/(\d+)\s*ml\b/g, (_, ml) => ` ${ml}ml `);
  s = s.replace(/[^\p{L}\p{N}\s']/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function alnumProductKey(name) {
  return normalizeProductName(name).replace(/[^\p{L}\p{N}]/gu, '');
}

function supplierMatches(catalogSprzedawca, invoiceSprzedawca) {
  const invoice = normalizeSupplierName(invoiceSprzedawca);
  const catalog = normalizeSupplierName(catalogSprzedawca);
  if (!invoice || !catalog) return false;
  return invoice === catalog || invoice.includes(catalog) || catalog.includes(invoice);
}

function pickBestRow(candidates, invoiceSprzedawca) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  let pool = candidates;
  if (invoiceSprzedawca) {
    const withSupplier = candidates.filter((row) => supplierMatches(row.sprzedawca, invoiceSprzedawca));
    if (withSupplier.length === 1) return withSupplier[0];
    if (withSupplier.length > 1) pool = withSupplier;
  }

  return [...pool].sort((a, b) => (b.id || 0) - (a.id || 0))[0];
}

function buildCatalogIndexes(catalogRows) {
  const exactIndex = new Map();
  const alnumIndex = new Map();

  for (const row of catalogRows) {
    const exactKey = normalizeProductName(row.nazwa);
    if (exactKey) {
      if (!exactIndex.has(exactKey)) exactIndex.set(exactKey, []);
      exactIndex.get(exactKey).push(row);
    }
    const alnumKey = alnumProductKey(row.nazwa);
    if (alnumKey) {
      if (!alnumIndex.has(alnumKey)) alnumIndex.set(alnumKey, []);
      alnumIndex.get(alnumKey).push(row);
    }
  }

  return { exactIndex, alnumIndex };
}

function matchByNazwa(ocrNazwa, exactIndex, alnumIndex, invoiceSprzedawca) {
  const exactKey = normalizeProductName(ocrNazwa);
  if (exactKey && exactIndex.has(exactKey)) {
    const row = pickBestRow(exactIndex.get(exactKey), invoiceSprzedawca);
    if (row) return row;
  }

  const alnumKey = alnumProductKey(ocrNazwa);
  if (alnumKey && alnumKey.length >= 8 && alnumIndex.has(alnumKey)) {
    return pickBestRow(alnumIndex.get(alnumKey), invoiceSprzedawca);
  }

  return null;
}

function loadWorkingSheetsCatalog(db) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, kod, nazwa, kod_kreskowy, typ, objetosc, sprzedawca
       FROM working_sheets
       WHERE archived = 0 OR archived IS NULL`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

/**
 * @param {Array<{ nazwa: string, ilosc: string, cena: string, cenaPelna?: number }>} mappedProducts
 * @param {string} invoiceSprzedawca cleaned supplier from OCR
 * @param {import('sqlite3').Database} db
 */
async function enrichOcrProducts(mappedProducts, invoiceSprzedawca, db) {
  if (!db || !Array.isArray(mappedProducts) || mappedProducts.length === 0) {
    return mappedProducts;
  }

  const catalog = await loadWorkingSheetsCatalog(db);
  if (catalog.length === 0) {
    return mappedProducts.map((p) => ({ ...p, catalog_matched: false }));
  }

  const { exactIndex, alnumIndex } = buildCatalogIndexes(catalog);

  return mappedProducts.map((product) => {
    const row = matchByNazwa(product.nazwa, exactIndex, alnumIndex, invoiceSprzedawca);
    if (!row) {
      return { ...product, catalog_matched: false };
    }
    return {
      ...product,
      kod: String(row.kod || '').trim(),
      kod_kreskowy: row.kod_kreskowy ? String(row.kod_kreskowy).trim() : '',
      typ: row.typ ? String(row.typ).trim() : '',
      objetosc: row.objetosc ? String(row.objetosc).trim() : '',
      catalog_matched: true,
    };
  });
}

module.exports = {
  normalizeProductName,
  alnumProductKey,
  enrichOcrProducts,
  pickBestRow,
  matchByNazwa,
};
