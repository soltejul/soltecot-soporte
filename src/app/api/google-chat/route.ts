import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

export async function POST(req: Request) {
    try {
        const body = await req.json()
        console.log("📥 [GOOGLE CHAT FULL PAYLOAD]:", JSON.stringify(body))

        const messageObj = body.message || body.chat?.messagePayload?.message

        if (body.type === 'ADDED_TO_SPACE' || body.chat?.type === 'ADDED_TO_SPACE') {
            return NextResponse.json({ text: '¡Hola! Soltecot CRM Bot se ha enlazado con éxito.' })
        }

        if (messageObj?.sender?.type === 'BOT') {
            return NextResponse.json({})
        }

        const threadNameId = messageObj?.thread?.name
        let textoInyectado = messageObj?.argumentText?.trim() || messageObj?.text || ''

        if (textoInyectado.includes('@')) {
            textoInyectado = textoInyectado.replace(/@[^\s]+/g, '').trim()
        }

        if (!textoInyectado || !threadNameId) {
            return NextResponse.json({})
        }

        const tokenUnicoHilo = threadNameId.split('/').pop() || threadNameId;
        const textoUpper = textoInyectado.toUpperCase().trim()

        // Regex flexible para capturar __COT_899__ o __COT_899
        const matchCotizacion = textoUpper.match(/__COT_(\d+(\.\d+)?)__/) || textoUpper.match(/__COT_(\d+(\.\d+)?)/)

        if (textoUpper === '__REACTIVAR__' || matchCotizacion) {

            const clienteReactivar = await prisma.cliente.findFirst({
                where: { googleChatThread: { contains: tokenUnicoHilo } } as any,
                include: { tickets: { orderBy: { createdAt: 'desc' }, take: 1 } }
            })

            if (clienteReactivar) {
                let nuevoCosto = null
                let mensajeSistemaWhatsApp = "🤖 _[SISTEMA]: El Ingeniero Julio ha registrado tu cotización. Nuestro Asistente Virtual retoma el chat para ayudarte a agendar tu cita y guardar tus datos de orden._\n\n¡Hola de nuevo! Ya tengo los detalles listos. Para confirmar tu espacio, ¿te gustaría agendar una visita presencial a nuestro laboratorio o prefieres coordinar la recolección a domicilio?"

                if (matchCotizacion) {
                    nuevoCosto = matchCotizacion[1]
                    let ticketActivo = clienteReactivar.tickets[0]

                    // 🛡️ CONTROL DE SEGURIDAD: Si no hay ticket activo, lo creamos en Neon para guardar el precio
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
                                clienteId: clienteReactivar.id,
                                estado: 'ESPERANDO_APROBACION',
                                costoReparacion: nuevoCosto
                            }
                        })
                    } else {
                        // Si ya existía un ticket abierto, solo le actualizamos el costo pactado
                        await prisma.ticket.update({
                            where: { id: ticketActivo.id },
                            data: { costoReparacion: nuevoCosto }
                        })
                    }

                    mensajeSistemaWhatsApp = `🤖 _[SISTEMA]: El Ingeniero Julio ha autorizado tu cotización por un total de *$${nuevoCosto} MXN*. Nuestro Asistente Virtual retoma el chat para ayudarte a agendar tu cita y tomar tus datos._\n\n¡Hola de nuevo! Ya guardé la cotización del ingeniero. Para confirmar tu espacio y proceder, ¿te gustaría agendar una visita presencial a nuestro laboratorio o prefieres coordinar la recolección a domicilio?`
                    console.log(`💰 [CHATOP SUCCESS]: Ticket ${ticketActivo.numeroOrden} guardado en Neon con costo: $${nuevoCosto}`)
                }

                // Desbloqueamos el Bot
                await prisma.cliente.update({
                    where: { id: clienteReactivar.id },
                    data: { atendidoPorBot: true }
                })

                const urlMeta = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`
                await fetch(urlMeta, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messaging_product: 'whatsapp',
                        recipient_type: 'individual',
                        to: clienteReactivar.telefono,
                        type: 'text',
                        text: { body: mensajeSistemaWhatsApp }
                    })
                })

                return NextResponse.json({ text: `Subido con éxito.${nuevoCosto ? ` Cotización fijada en Neon: $${nuevoCosto}` : ''}` })
            }
        }

        return NextResponse.json({})
    } catch (error: any) {
        console.error('🔴 Error Receptor Google Chat:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}