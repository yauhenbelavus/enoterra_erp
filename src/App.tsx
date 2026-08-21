import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import Modal from 'react-modal';
import logo from './assets/entr logo copy 2@4x.png';
import './index.css';
import { ProductDetailsModal } from './components/ProductDetailsModal';
import { Product } from './types/Product';
import { ZakupTowarowPage } from './pages/ZakupTowarowPage';
import { KlienciPage } from './pages/KlienciPage';
import { SprzedazPage } from './pages/SprzedazPage';
import { StanyMagazynowePage } from './pages/StanyMagazynowePage';
import {
  getDefaultSubTab,
  getPathForTab,
  getTabFromPathname,
  PRE_ROUTED_TAB_KEY,
  resolveSubTabForTab,
} from './routes';

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
  activeSubTab: 'przyjecie' | 'analiza' | 'kalendarz' | 'wydanie' | 'rezerwacje' | 'analiza_towarow' | 'analiza_wydan' | 'faktury' | 'komis' | 'baza_klientow' | 'sprzedaz_klientom' | null;
  isDbInitialized: boolean;
}

// В продакшене используем относительные пути, в разработке - localhost
const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

console.log('API_URL configured as:', API_URL);

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [tabOrder, setTabOrder] = useState<string[]>(['inventory', 'clients', 'orders', 'inventoryStatus']);
  const [appState, setAppState] = useState<AppState>(() => {
    const pathname = window.location.pathname;
    const tabFromPath = getTabFromPathname(pathname);

    const savedActiveTab = localStorage.getItem('activeTab') || 'orders';
    const savedActiveSubTab = localStorage.getItem('activeSubTab');
    
    const validTabs = ['inventory', 'clients', 'orders', 'inventoryStatus'] as const;
    const validSubTabs = ['przyjecie', 'analiza', 'kalendarz', 'wydanie', 'rezerwacje', 'analiza_towarow', 'analiza_wydan', 'faktury', 'komis', 'baza_klientow', 'sprzedaz_klientom'] as const;

    let activeTab: AppState['activeTab'];
    if (tabFromPath) {
      activeTab = tabFromPath;
    } else {
      activeTab = (validTabs.includes(savedActiveTab as typeof validTabs[number])
        ? savedActiveTab
        : 'orders') as AppState['activeTab'];
    }
    
    const defaultSubTab = getDefaultSubTab(activeTab);
    
    const savedSubTabValid =
      savedActiveSubTab &&
      validSubTabs.includes(savedActiveSubTab as typeof validSubTabs[number]) &&
      ((activeTab === 'inventory' && ['przyjecie', 'analiza', 'kalendarz'].includes(savedActiveSubTab)) ||
        (activeTab === 'orders' && ['wydanie', 'rezerwacje', 'analiza_towarow', 'faktury', 'komis', 'analiza_wydan'].includes(savedActiveSubTab)) ||
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
      activeTab,
      activeSubTab,
      isDbInitialized: false,
    };
  });
  const [isProductDetailsOpen, setIsProductDetailsOpen] = useState(false);
  const [ordersRefreshTrigger, setOrdersRefreshTrigger] = useState(0);
  const [reservationsRefreshTrigger, setReservationsRefreshTrigger] = useState(0);
  const [invoicesRefreshTrigger, setInvoicesRefreshTrigger] = useState(0);

  useEffect(() => {
    const tabFromPath = getTabFromPathname(location.pathname);

    if (!tabFromPath) {
      const savedActiveTab = (localStorage.getItem('activeTab') || 'orders') as AppState['activeTab'];
      navigate(getPathForTab(savedActiveTab), { replace: true });
      return;
    }

    if (appState.activeTab !== tabFromPath) {
      const savedActiveSubTab = localStorage.getItem('activeSubTab');
      const activeSubTab = resolveSubTabForTab(tabFromPath, savedActiveSubTab);

      localStorage.setItem('activeTab', tabFromPath);
      setAppState(prev => ({
        ...prev,
        activeTab: tabFromPath,
        activeSubTab,
      }));
    }
  }, [location.pathname, navigate, appState.activeTab]);

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

      const tabPath = getPathForTab(tab as AppState['activeTab']);
      if (appState.activeTab !== tab) {
        sessionStorage.setItem(PRE_ROUTED_TAB_KEY, appState.activeTab);
      }
      navigate(tabPath);
      
      setAppState(prev => ({ 
        ...prev, 
        activeTab: tab as AppState['activeTab'],
        activeSubTab: newSubTab
      }));
    }
  };

  const setActiveSubTab = (subTab: 'przyjecie' | 'analiza' | 'kalendarz' | 'wydanie' | 'rezerwacje' | 'analiza_towarow' | 'analiza_wydan' | 'faktury' | 'komis' | 'baza_klientow' | 'sprzedaz_klientom') => {
    localStorage.setItem('activeSubTab', subTab);
    setAppState(prev => ({ ...prev, activeSubTab: subTab }));
  };

  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'inventory': return 'Zakup towarów';
      case 'clients': return 'Klienci';
      case 'orders': return 'Sprzedaż towarów';
      case 'inventoryStatus': return 'Stany magazynowe';
      default: return tab;
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

  return (
    <div className="min-h-screen bg-white">
      <Toaster position="top-right" containerStyle={{ zIndex: 99999 }} />
      
      <ProductDetailsModal
        isOpen={isProductDetailsOpen}
        onClose={() => setIsProductDetailsOpen(false)}
        product={null}
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
              <KlienciPage
                activeSubTab={appState.activeSubTab}
                setActiveSubTab={setActiveSubTab as (tab: 'baza_klientow' | 'sprzedaz_klientom') => void}
                clients={appState.clients}
                onClientsChange={(clients) => setAppState(prev => ({ ...prev, clients }))}
                invoicesRefreshTrigger={invoicesRefreshTrigger}
              />
            )}
            {appState.activeTab === 'orders' && (
              <SprzedazPage
                activeSubTab={appState.activeSubTab}
                setActiveSubTab={setActiveSubTab as (tab: 'wydanie' | 'rezerwacje' | 'analiza_towarow' | 'faktury' | 'komis' | 'analiza_wydan') => void}
                ordersRefreshTrigger={ordersRefreshTrigger}
                onOrdersRefresh={() => setOrdersRefreshTrigger(prev => prev + 1)}
                reservationsRefreshTrigger={reservationsRefreshTrigger}
                onReservationsRefresh={() => setReservationsRefreshTrigger(prev => prev + 1)}
                invoicesRefreshTrigger={invoicesRefreshTrigger}
                onInvoicesRefresh={() => setInvoicesRefreshTrigger(prev => prev + 1)}
              />
            )}
            {appState.activeTab === 'inventoryStatus' && (
              <StanyMagazynowePage productReceipts={appState.productReceipts} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;