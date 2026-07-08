import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 🛡️ RESPALDO TÁCTICO: Validamos ambos nombres de variables (con y sin NEXT_PUBLIC)
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

export async function POST(req: Request) {
    try {
        const body = await req.json()

        // 🛡️ Filtro 1: Si el mensaje lo envió un BOT, lo ignoramos para evitar ecos infinitos
        if (body.message?.sender?.type === 'BOT') {
            return NextResponse.json({})
        }

        // 🧼 LIMPIEZA MAESTRA: Extrae estrictamente lo que escribiste DESPUÉS del @bot
        let textoInyectado = body.message?.argumentText?.trim() || body.message?.text || ''

        // Respaldo táctico: remover menciones remanentes
        if (textoInyectado.includes('@')) {
            textoInyectado = textoInyectado.replace(/@[^\s]+/g, '').trim()
        }

        const threadNameId = body.message?.thread?.name // Identificador del hilo enviado por Google

        if (!textoInyectado || !threadNameId) {
            console.log('⚠️ [GOOGLE CHAT]: Petición ignorada por falta de texto o ID de hilo.')
            return NextResponse.json({})
        }

        console.log(`📡 [GOOGLE CHAT INBOUND]: Procesando hilo: "${threadNameId}" | Texto Limpio: "${textoInyectado}"`)

        // 🔍 BÚSQUEDA ROBUSTA EN NEON: 
        // Si hay discrepancias de prefijos en los strings de Google, buscamos usando "contains"
        // extrayendo la parte final única del ID del hilo.
        const tokenUnicoHilo = threadNameId.split('/').pop() || threadNameId;

        // El modelo Prisma puede usar un nombre de campo distinto; evitamos el error de tipos
        // construyendo el objeto 'where' dinámicamente y tipándolo como any.
        const whereClause: any = { googleChatThreadId: tokenUnicoHilo }

        const clienteAsociado = await prisma.cliente.findFirst({
            where: whereClause
        })

        if (!clienteAsociado) {
            console.error(`❌ [HANDOFF ERROR]: No se encontró ningún cliente en Neon vinculado al token de hilo: ${tokenUnicoHilo}`)
            return NextResponse.json({})
        }

        // 🚨 Verificación de seguridad de credenciales antes de disparar a Meta
        if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
            console.error('🔴 [META CONFIG ERROR]: Los tokens de WhatsApp están vacíos. Revisa tus variables de entorno en Vercel.')
            return NextResponse.json({})
        }

        // 🚀 ¡EL DISPARO MAESTRO!: Enviamos la respuesta limpia al WhatsApp del cliente
        const urlMeta = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`

        const respuestaMeta = await fetch(urlMeta, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: clienteAsociado.telefono,
                type: 'text',
                text: { body: textoInyectado }
            })
        })

        if (respuestaMeta.ok) {
            console.log(`✅ [WHATSAPP OUTBOUND]: ¡Mensaje manual entregado con éxito a: ${clienteAsociado.telefono}!`)
        } else {
            const errorMetaRaw = await respuestaMeta.text()
            console.error(`🔴 [META API REJECT]: Meta rechazó el envío. Detalles:`, errorMetaRaw)
        }

        return NextResponse.json({})
    } catch (error: any) {
        console.error('🔴 Error Crítico en Receptor Google Chat:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}