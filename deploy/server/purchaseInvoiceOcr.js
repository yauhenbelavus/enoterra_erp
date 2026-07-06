const { PDFParse } = require('pdf-parse');

const SKIP_LINE =
  /^(invoice|fattura|facture|rechnung|page|pagina|tel|phone|fax|www\.|http|email|e-mail|bank|iban|swift|bic|w tym|razem|łącznie|do zapłaty|summary|total|nabywca|miejsce|termin|sposób|podpis|data\s|płatno|brutto|netto\s|pkwiu|lp\.|nazwa|wartość|stawka|kwota|lotto|lotto:|scad\.|scad:|ns\.rif|ns\.ord|ddt\s|rif\.|recipient|company\s|hs\s|hs\d|abv\s|abv<|fakturanr|fakturadato|kundenr|leveringsadresse|side\s|kundenummer|utland|invoiceno|invoicedate|salesperson|customerno|bankaccount|due\s|bic\/|delivery\s|your\sref)/i;
const HEADER_WORDS =
  /^\s*(lp\.?|qty|quantity|quantit|quantité|menge|ilość|prezzo|price|prix|preis|importo|amount|montant|descri|description|product|products|item|items|article|codice|pkwiu|j\.m|j\.m\.|vat|iva|tva|u\.?m\.?|unit|stawka|wartość|brutto|netto|cena\s|nazwa\s)/i;

// Unit words in multiple languages (J.m. / Unit column)
// PL: szt, but, op, pkt | IT: bt, bott, pz, pzi | EN: pcs, each, unit, btl, bottle |
// FR: btl, bout, pièce, pc | DE: St, Stk, Fl | Common: kg, g, l, ml, cl, dl
const UNIT_RE = /\b(szt\.?|but\.?|butel\.?|butelk[ai]?|op\.?|pkt\.?|pcs\.?|pc\.?|each|unit|btl\.?|btls\.?|bottle\.?|bottles\.?|bout\.?|bouteille\.?|pièce\.?|pz\.?|pzi\.?|bt\.?|bott\.?|nr\.?|stk\.?|stück\.?|fles\.?|botella\.?|kg\.?|g\.?|dag\.?|t\.?|l\.?|ml\.?|cl\.?|dl\.?)(?:\s|$)/i;

// Exact-match unit for tab-separated cells (single cell = unit word)
const UNIT_EXACT_RE = /^(szt\.?|but\.?|op\.?|pkt\.?|pcs\.?|pc\.?|each|unit|btl\.?|btls\.?|bottle\.?|bout\.?|pièce\.?|pz\.?|pzi\.?|bt\.?|bott\.?|nr\.?|stk\.?|stück\.?|fles\.?|botella\.?|kg\.?|g\.?|dag\.?|l\.?|ml\.?|cl\.?|dl\.?)$/i;
// Lp. pattern: starts with "1." "12." etc.
const LP_RE = /^\d{1,3}\.\s/;
// PKWiU code pattern: "11.07.19" or "11.07.19.0"
const PKWIU_RE = /\d{2}\.\d{2}\.\d{2}\.?\d*\s*/g;

