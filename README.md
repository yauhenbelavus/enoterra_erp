# Enoterra ERP System

Современная ERP система для управления заказами, продуктами и клиентами.

## 🚀 Быстрый старт

### Локальная разработка
```bash
# Клонирование репозитория
git clone https://github.com/yourusername/enoterra_erp.git
cd enoterra_erp

# Установка зависимостей
npm install
cd server && npm install

# Настройка окружения
cp env.example .env

# Запуск в режиме разработки
npm run dev              # React dev server (порт 5173)
cd server && npm run dev # Express dev server (порт 3001)
```

### Продакшен деплой
```bash
# На сервере Hostinger
cd public_html
git pull origin main
npm install
cd server && npm install
npm run build
pm2 restart enoterra_erp
```

## 📁 Структура проекта

```
enoterra_erp/
├── src/                    # React приложение
│   ├── components/         # React компоненты
│   ├── types/             # TypeScript типы
│   └── main.tsx           # Точка входа
├── server/                 # Express сервер
│   ├── index.js           # Основной сервер
│   ├── package.json       # Серверные зависимости
│   └── uploads/           # Загрузки файлов
├── database_*.mjs         # Утилиты для работы с БД
├── .github/               # GitHub Actions
│   └── workflows/         # CI/CD конфигурация
├── package.json           # Зависимости клиента
└── README.md              # Документация
```

## 🛠️ Технологии

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express
- **Database**: SQLite
- **Styling**: Tailwind CSS
- **Deployment**: GitHub Actions + Hostinger

## 🔧 Конфигурация

### Переменные окружения (.env)
```env
# Database Configuration
DB_PATH=./enoterra_erp.db

# Server Configuration
PORT=3001
NODE_ENV=development

# Client Configuration
VITE_API_URL=http://localhost:3001
```

## 📋 Функциональность

### Управление продуктами
- Добавление/редактирование продуктов
- Управление остатками
- Штрих-коды и EAN коды

### Управление заказами
- Создание заказов
- Добавление продуктов в заказы
- Генерация PDF документов

### Управление клиентами
- База данных клиентов
- Контактная информация
- История заказов

### Рабочие листы
- Ежедневные отчеты
- Учет продаж
- Аналитика

## 🛡️ Безопасность данных

- База данных защищена от случайного коммита
- Автоматическое резервное копирование
- Проверка совместимости перед деплоем
- Pre-commit hooks для защиты

## 🔄 Рабочий процесс разработки

### 1. Создание новой функции
```bash
git checkout -b feature/new-feature
# Разработка...
git add .
git commit -m "Add new feature"
git push origin feature/new-feature
```

### 2. Code Review
1. Создайте Pull Request на GitHub
2. Проверьте изменения
3. Запустите тесты
4. Мержите в main

### 3. Автоматический деплой
- GitHub Actions автоматически деплоит на сервер
- База данных защищена от перезаписи
- Миграции выполняются безопасно

## 📦 Скрипты

### Разработка
```bash
npm run dev              # Запуск в режиме разработки
npm run build            # Сборка для продакшена
npm run preview          # Предварительный просмотр
```

### База данных
```bash
node database_check.mjs      # Проверка структуры БД
node clean_database.mjs      # Очистка БД
node check_compatibility.mjs # Проверка совместимости
```

### Деплой
```bash
node safe_deploy.mjs        # Безопасный деплой
node prepare_deployment.mjs  # Подготовка к деплою
```

## 🔍 Мониторинг

### Логи сервера
```bash
# Локальные логи
cd server && npm run dev

# Продакшен логи (на Hostinger)
tail -f public_html/server/logs/app.log
pm2 logs enoterra_erp
```

### Проверка БД
```bash
node database_check.mjs
node check_compatibility.mjs
```

## ⚠️ Важные правила

### ✅ Что можно коммитить
- Исходный код (src/, server/)
- Конфигурационные файлы (env.example)
- Документацию (README.md)
- Скрипты утилит (database_*.mjs)

### ❌ Что НЕЛЬЗЯ коммитить
- Базы данных (*.db, *.sqlite)
- .env файлы с секретами
- node_modules/
- Логи и временные файлы

## 🆘 Поддержка

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

## 📞 Контакты

- **GitHub**: [yourusername/enoterra_erp](https://github.com/yourusername/enoterra_erp)
- **Документация**: [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)
- **Стратегия деплоя**: [github_deployment_strategy.md](./github_deployment_strategy.md)

## 📄 Лицензия

MIT License - см. файл [LICENSE](./LICENSE) для деталей. 