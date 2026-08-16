import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, Plus, Minus, ArrowDownCircle } from 'lucide-react';
import { ProductSearch } from './components/ProductSearch';
import { OrderModal } from './components/OrderModal';
import { OrdersList } from './components/OrdersList';
import { InvoicesList } from './components/InvoicesList';
import { InvoiceModal } from './components/InvoiceModal';
import { ReservationsList } from './components/ReservationsList';
import toast, { Toaster } from 'react-hot-toast';
import Modal from 'react-modal';
import { Tooltip } from 'react-tooltip';
import logo from './assets/entr logo copy 2@4x.png';
import './index.css';
import { ClientModal } from './components/ClientModal';
import { ProductDetailsModal } from './components/ProductDetailsModal';
import { Product } from './types/Product';
import { ClientsList } from './components/ClientsList';
import { ClientSalesList } from './components/ClientSalesList';
import { EditClientModal } from './components/EditClientModal';
import { InventoryStatus } from './components/InventoryStatus';
import { ReturnModal } from './components/ReturnModal';
import { WriteOffModal } from './components/WriteOffModal';
import { PrzychodModal } from './components/PrzychodModal';
import { CreateReservationModal } from './components/CreateReservationModal';
import { KomisList } from './components/KomisList';
import { ZakupTowarowPage } from './pages/ZakupTowarowPage';

// Set the app element for react-modal
Modal.setAppElement('#root');

// Глобальные стили для тултипов (точно как в InventoryStatus, но без white-space: nowrap для многострочного контента)
const tooltipStyles = `
  .react-tooltip {
    z-index: 10000 !important;
    max-width: 400px !important;
  }
`;

// --- Работа только с backend через fetch ---

// Типы данных
interface Client {
  id: number;
  firma: string;
  nazwa: string;
  adres: string;
  czas_dostawy: string;
  kontakt: string;
}

interface ProductReceipt {
  id?: number;
  dataPrzyjecia: string;
  sprzedawca: string;
  wartosc: number;
  kosztDostawy: number;
  rabat?: number;
  waluta_faktury?: string;
  walutaFaktury?: string;
  kurs_faktury?: number;
  kursFaktury?: number;
  aktualnyKurs?: number;
  podatekAkcyzowy?: number;
  aktualny_kurs?: number;
  podatek_akcyzowy?: number;
  products: Array<{
    kod: string;
    nazwa: string;
    kod_kreskowy?: string;
    ilosc: number;
    cena: number;
    dataWaznosci?: string;
    typ?: string;
    objetosc?: number;
  }>;
  productInvoice?: string;
  transportInvoice?: string;
}

interface SheetData {
  fileName: string;
  data: {
    headers: string[];
    rows: string[][];
  };
}

// Removed unused DbSheet interface

interface AppState {
  sheetsData: SheetData[];
  sheets: SheetData[];
  activeSheet: SheetData | null;
  showTable: boolean;
  clients: Client[];
  products: Product[];
  productReceipts: ProductReceipt[];
  activeTab: 'inventory' | 'clients' | 'orders' | 'inventoryStatus';
  activeSubTab: 'przyjecie' | 'analiza' | 'kalendarz' | 'wydanie' | 'rezerwacje' | 'analiza_towarow' | 'faktury' | 'komis' | 'baza_klientow' | 'sprzedaz_klientom' | null;
  isDbInitialized: boolean;
}

// В продакшене используем относительные пути, в разработке - localhost
const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

const ZAKUP_PATH = '/zakup';
const PRE_ZAKUP_TAB_KEY = 'preZakupTab';

const isZakupPath = (pathname: string) =>
  pathname === ZAKUP_PATH || pathname.startsWith(`${ZAKUP_PATH}/`);

const getDefaultSubTab = (tab: AppState['activeTab']): AppState['activeSubTab'] => {
  if (tab === 'orders') return 'wydanie';
  if (tab === 'clients') return 'baza_klientow';
  if (tab === 'inventory') return 'przyjecie';
  return null;
};

