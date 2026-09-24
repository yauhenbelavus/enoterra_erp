import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, X, Edit } from 'lucide-react';
import { ReceiptDetailsModal } from './ReceiptDetailsModal';
import toast from 'react-hot-toast';
import Modal from 'react-modal';
import { formatPlMoney, getWalutaSymbol, normalizeWalutaFaktury } from '../utils/receiptCurrency';
import { SortIndicator } from './SortIndicator';
import { compareReceipts, useTableSort } from '../utils/tableSort';
import { normalizeReceiptProductLines } from '../utils/receiptProducts';
import { getZakupEdycjaPath } from '../routes';

interface ProductReceipt {
  id?: number;
  data_przyjecia: string;
  sprzedawca: string;
  wartosc_przyjecia_netto: number;
  vat?: number;
  wartosc_przyjecia_brutto?: number;
  wartosc_dostawy: number;
  rabat?: number;
  waluta_przyjecia?: string;
  waluta_dostawy?: string;
  kurs_1?: number;
  kurs_2?: number;
  stawka_podatek_akcyzowy?: number;
  products: Array<{
    id?: number;
    kod: string;
    nazwa: string;
    kod_kreskowy?: string;
    ilosc: number;
    cena: number;
    dataWaznosci?: string;
    typ?: string;
    objetosc?: number;
    vat?: number;
  }>;
  product_invoice?: string;
  transport_invoice?: string;
}

interface ProductReceiptsListProps {
  receipts: ProductReceipt[];
  onDelete: (id: number) => void | Promise<void>;
  selectedCategory?: string;
}

const getReceiptDisplayWartosc = (receipt: ProductReceipt) => {
  return Number(receipt.wartosc_przyjecia_netto) || 0;
};

