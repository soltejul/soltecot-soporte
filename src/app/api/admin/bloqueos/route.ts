import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 📥 Consultar bloqueos activos o futuros
export async function GET() {
    try {
        const hoy = new Date()
        hoy.setHours(0, 0, 0, 0)

        const bloqueos = await prisma.bloqueoAgenda.findMany({
            where: { fechaFin: { gte: hoy } },
            orderBy: { fechaInicio: 'asc' }
        })

        return NextResponse.json(bloqueos)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// ➕ Crear un nuevo periodo de inactividad
export async function POST(request: Request) {
    try {
        const { fechaInicio, fechaFin, motivo } = await request.json()

        if (!fechaInicio || !fechaFin) {
            return NextResponse.json({ error: 'Faltan las fechas de inicio y fin' }, { status: 400 })
        }

        const nuevoBloqueo = await prisma.bloqueoAgenda.create({
            data: {
                fechaInicio: new Date(fechaInicio),
                fechaFin: new Date(fechaFin),
                motivo: motivo || 'Fuera de laboratorio'
            }
        })

        return NextResponse.json(nuevoBloqueo)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 🗑️ Eliminar un bloqueo
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) return NextResponse.json({ error: 'Falta el ID' }, { status: 400 })

        await prisma.bloqueoAgenda.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}