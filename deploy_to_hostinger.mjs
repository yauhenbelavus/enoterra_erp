import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting Hostinger deployment preparation...');

// Функция для создания резервной копии
function createBackup() {
  console.log('\n📦 Creating backup...');
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, `backup_${timestamp}`);
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  console.log(`✅ Backup directory created: ${backupDir}`);
  return backupDir;
}

// Функция для проверки файлов для деплоя
function checkDeploymentFiles() {
  console.log('\n📋 Checking deployment files...');
  
  const requiredFiles = [
    'dist/index.html',
    'dist/assets/index-DHrb30-Y.js',
    'dist/assets/index-DE51F95V.css',
    'server/index.js',
    'server/package.json',
    'package.json'
  ];
  
  const missingFiles = [];
  
  requiredFiles.forEach(file => {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      console.log(`✅ ${file} (${(stats.size / 1024).toFixed(1)}KB)`);
    } else {
      console.log(`❌ Missing: ${file}`);
      missingFiles.push(file);
    }
  });
  
  if (missingFiles.length > 0) {
    console.log(`\n⚠️ Missing files: ${missingFiles.join(', ')}`);
    return false;
  }
  
  console.log('\n✅ All required files found');
  return true;
}

// Функция для создания инструкций по деплою
function createDeploymentInstructions() {
  console.log('\n📝 Creating deployment instructions...');
  
  const instructions = `# Hostinger Deployment Instructions

## 🚀 Manual Deployment Steps

### 1. Backup Current Production Database
\`\`\`bash
# Download current production database
scp user@hostinger.com:public_html/server/enoterra_erp.db ./backup_production_$(date +%Y%m%d_%H%M%S).db
\`\`\`

### 2. Upload Files to Hostinger

#### Upload React Application (dist folder)
\`\`\`bash
# Upload the entire dist folder
scp -r dist/* user@hostinger.com:public_html/dist/
\`\`\`

#### Upload Server Files
\`\`\`bash
# Upload server files (excluding database)
scp server/index.js user@hostinger.com:public_html/server/
scp server/package.json user@hostinger.com:public_html/server/

# Upload fonts and uploads folders
scp -r server/fonts/* user@hostinger.com:public_html/server/fonts/
scp -r server/uploads/* user@hostinger.com:public_html/server/uploads/
\`\`\`

#### Upload Configuration
\`\`\`bash
# Upload main package.json
scp package.json user@hostinger.com:public_html/
\`\`\`

### 3. Install Dependencies on Server
\`\`\`bash
ssh user@hostinger.com
cd public_html/server
npm install --production
\`\`\`

### 4. Restart Server
\`\`\`bash
# If using PM2
pm2 restart enoterra_erp

# If using systemd
sudo systemctl restart enoterra_erp
\`\`\`

## ⚠️ Important Notes

- **NEVER upload the local database** to production
- **Always backup** the production database before deployment
- **Check logs** after deployment for any errors
- **Test the application** after deployment

## 🔍 Post-Deployment Checklist

- [ ] Application loads at https://erp.enoterra.pl
- [ ] React app loads correctly
- [ ] API endpoints work (/api/health)
- [ ] Database connections work
- [ ] File uploads work
- [ ] PDF generation works
- [ ] No errors in server logs

## 🆘 Rollback Plan

If deployment fails:

1. **Restore database** from backup
2. **Revert server files** to previous version
3. **Restart server**
4. **Check logs** for errors

## 📞 Emergency Contacts

- Server logs: \`tail -f public_html/server/logs/app.log\`
- Database backup location: \`./backup_*.db\`
- Health check: \`curl https://erp.enoterra.pl/api/health\`
`;

  fs.writeFileSync(path.join(__dirname, 'HOSTINGER_DEPLOYMENT.md'), instructions);
  console.log('✅ Deployment instructions created: HOSTINGER_DEPLOYMENT.md');
}

// Функция для создания списка файлов
function createFileList() {
  console.log('\n📋 Creating file list for deployment...');
  
  const filesToDeploy = [
    'dist/index.html',
    'dist/assets/index-DHrb30-Y.js',
    'dist/assets/index-DE51F95V.css',
    'dist/assets/entr logo copy 2@4x-xuoIprT_.png',
    'server/index.js',
    'server/package.json',
    'server/fonts/Sora-Regular.ttf',
    'package.json'
  ];
  
  const excludeFiles = [
    'server/enoterra_erp.db',
    'server/enoterra_erp.db-wal',
    'server/enoterra_erp.db-shm',
    'node_modules/**/*',
    '*.log',
    'backup_*.db'
  ];
  
  console.log('\nFiles to deploy:');
  filesToDeploy.forEach(file => {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      console.log(`  + ${file} (${(stats.size / 1024).toFixed(1)}KB)`);
    } else {
      console.log(`  - ${file} (MISSING)`);
    }
  });
  
  console.log('\nFiles to exclude:');
  excludeFiles.forEach(file => {
    console.log(`  - ${file}`);
  });
  
  return { filesToDeploy, excludeFiles };
}

// Главная функция
async function prepareHostingerDeployment() {
  try {
    console.log('🚀 Starting Hostinger deployment preparation...');
    
    // Шаг 1: Создание резервной копии
    const backupDir = createBackup();
    
    // Шаг 2: Проверка файлов
    const filesOk = checkDeploymentFiles();
    
    if (!filesOk) {
      console.log('\n❌ Some required files are missing. Please build the application first.');
      console.log('Run: npm run build');
      return;
    }
    
    // Шаг 3: Создание списка файлов
    createFileList();
    
    // Шаг 4: Создание инструкций
    createDeploymentInstructions();
    
    console.log('\n🎉 Hostinger deployment preparation completed!');
    console.log('\n📋 Next steps:');
    console.log('  1. Review HOSTINGER_DEPLOYMENT.md');
    console.log('  2. Upload files to Hostinger');
    console.log('  3. Install dependencies on server');
    console.log('  4. Restart server');
    console.log('  5. Test application at https://erp.enoterra.pl');
    
  } catch (error) {
    console.error('❌ Deployment preparation failed:', error);
  }
}

// Запускаем подготовку к деплою
prepareHostingerDeployment(); 