import { GoogleGenAI } from '@google/genai'
import { google } from 'googleapis'
import { prisma } from '../../../lib/prisma'
import { enviarMensajeWhatsApp } from '../../../lib/whatsapp'
import path from 'path'

export const dynamic = 'force-dynamic'

const SPREADSHEET_ID = '1TKfQ4bB1wLxOP6nUUXzFreILRmbmzD2OhLj5Wdt0Ph4'
const CALENDAR_ID = 'juliolopez@soltecot.com'

const COORDENADAS_LABORATORIO = '19.68430387588073,-99.15870193124036'
const DIRECCION_TEXTUAL = 'Hacienda Los Geranios, MZ 45 LT 14, Villas Xaltipa 2-C. Cuautitlán, Estado de México, C.P. 54850. (Nota: La recepción se realiza en la entrada principal).'
const LINK_GOOGLE_MAPS = 'https://maps.google.com/?q=19.68430387588073,-99.15870193124036'
const RADIO_MAXIMO_KM = 10

const MEMORIA_CHAT = new Map<string, any[]>()

async function dispararAlertaInmediata(telefono: string, estatus: string, detalles: string) {
    const CHAT_WEBHOOK_URL = process.env.GOOGLE_CHAT_WEBHOOK || ''
    if (!CHAT_WEBHOOK_URL) return
    try {
        const icono = estatus === 'AGENDADO' ? '🟢' : '🔴'
        await fetch(CHAT_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: `${icono} *¡ALERTA SOLTECOT_!*\n*Estatus:* ${estatus}\n*Cliente:* ${telefono}\n*Detalles:* ${detalles}` })
        })
    } catch (error: any) {
        console.error('🔴 Error Alerta:', error.message)
    }
}

async function registrarEnPrismaDB(telefono: string, nombre: string, mensaje: string, respuesta: string) {
    try {
        const cliente = await prisma.cliente.upsert({
            where: { telefono: telefono },
            update: { nombre: nombre !== 'Desconocido' ? nombre : undefined },
            create: { telefono: telefono, nombre: nombre !== 'Desconocido' ? nombre : 'Cliente WhatsApp' }
        })
        return cliente
    } catch (error: any) {
        console.error('🔴 [PRISMA ERROR]:', error.message)
        return null
    }
}

async function registrarCitaEnPrismaDB(telefono: string, nombreCliente: string, direccion: string, fechaIso: string, distancia: number, tipo: 'VISITA' | 'RECOLECCION') {
    try {
        await prisma.cita.create({
            data: {
                telefono: telefono,
                nombreCliente: nombreCliente,
                direccion: direccion,
                fechaCita: new Date(fechaIso),
                distanciaKm: distancia,
                coordenadas: COORDENADAS_LABORATORIO,
                tipo: tipo,
                estado: 'PENDIENTE'
            }
        })
        console.log(`🐘 [PRISMA]: Cita [${tipo}] guardada exitosamente con el teléfono de contacto: ${telefono}`)
    } catch (error: any) {
        console.error('🔴 [PRISMA ERROR CITA]:', error.message)
    }
}

async function registrarEnGoogleSheets(telefono: string, mensaje: string, respuesta: string, status: string, nombre: string, dispositivo: string, falla: string) {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: path.join(process.cwd(), 'google-credentials.json'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        })
        const sheets = google.sheets({ version: 'v4', auth })
        const fechaActual = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
        const valoresFila = [fechaActual, telefono, mensaje, respuesta, status, nombre, dispositivo, falla]

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID, range: 'Hoja 1!A:H',
            valueInputOption: 'USER_ENTERED', requestBody: { values: [valoresFila] }
        })
    } catch (error: any) {
        console.error('🔴 Error Sheets:', error.message)
    }
}

