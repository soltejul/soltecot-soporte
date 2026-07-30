import { google } from 'googleapis';
import { Readable } from 'stream';

const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({ version: 'v3', auth });

/**
 * Busca si existe la carpeta del Folio (ej: "SOL-1001"). Si no existe, la crea dentro de Evidencias_Soltecot.
 */
export async function obtenerOCrearCarpetaFolio(folio: string): Promise<string> {
    try {
        const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

        // 1. Buscamos si ya existe una carpeta con ese nombre
        const query = `name = '${folio}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const res = await drive.files.list({
            q: query,
            fields: 'files(id, name)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });

        if (res.data.files && res.data.files.length > 0) {
            console.log(`📁 [Google Drive]: Carpeta existente encontrada para ${folio}`);
            return res.data.files[0].id!;
        }

        // 2. Si no existe, creamos la subcarpeta
        const nuevaCarpeta = await drive.files.create({
            requestBody: {
                name: folio,
                mimeType: 'application/vnd.google-apps.folder',
                parents: parentFolderId ? [parentFolderId] : [],
            },
            fields: 'id',
            supportsAllDrives: true,
        });

        console.log(`✨ [Google Drive]: Carpeta creada para ${folio} (ID: ${nuevaCarpeta.data.id})`);
        return nuevaCarpeta.data.id!;

    } catch (error: any) {
        console.error('🔴 Error al gestionar carpeta en Google Drive:', error.message);
        throw new Error('No se pudo verificar o crear la carpeta del folio');
    }
}

/**
 * Subes la foto indicando el ID de la subcarpeta del folio.
 */
export async function subirFotoEvidencia(buffer: Buffer, nombreArchivo: string, mimeType: string, targetFolderId: string) {
    try {
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null);

        const response = await drive.files.create({
            requestBody: {
                name: nombreArchivo,
                parents: [targetFolderId], // Guardamos dentro de la carpeta SOL-XXXX
            },
            media: {
                mimeType: mimeType,
                body: stream,
            },
            fields: 'id',
            supportsAllDrives: true,
        });

        console.log(`✅ [Google Drive]: Foto ${nombreArchivo} subida con éxito (ID: ${response.data.id})`);
        return response.data.id;

    } catch (error: any) {
        console.error('🔴 Error al subir foto a Google Drive:', error.message);
        throw new Error('Fallo al subir evidencia a Google Drive');
    }
}