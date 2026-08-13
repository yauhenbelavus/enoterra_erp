import React, { useState, useRef, useEffect } from 'react';
import Modal from 'react-modal';
import { X, Plus, Grape, Car, Calendar, FileText } from 'lucide-react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import "./DatePicker.css";
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
import { PlMoneyInput } from './PlMoneyInput';

registerLocale('pl', pl);

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { 
    date: string; 
    sprzedawca: string; 
    wartosc: number; 
    kosztDostawy: number;
    aktualnyKurs?: string;
    podatekAkcyzowy?: string;
    rabat?: string;
    walutaFaktury?: WalutaFaktury;
    kursFaktury?: number;
    products: Array<{
      kod: string;
      nazwa: string;
      kod_kreskowy: string;
      ilosc: number;
      cena: number;
      dataWaznosci?: string;
      typ?: string;
      objetosc?: string;
      deliveryCostPerUnitPln?: number;
      podatekAkcyzowyPerLiter?: number;
    }>;
    productInvoice?: File | null;
    transportInvoice?: File | null;
  }) => void;
}

interface ParsedPurchaseProduct {
  nazwa: string;
  ilosc: string;
  cena: string;
  cenaPelna?: number;
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

const getTodayDate = () => new Date();

const parsePlNumber = (value: string) => parseFloat(value.replace(',', '.')) || 0;

const formatPlMoney = (value: number) => value.toFixed(2).replace('.', ',');

const getRowLineValue = (row: ProductRow): number => {
  const ilosc = parseFloat(row.ilosc) || 0;
  const cenaPelna = row.cenaPelna ?? parsePlNumber(row.cena);
  return ilosc * cenaPelna;
};

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

export const AddProductModal: React.FC<AddProductModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(getTodayDate);
  const [sprzedawca, setSprzedawca] = useState('');
  const [productRows, setProductRows] = useState<ProductRow[]>([{ 
    kod: '', 
    nazwa: '', 
    kod_kreskowy: '', 
    ilosc: '', 
    cena: '', 
    dataWaznosci: null,
    showDataWaznosci: false,
    typ: '',
    objetosc: ''
  }]);
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

  const productFileInputRef = useRef<HTMLInputElement>(null);
  const transportFileInputRef = useRef<HTMLInputElement>(null);
  const ocrFileInputRef = useRef<HTMLInputElement>(null);
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

  const addNewRow = () => {
    setProductRows([...productRows, {
      kod: '',
      nazwa: '',
      kod_kreskowy: '',
      ilosc: '',
      cena: '',
      dataWaznosci: null,
      showDataWaznosci: false,
      typ: '',
      objetosc: ''
    }]);
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

  const handleProductFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log('📎 Product file selected:', file);
    if (file && file.type === 'application/pdf') {
      setProductInvoice(file);
      console.log('✅ Product invoice set:', file.name);
    } else {
      console.log('❌ Invalid product file type:', file?.type);
    }
  };

