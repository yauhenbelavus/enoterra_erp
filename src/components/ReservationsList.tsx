import React, { useState, useEffect } from 'react';
import { Edit, XCircle, X } from 'lucide-react';
import { ReservationDetailsModal } from './ReservationDetailsModal';
import { EditReservationModal } from './EditReservationModal';
import toast from 'react-hot-toast';
import {
  getEffectiveReservationStatus,
  isActiveReservationStatus,
  isIndefiniteReservation,
  RESERVATION_STATUS_FILTER_OPTIONS
} from '../utils/reservationDates';
import Modal from 'react-modal';
import { SortIndicator } from './SortIndicator';
import { compareReservations, useTableSort } from '../utils/tableSort';

interface ReservationProduct {
  id: number;
  reservation_id: number;
  product_id: number | null;
  product_kod: string;
  product_nazwa: string;
  kod_kreskowy: string | null;
  ilosc: number;
  komentarz: string | null;
  created_at: string;
}

interface Reservation {
  id: number;
  numer_rezerwacji: string;
  klient: string;
  firma: string;
  data_utworzenia: string;
  data_zakonczenia: string;
  status: string;
  komentarz: string | null;
  laczna_ilosc: number;
  products?: ReservationProduct[];
}

interface ReservationsListProps {
  refreshTrigger?: number;
}

