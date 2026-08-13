// Функции для управления модальными окнами

/**
 * Открывает модальное окно Excel
 * @param setIsExcelModalOpen - функция для установки состояния модала
 * @returns возвращает true для подтверждения открытия
 */
export const openExcelModal = (setIsExcelModalOpen: (value: boolean) => void): boolean => {
  setIsExcelModalOpen(true);
  return true; // Возвращаем значение для тестирования
};

/**
 * Закрывает модальное окно Excel
 * @param setIsExcelModalOpen - функция для установки состояния модала
 * @returns возвращает false для подтверждения закрытия
 */
export const closeExcelModal = (setIsExcelModalOpen: (value: boolean) => void): boolean => {
  setIsExcelModalOpen(false);
  return false; // Возвращаем значение для тестирования
};

/**
 * Переключает состояние модального окна Excel
 * @param setIsExcelModalOpen - функция для установки состояния модала
 * @param currentState - текущее состояние модала
 * @returns возвращает новое состояние
 */
export const toggleExcelModal = (setIsExcelModalOpen: (value: boolean) => void, currentState: boolean): boolean => {
  const newState = !currentState;
  setIsExcelModalOpen(newState);
  return newState; // Возвращаем новое состояние для тестирования
};

