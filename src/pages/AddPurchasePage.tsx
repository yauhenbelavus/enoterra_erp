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
  WalutaFaktury,
  WalutaFakturySelection,
  getCenaColumnLabel,
  getKursEurPlnForDelivery,
  getPrimaryKursLabel,
  getSecondaryKursLabel,
  getWalutaSymbol,
  isKursEurPlnActive,
  isKursFakturyActive,
  isPrimaryKursActive,
  isSecondaryKursActive,
  isWalutaSelected,
  normalizeWalutaFaktury,
  toStandardKursEurPln,
  toStandardKursFaktury,
  usesPrimaryKursFakturyState,
  validateRequiredKurs,
} from '../utils/receiptCurrency';
import { PlMoneyInput } from '../components/PlMoneyInput';
import { ZAKUP_PATH } from '../routes';
import { Product } from '../types/Product';

registerLocale('pl', pl);

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

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
  { value: 'bezalkoholowe', label: 'Bezalkoholowe', color: 'bg-green-100 text-green-800 border-green-200' },
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

const getTodayDate = () => new Date();
const parsePlNumber = (value: string) => parseFloat(value.replace(',', '.')) || 0;
const formatPlMoney = (value: number) => value.toFixed(2).replace('.', ',');

const getRowLineValue = (row: ProductRow): number => {
  const ilosc = parseFloat(row.ilosc) || 0;
  const cenaPelna = row.cenaPelna ?? parsePlNumber(row.cena);
  return ilosc * cenaPelna;
};

const emptyRow = (): ProductRow => ({
  kod: '',
  nazwa: '',
  kod_kreskowy: '',
  ilosc: '',
  cena: '',
  dataWaznosci: null,
  showDataWaznosci: false,
  typ: '',
  objetosc: '',
});

