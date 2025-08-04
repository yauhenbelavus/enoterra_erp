import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Checking deployment status...');

// Функция для проверки локальных файлов
function checkLocalFiles() {
  console.log('\n📋 Checking local files that should be deployed:');
  
  const filesToCheck = [
    'dist/index.html',
    'dist/assets/index-C9elItbR.js',
    'dist/assets/index-Dvi_Fznr.css',
    'server/index.js',
    'server/package.json',
    'package.json'
  ];
  
  filesToCheck.forEach(file => {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      console.log(`✅ ${file} (${(stats.size / 1024).toFixed(1)}KB)`);
    } else {
      console.log(`❌ ${file} (MISSING)`);
    }
  });
}

// Функция для проверки API URL конфигурации
function checkApiConfiguration() {
  console.log('\n🔧 Checking API configuration:');
  
  try {
    const configPath = path.join(__dirname, 'src/config.ts');
    const appPath = path.join(__dirname, 'src/App.tsx');
    
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8');
      console.log('📄 src/config.ts content:');
      console.log(configContent);
    }
    
    if (fs.existsSync(appPath)) {
      const appContent = fs.readFileSync(appPath, 'utf8');
      const apiUrlMatch = appContent.match(/const API_URL = ([^;]+);/);
      if (apiUrlMatch) {
        console.log('📄 API_URL in App.tsx:', apiUrlMatch[1]);
      }
    }
  } catch (error) {
    console.error('❌ Error reading configuration files:', error);
  }
}

// Функция для проверки серверной конфигурации
function checkServerConfiguration() {
  console.log('\n🖥️ Checking server configuration:');
  
  try {
    const serverPath = path.join(__dirname, 'server/index.js');
    if (fs.existsSync(serverPath)) {
      const serverContent = fs.readFileSync(serverPath, 'utf8');
      
      // Проверяем настройки статических файлов
      const staticMatch = serverContent.match(/express\.static\(([^)]+)\)/g);
      if (staticMatch) {
        console.log('✅ Static file serving configured:');
        staticMatch.forEach(match => console.log(`  - ${match}`));
      } else {
        console.log('❌ No static file serving configured');
      }
      
      // Проверяем fallback для SPA
      const fallbackMatch = serverContent.match(/app\.get\('\\*',/);
      if (fallbackMatch) {
        console.log('✅ SPA fallback configured');
      } else {
        console.log('❌ SPA fallback not configured');
      }
      
      // Проверяем CORS настройки
      const corsMatch = serverContent.match(/cors\(([^)]+)\)/);
      if (corsMatch) {
        console.log('✅ CORS configured');
      } else {
        console.log('❌ CORS not configured');
      }
    }
  } catch (error) {
    console.error('❌ Error reading server configuration:', error);
  }
}

// Функция для создания команд для проверки сервера
function createServerCheckCommands() {
  console.log('\n📋 Commands to check server deployment:');
  console.log('\n# Connect to server:');
  console.log('ssh your_username@your_hostinger_server.com');
  
  console.log('\n# Check file structure:');
  console.log('cd public_html');
  console.log('ls -la');
  console.log('ls -la dist/');
  console.log('ls -la server/');
  
  console.log('\n# Check server logs:');
  console.log('pm2 logs enoterra_erp');
  console.log('pm2 status enoterra_erp');
  
  console.log('\n# Check if server is running:');
  console.log('netstat -tlnp | grep :3000');
  
  console.log('\n# Test API endpoints:');
  console.log('curl https://erp.enoterra.pl/api/health');
  console.log('curl https://erp.enoterra.pl/');
}

// Главная функция
function checkDeployment() {
  console.log('🚀 Deployment Status Check');
  console.log('========================');
  
  checkLocalFiles();
  checkApiConfiguration();
  checkServerConfiguration();
  createServerCheckCommands();
  
  console.log('\n🎯 Next steps:');
  console.log('1. Run the server check commands above');
  console.log('2. Check GitHub Actions logs');
  console.log('3. Test the application at https://erp.enoterra.pl');
  console.log('4. Check API at https://erp.enoterra.pl/api/health');
}

// Запускаем проверку
checkDeployment(); 