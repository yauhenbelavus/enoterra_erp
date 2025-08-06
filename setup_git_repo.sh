#!/bin/bash
echo "🚀 Setting up Git repository for Enoterra ERP..."

# Проверяем, что мы в корневой директории проекта
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Инициализируем Git репозиторий (если еще не инициализирован)
if [ ! -d ".git" ]; then
    echo "📁 Initializing Git repository..."
    git init
fi

# Делаем pre-commit hook исполняемым
if [ -f ".git/hooks/pre-commit" ]; then
    chmod +x .git/hooks/pre-commit
    echo "✅ Pre-commit hook made executable"
fi

# Проверяем наличие .gitignore
if [ ! -f ".gitignore" ]; then
    echo "❌ Error: .gitignore file not found!"
    exit 1
fi

# Проверяем наличие env.example
if [ ! -f "env.example" ]; then
    echo "❌ Error: env.example file not found!"
    exit 1
fi

# Создаем .env файл из примера (если не существует)
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from example..."
    cp env.example .env
    echo "✅ .env file created"
else
    echo "ℹ️ .env file already exists"
fi

# Добавляем все файлы в Git (кроме тех, что в .gitignore)
echo "📦 Adding files to Git..."
git add .

# Проверяем статус
echo "📋 Git status:"
git status

echo ""
echo "🎉 Git repository setup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Create a new repository on GitHub"
echo "2. Add remote origin: git remote add origin https://github.com/yourusername/enoterra_erp.git"
echo "3. Push to GitHub: git push -u origin main"
echo "4. Set up GitHub Secrets for deployment"
echo ""
echo "🔧 GitHub Secrets to configure:"
echo "- SSH_PRIVATE_KEY: Your SSH private key"
echo "- REMOTE_HOST: Your Hostinger server IP"
echo "- REMOTE_USER: Your Hostinger username"
echo ""
echo "⚠️ Important: Never commit database files or .env files!" 