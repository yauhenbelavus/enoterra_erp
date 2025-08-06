import React from 'react';
import Modal from 'react-modal';
import { Product } from '../types/Product';
import { X } from 'lucide-react';

interface ProductDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

export const ProductDetailsModal: React.FC<ProductDetailsModalProps> = ({ isOpen, onClose, product }) => {
  if (!product) return null;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="fixed inset-0 flex items-center justify-center p-4 bg-black bg-opacity-50"
      overlayClassName="fixed inset-0"
    >
      <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X size={24} />
        </button>
        <h2 className="text-xl font-semibold mb-4">Детали товара</h2>
        <div className="space-y-2">
          <p><strong>Код:</strong> {product.kod}</p>
          <p><strong>Название:</strong> {product.nazwa}</p>
          <p><strong>Количество:</strong> {product.ilosc}</p>
          <p><strong>Ед. измерения:</strong> {product.jednostka_miary}</p>
          <p><strong>Штрихкод:</strong> {product.kod_kreskowy}</p>
          {product.data_waznosci && <p><strong>Срок годности:</strong> {product.data_waznosci}</p>}
          {product.waga_netto && <p><strong>Вес нетто:</strong> {product.waga_netto} кг</p>}
          {product.waga_brutto && <p><strong>Вес брутто:</strong> {product.waga_brutto} кг</p>}
          {product.objetosc && <p><strong>Объем:</strong> {product.objetosc} л</p>}
          {product.opis && <p><strong>Описание:</strong> {product.opis}</p>}
        </div>
      </div>
    </Modal>
  );
}; 