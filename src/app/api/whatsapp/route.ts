import { GoogleGenAI } from '@google/genai'
import { google } from 'googleapis'
import { prisma } from '../../../lib/prisma'
import { enviarMensajeWhatsApp } from '../../../lib/whatsapp' // 🔌 Importamos tu conector maestro unificado
import path from 'path'

export const dynamic = 'force-dynamic'

// 📊 CONFIGURACIONES DE TU SUITE EMPRESARIAL
const SPREADSHEET_ID = '1TKfQ4bB1wLxOP6nUUXzFreILRmbmzD2OhLj5Wdt0Ph4'
const CALENDAR_ID = 'juliolopez@soltecot.com'

// 📍 UBICACIÓN DE ORIGEN DE SOLTECOT_
const COORDENADAS_LABORATORIO = '19.68430387588073,-99.15870193124036'
const DIRECCION_TEXTUAL = 'Hacienda Los Geranios, MZ 45 LT 14, Villas Xaltipa 2-C. Cuautitlán, Estado de México, C.P. 54850. (Nota: La recepción se realiza en la entrada principal).'
const LINK_GOOGLE_MAPS = 'https://maps.google.com/?q=19.68430387588073,-99.15870193124036'
const RADIO_MAXIMO_KM = 10

const MEMORIA_CHAT = new Map<string, any[]>()

// 🚨 MÓDULO DE ALERTAS: NOTIFICACIONES GOOGLE CHAT
async function dispararAlertaInmediata(telefono: string, estatus: string, detalles: string) {
    const CHAT_WEBHOOK_URL = process.env.GOOGLE_CHAT_WEBHOOK || ''
    if (!CHAT_WEBHOOK_URL) return

    try {
        const icono = estatus === 'AGENDADO' ? '🟢' : '🔴'
        await fetch(CHAT_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: `${icono} *¡ALERTA SOLTECOT_!*\n*Estatus:* ${estatus}\n*Cliente:* ${telefono}\n*Detalles:* ${detalles}`
            })
        })
    } catch (error: any) {
        console.error('🔴 Error Alerta:', error.message)
    }
}

// 🐘 MOTOR 1: REGISTRO RELACIONAL EN POSTGRESQL (PRISMA)
async function registrarEnPrismaDB(telefono: string, nombre: string, mensaje: string, respuesta: string) {
    try {
        const cliente = await prisma.cliente.upsert({
            where: { telefono: telefono },
            update: { nombre: nombre !== 'Desconocido' ? nombre : undefined },
            create: {
                telefono: telefono,
                nombre: nombre !== 'Desconocido' ? nombre : 'Cliente WhatsApp',
            }
        })
        console.log(`🐘 [PRISMA]: Cliente [${cliente.nombre}] sincronizado en Postgres.`)
        return cliente
    } catch (error: any) {
        console.error('🔴 [PRISMA ERROR]: No se pudo guardar en Postgres:', error.message)
        return null
    }
}

// 🐘 MOTOR 2: GUARDAR LA CITA EN POSTGRESQL (PRISMA)
async function registrarCitaEnPrismaDB(telefono: string, nombreCliente: string, direccion: string, fechaIso: string, distancia: number) {
    try {
        await prisma.cita.create({
            data: {
                telefono: telefono,
                nombreCliente: nombreCliente,
                direccion: direccion,
                fechaCita: new Date(fechaIso),
                distanciaKm: distancia,
                coordenadas: COORDENADAS_LABORATORIO,
                tipo: 'RECOLECCION',
                estado: 'PENDIENTE'
            }
        })
        console.log(`🐘 [PRISMA]: Cita de recolección guardada en la base de datos de Neon.`)
    } catch (error: any) {
        console.error('🔴 [PRISMA ERROR CITA]:', error.message)
    }
}

