import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'

// 🔐 Credenciales oficiales de Meta configuradas en tus variables de entorno
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

// 🚀 FUNCIÓN AUXILIAR UNIFICADA PARA META CLOUD API
async function enviarMensajeMeta(to: string, texto: string) {
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
        console.error('🔴 [META CONFIG ERROR]: Tokens o Phone ID ausentes en las variables de entorno.')
        return false
    }
    try {
        const urlMeta = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`
        const respuesta = await fetch(urlMeta, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'text',
                text: { body: texto }
            })
        })

        if (!respuesta.ok) {
            const errorRaw = await respuesta.text()
            console.error(`🔴 [META API REJECT]: Error devuelto por Facebook:`, errorRaw)
            return false
        }
        console.log(`✉️ [META API SUCCESS]: Mensaje automatizado entregado con éxito a: ${to}`)
        return true
    } catch (err: any) {
        console.error(`🔴 [META FETCH CRITICAL]: Fallo de conexión de red con Meta:`, err.message)
        return false
    }
}

// 💾 1. CREAR O UNIFICAR TICKET DESDE PORTAL DE INGRESO (POST)
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { telefono, nombre, equipo, fallaReportada, costoEstimado, notasInternas } = body

        if (!telefono || !equipo || !fallaReportada) {
            return NextResponse.json({ error: 'Teléfono, equipo y falla son obligatorios' }, { status: 400 })
        }

        // 🔗 URL de escape local o producción
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://soporte.soltecot.com'

        // Sanitizamos variantes comunes de teléfono
        const cleanPhone = telefono.replace(/[^0-9]/g, '')
        const phone10 = cleanPhone.slice(-10)

        // 1. Buscamos si el cliente ya existe en Neon por cualquiera de sus formatos
        let cliente = await prisma.cliente.findFirst({
            where: {
                OR: [
                    { telefono: telefono.trim() },
                    { telefono: cleanPhone },
                    { telefono: phone10 }
                ]
            }
        })

        if (!cliente) {
            // Si es un cliente completamente nuevo de recepción, lo creamos y apagamos el bot
            cliente = await prisma.cliente.create({
                data: {
                    telefono: phone10,
                    nombre: nombre?.trim() || 'Cliente Recepción',
                    atendidoPorBot: false
                }
            })
        } else {
            // Si ya existía, actualizamos su nombre si se introduce uno real y APAGAMOS EL BOT
            // Esto garantiza que la IA se quede silenciada mientras el hardware está en revisión
            await prisma.cliente.update({
                where: { id: cliente.id },
                data: {
                    nombre: nombre && nombre.trim() !== '' && nombre !== 'Cliente Recepción' && nombre !== 'Cliente WhatsApp' ? nombre.trim() : cliente.nombre,
                    atendidoPorBot: false
                }
            })
        }

        // 2. 🔍 LÓGICA DE UNIFICACIÓN: Buscamos si tiene un ticket de preventa abierto por WhatsApp
        let ticketExistente = await prisma.ticket.findFirst({
            where: {
                clienteId: cliente.id,
                estado: 'ESPERANDO_APROBACION'
            },
            orderBy: { createdAt: 'desc' }
        })

        let ticketFinal
        let esUnificacion = false
        const costoNumerico = costoEstimado ? parseFloat(costoEstimado) : null

        if (ticketExistente) {
            // ¡Bingo! El cliente ya tenía una cotización por WhatsApp. Enriquecemos ese mismo folio para evitar retrabajo
            ticketFinal = await prisma.ticket.update({
                where: { id: ticketExistente.id },
                data: {
                    equipo: equipo.trim(),
                    fallaReportada: fallaReportada.trim(),
                    costoEstimado: costoNumerico || ticketExistente.costoEstimado,
                    costoReparacion: costoNumerico || ticketExistente.costoReparacion,
                    notasInternas: notasInternas ? `[Ingreso Taller]: ${notasInternas.trim()}` : ticketExistente.notasInternas,
                    estado: 'RECIBIDO' // Pasa formalmente a ingresado al laboratorio
                }
            })
            esUnificacion = true
        } else {
            // No hay ticket de preventa previo, generamos un folio nuevo secuencial
            const ultimoTicket = await prisma.ticket.findFirst({ orderBy: { createdAt: 'desc' }, select: { numeroOrden: true } })
            let nuevoFolio = 'SOL-1001'
            if (ultimoTicket?.numeroOrden) {
                nuevoFolio = `SOL-${parseInt(ultimoTicket.numeroOrden.split('-')[1]) + 1}`
            }

            ticketFinal = await prisma.ticket.create({
                data: {
                    numeroOrden: nuevoFolio,
                    equipo: equipo.trim(),
                    fallaReportada: fallaReportada.trim(),
                    costoEstimado: costoNumerico,
                    costoReparacion: costoNumerico,
                    notasInternas: notasInternas ? notasInternas.trim() : null,
                    clienteId: cliente.id,
                    estado: 'RECIBIDO'
                }
            })
        }

        // 3. Disparar confirmación de recepción estética hacia la API de Meta
        const textoMensaje = `🔬 *SOLTECOT_ WORKSHOP INFORMA* 🔬\n\nHemos registrado el ingreso formal de tu equipo a nuestro laboratorio de ingeniería.\n\n🎫 *Folio de Seguimiento:* ${ticketFinal.numeroOrden}\n💻 *Dispositivo:* ${ticketFinal.equipo}\n🛠️ *Falla Reportada:* ${ticketFinal.fallaReportada}\n📍 *Estatus Actual:* ⚙️ RECIBIDO\n\n🌐 *Rastreo en Vivo:* Puedes consultar la evolución de tu orden en tiempo real dándole clic aquí:\n👉 ${APP_URL}?folio=${ticketFinal.numeroOrden}`

        await enviarMensajeMeta(cliente.telefono, textoMensaje)

        return NextResponse.json({
            success: true,
            message: esUnificacion ? 'Ticket de preventa WhatsApp unificado con éxito.' : 'Nueva orden generada desde cero.',
            ticket: ticketFinal
        }, { status: esUnificacion ? 200 : 201 })

    } catch (error: any) {
        console.error("🔴 [POST TICKETS ERROR]:", error.message)
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

// 🔄 3. ACTUALIZAR TICKET DINÁMICO DESDE SELECTORES DEL PANEL (PATCH)
export async function PATCH(request: Request) {
    try {
        const body = await request.json()
        const { ticketId, nuevoEstado, botActivo, costoReparacion, notasDiagnostico } = body

        if (!ticketId) {
            return NextResponse.json({ error: 'El parámetro ticketId es obligatorio' }, { status: 400 })
        }

        // Construir el objeto de actualización del ticket de forma dinámica
        const datosAActualizar: any = {}

        if (nuevoEstado !== undefined) datosAActualizar.estado = nuevoEstado
        if (botActivo !== undefined) datosAActualizar.botActivo = botActivo
        if (costoReparacion !== undefined) datosAActualizar.costoReparacion = parseFloat(costoReparacion)
        if (notasDiagnostico !== undefined) datosAActualizar.notasDiagnostico = notasDiagnostico

        // Ejecutar actualización en la base de datos Neon
        const ticketActualizado = await prisma.ticket.update({
            where: { id: ticketId },
            data: datosAActualizar,
            include: { cliente: true }
        })

        // 🎯 ALINEACIÓN DEL SWITCH DE IA: Si desde el Dashboard activas/desactivas el Botón de Bot, 
        // impactamos directamente al Cliente para que el webhook de WhatsApp lo respete en el acto.
        if (botActivo !== undefined) {
            await prisma.cliente.update({
                where: { id: ticketActualizado.clienteId },
                data: { atendidoPorBot: botActivo }
            })
            console.log(`🤖 [CRM INTERN]: Estado del Bot alterado desde el Dashboard a: ${botActivo} para el cliente ${ticketActualizado.cliente.telefono}`)
        }

        // 🔗 URL de seguimiento local/remota
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://soporte.soltecot.com'

        // 🚀 CONTROL DE MENSAJES SALIENTES SEGÚN CAMBIO DE SELECTOR
        if (nuevoEstado) {
            let textoMensaje = ""
            const estadoNormalizado = nuevoEstado.replace(/[\s_]+/g, '_').toUpperCase()

            // Si el servicio concluye de forma definitiva, liberamos al cliente para futuros soportes
            if (estadoNormalizado === 'ENTREGADO' || estadoNormalizado === 'RECHAZADO') {
                await prisma.cliente.update({
                    where: { id: ticketActualizado.clienteId },
                    data: {
                        atendidoPorBot: true, // El bot volverá a atenderlo en su próxima visita meses después
                        googleChatThreadId: null // Rompemos el hilo para que su próximo caso genere una tarjeta nueva
                    }
                });
                await prisma.mensaje.deleteMany({
                    where: { clienteId: ticketActualizado.clienteId }
                });

                console.log(`🧹 [DB CLEANUP]: Historial de chat efímero destruido con éxito para el cliente: ${ticketActualizado.cliente.telefono}`);
            }

            if (estadoNormalizado === "ESPERANDO_APROBACION") {
                // 💰 MENSAJE DE PRESUPUESTO AUTOMATIZADO
                textoMensaje = `💰 *SOLTECOT_ PRESUPUESTO DE REPARACIÓN* 💰\n\n` +
                    `Hola, *${ticketActualizado.cliente.nombre}*. Hemos concluido el diagnóstico completo de tu equipo:\n\n` +
                    `💻 *Equipo:* ${ticketActualizado.equipo}\n` +
                    `🎫 *Orden de Servicio:* ${ticketActualizado.numeroOrden}\n\n` +
                    `🔬 *Diagnóstico Técnico:* ${notasDiagnostico || 'Revisión general y corrección de líneas principales en placa base.'}\n\n` +
                    `💵 *Costo Total Autorizado:* *$${costoReparacion || ticketActualizado.costoReparacion} MXN* (Neto)\n\n` +
                    `📌 *¿Cómo deseas proceder?* Por favor, responde a este chat con una sola palabra:\n\n` +
                    `👉 Escribe *Aceptar* (Para autorizar el inicio de la reparación y recibir datos de anticipo).\n` +
                    `👉 Escribe *Rechazar* (Para cancelar y preparar la devolución de tu equipo).\n\n` +
                    `🌐 *Rastreo en Vivo:* Consulta tu nota técnica digital aquí:\n👉 ${APP_URL}?folio=${ticketActualizado.numeroOrden}`

            } else if (estadoNormalizado === "LISTO_PARA_ENTREGA" || estadoNormalizado === "ENTREGADO") {
                // 🚀 INTERCEPTOR DE FIN DE SERVICIO
                const nombreClienteEstetico = ticketActualizado.cliente.nombre && ticketActualizado.cliente.nombre !== 'Cliente Recepción' && ticketActualizado.cliente.nombre !== 'Cliente WhatsApp' ? ticketActualizado.cliente.nombre : 'amigo'

                textoMensaje = `🔬 *¡SOPORTE TÉCNICO CONCLUIDO CON ÉXITO!* ⚡\n\n` +
                    `Hola, *${nombreClienteEstetico}*. El Ingeniero Julio ha finalizado las intervenciones, reparaciones y pruebas de calidad en tu equipo de forma exitosa.\n\n` +
                    `💻 *Equipo:* ${ticketActualizado.equipo}\n` +
                    `🎫 *Folio de Orden:* ${ticketActualizado.numeroOrden}\n\n` +
                    `✨ *Tu sistema ya se encuentra operativo al 100%.* Tu reporte técnico final y los registros de laboratorio han sido archivados con éxito.\n\n` +
                    `🧾 *Control Fiscal (CFDI 4.0):* Si solicitaste factura fiscal al aperturar tu orden, nuestro departamento contable la procesará a la brevedad. Si indicaste que no la requerías, tu nota de servicio digital queda resguardada permanentemente.\n\n` +
                    `🙏 ¡Muchas gracias por confiar en el laboratorio de Soltecot_! Puedes consultar tu comprobante de cierre dándole clic aquí:\n👉 ${APP_URL}?folio=${ticketActualizado.numeroOrden}`

            } else if (estadoNormalizado === "EN_DIAGNOSTICO") {
                // 🔍 MENSAJE DE DIAGNÓSTICO ACTIVO
                textoMensaje = `🔬 *SOLTECOT_ WORKSHOP* 🔬\n\nTu orden *${ticketActualizado.numeroOrden}* (${ticketActualizado.equipo}) ha avanzado al banco de pruebas.\n\n📍 *Estatus:* 🔍 EN DIAGNÓSTICO\n\nNuestros ingenieros están realizando las mediciones de voltajes y consumos en placa base para localizar el origen exacto de la falla. Te notificaremos los resultados a la brevedad.`

            } else {
                // 🛠️ MENSAJE ESTÁNDAR PARA OTROS CAMBIOS DE ESTATUS
                const estadoFormateado = typeof nuevoEstado === 'string' ? nuevoEstado.replace(/_/g, ' ') : 'ACTUALIZADO'
                textoMensaje = `🔬 *SOLTECOT_ ACTUALIZACIÓN* 🔬\n\nEl estatus de tu orden *${ticketActualizado.numeroOrden}* (${ticketActualizado.equipo}) ha cambiado a:\n👉 *${estadoFormateado}*\n\n🌐 *Rastreo en Vivo:* Consulta el avance actualizado dándole clic aquí:\n👉 ${APP_URL}?folio=${ticketActualizado.numeroOrden}`
            }

            // Disparar el mensaje final hacia Meta API
            await enviarMensajeMeta(ticketActualizado.cliente.telefono, textoMensaje)
        }

        return NextResponse.json({ success: true, ticket: ticketActualizado }, { status: 200 })
    } catch (error: any) {
        console.error("🔴 [PATCH TICKETS ERROR]:", error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}