import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { obtenerOCrearCarpetaFolio, subirFotoEvidencia } from '@/src/lib/googleDrive'

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

// 🚀 FUNCIÓN 1: ENVÍO DE TEXTO LIBRE (DENTRO DE LA VENTANA DE 24 HORAS)
async function enviarMensajeMeta(to: string, texto: string) {
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) return false

    const cleanPhone = to.replace(/[^0-9]/g, '').slice(-10)
    const toMeta = `52${cleanPhone}` // Prefijo de México obligatorio por Meta

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
                to: toMeta,
                type: 'text',
                text: { body: texto }
            })
        })

        return respuesta.ok
    } catch (err: any) {
        console.error(`🔴 [META FETCH ERROR]:`, err.message)
        return false
    }
}

// ⚡ FUNCIÓN 2: ENVÍO DE PLANTILLA DE UTILIDAD (SALTA LA REGLA DE 24 HORAS)
async function enviarPlantillaMeta(
    to: string,
    nombreCliente: string,
    equipo: string,
    folio: string,
    estatusFormateado: string
) {
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) return false

    const cleanPhone = to.replace(/[^0-9]/g, '').slice(-10)
    const toMeta = `52${cleanPhone}`

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
                to: toMeta,
                type: 'template',
                template: {
                    name: 'actualizacion_estatus_taller',
                    language: { code: 'es_MX' },
                    components: [
                        {
                            type: 'body',
                            parameters: [
                                { type: 'text', text: nombreCliente },
                                { type: 'text', text: equipo },
                                { type: 'text', text: folio },
                                { type: 'text', text: estatusFormateado }
                            ]
                        }
                    ]
                }
            })
        })

        if (!respuesta.ok) {
            console.log('⚠️ Plantilla no disponible o rechazada por Meta, reintentando por texto libre...')
            return false
        }
        return true
    } catch (err: any) {
        console.error(`🔴 [META TEMPLATE ERROR]:`, err.message)
        return false
    }
}

