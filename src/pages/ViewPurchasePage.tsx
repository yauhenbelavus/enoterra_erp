import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Grape, Car } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  WalutaFakturySelection,
  getKursToPlnLabel,
  getWalutaSymbol,
  isKursDostawyInputActive,
  isKursFakturyInputActive,
  needsKursToPln,
  normalizeWalutaFaktury,
  roundMoney,
  cenaPoRabacie,
  formatCenaPoRabacie,
  formatKursRate,
  formatPlMoney,
  parsePlNumber,
} from '../utils/receiptCurrency';
import { kosztButWgWartosci } from '../../server/purchaseReceiptValidation.mjs';
import { API_URL } from '../config';
import { ZAKUP_PATH } from '../routes';
import { normalizeReceiptProductLines, receiptLineDataWaznosci } from '../utils/receiptProducts';
import {
  INVOICE_FILE_BUTTON_TITLE_HAS_FILE,
  receiptInvoiceUrl,
  scheduleInvoiceOpen,
} from '../utils/receiptInvoice';

interface ViewPurchasePageProps {
  receiptId: number;
}

interface ProductRow {
  kod: string;
  nazwa: string;
  kod_kreskowy: string;
  ilosc: string;
  cena: string;
  cenaPelna?: number;
  dataWaznosci?: Date | null;
  vat: number;
  typ: string;
  objetosc: string;
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

const SLOT =
  'box-border px-3 py-1.5 font-sora text-xs text-gray-900 whitespace-normal break-words leading-tight';
const HEADER_SLOT = `min-h-[30px] flex items-center ${SLOT}`;
const ROW_SLOT = `w-full min-w-0 ${SLOT}`;
const FOOTER_SLOT = 'w-full min-h-[36px] box-border px-3 py-1.5 pr-12 flex items-center justify-end font-sora text-sm text-right font-bold whitespace-normal break-words leading-tight';
const PRODUCT_ROW_GRID_BASE = 'grid gap-2 min-w-0';
const PRODUCT_ROW_COLS = '[grid-template-columns:90px_minmax(0,1fr)_132px_68px_78px_91px_70px_91px_114px_84px_81px_52px]';
const PRODUCT_ROW_COLS_RABAT = '[grid-template-columns:90px_minmax(0,1fr)_132px_68px_78px_91px_91px_70px_91px_114px_84px_81px_52px]';

const parseWalutaSelection = (value?: string | null): WalutaFakturySelection => {
  const s = String(value || '').trim().toUpperCase();
  if (s === 'EUR' || s === 'PLN' || s === 'DKK') return s;
  return '';
};

const formatStoredKursToPln = (value?: number | null): string => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n === 1) return '';
  return formatKursRate(n);
};

