import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Plus } from 'lucide-react';
import { ExcelFileUploadModal } from '../components/ExcelFileUploadModal';
import { ReplaceFileModal } from '../components/ReplaceFileModal';
import { ReceiptDetailsModal } from '../components/ReceiptDetailsModal';
import { EditReceiptModal, EditReceiptSubmitResult } from '../components/EditReceiptModal';
import { ProductReceiptsList } from '../components/ProductReceiptsList';
import { DataTable } from '../components/DataTable';
import { openExcelModal } from '../utils/modalUtils';
import toast from 'react-hot-toast';
import { Product } from '../types/Product';
import { ZAKUP_NOWE_PATH } from '../routes';

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

interface SheetData {
  fileName: string;
  data: {
    headers: string[];
    rows: string[][];
  };
}

interface ZakupTowarowPageProps {
  activeSubTab: string | null;
  setActiveSubTab: (tab: 'przyjecie' | 'analiza' | 'kalendarz') => void;
  productReceipts: ProductReceipt[];
  onReceiptsChange: (receipts: ProductReceipt[]) => void;
  onProductsChange: (products: Product[]) => void;
  sheets: SheetData[];
  showTable: boolean;
  activeSheet: SheetData | null;
  onSheetsChange: () => void;
}

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
      stawka_podatek_akcyzowy: receipt.stawka_podatek_akcyzowy,
      products: receipt.products || [],
      product_invoice: receipt.product_invoice,
      transport_invoice: receipt.transport_invoice,
    }));
  } catch (error) {
    console.error('❌ Error loading product receipts:', error);
    return [];
  }
};

