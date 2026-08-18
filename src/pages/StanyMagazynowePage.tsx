import React from 'react';
import { InventoryStatus } from '../components/InventoryStatus';

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

interface StanyMagazynowePageProps {
  productReceipts: ProductReceipt[];
}

export const StanyMagazynowePage: React.FC<StanyMagazynowePageProps> = ({
  productReceipts,
}) => {
  return (
    <div className="flex flex-col gap-4 mt-4 w-full">
      <InventoryStatus productReceipts={productReceipts} />
    </div>
  );
};
