import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Путь к базе данных
const dbPath = path.join(__dirname, 'enoterra_erp.db');
const db = new sqlite3.Database(dbPath);

console.log('🗄️ Database path:', dbPath);

// Функция для выполнения миграции
async function runMigration(migrationName, migrationFunction) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔄 Running migration: ${migrationName}`);
    migrationFunction(db, resolve, reject);
  });
}

// Миграция 1: Добавление столбца status в orders
function addStatusColumn(db, resolve, reject) {
  db.all("PRAGMA table_info(orders)", [], (err, columns) => {
    if (err) {
      console.error('❌ Error checking orders table structure:', err);
      reject(err);
      return;
    }
    
    const hasStatus = columns.some(col => col.name === 'status');
    if (hasStatus) {
      console.log('ℹ️ Status column already exists in orders table');
      resolve();
      return;
    }
    
    db.run("ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending'", (err) => {
      if (err) {
        console.error('❌ Error adding status column:', err);
        reject(err);
      } else {
        console.log('✅ Status column successfully added to orders table');
        resolve();
      }
    });
  });
}

// Миграция 2: Добавление столбца created_at в orders
function addCreatedAtColumn(db, resolve, reject) {
  db.all("PRAGMA table_info(orders)", [], (err, columns) => {
    if (err) {
      console.error('❌ Error checking orders table structure:', err);
      reject(err);
      return;
    }
    
    const hasCreatedAt = columns.some(col => col.name === 'created_at');
    if (hasCreatedAt) {
      console.log('ℹ️ Created_at column already exists in orders table');
      resolve();
      return;
    }
    
    db.run("ALTER TABLE orders ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP", (err) => {
      if (err) {
        console.error('❌ Error adding created_at column:', err);
        reject(err);
      } else {
        console.log('✅ Created_at column successfully added to orders table');
        resolve();
      }
    });
  });
}

// Миграция 3: Добавление столбца product_kod в order_products
function addProductKodColumn(db, resolve, reject) {
  db.all("PRAGMA table_info(order_products)", [], (err, columns) => {
    if (err) {
      console.error('❌ Error checking order_products table structure:', err);
      reject(err);
      return;
    }
    
    const hasProductKod = columns.some(col => col.name === 'product_kod');
    if (hasProductKod) {
      console.log('ℹ️ Product_kod column already exists in order_products table');
      resolve();
      return;
    }
    
    db.run("ALTER TABLE order_products ADD COLUMN product_kod TEXT", (err) => {
      if (err) {
        console.error('❌ Error adding product_kod column:', err);
        reject(err);
      } else {
        console.log('✅ Product_kod column successfully added to order_products table');
        resolve();
      }
    });
  });
}

// Миграция 4: Добавление столбца typ в order_products
function addTypColumn(db, resolve, reject) {
  db.all("PRAGMA table_info(order_products)", [], (err, columns) => {
    if (err) {
      console.error('❌ Error checking order_products table structure:', err);
      reject(err);
      return;
    }
    
    const hasTyp = columns.some(col => col.name === 'typ');
    if (hasTyp) {
      console.log('ℹ️ Typ column already exists in order_products table');
      resolve();
      return;
    }
    
    db.run("ALTER TABLE order_products ADD COLUMN typ TEXT", (err) => {
      if (err) {
        console.error('❌ Error adding typ column:', err);
        reject(err);
      } else {
        console.log('✅ Typ column successfully added to order_products table');
        resolve();
      }
    });
  });
}

// Миграция 5: Добавление столбца typ в working_sheets
function addTypColumnToWorkingSheets(db, resolve, reject) {
  db.all("PRAGMA table_info(working_sheets)", [], (err, columns) => {
    if (err) {
      console.error('❌ Error checking working_sheets table structure:', err);
      reject(err);
      return;
    }
    
    const hasTyp = columns.some(col => col.name === 'typ');
    if (hasTyp) {
      console.log('ℹ️ Typ column already exists in working_sheets table');
      resolve();
      return;
    }
    
    db.run("ALTER TABLE working_sheets ADD COLUMN typ TEXT", (err) => {
      if (err) {
        console.error('❌ Error adding typ column to working_sheets:', err);
        reject(err);
      } else {
        console.log('✅ Typ column successfully added to working_sheets table');
        resolve();
      }
    });
  });
}

// Главная функция выполнения всех миграций
async function runAllMigrations() {
  try {
    console.log('🚀 Starting database migrations...');
    
    await runMigration('Add Status Column', addStatusColumn);
    await runMigration('Add Created At Column', addCreatedAtColumn);
    await runMigration('Add Product Kod Column', addProductKodColumn);
    await runMigration('Add Typ Column to Order Products', addTypColumn);
    await runMigration('Add Typ Column to Working Sheets', addTypColumnToWorkingSheets);
    
    console.log('\n✅ All migrations completed successfully!');
    
    // Показываем финальную структуру таблиц
    console.log('\n📋 Final table structures:');
    
    db.all("PRAGMA table_info(orders)", [], (err, columns) => {
      if (!err) {
        console.log('\nOrders table:');
        columns.forEach(col => console.log(`  - ${col.name} (${col.type})`));
      }
      
      db.all("PRAGMA table_info(order_products)", [], (err2, columns2) => {
        if (!err2) {
          console.log('\nOrder_products table:');
          columns2.forEach(col => console.log(`  - ${col.name} (${col.type})`));
        }
        
        db.all("PRAGMA table_info(working_sheets)", [], (err3, columns3) => {
          if (!err3) {
            console.log('\nWorking_sheets table:');
            columns3.forEach(col => console.log(`  - ${col.name} (${col.type})`));
          }
          
          db.close();
          console.log('\n🎉 Database migration process completed!');
        });
      });
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    db.close();
  }
}

// Запускаем миграции
runAllMigrations(); 