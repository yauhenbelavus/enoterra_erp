import React from 'react';
import { X } from 'lucide-react';
import Modal from 'react-modal';
import { SortableTh } from './SortIndicator';
import { getKomisProductSortValue, useTableSort } from '../utils/tableSort';

interface KomisProduct {
  kod: string;
  nazwa: string;
  ilosc: number;
}

interface KomisClient {
  klient: string;
  products: KomisProduct[];
  total_ilosc: number;
}

interface KomisDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  komisData: KomisClient | null;
}

export const KomisDetailsModal: React.FC<KomisDetailsModalProps> = ({ isOpen, onClose, komisData }) => {
  const products = komisData?.products ?? [];

  const { sortField, sortDirection, handleSort, sortedItems: sortedProducts } = useTableSort(
    products,
    getKomisProductSortValue,
    'nazwa',
    'asc'
  );

  if (!komisData) return null;

  const totalIlosc = komisData.products.reduce((sum, p) => sum + p.ilosc, 0);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={{
        content: {
          width: '800px',
          height: '600px',
          maxWidth: '90%',
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
          zIndex: 9999
        },
        overlay: {
          backgroundColor: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }
      }}
    >
      <div className="font-sora h-full flex flex-col overflow-hidden">
        <div className="flex justify-between items-center mb-8 select-none">
          <h2 className="text-base font-semibold text-gray-800">
            Szczegóły komisu
          </h2>
          <button onClick={onClose} className="text-red-500 focus:outline-none">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 flex-grow overflow-y-auto">
          <div className="bg-orange-50 p-4 rounded-md">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-medium text-gray-700">Klient:</p>
                <p className="text-sm font-bold text-gray-900">{komisData.klient}</p>
              </div>
              <div>
                <p className="font-medium text-gray-700">Liczba pozycji:</p>
                <p className="text-gray-900">{komisData.products.length}</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">
              Produkty w komisie
            </h3>
            {komisData.products && komisData.products.length > 0 ? (
              <table className="w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <SortableTh
                      label="Kod"
                      field="kod"
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28 bg-gray-50"
                    />
                    <SortableTh
                      label="Nazwa"
                      field="nazwa"
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50"
                    />
                    <SortableTh
                      label="Ilość"
                      field="ilosc"
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20 bg-gray-50"
                      align="center"
                    />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedProducts.map((product, idx) => (
                    <tr key={`${product.kod}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-xs text-gray-900 font-medium w-28">
                        {product.kod}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-900">
                        <div className="break-words leading-tight">{product.nazwa}</div>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-900 font-medium w-20 text-center">
                        {product.ilosc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-gray-500">Brak produktów w komisie</p>
            )}
          </div>
        </div>

        <div className="absolute bottom-4 right-4 text-xs text-gray-600 font-sora">
          Razem: <span className="font-semibold text-gray-900">{totalIlosc}</span>
        </div>
      </div>
    </Modal>
  );
};
