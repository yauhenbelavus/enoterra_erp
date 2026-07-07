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
    {"nazwa": "product name", "ilosc": 30, "cena": "38,99"}
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

INCLUDE F.o.C./Omaggio/free rows: cena = "0" (quantity must still be present).

=== MULTI-LINE ROWS (critical — read before parsing) ===
PDF text often splits ONE table row across several lines. You MUST join them
into a single logical row BEFORE extracting nazwa/ilosc/cena.

Algorithm — when you see a line starting with "N." (Lp. number, e.g. "8."):
1. Start joining this line with the following lines (up to 4 more).
2. Keep joining until the combined text contains a unit word: szt, but, stk, BT, each, pz, op.
3. Stop joining if you hit the next Lp. line (e.g. "9.") or a header/skip line.
4. Treat the joined block as ONE product row — extract nazwa, ilosc, cena from it.
5. Do NOT output separate products for the continuation lines.

Example (Polish invoice):
  Line 1: "8. Domaine D'Grottes L'."
  Line 2: "Antidote  30 szt.  31,70  951,00  ..."
→ ONE product: {"nazwa": "Domaine D'Grottes L'Antidote", "ilosc": 30, "cena": "33,29"}
  (net 31,70 × VAT 5% = 33,29)

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

=== CENA (final unit price for ERP) ===
Output as string with comma decimal separator (e.g. "38,99").

Step 1 — calculate NET unit price after discount:
1. If line net total exists: net = net_line_total / quantity
   (IMPORTO NETTO, Imp. Netto, Wartość netto, Montant HT; or AMOUNT / QTY)
2. Else if discount % exists: net = unit_price × (1 − discount/100)
   (% SCONTO, Sc.%, % Rem, DISC.)
3. Else: net = unit price column (Cena netto, PREZZO UNIT., Stk. pris, P.U. HT, ITEM.PRICE)

Step 2 — apply VAT if rate is shown on the row:
If the row has a VAT rate (Stawka VAT, IVA, TVA, VAT, MwSt, % like "23%", "5%", "22%"):
  cena = net × (1 + vat_rate / 100)
Examples:
  net 31,70 + VAT 23% → cena = "38,99"
  net 31,70 + VAT 5%  → cena = "33,29"
  net 5,40 + VAT 22%  → cena = "6,59"

If NO VAT rate on the row → cena = net (no multiplication).

Alternative when gross line total is visible:
  cena = Wartość brutto / Ilość  (or gross total / quantity)
Use this to verify Step 2 (±0.02).

F.o.C. / Omaggio / price 0 → cena = "0" (skip VAT calculation)

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
        products: (parsed.products || []).map((p) => ({
          nazwa: String(p.nazwa || '').trim().slice(0, 200),
          ilosc: String(p.ilosc ?? ''),
          cena: String(p.cena ?? '0'),
        })),
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
