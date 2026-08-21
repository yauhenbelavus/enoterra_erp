import React, { useEffect, useState } from 'react';
import { X, Plus, Minus, ArrowDownCircle } from 'lucide-react';
import { Tooltip } from 'react-tooltip';
import { ProductSearch } from '../components/ProductSearch';
import { OrderModal } from '../components/OrderModal';
import { OrdersList } from '../components/OrdersList';
import { InvoicesList } from '../components/InvoicesList';
import { InvoiceModal } from '../components/InvoiceModal';
import { ReservationsList } from '../components/ReservationsList';
import { ReturnModal } from '../components/ReturnModal';
import { WriteOffModal } from '../components/WriteOffModal';
import { PrzychodModal } from '../components/PrzychodModal';
import { CreateReservationModal } from '../components/CreateReservationModal';
import { KomisList } from '../components/KomisList';
import { AnalizaWydanList } from '../components/AnalizaWydanList';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

type SprzedazSubTab = 'wydanie' | 'rezerwacje' | 'analiza_towarow' | 'faktury' | 'komis' | 'analiza_wydan';

interface SprzedazPageProps {
  activeSubTab: string | null;
  setActiveSubTab: (tab: SprzedazSubTab) => void;
  ordersRefreshTrigger: number;
  onOrdersRefresh: () => void;
  reservationsRefreshTrigger: number;
  onReservationsRefresh: () => void;
  invoicesRefreshTrigger: number;
  onInvoicesRefresh: () => void;
}

