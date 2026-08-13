  import React, { useState, useRef, useEffect } from 'react';
import Modal from 'react-modal';
import { X, Plus, Grape, Car, Calendar } from 'lucide-react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import { API_URL } from '../config';
import {
  WALUTY_FAKTURY,
  WalutaFaktury,
  formatKursEurPlnForDisplay,
  formatKursFakturyForDisplay,
  formatKursPlnEurForDisplay,
  formatPlMoney,
  getCenaColumnLabel,
  getPrimaryKursLabel,
  getSecondaryKursLabel,
  getWalutaSymbol,
  isKursEurPlnActive,
  isKursFakturyActive,
  isPrimaryKursActive,
  isSecondaryKursActive,
  normalizeWalutaFaktury,
  parsePlNumber,
  resolveKursPlnEurStandard,
  toStandardKursEurPln,
  toStandardKursFaktury,
  usesPrimaryKursFakturyState,
  validateRequiredKurs,
} from '../utils/receiptCurrency';
import { PlMoneyInput } from './PlMoneyInput';
import "react-datepicker/dist/react-datepicker.css";
import "./DatePicker.css";

registerLocale('pl', pl);

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

export type EditReceiptSubmitResult =
  | { ok: true }
  | { ok: false; kodBlocked?: { conflicts: KodChangeConflict[]; message?: string } };

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
    wartosc: number; 
    kosztDostawy: number;
    aktualnyKurs?: number;
    podatekAkcyzowy?: number;
    rabat?: number;
    walutaFaktury?: WalutaFaktury;
    kursFaktury?: number;
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
    productInvoice?: File | null;
    transportInvoice?: File | null;
  }) => void | Promise<EditReceiptSubmitResult | void>;
  receipt: {
    id: number;
    dataPrzyjecia: string;
    sprzedawca: string;
    wartosc: number;
    kosztDostawy: number;
    aktualnyKurs?: number;
    podatekAkcyzowy?: number;
    aktualny_kurs?: number;
    podatek_akcyzowy?: number;
    rabat?: number;
    waluta_faktury?: string;
    walutaFaktury?: string;
    kurs_faktury?: number;
    kursFaktury?: number;
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
  } | null;
}