// 💾 1. CREAR O UNIFICAR TICKET DESDE PORTAL DE INGRESO (POST)
export async function POST(request: Request) {
    try {
        const formData = await request.formData()

        const telefono = formData.get('telefono') as string
        const nombre = formData.get('nombre') as string
        const equipo = formData.get('equipo') as string
        const fallaReportada = formData.get('fallaReportada') as string
        const costoEstimado = formData.get('costoEstimado') as string
        const notasInternas = formData.get('notasInternas') as string
        const files = formData.getAll('files') as File[]

        if (!telefono || !equipo || !fallaReportada) {
            return NextResponse.json({ error: 'Teléfono, equipo y falla son obligatorios' }, { status: 400 })
        }

        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://soporte.soltecot.com'
        const cleanPhone = telefono.replace(/[^0-9]/g, '').slice(-10)

        let cliente = await prisma.cliente.findFirst({
            where: {
                OR: [
                    { telefono: telefono.trim() },
                    { telefono: cleanPhone }
                ]
            }
        })

        if (!cliente) {
            cliente = await prisma.cliente.create({
                data: {
                    telefono: cleanPhone,
                    nombre: nombre?.trim() || 'Cliente Recepción',
                    atendidoPorBot: true
                }
            })
        } else {
            await prisma.cliente.update({
                where: { id: cliente.id },
                data: {
                    nombre: nombre && nombre.trim() !== '' && nombre !== 'Cliente Recepción' && nombre !== 'Cliente WhatsApp' ? nombre.trim() : cliente.nombre,
                    atendidoPorBot: true
                }
            })
        }

        let ticketExistente = await prisma.ticket.findFirst({
            where: {
                clienteId: cliente.id,
                OR: [
                    { estado: 'ESPERANDO_APROBACION' },
                    { numeroOrden: { startsWith: 'LEAD-' } }
                ]
            },
            orderBy: { createdAt: 'desc' }
        })

        let folioAsignado = ''
        let esUnificacion = false

        const obtenerSiguienteFolioOficial = async () => {
            const ultimoTicketOficial = await prisma.ticket.findFirst({
                where: { numeroOrden: { startsWith: 'SOL-' } },
                orderBy: { createdAt: 'desc' },
                select: { numeroOrden: true }
            })
            if (ultimoTicketOficial?.numeroOrden) {
                const numero = parseInt(ultimoTicketOficial.numeroOrden.split('-')[1])
                if (!isNaN(numero)) return `SOL-${numero + 1}`
            }
            return 'SOL-1001'
        }

        if (ticketExistente) {
            esUnificacion = true
            folioAsignado = ticketExistente.numeroOrden.startsWith('LEAD-')
                ? await obtenerSiguienteFolioOficial()
                : ticketExistente.numeroOrden
        } else {
            folioAsignado = await obtenerSiguienteFolioOficial()
        }

        let fileIds: string[] = []
        if (files && files.length > 0) {
            const targetFolderId = await obtenerOCrearCarpetaFolio(folioAsignado)
            const subidasPromises = files.map(async (file, index) => {
                const arrayBuffer = await file.arrayBuffer()
                const buffer = Buffer.from(arrayBuffer)
                const extension = file.name.split('.').pop() || 'jpg'
                const nombreArchivo = `${folioAsignado}_evidencia_${index + 1}_${Date.now()}.${extension}`
                return await subirFotoEvidencia(buffer, nombreArchivo, file.type, targetFolderId)
            })
            const uploadedFileIds = await Promise.all(subidasPromises)
            fileIds = uploadedFileIds.filter((id): id is string => Boolean(id))
        }

        let ticketFinal
        const costoNumerico = costoEstimado ? parseFloat(costoEstimado) : null

        if (ticketExistente) {
            ticketFinal = await prisma.ticket.update({
                where: { id: ticketExistente.id },
                data: {
                    numeroOrden: folioAsignado,
                    equipo: equipo.trim(),
                    fallaReportada: fallaReportada.trim(),
                    costoEstimado: costoNumerico || ticketExistente.costoEstimado,
                    costoReparacion: costoNumerico || ticketExistente.costoReparacion,
                    notasInternas: notasInternas ? `[Ingreso Taller]: ${notasInternas.trim()}` : ticketExistente.notasInternas,
                    estado: 'RECIBIDO',
                    botActivo: true,
                    fotosIngreso: fileIds.length > 0 ? fileIds : ticketExistente.fotosIngreso
                }
            })
        } else {
            ticketFinal = await prisma.ticket.create({
                data: {
                    numeroOrden: folioAsignado,
                    equipo: equipo.trim(),
                    fallaReportada: fallaReportada.trim(),
                    costoEstimado: costoNumerico,
                    costoReparacion: costoNumerico,
                    notasInternas: notasInternas ? notasInternas.trim() : null,
                    clienteId: cliente.id,
                    estado: 'RECIBIDO',
                    botActivo: true,
                    fotosIngreso: fileIds
                }
            })
        }

        // Intenta enviar mediante Plantilla garantizada; si falla por no estar aprobada aún, manda texto libre
        const nombreEstetico = cliente.nombre || 'amigo'
        const exitoPlantilla = await enviarPlantillaMeta(
            cliente.telefono,
            nombreEstetico,
            ticketFinal.equipo,
            ticketFinal.numeroOrden,
            '⚙️ RECIBIDO EN LABORATORIO'
        )

        if (!exitoPlantilla) {
            const textoMensaje = `🔬 *SOLTECOT_ WORKSHOP INFORMA* 🔬\n\nHemos registrado el ingreso de tu equipo a nuestro laboratorio.\n\n🎫 *Folio:* ${ticketFinal.numeroOrden}\n💻 *Dispositivo:* ${ticketFinal.equipo}\n🛠️ *Falla:* ${ticketFinal.fallaReportada}\n📍 *Estatus:* ⚙️ RECIBIDO\n\n🌐 *Rastreo en Vivo:*\n👉 ${APP_URL}?folio=${ticketFinal.numeroOrden}`
            await enviarMensajeMeta(cliente.telefono, textoMensaje)
        }

        return NextResponse.json({
            success: true,
            message: esUnificacion ? 'Pre-orden unificada con éxito.' : 'Nueva orden registrada.',
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

        const datosAActualizar: any = {}
        if (nuevoEstado !== undefined) datosAActualizar.estado = nuevoEstado
        if (botActivo !== undefined) datosAActualizar.botActivo = botActivo
        if (costoReparacion !== undefined) datosAActualizar.costoReparacion = parseFloat(costoReparacion)
        if (notasDiagnostico !== undefined) datosAActualizar.notasDiagnostico = notasDiagnostico

        const ticketActualizado = await prisma.ticket.update({
            where: { id: ticketId },
            data: datosAActualizar,
            include: { cliente: true }
        })

        if (botActivo !== undefined) {
            await prisma.cliente.update({
                where: { id: ticketActualizado.clienteId },
                data: { atendidoPorBot: botActivo }
            })
        }

        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://soporte.soltecot.com'

        if (nuevoEstado) {
            const estadoNormalizado = nuevoEstado.replace(/[\s_]+/g, '_').toUpperCase()

            if (estadoNormalizado === 'ENTREGADO' || estadoNormalizado === 'RECHAZADO') {
                await prisma.cliente.update({
                    where: { id: ticketActualizado.clienteId },
                    data: { atendidoPorBot: true, googleChatThreadId: null }
                })
                await prisma.mensaje.deleteMany({
                    where: { clienteId: ticketActualizado.clienteId }
                })
            }

            const nombreClienteEstetico = ticketActualizado.cliente.nombre && ticketActualizado.cliente.nombre !== 'Cliente Recepción' && ticketActualizado.cliente.nombre !== 'Cliente WhatsApp' ? ticketActualizado.cliente.nombre : 'amigo'
            const estadoFormateado = estadoNormalizado.replace(/_/g, ' ')

            // Intentamos enviar primero como Plantilla (salta límite de 24h)
            const envioPlantillaExitoso = await enviarPlantillaMeta(
                ticketActualizado.cliente.telefono,
                nombreClienteEstetico,
                ticketActualizado.equipo,
                ticketActualizado.numeroOrden,
                estadoFormateado
            )

            // Si la plantilla no fue enviada o aún no está activa en Meta, recurre al mensaje de texto alternativo
            if (!envioPlantillaExitoso) {
                let textoMensaje = ""

                if (estadoNormalizado === "ESPERANDO_APROBACION") {
                    textoMensaje = `💰 *SOLTECOT_ PRESUPUESTO DE REPARACIÓN* 💰\n\nHola, *${nombreClienteEstetico}*. Diagnóstico concluido para *${ticketActualizado.equipo}* (Folio: *${ticketActualizado.numeroOrden}*).\n\n🔬 *Diagnóstico:* ${notasDiagnostico || 'Revisión y corrección de circuito principal.'}\n💵 *Costo Total:* *$${costoReparacion || ticketActualizado.costoReparacion} MXN*\n\nResponde *Aceptar* para autorizar o *Rechazar* para cancelar.\n👉 ${APP_URL}?folio=${ticketActualizado.numeroOrden}`
                } else if (estadoNormalizado === "LISTO_PARA_ENTREGA") {
                    textoMensaje = `🔬 *EQUIPO LISTO PARA ENTREGA* ⚡\n\nHola, *${nombreClienteEstetico}*. Tu equipo *${ticketActualizado.equipo}* (Folio: *${ticketActualizado.numeroOrden}*) ya está listo para recolección en nuestro taller.\n👉 ${APP_URL}?folio=${ticketActualizado.numeroOrden}`
                } else if (estadoNormalizado === "ENTREGADO") {
                    textoMensaje = `📦 *¡GRACIAS POR CONFIAR EN SOLTECOT_!* 🤝✨\n\nHola, *${nombreClienteEstetico}*. Tu equipo *${ticketActualizado.equipo}* ha sido entregado exitosamente.\n👉 ${APP_URL}?folio=${ticketActualizado.numeroOrden}`
                } else {
                    textoMensaje = `🔬 *SOLTECOT_ ACTUALIZACIÓN* 🔬\n\nEstatus de tu orden *${ticketActualizado.numeroOrden}* (${ticketActualizado.equipo}):\n👉 *${estadoFormateado}*\n👉 ${APP_URL}?folio=${ticketActualizado.numeroOrden}`
                }

                await enviarMensajeMeta(ticketActualizado.cliente.telefono, textoMensaje)
            }
        }

        return NextResponse.json({ success: true, ticket: ticketActualizado }, { status: 200 })
    } catch (error: any) {
        console.error("🔴 [PATCH TICKETS ERROR]:", error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 🗑️ 4. BANDEJA DE LEADS GARBAGE COLLECTOR (DELETE)
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const clienteId = searchParams.get('clienteId')

        if (!clienteId) {
            return NextResponse.json({ error: 'El parámetro clienteId es obligatorio' }, { status: 400 })
        }

        await prisma.$transaction([
            prisma.mensaje.deleteMany({ where: { clienteId: clienteId } }),
            prisma.ticket.deleteMany({ where: { clienteId: clienteId } }),
            prisma.cliente.delete({ where: { id: clienteId } })
        ])

        return NextResponse.json({ success: true, message: 'Prospecto purgado de Neon DB.' }, { status: 200 })

    } catch (error: any) {
        console.error("🔴 [DELETE TICKETS ERROR]:", error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}