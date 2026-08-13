import React, { useState, useEffect } from 'react';
import { X, Plus, Search } from 'lucide-react';
import Modal from 'react-modal';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import "../components/DatePicker.css";
import toast from 'react-hot-toast';
import { ProductSearchHintLines } from './ProductSearchHintLines';
import { ReservationOverflowDialog } from './ReservationOverflowDialog';
import { calculateMaxAllowed, collectReservationOverflows, collectStockOverflowLineIds, enrichStockLinesWithClientReservations } from '../utils/orderStock';

registerLocale('pl', pl);

const TYPY_ZAMOWIENIA = [
  { value: 'sprzedaz', label: 'Sprzedaż', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'probka', label: 'Próbka', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'degustacja', label: 'Degustacja', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'zamiana', label: 'Zamiana', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'prezent', label: 'Prezent', color: 'bg-pink-100 text-pink-800 border-pink-200' },
  { value: 'komis', label: 'Komis', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 'bar', label: 'Bar', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' }
];

const POWODY_ODPISANIA = [
  { value: 'Uszkodzenie', label: 'Uszkodzenie', color: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'Przeterminowanie', label: 'Przeterminowanie', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 'Utrata', label: 'Utrata', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  { value: 'Inwentaryzacja', label: 'Inwentaryzacja', color: 'bg-blue-100 text-blue-800 border-blue-200' }
];

const POWODY_PRZYCHODU = [
  { value: 'Inwentaryzacja', label: 'Inwentaryzacja', color: 'bg-blue-100 text-blue-800 border-blue-200' }
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
  ilosc_from_reservation?: number;
}

interface Order {
  id: number;
  klient: string;
  numer_zamowienia: string;
  data_utworzenia: string;
  laczna_ilosc: number;
  typ?: string;
  products?: OrderProduct[];
}

interface ProductRow {
  kod: string;
  nazwa: string;
  kod_kreskowy?: string;
  ilosc: string;
  typ: string;
  // Поля для проверки доступности
  availableQuantity?: number;
  ilosc_total?: number;
  status?: string | null;
  ilosc_reserved?: number;
  ilosc_client_reserved?: number;
  ilosc_client_reserved_total?: number;
  ilosc_client_reserved_effective?: number;
  ilosc_reserved_effective?: number;
  originalIlosc?: number;
  ilosc_from_reservation?: number;
  sprzedawca?: string;
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
      kod_kreskowy?: string;
      nazwa: string;
      ilosc: number;
      typ: string;
    }>;
  }) => void;
  order: Order | null;
}

