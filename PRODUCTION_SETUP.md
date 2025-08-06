# 🚀 Настройка продакшена для erp.enoterra.pl

## 📋 Что нужно сделать

### 1. **Настройка сервера (первый раз)**

Подключитесь к вашему VPS серверу и выполните:

```bash
# Клонируйте репозиторий (если еще не сделано)
git clone https://github.com/yourusername/enoterra_erp.git
cd enoterra_erp

# Сделайте скрипты исполняемыми
chmod +x setup_production_server.sh
chmod +x start_production.sh

# Запустите настройку сервера
./setup_production_server.sh
```

### 2. **Настройка GitHub Secrets**

В GitHub репозитории перейдите в Settings → Secrets and variables → Actions и добавьте:

- `SSH_PRIVATE_KEY` - ваш приватный SSH ключ
- `REMOTE_HOST` - IP адрес вашего VPS
- `REMOTE_USER` - имя пользователя на VPS

### 3. **Деплой приложения**

Сделайте коммит в ветку `main`:

```bash
git add .
git commit -m "Update production configuration"
git push origin main
```

GitHub Actions автоматически задеплоит приложение на сервер.

### 4. **Запуск приложения**

После успешного деплоя подключитесь к серверу и запустите:

```bash
cd /home/$USER/enoterra_erp
./start_production.sh
```

## 🔧 Конфигурация

### **Nginx конфигурация**
- Файл: `/etc/nginx/sites-available/erp.enoterra.pl`
- SSL сертификат: автоматически через Let's Encrypt
- Проксирование: порт 3001

### **PM2 конфигурация**
- Файл: `ecosystem.config.js`
- Автозапуск: настроен
- Логи: `./logs/`

### **Структура на сервере**
```
/home/$USER/enoterra_erp/
├── dist/                   # React приложение
├── server/                 # Express сервер
│   ├── index.js           # Основной сервер
│   ├── enoterra_erp.db   # База данных
│   ├── uploads/           # Загрузки
│   └── fonts/             # Шрифты
├── logs/                  # Логи приложения
└── ecosystem.config.js    # PM2 конфигурация
```

## 🛠️ Управление приложением

### **Просмотр статуса**
```bash
pm2 status enoterra_erp
```

### **Просмотр логов**
```bash
pm2 logs enoterra_erp
```

### **Перезапуск**
```bash
pm2 restart enoterra_erp
```

### **Остановка**
```bash
pm2 stop enoterra_erp
```

### **Мониторинг**
```bash
pm2 monit
```

## 🔍 Проверка работы

### **Проверка приложения**
```bash
# Проверка API
curl https://erp.enoterra.pl/api/health

# Проверка главной страницы
curl -I https://erp.enoterra.pl
```

### **Проверка Nginx**
```bash
sudo nginx -t
sudo systemctl status nginx
```

### **Проверка SSL**
```bash
sudo certbot certificates
```

## 🆘 Устранение проблем

### **Если приложение не запускается:**

1. **Проверьте логи:**
   ```bash
   pm2 logs enoterra_erp
   ```

2. **Проверьте статус PM2:**
   ```bash
   pm2 status
   ```

3. **Проверьте порт:**
   ```bash
   netstat -tlnp | grep :3001
   ```

### **Если Nginx не работает:**

1. **Проверьте конфигурацию:**
   ```bash
   sudo nginx -t
   ```

2. **Перезапустите Nginx:**
   ```bash
   sudo systemctl restart nginx
   ```

3. **Проверьте статус:**
   ```bash
   sudo systemctl status nginx
   ```

### **Если SSL не работает:**

1. **Обновите сертификат:**
   ```bash
   sudo certbot renew
   ```

2. **Проверьте сертификаты:**
   ```bash
   sudo certbot certificates
   ```

## 📊 Мониторинг

### **Логи приложения**
```bash
tail -f /home/$USER/enoterra_erp/logs/combined.log
```

### **Логи Nginx**
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### **Использование ресурсов**
```bash
htop
df -h
free -h
```

## 🔄 Обновление приложения

### **Автоматическое обновление**
1. Сделайте изменения в коде
2. Запушите в `main` ветку
3. GitHub Actions автоматически задеплоит

### **Ручное обновление**
```bash
cd /home/$USER/enoterra_erp
git pull origin main
npm install --production
cd server && npm install --production
pm2 restart enoterra_erp
```

## 🛡️ Безопасность

### **Firewall**
```bash
# Открыть только необходимые порты
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

### **Регулярные обновления**
```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Обновление Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи приложения
2. Проверьте логи Nginx
3. Проверьте статус сервисов
4. Восстановите из резервной копии при необходимости

---

**🌐 Ваше приложение будет доступно по адресу: https://erp.enoterra.pl** 