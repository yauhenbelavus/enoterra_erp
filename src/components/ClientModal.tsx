import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';
import { X } from 'lucide-react';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (clientData: { 
    firma: string; 
    nazwa: string; 
    adres: string; 
    czas_dostawy: string; 
    kontakt: string 
  }) => void;
  initialData?: { 
    id: number; 
    firma: string; 
    nazwa: string; 
    adres: string; 
    czas_dostawy: string; 
    kontakt: string 
  };
}

export const ClientModal: React.FC<ClientModalProps> = ({ 
  isOpen, 
  onClose, 
  onAdd, 
  initialData
}) => {
  const [firma, setFirma] = useState('');
  const [nazwa, setNazwa] = useState('');
  const [adres, setAdres] = useState('');
  const [czas_dostawy, setCzasDostawy] = useState('');
  const [kontakt, setKontakt] = useState('');

  useEffect(() => {
    console.log('🔍 useEffect triggered:', { isOpen, initialData });
    
    if (isOpen && initialData) {
      console.log('🔍 Setting initial data from props');
      setFirma(initialData.firma);
      setNazwa(initialData.nazwa);
      setAdres(initialData.adres);
      setCzasDostawy(initialData.czas_dostawy);
      setKontakt(initialData.kontakt);
    } else if (isOpen && !initialData) {
      console.log('🔍 Modal opened without initial data - keeping current values');
      // Не сбрасываем поля, оставляем текущие значения
    }
  }, [isOpen, initialData]);

  const handleSubmit = () => {
    console.log('🔍 handleSubmit called with values:', { firma, nazwa, adres, czas_dostawy, kontakt });
    console.log('🔍 Trimmed values:', { 
      firma: firma.trim(), 
      nazwa: nazwa.trim(), 
      adres: adres.trim(), 
      czas_dostawy: czas_dostawy.trim(), 
      kontakt: kontakt.trim() 
    });
    
    if (!firma.trim() || !nazwa.trim() || !adres.trim() || !czas_dostawy.trim() || !kontakt.trim()) {
      console.log('❌ Validation failed: some fields are empty');
      return;
    }

    const clientData = {
      firma: firma.trim(),
      nazwa: nazwa.trim(),
      adres: adres.trim(),
      czas_dostawy: czas_dostawy.trim(),
      kontakt: kontakt.trim()
    };

    console.log('✅ Submitting client data:', clientData);
    onAdd(clientData);
    handleClose();
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
      <div 
        className="font-sora h-full flex flex-col overflow-hidden"
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
                  onChange={(e) => {
                    console.log('🔍 firma onChange:', e.target.value);
                    setFirma(e.target.value);
                  }}
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
            Dodaj
          </button>
        </div>

      </div>
    </Modal>
  );
}; 