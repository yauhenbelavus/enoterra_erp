import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Starting compatibility check...');

// Функция для проверки структуры БД
function checkDatabaseStructure(dbPath, dbName) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(dbPath)) {
      console.log(`❌ ${dbName} not found at: ${dbPath}`);
      resolve(null);
      return;
    }

    const db = new sqlite3.Database(dbPath);
    
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error(`❌ Error checking ${dbName}:`, err);
        reject(err);
        return;
      }
      
      console.log(`\n📋 ${dbName} tables:`);
      tables.forEach(table => {
        console.log(`  - ${table.name}`);
      });
      
      // Проверяем структуру каждой таблицы
      const tableStructures = {};
      let tableIndex = 0;
      
      tables.forEach(table => {
        db.all(`PRAGMA table_info(${table.name})`, [], (err, columns) => {
          if (err) {
            console.error(`❌ Error checking structure of ${table.name}:`, err);
          } else {
            tableStructures[table.name] = columns.map(col => ({
              name: col.name,
              type: col.type,
              notnull: col.notnull,
              pk: col.pk
            }));
          }
          
          tableIndex++;
          if (tableIndex === tables.length) {
            db.close();
            resolve(tableStructures);
          }
        });
      });
    });
  });
}

// Функция для сравнения структур БД
function compareDatabaseStructures(localStructure, productionStructure) {
  console.log('\n🔍 Comparing database structures...');
  
  if (!localStructure || !productionStructure) {
    console.log('⚠️ Cannot compare structures - one or both databases not found');
    return;
  }
  
  const localTables = Object.keys(localStructure);
  const productionTables = Object.keys(productionStructure);
  
  console.log(`\n📊 Table comparison:`);
  console.log(`  Local tables: ${localTables.length}`);
  console.log(`  Production tables: ${productionTables.length}`);
  
  // Проверяем отсутствующие таблицы
  const missingInProduction = localTables.filter(table => !productionTables.includes(table));
  const missingInLocal = productionTables.filter(table => !localTables.includes(table));
  
  if (missingInProduction.length > 0) {
    console.log(`\n❌ Tables missing in production: ${missingInProduction.join(', ')}`);
  }
  
  if (missingInLocal.length > 0) {
    console.log(`\n❌ Tables missing in local: ${missingInLocal.join(', ')}`);
  }
  
  // Проверяем общие таблицы
  const commonTables = localTables.filter(table => productionTables.includes(table));
  
  console.log(`\n✅ Common tables: ${commonTables.length}`);
  
  // Сравниваем структуру общих таблиц
  commonTables.forEach(tableName => {
    const localColumns = localStructure[tableName];
    const productionColumns = productionStructure[tableName];
    
    const localColumnNames = localColumns.map(col => col.name);
    const productionColumnNames = productionColumns.map(col => col.name);
    
    const missingInProduction = localColumnNames.filter(col => !productionColumnNames.includes(col));
    const missingInLocal = productionColumnNames.filter(col => !localColumnNames.includes(col));
    
    if (missingInProduction.length > 0 || missingInLocal.length > 0) {
      console.log(`\n⚠️ Differences in table '${tableName}':`);
      if (missingInProduction.length > 0) {
        console.log(`  Missing in production: ${missingInProduction.join(', ')}`);
      }
      if (missingInLocal.length > 0) {
        console.log(`  Missing in local: ${missingInLocal.join(', ')}`);
      }
    } else {
      console.log(`✅ Table '${tableName}' - structures match`);
    }
  });
}

// Функция для проверки конфигурации
function checkConfiguration() {
  console.log('\n🔧 Checking configuration...');
  
  const configFiles = [
    'package.json',
    'server/package.json',
    'vite.config.ts',
    'tailwind.config.js',
    'tsconfig.json'
  ];
  
  configFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ Found: ${file}`);
    } else {
      console.log(`❌ Missing: ${file}`);
    }
  });
}

// Функция для проверки зависимостей
function checkDependencies() {
  console.log('\n📦 Checking dependencies...');
  
  const packageJsonPath = path.join(__dirname, 'package.json');
  const serverPackageJsonPath = path.join(__dirname, 'server', 'package.json');
  
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    console.log(`✅ Root dependencies: ${Object.keys(packageJson.dependencies || {}).length}`);
  }
  
  if (fs.existsSync(serverPackageJsonPath)) {
    const serverPackageJson = JSON.parse(fs.readFileSync(serverPackageJsonPath, 'utf8'));
    console.log(`✅ Server dependencies: ${Object.keys(serverPackageJson.dependencies || {}).length}`);
  }
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
    'rename_columns.mjs',
    'prepare_deployment.mjs'
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

// Функция для создания отчета
function generateReport(localStructure, productionStructure) {
  console.log('\n📋 Generating compatibility report...');
  
  const report = {
    timestamp: new Date().toISOString(),
    localTables: localStructure ? Object.keys(localStructure).length : 0,
    productionTables: productionStructure ? Object.keys(productionStructure).length : 0,
    compatibility: 'unknown'
  };
  
  if (localStructure && productionStructure) {
    const localTables = Object.keys(localStructure);
    const productionTables = Object.keys(productionStructure);
    
    const missingInProduction = localTables.filter(table => !productionTables.includes(table));
    const missingInLocal = productionTables.filter(table => !localTables.includes(table));
    
    if (missingInProduction.length === 0 && missingInLocal.length === 0) {
      report.compatibility = 'full';
      console.log('✅ Full compatibility detected');
    } else {
      report.compatibility = 'partial';
      console.log('⚠️ Partial compatibility detected');
    }
  }
  
  // Сохраняем отчет
  const reportPath = path.join(__dirname, 'compatibility_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Report saved to: ${reportPath}`);
  
  return report;
}

// Главная функция
async function checkCompatibility() {
  try {
    console.log('🚀 Starting compatibility check...');
    
    // Пути к базам данных
    const localDbPath = path.join(__dirname, 'enoterra_erp.db');
    const serverDbPath = path.join(__dirname, 'server', 'enoterra_erp.db');
    
    console.log('\n🗄️ Database paths:');
    console.log(`  Local DB: ${localDbPath}`);
    console.log(`  Server DB: ${serverDbPath}`);
    
    // Проверяем структуру локальной БД
    const localStructure = await checkDatabaseStructure(localDbPath, 'Local Database');
    
    // Проверяем структуру серверной БД
    const serverStructure = await checkDatabaseStructure(serverDbPath, 'Server Database');
    
    // Сравниваем структуры
    compareDatabaseStructures(localStructure, serverStructure);
    
    // Проверяем конфигурацию
    checkConfiguration();
    
    // Проверяем зависимости
    checkDependencies();
    
    // Проверяем скрипты
    checkScripts();
    
    // Генерируем отчет
    const report = generateReport(localStructure, serverStructure);
    
    console.log('\n🎉 Compatibility check completed!');
    console.log('\n📋 Summary:');
    console.log(`  Local tables: ${report.localTables}`);
    console.log(`  Production tables: ${report.productionTables}`);
    console.log(`  Compatibility: ${report.compatibility}`);
    
    if (report.compatibility === 'full') {
      console.log('\n✅ Safe to deploy - full compatibility');
    } else if (report.compatibility === 'partial') {
      console.log('\n⚠️ Partial compatibility - review differences before deployment');
    } else {
      console.log('\n❌ Cannot determine compatibility - check database structures');
    }
    
  } catch (error) {
    console.error('❌ Compatibility check failed:', error);
  }
}

// Запускаем проверку совместимости
checkCompatibility(); 