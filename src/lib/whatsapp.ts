export async function enviarMensajeWhatsApp(telefono: string, mensaje: string): Promise<boolean> {
    try {
        // 🛡️ ESCUDO LOCAL: Si estás programando en casa y tienes la simulación encendida, no gasta tokens
        if (process.env.DISABLE_WHATSAPP_LOCAL === 'true') {
            console.log(`\n📱 [SIMULACIÓN WHATSAPP LOCAL]:`);
            console.log(`👉 Para: ${telefono}`);
            console.log(`💬 Mensaje:\n${mensaje}\n-----------------------------------------`);
            return true;
        }

        const TOKEN = process.env.NEXT_PUBLIC_WHATSAPP_TOKEN;
        const PHONE_NUMBER_ID = process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID;

        if (!TOKEN || !PHONE_NUMBER_ID) {
            console.error('🔴 [WHATSAPP API ERROR]: Faltan las variables de entorno de Meta en el servidor Vercel/Railway.');
            return false;
        }

        // 🧽 SANITIZACIÓN INTELIGENTE DE NÚMEROS (Adiós a los JIDs de Baileys)
        // 1. Si el teléfono viene con '@' (ej: 5215546088200@s.whatsapp.net o @lid), nos quedamos solo con la parte numérica izquierda
        let numeroLimpio = telefono.split('@')[0].replace(/\D/g, '');

        // 2. CORRECCIÓN PARA MÉXICO EN API OFICIAL:
        // Si el número viene con el formato legacy '521' + 10 dígitos (13 caracteres en total), Meta exige remover el '1'
        if (numeroLimpio.startsWith('521') && numeroLimpio.length === 13) {
            numeroLimpio = '52' + numeroLimpio.slice(3);
        }
        // Si viene solo de 10 dígitos (desde tu Dashboard manual), le inyectamos el prefijo oficial '52'
        else if (numeroLimpio.length === 10) {
            numeroLimpio = `52${numeroLimpio}`;
        }

        console.log(`📡 [META API]: Despachando mensaje directo a la nube -> ${numeroLimpio}`);

        // 🌐 ENDPOINT OFICIAL DE META GRAPH API
        const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

        // 📦 PAYLOAD: Estructura reglamentaria para mensajes de texto libre
        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: numeroLimpio,
            type: "text",
            text: {
                preview_url: false,
                body: mensaje
            }
        };

        const respuesta = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await respuesta.json();

        if (!respuesta.ok) {
            console.error(`❌ [META API ERROR]: Estatus ${respuesta.status}.`, JSON.stringify(data));
            return false;
        }

        console.log(`✅ [META API]: Mensaje entregado con éxito. ID: ${data.messages?.[0]?.id}`);
        return true;

    } catch (error: any) {
        console.error("🔴 [META API CRASH]:", error.message);
        return false;
    }
}