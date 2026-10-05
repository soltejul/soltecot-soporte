import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { clienteId } = body

        if (clienteId) {
            // Eliminar un lead específico
            await prisma.mensaje.deleteMany({ where: { clienteId } })
            await prisma.ticket.deleteMany({ where: { clienteId } })
            await prisma.cliente.delete({ where: { id: clienteId } })

            return NextResponse.json({ success: true, mensaje: 'Lead eliminado correctamente.' })
        }

        // Purga masiva de leads sin tickets activos
        const borrados = await prisma.cliente.deleteMany({
            where: {
                tickets: {
                    none: {
                        OR: [
                            { estado: 'AGENDADO' as any },
                            { estado: 'RECOLECCION' as any },
                            { estado: 'RECIBIDO' },
                            { estado: 'EN_DIAGNOSTICO' },
                            { estado: 'EN_REPARACION' },
                            { estado: 'LISTO_PARA_ENTREGA' }
                        ]
                    }
                }
            }
        })

        return NextResponse.json({ success: true, borrados: borrados.count })

    } catch (error: any) {
        console.error('🔴 Error al purgar leads:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}