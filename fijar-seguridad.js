const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// 1. Generamos el hash real de 60 caracteres
const hashPerfecto = bcrypt.hashSync('SoltecotMaster2026!', 10);

// 2. Ruta al archivo de configuración
const envPath = path.join(__dirname, '.env.local');

// 3. Escribimos directamente en el archivo con comillas simples protectoras
fs.appendFileSync(envPath, `\nADMIN_PASSWORD_HASH='${hashPerfecto}'\n`);

console.log('\n==================================================');
console.log('✅ HASH INYECTADO CON ÉXITO EN .ENV.LOCAL');
console.log('🔐 Longitud generada:', hashPerfecto.length, 'caracteres.');
console.log('==================================================\n');