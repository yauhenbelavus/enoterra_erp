export type WalutaFaktury = 'EUR' | 'PLN' | 'DKK';

export type WalutaFakturySelection = WalutaFaktury | '';

export const WALUTY_FAKTURY: WalutaFaktury[] = ['EUR', 'PLN', 'DKK'];

export function isWalutaSelected(waluta: WalutaFakturySelection): waluta is WalutaFaktury {
  return waluta === 'EUR' || waluta === 'PLN' || waluta === 'DKK';
}

export function normalizeWalutaFaktury(waluta?: string | null): WalutaFaktury {
  const w = String(waluta || 'EUR').trim().toUpperCase();
  if (w === 'PLN' || w === 'DKK') return w;
  return 'EUR';
}

export function parsePlNumber(value: string | number | undefined | null): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  return parseFloat(String(value ?? '').replace(',', '.')) || 0;
}

export function formatPlMoney(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/** Zaokrąglenie kursu do 2 miejsc po przecinku przy zapisie. */
export function roundKursValue(rate: number, fallback = 1): number {
  if (!Number.isFinite(rate) || rate <= 0) return fallback;
  return Math.round(rate * 100) / 100;
}

export type PlMoneyEditResult = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

function stripLeadingZeros(value: string): string {
  const trimmed = value.replace(/^0+(?=\d)/, '');
  return trimmed === '' ? '0' : trimmed;
}

function joinMoneyParts(whole: string, decimal: string): string {
  return `${stripLeadingZeros(whole)},${decimal}`;
}

function deleteMoneyRange(value: string, selStart: number, selEnd: number): PlMoneyEditResult {
  if (!value || selStart === selEnd) {
    return { value, selectionStart: selStart, selectionEnd: selStart };
  }

  const before = value.slice(0, selStart);
  const after = value.slice(selEnd);
  const merged = `${before}${after}`.replace(/[^\d,]/g, '');

  if (!merged || merged === ',') {
    return { value: '', selectionStart: 0, selectionEnd: 0 };
  }

  if (!merged.includes(',')) {
    const next = `${merged},00`;
    return { value: next, selectionStart: Math.min(selStart, next.length), selectionEnd: Math.min(selStart, next.length) };
  }

  const [wholePart = '0', decimalPart = ''] = merged.split(',');
  const decimal = `${decimalPart}00`.slice(0, 2);
  const next = joinMoneyParts(wholePart, decimal);
  return { value: next, selectionStart: Math.min(selStart, next.length), selectionEnd: Math.min(selStart, next.length) };
}

/** Wstawia cyfrę z zachowaniem pozycji kursora (4,00 + 3 → 4,30). */
export function applyPlMoneyDigit(
  current: string,
  digit: string,
  selStart: number,
  selEnd: number
): PlMoneyEditResult {
  const cleared = deleteMoneyRange(current, selStart, selEnd);
  const value = cleared.value;
  const pos = cleared.selectionStart;

  if (!value) {
    const next = `${digit},00`;
    return { value: next, selectionStart: digit.length, selectionEnd: digit.length };
  }

  const commaIdx = value.indexOf(',');
  const whole = value.slice(0, commaIdx);
  const decimal = value.slice(commaIdx + 1);

  if (pos <= commaIdx) {
    const wholeIdx = Math.max(0, Math.min(pos, whole.length));
    const nextWhole = `${whole.slice(0, wholeIdx)}${digit}${whole.slice(wholeIdx)}`;
    const next = joinMoneyParts(nextWhole, decimal);
    const nextCommaIdx = next.indexOf(',');
    const caret = Math.min(wholeIdx + 1, nextCommaIdx);
    return { value: next, selectionStart: caret, selectionEnd: caret };
  }

  const decPos = pos - commaIdx - 1;

  if (decimal === '00' || decPos <= 0) {
    const next = joinMoneyParts(whole, `${digit}0`);
    return { value: next, selectionStart: commaIdx + 2, selectionEnd: commaIdx + 2 };
  }

  // Druga cyfra: tylko gdy kursor na pozycji placeholdera (X,0) — po wpisaniu blokada do Backspace
  if (decimal[1] === '0' && pos === commaIdx + 2) {
    const next = joinMoneyParts(whole, `${decimal[0]}${digit}`);
    return { value: next, selectionStart: next.length, selectionEnd: next.length };
  }

  return { value, selectionStart: pos, selectionEnd: pos };
}

/** Usuwa znak przed kursorem (Backspace). Przechodzi przez przecinek do części całkowitej. */
export function applyPlMoneyBackspace(current: string, selStart: number, selEnd: number): PlMoneyEditResult {
  if (!current) {
    return { value: '', selectionStart: 0, selectionEnd: 0 };
  }

  if (selStart !== selEnd) {
    return deleteMoneyRange(current, selStart, selEnd);
  }

  if (selStart === 0) {
    return { value: current, selectionStart: 0, selectionEnd: 0 };
  }

  const commaIdx = current.indexOf(',');
  const whole = current.slice(0, commaIdx);
  const decimal = current.slice(commaIdx + 1);

  const deleteLastWholeDigit = (): PlMoneyEditResult => {
    if (!whole) {
      return { value: '', selectionStart: 0, selectionEnd: 0 };
    }
    const nextWhole = whole.slice(0, -1);
    if (!nextWhole) {
      return { value: '', selectionStart: 0, selectionEnd: 0 };
    }
    const next = joinMoneyParts(nextWhole, decimal);
    return { value: next, selectionStart: nextWhole.length, selectionEnd: nextWhole.length };
  };

  // Kursor na końcu — usuwa ostatnią znaczącą cyfrę (grosze → złote)
  if (selStart === current.length) {
    if (decimal[1] !== '0') {
      const next = joinMoneyParts(whole, `${decimal[0]}0`);
      return { value: next, selectionStart: commaIdx + 2, selectionEnd: commaIdx + 2 };
    }
    if (decimal[0] !== '0') {
      const next = joinMoneyParts(whole, '00');
      return { value: next, selectionStart: next.length, selectionEnd: next.length };
    }
    return deleteLastWholeDigit();
  }

  const deletePos = selStart - 1;

  if (deletePos < commaIdx) {
    const nextWhole = `${whole.slice(0, deletePos)}${whole.slice(deletePos + 1)}`;
    if (!nextWhole) {
      return { value: '', selectionStart: 0, selectionEnd: 0 };
    }
    const next = joinMoneyParts(nextWhole, decimal);
    return { value: next, selectionStart: deletePos, selectionEnd: deletePos };
  }

  if (deletePos === commaIdx) {
    if (decimal[0] !== '0') {
      const next = joinMoneyParts(whole, `0${decimal[1]}`);
      return { value: next, selectionStart: commaIdx + 1, selectionEnd: commaIdx + 1 };
    }
    return deleteLastWholeDigit();
  }

  const decIdx = deletePos - commaIdx - 1;

  if (decIdx >= 1) {
    const next = joinMoneyParts(whole, `${decimal[0]}0`);
    return { value: next, selectionStart: commaIdx + 2, selectionEnd: commaIdx + 2 };
  }

  if (decimal[0] !== '0') {
    const next = joinMoneyParts(whole, `0${decimal[1]}`);
    return { value: next, selectionStart: commaIdx + 1, selectionEnd: commaIdx + 1 };
  }

  return deleteLastWholeDigit();
}

/** Usuwa znak za kursorem (Delete). */
export function applyPlMoneyDelete(current: string, selStart: number, selEnd: number): PlMoneyEditResult {
  if (!current) {
    return { value: '', selectionStart: 0, selectionEnd: 0 };
  }

  if (selStart !== selEnd) {
    return deleteMoneyRange(current, selStart, selEnd);
  }

  if (selStart >= current.length) {
    return { value: current, selectionStart: selStart, selectionEnd: selStart };
  }

  return applyPlMoneyBackspace(current, selStart + 1, selStart + 1);
}

/** Normalizuje wklejony tekst do formatu X,DD. */
export function formatPlMoneyPaste(text: string): string {
  const normalized = text.trim().replace(/\s/g, '').replace('.', ',');
  if (!normalized) return '';

  const match = normalized.match(/^(\d+),(\d{0,2})$/);
  if (match) {
    const decimal = `${match[2]}00`.slice(0, 2);
    return joinMoneyParts(match[1], decimal);
  }

  const digits = normalized.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length <= 2) {
    return `${digits},00`;
  }

  const whole = digits.slice(0, -2);
  const decimal = digits.slice(-2);
  return joinMoneyParts(whole, decimal);
}

