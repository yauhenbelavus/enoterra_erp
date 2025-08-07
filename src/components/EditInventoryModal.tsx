import React, { useState, useEffect, useRef } from 'react';
import Modal from 'react-modal';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import { X, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import "react-datepicker/dist/react-datepicker.css";
import "./DatePicker.css";
import { API_URL } from '../config';

registerLocale('pl', pl);

interface InventoryItem {
  id: number;
  kod: string;
  nazwa: string;
  ilosc: number;
  jednostka_miary: string;
  kod_kreskowy: string;
  data_waznosci: number;
  archiwalny: number;
  rezerwacje: number;
  ilosc_na_poleceniach: number;
  waga_netto: number;
  waga_brutto: number;
  objetosc: number;
  typ?: string;
  opis: string;
  updated_at: string;
  wartosc: number;
  sprzedawca?: string;
  cena?: number; // Added cena field
  cena_sprzedazy?: number; // Added cena_sprzedazy field
}

interface EditInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem | null;
  onSave: (updatedItem: InventoryItem) => void;
}

const TYPY_TOWARU = [
  { value: 'czerwone', label: 'Czerwone', color: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'biale', label: 'Białe', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  { value: 'musujace', label: 'Musujące', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'bezalkoholowe', label: 'Bezalkoholowe', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'ferment', label: 'Ferment', color: 'bg-orange-100 text-orange-800 border-orange-200' }
];

const OBJETOSCI_WINA = [
  { value: '0.375', label: '0,375l' },
  { value: '0.5', label: '0,5l' },
  { value: '0.75', label: '0,75l' },
  { value: '1', label: '1l' },
  { value: '1.5', label: '1,5l' },
  { value: '3', label: '3l' }
];

export const EditInventoryModal: React.FC<EditInventoryModalProps> = ({
  isOpen,
  onClose,
  item,
  onSave
}) => {
  const [formData, setFormData] = useState({
    sprzedawca: '',
    typ: '',
    objetosc: '',
    data_waznosci: '',
    cena: '',
    cena_sprzedazy: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const [isTypDropdownOpen, setIsTypDropdownOpen] = useState(false);
  const [isObjetoscDropdownOpen, setIsObjetoscDropdownOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    if (item) {
      setFormData({
        sprzedawca: item.sprzedawca || '',
        typ: item.typ || '',
        objetosc: item.objetosc && item.objetosc > 0 ? item.objetosc.toString() : '0,75',
        data_waznosci: item.data_waznosci ? new Date(item.data_waznosci).toISOString().split('T')[0] : '',
        cena: item.cena ? item.cena.toString() : '',
        cena_sprzedazy: item.cena_sprzedazy ? item.cena_sprzedazy.toString() : ''
      });
      setSelectedDate(item.data_waznosci ? new Date(item.data_waznosci) : null);
    }
  }, [item]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      setIsDragging(true);
      dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
      
      const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
          setPosition({
            x: e.clientX - dragStart.current.x,
            y: e.clientY - dragStart.current.y
          });
        }
      };
      
      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
  };

  const handleTypChange = (value: string) => {
    setFormData(prev => ({ ...prev, typ: value }));
    setIsTypDropdownOpen(false);
  };

  const toggleTypDropdown = () => {
    setIsTypDropdownOpen(!isTypDropdownOpen);
  };

  const handleObjetoscChange = (value: string) => {
    setFormData(prev => ({ ...prev, objetosc: value }));
    setIsObjetoscDropdownOpen(false);
  };

  const toggleObjetoscDropdown = () => {
    setIsObjetoscDropdownOpen(!isObjetoscDropdownOpen);
  };

  const toggleDatePicker = () => {
    setIsDatePickerOpen(!isDatePickerOpen);
  };

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
    setFormData(prev => ({ 
      ...prev, 
      data_waznosci: date ? date.toISOString().split('T')[0] : '' 
    }));
    setIsDatePickerOpen(false);
  };

  // Закрытие dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isTypDropdownOpen && !target.closest('.dropdown-container')) {
        setIsTypDropdownOpen(false);
      }
      if (isObjetoscDropdownOpen && !target.closest('.dropdown-container')) {
        setIsObjetoscDropdownOpen(false);
      }
      if (isDatePickerOpen && !target.closest('.react-datepicker') && !target.closest('button[title*="ważności"]')) {
        setIsDatePickerOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTypDropdownOpen(false);
        setIsObjetoscDropdownOpen(false);
        setIsDatePickerOpen(false);
      }
    };

    if (isTypDropdownOpen || isObjetoscDropdownOpen || isDatePickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isTypDropdownOpen, isObjetoscDropdownOpen, isDatePickerOpen]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!item) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/working-sheets/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: item.id,
          sprzedawca: formData.sprzedawca,
          typ: formData.typ,
          objetosc: parseFloat(formData.objetosc) || 0,
          data_waznosci: formData.data_waznosci ? new Date(formData.data_waznosci).getTime() : 0,
          cena: parseFloat(formData.cena) || undefined,
          cena_sprzedazy: parseFloat(formData.cena_sprzedazy) || undefined
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update item');
      }

      const updatedItem = {
        ...item,
        sprzedawca: formData.sprzedawca,
        typ: formData.typ,
        objetosc: parseFloat(formData.objetosc) || 0,
        data_waznosci: formData.data_waznosci ? new Date(formData.data_waznosci).getTime() : 0,
        cena: parseFloat(formData.cena) || undefined,
        cena_sprzedazy: parseFloat(formData.cena_sprzedazy) || undefined
      };

      // Создаем запись в price_history при изменении цены
      if (formData.cena && parseFloat(formData.cena) !== (item.cena || 0)) {
        try {
          const priceHistoryResponse = await fetch(`${API_URL}/api/price-history`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              working_sheet_id: item.id,
              product_kod: item.kod,
              sprzedawca: formData.sprzedawca,
              cena: parseFloat(formData.cena),
              ilosc: item.ilosc,
              data_dostawy: formData.data_waznosci ? new Date(formData.data_waznosci).getTime() : null,
              is_manual_edit: true
            }),
          });

          if (!priceHistoryResponse.ok) {
            console.error('Failed to create price history record');
          } else {
            console.log('Price history record created successfully');
          }
        } catch (error) {
          console.error('Error creating price history record:', error);
        }
      }

      onSave(updatedItem);
      toast.success('Pozycja została zaktualizowana pomyślnie');
      onClose();
    } catch (error) {
      console.error('Error updating item:', error);
      toast.error('Błąd podczas aktualizacji pozycji');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !item) return null;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={{
        content: {
          width: '500px',
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
        <div className="flex justify-between items-center mb-8 select-none">
          <h2 className="text-base font-semibold text-gray-800">Edytuj pozycję</h2>
          <button
            onClick={onClose}
            className="text-red-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 flex-grow">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Nazwa produktu
              </label>
              <input
                type="text"
                value={item.nazwa}
                disabled
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md bg-gray-50 font-sora text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Sprzedawca
              </label>
              <input
                type="text"
                value={formData.sprzedawca}
                onChange={(e) => setFormData(prev => ({ ...prev, sprzedawca: e.target.value }))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
              />
            </div>

            <div className="relative dropdown-container">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Typ
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={toggleTypDropdown}
                  className={`w-full px-3 py-1.5 border rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ${formData.typ ? TYPY_TOWARU.find(t => t.value === formData.typ)?.color || 'border-gray-300 bg-white' : 'border-gray-300 bg-white'}`}
                >
                  <span className="truncate">
                    {formData.typ ? TYPY_TOWARU.find(t => t.value === formData.typ)?.label || 'Wybierz typ' : 'Wybierz typ'}
                  </span>
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isTypDropdownOpen && (
                  <div 
                    className="absolute top-full mt-1 bg-white border border-gray-300 rounded-md z-50 max-h-40 overflow-y-auto w-full"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {TYPY_TOWARU.map((typ) => (
                      <button
                        key={typ.value}
                        type="button"
                        onClick={() => handleTypChange(typ.value)}
                        className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 ${typ.color}`}
                      >
                        {typ.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="relative dropdown-container">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Objętość
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={toggleObjetoscDropdown}
                                                    className={`w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs text-left flex items-center justify-between ${formData.objetosc ? 'bg-blue-50 border-blue-300' : 'bg-blue-50 border-blue-300'}`}
                >
                                                    <span className="truncate">
                                    {formData.objetosc ? `${formData.objetosc}l` : '0,75l'}
                                  </span>
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isObjetoscDropdownOpen && (
                  <div 
                    className="absolute top-full mt-1 bg-white border border-gray-300 rounded-md z-50 max-h-40 overflow-y-auto w-full"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {OBJETOSCI_WINA.map((objetosc) => (
                      <button
                        key={objetosc.value}
                        type="button"
                        onClick={() => handleObjetoscChange(objetosc.value)}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50"
                      >
                        {objetosc.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="relative">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Data ważności
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={selectedDate ? selectedDate.toLocaleDateString('pl-PL') : ''}
                  readOnly
                  placeholder="Wybierz datę"
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-gray-50"
                />
                <button
                  type="button"
                  onClick={toggleDatePicker}
                  className={`p-1 focus:outline-none ${selectedDate ? 'text-green-600 hover:text-green-700' : 'text-gray-500 hover:text-gray-700'}`}
                  title={selectedDate ? `Termin ważności: ${selectedDate.toLocaleDateString('pl-PL')}` : "Dodaj termin ważności"}
                >
                  <Calendar size={16} />
                </button>
              </div>
              {isDatePickerOpen && (
                <div className="absolute bottom-full left-0 mb-1 z-50">
                  <DatePicker
                    selected={selectedDate}
                    onChange={handleDateChange}
                    locale="pl"
                    dateFormat="dd/MM/yyyy"
                    inline
                    popperClassName="z-50"
                    minDate={new Date()}
                    onCalendarClose={() => setIsDatePickerOpen(false)}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Cena fakturowa (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.cena}
                  onChange={(e) => setFormData(prev => ({ ...prev, cena: e.target.value }))}
                  placeholder="0.00"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                  Cena w sprzedaży (zł)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.cena_sprzedazy}
                  onChange={(e) => setFormData(prev => ({ ...prev, cena_sprzedazy: e.target.value }))}
                  placeholder="0.00"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          </div>
        </form>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className={`px-6 py-1.5 text-white text-xs rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-sora ${
              isLoading
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoading ? 'Zapisywanie...' : 'Zapisz'}
          </button>
        </div>
      </div>
    </Modal>
  );
}; 