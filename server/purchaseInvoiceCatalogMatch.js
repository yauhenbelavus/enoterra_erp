/**
 * Match OCR product lines to working_sheets by nazwa and enrich with catalog fields.
 * Rules: match catalog rows by nazwa, ilosc is ignored, no dropdown — pick one row or skip.
 * Name key ignores case, then drops volume, ABV, lot/batch noise and generic colour/type words; vintage years stay.
 * Intake nazwa is typically longer than working_sheets. Consecutive match: ≥50% of the catalog name
 * must appear in the form name; among those, pick the longest overlap (best coverage of the form line).
 */

const LEGAL_FORM_PATTERN =
  /\s+(?:spółka z ograniczoną odpowiedzialnością|spolka z ograniczona odpowiedzialnoscia|societ[aà]\s+benefit|sp\.\s*z\.?\s*o\.?\s*o\.?|s\.\s*p\.\s*a\.?|s\.\s*r\.\s*l\.?|sp\.\s*j\.?|sp\.\s*k\.?|s\.?\s*a\.?\s*s\.?|sarl|sas|eurl|snc|gmbh|ag|aps|a\/s|asa|\bas\b|a\.?\s*s\.?|oy|ab|nv|bv|ltd\.?|limited|llc|inc\.?|corp\.?|co\.?|spa|srl)(?:\s.*)?$/i;

const GENERIC_WINE_WORDS = new Set([
  'wino', 'wina', 'win',
  'wine', 'wines',
  'vin', 'vins',
  'vino', 'vini', 'vinos', 'vinho', 'vinhos',
  'wein', 'weine', 'weisswein', 'weissweine', 'rotwein', 'rotweine', 'rosewein', 'schaumwein',
  'wijn', 'wijnen',
  'hvidvin', 'rodvin', 'roedvin',
  'whitewine', 'redwine', 'rosewine',
  'biale', 'bialy', 'biala',
  'czerwone', 'czerwony', 'czerwona',
  'rozowe', 'rozowy', 'rozowa',
  'white', 'red', 'rose', 'roses',
  'blanc', 'blanche', 'rouge', 'rouges',
  'bianco', 'bianca', 'bianchi', 'bianche',
  'rosso', 'rossa', 'rossi', 'rosse',
  'rosato', 'rosata', 'rosati',
  'blanco', 'blanca', 'tinto', 'tinta', 'rosado', 'rosada',
  'weiss', 'weis', 'weisser', 'rot', 'rote',
  'hvid', 'hvidvin', 'rod', 'roed', 'rodvin',
  'wit', 'witte', 'rood', 'rode',
  'musujace', 'musujacy', 'musujaca',
  'sparkling', 'spumante', 'spumanti', 'petillant', 'mousseux', 'sekt',
  'espumoso', 'espumosa', 'mousserende', 'frizzante',
  'macerowane', 'macerowany', 'macerowana',
  'macerated', 'macere', 'maceration', 'macerato', 'macerata', 'macerado',
  'still', 'tranquille', 'fermo', 'ferma',
  'butelka', 'butelki', 'bottle', 'bottles',
  'bouteille', 'bouteilles', 'bottiglia', 'bottiglie',
  'flasche', 'flaschen', 'flaske',
  'szt', 'sztuk', 'stk',
]);

function foldCase(value) {
  return String(value || '').toLocaleLowerCase('en-US');
}

function foldDiacritics(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/gi, 'l')
    .replace(/ø/gi, 'o')
    .replace(/đ/gi, 'd')
    .replace(/ð/gi, 'd')
    .replace(/ß/gi, 'ss')
    .replace(/æ/gi, 'ae')
    .replace(/œ/gi, 'oe');
}

function isVintageToken(token) {
  return /^(?:19|20)\d{2}$/.test(token);
}

function normalizeSupplierName(name) {
  let s = String(name || '').trim();
  if (!s) return '';
  s = s.replace(/,.*$/, '').trim();
  s = s.replace(LEGAL_FORM_PATTERN, '').trim();
  return foldCase(s.replace(/\s+/g, ' ').trim());
}

