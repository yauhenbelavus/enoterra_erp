import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';
import { X } from 'lucide-react';

interface Client {
  id: number;
  firma: string;
  nazwa: string;
  adres: string;
  czas_dostawy: string;
  kontakt: string;
}

interface EditClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    id: number;
    firma: string;
    nazwa: string;
    adres: string;
    czas_dostawy: string;
    kontakt: string;
  }) => void;
  client: Client | null;
}

export const EditClientModal: React.FC<EditClientModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  client
}) => {
  const [firma, setFirma] = useState('');
  const [nazwa, setNazwa] = useState('');
  const [adres, setAdres] = useState('');
  const [czas_dostawy, setCzasDostawy] = useState('');
  const [kontakt, setKontakt] = useState('');

  // Инициализация данных при открытии модального окна
  useEffect(() => {
    if (isOpen && client) {
      setFirma(client.firma || '');
      setNazwa(client.nazwa || '');
      setAdres(client.adres || '');
      setCzasDostawy(client.czas_dostawy || '');
      setKontakt(client.kontakt || '');
    } else {
      setFirma('');
      setNazwa('');
      setAdres('');
      setCzasDostawy('');
      setKontakt('');
    }
  }, [isOpen, client]);

  const handleSubmit = async () => {
    if (firma.trim() && nazwa.trim() && adres.trim() && czas_dostawy.trim() && kontakt.trim() && client) {
      const submitData = {
        id: client.id,
        firma,
        nazwa,
        adres,
        czas_dostawy,
        kontakt
      };
      
      onSubmit(submitData);
      handleClose();
    }
  };

  const handleClose = () => {
    setFirma('');
    setNazwa('');
    setAdres('');
    setCzasDostawy('');
    setKontakt('');
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
          transform: 'translate(-50%, -50%)',
          margin: '0',
          borderRadius: '0.5rem',
          background: 'white',
          overflow: 'hidden',
          outline: 'none',
          padding: '24px',
          fontFamily: 'Sora',
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
      <div className="font-sora h-full flex flex-col overflow-hidden">
        <div className="flex justify-between items-center mb-8 select-none">
          <h2 className="text-base font-semibold text-gray-800">Edytowanie klienta</h2>
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
                value={czas_dostawy}
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
            disabled={!firma.trim() || !nazwa.trim() || !adres.trim() || !czas_dostawy.trim() || !kontakt.trim()}
            className={`px-6 py-1.5 text-white text-xs rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-sora ${
              !firma.trim() || !nazwa.trim() || !adres.trim() || !czas_dostawy.trim() || !kontakt.trim()
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            Zapisz
          </button>
        </div>
      </div>
    </Modal>
  );
}; 