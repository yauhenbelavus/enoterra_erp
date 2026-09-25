  import React, { useState, useRef, useEffect } from 'react';
import Modal from 'react-modal';
import { X, Plus, Grape, Car, Calendar } from 'lucide-react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import { API_URL } from '../config';
import toast from 'react-hot-toast';
import {
  WALUTY_FAKTURY,
  WalutaFakturySelection,
  formatPlMoney,
  getCenaColumnLabel,
  getKursToPlnLabel,
  getWalutaSymbol,
  isKursDostawyInputActive,
  isKursFakturyInputActive,
  isWalutaSelected,
  needsKursToPln,
  normalizeWalutaFaktury,
  parsePlNumber,
  roundMoney,
  cenaPoRabacie,
  sharesKursToPlnPair,
  toKursToPln,
  validatePurchaseKursPair,
  getPurchaseKursInvalidFields,
} from '../utils/receiptCurrency';
import {
  getHeaderInvalidFields,
  getRowInvalidFields,
  validatePurchaseReceipt,
} from '../../server/purchaseReceiptValidation.mjs';
import { PlMoneyInput } from './PlMoneyInput';
import { normalizeReceiptProductLines, receiptLineDataWaznosci } from '../utils/receiptProducts';
import { isPdfFile } from '../utils/receiptInvoice';
import "react-datepicker/dist/react-datepicker.css";
import "./DatePicker.css";

registerLocale('pl', pl);

const INVALID_FIELD = '!border-red-400';

const TYPY_TOWARU = [
  { value: 'czerwone', label: 'Czerwone', color: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'biale', label: 'Białe', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  { value: 'musujace', label: 'Musujące', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'bezalkoholowe', label: 'Bezalkoholowe', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'ferment', label: 'Ferment', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 'rozowe', label: 'Różowe', color: 'bg-pink-100 text-pink-800 border-pink-200' },
  { value: 'slodkie', label: 'Słodkie', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'aksesoria', label: 'Aksesoria', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { value: 'amber', label: 'Amber', color: 'bg-amber-100 text-amber-800 border-amber-200' }
];

const OBJETOSCI_WINA = [
  { value: '0.375', label: '0,375l' },
  { value: '0.5', label: '0,5l' },
  { value: '0.75', label: '0,75l' },
  { value: '1', label: '1l' },
  { value: '1.5', label: '1,5l' },
  { value: '3', label: '3l' }
];

const VAT_RATES = [
  { value: 0, label: '0%' },
  { value: 5, label: '5%' },
  { value: 8, label: '8%' },
  { value: 23, label: '23%' },
];

const HEADER_H = 'h-[30px] box-border';
const HEADER_FIELD = `${HEADER_H} px-3 py-0 border border-gray-300 rounded-md focus:outline-none font-sora text-xs`;
const HEADER_SELECT = `${HEADER_H} w-full px-2 pr-7 py-0 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-white appearance-none`;

const SelectChevron = () => (
  <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const parseWalutaSelection = (value?: string | null): WalutaFakturySelection => {
  const s = String(value || '').trim().toUpperCase();
  if (s === 'EUR' || s === 'PLN' || s === 'DKK') return s;
  return '';
};

const formatStoredKursToPln = (value?: number | null): string => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n === 1) return '';
  return formatPlMoney(n);
};



export type KodChangeBlockedDocument = {
  id: number;
  numer_zamowienia: string;
  typ: string;
  nazwa?: string;
  ilosc: number;
};

export type KodChangeConflict = {
  oldKod: string;
  newKod?: string | null;
  nazwa: string;
  documents: KodChangeBlockedDocument[];
};

export type ReceiptQtyConflict = {
  oldKod: string;
  nazwa: string;
  issued: number;
  requested: number;
  id?: number;
};

export type EditReceiptSubmitResult =
  | { ok: true }
  | { ok: false; kodBlocked?: { conflicts: KodChangeConflict[]; message?: string }; qtyBlocked?: { conflicts: ReceiptQtyConflict[]; message?: string } };

const ORDER_TYP_LABELS: Record<string, string> = {
  zamowienie: 'Zamówienie',
  odpisanie: 'Rozchód',
  zwrot: 'Zwrot',
  przychod: 'Przychód',
};

interface EditReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { 
    id: number;
    date: string; 
    sprzedawca: string; 
    wartosc_przyjecia_netto: number; 
    vat?: number;
    wartosc_przyjecia_brutto?: number;
    wartosc_dostawy: number;
    kurs_1?: number;
    kurs_2?: number;
    stawka_podatek_akcyzowy?: number;
    rabat?: number;
    waluta_przyjecia?: WalutaFakturySelection;
    waluta_dostawy?: WalutaFakturySelection;
    kursMode?: 'toPln';
    products: Array<{
      id?: number;
      kod: string;
      nazwa: string;
      kod_kreskowy?: string;
      ilosc: number;
      cena: number;
      dataWaznosci?: string;
      typ?: string;
      objetosc?: number;
      vat?: number;
    }>;
    product_invoice?: File | null;
    transport_invoice?: File | null;
  }) => void | Promise<EditReceiptSubmitResult | void>;
  receipt: {
    id: number;
    data_przyjecia: string;
    sprzedawca: string;
    wartosc_przyjecia_netto: number;
    vat?: number;
    wartosc_przyjecia_brutto?: number;
    wartosc_dostawy: number;
    kurs_1?: number;
    kurs_2?: number;
    stawka_podatek_akcyzowy?: number;
    rabat?: number;
    waluta_przyjecia?: string;
    waluta_dostawy?: string;
    products: Array<{
      id?: number;
      kod: string;
      nazwa: string;
      kod_kreskowy?: string;
      ilosc: number;
      cena: number;
      dataWaznosci?: string;
      typ?: string;
      objetosc?: number;
      vat?: number;
    }>;
    product_invoice?: string;
    transport_invoice?: string;
  } | null;
}

