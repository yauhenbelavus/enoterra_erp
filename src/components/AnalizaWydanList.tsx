import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from 'react-modal';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import { Search, X } from 'lucide-react';
import { SortIndicator } from './SortIndicator';
import { formatPlMoney } from '../utils/receiptCurrency';
import { compareAnalizaWydanProducts, useTableSort } from '../utils/tableSort';
import 'react-datepicker/dist/react-datepicker.css';
import './DatePicker.css';

registerLocale('pl', pl);

interface WydaniaProduct {
  kod: string;
  nazwa: string;
  ilosc: number;
  sprzedaz_netto: number;
}

interface WydaniaKlientRow {
  klient: string;
  ilosc: number;
  sprzedaz_netto: number;
}

interface WydaniaTypRow {
  typ: string;
  ilosc: number;
}

interface KlientTypModalState {
  kod: string;
  nazwa: string;
  klient: string;
}

interface FilterRow {
  klient: string;
  typ: string;
  typ_wydania: string;
  data_faktury: string;
}

interface AnalizaWydanListProps {
  refreshTrigger?: number;
  apiUrl?: string;
}

const TYP_WYDANIA_LABELS: Record<string, { label: string; color: string }> = {
  sprzedaz: { label: 'Sprzedaż', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  probka: { label: 'Próbka', color: 'bg-green-100 text-green-800 border-green-200' },
  degustacja: { label: 'Degustacja', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  zamiana: { label: 'Zamiana', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  prezent: { label: 'Prezent', color: 'bg-pink-100 text-pink-800 border-pink-200' },
  komis: { label: 'Komis', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  bar: { label: 'Bar', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  przesuniecie: { label: 'Przesunięcie', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  Uszkodzenie: { label: 'Uszkodzenie', color: 'bg-red-100 text-red-800 border-red-200' },
  Przeterminowanie: { label: 'Przeterminowanie', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  Utrata: { label: 'Utrata', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  Inwentaryzacja: { label: 'Inwentaryzacja', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  brak: { label: 'Brak typu', color: 'bg-gray-100 text-gray-800 border-gray-200' },
};

const TYPY_WINA: Record<string, { label: string; color: string }> = {
  czerwone: { label: 'Czerwone', color: 'bg-red-100 text-red-800 border-red-200' },
  biale: { label: 'Białe', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  musujace: { label: 'Musujące', color: 'bg-yellow-50 text-yellow-600 border-yellow-100' },
  bezalkoholowe: { label: 'Bezalkoholowe', color: 'bg-green-100 text-green-800 border-green-200' },
  ferment: { label: 'Ferment', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  rozowe: { label: 'Różowe', color: 'bg-pink-100 text-pink-800 border-pink-200' },
  slodkie: { label: 'Słodkie', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  aksesoria: { label: 'Aksesoria', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  amber: { label: 'Amber', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  brak: { label: 'Brak typu', color: 'bg-gray-100 text-gray-800 border-gray-200' },
};

const ALL_MONTHS = [
  { value: '01', label: 'Styczeń' },
  { value: '02', label: 'Luty' },
  { value: '03', label: 'Marzec' },
  { value: '04', label: 'Kwiecień' },
  { value: '05', label: 'Maj' },
  { value: '06', label: 'Czerwiec' },
  { value: '07', label: 'Lipiec' },
  { value: '08', label: 'Sierpień' },
  { value: '09', label: 'Wrzesień' },
  { value: '10', label: 'Październik' },
  { value: '11', label: 'Listopad' },
  { value: '12', label: 'Grudzień' },
];

const getTypWinaMeta = (typ: string) =>
  TYPY_WINA[typ] || { label: typ, color: 'bg-gray-100 text-gray-800 border-gray-200' };

const getTypWydaniaMeta = (typ: string) =>
  TYP_WYDANIA_LABELS[typ] || { label: typ, color: 'bg-gray-100 text-gray-800 border-gray-200' };

const formatBottles = (value: number) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(value);

const formatNetto = (value: number) => `${formatPlMoney(Number(value) || 0)} zł`;

const parseInvoiceDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const dateKeyFromValue = (value?: string) => {
  const iso = String(value || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = parseInvoiceDate(value);
  return date ? toDateKey(date) : '';
};

const parseDateKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
};

const formatDayLabel = (date: Date) =>
  date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });

const formatRangeLabel = (from: Date | null, to: Date | null) => {
  if (!from) return 'Zakres dat';
  if (!to || toDateKey(from) === toDateKey(to)) return formatDayLabel(from);
  const short = { day: '2-digit' as const, month: '2-digit' as const };
  return `${from.toLocaleDateString('pl-PL', short)}–${to.toLocaleDateString('pl-PL', short)}`;
};

const isSameDay = (a: Date | null, b: Date | null) =>
  Boolean(a && b && toDateKey(a) === toDateKey(b));

const buildFilterQuery = (filters: {
  klient: string;
  typy: string[];
  typWydania: string;
  year: string;
  month: string;
  dateFrom: string;
  dateTo: string;
}) => {
  const params = new URLSearchParams();
  if (filters.klient) params.set('klient', filters.klient);
  filters.typy.forEach((typ) => params.append('typ', typ));
  if (filters.typWydania) params.set('typ_wydania', filters.typWydania);
  if (filters.year) params.set('year', filters.year);
  if (filters.month) params.set('month', filters.month);
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  const query = params.toString();
  return query ? `?${query}` : '';
};

export const AnalizaWydanList: React.FC<AnalizaWydanListProps> = ({
  refreshTrigger,
  apiUrl = '',
}) => {
  const [products, setProducts] = useState<WydaniaProduct[]>([]);
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKod, setExpandedKod] = useState<string | null>(null);
  const [detailsByKod, setDetailsByKod] = useState<Record<string, WydaniaKlientRow[]>>({});
  const [detailsLoadingKod, setDetailsLoadingKod] = useState<string | null>(null);
  const [detailsErrorByKod, setDetailsErrorByKod] = useState<Record<string, string>>({});
  const [selectedKlient, setSelectedKlient] = useState('');
  const [selectedTypy, setSelectedTypy] = useState<string[]>([]);
  const [isTypOpen, setIsTypOpen] = useState(false);
  const [isDateOpen, setIsDateOpen] = useState(false);
  const [selectedTypWydania, setSelectedTypWydania] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typModal, setTypModal] = useState<KlientTypModalState | null>(null);
  const [typModalRows, setTypModalRows] = useState<WydaniaTypRow[]>([]);
  const [typModalLoading, setTypModalLoading] = useState(false);
  const [typModalError, setTypModalError] = useState<string | null>(null);
  const typRequestRef = useRef(0);
  const typFilterRef = useRef<HTMLDivElement>(null);
  const typSelectRef = useRef<HTMLSelectElement>(null);
  const dateFilterRef = useRef<HTMLDivElement>(null);
  const dateSelectRef = useRef<HTMLSelectElement>(null);
  const calendarViewRef = useRef<Date | null>(null);
  const [typMenuRect, setTypMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [dateMenuRect, setDateMenuRect] = useState<{ top: number; left: number } | null>(null);

  const selectedTypyKey = selectedTypy.join('\0');
  const dateFromKey = dateFrom ? toDateKey(dateFrom) : '';
  const dateToKey = dateFrom ? toDateKey(dateTo || dateFrom) : '';

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      (product.kod || '').toLowerCase().includes(query) ||
      (product.nazwa || '').toLowerCase().includes(query)
    );
  }, [products, searchTerm]);

  const { sortField, sortDirection, handleSort, sortedItems: sortedProducts } = useTableSort(filteredProducts, {
    defaultField: 'nazwa',
    defaultDirection: 'asc',
    directionForField: (field) => (field === 'ilosc' || field === 'sprzedaz_netto' ? 'desc' : 'asc'),
    compareItems: compareAnalizaWydanProducts,
  });

  const activeFilters = useMemo(
    () => ({
      klient: selectedKlient,
      typy: selectedTypy,
      typWydania: selectedTypWydania,
      year: selectedYear,
      month: selectedMonth,
      dateFrom: dateFromKey,
      dateTo: dateToKey,
    }),
    [selectedKlient, selectedTypyKey, selectedTypWydania, selectedYear, selectedMonth, dateFromKey, dateToKey]
  );

  const filterRowsBy = (opts: {
    klient?: string;
    typy?: string[];
    typWydania?: string;
    year?: string;
    month?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => {
    return filterRows.filter((row) => {
      if (opts.klient && row.klient !== opts.klient) return false;
      if (opts.typy && opts.typy.length > 0 && !opts.typy.includes(row.typ)) return false;
      if (opts.typWydania && (row.typ_wydania || 'brak') !== opts.typWydania) return false;
      const date = parseInvoiceDate(row.data_faktury);
      const key = dateKeyFromValue(row.data_faktury);
      if (!date || !key) {
        return !opts.year && !opts.month && !opts.dateFrom && !opts.dateTo;
      }
      if (opts.year && date.getFullYear().toString() !== opts.year) return false;
      if (opts.month && (date.getMonth() + 1).toString().padStart(2, '0') !== opts.month) {
        return false;
      }
      if (opts.dateFrom && key < opts.dateFrom) return false;
      if (opts.dateTo && key > opts.dateTo) return false;
      return true;
    });
  };

  const rowsForKlient = filterRowsBy({
    typy: selectedTypy,
    typWydania: selectedTypWydania || undefined,
    year: selectedYear || undefined,
    month: selectedMonth || undefined,
    dateFrom: dateFromKey || undefined,
    dateTo: dateToKey || undefined,
  });
  const clients = useMemo(() => {
    const set = new Set(rowsForKlient.map((row) => row.klient).filter(Boolean));
    const list = Array.from(set).sort((a, b) => a.localeCompare(b));
    if (selectedKlient && !set.has(selectedKlient)) {
      list.push(selectedKlient);
      list.sort((a, b) => a.localeCompare(b));
    }
    return list;
  }, [rowsForKlient, selectedKlient]);

  const rowsForTyp = filterRowsBy({
    klient: selectedKlient || undefined,
    typWydania: selectedTypWydania || undefined,
    year: selectedYear || undefined,
    month: selectedMonth || undefined,
    dateFrom: dateFromKey || undefined,
    dateTo: dateToKey || undefined,
  });
  const typOptions = useMemo(() => {
    const set = new Set(rowsForTyp.map((row) => row.typ).filter(Boolean));
    const list = Array.from(set)
      .map((value) => ({ value, label: getTypWinaMeta(value).label }));
    selectedTypy.forEach((value) => {
      if (!set.has(value)) {
        list.push({ value, label: getTypWinaMeta(value).label });
      }
    });
    list.sort((a, b) => a.label.localeCompare(b.label, 'pl'));
    return list;
  }, [rowsForTyp, selectedTypyKey]);

  const rowsForTypWydania = filterRowsBy({
    klient: selectedKlient || undefined,
    typy: selectedTypy,
    year: selectedYear || undefined,
    month: selectedMonth || undefined,
    dateFrom: dateFromKey || undefined,
    dateTo: dateToKey || undefined,
  });
  const typWydaniaOptions = useMemo(() => {
    const set = new Set(rowsForTypWydania.map((row) => row.typ_wydania || 'brak').filter(Boolean));
    const list = Array.from(set)
      .map((value) => ({ value, label: getTypWydaniaMeta(value).label }));
    if (selectedTypWydania && !set.has(selectedTypWydania)) {
      list.push({ value: selectedTypWydania, label: getTypWydaniaMeta(selectedTypWydania).label });
    }
    list.sort((a, b) => a.label.localeCompare(b.label, 'pl'));
    return list;
  }, [rowsForTypWydania, selectedTypWydania]);

  const rowsForDates = filterRowsBy({
    klient: selectedKlient || undefined,
    typy: selectedTypy,
    typWydania: selectedTypWydania || undefined,
    year: selectedYear || undefined,
    month: selectedMonth || undefined,
  });
  const availableCalendarDates = useMemo(() => {
    const set = new Set(
      rowsForDates
        .map((row) => dateKeyFromValue(row.data_faktury))
        .filter(Boolean)
    );
    return Array.from(set)
      .map(parseDateKey)
      .filter((date): date is Date => date !== null)
      .sort((a, b) => a.getTime() - b.getTime());
  }, [rowsForDates]);
  const availableDateKeySet = useMemo(
    () => new Set(availableCalendarDates.map(toDateKey)),
    [availableCalendarDates]
  );
  const calendarOpenToDate = dateFrom || new Date();

  const rowsForYear = filterRowsBy({
    klient: selectedKlient || undefined,
    typy: selectedTypy,
    typWydania: selectedTypWydania || undefined,
    month: selectedMonth || undefined,
    dateFrom: dateFromKey || undefined,
    dateTo: dateToKey || undefined,
  });
  const years = useMemo(() => {
    const set = new Set(
      rowsForYear
        .map((row) => parseInvoiceDate(row.data_faktury))
        .filter((date): date is Date => date !== null)
        .map((date) => date.getFullYear().toString())
    );
    const list = Array.from(set).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    if (selectedYear && !set.has(selectedYear)) {
      list.push(selectedYear);
      list.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    }
    return list;
  }, [rowsForYear, selectedYear]);

  const rowsForMonth = filterRowsBy({
    klient: selectedKlient || undefined,
    typy: selectedTypy,
    typWydania: selectedTypWydania || undefined,
    year: selectedYear || undefined,
    dateFrom: dateFromKey || undefined,
    dateTo: dateToKey || undefined,
  });
  const months = useMemo(() => {
    const set = new Set(
      rowsForMonth
        .map((row) => parseInvoiceDate(row.data_faktury))
        .filter((date): date is Date => date !== null)
        .map((date) => (date.getMonth() + 1).toString().padStart(2, '0'))
    );
    const list = ALL_MONTHS.filter((month) => set.has(month.value));
    if (selectedMonth && !set.has(selectedMonth)) {
      const extra = ALL_MONTHS.find((month) => month.value === selectedMonth);
      if (extra) list.push(extra);
      list.sort((a, b) => a.value.localeCompare(b.value));
    }
    return list;
  }, [rowsForMonth, selectedMonth]);

  const loadFilterRows = async () => {
    const response = await fetch(`${apiUrl}/api/analiza-wydan/filters`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  };

  const loadProducts = async (filters = activeFilters) => {
    try {
      setIsLoading(true);
      setError(null);
      const query = buildFilterQuery(filters);
      const response = await fetch(`${apiUrl}/api/analiza-wydan${query}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setProducts(data);
    } catch (err: any) {
      console.error('❌ Error loading wydania products:', err);
      setError(err.message || 'Błąd ładowania danych');
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDetails = async (kod: string, filters = activeFilters) => {
    try {
      setDetailsLoadingKod(kod);
      setDetailsErrorByKod((prev) => {
        const next = { ...prev };
        delete next[kod];
        return next;
      });

      const query = buildFilterQuery(filters);
      const response = await fetch(`${apiUrl}/api/analiza-wydan/${encodeURIComponent(kod)}${query}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setDetailsByKod((prev) => ({ ...prev, [kod]: data.by_klient || [] }));
    } catch (err: any) {
      console.error(`❌ Error loading wydania details for ${kod}:`, err);
      setDetailsErrorByKod((prev) => ({
        ...prev,
        [kod]: err.message || 'Błąd ładowania danych',
      }));
    } finally {
      setDetailsLoadingKod(null);
    }
  };

  useEffect(() => {
    loadFilterRows()
      .then(setFilterRows)
      .catch((err: any) => {
        console.error('❌ Error loading analiza wydan filters:', err);
      });
  }, []);

  useEffect(() => {
    setExpandedKod(null);
    setDetailsByKod({});
    setDetailsErrorByKod({});
    setTypModal(null);
    loadProducts(activeFilters);
  }, [selectedKlient, selectedTypyKey, selectedTypWydania, selectedYear, selectedMonth, dateFromKey, dateToKey]);

  useEffect(() => {
    if (refreshTrigger == null) return;

    setExpandedKod(null);
    setDetailsByKod({});
    setDetailsErrorByKod({});
    setTypModal(null);
    loadFilterRows()
      .then(setFilterRows)
      .catch((err: any) => {
        console.error('❌ Error refreshing analiza wydan filters:', err);
      });
    loadProducts(activeFilters);
  }, [refreshTrigger]);

  useEffect(() => {
    if (expandedKod && !products.some((product) => product.kod === expandedKod)) {
      setExpandedKod(null);
    }
  }, [expandedKod, products]);

  const openKlientTypModal = async (product: WydaniaProduct, klient: string) => {
    const requestId = ++typRequestRef.current;
    setTypModal({ kod: product.kod, nazwa: product.nazwa, klient });
    setTypModalRows([]);
    setTypModalError(null);
    setTypModalLoading(true);
    try {
      const query = buildFilterQuery({ ...activeFilters, klient });
      const response = await fetch(`${apiUrl}/api/analiza-wydan/${encodeURIComponent(product.kod)}/typy${query}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (typRequestRef.current !== requestId) return;
      setTypModalRows(data.by_typ || []);
    } catch (err: any) {
      if (typRequestRef.current !== requestId) return;
      console.error(`❌ Error loading typ breakdown for ${product.kod} / ${klient}:`, err);
      setTypModalError(err.message || 'Błąd ładowania danych');
    } finally {
      if (typRequestRef.current === requestId) {
        setTypModalLoading(false);
      }
    }
  };

  const toggleProductDetails = async (kod: string) => {
    if (expandedKod === kod) {
      setExpandedKod(null);
      return;
    }

    setExpandedKod(kod);
    await loadDetails(kod);
  };

  useEffect(() => {
    if (!isTypOpen) {
      setTypMenuRect(null);
      return;
    }

    const updateMenuRect = () => {
      const el = typSelectRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setTypMenuRect({ top: rect.bottom + 2, left: rect.left, width: rect.width });
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (typFilterRef.current && !typFilterRef.current.contains(event.target as Node)) {
        setIsTypOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsTypOpen(false);
    };

    updateMenuRect();
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', updateMenuRect);
    window.addEventListener('scroll', updateMenuRect, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', updateMenuRect);
      window.removeEventListener('scroll', updateMenuRect, true);
    };
  }, [isTypOpen]);

  useEffect(() => {
    if (!isDateOpen) {
      setDateMenuRect(null);
      return;
    }

    const updateMenuRect = () => {
      const el = dateSelectRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const calendarWidth = 252;
      const calendarHeight = 290;
      let left = rect.right - calendarWidth;
      left = Math.min(Math.max(8, left), window.innerWidth - calendarWidth - 8);
      let top = rect.bottom + 2;
      if (top + calendarHeight > window.innerHeight - 8 && rect.top > calendarHeight + 8) {
        top = rect.top - calendarHeight - 2;
      }
      setDateMenuRect({ top, left });
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (dateFilterRef.current && !dateFilterRef.current.contains(event.target as Node)) {
        setIsDateOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsDateOpen(false);
    };

    updateMenuRect();
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', updateMenuRect);
    window.addEventListener('scroll', updateMenuRect, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', updateMenuRect);
      window.removeEventListener('scroll', updateMenuRect, true);
    };
  }, [isDateOpen]);

  const toggleTyp = (value: string) => {
    setSelectedTypy((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const applyDateClick = (date: Date) => {
    if (!dateFrom) {
      setDateFrom(date);
      setDateTo(null);
      return;
    }

    const single = !dateTo || isSameDay(dateFrom, dateTo);
    if (single) {
      if (isSameDay(date, dateFrom)) {
        setDateFrom(null);
        setDateTo(null);
        return;
      }
      if (date.getTime() < dateFrom.getTime()) {
        setDateTo(dateFrom);
        setDateFrom(date);
      } else {
        setDateTo(date);
      }
      return;
    }

    if (isSameDay(date, dateFrom)) {
      setDateFrom(dateTo);
      setDateTo(null);
      return;
    }
    if (isSameDay(date, dateTo)) {
      setDateTo(null);
      return;
    }
    setDateFrom(date);
    setDateTo(null);
  };

  const removeDateEndpoint = (which: 'from' | 'to') => {
    if (!dateFrom) return;
    const ranged = Boolean(dateTo && !isSameDay(dateFrom, dateTo));
    if (!ranged) {
      setDateFrom(null);
      setDateTo(null);
      return;
    }
    if (which === 'from') {
      setDateFrom(dateTo);
      setDateTo(null);
      return;
    }
    setDateTo(null);
  };

  const kodColumnWidth = useMemo(() => {
    const longest = products.reduce((max, product) => Math.max(max, product.kod?.length || 0), 0);
    const chars = Math.max(6, Math.ceil(longest / 2));
    return `calc(${chars}ch + 1rem)`;
  }, [products]);

  const columnWidths = useMemo(() => {
    const currentTable = `70% + 0.3 * (${kodColumnWidth}) + 4.95rem`;
    const share = (part: string) => `calc(100% * (${part}) / (${currentTable}))`;
    const kod = share(kodColumnWidth);
    const ilosc = '6.5rem';
    const oldSprzedaz = share('7rem');
    const oldNazwa = `100% - (${kod}) - (${oldSprzedaz}) - ${ilosc}`;
    const sprzedaz = `max(5.75rem, calc(100% - (${kod}) - ${ilosc} - 1.2 * (${oldNazwa})))`;
    return {
      kod,
      ilosc,
      sprzedaz,
      nazwa: `calc(100% - (${kod}) - (${sprzedaz}) - ${ilosc})`,
    };
  }, [kodColumnWidth]);

  const totalButelki = filteredProducts.reduce((sum, product) => sum + (product.ilosc || 0), 0);
  const totalNetto = filteredProducts.reduce((sum, product) => sum + (Number(product.sprzedaz_netto) || 0), 0);
  const hasActiveFilters = Boolean(
    selectedKlient || selectedTypy.length || selectedTypWydania || selectedYear || selectedMonth || dateFrom
  );
  const typButtonLabel = selectedTypy.length === 0
    ? 'Typ towaru'
    : typOptions
        .filter((opt) => selectedTypy.includes(opt.value))
        .map((opt) => opt.label)
        .join(', ');
  const zakresLabel = formatRangeLabel(dateFrom, dateTo);

  const clearFilters = () => {
    setSelectedKlient('');
    setSelectedTypy([]);
    setIsTypOpen(false);
    setSelectedTypWydania('');
    setSelectedYear('');
    setSelectedMonth('');
    setDateFrom(null);
    setDateTo(null);
  };

  const filterSelectClass =
    'block px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300 truncate';
  const filterSelectStyle = {
    fontFamily: 'Sora, sans-serif',
    direction: 'ltr' as const,
    width: '145px',
    minWidth: '145px',
    maxWidth: '145px',
  };

  if (isLoading && products.length === 0) {
    return <div className="text-gray-600 font-sora text-sm py-4">Ładowanie danych...</div>;
  }

  if (error && products.length === 0) {
    return <div className="text-red-600 font-sora text-sm py-4">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <style>{`
        .analiza-typ-menu {
          background-color: white;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
        }
        .analiza-typ-option {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          cursor: default;
          font-family: Sora, sans-serif;
          font-size: 12px;
          color: #111827;
          white-space: nowrap;
        }
        .analiza-typ-option:hover {
          background-color: #f3f4f6;
        }
        .analiza-typ-option input[type="checkbox"] {
          margin: 0;
          cursor: pointer;
          accent-color: #2563eb;
        }
        .analiza-zakres-menu .react-datepicker {
          position: relative;
        }
        .analiza-zakres-menu .react-datepicker__day {
          border-radius: 50%;
        }
        .analiza-zakres-menu .react-datepicker__day--weekend {
          color: inherit;
        }
        .analiza-zakres-menu .react-datepicker__day--in-range,
        .analiza-zakres-menu .react-datepicker__day--in-selecting-range {
          background-color: #dbeafe;
          color: #1e3a8a;
          border-radius: 50%;
        }
        .analiza-zakres-menu .react-datepicker__day--range-start,
        .analiza-zakres-menu .react-datepicker__day--range-end,
        .analiza-zakres-menu .react-datepicker__day--selected {
          background-color: #2563eb;
          color: white;
          border-radius: 50%;
        }
        .analiza-zakres-menu .react-datepicker__day:hover {
          border-radius: 50%;
        }
        .analiza-zakres-menu .react-datepicker__day--disabled {
          visibility: hidden;
          pointer-events: none;
        }
        .analiza-zakres-menu .react-datepicker__day--today {
          background: transparent;
          border: 1px solid #9ca3af;
          border-radius: 50%;
          font-weight: normal;
          color: inherit;
        }
        .analiza-zakres-menu .react-datepicker__day--today:hover {
          background-color: #f3f4f6;
          border-color: #6b7280;
        }
      `}</style>
      <div className="relative w-full">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Szukaj produktów..."
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none sm:text-sm font-sora shadow-none"
        />
      </div>

      <div className="flex justify-end overflow-visible">
        <div className="flex flex-col gap-1 overflow-visible">
        <div className="grid grid-cols-2 gap-1 overflow-visible">
          <div className="relative" ref={typFilterRef}>
            <select
              ref={typSelectRef}
              value={selectedTypy.length > 0 ? '__typ__' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                typSelectRef.current?.focus();
                setIsDateOpen(false);
                setIsTypOpen((open) => !open);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  setIsDateOpen(false);
                  setIsTypOpen((open) => !open);
                }
              }}
              onChange={() => undefined}
              className={filterSelectClass}
              style={filterSelectStyle}
            >
              {selectedTypy.length === 0 ? (
                <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Typ towaru</option>
              ) : (
                <option value="__typ__" style={{ fontFamily: 'Sora, sans-serif' }}>{typButtonLabel}</option>
              )}
              {typOptions.map((opt) => (
                <option key={opt.value} value={opt.value} style={{ fontFamily: 'Sora, sans-serif' }}>
                  {opt.label}
                </option>
              ))}
            </select>
            {isTypOpen && typMenuRect && (
              <div
                className="analiza-typ-menu fixed z-[100] max-h-52 overflow-y-auto py-1"
                style={{
                  top: typMenuRect.top,
                  left: typMenuRect.left,
                  minWidth: typMenuRect.width,
                }}
              >
                {typOptions.length === 0 ? (
                  <div className="analiza-typ-option text-gray-500">Brak typów</div>
                ) : (
                  typOptions.map((opt) => (
                    <label key={opt.value} className="analiza-typ-option">
                      <input
                        type="checkbox"
                        checked={selectedTypy.includes(opt.value)}
                        onChange={() => toggleTyp(opt.value)}
                      />
                      <span className="truncate">{opt.label}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="relative" ref={dateFilterRef}>
            <select
              ref={dateSelectRef}
              value=""
              onMouseDown={(e) => {
                e.preventDefault();
                setIsTypOpen(false);
                if (!isDateOpen) {
                  calendarViewRef.current = dateFrom || new Date();
                }
                setIsDateOpen((open) => !open);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  setIsTypOpen(false);
                  if (!isDateOpen) {
                    calendarViewRef.current = dateFrom || new Date();
                  }
                  setIsDateOpen((open) => !open);
                }
              }}
              onChange={() => undefined}
              className={filterSelectClass}
              style={filterSelectStyle}
              aria-label="Zakres dat"
              aria-expanded={isDateOpen}
            >
              <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>
                {zakresLabel}
              </option>
            </select>
            {isDateOpen && dateMenuRect && (
              <div
                className="analiza-zakres-menu fixed z-[200]"
                style={{
                  top: dateMenuRect.top,
                  left: dateMenuRect.left,
                }}
              >
                <DatePicker
                  inline
                  startDate={dateFrom ?? undefined}
                  endDate={dateTo ?? undefined}
                  filterDate={(date) => availableDateKeySet.has(toDateKey(date))}
                  renderDayContents={(day, date) => (
                    <span
                      onMouseDown={(e) => {
                        if (!date) return;
                        e.preventDefault();
                        e.stopPropagation();
                        applyDateClick(date);
                      }}
                      style={{ display: 'block', width: '100%', height: '100%', lineHeight: 'inherit' }}
                    >
                      {day}
                    </span>
                  )}
                  onMonthChange={(date) => { calendarViewRef.current = date; }}
                  onSelect={() => undefined}
                  onChange={() => undefined}
                  openToDate={calendarViewRef.current ?? calendarOpenToDate}
                  locale="pl"
                  calendarStartDay={1}
                  shouldCloseOnSelect={false}
                />
              </div>
            )}
          </div>

          <div className="relative">
            <select
              value={selectedKlient}
              onChange={(e) => setSelectedKlient(e.target.value)}
              className={filterSelectClass}
              style={filterSelectStyle}
            >
              <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Klient</option>
              {clients.map((klient) => (
                <option key={klient} value={klient} style={{ fontFamily: 'Sora, sans-serif' }}>
                  {klient}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <select
              value={selectedTypWydania}
              onChange={(e) => setSelectedTypWydania(e.target.value)}
              className={filterSelectClass}
              style={filterSelectStyle}
            >
              <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Typ wydania</option>
              {typWydaniaOptions.map((opt) => (
                <option key={opt.value} value={opt.value} style={{ fontFamily: 'Sora, sans-serif' }}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className={filterSelectClass}
              style={filterSelectStyle}
            >
              <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Rok</option>
              {years.map((year) => (
                <option key={year} value={year} style={{ fontFamily: 'Sora, sans-serif' }}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className={filterSelectClass}
              style={filterSelectStyle}
            >
              <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Miesiąc</option>
              {months.map((month) => (
                <option key={month.value} value={month.value} style={{ fontFamily: 'Sora, sans-serif' }}>
                  {month.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-xs font-sora transition-colors"
          >
            Wyczyść filtry
          </button>
        )}
        </div>
      </div>

      <div className="relative flex w-full items-center px-4 min-h-[1.75rem]">
        <div className="absolute left-4 flex items-center gap-1 text-sm font-sora text-gray-700">
          {dateFrom && (
            <button
              type="button"
              onClick={() => removeDateEndpoint('from')}
              className="px-2 py-0.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
            >
              {formatDayLabel(dateFrom)}
            </button>
          )}
          {dateFrom && dateTo && !isSameDay(dateFrom, dateTo) && (
            <>
              <span className="text-gray-400">–</span>
              <button
                type="button"
                onClick={() => removeDateEndpoint('to')}
                className="px-2 py-0.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
              >
                {formatDayLabel(dateTo)}
              </button>
            </>
          )}
        </div>
        <div className="flex w-full justify-center items-center gap-6">
          <span className="text-sm text-gray-600 font-sora">
            Butelki:{' '}
            <span className="font-bold">{formatBottles(totalButelki)}</span>
          </span>
          <span className="text-sm text-gray-600 font-sora">
            Sprzedaż netto:{' '}
            <span className="font-bold">{formatNetto(totalNetto)}</span>
          </span>
        </div>
      </div>

      <div className="w-full overflow-y-scroll max-h-[calc(100dvh-280px)] relative">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: columnWidths.kod }} />
            <col style={{ width: columnWidths.nazwa }} />
            <col style={{ width: columnWidths.ilosc }} />
            <col style={{ width: columnWidths.sprzedaz }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
            <th
              className="px-2 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
              onClick={() => handleSort('kod')}
            >
              <div className="flex items-center gap-1">
                Kod
                <SortIndicator field="kod" sortField={sortField} sortDirection={sortDirection} />
              </div>
            </th>
            <th
              className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
              onClick={() => handleSort('nazwa')}
            >
              <div className="flex items-center gap-1">
                Nazwa
                <SortIndicator field="nazwa" sortField={sortField} sortDirection={sortDirection} />
              </div>
            </th>
            <th
              className="px-2 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
              onClick={() => handleSort('ilosc')}
            >
              <div className="flex items-center gap-1">
                Ilość
                <SortIndicator field="ilosc" sortField={sortField} sortDirection={sortDirection} />
              </div>
            </th>
            <th
              className="px-4 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
              onClick={() => handleSort('sprzedaz_netto')}
            >
              <div className="flex items-center justify-end gap-1">
                <span className="leading-tight">Sprzedaż netto</span>
                <SortIndicator field="sprzedaz_netto" sortField={sortField} sortDirection={sortDirection} />
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {isLoading ? (
            <tr>
              <td colSpan={4} className="px-8 py-8 text-center text-sm text-gray-500 font-sora">
                Ładowanie danych...
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={4} className="px-8 py-8 text-center text-sm text-red-600 font-sora">
                {error}
              </td>
            </tr>
          ) : products.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-8 py-8 text-center text-sm text-gray-500 font-sora">
                Brak danych o wydaniach
              </td>
            </tr>
          ) : sortedProducts.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-8 py-8 text-center text-sm text-gray-500 font-sora">
                Brak wyników
              </td>
            </tr>
          ) : (
            sortedProducts.map((product) => {
              const isExpanded = expandedKod === product.kod;
              const klientRows = isExpanded ? detailsByKod[product.kod] || [] : [];
              const isDetailsLoading = detailsLoadingKod === product.kod;
              const detailsError = detailsErrorByKod[product.kod];

              return (
                <React.Fragment key={product.kod}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleProductDetails(product.kod)}
                  >
                    <td className="px-2 py-3 text-sm text-gray-900 font-sora align-top">
                      <div className="break-all line-clamp-2 leading-snug">{product.kod}</div>
                    </td>
                    <td className="px-8 py-3 text-sm text-gray-900 font-sora">
                      {product.nazwa}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-600 font-sora">
                      {product.ilosc}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 font-sora text-right">
                      {formatNetto(product.sprzedaz_netto)}
                    </td>
                  </tr>

                  {isExpanded && isDetailsLoading && (
                    <tr className="bg-gray-50">
                      <td colSpan={4} className="px-8 py-3 text-sm text-gray-500 font-sora">
                        Ładowanie szczegółów...
                      </td>
                    </tr>
                  )}

                  {isExpanded && detailsError && (
                    <tr className="bg-gray-50">
                      <td colSpan={4} className="px-8 py-3 text-sm text-red-600 font-sora">
                        {detailsError}
                      </td>
                    </tr>
                  )}

                  {isExpanded && !isDetailsLoading && !detailsError && klientRows.length === 0 && (
                    <tr className="bg-gray-50">
                      <td colSpan={4} className="px-8 py-3 text-sm text-gray-500 font-sora">
                        Brak danych o klientach
                      </td>
                    </tr>
                  )}

                  {isExpanded &&
                    !isDetailsLoading &&
                    !detailsError &&
                    klientRows.map((row) => (
                      <tr
                        key={`${product.kod}-${row.klient}`}
                        className="bg-gray-50 hover:bg-gray-100 cursor-pointer"
                        onClick={(event) => {
                          event.stopPropagation();
                          openKlientTypModal(product, row.klient);
                        }}
                      >
                        <td className="px-2 py-2 text-sm font-sora" />
                        <td className="px-8 py-2 text-sm text-gray-700 font-sora">
                          {row.klient}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-600 font-sora">
                          {row.ilosc}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600 font-sora text-right">
                          {formatNetto(row.sprzedaz_netto)}
                        </td>
                      </tr>
                    ))}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
      </div>

      <Modal
        isOpen={typModal !== null}
        onRequestClose={() => setTypModal(null)}
        style={{
          content: {
            width: '420px',
            height: 'auto',
            maxWidth: '90%',
            maxHeight: '80vh',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            margin: '0',
            borderRadius: '0.5rem',
            background: 'white',
            overflow: 'hidden',
            outline: 'none',
            padding: '24px',
            fontFamily: 'Sora',
            zIndex: 9999,
          },
          overlay: {
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            zIndex: 9999,
          },
        }}
      >
        <div className="font-sora flex flex-col max-h-[70vh]">
          <div className="flex justify-between items-start gap-4 mb-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-800 truncate">{typModal?.klient}</h2>
              <p className="text-xs text-gray-500 mt-1 truncate">
                {typModal?.kod}{typModal?.nazwa ? ` · ${typModal.nazwa}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTypModal(null)}
              className="text-red-500 focus:outline-none shrink-0"
            >
              <X size={20} />
            </button>
          </div>

          {typModalLoading ? (
            <div className="text-sm text-gray-500 py-4">Ładowanie danych...</div>
          ) : typModalError ? (
            <div className="text-sm text-red-600 py-4">{typModalError}</div>
          ) : typModalRows.length === 0 ? (
            <div className="text-sm text-gray-500 py-4">Brak wydań</div>
          ) : (
            <div className="overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                      Typ
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                      Ilość
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {typModalRows.map((row) => {
                    const meta = getTypWydaniaMeta(row.typ);
                    return (
                      <tr key={row.typ}>
                        <td className="px-2 py-2 text-sm">
                          <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium border ${meta.color}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-sm text-gray-600 whitespace-nowrap">
                          {row.ilosc}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
