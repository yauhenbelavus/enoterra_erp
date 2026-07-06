const { PDFParse } = require('pdf-parse');

const INVOICE_LABEL =
  /(?:invoice|faktura|facture|fattura|rechnung|documento|bill)\s*(?:no|nr|n[°º]|numero|number)?/i;
const SUPPLIER_LABEL =
  /(?:from|supplier|vendor|vendeur|fornitore|lieferant|sprzedawca|dostawca)\s*[:.]?\s*(.+)/i;
const HEADER_WORDS =
  /\b(lp\.?|qty|quantity|quantit|quantité|menge|ilość|prezzo|price|prix|preis|importo|amount|montant|descri|description|article|codice|pkwiu|j\.m|j\.m\.|vat|iva|tva|u\.?m\.?|unit|stawka|wartość|brutto|netto)\b/i;
const SKIP_LINE =
  /^(invoice|fattura|facture|rechnung|page|pagina|tel|phone|fax|www\.|http|email|e-mail|bank|iban|swift|bic|w tym|razem|łącznie|do zapłaty|summary|total)/i;

function normalizeNumber(value) {
  if (value == null || value === '') return null;
  // handle thousands separators: space or dot before 3-digit group
  let cleaned = String(value).trim();
  // remove spaces (thousands separator)
  cleaned = cleaned.replace(/\s/g, '');
  // handle European decimal: if comma present, replace with dot
  // but first check if it's 1.234,56 format vs 1,234.56
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    // 1.234,56 — dots are thousands, comma is decimal
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

function extractSupplier(lines, text) {
  const labeled = text.match(SUPPLIER_LABEL);
  if (labeled) return labeled[1].trim().slice(0, 120);

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (!line || line.length < 3) continue;
    if (SKIP_LINE.test(line)) continue;
    if (INVOICE_LABEL.test(line)) continue;
    if (/^(p\.?\s*iva|vat|tva|nip|ust|tax)/i.test(line)) continue;
    if (/^\d{1,3}\s/.test(line) && /\d{4,}/.test(line)) continue;
    if (/^[\d\s\-+().]+$/.test(line)) continue;
    return line.slice(0, 120);
  }
  return null;
}

// Polish invoice format with Lp. column:
// Lp. | Nazwa | PKWiU | Ilość | J.m. | Cena netto | Wartość netto | ...
function parsePolishLpLine(parts) {
  // parts[0] = "1." or "1"
  // parts[1] = Nazwa
  // parts[2] = PKWiU (e.g. 11.07.19) — skip
  // parts[3] = Ilość
  // parts[4] = J.m. (szt.)
  // parts[5] = Cena netto
  if (parts.length < 6) return null;

  const nazwa = parts[1];
  const ilosc = normalizeNumber(parts[3]);
  const cena = normalizeNumber(parts[5]);

  if (!nazwa || nazwa.length < 2) return null;
  if (ilosc == null || ilosc <= 0) return null;
  if (cena == null || cena <= 0) return null;

  return {
    nazwa: nazwa.slice(0, 200),
    ilosc: String(ilosc),
    cena: formatPriceForForm(cena),
  };
}

// Generic tab-separated line: Nazwa | Ilość | Cena | ...
function parseGenericTabLine(parts) {
  if (parts.length < 3) return null;

  let nazwa, ilosc, cena;

  // Skip if first part looks like product code (not nazwa)
  if (parts.length >= 4 && /^[A-Z0-9][A-Z0-9\-_.\/]{1,24}$/i.test(parts[0])) {
    nazwa = parts[1];
    ilosc = normalizeNumber(parts[2]);
    cena = normalizeNumber(parts[3]);
  } else {
    nazwa = parts[0];
    ilosc = normalizeNumber(parts[1]);
    cena = normalizeNumber(parts[2]);
  }

  if (!nazwa || nazwa.length < 2) return null;
  if (ilosc == null || ilosc <= 0) return null;
  if (cena == null || cena <= 0) return null;

  return {
    nazwa: nazwa.slice(0, 200),
    ilosc: String(ilosc),
    cena: formatPriceForForm(cena),
  };
}

// Space-separated fallback: "Chianti Classico  120  8,50  1020,00"
function parseSpacedLine(line) {
  const match = line.match(
    /^(.+?)\s{2,}(\d+(?:[.,\s]\d+)?)\s+(\d+(?:[.,]\d+)?)\s*(?:€|EUR|PLN|\$)?/
  );
  if (!match) return null;

  const nazwa = match[1].trim();
  const ilosc = normalizeNumber(match[2]);
  const cena = normalizeNumber(match[3]);

  if (!nazwa || nazwa.length < 2) return null;
  if (ilosc == null || ilosc <= 0) return null;
  if (cena == null || cena <= 0) return null;

  return {
    nazwa: nazwa.slice(0, 200),
    ilosc: String(ilosc),
    cena: formatPriceForForm(cena),
  };
}

function parseProductLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (SKIP_LINE.test(trimmed)) return null;
  if (HEADER_WORDS.test(trimmed)) return null;

  // Skip pure number/percentage lines (totals, VAT rows)
  if (/^[\d\s%.,]+$/.test(trimmed)) return null;

  const parts = trimmed.split(/\t+/).map((p) => p.trim()).filter(Boolean);

  // Polish Lp. format: starts with "1." "2." etc.
  if (parts.length >= 6 && /^\d+\.?$/.test(parts[0])) {
    return parsePolishLpLine(parts);
  }

  // Generic tab-separated
  if (parts.length >= 3) {
    const result = parseGenericTabLine(parts);
    if (result) return result;
  }

  // Space-separated fallback
  return parseSpacedLine(trimmed);
}

function parseProducts(lines) {
  const products = [];
  const seen = new Set();

  for (const line of lines) {
    const product = parseProductLine(line);
    if (!product) continue;
    const key = `${product.nazwa}|${product.ilosc}|${product.cena}`;
    if (seen.has(key)) continue;
    seen.add(key);
    products.push(product);
  }

  return products;
}

function parsePurchaseInvoiceText(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    return {
      success: false,
      error: 'Nie udało się odczytać tekstu z pliku PDF.',
      data: null,
    };
  }

  const sprzedawca = extractSupplier(lines, normalized);
  const products = parseProducts(lines);

  const hasUsefulData = Boolean(sprzedawca || products.length > 0);
  if (!hasUsefulData) {
    return {
      success: false,
      error: 'Nie udało się rozpoznać faktury.',
      data: null,
    };
  }

  return {
    success: true,
    data: {
      sprzedawca: sprzedawca || '',
      products: products.map(({ nazwa, ilosc, cena }) => ({ nazwa, ilosc, cena })),
    },
  };
}

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
