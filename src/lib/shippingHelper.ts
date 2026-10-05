import { prisma } from './prisma'

export async function verificarPromocionEnviosActiva(): Promise<boolean> {
    try {
        // Contamos cuántas órdenes tienen registrada la etiqueta de guía generada o solicitada
        const totalGuias = await prisma.ticket.count({
            where: {
                OR: [
                    { notasInternas: { contains: '[GUIA_GENERADA]' } },
                    { notasInternas: { contains: '[GUIA PENDIENTE]' } }
                ]
            }
        })

        // Retorna true si llevamos menos de 25 guías
        return totalGuias < 25
    } catch (error) {
        console.error('🔴 Error al verificar la promoción de envíos:', error)
        return false
    }
}