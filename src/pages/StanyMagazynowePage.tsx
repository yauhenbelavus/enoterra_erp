import React from 'react';
import { InventoryStatus } from '../components/InventoryStatus';
import { CzasSkladowaniaList } from '../components/CzasSkladowaniaList';

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

type StanyMagazynoweSubTab = 'towary' | 'analiza_magazynu';

interface StanyMagazynowePageProps {
  activeSubTab: string | null;
  setActiveSubTab: (tab: StanyMagazynoweSubTab) => void;
  productReceipts: ProductReceipt[];
}

export const StanyMagazynowePage: React.FC<StanyMagazynowePageProps> = ({
  activeSubTab,
  setActiveSubTab,
  productReceipts,
}) => {
  return (
    <div className="flex flex-col gap-4 mt-4 w-full">
      <div className="flex">
        <button
          onClick={() => setActiveSubTab('towary')}
          className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
            activeSubTab === 'towary'
              ? 'text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Towary
        </button>
        <button
          onClick={() => setActiveSubTab('analiza_magazynu')}
          className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
            activeSubTab === 'analiza_magazynu'
              ? 'text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Analiza magazynu
        </button>
      </div>

      {activeSubTab === 'towary' && (
        <div className="flex flex-col gap-4 mt-6">
          <InventoryStatus productReceipts={productReceipts} />
        </div>
      )}

      {activeSubTab === 'analiza_magazynu' && (
        <div className="flex flex-col gap-4 mt-6">
          <CzasSkladowaniaList productReceipts={productReceipts} />
        </div>
      )}
    </div>
  );
};
