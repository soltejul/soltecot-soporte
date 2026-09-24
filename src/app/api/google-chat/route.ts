import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
        const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

        // 🛡️ Filtro 0: Si Google avisa que el Bot fue agregado a la sala
        if (body.type === 'ADDED_TO_SPACE' || body.chat?.type === 'ADDED_TO_SPACE') {
            return NextResponse.json({ text: '¡Hola! Soltecot CRM Bot se ha enlazado con éxito al espacio.' })
        }

        const messageObj = body.message || body.chat?.messagePayload?.message

        // 🛡️ Filtro 1: Ignorar mensajes enviados por el propio BOT para evitar bucles
        if (messageObj?.sender?.type === 'BOT') {
            return NextResponse.json({})
        }

        const threadNameId = messageObj?.thread?.name // Formato: spaces/XXXX/threads/YYYY
        let textoInyectado = messageObj?.argumentText?.trim() || messageObj?.text || ''

        // Limpieza de menciones de usuario (@soltemsg o similares)
        if (textoInyectado.includes('@')) {
            textoInyectado = textoInyectado.replace(/@[^\s]+/g, '').trim()
        }

        if (!textoInyectado || !threadNameId) {
            return NextResponse.json({})
        }

        const tokenUnicoHilo = threadNameId.split('/').pop() || threadNameId
        const textoUpper = textoInyectado.toUpperCase().trim()

        // Match para montos de cotización (ej: __COT_950__)
        const matchCotizacion = textoUpper.match(/__COT_(\d+(\.\d+)?)__/) || textoUpper.match(/__COT_(\d+(\.\d+)?)/)

        // Match explícito para teléfonos de 10 dígitos
        const matchTelefono = textoUpper.match(/\b\d{10}\b/)
        let clienteAsociado = null

        // 🎯 1. Búsqueda explícita por teléfono
        if (matchTelefono) {
            clienteAsociado = await prisma.cliente.findFirst({
                where: { telefono: { endsWith: matchTelefono[0] } },
                include: { tickets: { orderBy: { createdAt: 'desc' }, take: 1 } }
            })

            // Si se encontró por teléfono, asociamos el ID del hilo para futuras interacciones
            if (clienteAsociado && clienteAsociado.googleChatThreadId !== threadNameId) {
                await prisma.cliente.update({
                    where: { id: clienteAsociado.id },
                    data: { googleChatThreadId: threadNameId }
                })
            }
        }

        // 🛡️ 2. Fallback: Búsqueda por ID de Hilo de Google Chat
        if (!clienteAsociado) {
            clienteAsociado = await prisma.cliente.findFirst({
                where: {
                    OR: [
                        { googleChatThreadId: tokenUnicoHilo },
                        { googleChatThreadId: threadNameId }
                    ]
                },
                include: { tickets: { orderBy: { createdAt: 'desc' }, take: 1 } }
            })
        }

        if (!clienteAsociado) {
            return NextResponse.json({
                text: `⚠️ [CRM ERROR]: No se encontró ningún cliente en Neon para este hilo. Incluye su número de teléfono en el mensaje, ejemplo:\n@soltemsg __REACTIVAR__ 5581805250 __COT_950__`
            })
        }

        // 🔄 CAMINO A: COMANDOS DE RE-ACTIVACIÓN Y COTIZACIÓN (CHATOPS)
        if (textoUpper.includes('__REACTIVAR__') || matchCotizacion) {
            let nuevoCosto: string | null = null
            let mensajeSistemaWhatsApp = "🤖 _[SISTEMA]: El Ingeniero Julio ha registrado tu cotización. Nuestro Asistente Virtual retoma el chat para ayudarte a agendar tu cita y guardar tus datos de orden._\n\n¡Hola de nuevo! Ya tengo los detalles listos. Para confirmar tu espacio, ¿te gustaría agendar una visita presencial a nuestro laboratorio o prefieres coordinar la recolección a domicilio?"

            if (matchCotizacion) {
                const valorMonto = matchCotizacion[1] || '0'
                nuevoCosto = valorMonto
                const costoNumerico = parseFloat(valorMonto)
                let ticketActivo = clienteAsociado.tickets[0]

                if (!ticketActivo || ticketActivo.estado === 'ENTREGADO' || ticketActivo.estado === 'RECHAZADO') {
                    // Generación segura de folio
                    const ultimoTicketGlobal = await prisma.ticket.findFirst({
                        orderBy: { createdAt: 'desc' },
                        select: { numeroOrden: true }
                    })

                    let numFolio = 1001
                    if (ultimoTicketGlobal?.numeroOrden) {
                        const matchNum = ultimoTicketGlobal.numeroOrden.match(/SOL-(\d+)/)
                        if (matchNum) numFolio = parseInt(matchNum[1], 10) + 1
                    }

                    ticketActivo = await prisma.ticket.create({
                        data: {
                            numeroOrden: `SOL-${numFolio}`,
                            equipo: 'Soporte Técnico / Hardware',
                            fallaReportada: 'Cotización física realizada por el Ingeniero',
                            clienteId: clienteAsociado.id,
                            estado: 'ESPERANDO_APROBACION',
                            costoEstimado: costoNumerico,
                            costoReparacion: costoNumerico
                        }
                    })
                } else {
                    await prisma.ticket.update({
                        where: { id: ticketActivo.id },
                        data: {
                            costoEstimado: costoNumerico,
                            costoReparacion: costoNumerico,
                            estado: 'ESPERANDO_APROBACION'
                        }
                    })
                }

                mensajeSistemaWhatsApp = `🤖 _[SISTEMA]: El Ingeniero Julio ha autorizado tu cotización por un total de *$${nuevoCosto} MXN*. Nuestro Asistente Virtual retoma el chat para ayudarte a agendar tu cita y tomar tus datos._\n\n¡Hola de nuevo! Ya guardé la cotización del ingeniero. Para confirmar tu espacio y proceder, ¿te gustaría agendar una visita presencial a nuestro laboratorio o prefieres coordinar la recolección a domicilio?`
            }

            // Desbloquear Asistente IA en la base de datos
            await prisma.cliente.update({
                where: { id: clienteAsociado.id },
                data: { atendidoPorBot: true }
            })

            // Notificar al cliente vía WhatsApp
            if (WHATSAPP_TOKEN && PHONE_NUMBER_ID) {
                const urlMeta = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`
                await fetch(urlMeta, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messaging_product: 'whatsapp',
                        recipient_type: 'individual',
                        to: clienteAsociado.telefono,
                        type: 'text',
                        text: { body: mensajeSistemaWhatsApp }
                    })
                })
            }

            return NextResponse.json({
                text: `✅ [CRM]: Asistente Virtual reactivado para ${clienteAsociado.nombre}.${nuevoCosto ? ` Cotización guardada: $${nuevoCosto} MXN` : ''}`
            })
        }

        // 💬 CAMINO B: CONVERSACIÓN MANUAL DIRECTA DESDE GOOGLE CHAT
        if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
            return NextResponse.json({ text: '❌ Error: Faltan credenciales de WhatsApp en el servidor.' })
        }

        const urlMetaOutbound = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`
        const respuestaMeta = await fetch(urlMetaOutbound, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: clienteAsociado.telefono,
                type: 'text',
                text: { body: textoInyectado }
            })
        })

        if (!respuestaMeta.ok) {
            return NextResponse.json({ text: `❌ Error al enviar mensaje a WhatsApp por rechazo de Meta API.` })
        }

        // 🔐 PERSISTENCIA INTEGRAL: Registrar el mensaje en Neon DB y Pausar la IA
        await prisma.mensaje.create({
            data: {
                texto: textoInyectado,
                origen: 'HUMANO',
                clienteId: clienteAsociado.id
            }
        })

        await prisma.cliente.update({
            where: { id: clienteAsociado.id },
            data: { atendidoPorBot: false }
        })

        return NextResponse.json({
            text: `💬 [ENVIADO A ${clienteAsociado.nombre}]: "${textoInyectado}"`
        })

    } catch (error: any) {
        console.error('🔴 Error Crítico en Receptor Google Chat:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}