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

// Database setup
const dbPath = path.join(__dirname, 'enoterra_erp.db');
const db = new sqlite3.Database(dbPath);

// Initialize database
db.serialize(() => {
  // Create tables if they don't exist
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nazwa TEXT NOT NULL,
    kategoria TEXT,
    cena REAL,
    stan INTEGER DEFAULT 0,
    data_waznosci TEXT,
    kod_produktu TEXT UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numer_zamowienia TEXT UNIQUE,
    data_zamowienia TEXT,
    klient TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    product_id INTEGER,
    ilosc INTEGER,
    cena REAL,
    FOREIGN KEY (order_id) REFERENCES orders (id),
    FOREIGN KEY (product_id) REFERENCES products (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nazwa TEXT NOT NULL,
    email TEXT,
    telefon TEXT,
    adres TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Check and add missing columns
  db.all("PRAGMA table_info(products)", (err, rows) => {
    if (err) {
      console.error('Error checking table info:', err);
      return;
    }
    
    if (rows && rows.length > 0) {
      const hasDataWaznosci = rows.some(row => row.name === 'data_waznosci');
      
      if (!hasDataWaznosci) {
        db.run("ALTER TABLE products ADD COLUMN data_waznosci TEXT", (alterErr) => {
          if (alterErr) {
            console.error('Error adding data_waznosci column:', alterErr);
          } else {
            console.log('Added data_waznosci column to products table');
          }
        });
      }
    }
  });
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products ORDER BY nazwa', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/products', (req, res) => {
  const { nazwa, kategoria, cena, stan, data_waznosci, kod_produktu } = req.body;
  
  db.run(
    'INSERT INTO products (nazwa, kategoria, cena, stan, data_waznosci, kod_produktu) VALUES (?, ?, ?, ?, ?, ?)',
    [nazwa, kategoria, cena || 0, stan || 0, data_waznosci, kod_produktu],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Product added successfully' });
    }
  );
});

app.put('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const { nazwa, kategoria, cena, stan, data_waznosci, kod_produktu } = req.body;
  
  db.run(
    'UPDATE products SET nazwa = ?, kategoria = ?, cena = ?, stan = ?, data_waznosci = ?, kod_produktu = ? WHERE id = ?',
    [nazwa, kategoria, cena, stan, data_waznosci, kod_produktu, id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ message: 'Product updated successfully' });
    }
  );
});

app.delete('/api/products/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Product deleted successfully' });
  });
});

// Orders routes
app.get('/api/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/orders', (req, res) => {
  const { numer_zamowienia, data_zamowienia, klient, items } = req.body;
  
  db.run(
    'INSERT INTO orders (numer_zamowienia, data_zamowienia, klient) VALUES (?, ?, ?)',
    [numer_zamowienia, data_zamowienia, klient],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const orderId = this.lastID;
      
      // Insert order items
      if (items && items.length > 0) {
        const stmt = db.prepare('INSERT INTO order_items (order_id, product_id, ilosc, cena) VALUES (?, ?, ?, ?)');
        
        items.forEach(item => {
          stmt.run([orderId, item.product_id, item.ilosc, item.cena]);
        });
        
        stmt.finalize();
      }
      
      res.json({ id: orderId, message: 'Order created successfully' });
    }
  );
});

// Clients routes
app.get('/api/clients', (req, res) => {
  db.all('SELECT * FROM clients ORDER BY nazwa', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/clients', (req, res) => {
  const { nazwa, email, telefon, adres } = req.body;
  
  db.run(
    'INSERT INTO clients (nazwa, email, telefon, adres) VALUES (?, ?, ?, ?)',
    [nazwa, email, telefon, adres],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Client added successfully' });
    }
  );
});

// File upload setup
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    message: 'File uploaded successfully',
    filename: req.file.filename,
    path: req.file.path
  });
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve static files
app.use(express.static(path.join(__dirname, '../dist')));

// Fallback для SPA - все остальные маршруты ведут к index.html (ДОЛЖЕН БЫТЬ ПОСЛЕДНИМ!)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});