import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Search } from 'lucide-react';
import Modal from 'react-modal';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import "../components/DatePicker.css";
import toast from 'react-hot-toast';
import {
  getMinReservationEndDate,
  INDEFINITE_RESERVATION_END_DATE,
  isValidReservationEndDate
} from '../utils/reservationDates';

registerLocale('pl', pl);

interface ReservationProduct {
  id: number;
  reservation_id: number;
  product_id: number | null;
  product_kod: string;
  product_nazwa: string;
  kod_kreskowy: string | null;
  ilosc: number;
  ilosc_wydane?: number;
  komentarz: string | null;
  created_at: string;
}

interface Reservation {
  id: number;
  numer_rezerwacji: string;
  klient: string;
  firma: string;
  data_utworzenia: string;
  data_zakonczenia: string;
  status: string;
  komentarz: string | null;
  laczna_ilosc: number;
  products?: ReservationProduct[];
}

interface ProductRow {
  kod: string;
  nazwa: string;
  ilosc: string;
  originalIlosc?: number;
  iloscWydane?: number;
}

interface EditReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  reservation: Reservation | null;
}

export const EditReservationModal: React.FC<EditReservationModalProps> = ({ isOpen, onClose, onSubmit, reservation }) => {
  const [klient, setKlient] = useState('');
  const [numerRezerwacji, setNumerRezerwacji] = useState('');
  const [dataRezerwacji, setDataRezerwacji] = useState<Date | null>(null);
  const [dataZakonczenia, setDataZakonczenia] = useState<Date | null>(null);
  const [status, setStatus] = useState('aktywna');
  const [komentarz, setKomentarz] = useState('');
  const [productRows, setProductRows] = useState<ProductRow[]>([{ kod: '', nazwa: '', ilosc: '' }]);
  const [products, setProducts] = useState<any[]>([]);
  const [stockInfo, setStockInfo] = useState<any[]>([]);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [activeSearchId, setActiveSearchId] = useState<number | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [fieldsWithErrors, setFieldsWithErrors] = useState<Set<number>>(new Set());
  const [hasIssuedProducts, setHasIssuedProducts] = useState(false);
  const lastToastFieldId = useRef<number | null>(null);

  // Загрузка информации о складе при открытии (с данными о резервациях)
  useEffect(() => {
    const loadStockInfo = async () => {
      try {
        // Используем search endpoint с пустым запросом, чтобы получить все продукты с ilosc_reserved
        const response = await fetch('/api/working-sheets/search?query=&for_reservation=true');
        if (response.ok) {
          const data = await response.json();
          setStockInfo(data);
        }
      } catch (error) {
        console.error('Error loading stock info:', error);
      }
    };

    if (isOpen) {
      loadStockInfo();
    }
  }, [isOpen]);

  // Инициализация данных при открытии модального окна
  useEffect(() => {
    if (isOpen && reservation) {
      setKlient(reservation.klient);
      setSearchQuery(reservation.klient);
      setSelectedClient({ nazwa: reservation.klient, firma: reservation.firma });
      setNumerRezerwacji(reservation.numer_rezerwacji);
      setStatus(reservation.status);
      setKomentarz(reservation.komentarz || '');
      setFieldsWithErrors(new Set());
      lastToastFieldId.current = null;
      
      if (reservation.data_utworzenia) {
        setDataRezerwacji(new Date(reservation.data_utworzenia));
      }
      
      if (reservation.data_zakonczenia) {
        setDataZakonczenia(new Date(reservation.data_zakonczenia));
      }
      
      if (reservation.products && reservation.products.length > 0) {
        const formattedProducts: ProductRow[] = reservation.products.map(product => ({
          kod: product.product_kod || '',
          nazwa: product.product_nazwa || '',
          ilosc: (product.ilosc || 0).toString(),
          originalIlosc: product.ilosc || 0,
          iloscWydane: product.ilosc_wydane || 0
        }));
        setProductRows(formattedProducts);
        
        // Проверяем, есть ли выданные товары
        const hasIssued = reservation.products.some(p => (p.ilosc_wydane || 0) > 0);
        setHasIssuedProducts(hasIssued);
      } else {
        setProductRows([{ kod: '', nazwa: '', ilosc: '' }]);
        setHasIssuedProducts(false);
      }
    }
  }, [isOpen, reservation]);

  // Эффект для поиска продуктов
  useEffect(() => {
    const searchProducts = async () => {
      if (activeSearchId === null || !productRows.find((_, index) => index === activeSearchId)?.nazwa.trim()) {
        setProducts([]);
        return;
      }

      setIsProductLoading(true);
      try {
        const query = productRows.find((_, index) => index === activeSearchId)?.nazwa || '';
        if (!query.trim()) {
          setProducts([]);
          setIsProductLoading(false);
          return;
        }
        const response = await fetch(`/api/working-sheets/search?query=${encodeURIComponent(query)}&for_reservation=true`);
        if (!response.ok) throw new Error('Failed to fetch products');
        const data = await response.json();
        setProducts(data);
      } catch (error) {
        console.error('Error searching products:', error);
        setProducts([]);
      } finally {
        setIsProductLoading(false);
      }
    };

    const timeoutId = setTimeout(searchProducts, 300);
    return () => clearTimeout(timeoutId);
  }, [productRows, activeSearchId]);

  // Эффект для поиска клиентов
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

  const addNewRow = () => {
    setProductRows([...productRows, { kod: '', nazwa: '', ilosc: '' }]);
  };


  const handleProductSelect = (index: number, product: any) => {
    const newRows = [...productRows];
    newRows[index] = {
      ...newRows[index],
      kod: product.kod,
      nazwa: product.nazwa
    };
    setProductRows(newRows);
    setActiveSearchId(null);
    
    // Обновляем stockInfo с выбранным продуктом
    const existingIndex = stockInfo.findIndex(p => p.kod === product.kod);
    if (existingIndex < 0) {
      setStockInfo([...stockInfo, product]);
    }
  };

  const handleQuantityChange = (index: number, value: string) => {
    const newRows = [...productRows];
    newRows[index].ilosc = value;
    setProductRows(newRows);

    const row = newRows[index];
    const newQuantity = parseInt(value) || 0;
    const originalQuantity = row.originalIlosc || 0;
    const iloscWydane = row.iloscWydane || 0;

    // ВСЕГДА сбрасываем lastToastFieldId при любом изменении
    lastToastFieldId.current = null;
    
    // Если значение пустое или 0 - ВСЕГДА очищаем ошибку
    if (!value.trim() || newQuantity === 0) {
      setFieldsWithErrors(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
      return;
    }
    
    // Получаем информацию о доступном количестве
    // stockQuantity = суммарный остаток (основной + семплы) благодаря for_reservation=true
    const stockProduct = stockInfo.find(p => p.kod === row.kod);
    const stockQuantity = stockProduct?.ilosc || 0;
    const totalReserved = stockProduct?.ilosc_reserved || 0;
    const maxForThisReservation = stockQuantity - totalReserved + originalQuantity;
    
    let errorMessage: string | null = null;

    // Проверка 1: нельзя уменьшить ниже уже выданного
    if (newQuantity < iloscWydane) {
      errorMessage = `Nie można zmniejszyć poniżej wydanej ilości (${iloscWydane} szt.)`;
    }
    // Проверка 2: проверяем доступность na magazynie
    else if (row.kod && newQuantity > maxForThisReservation) {
      const availableToAdd = Math.max(0, maxForThisReservation - originalQuantity);
      errorMessage = totalReserved > 0
        ? `Niewystarczająca ilość - dostępne do rezerwacji: ${availableToAdd} szt. (łącznie na magazynie: ${stockQuantity}, zarezerwowane przez innych: ${totalReserved})`
        : `Niewystarczająca ilość - dostępne do rezerwacji: ${availableToAdd} szt. (łącznie na magazynie: ${stockQuantity})`;
    }

    // Обновляем состояние ошибок
    setFieldsWithErrors(prev => {
      const newSet = new Set(prev);
      if (errorMessage) {
        newSet.add(index);
      } else {
        newSet.delete(index);
      }
      return newSet;
    });
    
    // Показываем toast если есть ошибка
    if (errorMessage) {
      toast.error(errorMessage);
    }
  };

  const isFormValid = () => {
    // Проверяем, что клиент выбран
    if (!selectedClient || !klient.trim()) return false;
    
    // Проверяем дату окончания
    if (status === 'bezterminowa') return true;
    if (!dataZakonczenia) return false;
    if (dataRezerwacji && !isValidReservationEndDate(dataRezerwacji, dataZakonczenia)) return false;
    
    if (fieldsWithErrors.size > 0) return false;
    
    const validProducts = productRows.filter(row => row.kod.trim() && row.nazwa.trim() && row.ilosc.trim());
    if (validProducts.length === 0) return false;
    
    // Проверяем каждый продукт
    for (let i = 0; i < productRows.length; i++) {
      const row = productRows[i];
      if (!row.kod.trim() || !row.nazwa.trim() || !row.ilosc.trim()) continue;
      
      const newQuantity = parseInt(row.ilosc) || 0;
      const iloscWydane = row.iloscWydane || 0;
      const originalQuantity = row.originalIlosc || 0;
      
      // Проверка 1: нельзя уменьшить ниже выданного
      if (newQuantity < iloscWydane) return false;
      
      // Проверка 2: при увеличении проверяем доступность
      if (newQuantity > originalQuantity && row.kod) {
        const stockProduct = stockInfo.find(p => p.kod === row.kod);
        const stockQuantity = stockProduct?.ilosc || 0;
        const totalReserved = stockProduct?.ilosc_reserved || 0;
        // Свободный остаток + наш текущий резерв = максимум для этой резервации
        const maxForThisReservation = stockQuantity - totalReserved + originalQuantity;
        
        if (newQuantity > maxForThisReservation) return false;
      }
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservation) return;

    if (!selectedClient || !klient.trim()) {
      toast.error('Wybierz klienta');
      return;
    }

    if (!numerRezerwacji.trim()) {
      toast.error('Wprowadź numer rezerwacji');
      return;
    }

    if (status !== 'bezterminowa' && !dataZakonczenia) {
      toast.error('Wybierz datę zakończenia');
      return;
    }

    if (status !== 'bezterminowa' && dataRezerwacji && dataZakonczenia && !isValidReservationEndDate(dataRezerwacji, dataZakonczenia)) {
      toast.error('Data zakończenia musi być co najmniej następnego dnia po dacie rezerwacji');
      return;
    }

    const validProducts = productRows.filter(row => row.kod.trim() && row.nazwa.trim() && row.ilosc.trim());
    
    if (validProducts.length === 0) {
      toast.error('Dodaj produkty do rezerwacji');
      return;
    }

    if (!isFormValid()) {
      toast.error('Popraw błędy w formularzu');
      return;
    }

    const productsData = validProducts.map(product => ({
      kod: product.kod,
      nazwa: product.nazwa,
      ilosc: parseInt(product.ilosc) || 0,
      originalIlosc: product.originalIlosc || 0,
      iloscWydane: product.iloscWydane || 0
    }));

    try {
      const response = await fetch(`/api/reservations/${reservation.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          klient: klient.trim(),
          numer_rezerwacji: numerRezerwacji.trim(),
          data_utworzenia: dataRezerwacji ? dataRezerwacji.toISOString().split('T')[0] : null,
          data_zakonczenia: status === 'bezterminowa'
            ? INDEFINITE_RESERVATION_END_DATE
            : dataZakonczenia!.toISOString().split('T')[0],
          status,
          komentarz: komentarz.trim() || null,
          products: productsData
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update reservation');
      }

      toast.success('Rezerwacja została zaktualizowana');
      handleClose();
      onSubmit();
    } catch (error: any) {
      console.error('Error updating reservation:', error);
      toast.error(error.message || 'Wystąpił błąd podczas aktualizacji rezerwacji');
    }
  };

  const handleClose = () => {
    setKlient('');
    setSearchQuery('');
    setSelectedClient(null);
    setClients([]);
    setNumerRezerwacji('');
    setDataRezerwacji(null);
    setDataZakonczenia(null);
    setStatus('aktywna');
    setKomentarz('');
    setProductRows([{ kod: '', nazwa: '', ilosc: '' }]);
    setProducts([]);
    setStockInfo([]);
    setActiveSearchId(null);
    setFieldsWithErrors(new Set());
    setHasIssuedProducts(false);
    lastToastFieldId.current = null;
    onClose();
  };

  if (!reservation) return null;

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
      <div className="font-sora h-full flex flex-col overflow-hidden">
        <div className="flex justify-between items-center mb-8 select-none">
          <h2 className="text-base font-semibold text-gray-800">Edytuj rezerwację</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-red-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 flex-grow overflow-y-auto pr-2">
          {/* Основная информация */}
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-[200px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Data rezerwacji
                </label>
                <DatePicker
                  selected={dataRezerwacji}
                  onChange={() => {}}
                  locale="pl"
                  dateFormat="dd/MM/yyyy"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-gray-50"
                  placeholderText="Wybierz datę"
                  popperClassName="z-50"
                  disabled
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
              <div className="w-[200px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Data zakończenia rezerwacji
                </label>
                {status === 'bezterminowa' ? (
                  <input
                    type="text"
                    value="∞"
                    readOnly
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-left bg-gray-50 text-gray-700 cursor-not-allowed"
                  />
                ) : (
                <DatePicker
                  selected={dataZakonczenia}
                  onChange={(date: Date | null) => setDataZakonczenia(date)}
                  locale="pl"
                  dateFormat="dd/MM/yyyy"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                  placeholderText="Wybierz datę"
                  popperClassName="z-50"
                  minDate={dataRezerwacji ? getMinReservationEndDate(dataRezerwacji) : undefined}
                />
                )}
              </div>
            </div>
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
              Klient
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  if (hasIssuedProducts) return; // Блокируем изменение если есть выданные товары
                  setSearchQuery(e.target.value);
                  if (selectedClient) {
                    setSelectedClient(null);
                    setKlient(''); // Очищаем klient при изменении поиска
                  }
                }}
                placeholder="Wyszukaj klienta..."
                disabled={hasIssuedProducts}
                title={hasIssuedProducts ? "Nie można zmienić klienta - część towaru została już wydana" : ""}
                className={`w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs ${hasIssuedProducts ? 'bg-gray-50 cursor-not-allowed' : ''}`}
              />
              {isLoading && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                </div>
              )}
            </div>
            {clients.length > 0 && !selectedClient && !hasIssuedProducts && (
              <div className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm border border-gray-200">
                {clients.map((client) => (
                  <div
                    key={client.id}
                    className="cursor-pointer select-none relative py-1 pl-3 pr-9 hover:bg-blue-50"
                    onClick={() => {
                      setSelectedClient(client);
                      setSearchQuery(client.nazwa);
                      setKlient(client.nazwa);
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
                  {!hasIssuedProducts && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClient(null);
                        setSearchQuery('');
                        setKlient('');
                      }}
                      className="text-gray-500 hover:text-gray-700 absolute right-0"
                    >
                      <X size={16} />
                    </button>
                  )}
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

          {/* Продукты */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700 font-sora">
              Produkty
            </label>
            {productRows.map((row, index) => (
              <div key={index} className="relative">
                <div className="flex">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={row.nazwa}
                      onChange={(e) => {
                        const newRows = [...productRows];
                        newRows[index].nazwa = e.target.value;
                        newRows[index].kod = ''; // Сбрасываем код при изменении названия
                        setProductRows(newRows);
                        setActiveSearchId(index);
                      }}
                      onFocus={() => setActiveSearchId(index)}
                      placeholder="Wyszukaj produkty..."
                      className="w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                      disabled={(row.iloscWydane ?? 0) > 0}
                    />
                  </div>

                  <div className="w-20 ml-2">
                    <input
                      type="number"
                      min={row.iloscWydane || 1}
                      placeholder="Ilość"
                      value={row.ilosc}
                      onChange={(e) => handleQuantityChange(index, e.target.value)}
                      className={`w-full px-3 py-1.5 border rounded-md focus:outline-none font-sora text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                        fieldsWithErrors.has(index) ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                    />
                  </div>

                </div>

                {index === productRows.length - 1 && (
                  <button
                    type="button"
                    onClick={addNewRow}
                    className="absolute -bottom-7 left-0 text-gray-400 hover:text-gray-600"
                    title="Dodaj nową pozycję"
                  >
                    <Plus size={16} />
                  </button>
                )}

                {isProductLoading && activeSearchId === index && (
                  <div className="absolute right-24 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  </div>
                )}
                {products.length > 0 && activeSearchId === index && row.nazwa.trim() && (
                  <div className="absolute z-50 mt-1 w-[calc(100%-6rem)] bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm border border-gray-200">
                    {products.map((product) => (
                      <div
                        key={product.kod}
                        className="cursor-pointer select-none relative py-1 pl-3 pr-9 hover:bg-blue-50"
                        onClick={() => handleProductSelect(index, product)}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-[10px]">{product.kod}</span>
                          {product.nazwa && product.nazwa.includes(' (samples)') ? (
                            <div className="text-[10px]">
                              <span className="text-gray-500">{product.nazwa.replace(' (samples)', '')}</span>{' '}
                              <span className="font-medium">(samples)</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-500">{product.nazwa}</span>
                          )}
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
        </form>

        <div className="absolute bottom-4 right-4 flex space-x-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-1.5 text-gray-600 hover:text-gray-800 focus:outline-none text-xs rounded-md font-sora"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isFormValid()}
            className={`px-6 py-1.5 text-white text-xs rounded-md focus:outline-none transition-colors font-sora ${
              isFormValid() ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            Zapisz zmiany
          </button>
        </div>
      </div>
    </Modal>
  );
};
