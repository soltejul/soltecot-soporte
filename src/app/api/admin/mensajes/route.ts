import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const telefono = searchParams.get('telefono')

        // 1️⃣ SI HAY TELÉFONO: Trae los mensajes y datos de ese cliente en específico
        if (telefono) {
            const phone10 = telefono.replace(/[^0-9]/g, '').slice(-10)

            const cliente = await prisma.cliente.findFirst({
                where: {
                    OR: [{ telefono: phone10 }, { telefono: telefono.trim() }]
                },
                include: {
                    mensajes: { orderBy: { createdAt: 'asc' } }
                }
            })

            if (!cliente) return NextResponse.json({ cliente: null, mensajes: [] })

            return NextResponse.json({
                cliente: {
                    id: cliente.id,
                    nombre: cliente.nombre,
                    telefono: cliente.telefono,
                    atendidoPorBot: cliente.atendidoPorBot
                },
                mensajes: cliente.mensajes
            })
        }

        // 2️⃣ SI NO HAY TELÉFONO: Lista todos los clientes que tienen conversaciones guardadas
        const conversaciones = await prisma.cliente.findMany({
            where: {
                mensajes: {
                    some: {} // Al menos un mensaje en historial
                }
            },
            select: {
                id: true,
                nombre: true,
                telefono: true,
                atendidoPorBot: true,
                mensajes: {
                    take: 1,
                    orderBy: { createdAt: 'desc' },
                    select: { texto: true, createdAt: true, origen: true }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        })

        return NextResponse.json({ conversaciones }, { status: 200 })

    } catch (error: any) {
        console.error("🔴 Error en API Mensajes:", error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 🗑️ PURGAR CONVERSACIÓN COMPLETA
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const telefono = searchParams.get('telefono')

        if (!telefono) return NextResponse.json({ error: 'Teléfono obligatorio' }, { status: 400 })

        const phone10 = telefono.replace(/[^0-9]/g, '').slice(-10)

        const cliente = await prisma.cliente.findFirst({
            where: { OR: [{ telefono: phone10 }, { telefono: telefono.trim() }] }
        })

        if (!cliente) return NextResponse.json({ message: 'No hay mensajes para purgar' })

        const purgados = await prisma.mensaje.deleteMany({
            where: { clienteId: cliente.id }
        })

        return NextResponse.json({ success: true, count: purgados.count })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}