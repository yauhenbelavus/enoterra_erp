import React, { useState, useRef, useEffect } from 'react';
import { Eye, X, Edit } from 'lucide-react';
import { ReceiptDetailsModal } from './ReceiptDetailsModal';
import { EditReceiptModal } from './EditReceiptModal';
import toast from 'react-hot-toast';
import { Product } from '../types/Product';
import Modal from 'react-modal';

interface ProductReceipt {
  id?: number;
  dataPrzyjecia: string;
  sprzedawca: string;
  wartosc: number;
  kosztDostawy: number;
  products: Array<{
    kod: string;
    nazwa: string;
    kod_kreskowy?: string;
    ilosc: number;
    cena: number;
    dataWaznosci?: string;
    typ?: string;
    objetosc?: number;
  }>;
  productInvoice?: string;
  transportInvoice?: string;
}

interface ProductReceiptsListProps {
  receipts: ProductReceipt[];
  products: Product[];
  onDelete: (id: number) => void;
  onEdit: (receipt: ProductReceipt) => void;
  onUpdate: (data: {
    id: number;
    date: string;
    sprzedawca: string;
    wartosc: number;
    kosztDostawy: number;
    products: Array<{
      kod: string;
      nazwa: string;
      kod_kreskowy?: string;
      ilosc: number;
      cena: number;
      dataWaznosci?: string;
      typ?: string;
      objetosc?: number;
    }>;
    productInvoice?: File;
    transportInvoice?: File;
  }) => void;
  selectedCategory?: string;
}

export const ProductReceiptsList: React.FC<ProductReceiptsListProps> = ({ receipts, products, onDelete, onEdit, onUpdate, selectedCategory = '' }) => {
  const [selectedReceipt, setSelectedReceipt] = useState<ProductReceipt | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [receiptToEdit, setReceiptToEdit] = useState<ProductReceipt | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState<ProductReceipt | null>(null);
  const [password, setPassword] = useState('');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const [sortField, setSortField] = useState<string>('dataPrzyjecia');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  const handleViewDetails = (receipt: ProductReceipt) => {
    setSelectedReceipt(receipt);
    setIsDetailsModalOpen(true);
  };

  const handleEdit = (receipt: ProductReceipt) => {
    setReceiptToEdit(receipt);
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (receipt: ProductReceipt) => {
    setReceiptToDelete(receipt);
    setIsPasswordModalOpen(true);
    setPassword('');
  };

  const handlePasswordSubmit = () => {
    if (password === '5202') {
      if (receiptToDelete?.id) {
        onDelete(receiptToDelete.id);
        toast.success('Zapis został usunięty');
      }
      handlePasswordClose();
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

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
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
    const date = new Date(receipt.dataPrzyjecia);
    return date.getFullYear().toString();
  }))).sort((a, b) => parseInt(b) - parseInt(a));

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
      if (typeof receipt.products === 'string') {
        try {
          const products = JSON.parse(receipt.products);
          const hasCategory = products.some((product: any) => product.typ === selectedCategory);
          if (!hasCategory) return false;
        } catch {
          return false;
        }
      } else if (Array.isArray(receipt.products)) {
        const hasCategory = receipt.products.some(product => product.typ === selectedCategory);
        if (!hasCategory) return false;
      } else {
        return false;
      }
    }

    // Фильтрация по году
    if (selectedYear) {
      const receiptYear = new Date(receipt.dataPrzyjecia).getFullYear().toString();
      if (receiptYear !== selectedYear) return false;
    }

    // Фильтрация по месяцу
    if (selectedMonth) {
      const receiptMonth = (new Date(receipt.dataPrzyjecia).getMonth() + 1).toString().padStart(2, '0');
      if (receiptMonth !== selectedMonth) return false;
    }

    return true;
  });

  // Сортировка отфильтрованных приёмок
  const sortedReceipts = filteredReceipts.sort((a, b) => {
    let aValue: any;
    let bValue: any;
    
    switch (sortField) {
      case 'dataPrzyjecia':
        aValue = new Date(a.dataPrzyjecia);
        bValue = new Date(b.dataPrzyjecia);
        break;
      case 'sprzedawca':
        aValue = (a.sprzedawca || '').toLowerCase();
        bValue = (b.sprzedawca || '').toLowerCase();
        break;
      case 'wartosc':
        aValue = a.wartosc;
        bValue = b.wartosc;
        break;
      case 'kosztDostawy':
        aValue = a.kosztDostawy;
        bValue = b.kosztDostawy;
        break;
      default:
        aValue = (a as any)[sortField] || '';
        bValue = (b as any)[sortField] || '';
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    }
    if (aValue instanceof Date && bValue instanceof Date) {
      return sortDirection === 'asc' ? aValue.getTime() - bValue.getTime() : bValue.getTime() - aValue.getTime();
    }
    return 0;
  });

  return (
    <div className="space-y-4">
      <div className="w-full overflow-y-auto max-h-96">
        <table className="w-full">
          <thead>
            <tr>
              <th 
                className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('dataPrzyjecia')}
              >
                Data zakupu
              </th>
              <th 
                className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('sprzedawca')}
              >
                Sprzedawca
              </th>
              <th 
                className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('wartosc')}
              >
                Wartość
              </th>
              <th 
                className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('kosztDostawy')}
              >
                Koszt dostawy
              </th>
              <th className="sticky top-0 z-1 bg-gray-50 px-4 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora">
                <div className="flex space-x-1 justify-end">
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="block w-24 px-1 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-sora"
                    style={{ fontFamily: 'Sora, sans-serif' }}
                  >
                    <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Rok</option>
                    {years.map(year => (
                      <option key={year} value={year} style={{ fontFamily: 'Sora, sans-serif' }}>{year}</option>
                    ))}
                  </select>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="block w-24 px-1 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-sora"
                    style={{ fontFamily: 'Sora, sans-serif', direction: 'ltr' }}
                    size={1}
                  >
                    <option value="" style={{ fontFamily: 'Sora, sans-serif' }}>Msc</option>
                    {months.map(month => (
                      <option key={month.value} value={month.value} style={{ fontFamily: 'Sora, sans-serif' }}>{month.label}</option>
                    ))}
                  </select>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedReceipts.map((receipt) => (
              <tr key={receipt.id} className="hover:bg-gray-50">
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {receipt.dataPrzyjecia}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {receipt.sprzedawca}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {receipt.wartosc.toFixed(2)} €
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {receipt.kosztDostawy.toFixed(2)} €
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
            userSelect: 'none'
          },
          overlay: {
            backgroundColor: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
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
        products={products}
      />

      <EditReceiptModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setReceiptToEdit(null);
        }}
        onSubmit={(data) => {
          onUpdate(data);
          setIsEditModalOpen(false);
          setReceiptToEdit(null);
        }}
        receipt={(() => {
          if (receiptToEdit) {
            const preparedReceipt = {
              id: receiptToEdit.id || 0,
              dataPrzyjecia: receiptToEdit.dataPrzyjecia,
              sprzedawca: receiptToEdit.sprzedawca,
              wartosc: receiptToEdit.wartosc,
              kosztDostawy: receiptToEdit.kosztDostawy,
              products: receiptToEdit.products,
              productInvoice: receiptToEdit.productInvoice,
              transportInvoice: receiptToEdit.transportInvoice
            };

            return preparedReceipt;
          }
          return null;
        })()}
      />
    </div>
  );
}; 