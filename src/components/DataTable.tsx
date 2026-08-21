import React, { useMemo } from 'react';
import { SortIndicator } from './SortIndicator';
import { getDataTableSortValue, useTableSort } from '../utils/tableSort';

interface DataTableProps {
  data: {
    headers: string[];
    rows: string[][];
  };
}

const HEADER_FIELDS: Record<string, string> = {
  Kod: 'kod',
  Nazwa: 'nazwa',
  Ilość: 'ilosc',
  'Kod kreskowy': 'kodKreskowy',
};

export const DataTable: React.FC<DataTableProps> = ({ data }) => {
  const kodIndex = data.headers.findIndex((h) => h === 'Kod');
  const nazwaIndex = data.headers.findIndex((h) => h === 'Nazwa');
  const iloscIndex = data.headers.findIndex((h) => h === 'Ilość');
  const kodKreskowyIndex = data.headers.findIndex((h) => h === 'Kod kreskowy');

  const filteredHeaders = data.headers.filter(
    (h) => h === 'Kod' || h === 'Nazwa' || h === 'Ilość' || h === 'Kod kreskowy'
  );

  const tableRows = useMemo(
    () =>
      data.rows
        .filter((row) => row.some((cell) => cell && cell.toString().trim() !== ''))
        .map((row) => ({
          kod: row[kodIndex] ?? '',
          nazwa: row[nazwaIndex] ?? '',
          ilosc: row[iloscIndex] ?? '',
          kodKreskowy: row[kodKreskowyIndex] ?? '',
        })),
    [data.rows, kodIndex, nazwaIndex, iloscIndex, kodKreskowyIndex]
  );

  const { sortField, sortDirection, handleSort, sortedItems } = useTableSort(
    tableRows,
    getDataTableSortValue,
    'kod',
    'asc'
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {filteredHeaders.map((header) => {
              const field = HEADER_FIELDS[header] ?? header;
              return (
                <th
                  key={header}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-sora cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort(field)}
                >
                  <div className="flex items-center gap-1">
                    {header}
                    <SortIndicator field={field} sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedItems.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td
                className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-sora"
                style={{ fontSize: '12px' }}
              >
                {row.kod}
              </td>
              <td
                className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-sora"
                style={{ fontSize: '12px' }}
              >
                {row.nazwa}
              </td>
              <td
                className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-sora"
                style={{ fontSize: '12px' }}
              >
                {row.ilosc}
              </td>
              {filteredHeaders.includes('Kod kreskowy') && (
                <td
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-sora"
                  style={{ fontSize: '12px' }}
                >
                  {row.kodKreskowy}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