export const SprzedazPage: React.FC<SprzedazPageProps> = ({
  activeSubTab,
  setActiveSubTab,
  ordersRefreshTrigger,
  onOrdersRefresh,
  reservationsRefreshTrigger,
  onReservationsRefresh,
  invoicesRefreshTrigger,
  onInvoicesRefresh,
}) => {
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showWriteOffModal, setShowWriteOffModal] = useState(false);
  const [showPrzychodModal, setShowPrzychodModal] = useState(false);
  const [isCreateReservationModalOpen, setIsCreateReservationModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [analysisProducts, setAnalysisProducts] = useState<any[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const loadAnalysisProducts = async () => {
    try {
      setAnalysisLoading(true);
      setAnalysisError(null);
      const response = await fetch(`${API_URL}/api/reservations/active-products`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setAnalysisProducts(data);
    } catch (err: any) {
      console.error('❌ Error loading analysis products:', err);
      setAnalysisError(err.message || 'Błąd ładowania danych');
    } finally {
      setAnalysisLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'analiza_towarow') {
      loadAnalysisProducts();
    }
  }, [activeSubTab, reservationsRefreshTrigger]);

  const handleProductSearch = async (query: string) => {
    try {
      const response = await fetch(`${API_URL}/api/working-sheets/search?query=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.map((item: any) => ({
        kod: item.kod,
        nazwa: item.nazwa,
        ilosc: item.ilosc.toString(),
        kodKreskowy: item.kod_kreskowy || '',
      }));
    } catch (error) {
      console.error('❌ Error searching working_sheets:', error);
      return [];
    }
  };

  const handleUpdateOrder = async (data: {
    id: number;
    klient: string;
    numer_zamowienia: string;
    products: Array<{
      kod: string;
      kod_kreskowy?: string;
      nazwa: string;
      ilosc: number;
      typ: string;
    }>;
  }) => {
    try {
      const response = await fetch(`${API_URL}/api/orders/${data.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to update order');
      }

      toast.success('Zamówienie zostało zaktualizowane');
      onOrdersRefresh();
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Błąd podczas aktualizacji zamówienia');
    }
  };

  return (
    <>
      <OrderModal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        onOrderCreated={onOrdersRefresh}
      />

      <ReturnModal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        onSubmit={onOrdersRefresh}
      />

      <WriteOffModal
        isOpen={showWriteOffModal}
        onClose={() => setShowWriteOffModal(false)}
        onSubmit={() => {
          setShowWriteOffModal(false);
          onOrdersRefresh();
        }}
      />

      <PrzychodModal
        isOpen={showPrzychodModal}
        onClose={() => setShowPrzychodModal(false)}
        onSubmit={() => {
          setShowPrzychodModal(false);
          onOrdersRefresh();
        }}
      />

      <CreateReservationModal
        isOpen={isCreateReservationModalOpen}
        onClose={() => setIsCreateReservationModalOpen(false)}
        onReservationCreated={() => {
          onReservationsRefresh();
          setIsCreateReservationModalOpen(false);
        }}
        apiUrl={API_URL}
      />

      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onSuccess={() => {
          onInvoicesRefresh();
          setIsInvoiceModalOpen(false);
        }}
      />

      <div className="flex flex-col gap-4 mt-4 w-full relative">
        <div className="flex">
          <button
            onClick={() => setActiveSubTab('wydanie')}
            className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
              activeSubTab === 'wydanie'
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Wydanie towarów
          </button>
          <button
            onClick={() => setActiveSubTab('rezerwacje')}
            className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
              activeSubTab === 'rezerwacje'
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Rezerwacje
          </button>
          <button
            onClick={() => setActiveSubTab('analiza_towarow')}
            className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
              activeSubTab === 'analiza_towarow'
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Analiza towarów
          </button>
          <button
            onClick={() => setActiveSubTab('faktury')}
            className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
              activeSubTab === 'faktury'
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Faktury
          </button>
          <button
            onClick={() => setActiveSubTab('komis')}
            className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
              activeSubTab === 'komis'
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Komis
          </button>
          <button
            onClick={() => setActiveSubTab('analiza_wydan')}
            className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
              activeSubTab === 'analiza_wydan'
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Analiza wydań
          </button>
        </div>

        {activeSubTab === 'wydanie' && (
          <div className="flex flex-col gap-4 mt-6">
            <div className="mb-4">
              <div className="w-full">
                <ProductSearch onSearch={handleProductSearch} />
              </div>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div
                className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit"
                onClick={() => setShowOrderModal(true)}
              >
                <button
                  type="button"
                  className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white"
                  title="Dodaj"
                >
                  <Plus size={16} />
                </button>
                <div className="px-2">
                  <span className="text-gray-900 font-sora text-[13px]">Dodaj zamowienie</span>
                </div>
              </div>

              <div
                className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit"
                onClick={() => setShowReturnModal(true)}
              >
                <button
                  type="button"
                  className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white"
                  title="Zwrot"
                >
                  <X size={16} />
                </button>
                <div className="px-2">
                  <span className="text-gray-900 font-sora text-[13px]">Zwrot towaru</span>
                </div>
              </div>

              <div
                className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit"
                onClick={() => setShowWriteOffModal(true)}
              >
                <button
                  type="button"
                  className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white"
                  title="Rozchód"
                >
                  <Minus size={16} />
                </button>
                <div className="px-2">
                  <span className="text-gray-900 font-sora text-[13px]">Rozchód towaru</span>
                </div>
              </div>

              <div
                className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit"
                onClick={() => setShowPrzychodModal(true)}
              >
                <button
                  type="button"
                  className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center text-white"
                  title="Przychód"
                >
                  <ArrowDownCircle size={16} />
                </button>
                <div className="px-2">
                  <span className="text-gray-900 font-sora text-[13px]">Przychód towaru</span>
                </div>
              </div>
            </div>
            <OrdersList
              onDeleteOrder={(orderId) => {
                console.log('Delete order:', orderId);
              }}
              onUpdateOrder={handleUpdateOrder}
              onInvoiceCreated={onInvoicesRefresh}
              refreshTrigger={ordersRefreshTrigger}
            />
          </div>
        )}

        {activeSubTab === 'rezerwacje' && (
          <div className="flex flex-col gap-4 mt-4 w-full">
            <div className="flex items-center gap-4">
              <div
                className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit"
                onClick={() => setIsCreateReservationModalOpen(true)}
              >
                <button
                  type="button"
                  className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white"
                  title="Dodaj"
                >
                  <Plus size={16} />
                </button>
                <div className="px-2">
                  <span className="text-gray-900 font-sora text-[13px]">Dodaj rezerwację</span>
                </div>
              </div>
            </div>
            <ReservationsList refreshTrigger={reservationsRefreshTrigger} />
          </div>
        )}

        {activeSubTab === 'analiza_towarow' && (
          <div className="space-y-4 mt-6">
            {analysisLoading && (
              <div className="text-gray-600 font-sora text-sm">Ładowanie danych...</div>
            )}

            {analysisError && (
              <div className="text-red-600 font-sora text-sm">{analysisError}</div>
            )}

            {!analysisLoading && !analysisError && (
              <div className="w-full overflow-y-scroll max-h-[calc(100dvh-280px)] relative">
                <table className="w-full">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="px-0 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
                        Kod
                      </th>
                      <th className="px-10 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
                        Nazwa
                      </th>
                      <th className="px-0 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
                        Pozostało
                      </th>
                      <th className="px-0 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
                        Wydane
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
                        Zarezerwowane
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {analysisProducts.filter(p => {
                      const ilosc = p.ilosc ?? 0;
                      const iloscWydane = p.ilosc_wydane ?? 0;
                      return (ilosc - iloscWydane) > 0;
                    }).length > 0 ? (
                      analysisProducts.filter(p => {
                        const ilosc = p.ilosc ?? 0;
                        const iloscWydane = p.ilosc_wydane ?? 0;
                        return (ilosc - iloscWydane) > 0;
                      }).map((p, idx) => {
                        const ilosc = p.ilosc ?? 0;
                        const iloscWydane = p.ilosc_wydane ?? 0;
                        const pozostalo = ilosc - iloscWydane;
                        const kod = p.product_kod ?? '—';
                        const nazwa = p.product_nazwa ?? '—';
                        const klienci = p.klienci || [];
                        return (
                          <tr key={`${p.product_kod}-${idx}`} className="hover:bg-gray-50">
                            <td className="px-0 py-4 whitespace-nowrap text-sm text-gray-900 font-sora">
                              {kod}
                            </td>
                            <td className="px-10 py-4 whitespace-nowrap text-sm text-gray-900 font-sora">
                              {nazwa}
                            </td>
                            <td className="px-0 py-4 whitespace-nowrap text-sm text-gray-900 font-sora text-center">
                              <span className={pozostalo > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>
                                {pozostalo}
                              </span>
                            </td>
                            <td
                              className="px-0 py-4 whitespace-nowrap text-sm text-gray-900 font-sora text-center text-red-600 cursor-pointer"
                              data-tooltip-id={`wydane-tooltip-${p.product_kod}-${idx}`}
                            >
                              {iloscWydane}
                              {iloscWydane > 0 && (
                                <Tooltip
                                  id={`wydane-tooltip-${p.product_kod}-${idx}`}
                                  className="max-w-md"
                                  place="top"
                                  positionStrategy="fixed"
                                  noArrow={true}
                                >
                                  <div className="font-sora">
                                    {p.zamowienia_z_iloscia && p.zamowienia_z_iloscia.length > 0 ? (
                                      p.zamowienia_z_iloscia.map((zam: any, zIdx: number) => (
                                        <div key={zIdx} className={zIdx === 0 ? '' : 'mt-0.5'}>
                                          <span className="font-medium">{zam.numer_zamowienia}</span>
                                          <span className="text-gray-500 ml-2">{zam.ilosc} szt</span>
                                        </div>
                                      ))
                                    ) : (
                                      <div>Brak danych o zamówieniach</div>
                                    )}
                                  </div>
                                </Tooltip>
                              )}
                            </td>
                            <td
                              className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-sora text-center cursor-pointer"
                              data-tooltip-id={`zarezerwowane-tooltip-${p.product_kod}-${idx}`}
                            >
                              {ilosc}
                              {klienci.length > 0 && (
                                <Tooltip
                                  id={`zarezerwowane-tooltip-${p.product_kod}-${idx}`}
                                  className="max-w-md"
                                  place="top"
                                  positionStrategy="fixed"
                                  noArrow={true}
                                >
                                  <div className="font-sora">
                                    {klienci.map((klient: any, rIdx: number) => (
                                      <div key={rIdx} className={rIdx === 0 ? '' : 'mt-0.5'}>
                                        <span className="font-medium">{klient.klient || '—'}</span>
                                        <span className="text-gray-500 ml-2">{klient.ilosc ?? 0} szt</span>
                                      </div>
                                    ))}
                                  </div>
                                </Tooltip>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                          Brak towarów w aktywnych rezerwacjach
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'faktury' && (
          <div className="flex flex-col gap-4 mt-6 w-full">
            <div className="flex items-center gap-4 mb-4">
              <div
                className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit"
                onClick={() => setIsInvoiceModalOpen(true)}
              >
                <button
                  type="button"
                  className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white"
                  title="Dodaj"
                >
                  <Plus size={16} />
                </button>
                <div className="px-2">
                  <span className="text-gray-900 font-sora text-[13px]">Dodaj fakturę</span>
                </div>
              </div>
            </div>
            <InvoicesList
              refreshTrigger={invoicesRefreshTrigger}
              onInvoiceDeleted={onOrdersRefresh}
            />
          </div>
        )}

        {activeSubTab === 'komis' && (
          <div className="flex flex-col gap-4 mt-6 w-full">
            <KomisList refreshTrigger={ordersRefreshTrigger} />
          </div>
        )}

        {activeSubTab === 'analiza_wydan' && (
          <div className="flex flex-col gap-4 mt-6 w-full">
            <AnalizaWydanList refreshTrigger={ordersRefreshTrigger} apiUrl={API_URL} />
          </div>
        )}
      </div>
    </>
  );
};