const loadProductsFromDb = async (): Promise<Product[]> => {
  try {
    const response = await fetch(`${API_URL}/api/products`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.map((item: any) => ({
      kod: item.kod,
      nazwa: item.nazwa,
      ilosc: item.ilosc,
      jednostka_miary: item.jednostka_miary || '',
      kod_kreskowy: item.kod_kreskowy || '',
      data_waznosci: item.data_waznosci ?? undefined,
      archiwalny: item.archiwalny,
      ilosc_na_poleceniach: item.ilosc_na_poleceniach,
      waga_netto: item.waga_netto,
      waga_brutto: item.waga_brutto,
      objetosc: item.objetosc,
      opis: item.opis,
    }));
  } catch (error) {
    console.error('❌ Error loading products:', error);
    return [];
  }
};

export const ZakupTowarowPage: React.FC<ZakupTowarowPageProps> = ({
  activeSubTab,
  setActiveSubTab,
  productReceipts,
  onReceiptsChange,
  onProductsChange,
  sheets,
  showTable,
  activeSheet,
  onSheetsChange,
}) => {
  const navigate = useNavigate();
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
  const [isEditReceiptModalOpen, setIsEditReceiptModalOpen] = useState(false);
  const [receiptToEdit, setReceiptToEdit] = useState<any>(null);
  const [isReceiptDetailsModalOpen, setIsReceiptDetailsModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ProductReceipt | null>(null);

  const handleAddProduct = async (data: {
    date: string;
    sprzedawca: string;
    wartosc_przyjecia_netto: number;
    vat?: number;
    wartosc_przyjecia_brutto?: number;
    wartosc_dostawy: number;
    kurs_1?: number;
    kurs_2?: number;
    stawka_podatek_akcyzowy?: number | string;
    rabat?: string;
    waluta_przyjecia?: string;
    waluta_dostawy?: string;
    products: Array<{
      kod: string;
      nazwa: string;
      kod_kreskowy?: string;
      ilosc: number;
      cena: number;
      dataWaznosci?: string;
      typ?: string;
      objetosc?: string;
    }>;
    product_invoice?: File | null;
    transport_invoice?: File | null;
  }) => {
    try {
      let response;
      if (data.product_invoice || data.transport_invoice) {
        const formData = new FormData();
        const jsonData = {
          date: data.date,
          sprzedawca: data.sprzedawca,
          wartosc_przyjecia_netto: data.wartosc_przyjecia_netto,
          vat: data.vat,
          wartosc_przyjecia_brutto: data.wartosc_przyjecia_brutto,
          wartosc_dostawy: data.wartosc_dostawy,
          kurs_1: data.kurs_1,
          kurs_2: data.kurs_2,
          stawka_podatek_akcyzowy: data.stawka_podatek_akcyzowy,
          rabat: data.rabat,
          waluta_przyjecia: data.waluta_przyjecia,
          waluta_dostawy: data.waluta_dostawy,
          products: data.products,
        };
        formData.append('data', JSON.stringify(jsonData));
        if (data.product_invoice) formData.append('product_invoice', data.product_invoice);
        if (data.transport_invoice) formData.append('transport_invoice', data.transport_invoice);
        response = await fetch(`${API_URL}/api/product-receipts`, { method: 'POST', body: formData });
      } else {
        response = await fetch(`${API_URL}/api/product-receipts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: data.date,
            sprzedawca: data.sprzedawca,
            wartosc_przyjecia_netto: data.wartosc_przyjecia_netto,
            vat: data.vat,
            wartosc_przyjecia_brutto: data.wartosc_przyjecia_brutto,
            wartosc_dostawy: data.wartosc_dostawy,
            kurs_1: data.kurs_1,
            kurs_2: data.kurs_2,
            stawka_podatek_akcyzowy: data.stawka_podatek_akcyzowy,
            rabat: data.rabat,
            waluta_przyjecia: data.waluta_przyjecia,
            waluta_dostawy: data.waluta_dostawy,
            products: data.products,
          }),
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save product receipt: ${response.status} - ${errorText}`);
      }

      const savedReceipt = await response.json();

      if (savedReceipt.workingSheetsUpdated || savedReceipt.workingSheetsInserted) {
        toast.success('Dodano nowy towar');
      } else {
        toast.success('Dodano nowy towar');
      }

      const updatedReceipts = await loadProductReceiptsFromDb();
      onReceiptsChange(updatedReceipts);
    } catch (error) {
      console.error('❌ Error adding product:', error);
      toast.error('Wystąpił błąd podczas dodawania towaru');
    }
  };

  const handleUpdateReceipt = async (data: {
    id: number;
    date: string;
    sprzedawca: string;
    wartosc_przyjecia_netto: number;
    vat?: number;
    wartosc_przyjecia_brutto?: number;
    wartosc_dostawy: number;
    kurs_1?: number;
    kurs_2?: number;
    stawka_podatek_akcyzowy?: number | string;
    rabat?: number | string;
    waluta_przyjecia?: string;
    waluta_dostawy?: string;
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
    product_invoice?: File | null;
    transport_invoice?: File | null;
  }): Promise<EditReceiptSubmitResult> => {
    try {
      let response;
      if (data.product_invoice || data.transport_invoice) {
        const formData = new FormData();
        const jsonData = {
          date: data.date,
          sprzedawca: data.sprzedawca,
          wartosc_przyjecia_netto: data.wartosc_przyjecia_netto,
          vat: data.vat,
          wartosc_przyjecia_brutto: data.wartosc_przyjecia_brutto,
          wartosc_dostawy: data.wartosc_dostawy,
          kurs_1: data.kurs_1,
          kurs_2: data.kurs_2,
          stawka_podatek_akcyzowy: data.stawka_podatek_akcyzowy,
          rabat: data.rabat,
          waluta_przyjecia: data.waluta_przyjecia,
          waluta_dostawy: data.waluta_dostawy,
          products: data.products,
        };
        formData.append('data', JSON.stringify(jsonData));
        if (data.product_invoice) formData.append('product_invoice', data.product_invoice);
        if (data.transport_invoice) formData.append('transport_invoice', data.transport_invoice);
        response = await fetch(`${API_URL}/api/product-receipts/${data.id}`, { method: 'PUT', body: formData });
      } else {
        response = await fetch(`${API_URL}/api/product-receipts/${data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: data.date,
            sprzedawca: data.sprzedawca,
            wartosc_przyjecia_netto: data.wartosc_przyjecia_netto,
            vat: data.vat,
            wartosc_przyjecia_brutto: data.wartosc_przyjecia_brutto,
            wartosc_dostawy: data.wartosc_dostawy,
            kurs_1: data.kurs_1,
            kurs_2: data.kurs_2,
            stawka_podatek_akcyzowy: data.stawka_podatek_akcyzowy,
            rabat: data.rabat,
            waluta_przyjecia: data.waluta_przyjecia,
            waluta_dostawy: data.waluta_dostawy,
            products: data.products,
          }),
        });
      }

      if (response.status === 409) {
        const body = await response.json().catch(() => ({}));
        if (body.error === 'kod_change_blocked' && Array.isArray(body.conflicts)) {
          return { ok: false, kodBlocked: { conflicts: body.conflicts, message: body.message } };
        }
      }

      if (!response.ok) throw new Error('Failed to update product receipt');

      const updatedReceipts = await loadProductReceiptsFromDb();
      const updatedProducts = await loadProductsFromDb();
      onReceiptsChange(updatedReceipts);
      onProductsChange(updatedProducts);

      toast.success('Zakup został zaktualizowany');
      setIsEditReceiptModalOpen(false);
      setReceiptToEdit(null);
      setIsReceiptDetailsModalOpen(false);
      setSelectedReceipt(null);
      return { ok: true };
    } catch (error) {
      console.error('Error updating product receipt:', error);
      toast.error('Wystąpił błąd podczas aktualizacji zakupu');
      return { ok: false };
    }
  };

  const handleDeleteReceipt = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/api/product-receipts/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete receipt');

      const updatedReceipts = await loadProductReceiptsFromDb();
      const updatedProducts = await loadProductsFromDb();
      onReceiptsChange(updatedReceipts);
      onProductsChange(updatedProducts);

      toast.success('Zakup został usunięty');
    } catch (error) {
      console.error('Error deleting receipt:', error);
      toast.error('Wystąpił błąd podczas usuwania zakupu');
    }
  };

  const handleExcelUpload = async (newFileName: string, fileData: { headers: string[]; rows: string[][] }) => {
    try {
      const response = await fetch(`${API_URL}/api/sheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: newFileName, data: fileData }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          toast.error('Może być tylko jeden plik Excel. Usuń istniejący plik przed załadowaniem nowego.');
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      await onSheetsChange();
      setIsExcelModalOpen(false);
    } catch (error) {
      console.error('Error saving file data:', error);
      toast.error('Błąd podczas zapisywania danych pliku');
    }
  };

  const handleFileClick = (sheet: SheetData) => {
    const downloadUrl = `${API_URL}/api/download_file/${encodeURIComponent(sheet.fileName)}`;
    window.open(downloadUrl, '_blank');
  };

  const handleReplaceConfirm = () => {
    setIsReplaceModalOpen(false);
    setIsExcelModalOpen(false);
  };

  return (
    <>
      <ExcelFileUploadModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        onUpload={handleExcelUpload}
      />

      <ReplaceFileModal
        isOpen={isReplaceModalOpen}
        onClose={() => setIsReplaceModalOpen(false)}
        fileName=""
        onConfirm={handleReplaceConfirm}
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

      <div className="flex flex-col gap-4 mt-4 w-full relative">
        {/* Подвкладки */}
        <div className="flex">
          <button
            onClick={() => setActiveSubTab('przyjecie')}
            className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
              activeSubTab === 'przyjecie' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Przyjęcie towarów
          </button>
          <button
            onClick={() => setActiveSubTab('analiza')}
            className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
              activeSubTab === 'analiza' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Analiza zakupów
          </button>
          <button
            onClick={() => setActiveSubTab('kalendarz')}
            className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
              activeSubTab === 'kalendarz' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Kalendarz płatności
          </button>
        </div>

        {/* Przyjęcie towarów */}
        {activeSubTab === 'przyjecie' && (
          <div className="flex flex-col gap-4 mt-6">
            <div className="flex items-center gap-4">
              <div
                className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit"
                onClick={() => navigate(ZAKUP_NOWE_PATH)}
              >
                <button
                  type="button"
                  className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white"
                  title="Dodaj"
                >
                  <Plus size={16} />
                </button>
                <div className="px-2">
                  <span className="text-gray-900 font-sora text-[13px]">Dodaj przyjęcie</span>
                </div>
              </div>
              <div
                className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit"
                onClick={() => openExcelModal(setIsExcelModalOpen)}
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
              receipts={productReceipts}
              onDelete={handleDeleteReceipt}
              onUpdate={handleUpdateReceipt}
            />
          </div>
        )}

        {/* Analiza zakupów */}
        {activeSubTab === 'analiza' && (
          <div className="flex flex-col gap-4">
            <div className="bg-white p-6 rounded-lg border">
              <h2 className="text-lg font-bold text-gray-900 font-sora mb-4">Analiza zakupów</h2>
              <p className="text-gray-600 font-sora">Funkcja analizy zakupów będzie dostępna wkrótce.</p>
            </div>
          </div>
        )}

        {/* Kalendarz płatności */}
        {activeSubTab === 'kalendarz' && (
          <div className="flex flex-col gap-4 mt-6">
            <div className="bg-white p-6 rounded-lg border">
              <h2 className="text-lg font-bold text-gray-900 font-sora mb-4">Kalendarz płatności</h2>
              <p className="text-gray-600 font-sora">Funkcja kalendarza płatności będzie dostępna wkrótce.</p>
            </div>
          </div>
        )}
      </div>

      {/* Przycisk pliku Excel */}
      <div className="absolute top-16 right-4 flex justify-end">
        {sheets.map((sheet) => (
          <div key={sheet.fileName} className="flex items-center gap-2">
            <button
              onClick={() => handleFileClick(sheet)}
              title="Klик: открыть файл в новой вкладке"
              className="px-4 py-1.5 bg-green-50 text-green-700 rounded-md inline-flex items-center hover:bg-green-100 transition-colors font-semibold text-[10px] cursor-pointer font-sora w-fit whitespace-nowrap"
            >
              {sheet.fileName}
            </button>
          </div>
        ))}
      </div>

      {/* Таблица Excel */}
      {showTable && activeSheet && (
        <div className="mt-6 bg-white">
          <div className="rounded-lg shadow-sm border border-gray-200 bg-white mt-6">
            <DataTable data={activeSheet.data} />
          </div>
        </div>
      )}
    </>
  );
};
