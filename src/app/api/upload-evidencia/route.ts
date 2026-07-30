import { NextResponse } from 'next/server';
import { subirFotoEvidencia } from '../../../lib/googleDrive';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const files = formData.getAll('files') as File[];
        const folio = formData.get('folio') as string || 'DESCONOCIDO';

        if (!files || files.length === 0) {
            return NextResponse.json(
                { error: 'No se enviaron archivos para subir' },
                { status: 400 }
            );
        }

        console.log(`📸 [API UPLOAD]: Procesando ${files.length} fotos para Folio: ${folio}`);

        const subidasPromises = files.map(async (file, index) => {
            // Convertimos el archivo a Buffer
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Creamos un nombre limpio Ej: SOL-1005_foto_1_1722345.jpg
            const extension = file.name.split('.').pop() || 'jpg';
            const nombreArchivo = `${folio}_evidencia_${index + 1}_${Date.now()}.${extension}`;

            // Subimos a tu Drive
            const fileId = await subirFotoEvidencia(buffer, nombreArchivo, file.type);
            return fileId;
        });

        // Esperamos a que todas las fotos se suban a Drive
        const driveFileIds = await Promise.all(subidasPromises);

        console.log(`✅ [API UPLOAD]: ${driveFileIds.length} fotos subidas exitosamente a Google Drive.`);

        return NextResponse.json({
            success: true,
            fileIds: driveFileIds,
            message: `${driveFileIds.length} imágenes guardadas en Google Drive`
        });

    } catch (error: any) {
        console.error('🔴 Error en /api/upload-evidencia:', error);
        return NextResponse.json(
            { error: 'Error interno al subir imágenes a Drive', details: error.message },
            { status: 500 }
        );
    }
}