export const ReservationsList: React.FC<ReservationsListProps> = ({ 
  refreshTrigger
}) => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [reservationToEdit, setReservationToEdit] = useState<Reservation | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [reservationToCancel, setReservationToCancel] = useState<Reservation | null>(null);

  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  const loadReservations = async () => {
    try {
      console.log('🔄 Starting to load reservations...');
      setIsLoading(true);
      setError(null);
      
      console.log('📡 Fetching from /api/reservations-with-products...');
      const response = await fetch('/api/reservations-with-products');
      console.log('📡 Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const rawData = await response.json();
      console.log('📡 Raw data received:', rawData);
      console.log('📡 Raw data length:', rawData.length);
      
      const transformedReservations = rawData.map((reservation: any) => {
        const normalized = {
          id: reservation.id,
          numer_rezerwacji: reservation.numer_rezerwacji,
          klient: reservation.klient || '',
          firma: reservation.firma || '',
          data_utworzenia: reservation.data_utworzenia,
          data_zakonczenia: reservation.data_zakonczenia,
          status: reservation.status || 'aktywna',
          komentarz: reservation.komentarz || null,
          laczna_ilosc: reservation.laczna_ilosc || 0,
          products: reservation.products || []
        };
        return {
          ...normalized,
          status: getEffectiveReservationStatus(normalized)
        };
      });
      
      console.log('🔄 Transformed reservations:', transformedReservations);
      console.log('🔄 Reservations count:', transformedReservations.length);
      setReservations(transformedReservations);
    } catch (error) {
      console.error('❌ Error loading reservations:', error);
      setError('Failed to load reservations');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReservations();
  }, []);

  useEffect(() => {
    if (refreshTrigger) {
      loadReservations();
    }
  }, [refreshTrigger]);

  const formatDateOnly = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const handleViewDetails = (reservation: Reservation) => {
    setSelectedReservation(reservation);
    setIsDetailsModalOpen(true);
  };

  const handleEdit = (reservation: Reservation) => {
    setReservationToEdit(reservation);
    setIsEditModalOpen(true);
  };

  const handleCancelClick = (reservation: Reservation) => {
    setReservationToCancel(reservation);
    setIsCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!reservationToCancel) return;

    try {
      const response = await fetch(`/api/reservations/${reservationToCancel.id}/cancel`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel reservation');
      }

      toast.success('Rezerwacja została anulowana');
      setIsCancelModalOpen(false);
      setReservationToCancel(null);
      loadReservations();
    } catch (error: any) {
      console.error('Error cancelling reservation:', error);
      toast.error(error.message || 'Wystąpił błąd podczas anulowania rezerwacji');
    }
  };

  // Получение уникальных годов и месяцев из данных
  const years = Array.from(new Set(reservations.map(reservation => {
    const date = new Date(reservation.data_utworzenia);
    return date.getFullYear().toString();
  }))).sort((a, b) => parseInt(b) - parseInt(a));

  // Получение уникальных клиентов
  const uniqueClients = Array.from(new Set(reservations.map(r => r.klient).filter(Boolean))).sort();

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'aktywna':
        return 'bg-green-100 text-green-800';
      case 'bezterminowa':
        return 'bg-yellow-100 text-yellow-800';
      case 'anulowana':
        return 'bg-red-100 text-red-800';
      case 'zrealizowana':
        return 'bg-blue-100 text-blue-800';
      case 'wygasła':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const months = [
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

  // Доступные месяцы только из имеющихся резерваций
  const availableMonthsSet = new Set(
    reservations.map(r => (new Date(r.data_utworzenia).getMonth() + 1).toString().padStart(2, '0'))
  );
  const availableMonths = months.filter(m => availableMonthsSet.has(m.value));

  // Фильтрация резерваций по году, месяцу, клиенту и статусу
  const filteredReservations = reservations.filter(reservation => {
    // Фильтрация по году
    if (selectedYear) {
      const reservationYear = new Date(reservation.data_utworzenia).getFullYear().toString();
      if (reservationYear !== selectedYear) return false;
    }

    // Фильтрация по месяцу
    if (selectedMonth) {
      const reservationMonth = (new Date(reservation.data_utworzenia).getMonth() + 1).toString().padStart(2, '0');
      if (reservationMonth !== selectedMonth) return false;
    }

    // Фильтрация по клиенту
    if (selectedClient && reservation.klient !== selectedClient) return false;

    // Фильтрация по статусу
    if (selectedStatus && reservation.status !== selectedStatus) return false;

    return true;
  });

  const { sortField, sortDirection, handleSort, sortedItems: sortedReservations } = useTableSort(
    filteredReservations,
    {
      defaultField: 'data_utworzenia',
      defaultDirection: 'desc',
      compareItems: compareReservations,
    }
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="text-gray-500">Ładowanie rezerwacji...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="text-red-500">Błąd: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Фильтры */}
      <div className="flex justify-end">
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {/* Фильтр Klient */}
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="block px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300 truncate"
              style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', width: '145px', minWidth: '145px', maxWidth: '145px' }}
            >
              <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Klient</option>
              {uniqueClients.map(client => (
                <option key={client} value={client} style={{ fontFamily: 'Sora, sans-serif' }}>{client}</option>
              ))}
            </select>

            {/* Фильтр Status */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="block w-auto px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300"
              style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', minWidth: '145px' }}
            >
              <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Status</option>
              {RESERVATION_STATUS_FILTER_OPTIONS.map(status => (
                <option key={status} value={status} style={{ fontFamily: 'Sora, sans-serif' }}>{status}</option>
              ))}
            </select>

            {/* Фильтр Rok */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="block w-auto px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300"
              style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr', minWidth: '145px' }}
            >
              <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Rok</option>
              {years.map(year => (
                <option key={year} value={year} style={{ fontFamily: 'Sora, sans-serif' }}>{year}</option>
              ))}
            </select>

            {/* Фильтр Miesiąc */}
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

          {/* Кнопка сброса фильтров */}
          {(selectedClient || selectedStatus || selectedYear || selectedMonth) && (
            <button
              onClick={() => {
                setSelectedClient('');
                setSelectedStatus('');
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

      <div className="w-full overflow-y-scroll max-h-[calc(100dvh-280px)] relative">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th 
                className="px-0 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('numer_rezerwacji')}
              >
                <div className="flex items-center gap-1">
                  Numer rezerwacji
                  <SortIndicator field="numer_rezerwacji" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-10 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('klient')}
              >
                <div className="flex items-center gap-1">
                  Klient
                  <SortIndicator field="klient" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-0 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('data_utworzenia')}
              >
                <div className="flex items-center gap-1">
                  Data utworzenia
                  <SortIndicator field="data_utworzenia" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-0 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('data_zakonczenia')}
              >
                <div className="flex items-center gap-1">
                  Data zakończenia
                  <SortIndicator field="data_zakonczenia" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center gap-1">
                  Status
                  <SortIndicator field="status" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th className="px-8 py-4 border-b border-gray-200 bg-gray-50">
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedReservations.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  Brak rezerwacji
                </td>
              </tr>
            ) : (
              sortedReservations.map((reservation) => (
                <tr 
                  key={reservation.id} 
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleViewDetails(reservation)}
                >
                  <td className="px-0 py-4 whitespace-nowrap text-sm text-gray-900 font-sora">
                    {reservation.numer_rezerwacji}
                  </td>
                  <td className="px-10 py-4 whitespace-nowrap text-sm text-gray-900 font-sora">
                    {reservation.klient}
                  </td>
                  <td className="px-0 py-4 whitespace-nowrap text-sm text-gray-900 font-sora">
                    {formatDateOnly(reservation.data_utworzenia)}
                  </td>
                  <td className="px-0 py-4 whitespace-nowrap text-sm text-gray-900 font-sora text-left">
                    {isIndefiniteReservation(reservation)
                      ? '∞'
                      : formatDateOnly(reservation.data_zakonczenia)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-sora text-left">
                    <span className={`inline-block px-2 py-1 text-xs rounded ${getStatusBadgeClass(reservation.status)}`}>
                      {reservation.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-sora">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (isActiveReservationStatus(reservation.status)) {
                            handleEdit(reservation);
                          }
                        }}
                        className="text-green-600 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-green-600 hover:text-green-800"
                        title={isActiveReservationStatus(reservation.status) ? 'Edytuj' : undefined}
                        disabled={!isActiveReservationStatus(reservation.status)}
                      >
                        <Edit size={16} />
                      </button>
                      {isActiveReservationStatus(reservation.status) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCancelClick(reservation);
                          }}
                          className="text-red-600 hover:text-red-800 focus:outline-none"
                          title="Anuluj rezerwację"
                        >
                          <XCircle size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal для деталей резервации */}
      <ReservationDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        reservation={selectedReservation}
      />

      {/* Modal для редактирования резервации */}
      <EditReservationModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setReservationToEdit(null);
        }}
        onSubmit={() => {
          setIsEditModalOpen(false);
          setReservationToEdit(null);
          loadReservations();
        }}
        reservation={reservationToEdit}
      />

      {/* Modal для подтверждения анулирования */}
      <Modal
        isOpen={isCancelModalOpen}
        onRequestClose={() => {
          setIsCancelModalOpen(false);
          setReservationToCancel(null);
        }}
        style={{
          content: {
            width: '320px',
            height: '170px',
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
            padding: '16px',
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
          <div className="flex justify-between items-center mb-4 select-none">
            <h2 className="text-base font-semibold text-gray-800"></h2>
            <button
              onClick={() => {
                setIsCancelModalOpen(false);
                setReservationToCancel(null);
              }}
              className="text-red-500 focus:outline-none"
            >
              <X size={20} />
            </button>
          </div>

          <p className="text-sm font-semibold text-gray-800 mb-4 text-center">
            Czy na pewno chcesz anulować rezerwację?
          </p>

          <div className="flex justify-center gap-3 mt-auto">
            <button
              type="button"
              onClick={() => {
                setIsCancelModalOpen(false);
                setReservationToCancel(null);
              }}
              className="px-3 py-1.5 text-xs text-gray-700 bg-gray-100 rounded hover:bg-gray-200 font-sora"
            >
              Nie
            </button>
            <button
              type="button"
              onClick={handleConfirmCancel}
              className="px-3 py-1.5 text-xs text-white bg-blue-500 rounded hover:bg-blue-600 font-sora"
            >
              Tak
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
