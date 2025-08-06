# 🚀 Ручной деплой на Hostinger

## 📋 Что нужно сделать

### 1. Подготовка файлов
```bash
# Убедитесь, что приложение собрано
npm run build
```

### 2. Загрузка файлов на Hostinger

#### Загрузите React приложение:
```bash
# Загрузите всю папку dist/ на сервер
scp -r dist/* your_username@your_hostinger_server.com:public_html/dist/
```

#### Загрузите серверные файлы:
```bash
# Загрузите обновленный сервер
scp server/index.js your_username@your_hostinger_server.com:public_html/server/
scp server/package.json your_username@your_hostinger_server.com:public_html/server/

# Загрузите шрифты
scp -r server/fonts/* your_username@your_hostinger_server.com:public_html/server/fonts/

# Загрузите загруженные файлы
scp -r server/uploads/* your_username@your_hostinger_server.com:public_html/server/uploads/
```

#### Загрузите конфигурацию:
```bash
# Загрузите основной package.json
scp package.json your_username@your_hostinger_server.com:public_html/
```

### 3. Установка зависимостей на сервере
```bash
# Подключитесь к серверу
ssh your_username@your_hostinger_server.com

# Перейдите в папку сервера
cd public_html/server

# Установите зависимости
npm install --production
```

### 4. Перезапуск сервера
```bash
# Если используете PM2
pm2 restart enoterra_erp

# Или запустите вручную
node index.js
```

## ⚠️ Важные моменты

1. **НЕ загружайте локальную базу данных** на сервер
2. **Сделайте резервную копию** продакшен БД перед деплоем
3. **Проверьте логи** после деплоя

## 🔍 Проверка после деплоя

1. Откройте https://erp.enoterra.pl
2. Проверьте, что React приложение загружается
3. Проверьте API: https://erp.enoterra.pl/api/health
4. Проверьте логи сервера

## 🆘 Если что-то не работает

1. Проверьте логи: `pm2 logs enoterra_erp`
2. Проверьте статус: `pm2 status enoterra_erp`
3. Восстановите БД из резервной копии при необходимости 