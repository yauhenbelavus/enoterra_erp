'use strict';

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
 * @param {unknown} value
 * @returns {boolean}
 */
function isMoneyFieldFilled(value) {
  if (!isFilled(value)) return false;
  const n = parsePlNumber(value);
  return Number.isFinite(n) && n >= 0;
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
 * @param {unknown} products
 * @param {unknown} podatekAkcyzowy
 * @returns {string | null}
 */
function validateAkcyza(products, podatekAkcyzowy) {
  const rows = Array.isArray(products) ? products : [];
  const needsAkcyza = rows.some((row) => rowNeedsAkcyza(/** @type {any} */ (row)?.typ));
  if (needsAkcyza) {
    const akcyza = parsePlNumber(podatekAkcyzowy);
    if (!isMoneyFieldFilled(podatekAkcyzowy) || !(akcyza > 0)) {
      return 'Podatek akcyzowy musi być większy od 0';
    }
  }
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
  const products = Array.isArray(data.products) ? data.products : [];
  return {
    date: !data.hasDate,
    sprzedawca: !isFilled(data.sprzedawca),
    kosztDostawy: false,
    walutaDostawy: data.skipDelivery
      ? false
      : parsePlNumber(data.kosztDostawy) > 0 && !isWalutaSelected(data.walutaDostawy),
    akcyza: Boolean(validateAkcyza(products, data.podatekAkcyzowy)),
  };
}

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
  if (!data.hasDate) return 'Wybierz datę zakupu';
  if (!isFilled(data.sprzedawca)) return 'Wprowadź sprzedawcę';
  if (!data.skipDelivery) {
    if (data.kursError) return data.kursError;
    if (parsePlNumber(data.kosztDostawy) > 0 && !isWalutaSelected(data.walutaDostawy)) {
      return 'Wybierz walutę dostawy';
    }
  } else if (data.kursError) {
    return data.kursError;
  }
  const products = Array.isArray(data.products) ? data.products : [];
  if (products.length === 0) return 'Dodaj co najmniej jedną pozycję';
  for (let index = 0; index < products.length; index += 1) {
    const rowError = getRowValidationError(products[index], index);
    if (rowError) return rowError;
  }
  return validateAkcyza(products, data.podatekAkcyzowy);
}

export {
  getRowInvalidFields,
  getHeaderInvalidFields,
  getRowValidationError,
  validatePurchaseReceipt,
  rowNeedsAkcyza,
};