export const EditOrderModal: React.FC<EditOrderModalProps> = ({ isOpen, onClose, onSubmit, order }) => {

  const [klient, setKlient] = useState('');
  const [numerZamowienia, setNumerZamowienia] = useState('');
  const [numerOdpisaniaBase, setNumerOdpisaniaBase] = useState<string>('');
  const [numerPrzychoduBase, setNumerPrzychoduBase] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [productRows, setProductRows] = useState<ProductRow[]>([{ kod: '', nazwa: '', ilosc: '', typ: '' }]);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [activeSearchId, setActiveSearchId] = useState<number | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [fieldsWithErrors, setFieldsWithErrors] = useState<Set<number>>(new Set());
  const [overflowDialogOpen, setOverflowDialogOpen] = useState(false);
  const [overflowItems, setOverflowItems] = useState<ReturnType<typeof collectReservationOverflows>>([]);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  // Функция для загрузки информации о продуктах из working_sheets с резервациями
  const loadProductsInfo = async (productRowsData: any[], clientId?: number) => {
    try {
      const productCodes = productRowsData.map(p => p.kod).filter(kod => kod.trim());
      console.log('=== LOADING PRODUCTS INFO ===');
      console.log('Product codes to load:', productCodes);
      console.log('Client ID for reservations:', clientId);
      
      if (productCodes.length === 0) return;

      // Загружаем информацию о каждом продукте с учётом резерваций
      const productsInfo: any[] = [];
      // Все строки по каждому kod (основные + семплы)
      const resultsByKod = new Map<string, any[]>();
      
      for (const kod of productCodes) {
        const params = new URLSearchParams({ query: kod });
        if (clientId) {
          params.set('client_id', String(clientId));
        }
        if (order?.id && order?.typ !== 'odpisanie' && order?.typ !== 'przychod') {
          params.set('order_id', String(order.id));
        }
        if (order?.typ === 'przychod') {
          params.set('include_zero_stock', 'true');
        }

        const response = await fetch(`/api/working-sheets/search?${params.toString()}`);
        if (!response.ok) continue;
        
        const searchResults = await response.json();
        // Собираем все строки с точным совпадением по коду (основные + семплы)
        const kodResults = searchResults.filter((p: any) => p.kod === kod);
        if (kodResults.length > 0) {
          resultsByKod.set(kod, kodResults);
          kodResults.forEach((r: any) => productsInfo.push(r));
          console.log(`Found ${kodResults.length} row(s) for ${kod}:`, kodResults);
        }
      }

      // Суммарный остаток по kod (основной + семплы)
      const ilosc_totalByKod = new Map<string, number>();
      resultsByKod.forEach((results, kod) => {
        const total = results.reduce((sum: number, r: any) => sum + (parseInt(r.ilosc) || 0), 0);
        ilosc_totalByKod.set(kod, total);
      });
      
      console.log('Found products with reservations:', productsInfo);
      setProducts(productsInfo);
      
      // Обновляем productRows с информацией о доступности
      setProductRows(prev => prev.map(row => {
        const kodResults = resultsByKod.get(row.kod);
        if (!kodResults || kodResults.length === 0) return row;

        // Для строки семплов (typ === 'probka') ищем строку с status === 'samples'
        const isSamplesTyp = row.typ === 'probka';
        const specificResult = isSamplesTyp
          ? (kodResults.find((r: any) => r.status === 'samples') || kodResults[0])
          : (kodResults.find((r: any) => r.status !== 'samples') || kodResults[0]);

        const fromReservation = row.ilosc_from_reservation || specificResult.ilosc_from_reservation || 0;
        const freeClientReservation = specificResult.ilosc_client_reserved || 0;

        return {
          ...row,
          availableQuantity: parseInt(specificResult.ilosc) || 0,
          ilosc_total: ilosc_totalByKod.get(row.kod) || parseInt(specificResult.ilosc) || 0,
          status: specificResult.status || null,
          ilosc_reserved: specificResult.ilosc_reserved || 0,
          ilosc_reserved_effective: specificResult.ilosc_reserved_effective
            ?? ((specificResult.ilosc_reserved || 0) + fromReservation),
          ilosc_client_reserved: freeClientReservation,
          ilosc_client_reserved_total: specificResult.ilosc_client_reserved_total || freeClientReservation || 0,
          ilosc_client_reserved_effective: specificResult.ilosc_client_reserved_effective ?? (freeClientReservation + fromReservation),
          originalIlosc: row.originalIlosc ?? (parseInt(row.ilosc) || 0),
          ilosc_from_reservation: fromReservation,
          sprzedawca: specificResult.sprzedawca || row.sprzedawca || ''
        };
      }));
      
      console.log('✅ Final loaded products info for order editing:', productsInfo);
    } catch (error) {
      console.error('❌ Error loading products info:', error);
    }
  };

  // Инициализация данных при открытии модального окна
  useEffect(() => {
    if (isOpen && order) {
      setKlient(order.klient);
      setSearchQuery(order.klient);
      
      // Для списаний: извлекаем базовый номер из существующего номера
      if (order.typ === 'odpisanie') {
        // Номер в формате RW001_DD_MM_YYYY, извлекаем RW001
        const match = order.numer_zamowienia.match(/^(RW\d+)/);
        if (match) {
          setNumerOdpisaniaBase(match[1]);
        } else {
          // Если формат не совпадает, загружаем новый номер
          fetch('/api/writeoffs/next-number-only')
            .then(res => {
              if (!res.ok) throw new Error('Failed to fetch next number');
              return res.json();
            })
            .then(data => {
              if (data.numer_odpisania) {
                setNumerOdpisaniaBase(data.numer_odpisania);
              } else {
                setNumerOdpisaniaBase('RW001');
              }
            })
            .catch(err => {
              console.error('❌ Error fetching next write-off number:', err);
              setNumerOdpisaniaBase('RW001');
            });
        }
      }
      
      // Для przychodu: извлекаем базовый номер из существующего номера
      if (order.typ === 'przychod') {
        // Номер в формате PW001_DD_MM_YYYY, извлекаем PW001
        const match = order.numer_zamowienia.match(/^(PW\d+)/);
        if (match) {
          setNumerPrzychoduBase(match[1]);
        } else {
          // Если формат не совпадает, загружаем новый номер
          fetch('/api/przychod/next-number-only')
            .then(res => {
              if (!res.ok) throw new Error('Failed to fetch next number');
              return res.json();
            })
            .then(data => {
              if (data.numer_przychodu) {
                setNumerPrzychoduBase(data.numer_przychodu);
              } else {
                setNumerPrzychoduBase('PW001');
              }
            })
            .catch(err => {
              console.error('❌ Error fetching next przychod number:', err);
              setNumerPrzychoduBase('PW001');
            });
        }
      }
      
      setNumerZamowienia(order.numer_zamowienia);
      
      // Загружаем дату создания заказа
      if (order.data_utworzenia) {
        const orderDate = new Date(order.data_utworzenia);
        setSelectedDate(orderDate);
        console.log('📅 Loaded order date:', orderDate);
      } else {
        setSelectedDate(null);
      }
      
      // Преобразуем продукты в формат для редактирования
      const initFromOrder = (orderData: Order) => {
        const formattedProducts: ProductRow[] = orderData.products && orderData.products.length > 0
          ? orderData.products.map(product => ({
              kod: product.kod || '',
              nazwa: product.nazwa || '',
              ilosc: (product.ilosc || 0).toString(),
              typ: product.typ || '',
              originalIlosc: product.ilosc || 0,
              ilosc_from_reservation: product.ilosc_from_reservation || 0
            }))
          : [{ kod: '', nazwa: '', ilosc: '', typ: '' }];

        console.log('Order products from backend:', orderData.products);
        console.log('Formatted products:', formattedProducts);
        setProductRows(formattedProducts);

        if (orderData.klient && orderData.typ !== 'odpisanie' && orderData.typ !== 'przychod') {
          fetch(`/api/clients/search?q=${encodeURIComponent(orderData.klient)}`)
            .then(res => res.ok ? res.json() : [])
            .then(clients => {
              const matchingClient = clients.find((c: any) =>
                c.nazwa?.toLowerCase() === orderData.klient.toLowerCase()
              );
              if (matchingClient) {
                setSelectedClient(matchingClient);
                console.log('✅ Loaded client with id:', matchingClient.id);
                if (formattedProducts.length > 0 && formattedProducts[0].kod) {
                  loadProductsInfo(formattedProducts, matchingClient.id);
                }
              } else {
                setSelectedClient({ nazwa: orderData.klient });
                if (formattedProducts.length > 0 && formattedProducts[0].kod) {
                  loadProductsInfo(formattedProducts);
                }
              }
            })
            .catch(err => {
              console.error('❌ Error loading client:', err);
              setSelectedClient({ nazwa: orderData.klient });
              if (formattedProducts.length > 0 && formattedProducts[0].kod) {
                loadProductsInfo(formattedProducts);
              }
            });
        } else {
          setSelectedClient({ nazwa: orderData.klient });
          if (formattedProducts.length > 0 && formattedProducts[0].kod) {
            loadProductsInfo(formattedProducts);
          }
        }
      };

      fetch(`/api/orders/${order.id}`)
        .then(res => (res.ok ? res.json() : order))
        .then(freshOrder => initFromOrder(freshOrder))
        .catch(() => initFromOrder(order));
    } else {
      // Очищаем состояние при закрытии
      setNumerOdpisaniaBase('');
      setNumerPrzychoduBase('');
    }
  }, [isOpen, order]);

  // Обновление полного номера списания/przychodu при изменении даты или базового номера
  useEffect(() => {
    if (order?.typ === 'odpisanie' && numerOdpisaniaBase && selectedDate) {
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const year = selectedDate.getFullYear();
      const fullNumber = `${numerOdpisaniaBase}_${day}_${month}_${year}`;
      setNumerZamowienia(fullNumber);
    }
    
    if (order?.typ === 'przychod' && numerPrzychoduBase && selectedDate) {
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const year = selectedDate.getFullYear();
      const fullNumber = `${numerPrzychoduBase}_${day}_${month}_${year}`;
      setNumerZamowienia(fullNumber);
    }
  }, [numerOdpisaniaBase, numerPrzychoduBase, selectedDate, order?.typ]);

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
        const params = new URLSearchParams({ query });
        if (selectedClient?.id) {
          params.set('client_id', String(selectedClient.id));
        }
        if (order?.id && order?.typ !== 'odpisanie' && order?.typ !== 'przychod') {
          params.set('order_id', String(order.id));
        }
        if (order?.typ === 'przychod') {
          params.set('include_zero_stock', 'true');
        }

        const response = await fetch(`/api/working-sheets/search?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch products');
        const data = await response.json();
        
        // Считаем суммарный остаток по kod (основной + семплы) для проверки доступности
        const totalByKod = new Map<string, number>();
        data.forEach((item: any) => {
          totalByKod.set(item.kod, (totalByKod.get(item.kod) || 0) + (item.ilosc || 0));
        });

        // Преобразуем данные в единый формат (включая информацию о резервациях)
        // ilosc — остаток конкретной строки (для отображения)
        // ilosc_total — суммарный остаток по kod (основной + семплы, для проверки доступности)
        const transformedData = data.map((item: any) => ({
          kod: item.kod,
          nazwa: item.nazwa || '',
          ilosc: item.ilosc ? item.ilosc.toString() : '0',
          ilosc_total: totalByKod.get(item.kod) || item.ilosc || 0,
          status: item.status || null,
          ilosc_reserved: item.ilosc_reserved || 0,
          ilosc_reserved_effective: item.ilosc_reserved_effective
            ?? ((item.ilosc_reserved || 0) + (item.ilosc_from_reservation || 0)),
          ilosc_client_reserved: item.ilosc_client_reserved || 0,
          ilosc_client_reserved_total: item.ilosc_client_reserved_total || 0,
          ilosc_client_reserved_effective: item.ilosc_client_reserved_effective
            ?? ((item.ilosc_client_reserved || 0) + (item.ilosc_from_reservation || 0)),
          ilosc_from_reservation: item.ilosc_from_reservation || 0,
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
  }, [productRows, activeSearchId, selectedClient]);

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



  const addNewRow = () => {
    setProductRows([...productRows, { kod: '', nazwa: '', ilosc: '', typ: '' }]);
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
    console.log('🔍 EditOrderModal handleProductSelect called for index:', index, 'product:', product.kod);
    console.log('🔍 Product data:', product);
    
    const newRows = [...productRows];
    newRows[index] = {
      ...newRows[index],
      kod: product.kod,
      nazwa: product.nazwa,
      typ: product.typ || 'sztuki',
      // Сохраняем информацию о доступности и резервациях
      availableQuantity: parseInt(product.ilosc) || 0,
      ilosc_total: product.ilosc_total || parseInt(product.ilosc) || 0,
      status: product.status || null,
      ilosc_reserved: product.ilosc_reserved || 0,
      ilosc_client_reserved: product.ilosc_client_reserved || 0,
      ilosc_client_reserved_total: product.ilosc_client_reserved_total || product.ilosc_client_reserved || 0,
      sprzedawca: product.sprzedawca || '',
      originalIlosc: 0 // Для нового продукта изначальное количество = 0
    };
    setProductRows(newRows);
    
    // Обновляем состояние products с информацией о выбранном продукте
    const updatedProducts = [...products];
    const existingIndex = updatedProducts.findIndex(p => p.kod === product.kod);
    if (existingIndex >= 0) {
      updatedProducts[existingIndex] = product;
    } else {
      updatedProducts.push(product);
    }
    setProducts(updatedProducts);
    
    // Скрываем список поиска для всех полей
    setActiveSearchId(null);
    
    console.log('🔍 EditOrderModal Products list cleared, activeSearchId reset');
  };

  const buildStockLinesWithIds = () => {
    return productRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.kod.trim() && row.ilosc.trim())
      .map(({ row, index }) => {
        const isSamplesRow = row.status === 'samples';
        const samplesOwnQuantity = row.availableQuantity || 0;
        const totalOnStock = row.ilosc_total ?? samplesOwnQuantity;

        return {
          lineId: index,
          kod: row.kod,
          nazwa: row.nazwa,
          quantity: parseInt(row.ilosc) || 0,
          isSamplesRow,
          samplesOwnQuantity,
          totalOnStock: isSamplesRow ? samplesOwnQuantity : totalOnStock,
          overallTotalOnStock: totalOnStock,
          reservedQuantity: row.ilosc_reserved || 0,
          clientReservedQuantity: row.ilosc_client_reserved || 0,
          clientReservedTotal: row.ilosc_client_reserved_total || row.ilosc_client_reserved || 0,
          originalQuantityInOrder: row.originalIlosc || 0,
          reservationInOrder: row.ilosc_from_reservation || 0
        };
      });
  };

  const performStockCheck = (rows: ProductRow[]) => {
    const validIndexes = new Set(
      rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => row.kod.trim() && row.ilosc.trim() && (parseInt(row.ilosc) || 0) > 0)
        .map(({ index }) => index)
    );

    const errorsSet = collectStockOverflowLineIds(
      buildStockLinesWithIds().filter((line) => validIndexes.has(line.lineId))
    );

    if (errorsSet.size > 0) {
      toast.error('Niewystarczająca ilość towaru na magazynie');
    }

    return errorsSet;
  };

  const submitOrderUpdate = async (validProducts: ProductRow[]) => {
    if (!order) return;

    const productsData = validProducts.map(product => ({
      kod: product.kod,
      nazwa: product.nazwa,
      ilosc: parseInt(product.ilosc) || 0,
      typ: product.typ
    }));

    console.log('Sending products data:', productsData);

    try {
      const response = await fetch(`/api/orders/${order.id}`, {
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

      const successMsg = order?.typ === 'odpisanie' ? 'Rozchód został zaktualizowany'
                        : order?.typ === 'przychod' ? 'Przychód został zaktualizowany'
                        : 'Zamówienie zostało zaktualizowane';
      toast.success(successMsg);
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
    } finally {
      setPendingSubmit(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    if (!klient.trim()) {
      toast.error('Wprowadź nazwę klienta');
      return;
    }

    if (!numerZamowienia.trim()) {
      const errorMsg = order?.typ === 'odpisanie' ? 'Wprowadź numer rozchodu' 
                      : order?.typ === 'przychod' ? 'Wprowadź numer przychodu'
                      : 'Wprowadź numer zamówienia';
      toast.error(errorMsg);
      return;
    }

    const validProducts = productRows.filter(row => row.kod.trim() && row.nazwa.trim() && row.ilosc.trim() && row.typ.trim());
    
    if (validProducts.length === 0) {
      const errorMsg = order?.typ === 'odpisanie' ? 'Dodaj produkty do rozchodu'
                      : order?.typ === 'przychod' ? 'Dodaj produkty do przychodu'
                      : 'Dodaj produkty do zamówienia';
      toast.error(errorMsg);
      return;
    }

    if (validProducts.some(product => !product.ilosc || !product.typ)) {
      toast.error('Wprowadź ilość i typ dla wszystkich produktów');
      return;
    }

    if (order?.typ !== 'przychod') {
      if (products.length === 0) {
        try {
          const response = await fetch('/api/working-sheets');
          if (response.ok) {
            const allProducts = await response.json();
            setProducts(allProducts);
          } else {
            toast.error('Błąd podczas ładowania informacji o produktach');
            return;
          }
        } catch (error) {
          console.error('Error reloading products:', error);
          toast.error('Błąd podczas ładowania informacji o produktach');
          return;
        }
      }

      const errorsSet = performStockCheck(validProducts);
      if (errorsSet.size > 0) {
        setFieldsWithErrors(errorsSet);
        return;
      }
      setFieldsWithErrors(new Set());
    }

    if (order?.typ !== 'odpisanie' && order?.typ !== 'przychod') {
      const enrichedLines = await enrichStockLinesWithClientReservations(
        buildStockLinesWithIds(),
        selectedClient?.id,
        order?.id
      );
      const overflows = collectReservationOverflows(enrichedLines, true);
      if (overflows.length > 0) {
        setOverflowItems(overflows);
        setOverflowDialogOpen(true);
        return;
      }
    }

    setPendingSubmit(true);
    await submitOrderUpdate(validProducts);
  };

  const handleOverflowConfirm = async () => {
    setOverflowDialogOpen(false);
    const validProducts = productRows.filter(row => row.kod.trim() && row.nazwa.trim() && row.ilosc.trim() && row.typ.trim());
    setPendingSubmit(true);
    await submitOrderUpdate(validProducts);
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
    setFieldsWithErrors(new Set());
    setOverflowDialogOpen(false);
    setOverflowItems([]);
    setPendingSubmit(false);
    onClose();
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
          <h2 className="text-base font-semibold text-gray-800">
            {order?.typ === 'odpisanie' ? 'Edytuj rozchód' 
            : order?.typ === 'przychod' ? 'Edytuj przychód'
            : 'Edytuj zamówienie'}
          </h2>
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
                  {order?.typ === 'odpisanie' ? 'Numer rozchodu' 
                  : order?.typ === 'przychod' ? 'Numer przychodu'
                  : 'Numer zamówienia'}
                </label>
                <input
                  type="text"
                  value={numerZamowienia}
                  onChange={(e) => setNumerZamowienia(e.target.value)}
                  readOnly={order?.typ === 'odpisanie' || order?.typ === 'przychod'}
                  placeholder={order?.typ === 'odpisanie' ? 'Wprowadź numer rozchodu' 
                              : order?.typ === 'przychod' ? 'Wprowadź numer przychodu'
                              : 'Wprowadź numer zamówienia'}
                  className={`w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs ${
                    order?.typ === 'odpisanie' || order?.typ === 'przychod' ? 'bg-gray-100' : ''
                  }`}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Klient
              </label>
              {order?.typ === 'odpisanie' || order?.typ === 'przychod' ? (
                <input
                  type="text"
                  value="VEIS"
                  readOnly
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-gray-100"
                />
              ) : (
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
              )}
              {order?.typ !== 'odpisanie' && order?.typ !== 'przychod' && isLoading && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                </div>
              )}
              {order?.typ !== 'odpisanie' && order?.typ !== 'przychod' && clients.length > 0 && !selectedClient && (
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

            {order?.typ !== 'odpisanie' && order?.typ !== 'przychod' && selectedClient && (
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
                    type="button"
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
                  <div className={`relative flex-1 ${order?.typ === 'odpisanie' || order?.typ === 'przychod' ? 'max-w-[65%]' : 'max-w-[70%]'}`}>
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={row.nazwa}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        console.log('🔍 EditOrderModal Product search input changed for index:', index, 'value:', newValue);
                        
                        const newRows = [...productRows];
                        newRows[index].nazwa = newValue;
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
                        const newValue = e.target.value;
                        const newQuantity = parseInt(newValue) || 0;
                        
                        const newRows = [...productRows];
                        newRows[index].ilosc = newValue;
                        setProductRows(newRows);
                        
                        // Проверяем доступность только для обычных заказов (не списаний и не przychodów)
                        if (order?.typ !== 'odpisanie' && order?.typ !== 'przychod' && row.kod) {
                          const isSamplesRow = row.status === 'samples';
                          const samplesOwnQuantity = row.availableQuantity || 0;
                          const totalOnStock = isSamplesRow
                            ? samplesOwnQuantity
                            : (row.ilosc_total ?? samplesOwnQuantity);
                          const reservedQuantity = row.ilosc_reserved || 0;
                          const clientReservedQuantity = row.ilosc_client_reserved || 0;

                          const rowsWithSameProduct = newRows.filter(r => r.kod === row.kod);
                          const totalQuantityForThisProduct = rowsWithSameProduct
                            .reduce((sum, r) => sum + (parseInt(r.ilosc) || 0), 0);
                          const totalOriginalForThisProduct = rowsWithSameProduct
                            .reduce((sum, r) => sum + (r.originalIlosc || 0), 0);
                          const isProductDuplicated = rowsWithSameProduct.length > 1;

                          const totalReservationInOrderForProduct = rowsWithSameProduct
                            .reduce((max, r) => Math.max(max, r.ilosc_from_reservation || 0), 0);

                          const maxAllowed = calculateMaxAllowed({
                            kod: row.kod,
                            nazwa: row.nazwa,
                            quantity: newQuantity,
                            isSamplesRow,
                            samplesOwnQuantity,
                            totalOnStock: isSamplesRow ? samplesOwnQuantity : totalOnStock,
                            overallTotalOnStock: row.ilosc_total ?? samplesOwnQuantity,
                            reservedQuantity,
                            clientReservedQuantity,
                            clientReservedTotal: row.ilosc_client_reserved_total,
                            originalQuantityInOrder: totalOriginalForThisProduct,
                            reservationInOrder: totalReservationInOrderForProduct
                          });

                          if (newQuantity === 0) {
                            setFieldsWithErrors(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(index);
                              return newSet;
                            });
                          } else if (totalQuantityForThisProduct > maxAllowed) {
                            setFieldsWithErrors(prev => {
                              const newSet = new Set(prev);
                              newSet.add(index);
                              return newSet;
                            });
                            if (isProductDuplicated) {
                              toast.error(`Niewystarczająca ilość - łącznie w zamówieniu: ${totalQuantityForThisProduct}, dostępne: ${maxAllowed}`);
                            } else {
                              toast.error(`Niewystarczająca ilość - dostępne: ${maxAllowed}`);
                            }
                          } else {
                            setFieldsWithErrors(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(index);
                              return newSet;
                            });
                          }
                        } else {
                          // Для списаний и przychodów просто очищаем ошибку
                          if (fieldsWithErrors.has(index)) {
                            const newErrors = new Set(fieldsWithErrors);
                            newErrors.delete(index);
                            setFieldsWithErrors(newErrors);
                          }
                        }
                      }}
                      className={`w-full px-3 py-1.5 border rounded-md focus:outline-none font-sora text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                        fieldsWithErrors.has(index) ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                    />
                  </div>

                  {/* Dropdown для типа заказа / powodu odpisania / przychodu */}
                  <div className={`${order?.typ === 'odpisanie' || order?.typ === 'przychod' ? 'w-32' : 'w-24'} ml-2 relative dropdown-container`}>
                    <button
                      type="button"
                      onClick={() => toggleDropdown(index)}
                      className={`w-full px-2 py-1.5 border rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ${
                        row.typ 
                          ? (order?.typ === 'odpisanie' 
                              ? POWODY_ODPISANIA.find(t => t.value === row.typ)?.color 
                              : order?.typ === 'przychod'
                              ? POWODY_PRZYCHODU.find(t => t.value === row.typ)?.color
                              : TYPY_ZAMOWIENIA.find(t => t.value === row.typ)?.color) || 'border-gray-300 bg-white' 
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      <span className="truncate text-[10px]">
                        {row.typ 
                          ? (order?.typ === 'odpisanie' 
                              ? POWODY_ODPISANIA.find(t => t.value === row.typ)?.label 
                              : order?.typ === 'przychod'
                              ? POWODY_PRZYCHODU.find(t => t.value === row.typ)?.label
                              : TYPY_ZAMOWIENIA.find(t => t.value === row.typ)?.label) || 'Powód'
                          : 'Powód'}
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
                        {(order?.typ === 'odpisanie' ? POWODY_ODPISANIA 
                        : order?.typ === 'przychod' ? POWODY_PRZYCHODU
                        : TYPY_ZAMOWIENIA).map((typ) => (
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
                      type="button"
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
                    type="button"
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
                {products.length > 0 && activeSearchId === index && row.nazwa.trim() && (
                  <div className={`absolute z-50 mt-1 ${order?.typ === 'odpisanie' || order?.typ === 'przychod' ? 'w-[65%]' : 'w-[70%]'} bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm border border-gray-200`}>
                    {products.map((product) => {
                      const isCurrentRowProduct = product.kod === row.kod;
                      const warehouseStock = product.ilosc_total ?? (parseInt(product.ilosc) || 0);
                      const originalInOrder = isCurrentRowProduct ? (row.originalIlosc || 0) : 0;
                      const warehouseForEdit = warehouseStock + originalInOrder;
                      const isEditingOrder = order?.typ !== 'odpisanie' && order?.typ !== 'przychod';

                      const stockLabel = isEditingOrder && originalInOrder > 0
                        ? `Dostępna ilość: ${warehouseForEdit}`
                        : `Dostępna ilość: ${warehouseStock}`;

                      // Как при tworzeniu: bieżący wolny rezerw (ilosc − ilosc_wydane), bez total/effective
                      const globalReservedDisplay = product.ilosc_reserved ?? 0;
                      const clientReservedDisplay = product.ilosc_client_reserved ?? 0;

                      return (
                      <div
                        key={product.kod}
                        className="cursor-pointer select-none relative py-1 pl-3 pr-9 hover:bg-blue-50"
                        onClick={() => handleProductSelect(index, product)}
                      >
                        <div className="flex flex-col">
                          <ProductSearchHintLines
                            kod={product.kod}
                            nazwa={product.nazwa}
                            sprzedawca={product.sprzedawca}
                          >
                          <span className="text-[10px] text-gray-500">{stockLabel}</span>
                          {globalReservedDisplay > 0 && (
                            <span className="text-[10px] text-red-500">
                              Z nich w rezerw: {globalReservedDisplay}
                            </span>
                          )}
                          {selectedClient?.id && clientReservedDisplay > 0 && (
                            <span className="text-[10px] text-blue-700">
                              Rezerwacja klienta: {clientReservedDisplay}
                            </span>
                          )}
                          </ProductSearchHintLines>
                        </div>
                      </div>
                      );
                    })}
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
            type="button"
            onClick={handleSubmit}
            disabled={pendingSubmit}
            className={`px-6 py-1.5 text-white text-xs rounded-md focus:outline-none transition-colors font-sora bg-blue-600 hover:bg-blue-700 ${pendingSubmit ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Zapisz zmiany
          </button>
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