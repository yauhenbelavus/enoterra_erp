#!/bin/bash

echo "🚀 Автоматический запуск Enoterra ERP..."

# Перейти в папку приложения
cd /home/$USER/enoterra_erp

# Проверить, что папка существует
if [ ! -d "/home/$USER/enoterra_erp" ]; then
    echo "❌ Папка приложения не найдена!"
    exit 1
fi

# Установить зависимости
echo "📦 Устанавливаем зависимости..."
npm install --production
cd server && npm install --production && cd ..

# Создать папку для логов
mkdir -p logs

# Инициализировать базу данных если нужно
if [ ! -f "server/enoterra_erp.db" ]; then
    echo "🗄️ Инициализируем базу данных..."
    if [ -f "server/clean_database.mjs" ]; then
        cd server && node clean_database.mjs && cd ..
    fi
fi

# Запустить миграции
if [ -f "server/database_migrations.mjs" ]; then
    echo "🔄 Запускаем миграции..."
    cd server && node database_migrations.mjs && cd ..
fi

# Остановить существующий процесс
pm2 stop enoterra_erp 2>/dev/null || true
pm2 delete enoterra_erp 2>/dev/null || true

# Запустить приложение
echo "⚡ Запускаем приложение..."
pm2 start ecosystem.config.js
pm2 save

echo "✅ Приложение запущено!"
echo "🌐 Доступно по адресу: https://erp.enoterra.pl"
echo "📊 Статус:"
pm2 status 