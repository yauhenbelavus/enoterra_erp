const { PDFParse } = require('pdf-parse');

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

// ─── Groq parser ─────────────────────────────────────────────────────────────

async function parseWithGroq(text) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY nie jest ustawiony na serwerze');

  const OpenAI = require('openai');
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const prompt = `You extract purchase invoice data from raw PDF text into JSON.

Return ONLY valid JSON (no markdown, no explanation):
{
  "sprzedawca": "supplier company name",
  "products": [
    {"nazwa": "Ambijus Act Naturally 750ml", "ilosc": 30, "cena_katalogowa": "38,35", "rabat_procent": 0, "wartosc_netto": "1150,50", "vat_procent": 23, "wartosc_brutto": "1415,12"}
  ]
}

=== SPRZEDAWCA (supplier) ===
Extract the company that ISSUED the invoice (seller), NOT the buyer.

How to find seller by language:
- PL: label "Sprzedawca:" → company name after it
- IT: company at TOP-LEFT (logo/header), or "Fornitore:", "Cedente:"
- DK: company in header/logo (e.g. "MURI ApS")
- NO/EN: company name in header (e.g. "Nolo Nordic AS")
- FR: branding/logo company (e.g. "CHAMPAGNE Chavost")

NEVER return as sprzedawca (these are ALWAYS the buyer):
- Win Experience, WIN EXPERIENCE, Win Experience Spółka z o.o.
- ENOTERRA, ENOTERRA POLAND
- Any name under: Nabywca, Acquirente, Destinatario, Recipient, Kupujący,
  Bill to, Sold to, Company Data (recipient block)

Return only company name — no address, NIP/VAT, phone.

=== PRODUCTS (line items) ===
Include physical goods: wine, drinks, bottles, AND pallets (Euro Pallet, EPAL, Paleta).
Parse the table row-by-row in order.

INCLUDE a row only if it has BOTH quantity > 0 AND a price value
(price can be 0 for F.o.C./Omaggio/gratis).
NEVER output a product with ilosc = 0 or missing quantity.

SKIP rows without quantity or without price:
- delivery address blocks ("Destinazione merce", "VEIS TAX WAREHOUSE", warehouse lines)
- payment/shipping notes, references, header-like lines

SKIP non-goods rows:
- Shipping, Spedizione, SHP, Frakt, Transport (cost lines)

INCLUDE F.o.C./Omaggio/free rows: cena_katalogowa "0", wartosc_netto "0", wartosc_brutto "0", rabat_procent 0 (ilosc > 0).

=== PRICES — extract RAW values only (NO calculations) ===
Extract exactly what is printed on the invoice. Do NOT multiply, divide, or apply discount/VAT.

Fields per product:
- cena_katalogowa: unit list/catalog price from price column BEFORE discount
  (PL: "Cena netto", IT: "PREZZO UNIT.", DK: "Stk. pris", EN: "ITEM.PRICE", FR: "P.U. HT")
- rabat_procent: discount % from row (% SCONTO, Sc.%, % Rem, DISC.) — 0 if none
- wartosc_netto: line NET total (Wartość netto, IMPORTO NETTO, Imp. Netto, Montant HT)
- vat_procent: VAT rate as integer (23, 5, 22) or 0 if not shown
- wartosc_brutto: line GROSS total (Wartość brutto) or "0" if not on invoice

NEVER confuse unit price with line total:
  Cena netto 38,35 (unit) ≠ Wartość netto 1150,50 (line total)

NEVER apply discount or VAT yourself — extract raw column values only.

Server calculation (same logic for discount and VAT):
- Net after discount: wartosc_netto / ilosc  (or cena_katalogowa × (1 − rabat/100) if no line net)
- Brutto with VAT:    wartosc_brutto / ilosc  (when Wartość brutto column is present)
- Fallback VAT only if wartosc_brutto missing: net × (1 + vat_procent/100)

SC row 1 example:
  wartosc_brutto 1415,12 / ilosc 30 → server cena = 47,17 (do NOT multiply 38,35 × 1,23 yourself)

=== MULTI-LINE ROWS (critical — read before parsing) ===
PDF text often splits ONE table row across several lines. You MUST join them
into a single logical row BEFORE extracting fields.

Algorithm — when you see a line starting with "N." (Lp. number, e.g. "8."):
1. Start joining this line with the following lines (up to 4 more).
2. Keep joining until the combined text contains a unit word: szt, but, stk, BT, each, pz, op.
3. Stop joining if you hit the next Lp. line (e.g. "9.") or a header/skip line.
4. Treat the joined block as ONE product row — extract nazwa, ilosc, prices, vat from it.
5. Do NOT output separate products for the continuation lines.

Example (Polish invoice):
  Line 1: "8. Domaine D'Grottes L'."
  Line 2: "Antidote  30 szt.  31,70  951,00  ..."
→ ONE product: {"nazwa": "Domaine D'Grottes L'Antidote", "ilosc": 30, "cena_katalogowa": "31,70", "rabat_procent": 0, "wartosc_netto": "951,00", "vat_procent": 5, "wartosc_brutto": "998,55"}

Bortolomiol example — extract RAW columns, do NOT calculate discount:
  PREZZO UNIT. 5,400 | % SCONTO 30 | QUANTITA' 624 | IMPORTO NETTO 2.358,72
  → {"nazwa": "MIOL ECRU...", "ilosc": 624, "cena_katalogowa": "5,400", "rabat_procent": 30, "wartosc_netto": "2358,72", "vat_procent": 0, "wartosc_brutto": "0"}
  (server applies discount and VAT — you only extract numbers from columns)

This is DIFFERENT from Bortolomiol case where the SAME product name appears in
TWO separate table rows (paid row + F.o.C. row) — each with its own qty and price.
Those are two products, do NOT join them.

=== NAZWA (product name) ===
Take from description column:
- PL: "Nazwa"
- IT: "DESCRIZIONE DEI BENI" / "Description"
- DK: "Tekst" (first line only — skip HS code and ABV lines below)
- EN: "DESCRIPTION" (first line; ignore second line like "Utland")
- FR: "Désignation" (first line; ignore "*Quantité : X - Lot :*" sub-lines)

Clean the name:
- Remove leading row numbers: "1.", "Lp. 3", "N°1", "N°2"
- Remove PKWiU codes: "11.07.19", "11.07.19.0"
- Remove product codes at start if duplicated: "P VBE_ECRU", "KRS1", "HS75BIO"
- Keep wine name, volume (750ml, 75cl), type (Brut Nature, Spumante)

=== ILOŚĆ (quantity) ===
Total count of bottles/pieces/units (szt, stk, BT, each, pz). Return as integer.

Use the QUANTITY column for THAT row — never copy from another row:
- PL: "Ilość" (number before "szt")
- IT: "QUANTITA'" or "Quantity" column
- DK: "Antal"
- EN: "QTY."
- FR: "Quantité" column (NOT "*Quantité : X*" inside description)

Rules:
- Same product name in 2 separate table rows → each row has its OWN quantity
- "Packag" / packages / cartons = IGNORE (not ilosc)
- Lotto lines "Qta: 204,000" inside description = IGNORE
- Multi-pack: multiply only if invoice explicitly shows "3 x 6 = 18"; otherwise use column value

=== CRITICAL RULES ===
1. Join multi-line PDF rows into one product BEFORE extracting fields (see MULTI-LINE ROWS)
2. Never assign one row's quantity/price to a different row
3. Win Experience / ENOTERRA is never the supplier
4. When unsure, prefer the column labeled quantity/ilość/antal/qty for ilosc

Invoice text:
${text.slice(0, 12000)}`;

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 4000,
    temperature: 0,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content.trim();
  return JSON.parse(content);
}

