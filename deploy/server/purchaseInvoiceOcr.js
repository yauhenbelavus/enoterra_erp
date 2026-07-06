const { PDFParse } = require('pdf-parse');

const INVOICE_LABEL =
  /(?:invoice|faktura|facture|fattura|rechnung|documento|bill)\s*(?:no|nr|n[°º]|numero|number)?/i;
const SUPPLIER_LABEL =
  /(?:from|supplier|vendor|vendeur|fornitore|lieferant|sprzedawca|dostawca)\s*[:.]?\s*(.+)/i;
const HEADER_WORDS =
  /\b(qty|quantity|quantit|quantité|menge|ilość|prezzo|price|prix|preis|importo|amount|montant|descri|description|article|codice|code|vat|iva|tva|u\.?m\.?|unit)\b/i;
const SKIP_LINE =
  /^(invoice|fattura|facture|rechnung|page|pagina|tel|phone|fax|www\.|http|email|e-mail|bank|iban|swift|bic)/i;

function normalizeNumber(value) {
  if (value == null || value === '') return null;
  const cleaned = String(value).replace(/\s/g, '').replace(',', '.');
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

function looksLikeProductCode(value) {
  return /^[A-Z0-9][A-Z0-9\-_.\/]{1,24}$/i.test(value);
}

function parseProductLine(line) {
  const trimmed = line.trim();
  if (!trimmed || HEADER_WORDS.test(trimmed)) return null;
  if (SKIP_LINE.test(trimmed)) return null;
  if (/^(subtotal|netto|vat|iva|tva|total|totale|transport|shipping)/i.test(trimmed)) return null;

  const tabParts = trimmed.split(/\t+/).map((p) => p.trim()).filter(Boolean);
  if (tabParts.length >= 3) {
    return buildProductFromParts(tabParts);
  }

  const spaced = trimmed.match(
    /^(.+?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)(?:\s+(\d+(?:[.,]\d+)?))?\s*(?:€|EUR|USD|\$)?$/
  );
  if (spaced) {
    const desc = spaced[1].trim();
    const qty = normalizeNumber(spaced[2]);
    const price = normalizeNumber(spaced[3]);
    if (qty == null || price == null || qty <= 0) return null;
    return splitDescription(desc, qty, price);
  }

  return null;
}

function buildProductFromParts(parts) {
  let kod = '';
  let nazwa;
  let qtyIndex;
  let priceIndex;

  if (parts.length >= 4 && looksLikeProductCode(parts[0])) {
    kod = parts[0];
    nazwa = parts[1];
    qtyIndex = 2;
    priceIndex = 3;
  } else {
    nazwa = parts[0];
    qtyIndex = 1;
    priceIndex = 2;
  }

  const ilosc = normalizeNumber(parts[qtyIndex]);
  const cena = normalizeNumber(parts[priceIndex]);
  if (!nazwa || ilosc == null || cena == null || ilosc <= 0) return null;

  return {
    nazwa: nazwa.slice(0, 200),
    ilosc: String(ilosc),
    cena: formatPriceForForm(cena),
  };
}

function splitDescription(desc, qty, price) {
  const tokens = desc.split(/\s+/);
  let nazwa = desc;

  if (tokens.length >= 2 && looksLikeProductCode(tokens[0])) {
    nazwa = tokens.slice(1).join(' ');
  }

  return {
    nazwa: nazwa.slice(0, 200),
    ilosc: String(qty),
    cena: formatPriceForForm(price),
  };
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
