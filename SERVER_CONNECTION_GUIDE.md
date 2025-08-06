# 🔧 Подключение к серверу и запуск приложения

## 📋 **Шаг 3: Запуск приложения на сервере**

После успешного деплоя через GitHub Actions нужно вручную запустить приложение на VPS.

## 🔗 **Подключение к серверу**

### **Вариант 1: SSH через PowerShell**
```powershell
ssh $USER@$REMOTE_HOST
```

### **Вариант 2: SSH через Git Bash**
```bash
ssh $USER@$REMOTE_HOST
```

### **Вариант 3: SSH через Windows Terminal**
```bash
ssh $USER@$REMOTE_HOST
```

### **Вариант 4: Использовать PuTTY**
1. Скачайте PuTTY: https://www.putty.org/
2. Введите IP адрес сервера
3. Подключитесь с вашими учетными данными

## 🚀 **Запуск приложения**

После подключения к серверу выполните:

### **1. Перейдите в папку приложения:**
```bash
cd /home/$USER/enoterra_erp
```

### **2. Запустите скрипт запуска:**
```bash
./start_production.sh
```

### **3. Или запустите вручную:**
```bash
# Установить зависимости
npm install --production
cd server && npm install --production && cd ..

# Инициализировать базу данных
cd server && node clean_database.mjs && cd ..

# Запустить с PM2
pm2 start ecosystem.config.js
pm2 save
```

## 📊 **Проверка статуса**

### **Проверить, что приложение запущено:**
```bash
pm2 status
```

### **Посмотреть логи:**
```bash
pm2 logs enoterra_erp
```

### **Проверить Nginx:**
```bash
sudo systemctl status nginx
```

## 🌐 **Проверка доступности**

После запуска приложение должно быть доступно по адресу:
**https://erp.enoterra.pl**

### **Проверить локально на сервере:**
```bash
curl http://localhost:3001
```

## 🔧 **Управление приложением**

### **Перезапустить приложение:**
```bash
pm2 restart enoterra_erp
```

### **Остановить приложение:**
```bash
pm2 stop enoterra_erp
```

### **Посмотреть мониторинг:**
```bash
pm2 monit
```

## 🛠️ **Устранение неполадок**

### **Если приложение не запускается:**
```bash
# Проверить логи
pm2 logs enoterra_erp

# Проверить статус PM2
pm2 status

# Проверить порт
netstat -tlnp | grep 3001
```

### **Если Nginx не работает:**
```bash
# Проверить статус
sudo systemctl status nginx

# Перезапустить
sudo systemctl restart nginx

# Проверить конфигурацию
sudo nginx -t
```

### **Если SSL не работает:**
```bash
# Обновить сертификат
sudo certbot renew

# Перезапустить Nginx
sudo systemctl restart nginx
```

## 📋 **Полный процесс деплоя:**

1. ✅ **Push в GitHub** → GitHub Actions запускается
2. ✅ **GitHub Actions деплоит** → файлы копируются на VPS
3. 🔄 **Подключиться к серверу** → выполнить команды выше
4. ✅ **Приложение запущено** → доступно на https://erp.enoterra.pl

## 🔍 **Проверка результата:**

После успешного запуска:
- 🌐 **https://erp.enoterra.pl** - должно открываться
- 📊 **PM2 статус** - должно показывать "online"
- 🔒 **SSL сертификат** - должен быть валидным
- 📝 **Логи** - не должно быть ошибок

---

**Важно: Этот шаг нужно выполнять каждый раз после деплоя через GitHub Actions!** 