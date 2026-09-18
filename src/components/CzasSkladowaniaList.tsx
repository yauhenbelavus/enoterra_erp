import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { SortIndicator } from './SortIndicator';
import { compareCzasSkladowania, useTableSort } from '../utils/tableSort';

const TYPY_TOWARU: Record<string, { label: string; color: string }> = {
  czerwone: { label: 'Czerwone', color: 'bg-red-100 text-red-800 border-red-200' },
  biale: { label: 'Białe', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  musujace: { label: 'Musujące', color: 'bg-yellow-50 text-yellow-600 border-yellow-100' },
  bezalkoholowe: { label: 'Bezalkoholowe', color: 'bg-green-100 text-green-800 border-green-200' },
  ferment: { label: 'Ferment', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  rozowe: { label: 'Różowe', color: 'bg-pink-100 text-pink-800 border-pink-200' },
  slodkie: { label: 'Słodkie', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  aksesoria: { label: 'Aksesoria', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  amber: { label: 'Amber', color: 'bg-amber-100 text-amber-800 border-amber-200' },
};

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
}

interface ProductReceipt {
  id?: number;
  dataPrzyjecia: string;
}

interface StorageRow {
  id: number;
  kod: string;
  nazwa: string;
  typ: string | null;
  ilosc: number;
  dataPrzyjecia: string | null;
  dni: number;
}

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

const daysOnWarehouse = (value?: string | null, today = new Date()): number => {
  const date = parseLocalDate(value);
  if (!date) return 0;
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.max(0, Math.round((to - from) / 86400000));
};

const formatDate = (value?: string | null): string => {
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString('pl-PL') : '-';
};

const getTypMeta = (typ?: string | null) =>
  (typ && TYPY_TOWARU[typ]) || { label: typ || '-', color: 'bg-gray-100 text-gray-800 border-gray-200' };

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

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [productsRes, sheetsRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/working-sheets'),
      ]);

      if (!productsRes.ok) {
        throw new Error(`HTTP error! status: ${productsRes.status}`);
      }
      if (!sheetsRes.ok) {
        throw new Error(`HTTP error! status: ${sheetsRes.status}`);
      }

      const products: ProductBatch[] = await productsRes.json();
      const sheets: WorkingSheet[] = await sheetsRes.json();

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

        nextRows.push({
          id: product.id,
          kod: product.kod,
          nazwa: sheet?.nazwa || product.nazwa,
          typ: sheet?.typ || null,
          ilosc: remaining,
          dataPrzyjecia,
          dni: daysOnWarehouse(dataPrzyjecia),
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
      return row.kod.toLowerCase().includes(query) || row.nazwa.toLowerCase().includes(query);
    });
  }, [rows, searchTerm, selectedTyp, hideZeroStock]);

  const { sortField, sortDirection, handleSort, sortedItems } = useTableSort(filteredRows, {
    defaultField: 'dni',
    defaultDirection: 'desc',
    persistKeys: { field: 'czasSkladowaniaSortField', direction: 'czasSkladowaniaSortDirection' },
    directionForField: (field) => (field === 'dni' || field === 'ilosc' ? 'desc' : 'asc'),
    compareItems: compareCzasSkladowania,
  });

  const oldestDays = sortedItems.reduce((max, row) => Math.max(max, row.dni), 0);
  const totalQty = sortedItems.reduce((sum, row) => sum + row.ilosc, 0);
  const uniqueProducts = useMemo(
    () => new Set(sortedItems.map((row) => row.kod)).size,
    [sortedItems]
  );

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

      <div className="flex flex-wrap gap-4">
        <div className="bg-white p-2 rounded-lg border max-w-[170px] w-full sm:w-auto flex-1 min-w-[170px]">
          <h3 className="text-xs font-medium text-gray-500 font-sora">Liczba partii</h3>
          <p className="text-2xl font-bold text-gray-900 font-sora">{sortedItems.length}</p>
        </div>
        <div className="bg-white p-2 rounded-lg border max-w-[170px] w-full sm:w-auto flex-1 min-w-[170px]">
          <h3 className="text-xs font-medium text-gray-500 font-sora">Liczba artykułów</h3>
          <p className="text-2xl font-bold text-gray-900 font-sora">{uniqueProducts}</p>
        </div>
        <div className="bg-white p-2 rounded-lg border max-w-[170px] w-full sm:w-auto flex-1 min-w-[170px]">
          <h3 className="text-xs font-medium text-gray-500 font-sora">Łączna ilość</h3>
          <p className="text-2xl font-bold text-green-600 font-sora">{totalQty}</p>
        </div>
        <div className="bg-white p-2 rounded-lg border max-w-[170px] w-full sm:w-auto flex-1 min-w-[170px]">
          <h3 className="text-xs font-medium text-gray-500 font-sora">Najstarsza partia</h3>
          <p className="text-2xl font-bold text-red-600 font-sora">{sortedItems.length > 0 ? `${oldestDays} dni` : '-'}</p>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        <div className="w-full overflow-x-auto overflow-y-scroll max-h-[calc(100dvh-280px)] relative">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                <th
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                  onClick={() => handleSort('kod')}
                >
                  <div className="flex items-center gap-1">
                    Kod
                    <SortIndicator field="kod" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                  onClick={() => handleSort('nazwa')}
                >
                  <div className="flex items-center gap-1">
                    Nazwa
                    <SortIndicator field="nazwa" sortField={sortField} sortDirection={sortDirection} />
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
                  onClick={() => handleSort('dataPrzyjecia')}
                >
                  <div className="flex items-center gap-1">
                    Data przyjęcia
                    <SortIndicator field="dataPrzyjecia" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                  onClick={() => handleSort('dni')}
                >
                  <div className="flex items-center gap-1">
                    Dni na magazynie
                    <SortIndicator field="dni" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-8 text-center text-sm text-gray-500 font-sora">
                    Brak towarów na magazynie
                  </td>
                </tr>
              ) : (
                sortedItems.map((row) => {
                  const typMeta = getTypMeta(row.typ);
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora whitespace-nowrap">
                        {row.kod}
                      </td>
                      <td className="px-8 py-4 text-left text-xs text-gray-900 font-sora">
                        {row.nazwa}
                      </td>
                      <td className="px-8 py-4 text-left text-xs font-sora whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-medium ${typMeta.color}`}>
                          {typMeta.label}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora whitespace-nowrap">
                        {row.ilosc}
                      </td>
                      <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora whitespace-nowrap">
                        {formatDate(row.dataPrzyjecia)}
                      </td>
                      <td className="px-8 py-4 text-left text-xs font-sora whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-medium ${getDaysBadgeColor(row.dni)}`}>
                          {row.dni} dni
                        </span>
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
