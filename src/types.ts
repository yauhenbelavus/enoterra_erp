export interface SheetData {
  id: string;
  url: string;
  name: string;
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface StockItem {
  code: string;
  availableQuantity: number;
  quantity: number;
  lastUpdate: string;
}

export interface StockRecord {
  code: string;
  quantity: number;
  change: number;
  timestamp: string;
  reason: string;
}

export interface StorageProvider {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

export interface APIConfig {
  baseUrl: string;
}