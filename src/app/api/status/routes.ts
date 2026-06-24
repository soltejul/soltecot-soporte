import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma' // 🔌 Importe relativo seguro a tu instancia de Postgres

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const numeroOrden = searchParams.get('orden')

        // Validamos que el usuario haya escrito algo
        if (!numeroOrden) {
            return NextResponse.json({ error: 'El número de orden es requerido' }, { status: 400 })
        }

        // Buscamos de forma exacta e indexada en Postgres
        const ticket = await prisma.ticket.findUnique({
            where: {
                numeroOrden: numeroOrden.toUpperCase().trim() // Evitamos errores de minúsculas o espacios
            },
            select: {
                numeroOrden: true,
                equipo: true,
                fallaReportada: true,
                estado: true,
                costoEstimado: true,
                updatedAt: true,
                cliente: {
                    select: {
                        nombre: true // Traemos también el nombre del dueño de forma relacional
                    }
                }
            }
        })

        // Si el folio no existe en Postgres
        if (!ticket) {
            return NextResponse.json({ error: 'No encontramos ninguna orden con ese folio' }, { status: 404 })
        }

        // Si todo está correcto, devolvemos el ticket con estatus 200
        return NextResponse.json(ticket, { status: 200 })

    } catch (error: any) {
        console.error('🔴 [API STATUS ERROR]:', error.message)
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
    }
}