  const handleTransportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log('📎 Transport file selected:', file);
    if (file && file.type === 'application/pdf') {
      setTransportInvoice(file);
      console.log('✅ Transport invoice set:', file.name);
    } else {
      console.log('❌ Invalid transport file type:', file?.type);
    }
  };

  const handleProductFileClick = () => {
    productFileInputRef.current?.click();
  };

  const handleTransportFileClick = () => {
    transportFileInputRef.current?.click();
  };

  const applyOcrResult = (payload: NonNullable<OcrPurchaseInvoiceResponse['data']>) => {
    skipBruttoSyncRef.current = true;

    if (payload.sprzedawca) {
      setSprzedawca(payload.sprzedawca);
    }

    if (payload.waluta) {
      setWalutaFaktury(normalizeWalutaFaktury(payload.waluta));
    }

    if (payload.suma_vat != null && String(payload.suma_vat).trim() !== '') {
      setKwotaVat(String(payload.suma_vat));
    }
    if (payload.suma_brutto != null && String(payload.suma_brutto).trim() !== '') {
      setSumaBrutto(String(payload.suma_brutto));
    }

    if (payload.products.length > 0) {
      setProductRows(
        payload.products.map((product) => ({
          kod: '',
          nazwa: product.nazwa || '',
          kod_kreskowy: '',
          ilosc: product.ilosc || '',
          cena: product.cena || '',
          cenaPelna: product.cenaPelna,
          dataWaznosci: null,
          showDataWaznosci: false,
          typ: '',
          objetosc: '',
        }))
      );
    }
  };

  const handleOcrPdfChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';

    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      toast.error('Wybierz plik PDF faktury zakupu');
      return;
    }

    setProductInvoice(file);
    setIsOcrLoading(true);

    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const response = await fetch('/api/ocr/purchase-invoice', {
        method: 'POST',
        body: formData,
      });

      const result: OcrPurchaseInvoiceResponse = await response.json();

      if (!response.ok || !result.success || !result.data) {
        toast.error(result.error || 'Nie udało się rozpoznać faktury');
        return;
      }

      applyOcrResult(result.data);
    } catch (error) {
      console.error('OCR error:', error);
      toast.error('Błąd połączenia podczas rozpoznawania faktury');
    } finally {
      setIsOcrLoading(false);
    }
  };

  const handleOcrPdfClick = () => {
    ocrFileInputRef.current?.click();
  };

  const handleSubmit = async () => {
    console.log('handleSubmit called');
    console.log('selectedDate:', selectedDate);
    console.log('sprzedawca:', sprzedawca);
    console.log('kosztDostawy:', kosztDostawy);
    console.log('productRows:', productRows);
    
    if (!selectedDate || !productRows.some(row => 
      row.kod && row.nazwa && row.ilosc && row.cena
    )) {
      console.log('Validation failed');
      console.log('selectedDate is null:', !selectedDate);
      console.log('productRows validation:', productRows.some(row => 
        row.kod && row.nazwa && row.ilosc && row.cena
      ));
      return;
    }

    if (!isWalutaSelected(walutaFaktury)) {
      toast.error('Wybierz walutę faktury');
      return;
    }

    if (validateRequiredKurs(walutaFaktury, aktualnyKurs, kursFaktury)) {
      return;
    }

    const kursNumber = getKursEurPlnForDelivery(walutaFaktury, aktualnyKurs, kursFaktury);
    const totalBottles = productRows.reduce((t,r)=>t+(parseFloat(r.ilosc)||0),0);
    const deliveryCostPerUnitPln = totalBottles>0 ? (parseFloat(kosztDostawy.replace(',', '.'))/totalBottles)*kursNumber : 0;

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
        deliveryCostPerUnitPln: deliveryCostPerUnitPln,
        podatekAkcyzowyPerLiter: parseFloat(podatekAkcyzowy.replace(',', '.')) || 0
      }));

    console.log('formattedProducts:', formattedProducts);

    const totalValue = productRows
      .filter(row => row.kod && row.nazwa && row.ilosc && row.cena)
      .reduce((sum, row) => sum + getRowLineValue(row), 0);

    const deliveryCost = parseFloat(kosztDostawy.replace(',', '.')) || 0;
    const rabatValue = parseFloat(rabat.replace(',', '.')) || 0;
    
    // Применяем рабат к общей сумме
    const wartoscZRabatem = totalValue * (1 - rabatValue / 100);

    console.log('totalValue:', totalValue);
    console.log('rabat:', rabatValue + '%');
    console.log('wartoscZRabatem:', wartoscZRabatem);
    console.log('deliveryCost:', deliveryCost);
    console.log('📎 Files to submit:', { productInvoice, transportInvoice });

    const razem = parsePlNumber(sumaBrutto) || (wartoscZRabatem + parsePlNumber(kwotaVat));

    onSubmit({ 
      date: selectedDate.toLocaleDateString('en-CA'),
      sprzedawca: sprzedawca,
      wartosc: razem,
      kosztDostawy: deliveryCost,
      aktualnyKurs: String(toStandardKursEurPln(walutaFaktury, aktualnyKurs)),
      podatekAkcyzowy: podatekAkcyzowy,
      rabat: rabat,
      walutaFaktury,
      kursFaktury: toStandardKursFaktury(walutaFaktury, kursFaktury),
      products: formattedProducts,
      productInvoice: productInvoice || null,
      transportInvoice: transportInvoice || null
    });
    handleClose();
  };

  const handleClose = () => {
    setSelectedDate(getTodayDate());
    setProductRows([{ kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', cena: '', dataWaznosci: null, showDataWaznosci: false, typ: '', objetosc: '' }]);
    setKosztDostawy('');
    setSprzedawca('');
    setAktualnyKurs('0,00');
    setPodatekAkcyzowy('0,00');
    setRabat('0,00');
    setWalutaFaktury('');
    setKursFaktury('');
    setKwotaVat('');
    setSumaBrutto('');

    setProductInvoice(null);
    setTransportInvoice(null);
    setIsOcrLoading(false);
    onClose();
  };

  const calculateTotal = () => {
    const subtotal = productRows.reduce((sum, row) => sum + getRowLineValue(row), 0);
    const rabatValue = parseFloat(rabat.replace(',', '.')) || 0;
    return formatPlMoney(subtotal * (1 - rabatValue / 100));
  };

  const kwotaNettoNumber = parsePlNumber(calculateTotal());

  const handleKwotaVatChange = (value: string) => {
    setKwotaVat(value);
    const vat = parsePlNumber(value);
    setSumaBrutto(formatPlMoney(kwotaNettoNumber + vat));
  };

  const handleSumaBruttoChange = (value: string) => {
    setSumaBrutto(value);
    const brutto = parsePlNumber(value);
    setKwotaVat(formatPlMoney(Math.max(0, brutto - kwotaNettoNumber)));
  };

  // При изменении позиций: brutto = netto + bieżący VAT (VAT zostaje z OCR / ręcznie)
  useEffect(() => {
    if (skipBruttoSyncRef.current) {
      skipBruttoSyncRef.current = false;
      return;
    }
    const vat = parsePlNumber(kwotaVat);
    setSumaBrutto(formatPlMoney(kwotaNettoNumber + vat));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync brutto from netto; keep user/OCR VAT
  }, [productRows, rabat, kwotaNettoNumber]);

  const hasValidProducts = productRows.some(row =>
    row.kod && row.nazwa && row.ilosc && row.cena
  );
  const canSubmit =
    Boolean(selectedDate) &&
    hasValidProducts &&
    !validateRequiredKurs(walutaFaktury, aktualnyKurs, kursFaktury);

  const handleTypChange = (index: number, value: string) => {
    const newRows = [...productRows];
    newRows[index].typ = value;
    setProductRows(newRows);
    setOpenDropdownIndex(null);
  };

  const toggleDropdown = (index: number) => {
    setOpenDropdownIndex(openDropdownIndex === index ? null : index);
  };

  const toggleObjetoscDropdown = (index: number) => {
    setOpenObjetoscDropdownIndex(openObjetoscDropdownIndex === index ? null : index);
  };

  const handleObjetoscChange = (index: number, value: string) => {
    const newRows = [...productRows];
    newRows[index].objetosc = value;
    setProductRows(newRows);
    setOpenObjetoscDropdownIndex(null);
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedDate(getTodayDate());
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
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
      
      // Закрываем dropdown типа товара
      if (openDropdownIndex !== null) {
        if (!target.closest('.dropdown-container')) {
          setOpenDropdownIndex(null);
        }
      }
      
      // Закрываем dropdown объема товара
      if (openObjetoscDropdownIndex !== null) {
        if (!target.closest('.dropdown-container')) {
          setOpenObjetoscDropdownIndex(null);
        }
      }
    };
    
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdownIndex(null);
        setOpenObjetoscDropdownIndex(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openDropdownIndex, openObjetoscDropdownIndex, productRows]);

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
                  transform: 'translate(-50%, -50%)',
                  margin: '0',
                  borderRadius: '0.5rem',
                  background: 'white',
                  overflow: 'hidden',
                  outline: 'none',
                  padding: '24px',
                  fontFamily: 'Sora',
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
      <div className="font-sora h-full min-h-0 flex flex-col overflow-hidden">
        <div className="flex justify-between items-center mb-6 select-none shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-800">Dodawanie towaru</h2>
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleOcrPdfChange}
              className="hidden"
              ref={ocrFileInputRef}
            />
            <button
              type="button"
              onClick={handleOcrPdfClick}
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
          </div>
          <button
            onClick={handleClose}
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
                      className="w-[70%] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                      placeholder="0,00"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none">€</span>
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
                    className="w-[96px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                  />
                </div>
              ) : (
                <div className="w-[96px] h-[30px] rounded-md bg-gray-100 border border-gray-200" aria-hidden="true" />
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
                    className="w-[96px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                  />
                </div>
              ) : (
                <div className="w-[96px] h-[30px] rounded-md bg-gray-100 border border-gray-200" aria-hidden="true" />
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
                  className="w-[96px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                />
                <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none">zł</span>
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
                  className="w-[96px] px-3 py-1.5 pr-6 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                />
                <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none">%</span>
              </div>
            </div>
            <div className="shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Waluta
              </label>
              <select
                value={walutaFaktury}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setWalutaFaktury('');
                    setKursFaktury('');
                    setAktualnyKurs('');
                    return;
                  }
                  const next = normalizeWalutaFaktury(raw);
                  setWalutaFaktury(next);
                  if (!isKursFakturyActive(next)) setKursFaktury('');
                  if (!isKursEurPlnActive(next)) setAktualnyKurs('');
                }}
                className="w-[80px] px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-white"
              >
                <option value="">—</option>
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
                        newRows[index].cenaPelna = value ? parsePlNumber(value) : undefined;
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
                      value={formatPlMoney(getRowLineValue(row))}
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
                    title={row.dataWaznosci ? `Termin ważności: ${row.dataWaznosci.toLocaleDateString('pl-PL')}` : "Dodaj termin ważności"}
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
                      selected={row.dataWaznosci}
                      onChange={(date: Date | null) => {
                        const newRows = [...productRows];
                        newRows[index].dataWaznosci = date;
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
                <div className="col-span-3 relative ml-20 dropdown-container">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => toggleObjetoscDropdown(index)}
                      className={`w-[60%] px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ${row.objetosc ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}
                    >
                      <span className="truncate">
                        {row.objetosc || 'Wybierz'}
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
            onClick={() => {
              console.log('Button clicked');
              console.log('Button state:', {
                selectedDate,
                productRows,
                isDisabled: !canSubmit
              });
              handleSubmit();
            }}
            disabled={!canSubmit}
            className={`px-6 py-1.5 text-white text-xs rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-sora ${
              !canSubmit
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            Dodaj
          </button>
          <div className="absolute right-0 bottom-0 flex flex-col items-end gap-1">
            <div className="flex items-center">
              <span className="text-xs text-gray-700 mr-2">Kwota netto:</span>
              <div className="relative w-[88px]">
                <PlMoneyInput
                  value={calculateTotal()}
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
    </Modal>
  );
};