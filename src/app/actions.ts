'use server'

import { prisma } from '../lib/prisma'

export async function buscarTicketPorCodigo(numeroOrden: string) {
    const codigoLimpio = numeroOrden?.trim().toUpperCase()

    if (!codigoLimpio) {
        return { error: 'Por favor, ingresa un número de orden válido.' }
    }

    try {
        const ticket = await prisma.ticket.findUnique({
            where: {
                numeroOrden: codigoLimpio,
            },
            select: {
                numeroOrden: true,
                equipo: true,
                fallaReportada: true,
                estado: true,
                costoEstimado: true,
                costoReparacion: true,
                updatedAt: true,
                cliente: {
                    select: {
                        nombre: true,
                    },
                },
            },
        })

        if (!ticket) {
            return { error: `No encontramos ningún equipo registrado con la orden ${codigoLimpio}.` }
        }

        return { success: true, data: ticket }

    } catch (error: any) {
        console.error('🔴 Error al consultar ticket en Server Action:', error?.message || error)
        return { error: 'Hubo un problema de conexión con el laboratorio. Inténtalo más tarde.' }
    }
}