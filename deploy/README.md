# Инструкция по развертыванию на продакшене

## 1. Загрузите файлы на GitHub
```bash
git add .
git commit -m "Build for production deployment"
git push origin main
```

## 2. На Hostinger:
1. Скачайте файлы из GitHub
2. **ВАЖНО:** Загрузите **содержимое** папки 'deploy' в корень вашего хостинга
3. **НЕ загружайте саму папку deploy!**
4. Убедитесь, что структура выглядит так:
   ```
   /var/www/erp.enoterra.pl/
   ├── index.html
   ├── assets/
   │   ├── index-7OiwKH9e.css
   │   ├── index-tet9MuDr.js
   │   └── entr logo copy 2@4x-xuoIprT_.png
   └── server/
       ├── index.js
       ├── package.json
       ├── fonts/
       └── uploads/
   ```

## 3. Запустите Node.js сервер:
```bash
cd server
npm install --omit=dev
npm start
```

## 4. Настройте домен на папку с файлами

Готово! Ваш сайт будет доступен по адресу https://erp.enoterra.pl/

## ⚠️ Важные замечания:
- **Порт:** 80 (стандартный HTTP)
- **База данных:** SQLite создается автоматически
- **Фронтенд:** React + Vite (собран для продакшена)
- **Excel поддержка:** включена (xlsx)
- **PDF генерация:** работает (pdf-lib)

**Примечание:** Убедитесь, что Node.js поддерживается вашим хостингом.