async function procesarCitaEnCalendar(telefono: string, fechaIso: string, mensajeCliente: string, tipo: 'VISITA' | 'RECOLECCION') {
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

        const prefijo = tipo === 'RECOLECCION' ? '🚚 Recolección' : '🔬 Visita Laboratorio'

        const nuevoEvento = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            requestBody: {
                summary: `${prefijo} Soltecot_ [${telefono}]`,
                description: `Contacto: ${telefono}\nSolicitud: ${mensajeCliente}`,
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
                    systemInstruction: `Eres el Agente de IA oficial de Soltecot_ (Solutions & Technology On Time) en WhatsApp. Atiendes la recepción de un laboratorio de microelectrónica.
                    
                    📅 HOY ES: ${fechaHoyString}.
                    📍 DIRECCIÓN FÍSICA: ${DIRECCION_TEXTUAL}
                    🗺️ GOOGLE MAPS: ${LINK_GOOGLE_MAPS}

                    MODALIDADES DE ATENCIÓN:
                    1. VISITA DIRECTA AL LABORATORIO: De lunes a viernes (10:00 AM a 6:00 PM) y sábados (10:00 AM a 2:00 PM). El cliente se traslada por su cuenta.
                    2. SERVICIO DE RECOLECCIÓN A DOMICILIO (RUTAS): ÚNICAMENTE sábados y domingos. Cobertura limitada a un radio máximo de 10km.

                    🚨 REGLA DE ORO DE CAPTURA (OBLIGATORIA):
                    - Tanto para Visitas como para Recolecciones, SOLICITA SIEMPRE amablemente al cliente su Nombre Completo y un Número Telefónico de contacto (10 dígitos) para validar, agendar y asegurar su folio en el sistema.

                    🚨 REGLA DE EMPATÍA Y MODELOS DESCONOCIDOS:
                    - Si un cliente insiste en un modelo confuso (ej. "MacBook Neo"), no discutas, valida amablemente, dale un rango general estimado de precios y ofrécele la revisión sin costo en laboratorio.

                    🚨 REGLA DE ORO DE ETIQUETAS:
                    Detecta con precisión qué prefiere el cliente:
                    - Si coordinan día/hora para que el cliente VENGA en persona al laboratorio, añade abajo: __AGENDAR_VISITA__:AAAA-MM-DDTHH:MM:00
                    - Si coordinan día/hora para ir a RECOLECTAR a su domicilio (solo fines de semana), añade abajo: __AGENDAR_RECOLECCION__:AAAA-MM-DDTHH:MM:00
                    - Si te entrega su dirección para la RECOLECCIÓN, confirma amablemente e incluye abajo: __DIRECCION_CLIENTE__:[dirección limpia]
                    
                    📊 EXTRAER ATRIBUTOS CRM (INCLUYE EL TELÉFONO DE CONTACTO DEL CLIENTE):
                    Añade siempre en la última línea: __DATOS_CRM__:Nombre|Dispositivo|Falla|TelefonoDe10DigitosDelCliente`,
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

        const matchVisita = respuestaRaw.match(/__AGENDAR_VISITA__:(.+)/)
        const matchRecoleccion = respuestaRaw.match(/__AGENDAR_RECOLECCION__:(.+)/)
        const matchDireccion = respuestaRaw.match(/__DIRECCION_CLIENTE__:(.+)/)
        const matchCrm = respuestaRaw.match(/__DATOS_CRM__:(.+)/)

        let respuestaWhatsApp = respuestaRaw
            .replace(/__AGENDAR_VISITA__:.+/, '')
            .replace(/__AGENDAR_RECOLECCION__:.+/, '')
            .replace(/__DIRECCION_CLIENTE__:.+/, '')
            .replace(/__DATOS_CRM__:.+/, '')
            .trim()

        let nombreCrm = 'Desconocido', dispositivoCrm = 'No especificado', fallaCrm = 'No especificada', telefonoRealCrm = ''
        if (matchCrm) {
            const campos = matchCrm[1].split('|')
            if (campos[0]) nombreCrm = campos[0].trim()
            if (campos[1]) dispositivoCrm = campos[1].trim()
            if (campos[2]) fallaCrm = campos[2].trim()
            if (campos[3]) telefonoRealCrm = campos[3].trim().replace(/\D/g, '') // Extraemos los puros números
        }

        // 🛡️ CONTROL INTELIGENTE DE ENRUTAMIENTO:
        // Si el cliente ya nos proporcionó un teléfono celular real de 10 dígitos en la charla,
        // usamos ESE número para la base de datos de citas (asegurando el canal @s.whatsapp.net).
        // Si aún no lo da, usamos provisionalmente el identificador que viene del webhook.
        const telefonoParaCita = (telefonoRealCrm && telefonoRealCrm.length >= 10) ? telefonoRealCrm.slice(-10) : numeroCliente

        await registrarEnPrismaDB(telefonoParaCita, nombreCrm, mensajeCliente, respuestaWhatsApp)

        // 🔬 MUNDO 1: PROCESAR ENTREGA DIRECTA EN EL LABORATORIO
        if (matchVisita) {
            const fechaExtraida = matchVisita[1].trim()
            const resultadoAgenda = await procesarCitaEnCalendar(telefonoParaCita, fechaExtraida, mensajeCliente, 'VISITA')

            if (resultadoAgenda.exitoso) {
                // Si el calendario está libre, dejamos el texto de la IA y le añadimos el boleto de confirmación
                respuestaWhatsApp = `${respuestaWhatsApp}\n\n🎫 *Cita en Laboratorio Confirmada:* Tu espacio de recepción ha quedado reservado con éxito. ¡Te esperamos! 🛠️`
                estatusLead = 'AGENDADO'

                await registrarCitaEnPrismaDB(telefonoParaCita, nombreCrm, 'Entrega Presencial en Laboratorio', fechaExtraida, 0, 'VISITA')
                await dispararAlertaInmediata(telefonoParaCita, 'AGENDADO', `${nombreCrm} agendó Visita Presencial para ${dispositivoCrm}`)
            } else {
                // 🚨 LIMPIEZA ABSOLUTA: Si el horario está lleno, fulminamos el texto optimista de la IA
                // y le inyectamos un mensaje controlado que no confunda al cliente.
                respuestaWhatsApp = `¡Hola, ${nombreCrm}! Disculpa la interrupción. Al intentar asegurar tu folio en nuestro sistema, detectamos que el horario de las **${new Date(fechaExtraida).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' })}** para tu visita al laboratorio se acaba de ocupar.\n\n⏳ ¿Tendrás algún otro horario disponible entre semana (10 AM a 6 PM) o el sábado antes de las 2 PM para asignarte un espacio libre?`
                estatusLead = 'POR_AGENDAR'
            }
        }

        // 🚚 MUNDO 2: PROCESAR SOLICITUD DE RECOLECCIÓN
        if (matchRecoleccion) {
            const fechaExtraida = matchRecoleccion[1].trim()
            const resultadoAgenda = await procesarCitaEnCalendar(telefonoParaCita, fechaExtraida, mensajeCliente, 'RECOLECCION')

            if (resultadoAgenda.exitoso) {
                // Si la ruta está libre, se anexa la confirmación estándar
                respuestaWhatsApp = `${respuestaWhatsApp}\n\n📅 *Confirmación de Ruta:* He apartado tu espacio en nuestro sistema de logística.\n\n⚠️ *Para activar tu recolección*, por favor proporciónname tu *dirección completa*, *nombre completo* y la *falla* del equipo. 🚚`

                await registrarCitaEnPrismaDB(telefonoParaCita, nombreCrm, 'Pendiente de dirección', fechaExtraida, 0, 'RECOLECCION')

                MEMORIA_CHAT.set(`${numeroCliente}_event_id`, resultadoAgenda.eventId)
                MEMORIA_CHAT.set(`${numeroCliente}_fecha_iso`, fechaExtraida)
                estatusLead = 'POR_AGENDAR'
            } else {
                // 🚨 LIMPIEZA ABSOLUTA: Si la ruta está llena, borramos el mensaje de la IA para evitar contradicciones
                respuestaWhatsApp = `¡Hola, ${nombreCrm}! Estábamos procesando tu recolección a domicilio, pero nuestro mapa logístico detectó que el horario de las **${new Date(fechaExtraida).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' })}** en la ruta de fin de semana ya no tiene cupo disponible.\n\n⚠️ Nuestro cupo es limitado para garantizar la puntualidad de los operadores.\n\n¿Tendrás algún otro espacio libre el sábado o domingo que podamos validar en tiempo real? 🚚💨`
                estatusLead = 'POR_AGENDAR'
            }
        }

        // 📍 VALIDAR LOGÍSTICA DE DIRECCIÓN
        if (matchDireccion) {
            const direccionExtraida = matchDireccion[1].trim()

            const ultimaCitaPrisma = await prisma.cita.findFirst({
                where: { telefono: telefonoParaCita },
                orderBy: { createdAt: 'desc' }
            })

            const tipoCitaActual = ultimaCitaPrisma?.tipo || 'RECOLECCION'

            if (tipoCitaActual === 'VISITA') {
                estatusLead = 'AGENDADO'
            } else {
                const kilometrosReal = await calcularDistanciaKm(direccionExtraida, apiKey)

                if (kilometrosReal !== -1 && kilometrosReal <= RADIO_MAXIMO_KM) {
                    respuestaWhatsApp = `${respuestaWhatsApp}\n\n📍 *Validación de Cobertura:* Confirmamos que tu domicilio se encuentra a *${kilometrosReal.toFixed(1)} km* de nuestra base, dentro de nuestro rango operativo. ¡Nuestra logística de ruta está lista! 🚚💨`
                    estatusLead = 'AGENDADO'

                    if (ultimaCitaPrisma && ultimaCitaPrisma.tipo === 'RECOLECCION') {
                        await prisma.cita.update({
                            where: { id: ultimaCitaPrisma.id },
                            data: { direccion: direccionExtraida, distanciaKm: kilometrosReal, estado: 'PENDIENTE' }
                        })
                    }

                    await dispararAlertaInmediata(telefonoParaCita, 'AGENDADO', `${nombreCrm} agendó Recolección. Dirección: ${direccionExtraida}`)
                } else {
                    const eventIdAEliminar = MEMORIA_CHAT.get(`${numeroCliente}_event_id`)
                    if (eventIdAEliminar) await eliminarCitaEnCalendar(eventIdAEliminar)

                    respuestaWhatsApp = `¡Gracias por los datos! Sin embargo, nuestro sistema detectó que tu dirección se encuentra fuera de nuestro rango de cobertura de recolección.\n\n⚠️ Nuestro límite es de **${RADIO_MAXIMO_KM} km**.\n\nCon gusto te recibimos directamente en nuestras instalaciones para un diagnóstico sin costo. ¿Te comparto la ubicación? 🛠️`
                    estatusLead = 'FUERA_DE_COBERTURA'
                    await dispararAlertaInmediata(telefonoParaCita, 'FUERA_DE_COBERTURA', `${nombreCrm} fuera de rango. Dirección: ${direccionExtraida}`)
                }
            }
        }

        historial.push({ role: 'model', parts: [{ text: respuestaWhatsApp }] })
        MEMORIA_CHAT.set(numeroCliente, historial)

        const exitoEnvio = await enviarMensajeWhatsApp(numeroCliente, respuestaWhatsApp)
        if (exitoEnvio) {
            await registrarEnGoogleSheets(telefonoParaCita, mensajeCliente, respuestaWhatsApp, estatusLead, nombreCrm, dispositivoCrm, fallaCrm)
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
        if (event.data.fromMe === true || event.data.from.includes('5546088200')) {
            return new Response('Eco del bot ignorado', { status: 200 })
        }
        await ejecutarLogicaIA(event.data.body, event.data.from)
        return new Response('Mensaje processed', { status: 200 })
    } catch (error) {
        return new Response('Internal Error', { status: 500 })
    }
}