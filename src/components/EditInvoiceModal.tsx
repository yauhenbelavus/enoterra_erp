import React, { useState, useEffect } from 'react';
import { X, Plus, Search } from 'lucide-react';
import Modal from 'react-modal';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import "../components/DatePicker.css";
import toast from 'react-hot-toast';

registerLocale('pl', pl);

interface ProductRow {
  id?: number;
  kod: string;
  nazwa: string;
  ilosc: string;
  cena_netto: string;
  rabat: string;
  vat: number;
  searchQuery?: string;
  isFromKomis?: boolean;
  maxIlosc?: number;
  originalKomisIlosc?: number;
}

interface DeletedKomisRow {
  kod: string;
  nazwa: string;
  previous_ilosc: number;
}

interface SearchProduct {
  kod: string;
  nazwa: string;
  cena_sprzedazy: number | null;
  ilosc?: number;
}

interface KomisProduct {
  kod: string;
  nazwa: string;
  ilosc: number;
  cena_sprzedazy: number | null;
}

interface Invoice {
  id: number;
  numer_faktury: string;
  data_faktury: string;
  termin_platnosci: string | null;
  klient_nazwa: string;
  suma_netto: number;
  suma_vat?: number;
  suma_brutto: number;
  rabat_suma: number;
  products?: Array<{
    id: number;
    invoice_id: number;
    kod: string;
    nazwa: string;
    ilosc: number;
    cena_netto: number;
    rabat: number;
    vat_stawka: number;
  }>;
}

interface EditInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  invoice: Invoice | null;
  readOnlyExisting?: boolean;
}

const VAT_RATES = [
  { value: 0, label: '0%' },
  { value: 5, label: '5%' },
  { value: 8, label: '8%' },
  { value: 23, label: '23%' }
];

