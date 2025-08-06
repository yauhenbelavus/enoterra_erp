import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'enoterra_erp.db');
const db = new sqlite3.Database(dbPath);

console.log('🗄️ Database path:', dbPath);

// Функция для выполнения переименования
async function runRename(renameName, renameFunction) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔄 Running rename: ${renameName}`);
    renameFunction(db, resolve, reject);
  });
}

// Переименование 1: Переименование колонок в orders
function renameOrdersColumns(db, resolve, reject) {
  console.log('Renaming columns in orders table...');
  
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
    
    // Создаем новую таблицу с правильными именами колонок
    const createNewTableSQL = `
      CREATE TABLE orders_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        klient TEXT NOT NULL,
        numer_zamowienia TEXT NOT NULL,
        data_utworzenia DATETIME DEFAULT CURRENT_TIMESTAMP,
        laczna_ilosc INTEGER DEFAULT 0
      )
    `;
    
    db.run(createNewTableSQL, (err) => {
      if (err) {
        console.error('❌ Error creating new orders table:', err);
        reject(err);
        return;
      }
      
      console.log('✅ New orders table created');
      
      // Копируем данные с переименованием
      const copyDataSQL = `
        INSERT INTO orders_new (id, klient, numer_zamowienia, data_utworzenia, laczna_ilosc)
        SELECT 
          id,
          COALESCE(klient, 'Unknown'),
          COALESCE(numer_zamowienia, 'ORDER-' || id),
          COALESCE(data_utworzenia, CURRENT_TIMESTAMP),
          COALESCE(laczna_ilosc, 0)
        FROM orders
      `;
      
      db.run(copyDataSQL, (err) => {
        if (err) {
          console.error('❌ Error copying data to new table:', err);
          reject(err);
          return;
        }
        
        console.log('✅ Data copied to new table');
        
        // Удаляем старую таблицу и переименовываем новую
        db.run("DROP TABLE orders", (err) => {
          if (err) {
            console.error('❌ Error dropping old table:', err);
            reject(err);
            return;
          }
          
          db.run("ALTER TABLE orders_new RENAME TO orders", (err) => {
            if (err) {
              console.error('❌ Error renaming new table:', err);
              reject(err);
              return;
            }
            
            console.log('✅ Orders table successfully renamed');
            
            // Показываем новую структуру
            db.all("PRAGMA table_info(orders)", [], (err2, newColumns) => {
              if (!err2) {
                console.log('\nNew orders table structure:');
                newColumns.forEach(col => {
                  console.log(`  - ${col.name} (${col.type})`);
                });
              }
              resolve();
            });
          });
        });
      });
    });
  });
}

// Главная функция выполнения всех переименований
async function runAllRenames() {
  try {
    console.log('🚀 Starting column renames...');
    
    await runRename('Rename Orders Columns', renameOrdersColumns);
    
    console.log('\n✅ All renames completed successfully!');
    
  } catch (error) {
    console.error('❌ Renames failed:', error);
  } finally {
    db.close();
  }
}

// Запускаем переименования
runAllRenames(); 