interface ProductRow {
  kod: string;
  nazwa: string;
  kod_kreskowy: string;
  ilosc: string;
  cena: string;
  dataWaznosci: string;
  showDataWaznosci: boolean;
  typ: string;
  objetosc: string;
}

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
  const [productRows, setProductRows] = useState<ProductRow[]>([{ kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', cena: '', dataWaznosci: '', showDataWaznosci: false, typ: '', objetosc: '' }]);
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
  const [aktualnyKurs, setAktualnyKurs] = useState('0,00');
  const [podatekAkcyzowy, setPodatekAkcyzowy] = useState('0,00');
  const [rabat, setRabat] = useState('0,00');
  const [walutaFaktury, setWalutaFaktury] = useState<WalutaFaktury>('EUR');
  const [kursFaktury, setKursFaktury] = useState('');
  const [kwotaVat, setKwotaVat] = useState('');
  const [sumaBrutto, setSumaBrutto] = useState('');
  const [kodChangeConflicts, setKodChangeConflicts] = useState<KodChangeConflict[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const skipBruttoSyncRef = useRef(false);

  // Вычисляем стоимость доставки на бутылку
  const calculateDeliveryCostPerUnit = () => {
    const totalBottles = productRows.reduce((total, row) => {
      const quantity = parseFloat(row.ilosc.toString().replace(',', '.')) || 0;
      return total + quantity;
    }, 0);
    
    const deliveryCost = parseFloat(kosztDostawy.replace(',', '.')) || 0;
    
    if (totalBottles > 0) {
      return (deliveryCost / totalBottles).toFixed(2);
    }
    return '0,00';
  };

  const primaryKursValue = usesPrimaryKursFakturyState(walutaFaktury) ? kursFaktury : aktualnyKurs;
  const setPrimaryKursValue = (value: string) => {
    if (usesPrimaryKursFakturyState(walutaFaktury)) setKursFaktury(value);
    else setAktualnyKurs(value);
  };

  const hasValidProducts = productRows.some(row =>
    row.kod && row.nazwa && row.ilosc && row.cena
  );
  const canSubmit =
    !isSaving &&
    Boolean(selectedDate) &&
    hasValidProducts &&
    !validateRequiredKurs(walutaFaktury, aktualnyKurs, kursFaktury);

  // Инициализация данных при открытии модального окна
  useEffect(() => {
    if (isOpen && receipt) {
      // Обрабатываем случай, когда products приходит как JSON строка
      let productsArray: any[] = [];
      if (receipt.products) {
        if (typeof receipt.products === 'string') {
          try {
            productsArray = JSON.parse(receipt.products);
          } catch (error) {
            console.error('Error parsing products JSON:', error);
            productsArray = [];
          }
        } else if (Array.isArray(receipt.products)) {
          productsArray = receipt.products;
        }
      }
      
      if (Array.isArray(productsArray) && productsArray.length > 0) {
        // Парсим дату - поддерживаем разные форматы
        let selectedDateValue: Date | null = null;
        if (receipt.dataPrzyjecia) {
          if (receipt.dataPrzyjecia.includes('/')) {
            // Формат DD/MM/YYYY
            const [day, month, year] = receipt.dataPrzyjecia.split('/');
            selectedDateValue = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          } else if (receipt.dataPrzyjecia.includes('-')) {
            // Формат YYYY-MM-DD
            selectedDateValue = new Date(receipt.dataPrzyjecia);
          } else {
            // Попробуем парсить как есть
            selectedDateValue = new Date(receipt.dataPrzyjecia);
          }
        }
        setSelectedDate(selectedDateValue);
        
        setSprzedawca(receipt.sprzedawca || '');
        setKosztDostawy((receipt.kosztDostawy || 0).toFixed(2).replace('.', ','));

        // ➡️ Waluta faktury + kurs faktury
        const waluta = normalizeWalutaFaktury(receipt.waluta_faktury ?? receipt.walutaFaktury);
        setWalutaFaktury(waluta);
        const standardKursFaktury = Number(receipt.kurs_faktury ?? receipt.kursFaktury ?? 1);
        const standardKursEurPln = Number(receipt.aktualny_kurs ?? receipt.aktualnyKurs ?? 1);

        if (waluta === 'PLN') {
          const kursPln = resolveKursPlnEurStandard(standardKursFaktury, standardKursEurPln);
          setKursFaktury(formatKursPlnEurForDisplay(kursPln));
          setAktualnyKurs('');
        } else if (waluta === 'DKK') {
          setKursFaktury(formatKursFakturyForDisplay('DKK', standardKursFaktury));
          setAktualnyKurs(formatKursEurPlnForDisplay(standardKursEurPln));
        } else {
          setKursFaktury('');
          setAktualnyKurs(formatKursEurPlnForDisplay(standardKursEurPln));
        }

        // wartosc w DB = Razem; VAT przybliżamy z Razem − netto pozycji
        const savedRazem = Number(receipt.wartosc ?? 0);
        const rabatVal = Number(receipt.rabat ?? 0) || 0;
        const productsNetto = productsArray.reduce((sum, p) => {
          const ilosc = Number(p.ilosc) || 0;
          const cena = Number(p.cena) || 0;
          return sum + ilosc * cena;
        }, 0);
        const nettoZRabatem = Math.round(productsNetto * (1 - rabatVal / 100) * 100) / 100;
        const vatApprox = Number.isFinite(savedRazem) && savedRazem > 0
          ? Math.max(0, Math.round((savedRazem - nettoZRabatem) * 100) / 100)
          : 0;
        skipBruttoSyncRef.current = true;
        setKwotaVat(vatApprox > 0 ? formatPlMoney(vatApprox) : '');
        if (Number.isFinite(savedRazem) && savedRazem > 0) {
          setSumaBrutto(formatPlMoney(savedRazem));
        } else {
          skipBruttoSyncRef.current = false;
          setSumaBrutto('');
        }

        // ➡️ 2. Podatek akcyzowy
        if (receipt.podatek_akcyzowy !== undefined && receipt.podatek_akcyzowy !== null) {
          setPodatekAkcyzowy(Number(receipt.podatek_akcyzowy).toFixed(2).replace('.', ','));
        } else if (receipt.podatekAkcyzowy !== undefined && receipt.podatekAkcyzowy !== null) {
          setPodatekAkcyzowy(String(receipt.podatekAkcyzowy).replace('.', ','));
        } else {
          const firstProductAkc = productsArray[0]?.podatekAkcyzowyPerLiter ?? productsArray[0]?.podatekAkcyzowy ?? productsArray[0]?.podatek_akcyzowy ?? 0;
          setPodatekAkcyzowy(firstProductAkc.toFixed(2).replace('.', ','));
        }

        // ➡️ 3. Rabat
        if (receipt.rabat !== undefined && receipt.rabat !== null) {
          setRabat(Number(receipt.rabat).toFixed(2).replace('.', ','));
        } else {
          setRabat('0,00');
        }
        
        // Преобразуем продукты в формат для редактирования
        const formattedProducts: ProductRow[] = productsArray.map(product => ({
          kod: product.kod || '',
          nazwa: product.nazwa || '',
          kod_kreskowy: product.kod_kreskowy || product.ean || '', // Поддерживаем обратную совместимость
          ilosc: (product.ilosc || 0).toString(),
          cena: (product.cena || 0).toFixed(2).replace('.', ','),
          dataWaznosci: product.dataWaznosci || '',
          showDataWaznosci: false,
          typ: product.typ || product.typTowaru || '',
          objetosc: product.objetosc || ''
        }));
        
        setProductRows(formattedProducts.length > 0 ? formattedProducts : [{ kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', cena: '', dataWaznosci: '', showDataWaznosci: false, typ: '', objetosc: '' }]);
        
        // Сохраняем ссылки на существующие файлы
        setExistingProductInvoice(receipt.productInvoice || null);
        setExistingTransportInvoice(receipt.transportInvoice || null);
        setProductInvoice(null);
        setTransportInvoice(null);
              } else {
          setProductRows([{ kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', cena: '', dataWaznosci: '', showDataWaznosci: false, typ: '', objetosc: '' }]);
          setSelectedDate(null);
          setSprzedawca('');
          setKosztDostawy('');
          setProductInvoice(null);
          setTransportInvoice(null);
          setExistingProductInvoice(null);
          setExistingTransportInvoice(null);
        }
      } else {
        setProductRows([{ kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', cena: '', dataWaznosci: '', showDataWaznosci: false, typ: '', objetosc: '' }]);
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
    setProductRows([...productRows, { kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', cena: '', dataWaznosci: '', showDataWaznosci: false, typ: '', objetosc: '' }]);
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
    if (file && file.type === 'application/pdf') {
      setProductInvoice(file);
      console.log('✅ Product invoice set (edit):', file.name);
    } else {
      console.log('❌ Invalid product file type (edit):', file?.type);
    }
  };

  const handleTransportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log('📎 Transport file selected (edit):', file);
    if (file && file.type === 'application/pdf') {
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
    
    if (!selectedDate || !receipt || isSaving) {
      console.log('Early return: selectedDate or receipt is null');
      return;
    }

    const validProducts = productRows.filter(row => 
      row.kod && row.nazwa && row.ilosc && row.cena
    );

    if (validProducts.length === 0) {
      console.log('Early return: no valid products');
      return;
    }

    if (validateRequiredKurs(walutaFaktury, aktualnyKurs, kursFaktury)) {
      return;
    }

    const formattedProducts = validProducts.map(row => ({
      kod: row.kod,
      nazwa: row.nazwa,
      kod_kreskowy: row.kod_kreskowy || '',
      ilosc: parseFloat(row.ilosc) || 0,
      cena: parseFloat(row.cena.replace(',', '.')) || 0,
      dataWaznosci: row.dataWaznosci || undefined,
      typ: row.typ || undefined,
      objetosc: row.objetosc ? parseFloat(row.objetosc) : undefined
    }));

    const totalValue = formattedProducts.reduce((sum, product) => {
      return sum + (product.ilosc * product.cena);
    }, 0);

    const deliveryCost = parseFloat(kosztDostawy.replace(',', '.')) || 0;
    const rabatValue = parseFloat(rabat.replace(',', '.')) || 0;
    const wartoscZRabatem = totalValue * (1 - rabatValue / 100);

    const aktualnyKursStandard = toStandardKursEurPln(walutaFaktury, aktualnyKurs);
    const kursFakturyStandard = toStandardKursFaktury(walutaFaktury, kursFaktury);

    const razem = parsePlNumber(sumaBrutto) || (wartoscZRabatem + parsePlNumber(kwotaVat));

    setIsSaving(true);
    try {
      const result = await onSubmit({
        id: receipt.id,
        date: selectedDate.toLocaleDateString('en-CA'),
        sprzedawca: sprzedawca,
        wartosc: razem,
        kosztDostawy: deliveryCost,
        aktualnyKurs: aktualnyKursStandard,
        podatekAkcyzowy: parseFloat(podatekAkcyzowy.replace(',', '.')) || 0,
        rabat: rabatValue,
        walutaFaktury,
        kursFaktury: kursFakturyStandard,
        products: formattedProducts,
        productInvoice: productInvoice || null,
        transportInvoice: transportInvoice || null
      });

      if (result && result.ok === false && result.kodBlocked) {
        setKodChangeConflicts(result.kodBlocked.conflicts);
        return;
      }

      handleClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setKodChangeConflicts(null);
    setIsSaving(false);
    setSelectedDate(null);
    setPosition({ x: 0, y: 0 });
    setProductRows([{ kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', cena: '', dataWaznosci: '', showDataWaznosci: false, typ: '', objetosc: '' }]);
    setKosztDostawy('');
    setSprzedawca('');
    setProductInvoice(null);
    setTransportInvoice(null);
    setExistingProductInvoice(null);
    setExistingTransportInvoice(null);
    setKwotaVat('');
    setSumaBrutto('');
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
                  width: '1000px',
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
          <div className="space-y-4 shrink-0">
            <div className="flex">
              <div className="w-[200px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Data zakupu
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
              <div className="w-[200px] flex items-start">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                    Koszt dostawy
                  </label>
                  <div className="relative">
                    <PlMoneyInput
                      value={kosztDostawy}
                      onChange={setKosztDostawy}
                      className="w-[90px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                      placeholder="0,00"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">€</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between w-full max-w-md">
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
          </div>

          <div className="shrink-0 space-y-2 mt-2">
          <div className="flex gap-4 mb-1">
            <div className="w-[300px] shrink-0" aria-hidden="true" />
            <div className="w-[140px] shrink-0" aria-hidden="true" />
            <div className="shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                {getPrimaryKursLabel(walutaFaktury)}
              </label>
              {isPrimaryKursActive(walutaFaktury) ? (
                <div className="relative">
                  <PlMoneyInput
                    value={primaryKursValue}
                    onChange={setPrimaryKursValue}
                    placeholder="0,00"
                    className="w-[90px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                  />
                </div>
              ) : (
                <div className="w-[90px] h-[30px] rounded-md bg-gray-100 border border-gray-200" aria-hidden="true" />
              )}
            </div>
          </div>

          <div className="flex flex-nowrap gap-4">
            <div className="shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Sprzedawca
              </label>
              <input
                type="text"
                value={sprzedawca}
                onChange={(e) => setSprzedawca(e.target.value)}
                placeholder="Wprowadź imię sprzedawcy"
                className="w-[300px] px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
              />
            </div>
            <div className="shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Koszt dostawy butelki
              </label>
              <div className="w-[140px] px-3 py-1.5 border border-gray-300 rounded-md bg-gray-50 font-sora text-xs text-gray-600">
                {calculateDeliveryCostPerUnit().replace('.', ',')} €
              </div>
            </div>
            <div className="shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                {getSecondaryKursLabel(walutaFaktury)}
              </label>
              {isSecondaryKursActive(walutaFaktury) ? (
                <div className="relative">
                  <PlMoneyInput
                    value={aktualnyKurs}
                    onChange={setAktualnyKurs}
                    placeholder="0,00"
                    className="w-[90px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                  />
                </div>
              ) : (
                <div className="w-[90px] h-[30px] rounded-md bg-gray-100 border border-gray-200" aria-hidden="true" />
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
                  className="w-[90px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                />
                <span className="absolute right-1 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">zł</span>
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
            <div className="shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Waluta
              </label>
              <select
                value={walutaFaktury}
                onChange={(e) => {
                  const next = normalizeWalutaFaktury(e.target.value);
                  setWalutaFaktury(next);
                  if (!isKursFakturyActive(next)) setKursFaktury('');
                  if (!isKursEurPlnActive(next)) setAktualnyKurs('');
                }}
                className="w-[80px] px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-white"
              >
                {WALUTY_FAKTURY.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
          </div>
          </div>

          <div className="mt-3 min-h-0 flex-1 flex flex-col overflow-hidden">
            <div className="shrink-0 grid grid-cols-12 gap-1 mb-2 pr-1">
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
              <div className="col-span-1.8 ml-1">
                <span className="block text-xs font-medium text-gray-700 font-sora ml-1">Typ</span>
              </div>
              <div className="col-span-3 ml-20">
                <span className="block text-xs font-medium text-gray-700 font-sora">Objętość</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-10">
            <div className="space-y-1">
            {productRows.map((row, index) => (
              <div key={index} className="grid grid-cols-12 gap-1 relative">
                <div className="col-span-1.5 relative">
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
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
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
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
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
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
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                      className="w-[103%] px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
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
                <div className="absolute right-0 top-[2px] flex flex-row items-center gap-1 z-50 pointer-events-auto" style={{transform: 'translateX(0%)'}}>
                  <button
                    type="button"
                    onClick={() => toggleDataWaznosci(index)}
                    className={`p-1 focus:outline-none pointer-events-auto relative z-[60] ${row.dataWaznosci ? 'text-green-600 hover:text-green-700' : 'text-gray-500 hover:text-gray-700'}`}
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
                      className={`w-[200%] px-3 py-1.5 border rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ml-1 ${row.typ ? TYPY_TOWARU.find(t => t.value === row.typ)?.color || 'border-gray-300 bg-white' : 'border-gray-300 bg-white'}`}
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
                      className={`w-[60%] px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ${row.objetosc ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}
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
            ))}
            </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 pt-4 mt-1 relative flex items-center justify-center">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`px-6 py-1.5 text-white text-xs rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-sora ${
              !canSubmit
                ? 'bg-gray-400 cursor-not-allowed' 
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
    </Modal>
  );
}; 