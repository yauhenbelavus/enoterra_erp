# 🚀 Настройка GitHub для деплоя на Hostinger

## 📋 Что нужно настроить

### 1. **GitHub Secrets**

Перейдите в ваш GitHub репозиторий:
1. Settings → Secrets and variables → Actions
2. Добавьте следующие secrets:

#### **SSH_PRIVATE_KEY**
Ваш приватный SSH ключ для подключения к Hostinger серверу.

#### **REMOTE_HOST**
IP адрес или домен вашего Hostinger сервера.

#### **REMOTE_USER**
Имя пользователя на Hostinger сервере.

### 2. **Создание SSH ключа (если нет)**

```bash
# Создайте SSH ключ
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# Скопируйте публичный ключ на сервер
ssh-copy-id your_username@your_hostinger_server.com

# Скопируйте приватный ключ в GitHub Secrets
cat ~/.ssh/id_rsa
```

### 3. **Проверка подключения**

```bash
# Проверьте, что можете подключиться к серверу
ssh your_username@your_hostinger_server.com
```

## 🔧 Настройка сервера

### 1. **Создание структуры папок на Hostinger**

```bash
ssh your_username@your_hostinger_server.com

# Создайте структуру папок
mkdir -p public_html/dist
mkdir -p public_html/server
mkdir -p public_html/server/fonts
mkdir -p public_html/server/uploads
```

### 2. **Установка Node.js и PM2**

```bash
# На сервере Hostinger
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Установка PM2
sudo npm install -g pm2
```

### 3. **Настройка PM2**

```bash
# Создайте ecosystem.config.js на сервере
cat > public_html/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'enoterra_erp',
    script: 'server/index.js',
    cwd: '/home/your_username/public_html',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
EOF

# Запустите приложение
cd public_html
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 🚀 Процесс деплоя

### 1. **Автоматический деплой**
После настройки GitHub Secrets:
1. Сделайте коммит в ветку `main`
2. GitHub Actions автоматически задеплоит приложение
3. Проверьте логи в GitHub Actions

### 2. **Ручной деплой**
В GitHub репозитории:
1. Actions → Deploy to Hostinger → Run workflow

## 🔍 Проверка деплоя

### 1. **Проверка файлов на сервере**
```bash
ssh your_username@your_hostinger_server.com
cd public_html
ls -la
ls -la dist/
ls -la server/
```

### 2. **Проверка работы приложения**
- Откройте https://erp.enoterra.pl
- Проверьте API: https://erp.enoterra.pl/api/health

### 3. **Проверка логов**
```bash
pm2 logs enoterra_erp
pm2 status enoterra_erp
```

## 🆘 Устранение проблем

### **Если деплой не работает:**

1. **Проверьте GitHub Secrets**
   - Убедитесь, что все secrets настроены правильно
   - Проверьте SSH подключение вручную

2. **Проверьте права доступа**
   ```bash
   ssh your_username@your_hostinger_server.com
   ls -la public_html/
   ```

3. **Проверьте логи GitHub Actions**
   - Перейдите в Actions в GitHub
   - Посмотрите логи последнего деплоя

4. **Проверьте серверные логи**
   ```bash
   pm2 logs enoterra_erp
   ```

### **Если приложение не загружается:**

1. **Проверьте, что сервер запущен**
   ```bash
   pm2 status enoterra_erp
   ```

2. **Проверьте порты**
   ```bash
   netstat -tlnp | grep :3000
   ```

3. **Проверьте файлы**
   ```bash
   ls -la public_html/dist/
   ls -la public_html/server/
   ```

## 📞 Полезные команды

```bash
# Перезапуск сервера
pm2 restart enoterra_erp

# Просмотр логов
pm2 logs enoterra_erp

# Статус приложения
pm2 status enoterra_erp

# Остановка приложения
pm2 stop enoterra_erp

# Удаление приложения из PM2
pm2 delete enoterra_erp
``` 