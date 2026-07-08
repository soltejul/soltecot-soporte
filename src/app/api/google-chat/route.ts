import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Respaldo táctico de variables de entorno oficiales de Meta
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

export async function POST(req: Request) {
    try {
        const body = await req.json()

        // 🎯 LOG ULTRA-DIAGNÓSTICO: Mantiene el rastreo del JSON crudo
        console.log("📥 [GOOGLE CHAT FULL PAYLOAD]:", JSON.stringify(body))

        // 🧠 RESOLUCIÓN DEL EMBOTELLAMIENTO:
        // Mapeamos el mensaje de forma híbrida para extraerlo sin importar cómo lo envíe Google
        const messageObj = body.message || body.chat?.messagePayload?.message

        // 🛡️ Filtro 0: Si Google avisa que el Bot fue agregado a la sala
        if (body.type === 'ADDED_TO_SPACE' || body.chat?.type === 'ADDED_TO_SPACE') {
            console.log("👋 [GOOGLE CHAT]: El bot fue agregado exitosamente al espacio.")
            return NextResponse.json({ text: '¡Hola! Soltecot CRM Bot se ha enlazado a este espacio con éxito. Listo para recibir tus respuestas.' })
        }

        // 🛡️ Filtro 1: Si el mensaje lo envió un BOT, lo ignoramos para evitar bucles infinitos
        if (messageObj?.sender?.type === 'BOT') {
            return NextResponse.json({})
        }

        // Extraemos los identificadores esenciales desde el objeto ya unificado
        const threadNameId = messageObj?.thread?.name
        let textoInyectado = messageObj?.argumentText?.trim() || messageObj?.text || ''

        // Limpieza de menciones remanentes si existen en el texto
        if (textoInyectado.includes('@')) {
            textoInyectado = textoInyectado.replace(/@[^\s]+/g, '').trim()
        }

        // Log de control previo a la validación en Neon
        console.log(`🔍 [DEBUG VALS]: threadNameId="${threadNameId}" | textoInyectado="${textoInyectado}"`)

        if (!textoInyectado || !threadNameId) {
            console.warn('⚠️ [GOOGLE CHAT]: Petición rechazada por falta de texto o ID de hilo en el payload procesado.')
            return NextResponse.json({})
        }

        console.log(`📡 [GOOGLE CHAT INBOUND]: Localizado en hilo: ${threadNameId} | Texto Limpio: "${textoInyectado}"`)

        // Extraemos el token alfanumérico único del final del ID del hilo (ej: b9gP6vFLIoc)
        const tokenUnicoHilo = threadNameId.split('/').pop() || threadNameId;

        // 🔍 Buscamos en Neon al cliente usando el token extraído
        const clienteAsociado = await prisma.cliente.findFirst({
            where: {
                googleChatThreadId: {
                    contains: tokenUnicoHilo
                }
            }
        })

        if (!clienteAsociado) {
            console.error(`❌ [HANDOFF ERROR]: No se encontró ningún cliente en Neon vinculado al token de hilo: ${tokenUnicoHilo}`)
            return NextResponse.json({})
        }

        if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
            console.error('🔴 [META CONFIG ERROR]: Las credenciales de WhatsApp están vacías en Vercel. Revisa tus Environment Variables.')
            return NextResponse.json({})
        }

        // 🚀 DISPARO MANUAL DE REGRESO A LA API DE META
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
            console.error(`🔴 [META API REJECT]: Meta rechazó el envío manual. Detalles:`, errorMetaRaw)
        }

        return NextResponse.json({})
    } catch (error: any) {
        console.error('🔴 Error Crítico en Receptor Google Chat:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}