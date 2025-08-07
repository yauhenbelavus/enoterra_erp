import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');
console.log('🗄️ Тестирование копирования данных:', dbPath);

const db = new sqlite3.Database(dbPath);

// Получаем данные из original_sheets
db.get('SELECT * FROM original_sheets WHERE id = 1', (err, row) => {
  if (err) {
    console.error('❌ Ошибка при получении данных:', err.message);
    db.close();
    return;
  }
  
  if (!row) {
    console.log('❌ Нет данных в original_sheets');
    db.close();
    return;
  }
  
  console.log('📋 Данные из original_sheets:');
  console.log('   ID:', row.id);
  console.log('   File Name:', row.file_name);
  console.log('   Data (первые 500 символов):', row.data ? row.data.substring(0, 500) + '...' : 'null');
  
  // Парсим JSON данные
  try {
    const parsedData = JSON.parse(row.data);
    console.log('\n📊 Парсированные данные:');
    console.log('   Headers:', parsedData.headers);
    console.log('   Rows count:', parsedData.rows.length);
    console.log('   First row:', parsedData.rows[0]);
    
    // Тестируем логику копирования
    const { headers, rows } = parsedData;
    
    // Ищем индексы нужных колонок
    const kodIndex = headers.findIndex(h => 
      h && h.toLowerCase().includes('kod') || 
      h && h.toLowerCase().includes('код') ||
      h && h.toLowerCase().includes('code')
    );
    const nazwaIndex = headers.findIndex(h => 
      h && h.toLowerCase().includes('nazwa') || 
      h && h.toLowerCase().includes('название') ||
      h && h.toLowerCase().includes('name') ||
      h && h.toLowerCase().includes('product')
    );
    const iloscIndex = headers.findIndex(h => 
      h && h.toLowerCase().includes('ilosc') || 
      h && h.toLowerCase().includes('количество') ||
      h && h.toLowerCase().includes('quantity') ||
      h && h.toLowerCase().includes('amount')
    );
    const dataIndex = headers.findIndex(h => 
      h && h.toLowerCase().includes('data') || 
      h && h.toLowerCase().includes('дата') ||
      h && h.toLowerCase().includes('date')
    );
    
    console.log('\n🔍 Найденные индексы колонок:');
    console.log('   kodIndex:', kodIndex);
    console.log('   nazwaIndex:', nazwaIndex);
    console.log('   iloscIndex:', iloscIndex);
    console.log('   dataIndex:', dataIndex);
    
    // Если не нашли нужные колонки, используем первые доступные
    const finalKodIndex = kodIndex >= 0 ? kodIndex : 0;
    const finalNazwaIndex = nazwaIndex >= 0 ? nazwaIndex : (kodIndex >= 0 ? 1 : 0);
    const finalIloscIndex = iloscIndex >= 0 ? iloscIndex : (nazwaIndex >= 0 ? 2 : 1);
    const finalDataIndex = dataIndex >= 0 ? dataIndex : (iloscIndex >= 0 ? 3 : 2);
    
    console.log('\n📊 Финальные индексы:');
    console.log('   finalKodIndex:', finalKodIndex);
    console.log('   finalNazwaIndex:', finalNazwaIndex);
    console.log('   finalIloscIndex:', finalIloscIndex);
    console.log('   finalDataIndex:', finalDataIndex);
    
    // Получаем текущую дату для записей без даты
    const currentDate = new Date().toISOString().split('T')[0];
    
    // Подготавливаем данные для вставки в working_sheets
    const workingSheetData = rows.map(row => {
      const kod = row[finalKodIndex] || '';
      const nazwa = row[finalNazwaIndex] || '';
      const ilosc = parseInt(row[finalIloscIndex]) || 0;
      const data = row[finalDataIndex] || currentDate;
      
      return {
        data: data,
        kod: kod.toString(),
        nazwa: nazwa.toString(),
        ilosc: ilosc,
        typ: 'sprzedaz' // по умолчанию
      };
    }).filter(item => item.kod && item.nazwa && item.ilosc > 0); // фильтруем пустые записи
    
    console.log('\n📋 Подготовленные данные для working_sheets:');
    console.log('   Количество записей после фильтрации:', workingSheetData.length);
    if (workingSheetData.length > 0) {
      console.log('   Первые 3 записи:');
      workingSheetData.slice(0, 3).forEach((item, index) => {
        console.log(`     ${index + 1}. Data: ${item.data}, Kod: ${item.kod}, Nazwa: ${item.nazwa}, Ilosc: ${item.ilosc}, Typ: ${item.typ}`);
      });
    }
    
    // Проверяем, есть ли уже данные в working_sheets
    db.all('SELECT COUNT(*) as count FROM working_sheets', (err, result) => {
      if (err) {
        console.error('❌ Ошибка при проверке working_sheets:', err.message);
      } else {
        console.log('\n📊 Текущее состояние working_sheets:');
        console.log('   Количество записей:', result[0].count);
        
        if (workingSheetData.length > 0) {
          console.log('\n🔄 Тестируем вставку данных в working_sheets...');
          
          // Вставляем данные в working_sheets
          const placeholders = workingSheetData.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
          const values = workingSheetData.flatMap(item => [
            item.data, null, item.kod, item.nazwa, item.ilosc, item.typ
          ]);
          
          db.run(
            `INSERT INTO working_sheets (data, produkt_id, kod, nazwa, ilosc, typ) VALUES ${placeholders}`,
            values,
            function(err) {
              if (err) {
                console.error('❌ Ошибка при вставке в working_sheets:', err.message);
              } else {
                console.log(`✅ Успешно вставлено ${workingSheetData.length} записей в working_sheets`);
                
                // Проверяем результат
                db.all('SELECT * FROM working_sheets ORDER BY id DESC LIMIT 3', (err, rows) => {
                  if (err) {
                    console.error('❌ Ошибка при получении данных:', err.message);
                  } else {
                    console.log('\n📋 Последние записи в working_sheets:');
                    rows.forEach((row, index) => {
                      console.log(`   ${index + 1}. ID: ${row.id}, Data: ${row.data}, Kod: ${row.kod}, Nazwa: ${row.nazwa}, Ilosc: ${row.ilosc}, Typ: ${row.typ}`);
                    });
                  }
                  db.close();
                });
              }
            }
          );
        } else {
          console.log('❌ Нет данных для вставки в working_sheets');
          db.close();
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка при парсинге JSON:', error.message);
    db.close();
  }
});
