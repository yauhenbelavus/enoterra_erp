import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'enoterra_erp.db');
const serverDbPath = path.join(__dirname, 'server', 'enoterra_erp.db');

console.log('🗄️ Database paths:');
console.log('  - Root DB:', dbPath);
console.log('  - Server DB:', serverDbPath);

// Функция для очистки базы данных
async function cleanDatabase(dbPath, dbName) {
  return new Promise((resolve, reject) => {
    console.log(`\n🧹 Cleaning ${dbName}...`);
    
    const db = new sqlite3.Database(dbPath);
    
    // Получаем список всех таблиц
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error(`❌ Error getting tables from ${dbName}:`, err);
        reject(err);
        return;
      }
      
      console.log(`📋 Found ${tables.length} tables in ${dbName}:`);
      tables.forEach(table => {
        console.log(`  - ${table.name}`);
      });
      
      if (tables.length === 0) {
        console.log(`ℹ️ No tables found in ${dbName}`);
        db.close();
        resolve();
        return;
      }
      
      // Удаляем все таблицы
      let deletedCount = 0;
      let totalTables = tables.length;
      
      tables.forEach((table, index) => {
        db.run(`DROP TABLE IF EXISTS ${table.name}`, (err) => {
          if (err) {
            console.error(`❌ Error dropping table ${table.name}:`, err);
          } else {
            console.log(`✅ Dropped table: ${table.name}`);
            deletedCount++;
          }
          
          if (index === totalTables - 1) {
            console.log(`✅ Cleaned ${dbName}: deleted ${deletedCount} tables`);
            db.close();
            resolve();
          }
        });
      });
    });
  });
}

// Функция для создания чистой структуры базы данных
async function createCleanStructure(dbPath, dbName) {
  return new Promise((resolve, reject) => {
    console.log(`\n🏗️ Creating clean structure for ${dbName}...`);
    
    const db = new sqlite3.Database(dbPath);
    
    // Создаем таблицы с правильной структурой
    const createTablesSQL = [
      // Таблица клиентов
      `CREATE TABLE clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nazwa TEXT NOT NULL,
        firma TEXT,
        adres TEXT,
        kontakt TEXT,
        czas_dostawy TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Таблица продуктов
      `CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kod TEXT UNIQUE NOT NULL,
        nazwa TEXT NOT NULL,
        kod_kreskowy TEXT,
        cena REAL DEFAULT 0,
        cena_sprzedazy REAL DEFAULT 0,
        ilosc INTEGER DEFAULT 0,
        data_waznosci DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Таблица заказов
      `CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        klient TEXT NOT NULL,
        numer_zamowienia TEXT UNIQUE NOT NULL,
        data_utworzenia DATETIME DEFAULT CURRENT_TIMESTAMP,
        laczna_ilosc INTEGER DEFAULT 0
      )`,
      
      // Таблица продуктов в заказах
      `CREATE TABLE order_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER,
        kod TEXT NOT NULL,
        nazwa TEXT NOT NULL,
        kod_kreskowy TEXT,
        ilosc INTEGER NOT NULL,
        typ TEXT DEFAULT 'sprzedaz',
        product_kod TEXT,
        FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
      )`,
      
      // Таблица рабочих листов
      `CREATE TABLE working_sheets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data DATE NOT NULL,
        produkt_id INTEGER,
        kod TEXT NOT NULL,
        nazwa TEXT NOT NULL,
        ilosc INTEGER NOT NULL,
        typ TEXT DEFAULT 'sprzedaz',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (produkt_id) REFERENCES products (id) ON DELETE SET NULL
      )`,
      
      // Таблица квитанций
      `CREATE TABLE product_receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data DATE NOT NULL,
        produkt_id INTEGER,
        kod TEXT NOT NULL,
        nazwa TEXT NOT NULL,
        ilosc INTEGER NOT NULL,
        wartosc REAL DEFAULT 0,
        koszt_dostawy REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (produkt_id) REFERENCES products (id) ON DELETE SET NULL
      )`
    ];
    
    let createdCount = 0;
    let totalTables = createTablesSQL.length;
    
    createTablesSQL.forEach((sql, index) => {
      db.run(sql, (err) => {
        if (err) {
          console.error(`❌ Error creating table ${index + 1}:`, err);
        } else {
          console.log(`✅ Created table ${index + 1}`);
          createdCount++;
        }
        
        if (index === totalTables - 1) {
          console.log(`✅ Created ${createdCount} tables in ${dbName}`);
          
          // Показываем структуру созданных таблиц
          db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
            if (!err) {
              console.log(`\n📋 Tables in ${dbName}:`);
              tables.forEach(table => {
                console.log(`  - ${table.name}`);
              });
            }
            db.close();
            resolve();
          });
        }
      });
    });
  });
}

