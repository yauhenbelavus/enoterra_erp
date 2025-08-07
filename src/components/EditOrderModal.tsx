import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Search } from 'lucide-react';
import Modal from 'react-modal';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import "../components/DatePicker.css";
import toast from 'react-hot-toast';
import { API_URL } from '../config';

registerLocale('pl', pl);

const TYPY_ZAMOWIENIA = [
  { value: 'sprzedaz', label: 'Sprzedaż', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'probka', label: 'Próbka', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'degustacja', label: 'Degustacja', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'zamiana', label: 'Zamiana', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'prezent', label: 'Prezent', color: 'bg-pink-100 text-pink-800 border-pink-200' }
];

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

interface ProductRow {
  kod: string;
  nazwa: string;
  kod_kreskowy: string;
  ilosc: string;
  typ: string;
}

interface EditOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
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
  order: Order | null;
}

export const EditOrderModal: React.FC<EditOrderModalProps> = ({ isOpen, onClose, onSubmit, order }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const [klient, setKlient] = useState('');
  const [numerZamowienia, setNumerZamowienia] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [productRows, setProductRows] = useState<ProductRow[]>([{ kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', typ: '' }]);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [activeSearchId, setActiveSearchId] = useState<number | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);

  // Инициализация данных при открытии модального окна
  useEffect(() => {
    if (isOpen && order) {
      setKlient(order.klient);
      setSearchQuery(order.klient);
      setSelectedClient({ nazwa: order.klient });
      setNumerZamowienia(order.numer_zamowienia);
      
      // Парсим дату
      let selectedDateValue: Date | null = null;
      if (order.data_utworzenia) {
        if (order.data_utworzenia.includes('/')) {
          const [day, month, year] = order.data_utworzenia.split('/');
          selectedDateValue = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        } else if (order.data_utworzenia.includes('-')) {
          selectedDateValue = new Date(order.data_utworzenia);
        } else {
          selectedDateValue = new Date(order.data_utworzenia);
        }
      }
      setSelectedDate(selectedDateValue);
      
      // Преобразуем продукты в формат для редактирования
      if (order.products && order.products.length > 0) {
        console.log('Order products from backend:', order.products);
        const formattedProducts: ProductRow[] = order.products.map(product => ({
          kod: product.kod || '',
          nazwa: product.nazwa || '',
          kod_kreskowy: product.kod_kreskowy || '',
          ilosc: (product.ilosc || 0).toString(),
          typ: product.typ || ''
        }));
        console.log('Formatted products:', formattedProducts);
        setProductRows(formattedProducts);
      } else {
        setProductRows([{ kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', typ: '' }]);
      }
    }
  }, [isOpen, order]);

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
        const response = await fetch(`${API_URL}/api/products/search?query=${encodeURIComponent(query)}`);
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

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLElement && e.target.closest('button')) {
      return;
    }
    
    setIsDragging(true);
    const startX = e.clientX - position.x;
    const startY = e.clientY - position.y;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - startX,
        y: e.clientY - startY
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const addNewRow = () => {
    setProductRows([...productRows, { kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', typ: '' }]);
  };

  const deleteRow = (index: number) => {
    if (productRows.length > 1) {
      setProductRows(productRows.filter((_, i) => i !== index));
    }
  };

  const handleTypChange = (index: number, value: string) => {
    const newRows = [...productRows];
    newRows[index].typ = value;
    setProductRows(newRows);
    setOpenDropdownIndex(null);
  };

  const toggleDropdown = (index: number) => {
    if (openDropdownIndex === index) {
      setOpenDropdownIndex(null);
    } else {
      setOpenDropdownIndex(index);
    }
  };

  const handleProductSelect = (index: number, product: any) => {
    console.log('Selected product:', product);
    console.log('Product kod_kreskowy:', product.kod_kreskowy);
    console.log('Product kodKreskowy:', product.kodKreskowy);
    console.log('Product ean:', product.ean);
    
    const newRows = [...productRows];
    newRows[index] = {
      ...newRows[index],
      kod: product.kod,
      nazwa: product.nazwa,
      kod_kreskowy: product.kod_kreskowy || product.kodKreskowy || product.ean || ''
    };
    console.log('Updated row:', newRows[index]);
    setProductRows(newRows);
    setProducts([]);
    setActiveSearchId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    // Валидация
    if (!klient.trim()) {
      toast.error('Wprowadź nazwę klienta');
      return;
    }

    if (!numerZamowienia.trim()) {
      toast.error('Wprowadź numer zamówienia');
      return;
    }

    const validProducts = productRows.filter(row => row.kod.trim() && row.nazwa.trim() && row.ilosc.trim() && row.typ.trim());
    
    if (validProducts.length === 0) {
      toast.error('Dodaj produkty do zamówienia');
      return;
    }

    // Проверяем, что для всех продуктов указано количество и тип
    if (validProducts.some(product => !product.ilosc || !product.typ)) {
      toast.error('Wprowadź ilość i typ dla wszystkich produktów');
      return;
    }

    const productsData = validProducts.map(product => ({
      kod: product.kod,
      kod_kreskowy: product.kod_kreskowy,
      nazwa: product.nazwa,
      ilosc: parseInt(product.ilosc) || 0,
      typ: product.typ
    }));

    console.log('Sending products data:', productsData);

    try {
      const response = await fetch(`${API_URL}/api/orders/${order.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          klient: klient.trim(),
          numer_zamowienia: numerZamowienia.trim(),
          products: productsData
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update order');
      }

      toast.success('Zamówienie zostało zaktualizowane');
      handleClose();
      onSubmit({
        id: order.id,
        klient: klient.trim(),
        numer_zamowienia: numerZamowienia.trim(),
        products: productsData
      });
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Wystąpił błąd podczas aktualizacji zamówienia');
    }
  };

  const handleClose = () => {
    setKlient('');
    setSearchQuery('');
    setSelectedClient(null);
    setClients([]);
    setNumerZamowienia('');
    setSelectedDate(null);
    setProductRows([{ kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', typ: '' }]);
    setOpenDropdownIndex(null);
    setProducts([]);
    setActiveSearchId(null);
    setPosition({ x: 0, y: 0 });
    onClose();
  };

  const calculateTotalQuantity = () => {
    return productRows.reduce((total, row) => {
      const quantity = parseInt(row.ilosc) || 0;
      return total + quantity;
    }, 0);
  };

  if (!order) return null;

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
          <h2 className="text-base font-semibold text-gray-800">Edytuj zamówienie</h2>
          <button
            onClick={handleClose}
            className="text-red-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 flex-grow overflow-y-auto pr-2">
          {/* Основная информация */}
          <div className="space-y-4">
            <div className="flex space-x-4">
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
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Numer zamówienia
                </label>
                <input
                  type="text"
                  value={numerZamowienia}
                  onChange={(e) => setNumerZamowienia(e.target.value)}
                  placeholder="Wprowadź numer zamówienia"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                />
              </div>
            </div>
            <div>
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
            </div>

            {selectedClient && (
              <div className="bg-green-50 p-3 rounded-md">
                <div className="flex justify-between items-start">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 flex-1">
                    <div>
                      <p className="font-medium text-gray-900 text-xs">Nazwa:</p>
                      <p className="text-xs text-gray-900">{selectedClient.nazwa}</p>
                    </div>
                    {selectedClient.firma && (
                      <div>
                        <p className="font-medium text-gray-900 text-xs">Firma:</p>
                        <p className="text-xs text-gray-900">{selectedClient.firma}</p>
                      </div>
                    )}
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
                      setKlient('');
                    }}
                    className="text-gray-500 hover:text-gray-700 ml-4"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Продукты */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700 font-sora">
              Produkty
            </label>
            {productRows.map((row, index) => (
              <div key={index} className="relative">
                <div className="flex">
                  <div className="relative flex-1 max-w-[70%]">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={row.nazwa}
                      onChange={(e) => {
                        const newRows = [...productRows];
                        newRows[index].nazwa = e.target.value;
                        setProductRows(newRows);
                        setActiveSearchId(index);
                      }}
                      onFocus={() => setActiveSearchId(index)}
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
                      value={row.ilosc}
                      onChange={(e) => {
                        const newRows = [...productRows];
                        newRows[index].ilosc = e.target.value;
                        setProductRows(newRows);
                      }}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>

                  {/* Dropdown для типа заказа */}
                  <div className="w-24 ml-2 relative dropdown-container">
                    <button
                      type="button"
                      onClick={() => toggleDropdown(index)}
                      className={`w-full px-2 py-1.5 border rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ${row.typ ? TYPY_ZAMOWIENIA.find(t => t.value === row.typ)?.color || 'border-gray-300 bg-white' : 'border-gray-300 bg-white'}`}
                    >
                      <span className="truncate text-[10px]">
                        {row.typ ? TYPY_ZAMOWIENIA.find(t => t.value === row.typ)?.label || 'Typ' : 'Typ'}
                      </span>
                      <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdownIndex === index && (
                      <div 
                        className="absolute top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-40 overflow-y-auto w-full"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {TYPY_ZAMOWIENIA.map((typ) => (
                          <button
                            key={typ.value}
                            type="button"
                            onClick={() => handleTypChange(index, typ.value)}
                            className={`w-full px-2 py-1.5 text-left text-[10px] hover:bg-gray-50 ${typ.color}`}
                          >
                            {typ.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Кнопка удаления позиции */}
                  {productRows.length > 1 && (
                    <button
                      onClick={() => deleteRow(index)}
                      className="ml-2 text-red-400 hover:text-red-600"
                      title="Usuń pozycję"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Кнопка добавления новой позиции (только для последней строки) */}
                {index === productRows.length - 1 && (
                  <button
                    onClick={addNewRow}
                    className="absolute -bottom-7 left-0 text-gray-400 hover:text-gray-600"
                    title="Dodaj nową pozycję"
                  >
                    <Plus size={16} />
                  </button>
                )}

                {isProductLoading && activeSearchId === index && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  </div>
                )}
                {products.length > 0 && activeSearchId === index && (
                  <div className="absolute z-50 mt-1 w-[70%] bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm border border-gray-200">
                    {products.map((product) => (
                      <div
                        key={product.kod}
                        className="cursor-pointer select-none relative py-1 pl-3 pr-9 hover:bg-blue-50"
                        onClick={() => handleProductSelect(index, product)}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-[10px]">{product.kod}</span>
                          <span className="text-[10px] text-gray-500">{product.nazwa}</span>
                          <span className="text-[10px] text-gray-500">Dostępna ilość: {product.ilosc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Кнопки */}
          {/* The buttons are now moved to the bottom */}
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
            onClick={handleSubmit}
            className="px-6 py-1.5 text-white text-xs rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-sora bg-blue-600 hover:bg-blue-700"
          >
            Zapisz zmiany
          </button>
        </div>
      </div>
    </Modal>
  );
}; 