import React, { useEffect, useMemo, useState } from 'react';

interface WydaniaProduct {
  kod: string;
  nazwa: string;
  ilosc: number;
}

interface WydaniaTypRow {
  typ: string;
  ilosc: number;
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

const TYP_LABELS: Record<string, { label: string; color: string }> = {
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

const extractDateFromOrderNumber = (orderNumber: string): Date | null => {
  try {
    const match = orderNumber.match(/(\d{1,2})_(\d{1,2})_(\d{4})$/);
    if (!match) return null;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    const date = new Date(year, month, day);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
};

const getTypMeta = (typ: string) =>
  TYP_LABELS[typ] || { label: typ, color: 'bg-gray-100 text-gray-800 border-gray-200' };

const buildFilterQuery = (filters: {
  klient: string;
  typ: string;
  year: string;
  month: string;
}) => {
  const params = new URLSearchParams();
  if (filters.klient) params.set('klient', filters.klient);
  if (filters.typ) params.set('typ', filters.typ);
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
  const [detailsByKod, setDetailsByKod] = useState<Record<string, WydaniaTypRow[]>>({});
  const [detailsLoadingKod, setDetailsLoadingKod] = useState<string | null>(null);
  const [detailsErrorByKod, setDetailsErrorByKod] = useState<Record<string, string>>({});
  const [selectedKlient, setSelectedKlient] = useState('');
  const [selectedTyp, setSelectedTyp] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');

  const activeFilters = useMemo(
    () => ({
      klient: selectedKlient,
      typ: selectedTyp,
      year: selectedYear,
      month: selectedMonth,
    }),
    [selectedKlient, selectedTyp, selectedYear, selectedMonth]
  );

  const filterRowsBy = (opts: {
    klient?: string;
    typ?: string;
    year?: string;
    month?: string;
  }) => {
    return filterRows.filter((row) => {
      if (opts.klient && row.klient !== opts.klient) return false;
      if (opts.typ && row.typ !== opts.typ) return false;
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
    typ: selectedTyp || undefined,
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
      .map((value) => ({ value, label: getTypMeta(value).label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (selectedTyp && !set.has(selectedTyp)) {
      list.push({ value: selectedTyp, label: getTypMeta(selectedTyp).label });
      list.sort((a, b) => a.label.localeCompare(b.label));
    }
    return list;
  }, [rowsForTyp, selectedTyp]);

  const rowsForYear = filterRowsBy({
    klient: selectedKlient || undefined,
    typ: selectedTyp || undefined,
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
    typ: selectedTyp || undefined,
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
      setDetailsByKod((prev) => ({ ...prev, [kod]: data.by_typ || [] }));
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
    loadProducts(activeFilters);
  }, [selectedKlient, selectedTyp, selectedYear, selectedMonth]);

  useEffect(() => {
    if (refreshTrigger == null) return;

    setExpandedKod(null);
    setDetailsByKod({});
    setDetailsErrorByKod({});
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

  const toggleProductDetails = async (kod: string) => {
    if (expandedKod === kod) {
      setExpandedKod(null);
      return;
    }

    setExpandedKod(kod);
    await loadDetails(kod);
  };

  if (isLoading && products.length === 0) {
    return <div className="text-gray-600 font-sora text-sm py-4">Ładowanie danych...</div>;
  }

  if (error && products.length === 0) {
    return <div className="text-red-600 font-sora text-sm py-4">{error}</div>;
  }

  return (
    <div className="w-full overflow-y-scroll max-h-[calc(100dvh-280px)] relative">
      <table className="w-full">
        <thead className="sticky top-0 z-10">
          <tr className="bg-white border-b border-gray-200">
            <th colSpan={2} className="px-8 py-2 font-sora bg-white" />
            <th className="px-8 py-2 text-right font-sora bg-white">
              <div className="flex space-x-1 justify-end">
                <select
                  value={selectedKlient}
                  onChange={(e) => setSelectedKlient(e.target.value)}
                  className="block px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300 truncate"
                  style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', width: '145px', minWidth: '145px', maxWidth: '145px' }}
                >
                  <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Klient</option>
                  {clients.map((klient) => (
                    <option key={klient} value={klient} style={{ fontFamily: 'Sora, sans-serif' }}>
                      {klient}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedTyp}
                  onChange={(e) => setSelectedTyp(e.target.value)}
                  className="block w-auto px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300"
                  style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', minWidth: '145px' }}
                >
                  <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Typ</option>
                  {typOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} style={{ fontFamily: 'Sora, sans-serif' }}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="block w-auto px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300"
                  style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', minWidth: '145px' }}
                >
                  <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Rok</option>
                  {years.map((year) => (
                    <option key={year} value={year} style={{ fontFamily: 'Sora, sans-serif' }}>
                      {year}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="block w-auto px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300"
                  style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', minWidth: '145px' }}
                >
                  <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Miesiąc</option>
                  {months.map((month) => (
                    <option key={month.value} value={month.value} style={{ fontFamily: 'Sora, sans-serif' }}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>
            </th>
          </tr>
          <tr>
            <th className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
              Kod
            </th>
            <th className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
              Nazwa
            </th>
            <th className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
              Ilość
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {isLoading ? (
            <tr>
              <td colSpan={3} className="px-8 py-8 text-center text-sm text-gray-500 font-sora">
                Ładowanie danych...
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={3} className="px-8 py-8 text-center text-sm text-red-600 font-sora">
                {error}
              </td>
            </tr>
          ) : products.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-8 py-8 text-center text-sm text-gray-500 font-sora">
                Brak danych o wydaniach
              </td>
            </tr>
          ) : (
            products.map((product) => {
              const isExpanded = expandedKod === product.kod;
              const typRows = isExpanded ? detailsByKod[product.kod] || [] : [];
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
                    <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-600 font-sora">
                      {product.ilosc}
                    </td>
                  </tr>

                  {isExpanded && isDetailsLoading && (
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="px-8 py-3 text-sm text-gray-500 font-sora">
                        Ładowanie szczegółów...
                      </td>
                    </tr>
                  )}

                  {isExpanded && detailsError && (
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="px-8 py-3 text-sm text-red-600 font-sora">
                        {detailsError}
                      </td>
                    </tr>
                  )}

                  {isExpanded && !isDetailsLoading && !detailsError && typRows.length === 0 && (
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="px-8 py-3 text-sm text-gray-500 font-sora">
                        Brak danych o typach
                      </td>
                    </tr>
                  )}

                  {isExpanded &&
                    !isDetailsLoading &&
                    !detailsError &&
                    typRows.map((row) => {
                      const meta = getTypMeta(row.typ);
                      return (
                        <tr key={`${product.kod}-${row.typ}`} className="bg-gray-50">
                          <td className="px-8 py-2 pl-12 text-sm font-sora" />
                          <td className="px-8 py-2 text-sm font-sora">
                            <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium border ${meta.color}`}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-8 py-2 whitespace-nowrap text-sm text-gray-600 font-sora">
                            {row.ilosc}
                          </td>
                        </tr>
                      );
                    })}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