// 🗄️ MOTOR 3: RESPALDO VISUAL EN GOOGLE SHEETS
async function registrarEnGoogleSheets(
    telefono: string, mensaje: string, respuesta: string, status: string,
    nombre: string, dispositivo: string, falla: string
) {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: path.join(process.cwd(), 'google-credentials.json'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        })
        const sheets = google.sheets({ version: 'v4', auth })
        const fechaActual = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })

        const respuestaColumnas = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID, range: 'Hoja 1!B:B',
        })

        const filasDeTelefonos = respuestaColumnas.data.values || []
        let filaEncontradaIndex = -1

        for (let i = 0; i < filasDeTelefonos.length; i++) {
            if (filasDeTelefonos[i][0] === telefono) {
                filaEncontradaIndex = i + 1
                break
            }
        }

        const valoresFila = [fechaActual, telefono, mensaje, respuesta, status, nombre, dispositivo, falla]

        if (filaEncontradaIndex !== -1) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `Hoja 1!A${filaEncontradaIndex}:H${filaEncontradaIndex}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [valoresFila] }
            })
        } else {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID, range: 'Hoja 1!A:H',
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [valoresFila] }
            })
        }
    } catch (error: any) {
        console.error('🔴 Error Sheets:', error.message)
    }
}

async function procesarCitaEnCalendar(telefono: string, fechaIso: string, mensajeCliente: string) {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: path.join(process.cwd(), 'google-credentials.json'),
            scopes: ['https://www.googleapis.com/auth/calendar'],
        })
        const calendar = google.calendar({ version: 'v3', auth })

        const inicioCita = new Date(fechaIso)
        const finCita = new Date(inicioCita.getTime() + (60 * 60 * 1000))

        const listaEventos = await calendar.events.list({
            calendarId: CALENDAR_ID, timeMin: inicioCita.toISOString(), timeMax: finCita.toISOString(), singleEvents: true,
        })

        if (listaEventos.data.items && listaEventos.data.items.length > 0) {
            return { exitoso: false, motivo: 'ocupado' }
        }

        const nuevoEvento = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            requestBody: {
                summary: `🚚 Recolección Soltecot_ [${telefono}]`,
                description: `Cliente: ${telefono}\nSolicitud: ${mensajeCliente}`,
                start: { dateTime: inicioCita.toISOString(), timeZone: 'America/Mexico_City' },
                end: { dateTime: finCita.toISOString(), timeZone: 'America/Mexico_City' },
            },
        })
        return { exitoso: true, eventId: nuevoEvento.data.id }
    } catch (error: any) {
        return { exitoso: false, motivo: 'error' }
    }
}

async function eliminarCitaEnCalendar(eventId: string) {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: path.join(process.cwd(), 'google-credentials.json'),
            scopes: ['https://www.googleapis.com/auth/calendar'],
        })
        const calendar = google.calendar({ version: 'v3', auth })
        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId })
    } catch (error: any) {
        console.error('🔴 Error Delete Calendar:', error.message)
    }
}

async function calcularDistanciaKm(direccionDestino: string, apiKey: string): Promise<number> {
    try {
        const mapsKey = process.env.GOOGLE_MAPS_API_KEY || apiKey
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${COORDENADAS_LABORATORIO}&destinations=${encodeURIComponent(direccionDestino)}&key=${mapsKey}`
        const res = await fetch(url)
        const data = await res.json()
        if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
            return data.rows[0].elements[0].distance.value / 1000
        }
        return -1
    } catch (error) {
        return -1
    }
}