const loadProductReceiptsFromDb = async (): Promise<ProductReceipt[]> => {
  try {
    const response = await fetch(`${API_URL}/api/product-receipts`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
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
      aktualnyKurs: receipt.aktualny_kurs ?? receipt.aktualnyKurs ?? 0,
      podatekAkcyzowy: receipt.podatek_akcyzowy ?? receipt.podatekAkcyzowy ?? 0,
      aktualny_kurs: receipt.aktualny_kurs ?? 0,
      podatek_akcyzowy: receipt.podatek_akcyzowy ?? 0,
      products: typeof receipt.products === 'string'
        ? JSON.parse(receipt.products)
        : receipt.products || [],
      productInvoice: receipt.productInvoice,
      transportInvoice: receipt.transportInvoice,
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
  const [aktualnyKurs, setAktualnyKurs] = useState('0,00');
  const [podatekAkcyzowy, setPodatekAkcyzowy] = useState('0,00');
  const [rabat, setRabat] = useState('0,00');
  const [walutaFaktury, setWalutaFaktury] = useState<WalutaFakturySelection>('');
  const [kursFaktury, setKursFaktury] = useState('');
  const [kwotaVat, setKwotaVat] = useState('');
  const [sumaBrutto, setSumaBrutto] = useState('');
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const productFileInputRef = useRef<HTMLInputElement>(null);
  const transportFileInputRef = useRef<HTMLInputElement>(null);
  const ocrFileInputRef = useRef<HTMLInputElement>(null);
  const skipBruttoSyncRef = useRef(false);

  const calculateDeliveryCostPerUnit = () => {
    const totalBottles = productRows.reduce(
      (total, row) => total + (parseFloat(row.ilosc.toString().replace(',', '.')) || 0),
      0
    );
    const deliveryCost = parseFloat(kosztDostawy.replace(',', '.')) || 0;
    return totalBottles > 0 ? (deliveryCost / totalBottles).toFixed(2) : '0,00';
  };

  const primaryKursValue = usesPrimaryKursFakturyState(walutaFaktury) ? kursFaktury : aktualnyKurs;
  const setPrimaryKursValue = (value: string) => {
    if (usesPrimaryKursFakturyState(walutaFaktury)) setKursFaktury(value);
    else setAktualnyKurs(value);
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

  const kwotaNettoNumber = parsePlNumber(calculateTotal());

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
    const vat = parsePlNumber(kwotaVat);
    setSumaBrutto(formatPlMoney(kwotaNettoNumber + vat));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productRows, rabat, kwotaNettoNumber]);

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
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpenDropdownIndex(null); setOpenObjetoscDropdownIndex(null); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => { document.removeEventListener('mousedown', handleClickOutside); document.removeEventListener('keydown', handleEscape); };
  }, [openDropdownIndex, openObjetoscDropdownIndex, productRows]);

  const hasValidProducts = productRows.some(row => row.kod && row.nazwa && row.ilosc && row.cena);
  const canSubmit =
    Boolean(selectedDate) &&
    hasValidProducts &&
    !validateRequiredKurs(walutaFaktury, aktualnyKurs, kursFaktury);

  const handleSubmit = async () => {
    if (!selectedDate || !hasValidProducts) return;
    if (!isWalutaSelected(walutaFaktury)) { toast.error('Wybierz walutę faktury'); return; }
    if (validateRequiredKurs(walutaFaktury, aktualnyKurs, kursFaktury)) return;

    const kursNumber = getKursEurPlnForDelivery(walutaFaktury, aktualnyKurs, kursFaktury);
    const totalBottles = productRows.reduce((t, r) => t + (parseFloat(r.ilosc) || 0), 0);
    const deliveryCostPerUnitPln = totalBottles > 0
      ? (parseFloat(kosztDostawy.replace(',', '.')) / totalBottles) * kursNumber
      : 0;

    const formattedProducts = productRows
      .filter(row => row.kod && row.nazwa && row.ilosc && row.cena)
      .map(row => ({
        kod: row.kod,
        nazwa: row.nazwa,
        kod_kreskowy: row.kod_kreskowy || '',
        ilosc: parseFloat(row.ilosc) || 0,
        cena: parseFloat(row.cena.replace(',', '.')) || 0,
        dataWaznosci: row.dataWaznosci ? row.dataWaznosci.toLocaleDateString('en-CA') : undefined,
        typ: row.typ || undefined,
        objetosc: row.objetosc || undefined,
        deliveryCostPerUnitPln,
        podatekAkcyzowyPerLiter: parseFloat(podatekAkcyzowy.replace(',', '.')) || 0,
      }));

    const totalValue = productRows
      .filter(row => row.kod && row.nazwa && row.ilosc && row.cena)
      .reduce((sum, row) => sum + getRowLineValue(row), 0);
    const deliveryCost = parseFloat(kosztDostawy.replace(',', '.')) || 0;
    const rabatValue = parseFloat(rabat.replace(',', '.')) || 0;
    const wartoscZRabatem = totalValue * (1 - rabatValue / 100);
    const razem = parsePlNumber(sumaBrutto) || (wartoscZRabatem + parsePlNumber(kwotaVat));

    setIsSaving(true);
    try {
      let response: Response;
      if (productInvoice || transportInvoice) {
        const formData = new FormData();
        formData.append('data', JSON.stringify({
          date: selectedDate.toLocaleDateString('en-CA'),
          sprzedawca,
          wartosc: razem,
          kosztDostawy: deliveryCost,
          aktualnyKurs: String(toStandardKursEurPln(walutaFaktury, aktualnyKurs)),
          podatekAkcyzowy,
          rabat,
          walutaFaktury,
          kursFaktury: toStandardKursFaktury(walutaFaktury, kursFaktury),
          products: formattedProducts,
        }));
        if (productInvoice) formData.append('productInvoice', productInvoice);
        if (transportInvoice) formData.append('transportInvoice', transportInvoice);
        response = await fetch(`${API_URL}/api/product-receipts`, { method: 'POST', body: formData });
      } else {
        response = await fetch(`${API_URL}/api/product-receipts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: selectedDate.toLocaleDateString('en-CA'),
            sprzedawca,
            wartosc: razem,
            kosztDostawy: deliveryCost,
            aktualnyKurs: String(toStandardKursEurPln(walutaFaktury, aktualnyKurs)),
            podatekAkcyzowy,
            rabat,
            walutaFaktury,
            kursFaktury: toStandardKursFaktury(walutaFaktury, kursFaktury),
            products: formattedProducts,
          }),
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

  const handleTypChange = (index: number, value: string) => {
    const newRows = [...productRows];
    newRows[index].typ = value;
    setProductRows(newRows);
    setOpenDropdownIndex(null);
  };

  const handleObjetoscChange = (index: number, value: string) => {
    const newRows = [...productRows];
    newRows[index].objetosc = value;
    setProductRows(newRows);
    setOpenObjetoscDropdownIndex(null);
  };

  return (
    <div className="font-sora w-full">
      {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 select-none">
        <button
          type="button"
          onClick={() => navigate(ZAKUP_PATH)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Przyjęcie towarów</span>
        </button>

        <div className="flex items-center gap-3">
          {/* OCR button */}
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
            {isOcrLoading ? 'Rozpoznawanie…' : 'Wypełnij z PDF'}
          </button>

          <button
            type="button"
            onClick={() => navigate(ZAKUP_PATH)}
            className="px-4 py-1.5 text-xs font-medium border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors font-sora"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isSaving}
            className={`px-4 py-1.5 text-xs font-medium rounded-md text-white transition-colors font-sora ${
              !canSubmit || isSaving
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSaving ? 'Zapisywanie…' : 'Zapisz'}
          </button>
        </div>
      </div>

      {/* ── FORM ────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Row 1: date, koszt dostawy, files */}
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Data zakupu</label>
            <DatePicker
              selected={selectedDate}
              onChange={(date: Date | null) => setSelectedDate(date)}
              locale="pl"
              dateFormat="dd/MM/yyyy"
              className="w-[200px] px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
              placeholderText="Wybierz datę"
              popperClassName="z-50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Koszt dostawy</label>
            <div className="relative">
              <PlMoneyInput
                value={kosztDostawy}
                onChange={setKosztDostawy}
                className="w-[120px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                placeholder="0,00"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">€</span>
            </div>
          </div>

          {/* Faktura towarowa */}
          <div className="flex items-center gap-2">
            <input type="file" accept=".pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f && f.type === 'application/pdf') setProductInvoice(f); }} className="hidden" ref={productFileInputRef} />
            <button type="button" onClick={() => productFileInputRef.current?.click()} className="inline-flex items-center justify-center w-8 h-8 border border-gray-300 rounded-md shadow-sm text-sm text-gray-700 bg-white hover:bg-gray-50" title="Dodaj fakturę za towar">
              <Grape className="h-4 w-4 text-gray-500" />
            </button>
            {productInvoice && (
              <a href={URL.createObjectURL(productInvoice)} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 underline truncate max-w-[120px]" title={productInvoice.name}>
                {productInvoice.name}
              </a>
            )}
          </div>

          {/* Faktura transportowa */}
          <div className="flex items-center gap-2">
            <input type="file" accept=".pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f && f.type === 'application/pdf') setTransportInvoice(f); }} className="hidden" ref={transportFileInputRef} />
            <button type="button" onClick={() => transportFileInputRef.current?.click()} className="inline-flex items-center justify-center w-8 h-8 border border-gray-300 rounded-md shadow-sm text-sm text-gray-700 bg-white hover:bg-gray-50" title="Dodaj fakturę za transport">
              <Car className="h-4 w-4 text-gray-500" />
            </button>
            {transportInvoice && (
              <a href={URL.createObjectURL(transportInvoice)} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 underline truncate max-w-[120px]" title={transportInvoice.name}>
                {transportInvoice.name}
              </a>
            )}
          </div>
        </div>

        {/* Row 2: sprzedawca, kurs fields, waluta */}
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Sprzedawca</label>
            <input
              type="text"
              value={sprzedawca}
              onChange={(e) => setSprzedawca(e.target.value)}
              placeholder="Wprowadź imię sprzedawcy"
              className="w-[300px] px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Koszt dostawy / butelkę</label>
            <div className="w-[140px] px-3 py-1.5 border border-gray-300 rounded-md bg-gray-50 font-sora text-xs text-gray-600">
              {calculateDeliveryCostPerUnit().replace('.', ',')} €
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Waluta</label>
            <select
              value={walutaFaktury}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') { setWalutaFaktury(''); setKursFaktury(''); setAktualnyKurs(''); return; }
                const next = normalizeWalutaFaktury(raw);
                setWalutaFaktury(next);
                if (!isKursFakturyActive(next)) setKursFaktury('');
                if (!isKursEurPlnActive(next)) setAktualnyKurs('');
              }}
              className="w-[80px] px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-white"
            >
              <option value="">—</option>
              {WALUTY_FAKTURY.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">{getPrimaryKursLabel(walutaFaktury)}</label>
            {isPrimaryKursActive(walutaFaktury) ? (
              <div className="relative">
                <PlMoneyInput value={primaryKursValue} onChange={setPrimaryKursValue} placeholder="0,00" className="w-[96px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs" />
              </div>
            ) : (
              <div className="w-[96px] h-[30px] rounded-md bg-gray-100 border border-gray-200" />
            )}
          </div>

          {isSecondaryKursActive(walutaFaktury) && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">{getSecondaryKursLabel(walutaFaktury)}</label>
              <div className="relative">
                <PlMoneyInput value={aktualnyKurs} onChange={setAktualnyKurs} placeholder="0,00" className="w-[96px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Pod. akcyz. (l)</label>
            <div className="relative">
              <PlMoneyInput value={podatekAkcyzowy} onChange={setPodatekAkcyzowy} placeholder="0,00" className="w-[96px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">zł</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Rabat (%)</label>
            <div className="relative">
              <PlMoneyInput value={rabat} onChange={setRabat} placeholder="0,00" className="w-[96px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">%</span>
            </div>
          </div>
        </div>

        {/* ── PRODUCT TABLE ─────────────────────────────────────────────── */}
        <div className="mt-2">
          {/* Column headers */}
          <div className="grid grid-cols-12 gap-1 mb-2 pr-2">
            <div className="col-span-1"><span className="text-xs font-medium text-gray-700 font-sora">Kod</span></div>
            <div className="col-span-2"><span className="text-xs font-medium text-gray-700 font-sora">Nazwa</span></div>
            <div className="col-span-2"><span className="text-xs font-medium text-gray-700 font-sora">Kod kreskowy</span></div>
            <div className="col-span-1"><span className="text-xs font-medium text-gray-700 font-sora">Ilość</span></div>
            <div className="col-span-2"><span className="text-xs font-medium text-gray-700 font-sora">{getCenaColumnLabel(walutaFaktury)}</span></div>
            <div className="col-span-1"><span className="text-xs font-medium text-gray-700 font-sora">Wartość</span></div>
            <div className="col-span-1"><span className="text-xs font-medium text-gray-700 font-sora">Typ</span></div>
            <div className="col-span-1"><span className="text-xs font-medium text-gray-700 font-sora">Objętość</span></div>
            <div className="col-span-1" />
          </div>

          {/* Product rows */}
          <div className="space-y-1">
            {productRows.map((row, index) => (
              <div key={index} className="grid grid-cols-12 gap-1 relative items-center">
                {/* Kod */}
                <div className="col-span-1">
                  <input
                    type="text"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                    placeholder="Kod"
                    value={row.kod}
                    onChange={(e) => { const n = [...productRows]; n[index].kod = e.target.value; setProductRows(n); }}
                  />
                </div>
                {/* Nazwa */}
                <div className="col-span-2">
                  <input
                    type="text"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                    placeholder="Nazwa"
                    value={row.nazwa}
                    onChange={(e) => { const n = [...productRows]; n[index].nazwa = e.target.value; setProductRows(n); }}
                  />
                </div>
                {/* Kod kreskowy */}
                <div className="col-span-2">
                  <input
                    type="text"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                    placeholder="Kod kreskowy"
                    value={row.kod_kreskowy}
                    onChange={(e) => { const n = [...productRows]; n[index].kod_kreskowy = e.target.value; setProductRows(n); }}
                  />
                </div>
                {/* Ilość */}
                <div className="col-span-1">
                  <input
                    type="number"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="0"
                    value={row.ilosc}
                    onChange={(e) => { const v = e.target.value; if (v === '' || /^\d*$/.test(v)) { const n = [...productRows]; n[index].ilosc = v; setProductRows(n); } }}
                  />
                </div>
                {/* Cena */}
                <div className="col-span-2">
                  <PlMoneyInput
                    value={row.cena}
                    onChange={(value) => { const n = [...productRows]; n[index].cena = value; n[index].cenaPelna = value ? parsePlNumber(value) : undefined; setProductRows(n); }}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                    placeholder="0,00"
                  />
                </div>
                {/* Wartość (read-only) */}
                <div className="col-span-1">
                  <input
                    type="text"
                    value={formatPlMoney(getRowLineValue(row))}
                    readOnly
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md font-sora text-xs bg-gray-50"
                  />
                </div>
                {/* Typ */}
                <div className="col-span-1 relative dropdown-container">
                  <button
                    type="button"
                    onClick={() => setOpenDropdownIndex(openDropdownIndex === index ? null : index)}
                    className={`w-full px-2 py-1.5 border rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ${row.typ ? TYPY_TOWARU.find(t => t.value === row.typ)?.color || 'border-gray-300 bg-white' : 'border-gray-300 bg-white'}`}
                  >
                    <span className="truncate">{row.typ ? TYPY_TOWARU.find(t => t.value === row.typ)?.label || 'Typ' : 'Typ'}</span>
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {openDropdownIndex === index && (
                    <div className="absolute top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-40 overflow-y-auto w-48" onClick={(e) => e.stopPropagation()}>
                      {TYPY_TOWARU.map((typ) => (
                        <button key={typ.value} type="button" onClick={() => handleTypChange(index, typ.value)} className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 ${typ.color}`}>
                          {typ.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Objętość */}
                <div className="col-span-1 relative dropdown-container">
                  <button
                    type="button"
                    onClick={() => setOpenObjetoscDropdownIndex(openObjetoscDropdownIndex === index ? null : index)}
                    className={`w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ${row.objetosc ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}
                  >
                    <span className="truncate">{row.objetosc || 'Obj.'}</span>
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {openObjetoscDropdownIndex === index && (
                    <div className="absolute top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-[100] max-h-40 overflow-y-auto w-28" onClick={(e) => e.stopPropagation()}>
                      {OBJETOSCI_WINA.map((o) => (
                        <button key={o.value} type="button" onClick={() => handleObjetoscChange(index, o.value)} className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50">
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Actions */}
                <div className="col-span-1 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => toggleDataWaznosci(index)}
                    className={`p-1 focus:outline-none ${row.dataWaznosci ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'}`}
                    title={row.dataWaznosci ? `Termin ważności: ${row.dataWaznosci.toLocaleDateString('pl-PL')}` : 'Dodaj termin ważności'}
                  >
                    <Calendar size={14} />
                  </button>
                  <button onClick={() => deleteRow(index)} className="p-1 text-red-400 hover:text-red-600">
                    <X size={14} />
                  </button>
                </div>

                {row.showDataWaznosci && (
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
            ))}
          </div>

          {/* Add row */}
          <button onClick={addNewRow} className="mt-3 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
            <Plus size={14} /> Dodaj pozycję
          </button>
        </div>

        {/* ── TOTALS ────────────────────────────────────────────────────── */}
        <div className="flex justify-end mt-4">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-700">Kwota netto:</span>
              <div className="relative w-[100px]">
                <PlMoneyInput value={calculateTotal()} onChange={() => {}} disabled placeholder="0,00" className="w-full px-2 py-1 border border-gray-300 rounded-md font-sora text-xs text-right pr-6 bg-gray-100 text-gray-600 cursor-not-allowed" />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 pointer-events-none">{getWalutaSymbol(walutaFaktury)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-700">Kwota VAT:</span>
              <div className="relative w-[100px]">
                <PlMoneyInput value={kwotaVat} onChange={handleKwotaVatChange} placeholder="0,00" className="w-full px-2 py-1 border border-gray-300 rounded-md font-sora text-xs text-right pr-6" />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 pointer-events-none">{getWalutaSymbol(walutaFaktury)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-700">Razem:</span>
              <div className="relative w-[100px]">
                <PlMoneyInput value={sumaBrutto} onChange={handleSumaBruttoChange} placeholder="0,00" className="w-full px-2 py-1 border border-gray-300 rounded-md font-sora text-xs text-right pr-6 font-semibold" />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 pointer-events-none">{getWalutaSymbol(walutaFaktury)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
