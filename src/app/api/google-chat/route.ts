import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Variables de entorno oficiales de tu proyecto
const WHATSAPP_TOKEN = process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
const PHONE_NUMBER_ID = process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

export async function POST(req: Request) {
    try {
        const body = await req.json()

        // 🛡️ Filtro 1: Si el mensaje lo envió un BOT, lo ignoramos para evitar ecos infinitos
        if (body.message?.sender?.type === 'BOT') {
            return NextResponse.json({})
        }

        // 🧼 LIMPIEZA MAESTRA: 'argumentText' extrae estrictamente lo que escribiste DESPUÉS del @bot
        let textoInyectado = body.message?.argumentText?.trim() || body.message?.text || ''

        // Respaldo táctico: si por alguna razón queda rastro de una mención, la removemos con Regex
        if (textoInyectado.includes('@')) {
            textoInyectado = textoInyectado.replace(/@[^\s]+/g, '').trim()
        }

        const threadNameId = body.message?.thread?.name // Identificador del hilo

        if (!textoInyectado || !threadNameId) {
            return NextResponse.json({})
        }

        console.log(`📡 [GOOGLE CHAT INBOUND]: Localizado en hilo: ${threadNameId} | Texto Limpio: "${textoInyectado}"`)

        // 🔍 Buscamos en Neon a qué número de cliente pertenece este hilo de conversación
        // Type assertion because the Prisma schema may use a different field name
        // for the Google Chat thread ID. Cast to any to avoid TypeScript error
        // when the property isn't present in ClienteWhereInput.
        const clienteAsociado = await prisma.cliente.findFirst({
            where: ({ googleChatThreadId: threadNameId } as any)
        })

        if (!clienteAsociado) {
            console.log(`⚠️ [HANDOFF WARN]: No se encontró ningún cliente vinculado al hilo: ${threadNameId}`)
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
            console.log(`✅ [WHATSAPP OUTBOUND]: Mensaje manual entregado con éxito a: ${clienteAsociado.telefono}`)
        } else {
            const errorMetaRaw = await respuestaMeta.text()
            console.error(`🔴 [META API REJECT]: Meta rechazó el envío manual:`, errorMetaRaw)
        }

        return NextResponse.json({})
    } catch (error: any) {
        console.error('🔴 Error Crítico en Receptor Google Chat:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}