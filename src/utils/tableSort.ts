import { useState, useMemo, useCallback, type Dispatch, type SetStateAction } from 'react';

export type SortDirection = 'asc' | 'desc';
export type SortValue = string | number | Date | null | undefined;

export function compareSortValues(
  a: SortValue,
  b: SortValue,
  direction: SortDirection
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  let cmp = 0;
  if (typeof a === 'number' && typeof b === 'number') {
    cmp = a - b;
  } else if (a instanceof Date && b instanceof Date) {
    cmp = a.getTime() - b.getTime();
  } else {
    cmp = String(a).localeCompare(String(b), 'pl', { numeric: true, sensitivity: 'base' });
  }

  return direction === 'asc' ? cmp : -cmp;
}

export function lowerCase(value: unknown): string {
  return String(value ?? '').toLowerCase();
}

export function parseSortDate(value: unknown): Date {
  if (!value) return new Date(0);
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

export function extractDateFromOrderNumber(orderNumber: string): Date | null {
  try {
    const datePattern = /(\d{1,2})_(\d{1,2})_(\d{4})$/;
    const match = orderNumber.match(datePattern);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      const date = new Date(year, month, day);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return null;
  } catch {
    return null;
  }
}

export function compareOrders<
  T extends {
    numer_zamowienia?: string;
    klient?: string;
    laczna_ilosc?: number;
    data_utworzenia?: string;
    typ?: string;
  }
>(a: T, b: T, field: string, direction: SortDirection): number {
  if (field === 'numer_zamowienia') {
    const aDate = extractDateFromOrderNumber(a.numer_zamowienia || '');
    const bDate = extractDateFromOrderNumber(b.numer_zamowienia || '');
    const aTime = aDate ? aDate.getTime() : null;
    const bTime = bDate ? bDate.getTime() : null;

    if (aTime != null && bTime != null) {
      const byDate = direction === 'asc' ? aTime - bTime : bTime - aTime;
      if (byDate !== 0) return byDate;
    } else if (aTime != null && bTime == null) {
      return direction === 'desc' ? -1 : 1;
    } else if (aTime == null && bTime != null) {
      return direction === 'desc' ? 1 : -1;
    }

    const byNum = (a.numer_zamowienia || '').localeCompare(b.numer_zamowienia || '', undefined, {
      numeric: true,
    });
    return direction === 'asc' ? byNum : -byNum;
  }

  switch (field) {
    case 'klient':
      return compareSortValues(lowerCase(a.klient), lowerCase(b.klient), direction);
    case 'laczna_ilosc':
      return compareSortValues(a.laczna_ilosc ?? 0, b.laczna_ilosc ?? 0, direction);
    case 'data_utworzenia':
      return compareSortValues(parseSortDate(a.data_utworzenia), parseSortDate(b.data_utworzenia), direction);
    default:
      return compareSortValues(String((a as Record<string, unknown>)[field] ?? ''), String((b as Record<string, unknown>)[field] ?? ''), direction);
  }
}

export function compareInvoices<
  T extends {
    numer_faktury?: string;
    data_faktury?: string;
    termin_platnosci?: string | null;
    klient_nazwa?: string;
    suma_netto?: number;
    suma_brutto?: number;
  }
>(a: T, b: T, field: string, direction: SortDirection): number {
  switch (field) {
    case 'numer_faktury': {
      const aMatch = (a.numer_faktury || '').match(/(\d+)/);
      const bMatch = (b.numer_faktury || '').match(/(\d+)/);
      return compareSortValues(
        aMatch ? parseInt(aMatch[1], 10) : 0,
        bMatch ? parseInt(bMatch[1], 10) : 0,
        direction
      );
    }
    case 'data_faktury':
    case 'termin_platnosci':
      return compareSortValues(
        parseSortDate(a[field as keyof T]),
        parseSortDate(b[field as keyof T]),
        direction
      );
    case 'klient_nazwa':
      return compareSortValues(lowerCase(a.klient_nazwa), lowerCase(b.klient_nazwa), direction);
    case 'suma_netto':
    case 'suma_brutto':
      return compareSortValues(Number(a[field as keyof T] ?? 0), Number(b[field as keyof T] ?? 0), direction);
    default:
      return compareSortValues(
        String((a as Record<string, unknown>)[field] ?? ''),
        String((b as Record<string, unknown>)[field] ?? ''),
        direction
      );
  }
}

export function compareClients<
  T extends {
    firma?: string;
    nazwa?: string;
    adres?: string;
    czas_dostawy?: string;
    kontakt?: string;
  }
>(a: T, b: T, field: string, direction: SortDirection): number {
  switch (field) {
    case 'firma':
      return compareSortValues(lowerCase(a.firma), lowerCase(b.firma), direction);
    case 'nazwa':
      return compareSortValues(lowerCase(a.nazwa), lowerCase(b.nazwa), direction);
    case 'adres':
      return compareSortValues(lowerCase(a.adres), lowerCase(b.adres), direction);
    case 'czas_dostawy':
      return compareSortValues(lowerCase(a.czas_dostawy), lowerCase(b.czas_dostawy), direction);
    case 'kontakt':
      return compareSortValues(lowerCase(a.kontakt), lowerCase(b.kontakt), direction);
    default:
      return compareSortValues(
        String((a as Record<string, unknown>)[field] ?? ''),
        String((b as Record<string, unknown>)[field] ?? ''),
        direction
      );
  }
}

export function compareKomisClients<
  T extends { klient?: string; total_ilosc?: number; products: unknown[] }
>(a: T, b: T, field: string, direction: SortDirection): number {
  switch (field) {
    case 'klient':
      return compareSortValues(lowerCase(a.klient), lowerCase(b.klient), direction);
    case 'total_ilosc':
      return compareSortValues(a.total_ilosc ?? 0, b.total_ilosc ?? 0, direction);
    case 'products_count':
      return compareSortValues(a.products.length, b.products.length, direction);
    default:
      return compareSortValues(
        String((a as Record<string, unknown>)[field] ?? ''),
        String((b as Record<string, unknown>)[field] ?? ''),
        direction
      );
  }
}

export function compareClientSales<
  T extends { klient?: string; butelki?: number; sumNetto?: number; sumBrutto?: number }
>(a: T, b: T, field: string, direction: SortDirection): number {
  switch (field) {
    case 'klient':
      return compareSortValues(lowerCase(a.klient), lowerCase(b.klient), direction);
    case 'butelki':
      return compareSortValues(a.butelki ?? 0, b.butelki ?? 0, direction);
    case 'sumNetto':
      return compareSortValues(a.sumNetto ?? 0, b.sumNetto ?? 0, direction);
    case 'sumBrutto':
      return compareSortValues(a.sumBrutto ?? 0, b.sumBrutto ?? 0, direction);
    default:
      return compareSortValues(a.sumBrutto ?? 0, b.sumBrutto ?? 0, direction);
  }
}

export function compareReceipts<T extends { dataPrzyjecia?: string; sprzedawca?: string; kosztDostawy?: number }>(
  a: T,
  b: T,
  field: string,
  direction: SortDirection,
  getDisplayWartosc: (item: T) => number
): number {
  switch (field) {
    case 'dataPrzyjecia':
      return compareSortValues(parseSortDate(a.dataPrzyjecia), parseSortDate(b.dataPrzyjecia), direction);
    case 'sprzedawca':
      return compareSortValues(lowerCase(a.sprzedawca), lowerCase(b.sprzedawca), direction);
    case 'wartosc':
      return compareSortValues(getDisplayWartosc(a), getDisplayWartosc(b), direction);
    case 'kosztDostawy':
      return compareSortValues(a.kosztDostawy ?? 0, b.kosztDostawy ?? 0, direction);
    default:
      return compareSortValues(
        String((a as Record<string, unknown>)[field] ?? ''),
        String((b as Record<string, unknown>)[field] ?? ''),
        direction
      );
  }
}

export function compareReservations<
  T extends {
    numer_rezerwacji?: string;
    klient?: string;
    status?: string;
    laczna_ilosc?: number;
    data_utworzenia?: string;
    data_zakonczenia?: string;
  }
>(a: T, b: T, field: string, direction: SortDirection): number {
  switch (field) {
    case 'numer_rezerwacji':
      return compareSortValues(lowerCase(a.numer_rezerwacji), lowerCase(b.numer_rezerwacji), direction);
    case 'klient':
      return compareSortValues(lowerCase(a.klient), lowerCase(b.klient), direction);
    case 'status':
      return compareSortValues(lowerCase(a.status), lowerCase(b.status), direction);
    case 'laczna_ilosc':
      return compareSortValues(a.laczna_ilosc ?? 0, b.laczna_ilosc ?? 0, direction);
    case 'data_utworzenia':
      return compareSortValues(parseSortDate(a.data_utworzenia), parseSortDate(b.data_utworzenia), direction);
    case 'data_zakonczenia':
      return compareSortValues(parseSortDate(a.data_zakonczenia), parseSortDate(b.data_zakonczenia), direction);
    default:
      return compareSortValues(
        String((a as Record<string, unknown>)[field] ?? ''),
        String((b as Record<string, unknown>)[field] ?? ''),
        direction
      );
  }
}

export function compareAnalizaWydanProducts<
  T extends { kod?: string; nazwa?: string; ilosc?: number }
>(a: T, b: T, field: string, direction: SortDirection): number {
  switch (field) {
    case 'kod':
      return compareSortValues(lowerCase(a.kod), lowerCase(b.kod), direction);
    case 'nazwa':
      return compareSortValues(lowerCase(a.nazwa), lowerCase(b.nazwa), direction);
    case 'ilosc':
      return compareSortValues(a.ilosc ?? 0, b.ilosc ?? 0, direction);
    default:
      return compareSortValues(lowerCase(a.nazwa), lowerCase(b.nazwa), direction);
  }
}

export function compareAnalysisProducts<
  T extends { ilosc?: number; ilosc_wydane?: number; product_kod?: string; product_nazwa?: string }
>(a: T, b: T, field: string, direction: SortDirection): number {
  const iloscA = a.ilosc ?? 0;
  const iloscWydaneA = a.ilosc_wydane ?? 0;
  const iloscB = b.ilosc ?? 0;
  const iloscWydaneB = b.ilosc_wydane ?? 0;

  switch (field) {
    case 'kod':
      return compareSortValues(a.product_kod ?? '', b.product_kod ?? '', direction);
    case 'nazwa':
      return compareSortValues(a.product_nazwa ?? '', b.product_nazwa ?? '', direction);
    case 'pozostalo':
      return compareSortValues(iloscA - iloscWydaneA, iloscB - iloscWydaneB, direction);
    case 'wydane':
      return compareSortValues(iloscWydaneA, iloscWydaneB, direction);
    case 'zarezerwowane':
      return compareSortValues(iloscA, iloscB, direction);
    default:
      return compareSortValues(a.product_nazwa ?? '', b.product_nazwa ?? '', direction);
  }
}

export interface InventorySortContext<TItem> {
  sprzedawcaCache: Map<string, string>;
  orderProducts: Array<{ kod: string }>;
  getDisplayAverage: (item: TItem) => number;
  getDisplayDaysLeft: (item: TItem) => number | string;
  getDisplayDepletionDate: (item: TItem) => string;
  getInventoryStatus: (item: TItem) => string;
  getReservationsCount: (item: TItem) => number;
}

export function compareInventoryItems<TItem extends {
  kod: string;
  sprzedawca?: string;
  cena?: number;
  cena_sprzedazy?: number;
  koszt_wlasny?: number;
  typ?: string;
  objetosc?: number;
  data_waznosci?: string | number | null;
  ilosc?: number;
}>(
  a: TItem,
  b: TItem,
  field: string,
  direction: SortDirection,
  ctx: InventorySortContext<TItem>
): number {
  const parseDisplayDate = (value: string) => {
    if (!value || value === '-') return 0;
    const parts = value.split('.');
    if (parts.length === 3) {
      return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
    }
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const normalizeExpiryDate = (dateValue: string | number | null | undefined): number => {
    if (!dateValue) return 0;
    let date: Date;
    if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else if (typeof dateValue === 'number') {
      date = dateValue < 1000000000000 ? new Date(dateValue * 1000) : new Date(dateValue);
    } else {
      return 0;
    }
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  };

  const getStatusRank = (item: TItem) => {
    const status = ctx.getInventoryStatus(item);
    if (status === 'brak') return 0;
    if (status === 'Brak sprzedaży') return 4;
    if (status === 'mało') return 1;
    if (status === 'średnie') return 2;
    return 3;
  };

  switch (field) {
    case 'sprzedawca':
      return compareSortValues(
        a.sprzedawca || ctx.sprzedawcaCache.get(a.kod) || '',
        b.sprzedawca || ctx.sprzedawcaCache.get(b.kod) || '',
        direction
      );
    case 'cena':
      return compareSortValues(a.cena ?? 0, b.cena ?? 0, direction);
    case 'cena_sprzedazy':
      return compareSortValues(a.cena_sprzedazy ?? 0, b.cena_sprzedazy ?? 0, direction);
    case 'koszt_wlasny':
      return compareSortValues(a.koszt_wlasny ?? 0, b.koszt_wlasny ?? 0, direction);
    case 'srednieZuzycie':
      return compareSortValues(ctx.getDisplayAverage(a), ctx.getDisplayAverage(b), direction);
    case 'dniPozostalo': {
      const aDays = ctx.getDisplayDaysLeft(a);
      const bDays = ctx.getDisplayDaysLeft(b);
      return compareSortValues(
        aDays === '-' ? Infinity : aDays,
        bDays === '-' ? Infinity : bDays,
        direction
      );
    }
    case 'dataWyczerpania':
      return compareSortValues(
        parseDisplayDate(ctx.getDisplayDepletionDate(a)),
        parseDisplayDate(ctx.getDisplayDepletionDate(b)),
        direction
      );
    case 'status':
      return compareSortValues(getStatusRank(a), getStatusRank(b), direction);
    case 'typ':
      return compareSortValues(a.typ ?? '', b.typ ?? '', direction);
    case 'rezerwacje':
      return compareSortValues(ctx.getReservationsCount(a), ctx.getReservationsCount(b), direction);
    case 'objetosc':
      return compareSortValues(a.objetosc ?? 0, b.objetosc ?? 0, direction);
    case 'dataWaznosci':
      return compareSortValues(normalizeExpiryDate(a.data_waznosci), normalizeExpiryDate(b.data_waznosci), direction);
    case 'sprzedaze': {
      const aSales = ctx.orderProducts.filter((p) => p.kod === a.kod).length;
      const bSales = ctx.orderProducts.filter((p) => p.kod === b.kod).length;
      return compareSortValues(aSales, bSales, direction);
    }
    default:
      return compareSortValues(
        (a as Record<string, unknown>)[field] as SortValue,
        (b as Record<string, unknown>)[field] as SortValue,
        direction
      );
  }
}

export function getOrderProductSortValue(
  product: { kod?: string; nazwa?: string; kod_kreskowy?: string; ilosc?: number; typ?: string },
  field: string
): SortValue {
  switch (field) {
    case 'kod':
      return product.kod ?? '';
    case 'nazwa':
      return product.nazwa ?? '';
    case 'kod_kreskowy':
      return product.kod_kreskowy || '';
    case 'ilosc':
      return product.ilosc ?? 0;
    case 'typ':
      return product.typ || '';
    default:
      return '';
  }
}

export function getInvoiceProductSortValue(
  product: {
    kod?: string;
    nazwa?: string;
    ilosc?: number;
    cena_netto?: number;
    rabat?: number;
    vat_stawka?: number;
    wartosc_netto?: number;
    wartosc_brutto?: number;
  },
  field: string
): SortValue {
  switch (field) {
    case 'kod':
      return product.kod ?? '';
    case 'nazwa':
      return product.nazwa ?? '';
    case 'ilosc':
      return product.ilosc ?? 0;
    case 'cena_netto':
      return product.cena_netto ?? 0;
    case 'rabat':
      return product.rabat ?? 0;
    case 'vat_stawka':
      return product.vat_stawka ?? 0;
    case 'wartosc_netto':
      return product.wartosc_netto ?? 0;
    case 'wartosc_brutto':
      return product.wartosc_brutto ?? 0;
    default:
      return '';
  }
}

export function getReceiptProductSortValue(
  product: {
    kod?: string;
    nazwa?: string;
    kod_kreskowy?: string;
    ilosc?: number;
    cena?: number;
    typ?: string;
    objetosc?: number;
    dataWaznosci?: string | number;
  },
  field: string
): SortValue {
  switch (field) {
    case 'kod':
      return product.kod ?? '';
    case 'nazwa':
      return product.nazwa ?? '';
    case 'kod_kreskowy':
      return product.kod_kreskowy || '';
    case 'ilosc':
      return product.ilosc ?? 0;
    case 'cena':
      return product.cena ?? 0;
    case 'wartosc':
      return (product.ilosc ?? 0) * (product.cena ?? 0);
    case 'typ':
      return product.typ || '';
    case 'objetosc':
      return product.objetosc ?? 0;
    case 'dataWaznosci':
      if (!product.dataWaznosci) return '';
      return typeof product.dataWaznosci === 'number'
        ? product.dataWaznosci
        : new Date(product.dataWaznosci).getTime();
    default:
      return '';
  }
}

export function getKomisProductSortValue(
  product: { kod?: string; nazwa?: string; ilosc?: number },
  field: string
): SortValue {
  switch (field) {
    case 'kod':
      return product.kod ?? '';
    case 'nazwa':
      return product.nazwa ?? '';
    case 'ilosc':
      return product.ilosc ?? 0;
    default:
      return '';
  }
}

export function getReservationProductSortValue(
  product: {
    product_kod?: string;
    product_nazwa?: string;
    ilosc?: number;
    ilosc_wydane?: number;
  },
  field: string
): SortValue {
  const wydane = product.ilosc_wydane ?? 0;
  switch (field) {
    case 'kod':
      return product.product_kod ?? '';
    case 'nazwa':
      return product.product_nazwa ?? '';
    case 'pozostalo':
      return (product.ilosc ?? 0) - wydane;
    case 'wydane':
      return wydane;
    case 'zarezerwowane':
      return product.ilosc ?? 0;
    default:
      return '';
  }
}

export function getDataTableSortValue(
  row: { kod: string; nazwa: string; ilosc: string; kodKreskowy: string },
  field: string
): SortValue {
  if (field === 'ilosc') {
    const num = parseFloat(String(row.ilosc).replace(',', '.'));
    return Number.isNaN(num) ? row.ilosc : num;
  }
  return row[field as keyof typeof row] ?? '';
}

export function getProductSearchSortValue(
  product: { kod: string; nazwa: string; ilosc: string },
  field: string
): SortValue {
  if (field === 'ilosc') {
    const num = parseFloat(String(product.ilosc).replace(',', '.'));
    return Number.isNaN(num) ? product.ilosc : num;
  }
  return product[field as keyof typeof product] ?? '';
}

export interface UseTableSortOptions<T> {
  defaultField?: string;
  defaultDirection?: SortDirection;
  initialField?: string;
  initialDirection?: SortDirection;
  persistKeys?: { field: string; direction: string };
  directionForField?: (field: string) => SortDirection;
  onSortChange?: (field: string, direction: SortDirection) => void;
  getValue?: (item: T, field: string) => SortValue;
  compareItems?: (a: T, b: T, field: string, direction: SortDirection) => number;
}

export function useTableSort<T>(
  items: T[],
  options: UseTableSortOptions<T>
): {
  sortField: string;
  sortDirection: SortDirection;
  handleSort: (field: string) => void;
  clearSort: () => void;
  setSortField: Dispatch<SetStateAction<string>>;
  setSortDirection: Dispatch<SetStateAction<SortDirection>>;
  sortedItems: T[];
};

export function useTableSort<T>(
  items: T[],
  getValue: (item: T, field: string) => SortValue,
  defaultField?: string,
  defaultDirection?: SortDirection
): {
  sortField: string;
  sortDirection: SortDirection;
  handleSort: (field: string) => void;
  clearSort: () => void;
  setSortField: Dispatch<SetStateAction<string>>;
  setSortDirection: Dispatch<SetStateAction<SortDirection>>;
  sortedItems: T[];
};

export function useTableSort<T>(
  items: T[],
  getValueOrOptions: UseTableSortOptions<T> | ((item: T, field: string) => SortValue),
  defaultField = '',
  defaultDirection: SortDirection = 'asc'
) {
  const options: UseTableSortOptions<T> =
    typeof getValueOrOptions === 'function'
      ? { getValue: getValueOrOptions, defaultField, defaultDirection }
      : getValueOrOptions;

  const {
    defaultField: fieldDefault = '',
    defaultDirection: directionDefault = 'asc',
    initialField,
    initialDirection,
    persistKeys,
    directionForField,
    onSortChange,
    getValue,
    compareItems,
  } = options;

  const readPersisted = (key: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback;
    return localStorage.getItem(key) || fallback;
  };

  const [sortField, setSortField] = useState<string>(() => {
    if (initialField !== undefined) return initialField;
    if (persistKeys?.field) return readPersisted(persistKeys.field, fieldDefault);
    return fieldDefault;
  });

  const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
    if (initialDirection !== undefined) return initialDirection;
    if (persistKeys?.direction) {
      return (readPersisted(persistKeys.direction, directionDefault) as SortDirection) || directionDefault;
    }
    return directionDefault;
  });

  const persistSort = useCallback(
    (field: string, direction: SortDirection) => {
      if (!persistKeys) return;
      localStorage.setItem(persistKeys.field, field);
      localStorage.setItem(persistKeys.direction, direction);
    },
    [persistKeys]
  );

  const handleSort = useCallback(
    (field: string) => {
      setSortField((prevField) => {
        if (prevField === field) {
          setSortDirection((prevDirection) => {
            const nextDirection = prevDirection === 'asc' ? 'desc' : 'asc';
            persistSort(field, nextDirection);
            onSortChange?.(field, nextDirection);
            return nextDirection;
          });
          return prevField;
        }

        const nextDirection = directionForField?.(field) ?? 'asc';
        setSortDirection(nextDirection);
        persistSort(field, nextDirection);
        onSortChange?.(field, nextDirection);
        return field;
      });
    },
    [directionForField, onSortChange, persistSort]
  );

  const clearSort = useCallback(() => {
    setSortField('');
    setSortDirection(directionDefault);
    if (persistKeys) {
      localStorage.removeItem(persistKeys.field);
      localStorage.removeItem(persistKeys.direction);
    }
    onSortChange?.('', directionDefault);
  }, [directionDefault, onSortChange, persistKeys]);

  const sortedItems = useMemo(() => {
    if (!sortField) return items;

    return [...items].sort((a, b) => {
      if (compareItems) {
        return compareItems(a, b, sortField, sortDirection);
      }
      if (getValue) {
        return compareSortValues(getValue(a, sortField), getValue(b, sortField), sortDirection);
      }
      return 0;
    });
  }, [items, sortField, sortDirection, compareItems, getValue]);

  return {
    sortField,
    sortDirection,
    handleSort,
    clearSort,
    setSortField,
    setSortDirection,
    sortedItems,
  };
}
