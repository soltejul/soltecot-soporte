import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

export async function POST(req: Request) {
    try {
        const body = await req.json()
        console.log("📥 [GOOGLE CHAT FULL PAYLOAD]:", JSON.stringify(body))

        const messageObj = body.message || body.chat?.messagePayload?.message

        // 🛡️ Filtro 0: Si Google avisa que el Bot fue agregado a la sala
        if (body.type === 'ADDED_TO_SPACE' || body.chat?.type === 'ADDED_TO_SPACE') {
            return NextResponse.json({ text: '¡Hola! Soltecot CRM Bot se ha enlazado con éxito.' })
        }

        // 🛡️ Filtro 1: Si el mensaje lo envió un BOT, lo ignoramos para evitar bucles infinitos
        if (messageObj?.sender?.type === 'BOT') {
            return NextResponse.json({})
        }

        const threadNameId = messageObj?.thread?.name
        let textoInyectado = messageObj?.argumentText?.trim() || messageObj?.text || ''

        // Limpieza de menciones de usuario (@soltemsg)
        if (textoInyectado.includes('@')) {
            textoInyectado = textoInyectado.replace(/@[^\s]+/g, '').trim()
        }

        if (!textoInyectado || !threadNameId) {
            console.warn('⚠️ [GOOGLE CHAT]: Mensaje vacío o sin ID de hilo.')
            return NextResponse.json({})
        }

        const tokenUnicoHilo = threadNameId.split('/').pop() || threadNameId;
        const textoUpper = textoInyectado.toUpperCase().trim()

        // Regex flexible para capturar __COT_899__ o __COT_899
        const matchCotizacion = textoUpper.match(/__COT_(\d+(\.\d+)?)__/) || textoUpper.match(/__COT_(\d+(\.\d+)?)/)

        // 🔍 Buscamos al cliente asociado a este hilo en Neon utilizando el singleton unificado
        const clienteAsociado = await prisma.cliente.findFirst({
            where: ({
                googleChatThreadId: { contains: tokenUnicoHilo }
            } as any),
            include: { tickets: { orderBy: { createdAt: 'desc' }, take: 1 } }
        })

        if (!clienteAsociado) {
            console.error(`❌ [HANDOFF ERROR]: No se encontró ningún cliente en Neon para el hilo: ${tokenUnicoHilo}`)
            return NextResponse.json({})
        }

        // 🔄 CAMINO A: COMANDOS DE RE-ACTIVACIÓN Y CHATOPS
        if (textoUpper === '__REACTIVAR__' || matchCotizacion) {
            let nuevoCosto = null
            let mensajeSistemaWhatsApp = "🤖 _[SISTEMA]: El Ingeniero Julio ha registrado tu cotización. Nuestro Asistente Virtual retoma el chat para ayudarte a agendar tu cita y guardar tus datos de orden._\n\n¡Hola de nuevo! Ya tengo los detalles listos. Para confirmar tu espacio, ¿te gustaría agendar una visita presencial a nuestro laboratorio o prefieres coordinar la recolección a domicilio?"

            if (matchCotizacion) {
                nuevoCosto = matchCotizacion[1]
                const costoNumerico = parseFloat(nuevoCosto)
                let ticketActivo = clienteAsociado.tickets[0]

                // Si no hay ticket activo o ya están cerrados, creamos uno express en Neon
                if (!ticketActivo || ticketActivo.estado === 'ENTREGADO' || ticketActivo.estado === 'RECHAZADO') {
                    const ultimoTicketGlobal = await prisma.ticket.findFirst({ orderBy: { createdAt: 'desc' }, select: { numeroOrden: true } })
                    let nuevoFolio = 'SOL-1001'
                    if (ultimoTicketGlobal?.numeroOrden) {
                        nuevoFolio = `SOL-${parseInt(ultimoTicketGlobal.numeroOrden.split('-')[1]) + 1}`
                    }

                    ticketActivo = await prisma.ticket.create({
                        data: {
                            numeroOrden: nuevoFolio,
                            equipo: 'Soporte Técnico / Hardware',
                            fallaReportada: 'Cotización física realizada por el Ingeniero',
                            clienteId: clienteAsociado.id,
                            estado: 'ESPERANDO_APROBACION',
                            costoReparacion: costoNumerico
                        }
                    })
                } else {
                    await prisma.ticket.update({
                        where: { id: ticketActivo.id },
                        data: { costoReparacion: costoNumerico }
                    })
                }

                mensajeSistemaWhatsApp = `🤖 _[SISTEMA]: El Ingeniero Julio ha autorizado tu cotización por un total de *$${nuevoCosto} MXN*. Nuestro Asistente Virtual retoma el chat para ayudarte a agendar tu cita y tomar tus datos._\n\n¡Hola de nuevo! Ya guardé la cotización del ingeniero. Para confirmar tu espacio y proceder, ¿te gustaría agendar una visita presencial a nuestro laboratorio o prefieres coordinar la recolección a domicilio?`
                console.log(`💰 [CHATOP SUCCESS]: Ticket ${ticketActivo.numeroOrden} actualizado en Neon a $${nuevoCosto}`)
            }

            // Desbloqueamos el Bot en la base de datos
            await prisma.cliente.update({
                where: { id: clienteAsociado.id },
                data: { atendidoPorBot: true }
            })

            // Disparamos la alerta de reactivación a Meta WhatsApp
            if (WHATSAPP_TOKEN && PHONE_NUMBER_ID) {
                const urlMeta = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`
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

            return NextResponse.json({ text: `✅ Asistente Virtual reactivado.${nuevoCosto ? ` Cotización guardada en Neon: $${nuevoCosto}` : ''}` })
        }

        // 💬 CAMINO B: CONVERSACIÓN MANUAL DIRECTA (Julio chateando con el cliente)
        if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
            console.error('🔴 [META CONFIG ERROR]: Las credenciales de WhatsApp están vacías en Vercel.')
            return NextResponse.json({})
        }

        console.log(`🚀 [FORWARD MANUAL]: Reenviando mensaje manual de Julio al WhatsApp del cliente: ${clienteAsociado.telefono}`)
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