// Функция для создания индексов
async function createIndexes(dbPath, dbName) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔍 Creating indexes for ${dbName}...`);
    
    const db = new sqlite3.Database(dbPath);
    
    const indexesSQL = [
      'CREATE INDEX IF NOT EXISTS idx_products_kod ON products(kod)',
      'CREATE INDEX IF NOT EXISTS idx_products_kod_kreskowy ON products(kod_kreskowy)',
      'CREATE INDEX IF NOT EXISTS idx_orders_numer_zamowienia ON orders(numer_zamowienia)',
      'CREATE INDEX IF NOT EXISTS idx_orders_klient ON orders(klient)',
      'CREATE INDEX IF NOT EXISTS idx_order_products_order_id ON order_products(order_id)',
      'CREATE INDEX IF NOT EXISTS idx_order_products_kod ON order_products(kod)',
      'CREATE INDEX IF NOT EXISTS idx_working_sheets_data ON working_sheets(data)',
      'CREATE INDEX IF NOT EXISTS idx_working_sheets_kod ON working_sheets(kod)',
      'CREATE INDEX IF NOT EXISTS idx_product_receipts_data ON product_receipts(data)',
      'CREATE INDEX IF NOT EXISTS idx_product_receipts_kod ON product_receipts(kod)'
    ];
    
    let createdCount = 0;
    let totalIndexes = indexesSQL.length;
    
    indexesSQL.forEach((sql, index) => {
      db.run(sql, (err) => {
        if (err) {
          console.error(`❌ Error creating index ${index + 1}:`, err);
        } else {
          console.log(`✅ Created index ${index + 1}`);
          createdCount++;
        }
        
        if (index === totalIndexes - 1) {
          console.log(`✅ Created ${createdCount} indexes in ${dbName}`);
          db.close();
          resolve();
        }
      });
    });
  });
}

// Функция для проверки структуры
async function verifyStructure(dbPath, dbName) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔍 Verifying structure of ${dbName}...`);
    
    const db = new sqlite3.Database(dbPath);
    
    // Получаем список всех таблиц
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error(`❌ Error getting tables from ${dbName}:`, err);
        reject(err);
        return;
      }
      
      console.log(`📋 Tables in ${dbName}:`);
      tables.forEach(table => {
        console.log(`  - ${table.name}`);
      });
      
      // Проверяем структуру каждой таблицы
      let tableIndex = 0;
      tables.forEach(table => {
        db.all(`PRAGMA table_info(${table.name})`, [], (err, columns) => {
          if (err) {
            console.error(`❌ Error checking structure of ${table.name}:`, err);
          } else {
            console.log(`\n📋 Structure of ${table.name}:`);
            columns.forEach(col => {
              console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
            });
          }
          
          tableIndex++;
          if (tableIndex === tables.length) {
            console.log(`\n✅ Structure verification completed for ${dbName}`);
            db.close();
            resolve();
          }
        });
      });
    });
  });
}

// Главная функция
async function cleanAndPrepareDatabase() {
  try {
    console.log('🚀 Starting database cleanup and preparation...');
    
    // Проверяем существование файлов БД
    const rootDbExists = fs.existsSync(dbPath);
    const serverDbExists = fs.existsSync(serverDbPath);
    
    console.log('\n📁 Database files status:');
    console.log(`  - Root DB exists: ${rootDbExists}`);
    console.log(`  - Server DB exists: ${serverDbExists}`);
    
    // Очищаем корневую БД
    if (rootDbExists) {
      await cleanDatabase(dbPath, 'Root Database');
      await createCleanStructure(dbPath, 'Root Database');
      await createIndexes(dbPath, 'Root Database');
      await verifyStructure(dbPath, 'Root Database');
    }
    
    // Очищаем серверную БД
    if (serverDbExists) {
      await cleanDatabase(serverDbPath, 'Server Database');
      await createCleanStructure(serverDbPath, 'Server Database');
      await createIndexes(serverDbPath, 'Server Database');
      await verifyStructure(serverDbPath, 'Server Database');
    }
    
    console.log('\n🎉 Database cleanup and preparation completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('  1. Run the application: npm run dev');
    console.log('  2. Start the server: cd server && npm start');
    console.log('  3. The database is now clean and ready for deployment');
    
  } catch (error) {
    console.error('❌ Database cleanup failed:', error);
  }
}

// Запускаем очистку
cleanAndPrepareDatabase(); 