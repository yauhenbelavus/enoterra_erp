import React from 'react';
import Modal from 'react-modal';
import { Eye, X, Grape, Car } from 'lucide-react';
import { ProductDetailsModal } from './ProductDetailsModal';
import { API_URL } from '../config';

interface ProductReceipt {
  id?: number;
  dataPrzyjecia: string;
  sprzedawca: string;
  wartosc: number;
  kosztDostawy: number;
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
  products?: import('../types/Product').Product[];
}

export const ReceiptDetailsModal: React.FC<ReceiptDetailsModalProps> = ({ isOpen, onClose, receipt, products }) => {
  const [selectedProduct, setSelectedProduct] = React.useState<any | null>(null);
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

  if (!receipt) return null;

  let productsArray: any[] = [];
  if (Array.isArray(receipt.products)) {
    productsArray = receipt.products;
  } else if (typeof receipt.products === 'string') {
    try {
      productsArray = JSON.parse(receipt.products);
    } catch {
      productsArray = [];
    }
  }

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
          userSelect: 'none'
        },
        overlay: {
          backgroundColor: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
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
              <div className="text-xs text-gray-900 ml-2">{receipt.wartosc} €</div>
            </div>
            <div className="flex items-center">
              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Koszt dostawy</label>
              <div className="text-xs text-gray-900 ml-2">{receipt.kosztDostawy} €</div>
            </div>
          </div>
          {(receipt.productInvoice || receipt.transportInvoice) && (
            <div className="mb-4 flex gap-6">
              {receipt.productInvoice && (
                <a
                  href={`${API_URL}${receipt.productInvoice}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-xs text-blue-700 underline hover:text-blue-900 font-sora"
                >
                  <Grape className="h-4 w-4 mr-1" />
                  Faktura za towar (PDF)
                </a>
              )}
              {receipt.transportInvoice && (
                <a
                  href={`${API_URL}${receipt.transportInvoice}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-xs text-blue-700 underline hover:text-blue-900 font-sora"
                >
                  <Car className="h-4 w-4 mr-1" />
                  Faktura za transport (PDF)
                </a>
              )}
            </div>
          )}
          <div>
            <h3 className="font-semibold mb-2 text-xs">Produkty:</h3>
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-2 text-left w-[80px]">Kod</th>
                  <th className="px-2 py-2 text-left w-[180px]">Nazwa</th>
                  <th className="px-2 py-2 text-left w-[100px]">Kod kreskowy</th>
                  <th className="px-2 py-2 text-center w-[50px]">Ilość</th>
                  <th className="px-2 py-2 text-right w-[70px]">Cena</th>
                  <th className="px-2 py-2 text-right w-[90px]">Wartość</th>
                  <th className="px-2 py-2 text-left w-[80px]">Typ</th>
                  <th className="px-2 py-2 text-left w-[80px]">Objętość</th>
                  <th className="px-2 py-2 text-left w-[90px]">Data ważności</th>
                </tr>
              </thead>
              <tbody>
                {productsArray.map((product, index) => (
                  <tr key={index}>
                    <td className="px-2 py-2 w-[80px] break-words">{product.kod}</td>
                    <td className="px-2 py-2 w-[180px] break-words leading-tight">{product.nazwa}</td>
                    <td className="px-2 py-2 w-[100px] break-words">{product.kod_kreskowy || '-'}</td>
                    <td className="px-2 py-2 w-[50px] text-center">{product.ilosc}</td>
                    <td className="px-2 py-2 w-[70px] text-right">{product.cena} €</td>
                    <td className="px-2 py-2 w-[90px] text-right">{(product.ilosc * product.cena).toFixed(2).replace('.', ',')} €</td>
                    <td className="px-2 py-2 w-[80px] break-words">
                      {(() => {
                        const typ = product.typ;
                        if (!typ) return '-';
                        const typLabels: { [key: string]: string } = {
                          'czerwone': 'Czerwone',
                          'biale': 'Białe',
                          'musujace': 'Musujące',
                          'bezalkoholowe': 'Bezalkoholowe',
                          'ferment': 'Ferment'
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