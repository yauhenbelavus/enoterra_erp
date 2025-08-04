import React, { useState } from 'react';
import { Eye } from 'lucide-react';
import { Product } from '../types/Product';

interface ProductListProps {
  products: Product[];
  onView: (product: Product) => void;
}

export const ProductList: React.FC<ProductListProps> = ({ products, onView }) => {
  const [sortField, setSortField] = useState<string>('nazwa');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Сортировка продуктов
  const sortedProducts = products.sort((a, b) => {
    let aValue: any;
    let bValue: any;
    
    switch (sortField) {
      case 'kod':
        aValue = (a.kod || '').toLowerCase();
        bValue = (b.kod || '').toLowerCase();
        break;
      case 'nazwa':
        aValue = (a.nazwa || '').toLowerCase();
        bValue = (b.nazwa || '').toLowerCase();
        break;
      case 'ilosc':
        aValue = a.ilosc || 0;
        bValue = b.ilosc || 0;
        break;
      case 'jednostka_miary':
        aValue = (a.jednostka_miary || '').toLowerCase();
        bValue = (b.jednostka_miary || '').toLowerCase();
        break;
      case 'kod_kreskowy':
        aValue = (a.kod_kreskowy || '').toLowerCase();
        bValue = (b.kod_kreskowy || '').toLowerCase();
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
    return 0;
  });

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th 
              scope="col" 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort('kod')}
            >
              Kod
            </th>
            <th 
              scope="col" 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort('nazwa')}
            >
              Nazwa
            </th>
            <th 
              scope="col" 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort('ilosc')}
            >
              Ilość
            </th>
            <th 
              scope="col" 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort('jednostka_miary')}
            >
              Jednostka miary
            </th>
            <th 
              scope="col" 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort('kod_kreskowy')}
            >
              Kod kreskowy
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Действия
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedProducts.map((product, index) => (
            <tr key={index}>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {product.kod}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {product.nazwa}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {product.ilosc}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {product.jednostka_miary}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {product.kod_kreskowy}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <button
                  onClick={e => { e.preventDefault(); onView(product); }}
                  className="text-blue-600 hover:text-blue-800 focus:outline-none"
                  title="Посмотреть детали"
                >
                  <Eye size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}; 