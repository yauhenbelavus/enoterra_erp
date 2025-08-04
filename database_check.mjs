import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'enoterra_erp.db');
const db = new sqlite3.Database(dbPath);

console.log('🗄️ Database path:', dbPath);
console.log('=== DATABASE STRUCTURE CHECK ===');

// Функция для проверки структуры таблицы
function checkTableStructure(tableName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, [], (err, columns) => {
      if (err) {
        console.error(`❌ Error checking ${tableName} structure:`, err);
        reject(err);
        return;
      }
      
      console.log(`\n📋 ${tableName.toUpperCase()} TABLE STRUCTURE:`);
      columns.forEach(col => {
        console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
      });
      resolve(columns);
    });
  });
}

// Функция для проверки данных в таблице
function checkTableData(tableName, limit = 5) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM ${tableName} LIMIT ${limit}`, [], (err, rows) => {
      if (err) {
        console.error(`❌ Error checking ${tableName} data:`, err);
        reject(err);
        return;
      }
      
      console.log(`\n📊 ${tableName.toUpperCase()} DATA (${rows.length} records):`);
      if (rows.length > 0) {
        console.log('Sample records:');
        rows.forEach((row, index) => {
          console.log(`  Record ${index + 1}:`, JSON.stringify(row, null, 2));
        });
      } else {
        console.log('  No data found');
      }
      resolve(rows);
    });
  });
}

// Главная функция проверки
async function checkDatabase() {
  try {
    console.log('🔍 Starting database check...');
    
    // Получаем список всех таблиц
    const tables = await new Promise((resolve, reject) => {
      db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
        if (err) {
          console.error('❌ Error getting tables:', err);
          reject(err);
        } else {
          console.log('\n📋 TABLES IN DATABASE:');
          tables.forEach(table => {
            console.log(`  - ${table.name}`);
          });
          resolve(tables);
        }
      });
    });
    
    // Проверяем структуру каждой таблицы
    for (const table of tables) {
      await checkTableStructure(table.name);
    }
    
    // Проверяем данные в основных таблицах
    const mainTables = ['orders', 'order_products', 'products', 'clients', 'working_sheets'];
    for (const tableName of mainTables) {
      if (tables.some(t => t.name === tableName)) {
        await checkTableData(tableName);
      }
    }
    
    console.log('\n✅ Database check completed successfully!');
    
  } catch (error) {
    console.error('❌ Database check failed:', error);
  } finally {
    db.close();
  }
}

// Запускаем проверку
checkDatabase(); 