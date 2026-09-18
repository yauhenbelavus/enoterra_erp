import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { SortIndicator } from './SortIndicator';
import { compareCzasSkladowania, extractDateFromOrderNumber, useTableSort } from '../utils/tableSort';

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
    width: max-content !important;
    min-width: 100% !important;
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
  kod: string;
  nazwa: string;
  typ?: string | null;
  sprzedawca?: string | null;
}

interface ProductReceipt {
  id?: number;
  dataPrzyjecia: string;
  sprzedawca?: string;
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

const ISSUE_SKIP_ORDER_TYPES = new Set(['zwrot', 'przychod', 'przesuniecie']);

interface CzasSkladowaniaListProps {
  productReceipts?: ProductReceipt[];
}

const parseLocalDate = (value?: string | null): Date | null => {
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

const daysBetween = (fromValue?: string | null, toValue?: string | Date | null): number => {
  const from = parseLocalDate(fromValue);
  if (!from) return 0;
  const to = toValue instanceof Date ? toValue : parseLocalDate(toValue) || new Date();
  const fromTime = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const toTime = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.max(0, Math.round((toTime - fromTime) / 86400000));
};

const formatDate = (value?: string | null): string => {
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString('pl-PL') : '-';
};

const getKodIssueDate = (numerZamowienia?: string, dataUtworzenia?: string, createdAt?: string): Date | null => {
  if (numerZamowienia) {
    const fromNumber = extractDateFromOrderNumber(numerZamowienia);
    if (fromNumber) return fromNumber;
  }
  return parseLocalDate(dataUtworzenia) || parseLocalDate(createdAt);
};

const getTypMeta = (typ?: string | null) =>
  TYPY_TOWARU.find((item) => item.value === typ) || {
    label: typ || '-',
    color: 'bg-gray-100 text-gray-800 border-gray-200',
  };

const getDaysBadgeColor = (days: number): string => {
  if (days >= 365) return 'bg-red-100 text-red-800 border-red-200';
  if (days >= 180) return 'bg-orange-100 text-orange-800 border-orange-200';
  if (days >= 90) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-green-100 text-green-800 border-green-200';
};

export const CzasSkladowaniaList: React.FC<CzasSkladowaniaListProps> = ({
  productReceipts = [],
}) => {
  const [rows, setRows] = useState<StorageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTyp, setSelectedTyp] = useState('');
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

      const sheetsByKod = new Map(sheets.map((sheet) => [sheet.kod, sheet]));
      const receiptsById = new Map(
        productReceipts
          .filter((receipt) => receipt.id != null)
          .map((receipt) => [receipt.id as number, receipt])
      );

      const nextRows: StorageRow[] = [];

      for (const product of products) {
        if (!product.kod || product.status === 'samples') continue;
        const remaining = Number(product.ilosc_aktualna) || 0;

        const receipt = product.receipt_id != null ? receiptsById.get(product.receipt_id) : undefined;
        const dataPrzyjecia = receipt?.dataPrzyjecia || product.created_at || null;
        const sheet = sheetsByKod.get(product.kod);

        const lastIssueDate =
          lastIssueByBatch.get(product.id) || lastSaleByKod.get(product.kod) || null;
        const dataOstatniegoWydania = lastIssueDate ? toDateKey(lastIssueDate) : null;
        const dni =
          remaining <= 0 && dataOstatniegoWydania
            ? daysBetween(dataPrzyjecia, dataOstatniegoWydania)
            : daysBetween(dataPrzyjecia);

        nextRows.push({
          id: product.id,
          kod: product.kod,
          nazwa: sheet?.nazwa || product.nazwa,
          sprzedawca: receipt?.sprzedawca || sheet?.sprzedawca || '',
          typ: sheet?.typ || null,
          ilosc: remaining,
          dataPrzyjecia,
          dataOstatniegoWydania,
          dni,
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

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      if (hideZeroStock && row.ilosc <= 0) return false;
      if (selectedTyp && row.typ !== selectedTyp) return false;
      if (!query) return true;
      return (
        row.kod.toLowerCase().includes(query) ||
        row.nazwa.toLowerCase().includes(query) ||
        row.sprzedawca.toLowerCase().includes(query)
      );
    });
  }, [rows, searchTerm, selectedTyp, hideZeroStock]);

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
        <select
          value={selectedTyp}
          onChange={(e) => setSelectedTyp(e.target.value)}
          className="block px-2 py-1.5 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:border-gray-400"
        >
          <option value="">Typ</option>
          {uniqueTypy.map((typ) => (
            <option key={typ} value={typ}>
              {getTypMeta(typ).label}
            </option>
          ))}
        </select>
        {selectedTyp && (
          <button
            type="button"
            onClick={() => setSelectedTyp('')}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-xs font-sora transition-colors"
          >
            Wyczyść filtry
          </button>
        )}
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
              <col />
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
                <th className="border-b border-gray-200 bg-gray-50 p-0" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-8 py-8 text-center text-sm text-gray-500 font-sora">
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
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-sora leading-tight border ${getDaysBadgeColor(row.dni)}`}>
                          {row.dni} dni
                        </span>
                      </td>
                      <td className="p-0" />
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
