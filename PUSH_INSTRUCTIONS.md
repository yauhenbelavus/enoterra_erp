# 🚀 Инструкция по отправке изменений в GitHub

## ⚠️ Проблема с PowerShell

Из-за системных настроек PowerShell автоматически заменяет латинские буквы на кириллические, что мешает выполнению команд Git.

## 🔧 Решения:

### **Вариант 1: Использовать Git Bash**
1. Откройте Git Bash (если установлен)
2. Перейдите в папку проекта: `cd /d/it/projects/enoterra_erp`
3. Выполните команды:
   ```bash
   git push origin main
   ```

### **Вариант 2: Использовать VS Code**
1. Откройте VS Code
2. Откройте папку проекта
3. Нажмите `Ctrl+Shift+G` (Source Control)
4. Нажмите "..." (три точки)
5. Выберите "Push"

### **Вариант 3: Использовать cmd**
1. Откройте командную строку (cmd)
2. Перейдите в папку проекта: `cd D:\it\projects\enoterra_erp`
3. Выполните команды:
   ```cmd
   git push origin main
   ```

### **Вариант 4: Использовать Windows Terminal**
1. Откройте Windows Terminal
2. Перейдите в папку проекта
3. Выполните команды:
   ```bash
   git push origin main
   ```

## 📋 Что будет после успешного пуша:

1. **GitHub Actions автоматически запустится**
2. **Приложение будет задеплоено на VPS**
3. **Нужно будет подключиться к серверу и запустить:**
   ```bash
   cd /home/$USER/enoterra_erp
   ./start_production.sh
   ```

## 🔍 Проверка статуса:

После пуша проверьте:
- GitHub репозиторий: https://github.com/yauhenbelavus/enoterra_erp
- GitHub Actions: https://github.com/yauhenbelavus/enoterra_erp/actions

## 🌐 Результат:

После успешного деплоя приложение будет доступно по адресу:
**https://erp.enoterra.pl**

---

**Выберите любой из вариантов выше для отправки изменений в GitHub.** 