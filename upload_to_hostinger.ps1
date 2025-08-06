# PowerShell скрипт для загрузки файлов на Hostinger
# Согласно стратегии деплоя из deployment_strategy.md

Write-Host "🚀 Starting Hostinger deployment..." -ForegroundColor Green

# Конфигурация
$HOSTINGER_USER = "root"  # или ваш SSH пользователь
$HOSTINGER_HOST = "erp.enoterra.pl"  # или IP сервера
$REMOTE_PATH = "/home/root/enoterra_erp"

# Функция для вывода с цветом
function Write-Status {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️ $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

# Проверка наличия файлов
Write-Host "📋 Checking required files..." -ForegroundColor Cyan

if (-not (Test-Path "dist")) {
    Write-Error "dist/ folder not found! Please run 'npm run build' first."
    exit 1
}

if (-not (Test-Path "server/index.js")) {
    Write-Error "server/index.js not found!"
    exit 1
}

if (-not (Test-Path "server/package.json")) {
    Write-Error "server/package.json not found!"
    exit 1
}

Write-Status "All required files found"

# Создание резервной копии продакшен БД
Write-Host ""
Write-Host "📦 Creating backup of production database..." -ForegroundColor Cyan
$BACKUP_NAME = "backup_production_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"

try {
    scp "$HOSTINGER_USER@$HOSTINGER_HOST`:$REMOTE_PATH/server/enoterra_erp.db" "./$BACKUP_NAME"
    Write-Status "Backup created: $BACKUP_NAME"
} catch {
    Write-Warning "Could not create backup (database might not exist yet)"
}

# Загрузка React приложения (dist folder)
Write-Host ""
Write-Host "📤 Uploading React application (dist folder)..." -ForegroundColor Cyan

try {
    scp -r "dist/*" "$HOSTINGER_USER@$HOSTINGER_HOST`:$REMOTE_PATH/dist/"
    Write-Status "React application uploaded successfully"
} catch {
    Write-Error "Failed to upload React application"
    exit 1
}

# Загрузка серверных файлов (исключая БД)
Write-Host ""
Write-Host "📤 Uploading server files..." -ForegroundColor Cyan

try {
    scp "server/index.js" "$HOSTINGER_USER@$HOSTINGER_HOST`:$REMOTE_PATH/server/"
    scp "server/package.json" "$HOSTINGER_USER@$HOSTINGER_HOST`:$REMOTE_PATH/server/"
    Write-Status "Server files uploaded successfully"
} catch {
    Write-Error "Failed to upload server files"
    exit 1
}

# Загрузка шрифтов
Write-Host ""
Write-Host "📤 Uploading fonts..." -ForegroundColor Cyan

try {
    scp -r "server/fonts/*" "$HOSTINGER_USER@$HOSTINGER_HOST`:$REMOTE_PATH/server/fonts/"
    Write-Status "Fonts uploaded successfully"
} catch {
    Write-Warning "Could not upload fonts (folder might not exist)"
}

# Загрузка загруженных файлов (uploads)
Write-Host ""
Write-Host "📤 Uploading uploaded files..." -ForegroundColor Cyan

try {
    scp -r "server/uploads/*" "$HOSTINGER_USER@$HOSTINGER_HOST`:$REMOTE_PATH/server/uploads/"
    Write-Status "Uploaded files transferred successfully"
} catch {
    Write-Warning "Could not transfer uploaded files (folder might be empty)"
}

# Загрузка конфигурации
Write-Host ""
Write-Host "📤 Uploading configuration..." -ForegroundColor Cyan

try {
    scp "package.json" "$HOSTINGER_USER@$HOSTINGER_HOST`:$REMOTE_PATH/"
    Write-Status "Configuration uploaded successfully"
} catch {
    Write-Error "Failed to upload configuration"
    exit 1
}

# Установка зависимостей на сервере
Write-Host ""
Write-Host "📦 Installing dependencies on server..." -ForegroundColor Cyan

try {
    ssh "$HOSTINGER_USER@$HOSTINGER_HOST" "cd $REMOTE_PATH/server && npm install --production"
    Write-Status "Dependencies installed successfully"
} catch {
    Write-Error "Failed to install dependencies"
    exit 1
}

# Перезапуск сервера
Write-Host ""
Write-Host "🔄 Restarting server..." -ForegroundColor Cyan

try {
    ssh "$HOSTINGER_USER@$HOSTINGER_HOST" "pm2 restart enoterra_erp"
    Write-Status "Server restarted successfully"
} catch {
    Write-Warning "Could not restart server with PM2, trying alternative method..."
    try {
        ssh "$HOSTINGER_USER@$HOSTINGER_HOST" "cd $REMOTE_PATH/server && node index.js &"
        Write-Status "Server started with alternative method"
    } catch {
        Write-Error "Failed to start server"
        exit 1
    }
}

Write-Host ""
Write-Status "🎉 Deployment completed successfully!"
Write-Host ""
Write-Host "📋 Post-deployment checklist:" -ForegroundColor Cyan
Write-Host "  - [ ] Application loads at https://erp.enoterra.pl"
Write-Host "  - [ ] React app loads correctly"
Write-Host "  - [ ] API endpoints work (/api/health)"
Write-Host "  - [ ] Database connections work"
Write-Host "  - [ ] File uploads work"
Write-Host "  - [ ] PDF generation works"
Write-Host "  - [ ] No errors in server logs"
Write-Host ""
Write-Host "🔍 To check server status:" -ForegroundColor Cyan
Write-Host "  ssh $HOSTINGER_USER@$HOSTINGER_HOST"
Write-Host "  pm2 status enoterra_erp"
Write-Host "  pm2 logs enoterra_erp"
Write-Host ""
Write-Host "🆘 If something goes wrong:" -ForegroundColor Red
Write-Host "  - Restore database from: $BACKUP_NAME"
Write-Host "  - Check logs: pm2 logs enoterra_erp"
Write-Host "  - Health check: curl https://erp.enoterra.pl/api/health" 