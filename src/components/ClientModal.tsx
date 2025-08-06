import React, { useState, useEffect, useRef } from 'react';
import Modal from 'react-modal';
import { X } from 'lucide-react';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (clientData: { 
    firma: string; 
    nazwa: string; 
    adres: string; 
    czasDostawy: string; 
    kontakt: string 
  }) => void;
  initialData?: { 
    id: number; 
    firma: string; 
    nazwa: string; 
    adres: string; 
    czasDostawy: string; 
    kontakt: string 
  };
  isEditMode?: boolean;
}

export const ClientModal: React.FC<ClientModalProps> = ({ 
  isOpen, 
  onClose, 
  onAdd, 
  initialData, 
  isEditMode = false 
}) => {
  const [firma, setFirma] = useState('');
  const [nazwa, setNazwa] = useState('');
  const [adres, setAdres] = useState('');
  const [czasDostawy, setCzasDostawy] = useState('');
  const [kontakt, setKontakt] = useState('');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (isOpen && initialData) {
      setFirma(initialData.firma);
      setNazwa(initialData.nazwa);
      setAdres(initialData.adres);
      setCzasDostawy(initialData.czasDostawy);
      setKontakt(initialData.kontakt);
    } else if (isOpen && !initialData) {
      setFirma('');
      setNazwa('');
      setAdres('');
      setCzasDostawy('');
      setKontakt('');
    }
  }, [isOpen, initialData]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  const handleSubmit = () => {
    if (firma.trim() && nazwa.trim() && adres.trim() && czasDostawy.trim() && kontakt.trim()) {
      onAdd({
        firma,
        nazwa,
        adres,
        czasDostawy,
        kontakt
      });
      handleClose();
    }
  };

  const handleClose = () => {
    setFirma('');
    setNazwa('');
    setAdres('');
    setCzasDostawy('');
    setKontakt('');
    setPosition({ x: 0, y: 0 });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      style={{
        content: {
          width: '600px',
          height: '500px',
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
          <h2 className="text-base font-semibold text-gray-800">Dodaj klienta</h2>
          <button
            onClick={handleClose}
            className="text-red-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 flex-grow">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Nazwa firmy
              </label>
              <input
                type="text"
                value={firma}
                onChange={(e) => setFirma(e.target.value)}
                placeholder="Wprowadź nazwę firmy"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Nazwa
              </label>
              <input
                type="text"
                value={nazwa}
                onChange={(e) => setNazwa(e.target.value)}
                placeholder="Wprowadź nazwę"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Adres
              </label>
              <input
                type="text"
                value={adres}
                onChange={(e) => setAdres(e.target.value)}
                placeholder="Wprowadź adres"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Czas dostawy
              </label>
              <input
                type="text"
                value={czasDostawy}
                onChange={(e) => setCzasDostawy(e.target.value)}
                placeholder="Wprowadź czas dostawy"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                Kontakt
              </label>
              <input
                type="text"
                value={kontakt}
                onChange={(e) => setKontakt(e.target.value)}
                placeholder="Wprowadź kontakt"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
              />
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            onClick={handleSubmit}
            disabled={!firma.trim() || !nazwa.trim() || !adres.trim() || !czasDostawy.trim() || !kontakt.trim()}
            className={`px-6 py-1.5 text-white text-xs rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-sora ${
              !firma.trim() || !nazwa.trim() || !adres.trim() || !czasDostawy.trim() || !kontakt.trim()
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            Dodaj
          </button>
        </div>

      </div>
    </Modal>
  );
}; 