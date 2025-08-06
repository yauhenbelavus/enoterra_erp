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

// Middleware
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// CORS
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'https://erp.enoterra.pl',
    'https://www.erp.enoterra.pl'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Database setup
const dbPath = path.join(__dirname, 'enoterra_erp.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite database');
  
  // Create tables
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    category TEXT,
    quantity INTEGER,
    price REAL,
    supplier TEXT,
    notes TEXT,
    created_at TEXT
  )`);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Products API
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products ORDER BY id DESC', (err, rows) => {
    if (err) {
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
      res.status(500).json({ error: 'Failed to add product' });
    } else {
      res.json({ id: this.lastID, message: 'Product added successfully' });
    }
  });
});

// Serve static files
app.use(express.static(path.join(__dirname, '../dist')));

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});