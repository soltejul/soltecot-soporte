import { GoogleGenAI } from '@google/genai'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    try {
        const { messages } = await req.json()

        // 🔍 DETECTOR AUTOMÁTICO: Busca la llave bajo el formato nuevo o el anterior
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY

        // Si Next.js de verdad no ve ninguna, te lo avisará limpiamente en la terminal
        if (!apiKey) {
            console.error("❌ [ALERTA SOLTECOT]: No se detectó ninguna API Key en tu archivo .env o .env.local")
            return new Response(
                JSON.stringify({
                    error: 'Falta configuración',
                    details: 'La API Key no está llegando al servidor. Revisa tu archivo .env'
                }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // 1. Inicializamos el cliente oficial de Google con la llave detectada
        const ai = new GoogleGenAI({ apiKey })

        // 2. Traducimos el historial al formato exacto de Google ('user' y 'model')
        const googleContents = messages.map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }))

        // 3. Solicitamos el flujo continuo al modelo de última generación
        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: googleContents,
            config: {
                systemInstruction: `Eres el Agente de IA oficial de Soltecot_ (Solutions & Technology On Time).
                Tu objetivo es ser un recepcionista atento, profesional y técnico para nuestro laboratorio de reparación.
                REGLAS DE NEGOCIO:
                1. RECOLECCIONES: Ofrecemos servicio a domicilio ÚNICAMENTE Sábados y Domingos. Cupos limitados.
                2. COTIZACIONES: Da rangos estimados (ej: Mantenimiento PS5 $800-$1200, Limpieza Laptop $600-$800). El diagnóstico final es en laboratorio.
                3. 
                . TONO: Profesional, tecnológico, limpio y seguro.`,
            }
        })

        // 4. Creamos un ReadableStream nativo de la web para enviárselo al frontend
        const encoder = new TextEncoder()
        const customWebStream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of responseStream) {
                        if (chunk.text) {
                            controller.enqueue(encoder.encode(chunk.text))
                        }
                    }
                } catch (streamError) {
                    console.error("❌ Error durante el streaming:", streamError)
                } finally {
                    controller.close()
                }
            }
        })

        // 5. Retornamos la respuesta de texto plano directa
        return new Response(customWebStream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
            },
        })

    } catch (error: any) {
        console.error("🔴 [CRASH EN SDK GOOGLE]:", error)
        return new Response(
            JSON.stringify({ error: 'Error interno en el motor de Google', details: error?.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
}