export const EditInvoiceModal: React.FC<EditInvoiceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  invoice,
  readOnlyExisting = false
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [terminPlatnosci, setTerminPlatnosci] = useState<Date | null>(null);
  const [numerFaktury, setNumerFaktury] = useState<string>('');
  const [klient, setKlient] = useState<string>('');
  const [klientSearchQuery, setKlientSearchQuery] = useState<string>('');
  const [searchClients, setSearchClients] = useState<any[]>([]);
  const [isClientSearchActive, setIsClientSearchActive] = useState(false);
  const [productRows, setProductRows] = useState<ProductRow[]>([
    { kod: '', nazwa: '', ilosc: '', cena_netto: '', rabat: '', vat: 23 }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openVatDropdownIndex, setOpenVatDropdownIndex] = useState<number | null>(null);
  const [searchProducts, setSearchProducts] = useState<SearchProduct[]>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [initialProductCount, setInitialProductCount] = useState(0);
  const [komisProducts, setKomisProducts] = useState<KomisProduct[]>([]);
  const [komisAllProducts, setKomisAllProducts] = useState<KomisProduct[]>([]);
  const [fieldsWithErrors, setFieldsWithErrors] = useState<Set<number>>(new Set());
  const [deletedKomisRows, setDeletedKomisRows] = useState<DeletedKomisRow[]>([]);

  const isKomisKod = (kod: string) =>
    Boolean(kod && komisAllProducts.some(p => p.kod === kod));

  const isKomisRow = (row: ProductRow) =>
    Boolean(row.isFromKomis || isKomisKod(row.kod));

  const isLockedRow = (index: number) => {
    if (!readOnlyExisting) return false;
    const row = productRows[index];
    if (isKomisRow(row)) return false;
    // строка из faktury, kod которой не в komis — read-only
    return Boolean(row.id);
  };

  const getKomisPool = (kod: string, rows: ProductRow[] = productRows) => {
    const komisStock = komisAllProducts.find(p => p.kod === kod)?.ilosc ?? 0;
    const originalOnInvoice = rows.reduce((sum, row) => {
      if (!isKomisRow(row) || row.kod !== kod) return sum;
      if (row.originalKomisIlosc !== undefined) return sum + row.originalKomisIlosc;
      return sum;
    }, 0);
    return komisStock + originalOnInvoice;
  };

  const getUsedInOtherKomisRows = (kod: string, excludeIndex: number, rows: ProductRow[] = productRows) =>
    rows.reduce((sum, row, i) => {
      if (i === excludeIndex || !isKomisRow(row) || row.kod !== kod) return sum;
      return sum + (parseInt(row.ilosc, 10) || 0);
    }, 0);

  const getAvailableKomisIlosc = (kod: string, excludeIndex: number, rows: ProductRow[] = productRows) => {
    const pool = getKomisPool(kod, rows);
    return Math.max(0, pool - getUsedInOtherKomisRows(kod, excludeIndex, rows));
  };

  const syncKomisQuantityErrors = (rows: ProductRow[], toastIndex?: number) => {
    const newErrors = computeKomisQuantityErrors(rows);
    let toastMessage: string | null = null;

    if (toastIndex !== undefined && newErrors.has(toastIndex)) {
      const row = rows[toastIndex];
      if (row?.kod) {
        const max = getAvailableKomisIlosc(row.kod, toastIndex, rows);
        const komisTotal = komisAllProducts.find(p => p.kod === row.kod)?.ilosc ?? 0;
        toastMessage = `Niewystarczająca ilość - dostępne w komisie: ${max} szt. (łącznie w komisie: ${komisTotal})`;
      }
    }

    setFieldsWithErrors(newErrors);
    if (toastMessage) {
      toast.error(toastMessage);
    }
  };

  const computeKomisQuantityErrors = (rows: ProductRow[]): Set<number> => {
    const newErrors = new Set<number>();
    rows.forEach((row, index) => {
      if (!isKomisRow(row) || !row.kod) return;
      const quantity = parseInt(row.ilosc, 10) || 0;
      if (!row.ilosc.trim() || quantity === 0) return;
      const max = getAvailableKomisIlosc(row.kod, index, rows);
      if (quantity > max) newErrors.add(index);
    });
    return newErrors;
  };

  const hasKomisChanges = () => {
    if (deletedKomisRows.length > 0) return true;
    return productRows.some(row => {
      if (!isKomisRow(row) || !row.kod) return false;
      const current = Math.round(parseFloat(row.ilosc) || 0);
      if (row.originalKomisIlosc === undefined) {
        return Boolean(row.nazwa && row.ilosc && row.cena_netto);
      }
      return current !== row.originalKomisIlosc;
    });
  };

  const canSubmitKomisMode = () => {
    if (!hasKomisChanges()) return false;
    if (fieldsWithErrors.size > 0) return false;

    for (let i = 0; i < productRows.length; i++) {
      if (isLockedRow(i)) continue;
      const row = productRows[i];
      const started = Boolean(row.searchQuery || row.nazwa || row.ilosc || row.cena_netto);
      if (!started) continue;
      if (!isKomisRow(row) || !row.kod || !row.nazwa || !row.ilosc || !row.cena_netto) return false;
      const qty = parseInt(row.ilosc, 10) || 0;
      if (qty <= 0 || qty > getAvailableKomisIlosc(row.kod, i)) return false;
    }

    return true;
  };

  const handleKomisIloscChange = (index: number, value: string) => {
    if (isLockedRow(index)) return;

    const newRows = [...productRows];
    if (value === '' || /^\d*$/.test(value)) {
      newRows[index].ilosc = value;
      setProductRows(newRows);
    } else {
      return;
    }

    if (!readOnlyExisting) return;

    syncKomisQuantityErrors(newRows, index);
  };

  const filterKomisProducts = (query: string, excludeIndex?: number): SearchProduct[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return komisProducts
      .filter(p => {
        const available = getAvailableKomisIlosc(p.kod, excludeIndex ?? -1);
        if (available <= 0) return false;
        return p.kod.toLowerCase().includes(q) || p.nazwa.toLowerCase().includes(q);
      })
      .map(p => ({
        kod: p.kod,
        nazwa: p.nazwa,
        cena_sprzedazy: p.cena_sprzedazy,
        ilosc: getAvailableKomisIlosc(p.kod, excludeIndex ?? -1)
      }));
  };

  // Загрузка данных фактуры при открытии
  useEffect(() => {
    if (isOpen && invoice) {
      // Загружаем полные данные фактуры с продуктами
      const loadInvoiceData = async () => {
        try {
          const response = await fetch(`/api/invoices/${invoice.id}`);
          if (!response.ok) throw new Error('Failed to load invoice');
          const data = await response.json();

          let komisAll: KomisProduct[] = [];
          if (readOnlyExisting && data.klient_nazwa) {
            const komisRes = await fetch(
              `/api/komis/client/${encodeURIComponent(data.klient_nazwa)}?include_zero=1`
            );
            if (komisRes.ok) {
              const komisData = await komisRes.json();
              komisAll = komisData.products || [];
            }
          }
          setKomisAllProducts(komisAll);
          setKomisProducts(komisAll.filter(p => p.ilosc > 0));
          const komisKods = new Set(komisAll.map(p => p.kod));
          
          setNumerFaktury(data.numer_faktury);
          setKlient(data.klient_nazwa);
          setKlientSearchQuery(data.klient_nazwa);
          setSelectedDate(data.data_faktury ? new Date(data.data_faktury) : null);
          setTerminPlatnosci(data.termin_platnosci ? new Date(data.termin_platnosci) : null);
          
          if (data.products && data.products.length > 0) {
            const products = data.products.map((p: any) => {
              const kod = p.kod || '';
              const isFromKomis = readOnlyExisting && komisKods.has(kod);
              return {
                id: p.id,
                kod,
                nazwa: p.nazwa,
                ilosc: p.ilosc.toString(),
                cena_netto: p.cena_netto.toFixed(2).replace('.', ','),
                rabat: p.rabat ? p.rabat.toString() : '',
                vat: p.vat_stawka || 23,
                isFromKomis,
                originalKomisIlosc: isFromKomis ? Math.round(p.ilosc) : undefined,
                searchQuery: isFromKomis ? p.nazwa : undefined
              };
            });
            setProductRows(products);
            setInitialProductCount(readOnlyExisting ? products.filter((p: ProductRow) => !p.isFromKomis).length : 0);
          } else {
            setInitialProductCount(0);
          }
          setDeletedKomisRows([]);
        } catch (error) {
          console.error('Error loading invoice:', error);
          toast.error('Błąd podczas ładowania faktury');
        }
      };
      
      loadInvoiceData();
    } else {
      // Reset при закрытии
      setSelectedDate(null);
      setTerminPlatnosci(null);
      setNumerFaktury('');
      setKlient('');
      setKlientSearchQuery('');
      setSearchClients([]);
      setIsClientSearchActive(false);
      setProductRows([{ kod: '', nazwa: '', ilosc: '', cena_netto: '', rabat: '', vat: 23 }]);
      setInitialProductCount(0);
      setKomisProducts([]);
      setKomisAllProducts([]);
      setFieldsWithErrors(new Set());
      setDeletedKomisRows([]);
    }
  }, [isOpen, invoice, readOnlyExisting]);

  useEffect(() => {
    if (readOnlyExisting) {
      setFieldsWithErrors(computeKomisQuantityErrors(productRows));
    }
  }, [productRows, komisAllProducts, readOnlyExisting]);

  // Закрытие dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      if (openVatDropdownIndex !== null) {
        if (!target.closest('.dropdown-container')) {
          setOpenVatDropdownIndex(null);
        }
      }
      
      if (activeSearchIndex !== null) {
        if (!target.closest('.product-search-container')) {
          setActiveSearchIndex(null);
          setSearchProducts([]);
        }
      }
      
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

  // Поиск продуктов
  useEffect(() => {
    const searchProductsAsync = async () => {
      if (activeSearchIndex === null) {
        setSearchProducts([]);
        return;
      }

      if (readOnlyExisting && isLockedRow(activeSearchIndex)) {
        setSearchProducts([]);
        return;
      }
      
      const row = productRows[activeSearchIndex];
      const query = row?.searchQuery || '';

      if (readOnlyExisting) {
        if (query.trim().length < 1) {
          setSearchProducts([]);
          return;
        }
        setSearchProducts(filterKomisProducts(query, activeSearchIndex));
        return;
      }
      
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
  }, [activeSearchIndex, productRows, readOnlyExisting, initialProductCount, komisProducts]);

  // Поиск клиентов
  useEffect(() => {
    const searchClientsAsync = async () => {
      if (!isClientSearchActive) {
        setSearchClients([]);
        return;
      }
      
      const query = klientSearchQuery.trim();
      
      if (query.length < 1) {
        setSearchClients([]);
        return;
      }

      try {
        const response = await fetch(`/api/clients/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Failed to fetch clients');
        const data = await response.json();
        setSearchClients(data);
      } catch (error) {
        console.error('Error searching clients:', error);
        setSearchClients([]);
      }
    };

    const timeoutId = setTimeout(searchClientsAsync, 300);
    return () => clearTimeout(timeoutId);
  }, [isClientSearchActive, klientSearchQuery]);

  const addNewRow = () => {
    setProductRows([...productRows, {
      kod: '',
      nazwa: '',
      ilosc: '',
      cena_netto: '',
      rabat: '',
      vat: 23,
      searchQuery: '',
      isFromKomis: readOnlyExisting ? false : undefined
    }]);
  };

  const deleteRow = (index: number) => {
    if (readOnlyExisting) {
      if (isLockedRow(index)) return;
      const row = productRows[index];
      if (isKomisRow(row) && row.kod && row.originalKomisIlosc !== undefined) {
        setDeletedKomisRows(prev => [...prev, {
          kod: row.kod,
          nazwa: row.nazwa,
          previous_ilosc: row.originalKomisIlosc as number
        }]);
      }
      const newRows = productRows.filter((_, i) => i !== index);
      setProductRows(newRows);
      syncKomisQuantityErrors(newRows);
      return;
    }
    if (productRows.length > 1) {
      setProductRows(productRows.filter((_, i) => i !== index));
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
    const availableIlosc = readOnlyExisting
      ? (product.ilosc ?? getAvailableKomisIlosc(product.kod, index))
      : undefined;
    
    newRows[index] = {
      ...newRows[index],
      kod: product.kod,
      nazwa: product.nazwa,
      cena_netto: formattedPrice,
      searchQuery: readOnlyExisting ? product.nazwa : `${product.kod} - ${product.nazwa}`,
      ...(readOnlyExisting ? { isFromKomis: true, maxIlosc: availableIlosc } : {})
    };
    setProductRows(newRows);
    setSearchProducts([]);
    setActiveSearchIndex(null);
    if (readOnlyExisting) {
      syncKomisQuantityErrors(newRows);
    }
  };

  const calculateRowNetto = (row: ProductRow) => {
    const ilosc = parseFloat(row.ilosc) || 0;
    const cena = parseFloat(row.cena_netto.replace(',', '.')) || 0;
    const rabat = parseFloat(row.rabat.replace(',', '.')) || 0;
    const netto = ilosc * cena;
    const nettoPoRabacie = netto * (1 - rabat / 100);
    return nettoPoRabacie;
  };

  const calculateRowRabatAmount = (row: ProductRow) => {
    const ilosc = parseFloat(row.ilosc) || 0;
    const cena = parseFloat(row.cena_netto.replace(',', '.')) || 0;
    const rabat = parseFloat(row.rabat.replace(',', '.')) || 0;
    return ilosc * cena * (rabat / 100);
  };

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

    if (!invoice) {
      toast.error('Brak danych faktury');
      return;
    }

    setIsSubmitting(true);
    try {
      const formattedProducts = productRows
        .filter(row => row.nazwa && row.ilosc && row.cena_netto)
        .map(row => ({
          id: row.id,
          kod: row.kod || '',
          nazwa: row.nazwa,
          ilosc: parseFloat(row.ilosc) || 0,
          cena_netto: parseFloat(row.cena_netto.replace(',', '.')) || 0,
          rabat: parseFloat(row.rabat.replace(',', '.')) || 0,
          vat: row.vat
        }));

      const komisSync = readOnlyExisting
        ? [
            ...productRows
              .filter(row => isKomisRow(row) && row.kod)
              .map(row => ({
                kod: row.kod,
                nazwa: row.nazwa,
                previous_ilosc: row.originalKomisIlosc ?? 0,
                new_ilosc: Math.round(parseFloat(row.ilosc) || 0)
              })),
            ...deletedKomisRows.map(row => ({
              kod: row.kod,
              nazwa: row.nazwa,
              previous_ilosc: row.previous_ilosc,
              new_ilosc: 0
            }))
          ].filter(item => item.previous_ilosc !== item.new_ilosc)
        : undefined;

      const invoiceData = {
        data_faktury: selectedDate.toLocaleDateString('en-CA'),
        numer_faktury: numerFaktury,
        klient: klient,
        termin_platnosci: terminPlatnosci ? terminPlatnosci.toLocaleDateString('en-CA') : undefined,
        products: formattedProducts,
        komis_sync: komisSync && komisSync.length > 0 ? komisSync : undefined,
        suma_netto: parseFloat(calculateTotalNetto()),
        suma_vat: parseFloat(calculateTotalVAT()),
        suma_brutto: parseFloat(calculateTotal()),
        rabat_suma: parseFloat(calculateTotalRabat())
      };

      const response = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceData)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      toast.success(`Faktura została zaktualizowana: ${numerFaktury}`);
      onSuccess?.();
      handleClose();
    } catch (error) {
      console.error('Error updating invoice:', error);
      toast.error(error instanceof Error ? error.message : 'Błąd podczas aktualizacji faktury');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSubmitDisabled = isSubmitting || !selectedDate || !klient || (
    readOnlyExisting
      ? !canSubmitKomisMode()
      : !productRows.some(row => row.nazwa && row.ilosc && row.cena_netto)
  );

  const handleClose = () => {
    setSelectedDate(null);
    setTerminPlatnosci(null);
    setNumerFaktury('');
    setKlient('');
    setKlientSearchQuery('');
    setSearchClients([]);
    setIsClientSearchActive(false);
    setProductRows([{ kod: '', nazwa: '', ilosc: '', cena_netto: '', rabat: '', vat: 23 }]);
    setIsSubmitting(false);
    setOpenVatDropdownIndex(null);
    setSearchProducts([]);
    setActiveSearchIndex(null);
    setIsSearchLoading(false);
    setInitialProductCount(0);
    setKomisProducts([]);
    setKomisAllProducts([]);
    setFieldsWithErrors(new Set());
    setDeletedKomisRows([]);
    onClose();
  };

  const readOnlyClass = 'bg-gray-50 text-gray-700 cursor-not-allowed';

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
          <h2 className="text-base font-semibold text-gray-800">
            {readOnlyExisting ? 'Dodaj z komisu' : 'Edytuj fakturę VAT'}
          </h2>
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
                  readOnly={readOnlyExisting}
                  disabled={readOnlyExisting}
                  className={`w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-center ${readOnlyExisting ? readOnlyClass : ''}`}
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
                  readOnly={readOnlyExisting}
                  className={`w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs ${readOnlyExisting ? readOnlyClass : ''}`}
                  placeholder="FV XXX/M/YYYY"
                />
              </div>
              <div className="w-[250px] relative client-search-container">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Klient
                </label>
                {readOnlyExisting ? (
                  <input
                    type="text"
                    value={klient}
                    readOnly
                    className={`w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs ${readOnlyClass}`}
                  />
                ) : (
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={klientSearchQuery}
                    onChange={(e) => {
                      setKlientSearchQuery(e.target.value);
                      setKlient('');
                      setIsClientSearchActive(true);
                    }}
                    onFocus={() => setIsClientSearchActive(true)}
                    className="w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                    placeholder="Wyszukaj klienta..."
                  />
                  {searchClients.length > 0 && isClientSearchActive && (
                    <div className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm border border-gray-200">
                      {searchClients.map((client, idx) => (
                        <div
                          key={idx}
                          className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-blue-50"
                          onClick={() => {
                            setKlient(client.nazwa);
                            setKlientSearchQuery(client.nazwa);
                            setIsClientSearchActive(false);
                            setSearchClients([]);
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium text-xs">{client.nazwa}</span>
                            {client.firma && (
                              <span className="text-xs text-gray-500">{client.firma}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
                  readOnly={readOnlyExisting}
                  disabled={readOnlyExisting}
                  className={`w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-center ${readOnlyExisting ? readOnlyClass : ''}`}
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
                    {isLockedRow(index) ? (
                      <input
                        type="text"
                        value={row.nazwa}
                        readOnly
                        className={`w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs ${readOnlyClass}`}
                      />
                    ) : (
                    <>
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ top: index === 0 ? '28px' : '0' }}>
                        <Search className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        className="w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                        placeholder={readOnlyExisting ? 'Wyszukaj w komisie...' : 'Wyszukaj produkt...'}
                        value={row.searchQuery || row.nazwa}
                        onChange={(e) => {
                          const newRows = [...productRows];
                          newRows[index].searchQuery = e.target.value;
                          newRows[index].nazwa = '';
                          newRows[index].kod = '';
                          newRows[index].cena_netto = '';
                          newRows[index].isFromKomis = false;
                          newRows[index].maxIlosc = undefined;
                          setProductRows(newRows);
                          setActiveSearchIndex(index);
                        }}
                      />
                      {isSearchLoading && activeSearchIndex === index && !readOnlyExisting && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2" style={{ top: index === 0 ? 'calc(50% + 14px)' : '50%' }}>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                        </div>
                      )}
                      {searchProducts.length > 0 && activeSearchIndex === index && row.searchQuery?.trim() && (
                        <div className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm border border-gray-200">
                          {searchProducts.map((product, idx) => (
                            <div
                              key={`${product.kod}-${idx}`}
                              className="cursor-pointer select-none relative py-1 pl-3 pr-9 hover:bg-blue-50"
                              onClick={() => handleProductSelect(index, product)}
                            >
                              <div className="flex flex-col">
                                {readOnlyExisting ? (
                                  <span className="font-medium text-[10px]">{product.nazwa}</span>
                                ) : (
                                  <>
                                    <span className="font-medium text-[10px]">{product.kod}</span>
                                    <span className="text-[10px] text-gray-500">{product.nazwa}</span>
                                  </>
                                )}
                                {readOnlyExisting && product.ilosc !== undefined && (
                                  <span className="text-[10px] text-orange-600 font-medium">
                                    Ilość w komisie: {product.ilosc}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {readOnlyExisting && activeSearchIndex === index && row.searchQuery?.trim() && searchProducts.length === 0 && (
                        <div className="absolute z-50 mt-1 w-full bg-white shadow-lg rounded-md py-2 px-3 text-[10px] text-gray-500 border border-gray-200">
                          Brak wyników w komisie
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
                      readOnly={isLockedRow(index)}
                      className={`w-full px-3 py-1.5 border rounded-md focus:outline-none font-sora text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                        isLockedRow(index)
                          ? readOnlyClass
                          : readOnlyExisting && fieldsWithErrors.has(index)
                            ? 'border-red-500 bg-red-50'
                            : 'border-gray-300'
                      }`}
                      placeholder="0"
                      value={row.ilosc}
                      onChange={(e) => {
                        if (readOnlyExisting && !isLockedRow(index)) {
                          handleKomisIloscChange(index, e.target.value);
                          return;
                        }
                        if (isLockedRow(index)) return;
                        const newRows = [...productRows];
                        const value = e.target.value;
                        if (value === '' || /^\d*$/.test(value)) {
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
                      readOnly={isLockedRow(index)}
                      onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (isLockedRow(index)) return;
                        const char = String.fromCharCode(e.which);
                        const pattern = /[\d,]/;
                        if (!pattern.test(char) || 
                            (char === ',' && (e.target as HTMLInputElement).value.includes(',')) ||
                            ((e.target as HTMLInputElement).value === '' && char === ',')) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        if (isLockedRow(index)) return;
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
                      className={`w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs ${isLockedRow(index) ? readOnlyClass : ''}`}
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
                      readOnly={isLockedRow(index)}
                      onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (isLockedRow(index)) return;
                        const char = String.fromCharCode(e.which);
                        const pattern = /[\d,]/;
                        if (!pattern.test(char) || 
                            (char === ',' && (e.target as HTMLInputElement).value.includes(',')) ||
                            ((e.target as HTMLInputElement).value === '' && char === ',')) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        if (isLockedRow(index)) return;
                        const newRows = [...productRows];
                        newRows[index].rabat = e.target.value.replace(/[^\d,]/g, '');
                        setProductRows(newRows);
                      }}
                      className={`w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs ${isLockedRow(index) ? readOnlyClass : ''}`}
                      placeholder="0"
                    />
                  </div>
                  
                  {/* VAT */}
                  <div className="w-20 ml-2 relative dropdown-container">
                    {index === 0 && (
                      <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">VAT</label>
                    )}
                    {isLockedRow(index) ? (
                      <input
                        type="text"
                        value={`${row.vat}%`}
                        readOnly
                        className={`w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs ${readOnlyClass}`}
                      />
                    ) : (
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
                    )}
                    {!isLockedRow(index) && openVatDropdownIndex === index && (
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
                  {((!readOnlyExisting && productRows.length > 1) || (readOnlyExisting && !isLockedRow(index))) && (
                    <button
                      onClick={() => deleteRow(index)}
                      className={`ml-2 text-red-400 hover:text-red-600 ${index === 0 ? 'mt-[28px]' : ''}`}
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

        {(!readOnlyExisting || productRows.some((_, i) => !isLockedRow(i)) || deletedKomisRows.length > 0) && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className={`px-6 py-1.5 text-white text-xs rounded-md focus:outline-none transition-colors font-sora ${
              isSubmitDisabled
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Zapisywanie...
              </div>
            ) : (
              'Zapisz zmiany'
            )}
          </button>
        </div>
        )}

      </div>
    </Modal>
  );
};
