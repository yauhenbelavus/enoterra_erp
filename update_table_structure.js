import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');
console.log('🗄️ Обновление структуры таблиц:', dbPath);

const db = new sqlite3.Database(dbPath);

// Обновляем структуру таблиц на основе интерфейсов из фронтенда
db.serialize(() => {
  console.log('📋 Обновляем структуру таблиц...');
  
  // Обновляем таблицу products с полной структурой
  console.log('🔄 Обновляем таблицу products...');
  db.run(`DROP TABLE IF EXISTS products`);
  db.run(`CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kod TEXT UNIQUE NOT NULL,
    nazwa TEXT NOT NULL,
    ilosc INTEGER DEFAULT 0,
    jednostka_miary TEXT,
    kod_kreskowy TEXT,
    data_waznosci INTEGER,
    archiwalny INTEGER DEFAULT 0,
    rezerwacje INTEGER DEFAULT 0,
    ilosc_na_poleceniach INTEGER DEFAULT 0,
    waga_netto REAL,
    waga_brutto REAL,
    objetosc REAL,
    opis TEXT,
    cena REAL DEFAULT 0,
    cena_sprzedazy REAL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Обновляем таблицу clients
  console.log('🔄 Обновляем таблицу clients...');
  db.run(`DROP TABLE IF EXISTS clients`);
  db.run(`CREATE TABLE clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nazwa TEXT NOT NULL,
    firma TEXT,
    adres TEXT,
    kontakt TEXT,
    czas_dostawy TEXT,
    email TEXT,
    telefon TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Обновляем таблицу orders
  console.log('🔄 Обновляем таблицу orders...');
  db.run(`DROP TABLE IF EXISTS orders`);
  db.run(`CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    klient TEXT NOT NULL,
    numer_zamowienia TEXT UNIQUE NOT NULL,
    data_zamowienia TEXT,
    status TEXT DEFAULT 'pending',
    laczna_ilosc INTEGER DEFAULT 0,
    data_utworzenia DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Обновляем таблицу order_products
  console.log('🔄 Обновляем таблицу order_products...');
  db.run(`DROP TABLE IF EXISTS order_products`);
  db.run(`CREATE TABLE order_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER,
    kod TEXT NOT NULL,
    nazwa TEXT NOT NULL,
    kod_kreskowy TEXT,
    ilosc INTEGER NOT NULL,
    typ TEXT DEFAULT 'sprzedaz',
    product_kod TEXT,
    cena REAL DEFAULT 0,
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
  )`);

  // Обновляем таблицу working_sheets
  console.log('🔄 Обновляем таблицу working_sheets...');
  db.run(`DROP TABLE IF EXISTS working_sheets`);
  db.run(`CREATE TABLE working_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data DATE NOT NULL,
    produkt_id INTEGER,
    kod TEXT NOT NULL,
    nazwa TEXT NOT NULL,
    ilosc INTEGER NOT NULL,
    typ TEXT DEFAULT 'sprzedaz',
    jednostka_miary TEXT,
    kod_kreskowy TEXT,
    data_waznosci INTEGER,
    archiwalny INTEGER DEFAULT 0,
    rezerwacje INTEGER DEFAULT 0,
    ilosc_na_poleceniach INTEGER DEFAULT 0,
    waga_netto REAL,
    waga_brutto REAL,
    objetosc REAL,
    opis TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (produkt_id) REFERENCES products (id) ON DELETE SET NULL
  )`);

  // Обновляем таблицу product_receipts
  console.log('🔄 Обновляем таблицу product_receipts...');
  db.run(`DROP TABLE IF EXISTS product_receipts`);
  db.run(`CREATE TABLE product_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data DATE NOT NULL,
    produkt_id INTEGER,
    kod TEXT NOT NULL,
    nazwa TEXT NOT NULL,
    ilosc INTEGER NOT NULL,
    wartosc REAL DEFAULT 0,
    koszt_dostawy REAL DEFAULT 0,
    sprzedawca TEXT,
    numer_faktury TEXT,
    uwagi TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (produkt_id) REFERENCES products (id) ON DELETE SET NULL
  )`);

  // Обновляем таблицу original_sheets
  console.log('🔄 Обновляем таблицу original_sheets...');
  db.run(`DROP TABLE IF EXISTS original_sheets`);
  db.run(`CREATE TABLE original_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Обновляем таблицу price_history
  console.log('🔄 Обновляем таблицу price_history...');
  db.run(`DROP TABLE IF EXISTS price_history`);
  db.run(`CREATE TABLE price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    kod TEXT NOT NULL,
    nazwa TEXT NOT NULL,
    cena REAL NOT NULL,
    data_zmiany DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
  )`);

  // Обновляем таблицу product_prices
  console.log('🔄 Обновляем таблицу product_prices...');
  db.run(`DROP TABLE IF EXISTS product_prices`);
  db.run(`CREATE TABLE product_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kod TEXT UNIQUE NOT NULL,
    nazwa TEXT NOT NULL,
    cena REAL DEFAULT 0,
    cena_sprzedazy REAL DEFAULT 0,
    data_aktualizacji TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  console.log('✅ Структура таблиц обновлена');
  
  // Проверяем структуру
  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      console.error('❌ Ошибка при получении таблиц:', err.message);
    } else {
      console.log('\n📋 Обновленные таблицы:');
      tables.forEach(table => {
        console.log(`   - ${table.name}`);
      });
    }
    
    console.log('\n🏁 Обновление завершено');
    db.close();
  });
});
