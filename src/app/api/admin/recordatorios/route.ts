import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export const dynamic = 'force-dynamic'

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

// 🚀 ENVÍO VÍA PLANTILLA META CLOUD API (SALTA RESTRICCIÓN DE 24 HORAS)
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
                                    { type: 'text', text: paramEstatus }   // {{4}} Dinámico
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

export async function POST() {
    try {
        // 📅 OBTENER HORA ACTUAL EN ZONA HORARIA DE MÉXICO
        const ahoraMexicoString = new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" })
        const ahora = new Date(ahoraMexicoString)

        console.log(`📡 [RECORDATORIOS CRON]: Ejecutando revisión de citas en vivo...`)

        // 🐘 Buscar tickets o leads agendados en Neon DB
        const ticketsAgendados = await prisma.ticket.findMany({
            where: {
                OR: [
                    { estado: 'AGENDADO' as any },
                    { notasInternas: { contains: '[AGENDADO]' } }
                ]
            },
            include: { cliente: true }
        })

        if (ticketsAgendados.length === 0) {
            return NextResponse.json({
                success: true,
                enviados: 0,
                mensaje: `No hay citas agendadas detectadas en Neon DB.`
            })
        }

        let contadorEnviados = 0

        for (const ticket of ticketsAgendados) {
            const cliente = ticket.cliente
            if (!cliente || !cliente.telefono) continue

            const nombreCliente = cliente.nombre || 'Cliente'
            const equipo = ticket.equipo || 'Equipo'
            const folio = ticket.numeroOrden || 'CITA'

            // 🎯 LÓGICA DE TIEMPO DINÁMICO PARA VARIABLE {{4}}
            const fechaCitaRaw = (ticket as any) || ticket.updatedAt || ticket.createdAt
            const horaCita = new Date(fechaCitaRaw)

            let paramEstatus = '📅 RECORDATORIO DE CITA EN LABORATORIO'

            if (horaCita && !isNaN(horaCita.getTime())) {
                const diferenciaMinutos = Math.round((horaCita.getTime() - ahora.getTime()) / (1000 * 60))

                if (diferenciaMinutos < 0 && diferenciaMinutos >= -45) {
                    // 🚨 CLIENTE RETRASADO (Entre 1 y 45 min de retraso)
                    paramEstatus = '📍 ¿TUVISTE UN CONTRATIEMPO? RESPÓNDENOS SI AÚN VIENES HOY O SI REAGENDAMOS TU CITA 🗓️'
                } else if (diferenciaMinutos >= 0 && diferenciaMinutos <= 60) {
                    // ⏰ CITA PRÓXIMA (Faltan menos de 60 minutos, ej: 10 o 20 min)
                    paramEstatus = `⏰ TE ESPERAMOS EN TU CITA EN ${diferenciaMinutos} MINUTOS`
                } else if (horaCita.getDate() === ahora.getDate()) {
                    // 📍 CITA HOY (Más tarde en el día)
                    paramEstatus = '📍 TE ESPERAMOS HOY EN TU CITA EN LABORATORIO'
                } else {
                    // 📅 CITA MAÑANA O DÍAS POSTERIORES
                    paramEstatus = '📅 RECORDATORIO DE CITA MAÑANA EN LABORATORIO'
                }
            }

            // Disparo vía Meta Cloud API
            const exito = await enviarPlantillaRecordatorioMeta(
                cliente.telefono,
                nombreCliente,
                equipo,
                folio,
                paramEstatus
            )

            if (exito) contadorEnviados++
        }

        return NextResponse.json({
            success: true,
            enviados: contadorEnviados,
            total: ticketsAgendados.length
        })

    } catch (error: any) {
        console.error("🔴 [ERROR RECORDATORIOS CRON]:", error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}