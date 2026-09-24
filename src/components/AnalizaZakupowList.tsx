import React, { useEffect, useMemo, useState } from 'react';
import { SortIndicator } from './SortIndicator';
import { formatPlMoney } from '../utils/receiptCurrency';
import { compareAnalizaZakupowProducts, useTableSort } from '../utils/tableSort';

interface ZakupProduct {
  kod: string;
  nazwa: string;
  sprzedawca: string;
  ilosc: number;
  netto: number;
}

interface ZakupReceiptRow {
  receipt_id: number;
  data_przyjecia: string;
  sprzedawca: string;
  ilosc: number;
  netto: number;
}

interface FilterRow {
  sprzedawca: string;
  typ: string;
  data_przyjecia: string;
}

interface AnalizaZakupowListProps {
  refreshTrigger?: number | string;
  apiUrl?: string;
}

const TYP_LABELS: Record<string, { label: string; color: string }> = {
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

const getTypMeta = (typ: string) =>
  TYP_LABELS[typ] || { label: typ, color: 'bg-gray-100 text-gray-800 border-gray-200' };

const formatBottles = (value: number) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(value);

const formatNetto = (value: number) => `${formatPlMoney(Number(value) || 0)} zł`;

const extractPrzyjecieDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = String(value).match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  return null;
};

const formatPrzyjecieDate = (value?: string | null): string => {
  const date = extractPrzyjecieDate(value);
  if (!date) return value || '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getFullYear()}`;
};

const buildFilterQuery = (filters: {
  sprzedawca: string;
  typ: string;
  year: string;
  month: string;
}) => {
  const params = new URLSearchParams();
  if (filters.sprzedawca) params.set('sprzedawca', filters.sprzedawca);
  if (filters.typ) params.set('typ', filters.typ);
  if (filters.year) params.set('year', filters.year);
  if (filters.month) params.set('month', filters.month);
  const query = params.toString();
  return query ? `?${query}` : '';
};

