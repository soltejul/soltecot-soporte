import { google } from 'googleapis'
import { Readable } from 'stream'

const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL
const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')
const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID

const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: clientEmail,
        private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/drive.file'],
})

const drive = google.drive({ version: 'v3', auth })

/**
 * Busca si existe la carpeta del Folio (ej: "SOL-1001"). Si no existe, la crea dentro de la carpeta raíz de Evidencias.
 */
export async function obtenerOCrearCarpetaFolio(folio: string): Promise<string> {
    try {
        if (!parentFolderId) {
            throw new Error('La variable de entorno GOOGLE_DRIVE_FOLDER_ID no está configurada en el servidor.')
        }

        // 🛡️ Escapamos apóstrofes para evitar errores de sintaxis en la consulta de Google Drive API
        const folioSanitizado = folio.trim().replace(/'/g, "\\'")
        const query = `name = '${folioSanitizado}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`

        // 1️⃣ Buscamos si ya existe la carpeta en Drive
        const res = await drive.files.list({
            q: query,
            fields: 'files(id, name)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        })

        if (res.data.files && res.data.files.length > 0) {
            console.log(`📁 [Google Drive]: Carpeta existente encontrada para ${folio}`)
            return res.data.files[0].id!
        }

        // 2️⃣ Si no existe, creamos la subcarpeta para el folio
        const nuevaCarpeta = await drive.files.create({
            requestBody: {
                name: folio.trim(),
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentFolderId],
            },
            fields: 'id',
            supportsAllDrives: true,
        })

        console.log(`✨ [Google Drive]: Carpeta creada para ${folio} (ID: ${nuevaCarpeta.data.id})`)
        return nuevaCarpeta.data.id!

    } catch (error: any) {
        console.error('🔴 Error al gestionar carpeta en Google Drive:', error.message || error)
        throw new Error(`Google Drive Error: ${error.message || 'No se pudo verificar o crear la carpeta del folio'}`)
    }
}

/**
 * Sube foto o video indicando el ID de la subcarpeta del folio.
 */
export async function subirFotoEvidencia(
    buffer: Buffer,
    nombreArchivo: string,
    mimeType: string,
    targetFolderId: string
) {
    try {
        // 🚀 Conversión directa de Buffer a Readable Stream en Node.js
        const stream = Readable.from(buffer)

        const response = await drive.files.create({
            requestBody: {
                name: nombreArchivo,
                parents: [targetFolderId],
            },
            media: {
                mimeType: mimeType,
                body: stream,
            },
            fields: 'id, webViewLink',
            supportsAllDrives: true,
        })

        console.log(`✅ [Google Drive]: Evidencia ${nombreArchivo} subida con éxito (ID: ${response.data.id})`)
        return {
            id: response.data.id,
            webViewLink: response.data.webViewLink,
        }

    } catch (error: any) {
        console.error('🔴 Error al subir evidencia a Google Drive:', error.message || error)
        throw new Error(`Fallo al subir evidencia a Google Drive: ${error.message || 'Error desconocido'}`)
    }
}