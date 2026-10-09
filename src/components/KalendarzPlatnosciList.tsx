import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Edit, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from 'react-modal';
import { SortIndicator } from './SortIndicator';
import { compareSortValues, parseSortDate, useTableSort } from '../utils/tableSort';
import { getZakupEdycjaPath, getZakupPodgladPath } from '../routes';

interface PaymentReceipt {
  id?: number;
  data_przyjecia: string;
  termin_platnosci?: string | null;
  sprzedawca: string;
}

interface KalendarzPlatnosciListProps {
  receipts: PaymentReceipt[];
  onDelete: (id: number) => void | Promise<void>;
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

/** Dni pozostałe do terminu płatności (ujemne = po terminie). null = brak / termin = data zakupu. */
const daysRemainingUntil = (termin?: string | null, dataZakupu?: string | null): number | null => {
  const terminDate = parseReceiptDate(termin);
  if (!terminDate) return null;
  const zakupDate = parseReceiptDate(dataZakupu);
  if (zakupDate && zakupDate.getTime() === terminDate.getTime()) return null;
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

export const KalendarzPlatnosciList: React.FC<KalendarzPlatnosciListProps> = ({ receipts, onDelete }) => {
  const navigate = useNavigate();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState<PaymentReceipt | null>(null);
  const [password, setPassword] = useState('');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedSprzedawca, setSelectedSprzedawca] = useState('');

  const withTermin = useMemo(
    () => receipts.filter((receipt) => Boolean(String(receipt.termin_platnosci || '').trim())),
    [receipts]
  );

  const years = Array.from(
    new Set(
      withTermin.map((receipt) => {
        const date = parseReceiptDate(receipt.data_przyjecia);
        return date ? date.getFullYear().toString() : '';
      }).filter(Boolean)
    )
  ).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));

  const sellers = Array.from(
    new Set(withTermin.map((receipt) => String(receipt.sprzedawca || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'pl'));

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
    { value: '12', label: 'Grudzień' },
  ];

  const filteredReceipts = withTermin.filter((receipt) => {
    if (selectedSprzedawca) {
      if (String(receipt.sprzedawca || '').trim() !== selectedSprzedawca) return false;
    }
    const zakup = parseReceiptDate(receipt.data_przyjecia);
    if (selectedYear) {
      if (!zakup || zakup.getFullYear().toString() !== selectedYear) return false;
    }
    if (selectedMonth) {
      if (!zakup || (zakup.getMonth() + 1).toString().padStart(2, '0') !== selectedMonth) return false;
    }
    return true;
  });

  const rows = useMemo(
    () =>
      filteredReceipts.map((receipt) => ({
        ...receipt,
        dni_pozostalo: daysRemainingUntil(receipt.termin_platnosci, receipt.data_przyjecia),
      })),
    [filteredReceipts]
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

  const handleViewDetails = (receipt: PaymentReceipt) => {
    if (receipt.id == null) return;
    navigate(getZakupPodgladPath(receipt.id));
  };

  const handleEdit = (receipt: PaymentReceipt) => {
    if (receipt.id == null) return;
    navigate(getZakupEdycjaPath(receipt.id));
  };

  const handleDeleteClick = (receipt: PaymentReceipt) => {
    setReceiptToDelete(receipt);
    setIsPasswordModalOpen(true);
    setPassword('');
  };

  const handlePasswordClose = () => {
    setIsPasswordModalOpen(false);
    setReceiptToDelete(null);
    setPassword('');
    setPosition({ x: 0, y: 0 });
  };

  const handlePasswordSubmit = () => {
    if (password === '5202') {
      const id = receiptToDelete?.id;
      handlePasswordClose();
      if (id) void Promise.resolve(onDelete(id));
    } else {
      toast.error('Nieprawidłowe hasło');
      setPassword('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handlePasswordSubmit();
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) {
      return;
    }
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        requestAnimationFrame(() => {
          setPosition({
            x: e.clientX - dragStartPos.current.x,
            y: e.clientY - dragStartPos.current.y,
          });
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

  const hasActiveFilters = selectedYear || selectedMonth || selectedSprzedawca;

  const filterSelectClass =
    'block px-2 py-1 border border-gray-300 rounded text-xs font-sora font-normal text-gray-900 focus:outline-none focus:ring-0 focus:border-gray-300 truncate';
  const filterSelectStyle = {
    fontFamily: 'Sora, sans-serif',
    direction: 'ltr' as const,
    width: '145px',
    minWidth: '145px',
    maxWidth: '145px',
  };
  const fitHeadClass =
    'px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50 whitespace-nowrap w-[1%]';
  const fitCellClass = 'px-8 py-3 text-left text-sm text-gray-600 font-sora whitespace-nowrap w-[1%]';
  const headInnerClass = 'flex items-center gap-1 whitespace-nowrap';

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-2 gap-1">
            <div className="relative">
              <select
                value={selectedSprzedawca}
                onChange={(e) => setSelectedSprzedawca(e.target.value)}
                className={filterSelectClass}
                style={filterSelectStyle}
              >
                <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Sprzedawca</option>
                {sellers.map((sprzedawca) => (
                  <option key={sprzedawca} value={sprzedawca} style={{ fontFamily: 'Sora, sans-serif' }}>
                    {sprzedawca}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className={filterSelectClass}
                style={filterSelectStyle}
              >
                <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Rok</option>
                {years.map((year) => (
                  <option key={year} value={year} style={{ fontFamily: 'Sora, sans-serif' }}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className={filterSelectClass}
                style={filterSelectStyle}
              >
                <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Miesiąc</option>
                {months.map((month) => (
                  <option key={month.value} value={month.value} style={{ fontFamily: 'Sora, sans-serif' }}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSelectedYear('');
                setSelectedMonth('');
                setSelectedSprzedawca('');
              }}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-xs font-sora transition-colors"
            >
              Wyczyść filtry
            </button>
          )}
        </div>
      </div>

      <div className="w-full overflow-x-auto overflow-y-scroll max-h-[calc(100dvh-280px)] relative">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50 whitespace-nowrap"
                onClick={() => handleSort('sprzedawca')}
              >
                <div className={headInnerClass}>
                  Sprzedawca
                  <SortIndicator field="sprzedawca" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th className={fitHeadClass} onClick={() => handleSort('data_przyjecia')}>
                <div className={headInnerClass}>
                  Data zakupu
                  <SortIndicator field="data_przyjecia" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th className={fitHeadClass} onClick={() => handleSort('termin_platnosci')}>
                <div className={headInnerClass}>
                  Termin płatności
                  <SortIndicator field="termin_platnosci" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th className={fitHeadClass} onClick={() => handleSort('dni_pozostalo')}>
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
              <tr key={receipt.id} className="hover:bg-gray-50">
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {receipt.sprzedawca?.trim() || '—'}
                </td>
                <td className={fitCellClass}>{formatReceiptDate(receipt.data_przyjecia)}</td>
                <td className={fitCellClass}>{formatReceiptDate(receipt.termin_platnosci)}</td>
                <td className={`${fitCellClass} ${dniPozostaloClass(receipt.dni_pozostalo)}`}>
                  {receipt.dni_pozostalo == null ? '—' : receipt.dni_pozostalo}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleViewDetails(receipt);
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
                        handleEdit(receipt);
                      }}
                      className="text-green-600 hover:text-green-800 focus:outline-none"
                      title="Edytuj"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteClick(receipt);
                      }}
                      className="text-red-600 hover:text-red-800 focus:outline-none"
                      title="Usuń"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={isPasswordModalOpen}
        onRequestClose={handlePasswordClose}
        style={{
          content: {
            width: '400px',
            height: '200px',
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
            padding: '24px',
            fontFamily: 'Sora',
            cursor: 'grab',
            userSelect: 'none',
            zIndex: 9999,
          },
          overlay: {
            backgroundColor: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          },
        }}
      >
        <div
          className="font-sora h-full flex flex-col overflow-hidden"
          onMouseDown={handleMouseDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <div className="flex justify-between items-center mb-8 select-none">
            <h2 className="text-base font-semibold text-gray-800">Hasło</h2>
            <button onClick={handlePasswordClose} className="text-red-500 focus:outline-none">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-6 flex-grow">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Wprowadź hasło"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                autoFocus
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 mt-6">
            <button
              onClick={handlePasswordClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 focus:outline-none text-sm"
            >
              Anuluj
            </button>
            <button
              onClick={handlePasswordSubmit}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none text-sm"
            >
              Usuń
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
