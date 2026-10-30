import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { prisma } from '../../../../lib/prisma'
import { enviarMensajeWhatsApp } from '../../../../lib/whatsapp'

export const dynamic = 'force-dynamic'

const CLIENT_ID = process.env.SKYDROPS_CLIENT_ID || ''
const CLIENT_SECRET = process.env.SKYDROPS_CLIENT_SECRET || ''

// Configuración de credenciales de Google Sheets
const GOOGLE_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || ''
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || ''
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')

async function registrarEnGoogleSheets(datosGuia: {
    folioTicket: string
    nombreClienteTel: string
    sentido: string
    cpOrigenDestino: string
    paqueteriaServicio: string
    trackingNumber: string
    costoGuia: string
    labelUrl: string
}) {
    try {
        if (!GOOGLE_SPREADSHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
            console.warn('⚠️ [GOOGLE SHEETS]: Faltan variables de entorno para registrar en Sheets.')
            return
        }

        const auth = new google.auth.JWT({
            email: GOOGLE_CLIENT_EMAIL,
            key: GOOGLE_PRIVATE_KEY,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        })

        const sheets = google.sheets({ version: 'v4', auth })

        // Fecha y hora formateadas para CDMX
        const fechaEmision = new Date().toLocaleString('es-MX', {
            timeZone: 'America/Mexico_City',
            dateStyle: 'short',
            timeStyle: 'medium'
        })

        // Fila correspondiente a las columnas A-J
        const values = [[
            fechaEmision,                            // A: Fecha / Hora de Emisión
            datosGuia.folioTicket || 'N/A',          // B: Folio / Ticket ID
            datosGuia.nombreClienteTel || 'N/A',     // C: Nombre Cliente / Teléfono
            datosGuia.sentido || '📥 Recepción',      // D: Sentido
            datosGuia.cpOrigenDestino || 'N/A',       // E: C.P. Origen -> C.P. Destino
            datosGuia.paqueteriaServicio || 'Paquetexpress', // F: Paquetería / Servicio
            datosGuia.trackingNumber || 'N/A',       // G: Número de Rastreo
            `$${datosGuia.costoGuia} MXN`,           // H: Costo de la Guía
            datosGuia.labelUrl || 'N/A',             // I: Enlace al PDF
            'Creada'                                 // J: Estatus Logístico
        ]]

        await sheets.spreadsheets.values.append({
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            range: 'Logistica!A:J',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values }
        })

        console.log('📊 [GOOGLE SHEETS]: Guía registrada con éxito en la pestaña Logística.')
    } catch (error: any) {
        console.error('🔴 [GOOGLE SHEETS ERROR]:', error.message)
    }
}

async function obtenerBearerToken() {
    const response = await fetch('https://api-pro.skydropx.com/api/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: CLIENT_ID.trim(),
            client_secret: CLIENT_SECRET.trim()
        })
    })

    if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Autenticación Skydrops fallida: ${errText}`)
    }

    const data = await response.json()
    return data.access_token
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            rateId,
            folioTicket = '',
            nombreClienteTel = '',
            sentido = '📥 Recepción',
            cpOrigenDestino = '',
            costoGuia = '51.25',
            // 📞 Parámetros requeridos para WhatsApp y Prisma
            telefono = '',
            nombreCliente = ''
        } = body

        if (!rateId) {
            return NextResponse.json({ error: 'Se requiere el rateId de la cotización' }, { status: 400 })
        }

        const bearerToken = await obtenerBearerToken()

        const resLabel = await fetch('https://api-pro.skydropx.com/api/v1/labels', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${bearerToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rate_id: rateId })
        })

        if (!resLabel.ok) {
            const errText = await resLabel.text()
            return NextResponse.json({ error: `Skydrops (${resLabel.status}): ${errText}` }, { status: 400 })
        }

        const labelData = await resLabel.json()
        const attr = labelData.data?.attributes || labelData.attributes || labelData

        const trackingNumber = attr.tracking_number || labelData.id || 'N/A'
        const labelUrl = attr.label_url || attr.pdf_url || attr.url || (Array.isArray(attr.label_urls) ? attr.label_urls[0] : null)
        const carrierName = attr.carrier_name || attr.provider_name || 'Paquetexpress'

        // 🚀 REGISTRO AUTOMÁTICO EN GOOGLE SHEETS
        await registrarEnGoogleSheets({
            folioTicket,
            nombreClienteTel,
            sentido,
            cpOrigenDestino,
            paqueteriaServicio: `${carrierName} - ${attr.service_level_name || 'Express'}`,
            trackingNumber,
            costoGuia,
            labelUrl
        })

        // 📲 ENVÍO AUTOMÁTICO DE WHATSAPP AL CLIENTE
        // Validamos que haya teléfono y que el sentido sea Recepción para enviar instrucciones de empaque
        if (telefono && sentido.includes('Recepción')) {
            const mensajeWhatsApp = `📦 *¡Tu guía de envío está lista!* 🎮\n\n` +
                `Hola, *${nombreCliente || nombreClienteTel.split(' ')[0] || 'Cliente'}*. Te compartimos los detalles de tu guía Paquetexpress (Orden *${folioTicket || 'SOL'}*):\n` +
                `• *No. de Guía:* \`${trackingNumber}\`\n` +
                (labelUrl ? `• *Descarga tu guía PDF aquí:* ${labelUrl}\n\n` : `\n`) +
                `🚚 *MODALIDADES DE ENTREGA:*\n` +
                `1️⃣ *Recolección en domicilio:* En horario comercial abierto (9:00 AM a 6:30 PM). Te sugerimos tener el paquete listo y estar al pendiente del celular.\n` +
                `2️⃣ *Entrega en sucursal Paquetexpress:* Si prefieres no esperar al recolector, puedes llevar tu paquete directamente a la oficina de Paquetexpress más cercana a tu domicilio con la guía impresa y pegada.\n\n` +
                `📋 *PASOS DE EMBALAJE:*\n` +
                `• Retira cualquier juego o disco de la bandeja.\n` +
                `• Envuelve la consola con plástico burbuja o material acolchonado.\n` +
                `• Colócala en una caja rígida donde no se mueva y sella en forma de "H" con cinta canela o gruesa.\n` +
                `• Pega la guía impresa en la parte superior sin tapar el código de barras.\n\n` +
                `¡Quedamos al pendiente del trayecto de tu equipo! 🔬🛠️`

            // Despachar el mensaje
            await enviarMensajeWhatsApp(telefono, mensajeWhatsApp)

            // Registrar el mensaje en Neon DB para que aparezca en el Chat del Dashboard
            const tel10 = telefono.replace(/\D/g, '').slice(-10)
            const clienteDb = await prisma.cliente.findFirst({
                where: { telefono: { endsWith: tel10 } }
            })

            if (clienteDb) {
                await prisma.mensaje.create({
                    data: {
                        texto: mensajeWhatsApp,
                        origen: 'BOT',
                        clienteId: clienteDb.id
                    }
                })

                // Actualizar notas internas del ticket para incrustar el tracking automáticamente
                await prisma.ticket.updateMany({
                    where: { clienteId: clienteDb.id, estado: { notIn: ['ENTREGADO', 'RECHAZADO'] } },
                    data: {
                        notasInternas: `[GUIA GENERADA] Tracking: ${trackingNumber} | URL: ${labelUrl}`
                    }
                })
            }
        }

        return NextResponse.json({
            success: true,
            trackingNumber,
            labelUrl,
            carrierName
        })

    } catch (error: any) {
        console.error('🔴 [CRITICAL LABEL ERROR]:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}