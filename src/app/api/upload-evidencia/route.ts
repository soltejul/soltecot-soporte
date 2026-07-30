import { NextResponse } from 'next/server';
import { subirFotoEvidencia, obtenerOCrearCarpetaFolio } from '../../../lib/googleDrive';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const files = formData.getAll('files') as File[];
        const folio = formData.get('folio') as string || 'GENERAL';

        if (!files || files.length === 0) {
            return NextResponse.json(
                { error: 'No se enviaron archivos para subir' },
                { status: 400 }
            );
        }

        console.log(`📸 [API UPLOAD]: Procesando ${files.length} fotos para Folio: ${folio}`);

        // 1. Obtenemos o creamos la subcarpeta específica del Folio
        const folderId = await obtenerOCrearCarpetaFolio(folio);

        // 2. Subimos todas las fotos a esa subcarpeta
        const subidasPromises = files.map(async (file, index) => {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const extension = file.name.split('.').pop() || 'jpg';
            const nombreArchivo = `${folio}_evidencia_${index + 1}_${Date.now()}.${extension}`;

            // Pasamos el folderId específico
            const fileId = await subirFotoEvidencia(buffer, nombreArchivo, file.type, folderId);
            return fileId;
        });

        const driveFileIds = await Promise.all(subidasPromises);

        return NextResponse.json({
            success: true,
            fileIds: driveFileIds,
            message: `${driveFileIds.length} imágenes guardadas en carpeta ${folio}`
        });

    } catch (error: any) {
        console.error('🔴 Error en /api/upload-evidencia:', error);
        return NextResponse.json(
            { error: 'Error interno al subir imágenes a Drive', details: error.message },
            { status: 500 }
        );
    }
}