export function applyPlMoneyPaste(
  current: string,
  pastedText: string,
  selStart: number,
  selEnd: number
): PlMoneyEditResult {
  const pasted = formatPlMoneyPaste(pastedText);
  if (!pasted) {
    return deleteMoneyRange(current, selStart, selEnd);
  }

  const cleared = deleteMoneyRange(current, selStart, selEnd);
  if (!cleared.value) {
    return { value: pasted, selectionStart: pasted.length, selectionEnd: pasted.length };
  }

  const commaIdx = cleared.value.indexOf(',');
  const insertAt = Math.min(cleared.selectionStart, commaIdx >= 0 ? commaIdx : cleared.value.length);
  const before = cleared.value.slice(0, insertAt).replace(/,/g, '');
  const after = cleared.value.slice(insertAt).replace(/,/g, '');
  const merged = `${before}${pasted.replace(/,/g, '')}${after}`;
  const next = formatPlMoneyPaste(merged);
  return { value: next, selectionStart: next.length, selectionEnd: next.length };
}

/** UI reverse rate → DB standard "1 EUR = X waluty" */
export function reverseToStandard(reverseRate: number): number {
  if (!reverseRate || reverseRate <= 0) return 1;
  return roundKursValue(1 / reverseRate);
}

/** DB standard → UI reverse rate for multiplication */
export function standardToReverseDisplay(standardRate: number): number {
  if (!standardRate || standardRate <= 0) return 1;
  return roundKursValue(1 / standardRate);
}

