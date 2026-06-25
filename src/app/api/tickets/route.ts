import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { enviarMensajeWhatsApp } from '../../../lib/whatsapp' // 🔌 Conector unificado Baileys

// 💾 1. CREAR TICKET (POST)
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { telefono, nombre, equipo, fallaReportada, costoEstimado, notasInternas } = body

        if (!telefono || !equipo || !fallaReportada) {
            return NextResponse.json({ error: 'Teléfono, equipo y falla son obligatorios' }, { status: 400 })
        }

        // 🔗 URL de escape local (Inyectada directamente en la función)
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://192.168.20.13:3000'

        const ultimoTicket = await prisma.ticket.findFirst({ orderBy: { createdAt: 'desc' }, select: { numeroOrden: true } })
        let nuevoFolio = 'SOL-1001'
        if (ultimoTicket?.numeroOrden) {
            nuevoFolio = `SOL-${parseInt(ultimoTicket.numeroOrden.split('-')[1]) + 1}`
        }

        const cliente = await prisma.cliente.upsert({
            where: { telefono: telefono.trim() },
            update: { nombre: nombre?.trim() },
            create: { telefono: telefono.trim(), nombre: nombre?.trim() || 'Cliente Recepción' }
        })

        const nuevoTicket = await prisma.ticket.create({
            data: {
                numeroOrden: nuevoFolio,
                equipo: equipo.trim(),
                fallaReportada: fallaReportada.trim(),
                costoEstimado: costoEstimado ? parseFloat(costoEstimado) : null,
                notasInternas: notasInternas ? notasInternas.trim() : null,
                clienteId: cliente.id,
                estado: 'RECIBIDO'
            }
        })

        const textoMensaje = `🚨 *SOLTECOT_ INFORMA* 🚨\n\nTu equipo *${equipo}* ha ingresado exitosamente al laboratorio.\n\n🎫 *Folio de Seguimiento:* ${nuevoFolio}\n🌐 *Rastreo en Vivo:* Dale clic aquí para consultar los detalles de tu reparación:\n👉 ${APP_URL}?folio=${nuevoFolio}`
        enviarMensajeWhatsApp(cliente.telefono, textoMensaje)

        return NextResponse.json({ success: true, ticket: nuevoTicket }, { status: 201 })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 📊 2. TRAER TODOS LOS TICKETS (GET)
export async function GET() {
    try {
        const tickets = await prisma.ticket.findMany({
            include: { cliente: true },
            orderBy: { createdAt: 'desc' }
        })
        return NextResponse.json(tickets, { status: 200 })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 🔄 3. ACTUALIZAR ESTATUS (PATCH)
export async function PATCH(request: Request) {
    try {
        const body = await request.json()
        const { ticketId, nuevoEstado } = body

        if (!ticketId || !nuevoEstado) {
            return NextResponse.json({ error: 'Faltan parámetros obligatorios (ticketId o nuevoEstado)' }, { status: 400 })
        }

        // 🔗 URL de escape local (Declarada aquí para evitar ReferenceErrors de alcance)
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://192.168.20.13:3000'

        const ticketActualizado = await prisma.ticket.update({
            where: { id: ticketId },
            data: { estado: nuevoEstado },
            include: { cliente: true }
        })

        const estadoFormateado = typeof nuevoEstado === 'string' ? nuevoEstado.replace('_', ' ') : 'ACTUALIZADO'

        const textoEstatus = `🔬 *SOLTECOT_ ACTUALIZACIÓN* 🔬\n\nEl estatus de tu orden *${ticketActualizado.numeroOrden}* (${ticketActualizado.equipo}) ha cambiado a:\n👉 *${estadoFormateado}*\n\n🌐 *Rastreo en Vivo:* Consulta el avance actualizado dándole clic aquí:\n👉 ${APP_URL}?folio=${ticketActualizado.numeroOrden}`
        enviarMensajeWhatsApp(ticketActualizado.cliente.telefono, textoEstatus)

        return NextResponse.json({ success: true, ticket: ticketActualizado }, { status: 200 })
    } catch (error: any) {
        console.error("🔴 [PATCH TICKETS ERROR]:", error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}