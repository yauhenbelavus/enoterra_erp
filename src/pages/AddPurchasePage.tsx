import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Grape, Car, Calendar, FileText, X } from 'lucide-react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';
import '../components/DatePicker.css';
import toast from 'react-hot-toast';
import {
  WALUTY_FAKTURY,
  WalutaFakturySelection,
  getKursToPlnLabel,
  getWalutaSymbol,
  isKursDostawyInputActive,
  isKursFakturyInputActive,
  isWalutaSelected,
  needsKursToPln,
  normalizeWalutaFaktury,
  sharesKursToPlnPair,
  roundMoney,
  toKursToPln,
  validatePurchaseKursPair,
  getPurchaseKursInvalidFields,
} from '../utils/receiptCurrency';
import {
  getHeaderInvalidFields,
  getRowInvalidFields,
  validatePurchaseReceipt,
} from '../../server/purchaseReceiptValidation.mjs';
import { PlMoneyInput } from '../components/PlMoneyInput';
import { ZAKUP_PATH } from '../routes';
import { Product } from '../types/Product';
import { normalizeReceiptProductLines } from '../utils/receiptProducts';
import { cancelScheduledInvoiceOpen, scheduleInvoiceOpen } from '../utils/receiptInvoice';

registerLocale('pl', pl);

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

interface ProductReceipt {
  id?: number;
  data_przyjecia: string;
  sprzedawca: string;
  wartosc_przyjecia_netto: number;
  vat?: number;
  wartosc_przyjecia_brutto?: number;
  wartosc_dostawy: number;
  rabat?: number;
  waluta_przyjecia?: string;
  waluta_dostawy?: string;
  kurs_1?: number;
  kurs_2?: number;
  stawka_podatek_akcyzowy?: number;
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
  product_invoice?: string;
  transport_invoice?: string;
}

interface AddPurchasePageProps {
  onReceiptsChange: (receipts: ProductReceipt[]) => void;
  onProductsChange: (products: Product[]) => void;
}

interface ParsedPurchaseProduct {
  nazwa: string;
  ilosc: string;
  cena: string;
  cenaPelna?: number;
  kod?: string;
  kod_kreskowy?: string;
  typ?: string;
  objetosc?: string;
  catalog_matched?: boolean;
}

interface ProductRow {
  kod: string;
  nazwa: string;
  kod_kreskowy: string;
  ilosc: string;
  cena: string;
  cenaPelna?: number;
  dataWaznosci?: Date | null;
  showDataWaznosci: boolean;
  vat: number;
  typ: string;
  objetosc: string;
}

interface OcrPurchaseInvoiceResponse {
  success: boolean;
  error?: string;
  data?: {
    sprzedawca: string;
    waluta?: string;
    suma_netto?: string;
    suma_vat?: string;
    suma_brutto?: string;
    products: ParsedPurchaseProduct[];
  };
}

