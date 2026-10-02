import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export const dynamic = 'force-dynamic'

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

async function enviarPlantillaSeguimientoInactivo(to: string, nombreCliente: string, equipo: string) {
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) return false

    const cleanPhone = to.replace(/[^0-9]/g, '').slice(-10)
    if (cleanPhone.length < 10) return false
    const toMeta = `52${cleanPhone}`

    const paramNombre = String(nombreCliente || 'Cliente').trim()
    const paramEquipo = String(equipo || 'Equipo').trim()

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
                        name: 'seguimiento_inactivo',
                        language: { code: codigoIdioma },
                        components: [
                            {
                                type: 'body',
                                parameters: [
                                    { type: 'text', text: paramNombre }, // {{1}}
                                    { type: 'text', text: paramEquipo }  // {{2}}
                                ]
                            }
                        ]
                    }
                })
            })

            if (respuesta.ok) return true
        } catch (err: any) {
            console.error(`🔴 [META TEMPLATE SEGUIMIENTO ERROR]:`, err.message)
        }
    }
    return false
}

export async function POST() {
    try {
        const ahora = new Date()
        const limite72Horas = new Date(ahora.getTime() - (72 * 60 * 60 * 1000))
        const limite10Dias = new Date(ahora.getTime() - (10 * 24 * 60 * 60 * 1000))

        // 1. BARRIDO 72H: Buscar leads inactivos para enviar plantilla
        const leadsInactivos = await prisma.ticket.findMany({
            where: {
                estado: 'ESPERANDO_APROBACION',
                updatedAt: { lte: limite72Horas }
            },
            include: { cliente: true }
        })

        let contadorEnviados = 0

        for (const ticket of leadsInactivos) {
            const cliente = ticket.cliente
            if (!cliente || !cliente.telefono) continue

            const exito = await enviarPlantillaSeguimientoInactivo(
                cliente.telefono,
                cliente.nombre || 'Cliente',
                ticket.equipo || 'tu equipo'
            )

            if (exito) {
                contadorEnviados++
                // Actualizar timestamp para evitar reenvíos inmediatos
                await prisma.ticket.update({
                    where: { id: ticket.id },
                    data: { updatedAt: ahora }
                })
            }
        }

        // 2. PURGA +10 DÍAS: Depurar prospectos antiguos abandonados con filtro de seguridad
        const purgaLeads = await prisma.ticket.deleteMany({
            where: {
                numeroOrden: { startsWith: 'LEAD-' },
                updatedAt: { lte: limite10Dias },
                NOT: {
                    OR: [
                        { estado: 'AGENDADO' },
                        { estado: 'RECOLECCION' },
                        { estado: 'RECIBIDO' },
                        { estado: 'EN_DIAGNOSTICO' },
                        { estado: 'EN_REPARACION' },
                        { estado: 'LISTO_PARA_ENTREGA' },
                        { notasInternas: { contains: '[AGENDADO]' } },
                        { notasInternas: { contains: '[RECOLECCION]' } }
                    ]
                }
            }
        })

        return NextResponse.json({
            success: true,
            enviados: contadorEnviados,
            evaluados: leadsInactivos.length,
            purgados10d: purgaLeads.count
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}