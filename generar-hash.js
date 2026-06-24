const bcrypt = require('bcryptjs');

const passwordPlano = 'SoltecotMaster2026!'; // 👈 Tu clave actual

bcrypt.hash(passwordPlano, 10, function (err, hash) {
    if (err) console.error(err);
    console.log('\n🔒 TU HASH SEGURO ES:\n', hash, '\n');
});