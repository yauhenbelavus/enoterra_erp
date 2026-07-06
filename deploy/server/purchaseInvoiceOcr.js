const { PDFParse } = require('pdf-parse');

const SKIP_LINE =
  /^(invoice|fattura|facture|rechnung|page|pagina|tel|phone|fax|www\.|http|email|e-mail|bank|iban|swift|bic|w tym|razem|łącznie|do zapłaty|summary|total|nabywca|miejsce|termin|sposób|podpis|data\s|płatno|brutto|netto\s|pkwiu|lp\.|nazwa|wartość|stawka|kwota)/i;
const HEADER_WORDS =
  /^\s*(lp\.?|qty|quantity|quantit|quantité|menge|ilość|prezzo|price|prix|preis|importo|amount|montant|descri|description|article|codice|pkwiu|j\.m|j\.m\.|vat|iva|tva|u\.?m\.?|unit|stawka|wartość|brutto|netto|cena\s|nazwa\s)/i;

// Polish invoice unit words (J.m. column)
const UNIT_RE = /\b(szt\.?|but\.?|kg\.?|l\.?|pcs\.?|op\.?|pkt\.?|ml\.?|cl\.?|fl\.?)(?:\s|$)/i;
// Lp. pattern: starts with "1." "12." etc.
const LP_RE = /^\d{1,3}\.\s/;
// PKWiU code pattern: "11.07.19" or "11.07.19.0"
const PKWIU_RE = /\d{2}\.\d{2}\.\d{2}\.?\d*\s*/g;

function normalizeNumber(value) {
  if (value == null || value === '') return null;
  let cleaned = String(value).trim();
  // Remove spaces and non-breaking spaces (thousands separator)
  cleaned = cleaned.replace(/[\s\u00a0]/g, '');
  // European: 1.234,56 → remove dots, comma → dot
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    cleaned = cleaned.replace(',', '.');
  }
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function formatPriceForForm(value) {
  const num = normalizeNumber(value);
  if (num == null) return '';
  return num.toFixed(2).replace('.', ',');
}

// ─── Sprzedawca extraction ─────────────────────────────────────────────────

function extractSupplier(lines, text) {
  // 1) "Sprzedawca:" on its own line → next non-address line is the name
  const labelIdx = lines.findIndex((l) => /^sprzedawca\s*[:.]?\s*$/i.test(l.trim()));
  if (labelIdx >= 0) {
    for (let i = labelIdx + 1; i < Math.min(labelIdx + 5, lines.length); i++) {
      const c = lines[i].trim();
      if (!c || c.length < 2) continue;
      if (/^(ul\.|al\.|os\.|nip|tel|www|http|email|\+\d|0\d|\d{2}-\d{3})/i.test(c)) continue;
      return c.slice(0, 120);
    }
  }

  // 2) "Sprzedawca: Name" on the same line
  const inline = text.match(/sprzedawca\s*[:]\s*([^\n\t]{3,})/i);
  if (inline) {
    const val = inline[1].trim();
    if (val && !/^(ul\.|nip|www)/i.test(val)) return val.slice(0, 120);
  }

  // 3) Generic supplier labels (other languages)
  const generic = text.match(
    /(?:from|supplier|vendor|vendeur|fornitore|lieferant|dostawca)\s*[:.]?\s*([^\n\t]{3,})/i
  );
  if (generic) return generic[1].trim().slice(0, 120);

  // 4) Fallback: first sensible short line before the table
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i].trim();
    if (!line || line.length < 3 || line.length > 80) continue;
    if (SKIP_LINE.test(line)) continue;
    if (HEADER_WORDS.test(line)) continue;
    if (/^(sprzedawca|nabywca|ul\.|al\.|nip|tel|www|bic|iban|pln|plc)/i.test(line)) continue;
    if (/^[\d\s\-+().\/]+$/.test(line)) continue; // only digits/symbols
    if (/^(faktura|invoice|facture|fattura|rechnung)/i.test(line)) continue;
    return line.slice(0, 120);
  }
  return null;
}

// ─── Polish Lp. table parsing ───────────────────────────────────────────────

/**
 * Join multi-line product rows: if a Lp. line doesn't have a unit word,
 * try appending the next line (continuation of product name + data).
 */
function collectProductRows(lines) {
  const rows = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || SKIP_LINE.test(line) || HEADER_WORDS.test(line)) {
      i++;
      continue;
    }

    if (LP_RE.test(line)) {
      if (UNIT_RE.test(line)) {
        // Complete row on one line
        rows.push(line);
      } else if (i + 1 < lines.length) {
        // Try joining with next line (wrapped product name)
        const next = lines[i + 1].trim();
        if (next && !LP_RE.test(next) && !SKIP_LINE.test(next) && !HEADER_WORDS.test(next)) {
          rows.push(line + ' ' + next);
          i++; // consume next line
        } else {
          rows.push(line);
        }
      } else {
        rows.push(line);
      }
    }
    i++;
  }
  return rows;
}

/**
 * Parse a full product row like:
 * "1. Ambijus Act Naturally 750ml 11.07.19 30 szt. 38,35 1 150,50 23% 264,62 1 415,12"
 * OR (no PKWiU):
 * "7. Arensbak Rose 18 szt. 45,47 818,46 23% 188,25 1 006,71"
 *
 * Anchored on the UNIT word (szt./but. etc):
 *   BEFORE unit:  ... [nazwa] [pkwiu?] [ilość]  szt.
 *   AFTER unit:   [cena_netto] [wartość_netto] ...
 */
