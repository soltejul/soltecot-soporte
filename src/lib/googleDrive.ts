import { google } from 'googleapis';
import { Readable } from 'stream';

// Autenticación usando la Service Account (sin intervención humana)
const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'), // Arregla los saltos de línea del .env
    },
    scopes: ['https://www.googleapis.com/auth/drive.file'], // Permite crear y manejar archivos creados por el bot
});

const drive = google.drive({ version: 'v3', auth });

/**
 * Función para subir una foto comprimida a Google Drive.
 * @param buffer Buffer de la imagen recibida (desde Next.js)
 * @param nombreArchivo Ej: "SOL-1005_Frente.jpg"
 * @param mimeType Ej: "image/jpeg"
 * @returns El ID del archivo subido en Google Drive
 */
export async function subirFotoEvidencia(buffer: Buffer, nombreArchivo: string, mimeType: string) {
    try {
        const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

        // Convertimos el Buffer de memoria a un ReadableStream (Requisito de la API de Drive)
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null);

        const response = await drive.files.create({
            requestBody: {
                name: nombreArchivo,
                parents: parentFolderId ? [parentFolderId] : [], // Lo guardamos en tu carpeta maestra
            },
            media: {
                mimeType: mimeType,
                body: stream,
            },
            fields: 'id', // Solo queremos que nos devuelva el ID del archivo
        });

        console.log(`✅ [Google Drive]: Foto ${nombreArchivo} subida con éxito (ID: ${response.data.id})`);
        return response.data.id;

    } catch (error: any) {
        console.error('🔴 Error al subir foto a Google Drive:', error.message);
        throw new Error('Fallo al subir evidencia a Google Drive');
    }
}