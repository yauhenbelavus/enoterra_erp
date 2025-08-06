import React, { useState, useEffect, useRef } from 'react';
import { Eye, Edit, X } from 'lucide-react';
import Modal from 'react-modal';
import toast from 'react-hot-toast';
import { OrderDetailsModal } from './OrderDetailsModal';
import { EditOrderModal } from './EditOrderModal';

interface OrderProduct {
  id: number;
  orderId: number;
  kod: string;
  kod_kreskowy: string;
  nazwa: string;
  ilosc: number;
  typ: string;
  created_at: string;
}

interface Order {
  id: number;
  klient: string;
  numer_zamowienia: string;
  data_utworzenia: string;
  laczna_ilosc: number;
  products?: OrderProduct[];
}

interface OrdersListProps {
  onViewOrder?: (order: Order) => void;
  onEditOrder?: (order: Order) => void;
  onDeleteOrder?: (orderId: number) => void;
  onUpdateOrder?: (data: {
    id: number;
    klient: string;
    numer_zamowienia: string;
    products: Array<{
      kod: string;
      kod_kreskowy: string;
      nazwa: string;
      ilosc: number;
      typ: string;
    }>;
  }) => void;
  refreshTrigger?: number;
}

export const OrdersList: React.FC<OrdersListProps> = ({ 
  onViewOrder, 
  onEditOrder, 
  onDeleteOrder,
  onUpdateOrder,
  refreshTrigger
}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [orderToEdit, setOrderToEdit] = useState<Order | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [password, setPassword] = useState('');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const [sortField, setSortField] = useState<string>('data_utworzenia');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  const loadOrders = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/orders-with-products');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setOrders(data);
    } catch (error) {
      console.error('Error loading orders:', error);
      setError('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    if (refreshTrigger) {
      loadOrders();
    }
  }, [refreshTrigger]);

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

  const handleViewDetails = (order: Order) => {
    setSelectedOrder(order);
    setIsDetailsModalOpen(true);
  };

  const handleEdit = (order: Order) => {
    setOrderToEdit(order);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (data: {
    id: number;
    klient: string;
    numer_zamowienia: string;
    products: Array<{
      kod: string;
      kod_kreskowy: string;
      nazwa: string;
      ilosc: number;
      typ: string;
    }>;
  }) => {
    console.log('OrdersList handleEditSubmit called with data:', data);
    
    if (onUpdateOrder) {
      onUpdateOrder(data);
    } else {
      // Fallback для обратной совместимости
      try {
        console.log('Sending PUT request to update order:', data);
        const response = await fetch(`/api/orders/${data.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        toast.success('Zamówienie zostało zaktualizowane');
        loadOrders(); // Перезагружаем список заказов
      } catch (error) {
        console.error('Error updating order:', error);
        toast.error('Błąd podczas aktualizacji zamówienia');
      }
    }
  };

  const handleDeleteClick = (order: Order) => {
    setOrderToDelete(order);
    setIsPasswordModalOpen(true);
    setPassword('');
  };

  const handlePasswordSubmit = () => {
    if (password === '5202') {
      if (orderToDelete?.id && onDeleteOrder) {
        onDeleteOrder(orderToDelete.id);
        toast.success('Zamówienie zostało usunięte');
      }
      handlePasswordClose();
    } else {
      toast.error('Nieprawidłowe hasło');
      setPassword('');
    }
  };

  const handlePasswordClose = () => {
    setIsPasswordModalOpen(false);
    setOrderToDelete(null);
    setPassword('');
    setPosition({ x: 0, y: 0 });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePasswordSubmit();
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
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

  // Получение уникальных годов и месяцев из данных
  const years = Array.from(new Set(orders.map(order => {
    const date = new Date(order.data_utworzenia);
    return date.getFullYear().toString();
  }))).sort((a, b) => parseInt(b) - parseInt(a));

  const months = [
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
    { value: '12', label: 'Grudzień' }
  ];

  // Фильтрация заказов по году и месяцу
  const filteredOrders = orders.filter(order => {
    // Фильтрация по году
    if (selectedYear) {
      const orderYear = new Date(order.data_utworzenia).getFullYear().toString();
      if (orderYear !== selectedYear) return false;
    }

    // Фильтрация по месяцу
    if (selectedMonth) {
      const orderMonth = (new Date(order.data_utworzenia).getMonth() + 1).toString().padStart(2, '0');
      if (orderMonth !== selectedMonth) return false;
    }

    return true;
  });

  // Сортировка отфильтрованных заказов
  const sortedOrders = filteredOrders.sort((a, b) => {
    let aValue: any;
    let bValue: any;
    
    switch (sortField) {
      case 'numer_zamowienia':
        aValue = (a.numer_zamowienia || '').toLowerCase();
        bValue = (b.numer_zamowienia || '').toLowerCase();
        break;
      case 'klient':
        aValue = (a.klient || '').toLowerCase();
        bValue = (b.klient || '').toLowerCase();
        break;
      case 'data_utworzenia':
        aValue = new Date(a.data_utworzenia);
        bValue = new Date(b.data_utworzenia);
        break;
      case 'laczna_ilosc':
        aValue = a.laczna_ilosc;
        bValue = b.laczna_ilosc;
        break;
      default:
        aValue = (a as any)[sortField] || '';
        bValue = (b as any)[sortField] || '';
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    }
    if (aValue instanceof Date && bValue instanceof Date) {
      return sortDirection === 'asc' ? aValue.getTime() - bValue.getTime() : bValue.getTime() - aValue.getTime();
    }
    return 0;
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="text-gray-500">Ładowanie zamówień...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="text-red-500">Błąd: {error}</div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No orders found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="w-full overflow-y-auto max-h-96">
        <table className="w-full">
          <thead>
            <tr>
              <th 
                className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('numer_zamowienia')}
              >
                Numer zamówienia
              </th>
              <th 
                className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('klient')}
              >
                Klient
              </th>
              <th 
                className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('data_utworzenia')}
              >
                Data utworzenia
              </th>
              <th 
                className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('laczna_ilosc')}
              >
                Łączna ilość
              </th>
              <th className="sticky top-0 z-1 bg-gray-50 px-4 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora">
                <div className="flex space-x-1 justify-end">
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="block w-24 px-1 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-sora"
                    style={{ fontFamily: 'Sora, sans-serif' }}
                  >
                    <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Rok</option>
                    {years.map(year => (
                      <option key={year} value={year} style={{ fontFamily: 'Sora, sans-serif' }}>{year}</option>
                    ))}
                  </select>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="block w-24 px-1 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-sora"
                    style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr' }}
                    size={1}
                  >
                    <option value="">Msc</option>
                    {months.map(month => (
                      <option key={month.value} value={month.value} style={{ fontFamily: 'Sora, sans-serif' }}>{month.label}</option>
                    ))}
                  </select>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedOrders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-50">
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {order.numer_zamowienia}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {order.klient}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {formatDate(order.data_utworzenia)}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {order.laczna_ilosc}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); handleViewDetails(order); }}
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
                        handleEdit(order); 
                      }}
                      className="text-green-600 hover:text-green-800 focus:outline-none"
                      title="Edytuj"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteClick(order); }}
                      className="text-red-600 hover:text-red-800 focus:outline-none"
                      title="Usuń"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Модальное окно для ввода пароля */}
      <Modal
        isOpen={isPasswordModalOpen}
        onRequestClose={handlePasswordClose}
        style={{
          content: {
            width: '400px',
            height: '200px',
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
            <h2 className="text-base font-semibold text-gray-800">Hasło</h2>
            <button
              onClick={handlePasswordClose}
              className="text-red-500 focus:outline-none"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-6 flex-grow">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Wprowadź hasło"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                autoFocus
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 mt-6">
            <button
              onClick={handlePasswordClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 focus:outline-none text-sm"
            >
              Anuluj
            </button>
            <button
              onClick={handlePasswordSubmit}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none text-sm"
            >
              Usuń
            </button>
          </div>
        </div>
      </Modal>

      <OrderDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        order={selectedOrder}
      />

      <EditOrderModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setOrderToEdit(null);
        }}
        onSubmit={(data) => {
          handleEditSubmit(data);
          setIsEditModalOpen(false);
          setOrderToEdit(null);
        }}
        order={orderToEdit}
      />
    </div>
  );
}; 