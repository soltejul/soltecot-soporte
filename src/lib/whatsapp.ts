export async function enviarMensajeWhatsApp(telefono: string, mensaje: string) {
    const WHATSAPP_API_URL = 'http://localhost:8080'

    // 1. Limpiamos el número de espacios, guiones o símbolos
    let numeroLimpio = telefono.replace(/\D/g, '')

    // 🚨 EL CAMBIO SECRETO PARA MÉXICO:
    // Si el número viene a 10 dígitos, le agregamos el '52' de México + el '1' obligatorio para celulares
    if (numeroLimpio.length === 10) {
        numeroLimpio = `521${numeroLimpio}`
    }

    // 3. Lo empaquetamos con el sufijo que exige Baileys
    if (!numeroLimpio.includes('@s.whatsapp.net')) {
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