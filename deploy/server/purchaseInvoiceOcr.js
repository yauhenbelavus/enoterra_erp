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

  const prompt = `Extract data from this purchase invoice text.

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "sprzedawca": "supplier company name",
  "products": [
    {"nazwa": "product name", "ilosc": 12, "cena": "6,90"}
  ]
}

Rules:
- sprzedawca: the SELLER/SUPPLIER name — the company ISSUING the invoice (not the buyer/recipient).
  * On Italian invoices: look for "Fornitore:", "Cedente:", or the company name at the very TOP of the invoice (before "Spett.le" or "Destinatario").
  * On Polish invoices: look for "Sprzedawca:" label.
  * On Danish invoices: look for "Leverandør:" or company name in the header/logo area.
  * NEVER return the buyer — ignore lines with "Nabywca:", "Acquirente:", "Destinatario:", "Kupujący:", "Bill to:", "Sold to:".
  * NEVER return "Win Experience", "WIN EXPERIENCE", or any variation of it — that is always the BUYER, never the supplier.
  * Return just the company name, no address, no VAT number.
- products: only rows with actual goods/products. Include items with price 0 (free of charge, F.o.C., Omaggio, gratis).
- ilosc: number — total quantity of individual BOTTLES/PIECES received (not cartons/boxes/cases).
  Examples:
  * "3 CS x 6 BT" or "3 kartons × 6 szt" → ilosc = 18
  * "Antal 6 stk." → ilosc = 6
  * "Ilość: 12 szt" → ilosc = 12
  * "Qty: 24" with "Pack: 4 x 6" → ilosc = 24 (use the total, not the pack breakdown)
  * If only one number visible and unit is BT/szt/stk/pz/bt → that IS the bottle count
  * "Packag." column = number of cartons (IGNORE), look for "Total Qty" or "Ilość" column instead
- cena: unit net price as string with comma decimal separator (e.g. "6,90"). Use "0" if price is zero or free.
- Skip lines that are: shipping cost, payment terms, totals, tax rows, header rows, addresses, notes, lot/batch numbers.
- Product name: clean readable name without leading sequential numbers (1., N°1, etc.).

Invoice text:
${text.slice(0, 6000)}`;

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2000,
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
    console.error('❌ OpenAI OCR error:', err.message);
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