function stripMatchNoise(name) {
  let s = foldCase(foldDiacritics(foldCase(String(name || ''))));
  if (!s) return '';
  s = s.replace(/[\u2018\u2019]/g, "'");
  s = s.replace(/\s+/g, ' ');

  s = s.replace(/\b(?:alc(?:ool|ohol)?|abv|alk)\.?\s*:?\s*\d+[.,]?\d*\s*%?(?:\s*vol\.?)?/g, ' ');
  s = s.replace(/\b\d+[.,]?\d*\s*%(?:\s*(?:vol|alk|alc)\.?)?/g, ' ');
  s = s.replace(/\b\d+[.,]?\d*\s*(?:vol\.?|abv)\b/g, ' ');
  s = s.replace(/\b(?:alc(?:ool|ohol)?|abv|alk|vol)\.?\b/g, ' ');

  s = s.replace(/\b\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:ml|cl|dl|l|ltr|litre|liter|litri|litr[oaow]?)?\b/g, ' ');
  s = s.replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|dl|l|ltr|litres?|liters?|liter|litri|litr[oaow]?)\b/g, ' ');
  s = s.replace(/\b(?:magnum|jeroboam|methuselah|rehoboam|dwumagnum)\b/g, ' ');

  s = s.replace(/\b(?:lot(?:to|e)?|batch|partia|partie|partita)\s*[:#.\-]?\s*[^\s,;]+/g, ' ');
  s = s.replace(/\b(?:qta|quantita|quantite)\s*[:.]?\s*\d+[.,]?\d*/g, ' ');
  s = s.replace(/\b(?:hs|cn|pkwiu)\s*:?\s*[\d.]+/g, ' ');
  s = s.replace(/\b\d{2}\.\d{2}(?:\.\d{2})?(?:\.\d)?\b/g, ' ');
  s = s.replace(/\butland\b/g, ' ');

  s = s.replace(/[^\p{L}\p{N}\s']/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  const rest = [];
  const years = [];
  for (const token of s.split(' ')) {
    if (!token) continue;
    if (isVintageToken(token)) {
      years.push(token);
      continue;
    }
    if (!GENERIC_WINE_WORDS.has(token)) rest.push(token);
  }
  return [...rest, ...years].join(' ').trim();
}

/** Normalize wine/product name for comparison (OCR vs working_sheets). */
function normalizeProductName(name) {
  return stripMatchNoise(name);
}

function alnumProductKey(name) {
  return normalizeProductName(name).replace(/[^\p{L}\p{N}]/gu, '');
}

const CONSECUTIVE_MATCH_RATIO = 0.5;
const MIN_CONSECUTIVE_KEY_LENGTH = 6;

function extractYears(normalizedName) {
  return String(normalizedName || '').match(/\b(?:19|20)\d{2}\b/g) || [];
}

function stripYears(alnumKey, years) {
  let s = String(alnumKey || '');
  for (const year of years) s = s.split(year).join('');
  return s;
}

/** Longest run of equal characters in a row (substring, not subsequence). */
function longestCommonSubstringLength(a, b) {
  if (!a || !b) return 0;
  if (a === b) return a.length;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (long.includes(short)) return short.length;

  let best = 0;
  let prev = new Array(long.length + 1).fill(0);
  for (let i = 1; i <= short.length; i++) {
    const curr = new Array(long.length + 1).fill(0);
    for (let j = 1; j <= long.length; j++) {
      if (short[i - 1] === long[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > best) best = curr[j];
      }
    }
    prev = curr;
  }
  return best;
}

function isBetterConsecutiveMatch(candidate, best) {
  if (!best) return true;
  if (candidate.lcs !== best.lcs) return candidate.lcs > best.lcs;
  if (candidate.catalogLen !== best.catalogLen) return candidate.catalogLen > best.catalogLen;
  return false;
}

function matchByConsecutive(ocrNazwa, entries, invoiceSprzedawca) {
  const ocrName = normalizeProductName(ocrNazwa);
  const ocrAlnum = alnumProductKey(ocrNazwa);
  if (!ocrAlnum || ocrAlnum.length < MIN_CONSECUTIVE_KEY_LENGTH) return null;

  const ocrYears = extractYears(ocrName);
  const ocrCore = stripYears(ocrAlnum, ocrYears);
  if (ocrCore.length < MIN_CONSECUTIVE_KEY_LENGTH) return null;

  let best = null;
  let pool = [];

  for (const entry of entries) {
    if (!entry.alnumKey || entry.alnumKey.length < MIN_CONSECUTIVE_KEY_LENGTH) continue;

    const catalogCore = stripYears(entry.alnumKey, entry.years);
    if (catalogCore.length < MIN_CONSECUTIVE_KEY_LENGTH) continue;

    const lcs = longestCommonSubstringLength(ocrCore, catalogCore);
    if (lcs < catalogCore.length * CONSECUTIVE_MATCH_RATIO) continue;

    const candidate = {
      row: entry.row,
      lcs,
      catalogLen: catalogCore.length,
    };

    if (isBetterConsecutiveMatch(candidate, best)) {
      best = candidate;
      pool = [entry.row];
    } else if (best && !isBetterConsecutiveMatch(best, candidate)) {
      pool.push(entry.row);
    }
  }

  return pickBestRow(pool, invoiceSprzedawca);
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
  const entries = [];

  for (const row of catalogRows) {
    const exactKey = normalizeProductName(row.nazwa);
    const alnumKey = alnumProductKey(row.nazwa);
    if (exactKey) {
      if (!exactIndex.has(exactKey)) exactIndex.set(exactKey, []);
      exactIndex.get(exactKey).push(row);
    }
    if (alnumKey) {
      if (!alnumIndex.has(alnumKey)) alnumIndex.set(alnumKey, []);
      alnumIndex.get(alnumKey).push(row);
      entries.push({
        row,
        alnumKey,
        years: extractYears(exactKey),
      });
    }
  }

  return { exactIndex, alnumIndex, entries };
}

function matchByNazwa(ocrNazwa, exactIndex, alnumIndex, invoiceSprzedawca, entries) {
  const exactKey = normalizeProductName(ocrNazwa);
  if (exactKey && exactIndex.has(exactKey)) {
    const row = pickBestRow(exactIndex.get(exactKey), invoiceSprzedawca);
    if (row) return row;
  }

  const alnumKey = alnumProductKey(ocrNazwa);
  if (alnumKey && alnumKey.length >= 6 && alnumIndex.has(alnumKey)) {
    return pickBestRow(alnumIndex.get(alnumKey), invoiceSprzedawca);
  }

  if (entries && entries.length) {
    return matchByConsecutive(ocrNazwa, entries, invoiceSprzedawca);
  }

  return null;
}

function loadWorkingSheetsCatalog(db) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, kod, nazwa, kod_kreskowy, typ, objetosc, sprzedawca
       FROM working_sheets`,
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

  const { exactIndex, alnumIndex, entries } = buildCatalogIndexes(catalog);

  return mappedProducts.map((product) => {
    const row = matchByNazwa(product.nazwa, exactIndex, alnumIndex, invoiceSprzedawca, entries);
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
