import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

// 📥 1. TRAER EL HISTORIAL EFÍMERO DE MENSAJES (GET)
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const clienteId = searchParams.get('clienteId')

        if (!clienteId) {
            return NextResponse.json({ error: 'El parámetro clienteId es obligatorio' }, { status: 400 })
        }

        // Jalamos los mensajes en orden cronológico ascendente para pintarlos tipo WhatsApp
        const mensajes = await prisma.mensaje.findMany({
            where: { clienteId },
            orderBy: { createdAt: 'asc' }
        })

        return NextResponse.json(mensajes, { status: 200 })
    } catch (error: any) {
        console.error('🔴 [GET CHAT ERROR]:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 🚀 2. ENVIAR MENSAJE MANUAL DESDE EL CRM A META WHATSAPP (POST)
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { clienteId, texto } = body

        if (!clienteId || !texto || texto.trim() === '') {
            return NextResponse.json({ error: 'Cliente ID y texto son obligatorios' }, { status: 400 })
        }

        // 1. Buscamos al cliente en Neon para obtener su teléfono real
        const cliente = await prisma.cliente.findUnique({
            where: { id: clienteId }
        })

        if (!cliente) {
            return NextResponse.json({ error: 'No se encontró al cliente en la base de datos' }, { status: 404 })
        }

        if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
            console.error('🔴 [META CONFIG ERROR]: Credenciales de WhatsApp ausentes en Vercel.')
            return NextResponse.json({ error: 'Configuración de WhatsApp ausente en el servidor' }, { status: 500 })
        }

        // 2. Despachamos el mensaje manual directo hacia la API Oficial de Meta Cloud
        const urlMetaOutbound = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`
        const respuestaMeta = await fetch(urlMetaOutbound, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: cliente.telefono,
                type: 'text',
                text: { body: texto.trim() }
            })
        })

        if (!respuestaMeta.ok) {
            const errorMetaRaw = await respuestaMeta.text()
            console.error(`🔴 [META API REJECT]: Meta rechazó el envío manual. Detalles:`, errorMetaRaw)
            return NextResponse.json({ error: 'Meta rechazó el envío del mensaje' }, { status: 500 })
        }

        // 3. ¡TIRO EXITOSO!: Registramos el mensaje con el sello HUMANO en tu chat efímero
        const nuevoMensaje = await prisma.mensaje.create({
            data: {
                texto: texto.trim(),
                origen: 'HUMANO',
                clienteId: clienteId
            }
        })

        // 🛡️ CANDADO HUMANO ADICIONAL: Forzamos que el bot siga silenciado para que no interrumpa tu charla
        await prisma.cliente.update({
            where: { id: clienteId },
            data: { atendidoPorBot: false }
        })

        console.log(`✅ [CRM OUTBOUND SUCCESS]: Mensaje manual guardado y enviado a: ${cliente.telefono}`)
        return NextResponse.json({ success: true, mensaje: nuevoMensaje }, { status: 201 })

    } catch (error: any) {
        console.error('🔴 [POST CHAT CRITICAL ERROR]:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}