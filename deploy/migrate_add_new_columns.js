const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Путь к базе данных
const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');

console.log('🔄 Starting migration: Add new columns to database...');
console.log('📁 Database path:', dbPath);

// Проверяем существование файла базы данных
const fs = require('fs');
if (!fs.existsSync(dbPath)) {
  console.error('❌ Database file not found:', dbPath);
  process.exit(1);
}

// Подключаемся к базе данных
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

// Функция для проверки существования колонки
function hasColumn(tableName, columnName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
      if (err) {
        reject(err);
      } else {
        const exists = columns.some(col => col.name === columnName);
        resolve(exists);
      }
    });
  });
}

// Функция для добавления колонки
function addColumn(tableName, columnName, columnType, defaultValue) {
  return new Promise((resolve, reject) => {
    const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType} DEFAULT ${defaultValue}`;
    db.run(sql, (err) => {
      if (err) {
        reject(err);
      } else {
        console.log(`✅ Added column ${columnName} to ${tableName}`);
        resolve();
      }
    });
  });
}

// Выполняем миграцию
db.serialize(async () => {
  console.log('🔄 Starting migration process...');
  
  try {
    // 1. Добавляем колонки в product_receipts
    console.log('\n📊 Checking product_receipts table...');
    
    if (!(await hasColumn('product_receipts', 'aktualny_kurs'))) {
      await addColumn('product_receipts', 'aktualny_kurs', 'REAL', '1');
    } else {
      console.log('⏭️  Column aktualny_kurs already exists in product_receipts');
    }
    
    if (!(await hasColumn('product_receipts', 'podatek_akcyzowy'))) {
      await addColumn('product_receipts', 'podatek_akcyzowy', 'REAL', '0');
    } else {
      console.log('⏭️  Column podatek_akcyzowy already exists in product_receipts');
    }
    
    // 2. Добавляем колонки в working_sheets
    console.log('\n📊 Checking working_sheets table...');
    
    if (!(await hasColumn('working_sheets', 'koszt_dostawy_per_unit'))) {
      await addColumn('working_sheets', 'koszt_dostawy_per_unit', 'REAL', '0');
    } else {
      console.log('⏭️  Column koszt_dostawy_per_unit already exists in working_sheets');
    }
    
    if (!(await hasColumn('working_sheets', 'podatek_akcyzowy'))) {
      await addColumn('working_sheets', 'podatek_akcyzowy', 'REAL', '0');
    } else {
      console.log('⏭️  Column podatek_akcyzowy already exists in working_sheets');
    }
    
    if (!(await hasColumn('working_sheets', 'koszt_wlasny'))) {
      await addColumn('working_sheets', 'koszt_wlasny', 'REAL', '0');
    } else {
      console.log('⏭️  Column koszt_wlasny already exists in working_sheets');
    }
    
    // 3. Проверяем таблицу working_sheets_history
    console.log('\n📊 Checking working_sheets_history table...');
    
    // Проверяем, существует ли таблица
    const tableExists = await new Promise((resolve, reject) => {
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='working_sheets_history'", (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });
    
    if (!tableExists) {
      console.log('📝 Creating working_sheets_history table...');
      await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE working_sheets_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kod TEXT NOT NULL,
          nazwa TEXT,
          ilosc INTEGER,
          kod_kreskowy TEXT,
          typ TEXT,
          sprzedawca TEXT,
          cena REAL,
          data_waznosci TEXT,
          objetosc REAL,
          koszt_dostawy_per_unit REAL,
          podatek_akcyzowy REAL,
          koszt_wlasny REAL,
          action TEXT NOT NULL,
          receipt_id INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (receipt_id) REFERENCES product_receipts (id)
        )`, (err) => {
          if (err) reject(err);
          else {
            console.log('✅ working_sheets_history table created');
            resolve();
          }
        });
      });
      
      // Создаём индексы
      await new Promise((resolve, reject) => {
        db.run(`
          CREATE INDEX IF NOT EXISTS idx_working_sheets_history_kod ON working_sheets_history(kod);
          CREATE INDEX IF NOT EXISTS idx_working_sheets_history_receipt_id ON working_sheets_history(receipt_id);
          CREATE INDEX IF NOT EXISTS idx_working_sheets_history_action ON working_sheets_history(action);
        `, (err) => {
          if (err) reject(err);
          else {
            console.log('✅ Indexes created for working_sheets_history');
            resolve();
          }
        });
      });
    } else {
      console.log('⏭️  Table working_sheets_history already exists');
      
      // Проверяем и добавляем недостающие колонки
      if (!(await hasColumn('working_sheets_history', 'koszt_dostawy_per_unit'))) {
        await addColumn('working_sheets_history', 'koszt_dostawy_per_unit', 'REAL', '0');
      } else {
        console.log('⏭️  Column koszt_dostawy_per_unit already exists in working_sheets_history');
      }
      
      if (!(await hasColumn('working_sheets_history', 'podatek_akcyzowy'))) {
        await addColumn('working_sheets_history', 'podatek_akcyzowy', 'REAL', '0');
      } else {
        console.log('⏭️  Column podatek_akcyzowy already exists in working_sheets_history');
      }
      
      if (!(await hasColumn('working_sheets_history', 'koszt_wlasny'))) {
        await addColumn('working_sheets_history', 'koszt_wlasny', 'REAL', '0');
      } else {
        console.log('⏭️  Column koszt_wlasny already exists in working_sheets_history');
      }
    }
    
    // 4. Проверяем структуру всех таблиц
    console.log('\n🔍 Verifying table structures...');
    
    const tables = ['product_receipts', 'working_sheets', 'working_sheets_history'];
    for (const table of tables) {
      const columns = await new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${table})`, (err, cols) => {
          if (err) reject(err);
          else resolve(cols);
        });
      });
      
      console.log(`\n📋 ${table} columns:`);
      columns.forEach(col => {
        console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value !== null ? `DEFAULT ${col.dflt_value}` : ''}`);
      });
    }
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📝 Summary of changes:');
    console.log('  ✅ product_receipts: aktualny_kurs, podatek_akcyzowy');
    console.log('  ✅ working_sheets: koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny');
    console.log('  ✅ working_sheets_history: all required columns');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    // Закрываем соединение
    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err.message);
      } else {
        console.log('\n🔒 Database connection closed');
      }
      console.log('\n📝 Next steps:');
      console.log('  1. Restart your server');
      console.log('  2. Test the new functionality');
      console.log('  3. Run migrate_working_sheets_to_products.js if needed');
    });
  }
});

// Обработка ошибок
db.on('error', (err) => {
  console.error('❌ Database error:', err.message);
});

