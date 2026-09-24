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

        // 🐘 1. Buscar tickets agendados ACTIVOS (Ignorando Entregados y Rechazados)
        // e incluyendo la relación de la tabla Cita para leer la fecha real
        const ticketsAgendados = await prisma.ticket.findMany({
            where: {
                estado: { notIn: ['ENTREGADO', 'RECHAZADO'] },
                OR: [
                    { notasInternas: { contains: '[AGENDADO]' } },
                    { fallaReportada: { contains: 'Agendad' } }
                ]
            },
            include: {
                cliente: true,
                citas: {
                    where: { estado: { notIn: ['CANCELADA', 'COMPLETADA'] } },
                    orderBy: { fechaCita: 'desc' },
                    take: 1
                }
            }
        })

        if (ticketsAgendados.length === 0) {
            return NextResponse.json({
                success: true,
                enviados: 0,
                mensaje: `No hay citas agendadas activas en Neon DB.`
            })
        }

        let contadorEnviados = 0
        const h3Atras = new Date(ahora.getTime() - (4 * 60 * 60 * 1000)) // Ventana de 4 horas anti-spam

        for (const ticket of ticketsAgendados) {
            const cliente = ticket.cliente
            if (!cliente || !cliente.telefono) continue

            // 🛑 FILTRO ANTI-SPAM: Verificar si ya se le envió un recordatorio en las últimas 4 horas
            const ultimoRecordatorioReciente = await prisma.mensaje.findFirst({
                where: {
                    clienteId: cliente.id,
                    origen: 'BOT',
                    texto: { contains: '[RECORDATORIO AUTOMÁTICO ENVIADO]' },
                    createdAt: { gte: h3Atras }
                }
            })

            if (ultimoRecordatorioReciente) {
                console.log(`⏳ [ANTI-SPAM]: Recordatorio omitido para ${cliente.telefono}. Ya se le envió uno recientemente.`)
                continue
            }

            const nombreCliente = cliente.nombre || 'Cliente'
            const equipo = ticket.equipo || 'Equipo'
            const folio = ticket.numeroOrden || 'CITA'

            // 🎯 LÓGICA DE TIEMPO DINÁMICO LEYENDO LA TABLA CITA O FALLBACK A CREATEDAT
            const citaRelacionada = ticket.citas?.[0]
            const fechaCitaRaw = citaRelacionada?.fechaCita || ticket.createdAt
            const horaCita = new Date(fechaCitaRaw)

            let paramEstatus = '📅 RECORDATORIO DE CITA EN LABORATORIO'

            if (horaCita && !isNaN(horaCita.getTime())) {
                const diferenciaMinutos = Math.round((horaCita.getTime() - ahora.getTime()) / (1000 * 60))

                if (diferenciaMinutos < 0 && diferenciaMinutos >= -60) {
                    // 🚨 CLIENTE RETRASADO (Hasta 60 min de tolerancia)
                    paramEstatus = '📍 ¿TUVISTE UN CONTRATIEMPO? RESPÓNDENOS SI AÚN VIENES HOY O SI REAGENDAMOS TU CITA 🗓️'
                } else if (diferenciaMinutos >= 0 && diferenciaMinutos <= 60) {
                    // ⏰ CITA PRÓXIMA (Faltan menos de 60 minutos)
                    paramEstatus = `⏰ TE ESPERAMOS EN TU CITA EN ${diferenciaMinutos} MINUTOS`
                } else if (horaCita.getDate() === ahora.getDate() && horaCita.getMonth() === ahora.getMonth()) {
                    // 📍 CITA HOY
                    paramEstatus = '📍 TE ESPERAMOS HOY EN TU CITA EN LABORATORIO'
                } else {
                    // 📅 CITA MAÑANA O POSTERIOR
                    paramEstatus = '📅 RECORDATORIO DE CITA PROGRAMADA EN LABORATORIO'
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

            if (exito) {
                contadorEnviados++

                // 👁️ REGISTRO DE ECO VISUAL EN EL CHAT DEL DASHBOARD
                try {
                    const textoVisual = `⏳ *[RECORDATORIO AUTOMÁTICO ENVIADO]*\n\nHola ${nombreCliente}, el estatus de tu equipo ${equipo} (Folio: ${folio}) ha cambiado a:\n\n👉 *${paramEstatus}*`

                    await prisma.mensaje.create({
                        data: {
                            texto: textoVisual,
                            origen: 'BOT',
                            clienteId: cliente.id
                        }
                    })
                } catch (errDb) {
                    console.error("🔴 Error guardando eco visual en DB:", errDb)
                }
            }
        }

        return NextResponse.json({
            success: true,
            enviados: contadorEnviados,
            totalEvaluados: ticketsAgendados.length
        })

    } catch (error: any) {
        console.error("🔴 [ERROR RECORDATORIOS CRON]:", error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}