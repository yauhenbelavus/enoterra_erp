import React, { useMemo } from 'react';
import Modal from 'react-modal';
import { X, Grape, Car } from 'lucide-react';
import { ProductDetailsModal } from './ProductDetailsModal';
import { API_URL } from '../config';
import { getWalutaSymbol, normalizeWalutaFaktury } from '../utils/receiptCurrency';
import { SortableTh } from './SortIndicator';
import { getReceiptProductSortValue, useTableSort } from '../utils/tableSort';

interface ProductReceipt {
  id?: number;
  dataPrzyjecia: string;
  sprzedawca: string;
  wartosc: number;
  kosztDostawy: number;
  waluta_faktury?: string;
  walutaFaktury?: string;
  aktualnyKurs?: number;
  podatekAkcyzowy?: number;
  aktualny_kurs?: number;
  podatek_akcyzowy?: number;
  products: Array<{
    kod: string;
    nazwa: string;
    kod_kreskowy?: string;
    ilosc: number;
    cena: number;
    dataWaznosci?: string | number;
    typ?: string;
    objetosc?: number;
  }>;
  productInvoice?: string;
  transportInvoice?: string;
}

interface ReceiptDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: ProductReceipt | null;
}

export const ReceiptDetailsModal: React.FC<ReceiptDetailsModalProps> = ({ isOpen, onClose, receipt }) => {
  const [selectedProduct] = React.useState<any | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStartPos = React.useRef({ x: 0, y: 0 });

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStartPos.current.x,
          y: e.clientY - dragStartPos.current.y
        });
      }
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  const productsArray = useMemo(() => {
    if (!receipt) return [];
    if (Array.isArray(receipt.products)) return receipt.products;
    if (typeof receipt.products === 'string') {
      try {
        return JSON.parse(receipt.products);
      } catch {
        return [];
      }
    }
    return [];
  }, [receipt]);

  const { sortField, sortDirection, handleSort, sortedItems: sortedProducts } = useTableSort(
    productsArray,
    getReceiptProductSortValue,
    'nazwa',
    'asc'
  );

  if (!receipt) return null;

  const waluta = normalizeWalutaFaktury(receipt.waluta_faktury ?? receipt.walutaFaktury);
  const walutaSymbol = getWalutaSymbol(waluta);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={{
        content: {
          width: '850px',
          height: '520px',
          maxWidth: '90%',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
          margin: '0',
          borderRadius: '0.5rem',
          background: 'white',
          overflow: 'hidden',
          outline: 'none',
          padding: '16px',
          fontFamily: 'Sora',
          userSelect: 'none',
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
      <div 
        className="font-sora h-full flex flex-col overflow-hidden"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="flex justify-between items-center mb-8 select-none">
          <h2 className="text-base font-semibold text-gray-800">Szczegóły zakupu</h2>
          <button
            onClick={onClose}
            className="text-red-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-6 flex-grow overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
            <div className="flex items-center">
                              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Data zakupu</label>
              <div className="text-xs text-gray-900 ml-2">{receipt.dataPrzyjecia}</div>
            </div>
            <div className="flex items-center">
              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Sprzedawca</label>
              <div className="text-xs text-gray-900 ml-2">{receipt.sprzedawca}</div>
            </div>
            <div className="flex items-center">
              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Wartość</label>
              <div className="text-xs text-gray-900 ml-2">{receipt.wartosc} {walutaSymbol}</div>
            </div>
            <div className="flex items-center">
              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Koszt dostawy</label>
              <div className="text-xs text-gray-900 ml-2">{receipt.kosztDostawy} €</div>
            </div>
          </div>
          {(receipt.productInvoice || receipt.transportInvoice) && (
            <div className="mb-4 flex gap-6">
              {receipt.productInvoice && (
                <button
                  onClick={() => {
                    const url = `${API_URL}/uploads/${receipt.productInvoice}`;
                    console.log('📎 Opening product invoice:', url);
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  className="inline-flex items-center text-xs text-blue-700 underline hover:text-blue-900 font-sora bg-transparent border-none cursor-pointer"
                >
                  <Grape className="h-4 w-4 mr-1" />
                  Faktura za towar (PDF)
                </button>
              )}
              {receipt.transportInvoice && (
                <button
                  onClick={() => {
                    const url = `${API_URL}/uploads/${receipt.transportInvoice}`;
                    console.log('📎 Opening transport invoice:', url);
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  className="inline-flex items-center text-xs text-blue-700 underline hover:text-blue-900 font-sora bg-transparent border-none cursor-pointer"
                >
                  <Car className="h-4 w-4 mr-1" />
                  Faktura za transport (PDF)
                </button>
              )}
            </div>
          )}
          <div>
            <h3 className="font-semibold mb-2 text-xs">Produkty:</h3>
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead>
                <tr>
                  <SortableTh
                    label="Kod"
                    field="kod"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="px-2 py-2 text-left w-[80px]"
                  />
                  <SortableTh
                    label="Nazwa"
                    field="nazwa"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="px-2 py-2 text-left w-[180px]"
                  />
                  <SortableTh
                    label="Kod kreskowy"
                    field="kod_kreskowy"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="px-2 py-2 text-left w-[100px]"
                  />
                  <SortableTh
                    label="Ilość"
                    field="ilosc"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="px-2 py-2 text-center w-[50px]"
                    align="center"
                  />
                  <SortableTh
                    label="Cena"
                    field="cena"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="px-2 py-2 text-right w-[70px]"
                    align="right"
                  />
                  <SortableTh
                    label="Wartość"
                    field="wartosc"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="px-2 py-2 text-right w-[90px]"
                    align="right"
                  />
                  <SortableTh
                    label="Typ"
                    field="typ"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="px-2 py-2 text-left w-[80px]"
                  />
                  <SortableTh
                    label="Objętość"
                    field="objetosc"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="px-2 py-2 text-left w-[80px]"
                  />
                  <SortableTh
                    label="Data ważności"
                    field="dataWaznosci"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="px-2 py-2 text-left w-[90px]"
                  />
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((product, index) => (
                  <tr key={index}>
                    <td className="px-2 py-2 w-[80px] break-words">{product.kod}</td>
                    <td className="px-2 py-2 w-[180px] break-words leading-tight">{product.nazwa}</td>
                    <td className="px-2 py-2 w-[100px] break-words">{product.kod_kreskowy || '-'}</td>
                    <td className="px-2 py-2 w-[50px] text-center">{product.ilosc}</td>
                    <td className="px-2 py-2 w-[70px] text-right">{product.cena} {walutaSymbol}</td>
                    <td className="px-2 py-2 w-[90px] text-right">{((product.ilosc ?? 0) * (product.cena ?? 0)).toFixed(2).replace('.', ',')} {walutaSymbol}</td>
                    <td className="px-2 py-2 w-[80px] break-words">
                      {(() => {
                        const typ = product.typ;
                        if (!typ) return '-';
                        const typLabels: { [key: string]: string } = {
                          'czerwone': 'Czerwone',
                          'biale': 'Białe',
                          'musujace': 'Musujące',
                          'bezalkoholowe': 'Bezalkoholowe',
                          'ferment': 'Ferment',
                          'rozowe': 'Różowe',
                          'slodkie': 'Słodkie',
                          'aksesoria': 'Aksesoria',
                          'amber': 'Amber'
                        };
                        return typLabels[typ] || typ;
                      })()}
                    </td>
                    <td className="px-2 py-2 w-[80px] break-words">
                      {product.objetosc || '-'}
                    </td>
                    <td className="px-2 py-2 w-[90px] break-words">
                      {product.dataWaznosci
                        ? (typeof product.dataWaznosci === 'number'
                            ? new Date(product.dataWaznosci * 1000).toLocaleDateString('pl-PL')
                            : (new Date(product.dataWaznosci).toLocaleDateString('pl-PL')))
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
        >
          Zamknij
        </button>
      </div>
      <ProductDetailsModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        product={selectedProduct}
      />
    </Modal>
  );
}; 