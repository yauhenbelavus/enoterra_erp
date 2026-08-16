import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Edit, ShoppingCart, X, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { Tooltip } from 'react-tooltip';
import Modal from 'react-modal';
import { EditInventoryModal } from './EditInventoryModal';

// Глобальные стили для тултипов и таблицы
const tooltipStyles = `
  .react-tooltip {
    z-index: 10000 !important;
    max-width: 400px !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  
  .resizable-table {
    table-layout: fixed !important;
    width: max-content !important;
    min-width: 100% !important;
  }
  
  .resizable-table th,
  .resizable-table td {
    box-sizing: border-box !important;
    overflow: visible !important;
  }
  
  /* no generic resizable columns */
`;

const TYPY_TOWARU = [
  { value: 'czerwone', label: 'Czerwone', color: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'biale', label: 'Białe', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  { value: 'musujace', label: 'Musujące', color: 'bg-yellow-50 text-yellow-600 border-yellow-100' },
  { value: 'bezalkoholowe', label: 'Bezalkoholowe', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'ferment', label: 'Ferment', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 'rozowe', label: 'Różowe', color: 'bg-pink-100 text-pink-800 border-pink-200' },
  { value: 'slodkie', label: 'Słodkie', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'aksesoria', label: 'Aksesoria', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { value: 'amber', label: 'Amber', color: 'bg-amber-100 text-amber-800 border-amber-200' }
];

interface InventoryItem {
  id: number;
  kod: string;
  nazwa: string;
  ilosc: number;
  kod_kreskowy: string;
  data_waznosci: string | number | null; // Может быть строкой (DATE), числом (timestamp) или null
  rezerwacje: number;
  objetosc: number;
  typ?: string; // Added typ field
  updated_at: string;
  created_at?: string; // Дата создания записи в working_sheets
  sprzedawca?: string; // Added sprzedawca field
  cena?: number; // Added cena field
  cena_sprzedazy?: number; // Added cena_sprzedazy field
  koszt_wlasny?: number; // Added koszt_wlasny field
  koszt_dostawy_per_unit?: number; // Added koszt_dostawy_per_unit field
  podatek_akcyzowy?: number; // Added podatek_akcyzowy field
  zamrozone_srednie_zuzycie?: number | null;
  zamrozone_data_wyczerpania?: string | null;
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
  numer_zamowienia?: string;
}

const getOrderProductDate = (op: OrderProduct): Date | null => {
  if (op.numer_zamowienia) {
    const fromNumber = extractDateFromOrderNumberAsDate(op.numer_zamowienia);
    if (fromNumber) return fromNumber;
  }
  if (op.created_at) {
    const fromCreated = new Date(op.created_at);
    if (!isNaN(fromCreated.getTime())) return fromCreated;
  }
  return null;
};

const getLastSaleDate = (
  kod: string,
  orderProducts: OrderProduct[],
  startDate?: Date | null
): Date | null => {
  let lastDate: Date | null = null;

  for (const op of orderProducts) {
    if (op.kod !== kod) continue;
    const orderDate = getOrderProductDate(op);
    if (!orderDate) continue;
    if (startDate && orderDate < startDate) continue;
    if (!lastDate || orderDate > lastDate) lastDate = orderDate;
  }

  return lastDate;
};

const computeAverageConsumption = (
  kod: string,
  orderProducts: OrderProduct[],
  startDate: Date | null,
  endDate: Date
): number => {
  const salesProducts = orderProducts.filter(op => {
    if (op.kod !== kod) return false;
    const d = getOrderProductDate(op);
    if (!d) return !startDate;
    if (startDate && d < startDate) return false;
    if (d > endDate) return false;
    return true;
  });

  if (salesProducts.length === 0) return 0;

  let firstSaleDate: Date | null = null;
  for (const op of salesProducts) {
    const d = getOrderProductDate(op);
    if (d && (!firstSaleDate || d < firstSaleDate)) firstSaleDate = d;
  }

  if (!firstSaleDate) return 0;

  const days = Math.max(1, Math.ceil((endDate.getTime() - firstSaleDate.getTime()) / (1000 * 60 * 60 * 24)));
  const totalSales = salesProducts.reduce((sum, op) => sum + op.ilosc, 0);
  return totalSales / days;
};

const formatAverageConsumption = (avg: number): string => {
  if (avg <= 0) return '-';
  if (avg >= 1) return avg.toFixed(2) + '/dzień';
  if (avg >= 0.1) return avg.toFixed(3) + '/dzień';
  return avg.toFixed(4) + '/dzień';
};

const formatFrozenDepletionDate = (value?: string | null): string => {
  if (!value) return '-';
  const normalized = value.includes('T') ? value : `${value}T00:00:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pl-PL');
};

const hasSalesInCurrentPeriod = (
  item: InventoryItem,
  orderProducts: OrderProduct[]
): boolean => {
  const startDate = item.created_at ? new Date(item.created_at) : null;
  return orderProducts.some((op) => {
    if (op.kod !== item.kod) return false;
    const d = getOrderProductDate(op);
    if (!d) return false;
    return !startDate || d >= startDate;
  });
};

const getLastReceiptDateBefore = (
  kod: string,
  beforeDate: Date,
  productReceipts: InventoryStatusProps['productReceipts']
): Date | null => {
  let lastReceiptDate: Date | null = null;

  for (const receipt of productReceipts || []) {
    if (!receipt?.dataPrzyjecia || !Array.isArray(receipt.products)) continue;
    const hasKod = receipt.products.some((product) => product.kod === kod);
    if (!hasKod) continue;

    const receiptDate = new Date(receipt.dataPrzyjecia);
    if (Number.isNaN(receiptDate.getTime()) || receiptDate >= beforeDate) continue;
    if (!lastReceiptDate || receiptDate > lastReceiptDate) lastReceiptDate = receiptDate;
  }

  return lastReceiptDate;
};

const getFrozenMetricsFallback = (
  item: InventoryItem,
  orderProducts: OrderProduct[],
  productReceipts: InventoryStatusProps['productReceipts']
): { avg: number; depletionDate: string | null } | null => {
  const periodStart = item.created_at ? new Date(item.created_at) : null;
  if (!periodStart) return null;

  const oldPeriodStart = getLastReceiptDateBefore(item.kod, periodStart, productReceipts);
  const endDate = getLastSaleDate(item.kod, orderProducts, oldPeriodStart);
  if (!endDate || endDate >= periodStart) return null;

  const avg = computeAverageConsumption(
    item.kod,
    orderProducts,
    oldPeriodStart,
    endDate
  );
  if (avg <= 0) return null;

  const depletionDate = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
  return { avg, depletionDate };
};

const getFrozenMetrics = (
  item: InventoryItem,
  orderProducts: OrderProduct[],
  productReceipts: InventoryStatusProps['productReceipts']
): { avg: number; depletionDate: string | null } | null => {
  if (item.zamrozone_srednie_zuzycie != null && item.zamrozone_srednie_zuzycie > 0) {
    return {
      avg: item.zamrozone_srednie_zuzycie,
      depletionDate: item.zamrozone_data_wyczerpania || null,
    };
  }

  return getFrozenMetricsFallback(item, orderProducts, productReceipts);
};

const getDisplayAverage = (
  item: InventoryItem,
  orderProducts: OrderProduct[],
  productReceipts: InventoryStatusProps['productReceipts'],
  averageSalesCache: Map<string, number>
): number => {
  if (hasSalesInCurrentPeriod(item, orderProducts)) {
    return averageSalesCache.get(item.kod) || 0;
  }

  const frozen = getFrozenMetrics(item, orderProducts, productReceipts);
  if (frozen) return frozen.avg;

  if (item.ilosc === 0) {
    return averageSalesCache.get(item.kod) || 0;
  }

  return 0;
};

const getDisplayDepletionDate = (
  item: InventoryItem,
  orderProducts: OrderProduct[],
  productReceipts: InventoryStatusProps['productReceipts'],
  averageSalesCache: Map<string, number>
): string => {
  if (hasSalesInCurrentPeriod(item, orderProducts)) {
    if (item.ilosc === 0) {
      const startDate = item.created_at ? new Date(item.created_at) : null;
      const lastOrderDate = getLastSaleDate(item.kod, orderProducts, startDate);
      return lastOrderDate ? lastOrderDate.toLocaleDateString('pl-PL') : '-';
    }

    const avgSales = averageSalesCache.get(item.kod) || 0;
    if (avgSales <= 0) return '-';
    const daysLeft = Math.floor(item.ilosc / avgSales);
    const date = new Date();
    date.setDate(date.getDate() + daysLeft);
    return date.toLocaleDateString('pl-PL');
  }

  const frozen = getFrozenMetrics(item, orderProducts, productReceipts);
  if (frozen?.depletionDate) {
    return formatFrozenDepletionDate(frozen.depletionDate);
  }

  if (item.ilosc === 0) {
    const startDate = item.created_at ? new Date(item.created_at) : null;
    const lastOrderDate = getLastSaleDate(item.kod, orderProducts, startDate);
    return lastOrderDate ? lastOrderDate.toLocaleDateString('pl-PL') : '-';
  }

  return '-';
};

const getDisplayDaysLeft = (
  item: InventoryItem,
  orderProducts: OrderProduct[],
  _productReceipts: InventoryStatusProps['productReceipts'],
  averageSalesCache: Map<string, number>
): string | number => {
  if (item.ilosc <= 0) return '-';
  if (!hasSalesInCurrentPeriod(item, orderProducts)) return '-';

  const avgSales = averageSalesCache.get(item.kod) || 0;
  if (avgSales <= 0) return '-';
  return Math.floor(item.ilosc / avgSales);
};

const getInventoryStatus = (
  item: InventoryItem,
  orderProducts: OrderProduct[],
  averageSalesCache: Map<string, number>
): string => {
  if (item.ilosc === 0) return 'brak';
  if (!hasSalesInCurrentPeriod(item, orderProducts)) return 'Brak sprzedaży';

  const avgSales = averageSalesCache.get(item.kod) || 0;
  const daysLeft = avgSales <= 0 ? Infinity : Math.floor(item.ilosc / avgSales);
  if (daysLeft === Infinity) return 'Brak sprzedaży';
  if (daysLeft <= 30) return 'mało';
  if (daysLeft <= 60) return 'średnie';
  return 'dużo';
};

const getStatusDaysLeftForColor = (
  item: InventoryItem,
  orderProducts: OrderProduct[],
  averageSalesCache: Map<string, number>
): number => {
  const status = getInventoryStatus(item, orderProducts, averageSalesCache);
  if (status === 'brak' || status === 'Brak sprzedaży') return Infinity;

  const avgSales = averageSalesCache.get(item.kod) || 0;
  if (avgSales <= 0) return Infinity;
  return Math.floor(item.ilosc / avgSales);
};

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

// Функция для извлечения даты из номера заказа
const extractDateFromOrderNumber = (orderNumber: string): string => {
  try {
    // Паттерн: номер_день_месяц_год (например: 1101_12_09_2025)
    const datePattern = /(\d{1,2})_(\d{1,2})_(\d{4})$/;
    const match = orderNumber.match(datePattern);
    
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      const year = match[3];
      
      // Создаем дату и форматируем в польском формате
      const date = new Date(`${year}-${month}-${day}`);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('pl-PL');
      }
    }
    
    // Альтернативный паттерн: номер-день-месяц-год (например: 1101-12-09-2025)
    const altPattern = /(\d{1,2})-(\d{1,2})-(\d{4})$/;
    const altMatch = orderNumber.match(altPattern);
    
    if (altMatch) {
      const day = altMatch[1].padStart(2, '0');
      const month = altMatch[2].padStart(2, '0');
      const year = altMatch[3];
      
      const date = new Date(`${year}-${month}-${day}`);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('pl-PL');
      }
    }
    
    // Если паттерн не найден, возвращаем пустую строку
    return '';
  } catch (error) {
    console.error('Error extracting date from order number:', error);
    return '';
  }
};

// Функция для извлечения даты из номера заказа (возвращает Date объект)
const extractDateFromOrderNumberAsDate = (orderNumber: string): Date | null => {
  try {
    // Паттерн: номер_день_месяц_год (например: 1101_12_09_2025)
    const datePattern = /(\d{1,2})_(\d{1,2})_(\d{4})$/;
    const match = orderNumber.match(datePattern);
    
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      const year = match[3];
      
      const date = new Date(`${year}-${month}-${day}`);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    
    // Альтернативный паттерн: номер-день-месяц-год (например: 1101-12-09-2025)
    const altPattern = /(\d{1,2})-(\d{1,2})-(\d{4})$/;
    const altMatch = orderNumber.match(altPattern);
    
    if (altMatch) {
      const day = altMatch[1].padStart(2, '0');
      const month = altMatch[2].padStart(2, '0');
      const year = altMatch[3];
      
      const date = new Date(`${year}-${month}-${day}`);
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
  const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
  const [selectedProductKod, setSelectedProductKod] = useState<string | null>(null);
  const [salesFilterClient, setSalesFilterClient] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<string>(() => {
    const saved = localStorage.getItem('sortField');
    return saved || 'nazwa';
  });
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() => {
    const saved = localStorage.getItem('sortDirection');
    return (saved as 'asc' | 'desc') || 'asc';
  });
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [filters, setFilters] = useState({
    sprzedawca: '',
    typ: '',
    objetosc: '',
    status: ''
  });
  // После обновления страницы галочка всегда стоит (товары с 0 скрыты)
  const [hideZeroStock, setHideZeroStock] = useState<boolean>(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<InventoryItem | null>(null);
  const [priceHistory, setPriceHistory] = useState<{[key: string]: any[]}>({});
  const [samplesCount, setSamplesCount] = useState<{[key: string]: number}>({});
  const [reservationsCount, setReservationsCount] = useState<{[key: string]: number}>({});
  const [wartoscTowaru, setWartoscTowaru] = useState<{[key: string]: number}>({});
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>(() => {
    const saved = localStorage.getItem('columnWidths');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing saved column widths:', e);
      }
    }
    return { nazwa: 250 };
  });
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState<number>(0);
  const [resizeStartWidth, setResizeStartWidth] = useState<number>(0);
  const [wasResizing, setWasResizing] = useState<boolean>(false);
  const resizeRef = useRef<HTMLTableElement>(null);

  // Состояние для отслеживания текущей даты (нормализованной до дня)
  // Это нужно для автоматического пересчета среднего потребления каждый день
  const [currentDate, setCurrentDate] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  // Обновляем текущую дату при смене дня
  useEffect(() => {
    const updateDate = () => {
      const today = new Date();
      const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      setCurrentDate(prevDate => {
        if (prevDate !== dateString) {
          console.log(`📅 Date changed: ${prevDate} → ${dateString}, triggering averageSalesCache recalculation`);
          return dateString;
        }
        return prevDate;
      });
    };

    // Проверяем при загрузке
    updateDate();

    // Проверяем каждую минуту (чтобы поймать смену дня)
    const interval = setInterval(updateDate, 60000);

    return () => clearInterval(interval);
  }, []);

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
    const today = new Date();

    try {
      for (const item of inventory) {
        // Точка отсчёта: created_at из working_sheets
        // (сбрасывается на дату приёмки когда остаток был = 0)
        const startDate = item.created_at ? new Date(item.created_at) : null;

        // При ilosc = 0 фиксируем średnie zużycie на момент последней продажи
        const endDate = item.ilosc === 0
          ? getLastSaleDate(item.kod, orderProducts, startDate)
          : today;

        if (item.ilosc === 0 && !endDate) {
          cache.set(item.kod, 0);
          continue;
        }

        cache.set(
          item.kod,
          computeAverageConsumption(item.kod, orderProducts, startDate, endDate || today)
        );
      }
    } catch (error) {
      console.error('Error building averageSalesCache:', error);
    }

    console.log('averageSalesCache built with', cache.size, 'entries');
    return cache;
  }, [inventory, orderProducts, currentDate]);

  const loadAllPriceHistory = async () => {
    try {
      const response = await fetch(`/api/products`);
      if (response.ok) {
        const allProducts = await response.json();
        const newPriceHistory: {[key: string]: any[]} = {};
        
        // Группируем продукты по коду и создаем структуру для tooltip
        allProducts.forEach((product: any) => {
          if (product.status === 'samples') return; // пропускаем семплы
          if (!newPriceHistory[product.kod]) {
            newPriceHistory[product.kod] = [];
          }
          // Добавляем данные из products для tooltip
          newPriceHistory[product.kod].push({
            cena: product.cena,
            ilosc_aktualna: product.ilosc_aktualna,
            data_zmiany: product.updated_at || product.created_at
          });
        });
        
        // Сортируем каждую группу по дате изменения (новые первыми)
        Object.keys(newPriceHistory).forEach(kod => {
          newPriceHistory[kod].sort((a, b) => 
            new Date(b.data_zmiany).getTime() - new Date(a.data_zmiany).getTime()
          );
        });
        
        setPriceHistory(newPriceHistory);
      }
    } catch (error) {
      console.error('Error loading all products:', error);
    }
  };

  const loadInventory = async () => {
    try {
      console.log('Starting loadInventory...');
      setIsLoading(true);
      setError(null);
      
      // Загружаем данные из working_sheets
      console.log('Fetching working-sheets...');
      const inventoryResponse = await fetch('/api/working-sheets');
      if (!inventoryResponse.ok) {
        throw new Error(`HTTP error! status: ${inventoryResponse.status}`);
      }
      const inventoryData = await inventoryResponse.json();
      console.log('Inventory data from server:', inventoryData.length, 'items');
      if (inventoryData.length > 0) {
        console.log('First item keys:', Object.keys(inventoryData[0]));
        console.log('First item typ value:', inventoryData[0].typ);
        // Добавляем логирование для data_waznosci
        if (inventoryData[0].data_waznosci) {
          console.log('First item data_waznosci:', inventoryData[0].data_waznosci);
          console.log('First item data_waznosci type:', typeof inventoryData[0].data_waznosci);
          console.log('First item data_waznosci formatted:', formatDate(inventoryData[0].data_waznosci));
        }
      }
      setInventory(inventoryData);

      // Загружаем заказы
      console.log('Fetching orders...');
      const ordersResponse = await fetch('/api/orders');
      if (!ordersResponse.ok) {
        throw new Error(`HTTP error! status: ${ordersResponse.status}`);
      }
      const ordersData = await ordersResponse.json();
      console.log('Orders data from server:', ordersData.length, 'items');
      setOrders(ordersData);

      // Загружаем продукты заказов
      console.log('Fetching orders-with-products...');
      const orderProductsResponse = await fetch('/api/orders-with-products');
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
            allOrderProducts.push({ 
              ...product, 
              orderId: order.id, 
              created_at: product.created_at || order.data_utworzenia,
              numer_zamowienia: order.numer_zamowienia
            });
          });
        }
      });
      console.log('Total order products:', allOrderProducts.length);
      setOrderProducts(allOrderProducts);
      
      // Загружаем историю цен для всех товаров
      await loadAllPriceHistory();
      
      // Загружаем количество samples для каждого товара
      const samplesResponse = await fetch('/api/products/samples-count');
      if (samplesResponse.ok) {
        const samplesData = await samplesResponse.json();
        const samplesMap: {[key: string]: number} = {};
        samplesData.forEach((item: any) => {
          samplesMap[item.kod] = item.total_ilosc || 0;
        });
        setSamplesCount(samplesMap);
      }
      
      // Загружаем количество резерваций для каждого товара
      try {
        const reservationsResponse = await fetch('/api/products/reservations-count');
        if (reservationsResponse.ok) {
          const reservationsData = await reservationsResponse.json();
          const reservationsMap: {[key: string]: number} = {};
          reservationsData.forEach((item: any) => {
            reservationsMap[item.kod] = item.total_ilosc || 0;
          });
          setReservationsCount(reservationsMap);
          console.log('✅ Reservations count loaded:', reservationsMap);
        } else {
          console.error('❌ Failed to load reservations count:', reservationsResponse.status);
        }
      } catch (error) {
        console.error('❌ Error loading reservations count:', error);
      }
      
      // Загружаем стоимость товаров
      const wartoscResponse = await fetch('/api/products/wartosc-towaru');
      if (wartoscResponse.ok) {
        const wartoscData = await wartoscResponse.json();
        const wartoscMap: {[key: string]: number} = {};
        wartoscData.forEach((item: any) => {
          wartoscMap[item.kod] = item.wartosc || 0;
        });
        setWartoscTowaru(wartoscMap);
      }
      
      
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
      const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(newDirection);
      localStorage.setItem('sortDirection', newDirection);
    } else {
      setSortField(field);
      setSortDirection('asc');
      localStorage.setItem('sortField', field);
      localStorage.setItem('sortDirection', 'asc');
    }
  };


  // Функция для получения цвета типа товара
  const getTypColor = (typ: string): string => {
    const typConfig = TYPY_TOWARU.find(t => t.value === typ);
    return typConfig ? typConfig.color : 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getStatusBadgeColor = (days: number): string => {
    if (days === Infinity) return 'bg-blue-100 text-blue-800 border-blue-200';
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
      statusy.add(getInventoryStatus(item, orderProducts, averageSalesCache));
    });
    return Array.from(statusy).sort();
  }, [inventory, averageSalesCache, orderProducts, productReceipts]);

  const filteredAndSortedInventory = inventory
    .filter(item => {
      // Скрываем товары с нулевым (или отрицательным) остатком если включен фильтр
      if (hideZeroStock && (item.ilosc || 0) <= 0) return false;

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
        const status = getInventoryStatus(item, orderProducts, averageSalesCache);
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
      case 'koszt_wlasny':
        aValue = a.koszt_wlasny || 0;
        bValue = b.koszt_wlasny || 0;
        break;
        case 'srednieZuzycie':
          aValue = getDisplayAverage(a, orderProducts, productReceipts, averageSalesCache);
          bValue = getDisplayAverage(b, orderProducts, productReceipts, averageSalesCache);
          break;
        case 'dniPozostalo': {
          const aDays = getDisplayDaysLeft(a, orderProducts, productReceipts, averageSalesCache);
          const bDays = getDisplayDaysLeft(b, orderProducts, productReceipts, averageSalesCache);
          aValue = aDays === '-' ? Infinity : aDays;
          bValue = bDays === '-' ? Infinity : bDays;
          break;
        }
        case 'dataWyczerpania': {
          const parseDisplayDate = (value: string) => {
            if (!value || value === '-') return 0;
            const parts = value.split('.');
            if (parts.length === 3) {
              return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
            }
            const parsed = new Date(value).getTime();
            return Number.isNaN(parsed) ? 0 : parsed;
          };
          aValue = parseDisplayDate(getDisplayDepletionDate(a, orderProducts, productReceipts, averageSalesCache));
          bValue = parseDisplayDate(getDisplayDepletionDate(b, orderProducts, productReceipts, averageSalesCache));
          break;
        }
        case 'status': {
          const getStatusRank = (item: InventoryItem) => {
            const status = getInventoryStatus(item, orderProducts, averageSalesCache);
            if (status === 'brak') return 0;
            if (status === 'Brak sprzedaży') return 4;
            if (status === 'mało') return 1;
            if (status === 'średnie') return 2;
            return 3;
          };
          aValue = getStatusRank(a);
          bValue = getStatusRank(b);
          break;
        }
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
          // Нормализуем даты для корректной сортировки
          const normalizeDate = (dateValue: string | number | null): number => {
            if (!dateValue) return 0;
            
            let date: Date;
            if (typeof dateValue === 'string') {
              date = new Date(dateValue);
            } else if (typeof dateValue === 'number') {
              if (dateValue < 1000000000000) {
                date = new Date(dateValue * 1000);
              } else {
                date = new Date(dateValue);
              }
            } else {
              return 0;
            }
            
            return isNaN(date.getTime()) ? 0 : date.getTime();
          };
          
          aValue = normalizeDate(a.data_waznosci);
          bValue = normalizeDate(b.data_waznosci);
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

  // Функции для изменения размера колонок
  const handleMouseDown = (e: React.MouseEvent, column: string) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🖱️ Mouse down on column:', column, 'X:', e.clientX, 'Current width:', columnWidths[column]);
    setIsResizing(column);
    setResizeStartX(e.clientX);
    setResizeStartWidth(columnWidths[column]);
    setWasResizing(false);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isResizing) {
      const deltaX = e.clientX - resizeStartX;
      const newWidth = Math.max(50, resizeStartWidth + deltaX);
      console.log('🔄 Mouse move:', 'DeltaX:', deltaX, 'NewWidth:', newWidth, 'Column:', isResizing);
      
      // Если мышь сдвинулась больше чем на 3px, считаем что это resize
      if (Math.abs(deltaX) > 3) {
        setWasResizing(true);
      }
      
      const newColumnWidths = {
        ...columnWidths,
        [isResizing]: newWidth
      };
      setColumnWidths(newColumnWidths);
      
      // Сохраняем в localStorage
      localStorage.setItem('columnWidths', JSON.stringify(newColumnWidths));
    }
  };

  const handleMouseUp = () => {
    console.log('🖱️ Mouse up - finishing resize');
    setIsResizing(null);
    setResizeStartX(0);
    setResizeStartWidth(0);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    // Сбрасываем флаг через небольшую задержку, чтобы onClick успел его проверить
    setTimeout(() => {
      setWasResizing(false);
    }, 100);
  };

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, resizeStartX, resizeStartWidth]);


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

  const handleGenerateReport = async () => {
    try {
      const useSelection = selectedItems.length > 0;
      const response = await fetch('/api/inventory/report/pdf', useSelection
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: selectedItems }),
          }
        : undefined);

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        let msg = 'Ошибка при генерации отчёта';
        try {
          const j = JSON.parse(errText);
          if (j?.error) msg = j.error;
        } catch {
          /* use default msg */
        }
        throw new Error(msg);
      }
      
      // Получаем PDF как blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Создаём временную ссылку для скачивания
      const link = document.createElement('a');
      link.href = url;
      
      // Получаем имя файла из заголовка Content-Disposition или используем дефолтное
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = useSelection
        ? 'raport_stanow_magazynowych_zaznaczone.pdf'
        : 'raport_stanow_magazynowych.pdf';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Освобождаем память
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error(error instanceof Error ? error.message : 'Błąd generowania raportu');
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

  const formatDate = (dateValue: string | number | null) => {
    if (!dateValue) return '-';
    
    let date: Date;
    
    if (typeof dateValue === 'string') {
      // Если это строка (например, из базы данных)
      date = new Date(dateValue);
    } else if (typeof dateValue === 'number') {
      // Если это число (timestamp)
      // Проверяем, нужно ли умножать на 1000 (если timestamp в секундах)
      if (dateValue < 1000000000000) {
        // Если timestamp в секундах, умножаем на 1000
        date = new Date(dateValue * 1000);
      } else {
        // Если timestamp уже в миллисекундах
        date = new Date(dateValue);
      }
    } else {
      return '-';
    }
    
    // Проверяем, что дата валидна
    if (isNaN(date.getTime())) {
      return '-';
    }
    
    return date.toLocaleDateString('pl-PL');
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
        <label
          className="flex items-center gap-1.5 text-xs font-sora text-gray-700 cursor-pointer select-none"
          title="Ukryj towary z zerowym stanem"
        >
          <input
            type="checkbox"
            checked={hideZeroStock}
            onChange={(e) => setHideZeroStock(e.target.checked)}
            className="cursor-pointer"
          />
          Ukryj zerowe
        </label>
        <button
          onClick={handleGenerateReport}
          className="text-blue-600 hover:text-blue-800 focus:outline-none"
          title="Raport stanów magazynowych — przy zaznaczonych wierszach tylko one; bez zaznaczenia cały magazyn"
        >
          <FileText size={16} />
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
                return sum + (wartoscTowaru[item.kod] || 0);
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
                className="block px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300 truncate"
                style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', width: '145px', minWidth: '145px', maxWidth: '145px' }}
              >
                <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Sprzedawca</option>
                {uniqueSprzedawcy.map(sprzedawca => (
                  <option key={sprzedawca} value={sprzedawca} style={{ fontFamily: 'Sora, sans-serif' }}>{sprzedawca}</option>
                ))}
              </select>
            </div>

            {/* Фильтр Typ */}
            <div className="relative">
              <select
                value={filters.typ}
                onChange={(e) => setFilters(prev => ({ ...prev, typ: e.target.value }))}
                className="block px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300 truncate"
                style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', width: '145px', minWidth: '145px', maxWidth: '145px' }}
              >
                <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Typ</option>
                {uniqueTypy.map(typ => (
                  <option key={typ} value={typ} style={{ fontFamily: 'Sora, sans-serif' }}>{TYPY_TOWARU.find(t => t.value === typ)?.label || typ}</option>
                ))}
              </select>
            </div>

            {/* Фильтр Objętość */}
            <div className="relative">
              <select
                value={filters.objetosc}
                onChange={(e) => setFilters(prev => ({ ...prev, objetosc: e.target.value }))}
                className="block px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300 truncate"
                style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', width: '145px', minWidth: '145px', maxWidth: '145px' }}
              >
                <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Objętość</option>
                {uniqueObjetosci.map(objetosc => (
                  <option key={objetosc} value={objetosc} style={{ fontFamily: 'Sora, sans-serif' }}>{objetosc} l</option>
                ))}
              </select>
            </div>

            {/* Фильтр Status */}
            <div className="relative">
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="block px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300 truncate"
                style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', width: '145px', minWidth: '145px', maxWidth: '145px' }}
              >
                <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Status</option>
                {uniqueStatusy.map(status => (
                  <option key={status} value={status} style={{ fontFamily: 'Sora, sans-serif' }}>{status}</option>
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
        <div className="w-full overflow-x-auto overflow-y-scroll max-h-[calc(100dvh-280px)] relative" style={{ zIndex: 1 }}>
          <table className="w-full resizable-table" ref={resizeRef}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
                  <input type="checkbox" checked={allSelected} onChange={e => handleSelectAll(e.target.checked)} />
                </th>
                <th 
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                  onClick={() => handleSort('kod')}
                  style={{ width: '100px' }}
                >
                  Kod
                </th>
                <th 
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50 relative"
                  onClick={() => {
                    if (!wasResizing) {
                      handleSort('nazwa');
                    }
                  }}
                  style={{ width: `${columnWidths.nazwa}px` }}
                >
                  Nazwa
                  <div 
                    className={`absolute top-0 right-0 h-full cursor-col-resize hover:bg-blue-500 transition-opacity z-10 ${
                      isResizing === 'nazwa' ? 'bg-blue-500 opacity-100' : 'opacity-0 hover:opacity-100'
                    }`}
                    style={{ width: '2px' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleMouseDown(e, 'nazwa');
                    }}
                  />
                </th>
                <th 
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                  onClick={() => handleSort('sprzedawca')}
                  style={{ width: '120px' }}
                >
                  Sprzedawca
                </th>
                <th 
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                  onClick={() => handleSort('ilosc')}
                >
                  Ilość
                </th>
                <th 
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                  onClick={() => handleSort('typ')}
                >
                  Typ
                </th>
                <th 
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                  onClick={() => handleSort('objetosc')}
                >
                  Objętość
                </th>
                <th 
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50 leading-tight"
                  onClick={() => handleSort('cena')}
                  style={{ width: '90px' }}
                >
                  <div className="whitespace-normal">Cena<br/>fakturowa</div>
                </th>
                <th 
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50 leading-tight"
                  onClick={() => handleSort('koszt_wlasny')}
                  style={{ width: '90px' }}
                >
                  <div className="whitespace-normal">Koszt<br/>własny</div>
                </th>
                <th 
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50 leading-tight"
                  onClick={() => handleSort('cena_sprzedazy')}
                  style={{ width: '90px' }}
                >
                  <div className="whitespace-normal">Cena w<br/>sprzedaży</div>
                </th>
                <th 
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50 leading-tight"
                  onClick={() => handleSort('dataWaznosci')}
                  style={{ width: '90px' }}
                >
                  <div className="whitespace-normal">Data<br/>ważności</div>
                </th>
                <th 
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                  onClick={() => handleSort('sprzedaze')}
                >
                  Sprzedaże
                </th>
                <th 
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50 leading-tight"
                  onClick={() => handleSort('srednieZuzycie')}
                  style={{ width: '100px' }}
                >
                  <div className="whitespace-normal">Średnie<br/>zużycie/dzień</div>
                </th>
                <th 
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50 leading-tight"
                  onClick={() => handleSort('dniPozostalo')}
                  style={{ width: '80px' }}
                >
                  <div className="whitespace-normal">Dni<br/>pozostało</div>
                </th>
                <th 
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50 leading-tight"
                  onClick={() => handleSort('dataWyczerpania')}
                  style={{ width: '110px' }}
                >
                  <div className="whitespace-normal">Data wyczerpania<br/>zapasów</div>
                </th>
                <th 
                  className="px-8 py-4 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                  onClick={() => handleSort('status')}
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedInventory.map((item) => {
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={e => handleSelectOne(item.id, e.target.checked)}
                      />
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline" style={{ width: '100px' }}>
                      <div className="break-words leading-tight max-h-8 overflow-hidden">{item.kod}</div>
                    </td>
                    <td 
                      className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline"
                      style={{ width: `${columnWidths.nazwa}px` }}
                    >
                      <div className="break-words leading-tight max-h-12 overflow-hidden">{item.nazwa}</div>
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap" style={{ width: '120px' }}>
                      {item.sprzedawca || sprzedawcaCache.get(item.kod) || ''}
                    </td>
                    <td 
                      className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap cursor-pointer"
                      data-tooltip-id={`ilosc-tooltip-${item.kod}`}
                    >
                      {item.ilosc}
                      <Tooltip
                        id={`ilosc-tooltip-${item.kod}`}
                        className="max-w-md"
                        place="top"
                        positionStrategy="fixed"
                      >
                        <div className="font-sora">
                          <div className="mb-1">
                            <span className="font-medium">samples:</span>
                            <span className="text-gray-500 ml-2">{samplesCount[item.kod] || 0} szt</span>
                          </div>
                          {reservationsCount[item.kod] > 0 && (
                            <div className="mb-1">
                              <span className="font-medium">rezerwacja:</span>
                              <span className="text-gray-500 ml-2">{reservationsCount[item.kod]} szt</span>
                            </div>
                          )}
                        </div>
                      </Tooltip>
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
                          loadAllPriceHistory();
                        }
                      }}
                    >
                      {(() => {
                        // Берем цену из working_sheets (как было раньше)
                        return item.cena != null ? `${item.cena.toFixed(2)} €` : '-';
                      })()}
                      <Tooltip
                        id={`price-tooltip-${item.kod}`}
                        className="max-w-md"
                        place="top"
                      >
                        <div className="font-sora">
                          <div className="font-semibold mb-2">Historia cen:</div>
                          
                          {/* Данные из products */}
                          {priceHistory[item.kod] && priceHistory[item.kod].length > 0 ? (
                            priceHistory[item.kod].map((product, index) => (
                              <div key={index} className="mb-1">
                                <span className="font-medium">{product.cena != null ? `${product.cena.toFixed(2)} €` : 'N/A'}</span>
                                <span className="text-gray-500 ml-2">({product.ilosc_aktualna} szt.)</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-500">Brak danych</div>
                          )}
                        </div>
                      </Tooltip>
                    </td>
                    <td 
                      className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap cursor-pointer"
                      data-tooltip-id={`koszt-tooltip-${item.kod}`}
                    >
                      {item.koszt_wlasny != null ? `${item.koszt_wlasny.toFixed(2)} zł` : '-'}
                      <Tooltip
                        id={`koszt-tooltip-${item.kod}`}
                        className="max-w-md"
                        place="top"
                        positionStrategy="fixed"
                      >
                        <div className="font-sora">
                          <div className="mb-1">
                            <span className="font-medium">transport:</span>
                            <span className="text-gray-500 ml-2">{item.koszt_dostawy_per_unit != null ? `${item.koszt_dostawy_per_unit.toFixed(2)} zł` : '0,00 zł'}</span>
                          </div>
                          <div className="mb-1">
                            <span className="font-medium">akcyza:</span>
                            <span className="text-gray-500 ml-2">{item.podatek_akcyzowy != null ? `${item.podatek_akcyzowy.toFixed(2)} zł` : '0,00 zł'}</span>
                          </div>
                        </div>
                      </Tooltip>
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {item.cena_sprzedazy != null ? `${item.cena_sprzedazy.toFixed(2)} zł` : '-'}
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {formatDate(item.data_waznosci)}
                    </td>
                    <td className="px-8 py-4 text-center text-xs text-gray-600 font-sora leading-tight align-middle whitespace-nowrap">
                      {(() => {
                        // Группируем продажи по заявке (orderId) - каждая заявка отдельная строка
                        const sales = orderProducts.filter(p => p.kod === item.kod);
                        console.log(`Sales for ${item.kod}:`, sales.length);
                        
                        // Ключ: orderId, значение: {qty, klient, date}
                        const salesByOrder: {[key: number]: {qty: number, klient: string, date: string}} = {};
                        sales.forEach(sale => {
                          const order = orders.find(o => o.id === sale.orderId);
                          const klient = order ? order.klient : '';
                          
                          // Извлекаем дату из номера заказа или используем data_utworzenia как fallback
                          let date = '';
                          if (order && order.numer_zamowienia) {
                            date = extractDateFromOrderNumber(order.numer_zamowienia);
                          }
                          
                          // Если не удалось извлечь дату из номера, используем data_utworzenia
                          if (!date && order) {
                            date = new Date(order.data_utworzenia).toLocaleDateString('pl-PL');
                          }
                          
                          // Последний fallback - created_at из order_products
                          if (!date && sale.created_at) {
                            date = new Date(sale.created_at).toLocaleDateString('pl-PL');
                          }
                          
                          // Для каждой заявки отдельная запись
                          if (!salesByOrder[sale.orderId]) {
                            salesByOrder[sale.orderId] = { qty: 0, klient, date };
                          }
                          salesByOrder[sale.orderId].qty += sale.ilosc;
                        });
                        
                        const salesArray = Object.entries(salesByOrder)
                          .sort(([, a], [, b]) => {
                            // Сортируем по дате в убывающем порядке (новые слева)
                            const dateA = new Date(a.date.split('.').reverse().join('-'));
                            const dateB = new Date(b.date.split('.').reverse().join('-'));
                            return dateB.getTime() - dateA.getTime();
                          });
                        console.log(`Sales array for ${item.kod}:`, salesArray.length);
                        
                        if (salesArray.length === 0) {
                          return <div className="text-gray-400">-</div>;
                        }
                        
                        // Берем три последние заявки (уже отсортированы по дате в убывающем порядке)
                        const lastThreeSales = salesArray.slice(0, 3);
                        
                        return (
                          <div className="flex items-center justify-center">
                            <div className="relative cursor-pointer">
                              <ShoppingCart 
                                size={16} 
                                className="text-blue-300 hover:text-blue-400 transition-colors focus:outline-none"
                                data-tooltip-id={`sales-tooltip-${item.kod}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProductKod(item.kod);
                                  setIsSalesModalOpen(true);
                                }}
                                tabIndex={0}
                                onMouseDown={(e) => e.preventDefault()}
                              />
                              <Tooltip
                                id={`sales-tooltip-${item.kod}`}
                                className="max-w-md"
                                place="top"
                                positionStrategy="fixed"
                                noArrow={false}
                              >
                                <div className="font-sora">
                                  {lastThreeSales.map(([key, val]) => (
                                    <div key={key} className="mb-1">
                                      {val.date && val.klient ? (
                                        <div>
                                          {val.date.split('.').slice(0, 2).join('.')} | {val.klient}: <span className="text-gray-500">{val.qty}</span>
                                        </div>
                                      ) : (
                                        <div className="text-gray-500">Ilość: {val.qty}</div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </Tooltip>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {formatAverageConsumption(getDisplayAverage(item, orderProducts, productReceipts, averageSalesCache))}
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {getDisplayDaysLeft(item, orderProducts, productReceipts, averageSalesCache)}
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {getDisplayDepletionDate(item, orderProducts, productReceipts, averageSalesCache)}
                    </td>
                    <td className="px-8 py-4 text-left text-xs text-gray-600 font-sora leading-tight align-baseline whitespace-nowrap">
                      {(() => {
                        const statusText = getInventoryStatus(item, orderProducts, averageSalesCache);
                        const badgeColor = statusText === 'brak'
                          ? 'bg-gray-100 text-gray-600 border-gray-300'
                          : getStatusBadgeColor(getStatusDaysLeftForColor(item, orderProducts, averageSalesCache));
                        return (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-sora leading-tight border ${badgeColor}`}>
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

      {/* Модальное окно со списком заказов товара */}
      {(() => {
        // Вычисляем количество заказов для выбранного товара
        let ordersCount = 0;
        if (selectedProductKod) {
          const orderIdsWithProduct = new Set<number>();
          orderProducts.forEach(p => {
            if (p.kod === selectedProductKod) {
              orderIdsWithProduct.add(p.orderId);
            }
          });
          ordersCount = orders.filter(order => orderIdsWithProduct.has(order.id)).length;
        }
        
        // Вычисляем высоту модального окна на основе количества записей
        // Заголовок: ~40px, padding: 48px (24px сверху и снизу), заголовок таблицы: ~40px, каждая строка: ~40px
        // Минимум 7 строк должно быть видно
        const headerHeight = 40;
        const padding = 48;
        const tableHeaderHeight = 40;
        const rowHeight = 40;
        const minRows = 7;
        const minRowsHeight = minRows * rowHeight;
        const minHeight = ordersCount === 0 ? 150 : headerHeight + padding + tableHeaderHeight + (Math.max(ordersCount, minRows) * rowHeight) + 20;
        const calculatedHeight = Math.min(Math.max(minHeight, headerHeight + padding + tableHeaderHeight + minRowsHeight + 20), window.innerHeight * 0.9);
        
        return (
          <Modal
            isOpen={isSalesModalOpen}
            onRequestClose={() => {
              setIsSalesModalOpen(false);
              setSelectedProductKod(null);
            }}
            style={{
              content: {
                width: '400px',
                height: `${calculatedHeight}px`,
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
            contentLabel="Zamówienia"
          >
        <div className="font-sora h-full flex flex-col overflow-hidden">
          <div className="flex justify-between items-start mb-8 select-none">
            <h2 className="text-xs font-semibold text-gray-800 pr-4 break-words leading-tight">
              {selectedProductKod ? inventory.find(i => i.kod === selectedProductKod)?.nazwa || selectedProductKod : ''}
            </h2>
            <button
              onClick={() => {
                setIsSalesModalOpen(false);
                setSelectedProductKod(null);
                setSalesFilterClient('');
              }}
              className="text-red-500 focus:outline-none flex-shrink-0"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-3 flex-grow overflow-y-auto">
            {selectedProductKod && (() => {
              // Находим все orderId, где есть этот товар
              const orderIdsWithProduct = new Set<number>();
              orderProducts.forEach(p => {
                if (p.kod === selectedProductKod) {
                  orderIdsWithProduct.add(p.orderId);
                }
              });
              
              // Получаем все заказы из таблицы orders
              let productOrders = orders.filter(order => orderIdsWithProduct.has(order.id));
              
              // Фильтруем по клиенту, если указан фильтр
              if (salesFilterClient.trim()) {
                productOrders = productOrders.filter(order => 
                  order.klient === salesFilterClient
                );
              }
              
              // Для каждого заказа вычисляем общее количество этого товара
              const ordersWithQuantity = productOrders.map(order => {
                // Суммируем количество товара из всех order_products для этого заказа
                const totalQty = orderProducts
                  .filter(p => p.orderId === order.id && p.kod === selectedProductKod)
                  .reduce((sum, p) => sum + p.ilosc, 0);
                
                // Извлекаем дату из номера заказа или используем data_utworzenia
                let date = '';
                if (order.numer_zamowienia) {
                  date = extractDateFromOrderNumber(order.numer_zamowienia);
                }
                
                if (!date && order.data_utworzenia) {
                  date = new Date(order.data_utworzenia).toLocaleDateString('pl-PL');
                }
                
                return {
                  ...order,
                  date,
                  totalQty
                };
              });
              
              // Сортируем по дате в убывающем порядке (новые первые)
              const sortedOrders = ordersWithQuantity.sort((a, b) => {
                if (a.date && b.date) {
                  const dateA = new Date(a.date.split('.').reverse().join('-'));
                  const dateB = new Date(b.date.split('.').reverse().join('-'));
                  return dateB.getTime() - dateA.getTime();
                }
                return 0;
              });
              
              if (sortedOrders.length === 0) {
                return (
                  <p className="text-xs text-gray-500">Brak zamówień dla tego towaru</p>
                );
              }
              
              return (
                <div>
                  <table className="w-full">
                    <thead className="bg-purple-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Zamówienia
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Klient
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                          Ilość
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-0">
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {sortedOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-xs text-gray-900 font-medium">
                            {order.numer_zamowienia || '-'}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-900">
                            <div className="break-words leading-tight">
                              {order.klient || '-'}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-900 font-medium w-16 text-center">
                            {order.totalQty}
                          </td>
                          <td></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
          
          {/* Фильтр по клиенту внизу слева */}
          {selectedProductKod && (() => {
            // Получаем список уникальных клиентов для этого товара
            const orderIdsWithProduct = new Set<number>();
            orderProducts.forEach(p => {
              if (p.kod === selectedProductKod) {
                orderIdsWithProduct.add(p.orderId);
              }
            });
            
            const productOrdersClients = orders
              .filter(order => orderIdsWithProduct.has(order.id))
              .map(order => order.klient)
              .filter((klient, index, self) => klient && self.indexOf(klient) === index)
              .sort();
            
            return (
              <div className="mt-6 pt-4">
                <div className="flex items-center space-x-2">
                  <select
                    value={salesFilterClient}
                    onChange={(e) => setSalesFilterClient(e.target.value)}
                    className="block px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300 truncate"
                    style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', width: '145px', minWidth: '145px', maxWidth: '145px' }}
                  >
                    <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Klient</option>
                    {productOrdersClients.map((klient) => (
                      <option key={klient} value={klient} style={{ fontFamily: 'Sora, sans-serif' }}>
                        {klient}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })()}
        </div>
          </Modal>
        );
      })()}
    </div>
  );
};