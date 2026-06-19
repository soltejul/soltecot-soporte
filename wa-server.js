const baileys = require('@whiskeysockets/baileys');
const makeWASocket = baileys.default || baileys;
const { DisconnectReason, useMultiFileAuthState } = baileys;
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const http = require('http');
const fs = require('fs'); // 📁 Módulo nativo para borrar carpetas corruptas

const NEXTJS_WEBHOOK_URL = 'http://localhost:3000/api/whatsapp';
const PORT = 8080;
const AUTH_FOLDER = 'soltecot_auth_baileys';

let sock;

async function connectToWhatsApp() {
    // Inicializa las credenciales en la carpeta local
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // 🏁 Pinta el código QR en la terminal en cuanto WhatsApp lo genere
        if (qr) {
            console.clear();
            console.log('✨ [SOLTECOT] Escanea este código QR con tu celular de soporte:\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const lastDisconnectError = lastDisconnect && lastDisconnect.error;
            const statusCode = lastDisconnectError && lastDisconnectError.output ? lastDisconnectError.output.statusCode : null;

            console.log(`⚠️ Conexión cerrada. Status: ${statusCode}`);

            // 🚨 SI ES 401, LIMPIAMOS LA CARPETA EN CALIENTE Y OBLIGAMOS A GENERAR UN QR NUEVO
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                console.log('🛑 Credenciales inválidas o corruptas. Purgando caché para forzar nuevo QR...');
                try {
                    fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                } catch (e) {
                    console.log('Aviso: La carpeta ya estaba limpia.');
                }
                // Reintentamos inmediatamente con la carpeta limpia de cero
                connectToWhatsApp();
            } else {
                // Si es cualquier otro error de red, reconecta normalmente
                console.log('🔄 Error de red temporal. Reconectando automáticamente...');
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.clear();
            console.log('🚀 [¡ÉXITO TOTAL!] Servidor de WhatsApp en línea con Baileys.');
            console.log(`📡 Escuchando respuestas de Next.js en el puerto ${PORT}...`);
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type === 'notify') {
            for (const msg of m.messages) {
                if (!msg.key.fromMe && msg.message && msg.message.conversation) {
                    const numeroCliente = msg.key.remoteJid;
                    const mensajeCliente = msg.message.conversation;

                    console.log(`\n📩 WhatsApp entrante de [${numeroCliente}]: ${mensajeCliente}`);

                    try {
                        await fetch(NEXTJS_WEBHOOK_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                type: 'message',
                                data: {
                                    type: 'chat',
                                    body: mensajeCliente,
                                    from: numeroCliente
                                }
                            })
                        });
                    } catch (err) {
                        console.error('❌ Error al conectar con Next.js. ¿Olvidaste encender npm run dev?', err.message);
                    }
                }
            }
        }
    });
}

// 🌐 Servidor HTTP para recibir las órdenes de Next.js
const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/sendText') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { to, content } = JSON.parse(body);
                if (!sock) throw new Error('El canal de WhatsApp aún no está listo.');

                await sock.sendMessage(to, { text: content });

                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Mensaje enviado con éxito');
            } catch (err) {
                console.error('❌ Error al enviar mensaje saliente:', err.message);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Error');
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT);
connectToWhatsApp();