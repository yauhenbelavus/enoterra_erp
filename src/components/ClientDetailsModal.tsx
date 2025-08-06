import React from 'react';
import Modal from 'react-modal';
import { X } from 'lucide-react';

interface Client {
  id: number;
  firma: string;
  nazwa: string;
  adres: string;
  czasDostawy: string;
  kontakt: string;
}

interface ClientDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
}

export const ClientDetailsModal: React.FC<ClientDetailsModalProps> = ({ isOpen, onClose, client }) => {
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStartPos = React.useRef({ x: 0, y: 0 });

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStartPos.current.x,
          y: e.clientY - dragStartPos.current.y
        });
      }
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  if (!client) return null;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={{
        content: {
          width: '420px',
          height: '288px',
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
          padding: '16px',
          fontFamily: 'Sora',
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
          <h2 className="text-base font-semibold text-gray-800">Szczegóły klienta</h2>
          <button
            onClick={onClose}
            className="text-red-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-6 flex-grow overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
            <div className="flex items-center">
              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Nazwa firmy</label>
              <div className="text-xs text-gray-900 ml-2">{client.firma}</div>
            </div>
            <div className="flex items-center">
              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Nazwa</label>
              <div className="text-xs text-gray-900 ml-2">{client.nazwa}</div>
            </div>
            <div className="flex items-center">
              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Adres</label>
              <div className="text-xs text-gray-900 ml-2">{client.adres}</div>
            </div>
            <div className="flex items-center">
              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Czas dostawy</label>
              <div className="text-xs text-gray-900 ml-2">{client.czasDostawy}</div>
            </div>
            <div className="flex items-center">
              <label className="block text-xs font-bold text-gray-700 font-sora w-32">Kontakt</label>
              <div className="text-xs text-gray-900 ml-2">{client.kontakt}</div>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
        >
          Zamknij
        </button>
      </div>
    </Modal>
  );
}; 