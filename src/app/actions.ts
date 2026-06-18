// src/app/actions.ts
'use server'

import { getPrisma } from '../lib/db' // <-- Importamos la función en lugar del objeto directo

export async function buscarTicketPorCodigo(numeroOrden: string) {
    const codigoLimpio = numeroOrden.trim().toUpperCase()

    if (!codigoLimpio) {
        return { error: 'Por favor, ingresa un número de orden válido.' }
    }

    try {
        // Inicializamos Prisma aquí adentro, garantizando que process.env ya está listo
        const prisma = getPrisma()

        const ticket = await prisma.ticket.findUnique({
            where: {
                numeroOrden: codigoLimpio,
            },
            include: {
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

    } catch (error) {
        console.error('Error al consultar Neon:', error)
        return { error: 'Hubo un problema de conexión con el laboratorio. Inténtalo más tarde.' }
    }
}