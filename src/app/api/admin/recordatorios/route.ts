import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export const dynamic = 'force-dynamic'

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

// 🚀 ENVÍO VÍA PLANTILLA META CLOUD API
async function enviarPlantillaRecordatorioMeta(
    to: string,
    nombreCliente: string,
    equipo: string,
    folio: string,
    estatusDinamico: string
) {
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) return false

    const cleanPhone = to.replace(/[^0-9]/g, '').slice(-10)
    if (cleanPhone.length < 10) return false
    const toMeta = `52${cleanPhone}`

    const paramNombre = String(nombreCliente || 'Cliente').trim()
    const paramEquipo = String(equipo || 'Dispositivo').trim()
    const paramFolio = String(folio || 'Sin Folio').trim()
    const paramEstatus = String(estatusDinamico).trim()

    const idiomas = ['es_MX', 'es']

    for (const codigoIdioma of idiomas) {
        try {
            const urlMeta = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`
            const respuesta = await fetch(urlMeta, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: toMeta,
                    type: 'template',
                    template: {
                        name: 'soltecot_seguimiento',
                        language: { code: codigoIdioma },
                        components: [
                            {
                                type: 'body',
                                parameters: [
                                    { type: 'text', text: paramNombre },   // {{1}}
                                    { type: 'text', text: paramEquipo },   // {{2}}
                                    { type: 'text', text: paramFolio },    // {{3}}
                                    { type: 'text', text: paramEstatus }   // {{4}}
                                ]
                            }
                        ]
                    }
                })
            })

            if (respuesta.ok) return true
        } catch (err: any) {
            console.error(`🔴 [META TEMPLATE RECORDATORIO ERROR]:`, err.message)
        }
    }

    return false
}

export async function POST(request: Request) {
    try {
        let ticketId: string | undefined
        let telefonoInd: string | undefined

        try {
            const body = await request.json()
            ticketId = body.ticketId
            telefonoInd = body.telefono
        } catch {
            return NextResponse.json({ error: 'Se requiere el body JSON' }, { status: 400 })
        }

        if (!ticketId && !telefonoInd) {
            return NextResponse.json({
                error: 'Debes proporcionar un ticketId o un teléfono para el recordatorio individual.'
            }, { status: 400 })
        }

        const ahoraMexicoString = new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" })
        const ahora = new Date(ahoraMexicoString)

        // 🧠 Búsqueda enfocada únicamente en el cliente o ticket seleccionado
        let whereCondition: any = {
            estado: { notIn: ['ENTREGADO', 'RECHAZADO'] }
        }

        if (ticketId) {
            whereCondition.id = ticketId
        } else if (telefonoInd) {
            const cleanPhone = telefonoInd.replace(/[^0-9]/g, '').slice(-10)
            whereCondition.cliente = {
                telefono: { endsWith: cleanPhone }
            }
        }

        const ticket = await prisma.ticket.findFirst({
            where: whereCondition,
            orderBy: { createdAt: 'desc' },
            include: {
                cliente: true,
                citas: {
                    where: { estado: { notIn: ['CANCELADA', 'COMPLETADA'] } },
                    orderBy: { fechaCita: 'desc' },
                    take: 1
                }
            }
        })

        if (!ticket) {
            return NextResponse.json({
                error: 'No se encontró una orden o cita activa para este chat.'
            }, { status: 404 })
        }

        const cliente = ticket.cliente
        if (!cliente || !cliente.telefono) {
            return NextResponse.json({ error: 'Cliente sin teléfono válido.' }, { status: 400 })
        }

        const nombreCliente = cliente.nombre || 'Cliente'
        const equipo = ticket.equipo || 'Equipo'
        const folio = ticket.numeroOrden || 'CITA'

        const citaRelacionada = ticket.citas?.[0]
        const fechaCitaRaw = citaRelacionada?.fechaCita || ticket.createdAt
        const horaCita = new Date(fechaCitaRaw)

        // 🧠 Detección si es Recolección o Visita al Laboratorio
        const esRecoleccion = citaRelacionada?.tipo === 'RECOLECCION' ||
            ticket.notasInternas?.includes('[RECOLECCION]') ||
            ticket.fallaReportada?.toLowerCase().includes('recolección')

        let paramEstatus = esRecoleccion
            ? '🚚 RECORDATORIO DE RECOLECCIÓN A DOMICILIO PROGRAMADA'
            : '📅 RECORDATORIO DE CITA PROGRAMADA EN LABORATORIO'

        if (horaCita && !isNaN(horaCita.getTime())) {
            const diferenciaMinutos = Math.round((horaCita.getTime() - ahora.getTime()) / (1000 * 60))

            if (diferenciaMinutos < 0 && diferenciaMinutos >= -60) {
                paramEstatus = esRecoleccion
                    ? '🚚 ¿TUVISTE UN CONTRATIEMPO? RESPÓNDENOS SI AÚN PODEMOS PASAR HOY POR TU EQUIPO 🗓️'
                    : '📍 ¿TUVISTE UN CONTRATIEMPO? RESPÓNDENOS SI AÚN VIENES HOY O SI REAGENDAMOS TU CITA 🗓️'
            } else if (diferenciaMinutos >= 0 && diferenciaMinutos <= 60) {
                paramEstatus = esRecoleccion
                    ? `⏰ NUESTRO INGENIERO PASARÁ POR TU EQUIPO EN APROXIMADAMENTE ${diferenciaMinutos} MINUTOS`
                    : `⏰ TE ESPERAMOS EN TU CITA EN ${diferenciaMinutos} MINUTOS`
            } else if (horaCita.getDate() === ahora.getDate() && horaCita.getMonth() === ahora.getMonth()) {
                paramEstatus = esRecoleccion
                    ? '🚚 HOY PASAMOS POR TU EQUIPO EN NUESTRA RUTA DE RECOLECCIÓN'
                    : '📍 TE ESPERAMOS HOY EN TU CITA EN LABORATORIO'
            }
        }

        const exito = await enviarPlantillaRecordatorioMeta(
            cliente.telefono,
            nombreCliente,
            equipo,
            folio,
            paramEstatus
        )

        if (exito) {
            const textoVisual = `⏳ *[RECORDATORIO INDIVIDUAL ENVIADO]*\n\nHola ${nombreCliente}, el estatus de tu equipo ${equipo} (Folio: ${folio}) ha sido notificado:\n\n👉 *${paramEstatus}*`

            await prisma.mensaje.create({
                data: {
                    texto: textoVisual,
                    origen: 'BOT',
                    clienteId: cliente.id
                }
            })

            return NextResponse.json({
                success: true,
                mensaje: `Recordatorio individual enviado con éxito a ${nombreCliente}.`
            })
        } else {
            return NextResponse.json({ error: 'No se pudo enviar la plantilla a Meta Cloud API.' }, { status: 500 })
        }

    } catch (error: any) {
        console.error("🔴 [ERROR RECORDATORIO INDIVIDUAL]:", error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}