export const AnalizaZakupowList: React.FC<AnalizaZakupowListProps> = ({
  refreshTrigger,
  apiUrl = '',
}) => {
  const [products, setProducts] = useState<ZakupProduct[]>([]);
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKod, setExpandedKod] = useState<string | null>(null);
  const [detailsByKod, setDetailsByKod] = useState<Record<string, ZakupReceiptRow[]>>({});
  const [detailsLoadingKod, setDetailsLoadingKod] = useState<string | null>(null);
  const [detailsErrorByKod, setDetailsErrorByKod] = useState<Record<string, string>>({});
  const [selectedSprzedawca, setSelectedSprzedawca] = useState('');
  const [selectedTyp, setSelectedTyp] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');

  const { sortField, sortDirection, handleSort, sortedItems: sortedProducts } = useTableSort(products, {
    defaultField: 'nazwa',
    defaultDirection: 'asc',
    directionForField: (field) => (field === 'ilosc' || field === 'netto' ? 'desc' : 'asc'),
    compareItems: compareAnalizaZakupowProducts,
  });

  const activeFilters = useMemo(
    () => ({
      sprzedawca: selectedSprzedawca,
      typ: selectedTyp,
      year: selectedYear,
      month: selectedMonth,
    }),
    [selectedSprzedawca, selectedTyp, selectedYear, selectedMonth]
  );

  const filterRowsBy = (opts: {
    sprzedawca?: string;
    typ?: string;
    year?: string;
    month?: string;
  }) => {
    return filterRows.filter((row) => {
      if (opts.sprzedawca && row.sprzedawca !== opts.sprzedawca) return false;
      if (opts.typ && row.typ !== opts.typ) return false;
      const date = extractPrzyjecieDate(row.data_przyjecia);
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

  const rowsForSprzedawca = filterRowsBy({
    typ: selectedTyp || undefined,
    year: selectedYear || undefined,
    month: selectedMonth || undefined,
  });
  const sellers = useMemo(() => {
    const set = new Set(rowsForSprzedawca.map((row) => row.sprzedawca).filter(Boolean));
    const list = Array.from(set).sort((a, b) => a.localeCompare(b));
    if (selectedSprzedawca && !set.has(selectedSprzedawca)) {
      list.push(selectedSprzedawca);
      list.sort((a, b) => a.localeCompare(b));
    }
    return list;
  }, [rowsForSprzedawca, selectedSprzedawca]);

  const rowsForTyp = filterRowsBy({
    sprzedawca: selectedSprzedawca || undefined,
    year: selectedYear || undefined,
    month: selectedMonth || undefined,
  });
  const typOptions = useMemo(() => {
    const set = new Set(rowsForTyp.map((row) => row.typ).filter(Boolean));
    const list = Array.from(set)
      .map((value) => ({ value, label: getTypMeta(value).label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (selectedTyp && !set.has(selectedTyp)) {
      list.push({ value: selectedTyp, label: getTypMeta(selectedTyp).label });
      list.sort((a, b) => a.label.localeCompare(b.label));
    }
    return list;
  }, [rowsForTyp, selectedTyp]);

  const rowsForYear = filterRowsBy({
    sprzedawca: selectedSprzedawca || undefined,
    typ: selectedTyp || undefined,
    month: selectedMonth || undefined,
  });
  const years = useMemo(() => {
    const set = new Set(
      rowsForYear
        .map((row) => extractPrzyjecieDate(row.data_przyjecia))
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
    sprzedawca: selectedSprzedawca || undefined,
    typ: selectedTyp || undefined,
    year: selectedYear || undefined,
  });
  const months = useMemo(() => {
    const set = new Set(
      rowsForMonth
        .map((row) => extractPrzyjecieDate(row.data_przyjecia))
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
    const response = await fetch(`${apiUrl}/api/analiza-zakupow/filters`);
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
      const response = await fetch(`${apiUrl}/api/analiza-zakupow${query}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setProducts(data);
    } catch (err: any) {
      console.error('❌ Error loading analiza zakupow:', err);
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
      const response = await fetch(`${apiUrl}/api/analiza-zakupow/${encodeURIComponent(kod)}${query}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setDetailsByKod((prev) => ({ ...prev, [kod]: data.by_receipt || [] }));
    } catch (err: any) {
      console.error(`❌ Error loading analiza zakupow details for ${kod}:`, err);
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
        console.error('❌ Error loading analiza zakupow filters:', err);
      });
  }, []);

  useEffect(() => {
    setExpandedKod(null);
    setDetailsByKod({});
    setDetailsErrorByKod({});
    loadProducts(activeFilters);
  }, [selectedSprzedawca, selectedTyp, selectedYear, selectedMonth]);

  useEffect(() => {
    if (refreshTrigger == null) return;

    setExpandedKod(null);
    setDetailsByKod({});
    setDetailsErrorByKod({});
    loadFilterRows()
      .then(setFilterRows)
      .catch((err: any) => {
        console.error('❌ Error refreshing analiza zakupow filters:', err);
      });
    loadProducts(activeFilters);
  }, [refreshTrigger]);

  useEffect(() => {
    if (expandedKod && !products.some((product) => product.kod === expandedKod)) {
      setExpandedKod(null);
    }
  }, [expandedKod, products]);

  const toggleProductDetails = async (kod: string) => {
    if (expandedKod === kod) {
      setExpandedKod(null);
      return;
    }

    setExpandedKod(kod);
    await loadDetails(kod);
  };

  const totalButelki = products.reduce((sum, product) => sum + (product.ilosc || 0), 0);
  const totalNetto = products.reduce((sum, product) => sum + (product.netto || 0), 0);
  const hasActiveFilters = selectedSprzedawca || selectedTyp || selectedYear || selectedMonth;

  const clearFilters = () => {
    setSelectedSprzedawca('');
    setSelectedTyp('');
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
              value={selectedSprzedawca}
              onChange={(e) => setSelectedSprzedawca(e.target.value)}
              className={filterSelectClass}
              style={filterSelectStyle}
            >
              <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Sprzedawca</option>
              {sellers.map((sprzedawca) => (
                <option key={sprzedawca} value={sprzedawca} style={{ fontFamily: 'Sora, sans-serif' }}>
                  {sprzedawca}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <select
              value={selectedTyp}
              onChange={(e) => setSelectedTyp(e.target.value)}
              className={filterSelectClass}
              style={filterSelectStyle}
            >
              <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Typ</option>
              {typOptions.map((opt) => (
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

      <div className="flex w-full justify-center items-center gap-6 px-4">
        <span className="text-sm text-gray-600 font-sora">
          Butelki:{' '}
          <span className="font-bold">{formatBottles(totalButelki)}</span>
        </span>
        <span className="text-sm text-gray-600 font-sora">
          Netto:{' '}
          <span className="font-bold">{formatNetto(totalNetto)}</span>
        </span>
      </div>

      <div className="w-full overflow-y-scroll max-h-[calc(100dvh-280px)] relative">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr>
            <th
              className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
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
              onClick={() => handleSort('sprzedawca')}
            >
              <div className="flex items-center gap-1">
                Sprzedawca
                <SortIndicator field="sprzedawca" sortField={sortField} sortDirection={sortDirection} />
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
              className="px-8 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
              onClick={() => handleSort('netto')}
            >
              <div className="flex items-center justify-end gap-1">
                Suma netto
                <SortIndicator field="netto" sortField={sortField} sortDirection={sortDirection} />
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {isLoading ? (
            <tr>
              <td colSpan={5} className="px-8 py-8 text-center text-sm text-gray-500 font-sora">
                Ładowanie danych...
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={5} className="px-8 py-8 text-center text-sm text-red-600 font-sora">
                {error}
              </td>
            </tr>
          ) : products.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-8 py-8 text-center text-sm text-gray-500 font-sora">
                Brak danych o zakupach
              </td>
            </tr>
          ) : (
            sortedProducts.map((product) => {
              const isExpanded = expandedKod === product.kod;
              const receiptRows = isExpanded ? detailsByKod[product.kod] || [] : [];
              const isDetailsLoading = detailsLoadingKod === product.kod;
              const detailsError = detailsErrorByKod[product.kod];

              return (
                <React.Fragment key={product.kod}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleProductDetails(product.kod)}
                  >
                    <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-900 font-sora">
                      {product.kod}
                    </td>
                    <td className="px-8 py-3 text-sm text-gray-900 font-sora">
                      {product.nazwa}
                    </td>
                    <td className="px-8 py-3 text-sm text-gray-600 font-sora">
                      {product.sprzedawca}
                    </td>
                    <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-600 font-sora">
                      {product.ilosc}
                    </td>
                    <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-600 font-sora text-right">
                      {formatNetto(product.netto)}
                    </td>
                  </tr>

                  {isExpanded && isDetailsLoading && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-8 py-3 text-sm text-gray-500 font-sora">
                        Ładowanie szczegółów...
                      </td>
                    </tr>
                  )}

                  {isExpanded && detailsError && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-8 py-3 text-sm text-red-600 font-sora">
                        {detailsError}
                      </td>
                    </tr>
                  )}

                  {isExpanded && !isDetailsLoading && !detailsError && receiptRows.length === 0 && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-8 py-3 text-sm text-gray-500 font-sora">
                        Brak danych o przyjęciach
                      </td>
                    </tr>
                  )}

                  {isExpanded &&
                    !isDetailsLoading &&
                    !detailsError &&
                    receiptRows.map((row) => (
                      <tr key={`${product.kod}-${row.receipt_id}`} className="bg-gray-50">
                        <td className="px-8 py-2 pl-12 whitespace-nowrap text-sm text-gray-500 font-sora">
                          {formatPrzyjecieDate(row.data_przyjecia)}
                        </td>
                        <td className="px-8 py-2 text-sm text-gray-500 font-sora" />
                        <td className="px-8 py-2 text-sm text-gray-700 font-sora">
                          {row.sprzedawca}
                        </td>
                        <td className="px-8 py-2 whitespace-nowrap text-sm text-gray-600 font-sora">
                          {row.ilosc}
                        </td>
                        <td className="px-8 py-2 whitespace-nowrap text-sm text-gray-600 font-sora text-right">
                          {formatNetto(row.netto)}
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
    </div>
  );
};
