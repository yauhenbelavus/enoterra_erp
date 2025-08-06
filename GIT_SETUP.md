# 🔧 Настройка Git для проекта

## ✅ Git уже настроен

### **Текущие настройки:**
- **Репозиторий**: `https://github.com/yauhenbelavus/enoterra_erp.git`
- **Ветка**: `main`
- **User Name**: `Yauhen Belavus`
- **User Email**: `yauhenbelavus@gmail.com`

### **Конфигурация Git:**
```bash
# Глобальные настройки
git config --global user.name "Yauhen Belavus"
git config --global user.email "yauhenbelavus@gmail.com"

# Локальные настройки для проекта
git config user.name "Yauhen Belavus"
git config user.email "yauhenbelavus@gmail.com"
```

## 📋 Что нужно сделать для деплоя

### **1. Добавить файлы в Git:**
```bash
git add .
```

### **2. Создать коммит:**
```bash
git commit -m "Add production configuration for erp.enoterra.pl"
```

### **3. Отправить в GitHub:**
```bash
git push origin main
```

## 🔧 Проблемы с PowerShell

Если у вас возникают проблемы с PowerShell (автоматическая замена латинских букв на кириллические), попробуйте:

### **Альтернативные способы:**

1. **Использовать cmd вместо PowerShell:**
   ```cmd
   cmd /c "git add ."
   cmd /c "git commit -m 'Add production configuration'"
   cmd /c "git push origin main"
   ```

2. **Использовать Git Bash:**
   ```bash
   git add .
   git commit -m "Add production configuration for erp.enoterra.pl"
   git push origin main
   ```

3. **Использовать VS Code:**
   - Откройте Source Control (Ctrl+Shift+G)
   - Добавьте изменения
   - Введите сообщение коммита
   - Нажмите Commit
   - Нажмите Sync Changes

## 📁 Файлы для коммита

### **Новые файлы конфигурации:**
- ✅ `ecosystem.config.js` - PM2 конфигурация
- ✅ `nginx.conf` - Nginx конфигурация
- ✅ `setup_production_server.sh` - скрипт настройки сервера
- ✅ `start_production.sh` - скрипт запуска приложения
- ✅ `PRODUCTION_SETUP.md` - инструкция по настройке
- ✅ `GIT_SETUP.md` - эта инструкция

### **Обновленные файлы:**
- ✅ `.github/workflows/deploy.yml` - обновленный GitHub Actions
- ✅ `.git/config` - настройки Git

## 🚀 После коммита

После успешного пуша в GitHub:

1. **GitHub Actions автоматически запустится**
2. **Приложение будет задеплоено на VPS**
3. **Подключитесь к серверу и запустите:**
   ```bash
   cd /home/$USER/enoterra_erp
   ./start_production.sh
   ```

## 🔍 Проверка настроек

### **Проверить настройки Git:**
```bash
git config --list
```

### **Проверить статус:**
```bash
git status
```

### **Проверить историю коммитов:**
```bash
git log --oneline
```

## 📞 Поддержка

При возникновении проблем:

1. Проверьте настройки Git: `git config --list`
2. Проверьте статус: `git status`
3. Проверьте подключение к GitHub: `git remote -v`
4. Попробуйте альтернативные способы выполнения команд

---

**🌐 После успешного деплоя приложение будет доступно по адресу: https://erp.enoterra.pl** 