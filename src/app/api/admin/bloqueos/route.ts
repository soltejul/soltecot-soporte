import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export const dynamic = 'force-dynamic'

// 📥 Consultar bloqueos activos o futuros en hora local CDMX
export async function GET() {
    try {
        const hoy = new Date()
        // Ajuste a inicio de día en horario de México para evitar desfases
        const hoyMexicoStr = hoy.toLocaleDateString("en-US", { timeZone: "America/Mexico_City" })
        const hoyMexico = new Date(hoyMexicoStr)
        hoyMexico.setHours(0, 0, 0, 0)

        const bloqueos = await prisma.bloqueoAgenda.findMany({
            where: { fechaFin: { gte: hoyMexico } },
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

        // 🛡️ BINDING DE ZONA HORARIA Y COBERTURA DE DÍA COMPLETO
        // fechaInicio empieza a las 00:00:00 y fechaFin se extiende a las 23:59:59.999
        const inicioIso = fechaInicio.includes('T') ? fechaInicio : `${fechaInicio}T00:00:00.000-06:00`
        const finIso = fechaFin.includes('T') ? fechaFin : `${fechaFin}T23:59:59.999-06:00`

        const dateInicio = new Date(inicioIso)
        const dateFin = new Date(finIso)

        if (dateFin < dateInicio) {
            return NextResponse.json({ error: 'La fecha de fin no puede ser anterior a la de inicio' }, { status: 400 })
        }

        const nuevoBloqueo = await prisma.bloqueoAgenda.create({
            data: {
                fechaInicio: dateInicio,
                fechaFin: dateFin,
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