import React from 'react';
import { ArrowLeft, Download, Trash2 } from 'lucide-react';
import DataTable from './DataTable';
import { API_URL } from '../config';

interface ExcelViewerProps {
  sheet: {
    fileName: string;
    data: {
      headers: string[];
      rows: string[][];
    };
  };
  onBack: () => void;
  onDelete?: (fileName: string) => void;
}

export const ExcelViewer: React.FC<ExcelViewerProps> = ({ sheet, onBack, onDelete }) => {
  const handleDownload = () => {
    // Создаем CSV файл для скачивания
    const csvContent = [
      sheet.data.headers.join(','),
      ...sheet.data.rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${sheet.fileName.replace('.xlsx', '.csv')}`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    
    try {
      await fetch(`${API_URL}/api/delete_file/${encodeURIComponent(sheet.fileName)}`, {
        method: 'DELETE'
      });
      onDelete(sheet.fileName);
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sora">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <ArrowLeft size={16} className="mr-2" />
                Назад
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {sheet.fileName}
                </h1>
                <p className="text-sm text-gray-500">
                  {sheet.data.rows.length} записей, {sheet.data.headers.length} колонок
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={handleDownload}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <Download size={16} className="mr-2" />
                Скачать CSV
              </button>
              
              {onDelete && sheet.fileName !== 'stany init.xlsx' && (
                <button
                  onClick={handleDelete}
                  className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  <Trash2 size={16} className="mr-2" />
                  Удалить
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">
              Содержимое файла
            </h2>
          </div>
          <div className="p-6">
            <DataTable data={sheet.data} />
          </div>
        </div>
      </div>
    </div>
  );
};
