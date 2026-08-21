import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import Modal from 'react-modal';
import { SortableTh } from './SortIndicator';
import { getInvoiceProductSortValue, useTableSort } from '../utils/tableSort';

interface InvoiceProduct {
  id: number;
  invoice_id: number;
  kod: string;
  nazwa: string;
  ilosc: number;
  cena_netto: number;
  rabat: number;
  vat_stawka: number;
  wartosc_netto: number;
  wartosc_vat: number;
  wartosc_brutto: number;
}

interface Client {
  id: number;
  firma: string;
  nazwa: string;
  adres: string;
  kontakt: string;
}

interface Invoice {
  id: number;
  numer_faktury: string;
  data_faktury: string;
  termin_platnosci: string | null;
  klient_nazwa: string;
  suma_netto: number;
  suma_vat?: number;
  suma_brutto: number;
  rabat_suma: number;
  data_utworzenia?: string;
  products?: InvoiceProduct[];
}

interface InvoiceDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
}

export const InvoiceDetailsModal: React.FC<InvoiceDetailsModalProps> = ({ isOpen, onClose, invoice }) => {
  const [invoiceWithProducts, setInvoiceWithProducts] = useState<Invoice | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && invoice) {
      loadInvoiceWithProducts();
      loadClientData();
    }
  }, [isOpen, invoice]);

  const invoiceProducts = invoice ? ((invoiceWithProducts || invoice)?.products ?? []) : [];

  const { sortField, sortDirection, handleSort, sortedItems: sortedProducts } = useTableSort(
    invoiceProducts,
    getInvoiceProductSortValue,
    'nazwa',
    'asc'
  );

  const loadInvoiceWithProducts = async () => {
    if (!invoice) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/invoices/${invoice.id}`);
      if (!response.ok) {
        throw new Error('Failed to load invoice details');
      }
      const data = await response.json();
      setInvoiceWithProducts(data);
    } catch (error) {
      console.error('Error loading invoice details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadClientData = async () => {
    if (!invoice) return;
    
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(invoice.klient_nazwa)}`);
      if (response.ok) {
        const clientData = await response.json();
        setClient(clientData);
      }
    } catch (error) {
      console.error('Error loading client data:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateOnly = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const formatCurrency = (amount: number | undefined | null) => {
    return (amount || 0).toFixed(2).replace('.', ',') + ' zł';
  };

  const handleClose = () => {
    setInvoiceWithProducts(null);
    setClient(null);
    onClose();
  };

  if (!invoice) return null;

  const displayInvoice = invoiceWithProducts || invoice;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      style={{
        content: {
          width: '900px',
          height: '600px',
          maxWidth: '90%',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          margin: '0',
          borderRadius: '0.5rem',
          background: 'white',
          overflow: 'hidden',
          outline: 'none',
          padding: '24px',
          fontFamily: 'Sora',
          zIndex: 9999
        },
        overlay: {
          backgroundColor: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }
      }}
    >
      <div className="font-sora h-full flex flex-col overflow-hidden">
        <div className="flex justify-between items-center mb-8 select-none">
          <h2 className="text-base font-semibold text-gray-800">
            Szczegóły faktury
          </h2>
          <button
            onClick={handleClose}
            className="text-red-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 flex-grow overflow-y-auto pb-28">
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <>
              {/* Invoice Info */}
              <div className="bg-purple-50 p-4 rounded-md">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="font-medium text-gray-700">Numer faktury:</p>
                    <p className="text-sm font-bold text-gray-900">{displayInvoice.numer_faktury}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">Data faktury:</p>
                    <p className="text-gray-900">{formatDateOnly(displayInvoice.data_faktury)}</p>
                  </div>
                  {displayInvoice.termin_platnosci && (
                    <div>
                      <p className="font-medium text-gray-700">Termin płatności:</p>
                      <p className="text-gray-900">{formatDateOnly(displayInvoice.termin_platnosci)}</p>
                    </div>
                  )}
                  {displayInvoice.data_utworzenia && (
                    <div>
                      <p className="font-medium text-gray-700">Data utworzenia:</p>
                      <p className="text-gray-900">{formatDate(displayInvoice.data_utworzenia)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Client Info */}
              {client && (
                <div className="bg-green-50 p-3 rounded-md">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    <div>
                      <p className="font-medium text-gray-900 text-xs">Nazwa:</p>
                      <p className="text-xs text-gray-900">{client.nazwa}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-xs">Firma:</p>
                      <p className="text-xs text-gray-900">{client.firma}</p>
                    </div>
                    {client.adres && (
                      <div>
                        <p className="font-medium text-gray-900 text-xs">Adres:</p>
                        <p className="text-xs text-gray-900">{client.adres}</p>
                      </div>
                    )}
                    {client.kontakt && (
                      <div>
                        <p className="font-medium text-gray-900 text-xs">Kontakt:</p>
                        <p className="text-xs text-gray-900">{client.kontakt}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Products List */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">
                  Produkty na fakturze
                </h3>
                {displayInvoice.products && displayInvoice.products.length > 0 ? (
                  <div>
                    <table className="w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <SortableTh
                            label="Kod"
                            field="kod"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20 bg-gray-50"
                          />
                          <SortableTh
                            label="Nazwa"
                            field="nazwa"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50"
                          />
                          <SortableTh
                            label="Ilość"
                            field="ilosc"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16 bg-gray-50"
                          />
                          <SortableTh
                            label="Cena netto"
                            field="cena_netto"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24 bg-gray-50"
                          />
                          <SortableTh
                            label="Rabat"
                            field="rabat"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16 bg-gray-50"
                          />
                          <SortableTh
                            label="VAT"
                            field="vat_stawka"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16 bg-gray-50"
                          />
                          <SortableTh
                            label="Wartość netto"
                            field="wartosc_netto"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28 bg-gray-50"
                          />
                          <SortableTh
                            label="Wartość brutto"
                            field="wartosc_brutto"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28 bg-gray-50"
                          />
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {sortedProducts.map((product) => (
                          <tr key={product.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-xs text-gray-900 font-medium w-20">
                              {product.kod}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900">
                              <div className="break-words leading-tight">
                                {product.nazwa}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900 font-medium w-16 text-center">
                              {product.ilosc}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900 w-24 text-right">
                              {formatCurrency(product.cena_netto)}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900 w-16 text-center">
                              {product.rabat}%
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900 w-16 text-center">
                              {product.vat_stawka}%
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900 w-28 text-right">
                              {formatCurrency(product.wartosc_netto)}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900 font-medium w-28 text-right">
                              {formatCurrency(product.wartosc_brutto)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    Brak produktów na fakturze
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Summary fixed in bottom right corner */}
        <div className="absolute bottom-4 right-12">
          <div className="space-y-1">
            <div className="flex items-center">
              <span className="text-xs text-gray-700 mr-2">Kwota rabatu:</span>
              <span className="text-xs text-gray-900">{formatCurrency(displayInvoice.rabat_suma)}</span>
            </div>
            <div className="flex items-center">
              <span className="text-xs text-gray-700 mr-2">Kwota netto:</span>
              <span className="text-xs text-gray-900">{formatCurrency(displayInvoice.suma_netto)}</span>
            </div>
            <div className="flex items-center">
              <span className="text-xs text-gray-700 mr-2">Kwota VAT:</span>
              <span className="text-xs text-gray-900">{formatCurrency(displayInvoice.suma_vat)}</span>
            </div>
            <div className="flex items-center">
              <span className="text-xs font-bold text-gray-700 mr-2">Razem (PLN):</span>
              <span className="text-xs font-bold text-gray-900">{formatCurrency(displayInvoice.suma_brutto)}</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