function normalizeNumber(value) {
  if (value == null || value === '') return null;
  let cleaned = String(value).trim();
  // Remove spaces and non-breaking spaces (thousands separators)
  cleaned = cleaned.replace(/[\s\u00a0]/g, '');

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    // Both separators present — the LAST one is the decimal separator
    // English: 1,234.56  → comma=thousands, dot=decimal
    // European: 1.234,56 → dot=thousands, comma=decimal
    if (cleaned.lastIndexOf(',') < cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/,/g, ''); // remove thousands commas
    } else {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.'); // European
    }
  } else if (hasComma) {
    // Only comma — European decimal (1,50) or English thousands (1,000)?
    // If exactly 3 digits after the comma at end of string → likely thousands separator
    if (/,\d{3}$/.test(cleaned)) {
      cleaned = cleaned.replace(/,/g, ''); // treat as thousands
    } else {
      cleaned = cleaned.replace(',', '.'); // treat as decimal
    }
  }
  // Only dot or no separator → leave as-is (standard decimal)

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

  // 4) Company name with legal type suffix (Spa, Srl, Ltd, GmbH, etc.)
  //    Works for invoices like "Bortolomiol Spa, Via Garibaldi..." → extracts "Bortolomiol Spa"
  const companyRe =
    /\b([A-ZÀ-Ž][A-Za-zÀ-ž &.'-]{1,50}?\s+(?:Spa|S\.p\.A\.|Srl|S\.r\.l\.|sp\.\s*z\s*o\.o\.?|Ltd|Limited|GmbH|AG|SA|S\.A\.|NV|BV|AS|AB|ApS|Aps|Oy|Co\.|Corp\.|Inc\.|LLC))\b/;
  const companyMatch = text.match(companyRe);
  if (companyMatch) return companyMatch[1].trim().slice(0, 120);

  // 5) Fallback: first sensible short line before the table (no tabs = not a table row)
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i].trim();
    if (!line || line.length < 3 || line.length > 80) continue;
    if (line.includes('\t')) continue; // skip table rows
    if (SKIP_LINE.test(line)) continue;
    if (HEADER_WORDS.test(line)) continue;
    if (/^(sprzedawca|nabywca|ul\.|al\.|nip|tel|www|bic|iban|pln|plc|p\.i\.|p\.iva|r\.e\.a|cap\.soc)/i.test(line)) continue;
    if (/^[\d\s\-+().\/]+$/.test(line)) continue;
    if (/^(faktura|invoice|facture|fattura|rechnung|pro.?forma|total|totale|subtotal)/i.test(line)) continue;
    if (/^[*\-=_()\[\]#~]/.test(line)) continue; // decorative / footnote lines
    return line.slice(0, 120);
  }
  return null;
}

// ─── Polish Lp. table parsing ───────────────────────────────────────────────

/**
 * Join multi-line product rows: keep appending following lines until we find
 * a unit word (szt./but. etc.), hit another Lp. line, or exceed 4 lines.
 * Handles cases where product name AND PKWiU code span multiple PDF lines.
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
      let joined = line;
      let j = i + 1;

      // Keep joining until unit word found or we hit another Lp./skip line
      while (j < lines.length && !UNIT_RE.test(joined) && j - i <= 4) {
        const next = lines[j].trim();
        if (!next || LP_RE.test(next) || SKIP_LINE.test(next) || HEADER_WORDS.test(next)) break;
        joined = joined + ' ' + next;
        j++;
      }

      if (UNIT_RE.test(joined)) {
        rows.push(joined);
        i = j; // skip all consumed continuation lines
        continue;
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

  // Filter isolated single digits — artifacts from broken PKWiU codes (e.g. "11.07.19." + "0")
  const nazwa = tokens
    .slice(0, tokens.length - 1)
    .filter((t) => !/^\d$/.test(t))
    .join(' ')
    .trim();
  if (!nazwa || nazwa.length < 2) return null;
  // Skip if nazwa is just numbers/symbols
  if (/^[\d\s,.%]+$/.test(nazwa)) return null;

  // afterUnit: "38,35 1 150,50 23% 264,62 1 415,12"
  // First valid number = cena netto (may be 0 for F.o.C. items)
  const priceMatch = afterUnit.match(/^([\d,]+)/);
  const cena = priceMatch ? normalizeNumber(priceMatch[1]) : 0;

  return {
    nazwa: nazwa.slice(0, 200),
    ilosc: String(ilosc),
    cena: formatPriceForForm(cena ?? 0),
  };
}

// ─── Generic (non-Polish) fallback parsing ──────────────────────────────────

/**
 * Detect if a short token looks like a product/article code:
 * all-uppercase letters, digits, underscores, hyphens, slashes, spaces — max 30 chars.
 * Examples: "P VBE_ECRU", "ART-001", "SKU/2024"
 */
function isProductCode(token) {
  return token.length <= 30 && /^[A-Z0-9][A-Z0-9\s\-_.\/]*$/i.test(token) && !/[a-zàèìòùáéíóúâêîôûäëïöü]/.test(token);
}

function parseGenericLine(line) {
  const trimmed = line.trim();
  if (!trimmed || SKIP_LINE.test(trimmed) || HEADER_WORDS.test(trimmed)) return null;
  if (/^[\d\s%.,€$]+$/.test(trimmed)) return null;

  const parts = trimmed.split(/\t+/).map((p) => p.trim()).filter(Boolean);

  if (parts.length >= 3) {
    // ── Strategy 1: unit-anchored extraction ────────────────────────────────
    // Find the first cell that is exactly a unit word (BT, szt., pcs, kg, etc.)
    const unitIdx = parts.findIndex((p, i) => i >= 1 && UNIT_EXACT_RE.test(p));
    if (unitIdx >= 1 && unitIdx + 1 < parts.length) {
      const beforeUnitNum = unitIdx >= 1 ? normalizeNumber(parts[unitIdx - 1]) : null;

      let ilosc, cena, nameParts;

      if (beforeUnitNum != null && beforeUnitNum > 0) {
        // Format A: [code?] nazwa | qty | unit | price | total
        // e.g. Danish: KRS1 | Koji Rice | 90 | stk. | 75,00 | 6.750,00
        ilosc = beforeUnitNum;
        cena = normalizeNumber(parts[unitIdx + 1]) ?? 0;
        nameParts = parts.slice(0, unitIdx - 1); // everything before qty column
      } else {
        // Format B: [code?] nazwa | unit | [packag]? | qty | price | ...
        // e.g. Italian: P LOIM | LOIM 0 Bevanda... | BT | 360 | 4,500 | ...
        const numsAfterUnit = [];
        for (let k = unitIdx + 1; k < Math.min(parts.length, unitIdx + 5); k++) {
          numsAfterUnit.push(normalizeNumber(parts[k]));
        }
        const [n0, n1, n2] = numsAfterUnit;
        if (n0 != null && n1 != null && n2 != null &&
            (n1 > n0 * 3 || Math.abs(n0 - n1) < 0.001)) {
          // packag | total_qty | unit_price
          ilosc = n1;
          cena = n2;
        } else {
          ilosc = n0;
          cena = n1 ?? 0;
        }
        nameParts = parts.slice(0, unitIdx);
      }

      if (ilosc != null && ilosc > 0) {
        // Skip leading product code
        if (nameParts.length > 1 && isProductCode(nameParts[0])) {
          nameParts = nameParts.slice(1);
        }
        const nazwa = nameParts.join(' ').trim();
        if (nazwa && nazwa.length >= 2 && !/^[\d\s,.%]+$/.test(nazwa)) {
          return { nazwa: nazwa.slice(0, 200), ilosc: String(ilosc), cena: formatPriceForForm(cena ?? 0) };
        }
      }
    }

    // ── Strategy 2: [code?] nazwa | ilosc | cena ────────────────────────────
    let nazwa, ilosc, cena;
    if (isProductCode(parts[0]) && parts.length >= 4) {
      nazwa = parts[1];
      ilosc = normalizeNumber(parts[2]);
      cena = normalizeNumber(parts[3]);
    } else {
      nazwa = parts[0];
      ilosc = normalizeNumber(parts[1]);
      cena = normalizeNumber(parts[2]);
    }
    if (nazwa && nazwa.length >= 2 && !/^[\d,.]+$/.test(nazwa) &&
        ilosc != null && ilosc > 0) {
      return { nazwa: nazwa.slice(0, 200), ilosc: String(ilosc), cena: formatPriceForForm(cena ?? 0) };
    }
  }

  // ── Strategy 3: space-separated with double-space gaps ───────────────────
  const spaceMatch = trimmed.match(
    /^(.+?)\s{2,}(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s*(?:€|EUR|PLN|\$)?/
  );
  if (spaceMatch) {
    const nazwa = spaceMatch[1].trim();
    const ilosc = normalizeNumber(spaceMatch[2]);
    const cena = normalizeNumber(spaceMatch[3]);
    if (nazwa.length >= 2 && ilosc != null && ilosc > 0) {
      return { nazwa: nazwa.slice(0, 200), ilosc: String(ilosc), cena: formatPriceForForm(cena ?? 0) };
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
