export interface Product {
  kod: string;
  nazwa: string;
  ilosc: number;
  jednostka_miary: string;
  kod_kreskowy: string;
  data_waznosci?: number;
  archiwalny?: boolean;
  rezerwacje?: number;
  ilosc_na_poleceniach?: number;
  waga_netto?: number;
  waga_brutto?: number;
  objetosc?: number;
  opis?: string;
} 