#!/bin/bash

# Скрипт для загрузки файлов на Hostinger
# Согласно стратегии деплоя из deployment_strategy.md

echo "🚀 Starting Hostinger deployment..."

# Конфигурация
HOSTINGER_USER="your_username"
HOSTINGER_HOST="your_hostinger_server.com"
REMOTE_PATH="public_html"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция для вывода с цветом
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Проверка наличия файлов
echo "📋 Checking required files..."

if [ ! -d "dist" ]; then
    print_error "dist/ folder not found! Please run 'npm run build' first."
    exit 1
fi

if [ ! -f "server/index.js" ]; then
    print_error "server/index.js not found!"
    exit 1
fi

if [ ! -f "server/package.json" ]; then
    print_error "server/package.json not found!"
    exit 1
fi

print_status "All required files found"

# Создание резервной копии продакшен БД
echo ""
echo "📦 Creating backup of production database..."
BACKUP_NAME="backup_production_$(date +%Y%m%d_%H%M%S).db"
scp $HOSTINGER_USER@$HOSTINGER_HOST:$REMOTE_PATH/server/enoterra_erp.db ./$BACKUP_NAME

if [ $? -eq 0 ]; then
    print_status "Backup created: $BACKUP_NAME"
else
    print_warning "Could not create backup (database might not exist yet)"
fi

# Загрузка React приложения (dist folder)
echo ""
echo "📤 Uploading React application (dist folder)..."
scp -r dist/* $HOSTINGER_USER@$HOSTINGER_HOST:$REMOTE_PATH/dist/

if [ $? -eq 0 ]; then
    print_status "React application uploaded successfully"
else
    print_error "Failed to upload React application"
    exit 1
fi

# Загрузка серверных файлов (исключая БД)
echo ""
echo "📤 Uploading server files..."
scp server/index.js $HOSTINGER_USER@$HOSTINGER_HOST:$REMOTE_PATH/server/
scp server/package.json $HOSTINGER_USER@$HOSTINGER_HOST:$REMOTE_PATH/server/

if [ $? -eq 0 ]; then
    print_status "Server files uploaded successfully"
else
    print_error "Failed to upload server files"
    exit 1
fi

# Загрузка шрифтов
echo ""
echo "📤 Uploading fonts..."
scp -r server/fonts/* $HOSTINGER_USER@$HOSTINGER_HOST:$REMOTE_PATH/server/fonts/

if [ $? -eq 0 ]; then
    print_status "Fonts uploaded successfully"
else
    print_warning "Could not upload fonts (folder might not exist)"
fi

# Загрузка загруженных файлов (uploads)
echo ""
echo "📤 Uploading uploaded files..."
scp -r server/uploads/* $HOSTINGER_USER@$HOSTINGER_HOST:$REMOTE_PATH/server/uploads/

if [ $? -eq 0 ]; then
    print_status "Uploaded files transferred successfully"
else
    print_warning "Could not transfer uploaded files (folder might be empty)"
fi

# Загрузка конфигурации
echo ""
echo "📤 Uploading configuration..."
scp package.json $HOSTINGER_USER@$HOSTINGER_HOST:$REMOTE_PATH/

if [ $? -eq 0 ]; then
    print_status "Configuration uploaded successfully"
else
    print_error "Failed to upload configuration"
    exit 1
fi

# Установка зависимостей на сервере
echo ""
echo "📦 Installing dependencies on server..."
ssh $HOSTINGER_USER@$HOSTINGER_HOST "cd $REMOTE_PATH/server && npm install --production"

if [ $? -eq 0 ]; then
    print_status "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# Перезапуск сервера
echo ""
echo "🔄 Restarting server..."
ssh $HOSTINGER_USER@$HOSTINGER_HOST "pm2 restart enoterra_erp"

if [ $? -eq 0 ]; then
    print_status "Server restarted successfully"
else
    print_warning "Could not restart server with PM2, trying alternative method..."
    ssh $HOSTINGER_USER@$HOSTINGER_HOST "cd $REMOTE_PATH/server && node index.js &"
    if [ $? -eq 0 ]; then
        print_status "Server started with alternative method"
    else
        print_error "Failed to start server"
        exit 1
    fi
fi

echo ""
print_status "🎉 Deployment completed successfully!"
echo ""
echo "📋 Post-deployment checklist:"
echo "  - [ ] Application loads at https://erp.enoterra.pl"
echo "  - [ ] React app loads correctly"
echo "  - [ ] API endpoints work (/api/health)"
echo "  - [ ] Database connections work"
echo "  - [ ] File uploads work"
echo "  - [ ] PDF generation works"
echo "  - [ ] No errors in server logs"
echo ""
echo "🔍 To check server status:"
echo "  ssh $HOSTINGER_USER@$HOSTINGER_HOST"
echo "  pm2 status enoterra_erp"
echo "  pm2 logs enoterra_erp"
echo ""
echo "🆘 If something goes wrong:"
echo "  - Restore database from: $BACKUP_NAME"
echo "  - Check logs: pm2 logs enoterra_erp"
echo "  - Health check: curl https://erp.enoterra.pl/api/health" 