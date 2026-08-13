import React, { useState } from 'react';
import { FileSpreadsheet, Plus } from 'lucide-react';
import { ExcelFileUploadModal } from '../components/ExcelFileUploadModal';
import { ReplaceFileModal } from '../components/ReplaceFileModal';
import { AddProductModal } from '../components/AddProductModal';
import { ReceiptDetailsModal } from '../components/ReceiptDetailsModal';
import { EditReceiptModal, EditReceiptSubmitResult } from '../components/EditReceiptModal';
import { ProductReceiptsList } from '../components/ProductReceiptsList';
import { DataTable } from '../components/DataTable';
import { openExcelModal } from '../utils/modalUtils';
import toast from 'react-hot-toast';
import { Product } from '../types/Product';

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
      transportInvoice: receipt.transportInvoice,
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
      rezerwacje: item.rezerwacje,
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
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
  const [isEditReceiptModalOpen, setIsEditReceiptModalOpen] = useState(false);
  const [receiptToEdit, setReceiptToEdit] = useState<any>(null);
  const [isReceiptDetailsModalOpen, setIsReceiptDetailsModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ProductReceipt | null>(null);

  const handleAddProduct = async (data: {
    date: string;
    sprzedawca: string;
    wartosc: number;
    kosztDostawy: number;
    aktualnyKurs?: number | string;
    podatekAkcyzowy?: number | string;
    rabat?: string;
    walutaFaktury?: string;
    kursFaktury?: number;
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
    productInvoice?: File | null;
    transportInvoice?: File | null;
  }) => {
    try {
      let response;
      if (data.productInvoice || data.transportInvoice) {
        const formData = new FormData();
        const jsonData = {
          date: data.date,
          sprzedawca: data.sprzedawca,
          wartosc: data.wartosc,
          kosztDostawy: data.kosztDostawy,
          aktualnyKurs: data.aktualnyKurs,
          podatekAkcyzowy: data.podatekAkcyzowy,
          rabat: data.rabat,
          walutaFaktury: data.walutaFaktury,
          kursFaktury: data.kursFaktury,
          products: data.products,
        };
        formData.append('data', JSON.stringify(jsonData));
        if (data.productInvoice) formData.append('productInvoice', data.productInvoice);
        if (data.transportInvoice) formData.append('transportInvoice', data.transportInvoice);
        response = await fetch(`${API_URL}/api/product-receipts`, { method: 'POST', body: formData });
      } else {
        response = await fetch(`${API_URL}/api/product-receipts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: data.date,
            sprzedawca: data.sprzedawca,
            wartosc: data.wartosc,
            kosztDostawy: data.kosztDostawy,
            aktualnyKurs: data.aktualnyKurs,
            podatekAkcyzowy: data.podatekAkcyzowy,
            rabat: data.rabat,
            walutaFaktury: data.walutaFaktury,
            kursFaktury: data.kursFaktury,
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
      setIsAddProductModalOpen(false);
    } catch (error) {
      console.error('❌ Error adding product:', error);
      toast.error('Wystąpił błąd podczas dodawania towaru');
    }
  };

  const handleUpdateReceipt = async (data: {
    id: number;
    date: string;
    sprzedawca: string;
    wartosc: number;
    kosztDostawy: number;
    aktualnyKurs?: number | string;
    podatekAkcyzowy?: number | string;
    rabat?: number | string;
    walutaFaktury?: string;
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
  }): Promise<EditReceiptSubmitResult> => {
    try {
      let response;
      if (data.productInvoice || data.transportInvoice) {
        const formData = new FormData();
        const jsonData = {
          date: data.date,
          sprzedawca: data.sprzedawca,
          wartosc: data.wartosc,
          kosztDostawy: data.kosztDostawy,
          aktualnyKurs: data.aktualnyKurs,
          podatekAkcyzowy: data.podatekAkcyzowy,
          rabat: data.rabat,
          walutaFaktury: data.walutaFaktury,
          kursFaktury: data.kursFaktury,
          products: data.products,
        };
        formData.append('data', JSON.stringify(jsonData));
        if (data.productInvoice) formData.append('productInvoice', data.productInvoice);
        if (data.transportInvoice) formData.append('transportInvoice', data.transportInvoice);
        response = await fetch(`${API_URL}/api/product-receipts/${data.id}`, { method: 'PUT', body: formData });
      } else {
        response = await fetch(`${API_URL}/api/product-receipts/${data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: data.date,
            sprzedawca: data.sprzedawca,
            wartosc: data.wartosc,
            kosztDostawy: data.kosztDostawy,
            aktualnyKurs: data.aktualnyKurs,
            podatekAkcyzowy: data.podatekAkcyzowy,
            rabat: data.rabat,
            walutaFaktury: data.walutaFaktury,
            kursFaktury: data.kursFaktury,
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

      <AddProductModal
        isOpen={isAddProductModalOpen}
        onClose={() => setIsAddProductModalOpen(false)}
        onSubmit={handleAddProduct}
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
