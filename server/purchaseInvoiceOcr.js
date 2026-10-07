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

// ─── Gemini parser ───────────────────────────────────────────────────────────
// gemini-2.5-flash is unavailable for new API keys; gemini-3.7-flash is frequently
// overloaded on free tier (500/429), so use the stable gemini-3.6-flash via Interactions API.

const { enrichOcrProducts, pickCanonicalSupplier, loadWorkingSheetsCatalog } = require('./purchaseInvoiceCatalogMatch');

async function parseWithGemini(text) {
  const apiKey = (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY lub GEMINI_API_KEY nie jest ustawiony na serwerze');
  }

  const prompt = `You extract purchase invoice data from raw PDF text into JSON.

Return ONLY valid JSON (no markdown, no explanation):
{
  "sprzedawca": "supplier company name",
  "waluta": "EUR",
  "rabat": "30",
  "suma_netto": "1150,50",
  "suma_vat": "264,62",
  "suma_brutto": "1415,12",
  "products": [
    {"nazwa": "Ambijus Act Naturally 750ml", "ilosc": 30, "cena_katalogowa": "38,35", "rabat_procent": 30, "wartosc_netto": "805,35", "vat_procent": 23, "wartosc_brutto": "990,58"}
  ]
}

=== WALUTA (invoice currency) ===
Detect the currency used for product prices on the invoice.
Return exactly one of: EUR, PLN, DKK (uppercase).

How to detect:
- Currency symbols in price columns or totals: € / EUR → EUR; zł / PLN → PLN; kr / DKK → DKK
- Polish invoices (zł, PLN, "Wartość netto" in zł) → PLN
- Danish invoices (kr, DKK, "Stk. pris" in kr) → DKK
- Italian/Eurozone invoices (€, EUR) → EUR
- Default to EUR only if no currency indicator is found

Prices in products must stay in the detected invoice currency — do NOT convert to EUR.

=== INVOICE TOTALS (document footer) ===
Extract the DOCUMENT TOTALS from the invoice summary (not a sum you invent):
- suma_netto: total net amount (PL: "Razem netto" / "Wartość netto", IT: "Totale imponibile", EN: "Net total")
- suma_vat: total VAT amount (PL: "Kwota VAT" / "VAT", IT: "Totale IVA", EN: "VAT total")
- suma_brutto: total gross / payable (PL: "Razem brutto" / "Do zapłaty", IT: "Totale documento", EN: "Gross total")

Rules:
- Prefer printed footer totals over summing line items yourself
- If a total is missing on the invoice, return "0"
- Values as strings with comma decimals, same currency as waluta
- For PLN invoices these totals are especially important (unit line cena stays NETTO, totals show VAT + brutto)

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

Return only company trade name — no address, NIP/VAT, phone.

Clean sprzedawca name — remove legal entity form AND everything after it:
Keep only the trade/brand name before the legal form suffix.

Examples from real invoices:
  "BORTOLOMIOL Spa" / "BORTOLOMIOL S.p.A."           → "BORTOLOMIOL"
  "FERAL S.R.L. Società benefit"                     → "FERAL"
  "MURI ApS"                                         → "MURI"
  "Nolo Nordic AS"                                   → "Nolo Nordic"
  "CHAMPAGNE Chavost"                                → "CHAMPAGNE Chavost" (no legal form)
  "South Central Tomasz Chodorowicz"                 → "South Central Tomasz Chodorowicz" (person, no form)

Remove these forms and ALL text after them:
- PL: sp. z o.o., Sp. z o.o., spółka z ograniczoną odpowiedzialnością, S.A., sp. j., sp. k.
- IT: S.p.A., Spa, S.r.l., SRL, Società benefit, S.n.c., S.a.s.
- DK: ApS, A/S, I/S
- NO: AS, ASA
- FR: SA, SAS, SARL, EURL, SNC
- DE/EN: GmbH, AG, Ltd, Limited, LLC, Inc., Oy, AB, NV, BV

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
Extract exactly what is printed on the invoice. Do NOT multiply, divide, or apply discount/VAT yourself.

CRITICAL for the ERP form:
- Field "cena" on the form = LIST / catalog unit price BEFORE discount
- Field "rabat" on the form = discount % (header)
- "Cena po rabacie" is calculated later by the app from cena + rabat — NEVER put the discounted unit price into cena_katalogowa

Fields per product:
- cena_katalogowa: unit LIST price BEFORE any discount
  (PL: "Cena netto" / "Cena" before rabat, IT: "PREZZO UNIT.", DK: "Stk. pris", EN: "ITEM.PRICE", FR: "P.U. HT")
  If the invoice shows BOTH a list price and a discounted unit price, take the LIST price (before % SCONTO / rabat).
- rabat_procent: discount % from that row (% SCONTO, Sc.%, % Rem, DISC., Rabat %) — 0 if none
- wartosc_netto: line NET total AFTER discount (Wartość netto, IMPORTO NETTO, Imp. Netto, Montant HT)
- vat_procent: VAT rate as integer (23, 5, 22) or 0 if not shown
- wartosc_brutto: line GROSS total (Wartość brutto) or "0" if not on invoice

Document-level field:
- rabat: the invoice discount % for the form header. Prefer the % shared by paid product rows
  (e.g. all wine lines have 30% → "30"). If rows differ, use the most common non-zero %.
  "0" if there is no discount. Do NOT put a money amount here — only the percent.

NEVER confuse unit price with line total:
  PREZZO UNIT. 5,40 (unit BEFORE discount) ≠ IMPORTO NETTO 2358,72 (line total AFTER discount)

NEVER apply discount or VAT yourself — extract raw column values only.
NEVER return cena_katalogowa = wartosc_netto / ilosc when a list price column exists
(that would be the AFTER-discount unit — wrong for this form).

=== PLN INVOICES (zł) ===
1. cena_katalogowa = unit "Cena netto" / list unit BEFORE rabat
2. rabat_procent = row discount % (0 if none)
3. Still extract wartosc_netto / wartosc_brutto / vat_procent as printed
4. NEVER use Cena brutto / Wartość brutto as cena_katalogowa

PLN example (no discount):
  Cena netto 31,70 | Ilość 30 | Wartość netto 951,00 | VAT 5% | Wartość brutto 998,55
  → cena_katalogowa "31,70", rabat_procent 0, document rabat "0"

PLN with discount (if shown):
  Cena 10,00 | Rabat 10% | Ilość 12 | Wartość netto 108,00
  → cena_katalogowa "10,00", rabat_procent 10, document rabat "10"

=== EUR / DKK ===
- cena_katalogowa = PREZZO UNIT. / Stk. pris / ITEM.PRICE BEFORE % SCONTO
- rabat_procent = % SCONTO / Sc.% from the row
- wartosc_netto = IMPORTO NETTO / line net AFTER discount (raw)
- Do NOT put (wartosc_netto / ilosc) or (wartosc_brutto / ilosc) into cena_katalogowa

EUR/DKK example:
  PREZZO UNIT. 5,400 | % SCONTO 30 | QUANTITA' 624 | IMPORTO NETTO 2.358,72
  → cena_katalogowa "5,400", rabat_procent 30, document rabat "30"
  (app will compute cena po rabacie ≈ 3,780 and wartość ≈ 2358,72)

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
→ form cena = 31,70; rabat = 0

Bortolomiol example — extract RAW columns, do NOT put discounted unit into cena:
  PREZZO UNIT. 5,400 | % SCONTO 30 | QUANTITA' 624 | IMPORTO NETTO 2.358,72
  → {"nazwa": "MIOL ECRU...", "ilosc": 624, "cena_katalogowa": "5,400", "rabat_procent": 30, "wartosc_netto": "2358,72", "vat_procent": 0, "wartosc_brutto": "0"}
  → form cena = 5,40; form rabat = 30; app computes cena po rabacie (NOT 3,78 in cena)

  Row 2 (same product, F.o.C.): PREZZO 0 | QUANTITA' 30 | IMPORTO NETTO 0 → separate product, cena 0

  Row 3: PREZZO UNIT. 7,100 | % SCONTO 30 | QUANTITA' 240 | IMPORTO NETTO 1.192,80
  → {"nazwa": "MIOL Prosecco...", "ilosc": 240, "cena_katalogowa": "7,100", "rabat_procent": 30, "wartosc_netto": "1192,80", ...}

  EVERY paid row MUST have its OWN rabat_procent and wartosc_netto — copy % SCONTO from each row, do NOT skip on rows 2+.
  PREZZO UNIT. is BEFORE discount → cena_katalogowa.
  IMPORTO NETTO is AFTER discount → wartosc_netto only (never divide into cena_katalogowa).

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
- "Packag" / "Packag." / packages / cartons / cases = NEVER ilosc (smaller number)
- Lotto lines "Qta: 204,000" inside description = IGNORE (batch split, not row qty)
- Multi-pack: multiply only if invoice explicitly shows "3 x 6 = 18"; otherwise use column value

FERAL S.R.L. invoice — CRITICAL (columns left to right):
  Code | N.C. | Description | U.d.M. | Packag | Quantity | Prezzo Un. | Sc.% | Imp. Netto | IVA

  Packag = number of cartons/boxes (IGNORE for ilosc)
  Quantity = total bottles/units (USE for ilosc)

  Row examples — ilosc from Quantity, NEVER from Packag:
    HS75BIO  Packag=50   Quantity=300,000  Prezzo=6,9000  Imp.Netto=2.070,00  → ilosc=300 (NOT 50, NOT 300000)
    GA75BIO  Packag=6    Quantity=36,000   Prezzo=6,9000  Imp.Netto=248,40    → ilosc=36  (NOT 6, NOT 36000)
    Euro Pallet EPAL  Packag=1  Quantity=1,000  Prezzo=9,3000  Imp.Netto=9,30  → ilosc=1 (NOT 1000)

  Italian quantity format: comma + three zeros = decimal display, NOT thousands separator.
    "300,000" = 300 bottles | "36,000" = 36 | "1,000" = 1 — return as integer 300/36/1, never 300000/36000/1000.

  Sanity check: Imp. Netto / Prezzo Un. ≈ Quantity (e.g. 2070 / 6,90 = 300)
  Skip lines starting with "Lotto:" — they are NOT product rows

=== CRITICAL RULES ===
1. Join multi-line PDF rows into one product BEFORE extracting fields (see MULTI-LINE ROWS)
2. Never assign one row's quantity/price to a different row
3. Win Experience / ENOTERRA is never the supplier
4. When unsure, prefer the column labeled quantity/ilość/antal/qty for ilosc

Invoice text:
${text.slice(0, 12000)}`;

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      'Api-Revision': '2026-05-20',
    },
    body: JSON.stringify({
      model: 'gemini-3.6-flash',
      input: prompt,
      generation_config: {
        max_output_tokens: 8192,
        thinking_level: 'medium',
      },
      response_format: {
        type: 'text',
        mime_type: 'application/json',
      },
    }),
  });

  const raw = await response.json().catch(() => ({}));
  const data = Array.isArray(raw) ? raw[0] : raw;
  if (!response.ok) {
    const reason = data?.error?.details?.[0]?.reason;
    const message = data?.error?.message;
    throw new Error(
      reason && message ? `${reason}: ${message}` : message || `HTTP ${response.status}`
    );
  }

  const content = extractGeminiInteractionText(data);
  if (!content) {
    const reason = data.status || 'empty';
    throw new Error('Pusta odpowiedź modelu (' + reason + ')');
  }
  return JSON.parse(content);
}

