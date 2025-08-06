import React from 'react';

const TYPY_TOWARU = [
  { value: 'czerwone', label: 'Czerwone', color: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'biale', label: 'Białe', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  { value: 'musujace', label: 'Musujące', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'bezalkoholowe', label: 'Bezalkoholowe', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'ferment', label: 'Ferment', color: 'bg-orange-100 text-orange-800 border-orange-200' }
];

interface CategoryFilterProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

export const CategoryFilter: React.FC<CategoryFilterProps> = ({ 
  selectedCategory, 
  onCategoryChange 
}) => {
  return (
    <div className="mb-4">
      <div className="w-1/2 mx-auto">
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => onCategoryChange('')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              selectedCategory === '' 
                ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Wszystkie
          </button>
          {TYPY_TOWARU.map((typ) => (
            <button
              key={typ.value}
              onClick={() => onCategoryChange(typ.value)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${typ.color} ${
                selectedCategory === typ.value 
                  ? 'ring-2 ring-blue-500 ring-offset-2' 
                  : 'hover:opacity-80'
              }`}
            >
              {typ.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}; 