import { ChevronDown, ChevronUp } from 'lucide-react';
import React from 'react';

interface SortIndicatorProps {
  field: string;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  size?: number;
}

export function SortIndicator({ field, sortField, sortDirection, size = 14 }: SortIndicatorProps) {
  if (sortField !== field) return null;
  return sortDirection === 'asc' ? <ChevronUp size={size} /> : <ChevronDown size={size} />;
}

interface SortableThProps {
  label: React.ReactNode;
  field: string;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  onSort: (field: string) => void;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

export function SortableTh({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
  className = '',
  align = 'left',
}: SortableThProps) {
  const alignClass =
    align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : '';

  return (
    <th
      className={`cursor-pointer hover:bg-gray-100 ${className}`}
      onClick={() => onSort(field)}
    >
      <div className={`flex items-center gap-1 ${alignClass}`}>
        {label}
        <SortIndicator field={field} sortField={sortField} sortDirection={sortDirection} />
      </div>
    </th>
  );
}
