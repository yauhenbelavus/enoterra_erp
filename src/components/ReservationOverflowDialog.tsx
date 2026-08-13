import React from 'react';
import { createPortal } from 'react-dom';
import { ReservationOverflowItem } from '../utils/orderStock';

interface ReservationOverflowDialogProps {
  isOpen: boolean;
  items: ReservationOverflowItem[];
  onConfirm: () => void;
  onCancel: () => void;
}

export const ReservationOverflowDialog: React.FC<ReservationOverflowDialogProps> = ({
  isOpen,
  items,
  onConfirm,
  onCancel
}) => {
  if (!isOpen || items.length === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 font-sora">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">
          Następujące pozycje przekraczają ilość w rezerwacji:
        </h3>

        <ul className="space-y-2 mb-4 text-xs text-gray-700">
          {items.map((item) => (
              <li key={item.kod}>
                • {item.kod} ({item.nazwa}) — zamówiono: {item.ordered} szt., w rezerwacji: {item.inReservation} szt., przekroczenie: {item.overflow} szt.
              </li>
          ))}
        </ul>

        <p className="text-xs text-gray-600 mb-5">Czy chcesz kontynuować?</p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none"
          >
            Potwierdź
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 text-xs text-gray-600 hover:text-gray-800 rounded-md focus:outline-none"
          >
            Anuluj
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
