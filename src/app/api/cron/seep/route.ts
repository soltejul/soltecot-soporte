import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { enviarMensajeWhatsApp } from '../../../../lib/whatsapp'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    // 1. Verificación de Seguridad para Vercel Cron
    const authHeader = request.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('No autorizado', { status: 401 })
    }

    try {
        console.log('🧹 [CRON SWEEP]: Iniciando barrido automático de prospectos...')

        const fechaActual = new Date()

        // ---------------------------------------------------------------------------
        // FASE 1: BARRIDO DE 72 HORAS (Reactivación de prospectos fríos)
        // ---------------------------------------------------------------------------
        const hace72Horas = new Date(fechaActual.getTime() - (72 * 60 * 60 * 1000))
        const hace96Horas = new Date(fechaActual.getTime() - (96 * 60 * 60 * 1000))

        // Buscar clientes cuyo último mensaje fue entre 72 y 96 horas atrás y no tienen orden activa
        const prospectosParaReactivar = await prisma.cliente.findMany({
            where: {
                tickets: {
                    every: {
                        OR: [
                            { numeroOrden: { startsWith: 'LEAD-' } },
                            { estado: 'ESPERANDO_APROBACION' }
                        ]
                    },
                    none: {
                        estado: {
                            in: ['AGENDADO' as any, 'RECOLECCION' as any, 'RECIBIDO', 'EN_DIAGNOSTICO', 'EN_REPARACION', 'LISTO_PARA_ENTREGA']
                        }
                    }
                },
                mensajes: {
                    some: {
                        createdAt: {
                            gte: hace96Horas,
                            lte: hace72Horas
                        }
                    }
                }
            },
            include: {
                mensajes: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        })

        let recordatoriosEnviados = 0
        const plantillaReactivacion = "Hola, ¿aún requieres apoyo con tu consola o ya pudiste resolverlo? Estamos a tus órdenes. 🎮🛠️"

        for (const cliente of prospectosParaReactivar) {
            // Verificar que el último mensaje no haya sido nuestro ni del bot (para no spamear)
            const ultimoMensaje = cliente.mensajes[0]

            // Verificación adicional: no enviar si ya tiene un rechazo previo o si el último mensaje fue nuestro recordatorio
            const yaRechazado = await prisma.ticket.findFirst({
                where: { clienteId: cliente.id, estado: 'RECHAZADO' }
            })

            if (!yaRechazado && ultimoMensaje && ultimoMensaje.origen === 'CLIENTE' && cliente.telefono) {
                try {
                    await enviarMensajeWhatsApp(cliente.telefono, plantillaReactivacion)
                    await prisma.mensaje.create({
                        data: {
                            texto: `[RECORDATORIO AUTOMÁTICO 72H]: ${plantillaReactivacion}`,
                            origen: 'BOT',
                            clienteId: cliente.id
                        }
                    })
                    recordatoriosEnviados++
                } catch (e) {
                    console.error(`Error enviando recordatorio 72h a ${cliente.telefono}:`, e)
                }
            }
        }

        // ---------------------------------------------------------------------------
        // FASE 2: ARCHIVADO POR INACTIVIDAD (7 Días)
        // ---------------------------------------------------------------------------
        const hace7Dias = new Date(fechaActual.getTime() - (7 * 24 * 60 * 60 * 1000))

        // Buscar leads que llevan más de 7 días inactivos
        const prospectosParaArchivar = await prisma.cliente.findMany({
            where: {
                tickets: {
                    every: {
                        OR: [
                            { numeroOrden: { startsWith: 'LEAD-' } },
                            { estado: 'ESPERANDO_APROBACION' }
                        ]
                    },
                    none: {
                        estado: {
                            in: ['AGENDADO' as any, 'RECOLECCION' as any, 'RECIBIDO', 'EN_DIAGNOSTICO', 'EN_REPARACION', 'LISTO_PARA_ENTREGA', 'ENTREGADO', 'RECHAZADO']
                        }
                    }
                },
                mensajes: {
                    every: {
                        createdAt: {
                            lt: hace7Dias
                        }
                    }
                }
            },
            select: { id: true }
        })

        const idsArchivar = prospectosParaArchivar.map(c => c.id)

        let leadsArchivados = 0
        if (idsArchivar.length > 0) {
            const resultArchivado = await prisma.ticket.updateMany({
                where: {
                    clienteId: { in: idsArchivar },
                    estado: 'ESPERANDO_APROBACION'
                },
                data: {
                    estado: 'RECHAZADO',
                    notasInternas: '[EXPIRADO_INACTIVIDAD] El sistema archivó este prospecto tras 7 días sin respuesta.'
                }
            })
            leadsArchivados = resultArchivado.count
        }

        console.log(`✅ [CRON SWEEP COMPLETADO]: ${recordatoriosEnviados} recordatorios enviados. ${leadsArchivados} leads archivados por inactividad.`)

        return NextResponse.json({
            success: true,
            fase1_recordatorios: recordatoriosEnviados,
            fase2_archivados: leadsArchivados,
            mensaje: `Barrido automático completado exitosamente.`
        })

    } catch (error: any) {
        console.error('🔴 [CRITICAL CRON ERROR]:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}