/** Kurs faktury: курс валюты на фактуре → EUR. Активен для PLN и DKK. */
export function isKursFakturyActive(waluta: WalutaFakturySelection): boolean {
  return waluta === 'PLN' || waluta === 'DKK';
}

/** Kurs EUR/PLN: для koszt_wlasny и доставки. Активен для EUR и DKK. */
export function isKursEurPlnActive(waluta: WalutaFakturySelection): boolean {
  return waluta === 'EUR' || waluta === 'DKK';
}

export const KURS_PRIMARY_LABEL = 'Kurs 1';
export const KURS_SECONDARY_LABEL = 'Kurs 2';

/** @deprecated use KURS_PRIMARY_LABEL / KURS_SECONDARY_LABEL */
export const KURS_FIELD_LABEL = KURS_PRIMARY_LABEL;

/** Główne pole Kurs — zawsze po wyborze waluty (kurs faktury lub EUR→PLN). */
export function isPrimaryKursActive(waluta: WalutaFakturySelection): boolean {
  return isWalutaSelected(waluta);
}

/** Drugie pole Kurs — tylko gdy po konwersji na EUR trzeba jeszcze EUR→PLN (DKK). */
export function isSecondaryKursActive(waluta: WalutaFakturySelection): boolean {
  return waluta === 'DKK';
}

export function usesPrimaryKursFakturyState(waluta: WalutaFakturySelection): boolean {
  return isKursFakturyActive(waluta);
}

export function getPrimaryKursSuffix(waluta: WalutaFakturySelection): string {
  if (waluta === 'EUR' || waluta === 'PLN') return 'PLN/EUR';
  if (waluta === 'DKK') return 'DKK/EUR';
  return '';
}

export function getSecondaryKursSuffix(): string {
  return 'PLN/EUR';
}

export function getPrimaryKursLabel(waluta: WalutaFakturySelection): string {
  const ratio = getPrimaryKursSuffix(waluta);
  return ratio ? `${KURS_PRIMARY_LABEL} ${ratio}` : KURS_PRIMARY_LABEL;
}

export function getSecondaryKursLabel(waluta: WalutaFakturySelection): string {
  if (!isSecondaryKursActive(waluta)) return KURS_SECONDARY_LABEL;
  return `${KURS_SECONDARY_LABEL} ${getSecondaryKursSuffix()}`;
}

/** Czy wartość kursu w polu formularza jest wypełniona i > 0. */
export function isKursValueFilled(value: string | number | null | undefined): boolean {
  if (value == null) return false;
  const raw = String(value).trim();
  if (!raw || raw === ',' || raw === '.') return false;
  const n = parsePlNumber(raw);
  return Number.isFinite(n) && n > 0;
}

/**
 * Walidacja obowiązkowych kursów przy tworzeniu/edycji przyjęcia.
 * EUR → Kurs 1 PLN/EUR; PLN → Kurs 1 PLN/EUR; DKK → Kurs 1 DKK/EUR + Kurs 2 PLN/EUR.
 */