function extractGeminiInteractionText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const outputs = data.outputs || [];
  for (let i = outputs.length - 1; i >= 0; i--) {
    const output = outputs[i];
    if (typeof output.text === 'string' && output.text.trim()) {
      return output.text.trim();
    }
    if (Array.isArray(output.content)) {
      const text = output.content
        .filter((part) => part.type === 'text' && part.text)
        .map((part) => part.text)
        .join('')
        .trim();
      if (text) return text;
    }
  }

  const steps = data.steps || [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.type !== 'model_output' && step.type !== 'output') continue;
    const text = (step.content || [])
      .filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text)
      .join('')
      .trim();
    if (text) return text;
  }

  return '';
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

/** Parse quantity — handles Italian "300,000" (= 300 units, not 300000) */
function parseQuantity(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  // Italian ERP: 300,000 / 36,000 / 1,000 — comma + 3 decimal zeros = whole units
  const itDecimalQty = raw.match(/^(\d{1,7}),0{3}$/);
  if (itDecimalQty) {
    return parseInt(itDecimalQty[1], 10);
  }

  const n = parseNumber(raw);
  return Math.round(n) === n ? n : Math.round(n);
}

function formatPrice(value) {
  return (Math.round(value * 100) / 100).toFixed(2).replace('.', ',');
}

