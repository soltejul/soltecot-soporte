import { NextResponse } from 'next/server'
import { google } from 'googleapis'

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
            costoGuia = '51.25'
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