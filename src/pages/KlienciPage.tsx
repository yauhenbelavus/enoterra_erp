import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { ClientModal } from '../components/ClientModal';
import { ClientsList } from '../components/ClientsList';
import { ClientSalesList } from '../components/ClientSalesList';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

interface Client {
  id: number;
  firma: string;
  nazwa: string;
  adres: string;
  czas_dostawy: string;
  kontakt: string;
}

interface KlienciPageProps {
  activeSubTab: string | null;
  setActiveSubTab: (tab: 'baza_klientow' | 'sprzedaz_klientom') => void;
  clients: Client[];
  onClientsChange: (clients: Client[]) => void;
  invoicesRefreshTrigger: number;
}

const loadClientsFromDb = async (): Promise<Client[]> => {
  try {
    const response = await fetch(`${API_URL}/api/clients`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('❌ Error loading clients:', error);
    return [];
  }
};

export const KlienciPage: React.FC<KlienciPageProps> = ({
  activeSubTab,
  setActiveSubTab,
  clients,
  onClientsChange,
  invoicesRefreshTrigger,
}) => {
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clientsRefreshTrigger, setClientsRefreshTrigger] = useState(0);
  const [lastUpdatedClientId, setLastUpdatedClientId] = useState<number | null>(null);

  const handleAddClient = async (clientData: {
    firma: string;
    nazwa: string;
    adres: string;
    czas_dostawy: string;
    kontakt: string;
  }) => {
    try {
      const response = await fetch(`${API_URL}/api/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(clientData),
      });

      if (!response.ok) {
        throw new Error('Failed to add client');
      }

      const result = await response.json();
      onClientsChange([...clients, { ...clientData, id: result.id }]);
      setClientsRefreshTrigger(prev => prev + 1);
      toast.success('Klient został dodany');
    } catch (error) {
      console.error('Error adding client:', error);
      toast.error('Błąd podczas dodawania klienta');
    }
  };

  const handleDeleteClient = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/api/clients/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete client');
      }

      onClientsChange(clients.filter(client => client.id !== id));
      setClientsRefreshTrigger(prev => prev + 1);
      toast.success('Klient został usunięty');
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error('Błąd podczas usuwania klienta');
    }
  };

  const handleUpdateClient = async (data: {
    id: number;
    firma: string;
    nazwa: string;
    adres: string;
    czas_dostawy: string;
    kontakt: string;
  }) => {
    try {
      const response = await fetch(`${API_URL}/api/clients/${data.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to update client');
      }

      const updatedClient = await response.json();
      onClientsChange(
        clients.map(client => {
          if (client.id === data.id) {
            return {
              id: client.id,
              firma: updatedClient.firma || client.firma,
              nazwa: updatedClient.nazwa || client.nazwa,
              adres: updatedClient.adres || client.adres,
              czas_dostawy: updatedClient.czas_dostawy || client.czas_dostawy,
              kontakt: updatedClient.kontakt || client.kontakt,
            };
          }
          return { ...client };
        })
      );

      toast.success('Klient został zaktualizowany');

      setTimeout(() => {
        setClientsRefreshTrigger(prev => prev + 1);
        setLastUpdatedClientId(data.id);
        loadClientsFromDb().then(freshClients => {
          onClientsChange(freshClients);
          setClientsRefreshTrigger(prev => prev + 1);
        });
      }, 100);
    } catch (error) {
      console.error('Error updating client:', error);
      toast.error('Błąd podczas aktualizacji klienta');
    }
  };

  return (
    <>
      <ClientModal
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        onAdd={handleAddClient}
      />

      <div className="flex flex-col gap-4 mt-4 w-full relative">
        <div className="flex">
          <button
            onClick={() => setActiveSubTab('baza_klientow')}
            className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
              activeSubTab === 'baza_klientow'
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Baza klientów
          </button>
          <button
            onClick={() => setActiveSubTab('sprzedaz_klientom')}
            className={`px-4 py-2 text-sm font-medium font-sora transition-colors ${
              activeSubTab === 'sprzedaz_klientom'
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Sprzedaż klientom
          </button>
        </div>

        {activeSubTab === 'baza_klientow' && (
          <div className="flex flex-col gap-4 mt-6">
            <div className="flex items-center gap-4">
              <div
                className="inline-flex items-center cursor-pointer border border-transparent rounded-md px-2 py-1 hover:bg-gray-50 hover:border-gray-200 bg-white w-fit"
                onClick={() => setIsClientModalOpen(true)}
              >
                <button
                  type="button"
                  className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white"
                  title="Dodaj"
                >
                  <Plus size={16} />
                </button>
                <div className="px-2">
                  <span className="text-gray-900 font-sora text-[13px]">Dodaj klienta</span>
                </div>
              </div>
            </div>
            <ClientsList
              key={`clients-${clientsRefreshTrigger}-${lastUpdatedClientId || 'none'}`}
              clients={clients}
              onDelete={handleDeleteClient}
              onUpdate={handleUpdateClient}
            />
          </div>
        )}

        {activeSubTab === 'sprzedaz_klientom' && (
          <div className="flex flex-col gap-4 mt-6">
            <ClientSalesList refreshTrigger={invoicesRefreshTrigger} />
          </div>
        )}
      </div>
    </>
  );
};
