import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Search } from 'lucide-react';
import Modal from 'react-modal';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import "../components/DatePicker.css";
import toast from 'react-hot-toast';

registerLocale('pl', pl);

interface WriteOffProduct {
  kod: string;
  nazwa: string;
  ilosc: number;
  powod: string;
  availableQuantity?: number;
}

interface WriteOffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    data_odpisania: string;
    numer_odpisania: string;
    products: WriteOffProduct[];
  }) => void;
}

export const WriteOffModal: React.FC<WriteOffModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [numerOdpisaniaBase, setNumerOdpisaniaBase] = useState<string>('');
  const [numerOdpisania, setNumerOdpisania] = useState<string>('');
  const [productRows, setProductRows] = useState<WriteOffProduct[]>([
    { kod: '', nazwa: '', ilosc: 0, powod: '' }
  ]);
  const [products, setProducts] = useState<any[]>([]);
  const [fieldsWithErrors, setFieldsWithErrors] = useState<Set<number>>(new Set());
  const [quantityErrors, setQuantityErrors] = useState<Set<number>>(new Set());
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [activeSearchId, setActiveSearchId] = useState<number | null>(null);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastToastFieldId = useRef<number | null>(null);

  const POWODY_ODPISANIA = [
    { value: 'Uszkodzenie', label: 'Uszkodzenie', color: 'bg-red-100 text-red-800 border-red-200' },
    { value: 'Przeterminowanie', label: 'Przeterminowanie', color: 'bg-orange-100 text-orange-800 border-orange-200' },
    { value: 'Utrata', label: 'Utrata', color: 'bg-gray-100 text-gray-800 border-gray-200' },
    { value: 'Inwentaryzacja', label: 'Inwentaryzacja', color: 'bg-blue-100 text-blue-800 border-blue-200' }
  ];

  // Генерация базового номера списания при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      fetch('/api/writeoffs/next-number-only')
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch next number');
          return res.json();
        })
        .then(data => {
          if (data.numer_odpisania) {
            setNumerOdpisaniaBase(data.numer_odpisania);
            console.log('✅ Set write-off base number to:', data.numer_odpisania);
          } else {
            setNumerOdpisaniaBase('RW001');
          }
        })
        .catch(err => {
          console.error('❌ Error fetching next write-off number:', err);
          setNumerOdpisaniaBase('OP001');
        });
    } else {
      setNumerOdpisaniaBase('');
      setNumerOdpisania('');
    }
  }, [isOpen]);

  // Обновление полного номера при изменении даты или базового номера
  useEffect(() => {
    if (numerOdpisaniaBase && selectedDate) {
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const year = selectedDate.getFullYear();
      const fullNumber = `${numerOdpisaniaBase}_${day}_${month}_${year}`;
      setNumerOdpisania(fullNumber);
    }
  }, [numerOdpisaniaBase, selectedDate]);

  // Поиск продуктов
  useEffect(() => {
    const searchProducts = async () => {
      if (activeSearchId === null) {
        setProducts([]);
        return;
      }

      const currentRow = productRows[activeSearchId];
      if (!currentRow || !currentRow.nazwa || currentRow.nazwa.trim().length < 2 || currentRow.kod) {
        setProducts([]);
        return;
      }

      setIsProductLoading(true);
      try {
        const query = currentRow.nazwa;
        const response = await fetch(`/api/working-sheets/search?query=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Failed to fetch products');
        const data = await response.json();
        
        // Преобразуем данные из working_sheets в формат Product
        const transformedData = data.map((item: any) => ({
          kod: item.kod,
          nazwa: item.nazwa,
          ilosc: item.ilosc?.toString() || '0'
        }));
        
        setProducts(transformedData);
      } catch (error) {
        console.error('Error searching products:', error);
        setProducts([]);
      } finally {
        setIsProductLoading(false);
      }
    };

    const timeoutId = setTimeout(searchProducts, 300);
    return () => clearTimeout(timeoutId);
  }, [productRows, activeSearchId]);

  // Закрываем dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (openDropdownIndex !== null) {
        if (!target.closest('.dropdown-container')) {
          setOpenDropdownIndex(null);
        }
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdownIndex(null);
      }
    };

    if (openDropdownIndex !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openDropdownIndex]);

  const handleProductSelect = (product: any, rowIndex: number) => {
    const newRows = [...productRows];
    const availableQty = parseInt(product.ilosc) || 0;
    newRows[rowIndex] = {
      ...newRows[rowIndex],
      kod: product.kod,
      nazwa: `${product.kod} - ${product.nazwa}`,
      ilosc: 0,
      availableQuantity: availableQty
    };
    setProductRows(newRows);
    setProducts([]);
    setActiveSearchId(null);
    // Очищаем ошибки при выборе продукта
    setFieldsWithErrors(prev => {
      const newSet = new Set(prev);
      newSet.delete(rowIndex);
      return newSet;
    });
    setQuantityErrors(prev => {
      const newSet = new Set(prev);
      newSet.delete(rowIndex);
      return newSet;
    });
  };

  const toggleDropdown = (index: number) => {
    setOpenDropdownIndex(openDropdownIndex === index ? null : index);
  };

  const handlePowodChange = (rowIndex: number, value: string) => {
    const newRows = [...productRows];
    newRows[rowIndex] = { ...newRows[rowIndex], powod: value };
    setProductRows(newRows);
    setOpenDropdownIndex(null);
  };

  const addNewRow = () => {
    setProductRows([...productRows, { kod: '', nazwa: '', ilosc: 0, powod: '' }]);
  };

  const isFormValid = () => {
    if (!numerOdpisania) return false;
    
    return productRows.every((row) => 
      row.nazwa.trim() && row.ilosc && row.ilosc > 0 && row.powod
    );
  };

  const validateForm = () => {
    const errors = new Set<number>();
    
    productRows.forEach((row, index) => {
      if (!row.nazwa.trim() || !row.ilosc || row.ilosc <= 0 || !row.powod) {
        errors.add(index);
      }
    });
    
    setFieldsWithErrors(errors);
    return errors.size === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      toast.error('Proszę wypełnić wszystkie wymagane pola');
      return;
    }

    if (!numerOdpisania) {
      toast.error('Brak numeru rozchodu');
      return;
    }

    setIsSubmitting(true);
    try {
      const writeOffData = {
        data_odpisania: selectedDate.toISOString(),
        numer_odpisania: numerOdpisania,
        products: productRows
      };

      const response = await fetch('/api/writeoffs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(writeOffData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create write-off');
      }

      const result = await response.json();
      console.log('Write-off created:', result);
      
      onSubmit(writeOffData);
      toast.success(`Rozchód zostało utworzone: ${numerOdpisania}`);
      handleClose();
    } catch (error) {
      console.error('Error creating write-off:', error);
      toast.error('Błąd podczas tworzenia rozchodu');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
    setSelectedDate(new Date());
    setNumerOdpisaniaBase('');
    setNumerOdpisania('');
    setProductRows([{ kod: '', nazwa: '', ilosc: 0, powod: '' }]);
    setFieldsWithErrors(new Set());
    setQuantityErrors(new Set());
    setProducts([]);
    setActiveSearchId(null);
    setOpenDropdownIndex(null);
    setIsSubmitting(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      style={{
        content: {
          width: '720px',
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
          <h2 className="text-base font-semibold text-gray-800">Rozchód towaru</h2>
          <button
            onClick={handleClose}
            className="text-red-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 flex-grow overflow-y-auto pr-2">
          <div className="space-y-4 mb-12">
            <div className="flex items-end gap-6">
              <div className="w-[140px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Data rozchodu
                </label>
                <DatePicker
                  selected={selectedDate}
                  onChange={(date: Date | null) => setSelectedDate(date || new Date())}
                  locale="pl"
                  dateFormat="dd/MM/yyyy"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                  placeholderText="Wybierz datę"
                  popperClassName="z-50"
                />
              </div>
              <div className="w-[120px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Klient
                </label>
                <input
                  type="text"
                  value="VEIS"
                  readOnly
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-gray-100 text-gray-600 cursor-not-allowed"
                />
              </div>
              <div className="w-[180px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Numer rozchodu
                </label>
                <input
                  type="text"
                  value={numerOdpisania}
                  readOnly
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-gray-100 text-gray-600 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Продукты для списания */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700 font-sora">
              Produkty do rozchodu
            </label>
            {productRows.map((row, index) => (
              <div key={index} className="relative">
                <div className="flex items-center">
                  {/* Поле поиска продукта */}
                  <div className="relative flex-1 max-w-[65%]">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={row.nazwa}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        const newRows = [...productRows];
                        newRows[index] = { 
                          ...newRows[index], 
                          nazwa: newValue, 
                          kod: '',
                          ilosc: 0,
                          powod: '',
                          availableQuantity: undefined
                        };
                        setProductRows(newRows);
                        setActiveSearchId(index);
                        // Очищаем ошибку количества при изменении названия
                        setQuantityErrors(prev => {
                          const newSet = new Set(prev);
                          newSet.delete(index);
                          return newSet;
                        });
                      }}
                      onFocus={() => setActiveSearchId(index)}
                      className={`w-full pl-10 pr-3 py-1.5 border rounded-md focus:outline-none font-sora text-xs ${
                        fieldsWithErrors.has(index) ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="Wyszukaj produkty..."
                    />
                    
                    {isProductLoading && activeSearchId === index && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                      </div>
                    )}
                    
                    {/* Выпадающий список с продуктами */}
                    {products.length > 0 && activeSearchId === index && row.nazwa.trim().length >= 2 && !row.kod && (
                      <div className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm border border-gray-200">
                        {products.map((product, idx) => (
                          <div
                            key={`${product.kod}-${idx}`}
                            className="cursor-pointer select-none relative py-1 pl-3 pr-9 hover:bg-blue-50"
                            onClick={() => handleProductSelect(product, index)}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-[10px]">{product.kod}</span>
                              <span className="text-[10px] text-gray-500">{product.nazwa}</span>
                              <span className="text-[10px] text-gray-500">Dostępna ilość: {product.ilosc}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Количество */}
                  <div className="w-16 ml-2">
                    <input
                      type="number"
                      min="1"
                      value={row.ilosc || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        const newQuantity = value === '' ? 0 : Math.max(1, parseInt(value) || 0);
                        const newRows = [...productRows];
                        newRows[index] = { ...newRows[index], ilosc: newQuantity };
                        setProductRows(newRows);
                        
                        // Сбрасываем lastToastFieldId при любом изменении
                        lastToastFieldId.current = null;
                        
                        // Проверяем доступное количество только если продукт выбран
                        if (row.kod && row.availableQuantity !== undefined) {
                          const availableQuantity = row.availableQuantity;
                          
                          // Если поле пустое или 0 - очищаем ошибку
                          if (newQuantity === 0) {
                            setQuantityErrors(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(index);
                              return newSet;
                            });
                          }
                          // Если количество превышает доступное - добавляем ошибку
                          else if (newQuantity > availableQuantity) {
                            setQuantityErrors(prev => {
                              const newSet = new Set(prev);
                              newSet.add(index);
                              return newSet;
                            });
                            // Показываем toast только один раз для этого поля
                            if (lastToastFieldId.current !== index) {
                              lastToastFieldId.current = index;
                              toast.error(`Niewystarczająca ilość - dostępne: ${availableQuantity} (na magazynie: ${availableQuantity})`);
                            }
                          }
                          // Иначе очищаем ошибку
                          else {
                            setQuantityErrors(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(index);
                              return newSet;
                            });
                          }
                        } else {
                          // Очищаем ошибку для этого поля при изменении, если продукт не выбран
                          setQuantityErrors(prev => {
                            const newSet = new Set(prev);
                            newSet.delete(index);
                            return newSet;
                          });
                        }
                      }}
                      className={`w-full px-3 py-1.5 border rounded-md focus:outline-none font-sora text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                        quantityErrors.has(index) ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="Ilość"
                    />
                  </div>

                  {/* Dropdown для причины списания */}
                  <div className="w-32 ml-2 relative dropdown-container">
                    <button
                      type="button"
                      onClick={() => toggleDropdown(index)}
                      className={`w-full px-2 py-1.5 border rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ${
                        row.powod 
                          ? POWODY_ODPISANIA.find(p => p.value === row.powod)?.color || 'border-gray-300 bg-white'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      <span className="truncate text-[10px]">
                        {row.powod ? POWODY_ODPISANIA.find(p => p.value === row.powod)?.label || row.powod : 'Powód'}
                      </span>
                      <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdownIndex === index && (
                      <div 
                        className="absolute top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-40 overflow-y-auto w-full"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {POWODY_ODPISANIA.map((powod) => (
                          <button
                            key={powod.value}
                            type="button"
                            onClick={() => handlePowodChange(index, powod.value)}
                            className={`w-full px-2 py-1.5 text-left text-[10px] hover:bg-gray-50 ${powod.color}`}
                          >
                            {powod.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Кнопка удаления позиции */}
                  {productRows.length > 1 && (
                    <button
                      onClick={() => {
                        const newRows = productRows.filter((_, i) => i !== index);
                        setProductRows(newRows);
                      }}
                      className="ml-2 text-red-400 hover:text-red-600"
                      title="Usuń pozycję"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Кнопка добавления новой позиции (только для последней строки) */}
                {index === productRows.length - 1 && (
                  <button
                    type="button"
                    onClick={addNewRow}
                    className="absolute -bottom-7 left-0 text-gray-400 hover:text-gray-600"
                    title="Dodaj nową pozycję"
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !isFormValid()}
            className={`px-6 py-1.5 text-white text-xs rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-sora ${
              isSubmitting || !isFormValid()
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Tworzenie...
              </div>
            ) : (
              'Utwórz rozchód'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};

