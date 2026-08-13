// В продакшене используем относительные пути, в разработке - localhost
export const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';
 
export const CONFIG = {
  API_URL,
  // Добавьте другие настройки по мере необходимости
}; 