import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting safe deployment process...');

// Функция для создания резервной копии
function createBackup(sourcePath, backupName) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(sourcePath)) {
      console.log(`⚠️ Source file not found: ${sourcePath}`);
      resolve(false);
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(__dirname, `backup_${backupName}_${timestamp}.db`);
    
    try {
      fs.copyFileSync(sourcePath, backupPath);
      console.log(`✅ Backup created: ${backupPath}`);
      resolve(true);
    } catch (error) {
      console.error(`❌ Backup failed:`, error);
      reject(error);
    }
  });
}

// Функция для проверки структуры БД
function checkDatabaseStructure(dbPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(dbPath)) {
      console.log(`❌ Database not found: ${dbPath}`);
      resolve(null);
      return;
    }

    const db = new sqlite3.Database(dbPath);
    
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error('❌ Error checking database structure:', err);
        reject(err);
        return;
      }
      
      console.log(`📋 Database tables: ${tables.length}`);
      tables.forEach(table => {
        console.log(`  - ${table.name}`);
      });
      
      db.close();
      resolve(tables);
    });
  });
}

// Функция для проверки совместимости миграций
function checkMigrationCompatibility(localDbPath, productionDbPath) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('\n🔍 Checking migration compatibility...');
      
      const localTables = await checkDatabaseStructure(localDbPath);
      const productionTables = await checkDatabaseStructure(productionDbPath);
      
      if (!localTables || !productionTables) {
        console.log('⚠️ Cannot check compatibility - databases not found');
        resolve(false);
        return;
      }
      
      const localTableNames = localTables.map(t => t.name);
      const productionTableNames = productionTables.map(t => t.name);
      
      // Проверяем, есть ли новые таблицы в локальной версии
      const newTables = localTableNames.filter(table => !productionTableNames.includes(table));
      
      if (newTables.length > 0) {
        console.log(`\n⚠️ New tables detected: ${newTables.join(', ')}`);
        console.log('These tables will be created during deployment');
      } else {
        console.log('\n✅ No new tables detected');
      }
      
      // Проверяем, есть ли удаленные таблицы
      const removedTables = productionTableNames.filter(table => !localTableNames.includes(table));
      
      if (removedTables.length > 0) {
        console.log(`\n⚠️ Tables to be removed: ${removedTables.join(', ')}`);
        console.log('WARNING: This will delete data!');
      }
      
      resolve(newTables.length === 0 && removedTables.length === 0);
      
    } catch (error) {
      console.error('❌ Migration compatibility check failed:', error);
      reject(error);
    }
  });
}

// Функция для сборки приложения
function buildApplication() {
  return new Promise((resolve, reject) => {
    console.log('\n🔨 Building application...');
    
    const { exec } = require('child_process');
    
    exec('npm run build', (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Build failed:', error);
        reject(error);
        return;
      }
      
      console.log('✅ Build completed successfully');
      console.log(stdout);
      
      if (stderr) {
        console.log('Build warnings:', stderr);
      }
      
      resolve();
    });
  });
}

// Функция для создания списка файлов для деплоя
function createDeploymentList() {
  console.log('\n📋 Creating deployment file list...');
  
  const deploymentFiles = [
    'dist/**/*',
    'server/**/*',
    '.env',
    'package.json',
    'server/package.json'
  ];
  
  const excludeFiles = [
    'server/enoterra_erp.db', // Не загружаем продакшен БД
    'node_modules/**/*',
    '*.log',
    'backup_*.db'
  ];
  
  console.log('Files to deploy:');
  deploymentFiles.forEach(file => {
    console.log(`  + ${file}`);
  });
  
  console.log('\nFiles to exclude:');
  excludeFiles.forEach(file => {
    console.log(`  - ${file}`);
  });
  
  return { deploymentFiles, excludeFiles };
}

