import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const telefono = searchParams.get('telefono')

        if (!telefono) return NextResponse.json({ error: 'Teléfono obligatorio' }, { status: 400 })

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
            cliente: { id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono, atendidoPorBot: cliente.atendidoPorBot },
            mensajes: cliente.mensajes
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 🗑️ PURGAR HISTORIAL DE MENSAJES DE UN NÚMERO
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

        // Borra los mensajes en cascada para no saturar Neon DB
        const purgados = await prisma.mensaje.deleteMany({
            where: { clienteId: cliente.id }
        })

        return NextResponse.json({ success: true, count: purgados.count })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}