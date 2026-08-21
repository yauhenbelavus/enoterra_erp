import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import Modal from 'react-modal';
import { SortableTh } from './SortIndicator';
import { getOrderProductSortValue, useTableSort } from '../utils/tableSort';

interface OrderProduct {
  id: number;
  orderId: number;
  kod: string;
  kod_kreskowy: string;
  nazwa: string;
  ilosc: number;
  typ: string;
  created_at: string;
  data_waznosci?: number | null;
}

interface Client {
  id: number;
  firma: string;
  nazwa: string;
  adres: string;
  kontakt: string;
}

interface Order {
  id: number;
  klient: string;
  numer_zamowienia: string;
  laczna_ilosc: number;
  data_utworzenia?: string;
  typ?: string;
  products?: OrderProduct[];
}

interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ isOpen, onClose, order }) => {
  const [orderWithProducts, setOrderWithProducts] = useState<Order | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const TYPY_ZAMOWIENIA = [
    { value: 'sprzedaz', label: 'Sprzedaż', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    { value: 'probka', label: 'Próbka', color: 'bg-green-100 text-green-800 border-green-200' },
    { value: 'degustacja', label: 'Degustacja', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    { value: 'zamiana', label: 'Zamiana', color: 'bg-purple-100 text-purple-800 border-purple-200' },
    { value: 'prezent', label: 'Prezent', color: 'bg-pink-100 text-pink-800 border-pink-200' },
    { value: 'komis', label: 'Komis', color: 'bg-orange-100 text-orange-800 border-orange-200' },
    { value: 'bar', label: 'Bar', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
    { value: 'przesuniecie', label: 'Przesunięcie', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' }
  ];

  const POWODY_ODPISANIA = [
    { value: 'Uszkodzenie', label: 'Uszkodzenie', color: 'bg-red-100 text-red-800 border-red-200' },
    { value: 'Przeterminowanie', label: 'Przeterminowanie', color: 'bg-orange-100 text-orange-800 border-orange-200' },
    { value: 'Utrata', label: 'Utrata', color: 'bg-gray-100 text-gray-800 border-gray-200' },
    { value: 'Inwentaryzacja', label: 'Inwentaryzacja', color: 'bg-blue-100 text-blue-800 border-blue-200' }
  ];

  useEffect(() => {
    if (isOpen && order) {
      loadOrderWithProducts();
      loadClientData();
    }
  }, [isOpen, order]);

  const orderProducts = order ? ((orderWithProducts || order)?.products ?? []) : [];

  const { sortField, sortDirection, handleSort, sortedItems: sortedProducts } = useTableSort(
    orderProducts,
    getOrderProductSortValue,
    'nazwa',
    'asc'
  );

  const loadOrderWithProducts = async () => {
    if (!order) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/orders/${order.id}`);
      if (!response.ok) {
        throw new Error('Failed to load order details');
      }
      const data = await response.json();
      setOrderWithProducts(data);
    } catch (error) {
      console.error('Error loading order details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadClientData = async () => {
    if (!order) return;
    
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(order.klient)}`);
      if (response.ok) {
        const clientData = await response.json();
        setClient(clientData);
      }
    } catch (error) {
      console.error('Error loading client data:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };



  if (!order) return null;

  const displayOrder = orderWithProducts || order;

  const generatePDF = async () => {
    if (!order || !displayOrder) return;
    
    try {
      const response = await fetch(`/api/orders/${order.id}/pdf`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      // Получаем blob и создаем ссылку для скачивания
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Формируем название файла: клиент_номер_заказа.pdf
      const clientName = client ? client.nazwa : displayOrder.klient;
      const fileName = `${clientName}_${displayOrder.numer_zamowienia}.pdf`;
      
      console.log('Frontend filename generation:');
      console.log('Client name:', clientName);
      console.log('Order number:', displayOrder.numer_zamowienia);
      console.log('Generated filename:', fileName);
      
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Błąd podczas generowania PDF');
    }
  };

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
            {displayOrder.typ === 'odpisanie' ? 'Szczegóły rozchodu' : displayOrder.typ === 'przesuniecie' ? 'Szczegóły przesunięcia' : displayOrder.typ === 'przychod' ? 'Szczegóły przychodu' : 'Szczegóły zamówienia'}
          </h2>
          <button
            onClick={onClose}
            className="text-red-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 flex-grow overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <>
              {/* Информация о заказе */}
              <div className="bg-purple-50 p-4 rounded-md">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="font-medium text-gray-700">
                      {displayOrder.typ === 'odpisanie' ? 'Numer rozchodu:' : displayOrder.typ === 'przesuniecie' ? 'Numer przesunięcia:' : displayOrder.typ === 'przychod' ? 'Numer przychodu:' : 'Numer zamówienia:'}
                    </p>
                    <p className="text-sm font-bold text-gray-900">{displayOrder.numer_zamowienia}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">Data utworzenia:</p>
                    <p className="text-gray-900">{formatDate(displayOrder.data_utworzenia || '')}</p>
                  </div>
                </div>
              </div>

              {/* Информация о клиенте */}
              {client && (
                <div className="bg-green-50 p-3 rounded-md">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    <div>
                      <p className="font-medium text-gray-900 text-xs">Nazwa:</p>
                      <p className="text-xs text-gray-900">{client.nazwa}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-xs">Firma:</p>
                      <p className="text-xs text-gray-900">{client.firma}</p>
                    </div>
                    {client.adres && (
                      <div>
                        <p className="font-medium text-gray-900 text-xs">Adres:</p>
                        <p className="text-xs text-gray-900">{client.adres}</p>
                      </div>
                    )}
                    {client.kontakt && (
                      <div>
                        <p className="font-medium text-gray-900 text-xs">Kontakt:</p>
                        <p className="text-xs text-gray-900">{client.kontakt}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Список продуктов */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">
                  {displayOrder.typ === 'odpisanie' ? 'Produkty w rozchodzie' : displayOrder.typ === 'przesuniecie' ? 'Produkty w przesunięciu' : displayOrder.typ === 'przychod' ? 'Produkty w przychodzie' : 'Produkty w zamówieniu'}
                </h3>
                {displayOrder.products && displayOrder.products.length > 0 ? (
                  <div>
                    <table className="w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <SortableTh
                            label="Kod"
                            field="kod"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20 bg-gray-50"
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
                            label="Kod kreskowy"
                            field="kod_kreskowy"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24 bg-gray-50"
                          />
                          <SortableTh
                            label="Ilość"
                            field="ilosc"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16 bg-gray-50"
                          />
                          <SortableTh
                            label={displayOrder.typ === 'odpisanie' ? 'Powód' : displayOrder.typ === 'przesuniecie' ? 'Typ' : displayOrder.typ === 'przychod' ? 'Powód' : 'Typ'}
                            field="typ"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20 bg-gray-50"
                          />
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {sortedProducts.map((product) => (
                          <tr key={product.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-xs text-gray-900 font-medium w-20">
                              {product.kod}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900">
                              <div className="break-words leading-tight">
                                {product.nazwa}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900 w-24">
                              {product.kod_kreskowy || '-'}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900 font-medium w-16 text-center">
                              {product.ilosc}
                            </td>
                            <td className="px-4 py-2 text-xs w-20">
                              {product.typ ? (
                                <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                                  displayOrder.typ === 'odpisanie'
                                    ? POWODY_ODPISANIA.find(t => t.value === product.typ)?.color
                                    : TYPY_ZAMOWIENIA.find(t => t.value === product.typ)?.color
                                  || 'bg-gray-100 text-gray-800 border-gray-200'
                                }`}>
                                  {displayOrder.typ === 'odpisanie'
                                    ? POWODY_ODPISANIA.find(t => t.value === product.typ)?.label || product.typ
                                    : TYPY_ZAMOWIENIA.find(t => t.value === product.typ)?.label || product.typ || '-'}
                                </span>
                              ) : (
                                <span className="text-gray-500">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    {displayOrder.typ === 'odpisanie' ? 'Brak produktów w rozchodzie' : displayOrder.typ === 'przesuniecie' ? 'Brak produktów w przesunięciu' : displayOrder.typ === 'przychod' ? 'Brak produktów w przychodzie' : 'Brak produktów w zamówieniu'}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Общая сумма в правом нижнем углу */}
        <div className="absolute bottom-4 right-4 text-xs text-gray-600 font-sora">
          Razem: <span className="font-semibold text-gray-900">{displayOrder.laczna_ilosc}</span>
        </div>

        {/* Кнопка генерации PDF в левом нижнем углу */}
        <div className="absolute bottom-4 left-4">
          <button
            onClick={generatePDF}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-sora disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                Generowanie...
              </div>
            ) : (
              'Generuj PDF'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}; 