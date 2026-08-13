
import React, { useState, useEffect } from 'react';
import { X, Plus, Search } from 'lucide-react';
import Modal from 'react-modal';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import "../components/DatePicker.css";
import toast from 'react-hot-toast';

registerLocale('pl', pl);

// Функция для извлечения даты из номера заказа (возвращает Date объект)
const extractDateFromOrderNumber = (orderNumber: string): Date | null => {
  try {
    // Паттерн: номер_день_месяц_год (например: 1101_12_09_2025)
    const datePattern = /(\d{1,2})_(\d{1,2})_(\d{4})$/;
    const match = orderNumber.match(datePattern);
    
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // месяц 0-indexed
      const year = parseInt(match[3], 10);
      
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    return null;
  } catch (error) {
    console.error('Error extracting date from order number:', error);
    return null;
  }
};

interface ProductRow {
  kod: string;
  nazwa: string;
  ilosc: string;
  cena_netto: string;
  rabat: string;
  vat: number;
  searchQuery?: string;
  isFromKomis?: boolean;
  maxIlosc?: number;
}

interface SearchProduct {
  kod: string;
  nazwa: string;
  cena_sprzedazy: number | null;
}

interface SearchClient {
  id: number;
  firma: string;
  nazwa: string;
}

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  prefilledKlient?: string;
  prefilledProducts?: Array<{
    kod: string;
    nazwa: string;
    ilosc: number;
    cena_sprzedazy?: number | null;
  }>;
  orderData?: {
    id: number;
    klient: string;
    numer_zamowienia: string;
    products?: Array<{
      kod: string;
      nazwa: string;
      ilosc: number;
      typ?: string;
    }>;
  } | null;
}