const parseReceiptDate = (raw?: string | null): Date | null => {
  if (!raw) return null;
  if (raw.includes('/')) {
    const [day, month, year] = raw.split('/');
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateDdMmYyyy = (date: Date | null): string => {
  if (!date) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
};

const parseLineDate = (product: { dataWaznosci?: string | number; data_waznosci?: string | number }): Date | null => {
  const raw = String(receiptLineDataWaznosci(product) || '');
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getRowLineValue = (row: ProductRow): number => {
  const ilosc = parseFloat(row.ilosc) || 0;
  const cenaPelna = row.cenaPelna ?? parsePlNumber(row.cena);
  return ilosc * cenaPelna;
};

const getRowLineValuePoRabacie = (row: ProductRow, rabatPercent: number): number => {
  const ilosc = parseFloat(row.ilosc) || 0;
  const cenaPelna = row.cenaPelna ?? parsePlNumber(row.cena);
  return roundMoney(ilosc * cenaPoRabacie(cenaPelna, rabatPercent, row.typ));
};

const getRowLineBruttoPoRabacie = (row: ProductRow, rabatPercent: number): number =>
  getRowLineValuePoRabacie(row, rabatPercent) * (1 + (row.vat || 0) / 100);

const objetoscLabel = (value: string): string => {
  if (!value) return '';
  return OBJETOSCI_WINA.find((item) => item.value === value)?.label || value;
};

const DisplaySlot: React.FC<{
  className?: string;
  children?: React.ReactNode;
}> = ({ className = '', children }) => (
  <div className={`${className}`.trim()}>{children ?? ''}</div>
);

export const ViewPurchasePage: React.FC<ViewPurchasePageProps> = ({ receiptId }) => {
  const navigate = useNavigate();
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [sprzedawca, setSprzedawca] = useState('');
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [kosztDostawy, setKosztDostawy] = useState('');
  const [productInvoice, setProductInvoice] = useState<string | null>(null);
  const [transportInvoice, setTransportInvoice] = useState<string | null>(null);
  const [kursDostawy, setKursDostawy] = useState('');
  const [podatekAkcyzowy, setPodatekAkcyzowy] = useState('');
  const [rabat, setRabat] = useState('0,00');
  const [walutaFaktury, setWalutaFaktury] = useState<WalutaFakturySelection>('');
  const [walutaDostawy, setWalutaDostawy] = useState<WalutaFakturySelection>('');
  const [kursFaktury, setKursFaktury] = useState('');
  const [kwotaVat, setKwotaVat] = useState('');
  const [kwotaNetto, setKwotaNetto] = useState('');
  const [sumaBrutto, setSumaBrutto] = useState('');
  const [numerDokumentuPrzyjecia, setNumerDokumentuPrzyjecia] = useState('');

  const invoiceClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invoicePreviewWindowRef = useRef<Window | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadReceipt = async () => {
      setIsLoadingReceipt(true);
      try {
        const response = await fetch(`${API_URL}/api/product-receipts/${receiptId}`);
        if (!response.ok) throw new Error('not found');
        const receipt = await response.json();
        if (cancelled) return;

        const productsArray = normalizeReceiptProductLines(receipt.products);
        const walutaFakturyInit = parseWalutaSelection(receipt.waluta_przyjecia) || normalizeWalutaFaktury(receipt.waluta_przyjecia);
        const walutaDostawyInit = parseWalutaSelection(receipt.waluta_dostawy);

        setSelectedDate(parseReceiptDate(receipt.data_przyjecia));
        setSprzedawca(receipt.sprzedawca || '');
        setKosztDostawy(formatPlMoney(Number(receipt.wartosc_dostawy) || 0));
        setWalutaFaktury(walutaFakturyInit);
        setWalutaDostawy(walutaDostawyInit);
        setKursDostawy(needsKursToPln(walutaDostawyInit) ? formatStoredKursToPln(receipt.kurs_1) : '');
        setKursFaktury(
          needsKursToPln(walutaFakturyInit) && walutaFakturyInit !== walutaDostawyInit
            ? formatStoredKursToPln(receipt.kurs_2)
            : ''
        );
        setPodatekAkcyzowy(formatPlMoney(Number(receipt.stawka_podatek_akcyzowy ?? 0)));
        setRabat(formatPlMoney(Number(receipt.rabat ?? 0)));
        setKwotaNetto(Number(receipt.wartosc_przyjecia_netto) > 0 ? formatPlMoney(Number(receipt.wartosc_przyjecia_netto)) : '');
        setKwotaVat(Number(receipt.vat) > 0 ? formatPlMoney(Number(receipt.vat)) : '');
        setSumaBrutto(Number(receipt.wartosc_przyjecia_brutto) > 0 ? formatPlMoney(Number(receipt.wartosc_przyjecia_brutto)) : '');
        setProductInvoice(receipt.product_invoice || null);
        setTransportInvoice(receipt.transport_invoice || null);
        setNumerDokumentuPrzyjecia(receipt.numer_dokumentu_przyjecia || '');
        setProductRows(
          productsArray.map((product) => ({
            kod: product.kod || '',
            nazwa: product.nazwa || '',
            kod_kreskowy: product.kod_kreskowy || '',
            ilosc: (product.ilosc || 0).toString(),
            cena: formatPlMoney(Number(product.cena) || 0),
            dataWaznosci: parseLineDate(product),
            vat: Number(product.vat) || 0,
            typ: product.typ || '',
            objetosc: product.objetosc != null ? String(product.objetosc) : '',
          }))
        );
      } catch {
        if (!cancelled) {
          toast.error('Nie znaleziono przyjęcia');
          navigate(ZAKUP_PATH);
        }
      } finally {
        if (!cancelled) setIsLoadingReceipt(false);
      }
    };
    void loadReceipt();
    return () => { cancelled = true; };
  }, [receiptId, navigate]);

  const openInvoice = (filename: string | null) => {
    const url = receiptInvoiceUrl(filename || '');
    if (!url) return;
    scheduleInvoiceOpen(url, invoiceClickTimerRef, invoicePreviewWindowRef);
  };

  const rabatPercent = parsePlNumber(rabat);
  const showRabatCol = rabatPercent > 0;
  const deliveryCostNumber = parsePlNumber(kosztDostawy);
  const rabatKwota = roundMoney(Math.max(
    0,
    productRows.reduce((sum, row) => sum + getRowLineValue(row), 0) - parsePlNumber(kwotaNetto)
  ));
  const productRowGrid = `${PRODUCT_ROW_GRID_BASE} ${showRabatCol ? PRODUCT_ROW_COLS_RABAT : PRODUCT_ROW_COLS}`;
  const productRowHeader = `${productRowGrid} items-end justify-items-stretch`;
  const productRowFields = `${productRowGrid} items-start`;
  const productRowsInnerClass = `product-rows-inner${showRabatCol ? ' is-wide' : ''}`;
  const kurs1Active = isKursDostawyInputActive(walutaDostawy);
  const kurs2Active = isKursFakturyInputActive(walutaDostawy, walutaFaktury);

  const calculateDeliveryCostPerUnit = () => {
    const totalBottles = productRows.reduce(
      (total, row) => row.typ === 'aksesoria' ? total : total + (parseFloat(row.ilosc.toString().replace(',', '.')) || 0),
      0
    );
    const deliveryCost = parseFloat(kosztDostawy.replace(',', '.')) || 0;
    return totalBottles > 0 ? (deliveryCost / totalBottles).toFixed(2) : '0,00';
  };

  const walutaFakturySymbol = getWalutaSymbol(walutaFaktury);
  const walutaDostawySymbol = getWalutaSymbol(walutaDostawy);
  const invoiceTitleHasFile = INVOICE_FILE_BUTTON_TITLE_HAS_FILE.split('.')[0];
  const deliveryPerUnitDisplay = calculateDeliveryCostPerUnit().replace('.', ',');

  if (isLoadingReceipt) {
    return (
      <div className="font-sora h-screen w-full bg-gray-200 overflow-hidden">
        <div className="h-full mx-8 lg:mx-12 bg-white flex items-center justify-center shadow-sm">
          <span className="text-sm text-gray-500 font-sora">Ładowanie…</span>
        </div>
      </div>
    );
  }

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
            <span className="text-lg font-medium text-gray-800 select-none">Szczegóły przyjęcia</span>
            <DisplaySlot
              className="min-h-[30px] ml-4 w-[124px] px-2 py-1.5 flex items-center justify-center font-sora text-xs text-center text-gray-800 whitespace-normal break-words leading-tight"
            >
              {numerDokumentuPrzyjecia}
            </DisplaySlot>
          </div>
        </div>

        <div className="shrink-0 px-8 py-6">
        <div className="grid grid-cols-[300px_136px_119px_1fr] gap-x-8 gap-y-5 items-end">
          <div className="w-[300px]">
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Data zakupu</label>
            <DisplaySlot className={`w-[200px] ${HEADER_SLOT}`}>
              {formatDateDdMmYyyy(selectedDate)}
            </DisplaySlot>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Wartość dostawy</label>
            <div className="relative">
              <DisplaySlot className={`w-full ${HEADER_SLOT} pr-9`}>
                {kosztDostawy}
              </DisplaySlot>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                {walutaDostawySymbol}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Waluta dostawy</label>
            <DisplaySlot className={`w-full min-h-[30px] px-2 py-1.5 flex items-center font-sora text-xs text-gray-900 whitespace-normal break-words leading-tight`}>
              {walutaDostawy || '—'}
            </DisplaySlot>
          </div>

          <div className="flex gap-8 min-w-0 items-end w-full">
            <div className="w-[112px] shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">{getKursToPlnLabel(1, kurs1Active ? walutaDostawy : '')}</label>
              {kurs1Active ? (
                <DisplaySlot className={`w-[112px] ${HEADER_SLOT} pr-6`}>
                  {kursDostawy}
                </DisplaySlot>
              ) : (
                <div className="w-[112px] h-[30px]" />
              )}
            </div>
            <div className="ml-auto flex gap-2 shrink-0">
              <div className="w-[75px]">
                <button
                  type="button"
                  onClick={() => openInvoice(productInvoice)}
                  disabled={!productInvoice}
                  className={`inline-flex items-center justify-center h-[30px] w-full rounded-md bg-white ${
                    productInvoice
                      ? 'border border-green-500 hover:bg-green-50'
                      : 'border border-gray-300'
                  }`}
                  title={productInvoice ? invoiceTitleHasFile : undefined}
                >
                  <Grape className={`h-4 w-4 ${productInvoice ? 'text-green-600' : 'text-gray-500'}`} />
                </button>
              </div>
              <div className="w-[75px]">
                <button
                  type="button"
                  onClick={() => openInvoice(transportInvoice)}
                  disabled={!transportInvoice}
                  className={`inline-flex items-center justify-center h-[30px] w-full rounded-md bg-white ${
                    transportInvoice
                      ? 'border border-green-500 hover:bg-green-50'
                      : 'border border-gray-300'
                  }`}
                  title={transportInvoice ? invoiceTitleHasFile : undefined}
                >
                  <Car className={`h-4 w-4 ${transportInvoice ? 'text-green-600' : 'text-gray-500'}`} />
                </button>
              </div>
            </div>
          </div>

          <div className="w-[300px]">
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Sprzedawca</label>
            <DisplaySlot className={`w-[300px] ${HEADER_SLOT}`}>
              {sprzedawca}
            </DisplaySlot>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Koszt/but. (średnie)</label>
            <div className="relative">
              <DisplaySlot className={`w-full ${HEADER_SLOT} pr-9 text-gray-600`}>
                {deliveryPerUnitDisplay}
              </DisplaySlot>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                {walutaDostawySymbol}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Waluta faktury</label>
            <DisplaySlot className={`w-full min-h-[30px] px-2 py-1.5 flex items-center font-sora text-xs text-gray-900 whitespace-normal break-words leading-tight`}>
              {walutaFaktury || '—'}
            </DisplaySlot>
          </div>

          <div className="flex gap-8 min-w-0 items-end">
            <div className="w-[112px] shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">{getKursToPlnLabel(2, kurs2Active ? walutaFaktury : '')}</label>
              {kurs2Active ? (
                <DisplaySlot className={`w-[112px] ${HEADER_SLOT} pr-6`}>
                  {kursFaktury}
                </DisplaySlot>
              ) : (
                <div className="w-[112px] h-[30px]" />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Podatek akcyz. /l</label>
              <div className="relative">
                <DisplaySlot className={`w-[112px] ${HEADER_SLOT} pr-10`}>
                  {podatekAkcyzowy}
                </DisplaySlot>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">PLN</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora whitespace-nowrap">Rabat (%)</label>
              <DisplaySlot className={`w-[77px] ${HEADER_SLOT}`}>
                {rabat}
              </DisplaySlot>
            </div>
          </div>
        </div>
        </div>

        <div className="border-t border-gray-200" />

        <div className="product-table flex-1 min-h-0 min-w-0 pl-8 pr-0 py-6 flex flex-col">
          <div className="product-table-hscroll flex flex-col">
          <div className={productRowsInnerClass}>
          <div className={`product-row-head shrink-0 mb-2 bg-white ${productRowHeader}`}>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Kod</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Nazwa</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Kod kreskowy</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Ilość</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Cena</span>
            {showRabatCol && (
              <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora whitespace-nowrap">Cena po rab.</span>
            )}
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Wart. netto</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">VAT</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Wart. brutto</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Typ</span>
            <span className="block w-full text-left text-xs font-medium text-gray-700 font-sora">Objętość</span>
            <span className="product-col-koszt block w-full text-left text-xs font-medium text-gray-700 font-sora">Koszt/but.</span>
            <span className="product-col-actions" />
          </div>

            <div>
            {productRows.map((row, index) => {
              const typMeta = TYPY_TOWARU.find((item) => item.value === row.typ);
              const dataWaznosciText = row.dataWaznosci ? formatDateDdMmYyyy(row.dataWaznosci) : '';
              return (
              <div
                key={`${row.kod}-${index}`}
                className={`${productRowFields} relative py-2 border-b border-gray-200`}
              >
                <DisplaySlot className={ROW_SLOT}>{row.kod}</DisplaySlot>
                <DisplaySlot className={ROW_SLOT}>{row.nazwa}</DisplaySlot>
                <DisplaySlot className={ROW_SLOT}>{row.kod_kreskowy}</DisplaySlot>
                <DisplaySlot className={ROW_SLOT}>{row.ilosc}</DisplaySlot>
                <DisplaySlot className={ROW_SLOT}>{row.cena}</DisplaySlot>
                {showRabatCol && (
                  <DisplaySlot className={ROW_SLOT}>
                    {formatCenaPoRabacie(cenaPoRabacie(row.cenaPelna ?? parsePlNumber(row.cena), rabatPercent, row.typ))}
                  </DisplaySlot>
                )}
                <DisplaySlot className={ROW_SLOT}>
                  {formatPlMoney(getRowLineValuePoRabacie(row, rabatPercent))}
                </DisplaySlot>
                <DisplaySlot className={`${ROW_SLOT} px-2`}>
                  {`${row.vat}%`}
                </DisplaySlot>
                <DisplaySlot className={ROW_SLOT}>
                  {formatPlMoney(getRowLineBruttoPoRabacie(row, rabatPercent))}
                </DisplaySlot>
                <DisplaySlot className={ROW_SLOT}>
                  {typMeta?.label || row.typ}
                </DisplaySlot>
                <DisplaySlot className={ROW_SLOT}>
                  {objetoscLabel(row.objetosc)}
                </DisplaySlot>
                <div className="product-col-koszt min-w-0 w-full">
                  <DisplaySlot className={ROW_SLOT}>
                    {formatPlMoney(kosztButWgWartosci(row, productRows, deliveryCostNumber))}
                  </DisplaySlot>
                </div>
                <div className="product-col-actions min-w-0 w-full">
                  <DisplaySlot className={ROW_SLOT}>
                    {dataWaznosciText}
                  </DisplaySlot>
                </div>
              </div>
            );
            })}
            </div>
          </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-200 px-8 min-h-[90px] py-4 flex items-center justify-between gap-6">
          <div className="flex items-center flex-nowrap gap-x-4 text-sm text-gray-700 font-sora overflow-x-auto min-w-0">
            <span className="inline-flex items-center gap-2 shrink-0">
              Netto:
              <span className="relative w-[148px] shrink-0">
                <DisplaySlot className={FOOTER_SLOT}>
                  {kwotaNetto}
                </DisplaySlot>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                  {walutaFakturySymbol}
                </span>
              </span>
            </span>
            <span className="inline-flex items-center gap-2 shrink-0">
              Brutto:
              <span className="relative w-[148px] shrink-0">
                <DisplaySlot className={FOOTER_SLOT}>
                  {sumaBrutto}
                </DisplaySlot>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                  {walutaFakturySymbol}
                </span>
              </span>
            </span>
            <span className="inline-flex items-center gap-2 shrink-0">
              VAT:
              <span className="relative w-[148px] shrink-0">
                <DisplaySlot className={FOOTER_SLOT}>
                  {kwotaVat}
                </DisplaySlot>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                  {walutaFakturySymbol}
                </span>
              </span>
            </span>
            {showRabatCol && (
            <span className="inline-flex items-center gap-2 shrink-0">
              Rabat:
              <span className="relative w-[148px] shrink-0">
                <DisplaySlot className={FOOTER_SLOT}>
                  {formatPlMoney(rabatKwota)}
                </DisplaySlot>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                  {walutaFakturySymbol}
                </span>
              </span>
            </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => navigate(ZAKUP_PATH)}
              className="px-5 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors font-sora cursor-pointer"
            >
              Zamknij
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
