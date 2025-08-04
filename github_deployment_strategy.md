# GitHub Deployment Strategy

## 🎯 Цель
Безопасная разработка и деплой через GitHub с сохранением данных в продакшене на Hostinger.

## 📁 Структура репозитория

### Локальная разработка
```
enoterra_erp/
├── src/                    # React приложение
├── server/                 # Express сервер
├── database_*.mjs         # Утилиты БД
├── .env.example           # Пример конфигурации
├── .gitignore             # Исключения из Git
├── README.md              # Документация
└── package.json           # Зависимости
```

### Продакшен на Hostinger
```
public_html/
├── dist/                   # Собранное React приложение
├── server/                 # Express сервер
│   ├── index.js           # Основной сервер
│   ├── enoterra_erp.db   # Продакшен БД (защищенная)
│   └── uploads/           # Загрузки
└── .env                   # Продакшен настройки
```

## 🔄 Рабочий процесс с GitHub

### 1. Локальная разработка
```bash
# Клонирование репозитория
git clone https://github.com/yourusername/enoterra_erp.git
cd enoterra_erp

# Установка зависимостей
npm install
cd server && npm install

# Запуск в тестовом режиме
npm run dev              # React dev server
cd server && npm run dev # Express dev server
```

### 2. Разработка новых функций
```bash
# Создание новой ветки
git checkout -b feature/new-functionality

# Разработка и тестирование
# ... ваш код ...

# Проверка совместимости
node check_compatibility.mjs

# Коммит изменений
git add .
git commit -m "Add new functionality"

# Пуш в GitHub
git push origin feature/new-functionality
```

### 3. Создание Pull Request
1. Переходите на GitHub
2. Создаете Pull Request из `feature/new-functionality` в `main`
3. Проверяете CI/CD (если настроен)
4. Мержите в `main` после проверки

### 4. Деплой на Hostinger
```bash
# На сервере Hostinger
cd public_html
git pull origin main
npm install
cd server && npm install
npm run build
pm2 restart enoterra_erp
```

## 🛡️ Защита данных

### .gitignore файл
```gitignore
# Базы данных (НИКОГДА не коммитить!)
*.db
*.sqlite
*.sqlite3

# Конфигурационные файлы с секретами
.env
.env.local
.env.production

# Логи
*.log
logs/

# Резервные копии
backup_*.db
*.backup

# Зависимости
node_modules/
npm-debug.log*

# Сборка
dist/
build/

# Временные файлы
.tmp/
.temp/
```

### Безопасная работа с БД
1. **Локальная БД**: `enoterra_erp.db` (в .gitignore)
2. **Продакшен БД**: `public_html/server/enoterra_erp.db` (защищенная)
3. **Миграции**: Только структура, не данные

## 🔧 Настройка GitHub Actions

### .github/workflows/deploy.yml
```yaml
name: Deploy to Hostinger

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: |
        npm install
        cd server && npm install
    
    - name: Build application
      run: npm run build
    
    - name: Deploy to Hostinger
      uses: easingthemes/ssh-deploy@main
      env:
        SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
        REMOTE_HOST: ${{ secrets.REMOTE_HOST }}
        REMOTE_USER: ${{ secrets.REMOTE_USER }}
        SOURCE: "dist/,server/"
        TARGET: "/home/${{ secrets.REMOTE_USER }}/public_html/"
        EXCLUDE: "server/enoterra_erp.db"
```

## 📋 GitHub Secrets

Настройте в GitHub Repository Settings → Secrets:

- `SSH_PRIVATE_KEY`: Ваш приватный SSH ключ
- `REMOTE_HOST`: IP адрес вашего сервера Hostinger
- `REMOTE_USER`: Имя пользователя на сервере

## 🔄 Альтернативный процесс деплоя

