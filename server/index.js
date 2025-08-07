import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Database setup
const dbPath = path.join(__dirname, 'enoterra_erp.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
  console.log('🗄️ Инициализация базы данных...');
  
  // Таблица продуктов
  db.run(`CREATE TABLE IF NOT EXISTS products (
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

  // Таблица клиентов
  db.run(`CREATE TABLE IF NOT EXISTS clients (
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

  // Таблица заказов
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    klient TEXT NOT NULL,
    numer_zamowienia TEXT UNIQUE NOT NULL,
    data_zamowienia TEXT,
    status TEXT DEFAULT 'pending',
    laczna_ilosc INTEGER DEFAULT 0,
    data_utworzenia DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Таблица продуктов в заказах
  db.run(`CREATE TABLE IF NOT EXISTS order_products (
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

  // Таблица рабочих листов
  db.run(`CREATE TABLE IF NOT EXISTS working_sheets (
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

  // Таблица приемок товаров
  db.run(`CREATE TABLE IF NOT EXISTS product_receipts (
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

  // Таблица оригинальных листов
  db.run(`CREATE TABLE IF NOT EXISTS original_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Таблица истории цен
  db.run(`CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    kod TEXT NOT NULL,
    nazwa TEXT NOT NULL,
    cena REAL NOT NULL,
    data_zmiany DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
  )`);

  // Таблица цен продуктов
  db.run(`CREATE TABLE IF NOT EXISTS product_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kod TEXT UNIQUE NOT NULL,
    nazwa TEXT NOT NULL,
    cena REAL DEFAULT 0,
    cena_sprzedazy REAL DEFAULT 0,
    data_aktualizacji TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  console.log('✅ Таблицы созданы');
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'EnoTerra ERP Server is running',
    timestamp: new Date().toISOString()
  });
});

// Products API
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products ORDER BY nazwa', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows || []);
  });
});

app.post('/api/products', (req, res) => {
  const { kod, nazwa, kod_kreskowy, cena, cena_sprzedazy, ilosc, data_waznosci } = req.body;
  
  if (!kod || !nazwa) {
    return res.status(400).json({ error: 'Kod and nazwa are required' });
  }
  
  db.run(
    'INSERT INTO products (kod, nazwa, kod_kreskowy, cena, cena_sprzedazy, ilosc, data_waznosci) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [kod, nazwa, kod_kreskowy, cena || 0, cena_sprzedazy || 0, ilosc || 0, data_waznosci],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Product added successfully' });
    }
  );
});

app.get('/api/products/search', (req, res) => {
  const { query } = req.query;
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  db.all(
    'SELECT * FROM products WHERE nazwa LIKE ? OR kod LIKE ? ORDER BY nazwa LIMIT 10',
    [`%${query}%`, `%${query}%`],
    (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows || []);
    }
  );
});

// Orders API
app.get('/api/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY data_utworzenia DESC', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows || []);
  });
});

app.get('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM orders WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(row);
  });
});

app.post('/api/orders', (req, res) => {
  const { klient, numer_zamowienia, laczna_ilosc } = req.body;
  
  if (!klient || !numer_zamowienia) {
    return res.status(400).json({ error: 'Klient and numer_zamowienia are required' });
  }
  
  db.run(
    'INSERT INTO orders (klient, numer_zamowienia, laczna_ilosc) VALUES (?, ?, ?)',
    [klient, numer_zamowienia, laczna_ilosc || 0],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Order added successfully' });
    }
  );
});

app.put('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const { klient, numer_zamowienia, laczna_ilosc } = req.body;
  
  db.run(
    'UPDATE orders SET klient = ?, numer_zamowienia = ?, laczna_ilosc = ? WHERE id = ?',
    [klient, numer_zamowienia, laczna_ilosc, id],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ message: 'Order updated successfully' });
    }
  );
});

app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM orders WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Order deleted successfully' });
  });
});

// Order Products API
app.get('/api/orders-with-products', (req, res) => {
  db.all(`
    SELECT 
      o.*,
      op.kod as product_kod,
      op.nazwa as product_nazwa,
      op.ilosc as product_ilosc,
      op.typ as product_typ
    FROM orders o
    LEFT JOIN order_products op ON o.id = op.order_id
    ORDER BY o.data_utworzenia DESC
  `, (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows || []);
  });
});

app.post('/api/order-products', (req, res) => {
  const { order_id, product_id, kod, nazwa, kod_kreskowy, ilosc, typ, product_kod } = req.body;
  
  if (!order_id || !kod || !nazwa || !ilosc) {
    return res.status(400).json({ error: 'Order ID, kod, nazwa, and ilosc are required' });
  }
  
  db.run(
    'INSERT INTO order_products (order_id, product_id, kod, nazwa, kod_kreskowy, ilosc, typ, product_kod) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [order_id, product_id, kod, nazwa, kod_kreskowy, ilosc, typ || 'sprzedaz', product_kod],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Order product added successfully' });
    }
  );
});

// Clients API
app.get('/api/clients', (req, res) => {
  db.all('SELECT * FROM clients ORDER BY nazwa', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows || []);
  });
});

app.get('/api/clients/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM clients WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(row);
  });
});

app.post('/api/clients', (req, res) => {
  const { nazwa, firma, adres, kontakt, czas_dostawy } = req.body;
  
  if (!nazwa) {
    return res.status(400).json({ error: 'Nazwa is required' });
  }
  
  db.run(
    'INSERT INTO clients (nazwa, firma, adres, kontakt, czas_dostawy) VALUES (?, ?, ?, ?, ?)',
    [nazwa, firma, adres, kontakt, czas_dostawy],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Client added successfully' });
    }
  );
});

app.put('/api/clients/:id', (req, res) => {
  const { id } = req.params;
  const { nazwa, firma, adres, kontakt, czas_dostawy } = req.body;
  
  db.run(
    'UPDATE clients SET nazwa = ?, firma = ?, adres = ?, kontakt = ?, czas_dostawy = ? WHERE id = ?',
    [nazwa, firma, adres, kontakt, czas_dostawy, id],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ message: 'Client updated successfully' });
    }
  );
});

app.delete('/api/clients/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM clients WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Client deleted successfully' });
  });
});

app.get('/api/clients/search', (req, res) => {
  const { q } = req.query;
  
  if (!q) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  db.all(
    'SELECT * FROM clients WHERE nazwa LIKE ? OR firma LIKE ? ORDER BY nazwa LIMIT 10',
    [`%${q}%`, `%${q}%`],
    (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows || []);
    }
  );
});

// Product Receipts API
app.get('/api/product-receipts', (req, res) => {
  db.all('SELECT * FROM product_receipts ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows || []);
  });
});

app.post('/api/product-receipts', (req, res) => {
  const { data, produkt_id, kod, nazwa, ilosc, wartosc, koszt_dostawy } = req.body;
  
  if (!data || !kod || !nazwa || !ilosc) {
    return res.status(400).json({ error: 'Data, kod, nazwa, and ilosc are required' });
  }
  
  db.run(
    'INSERT INTO product_receipts (data, produkt_id, kod, nazwa, ilosc, wartosc, koszt_dostawy) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [data, produkt_id, kod, nazwa, ilosc, wartosc || 0, koszt_dostawy || 0],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Product receipt added successfully' });
    }
  );
});

app.put('/api/product-receipts/:id', (req, res) => {
  const { id } = req.params;
  const { data, produkt_id, kod, nazwa, ilosc, wartosc, koszt_dostawy } = req.body;
  
  db.run(
    'UPDATE product_receipts SET data = ?, produkt_id = ?, kod = ?, nazwa = ?, ilosc = ?, wartosc = ?, koszt_dostawy = ? WHERE id = ?',
    [data, produkt_id, kod, nazwa, ilosc, wartosc, koszt_dostawy, id],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ message: 'Product receipt updated successfully' });
    }
  );
});

app.delete('/api/product-receipts/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM product_receipts WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Product receipt deleted successfully' });
  });
});

// Working Sheets API
app.get('/api/working-sheets', (req, res) => {
  db.all('SELECT * FROM working_sheets ORDER BY data DESC', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows || []);
  });
});

app.post('/api/working-sheets', (req, res) => {
  const { data, produkt_id, kod, nazwa, ilosc, typ } = req.body;
  
  if (!data || !kod || !nazwa || !ilosc) {
    return res.status(400).json({ error: 'Data, kod, nazwa, and ilosc are required' });
  }
  
  db.run(
    'INSERT INTO working_sheets (data, produkt_id, kod, nazwa, ilosc, typ) VALUES (?, ?, ?, ?, ?, ?)',
    [data, produkt_id, kod, nazwa, ilosc, typ || 'sprzedaz'],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Working sheet added successfully' });
    }
  );
});

app.put('/api/working-sheets/update', (req, res) => {
  const { id, data, produkt_id, kod, nazwa, ilosc, typ } = req.body;
  
  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }
  
  db.run(
    'UPDATE working_sheets SET data = ?, produkt_id = ?, kod = ?, nazwa = ?, ilosc = ?, typ = ? WHERE id = ?',
    [data, produkt_id, kod, nazwa, ilosc, typ, id],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ message: 'Working sheet updated successfully' });
    }
  );
});

// Original Sheets API
app.get('/api/original-sheets', (req, res) => {
  db.all('SELECT * FROM original_sheets ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Преобразуем данные в формат, ожидаемый фронтендом
    const processedRows = rows.map(row => ({
      id: row.id,
      fileName: row.file_name,
      data: row.data ? JSON.parse(row.data) : { headers: [], rows: [] },
      created_at: row.created_at
    }));
    
    res.json(processedRows || []);
  });
});

app.post('/api/original-sheets', (req, res) => {
  const { file_name, data } = req.body;
  
  if (!file_name) {
    return res.status(400).json({ error: 'File name is required' });
  }
  
  db.run(
    'INSERT INTO original_sheets (file_name, data) VALUES (?, ?)',
    [file_name, data],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Original sheet added successfully' });
    }
  );
});

// Price History API
app.get('/api/price-history', (req, res) => {
  db.all('SELECT * FROM price_history ORDER BY data_zmiany DESC', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows || []);
  });
});

app.post('/api/price-history', (req, res) => {
  const { product_id, kod, nazwa, cena, data_zmiany } = req.body;
  
  if (!kod || !nazwa || !cena || !data_zmiany) {
    return res.status(400).json({ error: 'Kod, nazwa, cena, and data_zmiany are required' });
  }
  
  db.run(
    'INSERT INTO price_history (product_id, kod, nazwa, cena, data_zmiany) VALUES (?, ?, ?, ?, ?)',
    [product_id, kod, nazwa, cena, data_zmiany],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Price history added successfully' });
    }
  );
});

// Product Prices API
app.get('/api/product-prices/:kod', (req, res) => {
  const { kod } = req.params;
  
  db.get('SELECT * FROM product_prices WHERE kod = ?', [kod], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      return res.status(404).json({ error: 'Product price not found' });
    }
    res.json(row);
  });
});

app.post('/api/product-prices', (req, res) => {
  const { kod, nazwa, cena, cena_sprzedazy } = req.body;
  
  if (!kod || !nazwa) {
    return res.status(400).json({ error: 'Kod and nazwa are required' });
  }
  
  db.run(
    'INSERT OR REPLACE INTO product_prices (kod, nazwa, cena, cena_sprzedazy) VALUES (?, ?, ?, ?)',
    [kod, nazwa, cena || 0, cena_sprzedazy || 0],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Product price added successfully' });
    }
  );
});

// File Upload API
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    message: 'File uploaded successfully',
    filename: req.file.filename,
    originalname: req.file.originalname
  });
});

// File Management API
app.get('/api/check_file/:fileName', (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join(__dirname, 'uploads', fileName);
  
  if (fs.existsSync(filePath)) {
    res.json({ exists: true, path: filePath });
  } else {
    res.json({ exists: false });
  }
});

app.delete('/api/delete_file/:fileName', (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join(__dirname, 'uploads', fileName);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ message: 'File deleted successfully' });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Sheets API
app.post('/api/sheets', (req, res) => {
  const { fileName, data } = req.body;
  
  if (!fileName) {
    return res.status(400).json({ error: 'File name is required' });
  }
  
  // Сохраняем данные в таблицу original_sheets
  db.run(
    'INSERT INTO original_sheets (file_name, data) VALUES (?, ?)',
    [fileName, JSON.stringify(data)],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      const originalSheetId = this.lastID;
      
      // Преобразуем Excel данные в формат working_sheets и сохраняем
      try {
        const { headers, rows } = data;
        
        // Ищем индексы нужных колонок
        const kodIndex = headers.findIndex(h => 
          h.toLowerCase().includes('kod') || 
          h.toLowerCase().includes('код') ||
          h.toLowerCase().includes('code')
        );
        const nazwaIndex = headers.findIndex(h => 
          h.toLowerCase().includes('nazwa') || 
          h.toLowerCase().includes('название') ||
          h.toLowerCase().includes('name') ||
          h.toLowerCase().includes('product')
        );
        const iloscIndex = headers.findIndex(h => 
          h.toLowerCase().includes('ilosc') || 
          h.toLowerCase().includes('количество') ||
          h.toLowerCase().includes('quantity') ||
          h.toLowerCase().includes('amount')
        );
        const dataIndex = headers.findIndex(h => 
          h.toLowerCase().includes('data') || 
          h.toLowerCase().includes('дата') ||
          h.toLowerCase().includes('date')
        );
        
        // Если не нашли нужные колонки, используем первые доступные
        const finalKodIndex = kodIndex >= 0 ? kodIndex : 0;
        const finalNazwaIndex = nazwaIndex >= 0 ? nazwaIndex : (kodIndex >= 0 ? 1 : 0);
        const finalIloscIndex = iloscIndex >= 0 ? iloscIndex : (nazwaIndex >= 0 ? 2 : 1);
        const finalDataIndex = dataIndex >= 0 ? dataIndex : (iloscIndex >= 0 ? 3 : 2);
        
        // Получаем текущую дату для записей без даты
        const currentDate = new Date().toISOString().split('T')[0];
        
        // Подготавливаем данные для вставки в working_sheets
        const workingSheetData = rows.map(row => {
          const kod = row[finalKodIndex] || '';
          const nazwa = row[finalNazwaIndex] || '';
          const ilosc = parseInt(row[finalIloscIndex]) || 0;
          const data = row[finalDataIndex] || currentDate;
          
          // Ищем дополнительные поля в заголовках
          const jednostkaMiaryIndex = headers.findIndex(h => 
            h && h.toLowerCase().includes('jednostka') || 
            h && h.toLowerCase().includes('единица') ||
            h && h.toLowerCase().includes('unit')
          );
          const kodKreskowyIndex = headers.findIndex(h => 
            h && h.toLowerCase().includes('kreskowy') || 
            h && h.toLowerCase().includes('штрих') ||
            h && h.toLowerCase().includes('barcode')
          );
          const dataWaznosciIndex = headers.findIndex(h => 
            h && h.toLowerCase().includes('waznosci') || 
            h && h.toLowerCase().includes('срок') ||
            h && h.toLowerCase().includes('expiry')
          );
          const archiwalnyIndex = headers.findIndex(h => 
            h && h.toLowerCase().includes('archiwalny') || 
            h && h.toLowerCase().includes('архив')
          );
          const rezerwacjeIndex = headers.findIndex(h => 
            h && h.toLowerCase().includes('rezerwacje') || 
            h && h.toLowerCase().includes('резерв')
          );
          const iloscNaPoleceniachIndex = headers.findIndex(h => 
            h && h.toLowerCase().includes('poleceniach') || 
            h && h.toLowerCase().includes('заказах')
          );
          const wagaNettoIndex = headers.findIndex(h => 
            h && h.toLowerCase().includes('netto') || 
            h && h.toLowerCase().includes('вес нетто')
          );
          const wagaBruttoIndex = headers.findIndex(h => 
            h && h.toLowerCase().includes('brutto') || 
            h && h.toLowerCase().includes('вес брутто')
          );
          const objetoscIndex = headers.findIndex(h => 
            h && h.toLowerCase().includes('objetosc') || 
            h && h.toLowerCase().includes('объем')
          );
          const opisIndex = headers.findIndex(h => 
            h && h.toLowerCase().includes('opis') || 
            h && h.toLowerCase().includes('описание')
          );
          
          return {
            data: data,
            kod: kod.toString(),
            nazwa: nazwa.toString(),
            ilosc: ilosc,
            typ: 'sprzedaz', // по умолчанию
            jednostka_miary: jednostkaMiaryIndex >= 0 ? row[jednostkaMiaryIndex] || '' : '',
            kod_kreskowy: kodKreskowyIndex >= 0 ? row[kodKreskowyIndex] || '' : '',
            data_waznosci: dataWaznosciIndex >= 0 ? parseInt(row[dataWaznosciIndex]) || 0 : 0,
            archiwalny: archiwalnyIndex >= 0 ? parseInt(row[archiwalnyIndex]) || 0 : 0,
            rezerwacje: rezerwacjeIndex >= 0 ? parseInt(row[rezerwacjeIndex]) || 0 : 0,
            ilosc_na_poleceniach: iloscNaPoleceniachIndex >= 0 ? parseInt(row[iloscNaPoleceniachIndex]) || 0 : 0,
            waga_netto: wagaNettoIndex >= 0 ? parseFloat(row[wagaNettoIndex]) || 0 : 0,
            waga_brutto: wagaBruttoIndex >= 0 ? parseFloat(row[wagaBruttoIndex]) || 0 : 0,
            objetosc: objetoscIndex >= 0 ? parseFloat(row[objetoscIndex]) || 0 : 0,
            opis: opisIndex >= 0 ? row[opisIndex] || '' : ''
          };
        }).filter(item => item.kod && item.nazwa && item.ilosc > 0); // фильтруем пустые записи
        
        // Вставляем данные в working_sheets
        if (workingSheetData.length > 0) {
          const placeholders = workingSheetData.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
          const values = workingSheetData.flatMap(item => [
            item.data, null, item.kod, item.nazwa, item.ilosc, item.typ,
            item.jednostka_miary, item.kod_kreskowy, item.data_waznosci, item.archiwalny,
            item.rezerwacje, item.ilosc_na_poleceniach, item.waga_netto, item.waga_brutto,
            item.objetosc, item.opis
          ]);
          
          db.run(
            `INSERT INTO working_sheets (data, produkt_id, kod, nazwa, ilosc, typ, jednostka_miary, kod_kreskowy, data_waznosci, archiwalny, rezerwacje, ilosc_na_poleceniach, waga_netto, waga_brutto, objetosc, opis) VALUES ${placeholders}`,
            values,
            function(err) {
              if (err) {
                console.error('Error inserting into working_sheets:', err);
                // Не возвращаем ошибку, так как original_sheets уже сохранен
              } else {
                console.log(`✅ Copied ${workingSheetData.length} records from original_sheets to working_sheets`);
              }
            }
          );
        }
        
      } catch (error) {
        console.error('Error processing data for working_sheets:', error);
        // Не возвращаем ошибку, так как original_sheets уже сохранен
      }
      
      res.json({ 
        id: originalSheetId, 
        message: 'Sheet data saved successfully and copied to working sheets',
        fileName: fileName
      });
    }
  );
});

// PDF Generation API
app.get('/api/orders/:id/pdf', (req, res) => {
  const { id } = req.params;
  
  // Здесь должна быть логика генерации PDF
  // Пока возвращаем заглушку
  res.json({
    message: 'PDF generation endpoint',
    orderId: id
  });
});

// Serve static files from dist
app.use(express.static(path.join(__dirname, '../dist')));

// ВАЖНО: SPA Fallback маршрут ДОЛЖЕН БЫТЬ ПОСЛЕДНИМ!
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '../dist/index.html');
  console.log('Serving SPA fallback:', indexPath);
  res.sendFile(indexPath);
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 EnoTerra ERP Server running on port ${PORT}`);
  console.log(`📂 Serving static files from: ${path.join(__dirname, '../dist')}`);
  console.log(`💾 Database located at: ${dbPath}`);
});