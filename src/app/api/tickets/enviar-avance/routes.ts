import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { subirFotoEvidencia, obtenerOCrearCarpetaFolio } from '../../../../lib/googleDrive';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const ticketId = formData.get('ticketId') as string;
        const notaAvance = formData.get('notaAvance') as string || 'Actualización sobre tu equipo:';

        if (!file || !ticketId) {
            return NextResponse.json({ error: 'Falta la imagen o el ID del ticket' }, { status: 400 });
        }

        // 1. Buscamos el ticket y cliente
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

        // 2. Guardamos la foto en Google Drive (en la carpeta del folio SOL-XXXX)
        const folderId = await obtenerOCrearCarpetaFolio(folio);
        const nombreArchivo = `${folio}_AVANCE_${Date.now()}.jpg`;
        await subirFotoEvidencia(buffer, nombreArchivo, file.type, folderId);

        // 3. Subimos la imagen temporalmente a Meta Cloud API para enviarla por WhatsApp
        const META_TOKEN = process.env.WHATSAPP_TOKEN;
        const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;

        // A) Subir Media a Meta
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
            throw new Error(`Meta Media Upload Error: ${dataMetaMedia.error?.message}`);
        }

        const mediaId = dataMetaMedia.id;

        // B) Enviar mensaje de imagen al cliente
        const textoMensaje = `🛠️ *SOLTECOT WORKSHOP - AVANCE DE SERVICIO*\n\n🎫 *Folio:* ${folio}\n💻 *Equipo:* ${ticket.equipo}\n\n💬 *Mensaje del Ingeniero:* ${notaAvance}`;

        const resMetaMsg = await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${META_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: ticket.cliente.telefono,
                type: 'image',
                image: {
                    id: mediaId,
                    caption: textoMensaje
                }
            })
        });

        if (!resMetaMsg.ok) {
            const errData = await resMetaMsg.json();
            throw new Error(`Error enviando WhatsApp: ${errData.error?.message}`);
        }

        return NextResponse.json({
            success: true,
            message: 'Foto de avance guardada en Drive y enviada al cliente por WhatsApp'
        });

    } catch (error: any) {
        console.error('🔴 Error al enviar avance:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}