import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import fontkit from '@pdf-lib/fontkit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Добавляем middleware для парсинга JSON в самом начале
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Добавляем подробное логирование всех запросов ПОСЛЕ парсинга JSON
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  if (req.method !== 'GET') {
    console.log('Body:', req.body);
  }
  next();
});

// Настраиваем CORS более подробно
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'https://erp.enoterra.pl',
    'https://www.erp.enoterra.pl'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.pdf';
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed!'));
  }
});

// Проверяем существование базы данных
const dbPath = path.join(__dirname, 'enoterra_erp.db');
console.log('Database path:', dbPath);

// Открываем базу данных
const sqlite = sqlite3.verbose();
const db = new sqlite.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    console.error('Database path:', dbPath);
    console.error('Current directory:', __dirname);
    process.exit(1); // Завершаем процесс, если не можем открыть базу
  }
  console.log('Connected to the SQLite database');
  console.log('Database path:', dbPath);
  console.log('Current directory:', __dirname);
  
  // Включаем режим WAL и устанавливаем таймаут
  db.run('PRAGMA journal_mode = WAL', (err) => {
    if (err) {
      console.error('Error setting WAL mode:', err);
      console.error('Error details:', err.message);
    } else {
      console.log('WAL mode enabled');
    }
  });
  
  db.run('PRAGMA busy_timeout = 5000', (err) => {
    if (err) console.error('Error setting busy timeout:', err);
    else console.log('Busy timeout set to 5000ms');
  });

  // Добавляем настройки для лучшей производительности
  db.run('PRAGMA synchronous = NORMAL', (err) => {
    if (err) console.error('Error setting synchronous mode:', err);
    else console.log('Synchronous mode set to NORMAL');
  });

  db.run('PRAGMA cache_size = 2000', (err) => {
    if (err) console.error('Error setting cache size:', err);
    else console.log('Cache size set to 2000 pages');
  });

  // Создаем таблицы базы данных
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kod TEXT UNIQUE,
    nazwa TEXT,
    ilosc INTEGER DEFAULT 0,
    jednostka_miary TEXT DEFAULT 'szt',
    kod_kreskowy TEXT,
    data_waznosci INTEGER DEFAULT NULL,
    archiwalny BOOLEAN DEFAULT FALSE,
    rezerwacje INTEGER DEFAULT 0,
    ilosc_na_poleceniach INTEGER DEFAULT 0,
    waga_netto REAL DEFAULT 0,
    waga_brutto REAL DEFAULT 0,
    objetosc REAL DEFAULT 0,
    typ TEXT,
    opis TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Error creating products table:', err);
    else console.log('Products table ready');
    
    // Миграция: заменяем 0 на NULL в поле data_waznosci (только если колонка существует)
    db.all("PRAGMA table_info(products)", (err, rows) => {
      if (err) {
        console.error('Error checking products table schema:', err);
        return;
      }
      
      if (rows && rows.length > 0) {
        const hasDataWaznosci = rows.some(row => row.name === 'data_waznosci');
        if (hasDataWaznosci) {
          db.run('UPDATE products SET data_waznosci = NULL WHERE data_waznosci = 0', (err) => {
            if (err) {
              console.error('Error migrating products data_waznosci:', err);
            } else {
              console.log('Migration: replaced 0 with NULL in products data_waznosci field');
            }
          });
        } else {
          console.log('data_waznosci column does not exist in products table, skipping migration');
        }
      } else {
        console.log('Products table not found or empty, skipping migration');
      }
    });
  });

  // Создаем таблицу product_quantities для хранения количества продуктов
  db.run(`CREATE TABLE IF NOT EXISTS product_quantities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_kod TEXT UNIQUE,
    ilosc INTEGER DEFAULT 0,
    rezerwacje INTEGER DEFAULT 0,
    ilosc_na_poleceniach INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_kod) REFERENCES products(kod)
  )`, (err) => {
    if (err) console.error('Error creating product_quantities table:', err);
    else console.log('Product quantities table ready');
  });

  // Создаем таблицу original_sheets
  db.run(`CREATE TABLE IF NOT EXISTS original_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fileName TEXT UNIQUE,
    data TEXT
  )`, (err) => {
    if (err) console.error('Error creating original_sheets table:', err);
    else console.log('Original sheets table ready');
  });

  // Создаем таблицу working_sheets
  db.run(`CREATE TABLE IF NOT EXISTS working_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fileName TEXT,
    kod TEXT,
    nazwa TEXT,
    ilosc INTEGER DEFAULT 0,
    jednostka_miary TEXT DEFAULT 'szt',
    kod_kreskowy TEXT,
    data_waznosci INTEGER DEFAULT NULL,
    archiwalny BOOLEAN DEFAULT FALSE,
    rezerwacje INTEGER DEFAULT 0,
    ilosc_na_poleceniach INTEGER DEFAULT 0,
    waga_netto REAL DEFAULT 0,
    waga_brutto REAL DEFAULT 0,
    objetosc REAL DEFAULT 0,
    typ TEXT,
    opis TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating working_sheets table:', err);
      return;
    }
    console.log('Working sheets table created');

    // Создаем индекс для быстрого поиска по коду
    db.run('CREATE INDEX IF NOT EXISTS idx_working_sheets_kod ON working_sheets(kod)');
    
    // Миграция: заменяем 0 на NULL в поле data_waznosci
    db.run('UPDATE working_sheets SET data_waznosci = NULL WHERE data_waznosci = 0', (err) => {
      if (err) {
        console.error('Error migrating data_waznosci:', err);
      } else {
        console.log('Migration: replaced 0 with NULL in data_waznosci field');
      }
    });

    // Миграция: добавляем поле typ в таблицу working_sheets
    db.run('ALTER TABLE working_sheets ADD COLUMN typ TEXT', (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding typ column to working_sheets:', err);
      } else {
        console.log('Typ column added to working_sheets table (or already exists)');
      }
    });

    // Миграция: добавляем поле sprzedawca в таблицу working_sheets
    db.run('ALTER TABLE working_sheets ADD COLUMN sprzedawca TEXT', (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding sprzedawca column to working_sheets:', err);
      } else {
        console.log('Sprzedawca column added to working_sheets table (or already exists)');
      }
    });

    // Миграция: добавляем поле cena в таблицу working_sheets
    db.run('ALTER TABLE working_sheets ADD COLUMN cena REAL', (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding cena column to working_sheets:', err);
      } else {
        console.log('Cena column added to working_sheets table (or already exists)');
      }
    });

    // Миграция: добавляем поле cena_sprzedazy в таблицу working_sheets
    db.run('ALTER TABLE working_sheets ADD COLUMN cena_sprzedazy REAL', (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding cena_sprzedazy column to working_sheets:', err);
      } else {
        console.log('Cena_sprzedazy column added to working_sheets table (or already exists)');
      }
    });
  });

  // Создаем таблицу orders
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT,
    order_date TEXT,
    status TEXT DEFAULT 'pending',
    total_amount REAL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Error creating orders table:', err);
    else console.log('Orders table ready');
  });

  // Создаем таблицу order_products
  db.run(`CREATE TABLE IF NOT EXISTS order_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderId INTEGER,
    kod TEXT,
    kod_kreskowy TEXT,
    nazwa TEXT,
    ilosc INTEGER,
    typ TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orderId) REFERENCES orders(id)
  )`, (err) => {
    if (err) console.error('Error creating order_products table:', err);
    else console.log('Order products table ready');
  });

  // Создаем таблицу clients
  db.run(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    email TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Error creating clients table:', err);
    else console.log('Clients table ready');
  });

  // Создаем таблицу product_receipts
  db.run(`CREATE TABLE IF NOT EXISTS product_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT UNIQUE,
    supplier TEXT,
    receipt_date TEXT,
    total_amount REAL DEFAULT 0,
    products TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Error creating product_receipts table:', err);
    else console.log('Product receipts table ready');
  });

  // Создаем таблицу product_prices
  db.run(`CREATE TABLE IF NOT EXISTS product_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_kod TEXT,
    price REAL,
    price_date TEXT,
    supplier TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_kod) REFERENCES products(kod)
  )`, (err) => {
    if (err) console.error('Error creating product_prices table:', err);
    else console.log('Product prices table ready');
  });
});

// API endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files
app.use(express.static(path.join(__dirname, '../dist')));

// API endpoints
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products ORDER BY id DESC', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json(rows || []);
    }
  });
});

app.post('/api/products', (req, res) => {
  const { name, category, quantity, price, supplier, notes } = req.body;
  const sql = 'INSERT INTO products (name, category, quantity, price, supplier, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
  
  db.run(sql, [name, category, quantity, price, supplier, notes, new Date().toISOString()], function(err) {
    if (err) {
      console.error('Insert error:', err);
      res.status(500).json({ error: 'Failed to add product' });
    } else {
      res.json({ id: this.lastID, message: 'Product added successfully' });
    }
  });
});

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Запускаем сервер
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('Database connection status:', db ? 'Connected' : 'Not connected');
});