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
        let icono = '🟢'
        if (estatus === '🔴' || estatus === 'RECHAZADO') icono = '🔴'
        if (estatus === 'EN_REPARACION') icono = '⚡'

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

async function registrarCitaEnPrismaDB(telefono: string, nombreCliente: string, direccion: string, fechaIso: string, distancia: number, tipo: 'ENTREGA' | 'RECOLECCION') {
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

async function procesarCitaEnCalendar(telefono: string, fechaIso: string, mensajeCliente: string, tipo: 'ENTREGA' | 'RECOLECCION') {
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
    const textoNormalizado = mensajeCliente.trim().toLowerCase()
    const telefonoLimpio = numeroCliente.replace(/[^0-9]/g, '')
    const telefono10Digitos = telefonoLimpio.slice(-10)

    try {
        // Buscamos el cliente y su orden activa usando variaciones del formato telefónico
        const clientePrisma = await prisma.cliente.findFirst({
            where: {
                OR: [
                    { telefono: numeroCliente },
                    { telefono: telefonoLimpio },
                    { telefono: telefono10Digitos }
                ]
            },
            include: {
                tickets: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        })

        const ticketMasReciente = clientePrisma?.tickets[0]

        // 🖥️ 1. INTERCEPTOR INTELIGENTE DE GOOGLE REMOTE DESKTOP (NUEVO)
        // Detecta patrones de 12 dígitos (ej: 1234 5678 9012 o 123456789012)
        const regexCodigoRemoto = /\b\d{4}\s?\d{4}\s?\d{4}\b|\b\d{12}\b/
        if (regexCodigoRemoto.test(textoNormalizado)) {
            const codigoEncontrado = mensajeCliente.match(regexCodigoRemoto)![0].replace(/\s/g, '')

            // Actualizamos el ticket en Neon para reflejar que la sesión está activa
            if (ticketMasReciente) {
                await prisma.ticket.update({
                    where: { id: ticketMasReciente.id },
                    data: {
                        estado: 'EN_REPARACION',
                        notasInternas: `[SESIÓN REMOTA] Código de acceso: ${codigoEncontrado}`
                    }
                })
            }

            const mensajeConexion = `⚡ *SISTEMA SOLTECOT_ REMOTO* ⚡\n\n¡Código de acceso recibido con éxito, *${clientePrisma?.nombre || 'Cliente'}*!\n\nEl Ingeniero Julio ha recibido la alerta en el Centro de Control y se está enlazando a tu equipo en este momento vía *Google Remote Desktop*.\n\n💻 *Por favor, mantén abierta tu ventana del navegador y no cierres el código.* Verás la actividad de soporte técnico en tu pantalla en unos segundos. 🔬`

            await enviarMensajeWhatsApp(numeroCliente, mensajeConexion)

            // Te dispara el código listo a tu Google Chat corporativo
            const codigoFormateado = `${codigoEncontrado.slice(0, 4)}-${codigoEncontrado.slice(4, 8)}-${codigoEncontrado.slice(8, 12)}`
            await dispararAlertaInmediata(
                telefono10Digitos,
                'EN_REPARACION',
                `🖥️ *SESIÓN REMOTA EN ESPERA*\n• *Cliente:* ${clientePrisma?.nombre || 'Particular'}\n• *Equipo:* ${ticketMasReciente?.equipo || 'PC/Laptop'}\n👉 *CÓDIGO DE CONEXIÓN:* ${codigoFormateado}\n\nCopialo y entra desde tu MacNeo a: https://remotedesktop.google.com/support`
            )
            return // 🚫 Frena el flujo, Gemini no interfiere en la entrega del código
        }

        // 💰 INTERCEPTOR DE PRESUPUESTOS (PUNTO 3)
        if (ticketMasReciente && ticketMasReciente.estado === 'ESPERANDO_APROBACION') {
            if (textoNormalizado === 'aceptar' || textoNormalizado === 'acepto' || textoNormalizado === 'autorizar') {
                await prisma.ticket.update({
                    where: { id: ticketMasReciente.id },
                    data: { estado: 'EN_REPARACION' }
                })

                const anticipo = (ticketMasReciente.costoReparacion || 0) * 0.50
                const mensajeAceptacion = `✨ *¡Excelente decisión, ${clientePrisma.nombre}!* ✨\n\nHemos registrado tu autorización para proceder con la reparación de tu *${ticketMasReciente.equipo}* (Orden: ${ticketMasReciente.numeroOrden}).\n\n💳 *Instrucciones de Prepago (50%):*\nPara activar las órdenes de refacciones y asignarle prioridad en el banco de trabajo, es necesario realizar el depósito del anticipo reglamentario:\n👉 *Monto del Anticipo:* $${anticipo.toFixed(2)} MXN\n\n🏦 *Datos Bancarios Oficiales:* \n• *Banco:* BBVA\n• *Cuenta CLABE:* 0121 8001 2345 6789 01\n• *Beneficiario:* Solutions & Technology On Time\n• *Concepto/Referencia:* ${ticketMasReciente.numeroOrden}\n\n🙏 Una vez realizado el movimiento, por favor compártenos el comprobante por aquí para validar tu pago y arrancar el microscopio de inmediato. 🔬`

                await enviarMensajeWhatsApp(numeroCliente, mensajeAceptacion)
                await dispararAlertaInmediata(telefono10Digitos, 'EN_REPARACION', `✅ ¡Presupuesto Aceptado! El cliente autorizó la orden ${ticketMasReciente.numeroOrden}. Anticipo requerido: $${anticipo}`)
                return
            }

            if (textoNormalizado === 'rechazar' || textoNormalizado === 'rechazo' || textoNormalizado === 'cancelar') {
                await prisma.ticket.update({
                    where: { id: ticketMasReciente.id },
                    data: { estado: 'RECHAZADO' }
                })

                const mensajeRechazo = `⚙️ *SOLTECOT_ INFORMA* ⚙️\n\nEntendemos perfectamente, *${clientePrisma.nombre}*. Hemos registrado el rechazo del presupuesto para la orden *${ticketMasReciente.numeroOrden}*.\n\n📦 *Próximos Pasos:*\nLa reparación no procederá. Nuestro equipo técnico reensamblará tu *${ticketMasReciente.equipo}* para dejarlo en las mismas condiciones mecánicas en que ingresó. Te notificaremos en cuanto esté listo para que pases a recogerlo a nuestras instalaciones.\n\n¡Gracias por tu confianza y tiempo! 🔬`

                await enviarMensajeWhatsApp(numeroCliente, mensajeRechazo)
                await dispararAlertaInmediata(telefono10Digitos, 'RECHAZADO', `❌ Presupuesto Rechazado. El cliente canceló la orden ${ticketMasReciente.numeroOrden}. El equipo regresa a ensamblaje de devolución.`)
                return
            }
        }

        // 🛡️ ESCUDO MODO HUMANO AUTOMÁTICO (PUNTO 2)
        if (ticketMasReciente && ticketMasReciente.botActivo === false) {
            console.log(`🤫 [MODO HUMANO ACTIVO]: El agente de IA se ha pausado para el cliente: ${numeroCliente}.`)
            return
        }

    } catch (dbError: any) {
        console.error('🔴 Error al validar escudos en el webhook:', dbError.message)
    }

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
                    systemInstruction: `Eres el Agente de IA oficial de Soltecot_ (Solutions & Technology On Time) en WhatsApp. Atiendes la recepción de un laboratorio de microelectrónica y soluciones de soporte técnico.
                    
                    📅 HOY ES: ${fechaHoyString}.
                    📍 DIRECCIÓN FÍSICA: ${DIRECCION_TEXTUAL}
                    🗺️ GOOGLE MAPS: ${LINK_GOOGLE_MAPS}

                    MODALIDADES DE ATENCIÓN DISPONIBLES:
                    1. VISITA DIRECTA AL LABORATORIO: De lunes a viernes (10 AM a 6 PM) y sábados (10 AM a 2 PM). El cliente viene en persona.
                    2. SERVICIO DE RECOLECCIÓN A DOMICILIO: Sábados y domingos (Radio máximo 10km).
                    3. 🖥️ SOPORTE TÉCNICO REMOTO INMEDIATO (NUEVO): Ideal para problemas de software, optimización, eliminación de virus o instalación de paqueterías. Se realiza de forma 100% segura mediante Google Remote Desktop sin que el cliente salga de casa.

                    🚨 REGLA DE TRIAGE REMOTO:
                    - Si el problema del cliente es puramente de Software/Sistemas o lentitud, ofrécele de inmediato el *Soporte Técnico Remoto*. 
                    - Si el cliente acepta la sesión remota, indícale de forma muy clara y amable los siguientes pasos exactos:
                      1. Entrar desde su computadora a: https://remotedesktop.google.com/support
                      2. Hacer clic en "Asistencia remota" y descargar la pequeña herramienta oficial de Google.
                      3. Darle clic al botón "+ Generar código" y enviarte los 12 dígitos resultantes por este chat para que el Ingeniero Julio se conecte de inmediato.

                    🚨 REGLA DE ORO DE CAPTURA (OBLIGATORIA):
                    - Solicita SIEMPRE el Nombre Completo y un número de teléfono de 10 dígitos para aperturar su folio de servicio técnico en el sistema, sea físico o remoto.

                    🚨 REGLA DE ORO DE ETIQUETAS:
                    - Si coordinan visita física: __AGENDAR_VISITA__:AAAA-MM-DDTHH:MM:00
                    - Si coordinan recolección física: __AGENDAR_RECOLECCION__:AAAA-MM-DDTHH:MM:00
                    - Si te da su dirección de ruta: __DIRECCION_CLIENTE__:[dirección limpia]
                    
                    📊 EXTRAER ATRIBUTOS CRM:
                    Añade siempre al final de cada respuesta: __DATOS_CRM__:Nombre|Dispositivo|Falla|TelefonoDe10Digitos`,
                }
            })
            respuestaRaw = response.text || ''
            break
        } catch (error: any) {
            if (intento === MAX_REINTENTOS) return
            await new Promise(resolve => setTimeout(resolve, 2000))
        }
    }

    // [El resto del bloque de tu lógica de salida de citas e inserción a Sheets se mantiene exactamente igual aquí abajo]
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
            if (campos[3]) telefonoRealCrm = campos[3].trim().replace(/\D/g, '')
        }

        const telefonoParaCita = (telefonoRealCrm && telefonoRealCrm.length >= 10) ? telefonoRealCrm.slice(-10) : numeroCliente

        await registrarEnPrismaDB(telefonoParaCita, nombreCrm, mensajeCliente, respuestaWhatsApp)

        if (matchVisita) {
            const fechaExtraida = matchVisita[1].trim()
            const resultadoAgenda = await procesarCitaEnCalendar(telefonoParaCita, fechaExtraida, mensajeCliente, 'ENTREGA')

            if (resultadoAgenda.exitoso) {
                respuestaWhatsApp = `${respuestaWhatsApp}\n\n🎫 *Cita en Laboratorio Confirmada:* Tu espacio de recepción ha quedado reservado con éxito. ¡Te esperamos! 🛠⚙️`
                estatusLead = 'AGENDADO'

                await registrarCitaEnPrismaDB(telefonoParaCita, nombreCrm, 'Entrega Presencial en Laboratorio', fechaExtraida, 0, 'ENTREGA')
                await dispararAlertaInmediata(telefonoParaCita, 'AGENDADO', `${nombreCrm} agendó Visita Presencial para ${dispositivoCrm}`)
            } else {
                respuestaWhatsApp = `¡Hola, ${nombreCrm}! Disculpa la interrupción. Al intentar asegurar tu folio en nuestro sistema, detectamos que el horario de las **${new Date(fechaExtraida).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' })}** para tu visita al laboratorio se acaba de ocupar.\n\n⏳ ¿Tendrás algún otro horario disponible entre semana (10 AM a 6 PM) o el sábado antes de las 2 PM para asignarte un espacio libre?`
                estatusLead = 'POR_AGENDAR'
            }
        }

        if (matchRecoleccion) {
            const fechaExtraida = matchRecoleccion[1].trim()
            const resultadoAgenda = await procesarCitaEnCalendar(telefonoParaCita, fechaExtraida, mensajeCliente, 'RECOLECCION')
            const MEMORIA_CHAT = new Map<string, any>()

            if (resultadoAgenda.exitoso) {
                respuestaWhatsApp = `${respuestaWhatsApp}\n\n📅 *Confirmación de Ruta:* He apartado tu espacio en nuestro sistema de logística.\n\n⚠️ *Para activar tu recolección*, por favor proporciónname tu *dirección completa*, *nombre completo* y la *falla* del equipo. 🚚`

                await registrarCitaEnPrismaDB(telefonoParaCita, nombreCrm, 'Pendiente de dirección', fechaExtraida, 0, 'RECOLECCION')

                MEMORIA_CHAT.set(`${numeroCliente}_event_id`, resultadoAgenda.eventId)
                MEMORIA_CHAT.set(`${numeroCliente}_fecha_iso`, fechaExtraida)
                estatusLead = 'POR_AGENDAR'
            } else {
                respuestaWhatsApp = `¡Hola, ${nombreCrm}! Estábamos procesando tu recolección a domicilio, pero nuestro mapa logístico detectó que el horario de las **${new Date(fechaExtraida).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' })}** en la ruta de fin de semana ya no tiene cupo disponible.\n\n⚠️ Nuestro cupo es limitado para garantizar la puntualidad de los operadores.\n\n¿Tendrás algún otro espacio libre el sábado o domingo que podamos validar en tiempo real? 🚚💨`
                estatusLead = 'POR_AGENDAR'
            }
        }

        if (matchDireccion) {
            const direccionExtraida = matchDireccion[1].trim()

            const ultimaCitaPrisma = await prisma.cita.findFirst({
                where: { telefono: telefonoParaCita },
                orderBy: { createdAt: 'desc' }
            })

            const tipoCitaActual = ultimaCitaPrisma?.tipo || 'RECOLECCION'

            if (tipoCitaActual === 'ENTREGA') {
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
                    const eventIdAEliminar = MEMORIA_CHAT.get(`${numeroCliente}_event_id`) as any
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