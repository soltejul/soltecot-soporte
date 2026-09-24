import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { subirFotoEvidencia, obtenerOCrearCarpetaFolio } from '../../../../lib/googleDrive'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File
        const ticketId = formData.get('ticketId') as string
        const notaAvance = (formData.get('notaAvance') as string) || 'Actualización sobre tu equipo:'

        if (!file || !ticketId) {
            return NextResponse.json({ error: 'Falta el archivo multimedia o el ID de la orden' }, { status: 400 })
        }

        // 1️⃣ Buscar la orden y los datos del cliente
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: { cliente: true }
        })

        if (!ticket || !ticket.cliente) {
            return NextResponse.json({ error: 'Orden de servicio no encontrada' }, { status: 404 })
        }

        const folio = ticket.numeroOrden
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // 2️⃣ Guardar evidencia en la carpeta oficial del Folio en Google Drive
        const folderId = await obtenerOCrearCarpetaFolio(folio)
        const extension = file.name.split('.').pop() || 'jpg'
        const nombreArchivo = `${folio}_AVANCE_${Date.now()}.${extension}`
        await subirFotoEvidencia(buffer, nombreArchivo, file.type, folderId)

        // 3️⃣ Normalización de credenciales de Meta Cloud API
        const META_TOKEN = (
            process.env.WHATSAPP_TOKEN ||
            process.env.NEXT_PUBLIC_WHATSAPP_TOKEN ||
            process.env.META_TOKEN
        )?.trim()

        const PHONE_NUMBER_ID = (
            process.env.PHONE_NUMBER_ID ||
            process.env.WHATSAPP_PHONE_NUMBER_ID ||
            process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID ||
            process.env.META_PHONE_NUMBER_ID
        )?.trim()

        if (!META_TOKEN || !PHONE_NUMBER_ID) {
            return NextResponse.json({ error: 'Variables de entorno de WhatsApp Meta no configuradas en el servidor' }, { status: 500 })
        }

        // 4️⃣ Sanitizar número telefónico (Prefijo México 52 + 10 dígitos)
        const cleanPhone = ticket.cliente.telefono.replace(/[^0-9]/g, '').slice(-10)
        const toMeta = `52${cleanPhone}`

        // A) Subir Media a la API de Meta
        const metaFormData = new FormData()
        const blob = new Blob([buffer], { type: file.type })
        metaFormData.append('file', blob, nombreArchivo)
        metaFormData.append('type', file.type)
        metaFormData.append('messaging_product', 'whatsapp')

        const resMetaMedia = await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/media`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${META_TOKEN}` },
            body: metaFormData
        })

        const dataMetaMedia = await resMetaMedia.json()
        if (!resMetaMedia.ok) {
            throw new Error(`Error en subida multimedia a Meta: ${dataMetaMedia.error?.message || 'Rechazado'}`)
        }

        const mediaId = dataMetaMedia.id

        // B) Determinar tipo de contenido (Imagen o Video)
        const esVideo = file.type.startsWith('video/')
        const tipoMedia = esVideo ? 'video' : 'image'

        const textoMensaje = `🛠️ *SOLTECOT WORKSHOP - AVANCE DE SERVICIO*\n\n🎫 *Folio:* ${folio}\n💻 *Equipo:* ${ticket.equipo}\n\n💬 *Mensaje del Ingeniero:* ${notaAvance}`

        const payloadMsg: any = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: toMeta,
            type: tipoMedia
        }

        payloadMsg[tipoMedia] = {
            id: mediaId,
            caption: textoMensaje
        }

        // C) Despachar mensaje multimedia por WhatsApp
        const resMetaMsg = await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${META_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payloadMsg)
        })

        if (!resMetaMsg.ok) {
            const errData = await resMetaMsg.json()
            throw new Error(`Error al despachar WhatsApp por Meta: ${errData.error?.message || 'Error desconocido'}`)
        }

        // 5️⃣ Registrar el mensaje en Neon DB marcándolo como HUMANO
        const textoRegistrado = `📷 [Evidencia Multimedia Sent]: ${notaAvance}`
        await prisma.mensaje.create({
            data: {
                texto: textoRegistrado,
                origen: 'HUMANO', // 👈 Ajustado a HUMANO para alineación con el CRM
                clienteId: ticket.clienteId
            }
        })

        // 6️⃣ Silenciar la IA para mantener el canal en atención directa
        await prisma.cliente.update({
            where: { id: ticket.clienteId },
            data: { atendidoPorBot: false }
        })

        return NextResponse.json({
            success: true,
            message: 'Evidencia respaldada en Drive, registrada en CRM y despachada por WhatsApp'
        })

    } catch (error: any) {
        console.error('🔴 Error al enviar avance multimedia:', error.message || error)
        return NextResponse.json({ error: error.message || 'Error en servidor' }, { status: 500 })
    }
}