/** Strip legal entity suffix and everything after it from supplier name */
function cleanSupplierName(name) {
  let s = String(name || '').trim();
  if (!s) return '';

  s = s.replace(/,.*$/, '').trim();

  const legalFormPattern =
    /\s+(?:spółka z ograniczoną odpowiedzialnością|spolka z ograniczona odpowiedzialnoscia|societ[aà]\s+benefit|sp\.\s*z\.?\s*o\.?\s*o\.?|s\.\s*p\.\s*a\.?|s\.\s*r\.\s*l\.?|sp\.\s*j\.?|sp\.\s*k\.?|s\.?\s*a\.?\s*s\.?|sarl|sas|eurl|snc|gmbh|ag|aps|a\/s|asa|\bas\b|a\.?\s*s\.?|oy|ab|nv|bv|ltd\.?|limited|llc|inc\.?|corp\.?|co\.?|spa|srl)(?:\s.*)?$/i;

  s = s.replace(legalFormPattern, '').trim();
  return s.replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** Catalog unit net before line-total division */
function unitNetFromCatalog(product, discountOverride) {
  const catalog = parseNumber(
    product.cena_katalogowa ?? product.cena_netto ?? product.cena ?? product.prezzo_unit
  );
  const discount =
    discountOverride ??
    parseNumber(product.rabat_procent ?? product.rabat ?? product.discount);
  if (catalog > 0 && discount > 0) {
    return catalog * (1 - discount / 100);
  }
  return catalog;
}

/** Infer discount % when LLM omitted rabat_procent but line net is below catalog × qty */
function inferDiscountPercent(product, ilosc) {
  const explicit = parseNumber(product.rabat_procent ?? product.rabat ?? product.discount);
  if (explicit > 0) return explicit;

  const lineNet = parseNumber(product.wartosc_netto);
  const catalog = parseNumber(
    product.cena_katalogowa ?? product.cena_netto ?? product.cena ?? product.prezzo_unit
  );
  if (lineNet <= 0 || catalog <= 0 || ilosc <= 0) return 0;

  const fullLine = catalog * ilosc;
  if (fullLine <= lineNet * 1.005) return 0;

  const pct = (1 - lineNet / fullLine) * 100;
  if (pct >= 0.5 && pct <= 99) {
    return Math.round(pct * 100) / 100;
  }
  return 0;
}

/** Fix Packag-vs-Quantity and inflated Italian qty (300,000 → 300000) */
function resolveQuantity(product) {
  let ilosc = parseQuantity(product.ilosc ?? product.quantity ?? product.quantita);
  if (ilosc <= 0) return 0;

  const lineNet = parseNumber(product.wartosc_netto);
  const catalog = parseNumber(
    product.cena_katalogowa ?? product.cena_netto ?? product.cena ?? product.prezzo_unit
  );
  if (lineNet <= 0 || catalog <= 0) return ilosc;

  const discount = inferDiscountPercent(product, ilosc);
  const unitNet = unitNetFromCatalog(product, discount);
  const impliedUnit = lineNet / ilosc;

  // Packag confusion: implied unit price much HIGHER than catalog/discounted price → qty too small
  if (impliedUnit > unitNet * 1.15) {
    const fromLine = Math.round(lineNet / unitNet);
    if (fromLine > ilosc) {
      ilosc = fromLine;
    }
  } else if (impliedUnit > catalog * 1.15) {
    const fromCatalog = Math.round(lineNet / catalog);
    if (fromCatalog > ilosc) {
      ilosc = fromCatalog;
    }
  }

  // Inflated qty (300,000 read as 300000): implied unit price absurdly low
  if (impliedUnit < unitNet * 0.15 && unitNet > 0) {
    const fromUnitNet = Math.round(lineNet / unitNet);
    if (fromUnitNet > 0 && ilosc > fromUnitNet * 5) {
      ilosc = fromUnitNet;
    }
  } else if (impliedUnit < catalog * 0.15) {
    const fromCatalog = Math.round(lineNet / catalog);
    if (fromCatalog > 0 && ilosc > fromCatalog * 5) {
      ilosc = fromCatalog;
    }
  }

  return ilosc;
}

/** Unit net after discount — calculated on server only */
function resolveUnitNet(product, ilosc) {
  const lineNet = parseNumber(product.wartosc_netto);
  if (lineNet > 0 && ilosc > 0) {
    return lineNet / ilosc;
  }

  const discount = inferDiscountPercent(product, ilosc);
  return unitNetFromCatalog(product, discount);
}

/**
 * Form field "cena" = list/catalog unit BEFORE discount.
 * Header "rabat" is applied later on the client → "cena po rabacie".
 */
function resolveListUnitPrice(product, ilosc) {
  const catalog = parseNumber(
    product.cena_katalogowa ?? product.cena_netto ?? product.cena ?? product.prezzo_unit
  );
  if (catalog > 0) return catalog;

  const lineNet = parseNumber(product.wartosc_netto);
  if (lineNet <= 0 || ilosc <= 0) return 0;

  const discount = inferDiscountPercent(product, ilosc);
  if (discount > 0 && discount < 100) {
    return lineNet / ilosc / (1 - discount / 100);
  }
  return lineNet / ilosc;
}

/** Final unit list price + line value (line value stays AFTER discount when known). */
function computeProductPricing(product, waluta = 'EUR') {
  const ilosc = resolveQuantity(product);
  if (ilosc <= 0) {
    return { cena: '0', cenaPelna: 0, wartosc: '0', rabatProcent: 0 };
  }

  const lineNet = parseNumber(product.wartosc_netto);
  const lineBrutto = parseNumber(product.wartosc_brutto);
  const rabatProcent = inferDiscountPercent(product, ilosc);
  const cenaPelna = resolveListUnitPrice(product, ilosc);

  if (cenaPelna === 0 && lineNet === 0 && lineBrutto === 0) {
    return { cena: '0', cenaPelna: 0, wartosc: '0', rabatProcent: 0 };
  }

  const unitAfterRabat =
    rabatProcent > 0 && rabatProcent < 100
      ? cenaPelna * (1 - rabatProcent / 100)
      : cenaPelna;
  const lineValue =
    lineNet > 0
      ? lineNet
      : lineBrutto > 0 && waluta !== 'PLN'
        ? lineBrutto
        : unitAfterRabat * ilosc;

  return {
    cena: formatPrice(cenaPelna),
    cenaPelna,
    wartosc: formatPrice(lineValue),
    rabatProcent,
  };
}

/** Header rabat % for the form: document-level if present, else mode of paid rows. */
function resolveHeaderRabat(parsed, products) {
  const fromDoc = parseNumber(
    parsed?.rabat ?? parsed?.rabat_procent ?? parsed?.discount ?? parsed?.sconto
  );
  if (fromDoc > 0 && fromDoc < 100) {
    return Math.round(fromDoc * 100) / 100;
  }

  const counts = new Map();
  for (const product of products || []) {
    const ilosc = resolveQuantity(product);
    if (ilosc <= 0) continue;
    const catalog = parseNumber(
      product.cena_katalogowa ?? product.cena_netto ?? product.cena ?? product.prezzo_unit
    );
    const lineNet = parseNumber(product.wartosc_netto);
    if (catalog === 0 && lineNet === 0) continue;
    const d = inferDiscountPercent(product, ilosc);
    if (d <= 0 || d >= 100) continue;
    const key = String(Math.round(d * 100) / 100);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  let best = null;
  for (const [key, count] of counts) {
    const value = parseFloat(key);
    if (
      !best ||
      count > best.count ||
      (count === best.count && value > best.value)
    ) {
      best = { value, count };
    }
  }
  return best ? best.value : 0;
}

function normalizeWaluta(waluta) {
  const w = String(waluta || 'EUR').trim().toUpperCase();
  if (w === 'PLN' || w === 'DKK') return w;
  return 'EUR';
}

function mapProduct(product, waluta = 'EUR') {
  const ilosc = resolveQuantity(product);
  const pricing = computeProductPricing(product, waluta);
  return {
    nazwa: String(product.nazwa || '').trim().slice(0, 200),
    ilosc: String(ilosc),
    cena: pricing.cena,
    cenaPelna: pricing.cenaPelna,
    wartosc: pricing.wartosc,
    rabat_procent: pricing.rabatProcent,
  };
}

// ─── Main entry point ────────────────────────────────────────────────────────

async function parsePurchaseInvoicePdf(buffer, db) {
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
    const parsed = await parseWithGemini(text);

    if (!parsed || (!parsed.sprzedawca && (!parsed.products || parsed.products.length === 0))) {
      return { success: false, error: 'Nie udało się rozpoznać danych faktury.', data: null };
    }

    const waluta = normalizeWaluta(parsed.waluta);
    const catalog = db ? await loadWorkingSheetsCatalog(db) : [];
    const sprzedawca = pickCanonicalSupplier(cleanSupplierName(parsed.sprzedawca), catalog);
    const headerRabat = resolveHeaderRabat(parsed, parsed.products || []);
    const mappedProducts = (parsed.products || []).map((product) => mapProduct(product, waluta));
    const products = await enrichOcrProducts(mappedProducts, sprzedawca, db, catalog);

    return {
      success: true,
      data: {
        sprzedawca,
        waluta,
        rabat: formatPrice(headerRabat),
        suma_netto: formatPrice(parseNumber(parsed.suma_netto)),
        suma_vat: formatPrice(parseNumber(parsed.suma_vat)),
        suma_brutto: formatPrice(parseNumber(parsed.suma_brutto)),
        products,
      },
    };
  } catch (err) {
    console.error('❌ Gemini OCR error:', err.message);
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
