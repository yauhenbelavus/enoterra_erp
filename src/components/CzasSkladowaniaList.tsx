import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { SortIndicator } from './SortIndicator';
import { compareCzasSkladowania, useTableSort } from '../utils/tableSort';
import { computeStorageAgeByKod, formatDate } from '../utils/storageAge';

const tableStyles = `
  .react-tooltip {
    z-index: 10000 !important;
    max-width: 400px !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }

  .resizable-table {
    table-layout: fixed !important;
    width: 100% !important;
  }

  .resizable-table th,
  .resizable-table td {
    box-sizing: border-box !important;
    overflow: visible !important;
  }
`;

const TYPY_TOWARU = [
  { value: 'czerwone', label: 'Czerwone', color: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'biale', label: 'Białe', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  { value: 'musujace', label: 'Musujące', color: 'bg-yellow-50 text-yellow-600 border-yellow-100' },
  { value: 'bezalkoholowe', label: 'Bezalkoholowe', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'ferment', label: 'Ferment', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 'rozowe', label: 'Różowe', color: 'bg-pink-100 text-pink-800 border-pink-200' },
  { value: 'slodkie', label: 'Słodkie', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'aksesoria', label: 'Aksesoria', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { value: 'amber', label: 'Amber', color: 'bg-amber-100 text-amber-800 border-amber-200' },
];

interface ProductBatch {
  id: number;
  kod: string;
  nazwa: string;
  ilosc_aktualna: number;
  receipt_id?: number | null;
  created_at?: string | null;
  status?: string | null;
}

interface WorkingSheet {
  id: number;
  kod: string;
  nazwa: string;
  ilosc?: number;
  typ?: string | null;
  sprzedawca?: string | null;
}

interface ProductReceipt {
  id?: number;
  dataPrzyjecia: string;
  sprzedawca?: string;
  products?: Array<{ kod?: string }>;
}

interface OrderConsumption {
  batch_id: number;
  numer_zamowienia?: string;
  data_utworzenia?: string;
  created_at?: string;
}

interface StorageRow {
  id: number;
  kod: string;
  nazwa: string;
  sprzedawca: string;
  typ: string | null;
  ilosc: number;
  dataPrzyjecia: string | null;
  dataOstatniegoWydania: string | null;
  dni: number;
}

interface OrderWithProducts {
  typ?: string;
  numer_zamowienia?: string;
  data_utworzenia?: string;
  products?: Array<{
    kod?: string;
    created_at?: string;
  }>;
}

interface CzasSkladowaniaListProps {
  productReceipts?: ProductReceipt[];
}

const getTypMeta = (typ?: string | null) =>
  TYPY_TOWARU.find((item) => item.value === typ) || {
    label: typ || '-',
    color: 'bg-gray-100 text-gray-800 border-gray-200',
  };

export const CzasSkladowaniaList: React.FC<CzasSkladowaniaListProps> = ({
  productReceipts = [],
}) => {
  const [rows, setRows] = useState<StorageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ sprzedawca: '', typ: '' });
  const [hideZeroStock, setHideZeroStock] = useState(true);
  const [nazwaWidth] = useState<number>(() => {
    const saved = localStorage.getItem('columnWidths');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.nazwa) return parsed.nazwa;
      } catch {
        // keep default
      }
    }
    return 250;
  });

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [productsRes, sheetsRes, consumptionsRes, ordersRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/working-sheets'),
        fetch('/api/order-consumptions'),
        fetch('/api/orders-with-products'),
      ]);

      if (!productsRes.ok) {
        throw new Error(`HTTP error! status: ${productsRes.status}`);
      }
      if (!sheetsRes.ok) {
        throw new Error(`HTTP error! status: ${sheetsRes.status}`);
      }
      if (!consumptionsRes.ok) {
        throw new Error(`HTTP error! status: ${consumptionsRes.status}`);
      }
      if (!ordersRes.ok) {
        throw new Error(`HTTP error! status: ${ordersRes.status}`);
      }

      const products: ProductBatch[] = await productsRes.json();
      const sheets: WorkingSheet[] = await sheetsRes.json();
      const consumptions: OrderConsumption[] = await consumptionsRes.json();
      const ordersWithProducts: OrderWithProducts[] = await ordersRes.json();

      const ageByKod = computeStorageAgeByKod({
        productBatches: products,
        workingSheets: sheets,
        consumptions,
        ordersWithProducts,
        productReceipts,
      });

      const nextRows: StorageRow[] = [];
      for (const sheet of sheets) {
        if (!sheet.kod) continue;
        const age = ageByKod.get(sheet.kod);
        nextRows.push({
          id: sheet.id,
          kod: sheet.kod,
          nazwa: sheet.nazwa,
          sprzedawca: sheet.sprzedawca || '',
          typ: sheet.typ || null,
          ilosc: Number(sheet.ilosc) || 0,
          dataPrzyjecia: age?.dataPrzyjecia ?? null,
          dataOstatniegoWydania: age?.dataOstatniegoWydania ?? null,
          dni: age?.dni ?? 0,
        });
      }

      setRows(nextRows);
    } catch (err) {
      console.error('Error loading storage age:', err);
      setError(err instanceof Error ? err.message : 'Błąd ładowania danych');
    } finally {
      setIsLoading(false);
    }
  }, [productReceipts]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const uniqueTypy = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.typ).filter((typ): typ is string => Boolean(typ)))).sort();
  }, [rows]);

  const uniqueSprzedawcy = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.sprzedawca).filter(Boolean))).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      if (hideZeroStock && row.ilosc <= 0) return false;
      if (filters.typ && row.typ !== filters.typ) return false;
      if (filters.sprzedawca && row.sprzedawca !== filters.sprzedawca) return false;
      if (!query) return true;
      return (
        row.kod.toLowerCase().includes(query) ||
        row.nazwa.toLowerCase().includes(query) ||
        row.sprzedawca.toLowerCase().includes(query)
      );
    });
  }, [rows, searchTerm, filters, hideZeroStock]);

  const { sortField, sortDirection, handleSort, sortedItems } = useTableSort(filteredRows, {
    defaultField: 'dni',
    defaultDirection: 'desc',
    persistKeys: { field: 'czasSkladowaniaSortField', direction: 'czasSkladowaniaSortDirection' },
    directionForField: (field) => (field === 'dni' || field === 'ilosc' ? 'desc' : 'asc'),
    compareItems: compareCzasSkladowania,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 font-sora">{error}</p>
        <button
          onClick={loadData}
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-sora"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <style>{tableStyles}</style>
      <div className="mb-2 flex items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:border-gray-400 w-full font-sora text-xs"
          />
        </div>
        <label
          className="flex items-center gap-1.5 text-xs font-sora text-gray-700 cursor-pointer select-none"
          title="Ukryj towary z zerowym stanem"
        >
          <input
            type="checkbox"
            checked={hideZeroStock}
            onChange={(e) => setHideZeroStock(e.target.checked)}
            className="cursor-pointer"
          />
          Ukryj zerowe
        </label>
      </div>

      <div className="flex flex-wrap gap-4 justify-end">
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-2 gap-1">
            <div className="relative">
              <select
                value={filters.sprzedawca}
                onChange={(e) => setFilters((prev) => ({ ...prev, sprzedawca: e.target.value }))}
                className="block px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300 truncate"
                style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', width: '145px', minWidth: '145px', maxWidth: '145px' }}
              >
                <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Sprzedawca</option>
                {uniqueSprzedawcy.map((sprzedawca) => (
                  <option key={sprzedawca} value={sprzedawca} style={{ fontFamily: 'Sora, sans-serif' }}>{sprzedawca}</option>
                ))}
              </select>
            </div>
            <div className="relative">
              <select
                value={filters.typ}
                onChange={(e) => setFilters((prev) => ({ ...prev, typ: e.target.value }))}
                className="block px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300 truncate"
                style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', width: '145px', minWidth: '145px', maxWidth: '145px' }}
              >
                <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Typ</option>
                {uniqueTypy.map((typ) => (
                  <option key={typ} value={typ} style={{ fontFamily: 'Sora, sans-serif' }}>{getTypMeta(typ).label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="h-[34px]">
            {(filters.sprzedawca || filters.typ) && (
              <button
                type="button"
                onClick={() => setFilters({ sprzedawca: '', typ: '' })}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-xs font-sora transition-colors"
              >
                Wyczyść filtry
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        <div className="w-full overflow-x-auto overflow-y-scroll max-h-[calc(100dvh-280px)] relative" style={{ zIndex: 1 }}>
          <table className="w-full resizable-table">
            <colgroup>
              <col style={{ width: '100px' }} />
              <col style={{ width: `${nazwaWidth}px` }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '160px' }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                <th
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                  onClick={() => handleSort('kod')}
                  style={{ width: '100px' }}
                >
                  <div className="flex items-center gap-1">
                    Kod
                    <SortIndicator field="kod" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                  onClick={() => handleSort('nazwa')}
                  style={{ width: `${nazwaWidth}px` }}
                >
                  <div className="flex items-center gap-1">
                    Nazwa
                    <SortIndicator field="nazwa" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                  onClick={() => handleSort('sprzedawca')}
                  style={{ width: '120px' }}
                >
                  <div className="flex items-center gap-1">
                    Sprzedawca
                    <SortIndicator field="sprzedawca" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                  onClick={() => handleSort('ilosc')}
                >
                  <div className="flex items-center gap-1">
                    Ilość
                    <SortIndicator field="ilosc" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                  onClick={() => handleSort('typ')}
                >
                  <div className="flex items-center gap-1">
                    Typ
                    <SortIndicator field="typ" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50 leading-tight"
                  onClick={() => handleSort('dataPrzyjecia')}
                  style={{ width: '90px' }}
                >
                  <div className="flex items-center gap-1">
                    <div className="whitespace-normal">Data<br/>przyjęcia</div>
                    <SortIndicator field="dataPrzyjecia" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50 leading-tight"
                  onClick={() => handleSort('dataOstatniegoWydania')}
                  style={{ width: '110px' }}
                >
                  <div className="flex items-center gap-1">
                    <div className="whitespace-normal">Data ostatniego<br/>wydania</div>
                    <SortIndicator field="dataOstatniegoWydania" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th
                  className="px-4 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50 leading-tight"
                  onClick={() => handleSort('dni')}
                  style={{ width: '160px' }}
                >
                  <div className="flex items-center gap-1">
                    <div className="leading-tight">
                      <div className="whitespace-nowrap">Dni na</div>
                      <div className="whitespace-nowrap">magazynie</div>
                    </div>
                    <SortIndicator field="dni" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-8 py-8 text-center text-sm text-gray-500 font-sora">
                    Brak towarów na magazynie
                  </td>
                </tr>
              ) : (
                sortedItems.map((row) => {
                  const typMeta = getTypMeta(row.typ);
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td
                        className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline"
                        style={{ width: '100px' }}
                      >
                        <div className="break-words leading-tight max-h-8 overflow-hidden">{row.kod}</div>
                      </td>
                      <td
                        className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline"
                        style={{ width: `${nazwaWidth}px` }}
                      >
                        <div className="break-words leading-tight max-h-12 overflow-hidden">{row.nazwa}</div>
                      </td>
                      <td
                        className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap"
                        style={{ width: '120px' }}
                      >
                        {row.sprzedawca}
                      </td>
                      <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                        {row.ilosc}
                      </td>
                      <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                        {row.typ ? (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-sora leading-tight border ${typMeta.color}`}>
                            {typMeta.label}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                        {formatDate(row.dataPrzyjecia)}
                      </td>
                      <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                        {formatDate(row.dataOstatniegoWydania)}
                      </td>
                      <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                        {row.dni}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
