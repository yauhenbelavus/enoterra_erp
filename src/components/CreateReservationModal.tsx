import React, { useState, useEffect, useRef } from 'react';
import Modal from 'react-modal';
import { Search, X, Plus, Infinity } from 'lucide-react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import "../components/DatePicker.css";
import toast from 'react-hot-toast';
import { API_URL } from '../config';
import {
  getMinReservationEndDate,
  INDEFINITE_RESERVATION_END_DATE,
  isValidReservationEndDate
} from '../utils/reservationDates';

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
  kodKreskowy: string;
  selectedQuantity?: number;
  ilosc_reserved?: number;
}

interface ProductSearchField {
  id: number;
  searchQuery: string;
  selectedProduct: Product | null;
}

interface CreateReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReservationCreated?: () => void;
  apiUrl?: string; // optional base URL for API (unused currently)
}

export const CreateReservationModal: React.FC<CreateReservationModalProps> = ({ isOpen, onClose, onReservationCreated }) => {
  console.log('🔍 CreateReservationModal render - isOpen:', isOpen);
  const [dataRezerwacji, setDataRezerwacji] = useState<Date | null>(null);
  const [dataZakonczenia, setDataZakonczenia] = useState<Date | null>(null);
  const [isBezterminowa, setIsBezterminowa] = useState(false);
  const [numerRezerwacji, setNumerRezerwacji] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearchFields, setProductSearchFields] = useState<ProductSearchField[]>([
    { id: 1, searchQuery: '', selectedProduct: null }
  ]);
  const [activeSearchId, setActiveSearchId] = useState<number | null>(null);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldsWithErrors, setFieldsWithErrors] = useState<Set<number>>(new Set());
  const [komentarz, setKomentarz] = useState('');
  const lastToastFieldId = useRef<number | null>(null);
  const reservationNumberBase = useRef<string>(''); // Храним числовую часть номера (R001) без даты

  const addNewProductField = () => {
    const newId = Math.max(...productSearchFields.map(f => f.id)) + 1;
    setProductSearchFields([...productSearchFields, { id: newId, searchQuery: '', selectedProduct: null }]);
  };

  const removeProductField = (fieldId: number) => {
    if (productSearchFields.length > 1) {
      setProductSearchFields(fields => fields.filter(f => f.id !== fieldId));
    }
  };

  const handleClose = () => {
    console.log('🔍 CreateReservationModal handleClose called');
    // Очищаем все данные
    setDataRezerwacji(null);
    setDataZakonczenia(null);
    setIsBezterminowa(false);
    setNumerRezerwacji('');
    setSearchQuery('');
    setClients([]);
    setSelectedClient(null);
    setProducts([]);
    setProductSearchFields([{ id: 1, searchQuery: '', selectedProduct: null }]);
    setActiveSearchId(null);
    setIsProductLoading(false);
    setIsSubmitting(false);
    setFieldsWithErrors(new Set());
    setKomentarz('');
    lastToastFieldId.current = null;
    onClose();
  };

  // Очищаем состояние и генерируем номер при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      console.log('🔍 CreateReservationModal opened - clearing state and generating number');
      setDataRezerwacji(null);
      setDataZakonczenia(null);
      setIsBezterminowa(false);
      setSearchQuery('');
      setClients([]);
      setSelectedClient(null);
      setProducts([]);
      setProductSearchFields([{ id: 1, searchQuery: '', selectedProduct: null }]);
      setActiveSearchId(null);
      setIsProductLoading(false);
      setIsSubmitting(false);
      setFieldsWithErrors(new Set());
      setKomentarz('');
      lastToastFieldId.current = null;
      
      // Генерируем номер резервации при открытии окна (с текущей датой по умолчанию)
      const today = new Date();
      const day = today.getDate().toString().padStart(2, '0');
      const month = (today.getMonth() + 1).toString().padStart(2, '0');
      const year = today.getFullYear();
      
      console.log('🔢 Fetching next reservation number from:', `${API_URL}/api/reservations/next-number-only`);
      fetch(`${API_URL}/api/reservations/next-number-only`)
        .then(res => {
          console.log('🔢 Response status:', res.status);
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          console.log('🔢 Received data:', data);
          if (data.numer_rezerwacji) {
            reservationNumberBase.current = data.numer_rezerwacji; // Например: "R001"
            // Добавляем текущую дату к номеру
            const fullNumber = `${data.numer_rezerwacji}_${day}_${month}_${year}`;
            setNumerRezerwacji(fullNumber);
            console.log('✅ Set reservation number to:', fullNumber);
          } else {
            console.warn('⚠️ No numer_rezerwacji in response, using fallback');
            // Fallback если сервер не вернул номер
            reservationNumberBase.current = 'R001';
            setNumerRezerwacji(`R001_${day}_${month}_${year}`);
          }
        })
        .catch(err => {
          console.error('❌ Error fetching next reservation number:', err);
          // Fallback
          reservationNumberBase.current = 'R001';
          setNumerRezerwacji(`R001_${day}_${month}_${year}`);
        });
    } else {
      setNumerRezerwacji('');
      reservationNumberBase.current = '';
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
        const response = await fetch(`${API_URL}/api/clients/search?q=${encodeURIComponent(searchQuery)}`);
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
        const response = await fetch(`${API_URL}/api/working-sheets/search?query=${encodeURIComponent(query)}&for_reservation=true`);
        if (!response.ok) throw new Error('Failed to fetch products');
        const data = await response.json();
        
        // Преобразуем данные из working_sheets в формат Product
        // ilosc уже содержит суммарный остаток (основной + семплы) — for_reservation=true
        const transformedData = data.map((item: any) => ({
          kod: item.kod,
          nazwa: item.nazwa,
          ilosc: item.ilosc.toString(),
          ilosc_total: item.ilosc_total ?? item.ilosc,
          kodKreskowy: item.kod_kreskowy || '',
          selectedQuantity: 0,
          ilosc_reserved: item.ilosc_reserved || 0
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
  }, [productSearchFields, activeSearchId]);

  // Обновляем дату в номере резервации при изменении даты
  useEffect(() => {
    if (!reservationNumberBase.current) {
      // Если номер еще не сгенерирован, не делаем ничего
      return;
    }
    
    if (dataRezerwacji) {
      const day = dataRezerwacji.getDate().toString().padStart(2, '0');
      const month = (dataRezerwacji.getMonth() + 1).toString().padStart(2, '0');
      const year = dataRezerwacji.getFullYear();
      
      // Обновляем дату в номере (используем базовую часть из ref)
      const fullNumber = `${reservationNumberBase.current}_${day}_${month}_${year}`;
      setNumerRezerwacji(fullNumber);
    } else {
      // Если дата убрана, используем текущую дату
      const today = new Date();
      const day = today.getDate().toString().padStart(2, '0');
      const month = (today.getMonth() + 1).toString().padStart(2, '0');
      const year = today.getFullYear();
      const fullNumber = `${reservationNumberBase.current}_${day}_${month}_${year}`;
      setNumerRezerwacji(fullNumber);
    }
  }, [dataRezerwacji]);

  useEffect(() => {
    if (!dataRezerwacji || !dataZakonczenia || isBezterminowa) return;
    if (!isValidReservationEndDate(dataRezerwacji, dataZakonczenia)) {
      setDataZakonczenia(null);
    }
  }, [dataRezerwacji, dataZakonczenia, isBezterminowa]);

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

  // Функция для подсчета общей суммы количества
  const calculateTotalQuantity = () => {
    return productSearchFields
      .filter(field => field.selectedProduct)
      .reduce((total, field) => {
        const quantity = field.selectedProduct?.selectedQuantity || 0;
        return total + quantity;
      }, 0);
  };

  const toggleBezterminowa = () => {
    setIsBezterminowa(prev => {
      if (!prev) {
        setDataZakonczenia(null);
      }
      return !prev;
    });
  };

  // Функция для проверки валидности формы
  const isFormValid = () => {
    // Проверяем обязательные поля
    if (!dataRezerwacji) return false;
    if (!isBezterminowa && !dataZakonczenia) return false;
    if (!selectedClient?.id) return false;
    if (!numerRezerwacji.trim()) return false;

    // Проверяем, что есть хотя бы один продукт
    const selectedProducts = productSearchFields.filter(field => field.selectedProduct);
    if (selectedProducts.length === 0) return false;

    // Проверяем, что для всех продуктов указано количество > 0
    if (selectedProducts.some(field => !field.selectedProduct?.selectedQuantity || field.selectedProduct.selectedQuantity <= 0)) {
      return false;
    }

    // Проверяем, что нет ошибок с остатками
    if (fieldsWithErrors.size > 0) return false;

    if (!isBezterminowa && dataZakonczenia && dataRezerwacji && !isValidReservationEndDate(dataRezerwacji, dataZakonczenia)) {
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    const selectedProducts = productSearchFields
      .filter(field => field.selectedProduct)
      .map(field => ({
        product_kod: field.selectedProduct!.kod,
        product_nazwa: field.selectedProduct!.nazwa,
        kod_kreskowy: field.selectedProduct!.kodKreskowy || '',
        ilosc: field.selectedProduct!.selectedQuantity || 0
      }));
    
    if (!dataRezerwacji) {
      toast.error('Wybierz datę rezerwacji');
      return;
    }
    
    if (!isBezterminowa && !dataZakonczenia) {
      toast.error('Wybierz datę zakończenia rezerwacji');
      return;
    }
    
    if (!isBezterminowa && dataZakonczenia && dataRezerwacji && !isValidReservationEndDate(dataRezerwacji, dataZakonczenia)) {
      toast.error('Data zakończenia musi być co najmniej następnego dnia po dacie rezerwacji');
      return;
    }
    
    if (!selectedClient?.id) {
      toast.error('Wybierz klienta z listy');
      return;
    }
    
    if (selectedProducts.length === 0) {
      toast.error('Dodaj produkty');
      return;
    }

    // Проверяем, что для всех продуктов указано количество
    if (selectedProducts.some(product => !product.ilosc || product.ilosc <= 0)) {
      toast.error('Wprowadź ilość dla wszystkich produktów');
      return;
    }

    // Проверка остатков уже выполнена в isFormValid и при изменении количества
    // Оставляем только очистку ошибок перед отправкой
    setFieldsWithErrors(new Set());

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/reservations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: selectedClient.id,
          numer_rezerwacji: numerRezerwacji,
          data_utworzenia: dataRezerwacji.toISOString().split('T')[0],
          data_zakonczenia: isBezterminowa
            ? INDEFINITE_RESERVATION_END_DATE
            : dataZakonczenia!.toISOString().split('T')[0],
          status: isBezterminowa ? 'bezterminowa' : 'aktywna',
          komentarz: komentarz.trim() || null,
          products: selectedProducts
        })
      });

      if (!response.ok) {
        // Безопасно читаем тело ответа: сначала как текст, затем пытаемся распарсить JSON
        const rawText = await response.text();
        let errorMessage = 'Failed to create reservation';

        try {
          const errorData = JSON.parse(rawText);
          errorMessage = errorData.details?.message || errorData.error || errorMessage;
        } catch {
          // Если это HTML или другой не‑JSON, логируем для отладки
          console.error('Non-JSON error response when creating reservation:', rawText);
        }

        throw new Error(errorMessage);
      }

      toast.success('Rezerwacja została utworzona');
      handleClose();
      if (onReservationCreated) {
        onReservationCreated();
      }
    } catch (error: any) {
      console.error('Error creating reservation:', error);
      toast.error(error.message || 'Wystąpił błąd podczas tworzenia rezerwacji');
    } finally {
      setIsSubmitting(false);
    }
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
          overflow: 'visible',
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
          <h2 className="text-base font-semibold text-gray-800">Dodawanie rezerwacji</h2>
          <button
            onClick={handleClose}
            className="text-red-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 flex-grow overflow-y-auto pr-2">
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-[200px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Data rezerwacji
                </label>
                <DatePicker
                  selected={dataRezerwacji}
                  onChange={(date: Date | null) => setDataRezerwacji(date)}
                  locale="pl"
                  dateFormat="dd/MM/yyyy"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                  placeholderText="Wybierz datę"
                  popperClassName="z-50"
                />
              </div>
              <div className="w-[180px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Numer rezerwacji
                </label>
                <input
                  type="text"
                  value={numerRezerwacji}
                  readOnly
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-gray-50"
                  placeholder="R001_DD_MM_YYYY"
                />
              </div>
              <div className="w-[240px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Data zakończenia rezerwacji
                </label>
                <div className="flex gap-1 items-center">
                  {isBezterminowa ? (
                    <input
                      type="text"
                      value="∞"
                      readOnly
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-left bg-gray-50 text-gray-700 cursor-not-allowed"
                    />
                  ) : (
                    <DatePicker
                      selected={dataZakonczenia}
                      onChange={(date: Date | null) => setDataZakonczenia(date)}
                      locale="pl"
                      dateFormat="dd/MM/yyyy"
                      className="flex-1 min-w-0 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                      placeholderText="Wybierz datę"
                      popperClassName="z-50"
                      minDate={dataRezerwacji ? getMinReservationEndDate(dataRezerwacji) : undefined}
                    />
                  )}
                  <button
                    type="button"
                    onClick={toggleBezterminowa}
                    title={isBezterminowa ? 'Przywróć datę zakończenia' : 'Rezerwacja bezterminowa'}
                    className={`flex-shrink-0 px-2 py-1.5 border rounded-md focus:outline-none transition-colors ${
                      isBezterminowa
                        ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                    }`}
                  >
                    <Infinity size={16} />
                  </button>
                </div>
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
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (selectedClient) {
                    setSelectedClient(null);
                  }
                }}
                placeholder="Wyszukaj klienta..."
                className="w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
              />
              {isLoading && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                </div>
              )}
            </div>
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
            {selectedClient && (
              <div className="bg-green-50 py-1.5 px-3 rounded-md mt-2">
                <div className="flex justify-center items-center relative">
                  <div className="flex items-center gap-4">
                    <p className="font-bold text-gray-900 text-xs">{selectedClient.nazwa}</p>
                    <p className="font-bold text-gray-900 text-xs">{selectedClient.firma}</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedClient(null);
                      setSearchQuery('');
                    }}
                    className="text-gray-500 hover:text-gray-700 absolute right-0"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Комментарий */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
              Komentarz
            </label>
            <textarea
              value={komentarz}
              onChange={(e) => setKomentarz(e.target.value)}
              rows={2}
              placeholder="zostaw komentarz"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs resize-none"
            />
          </div>

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
                  <div className="w-16 ml-8">
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
                          
                          // Проверяем остатки на складе при изменении количества с учетом резерваций
                          // totalQuantity = суммарный остаток (основной + семплы), ilosc_reserved = зарезервировано
                          const updatedField = updatedFields.find(f => f.id === field.id);
                          if (updatedField?.selectedProduct) {
                            const totalQuantity = parseInt(updatedField.selectedProduct.ilosc) || 0;
                            const reservedQuantity = updatedField.selectedProduct.ilosc_reserved || 0;
                            const availableQuantity = Math.max(0, totalQuantity - reservedQuantity);
                            
                            // Если поле пустое или 0 - очищаем ошибку
                            if (newQuantity === 0) {
                              setFieldsWithErrors(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(field.id);
                                return newSet;
                              });
                            }
                            // Если количество превышает доступное - добавляем ошибку
                            else if (newQuantity > availableQuantity) {
                              setFieldsWithErrors(prev => {
                                const newSet = new Set(prev);
                                newSet.add(field.id);
                                return newSet;
                              });
                              // Показываем toast с информацией о доступном количестве
                              if (reservedQuantity > 0) {
                                toast.error(`Niewystarczająca ilość - dostępne do rezerwacji: ${availableQuantity} (łącznie na magazynie: ${totalQuantity}, z tego zarezerwowane: ${reservedQuantity})`);
                              } else {
                                toast.error(`Niewystarczająca ilość - dostępne do rezerwacji: ${availableQuantity} (łącznie na magazynie: ${totalQuantity})`);
                              }
                            }
                            // Иначе очищаем ошибку
                            else {
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
                  
                  {/* Кнопка удаления позиции */}
                  {productSearchFields.length > 1 && (
                    <button
                      onClick={() => removeProductField(field.id)}
                      className="ml-4 text-red-400 hover:text-red-600"
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
                          <span className="font-medium text-[10px]">{product.kod}</span>
                          <span className="text-[10px] text-gray-500">{product.nazwa}</span>
                          <span className="text-[10px] text-gray-500">Dostępna ilość: {product.ilosc}</span>
                          {(product.ilosc_reserved ?? 0) > 0 && (
                            <span className="text-[10px] text-red-500">Z nich w rezerw: {product.ilosc_reserved ?? 0}</span>
                          )}
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
            disabled={isSubmitting || !isFormValid()}
            className={`px-6 py-1.5 text-white text-xs rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-sora ${
              isSubmitting || !isFormValid()
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
    </Modal>
  );
};
