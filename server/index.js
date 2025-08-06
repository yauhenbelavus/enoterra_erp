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

// Database configuration
db.configure('busyTimeout', 10000);
db.run('PRAGMA journal_mode = WAL');

// Check and create tables
  db.serialize(() => {
  // Products table
    db.run(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    quantity INTEGER DEFAULT 0,
    price REAL DEFAULT 0,
    supplier TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    data_waznosci TEXT
    )`, (err) => {
      if (err) console.error('Error creating products table:', err);
      else console.log('Products table ready');
      
    // Migration: check if data_waznosci column exists
    db.all("PRAGMA table_info(products)", (err, rows) => {
      if (err) {
        console.error('Error checking products table:', err);
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

  // Other tables
    db.run(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE,
    supplier TEXT,
    order_date TEXT,
    status TEXT DEFAULT 'pending',
    total_amount REAL DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    product_name TEXT,
    quantity INTEGER,
    price REAL,
    total REAL,
    FOREIGN KEY (order_id) REFERENCES orders (id)
  )`);
});

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }
});

// API Routes

// Products API
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Database error' });
            } else {
      res.json(rows || []);
            }
        });
    });

app.post('/api/products', (req, res) => {
  const { name, category, quantity, price, supplier, notes, data_waznosci } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Product name is required' });
  }

  const sql = `INSERT INTO products 
    (name, category, quantity, price, supplier, notes, data_waznosci, created_at, updated_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  
  const now = new Date().toISOString();
  
  db.run(sql, [
    name.trim(), 
    category || '', 
    parseInt(quantity) || 0, 
    parseFloat(price) || 0, 
    supplier || '', 
    notes || '', 
    data_waznosci || null,
    now,
    now
  ], function(err) {
    if (err) {
      console.error('Failed to add product:', err);
      res.status(500).json({ error: 'Failed to add product' });
    } else {
  res.json({ 
        id: this.lastID, 
        message: 'Product added successfully',
        product: {
          id: this.lastID,
          name: name.trim(),
          category: category || '',
          quantity: parseInt(quantity) || 0,
          price: parseFloat(price) || 0,
          supplier: supplier || '',
          notes: notes || '',
          data_waznosci: data_waznosci || null,
          created_at: now
        }
      });
    }
  });
});

app.put('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, quantity, price, supplier, notes, data_waznosci } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Product name is required' });
  }

  const sql = `UPDATE products 
    SET name = ?, category = ?, quantity = ?, price = ?, supplier = ?, notes = ?, data_waznosci = ?, updated_at = ?
    WHERE id = ?`;
  
  const now = new Date().toISOString();
  
  db.run(sql, [
    name.trim(), 
    category || '', 
    parseInt(quantity) || 0, 
    parseFloat(price) || 0, 
    supplier || '', 
    notes || '', 
    data_waznosci || null,
    now,
    id
  ], function(err) {
      if (err) {
      console.error('Failed to update product:', err);
      res.status(500).json({ error: 'Failed to update product' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Product not found' });
      } else {
      res.json({ message: 'Product updated successfully' });
    }
  });
});

app.delete('/api/products/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
                  if (err) {
      console.error('Failed to delete product:', err);
      res.status(500).json({ error: 'Failed to delete product' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Product not found' });
                  } else {
      res.json({ message: 'Product deleted successfully' });
    }
        });
      });
      
// Orders API
app.get('/api/orders', (req, res) => {
  const sql = `
    SELECT o.*, 
           GROUP_CONCAT(
             oi.product_name || ' (x' || oi.quantity || ')'
           ) as items
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `;
  
  db.all(sql, (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json(rows || []);
    }
  });
});

app.post('/api/orders', (req, res) => {
  const { supplier, order_date, items, notes } = req.body;
  
  if (!supplier || !order_date || !items || items.length === 0) {
    return res.status(400).json({ error: 'Supplier, order date, and items are required' });
  }

  const order_number = `ORD-${Date.now()}`;
  const total_amount = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    const orderSql = `INSERT INTO orders 
      (order_number, supplier, order_date, total_amount, notes, created_at) 
      VALUES (?, ?, ?, ?, ?, ?)`;
    
    db.run(orderSql, [
      order_number,
      supplier,
      order_date,
      total_amount,
      notes || '',
      new Date().toISOString()
    ], function(err) {
          if (err) {
        console.error('Failed to create order:', err);
            db.run('ROLLBACK');
        return res.status(500).json({ error: 'Failed to create order' });
      }
      
      const orderId = this.lastID;
      
      const itemSql = `INSERT INTO order_items 
        (order_id, product_name, quantity, price, total) 
        VALUES (?, ?, ?, ?, ?)`;
      
      let itemsProcessed = 0;
      const totalItems = items.length;
      
      items.forEach(item => {
        const itemTotal = item.quantity * item.price;
        
        db.run(itemSql, [
          orderId,
          item.product_name,
          item.quantity,
          item.price,
          itemTotal
        ], (err) => {
                    if (err) {
            console.error('Failed to add order item:', err);
                        db.run('ROLLBACK');
            return res.status(500).json({ error: 'Failed to add order items' });
          }
          
          itemsProcessed++;
          
          if (itemsProcessed === totalItems) {
                            db.run('COMMIT');
            res.json({
              id: orderId,
              order_number,
              message: 'Order created successfully'
            });
          }
        });
      });
    });
    });
  });

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    message: 'File uploaded successfully',
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size
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