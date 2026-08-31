import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export const dynamic = 'force-dynamic'

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || ''
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID || ''

// ⚡ Función auxiliar para disparar la plantilla de reactivación (salta las 24h)
async function enviarPlantillaRecuperacion(toMeta: string, nombre: string, equipo: string, rangoCosto: string) {
    const urlMeta = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`
    const respuesta = await fetch(urlMeta, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: toMeta,
            type: 'template',
            template: {
                name: 'recuperacion_cotizacion',
                language: { code: 'es_MX' },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            { type: 'text', text: nombre || 'Cliente' },
                            { type: 'text', text: equipo || 'tu equipo' },
                            { type: 'text', text: rangoCosto || '$250 y $450 MXN' }
                        ]
                    }
                ]
            }
        })
    })

    return respuesta
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const telefono = formData.get('telefono') as string
        const mensaje = (formData.get('mensaje') as string) || ''
        const archivo = formData.get('archivo') as File | null
        const usarPlantillaDirecta = formData.get('usarPlantilla') === 'true'
        const equipoInput = (formData.get('equipo') as string) || 'su equipo'
        const rangoCostoInput = (formData.get('rangoCosto') as string) || '$250 y $450 MXN'

        if (!telefono) {
            return NextResponse.json({ error: 'El teléfono es obligatorio' }, { status: 400 })
        }

        const cleanPhone = telefono.replace(/[^0-9]/g, '')
        const phone10 = cleanPhone.slice(-10)
        const toMeta = `52${phone10}`

        // 1️⃣ Buscar o crear al cliente en DB
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

        const nombreCliente = cliente.nombre && cliente.nombre !== 'Cliente WhatsApp' ? cliente.nombre : 'Cliente'

        // 2️⃣ Si forzaste el uso de plantilla desde el panel
        if (usarPlantillaDirecta) {
            const resPlantilla = await enviarPlantillaRecuperacion(toMeta, nombreCliente, equipoInput, rangoCostoInput)
            if (!resPlantilla.ok) {
                const errText = await resPlantilla.text()
                throw new Error(`Meta rechazó la plantilla: ${errText}`)
            }

            const textoRegistrado = `⚡ [Plantilla Enviada]: Reactivación de cotización (${rangoCostoInput}) para ${equipoInput}`
            await prisma.mensaje.create({
                data: { texto: textoRegistrado, origen: 'BOT', clienteId: cliente.id }
            })

            return NextResponse.json({ success: true, tipo: 'plantilla' })
        }

        // 3️⃣ Proceso habitual: Subida de archivo a Meta Media API (Imagen, Video o Documento)
        let mediaId: string | null = null
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

        // 4️⃣ Construir payload dinámico (Imagen, Video, Documento o Texto)
        let payloadMeta: any = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: toMeta
        }

        if (mediaId) {
            const esImagen = archivo?.type.startsWith('image/')
            const esVideo = archivo?.type.startsWith('video/')

            let tipoMedia = 'document'
            if (esImagen) tipoMedia = 'image'
            else if (esVideo) tipoMedia = 'video'

            payloadMeta.type = tipoMedia
            payloadMeta[tipoMedia] = {
                id: mediaId,
                caption: mensaje || undefined,
                filename: tipoMedia === 'document' ? archivo?.name : undefined
            }
        } else {
            payloadMeta.type = 'text'
            payloadMeta.text = { body: mensaje }
        }

        // 5️⃣ Despachar mensaje a Meta
        let resMeta = await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payloadMeta)
        })

        // 6️⃣ REINTENTO AUTOMÁTICO por ventana de 24h cerrada
        if (!resMeta.ok) {
            const errorRaw = await resMeta.text()
            console.warn(`⚠️ [CHAT DIRECTO BLOQUEADO POR 24H]: ${errorRaw}. Reintentando con Plantilla...`)

            if (!mediaId) {
                const resFallback = await enviarPlantillaRecuperacion(toMeta, nombreCliente, equipoInput, rangoCostoInput)
                if (resFallback.ok) {
                    const textoRegistrado = `⚡ [Reactivación Auto]: Plantilla enviada tras caducar ventana de 24h`
                    await prisma.mensaje.create({
                        data: { texto: textoRegistrado, origen: 'BOT', clienteId: cliente.id }
                    })
                    return NextResponse.json({ success: true, tipo: 'plantilla_fallback' })
                }
            }

            throw new Error(`Meta rechazó el mensaje: ${errorRaw}`)
        }

        // 7️⃣ Registro en la base de datos con prefijo según el tipo de archivo
        const esImagen = archivo?.type.startsWith('image/')
        const esVideo = archivo?.type.startsWith('video/')
        const prefijo = esImagen ? '📷 [Imagen]' : esVideo ? '🎥 [Video]' : '📄 [Documento]'

        const textoAArchivar = mediaId
            ? `${prefijo}: ${archivo?.name || 'Archivo'}${mensaje ? ` - ${mensaje}` : ''}`
            : mensaje

        await prisma.mensaje.create({
            data: {
                texto: textoAArchivar,
                origen: 'BOT',
                clienteId: cliente.id
            }
        })

        return NextResponse.json({ success: true, tipo: mediaId ? payloadMeta.type : 'texto' })

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