### Ручной деплой через SSH
```bash
# 1. Подключение к серверу
ssh user@your-hostinger-server.com

# 2. Переход в директорию проекта
cd public_html

# 3. Получение обновлений
git pull origin main

# 4. Установка зависимостей
npm install
cd server && npm install

# 5. Сборка приложения
npm run build

# 6. Запуск миграций (если нужно)
node database_migrations.mjs

# 7. Перезапуск сервера
pm2 restart enoterra_erp
```

## 🛠️ Скрипты для автоматизации

### pre-commit hook (.git/hooks/pre-commit)
```bash
#!/bin/bash
echo "🔍 Running pre-commit checks..."

# Проверка на наличие БД в коммите
if git diff --cached --name-only | grep -E '\.(db|sqlite)$'; then
    echo "❌ ERROR: Database files detected in commit!"
    echo "Please remove database files from commit"
    exit 1
fi

# Проверка на наличие .env файлов
if git diff --cached --name-only | grep -E '\.env$'; then
    echo "❌ ERROR: .env files detected in commit!"
    echo "Please remove .env files from commit"
    exit 1
fi

echo "✅ Pre-commit checks passed"
```

### Скрипт деплоя (deploy.sh)
```bash
#!/bin/bash
echo "🚀 Starting deployment..."

# 1. Backup production database
echo "📦 Creating backup..."
cp public_html/server/enoterra_erp.db backup_$(date +%Y%m%d_%H%M%S).db

# 2. Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# 3. Install dependencies
echo "📦 Installing dependencies..."
npm install
cd server && npm install

# 4. Build application
echo "🔨 Building application..."
npm run build

# 5. Run migrations (if needed)
echo "🔄 Running migrations..."
node database_migrations.mjs

# 6. Restart server
echo "🔄 Restarting server..."
pm2 restart enoterra_erp

echo "✅ Deployment completed!"
```

## 📋 GitHub Workflow

### 1. Разработка
```bash
# Создание ветки для новой функции
git checkout -b feature/new-feature

# Разработка
# ... ваш код ...

# Тестирование
node check_compatibility.mjs
node safe_deploy.mjs

# Коммит
git add .
git commit -m "Add new feature"

# Пуш
git push origin feature/new-feature
```

### 2. Code Review
1. Создаете Pull Request на GitHub
2. Проверяете изменения
3. Запускаете тесты
4. Мержите в main

### 3. Автоматический деплой
1. GitHub Actions автоматически деплоит на сервер
2. Или запускаете деплой вручную

## 🎯 Преимущества GitHub стратегии

1. **Версионность**: Полная история изменений
2. **Code Review**: Проверка кода перед деплоем
3. **Автоматизация**: CI/CD через GitHub Actions
4. **Безопасность**: Защита от случайного коммита БД
5. **Коллаборация**: Возможность работы в команде
6. **Откат**: Легкий откат к предыдущим версиям

## ⚠️ Важные правила

### ✅ Что можно коммитить
- Исходный код (src/, server/)
- Конфигурационные файлы (.env.example)
- Документацию (README.md)
- Скрипты утилит (database_*.mjs)
- package.json файлы

### ❌ Что НЕЛЬЗЯ коммитить
- Базы данных (*.db, *.sqlite)
- .env файлы с секретами
- node_modules/
- Логи и временные файлы
- Резервные копии

## 🔍 Мониторинг

### GitHub Insights
- Просмотр активности разработки
- Анализ кода
- История изменений

### Серверные логи
```bash
# На сервере Hostinger
tail -f public_html/server/logs/app.log
pm2 logs enoterra_erp
```

## 📞 Поддержка

### При проблемах с деплоем:
1. Проверьте GitHub Actions logs
2. Проверьте серверные логи
3. Восстановите БД из резервной копии
4. Откатитесь к предыдущему коммиту

### Полезные команды:
```bash
# Откат к предыдущему коммиту
git reset --hard HEAD~1

# Просмотр истории
git log --oneline

# Проверка статуса
git status

# Очистка локальных изменений
git checkout -- .
``` 