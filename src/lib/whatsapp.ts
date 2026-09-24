export async function enviarMensajeWhatsApp(telefono: string, mensaje: string): Promise<boolean> {
    try {
        // 🛡️ 1. MODO SIMULACIÓN LOCAL (Para desarrollo sin consumir API de Meta)
        if (process.env.DISABLE_WHATSAPP_LOCAL === 'true') {
            console.log(`\n📱 [SIMULACIÓN WHATSAPP LOCAL]:`)
            console.log(`👉 Para: ${telefono}`)
            console.log(`💬 Mensaje:\n${mensaje}\n-----------------------------------------`)
            return true
        }

        // 🔑 2. RESOLUCIÓN SEGURA DE VARIABLES DE ENTORNO
        const TOKEN = (
            process.env.WHATSAPP_TOKEN ||
            process.env.NEXT_PUBLIC_WHATSAPP_TOKEN ||
            process.env.META_TOKEN
        )?.trim()

        const PHONE_NUMBER_ID = (
            process.env.PHONE_NUMBER_ID ||
            process.env.WHATSAPP_PHONE_NUMBER_ID ||
            process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID ||
            process.env.META_PHONE_NUMBER_ID
        )?.trim()

        if (!TOKEN || !PHONE_NUMBER_ID) {
            console.error('🔴 [WHATSAPP API ERROR]: Faltan las variables de entorno de Meta en el servidor.')
            return false
        }

        // 🧽 3. SANITIZACIÓN DE TELÉFONO PARA MÉXICO (+52)
        let numeroLimpio = telefono.split('@')[0].replace(/\D/g, '')

        // Si viene en formato legacy '521' + 10 dígitos (13 caracteres), removemos el '1'
        if (numeroLimpio.startsWith('521') && numeroLimpio.length === 13) {
            numeroLimpio = '52' + numeroLimpio.slice(3)
        }
        // Si viene solo con 10 dígitos, le adjuntamos el código de país '52'
        else if (numeroLimpio.length === 10) {
            numeroLimpio = `52${numeroLimpio}`
        }

        // 🌐 4. DESPACHO A LA API OFICIAL DE META CLOUD
        const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`

        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: numeroLimpio,
            type: "text",
            text: {
                preview_url: false,
                body: mensaje
            }
        }

        const respuesta = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })

        const data = await respuesta.json()

        if (!respuesta.ok) {
            console.error(`❌ [META API ERROR]: Estatus ${respuesta.status}.`, JSON.stringify(data))
            return false
        }

        console.log(`✅ [META API SUCCESS]: Mensaje entregado a ${numeroLimpio} | ID: ${data.messages?.[0]?.id}`)
        return true

    } catch (error: any) {
        console.error("🔴 [META API CRASH]:", error.message || error)
        return false
    }
}