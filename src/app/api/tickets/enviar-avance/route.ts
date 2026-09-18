import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { subirFotoEvidencia, obtenerOCrearCarpetaFolio } from '../../../../lib/googleDrive';

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const ticketId = formData.get('ticketId') as string;
        const notaAvance = (formData.get('notaAvance') as string) || 'Actualización sobre tu equipo:';

        if (!file || !ticketId) {
            return NextResponse.json({ error: 'Falta la imagen o el ID del ticket' }, { status: 400 });
        }

        // 1. Buscar ticket y cliente
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: { cliente: true }
        });

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 });
        }

        const folio = ticket.numeroOrden;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 2. Guardar evidencia en la carpeta oficial del Folio en Google Drive
        const folderId = await obtenerOCrearCarpetaFolio(folio);
        const extension = file.name.split('.').pop() || 'jpg';
        const nombreArchivo = `${folio}_AVANCE_${Date.now()}.${extension}`;
        await subirFotoEvidencia(buffer, nombreArchivo, file.type, folderId);

        // 3. Credenciales de Meta Cloud API
        const META_TOKEN = (
            process.env.WHATSAPP_TOKEN ||
            process.env.NEXT_PUBLIC_WHATSAPP_TOKEN ||
            process.env.META_TOKEN
        )?.trim();

        const PHONE_NUMBER_ID = (
            process.env.WHATSAPP_PHONE_NUMBER_ID ||
            process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID ||
            process.env.META_PHONE_NUMBER_ID
        )?.trim();

        if (!META_TOKEN || !PHONE_NUMBER_ID) {
            throw new Error('Variables de entorno de WhatsApp Meta no configuradas.');
        }

        // 4. Sanitizar teléfono para Meta (52 + 10 dígitos)
        const cleanPhone = ticket.cliente.telefono.replace(/[^0-9]/g, '').slice(-10);
        const toMeta = `52${cleanPhone}`;

        // A) Subir Media a Meta API
        const metaFormData = new FormData();
        const blob = new Blob([buffer], { type: file.type });
        metaFormData.append('file', blob, nombreArchivo);
        metaFormData.append('type', file.type);
        metaFormData.append('messaging_product', 'whatsapp');

        const resMetaMedia = await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/media`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${META_TOKEN}` },
            body: metaFormData
        });

        const dataMetaMedia = await resMetaMedia.json();
        if (!resMetaMedia.ok) {
            throw new Error(`Error en subida de media a Meta: ${dataMetaMedia.error?.message}`);
        }

        const mediaId = dataMetaMedia.id;

        // B) Determinar tipo de media (Imagen o Video)
        const esVideo = file.type.startsWith('video/');
        const tipoMedia = esVideo ? 'video' : 'image';

        const textoMensaje = `🛠️ *SOLTECOT WORKSHOP - AVANCE DE SERVICIO*\n\n🎫 *Folio:* ${folio}\n💻 *Equipo:* ${ticket.equipo}\n\n💬 *Mensaje del Ingeniero:* ${notaAvance}`;

        const payloadMsg: any = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: toMeta,
            type: tipoMedia
        };

        payloadMsg[tipoMedia] = {
            id: mediaId,
            caption: textoMensaje
        };

        // C) Despachar mensaje por WhatsApp
        const resMetaMsg = await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${META_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payloadMsg)
        });

        if (!resMetaMsg.ok) {
            const errData = await resMetaMsg.json();
            throw new Error(`Error enviando WhatsApp: ${errData.error?.message}`);
        }

        // 5. Registrar mensaje en Neon DB para la interfaz de WhatsApp Web
        const textoRegistrado = `📷 [Avance de Taller]: ${notaAvance}`;
        await prisma.mensaje.create({
            data: {
                texto: textoRegistrado,
                origen: 'BOT',
                clienteId: ticket.clienteId
            }
        });

        // 6. Silenciar la IA para mantener control humano del chat
        await prisma.cliente.update({
            where: { id: ticket.clienteId },
            data: { atendidoPorBot: false }
        });

        return NextResponse.json({
            success: true,
            message: 'Evidencia respaldada en Drive, guardada en CRM y enviada por WhatsApp'
        });

    } catch (error: any) {
        console.error('🔴 Error al enviar avance:', error.message || error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}