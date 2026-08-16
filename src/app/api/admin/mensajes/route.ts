import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const telefono = searchParams.get('telefono')

        if (!telefono) {
            return NextResponse.json({ error: 'Teléfono requerido' }, { status: 400 })
        }

        const cleanPhone = telefono.replace(/[^0-9]/g, '').slice(-10)

        // 🐘 Buscamos al cliente y traemos todos sus mensajes ordenados
        const cliente = await prisma.cliente.findFirst({
            where: {
                OR: [
                    { telefono: cleanPhone },
                    { telefono: telefono.trim() }
                ]
            },
            include: {
                mensajes: {
                    orderBy: { createdAt: 'asc' }
                }
            }
        })

        if (!cliente) {
            return NextResponse.json({ mensajes: [], cliente: null })
        }

        return NextResponse.json({
            cliente: {
                id: cliente.id,
                nombre: cliente.nombre,
                telefono: cliente.telefono,
                atendidoPorBot: cliente.atendidoPorBot
            },
            mensajes: cliente.mensajes
        })

    } catch (error: any) {
        console.error("🔴 Error al obtener historial de mensajes:", error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}