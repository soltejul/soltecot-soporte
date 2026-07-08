import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Token de Meta para enviar WhatsApps (Asegúrate de que use tu variable de entorno real)
const WHATSAPP_TOKEN = process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
const PHONE_NUMBER_ID = process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

export async function POST(req: Request) {
    try {
        const body = await req.json()

        // 🛡️ Filtro 1: Si el mensaje lo envió un BOT (o el mismo sistema), lo ignoramos para evitar bucles infinitos
        if (body.message?.sender?.type === 'BOT') {
            return NextResponse.json({})
        }

        const textoInyectado = body.message?.text
        const threadNameId = body.message?.thread?.name // El ID del hilo donde escribiste

        if (!textoInyectado || !threadNameId) {
            return NextResponse.json({})
        }

        console.log(`📡 [GOOGLE CHAT INBOUND]: Localizado en hilo: ${threadNameId} | Mensaje: "${textoInyectado}"`)

        // 🔍 Buscamos a qué cliente le pertenece ese hilo en Neon
        const clienteAsociado = await prisma.cliente.findFirst({
            where: { googleChatThreadId: threadNameId }
        })

        if (!clienteAsociado) {
            console.log(`⚠️ [HANDOFF WARN]: No se encontró ningún cliente vinculado al hilo: ${threadNameId}`)
            return NextResponse.json({})
        }

        // 🚀 ¡EL PASO MAESTRO!: Enviamos el mensaje directo al WhatsApp del cliente vía Meta API
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

        // Le respondemos 200 OK a Google Chat para cerrar la petición limpia
        return NextResponse.json({})
    } catch (error: any) {
        console.error('🔴 Error Crítico en Receptor Google Chat:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}