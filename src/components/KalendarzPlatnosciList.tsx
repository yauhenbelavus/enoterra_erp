import React, { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { SortIndicator } from './SortIndicator';
import { compareSortValues, parseSortDate, useTableSort } from '../utils/tableSort';
import { getZakupPodgladPath } from '../routes';

interface PaymentReceipt {
  id?: number;
  data_przyjecia: string;
  termin_platnosci?: string | null;
  sprzedawca: string;
}

interface KalendarzPlatnosciListProps {
  receipts: PaymentReceipt[];
}

const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const parseReceiptDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return startOfLocalDay(d);
};

const formatReceiptDate = (value?: string | null): string => {
  const date = parseReceiptDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

/** Dni pozostałe do terminu płatności (ujemne = po terminie). */
const daysRemainingUntil = (termin?: string | null): number | null => {
  const terminDate = parseReceiptDate(termin);
  if (!terminDate) return null;
  return Math.round(
    (startOfLocalDay(terminDate).getTime() - startOfLocalDay(new Date()).getTime()) / 86400000
  );
};

const dniPozostaloClass = (days: number | null): string => {
  if (days == null) return 'text-gray-400';
  if (days < 0) return 'text-red-600 font-medium';
  if (days === 0) return 'text-amber-600 font-medium';
  if (days <= 7) return 'text-amber-700';
  return 'text-gray-600';
};

const headClass =
  'px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50 whitespace-nowrap';
const cellClass = 'px-8 py-3 text-left text-sm font-sora whitespace-nowrap';
const headInnerClass = 'flex items-center gap-1 whitespace-nowrap';

export const KalendarzPlatnosciList: React.FC<KalendarzPlatnosciListProps> = ({ receipts }) => {
  const navigate = useNavigate();

  const rows = useMemo(
    () =>
      receipts.map((receipt) => ({
        ...receipt,
        dni_pozostalo: daysRemainingUntil(receipt.termin_platnosci),
      })),
    [receipts]
  );

  const compareItems = useCallback(
    (
      a: (typeof rows)[number],
      b: (typeof rows)[number],
      field: string,
      direction: 'asc' | 'desc'
    ) => {
      switch (field) {
        case 'sprzedawca':
          return compareSortValues(
            String(a.sprzedawca || '').toLowerCase(),
            String(b.sprzedawca || '').toLowerCase(),
            direction
          );
        case 'data_przyjecia':
          return compareSortValues(parseSortDate(a.data_przyjecia), parseSortDate(b.data_przyjecia), direction);
        case 'termin_platnosci':
          return compareSortValues(
            parseSortDate(a.termin_platnosci),
            parseSortDate(b.termin_platnosci),
            direction
          );
        case 'dni_pozostalo': {
          const av = a.dni_pozostalo;
          const bv = b.dni_pozostalo;
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return compareSortValues(av, bv, direction);
        }
        default:
          return 0;
      }
    },
    []
  );

  const { sortField, sortDirection, handleSort, sortedItems } = useTableSort(rows, {
    defaultField: 'termin_platnosci',
    defaultDirection: 'asc',
    compareItems,
  });

  if (receipts.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg border">
        <p className="text-gray-600 font-sora text-sm">Brak przyjęć towarów.</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto overflow-y-scroll max-h-[calc(100dvh-280px)] relative bg-white rounded-lg border border-gray-200">
      <table className="w-full">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className={headClass} onClick={() => handleSort('sprzedawca')}>
              <div className={headInnerClass}>
                Sprzedawca
                <SortIndicator field="sprzedawca" sortField={sortField} sortDirection={sortDirection} />
              </div>
            </th>
            <th className={headClass} onClick={() => handleSort('data_przyjecia')}>
              <div className={headInnerClass}>
                Data zakupu
                <SortIndicator field="data_przyjecia" sortField={sortField} sortDirection={sortDirection} />
              </div>
            </th>
            <th className={headClass} onClick={() => handleSort('termin_platnosci')}>
              <div className={headInnerClass}>
                Termin płatności
                <SortIndicator field="termin_platnosci" sortField={sortField} sortDirection={sortDirection} />
              </div>
            </th>
            <th className={headClass} onClick={() => handleSort('dni_pozostalo')}>
              <div className={headInnerClass}>
                Dni pozostało
                <SortIndicator field="dni_pozostalo" sortField={sortField} sortDirection={sortDirection} />
              </div>
            </th>
            <th className="px-4 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50" />
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedItems.map((receipt) => (
            <tr key={receipt.id ?? `${receipt.sprzedawca}-${receipt.data_przyjecia}`} className="hover:bg-gray-50">
              <td className={`${cellClass} text-gray-600`}>
                {receipt.sprzedawca?.trim() || '—'}
              </td>
              <td className={`${cellClass} text-gray-600`}>
                {formatReceiptDate(receipt.data_przyjecia)}
              </td>
              <td className={`${cellClass} text-gray-600`}>
                {formatReceiptDate(receipt.termin_platnosci)}
              </td>
              <td className={`${cellClass} ${dniPozostaloClass(receipt.dni_pozostalo)}`}>
                {receipt.dni_pozostalo == null ? '—' : receipt.dni_pozostalo}
              </td>
              <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                {receipt.id != null && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(getZakupPodgladPath(receipt.id!));
                    }}
                    className="text-blue-600 hover:text-blue-800 focus:outline-none"
                    title="Zobacz szczegóły"
                  >
                    <Eye size={16} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
