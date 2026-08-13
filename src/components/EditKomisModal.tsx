import React, { useState, useEffect } from 'react';
import { X, Plus, Search } from 'lucide-react';
import Modal from 'react-modal';
import toast from 'react-hot-toast';

interface KomisProduct {
  kod: string;
  nazwa: string;
  ilosc: number;
}

interface KomisClient {
  klient: string;
  products: KomisProduct[];
  total_ilosc: number;
}

interface SearchProduct {
  kod: string;
  nazwa: string;
}

interface KomisRow {
  kod: string;
  nazwa: string;
  ilosc: string;
  isNew?: boolean;
  searchQuery?: string;
}

interface EditKomisModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  komisData: KomisClient | null;
}

export const EditKomisModal: React.FC<EditKomisModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  komisData
}) => {
  const [rows, setRows] = useState<KomisRow[]>([]);
  const [deletedKods, setDeletedKods] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchProducts, setSearchProducts] = useState<SearchProduct[]>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [isSearchLoading, setIsSearchLoading] = useState(false);

  useEffect(() => {
    if (isOpen && komisData) {
      const loadFresh = async () => {
        setIsLoading(true);
        try {
          const res = await fetch(`/api/komis/client/${encodeURIComponent(komisData.klient)}`);
          if (!res.ok) throw new Error('Błąd ładowania');
          const data: KomisClient = await res.json();
          setRows(data.products.map(p => ({
            kod: p.kod,
            nazwa: p.nazwa,
            ilosc: String(p.ilosc),
            isNew: false
          })));
          setDeletedKods([]);
        } catch {
          setRows(komisData.products.map(p => ({
            kod: p.kod,
            nazwa: p.nazwa,
            ilosc: String(p.ilosc),
            isNew: false
          })));
          setDeletedKods([]);
        } finally {
          setIsLoading(false);
        }
      };
      loadFresh();
    } else {
      setRows([]);
      setDeletedKods([]);
      setSearchProducts([]);
      setActiveSearchIndex(null);
    }
  }, [isOpen, komisData]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (activeSearchIndex !== null && !target.closest('.product-search-container')) {
        setActiveSearchIndex(null);
        setSearchProducts([]);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveSearchIndex(null);
        setSearchProducts([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [activeSearchIndex]);

  useEffect(() => {
    const searchProductsAsync = async () => {
      if (activeSearchIndex === null) {
        setSearchProducts([]);
        return;
      }
      const row = rows[activeSearchIndex];
      const query = row?.searchQuery || '';
      if (query.trim().length < 1) {
        setSearchProducts([]);
        return;
      }
      setIsSearchLoading(true);
      try {
        const response = await fetch(`/api/working-sheets/search-simple?query=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Failed to fetch products');
        const data = await response.json();
        setSearchProducts(data.map((item: SearchProduct) => ({
          kod: item.kod,
          nazwa: item.nazwa
        })));
      } catch {
        setSearchProducts([]);
      } finally {
        setIsSearchLoading(false);
      }
    };
    const timeoutId = setTimeout(searchProductsAsync, 300);
    return () => clearTimeout(timeoutId);
  }, [activeSearchIndex, rows]);

  const handleClose = () => {
    setRows([]);
    setDeletedKods([]);
    setIsSubmitting(false);
    setSearchProducts([]);
    setActiveSearchIndex(null);
    onClose();
  };

  const addNewRow = () => {
    setRows([...rows, { kod: '', nazwa: '', ilosc: '', isNew: true, searchQuery: '' }]);
  };

  const handleProductSelect = (index: number, product: SearchProduct) => {
    const duplicate = rows.some((r, i) => i !== index && r.kod === product.kod);
    if (duplicate) {
      toast.error('Ten produkt jest już na liście');
      return;
    }
    const newRows = [...rows];
    newRows[index] = {
      ...newRows[index],
      kod: product.kod,
      nazwa: product.nazwa,
      searchQuery: `${product.kod} - ${product.nazwa}`
    };
    setRows(newRows);
    setSearchProducts([]);
    setActiveSearchIndex(null);
  };

  const deleteRow = (index: number) => {
    const row = rows[index];
    if (!row.isNew && row.kod) {
      setDeletedKods(prev => [...prev, row.kod]);
    }
    setRows(rows.filter((_, i) => i !== index));
  };

  const totalIlosc = rows.reduce((sum, r) => {
    const val = parseInt(r.ilosc, 10);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const handleSubmit = async () => {
    if (!komisData) return;

    const incomplete = rows.find(r => !r.kod || !r.nazwa || r.ilosc === '' || isNaN(parseInt(r.ilosc, 10)) || parseInt(r.ilosc, 10) < 0);
    if (incomplete) {
      toast.error('Wypełnij wszystkie pozycje — wybierz produkt i podaj ilość');
      return;
    }

    const kods = rows.map(r => r.kod);
    if (new Set(kods).size !== kods.length) {
      toast.error('Lista zawiera zduplikowane produkty');
      return;
    }

    setIsSubmitting(true);
    try {
      await Promise.all(
        deletedKods.map(kod =>
          fetch('/api/komis', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ klient: komisData.klient, kod })
          })
        )
      );

      await Promise.all(
        rows.map(row =>
          fetch('/api/komis', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              klient: komisData.klient,
              kod: row.kod,
              nazwa: row.nazwa,
              ilosc: parseInt(row.ilosc, 10)
            })
          }).then(res => {
            if (!res.ok) throw new Error(`Błąd zapisu dla ${row.kod}`);
          })
        )
      );
      toast.success('Zmiany zapisane');
      onSuccess?.();
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Błąd podczas zapisywania');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!komisData) return null;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      style={{
        content: {
          width: '700px',
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
          <h2 className="text-base font-semibold text-gray-800">Edytuj komis</h2>
          <button onClick={handleClose} className="text-red-500 focus:outline-none">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 flex-grow overflow-y-auto pr-2">
          <div className="flex gap-4">
            <div className="w-[300px]">
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Klient
              </label>
              <input
                type="text"
                value={komisData.klient}
                readOnly
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-gray-50 text-gray-700"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-24">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <div className={`space-y-2 pb-8 ${rows.length >= 8 ? 'overflow-y-auto max-h-[280px] pr-2' : 'overflow-visible'}`}>
              {rows.map((row, index) => (
                <div key={`${row.kod || 'new'}-${index}`} className="relative product-search-container">
                  <div className="flex">
                    {/* Nazwa */}
                    <div className="relative flex-1">
                      {index === 0 && (
                        <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Nazwa</label>
                      )}
                      {row.isNew && !row.kod ? (
                        <>
                          <div
                            className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
                            style={{ top: index === 0 ? '28px' : '0' }}
                          >
                            <Search className="h-4 w-4 text-gray-400" />
                          </div>
                          <input
                            type="text"
                            className="w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                            placeholder="Wyszukaj produkt..."
                            value={row.searchQuery || ''}
                            onChange={(e) => {
                              const newRows = [...rows];
                              newRows[index] = {
                                ...newRows[index],
                                searchQuery: e.target.value,
                                kod: '',
                                nazwa: ''
                              };
                              setRows(newRows);
                              setActiveSearchIndex(index);
                            }}
                            onFocus={() => setActiveSearchIndex(index)}
                          />
                          {isSearchLoading && activeSearchIndex === index && (
                            <div
                              className="absolute right-3 top-1/2 transform -translate-y-1/2"
                              style={{ top: index === 0 ? 'calc(50% + 14px)' : '50%' }}
                            >
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                            </div>
                          )}
                          {searchProducts.length > 0 && activeSearchIndex === index && (row.searchQuery?.trim() || '') && (
                            <div className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm border border-gray-200">
                              {searchProducts.map((product, idx) => (
                                <div
                                  key={`${product.kod}-${idx}`}
                                  className="cursor-pointer select-none relative py-1 pl-3 pr-9 hover:bg-blue-50"
                                  onClick={() => handleProductSelect(index, product)}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium text-[10px]">{product.kod}</span>
                                    <span className="text-[10px] text-gray-500">{product.nazwa}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <input
                          type="text"
                          value={row.nazwa}
                          readOnly
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-gray-50 text-gray-700"
                        />
                      )}
                    </div>

                    {/* Ilość */}
                    <div className="w-24 ml-2">
                      {index === 0 && (
                        <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">Ilość</label>
                      )}
                      <input
                        type="number"
                        min={0}
                        value={row.ilosc}
                        onChange={e => {
                          const value = e.target.value;
                          if (value === '' || /^\d*$/.test(value)) {
                            const newRows = [...rows];
                            newRows[index] = { ...newRows[index], ilosc: value };
                            setRows(newRows);
                          }
                        }}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0"
                      />
                    </div>

                    {/* Usuń */}
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => deleteRow(index)}
                        className={`ml-2 text-red-400 hover:text-red-600 ${index === 0 ? 'mt-[28px]' : ''}`}
                        title="Usuń pozycję"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {index === rows.length - 1 && (
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

              {rows.length === 0 && (
                <button
                  type="button"
                  onClick={addNewRow}
                  className="text-gray-400 hover:text-gray-600"
                  title="Dodaj nową pozycję"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="absolute bottom-8 right-12 flex flex-col items-start gap-1">
          <div className="flex items-center">
            <span className="text-xs font-bold text-gray-700 mr-2">Razem (szt.):</span>
            <span className="text-xs font-bold text-gray-900">{totalIlosc}</span>
          </div>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || isLoading || rows.length === 0}
            className={`px-6 py-1.5 text-white text-xs rounded-md focus:outline-none transition-colors font-sora ${
              isSubmitting || isLoading || rows.length === 0
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Zapisywanie...
              </div>
            ) : (
              'Zapisz zmiany'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
