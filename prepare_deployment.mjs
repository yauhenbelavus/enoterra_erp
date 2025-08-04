import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting deployment preparation...');

// Функция для проверки и создания необходимых папок
function ensureDirectories() {
  console.log('\n📁 Ensuring directories exist...');
  
  const directories = [
    'server/uploads',
    'server/fonts',
    'dist'
  ];
  
  directories.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    } else {
      console.log(`ℹ️ Directory exists: ${dir}`);
    }
  });
}

// Функция для проверки конфигурационных файлов
function checkConfigFiles() {
  console.log('\n📋 Checking configuration files...');
  
  const requiredFiles = [
    'package.json',
    'vite.config.ts',
    'tailwind.config.js',
    'tsconfig.json',
    'eslint.config.js',
    'index.html',
    'server/package.json',
    'server/index.js'
  ];
  
  const missingFiles = [];
  
  requiredFiles.forEach(file => {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      console.log(`✅ Found: ${file}`);
    } else {
      console.log(`❌ Missing: ${file}`);
      missingFiles.push(file);
    }
  });
  
  if (missingFiles.length > 0) {
    console.log(`\n⚠️ Missing files: ${missingFiles.join(', ')}`);
  } else {
    console.log('\n✅ All required configuration files found');
  }
  
  return missingFiles.length === 0;
}

// Функция для проверки зависимостей
function checkDependencies() {
  console.log('\n📦 Checking dependencies...');
  
  const packageJsonPath = path.join(__dirname, 'package.json');
  const serverPackageJsonPath = path.join(__dirname, 'server', 'package.json');
  
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    console.log(`✅ Root package.json found with ${Object.keys(packageJson.dependencies || {}).length} dependencies`);
  }
  
  if (fs.existsSync(serverPackageJsonPath)) {
    const serverPackageJson = JSON.parse(fs.readFileSync(serverPackageJsonPath, 'utf8'));
    console.log(`✅ Server package.json found with ${Object.keys(serverPackageJson.dependencies || {}).length} dependencies`);
  }
}

// Функция для создания .env файла если его нет
function createEnvFile() {
  console.log('\n🔧 Checking environment configuration...');
  
  const envPath = path.join(__dirname, '.env');
  const envExamplePath = path.join(__dirname, '.env.example');
  
  if (!fs.existsSync(envPath)) {
    const envContent = `# Database Configuration
DB_PATH=./enoterra_erp.db

# Server Configuration
PORT=3001
NODE_ENV=production

# Client Configuration
VITE_API_URL=http://localhost:3001
`;
    
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Created .env file');
  } else {
    console.log('ℹ️ .env file already exists');
  }
  
  if (!fs.existsSync(envExamplePath)) {
    const envExampleContent = `# Database Configuration
DB_PATH=./enoterra_erp.db

# Server Configuration
PORT=3001
NODE_ENV=development

# Client Configuration
VITE_API_URL=http://localhost:3001
`;
    
    fs.writeFileSync(envExamplePath, envExampleContent);
    console.log('✅ Created .env.example file');
  } else {
    console.log('ℹ️ .env.example file already exists');
  }
}

// Функция для проверки базы данных
function checkDatabase() {
  console.log('\n🗄️ Checking database files...');
  
  const dbPaths = [
    path.join(__dirname, 'enoterra_erp.db'),
    path.join(__dirname, 'server', 'enoterra_erp.db')
  ];
  
  dbPaths.forEach((dbPath, index) => {
    const dbName = index === 0 ? 'Root Database' : 'Server Database';
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      console.log(`✅ ${dbName} exists (${(stats.size / 1024).toFixed(2)} KB)`);
    } else {
      console.log(`❌ ${dbName} missing`);
    }
  });
}

