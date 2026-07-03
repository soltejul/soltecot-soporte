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

        // 🔗 URL de escape local
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://soporte.soltecot.com'

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

// 🔄 3. ACTUALIZAR TICKET DINÁMICO (PATCH)
export async function PATCH(request: Request) {
    try {
        const body = await request.json()
        const { ticketId, nuevoEstado, botActivo, costoReparacion, notasDiagnostico } = body

        if (!ticketId) {
            return NextResponse.json({ error: 'El parámetro ticketId es obligatorio' }, { status: 400 })
        }

        // 🧠 Construir el objeto de actualización de forma dinámica
        const datosAActualizar: any = {}

        if (nuevoEstado !== undefined) datosAActualizar.estado = nuevoEstado
        if (botActivo !== undefined) datosAActualizar.botActivo = botActivo
        if (costoReparacion !== undefined) datosAActualizar.costoReparacion = costoReparacion
        if (notasDiagnostico !== undefined) datosAActualizar.notasDiagnostico = notasDiagnostico

        // Ejecutar actualización en la base de datos Neon
        const ticketActualizado = await prisma.ticket.update({
            where: { id: ticketId },
            data: datosAActualizar,
            include: { cliente: true }
        })

        // 🔗 URL de seguimiento local/remota
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://192.168.20.13:3000'

        // 🚀 CONTROL DE MENSAJES SALIENTES POR WHATSAPP
        if (nuevoEstado) {
            let textoMensaje = ""

            if (nuevoEstado === "ESPERANDO_APROBACION") {
                // 💰 MENSAJE PERSONALIZADO DE PRESUPUESTO
                textoMensaje = `💰 *SOLTECOT_ PRESUPUESTO DE REPARACIÓN* 💰\n\n` +
                    `Hola, *${ticketActualizado.cliente.nombre}*. Hemos concluido el diagnóstico completo de tu equipo:\n` +
                    `💻 *Equipo:* ${ticketActualizado.equipo}\n` +
                    `🎫 *Orden de Servicio:* ${ticketActualizado.numeroOrden}\n\n` +
                    `🔬 *Diagnóstico Técnico:* ${notasDiagnostico || 'Revisión y corrección de líneas principales en tarjeta madre.'}\n\n` +
                    `💵 *Costo Total Autorizado:* $${costoReparacion} MXN (Neto)\n\n` +
                    `📌 *¿Cómo deseas proceder?* Por favor, responde a este mensaje con una sola palabra:\n\n` +
                    `👉 Escribe *Aceptar* (Para autorizar el inicio de la reparación).\n` +
                    `👉 Escribe *Rechazar* (Para cancelar y preparar la devolución de tu equipo).\n\n` +
                    `🌐 *Rastreo en Vivo:* Puedes consultar la nota técnica digital aquí:\n👉 ${APP_URL}?folio=${ticketActualizado.numeroOrden}`

            } else if (nuevoEstado === "LISTO_PARA_ENTREGA" || nuevoEstado === "ENTREGADO") {
                // 🚀 INTERCEPTOR PREMIUM DE FIN DE SERVICIO (REMOTO O FÍSICO)
                const nombreClienteEstetico = ticketActualizado.cliente.nombre && ticketActualizado.cliente.nombre !== 'Cliente Recepción' ? ticketActualizado.cliente.nombre : 'amigo'

                textoMensaje = `🔬 *¡SOPORTE TÉCNICO CONCLUIDO CON ÉXITO!* ⚡\n\n` +
                    `Hola, *${nombreClienteEstetico}*. El Ingeniero Julio ha finalizado las configuraciones, instalaciones y optimizaciones en tu equipo de forma 100% segura.\n\n` +
                    `💻 *Equipo:* ${ticketActualizado.equipo}\n` +
                    `🎫 *Folio de Orden:* ${ticketActualizado.numeroOrden}\n\n` +
                    `✨ *Tu sistema ya se encuentra operativo al 100% y acelerado.* Tu reporte técnico final y los registros de laboratorio han sido archivados con éxito.\n\n` +
                    `🧾 *Control Fiscal (CFDI 4.0):* Si solicitaste factura fiscal al aperturar tu orden, nuestro departamento contable la procesará y te llegará a tu correo en menos de 24 horas. Si indicaste que no la requerías, tu nota de servicio digital queda resguardada permanentemente.\n\n` +
                    `🙏 ¡Muchas gracias por confiar en el laboratorio de Soltecot_! Puedes consultar tu comprobante de cierre dándole clic aquí:\n👉 ${APP_URL}?folio=${ticketActualizado.numeroOrden}`

            } else {
                // 🛠️ MENSAJE ESTÁNDAR PARA OTROS CAMBIOS DE ESTATUS (RECIBIDO, DIAGNOSTICO, ETC)
                const estadoFormateado = typeof nuevoEstado === 'string' ? nuevoEstado.replace('_', ' ') : 'ACTUALIZADO'
                textoMensaje = `🔬 *SOLTECOT_ ACTUALIZACIÓN* 🔬\n\nEl estatus de tu orden *${ticketActualizado.numeroOrden}* (${ticketActualizado.equipo}) ha cambiado a:\n👉 *${estadoFormateado}*\n\n🌐 *Rastreo en Vivo:* Consulta el avance actualizado dándole clic aquí:\n👉 ${APP_URL}?folio=${ticketActualizado.numeroOrden}`
            }

            // Disparar el mensaje a través de Baileys
            await enviarMensajeWhatsApp(ticketActualizado.cliente.telefono, textoMensaje)
        }

        return NextResponse.json({ success: true, ticket: ticketActualizado }, { status: 200 })
    } catch (error: any) {
        console.error("🔴 [PATCH TICKETS ERROR]:", error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}