export function validateRequiredKurs(
  waluta: WalutaFakturySelection,
  kursEurPlnDisplay: string,
  kursFakturyDisplay: string
): string | null {
  if (!isWalutaSelected(waluta)) {
    return 'Wybierz walutę faktury';
  }

  if (waluta === 'EUR') {
    if (!isKursValueFilled(kursEurPlnDisplay)) {
      return 'Wprowadź kurs PLN/EUR';
    }
    return null;
  }

  if (waluta === 'PLN') {
    if (!isKursValueFilled(kursFakturyDisplay)) {
      return 'Wprowadź kurs PLN/EUR';
    }
    return null;
  }

  // DKK
  if (!isKursValueFilled(kursFakturyDisplay)) {
    return 'Wprowadź kurs DKK/EUR';
  }
  if (!isKursValueFilled(kursEurPlnDisplay)) {
    return 'Wprowadź kurs PLN/EUR';
  }
  return null;
}

/** @deprecated use getPrimaryKursSuffix / getSecondaryKursSuffix */
export function getKursFakturySuffix(waluta: WalutaFakturySelection): string {
  if (waluta === 'PLN') return 'PLN/EUR';
  if (waluta === 'DKK') return 'DKK/EUR';
  return '';
}

/** @deprecated use getSecondaryKursSuffix */
export function getKursEurPlnSuffix(): string {
  return 'PLN/EUR';
}

/** PLN: PLN/EUR (np. 4,30). DKK: DKK/EUR (np. 7,45). W DB: 1 EUR = X waluty. */
export function toStandardKursFaktury(waluta: WalutaFakturySelection, displayValue: string): number {
  if (!isKursFakturyActive(waluta)) return 1;
  const n = parsePlNumber(displayValue);
  return roundKursValue(n);
}

/** Kurs EUR/PLN → standard "1 EUR = X zł" */
export function toStandardKursEurPln(waluta: WalutaFakturySelection, displayValue: string): number {
  if (!isKursEurPlnActive(waluta)) return 1;
  const n = parsePlNumber(displayValue);
  return roundKursValue(n);
}

/** Для пересчёта доставки € → zł/бутылку */
export function getKursEurPlnForDelivery(
  waluta: WalutaFakturySelection,
  kursEurPlnDisplay: string,
  kursFakturyDisplay: string
): number {
  if (!isWalutaSelected(waluta)) return 1;
  if (waluta === 'PLN') return toStandardKursFaktury('PLN', kursFakturyDisplay);
  return toStandardKursEurPln(waluta, kursEurPlnDisplay);
}

export function formatKursFakturyForDisplay(waluta: WalutaFaktury, standardRate: number): string {
  if (!isKursFakturyActive(waluta) || !standardRate || standardRate <= 0 || standardRate === 1) {
    return '';
  }
  return formatPlMoney(standardRate);
}

export function formatKursEurPlnForDisplay(standardRate: number): string {
  if (!standardRate || standardRate <= 0) return '1,00';
  return formatPlMoney(standardRate);
}

/** PLN/EUR do wyświetlenia w formularzu (tworzenie i edycja). */
export function formatKursPlnEurForDisplay(standardRate: number): string {
  if (!standardRate || standardRate <= 0 || standardRate === 1) return '';
  return formatPlMoney(standardRate);
}

/** Przy edycji przyjęcia PLN: kurs w standardzie 1 EUR = X PLN. */
export function resolveKursPlnEurStandard(kursFaktury: number, kursEurPln: number): number {
  if (Number.isFinite(kursFaktury) && kursFaktury > 1) return kursFaktury;
  if (Number.isFinite(kursEurPln) && kursEurPln > 1) return kursEurPln;
  // Starsze wpisy: wartość < 1 mogła być zapisana jako EUR/PLN
  if (Number.isFinite(kursFaktury) && kursFaktury > 0 && kursFaktury < 1) {
    return reverseToStandard(kursFaktury);
  }
  return 1;
}

/** @deprecated use toStandardKursEurPln */
export function toStandardAktualnyKurs(waluta: WalutaFaktury, displayValue: string): number {
  return toStandardKursEurPln(waluta, displayValue);
}

export function getWalutaSymbol(waluta: WalutaFakturySelection): string {
  if (!isWalutaSelected(waluta)) return '';
  switch (waluta) {
    case 'PLN':
      return 'zł';
    case 'DKK':
      return 'kr';
    default:
      return '€';
  }
}

export function getCenaColumnLabel(waluta: WalutaFakturySelection): string {
  if (!isWalutaSelected(waluta)) return 'Cena';
  return `Cena (${getWalutaSymbol(waluta)})`;
}

/** @deprecated use formatKursEurPlnForDisplay / formatKursFakturyForDisplay */
export function formatKursForDisplay(waluta: WalutaFaktury, standardRate: number): string {
  if (waluta === 'PLN') return formatKursFakturyForDisplay('PLN', standardRate);
  return formatKursEurPlnForDisplay(standardRate);
}
