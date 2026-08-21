import React, { useState, useEffect } from 'react';
import { Eye, Edit, X } from 'lucide-react';
import Modal from 'react-modal';
import toast from 'react-hot-toast';
import { OrderDetailsModal } from './OrderDetailsModal';
import { EditOrderModal } from './EditOrderModal';
import { InvoiceModal } from './InvoiceModal';

// Извлечение даты из номера заказа (формат: ..._dzień_miesiąc_rok, np. 1101_12_09_2025)
const extractDateFromOrderNumber = (orderNumber: string): Date | null => {
  try {
    const datePattern = /(\d{1,2})_(\d{1,2})_(\d{4})$/;
    const match = orderNumber.match(datePattern);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) return date;
    }
    return null;
  } catch {
    return null;
  }
};

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
  client_id?: number | null;
  klient: string;
  numer_zamowienia: string;
  data_utworzenia: string;
  laczna_ilosc: number;
  typ?: string;
  numer_zwrotu?: string;
  numer_faktury?: string | null;
  products?: OrderProduct[];
}

interface OrdersListProps {
  onDeleteOrder?: (orderId: number) => void;
  onUpdateOrder?: (data: {
    id: number;
    klient: string;
    numer_zamowienia: string;
    products: Array<{
      kod: string;
      kod_kreskowy?: string;
      nazwa: string;
      ilosc: number;
      typ: string;
    }>;
  }) => void;
  onInvoiceCreated?: () => void;
  refreshTrigger?: number;
}

