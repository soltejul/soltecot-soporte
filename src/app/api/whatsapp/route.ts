import { GoogleGenAI } from '@google/genai'

export const dynamic = 'force-dynamic'

// 🧠 URL local donde estará escuchando tu servidor de OpenWA
const OPENWA_API_URL = 'http://localhost:8080'

export async function POST(req: Request) {
    try {
        // 1. Recibimos el evento que nos manda OpenWA cuando alguien escribe
        const event = await req.json()

        // Validamos que sea un mensaje de texto entrante legítimo
        if (event.type !== 'message' || !event.data || event.data.type !== 'chat') {
            return new Response('Evento ignorado', { status: 200 })
        }

        const chatMessage = event.data
        const mensajeCliente = chatMessage.body // El texto que escribió el cliente
        const numeroCliente = chatMessage.from // El ID/Teléfono del cliente (ej: 52155xxxxxxx@c.us)

        console.log(`📱 WhatsApp recibido de [${numeroCliente}]: ${mensajeCliente}`)

        // 2. Inicializamos el motor oficial de Google
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
        const ai = new GoogleGenAI({ apiKey })

        // 3. Le pedimos a Gemini 3 que procese la respuesta completa
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            // Le pasamos el mensaje del usuario adaptado al formato del SDK
            contents: [{ role: 'user', parts: [{ text: mensajeCliente }] }],
            config: {
                systemInstruction: `Eres el Agente de IA oficial de Soltecot_ (Solutions & Technology On Time) atendiendo directamente en WhatsApp.
                Tu objetivo es ser un recepcionista atento, profesional y técnico para nuestro laboratorio de reparación.
                REGLAS DE NEGOCIO:
                1. RECOLECCIONES: Servicio a domicilio ÚNICAMENTE Sábados y Domingos. Cupos limitados.
                2. COTIZACIONES: Da rangos estimados (ej: Mantenimiento PS5 $800-$1200, Limpieza Laptop $400-$600). El diagnóstico final es en laboratorio.
                3. TONO: Sé breve, conciso y muy profesional. Recuerda que estás en WhatsApp: usa saltos de línea para que sea fácil de leer y emojis de forma moderada 🛠️.`,
            }
        })

        const respuestaIA = response.text || 'Lo siento, estoy experimentando un problema técnico breve.'

        // 4. Le ordenamos a OpenWA que envíe la respuesta de vuelta a WhatsApp
        const openWaResponse = await fetch(`${OPENWA_API_URL}/sendText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: numeroCliente,
                content: respuestaIA
            })
        })

        if (!openWaResponse.ok) {
            console.error('❌ Error al conectar con la API de OpenWA')
        }

        return new Response('Mensaje procesado con éxito', { status: 200 })

    } catch (error) {
        console.error('🔴 [CRASH WEBHOOK WHATSAPP]:', error)
        return new Response('Internal Server Error', { status: 500 })
    }
}