import React from 'react';

interface DataTableProps {
  data: {
    headers: string[];
    rows: string[][];
  };
}

export const DataTable: React.FC<DataTableProps> = ({ data }) => {
  // Определяем индексы нужных колонок
  const kodIndex = data.headers.findIndex(h => h === 'Kod');
  const nazwaIndex = data.headers.findIndex(h => h === 'Nazwa');
  const iloscIndex = data.headers.findIndex(h => h === 'Ilość');
  const kodKreskowyIndex = data.headers.findIndex(h => h === 'Kod kreskowy');

  // Фильтруем только нужные колонки
  const filteredHeaders = data.headers.filter(h => 
    h === 'Kod' || h === 'Nazwa' || h === 'Ilość' || h === 'Kod kreskowy'
  );

  // Фильтруем пустые строки и получаем только нужные колонки
  const filteredRows = data.rows
    .filter(row => row.some(cell => cell && cell.toString().trim() !== ''))
    .map(row => [
      row[kodIndex],
      row[nazwaIndex],
      row[iloscIndex],
      row[kodKreskowyIndex]
    ]);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {filteredHeaders.map((header, index) => (
              <th
                key={index}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {filteredRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-sora"
                  style={{ fontSize: '12px' }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};