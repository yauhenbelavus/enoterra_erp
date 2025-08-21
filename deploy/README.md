# Инструкция по развертыванию

## 1. Загрузите файлы на GitHub
```bash
git add .
git commit -m "Build for deployment"
git push origin main
```

## 2. На Hostinger:
1. Скачайте файлы из GitHub
2. Загрузите папку 'deploy' в корень вашего хостинга
3. Переименуйте 'deploy' в корневую папку сайта

## 3. Запустите Node.js сервер:
```bash
cd server
npm install
npm start
```

## 4. Настройте домен на папку с файлами

Готово! Ваш сайт будет доступен по адресу вашего домена.
