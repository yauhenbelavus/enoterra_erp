'use strict';

/**
 * Title-case nazwa: trim, collapse spaces, capitalize first letter of each word.
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
    .map((word) => word.charAt(0).toLocaleUpperCase('pl-PL') + word.slice(1))
    .join(' ');
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
    cena: !Number.isFinite(cena) || cena <= 0,
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
  if (invalid.cena) return `Pozycja ${n}: cena musi być większa od 0`;
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

export {
  toTitleCaseNazwa,
  getRowInvalidFields,
  getHeaderInvalidFields,
  getRowValidationError,
  validatePurchaseReceipt,
  rowNeedsAkcyza,
};
