import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from 'react-modal';
import { X } from 'lucide-react';
import { SortIndicator } from './SortIndicator';
import { formatPlMoney } from '../utils/receiptCurrency';
import { compareAnalizaWydanProducts, extractDateFromOrderNumber, useTableSort } from '../utils/tableSort';

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
  numer_zamowienia: string;
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

const buildFilterQuery = (filters: {
  klient: string;
  typy: string[];
  year: string;
  month: string;
}) => {
  const params = new URLSearchParams();
  if (filters.klient) params.set('klient', filters.klient);
  filters.typy.forEach((typ) => params.append('typ', typ));
  if (filters.year) params.set('year', filters.year);
  if (filters.month) params.set('month', filters.month);
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
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [typModal, setTypModal] = useState<KlientTypModalState | null>(null);
  const [typModalRows, setTypModalRows] = useState<WydaniaTypRow[]>([]);
  const [typModalLoading, setTypModalLoading] = useState(false);
  const [typModalError, setTypModalError] = useState<string | null>(null);
  const typRequestRef = useRef(0);
  const typFilterRef = useRef<HTMLDivElement>(null);

  const { sortField, sortDirection, handleSort, sortedItems: sortedProducts } = useTableSort(products, {
    defaultField: 'nazwa',
    defaultDirection: 'asc',
    directionForField: (field) => (field === 'ilosc' || field === 'sprzedaz_netto' ? 'desc' : 'asc'),
    compareItems: compareAnalizaWydanProducts,
  });

  const activeFilters = useMemo(
    () => ({
      klient: selectedKlient,
      typy: selectedTypy,
      year: selectedYear,
      month: selectedMonth,
    }),
    [selectedKlient, selectedTypy, selectedYear, selectedMonth]
  );

  const filterRowsBy = (opts: {
    klient?: string;
    typy?: string[];
    year?: string;
    month?: string;
  }) => {
    return filterRows.filter((row) => {
      if (opts.klient && row.klient !== opts.klient) return false;
      if (opts.typy && opts.typy.length > 0 && !opts.typy.includes(row.typ)) return false;
      const date = extractDateFromOrderNumber(row.numer_zamowienia);
      if (!date) {
        return !opts.year && !opts.month;
      }
      if (opts.year && date.getFullYear().toString() !== opts.year) return false;
      if (opts.month && (date.getMonth() + 1).toString().padStart(2, '0') !== opts.month) {
        return false;
      }
      return true;
    });
  };

  const rowsForKlient = filterRowsBy({
    typy: selectedTypy,
    year: selectedYear || undefined,
    month: selectedMonth || undefined,
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
    year: selectedYear || undefined,
    month: selectedMonth || undefined,
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
  }, [rowsForTyp, selectedTypy]);

  const rowsForYear = filterRowsBy({
    klient: selectedKlient || undefined,
    typy: selectedTypy,
    month: selectedMonth || undefined,
  });
  const years = useMemo(() => {
    const set = new Set(
      rowsForYear
        .map((row) => extractDateFromOrderNumber(row.numer_zamowienia))
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
    year: selectedYear || undefined,
  });
  const months = useMemo(() => {
    const set = new Set(
      rowsForMonth
        .map((row) => extractDateFromOrderNumber(row.numer_zamowienia))
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
  }, [selectedKlient, selectedTypy, selectedYear, selectedMonth]);

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
    if (!isTypOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (typFilterRef.current && !typFilterRef.current.contains(event.target as Node)) {
        setIsTypOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsTypOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isTypOpen]);

  const toggleTyp = (value: string) => {
    setSelectedTypy((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const kodColumnWidth = useMemo(() => {
    const longest = products.reduce((max, product) => Math.max(max, product.kod?.length || 0), 0);
    const chars = Math.max(6, Math.ceil(longest / 2));
    return `calc(${chars}ch + 1rem)`;
  }, [products]);

  const totalButelki = products.reduce((sum, product) => sum + (product.ilosc || 0), 0);
  const hasActiveFilters = Boolean(selectedKlient || selectedTypy.length || selectedYear || selectedMonth);
  const typButtonLabel = selectedTypy.length === 0
    ? 'Typ'
    : typOptions
        .filter((opt) => selectedTypy.includes(opt.value))
        .map((opt) => opt.label)
        .join(', ');

  const clearFilters = () => {
    setSelectedKlient('');
    setSelectedTypy([]);
    setIsTypOpen(false);
    setSelectedYear('');
    setSelectedMonth('');
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
      <div className="flex justify-end">
        <div className="flex flex-col gap-1">
        <div className="grid grid-cols-2 gap-1">
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

          <div className="relative" ref={typFilterRef}>
            <button
              type="button"
              onClick={() => setIsTypOpen((open) => !open)}
              className={`${filterSelectClass} text-left flex items-center justify-between gap-1`}
              style={filterSelectStyle}
            >
              <span className="truncate min-w-0">{typButtonLabel}</span>
              <svg className="w-3 h-3 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isTypOpen && (
              <div className="absolute top-full right-0 mt-1 z-50 w-[180px] max-h-52 overflow-y-auto bg-white border border-gray-300 rounded shadow-sm py-1">
                {typOptions.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-gray-500 font-sora">Brak typów</div>
                ) : (
                  typOptions.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 px-2 py-1 text-xs font-sora text-gray-900 cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTypy.includes(opt.value)}
                        onChange={() => toggleTyp(opt.value)}
                        className="cursor-pointer"
                      />
                      <span className="truncate">{opt.label}</span>
                    </label>
                  ))
                )}
              </div>
            )}
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

      <div className="flex w-full justify-center items-center px-4">
        <span className="text-sm text-gray-600 font-sora">
          Butelki:{' '}
          <span className="font-bold">{formatBottles(totalButelki)}</span>
        </span>
      </div>

      <div className="w-full overflow-y-scroll max-h-[calc(100dvh-280px)] relative">
        <table
          className="table-fixed"
          style={{ width: `calc(70% + 0.3 * (${kodColumnWidth}) + 4.95rem)` }}
        >
          <colgroup>
            <col style={{ width: kodColumnWidth }} />
            <col />
            <col style={{ width: '7rem' }} />
            <col style={{ width: '9.5rem' }} />
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
              className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
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
                    <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-600 font-sora">
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
                        <td className="px-8 py-2 whitespace-nowrap text-sm text-gray-600 font-sora">
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
