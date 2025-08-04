import React from 'react';
import Modal from 'react-modal';

interface ReplaceFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  fileName: string;
}

export const ReplaceFileModal: React.FC<ReplaceFileModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  fileName
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={{
        content: {
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '280px',
          height: '120px',
          margin: '0',
          padding: '16px',
          borderRadius: '4px',
          background: 'white',
          outline: 'none'
        },
        overlay: {
          backgroundColor: 'rgba(0, 0, 0, 0.5)'
        }
      }}
    >
      <div className="h-full flex items-center justify-between">
        <p className="text-xs text-gray-600 mr-3 truncate max-w-[150px]">
          Zastąpić "{fileName}"?
        </p>
        <div className="flex space-x-2 shrink-0">
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
          >
            Anuluj
          </button>
          <button
            onClick={onConfirm}
            className="px-2 py-1 text-xs text-white bg-blue-500 rounded hover:bg-blue-600"
          >
            Zastąp
          </button>
        </div>
      </div>
    </Modal>
  );
}; 