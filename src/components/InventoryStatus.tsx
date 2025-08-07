import React, { useState, useEffect, useMemo } from 'react';
import { Search, RefreshCw, Calendar, TrendingDown, ChevronLeft, ChevronRight, Edit } from 'lucide-react';
import toast from 'react-hot-toast';
import { Tooltip } from 'react-tooltip';
import { EditInventoryModal } from './EditInventoryModal';
import { API_URL } from '../config';

// Глобальные стили для тултипов
const tooltipStyles = `
  .react-tooltip {
    z-index: 9999 !important;
    max-width: 400px !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
`;

const TYPY_TOWARU = [
  { value: 'czerwone', label: 'Czerwone', color: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'biale', label: 'Białe', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  { value: 'musujace', label: 'Musujące', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'bezalkoholowe', label: 'Bezalkoholowe', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'ferment', label: 'Ferment', color: 'bg-orange-100 text-orange-800 border-orange-200' }
];

interface InventoryItem {
  id: number;
  kod: string;
  nazwa: string;
  ilosc: number;
  jednostka_miary: string;
  kod_kreskowy: string;
  data_waznosci: number;
  archiwalny: number;
  rezerwacje: number;
  ilosc_na_poleceniach: number;
  waga_netto: number;
  waga_brutto: number;
  objetosc: number;
  typ?: string; // Added typ field
  opis: string;
  updated_at: string;
  wartosc: number; // Added wartosc field
  sprzedawca?: string; // Added sprzedawca field
  cena?: number; // Added cena field
  cena_sprzedazy?: number; // Added cena_sprzedazy field
}

interface Order {
  id: number;
  klient: string;
  numer_zamowienia: string;
  data_utworzenia: string;
  laczna_ilosc: number;
}

interface OrderProduct {
  id: number;
  orderId: number;
  kod: string;
  kod_kreskowy: string;
  nazwa: string;
  ilosc: number;
  typ?: string;
  created_at: string;
}

interface InventoryStatusProps {
  refreshTrigger?: number;
  productReceipts?: Array<{
    id?: number;
    dataPrzyjecia: string;
    sprzedawca: string;
    wartosc: number;
    kosztDostawy: number;
    products: Array<{
      kod: string;
      nazwa: string;
      kod_kreskowy?: string;
      ilosc: number;
      cena: number;
      dataWaznosci?: string;
    }>;
    productInvoice?: string;
    transportInvoice?: string;
  }>;
}

export const InventoryStatus: React.FC<InventoryStatusProps> = ({ refreshTrigger, productReceipts = [] }) => {
  // Добавляем стили для тултипов
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = tooltipStyles;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  console.log('=== InventoryStatus Component DEBUG ===');
  console.log('productReceipts received:', productReceipts);
  console.log('productReceipts length:', productReceipts.length);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [orderProducts, setOrderProducts] = useState<OrderProduct[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<string>('nazwa');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [daysToCalculate, setDaysToCalculate] = useState(30); // Период для расчета среднего потребления
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [carouselStates, setCarouselStates] = useState<{[key: string]: number}>({});
  const [filters, setFilters] = useState({
    sprzedawca: '',
    typ: '',
    objetosc: '',
    status: ''
  });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<InventoryItem | null>(null);
  const [priceHistory, setPriceHistory] = useState<{[key: string]: any[]}>({});

  // Кэш для оптимизации производительности
  const sprzedawcaCache = useMemo(() => {
    console.log('Building sprzedawcaCache with productReceipts:', productReceipts);
    const cache = new Map<string, string>();
    try {
      for (const receipt of productReceipts) {
        if (Array.isArray(receipt.products)) {
          for (const product of receipt.products) {
            if (product.kod && !cache.has(product.kod)) {
              cache.set(product.kod, receipt.sprzedawca);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error building sprzedawcaCache:', error);
    }
    console.log('sprzedawcaCache built with', cache.size, 'entries');
    return cache;
  }, [productReceipts]);

  const averageSalesCache = useMemo(() => {
    console.log('Building averageSalesCache with inventory:', inventory.length, 'items');
    const cache = new Map<string, number>();
    
    try {
      // Встроенная функция для поиска даты загрузки стока
      const getStockStartDate = (kod: string): Date | null => {
        // Поиск по приемкам (productReceipts)
        let minDate: Date | null = null;
        productReceipts.forEach(receipt => {
          if (Array.isArray(receipt.products)) {
            if (receipt.products.some(product => product.kod === kod)) {
              const d = new Date(receipt.dataPrzyjecia);
              if (!minDate || d < minDate) minDate = d;
            }
          }
        });
        // Если нет приемки — ищем первую продажу
        orderProducts.forEach(op => {
          if (op.kod === kod && op.created_at) {
            const d = new Date(op.created_at);
            if (!minDate || d < minDate) minDate = d;
          }
        });
        return minDate;
      };
      
      for (const item of inventory) {
        const startDate = getStockStartDate(item.kod);
        if (startDate) {
          const today = new Date();
          const days = Math.max(1, Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
          const totalSales = orderProducts.filter(op => op.kod === item.kod).reduce((sum, op) => sum + op.ilosc, 0);
          cache.set(item.kod, totalSales / days);
        } else {
          cache.set(item.kod, 0);
        }
      }
    } catch (error) {
      console.error('Error building averageSalesCache:', error);
    }
    
    console.log('averageSalesCache built with', cache.size, 'entries');
    return cache;
  }, [inventory, orderProducts, productReceipts]);

  const loadPriceHistory = async (productKod: string) => {
    try {
      const response = await fetch(`${API_URL}/api/product-prices/${productKod}`);
      if (response.ok) {
        const prices = await response.json();
        setPriceHistory(prev => ({ ...prev, [productKod]: prices }));
      }
    } catch (error) {
      console.error('Error loading price history:', error);
    }
  };

  const loadAllPriceHistory = async () => {
    try {
      const promises = inventory.map(item => 
        fetch(`${API_URL}/api/product-prices/${item.kod}`).then(res => res.json())
      );
      
      const allPrices = await Promise.all(promises);
      const newPriceHistory: {[key: string]: any[]} = {};
      
      inventory.forEach((item, index) => {
        newPriceHistory[item.kod] = allPrices[index];
      });
      
      setPriceHistory(newPriceHistory);
    } catch (error) {
      console.error('Error loading all price history:', error);
    }
  };

  const loadInventory = async () => {
    try {
      console.log('Starting loadInventory...');
      setIsLoading(true);
      setError(null);
      
      // Загружаем данные из working_sheets
      console.log('Fetching working-sheets...');
      const inventoryResponse = await fetch(`${API_URL}/api/working-sheets`);
      if (!inventoryResponse.ok) {
        throw new Error(`HTTP error! status: ${inventoryResponse.status}`);
      }
      const inventoryData = await inventoryResponse.json();
      console.log('Inventory data from server:', inventoryData.length, 'items');
      if (inventoryData.length > 0) {
        console.log('First item keys:', Object.keys(inventoryData[0]));
        console.log('First item typ value:', inventoryData[0].typ);
      }
      setInventory(inventoryData);

      // Загружаем заказы
      console.log('Fetching orders...');
      const ordersResponse = await fetch(`${API_URL}/api/orders`);
      if (!ordersResponse.ok) {
        throw new Error(`HTTP error! status: ${ordersResponse.status}`);
      }
      const ordersData = await ordersResponse.json();
      console.log('Orders data from server:', ordersData.length, 'items');
      setOrders(ordersData);

      // Загружаем продукты заказов
      console.log('Fetching orders-with-products...');
      const orderProductsResponse = await fetch(`${API_URL}/api/orders-with-products`);
      if (!orderProductsResponse.ok) {
        throw new Error(`HTTP error! status: ${orderProductsResponse.status}`);
      }
      // Собираем все продукты из всех заказов
      const ordersWithProducts = await orderProductsResponse.json();
      console.log('Orders with products from server:', ordersWithProducts.length, 'items');
      const allOrderProducts: OrderProduct[] = [];
      ordersWithProducts.forEach((order: any) => {
        if (order.products) {
          order.products.forEach((product: OrderProduct) => {
            allOrderProducts.push({ ...product, orderId: order.id, created_at: product.created_at || order.data_utworzenia });
          });
        }
      });
      console.log('Total order products:', allOrderProducts.length);
      setOrderProducts(allOrderProducts);
      
      // Загружаем историю цен для всех товаров
      await loadAllPriceHistory();
      
      console.log('loadInventory completed successfully');
    } catch (error) {
      console.error('Error loading inventory:', error);
      setError(`Failed to load inventory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  useEffect(() => {
    if (refreshTrigger) {
      loadInventory();
    }
  }, [refreshTrigger]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Функция для расчета среднего потребления товара
  const calculateAverageConsumption = (kod: string): number => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToCalculate);
    
    const recentOrders = orderProducts.filter(product => 
      product.kod === kod && 
      new Date(product.created_at) >= cutoffDate
    );

    if (recentOrders.length === 0) return 0;

    const totalConsumption = recentOrders.reduce((sum, product) => sum + product.ilosc, 0);
    return totalConsumption / daysToCalculate; // Среднее потребление в день
  };

  // 1. Функция для поиска даты загрузки стока (дата первой приемки или первой продажи)
  // Возвращает дату загрузки стока (приемка или первая продажа)
  const getStockStartDate = (kod: string): Date | null => {
    // Поиск по приемкам (productReceipts)
    let minDate: Date | null = null;
    productReceipts.forEach(receipt => {
      if (Array.isArray(receipt.products)) {
        if (receipt.products.some(product => product.kod === kod)) {
          const d = new Date(receipt.dataPrzyjecia);
          if (!minDate || d < minDate) minDate = d;
        }
      }
    });
    // Если нет приемки — ищем первую продажу
    orderProducts.forEach(op => {
      if (op.kod === kod && op.created_at) {
        const d = new Date(op.created_at);
        if (!minDate || d < minDate) minDate = d;
      }
    });
    return minDate;
  };

  // 2. Функция для расчета средних продаж в день (оптимизированная с кэшем)
  const getAverageSalesPerDay = (kod: string): number => {
    return averageSalesCache.get(kod) || 0;
  };

  // 3. Функция для прогноза дней остатка (оптимизированная)
  const getDaysLeft = (item: InventoryItem): number => {
    const avgSales = averageSalesCache.get(item.kod) || 0;
    if (avgSales <= 0) return Infinity;
    return Math.floor(item.ilosc / avgSales);
  };

  // 2. Функция для поиска продавца по коду товара (оптимизированная с кэшем)
  const getSprzedawcaForProduct = (kod: string): string => {
    return sprzedawcaCache.get(kod) || '';
  };

  // Функция для получения цвета типа товара
  const getTypColor = (typ: string): string => {
    const typConfig = TYPY_TOWARU.find(t => t.value === typ);
    return typConfig ? typConfig.color : 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getStatusBadgeColor = (days: number): string => {
    if (days === Infinity) return 'bg-gray-100 text-gray-800 border-gray-200';
    if (days <= 30) return 'bg-red-100 text-gray-800 border-red-200';
    if (days <= 60) return 'bg-yellow-100 text-gray-800 border-yellow-200';
    return 'bg-green-100 text-gray-800 border-green-200';
  };

  // Получение уникальных значений для фильтров
  const uniqueSprzedawcy = useMemo(() => {
    const sprzedawcy = new Set<string>();
    inventory.forEach(item => {
      const sprzedawca = item.sprzedawca || sprzedawcaCache.get(item.kod);
      if (sprzedawca) sprzedawcy.add(sprzedawca);
    });
    return Array.from(sprzedawcy).sort();
  }, [inventory, sprzedawcaCache]);

  const uniqueTypy = useMemo(() => {
    const typy = new Set<string>();
    inventory.forEach(item => {
      if (item.typ) typy.add(item.typ);
    });
    return Array.from(typy).sort();
  }, [inventory]);

  const uniqueObjetosci = useMemo(() => {
    const objetosci = new Set<string>();
    inventory.forEach(item => {
      if (item.objetosc) objetosci.add(item.objetosc.toString());
    });
    return Array.from(objetosci).sort((a, b) => parseFloat(a) - parseFloat(b));
  }, [inventory]);

  const uniqueStatusy = useMemo(() => {
    const statusy = new Set<string>();
    inventory.forEach(item => {
      const avgSales = averageSalesCache.get(item.kod) || 0;
      const daysLeft = avgSales <= 0 ? Infinity : Math.floor(item.ilosc / avgSales);
      const status = daysLeft === Infinity ? 'Brak danych' : 
                    daysLeft <= 30 ? 'mało' : 
                    daysLeft <= 60 ? 'średnie' : 'dużo';
      statusy.add(status);
    });
    return Array.from(statusy).sort();
  }, [inventory, averageSalesCache]);

  const filteredAndSortedInventory = inventory
    .filter(item => {
      // Поиск по тексту
      const matchesSearch = 
        item.kod.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.nazwa.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.kod_kreskowy && item.kod_kreskowy.toLowerCase().includes(searchTerm.toLowerCase()));
      
      if (!matchesSearch) return false;

      // Фильтр по sprzedawca
      if (filters.sprzedawca && (item.sprzedawca || sprzedawcaCache.get(item.kod)) !== filters.sprzedawca) return false;

      // Фильтр по typ
      if (filters.typ && item.typ !== filters.typ) return false;

      // Фильтр по objetosc
      if (filters.objetosc && item.objetosc?.toString() !== filters.objetosc) return false;

      // Фильтр по status
      if (filters.status) {
        const avgSales = averageSalesCache.get(item.kod) || 0;
        const daysLeft = avgSales <= 0 ? Infinity : Math.floor(item.ilosc / avgSales);
        const status = daysLeft === Infinity ? 'Brak danych' : 
                      daysLeft <= 30 ? 'mało' : 
                      daysLeft <= 60 ? 'średnie' : 'dużo';
        if (status !== filters.status) return false;
      }

      return true;
    })
    .sort((a, b) => {
      let aValue: any;
      let bValue: any;
      switch (sortField) {
              case 'sprzedawca':
        aValue = a.sprzedawca || sprzedawcaCache.get(a.kod) || '';
        bValue = b.sprzedawca || sprzedawcaCache.get(b.kod) || '';
        break;
      case 'cena':
        aValue = a.cena || 0;
        bValue = b.cena || 0;
        break;
      case 'cena_sprzedazy':
        aValue = a.cena_sprzedazy || 0;
        bValue = b.cena_sprzedazy || 0;
        break;
        case 'srednieZuzycie':
          aValue = averageSalesCache.get(a.kod) || 0;
          bValue = averageSalesCache.get(b.kod) || 0;
          break;
        case 'dniPozostalo':
          const aAvgSales1 = averageSalesCache.get(a.kod) || 0;
          const bAvgSales1 = averageSalesCache.get(b.kod) || 0;
          aValue = aAvgSales1 <= 0 ? Infinity : Math.floor(a.ilosc / aAvgSales1);
          bValue = bAvgSales1 <= 0 ? Infinity : Math.floor(b.ilosc / bAvgSales1);
          break;
        case 'dataWyczerpania':
          const aAvgSales2 = averageSalesCache.get(a.kod) || 0;
          const bAvgSales2 = averageSalesCache.get(b.kod) || 0;
          const aDays = aAvgSales2 <= 0 ? Infinity : Math.floor(a.ilosc / aAvgSales2);
          const bDays = bAvgSales2 <= 0 ? Infinity : Math.floor(b.ilosc / bAvgSales2);
          aValue = aDays === Infinity ? Infinity : new Date().setDate(new Date().getDate() + aDays);
          bValue = bDays === Infinity ? Infinity : new Date().setDate(new Date().getDate() + bDays);
          break;
        case 'status':
          const getStatusRank = (item: InventoryItem) => {
            const avgSales = averageSalesCache.get(item.kod) || 0;
            const days = avgSales <= 0 ? Infinity : Math.floor(item.ilosc / avgSales);
            if (days === Infinity) return 3;
            if (days <= 30) return 0;
            if (days <= 60) return 1;
            return 2;
          };
          aValue = getStatusRank(a);
          bValue = getStatusRank(b);
          break;
        case 'typ':
          // Обработка null/undefined значений для typ
          aValue = a.typ || '';
          bValue = b.typ || '';
          break;
        case 'objetosc':
          // Обработка null/undefined значений для objetosc
          aValue = a.objetosc || 0;
          bValue = b.objetosc || 0;
          break;
        case 'dataWaznosci':
          // Обработка null/undefined значений для data_waznosci
          aValue = a.data_waznosci || 0;
          bValue = b.data_waznosci || 0;
          break;
        case 'sprzedaze':
          // Сортировка по количеству продаж (количество квадратиков)
          const aSales = orderProducts.filter(p => p.kod === a.kod).length;
          const bSales = orderProducts.filter(p => p.kod === b.kod).length;
          aValue = aSales;
          bValue = bSales;
          break;
        default:
          aValue = (a as any)[sortField];
          bValue = (b as any)[sortField];
      }
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      return 0;
    });

  // Выделить/снять все
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(filteredAndSortedInventory.map(item => item.id));
    } else {
      setSelectedItems([]);
    }
  };
  // Выделить/снять одну позицию
  const handleSelectOne = (id: number, checked: boolean) => {
    setSelectedItems(prev => checked ? [...prev, id] : prev.filter(i => i !== id));
  };

  // Функции для управления каруселью
  const handleCarouselPrev = (itemKod: string) => {
    setCarouselStates(prev => ({
      ...prev,
      [itemKod]: Math.max(0, (prev[itemKod] || 0) - 1)
    }));
  };

  const handleCarouselNext = (itemKod: string, maxIndex: number) => {
    setCarouselStates(prev => ({
      ...prev,
      [itemKod]: Math.min(maxIndex, (prev[itemKod] || 0) + 1)
    }));
  };

  const handleEditClick = () => {
    if (selectedItems.length !== 1) {
      toast.error('Wybierz dokładnie jedną pozycję do edycji');
      return;
    }
    
    const selectedItem = inventory.find(item => item.id === selectedItems[0]);
    if (selectedItem) {
      setSelectedItemForEdit(selectedItem);
      setIsEditModalOpen(true);
    }
  };

  const handleSaveEdit = (updatedItem: InventoryItem) => {
    setInventory(prev => prev.map(item => 
      item.id === updatedItem.id ? updatedItem : item
    ));
    setSelectedItems([]);
  };

  // Проверка: все ли выбраны
  const allSelected = filteredAndSortedInventory.length > 0 && filteredAndSortedInventory.every(item => selectedItems.includes(item.id));

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('pl-PL');
  };

  const getStatusColor = (ilosc: number, rezerwacje: number, ilosc_na_poleceniach: number) => {
    const available = ilosc - rezerwacje - ilosc_na_poleceniach;
    if (available <= 0) return 'text-red-600';
    if (available < 10) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getDaysRemainingColor = (days: number): string => {
    if (days === 0) return 'text-red-600';
    if (days <= 7) return 'text-red-600';
    if (days <= 30) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getDaysRemainingStatus = (days: number): string => {
    if (days === 0) return 'Brak';
    if (days <= 7) return 'Krytyczny';
    if (days <= 30) return 'Niski';
    if (days === Infinity) return 'Brak danych';
    return 'OK';
  };

  // 1. Получаем массив выбранных товаров для статистики
  const selectedInventory = selectedItems.length > 0
    ? inventory.filter(item => selectedItems.includes(item.id))
    : [];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 font-sora">{error}</p>
        <button 
          onClick={loadInventory}
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-sora"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Заголовок и поиск */}
      <div className="mb-2 flex items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:border-gray-400 w-full font-sora text-xs"
          />
        </div>
        <button
          onClick={handleEditClick}
          disabled={selectedItems.length !== 1}
          className="text-green-600 hover:text-green-800 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          title="Edytuj"
        >
          <Edit size={16} />
        </button>
      </div>

      {/* Статистика и фильтры */}
      <div className="flex flex-wrap gap-4 justify-between">
        <div className="flex flex-wrap gap-4">
          <div className="bg-white p-2 rounded-lg border rounded-lg max-w-[170px] w-full sm:w-auto flex-1 min-w-[170px]">
            <h3 className="text-xs font-medium text-gray-500 font-sora">Liczba artykułów</h3>
            <p className="text-2xl font-bold text-gray-900 font-sora">{selectedInventory.length}</p>
          </div>
          <div className="bg-white p-2 rounded-lg border rounded-lg max-w-[170px] w-full sm:w-auto flex-1 min-w-[170px]">
            <h3 className="text-xs font-medium text-gray-500 font-sora">Łączna ilość towaru</h3>
            <p className="text-2xl font-bold text-green-600 font-sora">
              {selectedInventory.length > 0 ? selectedInventory.reduce((sum, item) => sum + (item.ilosc || 0), 0) : 0}
            </p>
          </div>
          <div className="bg-white p-2 rounded-lg border rounded-lg max-w-[170px] w-full sm:w-auto flex-1 min-w-[170px]">
            <h3 className="text-xs font-medium text-gray-500 font-sora">Wartość towaru fakturowa</h3>
            <p className="text-2xl font-bold text-blue-600 font-sora">
              {selectedInventory.length > 0 ? selectedInventory.reduce((sum, item) => {
                // Используем данные из price_history для точного расчета
                const priceHistoryForItem = priceHistory[item.kod] || [];
                const totalValueFromHistory = priceHistoryForItem.reduce((itemSum, price) => {
                  return itemSum + (price.cena * price.ilosc);
                }, 0);
                
                // Если есть данные в price_history, используем их
                if (priceHistoryForItem.length > 0) {
                  return sum + totalValueFromHistory;
                } else {
                  // Fallback на текущую цену, если истории нет
                  const currentPrice = item.cena || 0;
                  const currentQuantity = item.ilosc || 0;
                  return sum + (currentPrice * currentQuantity);
                }
              }, 0).toFixed(2) : '0.00'} €
            </p>
          </div>
          <div className="bg-white p-2 rounded-lg border rounded-lg max-w-[170px] w-full sm:w-auto flex-1 min-w-[170px]">
            <h3 className="text-xs font-medium text-gray-500 font-sora">Wartość towaru w sprzedaży</h3>
            <p className="text-2xl font-bold text-red-600 font-sora">
              {selectedInventory.length > 0 ? selectedInventory.reduce((sum, item) => {
                const cenaSprzedazy = item.cena_sprzedazy || 0;
                const ilosc = item.ilosc || 0;
                return sum + (cenaSprzedazy * ilosc);
              }, 0).toFixed(2) : '0.00'} zł
            </p>
          </div>
        </div>

        {/* Фильтры */}
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-2 gap-1">
            {/* Фильтр Sprzedawca */}
            <div className="relative">
              <select
                value={filters.sprzedawca}
                onChange={(e) => setFilters(prev => ({ ...prev, sprzedawca: e.target.value }))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-gray-900"
              >
                <option value="">Sprzedawca</option>
                {uniqueSprzedawcy.map(sprzedawca => (
                  <option key={sprzedawca} value={sprzedawca}>{sprzedawca}</option>
                ))}
              </select>
            </div>

            {/* Фильтр Typ */}
            <div className="relative">
              <select
                value={filters.typ}
                onChange={(e) => setFilters(prev => ({ ...prev, typ: e.target.value }))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-gray-900"
              >
                <option value="">Typ</option>
                {uniqueTypy.map(typ => (
                  <option key={typ} value={typ}>{TYPY_TOWARU.find(t => t.value === typ)?.label || typ}</option>
                ))}
              </select>
            </div>

            {/* Фильтр Objętość */}
            <div className="relative">
              <select
                value={filters.objetosc}
                onChange={(e) => setFilters(prev => ({ ...prev, objetosc: e.target.value }))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-gray-900"
              >
                <option value="">Objętość</option>
                {uniqueObjetosci.map(objetosc => (
                  <option key={objetosc} value={objetosc}>{objetosc} l</option>
                ))}
              </select>
            </div>

            {/* Фильтр Status */}
            <div className="relative">
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-gray-900"
              >
                <option value="">Status</option>
                {uniqueStatusy.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Кнопка сброса фильтров */}
          {(filters.sprzedawca || filters.typ || filters.objetosc || filters.status) && (
            <button
              onClick={() => setFilters({ sprzedawca: '', typ: '', objetosc: '', status: '' })}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-xs font-sora transition-colors"
            >
              Wyczyść filtry
            </button>
          )}
        </div>
      </div>

      {/* Таблица */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        <div className="w-full overflow-y-auto max-h-[500px]">
          <table className="w-full">
            <thead>
              <tr>
                <th className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora">
                  <input type="checkbox" checked={allSelected} onChange={e => handleSelectAll(e.target.checked)} />
                </th>
                <th 
                  className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('kod')}
                >
                  Kod
                </th>
                <th 
                  className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('nazwa')}
                >
                  Nazwa
                </th>
                <th 
                  className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('sprzedawca')}
                >
                  Sprzedawca
                </th>
                <th 
                  className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('ilosc')}
                >
                  Ilość
                </th>
                <th 
                  className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('typ')}
                >
                  Typ
                </th>
                <th 
                  className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('objetosc')}
                >
                  Objętość
                </th>
                <th 
                  className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('cena')}
                >
                  Cena fakturowa
                </th>
                <th 
                  className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('cena_sprzedazy')}
                >
                  Cena w sprzedaży
                </th>
                <th 
                  className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('dataWaznosci')}
                >
                  Data ważności
                </th>
                <th 
                  className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('sprzedaze')}
                >
                  Sprzedaże
                </th>
                <th 
                  className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('srednieZuzycie')}
                >
                  Średnie zużycie/dzień
                </th>
                <th 
                  className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('dniPozostalo')}
                >
                  Dni pozostało
                </th>
                <th 
                  className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('dataWyczerpania')}
                >
                  Data wyczerpania zapasów
                </th>
                <th 
                  className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('status')}
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedInventory.map((item) => {
                const available = item.ilosc - item.rezerwacje - item.ilosc_na_poleceniach;
                const statusColor = getStatusColor(item.ilosc, item.rezerwacje, item.ilosc_na_poleceniach);
                const avgConsumption = calculateAverageConsumption(item.kod);
                const avgSales = averageSalesCache.get(item.kod) || 0;
                const daysRemaining = avgSales <= 0 ? Infinity : Math.floor(item.ilosc / avgSales);
                const daysColor = getDaysRemainingColor(daysRemaining);
                const daysStatus = getDaysRemainingStatus(daysRemaining);
                
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={e => handleSelectOne(item.id, e.target.checked)}
                      />
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline">
                      <div className="break-words leading-tight max-h-8 overflow-hidden">{item.kod}</div>
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline">
                      <div className="break-words leading-tight max-h-8 overflow-hidden">{item.nazwa}</div>
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {item.sprzedawca || sprzedawcaCache.get(item.kod) || ''}
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {item.ilosc} {item.jednostka_miary}
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {item.typ ? (
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-sora leading-tight border ${getTypColor(item.typ)}`}>
                          {TYPY_TOWARU.find(t => t.value === item.typ)?.label || item.typ}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {item.objetosc ? `${item.objetosc} l` : '-'}
                    </td>
                    <td 
                      className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap cursor-pointer"
                      data-tooltip-id={`price-tooltip-${item.kod}`}
                      onMouseEnter={() => {
                        if (!priceHistory[item.kod]) {
                          loadPriceHistory(item.kod);
                        }
                      }}
                    >
                      {item.cena ? `${item.cena.toFixed(2)} €` : '-'}
                      <Tooltip
                        id={`price-tooltip-${item.kod}`}
                        className="max-w-md"
                        place="top"
                      >
                        <div className="font-sora">
                          <div className="font-semibold mb-2">Historia cen:</div>
                          {priceHistory[item.kod] && priceHistory[item.kod].length > 0 ? (
                            priceHistory[item.kod].map((price, index) => (
                              <div key={index} className="mb-1">
                                <span className="font-medium">{price.cena.toFixed(2)} €</span>
                                <span className="text-gray-500 ml-2">({price.ilosc} szt.)</span>
                                <span className="text-gray-400 ml-2">- {price.created_at}</span>
                                {price.is_manual_edit && (
                                  <span className="text-orange-500 ml-2 text-xs">(ręczna edycja)</span>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-500">Brak historii cen</div>
                          )}
                        </div>
                      </Tooltip>
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {item.cena_sprzedazy ? `${item.cena_sprzedazy.toFixed(2)} zł` : '-'}
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {item.data_waznosci ? formatDate(item.data_waznosci) : '-'}
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {(() => {
                        // Группируем продажи по дате и клиенту
                        const sales = orderProducts.filter(p => p.kod === item.kod);
                        console.log(`Sales for ${item.kod}:`, sales.length);
                        
                        // Ключ: дата+клиент, значение: {qty, klient, date}
                        const salesByDateClient: {[key: string]: {qty: number, klient: string, date: string}} = {};
                        sales.forEach(sale => {
                          const order = orders.find(o => o.id === sale.orderId);
                          const klient = order ? order.klient : '';
                          const date = order ? new Date(order.data_utworzenia).toLocaleDateString('pl-PL') : (sale.created_at ? new Date(sale.created_at).toLocaleDateString('pl-PL') : '');
                          const key = date + '|' + klient;
                          if (!salesByDateClient[key]) {
                            salesByDateClient[key] = { qty: 0, klient, date };
                          }
                          salesByDateClient[key].qty += sale.ilosc;
                        });
                        
                        const salesArray = Object.entries(salesByDateClient);
                        console.log(`Sales array for ${item.kod}:`, salesArray.length);
                        const maxVisible = 5;
                        
                        if (salesArray.length === 0) {
                          return <div className="text-gray-400">-</div>;
                        }
                        
                        const currentIndex = carouselStates[item.kod] || 0;
                        const maxIndex = Math.max(0, salesArray.length - 5);
                        const showArrows = salesArray.length > 5;
                        
                        if (salesArray.length === 0) {
                          return <div className="text-gray-400">-</div>;
                        }
                        
                        const visibleSales = salesArray.slice(currentIndex, currentIndex + 5);
                        
                        return (
                          <div className="flex items-center gap-1">
                            {showArrows && currentIndex > 0 && (
                              <button
                                onClick={() => handleCarouselPrev(item.kod)}
                                className="w-4 h-4 bg-gray-200 hover:bg-gray-300 rounded flex items-center justify-center text-gray-600 hover:text-gray-800 transition-colors"
                              >
                                <ChevronLeft size={12} />
                              </button>
                            )}
                            
                            <div className="flex flex-row gap-1">
                              {visibleSales.map(([key, val], idx) => (
                                <div
                                  key={key + idx}
                                  className="w-5 h-5 bg-blue-100 border border-blue-300 rounded flex items-center justify-center text-xs font-bold cursor-pointer hover:bg-blue-200 relative"
                                  data-tooltip-id={`sales-tooltip-${item.kod}-${currentIndex + idx}`}
                                  {...(val.date && val.klient ? { ['data-tooltip-content']: `${val.date} | ${val.klient}` } : {})}
                                >
                                  {val.qty}
                                  <Tooltip 
                                    id={`sales-tooltip-${item.kod}-${currentIndex + idx}`}
                                    className="max-w-md"
                                    place="top"
                                  />
                                </div>
                              ))}
                            </div>
                            
                            {showArrows && currentIndex < maxIndex && (
                              <button
                                onClick={() => handleCarouselNext(item.kod, maxIndex)}
                                className="w-4 h-4 bg-gray-200 hover:bg-gray-300 rounded flex items-center justify-center text-gray-600 hover:text-gray-800 transition-colors"
                              >
                                <ChevronRight size={12} />
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {(averageSalesCache.get(item.kod) || 0).toFixed(2)} {item.jednostka_miary}/dzień
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {(() => {
                        const avgSales = averageSalesCache.get(item.kod) || 0;
                        const daysLeft = avgSales <= 0 ? Infinity : Math.floor(item.ilosc / avgSales);
                        return daysLeft === Infinity ? '∞' : daysLeft;
                      })()}
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {(() => {
                        const avgSales = averageSalesCache.get(item.kod) || 0;
                        const daysLeft = avgSales <= 0 ? Infinity : Math.floor(item.ilosc / avgSales);
                        if (daysLeft === Infinity) return '-';
                        const date = new Date();
                        date.setDate(date.getDate() + daysLeft);
                        return date.toLocaleDateString('pl-PL');
                      })()}
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {(() => {
                        const avgSales = averageSalesCache.get(item.kod) || 0;
                        const daysLeft = avgSales <= 0 ? Infinity : Math.floor(item.ilosc / avgSales);
                        const statusText = daysLeft === Infinity ? 'Brak danych' : 
                                         daysLeft <= 30 ? 'mało' : 
                                         daysLeft <= 60 ? 'średnie' : 'dużo';
                        return (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-sora leading-tight border ${getStatusBadgeColor(daysLeft)}`}>
                            {statusText}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Модальное окно редактирования */}
      <EditInventoryModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedItemForEdit(null);
        }}
        item={selectedItemForEdit}
        onSave={handleSaveEdit}
      />
    </div>
  );
};