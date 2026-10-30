import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export const dynamic = 'force-dynamic'

async function ejecutarPurga(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const { clienteId, ids, forzar = false } = body

        // 1. Normalización de IDs a procesar (clienteId individual o lote de IDs)
        const listaIdsCandidatos: string[] = []
        if (clienteId && typeof clienteId === 'string') {
            listaIdsCandidatos.push(clienteId)
        }
        if (Array.isArray(ids)) {
            ids.forEach((id: any) => {
                if (typeof id === 'string' && id.trim()) {
                    listaIdsCandidatos.push(id.trim())
                }
            })
        }

        // ====================================================================
        // CASO A: PURGA SELECTIVA POR IDS (DESDE CHECKBOXES O DRAWER)
        // ====================================================================
        if (listaIdsCandidatos.length > 0) {
            const [clientesDirectos, ticketsAsociados] = await Promise.all([
                prisma.cliente.findMany({
                    where: { id: { in: listaIdsCandidatos } },
                    select: { id: true, telefono: true }
                }),
                prisma.ticket.findMany({
                    where: { id: { in: listaIdsCandidatos } },
                    select: { id: true, clienteId: true, estado: true, numeroOrden: true }
                })
            ])

            const clienteIdsSet = new Set<string>()
            const telefonosSet = new Set<string>()

            clientesDirectos.forEach(c => {
                clienteIdsSet.add(c.id)
                if (c.telefono) telefonosSet.add(c.telefono)
            })

            ticketsAsociados.forEach(t => {
                if (t.clienteId) clienteIdsSet.add(t.clienteId)
            })

            const clienteIdsFinales = Array.from(clienteIdsSet)

            if (clienteIdsFinales.length === 0) {
                return NextResponse.json({
                    success: true,
                    mensaje: 'No se encontraron registros coincidentes para purgar.',
                    purgados: 0
                })
            }

            // 🛡️ Filtro de Protección: Evitar borrar tickets de taller oficiales o entregados
            let clientesABorrar = clienteIdsFinales
            if (!forzar) {
                const clientesProtegidos = await prisma.cliente.findMany({
                    where: {
                        id: { in: clienteIdsFinales },
                        tickets: {
                            some: {
                                OR: [
                                    { numeroOrden: { not: { startsWith: 'LEAD-' } } },
                                    { estado: { in: ['RECIBIDO', 'EN_DIAGNOSTICO', 'EN_REPARACION', 'LISTO_PARA_ENTREGA', 'ENTREGADO'] } }
                                ]
                            }
                        }
                    },
                    select: { id: true }
                })

                const idsProtegidos = new Set(clientesProtegidos.map(c => c.id))
                clientesABorrar = clienteIdsFinales.filter(id => !idsProtegidos.has(id))
            }

            if (clientesABorrar.length === 0) {
                return NextResponse.json({
                    error: 'Los registros seleccionados corresponden a órdenes de taller activas o históricas y no pueden ser purgados.'
                }, { status: 400 })
            }

            // Rescatamos los teléfonos de todos los clientes a borrar para eliminar sus citas
            const clientesFinalesConTel = await prisma.cliente.findMany({
                where: { id: { in: clientesABorrar } },
                select: { telefono: true }
            })
            clientesFinalesConTel.forEach(c => {
                if (c.telefono) telefonosSet.add(c.telefono)
            })
            const listaTelefonosABorrar = Array.from(telefonosSet).filter(Boolean)

            // Transacción atómica: Mensajes -> Citas (por teléfono) -> Tickets -> Clientes
            const resultado = await prisma.$transaction(async (tx) => {
                const msgs = await tx.mensaje.deleteMany({
                    where: { clienteId: { in: clientesABorrar } }
                })

                let citasCount = 0
                if (listaTelefonosABorrar.length > 0) {
                    const citas = await tx.cita.deleteMany({
                        where: {
                            telefono: { in: listaTelefonosABorrar }
                        }
                    })
                    citasCount = citas.count
                }

                const tickets = await tx.ticket.deleteMany({
                    where: { clienteId: { in: clientesABorrar } }
                })

                const clientes = await tx.cliente.deleteMany({
                    where: { id: { in: clientesABorrar } }
                })

                return {
                    clientes: clientes.count,
                    tickets: tickets.count,
                    mensajes: msgs.count,
                    citas: citasCount
                }
            })

            return NextResponse.json({
                success: true,
                mensaje: `Se purgaron ${resultado.clientes} prospectos con éxito.`,
                detalles: resultado
            })
        }

        // ====================================================================
        // CASO B: BARRIDO AUTOMÁTICO DE LEADS HUÉRFANOS (SIN IDS ESPECÍFICOS)
        // ====================================================================
        const clientesHuerfanos = await prisma.cliente.findMany({
            where: {
                tickets: {
                    every: {
                        OR: [
                            { numeroOrden: { startsWith: 'LEAD-' } },
                            { estado: 'RECHAZADO' }
                        ]
                    },
                    none: {
                        estado: {
                            in: [
                                'AGENDADO' as any,
                                'RECOLECCION' as any,
                                'RECIBIDO',
                                'EN_DIAGNOSTICO',
                                'EN_REPARACION',
                                'LISTO_PARA_ENTREGA',
                                'ENTREGADO'
                            ]
                        }
                    }
                }
            },
            select: { id: true, telefono: true }
        })

        const idsHuerfanos = clientesHuerfanos.map(c => c.id)
        const telefonosHuerfanos = clientesHuerfanos
            .map(c => c.telefono)
            .filter((t): t is string => Boolean(t))

        if (idsHuerfanos.length === 0) {
            return NextResponse.json({
                success: true,
                mensaje: 'La base de datos se encuentra limpia. No hay prospectos huérfanos para purgar.',
                borrados: 0
            })
        }

        const resultadoBarrido = await prisma.$transaction(async (tx) => {
            await tx.mensaje.deleteMany({ where: { clienteId: { in: idsHuerfanos } } })

            if (telefonosHuerfanos.length > 0) {
                await tx.cita.deleteMany({ where: { telefono: { in: telefonosHuerfanos } } })
            }

            await tx.ticket.deleteMany({ where: { clienteId: { in: idsHuerfanos } } })
            const delClientes = await tx.cliente.deleteMany({ where: { id: { in: idsHuerfanos } } })
            return delClientes.count
        })

        return NextResponse.json({
            success: true,
            mensaje: `Barrido completado. Se eliminaron ${resultadoBarrido} prospectos inactivos.`,
            borrados: resultadoBarrido
        })

    } catch (error: any) {
        console.error('🔴 [CRITICAL PURGE ERROR]:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    return ejecutarPurga(request)
}

export async function POST(request: Request) {
    return ejecutarPurga(request)
}