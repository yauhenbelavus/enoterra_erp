import { extractDateFromOrderNumber } from './tableSort';

// Единый источник расчёта "возраста на складе" (вкладка "Analiza magazynu"
// и Excel-рапорт из "Stany magazynowy" должны показывать идентичные значения).

export interface StorageAgeProductBatch {
  id: number;
  kod: string;
  created_at?: string | null;
}

export interface StorageAgeWorkingSheet {
  kod: string;
  ilosc?: number;
}

export interface StorageAgeConsumption {
  batch_id: number;
  numer_zamowienia?: string;
  data_utworzenia?: string;
  created_at?: string;
}

export interface StorageAgeOrderWithProducts {
  typ?: string;
  numer_zamowienia?: string;
  data_utworzenia?: string;
  products?: Array<{ kod?: string; created_at?: string }>;
}

export interface StorageAgeReceipt {
  id?: number;
  data_przyjecia: string;
  products?: Array<{ kod?: string }>;
}

export interface StorageAgeRow {
  data_przyjecia: string | null;
  dataOstatniegoWydania: string | null;
  dni: number;
}

export interface StorageAgeInputs {
  productBatches: StorageAgeProductBatch[];
  workingSheets: StorageAgeWorkingSheet[];
  consumptions: StorageAgeConsumption[];
  ordersWithProducts: StorageAgeOrderWithProducts[];
  productReceipts: StorageAgeReceipt[];
}

const ISSUE_SKIP_ORDER_TYPES = new Set(['zwrot', 'przychod', 'przesuniecie']);

export const parseLocalDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const dateOnly = String(value).slice(0, 10);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (isoMatch) {
    const date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const startOfToday = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const daysOnWarehouseEndDate = (remaining: number, lastIssueDate: Date | null): Date => {
  const today = startOfToday();
  if (remaining > 0 || !lastIssueDate) return today;
  const issueDay = new Date(
    lastIssueDate.getFullYear(),
    lastIssueDate.getMonth(),
    lastIssueDate.getDate()
  );
  return issueDay > today ? today : issueDay;
};

const laterDate = (a: Date | null, b: Date | null): Date | null => {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
};

const daysBetween = (fromValue?: string | null, toValue?: string | Date | null): number => {
  const from = parseLocalDate(fromValue);
  if (!from) return 0;
  const to = toValue instanceof Date ? toValue : parseLocalDate(toValue) || new Date();
  const fromTime = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const toTime = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.max(0, Math.round((toTime - fromTime) / 86400000));
};

export const formatDate = (value?: string | null): string => {
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString('pl-PL') : '-';
};

const getKodIssueDate = (
  numerZamowienia?: string,
  dataUtworzenia?: string,
  createdAt?: string
): Date | null => {
  if (numerZamowienia) {
    const fromNumber = extractDateFromOrderNumber(numerZamowienia);
    if (fromNumber) return fromNumber;
  }
  return parseLocalDate(dataUtworzenia) || parseLocalDate(createdAt);
};

/**
 * Считает по каждому коду товара: дату приёмки, дату последнего выдания и
 * количество дней на складе. Логика полностью совпадает с вкладкой "Analiza magazynu".
 */
export function computeStorageAgeByKod(inputs: StorageAgeInputs): Map<string, StorageAgeRow> {
  const { productBatches, workingSheets, consumptions, ordersWithProducts, productReceipts } = inputs;

  const lastIssueByBatch = new Map<number, Date>();
  for (const consumption of consumptions) {
    const issueDate = getKodIssueDate(
      consumption.numer_zamowienia,
      consumption.data_utworzenia,
      consumption.created_at
    );
    if (!issueDate || consumption.batch_id == null) continue;
    const previous = lastIssueByBatch.get(consumption.batch_id);
    if (!previous || issueDate > previous) {
      lastIssueByBatch.set(consumption.batch_id, issueDate);
    }
  }

  const lastSaleByKod = new Map<string, Date>();
  for (const order of ordersWithProducts) {
    if (ISSUE_SKIP_ORDER_TYPES.has(order.typ || '')) continue;
    for (const product of order.products || []) {
      if (!product.kod) continue;
      const saleDate = getKodIssueDate(order.numer_zamowienia, order.data_utworzenia, product.created_at);
      if (!saleDate) continue;
      const previous = lastSaleByKod.get(product.kod);
      if (!previous || saleDate > previous) {
        lastSaleByKod.set(product.kod, saleDate);
      }
    }
  }

  const lastIssueByKod = new Map<string, Date>();
  const newestBatchDateByKod = new Map<string, string>();
  for (const product of productBatches) {
    if (!product.kod) continue;
    const previousIssue = lastIssueByKod.get(product.kod) || null;
    const batchIssue = laterDate(previousIssue, lastIssueByBatch.get(product.id) || null);
    if (batchIssue) lastIssueByKod.set(product.kod, batchIssue);
    if (product.created_at) {
      const previous = newestBatchDateByKod.get(product.kod);
      const currentDate = parseLocalDate(product.created_at);
      const previousDate = parseLocalDate(previous);
      if (currentDate && (!previousDate || currentDate > previousDate)) {
        newestBatchDateByKod.set(product.kod, product.created_at);
      }
    }
  }

  const newestReceiptByKod = new Map<string, { data_przyjecia: string; date: Date; id: number }>();
  for (const receipt of productReceipts) {
    const receiptDate = parseLocalDate(receipt.data_przyjecia);
    if (!receiptDate) continue;
    const receiptId = receipt.id || 0;
    for (const item of receipt.products || []) {
      if (!item.kod) continue;
      const previous = newestReceiptByKod.get(item.kod);
      if (
        !previous ||
        receiptDate > previous.date ||
        (receiptDate.getTime() === previous.date.getTime() && receiptId > previous.id)
      ) {
        newestReceiptByKod.set(item.kod, {
          data_przyjecia: receipt.data_przyjecia,
          date: receiptDate,
          id: receiptId,
        });
      }
    }
  }

  const result = new Map<string, StorageAgeRow>();
  for (const sheet of workingSheets) {
    if (!sheet.kod) continue;
    const remaining = Number(sheet.ilosc) || 0;
    const data_przyjecia =
      newestReceiptByKod.get(sheet.kod)?.data_przyjecia || newestBatchDateByKod.get(sheet.kod) || null;
    const lastIssueDate =
      lastIssueByKod.get(sheet.kod) || lastSaleByKod.get(sheet.kod) || null;
    const dataOstatniegoWydania = lastIssueDate ? toDateKey(lastIssueDate) : null;
    const dni = daysBetween(data_przyjecia, daysOnWarehouseEndDate(remaining, lastIssueDate));
    result.set(sheet.kod, { data_przyjecia, dataOstatniegoWydania, dni });
  }

  return result;
}