// Функция для создания инструкций по деплою
function createDeploymentInstructions() {
  console.log('\n📝 Creating deployment instructions...');
  
  const instructions = `# Deployment Instructions

## 🚀 Manual Deployment Steps

### 1. Backup Production Database
\`\`\`bash
# Download current production database
scp user@hostinger.com:public_html/server/enoterra_erp.db ./backup_production_$(date +%Y%m%d_%H%M%S).db
\`\`\`

### 2. Upload Files to Hostinger
\`\`\`bash
# Upload built application
scp -r dist/* user@hostinger.com:public_html/dist/

# Upload server files (excluding database)
scp -r server/* user@hostinger.com:public_html/server/
scp server/package.json user@hostinger.com:public_html/server/

# Upload configuration
scp .env user@hostinger.com:public_html/
scp package.json user@hostinger.com:public_html/
\`\`\`

### 3. Install Dependencies on Server
\`\`\`bash
ssh user@hostinger.com
cd public_html/server
npm install --production
\`\`\`

### 4. Run Database Migrations (if needed)
\`\`\`bash
# Only if new tables/columns were added
node database_migrations.mjs
\`\`\`

### 5. Restart Server
\`\`\`bash
# If using PM2
pm2 restart enoterra_erp

# If using systemd
sudo systemctl restart enoterra_erp
\`\`\`

## ⚠️ Important Notes

- **Never upload the local database** to production
- **Always backup** the production database before deployment
- **Test migrations** on a copy of production database first
- **Check logs** after deployment for any errors

## 🔍 Post-Deployment Checklist

- [ ] Application loads correctly
- [ ] Database connections work
- [ ] All features function properly
- [ ] No errors in server logs
- [ ] Performance is acceptable
- [ ] Backup was created successfully

## 🆘 Rollback Plan

If deployment fails:

1. **Restore database** from backup
2. **Revert files** to previous version
3. **Restart server**
4. **Check logs** for errors
5. **Test functionality**

## 📞 Emergency Contacts

- Server logs: \`tail -f public_html/server/logs/app.log\`
- Database backup location: \`./backup_*.db\`
- Rollback script: \`./rollback.sh\`
`;

  fs.writeFileSync(path.join(__dirname, 'DEPLOYMENT_INSTRUCTIONS.md'), instructions);
  console.log('✅ Deployment instructions created: DEPLOYMENT_INSTRUCTIONS.md');
}

// Функция для создания скрипта отката
function createRollbackScript() {
  console.log('\n🔄 Creating rollback script...');
  
  const rollbackScript = `#!/bin/bash
# Rollback Script for Enoterra ERP

echo "🔄 Starting rollback process..."

# Check if backup exists
BACKUP_FILE="./backup_production_*.db"
if ls $BACKUP_FILE 1> /dev/null 2>&1; then
    echo "📦 Found backup files:"
    ls -la $BACKUP_FILE
    
    # Get the most recent backup
    LATEST_BACKUP=$(ls -t $BACKUP_FILE | head -1)
    echo "🔄 Restoring from: $LATEST_BACKUP"
    
    # Restore database
    cp "$LATEST_BACKUP" ./server/enoterra_erp.db
    echo "✅ Database restored"
    
    # Restart server
    echo "🔄 Restarting server..."
    pm2 restart enoterra_erp || systemctl restart enoterra_erp
    
    echo "✅ Rollback completed"
else
    echo "❌ No backup files found"
    echo "Please restore database manually"
fi
`;

  fs.writeFileSync(path.join(__dirname, 'rollback.sh'), rollbackScript);
  fs.chmodSync(path.join(__dirname, 'rollback.sh'), '755');
  console.log('✅ Rollback script created: rollback.sh');
}

// Главная функция
async function safeDeploy() {
  try {
    console.log('🚀 Starting safe deployment process...');
    
    // Пути к базам данных
    const localDbPath = path.join(__dirname, 'enoterra_erp.db');
    const serverDbPath = path.join(__dirname, 'server', 'enoterra_erp.db');
    
    console.log('\n🗄️ Database paths:');
    console.log(`  Local DB: ${localDbPath}`);
    console.log(`  Server DB: ${serverDbPath}`);
    
    // Шаг 1: Создание резервных копий
    console.log('\n📦 Creating backups...');
    await createBackup(localDbPath, 'local');
    await createBackup(serverDbPath, 'server');
    
    // Шаг 2: Проверка совместимости миграций
    const isCompatible = await checkMigrationCompatibility(localDbPath, serverDbPath);
    
    if (!isCompatible) {
      console.log('\n⚠️ Migration compatibility issues detected');
      console.log('Please review the differences before proceeding');
    } else {
      console.log('\n✅ Migration compatibility confirmed');
    }
    
    // Шаг 3: Сборка приложения
    await buildApplication();
    
    // Шаг 4: Создание списка файлов для деплоя
    createDeploymentList();
    
    // Шаг 5: Создание инструкций
    createDeploymentInstructions();
    
    // Шаг 6: Создание скрипта отката
    createRollbackScript();
    
    console.log('\n🎉 Safe deployment preparation completed!');
    console.log('\n📋 Next steps:');
    console.log('  1. Review DEPLOYMENT_INSTRUCTIONS.md');
    console.log('  2. Upload files to Hostinger');
    console.log('  3. Run migrations on server (if needed)');
    console.log('  4. Restart server');
    console.log('  5. Test application');
    
    if (!isCompatible) {
      console.log('\n⚠️ WARNING: Migration compatibility issues detected');
      console.log('Please review and test migrations before deployment');
    }
    
  } catch (error) {
    console.error('❌ Safe deployment preparation failed:', error);
  }
}

// Запускаем безопасный деплой
safeDeploy(); 