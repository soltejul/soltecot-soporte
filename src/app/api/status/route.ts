import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const numeroOrden = searchParams.get('orden')

        if (!numeroOrden || typeof numeroOrden !== 'string') {
            return NextResponse.json({ error: 'El número de orden es requerido' }, { status: 400 })
        }

        const ordenLimpia = numeroOrden.toUpperCase().trim()

        // Búsqueda en Postgres con proyección de campos seguros
        const ticket = await prisma.ticket.findUnique({
            where: {
                numeroOrden: ordenLimpia
            },
            select: {
                numeroOrden: true,
                equipo: true,
                fallaReportada: true,
                estado: true,
                costoEstimado: true,
                costoReparacion: true,
                updatedAt: true,
                cliente: {
                    select: {
                        nombre: true
                    }
                }
            }
        })

        if (!ticket) {
            return NextResponse.json({ error: 'No encontramos ninguna orden registrada con ese folio' }, { status: 404 })
        }

        // Respuesta con encabezados anti-caché para estado en tiempo real
        return NextResponse.json(ticket, {
            status: 200,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        })

    } catch (error: any) {
        console.error('🔴 [API STATUS ERROR]:', error.message)
        return NextResponse.json({ error: 'Error interno al consultar el estatus' }, { status: 500 })
    }
}