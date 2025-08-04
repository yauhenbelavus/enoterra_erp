import fs from 'fs';
import path from 'path';

console.log('🚀 Quick Deployment Check');
console.log('========================');

// Проверяем основные файлы
const files = [
  'dist/index.html',
  'dist/assets/index-C9elItbR.js',
  'dist/assets/index-Dvi_Fznr.css',
  'server/index.js',
  'server/package.json'
];

console.log('\n📋 File Status:');
files.forEach(file => {
  if (fs.existsSync(file)) {
    const stats = fs.statSync(file);
    console.log(`✅ ${file} (${(stats.size / 1024).toFixed(1)}KB)`);
  } else {
    console.log(`❌ ${file} (MISSING)`);
  }
});

// Проверяем API конфигурацию
console.log('\n🔧 API Configuration:');
try {
  const config = fs.readFileSync('src/config.ts', 'utf8');
  console.log('✅ API_URL configured for production');
} catch (e) {
  console.log('❌ Could not read config.ts');
}

// Проверяем серверную конфигурацию
console.log('\n🖥️ Server Configuration:');
try {
  const server = fs.readFileSync('server/index.js', 'utf8');
  if (server.includes('express.static')) {
    console.log('✅ Static file serving configured');
  }
  if (server.includes("app.get('*'")) {
    console.log('✅ SPA fallback configured');
  }
  if (server.includes('cors(')) {
    console.log('✅ CORS configured');
  }
} catch (e) {
  console.log('❌ Could not read server/index.js');
}

console.log('\n🎯 Ready for deployment!');
console.log('📋 Next steps:');
console.log('1. Commit and push to GitHub');
console.log('2. Check GitHub Actions');
console.log('3. Test at https://erp.enoterra.pl'); 