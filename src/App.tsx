import React, { useState, useEffect } from 'react';
import { X, FileSpreadsheet, Plus } from 'lucide-react';
import { ExcelFileUploadModal } from './components/ExcelFileUploadModal';
import { ReplaceFileModal } from './components/ReplaceFileModal';
import { AddProductModal } from './components/AddProductModal';
import { DataTable } from './components/DataTable';
import { ProductSearch } from './components/ProductSearch';
import { CategoryFilter } from './components/CategoryFilter';
import { OrderModal } from './components/OrderModal';
import { OrdersList } from './components/OrdersList';
import toast, { Toaster } from 'react-hot-toast';
import Modal from 'react-modal';
import logo from './assets/entr logo copy 2@4x.png';
import './index.css';
import { ReceiptDetailsModal } from './components/ReceiptDetailsModal';
import { ClientModal } from './components/ClientModal';
import { ProductReceiptsList } from './components/ProductReceiptsList';
import { ProductDetailsModal } from './components/ProductDetailsModal';
import { Product } from './types/Product';
import { EditReceiptModal } from './components/EditReceiptModal';
import { ProductList } from './components/ProductList';
import { ClientsList } from './components/ClientsList';
import { EditClientModal } from './components/EditClientModal';
import { InventoryStatus } from './components/InventoryStatus';

// Set the app element for react-modal
Modal.setAppElement('#root');

// --- Работа только с backend через fetch ---

// Типы данных
interface Client {
  id: number;
  firma: string;
  nazwa: string;
  adres: string;
  czasDostawy: string;
  kontakt: string;
}

