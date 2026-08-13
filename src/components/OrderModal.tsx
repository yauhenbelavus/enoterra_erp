import React, { useState, useEffect, useRef } from 'react';
import Modal from 'react-modal';
import { Search, X, Plus } from 'lucide-react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import "../components/DatePicker.css";
import toast from 'react-hot-toast';
import { ReservationOverflowDialog } from './ReservationOverflowDialog';
import { ProductSearchHintLines } from './ProductSearchHintLines';
import { calculateMaxAllowed, collectReservationOverflows, collectStockOverflowLineIds, enrichStockLinesWithClientReservations } from '../utils/orderStock';

registerLocale('pl', pl);

interface Client {
  id: number;
  firma: string;
  nazwa: string;
  adres: string;
  kontakt: string;
}

interface Product {
  kod: string;
  nazwa: string;
  ilosc: string;
  ilosc_total?: number;
  status?: string | null;
  kodKreskowy: string;
  selectedQuantity?: number;
  ilosc_reserved?: number;
  ilosc_client_reserved?: number;
  ilosc_client_reserved_total?: number;
  sprzedawca?: string;
}

interface ProductSearchField {
  id: number;
  searchQuery: string;
  selectedProduct: Product | null;
  typ: string;
}

interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated?: () => void;
}

export const OrderModal: React.FC<OrderModalProps> = ({ isOpen, onClose, onOrderCreated }) => {
  console.log('🔍 OrderModal render - isOpen:', isOpen);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearchFields, setProductSearchFields] = useState<ProductSearchField[]>([
    { id: 1, searchQuery: '', selectedProduct: null, typ: '' }
  ]);
  const [activeSearchId, setActiveSearchId] = useState<number | null>(null);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);
  const [fieldsWithErrors, setFieldsWithErrors] = useState<Set<number>>(new Set());
  const lastToastFieldId = useRef<number | null>(null);
  const [overflowDialogOpen, setOverflowDialogOpen] = useState(false);
  const [overflowItems, setOverflowItems] = useState<ReturnType<typeof collectReservationOverflows>>([]);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  const TYPY_ZAMOWIENIA = [
    { value: 'sprzedaz', label: 'Sprzedaż', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    { value: 'probka', label: 'Próbka', color: 'bg-green-100 text-green-800 border-green-200' },
    { value: 'degustacja', label: 'Degustacja', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    { value: 'zamiana', label: 'Zamiana', color: 'bg-purple-100 text-purple-800 border-purple-200' },
    { value: 'prezent', label: 'Prezent', color: 'bg-pink-100 text-pink-800 border-pink-200' },
    { value: 'komis', label: 'Komis', color: 'bg-orange-100 text-orange-800 border-orange-200' },
    { value: 'bar', label: 'Bar', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' }
  ];

  const addNewProductField = () => {
    const newId = Math.max(...productSearchFields.map(f => f.id)) + 1;
    setProductSearchFields([...productSearchFields, { id: newId, searchQuery: '', selectedProduct: null, typ: '' }]);
  };

  const removeProductField = (fieldId: number) => {
    if (productSearchFields.length > 1) {
      setProductSearchFields(fields => fields.filter(f => f.id !== fieldId));
    }
  };

  const handleClose = () => {
    console.log('🔍 OrderModal handleClose called');
    // Очищаем все данные
    setSelectedDate(null);
    setOrderNumber('');
    setSearchQuery('');
    setClients([]);
    setSelectedClient(null);
    setProducts([]);
    setProductSearchFields([{ id: 1, searchQuery: '', selectedProduct: null, typ: '' }]);
    setActiveSearchId(null);
    setIsProductLoading(false);
    setIsSubmitting(false);
    setOpenDropdownIndex(null);
    setFieldsWithErrors(new Set());
    lastToastFieldId.current = null;
    setOverflowDialogOpen(false);
    setOverflowItems([]);
    setPendingSubmit(false);
    onClose();
  };



  // Очищаем состояние при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      console.log('🔍 OrderModal opened - clearing state');
      setSelectedDate(null);
      setOrderNumber('');
      setSearchQuery('');
      setClients([]);
      setSelectedClient(null);
      setProducts([]);
      setProductSearchFields([{ id: 1, searchQuery: '', selectedProduct: null, typ: '' }]);
      setActiveSearchId(null);
      setIsProductLoading(false);
      setIsSubmitting(false);
      setOpenDropdownIndex(null);
      setFieldsWithErrors(new Set());
      lastToastFieldId.current = null;
      setOverflowDialogOpen(false);
      setOverflowItems([]);
      setPendingSubmit(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const searchClients = async () => {
      if (searchQuery.trim().length < 2) {
        setClients([]);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(`/api/clients/search?q=${encodeURIComponent(searchQuery)}`);
        if (!response.ok) throw new Error('Failed to fetch clients');
        const data = await response.json();
        setClients(data);
      } catch (error) {
        console.error('Error searching clients:', error);
        setClients([]);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(searchClients, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Эффект для поиска продуктов
  useEffect(() => {
    const searchProducts = async () => {
      if (activeSearchId === null || !productSearchFields.find(f => f.id === activeSearchId)?.searchQuery.trim()) {
        setProducts([]);
        return;
      }

      setIsProductLoading(true);
      try {
        const query = productSearchFields.find(f => f.id === activeSearchId)?.searchQuery || '';
        // Добавляем client_id в запрос, если клиент выбран
        const url = selectedClient 
          ? `/api/working-sheets/search?query=${encodeURIComponent(query)}&client_id=${selectedClient.id}`
          : `/api/working-sheets/search?query=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch products');
        const data = await response.json();
        
        // Считаем суммарный остаток по kod (основной + семплы) для проверки доступности
        const totalByKod = new Map<string, number>();
        data.forEach((item: any) => {
          totalByKod.set(item.kod, (totalByKod.get(item.kod) || 0) + (item.ilosc || 0));
        });

        // Преобразуем данные из working_sheets в формат Product
        // ilosc — остаток конкретной строки (для отображения)
        // ilosc_total — суммарный остаток по kod (основной + семплы, для проверки доступности основной строки)
        // status === 'samples' — строка семплов, ограничена только своим ilosc
        const transformedData = data.map((item: any) => ({
          kod: item.kod,
          nazwa: item.nazwa,
          ilosc: item.ilosc.toString(),
          ilosc_total: totalByKod.get(item.kod) || item.ilosc,
          status: item.status || null,
          kodKreskowy: '',
          selectedQuantity: 0,
          ilosc_reserved: item.ilosc_reserved || 0,
          ilosc_client_reserved: item.ilosc_client_reserved || 0,
          ilosc_client_reserved_total: item.ilosc_client_reserved_total || 0,
          sprzedawca: item.sprzedawca || ''
        }));
        
        setProducts(transformedData);
      } catch (error) {
        console.error('Error searching products:', error);
        setProducts([]);
      } finally {
        setIsProductLoading(false);
      }
    };

    const timeoutId = setTimeout(searchProducts, 300);
    return () => clearTimeout(timeoutId);
  }, [productSearchFields, activeSearchId, selectedClient]);

  // Закрываем dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (openDropdownIndex !== null) {
        if (!target.closest('.dropdown-container')) {
          setOpenDropdownIndex(null);
        }
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdownIndex(null);
      }
    };

    if (openDropdownIndex !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openDropdownIndex]);

  const handleProductSelect = (fieldId: number, product: Product) => {
    console.log('🔍 handleProductSelect called for fieldId:', fieldId, 'product:', product.kod);
    
    setProductSearchFields(fields => {
      const updatedFields = fields.map(field => 
        field.id === fieldId 
          ? { 
              ...field, 
              selectedProduct: product, 
              searchQuery: `${product.kod} - ${product.nazwa.includes(' (samples)') ? product.nazwa.replace(' (samples)', '') + ' (samples)' : product.nazwa}` 
            }
          : field
      );
      
      return updatedFields;
    });
    
    // Скрываем список поиска для всех полей
    setProducts([]);
    setActiveSearchId(null);
    
    console.log('🔍 Products list cleared, activeSearchId reset');
  };

  const toggleDropdown = (index: number) => {
    setOpenDropdownIndex(openDropdownIndex === index ? null : index);
  };

  const handleTypChange = (fieldId: number, value: string) => {
    setProductSearchFields(fields =>
      fields.map(field =>
        field.id === fieldId ? { ...field, typ: value } : field
      )
    );
    setOpenDropdownIndex(null);
  };

  // Функция для подсчета общей суммы количества
  const calculateTotalQuantity = () => {
    return productSearchFields
      .filter(field => field.selectedProduct)
      .reduce((total, field) => {
        const quantity = field.selectedProduct?.selectedQuantity || 0;
        return total + quantity;
      }, 0);
  };

  // Функция для проверки валидности формы
  const isFormValid = () => {
    // Проверяем обязательные поля
    if (!selectedDate) return false;
    if (!orderNumber.trim()) return false;
    if (!selectedClient) return false;

    // Проверяем, что есть хотя бы один продукт
    const selectedProducts = productSearchFields.filter(field => field.selectedProduct);
    if (selectedProducts.length === 0) return false;

    // Проверяем, что для всех продуктов указано количество > 0
    if (selectedProducts.some(field => !field.selectedProduct?.selectedQuantity || field.selectedProduct.selectedQuantity <= 0)) {
      return false;
    }

    // Проверяем, что для всех продуктов выбран тип
    if (selectedProducts.some(field => !field.typ)) {
      return false;
    }

    // Блокируем только при превышении доступного на складе
    if (fieldsWithErrors.size > 0) return false;

    return true;
  };

  // Функция для генерации номера заказа


  const buildStockLinesWithIds = () => {
    return productSearchFields
      .filter(field => field.selectedProduct && (field.selectedProduct.selectedQuantity || 0) > 0)
      .map(field => {
        const product = field.selectedProduct!;
        const isSamplesRow = product.status === 'samples';
        const samplesOwnQuantity = parseInt(product.ilosc) || 0;
        const totalOnStock = product.ilosc_total ?? samplesOwnQuantity;

        return {
          lineId: field.id,
          kod: product.kod,
          nazwa: product.nazwa,
          quantity: product.selectedQuantity || 0,
          isSamplesRow,
          samplesOwnQuantity,
          totalOnStock: isSamplesRow ? samplesOwnQuantity : totalOnStock,
          overallTotalOnStock: totalOnStock,
          reservedQuantity: product.ilosc_reserved || 0,
          clientReservedQuantity: product.ilosc_client_reserved || 0,
          clientReservedTotal: product.ilosc_client_reserved_total || product.ilosc_client_reserved || 0
        };
      });
  };

  const submitOrder = async () => {
    const selectedProducts = productSearchFields
      .filter(field => field.selectedProduct)
      .map(field => ({
        kod: field.selectedProduct!.kod,
        nazwa: field.selectedProduct!.nazwa,
        ilosc: field.selectedProduct!.selectedQuantity || 0,
        typ: field.typ
      }));

    const day = selectedDate!.getDate().toString().padStart(2, '0');
    const month = (selectedDate!.getMonth() + 1).toString().padStart(2, '0');
    const year = selectedDate!.getFullYear();
    const fullOrderNumber = `${orderNumber.trim()}_${day}_${month}_${year}`;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clientName: selectedClient!.nazwa,
          order_number: fullOrderNumber,
          products: selectedProducts
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 400 && errorData.error.includes('Insufficient quantity')) {
          const match = errorData.error.match(/product (.*?)\. Available: (\d+), Requested: (\d+)/);
          if (match) {
            const [, productCode, available, requested] = match;
            toast.error(`Niewystarczająca ilość produktu ${productCode}. Dostępne: ${available}, Zamówione: ${requested}`);
          } else {
            toast.error(errorData.error);
          }
        } else {
          throw new Error('Failed to create order');
        }
        return;
      }

      toast.success('Zamówienie zostało dodane');
      handleClose();
      if (onOrderCreated) {
        onOrderCreated();
      }
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error('Wystąpił błąd podczas dodawania zamówienia');
    } finally {
      setIsSubmitting(false);
      setPendingSubmit(false);
    }
  };

  const handleSubmit = async () => {
    const selectedProducts = productSearchFields
      .filter(field => field.selectedProduct)
      .map(field => ({
        kod: field.selectedProduct!.kod,
        nazwa: field.selectedProduct!.nazwa,
        ilosc: field.selectedProduct!.selectedQuantity || 0,
        typ: field.typ
      }));
    
    if (!selectedDate) {
      toast.error('Wybierz datę zamówienia');
      return;
    }
    
    if (!orderNumber.trim()) {
      toast.error('Wprowadź numer zamówienia');
      return;
    }
    
    if (!selectedClient) {
      toast.error('Wybierz klienta');
      return;
    }
    
    if (selectedProducts.length === 0) {
      toast.error('Dodaj produkty');
      return;
    }

    // Проверяем, что для всех продуктов указано количество
    if (selectedProducts.some(product => !product.ilosc)) {
      toast.error('Wprowadź ilość dla wszystkich produktów');
      return;
    }

    if (selectedProducts.some(product => !product.typ)) {
      toast.error('Wybierz typ dla wszystkich produktów');
      return;
    }

    const stockLinesWithIds = buildStockLinesWithIds();
    const stockErrors = collectStockOverflowLineIds(stockLinesWithIds);
    if (stockErrors.size > 0) {
      setFieldsWithErrors(stockErrors);
      toast.error('Niewystarczająca ilość towaru na magazynie');
      return;
    }
    setFieldsWithErrors(new Set());

    const enrichedLines = await enrichStockLinesWithClientReservations(
      stockLinesWithIds,
      selectedClient.id
    );
    const overflows = collectReservationOverflows(enrichedLines);
    if (overflows.length > 0) {
      setOverflowItems(overflows);
      setOverflowDialogOpen(true);
      return;
    }

    await submitOrder();
  };

  const handleOverflowConfirm = async () => {
    setOverflowDialogOpen(false);
    setPendingSubmit(true);
    await submitOrder();
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      style={{
        content: {
          width: '720px',
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
      <div 
        className="font-sora h-full flex flex-col overflow-hidden"
      >
        <div className="flex justify-between items-center mb-8 select-none">
          <h2 className="text-base font-semibold text-gray-800">Dodawanie zamówienia</h2>
          <button
            onClick={handleClose}
            className="text-red-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 flex-grow overflow-y-auto pr-2">
          <div className="space-y-4">
            <div className="flex">
              <div className="w-[200px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Data zamówienia
                </label>
                <DatePicker
                  selected={selectedDate}
                  onChange={(date: Date | null) => setSelectedDate(date)}
                  locale="pl"
                  dateFormat="dd/MM/yyyy"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                  placeholderText="Wybierz datę"
                  popperClassName="z-50"
                />
              </div>
              <div className="w-[180px] ml-4">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Numer zamówienia
                </label>
                <input
                  type="text"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="Wprowadź numer zamówienia"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                />
              </div>
            </div>
          </div>

          <div className="relative">
            <label htmlFor="client-search" className="block text-xs font-medium text-gray-700 mb-2 font-sora">
              Klient
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                id="client-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Wyszukaj klienta..."
                className="w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
              />
            </div>
            {isLoading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              </div>
            )}
            {clients.length > 0 && !selectedClient && (
              <div className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm border border-gray-200">
                {clients.map((client) => (
                  <div
                    key={client.id}
                    className="cursor-pointer select-none relative py-1 pl-3 pr-9 hover:bg-blue-50"
                    onClick={() => {
                      setSelectedClient(client);
                      setSearchQuery(client.nazwa);
                      setClients([]);
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-[10px]">{client.nazwa}</span>
                      <span className="text-[10px] text-gray-500">{client.firma}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedClient && (
            <div className="bg-green-50 p-3 rounded-md">
              <div className="flex justify-between items-start">
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 flex-1">
                  <div>
                    <p className="font-medium text-gray-900 text-xs">Nazwa:</p>
                    <p className="text-xs text-gray-900">{selectedClient.nazwa}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-xs">Firma:</p>
                    <p className="text-xs text-gray-900">{selectedClient.firma}</p>
                  </div>
                  {selectedClient.adres && (
                    <div>
                      <p className="font-medium text-gray-900 text-xs">Adres:</p>
                      <p className="text-xs text-gray-900">{selectedClient.adres}</p>
                    </div>
                  )}
                  {selectedClient.kontakt && (
                    <div>
                      <p className="font-medium text-gray-900 text-xs">Kontakt:</p>
                      <p className="text-xs text-gray-900">{selectedClient.kontakt}</p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedClient(null);
                    setSearchQuery('');
                  }}
                  className="text-gray-500 hover:text-gray-700 ml-4"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Поиск продуктов */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700 font-sora">
              Produkty
            </label>
            {productSearchFields.map((field) => (
              <div key={field.id} className="relative">
                <div className="flex">
                  <div className="relative flex-1 max-w-[70%]">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={field.searchQuery}
                                             onChange={(e) => {
                         const newValue = e.target.value;
                         console.log('🔍 Product search input changed for fieldId:', field.id, 'value:', newValue);
                         
                         setProductSearchFields(fields =>
                           fields.map(f =>
                             f.id === field.id
                               ? { ...f, searchQuery: newValue, selectedProduct: null }
                               : f
                           )
                         );
                         setActiveSearchId(field.id);
                       }}
                      onFocus={() => setActiveSearchId(field.id)}
                      placeholder="Wyszukaj produkty..."
                      className="w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                    />
                  </div>

                  {/* Поле для количества */}
                  <div className="w-16 ml-2">
                    <input
                      type="number"
                      min="1"
                      placeholder="ilość"
                      value={field.selectedProduct?.selectedQuantity || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        const newQuantity = value === '' ? 0 : Math.max(1, parseInt(value) || 0);
                        setProductSearchFields(fields => {
                          const updatedFields = fields.map(f =>
                            f.id === field.id && f.selectedProduct
                              ? { ...f, selectedProduct: { ...f.selectedProduct, selectedQuantity: newQuantity } }
                              : f
                          );
                          
                          // Сбрасываем lastToastFieldId при любом изменении
                          lastToastFieldId.current = null;
                          
                          // Проверяем остатки на складе при изменении количества
                          const updatedField = updatedFields.find(f => f.id === field.id);
                          if (updatedField?.selectedProduct) {
                            const currentProductCode = updatedField.selectedProduct.kod;
                            const isSamplesRow = updatedField.selectedProduct.status === 'samples';
                            const samplesOwnQuantity = parseInt(updatedField.selectedProduct.ilosc) || 0;
                            const totalQuantity = updatedField.selectedProduct.ilosc_total ?? samplesOwnQuantity;
                            const reservedQuantity = updatedField.selectedProduct.ilosc_reserved || 0;
                            const clientReservedQuantity = updatedField.selectedProduct.ilosc_client_reserved || 0;
                            
                            const fieldsWithSameProduct = updatedFields.filter(f => f.selectedProduct?.kod === currentProductCode);
                            const totalQuantityForThisProduct = fieldsWithSameProduct
                              .reduce((sum, f) => sum + (f.selectedProduct?.selectedQuantity || 0), 0);
                            const isProductDuplicated = fieldsWithSameProduct.length > 1;
                            
                            const maxAllowed = calculateMaxAllowed({
                              kod: currentProductCode,
                              nazwa: updatedField.selectedProduct.nazwa,
                              quantity: newQuantity,
                              isSamplesRow,
                              samplesOwnQuantity,
                              totalOnStock: isSamplesRow ? samplesOwnQuantity : totalQuantity,
                              overallTotalOnStock: totalQuantity,
                              reservedQuantity,
                              clientReservedQuantity,
                              clientReservedTotal: updatedField.selectedProduct.ilosc_client_reserved_total
                            });
                            
                            if (newQuantity === 0) {
                              setFieldsWithErrors(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(field.id);
                                return newSet;
                              });
                            } else if (totalQuantityForThisProduct > maxAllowed) {
                              setFieldsWithErrors(prev => {
                                const newSet = new Set(prev);
                                newSet.add(field.id);
                                return newSet;
                              });
                              if (reservedQuantity > 0) {
                                if (isProductDuplicated) {
                                  toast.error(`Niewystarczająca ilość towaru - łącznie w zamówieniu: ${totalQuantityForThisProduct}, dostępne: ${maxAllowed} (na magazynie: ${totalQuantity}, z nich w rezerwacji: ${reservedQuantity})`);
                                } else {
                                  toast.error(`Niewystarczająca ilość towaru - dostępne: ${maxAllowed} (na magazynie: ${totalQuantity}, z nich w rezerwacji: ${reservedQuantity})`);
                                }
                              } else if (isProductDuplicated) {
                                toast.error(`Niewystarczająca ilość towaru - łącznie w zamówieniu: ${totalQuantityForThisProduct}, dostępne: ${maxAllowed} (na magazynie: ${totalQuantity})`);
                              } else {
                                toast.error(`Niewystarczająca ilość towaru - dostępne: ${maxAllowed} (na magazynie: ${totalQuantity})`);
                              }
                            } else {
                              setFieldsWithErrors(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(field.id);
                                return newSet;
                              });
                            }
                          } else {
                            // Очищаем ошибку для этого поля при изменении, если продукт не выбран
                            setFieldsWithErrors(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(field.id);
                              return newSet;
                            });
                          }
                          
                          return updatedFields;
                        });
                      }}
                      className={`w-full px-3 py-1.5 border rounded-md focus:outline-none font-sora text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                        fieldsWithErrors.has(field.id) ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                    />
                  </div>

                  {/* Dropdown для типа заказа */}
                  <div className="w-24 ml-2 relative dropdown-container">
                    <button
                      type="button"
                      onClick={() => toggleDropdown(field.id)}
                      className={`w-full px-2 py-1.5 border rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ${field.typ ? TYPY_ZAMOWIENIA.find(t => t.value === field.typ)?.color || 'border-gray-300 bg-white' : 'border-gray-300 bg-white'}`}
                    >
                      <span className="truncate text-[10px]">
                        {field.typ ? TYPY_ZAMOWIENIA.find(t => t.value === field.typ)?.label || 'Typ' : 'Typ'}
                      </span>
                      <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdownIndex === field.id && (
                      <div 
                        className="absolute top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-40 overflow-y-auto w-full"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {TYPY_ZAMOWIENIA.map((typ) => (
                          <button
                            key={typ.value}
                            type="button"
                            onClick={() => handleTypChange(field.id, typ.value)}
                            className={`w-full px-2 py-1.5 text-left text-[10px] hover:bg-gray-50 ${typ.color}`}
                          >
                            {typ.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Кнопка удаления позиции */}
                  {productSearchFields.length > 1 && (
                    <button
                      onClick={() => removeProductField(field.id)}
                      className="ml-2 text-red-400 hover:text-red-600"
                      title="Usuń pozycję"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Кнопка добавления новой позиции (только для последней строки) */}
                {field.id === Math.max(...productSearchFields.map(f => f.id)) && (
                  <button
                    onClick={addNewProductField}
                    className="absolute -bottom-7 left-0 text-gray-400 hover:text-gray-600"
                    title="Dodaj nową pozycję"
                  >
                    <Plus size={16} />
                  </button>
                )}

                {isProductLoading && activeSearchId === field.id && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  </div>
                )}
                {products.length > 0 && activeSearchId === field.id && !field.selectedProduct && field.searchQuery.trim() && (
                  <div className="absolute z-50 mt-1 w-[70%] bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm border border-gray-200">
                    {products.map((product, idx) => (
                      <div
                        key={`${product.kod}-${product.nazwa || ''}-${idx}`}
                        className="cursor-pointer select-none relative py-1 pl-3 pr-9 hover:bg-blue-50"
                        onClick={() => handleProductSelect(field.id, { ...product, selectedQuantity: 0 })}
                      >
                        <div className="flex flex-col">
                          <ProductSearchHintLines
                            kod={product.kod}
                            nazwa={product.nazwa}
                            sprzedawca={product.sprzedawca}
                          >
                          <span className="text-[10px] text-gray-500">Dostępna ilość: {product.ilosc}</span>
                          {(product.ilosc_reserved ?? 0) > 0 && (
                            <span className="text-[10px] text-red-500">Z nich w rezerw: {product.ilosc_reserved ?? 0}</span>
                          )}
                          {selectedClient && (product.ilosc_client_reserved ?? 0) > 0 && (
                            <span className="text-[10px] text-blue-700">
                              Rezerwacja klienta: {product.ilosc_client_reserved ?? 0}
                            </span>
                          )}
                          </ProductSearchHintLines>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || pendingSubmit || !isFormValid()}
            className={`px-6 py-1.5 text-white text-xs rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-sora ${
              isSubmitting || pendingSubmit || !isFormValid()
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Dodawanie...
              </div>
            ) : (
              'Dodaj'
            )}
          </button>
        </div>
        <div className="absolute bottom-4 right-4 text-xs text-gray-600 font-sora">
          Razem: <span className="font-semibold text-gray-900">{calculateTotalQuantity()}</span>
        </div>
      </div>
      <ReservationOverflowDialog
        isOpen={overflowDialogOpen}
        items={overflowItems}
        onConfirm={handleOverflowConfirm}
        onCancel={() => setOverflowDialogOpen(false)}
      />
    </Modal>
  );
}; 