export const OrdersList: React.FC<OrdersListProps> = ({ 
  onDeleteOrder,
  onUpdateOrder,
  onInvoiceCreated,
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
  const [orderStatuses, setOrderStatuses] = useState<Record<number, 'przygotowane' | 'wysłane'>>({});
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [orderForInvoice, setOrderForInvoice] = useState<Order | null>(null);

  const [sortField, setSortField] = useState<string>('data_utworzenia');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedKlient, setSelectedKlient] = useState<string>('');
  const [selectedTyp, setSelectedTyp] = useState<string>('');

  const loadOrders = async () => {
    try {
      console.log('🔄 Starting to load orders...');
      setIsLoading(true);
      setError(null);
      
      console.log('📡 Fetching from /api/orders-with-products...');
      const response = await fetch('/api/orders-with-products');
      console.log('📡 Response status:', response.status);
      console.log('📡 Response ok:', response.ok);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const rawData = await response.json();
      console.log('📡 Raw data received:', rawData);
      console.log('📡 Raw data length:', rawData.length);
      
      // Data is already properly structured with products array
      const transformedOrders = rawData.map((order: any) => ({
        id: order.id,
        client_id: order.client_id ?? null,
        klient: order.klient,
        numer_zamowienia: order.numer_zamowienia,
        data_utworzenia: order.data_utworzenia,
        laczna_ilosc: order.laczna_ilosc,
        typ: order.typ || 'zamowienie',
        numer_zwrotu: order.numer_zwrotu || null,
        numer_faktury: order.numer_faktury ?? null,
        products: order.products || []
      }));
      console.log('🔄 Transformed orders:', transformedOrders);
      console.log('🔄 Orders count:', transformedOrders.length);
      setOrders(transformedOrders);
    } catch (error) {
      console.error('❌ Error loading orders:', error);
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
    if (order.numer_faktury) return; // редактирование недоступно после создания фактуры
    setOrderToEdit(order);
    setIsEditModalOpen(true);
  };

  const handleCreateInvoice = (order: Order) => {
    if (order.numer_faktury) return; // фактура уже создана
    setOrderForInvoice(order);
    setIsInvoiceModalOpen(true);
  };

  const handleEditSubmit = async (data: {
    id: number;
    klient: string;
    numer_zamowienia: string;
    products: Array<{
      kod: string;
      kod_kreskowy?: string;
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

  const handlePasswordSubmit = async () => {
    if (password === '5202') {
      if (orderToDelete?.id) {
        try {
          // Вызываем переданную функцию, если она есть
          if (onDeleteOrder) {
            onDeleteOrder(orderToDelete.id);
          }
          
          // Выполняем удаление через API в любом случае
          const response = await fetch(`/api/orders/${orderToDelete.id}`, {
            method: 'DELETE',
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          console.log('Order deleted:', result);
          
          toast.success('Zamówienie zostało usunięte');
          loadOrders(); // Перезагружаем список заказов
        } catch (error) {
          console.error('Error deleting order:', error);
          toast.error(error instanceof Error ? error.message : 'Błąd podczas usuwania zamówienia');
        }
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
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePasswordSubmit();
    }
  };

  // Отправка заявки в WMS через наш backend
  const sendOrderToWMS = async (order: Order) => {
    try {
      console.log('📦 Отправка заявки в WMS через backend, orderId:', order.id);
      
      const response = await fetch('/api/wms/send-shipment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderId: order.id })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      console.log('✅ Ответ от backend:', data);
      toast.success(`Заявка отправлена в WMS: ${data.wmsShipmentId || 'успешно'}`);
      return true;
    } catch (error) {
      console.error('❌ Ошибка отправки в WMS:', error);
      toast.error(`Ошибка отправки в WMS: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      return false;
    }
  };

  const handleStatusChange = async (orderId: number, newStatus: 'przygotowane' | 'wysłane') => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const oldStatus = orderStatuses[orderId] || 'przygotowane';

    // Если меняем на "wysłane", отправляем в WMS
    if (oldStatus === 'przygotowane' && newStatus === 'wysłane') {
      const loadingToast = toast.loading('Отправка в WMS...');
      
      const success = await sendOrderToWMS(order);
      
      toast.dismiss(loadingToast);
      
      if (!success) {
        // Если ошибка, не меняем статус
        return;
      }
    }

    // Обновляем статус
    setOrderStatuses(prev => ({
      ...prev,
      [orderId]: newStatus
    }));
    
    if (oldStatus !== 'przygotowane' || newStatus !== 'wysłane') {
      toast.success(`Status zamówienia zmieniony na: ${newStatus}`);
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



  // Вспомогательная фильтрация без одного измерения (для построения опций)
  const filterOrdersBy = (
    opts: { klient?: string; typ?: string; year?: string; month?: string }
  ): Order[] => {
    return orders.filter(order => {
      if (opts.klient !== undefined && opts.klient && order.klient !== opts.klient) return false;
      if (opts.typ !== undefined && opts.typ && (order.typ || 'zamowienie') !== opts.typ) return false;
      const date = extractDateFromOrderNumber(order.numer_zamowienia);
      if (!date) {
        if (opts.year || opts.month) return false;
        return true;
      }
      if (opts.year && date.getFullYear().toString() !== opts.year) return false;
      if (opts.month && (date.getMonth() + 1).toString().padStart(2, '0') !== opts.month) return false;
      return true;
    });
  };

  const allMonths = [
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

  const typLabel: Record<string, string> = {
    zamowienie: 'Zamówienie',
    zwrot: 'Zwrot',
    odpisanie: 'Rozchód',
    przesuniecie: 'Przesunięcie',
    przychod: 'Przychód'
  };

  // Опции Klient: только те, что есть при выбранных Typ, Rok, Msc
  const ordersForKlient = filterOrdersBy({
    typ: selectedTyp || undefined,
    year: selectedYear || undefined,
    month: selectedMonth || undefined
  });
  const clientsSet = new Set(ordersForKlient.map(o => o.klient).filter(Boolean));
  const clients = Array.from(clientsSet).sort((a, b) => a.localeCompare(b));
  if (selectedKlient && !clientsSet.has(selectedKlient)) {
    clients.push(selectedKlient);
    clients.sort((a, b) => a.localeCompare(b));
  }

  // Опции Typ: только те, что есть при выбранных Klient, Rok, Msc
  const ordersForTyp = filterOrdersBy({
    klient: selectedKlient || undefined,
    year: selectedYear || undefined,
    month: selectedMonth || undefined
  });
  const typSet = new Set(ordersForTyp.map(o => o.typ || 'zamowienie'));
  const typOptions = Array.from(typSet).map(value => ({ value, label: typLabel[value] || value }));
  if (selectedTyp && !typSet.has(selectedTyp)) {
    typOptions.push({ value: selectedTyp, label: typLabel[selectedTyp] || selectedTyp });
  }

  // Опции Rok: только годы из numer_zamowienia при выбранных Klient, Typ, Msc
  const ordersForYear = filterOrdersBy({
    klient: selectedKlient || undefined,
    typ: selectedTyp || undefined,
    month: selectedMonth || undefined
  });
  const yearsSet = new Set(
    ordersForYear
      .map(o => extractDateFromOrderNumber(o.numer_zamowienia))
      .filter((d): d is Date => d !== null)
      .map(d => d.getFullYear().toString())
  );
  const years = Array.from(yearsSet).sort((a, b) => parseInt(b) - parseInt(a));
  if (selectedYear && !yearsSet.has(selectedYear)) {
    years.push(selectedYear);
    years.sort((a, b) => parseInt(b) - parseInt(a));
  }

  // Опции Msc: только месяцы из numer_zamowienia при выбранных Klient, Typ, Rok
  const ordersForMonth = filterOrdersBy({
    klient: selectedKlient || undefined,
    typ: selectedTyp || undefined,
    year: selectedYear || undefined
  });
  const monthsSet = new Set(
    ordersForMonth
      .map(o => extractDateFromOrderNumber(o.numer_zamowienia))
      .filter((d): d is Date => d !== null)
      .map(d => (d.getMonth() + 1).toString().padStart(2, '0'))
  );
  const months = allMonths.filter(m => monthsSet.has(m.value));
  if (selectedMonth && !monthsSet.has(selectedMonth)) {
    const extra = allMonths.find(m => m.value === selectedMonth);
    if (extra) months.push(extra);
    months.sort((a, b) => a.value.localeCompare(b.value));
  }

  // Итоговая фильтрация по всем четырём фильтрам
  const filteredOrders = orders.filter(order => {
    if (selectedKlient && order.klient !== selectedKlient) return false;
    if (selectedTyp && (order.typ || 'zamowienie') !== selectedTyp) return false;
    const date = extractDateFromOrderNumber(order.numer_zamowienia);
    if (!date) {
      return !selectedYear && !selectedMonth;
    }
    if (selectedYear && date.getFullYear().toString() !== selectedYear) return false;
    if (selectedMonth && (date.getMonth() + 1).toString().padStart(2, '0') !== selectedMonth) return false;
    return true;
  });

  // Сортировка отфильтрованных заказов (для numer_zamowienia: сначала по дате из номера, затем по префиксу/номеру)
  const sortedOrders = filteredOrders.sort((a, b) => {
    if (sortField === 'numer_zamowienia') {
      const aDate = extractDateFromOrderNumber(a.numer_zamowienia || '');
      const bDate = extractDateFromOrderNumber(b.numer_zamowienia || '');
      const aTime = aDate ? aDate.getTime() : null;
      const bTime = bDate ? bDate.getTime() : null;
      if (aTime != null && bTime != null) {
        const byDate = sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
        if (byDate !== 0) return byDate;
      } else if (aTime != null && bTime == null) return sortDirection === 'desc' ? -1 : 1;
      else if (aTime == null && bTime != null) return sortDirection === 'desc' ? 1 : -1;
      const byNum = (a.numer_zamowienia || '').localeCompare(b.numer_zamowienia || '', undefined, { numeric: true });
      return sortDirection === 'asc' ? byNum : -byNum;
    }

    let aValue: any;
    let bValue: any;
    
    switch (sortField) {
      case 'klient':
        aValue = (a.klient || '').toLowerCase();
        bValue = (b.klient || '').toLowerCase();
        break;
      case 'laczna_ilosc':
        aValue = a.laczna_ilosc;
        bValue = b.laczna_ilosc;
        break;
      case 'data_utworzenia':
        aValue = new Date(a.data_utworzenia);
        bValue = new Date(b.data_utworzenia);
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

  return (
    <div className="space-y-4">
      <div className="w-full overflow-y-scroll max-h-[calc(100dvh-280px)] relative">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            {/* Строка с фильтрами Klient i Typ — белый фон, ровно над Rok i Msc */}
            <tr className="bg-white border-b border-gray-200">
              <th colSpan={5} className="px-8 py-2 font-sora" />
              <th className="px-4 py-2 text-right font-sora bg-white">
                <div className="flex space-x-1 justify-end">
                  <select
                    value={selectedKlient}
                    onChange={(e) => setSelectedKlient(e.target.value)}
                    className="block px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300 truncate"
                    style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', width: '145px', minWidth: '145px', maxWidth: '145px' }}
                  >
                    <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Klient</option>
                    {clients.map(klient => (
                      <option key={klient} value={klient} style={{ fontFamily: 'Sora, sans-serif' }}>{klient}</option>
                    ))}
                  </select>
                  <select
                    value={selectedTyp}
                    onChange={(e) => setSelectedTyp(e.target.value)}
                    className="block w-auto px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300"
                    style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', minWidth: '145px' }}
                  >
                    <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Typ</option>
                    {typOptions.map(opt => (
                      <option key={opt.value} value={opt.value} style={{ fontFamily: 'Sora, sans-serif' }}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </th>
            </tr>
            <tr>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('numer_zamowienia')}
              >
                Numer zamówienia
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('klient')}
              >
                Klient
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('typ')}
              >
                Typ
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('laczna_ilosc')}
              >
                Łączna ilość
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('data_utworzenia')}
              >
                Data utworzenia
              </th>

              <th className="px-4 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
                <div className="flex space-x-1 justify-end">
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="block w-auto px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300"
                    style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', minWidth: '145px' }}
                  >
                    <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Rok</option>
                    {years.map(year => (
                      <option key={year} value={year} style={{ fontFamily: 'Sora, sans-serif' }}>{year}</option>
                    ))}
                  </select>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="block w-auto px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300"
                    style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', minWidth: '145px' }}
                  >
                    <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Miesiąc</option>
                    {months.map(month => (
                      <option key={month.value} value={month.value} style={{ fontFamily: 'Sora, sans-serif' }}>{month.label}</option>
                    ))}
                  </select>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedOrders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-8 py-8 text-center text-sm text-gray-500 font-sora">
                  Brak zamówień
                </td>
              </tr>
            ) : (
              sortedOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                    {order.numer_zamowienia}
                  </td>
                  <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                    {order.klient}
                  </td>
                  <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      order.typ === 'zwrot' 
                        ? 'bg-red-100 text-red-800 border border-red-200'
                        : order.typ === 'odpisanie'
                        ? 'bg-green-100 text-green-800 border border-green-200'
                        : order.typ === 'przesuniecie'
                        ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                        : order.typ === 'przychod'
                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                        : 'bg-blue-100 text-blue-800 border border-blue-200'
                    }`}>
                      {order.typ === 'zwrot' ? 'Zwrot' : order.typ === 'odpisanie' ? 'Rozchód' : order.typ === 'przesuniecie' ? 'Przesunięcie' : order.typ === 'przychod' ? 'Przychód' : 'Zamówienie'}
                    </span>
                  </td>
                  <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                    {order.laczna_ilosc}
                  </td>
                  <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                    {formatDate(order.data_utworzenia)}
                  </td>
                  <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                    <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); handleViewDetails(order); }}
                        className="text-blue-600 hover:text-blue-800 focus:outline-none"
                        title="Zobacz szczegóły"
                      >
                        <Eye size={16} />
                      </button>
                      {order.typ !== 'przesuniecie' && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => { 
                              e.preventDefault(); 
                              e.stopPropagation(); 
                              handleCreateInvoice(order); 
                            }}
                            disabled={!!order.numer_faktury}
                            className={order.numer_faktury
                              ? "text-purple-600 font-semibold text-sm cursor-default opacity-100 disabled:opacity-100 disabled:cursor-default"
                              : "text-purple-200 hover:text-purple-400 focus:outline-none font-semibold text-sm"
                            }
                            title={order.numer_faktury ? order.numer_faktury : "Utwórz fakturę"}
                          >
                            FV
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { 
                              e.preventDefault(); 
                              e.stopPropagation(); 
                              handleEdit(order); 
                            }}
                            disabled={!!order.numer_faktury}
                            className="text-green-600 hover:text-green-800 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                            title={order.numer_faktury ? `🚫 Edytowanie niedostępne (utworzono fakturę ${order.numer_faktury})` : "Edytuj"}
                          >
                            <Edit size={16} />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!order.numer_faktury) handleDeleteClick(order); }}
                        disabled={!!order.numer_faktury}
                        className="text-red-600 hover:text-red-800 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        title={order.numer_faktury ? `🚫 Usunięcie niedostępne (utworzono fakturę ${order.numer_faktury})` : "Usuń"}
                      >
                        <X size={16} />
                      </button>
                      </div>
                      {order.typ !== 'przesuniecie' && (
                        <select
                          value={orderStatuses[order.id] || 'przygotowane'}
                          onChange={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleStatusChange(order.id, e.target.value as 'przygotowane' | 'wysłane');
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-0 focus:border-gray-300 font-sora"
                          style={{ fontFamily: 'Sora, sans-serif' }}
                        >
                          <option value="przygotowane">Przygotowane</option>
                          <option value="wysłane">Wysłane</option>
                        </select>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
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

      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => {
          setIsInvoiceModalOpen(false);
          setOrderForInvoice(null);
        }}
        onSuccess={() => {
          onInvoiceCreated?.();
          loadOrders();
        }}
        orderData={orderForInvoice}
      />
    </div>
  );
}; 