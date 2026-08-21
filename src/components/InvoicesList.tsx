import React, { useState, useEffect, useMemo } from 'react';
import { Eye, Edit, X } from 'lucide-react';
import Modal from 'react-modal';
import toast from 'react-hot-toast';
import { InvoiceDetailsModal } from './InvoiceDetailsModal';
import { EditInvoiceModal } from './EditInvoiceModal';
import { SortIndicator } from './SortIndicator';
import { compareInvoices, useTableSort } from '../utils/tableSort';

interface Invoice {
  id: number;
  numer_faktury: string;
  data_faktury: string;
  termin_platnosci: string | null;
  klient_nazwa: string;
  suma_netto: number;
  suma_brutto: number;
  rabat_suma: number;
  suma_vat?: number;
}

interface InvoicesListProps {
  refreshTrigger?: number;
  onInvoiceDeleted?: () => void;
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const formatAmount = (value: number) => {
  const sign = value < 0 ? '-' : '';
  const [integerPart, decimalPart] = Math.abs(value).toFixed(2).split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${groupedInteger},${decimalPart} zł`;
};

const getInvoiceYear = (dateStr: string) =>
  new Date(dateStr).getFullYear().toString();

const getInvoiceMonth = (dateStr: string) =>
  (new Date(dateStr).getMonth() + 1).toString().padStart(2, '0');

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

const WineBottleIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8 2h8" />
    <path d="M9 2v4.5" />
    <path d="M15 2v4.5" />
    <path d="M8 6.5h8" />
    <path d="M8 6.5c-1.5 4.5-2 10-.5 14.5.9 2.5 2.6 3.5 4.5 3.5s3.6-1 4.5-3.5c1.5-4.5 1-10-.5-14.5" />
  </svg>
);

export const InvoicesList: React.FC<InvoicesListProps> = ({ refreshTrigger, onInvoiceDeleted }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditFromKomis, setIsEditFromKomis] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<string>('');

  const loadInvoices = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/invoices');
      if (!response.ok) throw new Error('Błąd ładowania faktur');
      const data = await response.json();
      setInvoices(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania faktur');
      setInvoices([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  useEffect(() => {
    if (refreshTrigger != null) {
      loadInvoices();
    }
  }, [refreshTrigger]);

  const handleDeleteClick = (invoice: Invoice) => {
    setInvoiceToDelete(invoice);
    setIsPasswordModalOpen(true);
    setPassword('');
  };

  const handlePasswordSubmit = async () => {
    if (password === '5202') {
      if (invoiceToDelete?.id) {
        try {
          const response = await fetch(`/api/invoices/${invoiceToDelete.id}`, { method: 'DELETE' });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
          }
          toast.success(`Faktura ${invoiceToDelete.numer_faktury} została usunięta`);
          loadInvoices();
          onInvoiceDeleted?.();
        } catch (err) {
          console.error('Error deleting invoice:', err);
          toast.error(err instanceof Error ? err.message : 'Błąd podczas usuwania faktury');
        }
      }
      handlePasswordClose();
    } else {
      toast.error('Nieprawidłowe hasło');
      setPassword('');
    }
  };

  const handlePasswordClose = () => {
    setIsPasswordModalOpen(false);
    setInvoiceToDelete(null);
    setPassword('');
  };

  const matchesFiltersExcept = (
    invoice: Invoice,
    except: 'client' | 'year' | 'month'
  ) => {
    if (except !== 'client' && selectedClient && invoice.klient_nazwa !== selectedClient) {
      return false;
    }
    if (except !== 'year' && selectedYear && getInvoiceYear(invoice.data_faktury) !== selectedYear) {
      return false;
    }
    if (except !== 'month' && selectedMonth && getInvoiceMonth(invoice.data_faktury) !== selectedMonth) {
      return false;
    }
    return true;
  };

  const availableClients = useMemo(
    () =>
      Array.from(
        new Set(
          invoices
            .filter(inv => matchesFiltersExcept(inv, 'client'))
            .map(inv => inv.klient_nazwa)
            .filter(Boolean)
        )
      ).sort(),
    [invoices, selectedYear, selectedMonth]
  );

  const availableYears = useMemo(
    () =>
      Array.from(
        new Set(
          invoices
            .filter(inv => matchesFiltersExcept(inv, 'year'))
            .map(inv => getInvoiceYear(inv.data_faktury))
        )
      ).sort((a, b) => parseInt(b, 10) - parseInt(a, 10)),
    [invoices, selectedClient, selectedMonth]
  );

  const availableMonths = useMemo(
    () => {
      const monthValues = new Set(
        invoices
          .filter(inv => matchesFiltersExcept(inv, 'month'))
          .map(inv => getInvoiceMonth(inv.data_faktury))
      );
      return MONTHS.filter(month => monthValues.has(month.value));
    },
    [invoices, selectedClient, selectedYear]
  );

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

  const filteredInvoices = invoices.filter(invoice => {
    if (selectedYear && getInvoiceYear(invoice.data_faktury) !== selectedYear) return false;
    if (selectedMonth && getInvoiceMonth(invoice.data_faktury) !== selectedMonth) return false;
    if (selectedClient && invoice.klient_nazwa !== selectedClient) return false;
    return true;
  });

  const totalSprzedazNetto = filteredInvoices.reduce(
    (sum, inv) => sum + (typeof inv.suma_netto === 'number' ? inv.suma_netto : 0),
    0
  );
  const totalSprzedazBrutto = filteredInvoices.reduce(
    (sum, inv) => sum + (typeof inv.suma_brutto === 'number' ? inv.suma_brutto : 0),
    0
  );

  const { sortField, sortDirection, handleSort, sortedItems: sortedInvoices } = useTableSort(
    filteredInvoices,
    {
      defaultField: 'numer_faktury',
      defaultDirection: 'desc',
      compareItems: compareInvoices,
    }
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="text-gray-500 font-sora">Ładowanie faktur...</div>
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
      <div className="relative w-full">
        <div className="absolute top-0 right-0 z-10">
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

        <div className="flex w-full justify-center items-center min-h-[72px] px-4">
          <span className="text-sm text-gray-600 font-sora pr-16">
            Sprzedaż netto:{' '}
            <span className="font-bold">{formatAmount(totalSprzedazNetto)}</span>
          </span>
          <span className="text-sm text-gray-600 font-sora pl-16">
            Sprzedaż brutto:{' '}
            <span className="font-bold">{formatAmount(totalSprzedazBrutto)}</span>
          </span>
        </div>
      </div>

      <div className="w-full overflow-y-scroll max-h-[calc(100dvh-280px)] relative">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('numer_faktury')}
              >
                <div className="flex items-center gap-1">
                  Numer faktury
                  <SortIndicator field="numer_faktury" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('data_faktury')}
              >
                <div className="flex items-center gap-1">
                  Data faktury
                  <SortIndicator field="data_faktury" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('termin_platnosci')}
              >
                <div className="flex items-center gap-1">
                  Termin płatności
                  <SortIndicator field="termin_platnosci" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('klient_nazwa')}
              >
                <div className="flex items-center gap-1">
                  Klient
                  <SortIndicator field="klient_nazwa" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('suma_netto')}
              >
                <div className="flex items-center gap-1">
                  Kwota netto
                  <SortIndicator field="suma_netto" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('suma_brutto')}
              >
                <div className="flex items-center gap-1">
                  Kwota brutto
                  <SortIndicator field="suma_brutto" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedInvoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500 font-sora">
                  Brak faktur
                </td>
              </tr>
            ) : (
              sortedInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-900 font-sora">
                    {inv.numer_faktury}
                  </td>
                  <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-600 font-sora">
                    {formatDate(inv.data_faktury)}
                  </td>
                  <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-600 font-sora">
                    {inv.termin_platnosci ? formatDate(inv.termin_platnosci) : '—'}
                  </td>
                  <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-600 font-sora">
                    {inv.klient_nazwa}
                  </td>
                  <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-600 font-sora">
                    {typeof inv.suma_netto === 'number'
                      ? formatAmount(inv.suma_netto)
                      : '—'}
                  </td>
                  <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-600 font-sora">
                    {typeof inv.suma_brutto === 'number'
                      ? formatAmount(inv.suma_brutto)
                      : '—'}
                  </td>
                  <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedInvoice(inv);
                          setIsDetailsModalOpen(true);
                        }}
                        className="text-blue-600 hover:text-blue-800 focus:outline-none"
                        title="Zobacz szczegóły"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsEditFromKomis(false);
                          setInvoiceToEdit(inv);
                          setIsEditModalOpen(true);
                        }}
                        className="text-green-600 hover:text-green-800 focus:outline-none"
                        title="Edytuj fakturę"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsEditFromKomis(true);
                          setInvoiceToEdit(inv);
                          setIsEditModalOpen(true);
                        }}
                        className="text-orange-600 hover:text-orange-800 focus:outline-none"
                        title="Dodaj z komisu"
                      >
                        <WineBottleIcon size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteClick(inv);
                        }}
                        className="text-red-600 hover:text-red-800 focus:outline-none"
                        title="Usuń fakturę"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <InvoiceDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        invoice={selectedInvoice}
      />

      <EditInvoiceModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setInvoiceToEdit(null);
          setIsEditFromKomis(false);
        }}
        onSuccess={() => {
          loadInvoices();
        }}
        invoice={invoiceToEdit}
        readOnlyExisting={isEditFromKomis}
      />

      {/* Модал подтверждения удаления с паролем */}
      <Modal
        isOpen={isPasswordModalOpen}
        onRequestClose={handlePasswordClose}
        style={{
          content: {
            width: '320px',
            height: 'auto',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            margin: '0',
            borderRadius: '0.5rem',
            background: 'white',
            outline: 'none',
            padding: '24px',
            fontFamily: 'Sora',
          },
          overlay: { backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 9999 }
        }}
      >
        <div className="font-sora">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">Usuń fakturę</h2>
          <p className="text-xs text-gray-600 mb-4">
            Usuwasz fakturę <span className="font-semibold">{invoiceToDelete?.numer_faktury}</span>.
            {' '}Podaj hasło, aby potwierdzić.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordSubmit(); }}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none text-xs mb-4"
            placeholder="Hasło"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={handlePasswordClose}
              className="px-4 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Anuluj
            </button>
            <button
              onClick={handlePasswordSubmit}
              className="px-4 py-1.5 text-xs text-white bg-red-600 rounded-md hover:bg-red-700"
            >
              Usuń
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
