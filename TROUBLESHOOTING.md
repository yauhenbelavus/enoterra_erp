# 🔍 Диагностика проблем с сайтом

## ⚠️ **Сайт не работает: https://erp.enoterra.pl**

Давайте проверим, что происходит:

## 📋 **Шаг 1: Проверка GitHub Actions**

1. Откройте: https://github.com/yauhenbelavus/enoterra_erp/actions
2. Проверьте последний деплой - есть ли ошибки?

## 📋 **Шаг 2: Подключение к серверу**

```bash
# Подключиться к серверу
ssh $USER@$REMOTE_HOST

# Проверить статус приложения
pm2 status

# Посмотреть логи
pm2 logs enoterra_erp

# Проверить, что приложение слушает порт
netstat -tlnp | grep 3001

# Проверить статус Nginx
sudo systemctl status nginx

# Проверить логи Nginx
sudo tail -f /var/log/nginx/error.log
```

## 📋 **Шаг 3: Проверка файлов**

```bash
# Перейти в папку приложения
cd /home/$USER/enoterra_erp

# Проверить, что файлы есть
ls -la

# Проверить server папку
ls -la server/

# Проверить, что index.js существует
cat server/index.js
```

## 📋 **Шаг 4: Ручной запуск**

```bash
# Остановить приложение
pm2 stop enoterra_erp
pm2 delete enoterra_erp

# Перейти в папку
cd /home/$USER/enoterra_erp

# Установить зависимости
npm install --production
cd server && npm install --production && cd ..

# Запустить приложение
pm2 start ecosystem.config.js
pm2 save

# Проверить статус
pm2 status
```

## 📋 **Шаг 5: Проверка Nginx**

```bash
# Проверить конфигурацию Nginx
sudo nginx -t

# Перезапустить Nginx
sudo systemctl restart nginx

# Проверить статус
sudo systemctl status nginx
```

## 📋 **Шаг 6: Проверка SSL**

```bash
# Проверить SSL сертификат
sudo certbot certificates

# Обновить сертификат если нужно
sudo certbot renew

# Перезапустить Nginx
sudo systemctl restart nginx
```

## 🔍 **Возможные проблемы:**

### **1. Приложение не запущено**
```bash
pm2 status
# Если статус не "online", запустите:
pm2 restart enoterra_erp
```

### **2. Порт не слушается**
```bash
netstat -tlnp | grep 3001
# Если порт не слушается, проверьте логи:
pm2 logs enoterra_erp
```

### **3. Nginx не работает**
```bash
sudo systemctl status nginx
# Если не работает:
sudo systemctl restart nginx
```

### **4. SSL проблемы**
```bash
# Проверить сертификат
sudo certbot certificates
# Если истек:
sudo certbot renew
```

## 🚨 **Экстренные меры:**

### **Полный перезапуск:**
```bash
# Остановить всё
pm2 stop all
sudo systemctl stop nginx

# Запустить заново
cd /home/$USER/enoterra_erp
./start_production.sh
sudo systemctl start nginx
```

### **Проверка доступности:**
```bash
# Локально на сервере
curl http://localhost:3001

# Проверить внешний доступ
curl -I https://erp.enoterra.pl
```

## 📞 **Если ничего не помогает:**

1. **Проверьте DNS** - правильно ли настроен домен?
2. **Проверьте файрвол** - открыт ли порт 80/443?
3. **Проверьте провайдера** - нет ли блокировки?

---

**Выполните эти шаги по порядку и сообщите результаты!** 