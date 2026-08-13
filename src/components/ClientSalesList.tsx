import React, { useState, useEffect, useMemo } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface InvoiceSale {
  id: number;
  klient_nazwa: string;
  data_faktury: string;
  suma_netto: number;
  suma_brutto: number;
  butelki: number;
}

interface SaleProductLine {
  klient_nazwa: string;
  data_faktury: string;
  kod: string;
  nazwa: string;
  ilosc: number;
  wartosc_netto: number;
  wartosc_brutto: number;
}

interface ClientSalesRow {
  klient: string;
  butelki: number;
  sumNetto: number;
  sumBrutto: number;
}

interface WineSalesRow {
  key: string;
  kod: string;
  nazwa: string;
  butelki: number;
  sumNetto: number;
  sumBrutto: number;
}

interface ClientSalesListProps {
  refreshTrigger?: number;
}

interface SalesData {
  invoices: InvoiceSale[];
  products: SaleProductLine[];
}

const emptySalesData = (): SalesData => ({ invoices: [], products: [] });

const formatAmount = (value: number) => {
  const sign = value < 0 ? '-' : '';
  const [integerPart, decimalPart] = Math.abs(value).toFixed(2).split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${groupedInteger},${decimalPart} zł`;
};

const formatBottles = (value: number) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(value);

const getInvoiceYear = (dateStr: string) =>
  new Date(dateStr).getFullYear().toString();

const getInvoiceMonth = (dateStr: string) =>
  (new Date(dateStr).getMonth() + 1).toString().padStart(2, '0');

const toNumber = (value: unknown) =>
  typeof value === 'number' ? value : Number(value) || 0;

const MONTHS = [
  { value: '01', label: 'Styczeń' },
  { value: '02', label: 'Luty' },
  { value: '03', label: 'Marzec' },
  { value: '04', label: 'Kwiecień' },
  { value: '05', label: 'Maj' },
  { value: '06', label: 'Czerwiec' },
  { value: '07', label: 'Lipiec' },
  { value: '08', label: 'Sierpień' },
  { value: '09', label: 'Wrzesień' },
  { value: '10', label: 'Październik' },
  { value: '11', label: 'Listopad' },
  { value: '12', label: 'Grudzień' }
];

const buildWineRows = (lines: SaleProductLine[], klient: string): WineSalesRow[] => {
  const statsByWine = new Map<string, WineSalesRow>();

  lines
    .filter(line => line.klient_nazwa === klient)
    .sort((a, b) => new Date(a.data_faktury).getTime() - new Date(b.data_faktury).getTime())
    .forEach(line => {
      const kod = line.kod?.trim() || '';
      // Grupowanie po kodzie; bez kodu — fallback po nazwie
      const key = kod || `__no_kod__::${line.nazwa || ''}`;
      const current = statsByWine.get(key) || {
        key,
        kod: kod || '—',
        nazwa: line.nazwa || '—',
        butelki: 0,
        sumNetto: 0,
        sumBrutto: 0,
      };

      current.butelki += toNumber(line.ilosc);
      current.sumNetto += toNumber(line.wartosc_netto);
      current.sumBrutto += toNumber(line.wartosc_brutto);
      if (line.nazwa?.trim()) {
        current.nazwa = line.nazwa;
      }
      statsByWine.set(key, current);
    });

  return Array.from(statsByWine.values()).sort((a, b) => b.sumBrutto - a.sumBrutto);
};

export const ClientSalesList: React.FC<ClientSalesListProps> = ({ refreshTrigger }) => {
  const [salesData, setSalesData] = useState<SalesData>(emptySalesData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>('sumBrutto');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const loadSalesData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/clients/sales-by-invoices');
      if (response.ok) {
        const data = await response.json();
        if (data?.invoices && data?.products) {
          setSalesData({
            invoices: data.invoices,
            products: data.products,
          });
          return;
        }
      }

      // Fallback, gdy endpoint nie jest jeszcze wdrożony na serwerze
      const invoicesResponse = await fetch('/api/invoices');
      if (!invoicesResponse.ok) {
        const errorData = await invoicesResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Błąd ładowania sprzedaży klientom (${invoicesResponse.status})`);
      }

      const invoices = await invoicesResponse.json();
      const invoiceDetails = await Promise.all(
        invoices.map(async (invoice: { id: number }) => {
          const detailResponse = await fetch(`/api/invoices/${invoice.id}`);
          if (!detailResponse.ok) return null;
          return detailResponse.json();
        })
      );

      const invoiceSales: InvoiceSale[] = [];
      const productLines: SaleProductLine[] = [];

      invoiceDetails.forEach(invoice => {
        if (!invoice?.klient_nazwa) return;

        const butelki = (invoice.products || []).reduce(
          (sum: number, product: { ilosc?: number }) => sum + toNumber(product.ilosc),
          0
        );

        invoiceSales.push({
          id: invoice.id,
          klient_nazwa: invoice.klient_nazwa,
          data_faktury: invoice.data_faktury,
          suma_netto: toNumber(invoice.suma_netto),
          suma_brutto: toNumber(invoice.suma_brutto),
          butelki,
        });

        (invoice.products || []).forEach((product: {
          kod?: string;
          nazwa?: string;
          ilosc?: number;
          wartosc_netto?: number;
          wartosc_brutto?: number;
        }) => {
          productLines.push({
            klient_nazwa: invoice.klient_nazwa,
            data_faktury: invoice.data_faktury,
            kod: product.kod || '',
            nazwa: product.nazwa || '',
            ilosc: toNumber(product.ilosc),
            wartosc_netto: toNumber(product.wartosc_netto),
            wartosc_brutto: toNumber(product.wartosc_brutto),
          });
        });
      });

      setSalesData({ invoices: invoiceSales, products: productLines });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania sprzedaży klientom');
      setSalesData(emptySalesData());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSalesData();
  }, []);

  useEffect(() => {
    if (refreshTrigger != null) {
      loadSalesData();
    }
  }, [refreshTrigger]);

  const matchesFiltersExcept = (
    item: { klient_nazwa: string; data_faktury: string },
    except: 'client' | 'year' | 'month'
  ) => {
    if (except !== 'client' && selectedClient && item.klient_nazwa !== selectedClient) {
      return false;
    }
    if (except !== 'year' && selectedYear && getInvoiceYear(item.data_faktury) !== selectedYear) {
      return false;
    }
    if (except !== 'month' && selectedMonth && getInvoiceMonth(item.data_faktury) !== selectedMonth) {
      return false;
    }
    return true;
  };

  const availableClients = useMemo(
    () =>
      Array.from(
        new Set(
          salesData.invoices
            .filter(invoice => matchesFiltersExcept(invoice, 'client'))
            .map(invoice => invoice.klient_nazwa)
            .filter(Boolean)
        )
      ).sort(),
    [salesData.invoices, selectedYear, selectedMonth]
  );

  const availableYears = useMemo(
    () =>
      Array.from(
        new Set(
          salesData.invoices
            .filter(invoice => matchesFiltersExcept(invoice, 'year'))
            .map(invoice => getInvoiceYear(invoice.data_faktury))
        )
      ).sort((a, b) => parseInt(b, 10) - parseInt(a, 10)),
    [salesData.invoices, selectedClient, selectedMonth]
  );

  const availableMonths = useMemo(() => {
    const monthValues = new Set(
      salesData.invoices
        .filter(invoice => matchesFiltersExcept(invoice, 'month'))
        .map(invoice => getInvoiceMonth(invoice.data_faktury))
    );
    return MONTHS.filter(month => monthValues.has(month.value));
  }, [salesData.invoices, selectedClient, selectedYear]);

  useEffect(() => {
    if (selectedClient && !availableClients.includes(selectedClient)) {
      setSelectedClient('');
    }
  }, [selectedClient, availableClients]);

  useEffect(() => {
    if (selectedYear && !availableYears.includes(selectedYear)) {
      setSelectedYear('');
    }
  }, [selectedYear, availableYears]);

  useEffect(() => {
    if (selectedMonth && !availableMonths.some(month => month.value === selectedMonth)) {
      setSelectedMonth('');
    }
  }, [selectedMonth, availableMonths]);

  const filteredInvoices = salesData.invoices.filter(invoice => {
    if (selectedClient && invoice.klient_nazwa !== selectedClient) return false;
    if (selectedYear && getInvoiceYear(invoice.data_faktury) !== selectedYear) return false;
    if (selectedMonth && getInvoiceMonth(invoice.data_faktury) !== selectedMonth) return false;
    return true;
  });

  const filteredProducts = salesData.products.filter(product => {
    if (selectedClient && product.klient_nazwa !== selectedClient) return false;
    if (selectedYear && getInvoiceYear(product.data_faktury) !== selectedYear) return false;
    if (selectedMonth && getInvoiceMonth(product.data_faktury) !== selectedMonth) return false;
    return true;
  });

  const salesRows = useMemo(() => {
    const statsByClient = new Map<string, ClientSalesRow>();

    filteredInvoices.forEach(invoice => {
      const klient = invoice.klient_nazwa?.trim();
      if (!klient) return;

      const current = statsByClient.get(klient) || {
        klient,
        butelki: 0,
        sumNetto: 0,
        sumBrutto: 0,
      };

      current.butelki += toNumber(invoice.butelki);
      current.sumNetto += toNumber(invoice.suma_netto);
      current.sumBrutto += toNumber(invoice.suma_brutto);
      statsByClient.set(klient, current);
    });

    return Array.from(statsByClient.values());
  }, [filteredInvoices]);

  useEffect(() => {
    if (expandedClient && !salesRows.some(row => row.klient === expandedClient)) {
      setExpandedClient(null);
    }
  }, [expandedClient, salesRows]);

  const totalButelki = salesRows.reduce((sum, row) => sum + row.butelki, 0);
  const totalNetto = salesRows.reduce((sum, row) => sum + row.sumNetto, 0);
  const totalBrutto = salesRows.reduce((sum, row) => sum + row.sumBrutto, 0);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'klient' ? 'asc' : 'desc');
    }
  };

  const sortedRows = [...salesRows].sort((a, b) => {
    let aValue: string | number = '';
    let bValue: string | number = '';

    switch (sortField) {
      case 'klient':
        aValue = (a.klient || '').toLowerCase();
        bValue = (b.klient || '').toLowerCase();
        break;
      case 'butelki':
        aValue = a.butelki;
        bValue = b.butelki;
        break;
      case 'sumNetto':
        aValue = a.sumNetto;
        bValue = b.sumNetto;
        break;
      case 'sumBrutto':
        aValue = a.sumBrutto;
        bValue = b.sumBrutto;
        break;
      default:
        aValue = a.sumBrutto;
        bValue = b.sumBrutto;
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return sortDirection === 'asc'
      ? (aValue as number) - (bValue as number)
      : (bValue as number) - (aValue as number);
  });

  const toggleClientDetails = (klient: string) => {
    setExpandedClient(prev => (prev === klient ? null : klient));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="text-gray-500 font-sora">Ładowanie sprzedaży...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="text-red-500 font-sora">Błąd: {error}</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex justify-end">
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="block px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300 truncate"
              style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', width: '145px', minWidth: '145px', maxWidth: '145px' }}
            >
              <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Klient</option>
              {availableClients.map(client => (
                <option key={client} value={client} style={{ fontFamily: 'Sora, sans-serif' }}>{client}</option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="block w-auto px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300"
              style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', minWidth: '145px' }}
            >
              <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Rok</option>
              {availableYears.map(year => (
                <option key={year} value={year} style={{ fontFamily: 'Sora, sans-serif' }}>{year}</option>
              ))}
            </select>

            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="block w-auto px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300"
              style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', minWidth: '145px' }}
            >
              <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Miesiąc</option>
              {availableMonths.map(month => (
                <option key={month.value} value={month.value} style={{ fontFamily: 'Sora, sans-serif' }}>{month.label}</option>
              ))}
            </select>
          </div>

          {(selectedClient || selectedYear || selectedMonth) && (
            <button
              onClick={() => {
                setSelectedClient('');
                setSelectedYear('');
                setSelectedMonth('');
              }}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-xs font-sora transition-colors"
            >
              Wyczyść filtry
            </button>
          )}
        </div>
      </div>

      <div className="flex w-full justify-center items-center px-4">
        <span className="text-sm text-gray-600 font-sora pr-10">
          Butelki:{' '}
          <span className="font-bold">{formatBottles(totalButelki)}</span>
        </span>
        <span className="text-sm text-gray-600 font-sora pr-10 pl-10">
          Sprzedaż netto:{' '}
          <span className="font-bold">{formatAmount(totalNetto)}</span>
        </span>
        <span className="text-sm text-gray-600 font-sora pl-10">
          Sprzedaż brutto:{' '}
          <span className="font-bold">{formatAmount(totalBrutto)}</span>
        </span>
      </div>

      <div className="w-full overflow-y-scroll max-h-96 relative">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('klient')}
              >
                <div className="flex items-center gap-1">
                  Klient
                  {sortField === 'klient' && (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </div>
              </th>
              <th
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('butelki')}
              >
                <div className="flex items-center gap-1">
                  Butelki
                  {sortField === 'butelki' && (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </div>
              </th>
              <th
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('sumNetto')}
              >
                <div className="flex items-center gap-1">
                  Sprzedaż netto
                  {sortField === 'sumNetto' && (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </div>
              </th>
              <th
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('sumBrutto')}
              >
                <div className="flex items-center gap-1">
                  Sprzedaż brutto
                  {sortField === 'sumBrutto' && (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500 font-sora">
                  Brak klientów z fakturami dla wybranych filtrów
                </td>
              </tr>
            ) : (
              sortedRows.map(row => {
                const isExpanded = expandedClient === row.klient;
                const wineRows = isExpanded ? buildWineRows(filteredProducts, row.klient) : [];

                return (
                  <React.Fragment key={row.klient}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleClientDetails(row.klient)}
                    >
                      <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-900 font-sora">
                        {row.klient}
                      </td>
                      <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-600 font-sora">
                        {formatBottles(row.butelki)}
                      </td>
                      <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-600 font-sora">
                        {formatAmount(row.sumNetto)}
                      </td>
                      <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-600 font-sora">
                        {formatAmount(row.sumBrutto)}
                      </td>
                    </tr>

                    {isExpanded && wineRows.length === 0 && (
                      <tr className="bg-gray-50">
                        <td colSpan={4} className="px-8 py-3 text-sm text-gray-500 font-sora">
                          Brak pozycji win dla wybranych filtrów
                        </td>
                      </tr>
                    )}

                    {isExpanded &&
                      wineRows.map(wine => (
                        <tr key={wine.key} className="bg-gray-50">
                          <td className="px-8 py-2 pl-12 whitespace-nowrap text-sm text-gray-900 font-sora">
                            {wine.nazwa}
                          </td>
                          <td className="px-8 py-2 whitespace-nowrap text-sm text-gray-600 font-sora">
                            {formatBottles(wine.butelki)}
                          </td>
                          <td className="px-8 py-2 whitespace-nowrap text-sm text-gray-600 font-sora">
                            {formatAmount(wine.sumNetto)}
                          </td>
                          <td className="px-8 py-2 whitespace-nowrap text-sm text-gray-600 font-sora">
                            {formatAmount(wine.sumBrutto)}
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
