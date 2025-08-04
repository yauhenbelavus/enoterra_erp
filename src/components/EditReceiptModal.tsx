  import React, { useState, useRef, useEffect } from 'react';
import Modal from 'react-modal';
import { X, Plus, Grape, Car, Calendar } from 'lucide-react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import { API_URL } from '../config';
import "react-datepicker/dist/react-datepicker.css";
import "./DatePicker.css";

registerLocale('pl', pl);

const TYPY_TOWARU = [
  { value: 'czerwone', label: 'Czerwone', color: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'biale', label: 'Białe', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  { value: 'musujace', label: 'Musujące', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'bezalkoholowe', label: 'Bezalkoholowe', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'ferment', label: 'Ferment', color: 'bg-orange-100 text-orange-800 border-orange-200' }
];

const OBJETOSCI_WINA = [
  { value: '0.187', label: '0.187 L' },
  { value: '0.375', label: '0.375 L' },
  { value: '0.5', label: '0.5 L' },
  { value: '0.75', label: '0.75 L' },
  { value: '1', label: '1 L' },
  { value: '1.5', label: '1.5 L' },
  { value: '2', label: '2 L' },
  { value: '3', label: '3 L' },
  { value: '5', label: '5 L' },
  { value: '10', label: '10 L' },
  { value: '15', label: '15 L' },
  { value: '20', label: '20 L' },
  { value: '25', label: '25 L' },
  { value: '30', label: '30 L' }
];



interface EditReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { 
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
  receipt: {
    id: number;
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
  } | null;
}

interface ProductRow {
  kod: string;
  nazwa: string;
  kod_kreskowy: string;
  ilosc: string;
  cena: string;
  dataWaznosci: string;
  showDataWaznosci: boolean;
  typ: string;
  objetosc: string;
}

export const EditReceiptModal: React.FC<EditReceiptModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  receipt
}) => {
  
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [sprzedawca, setSprzedawca] = useState('');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [productRows, setProductRows] = useState<ProductRow[]>([{ kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', cena: '', dataWaznosci: '', showDataWaznosci: false, typ: '', objetosc: '' }]);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const [kosztDostawy, setKosztDostawy] = useState('');
  const [productInvoice, setProductInvoice] = useState<File | null>(null);
  const [transportInvoice, setTransportInvoice] = useState<File | null>(null);
  const [existingProductInvoice, setExistingProductInvoice] = useState<string | null>(null);
  const [existingTransportInvoice, setExistingTransportInvoice] = useState<string | null>(null);
  const productFileInputRef = useRef<HTMLInputElement>(null);
  const transportFileInputRef = useRef<HTMLInputElement>(null);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);
  const [openObjetoscDropdownIndex, setOpenObjetoscDropdownIndex] = useState<number | null>(null);

  // Инициализация данных при открытии модального окна
  useEffect(() => {
    if (isOpen && receipt) {
      // Обрабатываем случай, когда products приходит как JSON строка
      let productsArray: any[] = [];
      if (receipt.products) {
        if (typeof receipt.products === 'string') {
          try {
            productsArray = JSON.parse(receipt.products);
          } catch (error) {
            console.error('Error parsing products JSON:', error);
            productsArray = [];
          }
        } else if (Array.isArray(receipt.products)) {
          productsArray = receipt.products;
        }
      }
      
      if (Array.isArray(productsArray) && productsArray.length > 0) {
        // Парсим дату - поддерживаем разные форматы
        let selectedDateValue: Date | null = null;
        if (receipt.dataPrzyjecia) {
          if (receipt.dataPrzyjecia.includes('/')) {
            // Формат DD/MM/YYYY
            const [day, month, year] = receipt.dataPrzyjecia.split('/');
            selectedDateValue = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          } else if (receipt.dataPrzyjecia.includes('-')) {
            // Формат YYYY-MM-DD
            selectedDateValue = new Date(receipt.dataPrzyjecia);
          } else {
            // Попробуем парсить как есть
            selectedDateValue = new Date(receipt.dataPrzyjecia);
          }
        }
        setSelectedDate(selectedDateValue);
        
        setSprzedawca(receipt.sprzedawca || '');
        setKosztDostawy((receipt.kosztDostawy || 0).toFixed(2).replace('.', ','));
        
        // Преобразуем продукты в формат для редактирования
        const formattedProducts: ProductRow[] = productsArray.map(product => ({
          kod: product.kod || '',
          nazwa: product.nazwa || '',
          kod_kreskowy: product.kod_kreskowy || product.ean || '', // Поддерживаем обратную совместимость
          ilosc: (product.ilosc || 0).toString(),
          cena: (product.cena || 0).toFixed(2).replace('.', ','),
          dataWaznosci: product.dataWaznosci || '',
          showDataWaznosci: false,
          typ: product.typ || product.typTowaru || '',
          objetosc: product.objetosc || ''
        }));
        
        setProductRows(formattedProducts.length > 0 ? formattedProducts : [{ kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', cena: '', dataWaznosci: '', showDataWaznosci: false, typ: '', objetosc: '' }]);
        
        // Сохраняем ссылки на существующие файлы
        setExistingProductInvoice(receipt.productInvoice || null);
        setExistingTransportInvoice(receipt.transportInvoice || null);
        setProductInvoice(null);
        setTransportInvoice(null);
              } else {
          setProductRows([{ kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', cena: '', dataWaznosci: '', showDataWaznosci: false, typ: '', objetosc: '' }]);
          setSelectedDate(null);
          setSprzedawca('');
          setKosztDostawy('');
          setProductInvoice(null);
          setTransportInvoice(null);
          setExistingProductInvoice(null);
          setExistingTransportInvoice(null);
        }
      } else {
        setProductRows([{ kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', cena: '', dataWaznosci: '', showDataWaznosci: false, typ: '', objetosc: '' }]);
        setSelectedDate(null);
        setSprzedawca('');
        setKosztDostawy('');
        setProductInvoice(null);
        setTransportInvoice(null);
        setExistingProductInvoice(null);
        setExistingTransportInvoice(null);
      }
  }, [isOpen, receipt]);

  // Закрываем выпадающие списки и календари при клике вне их области
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.dropdown-container') && !target.closest('button[onclick*="toggleDropdown"]')) {
        setOpenDropdownIndex(null);
      }
      if (!target.closest('.objetosc-dropdown-container') && !target.closest('button[onclick*="toggleObjetoscDropdown"]')) {
        setOpenObjetoscDropdownIndex(null);
      }
      
      // Закрываем календари при клике вне их области
      if (!target.closest('.react-datepicker') && !target.closest('button[title*="ważności"]')) {
        const newRows = [...productRows];
        let hasChanges = false;
        newRows.forEach(row => {
          if (row.showDataWaznosci) {
            row.showDataWaznosci = false;
            hasChanges = true;
          }
        });
        if (hasChanges) {
          setProductRows(newRows);
        }
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdownIndex(null);
        setOpenObjetoscDropdownIndex(null);
        // Закрываем календари при нажатии Escape
        const newRows = [...productRows];
        let hasChanges = false;
        newRows.forEach(row => {
          if (row.showDataWaznosci) {
            row.showDataWaznosci = false;
            hasChanges = true;
          }
        });
        if (hasChanges) {
          setProductRows(newRows);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [productRows]);

  const addNewRow = () => {
    setProductRows([...productRows, { kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', cena: '', dataWaznosci: '', showDataWaznosci: false, typ: '', objetosc: '' }]);
  };

  const deleteRow = (index: number) => {
    if (productRows.length > 1) {
      const newRows = [...productRows];
      newRows.splice(index, 1);
      setProductRows(newRows);
    }
  };

  const toggleDataWaznosci = (index: number) => {
    const newRows = [...productRows];
    newRows[index].showDataWaznosci = !newRows[index].showDataWaznosci;
    setProductRows(newRows);
  };

  const handleTypChange = (index: number, value: string) => {
    const newRows = [...productRows];
    newRows[index].typ = value;
    setProductRows(newRows);
    setOpenDropdownIndex(null);
  };

  const toggleDropdown = (index: number) => {
    if (openDropdownIndex === index) {
      setOpenDropdownIndex(null);
    } else {
      setOpenDropdownIndex(index);
    }
  };

  const handleObjetoscChange = (index: number, value: string) => {
    const newRows = [...productRows];
    newRows[index].objetosc = value;
    setProductRows(newRows);
    setOpenObjetoscDropdownIndex(null);
  };

  const toggleObjetoscDropdown = (index: number) => {
    if (openObjetoscDropdownIndex === index) {
      setOpenObjetoscDropdownIndex(null);
    } else {
      setOpenObjetoscDropdownIndex(index);
    }
  };



  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Не запускаем перетаскивание, если кликнули на кнопку, input или другую интерактивную область
    if ((e.target as HTMLElement).closest('button') || 
        (e.target as HTMLElement).closest('input') ||
        (e.target as HTMLElement).closest('.react-datepicker') ||
        (e.target as HTMLElement).closest('[role="button"]') ||
        (e.target as HTMLElement).closest('.react-datepicker__input-container')) {
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



  const handleProductFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setProductInvoice(file);
    }
  };

  const handleTransportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setTransportInvoice(file);
    }
  };

  const handleProductFileClick = () => {
    productFileInputRef.current?.click();
  };

  const handleTransportFileClick = () => {
    transportFileInputRef.current?.click();
  };

  const handleSubmit = async () => {
    console.log('=== HANDLE SUBMIT DEBUG ===');
    console.log('selectedDate:', selectedDate);
    console.log('receipt:', receipt);
    
    if (!selectedDate || !receipt) {
      console.log('Early return: selectedDate or receipt is null');
      return;
    }

    // Проверяем, что есть хотя бы одна заполненная строка продукта
    // EAN делаем необязательным полем
    const validProducts = productRows.filter(row => 
      row.kod && row.nazwa && row.ilosc && row.cena
    );

    console.log('productRows:', productRows);
    console.log('validProducts:', validProducts);
    console.log('validProducts.length:', validProducts.length);

    if (validProducts.length === 0) {
      console.log('Early return: no valid products');
      return;
    }

    console.log('Proceeding with submission...');

    const formattedProducts = validProducts.map(row => ({
      kod: row.kod,
      nazwa: row.nazwa,
      kod_kreskowy: row.kod_kreskowy || '', // Если kod_kreskowy пустой, используем пустую строку
      ilosc: parseFloat(row.ilosc) || 0,
      cena: parseFloat(row.cena.replace(',', '.')) || 0,
      dataWaznosci: row.dataWaznosci || undefined, // Если dataWaznosci пустое, используем undefined
      typ: row.typ || undefined,
      objetosc: row.objetosc ? parseFloat(row.objetosc) : undefined
    }));

    const totalValue = formattedProducts.reduce((sum, product) => {
      return sum + (product.ilosc * product.cena);
    }, 0);

    const deliveryCost = parseFloat(kosztDostawy.replace(',', '.')) || 0;

    console.log('Submitting data:', {
      id: receipt.id,
      date: selectedDate.toLocaleDateString('en-CA'),
      sprzedawca: sprzedawca,
      wartosc: totalValue,
      kosztDostawy: deliveryCost,
      products: formattedProducts
    });

    onSubmit({ 
      id: receipt.id,
      date: selectedDate.toLocaleDateString('en-CA'),
      sprzedawca: sprzedawca,
      wartosc: totalValue,
      kosztDostawy: deliveryCost,
      products: formattedProducts,
      productInvoice: productInvoice || undefined,
      transportInvoice: transportInvoice || undefined
    });
    handleClose();
  };

  const handleClose = () => {
    setSelectedDate(null);
    setPosition({ x: 0, y: 0 });
    setProductRows([{ kod: '', nazwa: '', kod_kreskowy: '', ilosc: '', cena: '', dataWaznosci: '', showDataWaznosci: false, typ: '', objetosc: '' }]);
    setKosztDostawy('');
    setSprzedawca('');
    setProductInvoice(null);
    setTransportInvoice(null);
    setExistingProductInvoice(null);
    setExistingTransportInvoice(null);
    onClose();
  };

  const calculateTotal = () => {
    return productRows.reduce((sum, row) => {
      const ilosc = parseFloat(row.ilosc) || 0;
      const cena = parseFloat(row.cena.replace(',', '.')) || 0;
      return sum + (ilosc * cena);
    }, 0).toFixed(2);
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      style={{
        content: {
          width: '1000px',
          height: '600px',
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
        <div className="flex justify-between items-center mb-8 select-none" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-base font-semibold text-gray-800">Edytowanie zakupu</h2>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleClose(); }}
            className="text-red-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 flex-grow pb-20">
          <div className="space-y-4">
            <div className="flex">
              <div className="w-[200px]">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Data zakupu
                </label>
                <DatePicker
                  selected={selectedDate}
                  onChange={(date: Date | null) => setSelectedDate(date)}
                  locale="pl"
                  dateFormat="dd/MM/yyyy"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                  placeholderText="Wybierz datę"
                  popperClassName="z-50"
                />
              </div>
              <div className="w-[200px] flex items-start">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                    Koszt dostawy
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={kosztDostawy}
                      onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        const char = String.fromCharCode(e.which);
                        const pattern = /[\d,]/;
                        if (!pattern.test(char) || 
                            (char === ',' && (e.target as HTMLInputElement).value.includes(',')) ||
                            ((e.target as HTMLInputElement).value === '' && char === ',')) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const input = e.target;
                        const cursorPosition = input.selectionStart ?? 0;
                        let value = input.value.replace(/[^\d,]/g, '');
                        
                        if (value === '') {
                          setKosztDostawy('');
                          return;
                        }

                        const hasComma = value.includes(',');
                        
                        if (!hasComma) {
                          value = value + ',00';
                        } else {
                          const [whole, decimal] = value.split(',');
                          if (decimal && decimal.length > 2) {
                            value = `${whole},${decimal.slice(0, 2)}`;
                          }
                        }

                        setKosztDostawy(value);
                        
                        requestAnimationFrame(() => {
                          const newPosition = Math.min(cursorPosition, value.length);
                          input.setSelectionRange(newPosition, newPosition);
                        });
                      }}
                      className="w-[70%] px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                      placeholder="0,00"
                    />
                    <span className="absolute right-[calc(30%+0.75rem)] top-1/2 -translate-y-1/2 text-gray-500">€</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between w-full max-w-md">
                <div className="flex items-center w-48">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleProductFileChange}
                    className="hidden"
                    ref={productFileInputRef}
                  />
                  <button
                    type="button"
                    onClick={handleProductFileClick}
                    className="inline-flex items-center justify-center w-8 h-8 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                    title="Dodaj fakturę za towar"
                  >
                    <Grape className="h-4 w-4 text-gray-500" />
                  </button>
                  {productInvoice && (
                    <a
                      href={URL.createObjectURL(productInvoice)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline truncate max-w-24"
                      title={productInvoice.name}
                    >
                      {productInvoice.name}
                    </a>
                  )}
                                    {!productInvoice && existingProductInvoice && (
                    <a
                      href={`${API_URL}${existingProductInvoice}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline truncate max-w-24"
                      title="Faktura za towar (PDF)"

                    >
                      Faktura za towar (PDF)
                    </a>
                  )}
                </div>
                <div className="flex items-center w-48">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleTransportFileChange}
                    className="hidden"
                    ref={transportFileInputRef}
                  />
                  <button
                    type="button"
                    onClick={handleTransportFileClick}
                    className="inline-flex items-center justify-center w-8 h-8 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                    title="Dodaj fakturę za transport"
                  >
                    <Car className="h-4 w-4 text-gray-500" />
                  </button>
                  {transportInvoice && (
                    <a
                      href={URL.createObjectURL(transportInvoice)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline truncate max-w-24"
                      title={transportInvoice.name}
                    >
                      {transportInvoice.name}
                    </a>
                  )}
                                    {!transportInvoice && existingTransportInvoice && (
                    <a
                      href={`${API_URL}${existingTransportInvoice}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline truncate max-w-24"
                      title="Faktura za transport (PDF)"

                    >
                      Faktura za transport (PDF)
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Sprzedawca
              </label>
              <input
                type="text"
                value={sprzedawca}
                onChange={(e) => setSprzedawca(e.target.value)}
                placeholder="Wprowadź imię sprzedawcy"
                className="w-[300px] px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
              />
            </div>
          </div>

          <div className="mt-2 h-[300px] overflow-y-auto pr-0 pb-8 mb-24">
            {productRows.map((row, index) => (
              <div key={index} className="grid grid-cols-12 gap-1 relative">
                <div className="col-span-1.5 relative">
                  <label className={`block text-xs font-medium text-gray-700 mb-2 font-sora ${index > 0 ? 'invisible' : ''}`}>Kod</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                    placeholder="Kod"
                    value={row.kod}
                    onChange={(e) => {
                      const newRows = [...productRows];
                      newRows[index].kod = e.target.value;
                      setProductRows(newRows);
                    }}
                  />
                  {index === productRows.length - 1 && (
                    <button
                      onClick={addNewRow}
                      className="absolute -bottom-7 left-0 text-gray-400 hover:text-gray-600"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>
                <div className="col-span-2">
                  <label className={`block text-xs font-medium text-gray-700 mb-2 font-sora ${index > 0 ? 'invisible' : ''}`}>Nazwa</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                    placeholder="Nazwa"
                    value={row.nazwa}
                    onChange={(e) => {
                      const newRows = [...productRows];
                      newRows[index].nazwa = e.target.value;
                      setProductRows(newRows);
                    }}
                  />
                </div>
                <div className="col-span-2">
                  <label className={`block text-xs font-medium text-gray-700 mb-2 font-sora ${index > 0 ? 'invisible' : ''}`}>Kod kreskowy</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                    placeholder="Kod kreskowy"
                    value={row.kod_kreskowy}
                    onChange={(e) => {
                      const newRows = [...productRows];
                      newRows[index].kod_kreskowy = e.target.value;
                      setProductRows(newRows);
                    }}
                  />
                </div>
                <div className="col-span-1.5">
                  <label className={`block text-xs font-medium text-gray-700 mb-2 font-sora ${index > 0 ? 'invisible' : ''}`}>Ilość</label>
                  <input
                    type="number"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="0"
                    value={row.ilosc}
                    onChange={(e) => {
                      const newRows = [...productRows];
                      const value = e.target.value;
                      if (value === '' || /^\d*$/.test(value)) {
                        newRows[index].ilosc = value;
                        setProductRows(newRows);
                      }
                    }}
                  />
                </div>
                <div className="col-span-2.9 relative">
                  <label className={`block text-xs font-medium text-gray-700 mb-2 font-sora ${index > 0 ? 'invisible' : ''}`}>Cena</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={row.cena}
                      onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        const char = String.fromCharCode(e.which);
                        const pattern = /[\d,]/;
                        if (!pattern.test(char) || 
                            (char === ',' && (e.target as HTMLInputElement).value.includes(',')) ||
                            ((e.target as HTMLInputElement).value === '' && char === ',')) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const input = e.target;
                        const cursorPosition = input.selectionStart ?? 0;
                        let value = e.target.value.replace(/[^\d,]/g, '');
                        
                        if (value === '') {
                          const newRows = [...productRows];
                          newRows[index].cena = '';
                          setProductRows(newRows);
                          return;
                        }

                        const hasComma = value.includes(',');
                        
                        if (!hasComma) {
                          value = value + ',00';
                        } else {
                          const [whole, decimal] = value.split(',');
                          if (decimal && decimal.length > 2) {
                            value = `${whole},${decimal.slice(0, 2)}`;
                          }
                        }

                        const newRows = [...productRows];
                        newRows[index].cena = value;
                        setProductRows(newRows);
                        
                        requestAnimationFrame(() => {
                          const newPosition = Math.min(cursorPosition, value.length);
                          input.setSelectionRange(newPosition, newPosition);
                        });
                      }}
                      className="w-[103%] px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <div className="col-span-1.8 relative -mr-2">
                  <label className={`block text-xs font-medium text-gray-700 mb-2 font-sora ${index > 0 ? 'invisible' : ''}`}>Wartość</label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={(() => {
                        const ilosc = parseFloat(row.ilosc) || 0;
                        const cena = parseFloat(row.cena.replace(',', '.')) || 0;
                        return (ilosc * cena).toFixed(2).replace('.', ',');
                      })()}
                      readOnly
                      className="w-[180%] px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-gray-50 ml-1"
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <div className="absolute right-0 top-[28px] flex flex-row items-center gap-1 z-50 pointer-events-auto" style={{transform: 'translateX(0%)'}}>
                  <button
                    type="button"
                    onClick={() => toggleDataWaznosci(index)}
                    className={`p-1 focus:outline-none pointer-events-auto relative z-[60] ${row.dataWaznosci ? 'text-green-600 hover:text-green-700' : 'text-gray-500 hover:text-gray-700'}`}
                    title={row.dataWaznosci ? `Termin ważności: ${row.dataWaznosci}` : "Dodaj termin ważności"}
                  >
                    <Calendar size={16} />
                  </button>
                  <button
                    onClick={() => deleteRow(index)}
                    className="text-red-400 hover:text-red-600 pointer-events-auto"
                  >
                    <X size={16} />
                  </button>
                </div>
                {row.showDataWaznosci && (
                  <div className="absolute top-full left-0 mt-1 z-50" style={{ left: 'calc(100% - 280px)' }}>
                    <DatePicker
                      selected={row.dataWaznosci ? new Date(row.dataWaznosci) : null}
                      onChange={(date: Date | null) => {
                        const newRows = [...productRows];
                        newRows[index].dataWaznosci = date ? date.toISOString().split('T')[0] : '';
                        newRows[index].showDataWaznosci = false; // Закрываем календарь после выбора
                        setProductRows(newRows);
                      }}
                      locale="pl"
                      dateFormat="dd/MM/yyyy"
                      inline
                      popperClassName="z-50"
                      minDate={new Date()}
                      onCalendarClose={() => {
                        const newRows = [...productRows];
                        newRows[index].showDataWaznosci = false;
                        setProductRows(newRows);
                      }}
                    />
                  </div>
                )}
                <div className="col-span-1.8 relative dropdown-container ml-1">
                  <label className={`block text-xs font-medium text-gray-700 mb-2 font-sora ${index > 0 ? 'invisible' : ''}`}>Typ</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => toggleDropdown(index)}
                      className={`w-[200%] px-3 py-1.5 border rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ml-1 ${row.typ ? TYPY_TOWARU.find(t => t.value === row.typ)?.color || 'border-gray-300 bg-white' : 'border-gray-300 bg-white'}`}
                    >
                      <span className="truncate">
                        {row.typ ? TYPY_TOWARU.find(t => t.value === row.typ)?.label || 'Wybierz typ' : 'Wybierz typ'}
                      </span>
                      <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdownIndex === index && (
                      <div 
                        className="absolute top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-40 overflow-y-auto w-[200%] ml-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {TYPY_TOWARU.map((typ) => (
                          <button
                            key={typ.value}
                            type="button"
                            onClick={() => handleTypChange(index, typ.value)}
                            className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 ${typ.color}`}
                          >
                            {typ.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="col-span-3 relative ml-20 objetosc-dropdown-container">
                  <label className={`block text-xs font-medium text-gray-700 mb-2 font-sora ${index > 0 ? 'invisible' : ''}`}>Objętość</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => toggleObjetoscDropdown(index)}
                      className={`w-[60%] px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ${row.objetosc ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}
                    >
                      <span className="truncate">
                        {row.objetosc ? OBJETOSCI_WINA.find(o => o.value === row.objetosc)?.label || row.objetosc : 'Wybierz'}
                      </span>
                      <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openObjetoscDropdownIndex === index && (
                      <div 
                        className="absolute top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-[100] max-h-40 overflow-y-auto w-[60%]"
                        onClick={(e) => e.stopPropagation()}
                        style={{ maxWidth: '200px' }}
                      >
                        {OBJETOSCI_WINA.map((objetosc) => (
                          <button
                            key={objetosc.value}
                            type="button"
                            onClick={() => handleObjetoscChange(index, objetosc.value)}
                            className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50"
                          >
                            {objetosc.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Отдельный контейнер для кнопок вне области перетаскивания */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Łączna wartość: <span className="font-semibold">{calculateTotal()} €</span>
            </div>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleClose(); }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSubmit(); }}
                className="px-4 py-2 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none"
              >
                Zapisz zmiany
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}; 