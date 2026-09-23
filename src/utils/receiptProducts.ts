export type ReceiptProductLine = {
  id?: number;
  kod: string;
  nazwa: string;
  kod_kreskowy?: string;
  ilosc: number;
  cena: number;
  dataWaznosci?: string | number;
  data_waznosci?: string | number;
  typ?: string;
  objetosc?: string | number;
  vat?: number;
};

function asReceiptProductLine(product: ReceiptProductLine): ReceiptProductLine {
  const dataWaznosci = product.dataWaznosci ?? product.data_waznosci;
  return {
    ...product,
    dataWaznosci,
    data_waznosci: dataWaznosci,
  };
}

export function normalizeReceiptProductLines(products: unknown): ReceiptProductLine[] {
  if (Array.isArray(products)) {
    return products.map((product) => asReceiptProductLine(product as ReceiptProductLine));
  }
  if (typeof products === 'string' && products.trim()) {
    try {
      const parsed = JSON.parse(products);
      return Array.isArray(parsed)
        ? parsed.map((product) => asReceiptProductLine(product as ReceiptProductLine))
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function receiptLineDataWaznosci(product: {
  dataWaznosci?: string | number;
  data_waznosci?: string | number;
}): string | number | undefined {
  return product.dataWaznosci ?? product.data_waznosci;
}
