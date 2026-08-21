import React, { useState, useRef, useEffect } from 'react';
import { Eye, X, Edit } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from 'react-modal';
import { ClientDetailsModal } from './ClientDetailsModal';
import { EditClientModal } from './EditClientModal';
import { SortIndicator } from './SortIndicator';
import { compareClients, useTableSort } from '../utils/tableSort';

interface Client {
  id: number;
  firma: string;
  nazwa: string;
  adres: string;
  czas_dostawy: string;
  kontakt: string;
}

interface ClientsListProps {
  clients: Client[];
  onDelete: (id: number) => void;
  onUpdate: (data: {
    id: number;
    firma: string;
    nazwa: string;
    adres: string;
    czas_dostawy: string;
    kontakt: string;
  }) => void;
}

export const ClientsList: React.FC<ClientsListProps> = ({ clients, onDelete, onUpdate }) => {
  console.log('🔍 ClientsList render - clients:', clients);
  console.log('🔍 ClientsList render - clients length:', clients.length);
  console.log('🔍 ClientsList render - first client:', clients[0]);
  console.log('🔍 ClientsList render - all clients:', clients.map(c => ({ id: c.id, firma: c.firma, nazwa: c.nazwa })));
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [password, setPassword] = useState('');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const { sortField, sortDirection, handleSort, clearSort, sortedItems: sortedClients } = useTableSort(
    clients,
    {
      defaultField: '',
      defaultDirection: 'asc',
      compareItems: compareClients,
    }
  );

  const handleViewDetails = (client: Client) => {
    setSelectedClient(client);
    setIsDetailsModalOpen(true);
  };

  const handleEdit = (client: Client) => {
    setClientToEdit(client);
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (client: Client) => {
    setClientToDelete(client);
    setIsPasswordModalOpen(true);
    setPassword('');
  };

  const handlePasswordSubmit = () => {
    if (password === '5202') {
      if (clientToDelete?.id) {
        onDelete(clientToDelete.id);
      }
      handlePasswordClose();
    } else {
      toast.error('Nieprawidłowe hasło');
      setPassword('');
    }
  };

  const handlePasswordClose = () => {
    setIsPasswordModalOpen(false);
    setClientToDelete(null);
    setPassword('');
    setPosition({ x: 0, y: 0 });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePasswordSubmit();
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || 
        (e.target as HTMLElement).closest('input')) {
      return;
    }
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

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="space-y-4">
      <div className="w-full overflow-y-scroll max-h-[calc(100dvh-280px)] relative">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th 
                className={`px-8 py-4 text-left text-xs font-bold uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 ${
                  sortField === 'firma' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-gray-50 text-gray-700'
                }`}
                onClick={() => handleSort('firma')}
              >
                <div className="flex items-center gap-1">
                  Nazwa firmy
                  <SortIndicator field="firma" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className={`px-8 py-4 text-left text-xs font-bold uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 ${
                  sortField === 'nazwa' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-gray-50 text-gray-700'
                }`}
                onClick={() => handleSort('nazwa')}
              >
                <div className="flex items-center gap-1">
                  Nazwa
                  <SortIndicator field="nazwa" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('adres')}
              >
                <div className="flex items-center gap-1">
                  Adres
                  <SortIndicator field="adres" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('czas_dostawy')}
              >
                <div className="flex items-center gap-1">
                  Czas dostawy
                  <SortIndicator field="czas_dostawy" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th 
                className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora cursor-pointer hover:bg-gray-100 bg-gray-50"
                onClick={() => handleSort('kontakt')}
              >
                <div className="flex items-center gap-1">
                  Kontakt
                  <SortIndicator field="kontakt" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
                {sortField && (
                  <button
                    onClick={clearSort}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-300 hover:border-gray-400"
                    title="Сбросить сортировку"
                  >
                    Сброс
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedClients.map((client, index) => (
              <tr key={client.id || `client-${index}`} className="hover:bg-gray-50">
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {client.firma}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {client.nazwa}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {client.adres}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {client.czas_dostawy}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  {client.kontakt}
                </td>
                <td className="px-8 py-3 text-left text-sm text-gray-600 font-sora">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); handleViewDetails(client); }}
                      className="text-blue-600 hover:text-blue-800 focus:outline-none"
                      title="Zobacz szczegóły"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { 
                        e.preventDefault(); 
                        e.stopPropagation(); 
                        handleEdit(client); 
                      }}
                      className="text-green-600 hover:text-green-800 focus:outline-none"
                      title="Edytuj"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteClick(client); }}
                      className="text-red-600 hover:text-red-800 focus:outline-none"
                      title="Usuń"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Модальное окно для ввода пароля */}
      <Modal
        isOpen={isPasswordModalOpen}
        onRequestClose={handlePasswordClose}
        style={{
          content: {
            width: '400px',
            height: '200px',
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
            userSelect: 'none',
            zIndex: 9999
          },
          overlay: {
            backgroundColor: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }
        }}
      >
        <div 
          className="font-sora h-full flex flex-col overflow-hidden"
          onMouseDown={handleMouseDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <div className="flex justify-between items-center mb-8 select-none">
            <h2 className="text-base font-semibold text-gray-800">Hasło</h2>
            <button
              onClick={handlePasswordClose}
              className="text-red-500 focus:outline-none"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-6 flex-grow">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Wprowadź hasło"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                autoFocus
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 mt-6">
            <button
              onClick={handlePasswordClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 focus:outline-none text-sm"
            >
              Anuluj
            </button>
            <button
              onClick={handlePasswordSubmit}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none text-sm"
            >
              Usuń
            </button>
          </div>
        </div>
      </Modal>

      <ClientDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        client={selectedClient}
      />

      {/* Модальное окно для редактирования клиента */}
      <EditClientModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setClientToEdit(null);
        }}
        onSubmit={(data) => {
          onUpdate(data);
          setIsEditModalOpen(false);
          setClientToEdit(null);
        }}
        client={clientToEdit}
      />
    </div>
  );
}; 