function parsePolishRow(row) {
  const unitMatch = row.match(UNIT_RE);
  if (!unitMatch) return null;

  const unitIdx = row.indexOf(unitMatch[0]);
  const beforeUnit = row.slice(0, unitIdx).trim();
  const afterUnit = row.slice(unitIdx + unitMatch[0].length).trim();

  // beforeUnit: "1. Ambijus Act Naturally 750ml 11.07.19 30"
  // Remove leading "N." Lp. prefix
  const withoutLp = beforeUnit.replace(/^\d{1,3}\.\s*/, '');

  // Remove PKWiU code (e.g. "11.07.19" or "11.07.19.0")
  const withoutPkwiu = withoutLp.replace(PKWIU_RE, ' ').trim();

  // The last token before unit = ilość; everything before = nazwa
  const tokens = withoutPkwiu.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  const ilosc = normalizeNumber(tokens[tokens.length - 1]);
  if (ilosc == null || ilosc <= 0 || ilosc > 10000) return null;

  const nazwa = tokens.slice(0, tokens.length - 1).join(' ').trim();
  if (!nazwa || nazwa.length < 2) return null;
  // Skip if nazwa is just numbers/symbols
  if (/^[\d\s,.%]+$/.test(nazwa)) return null;

  // afterUnit: "38,35 1 150,50 23% 264,62 1 415,12"
  // First valid number = cena netto
  const priceMatch = afterUnit.match(/^([\d,]+)/);
  if (!priceMatch) return null;
  const cena = normalizeNumber(priceMatch[1]);
  if (cena == null || cena <= 0) return null;

  return {
    nazwa: nazwa.slice(0, 200),
    ilosc: String(ilosc),
    cena: formatPriceForForm(cena),
  };
}

// ─── Generic (non-Polish) fallback parsing ──────────────────────────────────

function parseGenericLine(line) {
  const trimmed = line.trim();
  if (!trimmed || SKIP_LINE.test(trimmed) || HEADER_WORDS.test(trimmed)) return null;
  if (/^[\d\s%.,€$]+$/.test(trimmed)) return null;

  // Tab-separated: try splitting first
  const parts = trimmed.split(/\t+/).map((p) => p.trim()).filter(Boolean);

  if (parts.length >= 3) {
    let nazwa, ilosc, cena;
    // If first part is numeric code, skip it
    if (/^[A-Z0-9][A-Z0-9\-_.\/]{1,24}$/i.test(parts[0]) && parts.length >= 4) {
      nazwa = parts[1];
      ilosc = normalizeNumber(parts[2]);
      cena = normalizeNumber(parts[3]);
    } else {
      nazwa = parts[0];
      ilosc = normalizeNumber(parts[1]);
      cena = normalizeNumber(parts[2]);
    }
    if (nazwa && nazwa.length >= 2 && ilosc != null && ilosc > 0 && cena != null && cena > 0) {
      return { nazwa: nazwa.slice(0, 200), ilosc: String(ilosc), cena: formatPriceForForm(cena) };
    }
  }

  // Space-separated with double-space gaps: "Nazwa  qty  price"
  const spaceMatch = trimmed.match(
    /^(.+?)\s{2,}(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s*(?:€|EUR|PLN|\$)?/
  );
  if (spaceMatch) {
    const nazwa = spaceMatch[1].trim();
    const ilosc = normalizeNumber(spaceMatch[2]);
    const cena = normalizeNumber(spaceMatch[3]);
    if (nazwa.length >= 2 && ilosc != null && ilosc > 0 && cena != null && cena > 0) {
      return { nazwa: nazwa.slice(0, 200), ilosc: String(ilosc), cena: formatPriceForForm(cena) };
    }
  }

  return null;
}

// ─── Main product parsing ────────────────────────────────────────────────────

function parseProducts(lines, text) {
  const products = [];
  const seen = new Set();

  const addProduct = (p) => {
    if (!p) return;
    const key = `${p.nazwa}|${p.ilosc}|${p.cena}`;
    if (seen.has(key)) return;
    seen.add(key);
    products.push(p);
  };

  // Check if document looks like a Polish Lp. table
  const hasLpTable =
    LP_RE.test(lines.find((l) => LP_RE.test(l)) || '') &&
    lines.some((l) => UNIT_RE.test(l));

  if (hasLpTable) {
    const rows = collectProductRows(lines);
    for (const row of rows) {
      addProduct(parsePolishRow(row));
    }
  }

  // If we got nothing (or very few), try generic fallback
  if (products.length === 0) {
    for (const line of lines) {
      addProduct(parseGenericLine(line));
    }
  }

  return products;
}

// ─── Core text parsing ───────────────────────────────────────────────────────

function parsePurchaseInvoiceText(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    return { success: false, error: 'Nie udało się odczytać tekstu z pliku PDF.', data: null };
  }

  const sprzedawca = extractSupplier(lines, normalized);
  const products = parseProducts(lines, normalized);

  if (!sprzedawca && products.length === 0) {
    return { success: false, error: 'Nie udało się rozpoznać faktury.', data: null };
  }

  return {
    success: true,
    data: {
      sprzedawca: sprzedawca || '',
      products: products.map(({ nazwa, ilosc, cena }) => ({ nazwa, ilosc, cena })),
    },
  };
}

// ─── PDF text extraction ─────────────────────────────────────────────────────

async function extractTextFromPdfBuffer(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ cellSeparator: '\t', pageJoiner: '\n' });
    return result.text || '';
  } finally {
    await parser.destroy();
  }
}

async function parsePurchaseInvoicePdf(buffer) {
  const text = await extractTextFromPdfBuffer(buffer);
  return parsePurchaseInvoiceText(text);
}

module.exports = {
  parsePurchaseInvoicePdf,
  parsePurchaseInvoiceText,
  extractTextFromPdfBuffer,
};
