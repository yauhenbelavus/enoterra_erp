import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const dbPath = path.join(__dirname, 'enoterra_erp.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
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

  db.run(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nazwa TEXT NOT NULL,
    email TEXT,
    telefon TEXT,
    adres TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'EnoTerra ERP Server is running',
    timestamp: new Date().toISOString()
  });
});

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
  const { nazwa, kategoria, cena, stan, data_waznosci, kod_produktu } = req.body;
  
  if (!nazwa) {
    return res.status(400).json({ error: 'Nazwa is required' });
  }
  
  db.run(
    'INSERT INTO products (nazwa, kategoria, cena, stan, data_waznosci, kod_produktu) VALUES (?, ?, ?, ?, ?, ?)',
    [nazwa, kategoria, cena || 0, stan || 0, data_waznosci, kod_produktu],
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

app.get('/api/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows || []);
  });
});

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