  import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import Modal from 'react-modal';
import { API_URL } from '../config';

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
  data_utworzenia: string;
  laczna_ilosc: number;
  products?: OrderProduct[];
}

interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ isOpen, onClose, order }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const [orderWithProducts, setOrderWithProducts] = useState<Order | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const TYPY_ZAMOWIENIA = [
    { value: 'sprzedaz', label: 'Sprzedaż', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    { value: 'probka', label: 'Próbka', color: 'bg-green-100 text-green-800 border-green-200' },
    { value: 'degustacja', label: 'Degustacja', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    { value: 'zamiana', label: 'Zamiana', color: 'bg-purple-100 text-purple-800 border-purple-200' },
    { value: 'prezent', label: 'Prezent', color: 'bg-pink-100 text-pink-800 border-pink-200' }
  ];

  useEffect(() => {
    if (isOpen && order) {
      loadOrderWithProducts();
      loadClientData();
    }
  }, [isOpen, order]);

  const loadOrderWithProducts = async () => {
    if (!order) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/orders/${order.id}`);
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
      const response = await fetch(`${API_URL}/api/clients/${encodeURIComponent(order.klient)}`);
      if (response.ok) {
        const clientData = await response.json();
        setClient(clientData);
      }
    } catch (error) {
      console.error('Error loading client data:', error);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || 
        (e.target as HTMLElement).closest('input')) {
      return;
    }
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        requestAnimationFrame(() => {
          setPosition({
            x: e.clientX - dragStartPos.current.x,
            y: e.clientY - dragStartPos.current.y
          });
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

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
      const response = await fetch(`${API_URL}/api/orders/${order.id}/pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order: displayOrder,
          client: client
        })
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
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
          margin: '0',
          borderRadius: '0.5rem',
          background: 'white',
          overflow: 'hidden',
          outline: 'none',
          padding: '24px',
          fontFamily: 'Sora',
          cursor: 'grab',
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
          <h2 className="text-base font-semibold text-gray-800">Szczegóły zamówienia</h2>
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
                    <p className="font-medium text-gray-700">Numer zamówienia:</p>
                    <p className="text-sm font-bold text-gray-900">{displayOrder.numer_zamowienia}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">Data utworzenia:</p>
                    <p className="text-gray-900">{formatDate(displayOrder.data_utworzenia)}</p>
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
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Produkty w zamówieniu</h3>
                {displayOrder.products && displayOrder.products.length > 0 ? (
                  <div>
                    <table className="w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                            Kod
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Nazwa
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                            Kod kreskowy
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                            Ilość
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                            Typ
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {displayOrder.products.map((product) => (
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
                                <span className={`px-2 py-1 rounded-md text-xs font-medium ${TYPY_ZAMOWIENIA.find(t => t.value === product.typ)?.color || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
                                  {TYPY_ZAMOWIENIA.find(t => t.value === product.typ)?.label || product.typ}
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
                  <p className="text-xs text-gray-500">Brak produktów w zamówieniu</p>
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