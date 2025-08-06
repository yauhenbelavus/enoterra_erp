import React, { useState, useRef, useEffect } from 'react';
import Modal from 'react-modal';
import { X } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ExcelFileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (fileName: string, data: { headers: string[], rows: string[][] }) => void;
}

export const ExcelFileUploadModal: React.FC<ExcelFileUploadModalProps> = ({
  isOpen,
  onClose,
  onUpload,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
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

    const handleMouseLeave = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('mouseleave', handleMouseLeave);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isDragging]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleUpload = () => {
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          console.log('Workbook sheets:', workbook.SheetNames);
          
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          console.log('First sheet data:', firstSheet);
          
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as string[][];
          console.log('Parsed JSON data:', jsonData);
          
          const fileData = {
            headers: jsonData[0],
            rows: jsonData.slice(1)
          };
          console.log('Prepared file data:', fileData);
          
          onUpload(file.name, fileData);
          handleClose();
        } catch (error) {
          console.error('Error reading Excel file:', error);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleClose = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      style={{
        content: {
          width: '500px',
          height: '180px',
          maxWidth: '500px',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
          margin: '0',
          borderRadius: '0.5rem',
          background: 'white',
          overflow: 'hidden',
          outline: 'none',
          padding: '16px',
          fontFamily: 'Sora',
          cursor: 'grab',
          userSelect: 'none',
          border: '1px solid #e5e7eb',
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
        className="font-sora h-full w-full flex flex-col overflow-hidden"
        onMouseDown={handleMouseDown}
        style={{ 
          cursor: isDragging ? 'grabbing' : 'grab',
          maxWidth: '100%'
        }}
      >
        <div className="flex justify-between items-center mb-3 select-none overflow-hidden">
          <h2 className="text-base font-semibold text-gray-800 truncate">Załaduj plik Excel</h2>
          <button
            onClick={handleClose}
            className="text-red-500 focus:outline-none flex-shrink-0 ml-2"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-2 overflow-hidden">
          <div>
            <div className="relative mt-8">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex items-center gap-3 overflow-hidden">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                  className="px-4 py-1.5 bg-green-50 text-green-700 rounded-md inline-flex items-center hover:bg-green-100 transition-colors font-semibold text-sm cursor-pointer flex-shrink-0"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  Wybierz plik
                </button>
                {file && (
                  <span className="text-sm text-gray-600 font-sora truncate">
                    {file.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2 mt-4 overflow-hidden">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none text-sm cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()}
          >
            Anuluj
          </button>
          <button
            onClick={handleUpload}
            disabled={!file}
            aria-label={file ? 'Załaduj plik' : 'Nie wybrano pliku'}
            className={`px-3 py-1.5 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 text-sm cursor-pointer ${
              file
                ? 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            Załaduj
          </button>
        </div>
      </div>
    </Modal>
  );
}; 