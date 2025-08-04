#!/bin/bash

# Скрипт для настройки сервера Hostinger
# Запускать один раз при первом деплое

echo "🚀 Настройка сервера Hostinger..."

# Создаем папку для логов
mkdir -p ~/logs

# Устанавливаем PM2 глобально (если не установлен)
if ! command -v pm2 &> /dev/null; then
    echo "📦 Установка PM2..."
    npm install -g pm2
fi

# Переходим в папку проекта
cd ~/public_html

# Устанавливаем зависимости
echo "📦 Установка зависимостей..."
npm install --production
cd server && npm install --production
cd ..

# Создаем базу данных (если не существует)
if [ ! -f "server/enoterra_erp.db" ]; then
    echo "🗄️ Создание базы данных..."
    cd server && node clean_database.mjs
    cd ..
fi

# Запускаем миграции
echo "🔄 Запуск миграций..."
cd server && node database_migrations.mjs
cd ..

# Запускаем приложение через PM2
echo "🚀 Запуск приложения..."
pm2 start ecosystem.config.js

# Сохраняем конфигурацию PM2
pm2 save

# Настраиваем автозапуск PM2
pm2 startup

echo "✅ Настройка сервера завершена!"
echo "📊 Статус приложения:"
pm2 status 