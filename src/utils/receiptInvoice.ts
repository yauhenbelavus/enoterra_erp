import { MutableRefObject, MouseEvent as ReactMouseEvent } from 'react';
import { API_URL } from '../config';

const INVOICE_OPEN_DELAY_MS = 250;
const INVOICE_DOUBLE_CLICK_MS = 500;

export const receiptInvoiceUrl = (filename: string): string => {
  const raw = String(filename || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('blob:')) return raw;

  const withoutLeading = raw.replace(/^\/+/, '');
  const name = withoutLeading.replace(/^uploads\//i, '');
  return `${API_URL}/uploads/${name}`;
};

export const isPdfFile = (file: File | null | undefined): boolean => {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  if (type === 'application/pdf' || type === 'application/x-pdf') return true;
  return file.name.toLowerCase().endsWith('.pdf');
};

export const pickInvoiceFile = (input: HTMLInputElement | null) => {
  if (!input) return;
  input.value = '';
  input.click();
};

export const cancelScheduledInvoiceOpen = (
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  previewRef: MutableRefObject<Window | null>,
) => {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
  const preview = previewRef.current;
  if (preview && !preview.closed) preview.close();
  previewRef.current = null;
};

export const scheduleInvoiceOpen = (
  url: string,
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  previewRef: MutableRefObject<Window | null>,
) => {
  if (!url) return;
  cancelScheduledInvoiceOpen(timerRef, previewRef);
  const preview = window.open('about:blank', '_blank');
  previewRef.current = preview;
  timerRef.current = setTimeout(() => {
    timerRef.current = null;
    if (preview && !preview.closed) {
      preview.location.replace(url);
      try {
        preview.opener = null;
      } catch {
        /* ignore */
      }
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    previewRef.current = null;
  }, INVOICE_OPEN_DELAY_MS);
};

export type InvoiceButtonRefs = {
  file: File | null;
  existing?: string | null;
  input: HTMLInputElement | null;
  debounceRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  previewRef: MutableRefObject<Window | null>;
  lastClickRef: MutableRefObject<number>;
  replaceLockRef: MutableRefObject<boolean>;
};

const clearInvoiceDebounce = (debounceRef: InvoiceButtonRefs['debounceRef']) => {
  if (debounceRef.current) {
    clearTimeout(debounceRef.current);
    debounceRef.current = null;
  }
};

const openOrPickInvoice = (refs: InvoiceButtonRefs) => {
  const { file, existing, input, timerRef, previewRef } = refs;
  if (!file && !existing) {
    pickInvoiceFile(input);
    return;
  }
  const url = file ? URL.createObjectURL(file) : receiptInvoiceUrl(existing || '');
  scheduleInvoiceOpen(url, timerRef, previewRef);
};

const replaceInvoiceFile = (refs: InvoiceButtonRefs) => {
  refs.replaceLockRef.current = true;
  refs.lastClickRef.current = 0;
  clearInvoiceDebounce(refs.debounceRef);
  cancelScheduledInvoiceOpen(refs.timerRef, refs.previewRef);
  pickInvoiceFile(refs.input);
};

export const handleReceiptInvoiceButtonClick = (
  event: ReactMouseEvent<HTMLButtonElement>,
  refs: InvoiceButtonRefs,
) => {
  if (!refs.file && !refs.existing) {
    const now = Date.now();
    const isPairedClick =
      refs.lastClickRef.current > 0 && now - refs.lastClickRef.current < INVOICE_DOUBLE_CLICK_MS;
    if (event.detail >= 2 || isPairedClick) return;
    refs.lastClickRef.current = now;
    refs.replaceLockRef.current = false;
    clearInvoiceDebounce(refs.debounceRef);
    pickInvoiceFile(refs.input);
    return;
  }

  const now = Date.now();
  const isPairedClick =
    refs.lastClickRef.current > 0 && now - refs.lastClickRef.current < INVOICE_DOUBLE_CLICK_MS;
  const wantsReplace =
    event.shiftKey || event.altKey || event.metaKey || event.ctrlKey || event.detail >= 2 || isPairedClick;

  if (wantsReplace) {
    replaceInvoiceFile(refs);
    return;
  }

  refs.replaceLockRef.current = false;
  refs.lastClickRef.current = now;
  clearInvoiceDebounce(refs.debounceRef);
  refs.debounceRef.current = setTimeout(() => {
    refs.debounceRef.current = null;
    refs.lastClickRef.current = 0;
    openOrPickInvoice(refs);
  }, INVOICE_DOUBLE_CLICK_MS);
};

export const handleReceiptInvoiceButtonDoubleClick = (
  event: ReactMouseEvent<HTMLButtonElement>,
  refs: InvoiceButtonRefs,
) => {
  event.preventDefault();
  if (!refs.file && !refs.existing) return;
  if (refs.replaceLockRef.current) {
    refs.replaceLockRef.current = false;
    return;
  }
  replaceInvoiceFile(refs);
};

export const INVOICE_FILE_BUTTON_TITLE_HAS_FILE =
  'Kliknij, aby otworzyć. Kliknij dwukrotnie lub Shift+klik, aby zamienić.';
export const INVOICE_FILE_BUTTON_TITLE_EMPTY = 'Dodaj fakturę PDF';