console.log('API_URL configured as:', API_URL);

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isCreateReservationModalOpen, setIsCreateReservationModalOpen] = useState(false);
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [tabOrder, setTabOrder] = useState<string[]>(['inventory', 'clients', 'orders', 'inventoryStatus']);
  const [appState, setAppState] = useState<AppState>(() => {
    const pathname = window.location.pathname;
    const onZakupPath = isZakupPath(pathname);

    // Загружаем сохранённую вкладку из localStorage
    const savedActiveTab = localStorage.getItem('activeTab') || 'inventory';
    const savedActiveSubTab = localStorage.getItem('activeSubTab');
    
    // Валидация и приведение типов
    const validTabs = ['inventory', 'clients', 'orders', 'inventoryStatus'] as const;
    const validSubTabs = ['przyjecie', 'analiza', 'kalendarz', 'wydanie', 'rezerwacje', 'analiza_towarow', 'faktury', 'komis', 'baza_klientow', 'sprzedaz_klientom'] as const;

    let activeTab: AppState['activeTab'];
    if (onZakupPath) {
      activeTab = 'inventory';
    } else {
      activeTab = (validTabs.includes(savedActiveTab as typeof validTabs[number])
        ? savedActiveTab
        : 'inventory') as AppState['activeTab'];
    }
    
    const defaultSubTab = getDefaultSubTab(activeTab);
    
    const savedSubTabValid =
      savedActiveSubTab &&
      validSubTabs.includes(savedActiveSubTab as typeof validSubTabs[number]) &&
      ((activeTab === 'inventory' && ['przyjecie', 'analiza', 'kalendarz'].includes(savedActiveSubTab)) ||
        (activeTab === 'orders' && ['wydanie', 'rezerwacje', 'analiza_towarow', 'faktury', 'komis'].includes(savedActiveSubTab)) ||
        (activeTab === 'clients' && ['baza_klientow', 'sprzedaz_klientom'].includes(savedActiveSubTab)));
    
    const activeSubTab = (savedSubTabValid
      ? savedActiveSubTab 
      : defaultSubTab) as AppState['activeSubTab'];
    
    return {
    sheetsData: [],
    sheets: [],
    activeSheet: null,
    showTable: false,
    clients: [],
    products: [],
    productReceipts: [],
      activeTab: activeTab,
      activeSubTab: activeSubTab,
    isDbInitialized: false
    };
  });
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showWriteOffModal, setShowWriteOffModal] = useState(false);
  const [showPrzychodModal, setShowPrzychodModal] = useState(false);
  const [isProductDetailsOpen, setIsProductDetailsOpen] = useState(false);
  const [isEditClientModalOpen, setIsEditClientModalOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null);
  const [ordersRefreshTrigger, setOrdersRefreshTrigger] = useState(0);
  const [clientsRefreshTrigger, setClientsRefreshTrigger] = useState(0);
  const [reservationsRefreshTrigger, setReservationsRefreshTrigger] = useState(0);
  const [invoicesRefreshTrigger, setInvoicesRefreshTrigger] = useState(0);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [analysisProducts, setAnalysisProducts] = useState<any[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [lastUpdatedClientId, setLastUpdatedClientId] = useState<number | null>(null);

  useEffect(() => {
    if (isZakupPath(location.pathname)) {
      if (appState.activeTab !== 'inventory') {
        const savedActiveSubTab = localStorage.getItem('activeSubTab');
        const validInventorySubTabs = ['przyjecie', 'analiza', 'kalendarz'] as const;
        const activeSubTab = (
          savedActiveSubTab &&
          validInventorySubTabs.includes(savedActiveSubTab as typeof validInventorySubTabs[number])
            ? savedActiveSubTab
            : 'przyjecie'
        ) as AppState['activeSubTab'];

        localStorage.setItem('activeTab', 'inventory');
        setAppState(prev => ({
          ...prev,
          activeTab: 'inventory',
          activeSubTab,
        }));
      }
      return;
    }

    if (appState.activeTab !== 'inventory') return;

    const restoreTab = sessionStorage.getItem(PRE_ZAKUP_TAB_KEY);
    if (!restoreTab) return;

    const activeSubTab = getDefaultSubTab(restoreTab as AppState['activeTab']);

    localStorage.setItem('activeTab', restoreTab);
    if (activeSubTab) {
      localStorage.setItem('activeSubTab', activeSubTab);
    }

    setAppState(prev => ({
      ...prev,
      activeTab: restoreTab as AppState['activeTab'],
      activeSubTab,
    }));
  }, [location.pathname]);

  useEffect(() => {
    if (isZakupPath(location.pathname)) return;

    const savedActiveTab = localStorage.getItem('activeTab') || 'inventory';
    if (savedActiveTab === 'inventory') {
      navigate(ZAKUP_PATH, { replace: true });
    }
  }, [location.pathname, navigate]);

  // Загружаем данные из IndexedDB при инициализации
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('🚀 Starting data loading process...');
        console.log('🔧 API_URL:', API_URL);
        
        // Load clients
        console.log('👥 Loading clients...');
        const clients = await loadClientsFromDb();
        console.log('✅ Clients loaded:', clients.length);

        // Load products
        console.log('📦 Loading products...');
        const products = await loadProductsFromDb();
        console.log('✅ Products loaded:', products.length);

        // Load product receipts
        console.log('🧾 Loading product receipts...');
        const productReceipts = await loadProductReceiptsFromDb();
        console.log('✅ Product receipts loaded:', productReceipts.length);

        console.log('🔄 Updating app state with loaded data...');
        console.log('📋 Setting clients:', clients);
        setAppState(prev => {
          const newState = {
            ...prev,
            clients,
            products,
            productReceipts
          };
          console.log('🔄 New app state:', newState);
          return newState;
        });
        
        console.log('✅ App state updated successfully');
        console.log('📊 Final data counts:');
        console.log('   - Clients:', clients.length);
        console.log('   - Products:', products.length);
        console.log('   - Product Receipts:', productReceipts.length);
      } catch (error) {
        console.error('❌ Error loading data:', error);
        toast.error('Błąd podczas ładowania danych');
      } finally {
        console.log('🏁 Data loading process completed');
      }
    };

    loadData();
  }, []);

  // Добавляем стили для тултипов
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = tooltipStyles;
    document.head.appendChild(style);
    
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  // Сохраняем данные в IndexedDB и localStorage при изменении
  useEffect(() => {
    // Пропускаем сохранение, если база данных еще не инициализирована
    if (!appState.isDbInitialized) return;
    
    console.log('💾 useEffect triggered - clients changed:', appState.clients.length);
    
    const saveData = async () => {
      // Создаем объект для сохранения в localStorage
      const stateToSave = {
        sheets: appState.sheets,
        sheetsData: appState.sheetsData,
        activeSheet: appState.activeSheet,
        showTable: appState.showTable,
        clients: appState.clients,
        products: appState.products,
        productReceipts: appState.productReceipts
      };
      
      // Сохраняем в localStorage для обратной совместимости
      try {
        localStorage.setItem('appState', JSON.stringify(stateToSave));
        console.log('App state saved to localStorage');
      } catch (error) {
        console.error('Error saving state to localStorage:', error);
      }
    };
    
    saveData();
  }, [appState.sheetsData, appState.sheets, appState.activeSheet, appState.showTable, appState.clients, appState.products, appState.productReceipts]);

  // Загружаем данные из базы при инициализации
  const loadSheetsFromDb = async () => {
    try {
      console.log('🔍 Loading sheets from database...');
      console.log('📡 Making request to:', `${API_URL}/api/original-sheets`);
      
      const sheetsResponse = await fetch(`${API_URL}/api/original-sheets`);
      console.log('📡 Sheets response status:', sheetsResponse.status);
      
      if (!sheetsResponse.ok) {
        throw new Error(`HTTP error! status: ${sheetsResponse.status}`);
      }
      
      const sheets = await sheetsResponse.json();
      console.log('✅ Received sheets from server:', sheets);
      console.log('📊 Sheets count:', sheets.length);

      // Преобразуем данные в нужный формат
      const processedSheets: SheetData[] = sheets.map((sheet: any) => ({
        fileName: sheet.fileName,
        data: {
          headers: sheet.data.headers,
          rows: sheet.data.rows
        }
      }));

      console.log('🔄 Processed sheets:', processedSheets);
      console.log('📊 Processed sheets count:', processedSheets.length);

      setAppState(prev => ({
        ...prev,
        sheets: processedSheets,
        sheetsData: processedSheets,
        activeSheet: null,
        showTable: false,
        isDbInitialized: true
      }));
      
      console.log('✅ App state updated with sheets data');
    } catch (error) {
      console.error('❌ Ошибка загрузки файлов из базы:', error);
      toast.error('Ошибка загрузки файлов из базы');
    } finally {
      console.log('🏁 Loading sheets completed');
    }
  };

  useEffect(() => {
    loadSheetsFromDb();
  }, []);

  const handleDragStart = (tab: string) => {
    setDraggedTab(tab);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetTab: string) => {
    if (!draggedTab || draggedTab === targetTab) return;

    setTabOrder(prev => {
      const newOrder = [...prev];
      const draggedIndex = newOrder.indexOf(draggedTab);
      const targetIndex = newOrder.indexOf(targetTab);
      
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedTab);
      
      return newOrder;
    });
    setDraggedTab(null);
  };

  const setActiveTab = (tab: string) => {
    if (tab === 'inventory' || tab === 'clients' || tab === 'orders' || tab === 'inventoryStatus') {
      const newSubTab = getDefaultSubTab(tab as AppState['activeTab']);
      
      // Сохраняем в localStorage
      localStorage.setItem('activeTab', tab);
      if (newSubTab) {
        localStorage.setItem('activeSubTab', newSubTab);
      }

      if (tab === 'inventory') {
        if (appState.activeTab !== 'inventory') {
          sessionStorage.setItem(PRE_ZAKUP_TAB_KEY, appState.activeTab);
        }
        navigate(ZAKUP_PATH);
      } else {
        navigate('/');
      }
      
      setAppState(prev => ({ 
        ...prev, 
        activeTab: tab as AppState['activeTab'],
        activeSubTab: newSubTab
      }));
    }
  };

  const setActiveSubTab = (subTab: 'przyjecie' | 'analiza' | 'kalendarz' | 'wydanie' | 'rezerwacje' | 'analiza_towarow' | 'faktury' | 'komis' | 'baza_klientow' | 'sprzedaz_klientom') => {
    // Сохраняем в localStorage
    localStorage.setItem('activeSubTab', subTab);
    
    setAppState(prev => ({ ...prev, activeSubTab: subTab }));
  };

  // Подгружаем данные для анализа товаров при переходе на вкладку
  useEffect(() => {
    if (appState.activeSubTab === 'analiza_towarow') {
      loadAnalysisProducts();
    }
  }, [appState.activeSubTab, reservationsRefreshTrigger]);

  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'inventory': return 'Zakup towarów';
      case 'clients': return 'Klienci';
      case 'orders': return 'Sprzedaż towarów';
      case 'inventoryStatus': return 'Stany magazynowe';
      default: return tab;
    }
  };


  const handleAddClient = async (clientData: { 
    firma: string; 
    nazwa: string; 
    adres: string; 
    czas_dostawy: string; 
    kontakt: string 
  }) => {
    try {
      const response = await fetch(`${API_URL}/api/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(clientData)
      });

      if (!response.ok) {
        throw new Error('Failed to add client');
      }

      const result = await response.json();
      const newClient = { ...clientData, id: result.id };

            setAppState(prev => ({
        ...prev,
        clients: [...prev.clients, newClient]
      }));
      
      // Увеличиваем триггер для принудительного обновления ClientsList
      setClientsRefreshTrigger(prev => prev + 1);
      
      toast.success('Klient został dodany');
    } catch (error) {
      console.error('Error adding client:', error);
      toast.error('Błąd podczas dodawania klienta');
    }
  };

  const handleDeleteClient = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/api/clients/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete client');
      }

            setAppState(prev => ({
        ...prev,
        clients: prev.clients.filter(client => client.id !== id)
      }));
      
      // Увеличиваем триггер для принудительного обновления ClientsList
      setClientsRefreshTrigger(prev => prev + 1);
      
      toast.success('Klient został usunięty');
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error('Błąd podczas usuwania klienta');
    }
  };

  const handleUpdateClient = async (data: {
    id: number;
    firma: string;
    nazwa: string;
    adres: string;
    czas_dostawy: string;
    kontakt: string;
  }) => {
    try {
      console.log('🔍 handleUpdateClient called with data:', data);
      
      const response = await fetch(`${API_URL}/api/clients/${data.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error('Failed to update client');
      }

      const updatedClient = await response.json();
      console.log('✅ Client updated in database:', updatedClient);
      console.log('✅ Updated client fields:', {
        id: updatedClient.id,
        firma: updatedClient.firma,
        nazwa: updatedClient.nazwa,
        adres: updatedClient.adres,
        czas_dostawy: updatedClient.czas_dostawy,
        kontakt: updatedClient.kontakt
      });

      setAppState(prev => {
        console.log('🔄 Updating app state...');
        console.log('📋 Previous clients:', prev.clients);
        console.log('📋 Updated client data:', updatedClient);
        
        // Сохраняем исходный порядок клиентов, обновляя только нужного
        const newClients = prev.clients.map(client => {
          if (client.id === data.id) {
            console.log('🔄 Updating client:', client.id, 'from:', client, 'to:', { ...client, ...updatedClient });
            // Создаем полностью новый объект клиента
            return {
              id: client.id,
              firma: updatedClient.firma || client.firma,
              nazwa: updatedClient.nazwa || client.nazwa,
              adres: updatedClient.adres || client.adres,
              czas_dostawy: updatedClient.czas_dostawy || client.czas_dostawy,
              kontakt: updatedClient.kontakt || client.kontakt
            };
          }
          return { ...client }; // Создаем копию каждого клиента
        });
        
        console.log('📋 New clients array:', newClients);
        
        const newState = {
          ...prev,
          clients: newClients
        };
        
        console.log('🔄 New app state:', newState);
        return newState;
      });

      toast.success('Klient został zaktualizowany');
      
      // Принудительно обновляем состояние через setTimeout
      setTimeout(() => {
        setAppState(prev => {
          console.log('🔄 Force update after timeout');
          return { ...prev };
        });
        // Увеличиваем триггер для принудительного обновления ClientsList
        setClientsRefreshTrigger(prev => prev + 1);
        
        // Принудительно перезагружаем клиентов из базы данных
        setLastUpdatedClientId(data.id);
        loadClientsFromDb().then(freshClients => {
          setAppState(prev => ({
            ...prev,
            clients: freshClients
          }));
          setClientsRefreshTrigger(prev => prev + 1);
        });
      }, 100);
    } catch (error) {
      console.error('Error updating client:', error);
      toast.error('Błąd podczas aktualizacji klienta');
    }
  };

  // Загрузка товаров из активных резерваций для анализа
  const loadAnalysisProducts = async () => {
    try {
      setAnalysisLoading(true);
      setAnalysisError(null);
      const response = await fetch(`${API_URL}/api/reservations/active-products`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      console.log('📊 Active reservation products loaded:', data.length);
      setAnalysisProducts(data);
    } catch (err: any) {
      console.error('❌ Error loading analysis products:', err);
      setAnalysisError(err.message || 'Błąd ładowania danych');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleUpdateOrder = async (data: {
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
    console.log('=== HANDLE UPDATE ORDER DEBUG ===');
    console.log('Received data:', data);
    console.log('Products data:', JSON.stringify(data.products, null, 2));
    
    try {
      const response = await fetch(`${API_URL}/api/orders/${data.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error('Failed to update order');
      }

      const result = await response.json();
      console.log('Updated order result:', result);

      toast.success('Zamówienie zostało zaktualizowane');
      
      // Обновляем refreshTrigger для перезагрузки списка заказов
      setOrdersRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Błąd podczas aktualizacji zamówienia');
    }
  };

  const loadClientsFromDb = async (): Promise<Client[]> => {
    try {
      console.log('🔍 Loading clients from:', `${API_URL}/api/clients`);
      const response = await fetch(`${API_URL}/api/clients`);
      console.log('📡 Clients response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Loaded clients:', data.length, 'records');
      console.log('📋 First client:', data[0]);
      return data;
    } catch (error) {
      console.error('❌ Error loading clients:', error);
      return [];
    }
  };

  const loadProductsFromDb = async (): Promise<Product[]> => {
    try {
      console.log('🔍 Loading products from:', `${API_URL}/api/products`);
      const response = await fetch(`${API_URL}/api/products`);
      console.log('📡 Products response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Loaded products:', data.length, 'records');
      console.log('📋 First product:', data[0]);
      
      // Приводим к полному типу Product
      const processedData = data.map((item: any) => ({
        kod: item.kod,
        nazwa: item.nazwa,
        ilosc: item.ilosc,
        jednostka_miary: item.jednostka_miary || '',
        kod_kreskowy: item.kod_kreskowy || '',
        data_waznosci: item.data_waznosci ?? undefined,
        archiwalny: item.archiwalny,
        rezerwacje: item.rezerwacje,
        ilosc_na_poleceniach: item.ilosc_na_poleceniach,
        waga_netto: item.waga_netto,
        waga_brutto: item.waga_brutto,
        objetosc: item.objetosc,
        opis: item.opis
      }));
      
      console.log('🔄 Processed products:', processedData.length, 'records');
      return processedData;
    } catch (error) {
      console.error('❌ Error loading products:', error);
      return [];
    }
  };

  const loadProductReceiptsFromDb = async (): Promise<ProductReceipt[]> => {
    try {
      console.log('🔍 Loading product receipts from:', `${API_URL}/api/product-receipts`);
      const response = await fetch(`${API_URL}/api/product-receipts`);
      console.log('📡 Product receipts response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Loaded product receipts:', data.length, 'records');
      
      // Данные уже обработаны на backend, просто возвращаем их
      return data.map((receipt: any) => ({
        id: receipt.id,
        dataPrzyjecia: receipt.dataPrzyjecia,
        sprzedawca: receipt.sprzedawca || '',
        wartosc: receipt.wartosc || 0,
        kosztDostawy: receipt.kosztDostawy || 0,
        rabat: receipt.rabat ?? 0,
        waluta_faktury: receipt.waluta_faktury ?? 'EUR',
        walutaFaktury: receipt.waluta_faktury ?? receipt.walutaFaktury ?? 'EUR',
        kurs_faktury: receipt.kurs_faktury ?? 1,
        kursFaktury: receipt.kurs_faktury ?? receipt.kursFaktury ?? 1,
        aktualny_kurs: receipt.aktualny_kurs,
        podatek_akcyzowy: receipt.podatek_akcyzowy,
        aktualnyKurs: receipt.aktualnyKurs,
        podatekAkcyzowy: receipt.podatekAkcyzowy,
        products: receipt.products || [],
        productInvoice: receipt.productInvoice,
        transportInvoice: receipt.transportInvoice
      }));
    } catch (error) {
      console.error('❌ Error loading product receipts:', error);
      return [];
    }
  };

  const handleProductSearch = async (query: string) => {
    try {
      console.log('🔍 Searching working_sheets with query:', query);
      console.log('📡 Making request to:', `${API_URL}/api/working-sheets/search?query=${encodeURIComponent(query)}`);
      
      const response = await fetch(`${API_URL}/api/working-sheets/search?query=${encodeURIComponent(query)}`);
      console.log('📡 Search response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Search results:', data.length, 'items found');
      
      // Преобразуем данные из working_sheets в формат Product для ProductSearch
      const transformedData = data.map((item: any) => ({
        kod: item.kod,
        nazwa: item.nazwa,
        ilosc: item.ilosc.toString(),
        kodKreskowy: item.kod_kreskowy || ''
      }));
      
      return transformedData;
    } catch (error) {
      console.error('❌ Error searching working_sheets:', error);
      return [];
    }
  };

  const handleOrderCreated = () => {
    setOrdersRefreshTrigger(prev => prev + 1);
  };

  const handleReturnCreated = () => {
    setOrdersRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-white">
      <Toaster position="top-right" containerStyle={{ zIndex: 99999 }} />
      
      <ProductDetailsModal
        isOpen={isProductDetailsOpen}
        onClose={() => setIsProductDetailsOpen(false)}
        product={null}
      />

      <ClientModal
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        onAdd={handleAddClient}
      />

      <EditClientModal
        isOpen={isEditClientModalOpen}
        onClose={() => {
          setIsEditClientModalOpen(false);
          setClientToEdit(null);
        }}
        onSubmit={handleUpdateClient}
        client={clientToEdit}
      />

      <OrderModal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        onOrderCreated={handleOrderCreated}
      />
      
      <ReturnModal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        onSubmit={handleReturnCreated}
      />

      <WriteOffModal
        isOpen={showWriteOffModal}
        onClose={() => setShowWriteOffModal(false)}
        onSubmit={() => {
          setShowWriteOffModal(false);
          setOrdersRefreshTrigger(prev => prev + 1);
        }}
      />

      <PrzychodModal
        isOpen={showPrzychodModal}
        onClose={() => setShowPrzychodModal(false)}
        onSubmit={() => {
          setShowPrzychodModal(false);
          setOrdersRefreshTrigger(prev => prev + 1);
        }}
      />

      <CreateReservationModal
        isOpen={isCreateReservationModalOpen}
        onClose={() => setIsCreateReservationModalOpen(false)}
        onReservationCreated={() => {
          setReservationsRefreshTrigger(prev => prev + 1);
          setIsCreateReservationModalOpen(false);
        }}
        apiUrl={API_URL}
      />

      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onSuccess={() => {
          setInvoicesRefreshTrigger(prev => prev + 1);
          setIsInvoiceModalOpen(false);
        }}
      />
      
      <div className="bg-white border-b border-gray-200">
        <div className="w-full px-4 py-3">
          <img
            src={logo}
            alt="Enoterra Logo"
            className="h-32"
          />
        </div>
      </div>

      <div className="bg-gray-100 border-b border-gray-200">
        <div className="w-full px-4">
          <div className="flex items-center h-14">
            <div className="flex space-x-4">
              {tabOrder.map((tab) => (
                <div 
                  key={tab}
                  draggable
                  onDragStart={() => handleDragStart(tab)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(tab)}
                  className={`relative -mb-px cursor-pointer ${
                    appState.activeTab === tab 
                      ? 'border-2 border-blue-500 rounded-none' 
                      : 'rounded-t-lg'
                  } px-6 py-4 transition-colors ${
                    draggedTab === tab ? 'opacity-50' : ''
                  }`}
                  onClick={() => setActiveTab(tab)}
                >
                  <h1 className="text-sm font-medium text-black font-sora">
                    {getTabTitle(tab)}
                  </h1>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white min-h-screen">
        <div className="w-full px-4 py-6">
          <div className="flex items-start -mt-2">
            {appState.activeTab === 'inventory' && (
              <ZakupTowarowPage
                activeSubTab={appState.activeSubTab}
                setActiveSubTab={setActiveSubTab as (tab: 'przyjecie' | 'analiza' | 'kalendarz') => void}
                productReceipts={appState.productReceipts}
                onReceiptsChange={(receipts) => setAppState(prev => ({ ...prev, productReceipts: receipts }))}
                onProductsChange={(products) => setAppState(prev => ({ ...prev, products }))}
                sheets={appState.sheets}
                showTable={appState.showTable}
                activeSheet={appState.activeSheet}
                onSheetsChange={loadSheetsFromDb}
              />
            )}
            {appState.activeTab === 'clients' && (
              <div className="flex flex-col gap-4 mt-4 w-full relative">
                <div className="flex">
                  <button
                    onClick={() => setActiveSubTab('baza_klientow')}
                    className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
                      appState.activeSubTab === 'baza_klientow'
                        ? 'text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Baza klientów
                  </button>
                  <button
                    onClick={() => setActiveSubTab('sprzedaz_klientom')}
                    className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
                      appState.activeSubTab === 'sprzedaz_klientom'
                        ? 'text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Sprzedaż klientom
                  </button>
                </div>

                {appState.activeSubTab === 'baza_klientow' && (
                  <div className="flex flex-col gap-4 mt-6">
                    <div className="flex items-center gap-4">
                      <div 
                        className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit" 
                        onClick={() => setIsClientModalOpen(true)}
                      >
                        <button
                          type="button"
                          className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white"
                          title="Dodaj"
                        >
                          <Plus size={16} />
                        </button>
                        <div className="px-2">
                          <span className="text-gray-900 font-sora text-[13px]">Dodaj klienta</span>
                        </div>
                      </div>
                    </div>
                    <ClientsList 
                      key={`clients-${clientsRefreshTrigger}-${lastUpdatedClientId || 'none'}`}
                      clients={appState.clients}
                      onDelete={handleDeleteClient}
                      onUpdate={handleUpdateClient}
                    />
                  </div>
                )}

                {appState.activeSubTab === 'sprzedaz_klientom' && (
                  <div className="flex flex-col gap-4 mt-6">
                    <ClientSalesList refreshTrigger={invoicesRefreshTrigger} />
                  </div>
                )}
              </div>
            )}
            {appState.activeTab === 'orders' && (
              <div className="flex flex-col gap-4 mt-4 w-full relative">
                {/* Подвкладки */}
                <div className="flex">
                  <button
                    onClick={() => setActiveSubTab('wydanie')}
                    className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
                      appState.activeSubTab === 'wydanie'
                        ? 'text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Wydanie towarów
                  </button>
                  <button
                    onClick={() => setActiveSubTab('rezerwacje')}
                    className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
                      appState.activeSubTab === 'rezerwacje'
                        ? 'text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Rezerwacje
                  </button>
                  <button
                    onClick={() => setActiveSubTab('analiza_towarow')}
                    className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
                      appState.activeSubTab === 'analiza_towarow'
                        ? 'text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Analiza towarów
                  </button>
                  <button
                    onClick={() => setActiveSubTab('faktury')}
                    className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
                      appState.activeSubTab === 'faktury'
                        ? 'text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Faktury
                  </button>
                  <button
                    onClick={() => setActiveSubTab('komis')}
                    className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
                      appState.activeSubTab === 'komis'
                        ? 'text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Komis
                  </button>
                </div>

                {/* Контент для подвкладки "Wydanie towarów" */}
                {appState.activeSubTab === 'wydanie' && (
                  <div className="flex flex-col gap-4 mt-6">
                    <div className="mb-4">
                      <div className="w-full">
                        <ProductSearch onSearch={handleProductSearch} />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                      <div 
                        className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit" 
                        onClick={() => setShowOrderModal(true)}
                      >
                        <button
                          type="button"
                          className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white"
                          title="Dodaj"
                        >
                          <Plus size={16} />
                        </button>
                        <div className="px-2">
                          <span className="text-gray-900 font-sora text-[13px]">Dodaj zamowienie</span>
                        </div>
                      </div>
                      
                      <div 
                        className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit" 
                        onClick={() => setShowReturnModal(true)}
                      >
                        <button
                          type="button"
                          className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white"
                          title="Zwrot"
                        >
                          <X size={16} />
                        </button>
                        <div className="px-2">
                          <span className="text-gray-900 font-sora text-[13px]">Zwrot towaru</span>
                        </div>
                      </div>
                      
                      <div 
                        className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit" 
                        onClick={() => setShowWriteOffModal(true)}
                      >
                        <button
                          type="button"
                          className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white"
                          title="Rozchód"
                        >
                          <Minus size={16} />
                        </button>
                        <div className="px-2">
                          <span className="text-gray-900 font-sora text-[13px]">Rozchód towaru</span>
                        </div>
                      </div>
                      
                      <div 
                        className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit" 
                        onClick={() => setShowPrzychodModal(true)}
                      >
                        <button
                          type="button"
                          className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center text-white"
                          title="Przychód"
                        >
                          <ArrowDownCircle size={16} />
                        </button>
                        <div className="px-2">
                          <span className="text-gray-900 font-sora text-[13px]">Przychód towaru</span>
                        </div>
                      </div>
                    </div>
                    <OrdersList 
                      onDeleteOrder={(orderId) => {
                        console.log('Delete order:', orderId);
                        // Удаление обрабатывается внутри OrdersList
                      }}
                      onUpdateOrder={handleUpdateOrder}
                      onInvoiceCreated={() => setInvoicesRefreshTrigger((t) => t + 1)}
                      refreshTrigger={ordersRefreshTrigger}
                    />
                  </div>
                )}

                {/* Контент для подвкладки "Rezerwacje" */}
                {appState.activeSubTab === 'rezerwacje' && (
                  <div className="flex flex-col gap-4 mt-4 w-full">
                    <div className="flex items-center gap-4">
                      <div 
                        className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit" 
                        onClick={() => setIsCreateReservationModalOpen(true)}
                      >
                        <button
                          type="button"
                          className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white"
                          title="Dodaj"
                        >
                          <Plus size={16} />
                        </button>
                        <div className="px-2">
                          <span className="text-gray-900 font-sora text-[13px]">Dodaj rezerwację</span>
                        </div>
                      </div>
                    </div>
                    <ReservationsList refreshTrigger={reservationsRefreshTrigger} />
                  </div>
                )}

                {/* Контент для подвкладки "Analiza towarów" */}
                {appState.activeSubTab === 'analiza_towarow' && (
                  <div className="space-y-4 mt-6">
                    {analysisLoading && (
                      <div className="text-gray-600 font-sora text-sm">Ładowanie danych...</div>
                    )}

                    {analysisError && (
                      <div className="text-red-600 font-sora text-sm">{analysisError}</div>
                    )}

                    {!analysisLoading && !analysisError && (
                      <div className="w-full overflow-y-scroll max-h-[calc(100dvh-280px)] relative">
                        <table className="w-full">
                          <thead className="sticky top-0 z-10">
                            <tr>
                              <th className="px-0 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
                                Kod
                              </th>
                              <th className="px-10 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
                                Nazwa
                              </th>
                              <th className="px-0 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
                                Pozostało
                              </th>
                              <th className="px-0 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
                                Wydane
                              </th>
                              <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
                                Zarezerwowane
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {analysisProducts.filter(p => {
                              const ilosc = p.ilosc ?? 0;
                              const iloscWydane = p.ilosc_wydane ?? 0;
                              return (ilosc - iloscWydane) > 0;
                            }).length > 0 ? (
                              analysisProducts.filter(p => {
                                const ilosc = p.ilosc ?? 0;
                                const iloscWydane = p.ilosc_wydane ?? 0;
                                return (ilosc - iloscWydane) > 0;
                              }).map((p, idx) => {
                                const ilosc = p.ilosc ?? 0;
                                const iloscWydane = p.ilosc_wydane ?? 0;
                                const pozostalo = ilosc - iloscWydane;
                                const kod = p.product_kod ?? '—';
                                const nazwa = p.product_nazwa ?? '—';
                                const klienci = p.klienci || [];
                                return (
                                  <tr key={`${p.product_kod}-${idx}`} className="hover:bg-gray-50">
                                    <td className="px-0 py-4 whitespace-nowrap text-sm text-gray-900 font-sora">
                                      {kod}
                                    </td>
                                    <td className="px-10 py-4 whitespace-nowrap text-sm text-gray-900 font-sora">
                                      {nazwa}
                                    </td>
                                    <td className="px-0 py-4 whitespace-nowrap text-sm text-gray-900 font-sora text-center">
                                      <span className={pozostalo > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>
                                        {pozostalo}
                                      </span>
                                    </td>
                                    <td 
                                      className="px-0 py-4 whitespace-nowrap text-sm text-gray-900 font-sora text-center text-red-600 cursor-pointer"
                                      data-tooltip-id={`wydane-tooltip-${p.product_kod}-${idx}`}
                                    >
                                      {iloscWydane}
                                      {iloscWydane > 0 && (
                                        <Tooltip
                                          id={`wydane-tooltip-${p.product_kod}-${idx}`}
                                          className="max-w-md"
                                          place="top"
                                          positionStrategy="fixed"
                                          noArrow={true}
                                        >
                                          <div className="font-sora">
                                            {p.zamowienia_z_iloscia && p.zamowienia_z_iloscia.length > 0 ? (
                                              p.zamowienia_z_iloscia.map((zam: any, zIdx: number) => (
                                                <div key={zIdx} className={zIdx === 0 ? '' : 'mt-0.5'}>
                                                  <span className="font-medium">{zam.numer_zamowienia}</span>
                                                  <span className="text-gray-500 ml-2">{zam.ilosc} szt</span>
                                                </div>
                                              ))
                                            ) : (
                                              <div>Brak danych o zamówieniach</div>
                                            )}
                                          </div>
                                        </Tooltip>
                                      )}
                                    </td>
                                    <td 
                                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-sora text-center cursor-pointer"
                                      data-tooltip-id={`zarezerwowane-tooltip-${p.product_kod}-${idx}`}
                                    >
                                      {ilosc}
                                      {klienci.length > 0 && (
                                        <Tooltip
                                          id={`zarezerwowane-tooltip-${p.product_kod}-${idx}`}
                                          className="max-w-md"
                                          place="top"
                                          positionStrategy="fixed"
                                          noArrow={true}
                                        >
                                          <div className="font-sora">
                                            {klienci.map((klient: any, rIdx: number) => (
                                              <div key={rIdx} className={rIdx === 0 ? '' : 'mt-0.5'}>
                                                <span className="font-medium">{klient.klient || '—'}</span>
                                                <span className="text-gray-500 ml-2">{klient.ilosc ?? 0} szt</span>
                                              </div>
                                            ))}
                                          </div>
                                        </Tooltip>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                                  Brak towarów w aktywnych rezerwacjach
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Контент для подвкладки "Faktury" */}
                {appState.activeSubTab === 'faktury' && (
                  <div className="flex flex-col gap-4 mt-6 w-full">
                    <div className="flex items-center gap-4 mb-4">
                      <div 
                        className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit" 
                        onClick={() => setIsInvoiceModalOpen(true)}
                      >
                        <button
                          type="button"
                          className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white"
                          title="Dodaj"
                        >
                          <Plus size={16} />
                        </button>
                        <div className="px-2">
                          <span className="text-gray-900 font-sora text-[13px]">Dodaj fakturę</span>
                        </div>
                      </div>
                    </div>
                    <InvoicesList
                      refreshTrigger={invoicesRefreshTrigger}
                      onInvoiceDeleted={() => setOrdersRefreshTrigger(prev => prev + 1)}
                    />
                  </div>
                )}

                {/* Контент для подвкладки "Komis" */}
                {appState.activeSubTab === 'komis' && (
                  <div className="flex flex-col gap-4 mt-6 w-full">
                    <KomisList refreshTrigger={ordersRefreshTrigger} />
                  </div>
                )}
              </div>
            )}
            {appState.activeTab === 'inventoryStatus' && (
              <div className="flex flex-col gap-4 mt-4 w-full">
                <InventoryStatus productReceipts={appState.productReceipts} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;