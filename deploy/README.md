# Инструкция по развертыванию на продакшене

## 1. Загрузите файлы на GitHub
```bash
git add .
git commit -m "Build for production deployment"
git push origin main
```

## 2. На Hostinger:
1. Скачайте файлы из GitHub
2. Загрузите содержимое папки 'deploy' в корень вашего хостинга
3. Убедитесь, что структура выглядит так:
   ```
   /var/www/erp.enoterra.pl/
   ├── index.html
   ├── assets/
   └── server/
       ├── index.js
       └── package.json
   ```

## 3. Запустите Node.js сервер:
```bash
cd server
npm install --omit=dev
npm start
```

## 4. Настройте домен на папку с файлами

Готово! Ваш сайт будет доступен по адресу https://erp.enoterra.pl/

**Примечание:** Убедитесь, что Node.js поддерживается вашим хостингом.