const VAT_RATES = [
  { value: 0, label: '0%' },
  { value: 5, label: '5%' },
  { value: 8, label: '8%' },
  { value: 23, label: '23%' }
];

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, onClose, onSuccess, orderData, prefilledKlient, prefilledProducts }) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [terminPlatnosci, setTerminPlatnosci] = useState<Date | null>(null);
  const [numerFaktury, setNumerFaktury] = useState<string>('');
  const [klient, setKlient] = useState<string>('');
  const [productRows, setProductRows] = useState<ProductRow[]>([
    { kod: '', nazwa: '', ilosc: '', cena_netto: '', rabat: '', vat: 23 }
  ]);
  const [initialProductCount, setInitialProductCount] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openVatDropdownIndex, setOpenVatDropdownIndex] = useState<number | null>(null);
  const [searchProducts, setSearchProducts] = useState<SearchProduct[]>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchClients, setSearchClients] = useState<SearchClient[]>([]);
  const [clientSearchQuery, setClientSearchQuery] = useState<string>('');
  const [isClientSearchActive, setIsClientSearchActive] = useState(false);
  const [isClientSearchLoading, setIsClientSearchLoading] = useState(false);

  // Функция для загрузки цен из working_sheets
  const loadPricesFromWorkingSheets = async () => {
    try {
      // Получаем все данные из working_sheets
      const response = await fetch('/api/working-sheets');
      if (!response.ok) {
        console.error('❌ Failed to fetch working sheets');
        return;
      }
      
      const workingSheets = await response.json();
      
      // Создаем карту цен по кодам товаров
      const priceMap = new Map<string, number>();
      workingSheets.forEach((ws: any) => {
        if (ws.kod && ws.cena_sprzedazy !== null && ws.cena_sprzedazy !== undefined) {
          const price = Number(ws.cena_sprzedazy);
          if (!isNaN(price)) {
            priceMap.set(ws.kod, price);
          }
        }
      });
      
      // Обновляем productRows с ценами
      setProductRows(prevRows => {
        return prevRows.map(row => {
          if (row.kod && priceMap.has(row.kod)) {
            const price = priceMap.get(row.kod)!;
            // Форматируем цену: если есть десятичные, оставляем, иначе добавляем ,00
            const formattedPrice = price % 1 === 0 
              ? `${price.toFixed(0)},00` 
              : price.toFixed(2).replace('.', ',');
            return {
              ...row,
              cena_netto: formattedPrice
            };
          }
          return row;
        });
      });
      
      console.log('✅ Prices loaded from working_sheets');
    } catch (error) {
      console.error('❌ Error loading prices from working_sheets:', error);
    }
  };

  // Инициализация модального окна (без запроса номера — он зависит от даты)
  useEffect(() => {
    if (isOpen) {
      // Если передан заказ, загружаем его данные
      if (orderData) {
        setKlient(orderData.klient);
        
        // Извлекаем дату из номера заказа, если не получится - используем текущую
        const orderDate = extractDateFromOrderNumber(orderData.numer_zamowienia);
        const dateToUse = orderDate || new Date();
        setSelectedDate(dateToUse);
        setTerminPlatnosci(dateToUse);
        
        if (orderData.products && orderData.products.length > 0) {
          // Фильтруем только товары с типом 'sprzedaz' или 'probka'
          const filteredProducts = orderData.products.filter(p => 
            p.typ === 'sprzedaz' || p.typ === 'probka'
          );
          
          if (filteredProducts.length > 0) {
            const initialProducts = filteredProducts.map(p => ({
              kod: p.kod,
              nazwa: p.nazwa,
              ilosc: p.ilosc.toString(),
              cena_netto: '',
              rabat: p.typ === 'probka' ? '30' : '',
              vat: 23
            }));
            setProductRows(initialProducts);
            setInitialProductCount(initialProducts.length);
            
            // Загружаем цены из working_sheets
            loadPricesFromWorkingSheets();
          }
        }
      } else {
        // Если нет заказа - используем текущую дату и сбрасываем initialProductCount
        const now = new Date();
        setSelectedDate(now);
        setTerminPlatnosci(now);
        setInitialProductCount(0);
        // Предзаполнение клиента (например, из komis)
        if (prefilledKlient) {
          setKlient(prefilledKlient);
          setClientSearchQuery(prefilledKlient);
        }
        // Предзаполнение товаров (например, из komis)
        if (prefilledProducts && prefilledProducts.length > 0) {
          const rows = prefilledProducts.map(p => {
            const price = p.cena_sprzedazy;
            const formattedPrice = price != null
              ? (price % 1 === 0 ? `${price.toFixed(0)},00` : price.toFixed(2).replace('.', ','))
              : '';
            return {
              kod: p.kod,
              nazwa: p.nazwa,
              ilosc: String(p.ilosc),
              cena_netto: formattedPrice,
              rabat: '',
              vat: 23,
              searchQuery: p.nazwa,
              isFromKomis: true,
              maxIlosc: p.ilosc
            };
          });
          setProductRows(rows);
          setInitialProductCount(0);
        }
      }
    } else {
      setSelectedDate(null);
      setTerminPlatnosci(null);
      setNumerFaktury('');
      setKlient('');
      setClientSearchQuery('');
      setSearchClients([]);
      setIsClientSearchActive(false);
      setProductRows([{ kod: '', nazwa: '', ilosc: '', cena_netto: '', rabat: '', vat: 23 }]);
      setInitialProductCount(0);
    }
  }, [isOpen, orderData, prefilledKlient, prefilledProducts]);

  // Запрос номера фактуры с учётом выбранной даты (месяц/год берётся из data_faktury)
  // Пересчитывается при смене selectedDate
  useEffect(() => {
    if (!isOpen || !selectedDate) return;

    const dateParam = selectedDate.toLocaleDateString('en-CA');
    fetch(`/api/invoices/next-number-only?data_faktury=${encodeURIComponent(dateParam)}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch next number');
        return res.json();
      })
      .then(data => {
        if (data.numer_faktury) {
          setNumerFaktury(data.numer_faktury);
          console.log('✅ Set invoice number to:', data.numer_faktury);
        }
      })
      .catch(err => {
        console.error('❌ Error fetching next invoice number:', err);
      });
  }, [isOpen, selectedDate]);

  // Закрытие dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      if (openVatDropdownIndex !== null) {
        if (!target.closest('.dropdown-container')) {
          setOpenVatDropdownIndex(null);
        }
      }
      
      // Закрываем поиск продуктов при клике вне
      if (activeSearchIndex !== null) {
        if (!target.closest('.product-search-container')) {
          setActiveSearchIndex(null);
          setSearchProducts([]);
        }
      }
      
      // Закрываем поиск клиентов при клике вне
      if (isClientSearchActive) {
        if (!target.closest('.client-search-container')) {
          setIsClientSearchActive(false);
          setSearchClients([]);
        }
      }
    };
    
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenVatDropdownIndex(null);
        setActiveSearchIndex(null);
        setSearchProducts([]);
        setIsClientSearchActive(false);
        setSearchClients([]);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openVatDropdownIndex, activeSearchIndex, isClientSearchActive]);

  // Эффект для поиска продуктов
  useEffect(() => {
    const searchProductsAsync = async () => {
      if (activeSearchIndex === null || activeSearchIndex < initialProductCount) {
        setSearchProducts([]);
        return;
      }
      
      const row = productRows[activeSearchIndex];
      const query = row?.searchQuery || '';
      
      if (query.trim().length < 1) {
        setSearchProducts([]);
        return;
      }

      setIsSearchLoading(true);
      try {
        const response = await fetch(`/api/working-sheets/search-simple?query=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Failed to fetch products');
        const data = await response.json();
        
        const transformedData = data.map((item: any) => ({
          kod: item.kod,
          nazwa: item.nazwa,
          cena_sprzedazy: item.cena_sprzedazy
        }));
        
        setSearchProducts(transformedData);
      } catch (error) {
        console.error('Error searching products:', error);
        setSearchProducts([]);
      } finally {
        setIsSearchLoading(false);
      }
    };

    const timeoutId = setTimeout(searchProductsAsync, 300);
    return () => clearTimeout(timeoutId);
  }, [activeSearchIndex, productRows, initialProductCount]);

  // Эффект для поиска клиентов
  useEffect(() => {
    const searchClientsAsync = async () => {
      if (!isClientSearchActive || clientSearchQuery.trim().length < 1) {
        setSearchClients([]);
        return;
      }

      setIsClientSearchLoading(true);
      try {
        const response = await fetch(`/api/clients/search?q=${encodeURIComponent(clientSearchQuery)}`);
        if (!response.ok) throw new Error('Failed to fetch clients');
        const data = await response.json();
        
        setSearchClients(data.map((item: any) => ({
          id: item.id,
          firma: item.firma,
          nazwa: item.nazwa
        })));
      } catch (error) {
        console.error('Error searching clients:', error);
        setSearchClients([]);
      } finally {
        setIsClientSearchLoading(false);
      }
    };

    const timeoutId = setTimeout(searchClientsAsync, 300);
    return () => clearTimeout(timeoutId);
  }, [isClientSearchActive, clientSearchQuery]);

  const handleClientSelect = (client: SearchClient) => {
    setKlient(client.nazwa);
    setClientSearchQuery(client.nazwa);
    setIsClientSearchActive(false);
    setSearchClients([]);
  };

  const addNewRow = () => {
    setProductRows([...productRows, { kod: '', nazwa: '', ilosc: '', cena_netto: '', rabat: '', vat: 23, searchQuery: '' }]);
  };

  const deleteRow = (index: number) => {
    // Нельзя удалять изначальные продукты из заказа
    if (index < initialProductCount) {
      return;
    }
    
    if (productRows.length > 1) {
      const newRows = [...productRows];
      newRows.splice(index, 1);
      setProductRows(newRows);
    }
  };

  const toggleVatDropdown = (index: number) => {
    setOpenVatDropdownIndex(openVatDropdownIndex === index ? null : index);
  };

  const handleVatChange = (index: number, value: number) => {
    const newRows = [...productRows];
    newRows[index].vat = value;
    setProductRows(newRows);
    setOpenVatDropdownIndex(null);
  };

  const handleProductSelect = (index: number, product: SearchProduct) => {
    const newRows = [...productRows];
    const price = product.cena_sprzedazy;
    const formattedPrice = price !== null && price !== undefined
      ? (price % 1 === 0 ? `${price.toFixed(0)},00` : price.toFixed(2).replace('.', ','))
      : '';
    
    newRows[index] = {
      ...newRows[index],
      kod: product.kod,
      nazwa: product.nazwa,
      cena_netto: formattedPrice,
      searchQuery: `${product.kod} - ${product.nazwa}`
    };
    setProductRows(newRows);
    setSearchProducts([]);
    setActiveSearchIndex(null);
  };

  const calculateRowNetto = (row: ProductRow) => {
    const ilosc = parseFloat(row.ilosc) || 0;
    const cena = parseFloat(row.cena_netto.replace(',', '.')) || 0;
    const rabat = parseFloat(row.rabat.replace(',', '.')) || 0;
    const netto = ilosc * cena;
    const nettoPoRabacie = netto * (1 - rabat / 100);
    return nettoPoRabacie;
  };

  /** Сумма скидки по строке в zł (ilosc × cena_netto × rabat% / 100) */
  const calculateRowRabatAmount = (row: ProductRow) => {
    const ilosc = parseFloat(row.ilosc) || 0;
    const cena = parseFloat(row.cena_netto.replace(',', '.')) || 0;
    const rabat = parseFloat(row.rabat.replace(',', '.')) || 0;
    return ilosc * cena * (rabat / 100);
  };

  /** Общая сумма рабата по всей фактуре */
  const calculateTotalRabat = () => {
    return productRows.reduce((sum, row) => sum + calculateRowRabatAmount(row), 0).toFixed(2);
  };

  const calculateRowTotal = (row: ProductRow) => {
    const nettoPoRabacie = calculateRowNetto(row);
    const brutto = nettoPoRabacie * (1 + row.vat / 100);
    return brutto;
  };

  const calculateTotalNetto = () => {
    return productRows.reduce((sum, row) => {
      return sum + calculateRowNetto(row);
    }, 0).toFixed(2);
  };

  const calculateTotalVAT = () => {
    return productRows.reduce((sum, row) => {
      const netto = calculateRowNetto(row);
      const brutto = calculateRowTotal(row);
      return sum + (brutto - netto);
    }, 0).toFixed(2);
  };

  const calculateTotal = () => {
    return productRows.reduce((sum, row) => {
      return sum + calculateRowTotal(row);
    }, 0).toFixed(2);
  };

  const handleSubmit = async () => {
    if (!selectedDate || !klient || !productRows.some(row => 
      row.nazwa && row.ilosc && row.cena_netto
    )) {
      toast.error('Proszę wypełnić wszystkie wymagane pola');
      return;
    }

    setIsSubmitting(true);
    try {
      const formattedProducts = productRows
        .filter(row => row.nazwa && row.ilosc && row.cena_netto)
        .map(row => ({
          kod: row.kod,
          nazwa: row.nazwa,
          ilosc: parseFloat(row.ilosc) || 0,
          cena_netto: parseFloat(row.cena_netto.replace(',', '.')) || 0,
          rabat: parseFloat(row.rabat.replace(',', '.')) || 0,
          vat: row.vat
        }));

      const isPrzesuniecieRow = (row: ProductRow) =>
        Boolean(row.nazwa && row.ilosc && row.cena_netto && (parseFloat(row.ilosc) || 0) > 0);

      const mapPrzesuniecieRow = (row: ProductRow) => ({
        kod: row.kod || '',
        nazwa: row.nazwa || '',
        ilosc: Math.round(parseFloat(row.ilosc) || 0)
      });

      // Przesunięcie: z zamówienia — pozycje dodane poza zamówieniem; z zera — wszystkie pozycje (bez komis)
      const przesuniecieProducts = orderData
        ? productRows
            .filter((row, index) => index >= initialProductCount && isPrzesuniecieRow(row))
            .map(mapPrzesuniecieRow)
        : prefilledProducts
          ? []
          : productRows
              .filter(isPrzesuniecieRow)
              .map(mapPrzesuniecieRow);

      const komisDeductions = prefilledProducts
        ? productRows
            .filter(row => row.isFromKomis && row.kod && row.nazwa && row.ilosc && row.cena_netto)
            .map(row => ({
              kod: row.kod,
              nazwa: row.nazwa,
              ilosc: Math.round(parseFloat(row.ilosc) || 0)
            }))
        : undefined;

      const invoiceData = {
        data_faktury: selectedDate.toLocaleDateString('en-CA'),
        numer_faktury: numerFaktury,
        klient: klient,
        order_id: orderData?.id ?? undefined,
        numer_zamowienia: orderData?.numer_zamowienia ?? undefined,
        termin_platnosci: terminPlatnosci ? terminPlatnosci.toLocaleDateString('en-CA') : undefined,
        products: formattedProducts,
        przesuniecie_products: przesuniecieProducts.length > 0 ? przesuniecieProducts : undefined,
        komis_deductions: komisDeductions && komisDeductions.length > 0 ? komisDeductions : undefined,
        suma_netto: parseFloat(calculateTotalNetto()),
        suma_vat: parseFloat(calculateTotalVAT()),
        total: parseFloat(calculateTotal()),
        rabat_suma: parseFloat(calculateTotalRabat())
      };

      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceData)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      toast.success(`Faktura została utworzona: ${numerFaktury}`);
      onSuccess?.();
      handleClose();
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error(error instanceof Error ? error.message : 'Błąd podczas tworzenia faktury');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedDate(null);
    setTerminPlatnosci(null);
    setNumerFaktury('');
    setKlient('');
    setClientSearchQuery('');
    setSearchClients([]);
    setIsClientSearchActive(false);
    setIsClientSearchLoading(false);
    setProductRows([{ kod: '', nazwa: '', ilosc: '', cena_netto: '', rabat: '', vat: 23 }]);
    setInitialProductCount(0);
    setIsSubmitting(false);
    setOpenVatDropdownIndex(null);
    setSearchProducts([]);
    setActiveSearchIndex(null);
    setIsSearchLoading(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      style={{
        content: {
          width: '1000px',
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
          <h2 className="text-base font-semibold text-gray-800">Utwórz fakturę VAT</h2>
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
              <div className="w-[120px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Data faktury
                </label>
                <DatePicker
                  selected={selectedDate}
                  onChange={(date: Date | null) => setSelectedDate(date)}
                  locale="pl"
                  dateFormat="dd/MM/yyyy"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-center"
                  placeholderText="Wybierz datę"
                  popperClassName="z-50"
                />
              </div>
              <div className="w-[123px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Numer faktury
                </label>
                <input
                  type="text"
                  value={numerFaktury}
                  onChange={(e) => setNumerFaktury(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                  placeholder="FV XXX/M/YYYY"
                />
              </div>
              <div className="w-[250px] relative client-search-container">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Klient
                </label>
                {(orderData || prefilledKlient) ? (
                  <input
                    type="text"
                    value={klient}
                    readOnly
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-gray-100 text-gray-600 cursor-not-allowed"
                    placeholder="Nazwa klienta"
                  />
                ) : (
                  <>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        value={clientSearchQuery}
                        onChange={(e) => {
                          setClientSearchQuery(e.target.value);
                          setKlient('');
                          setIsClientSearchActive(true);
                        }}
                        onFocus={() => setIsClientSearchActive(true)}
                        className="w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                        placeholder="Wyszukaj klienta..."
                      />
                      {isClientSearchLoading && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                        </div>
                      )}
                    </div>
                    {searchClients.length > 0 && isClientSearchActive && clientSearchQuery.trim() && (
                      <div className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm border border-gray-200">
                        {searchClients.map((client) => (
                          <div
                            key={client.id}
                            className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-blue-50"
                            onClick={() => handleClientSelect(client)}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-[11px]">{client.nazwa}</span>
                              <span className="text-[10px] text-gray-500">{client.firma}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="w-[120px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Termin płatności
                </label>
                <DatePicker
                  selected={terminPlatnosci}
                  onChange={(date: Date | null) => setTerminPlatnosci(date)}
                  locale="pl"
                  dateFormat="dd/MM/yyyy"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-center"
                  placeholderText="Wybierz datę"
                  popperClassName="z-50"
                />
              </div>
            </div>
          </div>

          <div className={`space-y-2 pb-8 ${productRows.length >= 8 ? 'overflow-y-auto max-h-[280px] pr-2' : 'overflow-visible'}`}>
            {productRows.map((row, index) => (
              <div key={index} className="relative product-search-container">
                <div className="flex">
                  {/* Nazwa */}
                  <div className="relative flex-1 max-w-[38%]">
                    {index === 0 && (
                      <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Nazwa</label>
                    )}
                    {(index < initialProductCount || row.isFromKomis) ? (
                      // Для товаров из заказа или из komis - поле только для чтения
                      <input
                        type="text"
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-gray-100 text-gray-600 cursor-not-allowed"
                        placeholder="Nazwa produktu"
                        value={row.nazwa}
                        readOnly
                      />
                    ) : (
                      // Для новых строк - поиск с иконкой
                      <>
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ top: index === 0 ? '28px' : '0' }}>
                          <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                          type="text"
                          className="w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                          placeholder="Wyszukaj produkt..."
                          value={row.searchQuery || row.nazwa}
                          onChange={(e) => {
                            const newRows = [...productRows];
                            newRows[index].searchQuery = e.target.value;
                            newRows[index].nazwa = '';
                            newRows[index].kod = '';
                            newRows[index].cena_netto = '';
                            setProductRows(newRows);
                            setActiveSearchIndex(index);
                          }}
                          onFocus={() => setActiveSearchIndex(index)}
                        />
                        {isSearchLoading && activeSearchIndex === index && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2" style={{ top: index === 0 ? 'calc(50% + 14px)' : '50%' }}>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                          </div>
                        )}
                        {searchProducts.length > 0 && activeSearchIndex === index && (row.searchQuery?.trim() || '') && (
                          <div className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm border border-gray-200">
                            {searchProducts.map((product, idx) => (
                              <div
                                key={`${product.kod}-${idx}`}
                                className="cursor-pointer select-none relative py-1 pl-3 pr-9 hover:bg-blue-50"
                                onClick={() => handleProductSelect(index, product)}
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium text-[10px]">{product.kod}</span>
                                  <span className="text-[10px] text-gray-500">{product.nazwa}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  
                  {/* Ilość */}
                  <div className="w-16 ml-2">
                    {index === 0 && (
                      <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Ilość</label>
                    )}
                    <input
                      type="number"
                      className={`w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${index < initialProductCount ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : ''}`}
                      placeholder="0"
                      value={row.ilosc}
                      readOnly={index < initialProductCount}
                      max={row.isFromKomis && row.maxIlosc !== undefined ? row.maxIlosc : undefined}
                      onChange={(e) => {
                        const newRows = [...productRows];
                        const value = e.target.value;
                        if (value === '' || /^\d*$/.test(value)) {
                          if (row.isFromKomis && row.maxIlosc !== undefined) {
                            const num = parseInt(value, 10);
                            if (!isNaN(num) && num > row.maxIlosc) return;
                          }
                          newRows[index].ilosc = value;
                          setProductRows(newRows);
                        }
                      }}
                    />
                  </div>
                  
                  {/* Cena netto */}
                  <div className="w-24 ml-2">
                    {index === 0 && (
                      <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Cena netto</label>
                    )}
                    <input
                      type="text"
                      value={row.cena_netto}
                      onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        const char = String.fromCharCode(e.which);
                        const pattern = /[\d,]/;
                        if (!pattern.test(char) || 
                            (char === ',' && (e.target as HTMLInputElement).value.includes(',')) ||
                            ((e.target as HTMLInputElement).value === '' && char === ',')) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const input = e.target;
                        const cursorPosition = input.selectionStart ?? 0;
                        let value = e.target.value.replace(/[^\d,]/g, '');
                        
                        if (value === '') {
                          const newRows = [...productRows];
                          newRows[index].cena_netto = '';
                          setProductRows(newRows);
                          return;
                        }

                        const hasComma = value.includes(',');
                        
                        if (!hasComma) {
                          value = value + ',00';
                        } else {
                          const [whole, decimal] = value.split(',');
                          if (decimal && decimal.length > 2) {
                            value = `${whole},${decimal.slice(0, 2)}`;
                          }
                        }

                        const newRows = [...productRows];
                        newRows[index].cena_netto = value;
                        setProductRows(newRows);
                        
                        requestAnimationFrame(() => {
                          const newPosition = Math.min(cursorPosition, value.length);
                          input.setSelectionRange(newPosition, newPosition);
                        });
                      }}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                      placeholder="0,00"
                    />
                  </div>
                  
                  {/* Rabat % */}
                  <div className="w-16 ml-2">
                    {index === 0 && (
                      <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Rabat %</label>
                    )}
                    <input
                      type="text"
                      value={row.rabat}
                      onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        const char = String.fromCharCode(e.which);
                        const pattern = /[\d,]/;
                        if (!pattern.test(char) || 
                            (char === ',' && (e.target as HTMLInputElement).value.includes(',')) ||
                            ((e.target as HTMLInputElement).value === '' && char === ',')) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const newRows = [...productRows];
                        newRows[index].rabat = e.target.value.replace(/[^\d,]/g, '');
                        setProductRows(newRows);
                      }}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                      placeholder="0"
                    />
                  </div>
                  
                  {/* VAT */}
                  <div className="w-20 ml-2 relative dropdown-container">
                    {index === 0 && (
                      <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">VAT</label>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleVatDropdown(index)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between bg-white"
                    >
                      <span className="truncate">
                        {row.vat}%
                      </span>
                      <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openVatDropdownIndex === index && (
                      <div 
                        className="absolute top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-40 overflow-y-auto w-full"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {VAT_RATES.map((vat) => (
                          <button
                            key={vat.value}
                            type="button"
                            onClick={() => handleVatChange(index, vat.value)}
                            className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50"
                          >
                            {vat.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Wart. netto */}
                  <div className="w-24 ml-2">
                    {index === 0 && (
                      <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Wart. netto</label>
                    )}
                    <input
                      type="text"
                      value={calculateRowNetto(row).toFixed(2).replace('.', ',')}
                      readOnly
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-gray-50"
                      placeholder="0,00"
                    />
                  </div>
                  
                  {/* Wart. brutto */}
                  <div className="w-24 ml-2">
                    {index === 0 && (
                      <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Wart. brutto</label>
                    )}
                    <input
                      type="text"
                      value={calculateRowTotal(row).toFixed(2).replace('.', ',')}
                      readOnly
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-gray-50"
                      placeholder="0,00"
                    />
                  </div>
                  
                  {/* Кнопка удаления позиции */}
                  {productRows.length > 1 && index >= initialProductCount && (
                    <button
                      onClick={() => deleteRow(index)}
                      className={`ml-2 text-red-400 hover:text-red-600 ${index === 0 ? 'mt-[28px]' : ''}`}
                      title="Usuń pozycję"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Кнопка добавления новой позиции (только для последней строки, nie z komis) */}
                {index === productRows.length - 1 && !prefilledProducts && (
                  <button
                    onClick={addNewRow}
                    className="absolute -bottom-7 left-0 text-gray-400 hover:text-gray-600"
                    title="Dodaj nową pozycję"
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-8 right-12 flex flex-col items-start gap-1">
          <div className="flex items-center">
            <span className="text-xs text-gray-700 mr-2">Kwota rabatu:</span>
            <span className="text-xs text-gray-900">{calculateTotalRabat().replace('.', ',')} zł</span>
          </div>
          <div className="flex items-center">
            <span className="text-xs text-gray-700 mr-2">Kwota netto:</span>
            <span className="text-xs text-gray-900">{calculateTotalNetto().replace('.', ',')} zł</span>
          </div>
          <div className="flex items-center">
            <span className="text-xs text-gray-700 mr-2">Kwota VAT:</span>
            <span className="text-xs text-gray-900">{calculateTotalVAT().replace('.', ',')} zł</span>
          </div>
          <div className="flex items-center">
            <span className="text-xs font-bold text-gray-700 mr-2">Razem (PLN):</span>
            <span className="text-xs font-bold text-gray-900">{calculateTotal().replace('.', ',')} zł</span>
          </div>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedDate || !klient || !productRows.some(row => 
              row.nazwa && row.ilosc && row.cena_netto
            )}
            className={`px-6 py-1.5 text-white text-xs rounded-md focus:outline-none transition-colors font-sora ${
              isSubmitting || !selectedDate || !klient || !productRows.some(row => 
                row.nazwa && row.ilosc && row.cena_netto
              )
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

      </div>
    </Modal>
  );
};
