import { MutableRefObject } from 'react';
import { API_URL } from '../config';

const INVOICE_OPEN_DELAY_MS = 250;

export const receiptInvoiceUrl = (filename: string): string => {
  const raw = String(filename || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('blob:')) return raw;

  const withoutLeading = raw.replace(/^\/+/, '');
  const name = withoutLeading.replace(/^uploads\//i, '');
  return `${API_URL}/uploads/${name}`;
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