async function ejecutarLogicaIA(mensajeCliente: string, numeroCliente: string) {
    const MAX_REINTENTOS = 3
    let respuestaRaw = ''
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || ''

    let historial = MEMORIA_CHAT.get(numeroCliente) || []
    historial.push({ role: 'user', parts: [{ text: mensajeCliente }] })
    if (historial.length > 12) historial = historial.slice(-12)

    for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
        try {
            const ai = new GoogleGenAI({ apiKey })
            const fechaHoyString = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: historial,
                config: {
                    systemInstruction: `Eres el Agente de IA oficial de Soltecot_ (Solutions & Technology On Time) atendiendo en WhatsApp.
                    Tu objetivo es ser un recepcionista atento y técnico para nuestro laboratorio de reparación.
                    
                    📅 HOY ES: ${fechaHoyString}.
                    📍 COBERTURA: Servicio de recolección limitado a un radio máximo de 10km.
                    📍 DIRECCIÓN FÍSICA DEL LABORATORIO: ${DIRECCION_TEXTUAL}
                    🗺️ ENLACE DE GOOGLE MAPS: ${LINK_GOOGLE_MAPS}

                    REGLAS DE NEGOCIO:
                    1. RECOLECCIONES: ÚNICAMENTE Sábados y Domingos. Cupos limitados.
                    2. COTIZACIONES: Da rangos estimados (Mantenimiento PS5 $800-$1200, Limpieza Laptop $600-$800).
                    
                    🚨 FORMATO DE ETIQUETAS DE CONTROL:
                    - Si coordinan el horario por primera vez, añade abajo: __AGENDAR__:AAAA-MM-DDTHH:MM:00
                    - Si te está entregando sus datos de recolección (dirección, nombre), confirma cordialmente e incluye abajo la dirección completa, asegurándote de anexar siempre el Municipio y Estado: __DIRECCION_CLIENTE__:[dirección limpia del usuario], Cuautitlán, Estado de México
                    
                    📊 EXTRAER ATRIBUTOS CRM (OBLIGATORIO EN CADA MENSAJE):
                    Analiza todo el historial y en una línea nueva al final absoluto, añade siempre la siguiente estructura con los datos detectados del cliente (si no los conoces aún, escribe "Desconocido"):
                    __DATOS_CRM__:NombreDetectado|DispositivoDetectado|FallaDetectada`,
                }
            })

            respuestaRaw = response.text || ''
            break
        } catch (error: any) {
            if (intento === MAX_REINTENTOS) return
            await new Promise(resolve => setTimeout(resolve, 2000))
        }
    }

    try {
        let estatusLead = 'PROSPECTO'

        const matchAgendar = respuestaRaw.match(/__AGENDAR__:(.+)/)
        const matchDireccion = respuestaRaw.match(/__DIRECCION_CLIENTE__:(.+)/)
        const matchCrm = respuestaRaw.match(/__DATOS_CRM__:(.+)/)

        let respuestaWhatsApp = respuestaRaw
            .replace(/__AGENDAR__:.+/, '')
            .replace(/__DIRECCION_CLIENTE__:.+/, '')
            .replace(/__DATOS_CRM__:.+/, '')
            .trim()

        let nombreCrm = 'Desconocido', dispositivoCrm = 'No especificado', fallaCrm = 'No especificada'
        if (matchCrm) {
            const campos = matchCrm[1].split('|')
            if (campos[0]) nombreCrm = campos[0].trim()
            if (campos[1]) dispositivoCrm = campos[1].trim()
            if (campos[2]) fallaCrm = campos[2].trim()
        }

        await registrarEnPrismaDB(numeroCliente, nombreCrm, mensajeCliente, respuestaWhatsApp)

        if (matchAgendar) {
            const fechaExtraida = matchAgendar[1].trim()
            const resultadoAgenda = await procesarCitaEnCalendar(numeroCliente, fechaExtraida, mensajeCliente)

            if (resultadoAgenda.exitoso) {
                respuestaWhatsApp = `${respuestaWhatsApp}\n\n📅 *Confirmación:* He apartado tu espacio en nuestro sistema de rutas. Para validarlo, por favor proporcióname tu dirección, nombre completo y falla del equipo. 🛠️`
                MEMORIA_CHAT.set(`${numeroCliente}_event_id`, resultadoAgenda.eventId)
                MEMORIA_CHAT.set(`${numeroCliente}_fecha_iso`, fechaExtraida)
                estatusLead = 'POR_AGENDAR'
            } else {
                respuestaWhatsApp = `${respuestaWhatsApp}\n\n⚠️ *Aviso:* Ese horario ya está ocupado. ¿Tendrás algún otro disponible?`
                estatusLead = 'POR_AGENDAR'
            }
        }

        if (matchDireccion) {
            const direccionExtraida = matchDireccion[1].trim()
            const kilometrosReal = await calcularDistanciaKm(direccionExtraida, apiKey)

            if (kilometrosReal !== -1 && kilometrosReal <= RADIO_MAXIMO_KM) {
                respuestaWhatsApp = `${respuestaWhatsApp}\n\n📍 *Validación de Cobertura:* Confirmamos que tu domicilio se encuentra a *${kilometrosReal.toFixed(1)} km* de nuestra base, dentro de nuestro rango operativo. ¡Nuestra logística está lista! 🚚💨`
                estatusLead = 'AGENDADO'

                const fechaGuardadaIso = MEMORIA_CHAT.get(`${numeroCliente}_fecha_iso`) || new Date().toISOString()
                await registrarCitaEnPrismaDB(numeroCliente, nombreCrm, direccionExtraida, fechaGuardadaIso, kilometrosReal)
                await dispararAlertaInmediata(numeroCliente, 'AGENDADO', `${nombreCrm} agendó recolección para ${dispositivoCrm}. Dirección: ${direccionExtraida}`)
            } else {
                const eventIdAEliminar = MEMORIA_CHAT.get(`${numeroCliente}_event_id`)
                if (eventIdAEliminar) await eliminarCitaEnCalendar(eventIdAEliminar)

                respuestaWhatsApp = `¡Gracias por los datos! Sin embargo, nuestro sistema detectó que tu dirección se encuentra fuera de rango.\n\n⚠️ Nuestro límite de cobertura es de **${RADIO_MAXIMO_KM} km**.\n\nCon gusto te recibimos directamente en nuestras instalaciones para un diagnóstico sin costo. ¿Te comparto la ubicación? 🛠️`
                estatusLead = 'FUERA_DE_COBERTURA'
                await dispararAlertaInmediata(numeroCliente, 'FUERA_DE_COBERTURA', `${nombreCrm} fuera de rango. Dirección: ${direccionExtraida}`)
            }
        }

        historial.push({ role: 'model', parts: [{ text: respuestaWhatsApp }] })
        MEMORIA_CHAT.set(numeroCliente, historial)

        // 🚀 NUEVA OPERACIÓN UNIFICADA: Mandamos el texto usando tu conector de Meta
        const exitoEnvio = await enviarMensajeWhatsApp(numeroCliente, respuestaWhatsApp)

        // Si Meta acepta el mensaje con éxito, procedemos al respaldo en Sheets
        if (exitoEnvio) {
            await registrarEnGoogleSheets(numeroCliente, mensajeCliente, respuestaWhatsApp, estatusLead, nombreCrm, dispositivoCrm, fallaCrm)
        }
    } catch (error: any) {
        console.error('🔴 Error bloque salida:', error.message)
    }
}

export async function POST(req: Request) {
    try {
        const event = await req.json()
        if (event.type !== 'message' || !event.data || event.data.type !== 'chat') {
            return new Response('Evento ignorado', { status: 200 })
        }
        await ejecutarLogicaIA(event.data.body, event.data.from)
        return new Response('Mensaje processed', { status: 200 })
    } catch (error) {
        return new Response('Internal Error', { status: 500 })
    }
}