interface ProductReceipt {
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

interface DbSheet {
  id: number;
  fileName: string;
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
  opis: string;
  updated_at: string;
  [key: string]: string | number;
}

interface AppState {
  sheetsData: SheetData[];
  sheets: SheetData[];
  activeSheet: SheetData | null;
  showTable: boolean;
  clients: Client[];
  products: Product[];
  productReceipts: ProductReceipt[];
  activeTab: 'inventory' | 'clients' | 'orders' | 'inventoryStatus';
  activeSubTab: 'przyjecie' | 'analiza' | 'kalendarz' | null;
  isDbInitialized: boolean;
}

// В продакшене используем относительные пути, в разработке - localhost
const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

console.log('API_URL configured as:', API_URL);

function App() {
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
  const [isReceiptDetailsModalOpen, setIsReceiptDetailsModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ProductReceipt | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tabOrder, setTabOrder] = useState<string[]>(['inventory', 'clients', 'orders', 'inventoryStatus']);
  const [appState, setAppState] = useState<AppState>({
    sheetsData: [],
    sheets: [],
    activeSheet: null,
    showTable: false,
    clients: [],
    products: [],
    productReceipts: [],
    activeTab: 'inventory',
    activeSubTab: 'przyjecie',
    isDbInitialized: false
  });
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [isProductDetailsOpen, setIsProductDetailsOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isEditReceiptModalOpen, setIsEditReceiptModalOpen] = useState(false);
  const [receiptToEdit, setReceiptToEdit] = useState<any>(null);
  const [isEditClientModalOpen, setIsEditClientModalOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null);
  const [ordersRefreshTrigger, setOrdersRefreshTrigger] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('');

  // Загружаем данные из IndexedDB при инициализации
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
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
        setAppState(prev => ({
          ...prev,
          clients,
          products,
          productReceipts
        }));
        
        console.log('✅ App state updated successfully');
        console.log('📊 Final data counts:');
        console.log('   - Clients:', clients.length);
        console.log('   - Products:', products.length);
        console.log('   - Product Receipts:', productReceipts.length);
      } catch (error) {
        console.error('❌ Error loading data:', error);
        toast.error('Błąd podczas ładowania danych');
      } finally {
        setIsLoading(false);
        console.log('🏁 Data loading process completed');
      }
    };

    loadData();
  }, []);

  // Сохраняем данные в IndexedDB и localStorage при изменении
  useEffect(() => {
    // Пропускаем сохранение, если база данных еще не инициализирована
    if (!appState.isDbInitialized) return;
    
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
  useEffect(() => {
    const loadSheetsFromDb = async () => {
      try {
        setIsLoading(true);
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
        setIsLoading(false);
        console.log('🏁 Loading sheets completed');
      }
    };
    loadSheetsFromDb();
  }, []);

  // Проверка наличия файла в базе
  const checkFileExistsInDb = async (fileName: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/api/check_file/${encodeURIComponent(fileName)}`);
      const data = await response.json();
      return data.exists;
    } catch {
      return false;
    }
  };

  const handleExcelUpload = async (newFileName: string, fileData: { headers: string[], rows: string[][] }) => {
    console.log('handleExcelUpload called with:', { newFileName, fileData });

    // Проверяем, есть ли файл с таким именем в базе
    if (await checkFileExistsInDb(newFileName)) {
      toast.error('Plik o tej nazwie już istnieje.');
      return;
    }

    // Сохраняем данные файла только в состоянии
    const sheetData = {
      apiKey: '',
      sheetId: '',
      data: fileData,
      addedAt: Date.now()
    };

    try {
      await fetch(`${API_URL}/api/sheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: newFileName, data: fileData })
      });

      setAppState(prev => {
        const newState = {
          ...prev,
          sheets: [...prev.sheets, { fileName: newFileName, data: fileData }],
          sheetsData: [...prev.sheetsData, { fileName: newFileName, data: fileData }],
          activeSheet: { fileName: newFileName, data: fileData }
        };
        console.log('New app state after file upload:', newState);
        return newState;
      });

      setIsExcelModalOpen(false);
    } catch (error) {
      console.error('Error saving file data:', error);
      toast.error('Błąd podczas zapisywania danych pliku');
    }
  };

  const handleFileClick = (sheet: SheetData) => {
    // Если нажали на тот же файл, который уже активен - сворачиваем таблицу
    if (appState.activeSheet?.fileName === sheet.fileName) {
      setAppState(prev => ({
        ...prev,
        activeSheet: null,
        showTable: false
      }));
      return;
    }

    setAppState(prev => ({
      ...prev,
      activeSheet: sheet,
      showTable: true
    }));
  };

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
      setAppState(prev => ({ 
        ...prev, 
        activeTab: tab,
        activeSubTab: tab === 'inventory' ? 'przyjecie' : null
      }));
    }
  };

  const setActiveSubTab = (subTab: 'przyjecie' | 'analiza' | 'kalendarz') => {
    setAppState(prev => ({ ...prev, activeSubTab: subTab }));
  };

  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'inventory': return 'Zakup towaru';
      case 'clients': return 'Klienci';
      case 'orders': return 'Zamówienia';
      case 'inventoryStatus': return 'Stany magazynowe';
      default: return tab;
    }
  };

  const getClientName = (clientId: number) => {
    const client = appState.clients.find(c => c.id === clientId);
    return client ? `${client.firma} (${client.nazwa})` : 'Nieznany klient';
  };

  const handleReplaceConfirm = () => {
    if (pendingFileName) {
      setIsReplaceModalOpen(false);
      setIsExcelModalOpen(false);
    }
  };

  const handleAddProduct = async (data: { 
    date: string; 
    sprzedawca: string; 
    wartosc: number; 
    kosztDostawy: number;
    products: Array<{
      kod: string;
      nazwa: string;
      kod_kreskowy: string;
      ilosc: number;
      cena: number;
      dataWaznosci?: string;
      typ?: string;
      objetosc?: string;
    }>;
    productInvoice?: File;
    transportInvoice?: File;
  }) => {
    try {
      console.log('🚀 Starting handleAddProduct...');
      console.log('📋 Received data:', data);
      console.log('📡 Making request to:', `${API_URL}/api/product-receipts`);
      
      let response;
      if (data.productInvoice || data.transportInvoice) {
        console.log('📎 Files detected, using FormData...');
        const formData = new FormData();
        const jsonData = {
          date: data.date,
          sprzedawca: data.sprzedawca,
          wartosc: data.wartosc,
          kosztDostawy: data.kosztDostawy,
          products: data.products
        };
        formData.append('data', JSON.stringify(jsonData));
        console.log('📄 JSON data:', jsonData);
        
        if (data.productInvoice) {
          formData.append('productInvoice', data.productInvoice);
          console.log('📎 Product invoice added:', data.productInvoice.name);
        }
        if (data.transportInvoice) {
          formData.append('transportInvoice', data.transportInvoice);
          console.log('📎 Transport invoice added:', data.transportInvoice.name);
        }
        
        response = await fetch(`${API_URL}/api/product-receipts`, {
          method: 'POST',
          body: formData
        });
      } else {
        console.log('📄 No files, using JSON...');
        const jsonData = {
          date: data.date,
          sprzedawca: data.sprzedawca,
          wartosc: data.wartosc,
          kosztDostawy: data.kosztDostawy,
          products: data.products
        };
        console.log('📄 JSON data:', jsonData);
        
        response = await fetch(`${API_URL}/api/product-receipts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jsonData)
        });
      }
      
      console.log('📡 Response status:', response.status);
      console.log('📡 Response headers:', response.headers);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response error text:', errorText);
        throw new Error(`Failed to save product receipt: ${response.status} - ${errorText}`);
      }

      const savedReceipt = await response.json();
      console.log('✅ Saved receipt:', savedReceipt);

      // Загружаем обновленный список товаров
      console.log('🔄 Loading updated receipts...');
      const updatedReceipts = await loadProductReceiptsFromDb();
      console.log('✅ Updated receipts:', updatedReceipts);

      console.log('🔄 Loading updated products...');
      const updatedProducts = await loadProductsFromDb();
      console.log('✅ Updated products:', updatedProducts);

      // Обновляем состояние приложения
      console.log('🔄 Updating app state...');
      setAppState(prev => {
        const newState = {
          ...prev,
          productReceipts: updatedReceipts,
          products: updatedProducts
        };
        console.log('✅ New app state:', newState);
        return newState;
      });

      toast.success('Dodano nowy towar');
      setIsAddProductModalOpen(false);
    } catch (error) {
      console.error('❌ Error adding product:', error);
      toast.error('Wystąpił błąd podczas dodawania towaru');
    }
  };

  const handleEditReceipt = (receipt: any) => {
    setReceiptToEdit(receipt);
    setIsEditReceiptModalOpen(true);
  };

  const handleUpdateReceipt = async (data: { 
    id: number;
    date: string; 
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
      typ?: string;
      objetosc?: number;
    }>;
    productInvoice?: File;
    transportInvoice?: File;
  }) => {
    console.log('=== HANDLE UPDATE RECEIPT DEBUG ===');
    console.log('Received data:', data);
    
    try {
      let response;
      
      if (data.productInvoice || data.transportInvoice) {
        const formData = new FormData();
        formData.append('data', JSON.stringify({
          date: data.date,
          sprzedawca: data.sprzedawca,
          wartosc: data.wartosc,
          kosztDostawy: data.kosztDostawy,
          products: data.products
        }));
        if (data.productInvoice) formData.append('productInvoice', data.productInvoice);
        if (data.transportInvoice) formData.append('transportInvoice', data.transportInvoice);
        response = await fetch(`${API_URL}/api/product-receipts/${data.id}`, {
          method: 'PUT',
          body: formData
        });
      } else {
        response = await fetch(`${API_URL}/api/product-receipts/${data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: data.date,
            sprzedawca: data.sprzedawca,
            wartosc: data.wartosc,
            kosztDostawy: data.kosztDostawy,
            products: data.products
          })
        });
      }
      if (!response.ok) throw new Error('Failed to update product receipt');

      const updatedReceipt = await response.json();
      console.log('Updated receipt:', updatedReceipt);

      // Загружаем обновленный список товаров
      console.log('Loading updated receipts...');
      const updatedReceipts = await loadProductReceiptsFromDb();
      console.log('Updated receipts:', updatedReceipts);

      console.log('Loading updated products...');
      const updatedProducts = await loadProductsFromDb();
      console.log('Updated products:', updatedProducts);

      // Обновляем состояние приложения
      console.log('Updating app state...');
      setAppState(prev => {
        const newState = {
          ...prev,
          productReceipts: updatedReceipts,
          products: updatedProducts
        };
        console.log('New app state:', newState);
        return newState;
      });

      toast.success('Zakup został zaktualizowany');
      setIsEditReceiptModalOpen(false);
      setReceiptToEdit(null);
      // Сбрасываем состояние ReceiptDetailsModal
      setIsReceiptDetailsModalOpen(false);
      setSelectedReceipt(null);
    } catch (error) {
      console.error('Error updating product receipt:', error);
      toast.error('Wystąpił błąd podczas aktualizacji zakupu');
    }
  };

  const handleDeleteReceipt = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/api/product-receipts/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete receipt');
      }

      // Загружаем обновленный список товаров
      const updatedReceipts = await loadProductReceiptsFromDb();
      const updatedProducts = await loadProductsFromDb();

      setAppState(prev => ({
        ...prev,
        productReceipts: updatedReceipts,
        products: updatedProducts
      }));

      toast.success('Zakup został usunięty');
    } catch (error) {
      console.error('Error deleting receipt:', error);
      toast.error('Wystąpił błąd podczas usuwania zakupu');
    }
  };

  const handleViewReceipt = (receipt: any) => {
    setSelectedReceipt(receipt);
    setIsReceiptDetailsModalOpen(true);
  };

  const handleAddClient = async (clientData: { 
    firma: string; 
    nazwa: string; 
    adres: string; 
    czasDostawy: string; 
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
    czasDostawy: string;
    kontakt: string;
  }) => {
    try {
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

      setAppState(prev => ({
        ...prev,
        clients: prev.clients.map(client => 
          client.id === data.id ? updatedClient : client
        )
      }));

      toast.success('Klient został zaktualizowany');
    } catch (error) {
      console.error('Error updating client:', error);
      toast.error('Błąd podczas aktualizacji klienta');
    }
  };

  const handleUpdateOrder = async (data: {
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
      console.log('📋 First receipt:', data[0]);
      console.log('📋 Sample receipt structure:', {
        id: data[0]?.id,
        sprzedawca: data[0]?.sprzedawca,
        products: data[0]?.products,
        productsType: typeof data[0]?.products
      });
      
      // Проверяем, что products - это JSON строка, которую нужно распарсить
      const processedData = data.map((receipt: any) => ({
        ...receipt,
        products: typeof receipt.products === 'string' ? JSON.parse(receipt.products) : receipt.products
      }));
      
      console.log('📋 Processed first receipt:', processedData[0]);
      return processedData;
    } catch (error) {
      console.error('❌ Error loading product receipts:', error);
      return [];
    }
  };

  const handleProductSearch = async (query: string) => {
    try {
      console.log('🔍 Searching products with query:', query);
      console.log('📡 Making request to:', `${API_URL}/api/products/search?query=${encodeURIComponent(query)}`);
      
      const response = await fetch(`${API_URL}/api/products/search?query=${encodeURIComponent(query)}`);
      console.log('📡 Search response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Search results:', data.length, 'products found');
      return data;
    } catch (error) {
      console.error('❌ Error searching products:', error);
      return [];
    }
  };

  const handleAddOrder = () => {
    setShowOrderModal(true);
  };

  const handleOrderCreated = () => {
    setOrdersRefreshTrigger(prev => prev + 1);
  };

  const handleViewProduct = (product: Product) => {
    setSelectedProduct(product);
    setIsProductDetailsOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Toaster position="top-right" />
      
      <ProductDetailsModal
        isOpen={isProductDetailsOpen}
        onClose={() => setIsProductDetailsOpen(false)}
        product={selectedProduct}
      />

      <ExcelFileUploadModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        onUpload={handleExcelUpload}
      />

      <ReplaceFileModal
        isOpen={isReplaceModalOpen}
        onClose={() => setIsReplaceModalOpen(false)}
        fileName={pendingFileName || ''}
        onConfirm={handleReplaceConfirm}
      />

      <AddProductModal
        isOpen={isAddProductModalOpen}
        onClose={() => setIsAddProductModalOpen(false)}
        onSubmit={handleAddProduct}
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

      <ReceiptDetailsModal
        isOpen={isReceiptDetailsModalOpen}
        onClose={() => setIsReceiptDetailsModalOpen(false)}
        receipt={selectedReceipt}
      />

      <EditReceiptModal
        isOpen={isEditReceiptModalOpen}
        onClose={() => {
          setIsEditReceiptModalOpen(false);
          setReceiptToEdit(null);
        }}
        onSubmit={handleUpdateReceipt}
        receipt={receiptToEdit}
      />

      <OrderModal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        onOrderCreated={handleOrderCreated}
      />
      
      <div className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <img
            src={logo}
            alt="Enoterra Logo"
            className="h-32"
          />
        </div>
      </div>

      <div className="bg-gray-100">
        <div className="container mx-auto px-4">
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

      <div className="bg-white shadow-sm min-h-screen">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-start -mt-2">
            {appState.activeTab === 'inventory' && (
              <div className="flex flex-col gap-4 mt-4 w-full relative">
                {/* Подвкладки */}
                <div className="flex">
                  <button
                    onClick={() => setActiveSubTab('przyjecie')}
                    className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
                      appState.activeSubTab === 'przyjecie'
                        ? 'text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Przyjęcie towaru
                  </button>
                  <button
                    onClick={() => setActiveSubTab('analiza')}
                    className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
                      appState.activeSubTab === 'analiza'
                        ? 'text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Analiza zakupów
                  </button>
                  <button
                    onClick={() => setActiveSubTab('kalendarz')}
                    className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
                      appState.activeSubTab === 'kalendarz'
                        ? 'text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Kalendarz płatności
                  </button>
                </div>

                {/* Контент для подвкладки "Przyjęcie towaru" */}
                {appState.activeSubTab === 'przyjecie' && (
                  <div className="flex flex-col gap-4 mt-6">
                    <div className="flex items-center gap-4">
                      <div 
                        className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit" 
                        onClick={() => setIsAddProductModalOpen(true)}
                      >
                        <button
                          type="button"
                          className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white"
                          title="Dodaj"
                        >
                          <Plus size={16} />
                        </button>
                        <div className="px-2">
                          <span className="text-gray-900 font-sora text-[13px]">Dodaj towar</span>
                        </div>
                      </div>
                      <div 
                        className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit" 
                        onClick={() => setIsExcelModalOpen(true)}
                      >
                        <button
                          className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white"
                          title="Importuj"
                        >
                          <FileSpreadsheet size={16} />
                        </button>
                        <div className="px-2">
                          <span className="text-gray-900 font-sora text-[13px]">Importuj plik</span>
                        </div>
                      </div>
                    </div>
                    <ProductReceiptsList 
                      receipts={appState.productReceipts} 
                      products={appState.products}
                      onDelete={handleDeleteReceipt}
                      onEdit={handleEditReceipt}
                      onUpdate={handleUpdateReceipt}
                    />
                  </div>
                )}

                {/* Контент для подвкладки "Analiza zakupów" */}
                {appState.activeSubTab === 'analiza' && (
                  <div className="flex flex-col gap-4">
                    <div className="bg-white p-6 rounded-lg border">
                      <h2 className="text-lg font-bold text-gray-900 font-sora mb-4">Analiza zakupów</h2>
                      <p className="text-gray-600 font-sora">Funkcja analizy zakupów będzie dostępna wkrótce.</p>
                    </div>
                  </div>
                )}

                {/* Контент для подвкладки "Kalendarz płatności" */}
                {appState.activeSubTab === 'kalendarz' && (
                  <div className="flex flex-col gap-4 mt-6">
                    <div className="bg-white p-6 rounded-lg border">
                      <h2 className="text-lg font-bold text-gray-900 font-sora mb-4">Kalendarz płatności</h2>
                      <p className="text-gray-600 font-sora">Funkcja kalendarza płatności będzie dostępna wkrótce.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            {appState.activeTab === 'inventory' && (
              <div className="absolute top-16 right-4 flex justify-end">
                {appState.sheets.map((sheet) => (
                  <div key={sheet.fileName} className="flex items-center gap-2">
                    <button
                      onClick={() => handleFileClick(sheet)}
                      className="px-4 py-1.5 bg-green-50 text-green-700 rounded-md inline-flex items-center hover:bg-green-100 transition-colors font-semibold text-[10px] cursor-pointer font-sora w-fit whitespace-nowrap"
                    >
                      {sheet.fileName}
                    </button>
                    {sheet.fileName !== 'stany init.xlsx' && (
                      <button
                        onClick={async () => {
                          try {
                            await fetch(`${API_URL}/api/delete_file/${encodeURIComponent(sheet.fileName)}`, {
                              method: 'DELETE'
                            });

                            setAppState(prev => ({
                              ...prev,
                              activeSheet: null,
                              showTable: false,
                              sheets: prev.sheets.filter(s => s.fileName !== sheet.fileName),
                              sheetsData: prev.sheetsData.filter(s => s.fileName !== sheet.fileName)
                            }));

                            toast.success('Файл успешно удален');
                          } catch (error) {
                            console.error('Error deleting file:', error);
                            toast.error('Ошибка при удалении файла');
                          }
                        }}
                        className="text-red-500 hover:text-red-700 focus:outline-none"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {appState.activeTab === 'inventory' && appState.showTable && appState.activeSheet && (
              <div className="mt-6 bg-white">
                <div className="rounded-lg shadow-sm border border-gray-200 bg-white mt-6">
                  <DataTable data={appState.activeSheet.data} />
                </div>
              </div>
            )}
            {appState.activeTab === 'clients' && (
              <div className="flex flex-col gap-4 mt-4 w-full">
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
                  clients={appState.clients}
                  onDelete={handleDeleteClient}
                  onEdit={(client) => {
                    // Открываем модальное окно редактирования
                    setClientToEdit(client);
                    setIsEditClientModalOpen(true);
                  }}
                  onUpdate={handleUpdateClient}
                />
              </div>
            )}
            {appState.activeTab === 'orders' && (
              <div className="flex flex-col gap-4 mt-4 w-full">
                <div className="mb-4">
                  <div className="w-1/2 mx-auto">
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
                </div>
                <OrdersList 
                  onViewOrder={(order) => {
                    console.log('View order:', order);
                    // TODO: Implement order details modal
                  }}
                  onEditOrder={(order) => {
                    console.log('Edit order:', order);
                    // TODO: Implement order edit modal
                  }}
                  onDeleteOrder={(orderId) => {
                    console.log('Delete order:', orderId);
                    // Удаление обрабатывается внутри OrdersList
                  }}
                  onUpdateOrder={handleUpdateOrder}
                  refreshTrigger={ordersRefreshTrigger}
                />
              </div>
            )}
            {appState.activeTab === 'inventoryStatus' && (
              <div className="flex flex-col gap-4 mt-4 w-full">
                <InventoryStatus productReceipts={appState.productReceipts} />
              </div>
            )}
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;