interface ProductRow {
  id?: number;
  kod: string;
  nazwa: string;
  kod_kreskowy: string;
  ilosc: string;
  cena: string;
  dataWaznosci: string;
  showDataWaznosci: boolean;
  typ: string;
  objetosc: string;
  vat: number;
}

const emptyRow = (): ProductRow => ({
  kod: '',
  nazwa: '',
  kod_kreskowy: '',
  ilosc: '',
  cena: '',
  dataWaznosci: '',
  showDataWaznosci: false,
  typ: '',
  objetosc: '',
  vat: 0,
});

export const EditReceiptModal: React.FC<EditReceiptModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  receipt
}) => {
  
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [sprzedawca, setSprzedawca] = useState('');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [productRows, setProductRows] = useState<ProductRow[]>([emptyRow()]);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const [kosztDostawy, setKosztDostawy] = useState('');
  const [productInvoice, setProductInvoice] = useState<File | null>(null);
  const [transportInvoice, setTransportInvoice] = useState<File | null>(null);
  const [existingProductInvoice, setExistingProductInvoice] = useState<string | null>(null);
  const [existingTransportInvoice, setExistingTransportInvoice] = useState<string | null>(null);
  const productFileInputRef = useRef<HTMLInputElement>(null);
  const transportFileInputRef = useRef<HTMLInputElement>(null);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);
  const [openObjetoscDropdownIndex, setOpenObjetoscDropdownIndex] = useState<number | null>(null);
  const [openVatDropdownIndex, setOpenVatDropdownIndex] = useState<number | null>(null);
  const [kursDostawy, setKursDostawy] = useState('');
  const [podatekAkcyzowy, setPodatekAkcyzowy] = useState('');
  const [rabat, setRabat] = useState('0,00');
  const [walutaFaktury, setWalutaFaktury] = useState<WalutaFakturySelection>('');
  const [walutaDostawy, setWalutaDostawy] = useState<WalutaFakturySelection>('');
  const [kursFaktury, setKursFaktury] = useState('');
  const [kwotaVat, setKwotaVat] = useState('');
  const [sumaBrutto, setSumaBrutto] = useState('');
  const [kodChangeConflicts, setKodChangeConflicts] = useState<KodChangeConflict[] | null>(null);
  const [qtyConflicts, setQtyConflicts] = useState<ReceiptQtyConflict[] | null>(null);
  const [qtyConflictMessage, setQtyConflictMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const skipBruttoSyncRef = useRef(false);

  // Вычисляем стоимость доставки на бутылку
  const calculateDeliveryCostPerUnit = () => {
    const totalBottles = productRows.reduce((total, row) => {
      if (row.typ === 'aksesoria') return total;
      return total + (parseFloat(row.ilosc.toString().replace(',', '.')) || 0);
    }, 0);
    
    const deliveryCost = parseFloat(kosztDostawy.replace(',', '.')) || 0;
    
    if (totalBottles > 0) {
      return (deliveryCost / totalBottles).toFixed(2);
    }
    return '0,00';
  };

  const kurs1Active = isKursDostawyInputActive(walutaDostawy);
  const kurs2Active = isKursFakturyInputActive(walutaDostawy, walutaFaktury);
  const kursError = validatePurchaseKursPair(walutaDostawy, kursDostawy, walutaFaktury, kursFaktury, kosztDostawy);
  const headerInvalid = getHeaderInvalidFields({
    hasDate: Boolean(selectedDate),
    sprzedawca,
    kosztDostawy,
    walutaDostawy,
    products: productRows,
    podatekAkcyzowy,
  });
  const kursInvalid = getPurchaseKursInvalidFields(walutaDostawy, kursDostawy, walutaFaktury, kursFaktury, kosztDostawy);
  const purchaseValidationError = validatePurchaseReceipt({
    hasDate: Boolean(selectedDate),
    sprzedawca,
    kosztDostawy,
    walutaDostawy,
    kursError,
    products: productRows,
    podatekAkcyzowy,
  });
  const canSubmit = !isSaving && !purchaseValidationError;
  const withInvalid = (className: string, invalid: boolean): string =>
    showFieldErrors && invalid ? `${className} ${INVALID_FIELD}` : className;

  // Инициализация данных при открытии модального окна
  useEffect(() => {
    if (isOpen && receipt) {
      // Обрабатываем случай, когда products приходит как JSON строка
      const productsArray = normalizeReceiptProductLines(receipt.products);
      
      if (Array.isArray(productsArray) && productsArray.length > 0) {
        // Парсим дату - поддерживаем разные форматы
        let selectedDateValue: Date | null = null;
        if (receipt.data_przyjecia) {
          if (receipt.data_przyjecia.includes('/')) {
            // Формат DD/MM/YYYY
            const [day, month, year] = receipt.data_przyjecia.split('/');
            selectedDateValue = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          } else if (receipt.data_przyjecia.includes('-')) {
            // Формат YYYY-MM-DD
            selectedDateValue = new Date(receipt.data_przyjecia);
          } else {
            // Попробуем парсить как есть
            selectedDateValue = new Date(receipt.data_przyjecia);
          }
        }
        setSelectedDate(selectedDateValue);
        
        setSprzedawca(receipt.sprzedawca || '');
        setKosztDostawy(formatPlMoney(Number(receipt.wartosc_dostawy) || 0));

        const walutaFakturyInit = parseWalutaSelection(receipt.waluta_przyjecia) || normalizeWalutaFaktury(receipt.waluta_przyjecia);
        const walutaDostawyInit = parseWalutaSelection(receipt.waluta_dostawy);
        setWalutaFaktury(walutaFakturyInit);
        setWalutaDostawy(walutaDostawyInit);
        setKursDostawy(needsKursToPln(walutaDostawyInit) ? formatStoredKursToPln(receipt.kurs_1) : '');
        setKursFaktury(
          needsKursToPln(walutaFakturyInit) && walutaFakturyInit !== walutaDostawyInit
            ? formatStoredKursToPln(receipt.kurs_2)
            : ''
        );

        const savedVat = Number(receipt.vat ?? 0);
        const savedBrutto = Number(receipt.wartosc_przyjecia_brutto ?? 0);
        skipBruttoSyncRef.current = savedBrutto > 0;
        setKwotaVat(savedVat > 0 ? formatPlMoney(savedVat) : '');
        setSumaBrutto(savedBrutto > 0 ? formatPlMoney(savedBrutto) : '');

        // ➡️ 2. Podatek akcyzowy
        setPodatekAkcyzowy(Number(receipt.stawka_podatek_akcyzowy ?? 0).toFixed(2).replace('.', ','));

        // ➡️ 3. Rabat
        if (receipt.rabat !== undefined && receipt.rabat !== null) {
          setRabat(Number(receipt.rabat).toFixed(2).replace('.', ','));
        } else {
          setRabat('0,00');
        }
        
        // Преобразуем продукты в формат для редактирования
        const formattedProducts: ProductRow[] = productsArray.map(product => ({
          id: product.id,
          kod: product.kod || '',
          nazwa: product.nazwa || '',
          kod_kreskowy: product.kod_kreskowy || (product as { ean?: string }).ean || '',
          ilosc: (product.ilosc || 0).toString(),
          cena: (product.cena || 0).toFixed(2).replace('.', ','),
          dataWaznosci: String(receiptLineDataWaznosci(product) || ''),
          showDataWaznosci: false,
          typ: product.typ || '',
          objetosc: product.objetosc != null ? String(product.objetosc) : '',
          vat: Number(product.vat) || 0
        }));
        
        setProductRows(formattedProducts.length > 0 ? formattedProducts : [emptyRow()]);
        
        // Сохраняем ссылки на существующие файлы
        setExistingProductInvoice(receipt.product_invoice || null);
        setExistingTransportInvoice(receipt.transport_invoice || null);
        setProductInvoice(null);
        setTransportInvoice(null);
              } else {
          setProductRows([emptyRow()]);
          setSelectedDate(null);
          setSprzedawca('');
          setKosztDostawy('');
          setProductInvoice(null);
          setTransportInvoice(null);
          setExistingProductInvoice(null);
          setExistingTransportInvoice(null);
        }
      } else {
        setProductRows([emptyRow()]);
        setSelectedDate(null);
        setSprzedawca('');
        setKosztDostawy('');
        setProductInvoice(null);
        setTransportInvoice(null);
        setExistingProductInvoice(null);
        setExistingTransportInvoice(null);
      }
  }, [isOpen, receipt]);

  // Закрываем выпадающие списки и календари при клике вне их области
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.dropdown-container') && !target.closest('button[onclick*="toggleDropdown"]')) {
        setOpenDropdownIndex(null);
        setOpenVatDropdownIndex(null);
      }
      if (!target.closest('.objetosc-dropdown-container') && !target.closest('button[onclick*="toggleObjetoscDropdown"]')) {
        setOpenObjetoscDropdownIndex(null);
      }
      
      // Закрываем календари при клике вне их области
      if (!target.closest('.react-datepicker') && !target.closest('button[title*="ważności"]')) {
        const newRows = [...productRows];
        let hasChanges = false;
        newRows.forEach(row => {
          if (row.showDataWaznosci) {
            row.showDataWaznosci = false;
            hasChanges = true;
          }
        });
        if (hasChanges) {
          setProductRows(newRows);
        }
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdownIndex(null);
        setOpenObjetoscDropdownIndex(null);
        setOpenVatDropdownIndex(null);
        // Закрываем календари при нажатии Escape
        const newRows = [...productRows];
        let hasChanges = false;
        newRows.forEach(row => {
          if (row.showDataWaznosci) {
            row.showDataWaznosci = false;
            hasChanges = true;
          }
        });
        if (hasChanges) {
          setProductRows(newRows);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [productRows]);

  const addNewRow = () => {
    setProductRows([...productRows, emptyRow()]);
  };

  const handleVatChange = (index: number, value: number) => {
    const newRows = [...productRows];
    newRows[index].vat = value;
    setProductRows(newRows);
    setOpenVatDropdownIndex(null);
  };

  const deleteRow = (index: number) => {
    if (productRows.length > 1) {
      const newRows = [...productRows];
      newRows.splice(index, 1);
      setProductRows(newRows);
    }
  };

  const toggleDataWaznosci = (index: number) => {
    const newRows = [...productRows];
    newRows[index].showDataWaznosci = !newRows[index].showDataWaznosci;
    setProductRows(newRows);
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

  const handleObjetoscChange = (index: number, value: string) => {
    const newRows = [...productRows];
    newRows[index].objetosc = value;
    setProductRows(newRows);
    setOpenObjetoscDropdownIndex(null);
  };

  const toggleObjetoscDropdown = (index: number) => {
    if (openObjetoscDropdownIndex === index) {
      setOpenObjetoscDropdownIndex(null);
    } else {
      setOpenObjetoscDropdownIndex(index);
    }
  };



  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Не запускаем перетаскивание, если кликнули на кнопку, input или другую интерактивную область
    if ((e.target as HTMLElement).closest('button') || 
        (e.target as HTMLElement).closest('input') ||
        (e.target as HTMLElement).closest('.react-datepicker') ||
        (e.target as HTMLElement).closest('[role="button"]') ||
        (e.target as HTMLElement).closest('.react-datepicker__input-container')) {
      return;
    }
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        requestAnimationFrame(() => {
          setPosition({
            x: e.clientX - dragStartPos.current.x,
            y: e.clientY - dragStartPos.current.y
          });
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);



  const handleProductFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log('📎 Product file selected (edit):', file);
    if (isPdfFile(file)) {
      setProductInvoice(file);
      console.log('✅ Product invoice set (edit):', file.name);
    } else {
      console.log('❌ Invalid product file type (edit):', file?.type);
    }
  };

  const handleTransportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log('📎 Transport file selected (edit):', file);
    if (isPdfFile(file)) {
      setTransportInvoice(file);
      console.log('✅ Transport invoice set (edit):', file.name);
    } else {
      console.log('❌ Invalid transport file type (edit):', file?.type);
    }
  };

  const handleProductFileClick = () => {
    productFileInputRef.current?.click();
  };

  const handleTransportFileClick = () => {
    transportFileInputRef.current?.click();
  };

  const handleSubmit = async () => {
    console.log('=== HANDLE SUBMIT DEBUG ===');
    console.log('selectedDate:', selectedDate);
    console.log('receipt:', receipt);
    
    if (isSaving || !receipt) {
      console.log('Early return: receipt is null or saving');
      return;
    }

    const formError = purchaseValidationError;
    if (formError) {
      setShowFieldErrors(true);
      toast.error(formError);
      return;
    }
    if (!selectedDate) return;

    const formattedProducts = productRows.map(row => ({
      id: row.id,
      kod: row.kod,
      nazwa: row.nazwa,
      kod_kreskowy: row.kod_kreskowy || '',
      ilosc: parseFloat(row.ilosc) || 0,
      cena: parseFloat(row.cena.replace(',', '.')) || 0,
      cena_zakupu_po_rabacie: cenaPoRabacie(parseFloat(row.cena.replace(',', '.')) || 0, parseFloat(rabat.replace(',', '.')) || 0),
      dataWaznosci: row.dataWaznosci || undefined,
      typ: row.typ || undefined,
      objetosc: row.objetosc ? parseFloat(row.objetosc) : undefined,
      vat: row.vat || 0
    }));

    const totalValue = formattedProducts.reduce((sum, product) => {
      return sum + (product.ilosc * product.cena);
    }, 0);

    const deliveryCost = parseFloat(kosztDostawy.replace(',', '.')) || 0;
    const rabatValue = parseFloat(rabat.replace(',', '.')) || 0;
    const wartoscZRabatem = totalValue * (1 - rabatValue / 100);
    const kursDostawyNumber = toKursToPln(walutaDostawy, kursDostawy);
    const kursFakturyNumber = toKursToPln(
      walutaFaktury,
      sharesKursToPlnPair(walutaDostawy, walutaFaktury) ? kursDostawy : kursFaktury
    );

    setIsSaving(true);
    try {
      const result = await onSubmit({
        id: receipt.id,
        date: selectedDate.toLocaleDateString('en-CA'),
        sprzedawca: sprzedawca,
        wartosc_przyjecia_netto: roundMoney(wartoscZRabatem),
        vat: roundMoney(kwotaVat),
        wartosc_przyjecia_brutto: roundMoney(sumaBrutto),
        wartosc_dostawy: roundMoney(deliveryCost),
        kurs_1: kursDostawyNumber,
        stawka_podatek_akcyzowy: roundMoney(podatekAkcyzowy),
        rabat: roundMoney(rabatValue),
        waluta_przyjecia: isWalutaSelected(walutaFaktury) ? walutaFaktury : undefined,
        waluta_dostawy: isWalutaSelected(walutaDostawy) ? walutaDostawy : undefined,
        kurs_2: kursFakturyNumber,
        kursMode: 'toPln',
        products: formattedProducts,
        product_invoice: productInvoice || null,
        transport_invoice: transportInvoice || null
      });

      if (result && result.ok === false && result.kodBlocked) {
        setKodChangeConflicts(result.kodBlocked.conflicts);
        return;
      }
      if (result && result.ok === false && result.qtyBlocked) {
        setQtyConflicts(result.qtyBlocked.conflicts);
        setQtyConflictMessage(result.qtyBlocked.message || null);
        return;
      }

      handleClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setKodChangeConflicts(null);
    setQtyConflicts(null);
    setQtyConflictMessage(null);
    setIsSaving(false);
    setSelectedDate(null);
    setPosition({ x: 0, y: 0 });
    setProductRows([emptyRow()]);
    setKosztDostawy('');
    setSprzedawca('');
    setProductInvoice(null);
    setTransportInvoice(null);
    setExistingProductInvoice(null);
    setExistingTransportInvoice(null);
    setKwotaVat('');
    setSumaBrutto('');
    setShowFieldErrors(false);
    setKursDostawy('');
    setKursFaktury('');
    setWalutaDostawy('');
    setWalutaFaktury('');
    setOpenVatDropdownIndex(null);
    onClose();
  };

  const calculateTotal = () => {
    const subtotal = productRows.reduce((sum, row) => {
      const ilosc = parseFloat(row.ilosc) || 0;
      const cena = parseFloat(row.cena.replace(',', '.')) || 0;
      return sum + (ilosc * cena);
    }, 0);
    const rabatValue = parseFloat(rabat.replace(',', '.')) || 0;
    return (subtotal * (1 - rabatValue / 100)).toFixed(2);
  };

  const kwotaNettoNumber = parsePlNumber(calculateTotal());

  const handleKwotaVatChange = (value: string) => {
    setKwotaVat(value);
    setSumaBrutto(formatPlMoney(kwotaNettoNumber + parsePlNumber(value)));
  };

  const handleSumaBruttoChange = (value: string) => {
    setSumaBrutto(value);
    setKwotaVat(formatPlMoney(Math.max(0, parsePlNumber(value) - kwotaNettoNumber)));
  };

  // Edit: Razem z DB (lub ręczne); przy zmianie cen/ilości — netto z pozycji, VAT = Razem − netto
  useEffect(() => {
    if (!isOpen) return;
    if (skipBruttoSyncRef.current) {
      skipBruttoSyncRef.current = false;
      return;
    }
    const razem = parsePlNumber(sumaBrutto);
    if (razem > 0) {
      setKwotaVat(formatPlMoney(Math.max(0, razem - kwotaNettoNumber)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keep Razem fixed; only recompute VAT from lines
  }, [productRows, rabat, kwotaNettoNumber, isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
                    style={{
                content: {
                  width: '1180px',
                  height: '680px',
                  maxWidth: '90%',
                  maxHeight: '90vh',
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
                  userSelect: 'none',
                  zIndex: 9999,
                  display: 'flex',
                  flexDirection: 'column'
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
        className="font-sora h-full min-h-0 flex flex-col overflow-hidden"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="flex justify-between items-center mb-6 select-none shrink-0" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-base font-semibold text-gray-800">Edytowanie zakupu</h2>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleClose(); }}
            className="text-red-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="shrink-0 space-y-3">
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-[200px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Data zakupu
                </label>
                <DatePicker
                  selected={selectedDate}
                  onChange={(date: Date | null) => setSelectedDate(date)}
                  locale="pl"
                  dateFormat="dd/MM/yyyy"
                  className={withInvalid("w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs", headerInvalid.date)}
                  placeholderText="Wybierz datę"
                  popperClassName="z-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Wartość dostawy
                </label>
                <div className="relative">
                  <PlMoneyInput
                    value={kosztDostawy}
                    onChange={setKosztDostawy}
                    className="w-[90px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                    placeholder="0,00"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">{getWalutaSymbol(walutaDostawy)}</span>
                </div>
              </div>
              <div className="w-[96px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Waluta dostawy</label>
                <div className="relative">
                  <select
                    value={walutaDostawy}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const next = raw === '' ? '' : normalizeWalutaFaktury(raw);
                      setWalutaDostawy(next);
                      if (!needsKursToPln(next)) {
                        setKursDostawy('');
                        return;
                      }
                      if (next === walutaFaktury && !kursDostawy && kursFaktury) {
                        setKursDostawy(kursFaktury);
                      }
                    }}
                    className={withInvalid(HEADER_SELECT, headerInvalid.walutaDostawy)}
                  >
                    <option value="">—</option>
                    {WALUTY_FAKTURY.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                  <SelectChevron />
                </div>
              </div>
              <div className="w-[96px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">{getKursToPlnLabel(1, kurs1Active ? walutaDostawy : '')}</label>
                {kurs1Active ? (
                  <PlMoneyInput value={kursDostawy} onChange={setKursDostawy} placeholder="0,00" className={withInvalid(`w-[96px] ${HEADER_FIELD} pr-6`, kursInvalid.kursDostawy)} />
                ) : (
                  <div className="w-[96px] h-[30px] rounded-md bg-gray-100 border border-gray-200" />
                )}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <div className="flex items-center w-48">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleProductFileChange}
                    className="hidden"
                    ref={productFileInputRef}
                  />
                  <button
                    type="button"
                    onClick={handleProductFileClick}
                    className="inline-flex items-center justify-center w-8 h-8 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                    title="Dodaj fakturę za towar"
                  >
                    <Grape className="h-4 w-4 text-gray-500" />
                  </button>
                  {productInvoice && (
                    <a
                      href={URL.createObjectURL(productInvoice)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline truncate max-w-24"
                      title={productInvoice.name}
                    >
                      {productInvoice.name}
                    </a>
                  )}
                                    {!productInvoice && existingProductInvoice && (
                    <a
                      href={`${API_URL}${existingProductInvoice}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline truncate max-w-24"
                      title="Faktura za towar (PDF)"

                    >
                      Faktura za towar (PDF)
                    </a>
                  )}
                </div>
                <div className="flex items-center w-48">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleTransportFileChange}
                    className="hidden"
                    ref={transportFileInputRef}
                  />
                  <button
                    type="button"
                    onClick={handleTransportFileClick}
                    className="inline-flex items-center justify-center w-8 h-8 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                    title="Dodaj fakturę za transport"
                  >
                    <Car className="h-4 w-4 text-gray-500" />
                  </button>
                  {transportInvoice && (
                    <a
                      href={URL.createObjectURL(transportInvoice)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline truncate max-w-24"
                      title={transportInvoice.name}
                    >
                      {transportInvoice.name}
                    </a>
                  )}
                                    {!transportInvoice && existingTransportInvoice && (
                    <a
                      href={`${API_URL}${existingTransportInvoice}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline truncate max-w-24"
                      title="Faktura za transport (PDF)"

                    >
                      Faktura za transport (PDF)
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-4">
            <div className="shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Sprzedawca
              </label>
              <input
                type="text"
                name="sprzedawca_plain"
                id="sprzedawca_plain_edit"
                autoComplete="nope"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                readOnly
                onFocus={(e) => { e.currentTarget.readOnly = false; }}
                value={sprzedawca}
                onChange={(e) => setSprzedawca(e.target.value)}
                placeholder="Wprowadź imię sprzedawcy"
                className={withInvalid("w-[300px] px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs read-only:bg-white", headerInvalid.sprzedawca)}
              />
            </div>
            <div className="shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Koszt/but. (średnie)
              </label>
              <div className="relative">
                <div className="w-[140px] px-3 py-1.5 border border-gray-300 rounded-md bg-gray-50 font-sora text-xs text-gray-600 pr-8">
                  {calculateDeliveryCostPerUnit().replace('.', ',')}
                </div>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">{getWalutaSymbol(walutaDostawy)}</span>
              </div>
            </div>
            <div className="w-[96px] shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Waluta faktury</label>
              <div className="relative">
                <select
                  value={walutaFaktury}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') { setWalutaFaktury(''); setKursFaktury(''); return; }
                    const next = normalizeWalutaFaktury(raw);
                    setWalutaFaktury(next);
                    if (!needsKursToPln(next)) {
                      setKursFaktury('');
                      return;
                    }
                    if (next === walutaDostawy) {
                      if (!kursDostawy && kursFaktury) setKursDostawy(kursFaktury);
                      setKursFaktury('');
                    }
                  }}
                  className={withInvalid(HEADER_SELECT, kursInvalid.walutaFaktury)}
                >
                  <option value="">—</option>
                  {WALUTY_FAKTURY.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
                <SelectChevron />
              </div>
            </div>
            <div className="w-[96px] shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">{getKursToPlnLabel(2, kurs2Active ? walutaFaktury : '')}</label>
              {kurs2Active ? (
                <PlMoneyInput value={kursFaktury} onChange={setKursFaktury} placeholder="0,00" className={withInvalid(`w-[96px] ${HEADER_FIELD} pr-6`, kursInvalid.kursFaktury)} />
              ) : (
                <div className="w-[96px] h-[30px] rounded-md bg-gray-100 border border-gray-200" />
              )}
            </div>
            <div className="shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Pod. akcyz. (l)
              </label>
              <div className="relative">
                <PlMoneyInput
                  value={podatekAkcyzowy}
                  onChange={setPodatekAkcyzowy}
                  placeholder="0,00"
                  className={withInvalid("w-[90px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs", headerInvalid.akcyza)}
                />
                <span className="absolute right-1 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">PLN</span>
              </div>
            </div>
            <div className="shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Rabat (%)
              </label>
              <div className="relative">
                <PlMoneyInput
                  value={rabat}
                  onChange={setRabat}
                  placeholder="0,00"
                  className="w-[90px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                />
                <span className="absolute right-1 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">%</span>
              </div>
            </div>
            </div>
          </div>

          <div className="mt-3 min-h-0 flex-1 flex flex-col overflow-hidden">
            <div className="shrink-0 grid grid-cols-12 gap-2 mb-2 pr-1">
              <div className="col-span-1.5">
                <span className="block text-xs font-medium text-gray-700 font-sora">Kod</span>
              </div>
              <div className="col-span-2">
                <span className="block text-xs font-medium text-gray-700 font-sora">Nazwa</span>
              </div>
              <div className="col-span-2">
                <span className="block text-xs font-medium text-gray-700 font-sora">Kod kreskowy</span>
              </div>
              <div className="col-span-1.5">
                <span className="block text-xs font-medium text-gray-700 font-sora">Ilość</span>
              </div>
              <div className="col-span-2.9">
                <span className="block text-xs font-medium text-gray-700 font-sora">{getCenaColumnLabel(walutaFaktury)}</span>
              </div>
              <div className="col-span-1.8 -mr-2">
                <span className="block text-xs font-medium text-gray-700 font-sora ml-1">Wartość</span>
              </div>
              <div className="col-span-1 ml-1">
                <span className="block text-xs font-medium text-gray-700 font-sora">VAT</span>
              </div>
              <div className="col-span-1.8 ml-1">
                <span className="block text-xs font-medium text-gray-700 font-sora ml-1">Typ</span>
              </div>
              <div className="col-span-3 ml-20">
                <span className="block text-xs font-medium text-gray-700 font-sora">Objętość</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-10">
            <div className="space-y-1">
            {productRows.map((row, index) => {
              const rowInvalid = getRowInvalidFields(row);
              return (
              <div key={index} className="grid grid-cols-12 gap-2 relative">
                <div className="col-span-1.5 relative">
                  <input
                    type="text"
                    className={withInvalid("w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs", rowInvalid.kod)}
                    placeholder="Kod"
                    value={row.kod}
                    onChange={(e) => {
                      const newRows = [...productRows];
                      newRows[index].kod = e.target.value;
                      setProductRows(newRows);
                    }}
                  />
                  {index === productRows.length - 1 && (
                    <button
                      onClick={addNewRow}
                      className="absolute -bottom-7 left-0 text-gray-400 hover:text-gray-600"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>
                <div className="col-span-2">
                  <input
                    type="text"
                    className={withInvalid("w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs", rowInvalid.nazwa)}
                    placeholder="Nazwa"
                    value={row.nazwa}
                    onChange={(e) => {
                      const newRows = [...productRows];
                      newRows[index].nazwa = e.target.value;
                      setProductRows(newRows);
                    }}
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="text"
                    className={withInvalid("w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs", rowInvalid.kod_kreskowy)}
                    placeholder="Kod kreskowy"
                    value={row.kod_kreskowy}
                    onChange={(e) => {
                      const newRows = [...productRows];
                      newRows[index].kod_kreskowy = e.target.value;
                      setProductRows(newRows);
                    }}
                  />
                </div>
                <div className="col-span-1.5">
                  <input
                    type="number"
                    className={withInvalid("w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none", rowInvalid.ilosc)}
                    placeholder="0"
                    value={row.ilosc}
                    onChange={(e) => {
                      const newRows = [...productRows];
                      const value = e.target.value;
                      if (value === '' || /^\d*$/.test(value)) {
                        newRows[index].ilosc = value;
                        setProductRows(newRows);
                      }
                    }}
                  />
                </div>
                <div className="col-span-2.9 relative">
                  <div className="relative">
                    <PlMoneyInput
                      value={row.cena}
                      onChange={(value) => {
                        const newRows = [...productRows];
                        newRows[index].cena = value;
                        setProductRows(newRows);
                      }}
                      className={withInvalid("w-[103%] px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs", rowInvalid.cena)}
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <div className="col-span-1.8 relative -mr-2">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={(() => {
                        const ilosc = parseFloat(row.ilosc) || 0;
                        const cena = parseFloat(row.cena.replace(',', '.')) || 0;
                        return (ilosc * cena).toFixed(2).replace('.', ',');
                      })()}
                      readOnly
                      className="w-[180%] px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-gray-50 ml-1"
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <div className="col-span-1 relative dropdown-container ml-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenVatDropdownIndex(openVatDropdownIndex === index ? null : index);
                      setOpenDropdownIndex(null);
                      setOpenObjetoscDropdownIndex(null);
                    }}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between bg-white"
                  >
                    <span className="truncate">{row.vat}%</span>
                    <svg className="w-3 h-3 ml-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {openVatDropdownIndex === index && (
                    <div className="absolute top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-40 overflow-y-auto w-full" onClick={(e) => e.stopPropagation()}>
                      {VAT_RATES.map((vat) => (
                        <button key={vat.value} type="button" onClick={() => handleVatChange(index, vat.value)} className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50">
                          {vat.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="absolute right-0 top-[2px] flex flex-row items-center gap-1 z-50 pointer-events-auto" style={{transform: 'translateX(0%)'}}>
                  <button
                    type="button"
                    onClick={() => toggleDataWaznosci(index)}
                    className={`p-1 focus:outline-none pointer-events-auto relative z-[60] ${row.dataWaznosci ? 'text-green-600 hover:text-green-700' : showFieldErrors && rowInvalid.dataWaznosci ? 'text-red-500 hover:text-red-600' : 'text-gray-500 hover:text-gray-700'}`}
                    title={row.dataWaznosci ? `Termin ważności: ${row.dataWaznosci}` : "Dodaj termin ważności"}
                  >
                    <Calendar size={16} />
                  </button>
                  <button
                    onClick={() => deleteRow(index)}
                    className="text-red-400 hover:text-red-600 pointer-events-auto"
                  >
                    <X size={16} />
                  </button>
                </div>
                {row.showDataWaznosci && (
                  <div className="absolute top-full left-0 mt-1 z-50" style={{ left: 'calc(100% - 280px)' }}>
                    <DatePicker
                      selected={row.dataWaznosci ? new Date(row.dataWaznosci) : null}
                      onChange={(date: Date | null) => {
                        const newRows = [...productRows];
                        newRows[index].dataWaznosci = date ? date.toISOString().split('T')[0] : '';
                        newRows[index].showDataWaznosci = false;
                        setProductRows(newRows);
                      }}
                      locale="pl"
                      dateFormat="dd/MM/yyyy"
                      inline
                      popperClassName="z-50"
                      minDate={new Date()}
                      onCalendarClose={() => {
                        const newRows = [...productRows];
                        newRows[index].showDataWaznosci = false;
                        setProductRows(newRows);
                      }}
                    />
                  </div>
                )}
                <div className="col-span-1.8 relative dropdown-container ml-1">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => toggleDropdown(index)}
                      className={withInvalid(`w-[200%] px-3 py-1.5 border rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ml-1 ${row.typ ? TYPY_TOWARU.find(t => t.value === row.typ)?.color || 'border-gray-300 bg-white' : 'border-gray-300 bg-white'}`, rowInvalid.typ)}
                    >
                      <span className="truncate">
                        {row.typ ? TYPY_TOWARU.find(t => t.value === row.typ)?.label || 'Wybierz typ' : 'Wybierz typ'}
                      </span>
                      <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdownIndex === index && (
                      <div 
                        className="absolute top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-40 overflow-y-auto w-[200%] ml-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {TYPY_TOWARU.map((typ) => (
                          <button
                            key={typ.value}
                            type="button"
                            onClick={() => handleTypChange(index, typ.value)}
                            className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 ${typ.color}`}
                          >
                            {typ.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="col-span-3 relative ml-20 objetosc-dropdown-container">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => toggleObjetoscDropdown(index)}
                      className={withInvalid(`w-[60%] px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ${row.objetosc ? 'bg-blue-50 border-blue-300' : 'bg-white'}`, rowInvalid.objetosc)}
                    >
                      <span className="truncate">
                        {row.objetosc ? OBJETOSCI_WINA.find(o => o.value === row.objetosc)?.label || row.objetosc : 'Wybierz'}
                      </span>
                      <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openObjetoscDropdownIndex === index && (
                      <div 
                        className="absolute top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-[100] max-h-40 overflow-y-auto w-[60%]"
                        onClick={(e) => e.stopPropagation()}
                        style={{ maxWidth: '200px' }}
                      >
                        {OBJETOSCI_WINA.map((objetosc) => (
                          <button
                            key={objetosc.value}
                            type="button"
                            onClick={() => handleObjetoscChange(index, objetosc.value)}
                            className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50"
                          >
                            {objetosc.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
            })}
            </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 pt-4 mt-1 relative flex items-center justify-center">
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            title={purchaseValidationError || undefined}
            className={`px-6 py-1.5 text-white text-xs rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-sora cursor-pointer ${
              !canSubmit
                ? 'bg-gray-400'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSaving ? 'Zapisywanie…' : 'Zapisz zmiany'}
          </button>
          <div className="absolute right-0 bottom-0 flex flex-col items-end gap-1">
            <div className="flex items-center">
              <span className="text-xs text-gray-700 mr-2">Kwota netto:</span>
              <div className="relative w-[88px]">
                <PlMoneyInput
                  value={formatPlMoney(kwotaNettoNumber)}
                  onChange={() => {}}
                  disabled
                  placeholder="0,00"
                  className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-right pr-6 bg-gray-100 text-gray-600 cursor-not-allowed"
                />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 pointer-events-none">
                  {getWalutaSymbol(walutaFaktury)}
                </span>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-xs text-gray-700 mr-2">Kwota VAT:</span>
              <div className="relative w-[88px]">
                <PlMoneyInput
                  value={kwotaVat}
                  onChange={handleKwotaVatChange}
                  placeholder="0,00"
                  className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-right pr-6"
                />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 pointer-events-none">
                  {getWalutaSymbol(walutaFaktury)}
                </span>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-xs font-bold text-gray-700 mr-2">Razem:</span>
              <div className="relative w-[88px]">
                <PlMoneyInput
                  value={sumaBrutto}
                  onChange={handleSumaBruttoChange}
                  placeholder="0,00"
                  className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-right pr-6 font-semibold"
                />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 pointer-events-none">
                  {getWalutaSymbol(walutaFaktury)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={!!kodChangeConflicts && kodChangeConflicts.length > 0}
        onRequestClose={() => setKodChangeConflicts(null)}
        style={{
          content: {
            width: '560px',
            maxWidth: '92%',
            maxHeight: '80vh',
            margin: 'auto',
            padding: '1.25rem',
            borderRadius: '0.5rem',
            overflow: 'auto',
          },
          overlay: { zIndex: 60, backgroundColor: 'rgba(0,0,0,0.45)' },
        }}
        ariaHideApp={false}
      >
        <div className="font-sora text-sm text-gray-900">
          <h3 className="text-base font-semibold mb-3">Nie można zmienić kodu produktu</h3>
          <p className="text-xs text-gray-600 mb-4">
            Istnieją dokumenty (zamówienia, rozchody, zwroty lub przychody) z tym kodem.
            Najpierw usuń lub zmień te pozycje, a następnie zapisz przyjęcie ponownie.
          </p>

          <div className="space-y-4">
            {kodChangeConflicts?.map((conflict) => (
              <div key={conflict.oldKod} className="border border-gray-200 rounded-md p-3">
                <p className="text-xs font-medium mb-1">
                  {conflict.newKod
                    ? <>Kod <span className="font-semibold">{conflict.oldKod}</span> → <span className="font-semibold">{conflict.newKod}</span></>
                    : <>Kod <span className="font-semibold">{conflict.oldKod}</span></>}
                  {conflict.nazwa ? (
                    <span className="text-gray-600"> ({conflict.nazwa})</span>
                  ) : null}
                </p>
                <ul className="mt-2 space-y-1">
                  {conflict.documents.map((doc) => (
                    <li key={`${conflict.oldKod}-${doc.id}`} className="text-xs text-gray-800 flex justify-between gap-3">
                      <span>
                        <span className="font-medium">{ORDER_TYP_LABELS[doc.typ] || doc.typ}</span>
                        {' '}
                        {doc.numer_zamowienia}
                      </span>
                      <span className="shrink-0">{doc.ilosc} szt.</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex justify-end mt-5">
            <button
              type="button"
              onClick={() => setKodChangeConflicts(null)}
              className="px-4 py-2 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700"
            >
              Zamknij
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!qtyConflicts && qtyConflicts.length > 0}
        onRequestClose={() => { setQtyConflicts(null); setQtyConflictMessage(null); }}
        style={{
          content: {
            width: '560px',
            maxWidth: '92%',
            maxHeight: '80vh',
            margin: 'auto',
            padding: '1.25rem',
            borderRadius: '0.5rem',
            overflow: 'auto',
          },
          overlay: { zIndex: 60, backgroundColor: 'rgba(0,0,0,0.45)' },
        }}
        ariaHideApp={false}
      >
        <div className="font-sora text-sm text-gray-900">
          <h3 className="text-base font-semibold mb-3">Nie można zmniejszyć ilości</h3>
          <p className="text-xs text-gray-600 mb-4">
            {qtyConflictMessage ||
              'Z partii tego przyjęcia towar został już wydany. Ilość w dokumencie nie może być mniejsza niż wydana.'}
          </p>

          <div className="space-y-4">
            {qtyConflicts?.map((conflict) => (
              <div key={conflict.oldKod} className="border border-gray-200 rounded-md p-3">
                <p className="text-xs font-medium mb-1">
                  Kod <span className="font-semibold">{conflict.oldKod}</span>
                  {conflict.nazwa ? (
                    <span className="text-gray-600"> ({conflict.nazwa})</span>
                  ) : null}
                </p>
                <p className="text-xs text-gray-800 mt-2">
                  Wydano {conflict.issued} szt., próba zapisu: {conflict.requested} szt.
                </p>
              </div>
            ))}
          </div>

          <div className="flex justify-end mt-5">
            <button
              type="button"
              onClick={() => { setQtyConflicts(null); setQtyConflictMessage(null); }}
              className="px-4 py-2 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700"
            >
              Zamknij
            </button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}; 