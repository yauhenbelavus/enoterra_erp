'use strict';

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isKursValueFilled(value) {
  if (value == null) return false;
  const raw = String(value).trim();
  if (!raw || raw === ',' || raw === '.') return false;
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) && n > 0;
}

/**
 * @param {unknown} waluta
 * @returns {boolean}
 */
function needsKursToPln(waluta) {
  const w = String(waluta || '').trim().toUpperCase();
  return w === 'EUR' || w === 'DKK';
}

/**
 * Server-side required-kurs check. Empty waluta is treated as EUR
 * (same as normalizeWalutaFaktury on the API).
 * @param {unknown} waluta
 * @param {unknown} aktualnyKurs
 * @param {unknown} kursFaktury
 * @returns {string | null}
 */
function validateRequiredKurs(waluta, aktualnyKurs, kursFaktury) {
  const normalized = String(waluta == null ? 'EUR' : waluta).trim().toUpperCase() || 'EUR';
  if (normalized === 'EUR') {
    if (!isKursValueFilled(aktualnyKurs)) return 'Wprowadź kurs PLN/EUR';
    return null;
  }
  if (normalized === 'PLN') {
    if (!isKursValueFilled(kursFaktury)) return 'Wprowadź kurs PLN/EUR';
    return null;
  }
  if (normalized === 'DKK') {
    if (!isKursValueFilled(kursFaktury)) return 'Wprowadź kurs DKK/EUR';
    if (!isKursValueFilled(aktualnyKurs)) return 'Wprowadź kurs PLN/EUR';
    return null;
  }
  return 'Wybierz walutę faktury';
}

export {
  isKursValueFilled,
  needsKursToPln,
  validateRequiredKurs,
};
