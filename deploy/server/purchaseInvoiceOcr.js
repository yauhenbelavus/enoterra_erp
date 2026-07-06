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

async function parseWithGemini(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY nie jest ustawiony na serwerze');

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `Extract data from this purchase invoice text.

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "sprzedawca": "supplier company name",
  "products": [
    {"nazwa": "product name", "ilosc": 12, "cena": "6,90"}
  ]
}

Rules:
- sprzedawca: the SELLER/SUPPLIER name (not the buyer). Look for "Sprzedawca:", "Fornitore:", "Supplier:", company name at top of invoice. Return just the name, no address.
- products: only rows with actual goods/products. Include items with price 0 (free of charge, F.o.C., Omaggio, gratis).
- ilosc: number — total quantity of individual bottles/pieces/units received. If invoice shows "3 kartons x 6 bottles" → 18.
- cena: unit net price as string with comma decimal separator (e.g. "6,90"). Use "0" if price is zero or free.
- Skip lines that are: shipping cost, payment terms, totals, tax rows, header rows, addresses, notes, lot/batch numbers.
- Product name: clean readable name without leading sequential numbers (1., N°1, etc.).

Invoice text:
${text.slice(0, 6000)}`;

  const result = await model.generateContent(prompt);
  const content = result.response.text().trim();
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(cleaned);
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
    const parsed = await parseWithGemini(text);

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
