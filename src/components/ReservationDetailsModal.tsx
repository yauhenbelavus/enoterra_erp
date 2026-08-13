import React from 'react';
import { X } from 'lucide-react';
import Modal from 'react-modal';
import { getEffectiveReservationStatus, isIndefiniteReservation } from '../utils/reservationDates';

interface ReservationProduct {
  id: number;
  reservation_id: number;
  product_id: number | null;
  product_kod: string;
  product_nazwa: string;
  kod_kreskowy: string | null;
  ilosc: number;
  ilosc_wydane?: number;
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

interface ReservationDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservation: Reservation | null;
}

export const ReservationDetailsModal: React.FC<ReservationDetailsModalProps> = ({ isOpen, onClose, reservation }) => {
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStartPos = React.useRef({ x: 0, y: 0 });

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStartPos.current.x,
          y: e.clientY - dragStartPos.current.y
        });
      }
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  if (!reservation) return null;

  const effectiveStatus = getEffectiveReservationStatus(reservation);

  const formatDateOnly = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={{
        content: {
          width: '850px',
          height: '520px',
          maxWidth: '90%',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
          margin: '0',
          borderRadius: '0.5rem',
          background: 'white',
          overflow: 'hidden',
          outline: 'none',
          padding: '16px',
          fontFamily: 'Sora',
          userSelect: 'none',
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
      <div 
        className="font-sora h-full flex flex-col overflow-hidden"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="flex justify-between items-center mb-8 select-none">
          <h2 className="text-base font-semibold text-gray-800">Szczegóły rezerwacji</h2>
          <button
            onClick={onClose}
            className="text-red-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-6 flex-grow overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
            <div className="flex items-center">
              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Numer rezerwacji</label>
              <div className="text-xs text-gray-900 ml-2">{reservation.numer_rezerwacji}</div>
            </div>
            <div className="flex items-center">
              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Data utworzenia</label>
              <div className="text-xs text-gray-900 ml-2">{formatDateOnly(reservation.data_utworzenia)}</div>
            </div>
            <div className="flex items-center">
              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Klient</label>
              <div className="text-xs text-gray-900 ml-2">{reservation.klient}</div>
            </div>
            <div className="flex items-center">
              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Data zakończenia</label>
              <div className="text-xs text-gray-900 ml-2">
                {isIndefiniteReservation(reservation) ? '∞' : formatDateOnly(reservation.data_zakonczenia)}
              </div>
            </div>
            <div className="flex items-center">
              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Status</label>
              <div className="text-xs text-gray-900 ml-2">{effectiveStatus}</div>
            </div>
          </div>
          {reservation.komentarz && (
            <div className="flex items-center mb-4">
              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Komentarz</label>
              <div className="text-xs text-gray-900 ml-2">{reservation.komentarz}</div>
            </div>
          )}
          <div>
            <h3 className="font-semibold mb-2 text-xs">Produkty:</h3>
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-2 text-left w-[80px]">Kod</th>
                  <th className="px-2 py-2 text-left w-[220px]">Nazwa</th>
                  {(effectiveStatus === 'anulowana' || effectiveStatus === 'zrealizowana' || effectiveStatus === 'wygasła') && (
                    <th className="py-2 text-left w-[85px]"></th>
                  )}
                  <th className="px-2 py-2 text-center w-[70px]">Pozostało</th>
                  <th className="px-2 py-2 text-center w-[60px]">Wydane</th>
                  <th className="px-2 py-2 text-center w-[90px]">Zarezerwowane</th>
                </tr>
              </thead>
              <tbody>
                {reservation.products && reservation.products.length > 0 ? (
                  reservation.products.map((product) => {
                    const wydane = product.ilosc_wydane ?? 0;
                    const pozostalo = product.ilosc - wydane;
                    const isInactive = effectiveStatus === 'anulowana' || effectiveStatus === 'zrealizowana' || effectiveStatus === 'wygasła';
                    return (
                      <tr key={product.id} className={isInactive ? 'opacity-50' : ''}>
                        <td className="px-2 py-2 w-[80px] break-words">{product.product_kod}</td>
                        <td className="px-2 py-2 w-[220px] break-words leading-tight">{product.product_nazwa}</td>
                        {effectiveStatus === 'anulowana' && (
                          <td className="py-2 w-[85px] text-left">
                            <span className="text-red-600 font-medium">anulowana</span>
                          </td>
                        )}
                        {effectiveStatus === 'zrealizowana' && (
                          <td className="py-2 w-[85px] text-left">
                            <span className="text-blue-600 font-medium">zrealizowana</span>
                          </td>
                        )}
                        {effectiveStatus === 'wygasła' && (
                          <td className="py-2 w-[85px] text-left">
                            <span className="text-gray-600 font-medium">wygasła</span>
                          </td>
                        )}
                        <td className="px-2 py-2 w-[70px] text-center">
                          <span className={pozostalo > 0 && !isInactive ? 'text-green-600 font-medium' : 'text-gray-400'}>
                            {pozostalo}
                          </span>
                        </td>
                        <td className={`px-2 py-2 w-[60px] text-center ${isInactive ? 'text-gray-400' : 'text-red-600'}`}>{wydane}</td>
                        <td className="px-2 py-2 w-[90px] text-center">{product.ilosc}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={(effectiveStatus === 'anulowana' || effectiveStatus === 'zrealizowana' || effectiveStatus === 'wygasła') ? 6 : 5} className="px-2 py-4 text-center text-gray-500">
                      Brak produktów
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
};
