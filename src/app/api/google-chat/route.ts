import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Respaldo táctico de variables de entorno
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

export async function POST(req: Request) {
    try {
        const body = await req.json()

        // 🎯 LOG ULTRA-DIAGNÓSTICO: Esto imprimirá el JSON exacto en tu consola de Vercel
        console.log("📥 [GOOGLE CHAT FULL PAYLOAD]:", JSON.stringify(body))

        // 🛡️ Filtro 0: Si Google solo te está avisando que el Bot fue agregado a la sala, respondemos amigablemente
        if (body.type === 'ADDED_TO_SPACE') {
            console.log("👋 [GOOGLE CHAT]: El bot fue agregado exitosamente al espacio.")
            return NextResponse.json({ text: '¡Hola! Soltecot CRM Bot se ha enlazado a este espacio con éxito. Listo para recibir tus respuestas.' })
        }

        // 🛡️ Filtro 1: Si el mensaje lo envió un BOT, lo ignoramos para evitar bucles
        if (body.message?.sender?.type === 'BOT') {
            return NextResponse.json({})
        }

        // Extraemos los identificadores esenciales
        const threadNameId = body.message?.thread?.name
        let textoInyectado = body.message?.argumentText?.trim() || body.message?.text || ''

        // Limpieza de menciones remanentes si existen
        if (textoInyectado.includes('@')) {
            textoInyectado = textoInyectado.replace(/@[^\s]+/g, '').trim()
        }

        // Log de control previo a la validación
        console.log(`🔍 [DEBUG VALS]: threadNameId="${threadNameId}" | textoInyectado="${textoInyectado}"`)

        if (!textoInyectado || !threadNameId) {
            console.warn('⚠️ [GOOGLE CHAT]: Petición rechazada por falta de texto o ID de hilo en el objeto message.')
            return NextResponse.json({})
        }

        console.log(`📡 [GOOGLE CHAT INBOUND]: Localizado en hilo: ${threadNameId} | Texto Limpio: "${textoInyectado}"`)

        // Extraemos el token único del final del ID del hilo
        const tokenUnicoHilo = threadNameId.split('/').pop() || threadNameId;

        // Buscamos en Neon al cliente
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
            console.error('🔴 [META CONFIG ERROR]: Las credenciales de WhatsApp están vacías. Revisa Vercel.')
            return NextResponse.json({})
        }

        // 🚀 DISPARO MANUAL DE REGRESO A META
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
            console.error(`🔴 [META API REJECT]: Meta rechazó el envío manual. Detalles:`, errorMetaRaw)
        }

        return NextResponse.json({})
    } catch (error: any) {
        console.error('🔴 Error Crítico en Receptor Google Chat:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}