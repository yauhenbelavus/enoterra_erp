import React, { useState, useEffect } from 'react';
 import { X } from 'lucide-react';
import Modal from 'react-modal';
import DatePicker, { registerLocale } from 'react-datepicker';
import { pl } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import "../components/DatePicker.css";
import toast from 'react-hot-toast';

registerLocale('pl', pl);

   interface ReturnProduct {
    nazwa: string;
    ilosc: number;
    original_ilosc: number; // Оригинальное количество из заказа
    powod_zwrotu: string;
  }

 interface ReturnModalProps {
   isOpen: boolean;
   onClose: () => void;
   onSubmit: (data: {
     klient: string;
     data_zwrotu: Date;
     products: ReturnProduct[];
   }) => void;
 }

 export const ReturnModal: React.FC<ReturnModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [productRows, setProductRows] = useState<ReturnProduct[]>([
    { nazwa: '', ilosc: 0, original_ilosc: 0, powod_zwrotu: '' }
  ]);
  const [products, setProducts] = useState<any[]>([]);
  const [, setFieldsWithErrors] = useState<Set<number>>(new Set());
  const [isOrderLoading, setIsOrderLoading] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [klient, setKlient] = useState('');
  const [isOrderSelected, setIsOrderSelected] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  

  

  

  

     // Эффект для автоматического поиска заказов
   useEffect(() => {
     const searchOrders = async () => {
       if (orderNumber.trim().length < 2 || isOrderSelected) {
         setProducts([]);
         return;
       }

       setIsOrderLoading(true);
       try {
         const response = await fetch(`/api/orders/search?numer_zamowienia=${encodeURIComponent(orderNumber)}`);
         if (!response.ok) throw new Error('Failed to fetch orders');
         const ordersData = await response.json();
         
         if (ordersData && ordersData.length > 0) {
           // Показываем найденные заказы в выпадающем списке
           const formattedOrders = ordersData.map((order: any) => ({
             id: order.id,
             nazwa: `Zamówienie: ${order.numer_zamowienia}`,
             kod: order.klient,
             klient: order.klient,
             numer_zamowienia: order.numer_zamowienia,
             products: order.products || []
           }));
           setProducts(formattedOrders);
         } else {
           setProducts([]);
         }
       } catch (error) {
         console.error('Error searching orders:', error);
         setProducts([]);
       } finally {
         setIsOrderLoading(false);
       }
     };

     const timeoutId = setTimeout(searchOrders, 300);
     return () => clearTimeout(timeoutId);
   }, [orderNumber, isOrderSelected]);



                       const handleProductSelect = (product: any, rowIndex: number) => {
       // Если это заказ (есть numer_zamowienia), то заполняем данные заказа
       if (product.numer_zamowienia) {
         // Устанавливаем клиента
         setKlient(product.klient);
         
         // Сохраняем ID заказа для восстановления количества
         setSelectedOrderId(product.id);
         
                  // Устанавливаем продукты
                       if (product.products && product.products.length > 0) {
               const returnProducts = product.products.map((prod: any) => ({
                 nazwa: prod.nazwa,
                 ilosc: prod.ilosc,
                 original_ilosc: prod.ilosc,
                 powod_zwrotu: ''
               }));
               setProductRows(returnProducts);
             }
         
         // Очищаем поиск заказов и устанавливаем флаг
         setProducts([]);
         setOrderNumber(product.numer_zamowienia);
         setIsOrderSelected(true);
         
         toast.success('Zamówienie wybrane');
              } else {
                     // Если это обычный продукт (для поиска продуктов)
           const newRows = [...productRows];
           newRows[rowIndex] = {
             ...newRows[rowIndex],
             nazwa: product.nazwa,
             ilosc: 0,
             original_ilosc: 0
           };
           setProductRows(newRows);
        }
     };

     

  

                                                                                               const validateForm = () => {
         const errors = new Set<number>();
         
         productRows.forEach((row, index) => {
           // Проверяем, что количество не превышает количество в заказе
           const originalQuantity = row.original_ilosc;
           const returnQuantity = productRows[index].ilosc;
           
           if (!row.nazwa.trim() || !returnQuantity || returnQuantity <= 0 || !row.powod_zwrotu) {
             errors.add(index);
           } else if (returnQuantity > originalQuantity) {
             errors.add(index);
             toast.error(`Ilość zwrotu (${returnQuantity}) nie może przekraczać ilości w zamówieniu (${originalQuantity})`);
           }
         });
         
         setFieldsWithErrors(errors);
         return errors.size === 0;
       };

  const handleSubmit = async () => {
    if (!validateForm()) {
      toast.error('Proszę wypełnić wszystkie wymagane pola');
      return;
    }

         try {
                               const returnData = {
           klient,
           data_zwrotu: selectedDate,
           products: productRows,
           orderId: selectedOrderId
         };

               // Отправляем данные возврата на сервер
        const response = await fetch('/api/returns', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(returnData)
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create return');
        }

        const result = await response.json();
        console.log('Return created:', result);
        
        onSubmit(returnData);
        toast.success(`Zwrot został utworzony: ${result.numer_zwrotu}`);
        onClose();
       
              // Reset form
        setOrderNumber('');
        setKlient('');
        setIsOrderSelected(false);
        setSelectedOrderId(null);
        setSelectedDate(new Date());
        setProductRows([{ nazwa: '', ilosc: 0, original_ilosc: 0, powod_zwrotu: '' }]);
        setFieldsWithErrors(new Set());
    } catch (error) {
      console.error('Error creating return:', error);
      toast.error('Błąd podczas tworzenia zwrotu');
    }
  };

     const handleClose = () => {
     onClose();
     // Reset form
     setOrderNumber('');
     setKlient('');
     setIsOrderSelected(false);
     setSelectedOrderId(null);
     setSelectedDate(new Date());
     setProductRows([{ nazwa: '', ilosc: 0, original_ilosc: 0, powod_zwrotu: '' }]);
     setFieldsWithErrors(new Set());
   };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      style={{
        content: {
          width: '720px',
          height: '600px',
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
          <h2 className="text-base font-semibold text-gray-800">Zwrot towaru</h2>
          <button
            onClick={handleClose}
            className="text-red-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 flex-grow overflow-y-auto pr-2">
                     <div className="space-y-4">
             <div className="flex flex-wrap gap-4">
               <div className="w-[200px]">
                 <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                   Data zwrotu
                 </label>
                 <DatePicker
                   selected={selectedDate}
                   onChange={(date: Date | null) => setSelectedDate(date || new Date())}
                   locale="pl"
                   dateFormat="dd/MM/yyyy"
                   className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                   placeholderText="Wybierz datę"
                   popperClassName="z-50"
                 />
               </div>
               <div className="w-[200px]">
                 <label className="block text-xs font-medium text-gray-700 mb-2 font-sora">
                   Numer zamówienia
                 </label>
                 <div className="relative">
                   <input
                     type="text"
                     value={orderNumber}
                     onChange={(e) => {
                       setOrderNumber(e.target.value);
                       setIsOrderSelected(false);
                       setSelectedOrderId(null);
                     }}
                     placeholder="Wprowadź numer zamówienia"
                     className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                   />
                   {isOrderLoading && (
                     <div className="absolute right-8 top-1/2 transform -translate-y-1/2">
                       <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                     </div>
                   )}
                   
                   {/* Выпадающий список с найденными заказами */}
                   {products.length > 0 && orderNumber.trim().length >= 2 && (
                     <div className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-40 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm border border-gray-200">
                       {products.map((order) => (
                         <div
                           key={order.id}
                           className="cursor-pointer select-none relative py-1 pl-3 pr-9 hover:bg-blue-50"
                           onClick={() => handleProductSelect(order, -1)}
                         >
                           <div className="flex flex-col">
                             <span className="text-[10px]">{order.nazwa}</span>
                             <span className="text-[10px] text-gray-500">Klient: {order.klient}</span>
                           </div>
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
               </div>
                            </div>
           </div>

                       {/* Поле клиента на зеленом фоне */}
            {klient && (
              <div className="bg-green-50 p-3 rounded-md">
                <div className="flex justify-between items-start">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 flex-1">
                    <div>
                      <p className="font-medium text-gray-900 text-xs">Klient:</p>
                      <p className="text-xs text-gray-900">{klient}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setKlient('')}
                    className="text-gray-500 hover:text-gray-700 ml-4"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}

                         {/* Продукты для возврата */}
             <div className="space-y-2">
               <label className="block text-xs font-medium text-gray-700 font-sora">
                 Produkty do zwrotu
               </label>
               {productRows.map((row, index) => (
                 <div key={index} className="relative">
                   <div className="flex">
                                           {/* Название продукта */}
                      <div className="relative flex-1 max-w-[50%]">
                        <input
                          type="text"
                          value={row.nazwa}
                          readOnly
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs bg-gray-100 text-gray-600"
                          placeholder="Produkt"
                        />
                      </div>

                     

                                                                                       {/* Количество */}
                       <div className="w-20 ml-2">
                                                   <input
                            type="number"
                            min="1"
                            max={row.original_ilosc}
                            value={productRows[index].ilosc || ''}
                            onChange={(e) => {
                              const newRows = [...productRows];
                              const value = e.target.value === '' ? 0 : parseInt(e.target.value) || 0;
                              newRows[index] = { ...newRows[index], ilosc: value };
                              setProductRows(newRows);
                            }}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="ilość"
                          />
                       </div>

                                                                                       {/* Причина возврата */}
                       <div className="w-40 ml-2">
                         <select
                           value={productRows[index].powod_zwrotu}
                           onChange={(e) => {
                             const newRows = [...productRows];
                             newRows[index] = { ...newRows[index], powod_zwrotu: e.target.value };
                             setProductRows(newRows);
                           }}
                           className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none font-sora text-xs"
                         >
                           <option value="">Powód zwrotu</option>
                           <option value="Błąd w zamówieniu">Błąd w zamówieniu</option>
                           <option value="Defekt towaru">Defekt towaru</option>
                           <option value="Niesprzedany towar">Niesprzedany towar</option>
                         </select>
                       </div>
                     
                     {/* Кнопка удаления позиции */}
                     {productRows.length > 1 && (
                       <button
                         onClick={() => {
                           const newRows = productRows.filter((_, i) => i !== index);
                           setProductRows(newRows);
                         }}
                         className="ml-2 text-red-400 hover:text-red-600"
                         title="Usuń pozycję"
                       >
                         <X size={16} />
                       </button>
                     )}
                   </div>
                 </div>
               ))}

               
             </div>
         </div>

                <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            onClick={handleSubmit}
            className="px-6 py-1.5 text-white text-xs rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-sora bg-blue-600 hover:bg-blue-700"
          >
            Utwórz zwrot
          </button>
        </div>
        <div className="absolute bottom-4 right-4">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Anuluj
          </button>
        </div>
      </div>
    </Modal>
  );
};