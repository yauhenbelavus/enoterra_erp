'use strict';

const LEADING_QUOTES_PATTERN = /^(["'«»‹›„“”‘’‚‛]+)/u;

/**
 * Title-case nazwa: trim, collapse spaces, capitalize first letter of each word.
 * Words that start with a quote still get a capital letter after the quote ("esprit → "Esprit).
 * Matches the production SQL rule; uses pl-PL for Polish letters.
 * @param {unknown} value
 * @returns {string}
 */
function toTitleCaseNazwa(value) {
  const trimmed = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  return trimmed
    .toLocaleLowerCase('pl-PL')
    .split(' ')
    .map((word) => capitalizeNazwaWord(word))
    .join(' ');
}

/**
 * @param {string} word
 * @returns {string}
 */
function capitalizeNazwaWord(word) {
  const quoteMatch = word.match(LEADING_QUOTES_PATTERN);
  if (quoteMatch) {
    const quotes = quoteMatch[1];
    const rest = word.slice(quotes.length);
    if (!rest) return word;
    return quotes + rest.charAt(0).toLocaleUpperCase('pl-PL') + rest.slice(1);
  }
  return word.charAt(0).toLocaleUpperCase('pl-PL') + word.slice(1);
}

/** @type {Record<string, boolean>} */
const TYPES_WITHOUT_AKCYZA = {
  bezalkoholowe: true,
  ferment: true,
  aksesoria: true,
};

/**
 * @param {unknown} value
 * @returns {number}
 */
function parsePlNumber(value) {
  const n = parseFloat(String(value ?? '').replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isFilled(value) {
  return String(value ?? '').trim() !== '';
}

/**
 * @param {unknown} waluta
 * @returns {boolean}
 */
function isWalutaSelected(waluta) {
  const code = String(waluta || '').trim().toUpperCase();
  return code === 'EUR' || code === 'PLN' || code === 'DKK';
}

/**
 * @param {unknown} typ
 * @returns {boolean}
 */
function rowNeedsAkcyza(typ) {
  const value = String(typ || '').trim();
  return Boolean(value) && !TYPES_WITHOUT_AKCYZA[value];
}

/**
 * @typedef {{
 *   kod: boolean;
 *   nazwa: boolean;
 *   kod_kreskowy: boolean;
 *   ilosc: boolean;
 *   cena: boolean;
 *   typ: boolean;
 *   objetosc: boolean;
 *   dataWaznosci: boolean;
 * }} RowInvalidFields
 */

/**
 * @param {unknown} row
 * @returns {RowInvalidFields}
 */
function getRowInvalidFields(row) {
  const product = /** @type {any} */ (row || {});
  const ilosc = parsePlNumber(product.ilosc);
  const cena = product.cenaPelna != null && product.cenaPelna !== ''
    ? Number(product.cenaPelna)
    : parsePlNumber(product.cena);
  const typ = String(product.typ || '').trim();
  return {
    kod: !String(product.kod || '').trim(),
    nazwa: !String(product.nazwa || '').trim(),
    kod_kreskowy: !String(product.kod_kreskowy || '').trim(),
    ilosc: !Number.isFinite(ilosc) || ilosc <= 0,
    cena: !Number.isFinite(cena) || cena < 0,
    typ: !typ,
    objetosc: typ !== 'aksesoria' && (product.objetosc == null || String(product.objetosc).trim() === ''),
    dataWaznosci: typ === 'ferment' && !product.dataWaznosci,
  };
}

/**
 * @param {unknown} row
 * @param {number} index
 * @returns {string | null}
 */
function getRowValidationError(row, index) {
  const n = index + 1;
  const invalid = getRowInvalidFields(row);
  if (invalid.kod) return `Pozycja ${n}: uzupełnij kod`;
  if (invalid.nazwa) return `Pozycja ${n}: uzupełnij nazwę`;
  if (invalid.kod_kreskowy) return `Pozycja ${n}: uzupełnij kod kreskowy`;
  if (invalid.ilosc) return `Pozycja ${n}: ilość musi być większa od 0`;
  if (invalid.cena) return `Pozycja ${n}: uzupełnij cenę`;
  if (invalid.typ) return `Pozycja ${n}: wybierz typ`;
  if (invalid.objetosc) return `Pozycja ${n}: wybierz objętość`;
  if (invalid.dataWaznosci) return `Pozycja ${n}: podaj termin ważności`;
  return null;
}

/**
 * @typedef {{
 *   date: boolean;
 *   sprzedawca: boolean;
 *   kosztDostawy: boolean;
 *   walutaDostawy: boolean;
 *   akcyza: boolean;
 * }} HeaderInvalidFields
 */

/**
 * @param {{
 *   hasDate?: boolean;
 *   sprzedawca?: unknown;
 *   kosztDostawy?: unknown;
 *   walutaDostawy?: unknown;
 *   products?: unknown[];
 *   podatekAkcyzowy?: unknown;
 *   skipDelivery?: boolean;
 * }} input
 * @returns {HeaderInvalidFields}
 */
function getHeaderInvalidFields(input) {
  const data = input || {};
  return {
    date: !data.hasDate,
    sprzedawca: !isFilled(data.sprzedawca),
    kosztDostawy: false,
    walutaDostawy: data.skipDelivery
      ? false
      : parsePlNumber(data.kosztDostawy) > 0 && !isWalutaSelected(data.walutaDostawy),
    akcyza: false,
  };
}

const PURCHASE_INCOMPLETE_MESSAGE = 'Wypełnij wszystkie wymagane pola';

/**
 * @param {{
 *   hasDate?: boolean;
 *   sprzedawca?: unknown;
 *   kosztDostawy?: unknown;
 *   walutaDostawy?: unknown;
 *   kursError?: string | null;
 *   products?: unknown[];
 *   podatekAkcyzowy?: unknown;
 *   skipDelivery?: boolean;
 * }} input
 * @returns {string | null}
 */
function validatePurchaseReceipt(input) {
  const data = input || {};
  const header = getHeaderInvalidFields(data);
  if (header.date || header.sprzedawca || header.walutaDostawy) {
    return PURCHASE_INCOMPLETE_MESSAGE;
  }
  if (data.kursError) return PURCHASE_INCOMPLETE_MESSAGE;
  const products = Array.isArray(data.products) ? data.products : [];
  if (products.length === 0) return PURCHASE_INCOMPLETE_MESSAGE;
  for (let index = 0; index < products.length; index += 1) {
    if (getRowValidationError(products[index], index)) return PURCHASE_INCOMPLETE_MESSAGE;
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function parseLineQty(value) {
  const n = parsePlNumber(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Unit price for the invoice line. 0 is a valid sample price.
 * @param {any} product
 * @returns {number}
 */
function ownLineCena(product) {
  const row = product || {};
  const raw = row.cenaPelna != null && row.cenaPelna !== '' ? row.cenaPelna : row.cena;
  const n = parsePlNumber(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Freight share uses the paid sibling with the same kod when this line is 0 (sample).
 * Invoice netto stays on ownLineCena; only transport allocation borrows the brother's price.
 * @param {any} product
 * @param {any[]} products
 * @returns {number}
 */
function freightUnitCena(product, products) {
  if (!product || String(product.typ || '').trim() === 'aksesoria') return 0;
  const own = ownLineCena(product);
  if (own > 0) return own;
  const kod = String(product.kod || '').trim().toLowerCase();
  if (!kod) return 0;
  const rows = Array.isArray(products) ? products : [];
  for (const other of rows) {
    if (!other || other === product) continue;
    if (String(other.typ || '').trim() === 'aksesoria') continue;
    if (String(other.kod || '').trim().toLowerCase() !== kod) continue;
    const cena = ownLineCena(other);
    if (cena > 0) return cena;
  }
  return 0;
}

/**
 * @param {any} product
 * @param {any[]} products
 * @returns {number}
 */
function freightLineValue(product, products) {
  return parseLineQty(product && product.ilosc) * freightUnitCena(product, products);
}

/**
 * @param {any[]} products
 * @returns {number}
 */
function receiptFreightValueTotal(products) {
  const rows = Array.isArray(products) ? products : [];
  return rows.reduce((sum, product) => {
    if (product && String(product.typ || '').trim() === 'aksesoria') return sum;
    return sum + freightLineValue(product, rows);
  }, 0);
}

/**
 * Delivery cost per bottle in the delivery currency (before kurs).
 * Sample with cena 0 gets the same per-bottle share as its paid kod sibling.
 * @param {any} product
 * @param {any[]} products
 * @param {unknown} deliveryCost
 * @returns {number}
 */
function kosztButWgWartosci(product, products, deliveryCost) {
  if (!product || String(product.typ || '').trim() === 'aksesoria') return 0;
  const qty = parseLineQty(product.ilosc);
  const totalValue = receiptFreightValueTotal(products);
  const lineValue = freightLineValue(product, products);
  if (totalValue <= 0 || qty <= 0) return 0;
  return (parseLineQty(deliveryCost) * lineValue) / (totalValue * qty);
}

export {
  toTitleCaseNazwa,
  getRowInvalidFields,
  getHeaderInvalidFields,
  getRowValidationError,
  validatePurchaseReceipt,
  rowNeedsAkcyza,
  freightUnitCena,
  freightLineValue,
  receiptFreightValueTotal,
  kosztButWgWartosci,
};
