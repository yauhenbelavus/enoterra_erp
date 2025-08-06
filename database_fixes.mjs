import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'enoterra_erp.db');
const db = new sqlite3.Database(dbPath);

console.log('🗄️ Database path:', dbPath);

// Функция для выполнения исправления
async function runFix(fixName, fixFunction) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔧 Running fix: ${fixName}`);
    fixFunction(db, resolve, reject);
  });
}

// Исправление 1: Исправление таблицы orders
function fixOrdersTable(db, resolve, reject) {
  console.log('Fixing orders table structure...');
  
  // Проверяем текущую структуру
  db.all("PRAGMA table_info(orders)", [], (err, columns) => {
    if (err) {
      console.error('❌ Error checking orders table structure:', err);
      reject(err);
      return;
    }
    
    console.log('Current orders table structure:');
    columns.forEach(col => {
      console.log(`  - ${col.name} (${col.type})`);
    });
    
    // Добавляем недостающие колонки
    const requiredColumns = [
      { name: 'numer_zamowienia', type: 'TEXT' },
      { name: 'data_utworzenia', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
      { name: 'laczna_ilosc', type: 'INTEGER DEFAULT 0' }
    ];
    
    let addedCount = 0;
    let totalChecks = requiredColumns.length;
    
    requiredColumns.forEach((col, index) => {
      const hasColumn = columns.some(c => c.name === col.name);
      
      if (!hasColumn) {
        db.run(`ALTER TABLE orders ADD COLUMN ${col.name} ${col.type}`, (err) => {
          if (err) {
            console.error(`❌ Error adding column ${col.name}:`, err);
          } else {
            console.log(`✅ Added column ${col.name}`);
            addedCount++;
          }
          
          if (index === totalChecks - 1) {
            console.log(`✅ Orders table fix completed. Added ${addedCount} columns.`);
            resolve();
          }
        });
      } else {
        console.log(`ℹ️ Column ${col.name} already exists`);
        if (index === totalChecks - 1) {
          console.log(`✅ Orders table fix completed. No changes needed.`);
          resolve();
        }
      }
    });
  });
}

// Исправление 2: Очистка и миграция данных
function cleanupAndMigrate(db, resolve, reject) {
  console.log('Cleaning up and migrating data...');
  
  // Удаляем дублирующиеся записи
  db.run("DELETE FROM orders WHERE id NOT IN (SELECT MIN(id) FROM orders GROUP BY numer_zamowienia)", (err) => {
    if (err) {
      console.error('❌ Error removing duplicate orders:', err);
    } else {
      console.log('✅ Removed duplicate orders');
    }
    
    // Обновляем laczna_ilosc
    db.run(`
      UPDATE orders 
      SET laczna_ilosc = (
        SELECT COALESCE(SUM(ilosc), 0) 
        FROM order_products 
        WHERE order_id = orders.id
      )
    `, (err) => {
      if (err) {
        console.error('❌ Error updating laczna_ilosc:', err);
      } else {
        console.log('✅ Updated laczna_ilosc for all orders');
      }
      
      // Обновляем данные клиентов
      db.run(`
        UPDATE orders 
        SET klient = (
          SELECT nazwa 
          FROM clients 
          WHERE clients.id = orders.id_klienta
        )
        WHERE id_klienta IS NOT NULL
      `, (err) => {
        if (err) {
          console.error('❌ Error updating client names:', err);
        } else {
          console.log('✅ Updated client names in orders');
        }
        
        resolve();
      });
    });
  });
}

// Исправление 3: Миграция orders klient
function migrateOrdersKlient(db, resolve, reject) {
  console.log('Migrating orders klient data...');
  
  // Проверяем, есть ли колонка id_klienta
  db.all("PRAGMA table_info(orders)", [], (err, columns) => {
    if (err) {
      console.error('❌ Error checking orders structure:', err);
      reject(err);
      return;
    }
    
    const hasIdKlienta = columns.some(col => col.name === 'id_klienta');
    
    if (!hasIdKlienta) {
      console.log('ℹ️ No id_klienta column found, migration not needed');
      resolve();
      return;
    }
    
    // Обновляем данные клиентов
    db.run(`
      UPDATE orders 
      SET klient = (
        SELECT nazwa 
        FROM clients 
        WHERE clients.id = orders.id_klienta
      )
      WHERE id_klienta IS NOT NULL AND klient IS NULL
    `, (err) => {
      if (err) {
        console.error('❌ Error migrating client data:', err);
        reject(err);
      } else {
        console.log('✅ Successfully migrated client data');
        resolve();
      }
    });
  });
}

// Исправление 4: Добавление laczna_ilosc
function addLacznaIloscField(db, resolve, reject) {
  console.log('Adding laczna_ilosc field to orders...');
  
  // Проверяем, есть ли колонка laczna_ilosc
  db.all("PRAGMA table_info(orders)", [], (err, columns) => {
    if (err) {
      console.error('❌ Error checking orders structure:', err);
      reject(err);
      return;
    }
    
    const hasLacznaIlosc = columns.some(col => col.name === 'laczna_ilosc');
    
    if (hasLacznaIlosc) {
      console.log('ℹ️ laczna_ilosc column already exists');
      resolve();
      return;
    }
    
    // Добавляем колонку
    db.run("ALTER TABLE orders ADD COLUMN laczna_ilosc INTEGER DEFAULT 0", (err) => {
      if (err) {
        console.error('❌ Error adding laczna_ilosc column:', err);
        reject(err);
      } else {
        console.log('✅ Added laczna_ilosc column');
        
        // Обновляем значения
        db.run(`
          UPDATE orders 
          SET laczna_ilosc = (
            SELECT COALESCE(SUM(ilosc), 0) 
            FROM order_products 
            WHERE order_id = orders.id
          )
        `, (err) => {
          if (err) {
            console.error('❌ Error updating laczna_ilosc values:', err);
          } else {
            console.log('✅ Updated laczna_ilosc values');
          }
          resolve();
        });
      }
    });
  });
}

// Исправление 5: Удаление колонки status
function removeStatusColumn(db, resolve, reject) {
  console.log('Removing status column from orders...');
  
  // Проверяем, есть ли колонка status
  db.all("PRAGMA table_info(orders)", [], (err, columns) => {
    if (err) {
      console.error('❌ Error checking orders structure:', err);
      reject(err);
      return;
    }
    
    const hasStatus = columns.some(col => col.name === 'status');
    
    if (!hasStatus) {
      console.log('ℹ️ Status column does not exist');
      resolve();
      return;
    }
    
    // Создаем временную таблицу без колонки status
    const createTempTableSQL = `
      CREATE TABLE orders_temp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        klient TEXT NOT NULL,
        numer_zamowienia TEXT NOT NULL,
        data_utworzenia DATETIME DEFAULT CURRENT_TIMESTAMP,
        laczna_ilosc INTEGER DEFAULT 0
      )
    `;
    
    db.run(createTempTableSQL, (err) => {
      if (err) {
        console.error('❌ Error creating temp table:', err);
        reject(err);
        return;
      }
      
      console.log('✅ Temp table created');
      
      // Копируем данные
      const copyDataSQL = `
        INSERT INTO orders_temp (id, klient, numer_zamowienia, data_utworzenia, laczna_ilosc)
        SELECT id, klient, numer_zamowienia, data_utworzenia, laczna_ilosc
        FROM orders
      `;
      
      db.run(copyDataSQL, (err) => {
        if (err) {
          console.error('❌ Error copying data:', err);
          reject(err);
          return;
        }
        
        console.log('✅ Data copied to temp table');
        
        // Удаляем старую таблицу и переименовываем новую
        db.run("DROP TABLE orders", (err) => {
          if (err) {
            console.error('❌ Error dropping old table:', err);
            reject(err);
            return;
          }
          
          db.run("ALTER TABLE orders_temp RENAME TO orders", (err) => {
            if (err) {
              console.error('❌ Error renaming temp table:', err);
              reject(err);
              return;
            }
            
            console.log('✅ Status column successfully removed');
            resolve();
          });
        });
      });
    });
  });
}

// Главная функция выполнения всех исправлений
async function runAllFixes() {
  try {
    console.log('🚀 Starting database fixes...');
    
    await runFix('Fix Orders Table', fixOrdersTable);
    await runFix('Cleanup and Migrate', cleanupAndMigrate);
    await runFix('Migrate Orders Klient', migrateOrdersKlient);
    await runFix('Add Laczna Ilosc Field', addLacznaIloscField);
    await runFix('Remove Status Column', removeStatusColumn);
    
    console.log('\n✅ All fixes completed successfully!');
    
  } catch (error) {
    console.error('❌ Fixes failed:', error);
  } finally {
    db.close();
  }
}

// Запускаем исправления
runAllFixes(); 