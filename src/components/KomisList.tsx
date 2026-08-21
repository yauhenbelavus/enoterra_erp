import React, { useState, useEffect } from 'react';
import { Eye, Edit } from 'lucide-react';
import { KomisDetailsModal } from './KomisDetailsModal';
import { EditKomisModal } from './EditKomisModal';
import { InvoiceModal } from './InvoiceModal';
import { SortIndicator } from './SortIndicator';
import { compareKomisClients, useTableSort } from '../utils/tableSort';

interface KomisProduct {
  kod: string;
  nazwa: string;
  ilosc: number;
  ilosc_calculated?: number;
  is_overridden?: boolean;
}

interface KomisClient {
  klient: string;
  products: KomisProduct[];
  total_ilosc: number;
}

interface KomisListProps {
  refreshTrigger?: number;
}

export const KomisList: React.FC<KomisListProps> = ({ refreshTrigger }) => {
  const [data, setData] = useState<KomisClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKomis, setSelectedKomis] = useState<KomisClient | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [komisToEdit, setKomisToEdit] = useState<KomisClient | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceKlient, setInvoiceKlient] = useState<string>('');
  const [invoiceProducts, setInvoiceProducts] = useState<Array<{ kod: string; nazwa: string; ilosc: number; cena_sprzedazy?: number | null }>>([]);

  const { sortField, sortDirection, handleSort, sortedItems: sortedData } = useTableSort(data, {
    defaultField: 'klient',
    defaultDirection: 'asc',
    compareItems: compareKomisClients,
  });

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/komis/summary');
      if (!response.ok) throw new Error('Błąd ładowania danych komisu');
      const result = await response.json();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania danych');
      setData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (refreshTrigger != null) {
      loadData();
    }
  }, [refreshTrigger]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="text-gray-500 font-sora">Ładowanie danych komisu...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="text-red-500 font-sora">Błąd: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="w-full overflow-y-scroll max-h-[calc(100dvh-280px)] relative">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('klient')}
              >
                <div className="flex items-center gap-1">
                  Klient
                  <SortIndicator field="klient" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('products_count')}
              >
                <div className="flex items-center gap-1">
                  Liczba pozycji
                  <SortIndicator field="products_count" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('total_ilosc')}
              >
                <div className="flex items-center gap-1">
                  Łączna ilość
                  <SortIndicator field="total_ilosc" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-8 py-8 text-center text-sm text-gray-500 font-sora">
                  Brak danych komisu
                </td>
              </tr>
            ) : (
              sortedData.map((item) => (
                <tr key={item.klient} className="hover:bg-gray-50">
                  <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                    {item.klient}
                  </td>
                  <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                    {item.products.length}
                  </td>
                  <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                    {item.total_ilosc}
                  </td>
                  <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedKomis(item);
                          setIsDetailsModalOpen(true);
                        }}
                        className="text-blue-600 hover:text-blue-800 focus:outline-none"
                        title="Zobacz szczegóły"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setKomisToEdit(item);
                          setIsEditModalOpen(true);
                        }}
                        className="text-green-600 hover:text-green-800 focus:outline-none"
                        title="Edytuj komis"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          try {
                            const res = await fetch(`/api/komis/client/${encodeURIComponent(item.klient)}`);
                            const data = await res.json();
                            setInvoiceProducts(data.products || []);
                          } catch {
                            setInvoiceProducts([]);
                          }
                          setInvoiceKlient(item.klient);
                          setIsInvoiceModalOpen(true);
                        }}
                        className="text-purple-600 hover:text-purple-800 focus:outline-none font-semibold text-sm"
                        title="Utwórz fakturę"
                      >
                        FV
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <KomisDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedKomis(null);
        }}
        komisData={selectedKomis}
      />

      <EditKomisModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setKomisToEdit(null);
        }}
        onSuccess={() => {
          loadData();
        }}
        komisData={komisToEdit}
      />

      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => {
          setIsInvoiceModalOpen(false);
          setInvoiceKlient('');
          setInvoiceProducts([]);
        }}
        onSuccess={() => {
          setIsInvoiceModalOpen(false);
          setInvoiceKlient('');
          setInvoiceProducts([]);
          loadData();
        }}
        prefilledKlient={invoiceKlient}
        prefilledProducts={invoiceProducts}
      />
    </div>
  );
};