function parseNumber(value) {
  if (value == null || value === '') return 0;
  let s = String(value).trim().replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) {
    s =
      s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatPrice(value) {
  return (Math.round(value * 100) / 100).toFixed(2).replace('.', ',');
}

/** Unit net after discount — calculated on server only */
function resolveUnitNet(product, ilosc) {
  const lineNet = parseNumber(product.wartosc_netto);
  if (lineNet > 0) {
    return lineNet / ilosc;
  }

  const catalog = parseNumber(
    product.cena_katalogowa ?? product.cena_netto ?? product.cena ?? product.prezzo_unit
  );
  const discount = parseNumber(product.rabat_procent ?? product.rabat ?? product.discount);

  if (catalog > 0 && discount > 0) {
    return catalog * (1 - discount / 100);
  }
  return catalog;
}

/** Final cena per unit — all math on server */
function computeCenaBrutto(product) {
  const ilosc = parseNumber(product.ilosc);
  if (ilosc <= 0) return '0';

  const lineBrutto = parseNumber(product.wartosc_brutto);
  const lineNet = parseNumber(product.wartosc_netto);
  const catalog = parseNumber(product.cena_katalogowa ?? product.cena_netto ?? product.cena);

  if (catalog === 0 && lineNet === 0 && lineBrutto === 0) return '0';

  // Brutto z VAT — przez dzielenie (jak rabat przez wartosc_netto / ilosc)
  if (lineBrutto > 0) {
    return formatPrice(lineBrutto / ilosc);
  }

  // Fallback gdy brak kolumny brutto: netto po rabacie × (1 + VAT%)
  const unitNet = resolveUnitNet(product, ilosc);
  if (unitNet === 0) return '0';

  const vat = parseNumber(product.vat_procent ?? product.vat);
  if (vat > 0) {
    return formatPrice(unitNet * (1 + vat / 100));
  }
  return formatPrice(unitNet);
}

function mapProduct(product) {
  return {
    nazwa: String(product.nazwa || '').trim().slice(0, 200),
    ilosc: String(product.ilosc ?? ''),
    cena: computeCenaBrutto(product),
  };
}

// ─── Main entry point ────────────────────────────────────────────────────────

async function parsePurchaseInvoicePdf(buffer) {
  let text = '';
  try {
    text = await extractTextFromPdfBuffer(buffer);
  } catch (err) {
    return { success: false, error: 'Błąd odczytu PDF: ' + err.message, data: null };
  }

  if (!text || text.trim().length < 20) {
    return { success: false, error: 'Nie udało się odczytać tekstu z pliku PDF.', data: null };
  }

  try {
    const parsed = await parseWithGroq(text);

    if (!parsed || (!parsed.sprzedawca && (!parsed.products || parsed.products.length === 0))) {
      return { success: false, error: 'Nie udało się rozpoznać danych faktury.', data: null };
    }

    return {
      success: true,
      data: {
        sprzedawca: String(parsed.sprzedawca || '').trim(),
        products: (parsed.products || []).map(mapProduct),
      },
    };
  } catch (err) {
    console.error('❌ Groq OCR error:', err.message);
    return {
      success: false,
      error: 'Błąd rozpoznawania faktury (AI): ' + (err.message || 'nieznany błąd'),
      data: null,
    };
  }
}

module.exports = {
  parsePurchaseInvoicePdf,
  extractTextFromPdfBuffer,
};
