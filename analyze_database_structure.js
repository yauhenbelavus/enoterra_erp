import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 АНАЛИЗ СТРУКТУРЫ БАЗЫ ДАННЫХ ENOTERRA ERP');
console.log('=' .repeat(60));

// Путь к базе данных
const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');
console.log(`📁 Путь к базе данных: ${dbPath}`);

// Проверяем существование файла базы данных
if (!fs.existsSync(dbPath)) {
  console.log('❌ Файл базы данных не найден!');
  console.log('💡 Создайте базу данных с помощью: node init_database_from_sql.js');
  process.exit(1);
}

const db = new sqlite3.Database(dbPath);

// Функция для получения структуры таблицы
function getTableStructure(tableName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
      if (err) {
        reject(err);
      } else {
        resolve(columns);
      }
    });
  });
}

// Функция для получения количества записей в таблице
function getTableCount(tableName) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result ? result.count : 0);
      }
    });
  });
}

// Функция для получения списка всех таблиц
function getAllTables() {
  return new Promise((resolve, reject) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
      if (err) {
        reject(err);
      } else {
        resolve(tables.map(t => t.name));
      }
    });
  });
}

// Главная функция анализа
async function analyzeDatabase() {
  try {
    console.log('\n📋 ПОЛУЧЕНИЕ СПИСКА ТАБЛИЦ...');
    const tables = await getAllTables();
    console.log(`✅ Найдено таблиц: ${tables.length}`);
    
    console.log('\n📊 СТРУКТУРА ВСЕХ ТАБЛИЦ:');
    console.log('=' .repeat(60));
    
    for (const tableName of tables) {
      console.log(`\n🗂️ ТАБЛИЦА: ${tableName.toUpperCase()}`);
      console.log('-' .repeat(40));
      
      try {
        // Получаем структуру таблицы
        const columns = await getTableStructure(tableName);
        console.log('📋 Структура:');
        columns.forEach(col => {
          const constraints = [];
          if (col.notnull) constraints.push('NOT NULL');
          if (col.pk) constraints.push('PRIMARY KEY');
          if (col.dflt_value !== null) constraints.push(`DEFAULT ${col.dflt_value}`);
          
          console.log(`  - ${col.name} (${col.type})${constraints.length > 0 ? ' ' + constraints.join(' ') : ''}`);
        });
        
        // Получаем количество записей
        const count = await getTableCount(tableName);
        console.log(`📈 Количество записей: ${count}`);
        
        // Показываем несколько примеров записей
        if (count > 0) {
          db.all(`SELECT * FROM ${tableName} LIMIT 3`, (err, rows) => {
            if (!err && rows.length > 0) {
              console.log('📝 Примеры записей:');
              rows.forEach((row, index) => {
                console.log(`  ${index + 1}. ${JSON.stringify(row)}`);
              });
            }
          });
        }
        
      } catch (error) {
        console.log(`❌ Ошибка при анализе таблицы ${tableName}:`, error.message);
      }
    }
    
    console.log('\n📋 СРАВНЕНИЕ С ФАЙЛАМИ СХЕМЫ:');
    console.log('=' .repeat(60));
    
    // Анализируем файлы схемы
    const schemaFiles = [
      'database_schema.sql',
      'server/index.js',
      'database_migrations.mjs',
      'clean_database.mjs'
    ];
    
    for (const schemaFile of schemaFiles) {
      const filePath = path.join(__dirname, schemaFile);
      if (fs.existsSync(filePath)) {
        console.log(`\n📄 Файл: ${schemaFile}`);
        console.log('-' .repeat(30));
        
        const content = fs.readFileSync(filePath, 'utf8');
        const createTableMatches = content.match(/CREATE TABLE[^;]+;/gi);
        
        if (createTableMatches) {
          console.log(`✅ Найдено CREATE TABLE: ${createTableMatches.length}`);
          createTableMatches.forEach((match, index) => {
            const tableNameMatch = match.match(/CREATE TABLE[^`\s]+`?(\w+)`?/i);
            if (tableNameMatch) {
              console.log(`  ${index + 1}. ${tableNameMatch[1]}`);
            }
          });
        } else {
          console.log('ℹ️ CREATE TABLE не найдены');
        }
      } else {
        console.log(`\n📄 Файл: ${schemaFile} - НЕ НАЙДЕН`);
      }
    }
    
    console.log('\n🔍 АНАЛИЗ РАЗЛИЧИЙ В СХЕМАХ:');
    console.log('=' .repeat(60));
    
    // Сравниваем структуру из разных источников
    console.log('\n📊 СРАВНЕНИЕ СТРУКТУРЫ products:');
    
    // Структура из database_schema.sql
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'database_schema.sql'), 'utf8');
    const productsSchemaMatch = schemaSQL.match(/CREATE TABLE[^;]*products[^;]+;/i);
    if (productsSchemaMatch) {
      console.log('📄 database_schema.sql:');
      console.log(productsSchemaMatch[0].replace(/\s+/g, ' ').trim());
    }
    
    // Структура из server/index.js
    const serverIndex = fs.readFileSync(path.join(__dirname, 'server', 'index.js'), 'utf8');
    const productsServerMatch = serverIndex.match(/CREATE TABLE[^;]*products[^;]+;/i);
    if (productsServerMatch) {
      console.log('\n📄 server/index.js:');
      console.log(productsServerMatch[0].replace(/\s+/g, ' ').trim());
    }
    
    console.log('\n✅ АНАЛИЗ ЗАВЕРШЕН!');
    
  } catch (error) {
    console.error('❌ Ошибка при анализе:', error);
  } finally {
    db.close();
  }
}

// Запускаем анализ
analyzeDatabase();
