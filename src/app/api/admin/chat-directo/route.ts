import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export const dynamic = 'force-dynamic'

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const telefono = formData.get('telefono') as string
        const mensaje = (formData.get('mensaje') as string) || ''
        const archivo = formData.get('archivo') as File | null

        if (!telefono) {
            return NextResponse.json({ error: 'El teléfono es obligatorio' }, { status: 400 })
        }

        const cleanPhone = telefono.replace(/[^0-9]/g, '')
        const phone10 = cleanPhone.slice(-10)

        let mediaId: string | null = null

        // 1️⃣ Si adjuntaste una imagen/archivo, la subimos a Meta Media API
        if (archivo && archivo.size > 0) {
            const metaFormData = new FormData()
            metaFormData.append('file', archivo)
            metaFormData.append('type', archivo.type)
            metaFormData.append('messaging_product', 'whatsapp')

            const resMedia = await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/media`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` },
                body: metaFormData
            })

            if (resMedia.ok) {
                const dataMedia = await resMedia.json()
                mediaId = dataMedia.id
            } else {
                console.error("🔴 Error subiendo media a Meta:", await resMedia.text())
            }
        }

        // 2️⃣ Preparamos el payload según sea Texto o Imagen/Documento
        let payloadMeta: any = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone10
        }

        if (mediaId) {
            const esImagen = archivo?.type.startsWith('image/')
            const tipoMedia = esImagen ? 'image' : 'document'
            payloadMeta.type = tipoMedia
            payloadMeta[tipoMedia] = {
                id: mediaId,
                caption: mensaje || undefined,
                filename: !esImagen ? archivo?.name : undefined
            }
        } else {
            payloadMeta.type = 'text'
            payloadMeta.text = { body: mensaje }
        }

        // 3️⃣ Despachamos a Meta
        const resMeta = await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payloadMeta)
        })

        if (!resMeta.ok) {
            const errorRaw = await resMeta.text()
            throw new Error(`Meta rechazó el mensaje: ${errorRaw}`)
        }

        // 4️⃣ Registramos en la BD y silenciamos a la IA (Modo Manual)
        let cliente = await prisma.cliente.findFirst({
            where: {
                OR: [{ telefono: phone10 }, { telefono: cleanPhone }]
            }
        })

        if (!cliente) {
            cliente = await prisma.cliente.create({
                data: {
                    telefono: phone10,
                    nombre: 'Cliente WhatsApp',
                    atendidoPorBot: false
                }
            })
        } else {
            await prisma.cliente.update({
                where: { id: cliente.id },
                data: { atendidoPorBot: false }
            })
        }

        const textoAArchivar = mediaId
            ? `📷 [Evidencia/Archivo]: ${archivo?.name || 'Imagen'}${mensaje ? ` - ${mensaje}` : ''}`
            : mensaje

        await prisma.mensaje.create({
            data: {
                texto: textoAArchivar,
                origen: 'BOT',
                clienteId: cliente.id
            }
        })

        return NextResponse.json({ success: true })

    } catch (error: any) {
        console.error("🔴 Error en Chat Directo:", error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// 🤖 Cambiar estado del bot (Activar/Desactivar IA)
export async function PATCH(request: Request) {
    try {
        const body = await request.json()
        const { telefono, botActivo } = body

        if (!telefono) return NextResponse.json({ error: 'Teléfono requerido' }, { status: 400 })

        const phone10 = telefono.replace(/[^0-9]/g, '').slice(-10)

        const cliente = await prisma.cliente.findFirst({
            where: { OR: [{ telefono: phone10 }, { telefono: telefono.trim() }] }
        })

        if (cliente) {
            await prisma.cliente.update({
                where: { id: cliente.id },
                data: { atendidoPorBot: botActivo ?? true }
            })
            return NextResponse.json({ success: true, atendidoPorBot: botActivo })
        }

        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}