// Функция для создания README для деплоя
function createDeploymentReadme() {
  console.log('\n📝 Creating deployment README...');
  
  const deploymentReadme = `# Deployment Guide

## 🚀 Quick Start

### 1. Install Dependencies
\`\`\`bash
npm install
cd server && npm install
\`\`\`

### 2. Prepare Database
\`\`\`bash
node clean_database.mjs
\`\`\`

### 3. Build Application
\`\`\`bash
npm run build
\`\`\`

### 4. Start Server
\`\`\`bash
cd server && npm start
\`\`\`

### 5. Access Application
Open http://localhost:3001 in your browser

## 📁 Project Structure

\`\`\`
enoterra_erp/
├── src/                    # React application
├── server/                 # Express server
│   ├── index.js           # Main server file
│   ├── enoterra_erp.db   # Database
│   └── uploads/           # File uploads
├── dist/                   # Built application
├── database_*.mjs         # Database utilities
└── package.json           # Dependencies
\`\`\`

## 🔧 Configuration

- **Database**: SQLite (enoterra_erp.db)
- **Server**: Express.js (port 3001)
- **Client**: React + Vite
- **Styling**: Tailwind CSS

## 📋 Environment Variables

Create a \`.env\` file with:
\`\`\`
DB_PATH=./enoterra_erp.db
PORT=3001
NODE_ENV=production
VITE_API_URL=http://localhost:3001
\`\`\`

## 🗄️ Database Tables

- \`clients\` - Client information
- \`products\` - Product catalog
- \`orders\` - Order management
- \`order_products\` - Products in orders
- \`working_sheets\` - Daily work records
- \`product_receipts\` - Receipt tracking

## 🛠️ Development

\`\`\`bash
# Start development server
npm run dev

# Start backend server
cd server && npm run dev

# Check database structure
node database_check.mjs
\`\`\`

## 📦 Production Deployment

1. Build the application: \`npm run build\`
2. Start the server: \`cd server && npm start\`
3. Configure reverse proxy (nginx/apache) if needed
4. Set up SSL certificates for HTTPS

## 🔍 Troubleshooting

- **Database errors**: Run \`node clean_database.mjs\`
- **Port conflicts**: Change PORT in .env file
- **Build errors**: Check Node.js version (>=16)
- **Missing dependencies**: Run \`npm install\` in both root and server directories
`;

  fs.writeFileSync(path.join(__dirname, 'DEPLOYMENT.md'), deploymentReadme);
  console.log('✅ Created DEPLOYMENT.md');
}

// Функция для проверки скриптов
function checkScripts() {
  console.log('\n📜 Checking utility scripts...');
  
  const scripts = [
    'clean_database.mjs',
    'database_check.mjs',
    'database_migrations.mjs',
    'data_updates.mjs',
    'database_fixes.mjs',
    'rename_columns.mjs'
  ];
  
  scripts.forEach(script => {
    const scriptPath = path.join(__dirname, script);
    if (fs.existsSync(scriptPath)) {
      console.log(`✅ Found: ${script}`);
    } else {
      console.log(`❌ Missing: ${script}`);
    }
  });
}

// Главная функция
async function prepareDeployment() {
  try {
    console.log('🚀 Starting deployment preparation...');
    
    // Проверяем и создаем директории
    ensureDirectories();
    
    // Проверяем конфигурационные файлы
    const configOk = checkConfigFiles();
    
    // Проверяем зависимости
    checkDependencies();
    
    // Создаем .env файлы
    createEnvFile();
    
    // Проверяем базу данных
    checkDatabase();
    
    // Проверяем скрипты
    checkScripts();
    
    // Создаем README для деплоя
    createDeploymentReadme();
    
    console.log('\n🎉 Deployment preparation completed!');
    console.log('\n📋 Next steps:');
    console.log('  1. Run: node clean_database.mjs');
    console.log('  2. Run: npm install');
    console.log('  3. Run: cd server && npm install');
    console.log('  4. Run: npm run build');
    console.log('  5. Run: cd server && npm start');
    console.log('  6. Open http://localhost:3001');
    
    if (!configOk) {
      console.log('\n⚠️ Some configuration files are missing. Please check the list above.');
    }
    
  } catch (error) {
    console.error('❌ Deployment preparation failed:', error);
  }
}

// Запускаем подготовку к деплою
prepareDeployment(); 