export const ProductReceiptsList: React.FC<ProductReceiptsListProps> = ({ receipts, onDelete, selectedCategory = '' }) => {
  const navigate = useNavigate();
  const [selectedReceipt, setSelectedReceipt] = useState<ProductReceipt | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState<ProductReceipt | null>(null);
  const [password, setPassword] = useState('');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedSprzedawca, setSelectedSprzedawca] = useState<string>('');

  const handleViewDetails = (receipt: ProductReceipt) => {
    setSelectedReceipt(receipt);
    setIsDetailsModalOpen(true);
  };

  const handleEdit = (receipt: ProductReceipt) => {
    if (receipt.id == null) return;
    navigate(getZakupEdycjaPath(receipt.id));
  };

  const handleDeleteClick = (receipt: ProductReceipt) => {
    setReceiptToDelete(receipt);
    setIsPasswordModalOpen(true);
    setPassword('');
  };

  const handlePasswordSubmit = () => {
    if (password === '5202') {
      const id = receiptToDelete?.id;
      handlePasswordClose();
      if (id) {
        void Promise.resolve(onDelete(id));
      }
    } else {
      toast.error('Nieprawidłowe hasło');
      setPassword('');
    }
  };

  const handlePasswordClose = () => {
    setIsPasswordModalOpen(false);
    setReceiptToDelete(null);
    setPassword('');
    setPosition({ x: 0, y: 0 });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePasswordSubmit();
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || 
        (e.target as HTMLElement).closest('input')) {
      return;
    }
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        requestAnimationFrame(() => {
          setPosition({
            x: e.clientX - dragStartPos.current.x,
            y: e.clientY - dragStartPos.current.y
          });
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Получение уникальных годов и месяцев из данных
  const years = Array.from(new Set(receipts.map(receipt => {
    const date = new Date(receipt.data_przyjecia);
    return date.getFullYear().toString();
  }))).sort((a, b) => parseInt(b) - parseInt(a));

  const sellers = Array.from(
    new Set(receipts.map((receipt) => String(receipt.sprzedawca || '').trim()).filter(Boolean))
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
    { value: '12', label: 'Grudzień' }
  ];

  // Фильтрация приёмок по выбранной категории, году и месяцу
  const filteredReceipts = receipts.filter(receipt => {
    // Фильтрация по категории
    if (selectedCategory) {
      const hasCategory = normalizeReceiptProductLines(receipt.products).some(
        (product) => product.typ === selectedCategory
      );
      if (!hasCategory) return false;
    }

    if (selectedSprzedawca) {
      if (String(receipt.sprzedawca || '').trim() !== selectedSprzedawca) return false;
    }

    // Фильтрация по году
    if (selectedYear) {
      const receiptYear = new Date(receipt.data_przyjecia).getFullYear().toString();
      if (receiptYear !== selectedYear) return false;
    }

    // Фильтрация по месяцу
    if (selectedMonth) {
      const receiptMonth = (new Date(receipt.data_przyjecia).getMonth() + 1).toString().padStart(2, '0');
      if (receiptMonth !== selectedMonth) return false;
    }

    return true;
  });

  const compareReceiptItems = useCallback(
    (a: ProductReceipt, b: ProductReceipt, field: string, direction: 'asc' | 'desc') =>
      compareReceipts(a, b, field, direction, getReceiptDisplayWartosc),
    []
  );

  const { sortField, sortDirection, handleSort, sortedItems: sortedReceipts } = useTableSort(
    filteredReceipts,
    {
      defaultField: 'data_przyjecia',
      defaultDirection: 'desc',
      compareItems: compareReceiptItems,
    }
  );

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
                  <option key={sprzedawca} value={sprzedawca} style={{ fontFamily: 'Sora, sans-serif' }}>{sprzedawca}</option>
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
                {years.map(year => (
                  <option key={year} value={year} style={{ fontFamily: 'Sora, sans-serif' }}>{year}</option>
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
                {months.map(month => (
                  <option key={month.value} value={month.value} style={{ fontFamily: 'Sora, sans-serif' }}>{month.label}</option>
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

      <div className="w-full overflow-y-scroll max-h-[calc(100dvh-280px)] relative">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('data_przyjecia')}
              >
                <div className="flex items-center gap-1">
                  Data zakupu
                  <SortIndicator field="data_przyjecia" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('sprzedawca')}
              >
                <div className="flex items-center gap-1">
                  Sprzedawca
                  <SortIndicator field="sprzedawca" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('wartosc_przyjecia_netto')}
              >
                <div className="flex items-center gap-1">
                  Wartość netto
                  <SortIndicator field="wartosc_przyjecia_netto" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('wartosc_przyjecia_brutto')}
              >
                <div className="flex items-center gap-1">
                  Wartość brutto
                  <SortIndicator field="wartosc_przyjecia_brutto" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('wartosc_dostawy')}
              >
                <div className="flex items-center gap-1">
                  Wartość dostawy
                  <SortIndicator field="wartosc_dostawy" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th className="px-4 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedReceipts.map((receipt) => (
              <tr key={receipt.id} className="hover:bg-gray-50">
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {receipt.data_przyjecia}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {receipt.sprzedawca}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {formatPlMoney(getReceiptDisplayWartosc(receipt))} {getWalutaSymbol(normalizeWalutaFaktury(receipt.waluta_przyjecia))}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {formatPlMoney(Number(receipt.wartosc_przyjecia_brutto) || 0)} {getWalutaSymbol(normalizeWalutaFaktury(receipt.waluta_przyjecia))}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {formatPlMoney(Number(receipt.wartosc_dostawy) || 0)}
                  {(Number(receipt.wartosc_dostawy) || 0) !== 0
                    ? ` ${getWalutaSymbol(normalizeWalutaFaktury(receipt.waluta_dostawy))}`
                    : ''}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); handleViewDetails(receipt); }}
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
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteClick(receipt); }}
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

      {/* Модальное окно для ввода пароля */}
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
            <h2 className="text-base font-semibold text-gray-800">Hasło</h2>
            <button
              onClick={handlePasswordClose}
              className="text-red-500 focus:outline-none"
            >
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

      <ReceiptDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        receipt={selectedReceipt}
      />
    </div>
  );
}; 