const TYPY_TOWARU = [
  { value: 'czerwone', label: 'Czerwone', color: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'biale', label: 'Białe', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  { value: 'musujace', label: 'Musujące', color: 'bg-yellow-50 text-yellow-600 border-yellow-100' },
  { value: 'bezalkoholowe', label: 'Bezalko', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'ferment', label: 'Ferment', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 'rozowe', label: 'Różowe', color: 'bg-pink-100 text-pink-800 border-pink-200' },
  { value: 'slodkie', label: 'Słodkie', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'aksesoria', label: 'Aksesoria', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { value: 'amber', label: 'Amber', color: 'bg-amber-100 text-amber-800 border-amber-200' },
];

const OBJETOSCI_WINA = [
  { value: '0.375', label: '0,375l' },
  { value: '0.5', label: '0,5l' },
  { value: '0.75', label: '0,75l' },
  { value: '1', label: '1l' },
  { value: '1.5', label: '1,5l' },
  { value: '3', label: '3l' },
];

const VAT_RATES = [
  { value: 0, label: '0%' },
  { value: 5, label: '5%' },
  { value: 8, label: '8%' },
  { value: 23, label: '23%' },
];

const getTodayDate = () => new Date();
const parsePlNumber = (value: string) => parseFloat(value.replace(',', '.')) || 0;
const formatPlMoney = (value: number) => value.toFixed(2).replace('.', ',');

const getRowLineValue = (row: ProductRow): number => {
  const ilosc = parseFloat(row.ilosc) || 0;
  const cenaPelna = row.cenaPelna ?? parsePlNumber(row.cena);
  return ilosc * cenaPelna;
};

const getRowLineBrutto = (row: ProductRow): number =>
  getRowLineValue(row) * (1 + (row.vat || 0) / 100);

const getRowLineVat = (row: ProductRow): number =>
  getRowLineValue(row) * (row.vat || 0) / 100;

const getRowKosztButWgWartosci = (row: ProductRow, totalValue: number, deliveryCost: number): number => {
  if (row.typ === 'aksesoria') return 0;
  const qty = parseFloat(row.ilosc) || 0;
  const lineValue = getRowLineValue(row);
  if (totalValue <= 0 || qty <= 0) return 0;
  return (deliveryCost * lineValue) / (totalValue * qty);
};

const emptyRow = (): ProductRow => ({
  kod: '',
  nazwa: '',
  kod_kreskowy: '',
  ilosc: '',
  cena: '',
  dataWaznosci: null,
  showDataWaznosci: false,
  vat: 0,
  typ: '',
  objetosc: '',
});

const HEADER_H = 'h-[30px] box-border';
const HEADER_FIELD = `${HEADER_H} px-3 py-0 border border-gray-300 rounded-md focus:outline-none font-sora text-xs`;
const HEADER_SELECT = `${HEADER_H} w-full px-2 pr-7 py-0 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-white appearance-none`;
const INVALID_FIELD = '!border-red-400';
const ROW_INPUT = 'px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs';
const PRODUCT_ROW_GRID = 'grid gap-2 min-w-0 [grid-template-columns:90px_minmax(0,1fr)_132px_68px_78px_91px_70px_91px_114px_84px_81px_52px]';
const PRODUCT_ROW_HEADER = `${PRODUCT_ROW_GRID} items-end justify-items-stretch`;
const PRODUCT_ROW_FIELDS = `${PRODUCT_ROW_GRID} items-center`;

const SelectChevron = () => (
  <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const loadProductReceiptsFromDb = async (): Promise<ProductReceipt[]> => {
  try {
    const response = await fetch(`${API_URL}/api/product-receipts`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.map((receipt: any) => ({
      id: receipt.id,
      data_przyjecia: receipt.data_przyjecia,
      sprzedawca: receipt.sprzedawca || '',
      wartosc_przyjecia_netto: receipt.wartosc_przyjecia_netto ?? 0,
      vat: receipt.vat ?? 0,
      wartosc_przyjecia_brutto: receipt.wartosc_przyjecia_brutto ?? 0,
      wartosc_dostawy: receipt.wartosc_dostawy ?? 0,
      rabat: receipt.rabat ?? 0,
      waluta_przyjecia: receipt.waluta_przyjecia ?? 'EUR',
      waluta_dostawy: receipt.waluta_dostawy,
      kurs_1: receipt.kurs_1 ?? 1,
      kurs_2: receipt.kurs_2 ?? 1,
      stawka_podatek_akcyzowy: receipt.stawka_podatek_akcyzowy ?? 0,
      products: normalizeReceiptProductLines(receipt.products),
      product_invoice: receipt.product_invoice,
      transport_invoice: receipt.transport_invoice,
    }));
  } catch {
    return [];
  }
};

export const AddPurchasePage: React.FC<AddPurchasePageProps> = ({
  onReceiptsChange,
  onProductsChange,
}) => {
  const navigate = useNavigate();

  const [selectedDate, setSelectedDate] = useState<Date | null>(getTodayDate());
  const [sprzedawca, setSprzedawca] = useState('');
  const [productRows, setProductRows] = useState<ProductRow[]>([emptyRow()]);
  const [kosztDostawy, setKosztDostawy] = useState('');
  const [productInvoice, setProductInvoice] = useState<File | null>(null);
  const [transportInvoice, setTransportInvoice] = useState<File | null>(null);
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
  const [kwotaNetto, setKwotaNetto] = useState('');
  const [sumaBrutto, setSumaBrutto] = useState('');
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showFieldErrors, setShowFieldErrors] = useState(false);

  const productFileInputRef = useRef<HTMLInputElement>(null);
  const transportFileInputRef = useRef<HTMLInputElement>(null);
  const ocrFileInputRef = useRef<HTMLInputElement>(null);
  const skipBruttoSyncRef = useRef(false);
  const invoiceClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invoicePreviewWindowRef = useRef<Window | null>(null);

  const pickInvoiceFile = (input: HTMLInputElement | null) => {
    if (!input) return;
    input.value = '';
    input.click();
  };

  const handleInvoiceButtonClick = (file: File | null, input: HTMLInputElement | null) => {
    if (!file) {
      pickInvoiceFile(input);
      return;
    }
    scheduleInvoiceOpen(URL.createObjectURL(file), invoiceClickTimerRef, invoicePreviewWindowRef);
  };

  const handleInvoiceButtonDoubleClick = (input: HTMLInputElement | null) => {
    cancelScheduledInvoiceOpen(invoiceClickTimerRef, invoicePreviewWindowRef);
    pickInvoiceFile(input);
  };

  const calculateDeliveryCostPerUnit = () => {
    const totalBottles = productRows.reduce(
      (total, row) => row.typ === 'aksesoria' ? total : total + (parseFloat(row.ilosc.toString().replace(',', '.')) || 0),
      0
    );
    const deliveryCost = parseFloat(kosztDostawy.replace(',', '.')) || 0;
    return totalBottles > 0 ? (deliveryCost / totalBottles).toFixed(2) : '0,00';
  };

  const addNewRow = () => setProductRows([...productRows, emptyRow()]);

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

  const applyOcrResult = (payload: NonNullable<OcrPurchaseInvoiceResponse['data']>) => {
    skipBruttoSyncRef.current = true;
    if (payload.sprzedawca) setSprzedawca(payload.sprzedawca);
    if (payload.waluta) setWalutaFaktury(normalizeWalutaFaktury(payload.waluta));
    if (payload.suma_netto != null && String(payload.suma_netto).trim() !== '') setKwotaNetto(String(payload.suma_netto));
    if (payload.suma_vat != null && String(payload.suma_vat).trim() !== '') setKwotaVat(String(payload.suma_vat));
    if (payload.suma_brutto != null && String(payload.suma_brutto).trim() !== '') setSumaBrutto(String(payload.suma_brutto));
    if (payload.products.length > 0) {
      setProductRows(
        payload.products.map((p) => ({
          kod: p.kod?.trim() || '',
          nazwa: p.nazwa || '',
          kod_kreskowy: p.kod_kreskowy?.trim() || '',
          ilosc: p.ilosc || '',
          cena: p.cena || '',
          cenaPelna: p.cenaPelna,
          dataWaznosci: null,
          showDataWaznosci: false,
          vat: 0,
          typ: p.typ?.trim() || '',
          objetosc: p.objetosc?.trim() || '',
        }))
      );
    }
  };

  const handleOcrPdfChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) { toast.error('Wybierz plik PDF faktury zakupu'); return; }
    setProductInvoice(file);
    setIsOcrLoading(true);
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      const response = await fetch('/api/ocr/purchase-invoice', { method: 'POST', body: formData });
      const result: OcrPurchaseInvoiceResponse = await response.json();
      if (!response.ok || !result.success || !result.data) {
        toast.error(result.error || 'Nie udało się rozpoznać faktury');
        return;
      }
      applyOcrResult(result.data);
    } catch {
      toast.error('Błąd połączenia podczas rozpoznawania faktury');
    } finally {
      setIsOcrLoading(false);
    }
  };

  const calculateTotal = () => {
    const subtotal = productRows.reduce((sum, row) => sum + getRowLineValue(row), 0);
    const rabatValue = parseFloat(rabat.replace(',', '.')) || 0;
    return formatPlMoney(subtotal * (1 - rabatValue / 100));
  };

  const calculateTotalVat = () => {
    const rabatValue = parseFloat(rabat.replace(',', '.')) || 0;
    const factor = 1 - rabatValue / 100;
    return productRows.reduce((sum, row) => sum + getRowLineVat(row) * factor, 0);
  };

  const kwotaNettoNumber = parsePlNumber(kwotaNetto);

  const handleKwotaNettoChange = (value: string) => {
    setKwotaNetto(value);
    setSumaBrutto(formatPlMoney(parsePlNumber(value) + parsePlNumber(kwotaVat)));
  };

  const handleKwotaVatChange = (value: string) => {
    setKwotaVat(value);
    setSumaBrutto(formatPlMoney(kwotaNettoNumber + parsePlNumber(value)));
  };

  const handleSumaBruttoChange = (value: string) => {
    setSumaBrutto(value);
    setKwotaVat(formatPlMoney(Math.max(0, parsePlNumber(value) - kwotaNettoNumber)));
  };

  useEffect(() => {
    if (skipBruttoSyncRef.current) { skipBruttoSyncRef.current = false; return; }
    const fromRows = calculateTotal();
    const vatFromRows = calculateTotalVat();
    setKwotaNetto(fromRows);
    setKwotaVat(formatPlMoney(vatFromRows));
    setSumaBrutto(formatPlMoney(parsePlNumber(fromRows) + vatFromRows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productRows, rabat]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.react-datepicker') && !target.closest('button[title*="ważności"]')) {
        const newRows = [...productRows];
        let hasChanges = false;
        newRows.forEach(row => { if (row.showDataWaznosci) { row.showDataWaznosci = false; hasChanges = true; } });
        if (hasChanges) setProductRows(newRows);
      }
      if (openDropdownIndex !== null && !target.closest('.dropdown-container')) setOpenDropdownIndex(null);
      if (openObjetoscDropdownIndex !== null && !target.closest('.dropdown-container')) setOpenObjetoscDropdownIndex(null);
      if (openVatDropdownIndex !== null && !target.closest('.dropdown-container')) setOpenVatDropdownIndex(null);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpenDropdownIndex(null); setOpenObjetoscDropdownIndex(null); setOpenVatDropdownIndex(null); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => { document.removeEventListener('mousedown', handleClickOutside); document.removeEventListener('keydown', handleEscape); };
  }, [openDropdownIndex, openObjetoscDropdownIndex, openVatDropdownIndex, productRows]);

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

  const getPurchaseValidationError = (): string | null =>
    validatePurchaseReceipt({
      hasDate: Boolean(selectedDate),
      sprzedawca,
      kosztDostawy,
      walutaDostawy,
      kursError,
      products: productRows,
      podatekAkcyzowy,
    });

  const purchaseValidationError = getPurchaseValidationError();
  const canSubmit = !purchaseValidationError;
  const withInvalid = (className: string, invalid: boolean): string =>
    showFieldErrors && invalid ? `${className} ${INVALID_FIELD}` : className;

  const handleSubmit = async () => {
    const formError = getPurchaseValidationError();
    if (formError) {
      setShowFieldErrors(true);
      toast.error(formError);
      return;
    }
    if (!selectedDate) return;

    const kursDostawyNumber = toKursToPln(walutaDostawy, kursDostawy);
    const deliveryCost = parseFloat(kosztDostawy.replace(',', '.')) || 0;
    const totalLineValueSubmit = productRows.reduce((sum, row) => {
      if (row.typ === 'aksesoria') return sum;
      return sum + getRowLineValue(row);
    }, 0);

    const formattedProducts = productRows.map(row => ({
        kod: row.kod,
        nazwa: row.nazwa,
        kod_kreskowy: row.kod_kreskowy || '',
        ilosc: parseFloat(row.ilosc) || 0,
        cena: parseFloat(row.cena.replace(',', '.')) || 0,
        dataWaznosci: row.dataWaznosci ? row.dataWaznosci.toLocaleDateString('en-CA') : undefined,
        vat: row.vat,
        typ: row.typ || undefined,
        objetosc: row.objetosc || undefined,
        koszt_dostawy_per_unit: roundMoney(getRowKosztButWgWartosci(row, totalLineValueSubmit, deliveryCost) * kursDostawyNumber),
        podatek_akcyzowy: (row.typ === 'bezalkoholowe' || row.typ === 'ferment' || row.typ === 'aksesoria')
          ? 0
          : roundMoney(roundMoney(podatekAkcyzowy) * (parseFloat(String(row.objetosc || '1').replace(',', '.')) || 1)),
      }));

    const kursFakturyNumber = toKursToPln(
      walutaFaktury,
      sharesKursToPlnPair(walutaDostawy, walutaFaktury) ? kursDostawy : kursFaktury
    );
    const receiptPayload = {
      date: selectedDate.toLocaleDateString('en-CA'),
      sprzedawca,
      wartosc_przyjecia_netto: roundMoney(kwotaNetto),
      vat: roundMoney(kwotaVat),
      wartosc_przyjecia_brutto: roundMoney(sumaBrutto),
      wartosc_dostawy: roundMoney(deliveryCost),
      kurs_1: kursDostawyNumber,
      stawka_podatek_akcyzowy: roundMoney(podatekAkcyzowy),
      rabat: roundMoney(rabat),
      waluta_przyjecia: walutaFaktury,
      waluta_dostawy: isWalutaSelected(walutaDostawy) ? walutaDostawy : undefined,
      walutaDostawy: isWalutaSelected(walutaDostawy) ? walutaDostawy : undefined,
      kurs_2: kursFakturyNumber,
      kursMode: 'toPln' as const,
      products: formattedProducts,
    };

    setIsSaving(true);
    try {
      let response: Response;
      if (productInvoice || transportInvoice) {
        const formData = new FormData();
        formData.append('data', JSON.stringify(receiptPayload));
        if (productInvoice) formData.append('product_invoice', productInvoice);
        if (transportInvoice) formData.append('transport_invoice', transportInvoice);
        response = await fetch(`${API_URL}/api/product-receipts`, { method: 'POST', body: formData });
      } else {
        response = await fetch(`${API_URL}/api/product-receipts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(receiptPayload),
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status} - ${errorText}`);
      }

      toast.success('Dodano nowy towar');
      const updatedReceipts = await loadProductReceiptsFromDb();
      onReceiptsChange(updatedReceipts);
      navigate(ZAKUP_PATH);
    } catch (error) {
      console.error('❌ Error adding product:', error);
      toast.error('Wystąpił błąd podczas dodawania towaru');
    } finally {
      setIsSaving(false);
    }
  };

  const handleVatChange = (index: number, value: number) => {
    const newRows = [...productRows];
    newRows[index].vat = value;
    setProductRows(newRows);
    setOpenVatDropdownIndex(null);
  };

  const handleTypChange = (index: number, value: string) => {
    const newRows = [...productRows];
    newRows[index].typ = value;
    if (value !== 'ferment') {
      newRows[index].dataWaznosci = null;
      newRows[index].showDataWaznosci = false;
    }
    setProductRows(newRows);
    setOpenDropdownIndex(null);
  };

  const handleObjetoscChange = (index: number, value: string) => {
    const newRows = [...productRows];
    newRows[index].objetosc = value;
    setProductRows(newRows);
    setOpenObjetoscDropdownIndex(null);
  };

  const totalLineValue = productRows.reduce((sum, row) => {
    if (row.typ === 'aksesoria') return sum;
    return sum + getRowLineValue(row);
  }, 0);
  const deliveryCostNumber = parsePlNumber(kosztDostawy);

  return (
    <div className="font-sora h-screen w-full bg-gray-200 overflow-hidden">
      <div className="h-full mx-8 lg:mx-12 bg-white flex flex-col shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(ZAKUP_PATH)}
              className="inline-flex items-center justify-center w-8 h-8 rounded-full text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors"
              title="Wróć"
            >
              <ArrowLeft size={18} />
            </button>
            <span className="text-lg font-medium text-gray-800 select-none">Nowe przyjęcie</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleOcrPdfChange}
              className="hidden"
              ref={ocrFileInputRef}
            />
            <button
              type="button"
              onClick={() => ocrFileInputRef.current?.click()}
              disabled={isOcrLoading}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border focus:outline-none transition-colors font-sora ${
                isOcrLoading
                  ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-wait'
                  : 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100'
              }`}
              title="Wczytaj dane z faktury zakupu (PDF)"
            >
              <FileText className="h-3.5 w-3.5" />
              {isOcrLoading ? 'Importowanie…' : 'Import z PDF'}
            </button>
          </div>
        </div>

        <div className="shrink-0 px-8 py-6">
        <div className="grid grid-cols-[300px_136px_119px_1fr] gap-x-8 gap-y-5 items-end">
          <div className="w-[300px]">
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Data zakupu</label>
            <DatePicker
              selected={selectedDate}
              onChange={(date: Date | null) => setSelectedDate(date)}
              locale="pl"
              dateFormat="dd/MM/yyyy"
              className={withInvalid(`w-[200px] ${HEADER_FIELD}`, headerInvalid.date)}
              placeholderText="Wybierz datę"
              popperClassName="z-50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Wartość dostawy</label>
            <div className="relative">
              <PlMoneyInput
                value={kosztDostawy}
                onChange={setKosztDostawy}
                className={withInvalid(`w-full ${HEADER_FIELD} pr-9`, headerInvalid.kosztDostawy)}
                placeholder="0,00"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                {getWalutaSymbol(walutaDostawy)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Waluta dostawy</label>
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

          <div className="flex gap-8 min-w-0 items-end w-full">
            <div className="w-[96px] shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">{getKursToPlnLabel(1, kurs1Active ? walutaDostawy : '')}</label>
              {kurs1Active ? (
                <PlMoneyInput value={kursDostawy} onChange={setKursDostawy} placeholder="0,00" className={withInvalid(`w-[96px] ${HEADER_FIELD} pr-6`, kursInvalid.kursDostawy)} />
              ) : (
                <div className="w-[96px] h-[30px] rounded-md bg-gray-100 border border-gray-200" />
              )}
            </div>
            <div className="ml-auto flex gap-2 shrink-0">
              <div className="w-[75px]">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f && f.type === 'application/pdf') setProductInvoice(f); }}
                  className="hidden"
                  ref={productFileInputRef}
                />
                <button
                  type="button"
                  onClick={() => handleInvoiceButtonClick(productInvoice, productFileInputRef.current)}
                  onDoubleClick={() => handleInvoiceButtonDoubleClick(productFileInputRef.current)}
                  className={`inline-flex items-center justify-center h-[30px] w-full rounded-md bg-white ${
                    productInvoice
                      ? 'border border-green-500 hover:bg-green-50'
                      : 'border border-gray-300 hover:bg-gray-50'
                  }`}
                  title={productInvoice ? 'Kliknij, aby otworzyć. Kliknij dwukrotnie, aby zamienić.' : 'Dodaj fakturę za towar'}
                >
                  <Grape className={`h-4 w-4 ${productInvoice ? 'text-green-600' : 'text-gray-500'}`} />
                </button>
              </div>
              <div className="w-[75px]">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f && f.type === 'application/pdf') setTransportInvoice(f); }}
                  className="hidden"
                  ref={transportFileInputRef}
                />
                <button
                  type="button"
                  onClick={() => handleInvoiceButtonClick(transportInvoice, transportFileInputRef.current)}
                  onDoubleClick={() => handleInvoiceButtonDoubleClick(transportFileInputRef.current)}
                  className={`inline-flex items-center justify-center h-[30px] w-full rounded-md bg-white ${
                    transportInvoice
                      ? 'border border-green-500 hover:bg-green-50'
                      : 'border border-gray-300 hover:bg-gray-50'
                  }`}
                  title={transportInvoice ? 'Kliknij, aby otworzyć. Kliknij dwukrotnie, aby zamienić.' : 'Dodaj fakturę za transport'}
                >
                  <Car className={`h-4 w-4 ${transportInvoice ? 'text-green-600' : 'text-gray-500'}`} />
                </button>
              </div>
            </div>
          </div>

          <div className="w-[300px]">
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Sprzedawca</label>
            <input
              type="text"
              name="sprzedawca_plain"
              id="sprzedawca_plain"
              autoComplete="nope"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              readOnly
              onFocus={(e) => { e.currentTarget.readOnly = false; }}
              value={sprzedawca}
              onChange={(e) => setSprzedawca(e.target.value)}
              placeholder="Wprowadź imię sprzedawcy"
              className={withInvalid(`w-[300px] ${HEADER_FIELD} read-only:bg-white`, headerInvalid.sprzedawca)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Koszt/but. (średnie)</label>
            <div className="relative">
              <div className={`w-full ${HEADER_FIELD} pr-9 flex items-center bg-gray-50 text-gray-600`}>
                {calculateDeliveryCostPerUnit().replace('.', ',')}
              </div>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                {getWalutaSymbol(walutaDostawy)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Waluta faktury</label>
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
                {WALUTY_FAKTURY.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
              <SelectChevron />
            </div>
          </div>

          <div className="flex gap-8 min-w-0 items-end">
            <div className="w-[96px] shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">{getKursToPlnLabel(2, kurs2Active ? walutaFaktury : '')}</label>
              {kurs2Active ? (
                <PlMoneyInput value={kursFaktury} onChange={setKursFaktury} placeholder="0,00" className={withInvalid(`w-[96px] ${HEADER_FIELD} pr-6`, kursInvalid.kursFaktury)} />
              ) : (
                <div className="w-[96px] h-[30px] rounded-md bg-gray-100 border border-gray-200" />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Podatek akcyz. /l</label>
              <div className="relative">
                <PlMoneyInput value={podatekAkcyzowy} onChange={setPodatekAkcyzowy} placeholder="0,00" className={withInvalid(`w-[112px] ${HEADER_FIELD} pr-10`, headerInvalid.akcyza)} />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">PLN</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Rabat (%)</label>
              <PlMoneyInput value={rabat} onChange={setRabat} placeholder="0,00" className={`w-[77px] ${HEADER_FIELD}`} />
            </div>
          </div>
        </div>
        </div>

        <div className="border-t border-gray-200" />

        <div className="product-table flex-1 min-h-0 min-w-0 pl-8 pr-0 py-6 flex flex-col">
          <div className={`product-rows-inner shrink-0 mb-2 bg-white ${PRODUCT_ROW_HEADER}`}>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Kod</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Nazwa</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Kod kreskowy</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Ilość</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Cena</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Wart. netto</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">VAT</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Wart. brutto</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Typ</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Objętość</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Koszt/but.</span>
            <span />
          </div>

          <div className="product-rows-scroll flex-1 min-h-0">
            <div className="product-rows-inner">
            <div className="space-y-2">
            {productRows.map((row, index) => {
              const rowInvalid = getRowInvalidFields(row);
              return (
              <div
                key={index}
                className={`${PRODUCT_ROW_FIELDS} relative`}
              >
                <input
                  type="text"
                  className={withInvalid(`w-full min-w-0 ${ROW_INPUT}`, rowInvalid.kod)}
                  placeholder="Kod"
                  value={row.kod}
                  onChange={(e) => { const n = [...productRows]; n[index].kod = e.target.value; setProductRows(n); }}
                />
                <input
                  type="text"
                  className={withInvalid(`w-full min-w-0 ${ROW_INPUT}`, rowInvalid.nazwa)}
                  placeholder="Nazwa"
                  value={row.nazwa}
                  onChange={(e) => { const n = [...productRows]; n[index].nazwa = e.target.value; setProductRows(n); }}
                />
                <input
                  type="text"
                  className={withInvalid(`w-full min-w-0 ${ROW_INPUT}`, rowInvalid.kod_kreskowy)}
                  placeholder="Kod kreskowy"
                  value={row.kod_kreskowy}
                  onChange={(e) => { const n = [...productRows]; n[index].kod_kreskowy = e.target.value; setProductRows(n); }}
                />
                <input
                  type="number"
                  className={withInvalid(`w-full min-w-0 ${ROW_INPUT} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`, rowInvalid.ilosc)}
                  placeholder="0"
                  value={row.ilosc}
                  onChange={(e) => { const v = e.target.value; if (v === '' || /^\d*$/.test(v)) { const n = [...productRows]; n[index].ilosc = v; setProductRows(n); } }}
                />
                <PlMoneyInput
                  value={row.cena}
                  onChange={(value) => { const n = [...productRows]; n[index].cena = value; n[index].cenaPelna = value ? parsePlNumber(value) : undefined; setProductRows(n); }}
                  className={withInvalid(`w-full min-w-0 ${ROW_INPUT}`, rowInvalid.cena)}
                  placeholder="0,00"
                />
                <input
                  type="text"
                  value={formatPlMoney(getRowLineValue(row))}
                  readOnly
                  className="w-full min-w-0 px-3 py-1.5 border border-gray-300 rounded-md font-sora text-xs bg-gray-50"
                />
                <div className="relative dropdown-container min-w-0">
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
                    <svg className="w-4 h-4 ml-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
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
                <input
                  type="text"
                  value={formatPlMoney(getRowLineBrutto(row))}
                  readOnly
                  className="w-full min-w-0 px-3 py-1.5 border border-gray-300 rounded-md font-sora text-xs bg-gray-50"
                />
                <div className="relative dropdown-container min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdownIndex(openDropdownIndex === index ? null : index);
                      setOpenVatDropdownIndex(null);
                      setOpenObjetoscDropdownIndex(null);
                    }}
                    className={withInvalid(`w-full px-3 py-1.5 border rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ${row.typ ? TYPY_TOWARU.find(t => t.value === row.typ)?.color || 'border-gray-300 bg-white' : 'border-gray-300 bg-white'}`, rowInvalid.typ)}
                  >
                    <span className="truncate">{row.typ ? TYPY_TOWARU.find(t => t.value === row.typ)?.label || 'Typ' : 'Typ'}</span>
                    <svg className="w-4 h-4 ml-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {openDropdownIndex === index && (
                    <div className="absolute top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-40 overflow-y-auto w-full" onClick={(e) => e.stopPropagation()}>
                      {TYPY_TOWARU.map((typ) => (
                        <button key={typ.value} type="button" onClick={() => handleTypChange(index, typ.value)} className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 ${typ.color}`}>
                          {typ.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative dropdown-container min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenObjetoscDropdownIndex(openObjetoscDropdownIndex === index ? null : index);
                      setOpenVatDropdownIndex(null);
                      setOpenDropdownIndex(null);
                    }}
                    className={withInvalid(`w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ${row.objetosc ? 'bg-blue-50 border-blue-300' : 'bg-white'}`, rowInvalid.objetosc)}
                  >
                    <span className="truncate">{row.objetosc || '—'}</span>
                    <svg className="w-4 h-4 ml-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {openObjetoscDropdownIndex === index && (
                    <div className="absolute top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-[100] max-h-40 overflow-y-auto w-full" onClick={(e) => e.stopPropagation()}>
                      {OBJETOSCI_WINA.map((o) => (
                        <button key={o.value} type="button" onClick={() => handleObjetoscChange(index, o.value)} className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50">
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  value={formatPlMoney(getRowKosztButWgWartosci(row, totalLineValue, deliveryCostNumber))}
                  readOnly
                  className="w-full min-w-0 px-3 py-1.5 border border-gray-300 rounded-md font-sora text-xs bg-gray-50"
                />
                <div className="flex items-center justify-start gap-1">
                  {row.typ === 'ferment' && (
                    <button
                      type="button"
                      onClick={() => toggleDataWaznosci(index)}
                      className={`p-1 focus:outline-none ${row.dataWaznosci ? 'text-green-600 hover:text-green-700' : showFieldErrors && rowInvalid.dataWaznosci ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-gray-600'}`}
                      title={row.dataWaznosci ? `Termin ważności: ${row.dataWaznosci.toLocaleDateString('pl-PL')}` : 'Dodaj termin ważności'}
                    >
                      <Calendar size={16} />
                    </button>
                  )}
                  <button onClick={() => deleteRow(index)} className="p-1 text-red-400 hover:text-red-600">
                    <X size={16} />
                  </button>
                </div>

                {row.typ === 'ferment' && row.showDataWaznosci && (
                  <div className="absolute top-full left-0 mt-1 z-50" style={{ left: 'calc(100% - 280px)' }}>
                    <DatePicker
                      selected={row.dataWaznosci}
                      onChange={(date: Date | null) => { const n = [...productRows]; n[index].dataWaznosci = date; n[index].showDataWaznosci = false; setProductRows(n); }}
                      locale="pl"
                      dateFormat="dd/MM/yyyy"
                      inline
                      popperClassName="z-50"
                      minDate={new Date()}
                      onCalendarClose={() => { const n = [...productRows]; n[index].showDataWaznosci = false; setProductRows(n); }}
                    />
                  </div>
                )}
              </div>
            );
            })}
            </div>
              <button
                type="button"
                onClick={addNewRow}
                className="mt-1.5 text-gray-400 hover:text-gray-600"
                title="Dodaj nową pozycję"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-200 px-8 min-h-[90px] py-4 flex items-center justify-between gap-6">
          <div className="flex items-center flex-nowrap gap-x-4 text-sm text-gray-700 font-sora">
            <span className="inline-flex items-center gap-2">
              Netto:
              <span className="relative w-[148px]">
                <PlMoneyInput
                  value={kwotaNetto}
                  onChange={handleKwotaNettoChange}
                  placeholder="0,00"
                  className="w-full h-[36px] box-border px-3 py-0 pr-12 border border-gray-300 rounded-md focus:outline-none font-sora text-sm text-right !font-bold placeholder:font-bold placeholder:text-gray-900"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                  {getWalutaSymbol(walutaFaktury)}
                </span>
              </span>
            </span>
            <span className="inline-flex items-center gap-2">
              Brutto:
              <span className="relative w-[148px]">
                <PlMoneyInput
                  value={sumaBrutto}
                  onChange={handleSumaBruttoChange}
                  placeholder="0,00"
                  className="w-full h-[36px] box-border px-3 py-0 pr-12 border border-gray-300 rounded-md focus:outline-none font-sora text-sm text-right !font-bold placeholder:font-bold placeholder:text-gray-900"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                  {getWalutaSymbol(walutaFaktury)}
                </span>
              </span>
            </span>
            <span className="inline-flex items-center gap-2">
              VAT:
              <span className="relative w-[148px]">
                <PlMoneyInput
                  value={kwotaVat}
                  onChange={handleKwotaVatChange}
                  placeholder="0,00"
                  className="w-full h-[36px] box-border px-3 py-0 pr-12 border border-gray-300 rounded-md focus:outline-none font-sora text-sm text-right !font-bold placeholder:font-bold placeholder:text-gray-900"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                  {getWalutaSymbol(walutaFaktury)}
                </span>
              </span>
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => navigate(ZAKUP_PATH)}
              className="px-5 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors font-sora cursor-pointer"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              title={purchaseValidationError || undefined}
              className={`px-5 py-2 text-sm font-medium rounded-md border transition-colors font-sora cursor-pointer ${
                !canSubmit || isSaving
                  ? 'border-gray-300 text-gray-400 bg-white'
                  : 'border-blue-600 text-blue-600 hover:bg-blue-50 bg-white'
              }`}
            >
              {isSaving ? 'Zapisywanie…' : 'Zapisz'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
