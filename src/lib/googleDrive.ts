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

export async function subirFotoEvidencia(buffer: Buffer, nombreArchivo: string, mimeType: string) {
    try {
        const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

        const stream = new Readable();
        stream.push(buffer);
        stream.push(null);

        const response = await drive.files.create({
            requestBody: {
                name: nombreArchivo,
                parents: parentFolderId ? [parentFolderId] : [],
            },
            media: {
                mimeType: mimeType,
                body: stream,
            },
            fields: 'id',
            supportsAllDrives: true, // 👈 ¡ESTE PARÁMETRO ES EL QUE LE INDICA A GOOGLE USAR EL ESPACIO DE LA UNIDAD COMPARTIDA!
        });

        console.log(`✅ [Google Drive]: Foto ${nombreArchivo} subida con éxito (ID: ${response.data.id})`);
        return response.data.id;

    } catch (error: any) {
        console.error('🔴 Error al subir foto a Google Drive:', error.message);
        throw new Error('Fallo al subir evidencia a Google Drive');
    }
}