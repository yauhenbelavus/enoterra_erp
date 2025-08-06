import React, { useState, useRef, useEffect } from 'react';
import { Eye, X, Edit } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from 'react-modal';
import { ClientDetailsModal } from './ClientDetailsModal';
import { EditClientModal } from './EditClientModal';

interface Client {
  id: number;
  firma: string;
  nazwa: string;
  adres: string;
  czasDostawy: string;
  kontakt: string;
}

interface ClientsListProps {
  clients: Client[];
  onDelete: (id: number) => void;
  onEdit: (client: Client) => void;
  onUpdate: (data: {
    id: number;
    firma: string;
    nazwa: string;
    adres: string;
    czasDostawy: string;
    kontakt: string;
  }) => void;
}

export const ClientsList: React.FC<ClientsListProps> = ({ clients, onDelete, onEdit, onUpdate }) => {
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
  const [sortField, setSortField] = useState<string>('firma');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Если клиенты не загружены, показываем сообщение
  if (!clients || clients.length === 0) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="text-gray-500">Brak klientów do wyświetlenia</div>
      </div>
    );
  }

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
        toast.success('Klient został usunięty');
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

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
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

  // Сортировка клиентов
  const sortedClients = clients.sort((a, b) => {
    let aValue: any;
    let bValue: any;
    
    switch (sortField) {
      case 'firma':
        aValue = (a.firma || '').toLowerCase();
        bValue = (b.firma || '').toLowerCase();
        break;
      case 'nazwa':
        aValue = (a.nazwa || '').toLowerCase();
        bValue = (b.nazwa || '').toLowerCase();
        break;
      case 'adres':
        aValue = (a.adres || '').toLowerCase();
        bValue = (b.adres || '').toLowerCase();
        break;
      case 'czasDostawy':
        aValue = (a.czasDostawy || '').toLowerCase();
        bValue = (b.czasDostawy || '').toLowerCase();
        break;
      case 'kontakt':
        aValue = (a.kontakt || '').toLowerCase();
        bValue = (b.kontakt || '').toLowerCase();
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
    return 0;
  });

  return (
    <div className="space-y-4">
      <div className="w-full overflow-y-auto max-h-96">
        <table className="w-full">
          <thead>
            <tr>
              <th 
                className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('firma')}
              >
                Nazwa firmy
              </th>
              <th 
                className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('nazwa')}
              >
                Nazwa
              </th>
              <th 
                className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('adres')}
              >
                Adres
              </th>
              <th 
                className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('czasDostawy')}
              >
                Czas dostawy
              </th>
              <th 
                className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('kontakt')}
              >
                Kontakt
              </th>
              <th className="sticky top-0 z-1 bg-gray-50 px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b-0 font-sora">
                
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedClients.map((client) => (
              <tr key={client.id} className="hover:bg-gray-50">
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
                  {client.czasDostawy}
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