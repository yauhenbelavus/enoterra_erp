// Простой скрипт для создания базы данных
const fs = require('fs');
const path = require('path');

// Путь к базе данных
const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');

console.log('🗄️ Создаем базу данных:', dbPath);

// Создаем пустой файл базы данных
fs.writeFileSync(dbPath, '');

console.log('✅ Файл базы данных создан');

// Создаем SQL скрипт для инициализации
const initSQL = `
-- Инициализация базы данных EnoTerra ERP

-- Таблица продуктов
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nazwa TEXT NOT NULL,
  kategoria TEXT,
  cena REAL,
  stan INTEGER DEFAULT 0,
  data_waznosci TEXT,
  kod_produktu TEXT UNIQUE
);

-- Таблица заказов
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numer_zamowienia TEXT UNIQUE,
  data_zamowienia TEXT,
  klient TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица позиций заказов
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  product_id INTEGER,
  ilosc INTEGER,
  cena REAL,
  FOREIGN KEY (order_id) REFERENCES orders (id),
  FOREIGN KEY (product_id) REFERENCES products (id)
);

-- Таблица клиентов
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nazwa TEXT NOT NULL,
  email TEXT,
  telefon TEXT,
  adres TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица приемок товаров
CREATE TABLE IF NOT EXISTS product_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  sprzedawca TEXT,
  data_przyjecia TEXT,
  ilosc INTEGER,
  cena_jednostkowa REAL,
  numer_faktury TEXT,
  uwagi TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products (id)
);

-- Вставка тестовых данных

-- Продукты
INSERT INTO products (nazwa, kategoria, cena, stan, data_waznosci, kod_produktu) VALUES 
('Laptop Dell XPS 13', 'Elektronika', 4500.00, 5, '2025-12-31', 'LAP001'),
('iPhone 15 Pro', 'Telefony', 3200.00, 8, '2025-10-15', 'PHN001'),
('Monitor Samsung 27"', 'Elektronika', 1200.00, 12, '2026-03-20', 'MON001'),
('Klawiatura mechaniczna', 'Akcesoria', 350.00, 25, '2025-08-30', 'KBD001'),
('Mysz bezprzewodowa', 'Akcesoria', 120.00, 30, '2025-07-15', 'MOU001'),
('Dysk SSD 1TB', 'Komponenty', 450.00, 15, '2025-11-30', 'SSD001'),
('Pamięć RAM 16GB', 'Komponenty', 280.00, 20, '2025-09-20', 'RAM001'),
('Kamera internetowa', 'Akcesoria', 180.00, 18, '2025-06-10', 'CAM001');

-- Клиенты
INSERT INTO clients (nazwa, email, telefon, adres) VALUES 
('Firma ABC Sp. z o.o.', 'abc@firma.pl', '+48 123 456 789', 'ul. Przykładowa 1, Warszawa'),
('Sklep XYZ', 'sklep@xyz.pl', '+48 987 654 321', 'ul. Handlowa 15, Kraków'),
('Biuro IT Solutions', 'kontakt@itsolutions.pl', '+48 555 123 456', 'ul. Techniczna 8, Wrocław'),
('Centrum Komputerowe', 'info@centrum.pl', '+48 777 888 999', 'ul. Elektroniczna 22, Gdańsk');

-- Заказы
INSERT INTO orders (numer_zamowienia, data_zamowienia, klient, status) VALUES 
('ORD-2024-001', '2024-01-15', 'Firma ABC Sp. z o.o.', 'completed'),
('ORD-2024-002', '2024-01-20', 'Sklep XYZ', 'pending'),
('ORD-2024-003', '2024-01-25', 'Biuro IT Solutions', 'processing');

-- Приемки
INSERT INTO product_receipts (product_id, sprzedawca, data_przyjecia, ilosc, cena_jednostkowa, numer_faktury, uwagi) VALUES 
(1, 'Dostawca Tech', '2024-01-10', 10, 4200.00, 'FAK-2024-001', 'Dostawa laptopów'),
(2, 'Mobile Solutions', '2024-01-12', 15, 3000.00, 'FAK-2024-002', 'Telefony iPhone'),
(3, 'Monitor Plus', '2024-01-14', 20, 1100.00, 'FAK-2024-003', 'Monitory Samsung');
`;

// Сохраняем SQL скрипт
const sqlPath = path.join(__dirname, 'init_database.sql');
fs.writeFileSync(sqlPath, initSQL);

console.log('📝 SQL скрипт создан:', sqlPath);
console.log('🎉 База данных готова к инициализации!');
console.log('');
console.log('📋 Для инициализации базы данных выполните:');
console.log('   sqlite3 server/enoterra_erp.db < init_database.sql');
console.log('');
console.log('📊 Структура базы данных:');
console.log('   - products (8 записей)');
console.log('   - clients (4 записи)');
console.log('   - orders (3 записи)');
console.log('   - product_receipts (3 записи)');
console.log('   - order_items (пустая таблица)');
