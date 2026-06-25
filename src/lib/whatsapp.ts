export async function enviarMensajeWhatsApp(telefono: string, mensaje: string) {
    const WHATSAPP_API_URL = 'http://localhost:8080'

    let numeroLimpio = ''

    // 🛡️ CONFIGURACIÓN INTELIGENTE DE CANALES
    if (telefono.includes('@')) {
        // Si ya viene con un JID estructurado (como @lid o @s.whatsapp.net desde el bot), lo respetamos intacto
        numeroLimpio = telefono.trim()
    } else {
        // Si viene del Dashboard manual (solo los 10 dígitos del cliente)
        // 1. Limpiamos el número de espacios, guiones o símbolos
        numeroLimpio = telefono.replace(/\D/g, '')

        // 🚨 EL CAMBIO SECRETO PARA MÉXICO:
        if (numeroLimpio.length === 10) {
            numeroLimpio = `521${numeroLimpio}`
        }

        // 3. Lo empaquetamos con el sufijo estándar de clientes
        numeroLimpio = `${numeroLimpio}@s.whatsapp.net`
    }

    try {
        console.log(`📡 [BAILEYS LIB]: Intentando enviar a JID -> ${numeroLimpio}`)

        const respuesta = await fetch(`${WHATSAPP_API_URL}/sendText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: numeroLimpio,
                content: mensaje
            })
        })

        if (!respuesta.ok) {
            const dataError = await respuesta.text()
            console.error(`❌ [BAILEYS API ERROR]: Estatus ${respuesta.status}.`, dataError)
            return false
        }

        console.log(`✅ [BAILEYS LIB]: Mensaje enviado exitosamente a ${numeroLimpio}`)
        return true
    } catch (error: any) {
        console.error("🔴 [BAILEYS LIB CRASH]:", error.message)
        return false
    }
}