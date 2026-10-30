import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export const dynamic = 'force-dynamic'

async function ejecutarPurga(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const { clienteId, ids, forzar = false } = body

        // 1. Normalización de IDs a procesar
        const candidateIds: string[] = []
        if (clienteId && typeof clienteId === 'string') candidateIds.push(clienteId.trim())
        if (Array.isArray(ids)) {
            ids.forEach((id: any) => {
                if (typeof id === 'string' && id.trim()) candidateIds.push(id.trim())
            })
        }

        // ====================================================================
        // CASO A: PURGA SELECCIONADA POR CHECKBOXES O BOTÓN
        // ====================================================================
        if (candidateIds.length > 0) {
            // Buscamos si los IDs corresponden a Tickets o a Clientes directos
            const [ticketsDirectos, clientesDirectos] = await Promise.all([
                prisma.ticket.findMany({
                    where: { id: { in: candidateIds } },
                    select: { id: true, clienteId: true, estado: true, numeroOrden: true }
                }),
                prisma.cliente.findMany({
                    where: { id: { in: candidateIds } },
                    select: { id: true, telefono: true }
                })
            ])

            // 🛡️ ÚNICA REGLA DE PROTECCIÓN: No permitir borrar órdenes activas en taller a menos que se fuerce
            const ESTADOS_EN_PROCESO = ['RECIBIDO', 'EN_DIAGNOSTICO', 'EN_REPARACION', 'LISTO_PARA_ENTREGA']
            const ticketsEnProceso = ticketsDirectos.filter(t => ESTADOS_EN_PROCESO.includes(t.estado))

            if (ticketsEnProceso.length > 0 && !forzar) {
                const folios = ticketsEnProceso.map(t => t.numeroOrden).join(', ')
                return NextResponse.json({
                    error: `No se pueden eliminar órdenes activas en el laboratorio (${folios}). Cambia su estatus a RECHAZADO o ENTREGADO primero.`
                }, { status: 400 })
            }

            const ticketIdsParaBorrar = ticketsDirectos.map(t => t.id)
            const clienteIdsDeTickets = ticketsDirectos.map(t => t.clienteId).filter(Boolean) as string[]
            const clienteIdsDirectos = clientesDirectos.map(c => c.id)

            const todosClienteIds = Array.from(new Set([...clienteIdsDeTickets, ...clienteIdsDirectos]))

            // Rescatamos teléfonos para limpiar citas
            const clientesInfo = await prisma.cliente.findMany({
                where: { id: { in: todosClienteIds } },
                select: { id: true, telefono: true }
            })
            const telefonosParaCitas = clientesInfo.map(c => c.telefono).filter(Boolean) as string[]

            // Transacción atómica en Neon DB
            const resultado = await prisma.$transaction(async (tx) => {
                let ticketsBorrados = 0
                let clientesBorrados = 0
                let mensajesBorrados = 0
                let citasBorradas = 0

                // 1. Borrar los tickets seleccionados
                if (ticketIdsParaBorrar.length > 0) {
                    const resT = await tx.ticket.deleteMany({
                        where: { id: { in: ticketIdsParaBorrar } }
                    })
                    ticketsBorrados += resT.count
                }

                // 2. Si se seleccionaron Leads (clientes sin ticket), borrar mensajes y cliente
                if (clienteIdsDirectos.length > 0) {
                    const resM = await tx.mensaje.deleteMany({
                        where: { clienteId: { in: clienteIdsDirectos } }
                    })
                    mensajesBorrados += resM.count

                    const resT = await tx.ticket.deleteMany({
                        where: { clienteId: { in: clienteIdsDirectos } }
                    })
                    ticketsBorrados += resT.count

                    const resC = await tx.cliente.deleteMany({
                        where: { id: { in: clienteIdsDirectos } }
                    })
                    clientesBorrados += resC.count
                }

                // 3. Si al borrar tickets un cliente se queda con 0 tickets, limpiarlo
                for (const cId of clienteIdsDeTickets) {
                    const ticketsRestantes = await tx.ticket.count({ where: { clienteId: cId } })
                    if (ticketsRestantes === 0) {
                        await tx.mensaje.deleteMany({ where: { clienteId: cId } })
                        await tx.cliente.delete({ where: { id: cId } }).catch(() => { })
                        clientesBorrados++
                    }
                }

                // 4. Limpiar citas huérfanas por teléfono
                if (telefonosParaCitas.length > 0) {
                    const resCitas = await tx.cita.deleteMany({
                        where: { telefono: { in: telefonosParaCitas } }
                    })
                    citasBorradas = resCitas.count
                }

                return { ticketsBorrados, clientesBorrados, mensajesBorrados, citasBorradas }
            })

            return NextResponse.json({
                success: true,
                mensaje: `Se eliminaron ${resultado.ticketsBorrados} tickets y ${resultado.clientesBorrados} registros con éxito.`,
                detalles: resultado
            })
        }

        // ====================================================================
        // CASO B: BARRIDO AUTOMÁTICO DE PROSPECTOS INACTIVOS (SIN IDS)
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
        const telefonosHuerfanos = clientesHuerfanos.map(c => c.telefono).filter(Boolean) as string[]

        if (idsHuerfanos.length === 0) {
            return NextResponse.json({
                success: true,
                mensaje: 'La base de datos se encuentra limpia.',
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