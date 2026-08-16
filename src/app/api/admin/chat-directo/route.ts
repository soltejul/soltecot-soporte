import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
// Asegúrate de que la ruta a tu archivo whatsapp.ts sea la correcta
import { enviarMensajeWhatsApp } from '@/lib/whatsapp'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { telefono, mensaje } = body

        if (!telefono || !mensaje) {
            return NextResponse.json({ error: 'Falta teléfono o mensaje' }, { status: 400 })
        }

        const cleanPhone = telefono.replace(/[^0-9]/g, '')
        const phone10 = cleanPhone.slice(-10)

        // Destinatario formateado para Baileys/Meta
        const destinatario = phone10.includes('@') ? phone10 : `${phone10}@s.whatsapp.net`

        // 1. Enviar el mensaje por Meta
        const exito = await enviarMensajeWhatsApp(destinatario, mensaje)

        if (exito) {
            // 2. Silenciar el bot para este cliente (asumiendo que estás retomando el control)
            let cliente = await prisma.cliente.findFirst({
                where: { telefono: phone10 }
            })

            if (cliente) {
                await prisma.cliente.update({
                    where: { id: cliente.id },
                    data: { atendidoPorBot: false }
                })

                // Guardar el mensaje en el historial efímero
                await prisma.mensaje.create({
                    data: {
                        texto: mensaje,
                        origen: 'BOT', // Queda como BOT/Agente en el historial
                        clienteId: cliente.id
                    }
                })
            }

            return NextResponse.json({ success: true })
        } else {
            throw new Error("Meta rechazó el envío del mensaje")
        }

    } catch (error: any) {
        console.error("🔴 Error en Chat Directo:", error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}