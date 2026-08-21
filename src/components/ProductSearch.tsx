import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { SortIndicator } from './SortIndicator';
import { getProductSearchSortValue, useTableSort } from '../utils/tableSort';

interface Product {
  kod: string;
  nazwa: string;
  ilosc: string;
  kodKreskowy: string;
}

interface ProductSearchProps {
  onSearch: (query: string) => Promise<Product[]>;
}

export const ProductSearch: React.FC<ProductSearchProps> = ({ onSearch }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const { sortField, sortDirection, handleSort, sortedItems } = useTableSort(
    products,
    getProductSearchSortValue,
    'nazwa',
    'asc'
  );

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.trim()) {
        setIsLoading(true);
        try {
          const results = await onSearch(searchQuery);
          setProducts(results);
        } catch (error) {
          console.error('Error searching products:', error);
          setProducts([]);
        } finally {
          setIsLoading(false);
        }
      } else {
        setProducts([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, onSearch]);

  return (
    <div className="w-full relative">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Szukaj produktów..."
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none sm:text-sm font-sora shadow-none"
        />
      </div>

      {isLoading ? (
        <div className="absolute top-full left-0 right-0 z-50 bg-white rounded-lg shadow-sm border border-gray-200 mt-1 font-sora">
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500 font-sora">Ładowanie...</p>
          </div>
        </div>
      ) : products.length > 0 ? (
        <div className="absolute top-full left-0 right-0 z-50 bg-white rounded-lg shadow-sm border border-gray-200 mt-1 max-h-64 overflow-y-auto font-sora">
          <table className="w-full table-fixed">
            <thead className="sticky top-0 z-10">
              <tr>
                <th
                  className="w-[15%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase font-sora bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('kod')}
                >
                  <div className="flex items-center gap-1">
                    Kod
                    <SortIndicator field="kod" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th
                  className="w-[70%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase font-sora bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('nazwa')}
                >
                  <div className="flex items-center gap-1">
                    Nazwa
                    <SortIndicator field="nazwa" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th
                  className="w-[15%] px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase font-sora bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('ilosc')}
                >
                  <div className="flex items-center gap-1">
                    Ilość
                    <SortIndicator field="ilosc" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedItems.map((product, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-2 py-2 text-sm text-gray-900 truncate font-sora" title={product.kod}>{product.kod}</td>
                  <td className="px-2 py-2 text-sm text-gray-900 truncate font-sora" title={product.nazwa}>{product.nazwa}</td>
                  <td className="px-2 py-2 text-sm text-gray-900 truncate font-sora" title={product.ilosc}>{product.ilosc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : searchQuery ? (
        <div className="absolute top-full left-0 right-0 z-50 bg-white rounded-lg shadow-sm border border-gray-200 mt-1 font-sora">
          <div className="text-center py-4 text-gray-500">
            Brak wyników
          </div>
        </div>
      ) : null}
    </div>
  );
};
