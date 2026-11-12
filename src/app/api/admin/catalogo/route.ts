import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export const dynamic = 'force-dynamic'

// GET: Obtener catálogo completo y tiempo de entrega vigente
export async function GET() {
    try {
        const [servicios, config] = await Promise.all([
            prisma.servicioCatalogo.findMany({
                orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }]
            }),
            prisma.configuracionTaller.upsert({
                where: { id: 'global' },
                update: {},
                create: {
                    id: 'global',
                    tiempoEntregaActual: '1 a 2 días hábiles'
                }
            })
        ])

        return NextResponse.json({
            success: true,
            servicios,
            config
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// POST: Crear nuevo producto/servicio O actualizar tiempo de entrega
export async function POST(request: Request) {
    try {
        const body = await request.json()

        // Acción A: Actualizar tiempo de entrega global del taller
        if (body.accion === 'actualizar_tiempo') {
            const { tiempoEntregaActual, notaCargaTrabajo = '' } = body
            if (!tiempoEntregaActual) {
                return NextResponse.json({ error: 'El tiempo de entrega es obligatorio.' }, { status: 400 })
            }

            const config = await prisma.configuracionTaller.upsert({
                where: { id: 'global' },
                update: { tiempoEntregaActual, notaCargaTrabajo },
                create: { id: 'global', tiempoEntregaActual, notaCargaTrabajo }
            })

            return NextResponse.json({ success: true, config })
        }

        // Acción B: Agregar nuevo servicio o producto al catálogo
        const { nombre, categoria = 'General', precio, descripcion = '' } = body
        if (!nombre || precio === undefined || isNaN(Number(precio))) {
            return NextResponse.json({ error: 'Nombre y precio numérico son obligatorios.' }, { status: 400 })
        }

        const nuevoServicio = await prisma.servicioCatalogo.create({
            data: {
                nombre: nombre.trim(),
                categoria: categoria.trim(),
                precio: parseFloat(precio),
                descripcion: descripcion.trim() || null,
                activo: true
            }
        })

        return NextResponse.json({ success: true, servicio: nuevoServicio })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// PATCH: Editar precio, nombre o disponibilidad de un servicio existente
export async function PATCH(request: Request) {
    try {
        const body = await request.json()
        const { id, nombre, categoria, precio, descripcion, activo } = body

        if (!id) {
            return NextResponse.json({ error: 'Se requiere el ID del servicio.' }, { status: 400 })
        }

        const dataActualizar: any = {}
        if (nombre !== undefined) dataActualizar.nombre = nombre.trim()
        if (categoria !== undefined) dataActualizar.categoria = categoria.trim()
        if (precio !== undefined && !isNaN(Number(precio))) dataActualizar.precio = parseFloat(precio)
        if (descripcion !== undefined) dataActualizar.descripcion = descripcion.trim() || null
        if (activo !== undefined) dataActualizar.activo = Boolean(activo)

        const actualizado = await prisma.servicioCatalogo.update({
            where: { id },
            data: dataActualizar
        })

        return NextResponse.json({ success: true, servicio: actualizado })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// DELETE: Eliminar un producto del catálogo
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')
        if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

        await prisma.servicioCatalogo.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}