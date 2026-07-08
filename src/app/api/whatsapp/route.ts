import { GoogleGenAI } from '@google/genai'
import { google } from 'googleapis'
import { prisma } from '../../../lib/prisma'
import { enviarMensajeWhatsApp } from '../../../lib/whatsapp'

export const dynamic = 'force-dynamic'

const SPREADSHEET_ID = '1TKfQ4bB1wLxOP6nUUXzFreILRmbmzD2OhLj5Wdt0Ph4'
const CALENDAR_ID = 'juliolopez@soltecot.com'

const COORDENADAS_LABORATORIO = '19.68430387588073,-99.15870193124036'
const DIRECCION_TEXTUAL = 'Hacienda Los Geranios, MZ 45 LT 14, Villas Xaltipa 2-C. Cuautitlán, Estado de México, C.P. 54850. (Nota: La recepción se realiza en la entrada principal).'
const LINK_GOOGLE_MAPS = 'https://maps.google.com/?q=19.68430387588073,-99.15870193124036'
const RADIO_MAXIMO_KM = 10

const MEMORIA_CHAT = new Map<string, any[]>()

function obtenerAuthGoogle(scopes: string[]) {
    const credencialesRaw = process.env.GOOGLE_APPLICATION_CREDENTIALS
    if (!credencialesRaw) {
        throw new Error('🔴 [CRÍTICO]: La variable GOOGLE_APPLICATION_CREDENTIALS no está configurada.')
    }
    return new google.auth.GoogleAuth({
        credentials: JSON.parse(credencialesRaw),
        scopes: scopes
    })
}

async function dispararAlertaInmediata(telefono: string, estatus: string, detalles: string) {
    const CHAT_WEBHOOK_URL = process.env.GOOGLE_CHAT_WEBHOOK || ''
    if (!CHAT_WEBHOOK_URL) return
    try {
        let icono = '🟢'
        if (estatus === '🔴' || estatus === 'RECHAZADO') icono = '🔴'
        if (estatus === 'EN_REPARACION') icono = '⚡'
        if (estatus === 'FUERA_DE_COBERTURA') icono = '🟡' // 🟡 ¡Mucho mejor para alertar visualmente!

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
            update: { nombre: nombre !== 'Desconocido' && nombre !== 'Cliente WhatsApp' ? nombre : undefined },
            create: { telefono: telefono, nombre: nombre }
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
    } catch (error: any) {
        console.error('🔴 [PRISMA ERROR CITA]:', error.message)
    }
}

async function registrarHistorialEnHoja1(telefono: string, mensaje: string, respuesta: string, status: string, nombre: string, dispositivo: string, falla: string) {
    try {
        const auth = obtenerAuthGoogle(['https://www.googleapis.com/auth/spreadsheets'])
        const sheets = google.sheets({ version: 'v4', auth })
        const fechaActual = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
        const valoresFila = [fechaActual, telefono, mensaje, respuesta, status, nombre, dispositivo, falla]

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID, range: "'Hoja 1'!A:H",
            valueInputOption: 'USER_ENTERED', requestBody: { values: [valoresFila] }
        })
    } catch (error: any) {
        console.error('🔴 Error Sheets Hoja 1:', error.message)
    }
}

async function registrarFinanzasEnFacturacion(
    folio: string, telefono: string, nombre: string, tipoSoporte: string, dispositivoFalla: string, status: string,
    reqFactura: string, rfc: string, nombreFiscal: string, cp: string, regimen: string, usoCfdi: string, correo: string,
    montoNeto: string, iva: string, totalCobrado: string, estatusSat: string
) {
    try {
        const auth = obtenerAuthGoogle(['https://www.googleapis.com/auth/spreadsheets'])
        const sheets = google.sheets({ version: 'v4', auth })
        const fechaActual = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })

        const valoresFila = [
            folio, fechaActual, nombre, telefono, tipoSoporte, dispositivoFalla, status,
            reqFactura, rfc, nombreFiscal, cp, regimen, usoCfdi, correo, montoNeto, iva, totalCobrado, estatusSat, ""
        ]

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID, range: "'Facturación'!A:S",
            valueInputOption: 'USER_ENTERED', requestBody: { values: [valoresFila] }
        })
    } catch (error: any) {
        console.error('🔴 Error Sheets Facturación Avanzada:', error.message)
    }
}

async function procesarCitaEnCalendar(telefono: string, fechaIso: string, mensajeCliente: string, tipo: 'ENTREGA' | 'RECOLECCION') {
    try {
        const auth = obtenerAuthGoogle(['https://www.googleapis.com/auth/calendar'])
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

async function eliminarCitaEnCalendar(telefono: string) {
    try {
        const auth = obtenerAuthGoogle(['https://www.googleapis.com/auth/calendar'])
        const calendar = google.calendar({ version: 'v3', auth })

        const tiempoMinimo = new Date().toISOString()

        const listaEventos = await calendar.events.list({
            calendarId: CALENDAR_ID,
            q: telefono,
            timeMin: tiempoMinimo,
            singleEvents: true
        })

        if (listaEventos.data.items && listaEventos.data.items.length > 0) {
            for (const evento of listaEventos.data.items) {
                if (evento.id && evento.summary?.includes('Recolección')) {
                    await calendar.events.delete({
                        calendarId: CALENDAR_ID,
                        eventId: evento.id
                    })
                    console.log(`🗑️ [GOOGLE CALENDAR]: Evento cancelado exitosamente para el teléfono: ${telefono}`)
                }
            }
        }
    } catch (error: any) {
        console.error('🔴 Error de comunicación al eliminar en Calendar:', error.message)
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
    let ticketMasReciente: any = null
    let clientePrisma: any = null

    try {
        // ✨ SOLUCIONADO: Quitamos el 'const' interno para evitar shadowing de variables
        clientePrisma = await prisma.cliente.findFirst({
            where: {
                OR: [
                    { telefono: numeroCliente },
                    { telefono: telefonoLimpio },
                    { telefono: telefono10Digitos }
                ]
            },
            include: { tickets: { orderBy: { createdAt: 'desc' }, take: 1 } }
        })

        ticketMasReciente = clientePrisma?.tickets[0]

        // 🖥️ 1. INTERCEPTOR DE CÓDIGO GOOGLE REMOTE DESKTOP
        const regexCodigoRemoto = /\b\d{4}\s?\d{4}\s?\d{4}\b|\b\d{12}\b/
        if (regexCodigoRemoto.test(textoNormalizado)) {
            const codigoEncontrado = mensajeCliente.match(regexCodigoRemoto)![0].replace(/\s/g, '')

            let clienteIdParaTicket = clientePrisma?.id
            let nombreClienteEstetico = clientePrisma?.nombre && clientePrisma.nombre !== 'Desconocido' && clientePrisma.nombre !== 'Cliente WhatsApp' ? clientePrisma.nombre : 'Cliente WhatsApp'

            if (!clientePrisma) {
                const nuevoClienteExpress = await prisma.cliente.create({
                    data: { telefono: telefono10Digitos, nombre: 'Cliente WhatsApp' }
                })
                clienteIdParaTicket = nuevoClienteExpress.id
                nombreClienteEstetico = 'Cliente WhatsApp'
            }

            let ticketActivo = ticketMasReciente
            if (!ticketActivo || ticketActivo.estado === 'ENTREGADO' || ticketActivo.estado === 'RECHAZADO') {
                const ultimoTicketGlobal = await prisma.ticket.findFirst({ orderBy: { createdAt: 'desc' }, select: { numeroOrden: true } })
                let nuevoFolio = 'SOL-1001'
                if (ultimoTicketGlobal?.numeroOrden) {
                    nuevoFolio = `SOL-${parseInt(ultimoTicketGlobal.numeroOrden.split('-')[1]) + 1}`
                }

                ticketActivo = await prisma.ticket.create({
                    data: {
                        numeroOrden: nuevoFolio,
                        equipo: 'Soporte Técnico Remoto',
                        fallaReportada: 'Instalación de Software / Optimización Express',
                        clienteId: clienteIdParaTicket!,
                        estado: 'EN_REPARACION',
                        notasInternas: `[SESIÓN REMOTA ACTIVA] Código: ${codigoEncontrado}`
                    }
                })
            } else {
                ticketActivo = await prisma.ticket.update({
                    where: { id: ticketActivo.id },
                    data: { estado: 'EN_REPARACION', notasInternas: `[SESIÓN REMOTA ACTIVA] Código: ${codigoEncontrado}` }
                })
            }

            const mensajeConexion = `⚡ *SISTEMA SOLTECOT_ REMOTO* ⚡\n\n¡Código de acceso recibido con éxito!\n\n🎫 *Folio Asignado:* ${ticketActivo.numeroOrden}\n🔬 *Estatus en Taller:* EN REPARACIÓN\n\nEl Ingeniero Julio ha recibido la alerta en el Centro de Control y se está enlazando a tu equipo vía *Google Remote Desktop*.\n\n💻 *Por favor, mantén abierta tu ventana del navegador.* Verás la actividad de soporte técnico en tu pantalla en unos segundos.`

            await enviarMensajeWhatsApp(numeroCliente, mensajeConexion)

            let historialLocal = MEMORIA_CHAT.get(numeroCliente) || []
            historialLocal.push({ role: 'user', parts: [{ text: mensajeCliente }] })
            historialLocal.push({ role: 'model', parts: [{ text: mensajeConexion }] })
            if (historialLocal.length > 12) historialLocal = historialLocal.slice(-12)
            MEMORIA_CHAT.set(numeroCliente, historialLocal)

            await registrarFinanzasEnFacturacion(
                ticketActivo.numeroOrden, telefono10Digitos, nombreClienteEstetico, 'Remoto',
                'Soporte Técnico Remoto / Express', 'EN_REPARACION', 'NO', '', '', '', '', '', '',
                '361.21', '57.79', '419.00', 'NO REQUIERE'
            )

            await registrarHistorialEnHoja1(telefono10Digitos, mensajeCliente, mensajeConexion, 'EN_REPARACION', nombreClienteEstetico, 'Soporte Remoto', 'Código de Acceso')

            const codigoFormateado = `${codigoEncontrado.slice(0, 4)}-${codigoEncontrado.slice(4, 8)}-${codigoEncontrado.slice(8, 12)}`
            await dispararAlertaInmediata(telefono10Digitos, 'EN_REPARACION', `🖥️ *SESIÓN REMOTA EN ESPERA*\n• *Folio:* ${ticketActivo.numeroOrden}\n👉 *CÓDIGO:* ${codigoFormateado}\n\nEntra desde tu MacNeo a: https://remotedesktop.google.com/support`)
            return
        }

        if (ticketMasReciente && ticketMasReciente.estado === 'ESPERANDO_APROBACION') {
            if (textoNormalizado === 'aceptar' || textoNormalizado === 'acepto' || textoNormalizado === 'autorizar') {
                await prisma.ticket.update({ where: { id: ticketMasReciente.id }, data: { estado: 'EN_REPARACION' } })
                const anticipo = (ticketMasReciente.costoReparacion || 0) * 0.50
                const mensajeAceptacion = `✨ *¡Excelente decisión!* ✨\n\nHemos registrado tu autorización para proceder con la reparación de tu *${ticketMasReciente.equipo}* (Orden: ${ticketMasReciente.numeroOrden}).\n\n💳 *Instrucciones de Prepago (50%):*\nPara activar las órdenes de refacciones y asignarle prioridad en el banco de trabajo, es necesario realizar el depósito del anticipo reglamentario:\n👉 *Monto del Anticipo:* $${anticipo.toFixed(2)} MXN\n\n🏦 *Datos Bancarios Oficiales:* \n• *Banco:* BBVA\n• *Cuenta CLABE:* 0121 8001 2345 6789 01\n• *Beneficiario:* Solutions & Technology On Time\n• *Concepto/Referencia:* ${ticketMasReciente.numeroOrden}\n\n🙏 Una vez realizado el movimiento, por favor compártenos el comprobante por aquí para validar tu pago y arrancar el microscopio de inmediato. 🔬`
                await enviarMensajeWhatsApp(numeroCliente, mensajeAceptacion)
                await dispararAlertaInmediata(telefono10Digitos, 'EN_REPARACION', `✅ ¡Presupuesto Aceptado! Orden ${ticketMasReciente.numeroOrden}. Anticipo: $${anticipo}`)
                return
            }

            if (textoNormalizado === 'rechazar' || textoNormalizado === 'rechazo' || textoNormalizado === 'cancelar') {
                await prisma.ticket.update({ where: { id: ticketMasReciente.id }, data: { estado: 'RECHAZADO' } })
                const mensajeRechazo = `⚙️ *SOLTECOT_ INFORMA* ⚙️\n\nHemos registrado el rechazo del presupuesto para la orden *${ticketMasReciente.numeroOrden}*.\n\n📦 *Próximos Pasos:*\nLa reparación no procederá. Nuestro equipo técnico reensamblará tu *${ticketMasReciente.equipo}* para dejarlo en las mismas condiciones mecánicas en que ingresó. Te notificaremos en cuanto esté listo para que pases a recogerlo a nuestras instalaciones.\n\n¡Gracias por tu confianza y tiempo! 🔬`
                await enviarMensajeWhatsApp(numeroCliente, mensajeRechazo)
                await dispararAlertaInmediata(telefono10Digitos, 'RECHAZADO', `❌ Presupuesto Cancelado. La orden ${ticketMasReciente.numeroOrden} regresa a ensamblaje de devolución.`)
                return
            }
        }

        if (ticketMasReciente && ticketMasReciente.botActivo === false) return

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
                    systemInstruction: `Eres el Agente de IA oficial de Soltecot_ (Solutions & Technology On Time) en WhatsApp. Atiendes la recepción de un laboratorio de reparación de computadoras y laptops. Tu objetivo es guiar al cliente para agendar citas (físicas o recolección) o vender soporte remoto, extrayendo la información para el CRM. Tono: Cordial, profesional, empático y al grano. Cero tecnicismos innecesarios.

📅 HOY ES: ${fechaHoyString}.
📍 DIRECCIÓN FÍSICA: ${DIRECCION_TEXTUAL}
🗺️ GOOGLE MAPS: ${LINK_GOOGLE_MAPS}

--- 1. MODALIDADES Y TARIFAS ---
1. VISITA AL LABORATORIO: Lunes a viernes (10 AM - 6 PM) y sábados (10 AM - 2 PM). 
2. RECOLECCIÓN A DOMICILIO: Sábados y domingos (Radio máximo 10km).
3. SOPORTE REMOTO (NUEVO): 100% seguro por Google Remote Desktop. Tarifa fija: $419 MXN neto.
* FISCAL (RESICO): Todos los precios YA INCLUYEN IVA (16%). Emitimos factura CFDI 4.0.

--- 2. REGLAS ESTRICTAS DE ATENCIÓN (¡MUY IMPORTANTE!) ---
🚨 REGLA DE AGENDAMIENTO OBLIGATORIO: 
NUNCA le digas al cliente que "venga cuando guste" o que "no necesita cita". ES OBLIGATORIO que el cliente te confirme un DÍA y una HORA exacta. Pregúntale siempre: "¿Qué día y a qué hora te gustaría agendar tu espacio para revisar disponibilidad?".

🚨 RESCATE DE VENTAS (FUERA DE COBERTURA):
Si el cliente te da una dirección y está muy lejos, ofrécele INMEDIATAMENTE el "Soporte Técnico Remoto Inmediato" por $419 MXN, explicándole que no importa la distancia y se soluciona el mismo día.

🚨 DATOS DE APERTURA:
Cuando el cliente acepte un servicio, pídele en un solo mensaje: Nombre Completo, Teléfono a 10 dígitos y pregúntale: "¿Requerirás factura CFDI 4.0? (Responde SÍ o NO)".

🚨 TRIAGE PARA SOPORTE REMOTO:
Si quiere factura, pídele: RFC, Nombre Fiscal, CP, Régimen, Uso de CFDI y Correo.
Si NO quiere factura (o ya te dio los datos), entrégale las instrucciones de conexión:
  1. Entrar a https://remotedesktop.google.com/support
  2. Descargar la herramienta en "Asistencia remota".
  3. Clic en "+ Generar código" y pasarte los 12 dígitos.

🚨 POST-CONEXIÓN REMOTA:
Si en el historial ves el mensaje "⚡ SISTEMA SOLTECOT_ REMOTO ⚡" y el cliente dice "listo" o "entendido", respóndele: "¡De nada! El Ing. Julio ya está trabajando en tu equipo. Mantén tu pantalla activa, te notificaremos por aquí al finalizar." No pidas más datos.

--- 3. FORMATO OBLIGATORIO DE SALIDA (ETIQUETAS) ---
Si el cliente YA te confirmó fecha y hora (o dirección), incluye la etiqueta correspondiente. Si aún no confirman hora exacta, NO uses las etiquetas de agenda.
- Cita en local: __AGENDAR_VISITA__:AAAA-MM-DDTHH:MM:00
- Cita recolección: __AGENDAR_RECOLECCION__:AAAA-MM-DDTHH:MM:00
- Dirección de ruta: __DIRECCION_CLIENTE__:[dirección completa limpia]

AL FINAL DE CADA MENSAJE, SIEMPRE INCLUYE ESTOS DOS BLOQUES (Usa 'Desconocido' si faltan datos):
__DATOS_CRM__:Nombre|Dispositivo|Falla|TelefonoDe10Digitos
__DATOS_FISCALES__:RequiereFactura(SI/NO)|RFC|NombreFiscal|CP|Regimen|UsoCFDI|Correo`,
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
        let tipoSoporteCalculado = 'Remoto'

        const matchVisita = respuestaRaw.match(/__AGENDAR_VISITA__:(.+)/)
        const matchRecoleccion = respuestaRaw.match(/__AGENDAR_RECOLECCION__:(.+)/)
        const matchDireccion = respuestaRaw.match(/__DIRECCION_CLIENTE__:(.+)/)
        const matchCrm = respuestaRaw.match(/__DATOS_CRM__:(.+)/)
        const matchFiscal = respuestaRaw.match(/__DATOS_FISCALES__:(.+)/)

        let respuestaWhatsApp = respuestaRaw
            .replace(/__AGENDAR_VISITA__:.+/, '')
            .replace(/__AGENDAR_RECOLECCION__:.+/, '')
            .replace(/__DIRECCION_CLIENTE__:.+/, '')
            .replace(/__DATOS_CRM__:.+/, '')
            .replace(/__DATOS_FISCALES__:.+/, '')
            .trim()

        let nombreCrm = 'Cliente WhatsApp', dispositivoCrm = 'PC/Laptop', fallaCrm = 'Soporte General', telefonoRealCrm = ''
        if (matchCrm) {
            const campos = matchCrm[1].split('|')
            if (campos[0]) nombreCrm = campos[0].trim()
            if (campos[1]) dispositivoCrm = campos[1].trim()
            if (campos[2]) fallaCrm = campos[2].trim()
            if (campos[3]) telefonoRealCrm = campos[3].trim().replace(/\D/g, '')
        }

        let reqFactura = 'NO', rfcCrm = '', nombreFiscalCrm = '', cpCrm = '', regimenCrm = '', usoCfdiCrm = '', correoCrm = ''
        if (matchFiscal) {
            const camposFiscales = matchFiscal[1].split('|')
            if (camposFiscales[0]) reqFactura = camposFiscales[0].trim().toUpperCase()
            if (camposFiscales[1]) rfcCrm = camposFiscales[1].trim().toUpperCase()
            if (camposFiscales[2]) nombreFiscalCrm = camposFiscales[2].trim().toUpperCase()
            if (camposFiscales[3]) cpCrm = camposFiscales[3].trim()
            if (camposFiscales[4]) regimenCrm = camposFiscales[4].trim()
            if (camposFiscales[5]) usoCfdiCrm = camposFiscales[5].trim()
            if (camposFiscales[6]) correoCrm = camposFiscales[6].trim()
        }

        const telefonoParaCita = (telefonoRealCrm && telefonoRealCrm.length >= 10) ? telefonoRealCrm.slice(-10) : telefono10Digitos

        if (nombreCrm.toLowerCase() === 'nombre' || nombreCrm.toLowerCase() === 'desconocido' || nombreCrm.includes('@')) {
            if (clientePrisma && clientePrisma.nombre && clientePrisma.nombre !== 'Desconocido' && clientePrisma.nombre !== 'Cliente WhatsApp') {
                nombreCrm = clientePrisma.nombre
            } else {
                nombreCrm = 'Cliente WhatsApp'
            }
        }

        if (dispositivoCrm.toLowerCase() === 'dispositivo' || dispositivoCrm.toLowerCase() === 'no especificado') dispositivoCrm = 'PC/Laptop'
        if (fallaCrm.toLowerCase() === 'falla' || fallaCrm.toLowerCase() === 'no especificada') fallaCrm = 'Soporte General'

        if (reqFactura.includes('REQUIEREFACTURA') || reqFactura !== 'SI') reqFactura = 'NO'
        if (rfcCrm.toLowerCase() === 'rfc' || rfcCrm.includes('RFC')) rfcCrm = ''
        if (nombreFiscalCrm.toLowerCase() === 'nombrefiscal' || nombreFiscalCrm.includes('NOMBREFISCAL')) nombreFiscalCrm = ''
        if (cpCrm.toLowerCase() === 'cp' || cpCrm.includes('CP')) cpCrm = ''
        if (usoCfdiCrm.toLowerCase() === 'usocfdi' || usoCfdiCrm.includes('USOCFDI')) usoCfdiCrm = ''
        if (correoCrm.toLowerCase() === 'correo' || correoCrm.includes('CORREO')) correoCrm = ''

        await registrarEnPrismaDB(telefonoParaCita, nombreCrm, mensajeCliente, respuestaWhatsApp)

        if (matchVisita) {
            tipoSoporteCalculado = 'Visita Física'
            const fechaExtraida = matchVisita[1].trim()
            const resultadoAgenda = await procesarCitaEnCalendar(telefonoParaCita, fechaExtraida, mensajeCliente, 'ENTREGA')

            if (resultadoAgenda.exitoso) {
                respuestaWhatsApp = `${respuestaWhatsApp}\n\n🎫 *Cita en Laboratorio Confirmada:* Tu espacio de recepción ha quedado reservado con éxito. ¡Te esperamos! 🛠⚙️`
                estatusLead = 'AGENDADO'
                await registrarCitaEnPrismaDB(telefonoParaCita, nombreCrm, 'Entrega Presencial en Laboratorio', fechaExtraida, 0, 'ENTREGA')
                await dispararAlertaInmediata(telefonoParaCita, 'AGENDADO', `${nombreCrm} agendó Visita Presencial`)
            } else {
                respuestaWhatsApp = `¡Hola! Detectamos que el horario solicitado se acaba de ocupar. ¿Tendrás algún otro espacio disponible libre?`
                estatusLead = 'POR_AGENDAR'
            }
        }

        if (matchRecoleccion) {
            tipoSoporteCalculado = 'Recolección'
            const fechaExtraida = matchRecoleccion[1].trim()
            const resultadoAgenda = await procesarCitaEnCalendar(telefonoParaCita, fechaExtraida, mensajeCliente, 'RECOLECCION')

            if (resultadoAgenda.exitoso) {
                respuestaWhatsApp = `${respuestaWhatsApp}\n\n📅 *Confirmación de Ruta:* He apartado tu espacio en nuestro sistema de logística. Por favor proporciónname tu dirección completa para activarla. 🚚`
                await registrarCitaEnPrismaDB(telefonoParaCita, nombreCrm, 'Pendiente de dirección', fechaExtraida, 0, 'RECOLECCION')
                estatusLead = 'POR_AGENDAR'
            } else {
                respuestaWhatsApp = `¡Hola! Ese horario en la ruta ya no tiene cupo. ¿Tendrás algún otro espacio libre?`
                estatusLead = 'POR_AGENDAR'
            }
        }

        if (matchDireccion) {
            tipoSoporteCalculado = 'Recolección'
            const direccionExtraida = matchDireccion[1].trim()
            const ultimaCitaPrisma = await prisma.cita.findFirst({ where: { telefono: telefonoParaCita }, orderBy: { createdAt: 'desc' } })

            if (ultimaCitaPrisma?.tipo === 'ENTREGA') {
                estatusLead = 'AGENDADO'
                tipoSoporteCalculado = 'Visita Física'
            } else {
                const kilometrosReal = await calcularDistanciaKm(direccionExtraida, apiKey)

                // 🚨 CASO A: Google Maps no pudo calcular la distancia (Error de API o dirección incomprensible)
                if (kilometrosReal === -1) {
                    respuestaWhatsApp = `¡Gracias por tu dirección! Un asesor humano la va a revisar manualmente en unos momentos para confirmar la ruta de recolección. Mientras tanto, tu espacio sigue apartado. 🙏`
                    estatusLead = 'REVISION_MANUAL'
                    await dispararAlertaInmediata(telefonoParaCita, '🔴', `Error al calcular distancia para: ${direccionExtraida}. Requiere aprobación manual de Julio.`)
                }
                // 🟢 CASO B: Está dentro del rango reglamentario
                else if (kilometrosReal <= RADIO_MAXIMO_KM) {
                    // ... (Tu código de éxito normal se mantiene aquí)
                    estatusLead = 'AGENDADO'
                }
                // 🟡 CASO C: Fuera de cobertura real (Más de 10km)
                else {
                    await eliminarCitaEnCalendar(telefonoParaCita)
                    respuestaWhatsApp = `¡Gracias por los datos! Sin embargo, nuestro sistema detectó que tu dirección se encuentra a ${kilometrosReal.toFixed(1)} km, lo cual supera nuestro rango máximo de recolección gratuita de **${RADIO_MAXIMO_KM} km**.\n\n💻 *¡Pero no te preocupes!* Podemos resolver tu problema hoy mismo de forma 100% remota y segura mediante *Google Remote Desktop* por solo $419 MXN neto, o si lo prefieres, recibirte directamente en nuestro laboratorio. ¿Cuál opción te acomoda mejor?`
                    estatusLead = 'FUERA_DE_COBERTURA'
                    await dispararAlertaInmediata(telefonoParaCita, 'FUERA_DE_COBERTURA', `${nombreCrm} fuera de rango (${kilometrosReal.toFixed(1)} km). Dirección: ${direccionExtraida}`)
                }
            }
        }

        historial.push({ role: 'model', parts: [{ text: respuestaWhatsApp }] })
        MEMORIA_CHAT.set(numeroCliente, historial)

        const exitoEnvio = await enviarMensajeWhatsApp(numeroCliente, respuestaWhatsApp)
        if (exitoEnvio) {
            const codigoFolio = ticketMasReciente?.numeroOrden || 'SOL-REM-PENDIENTE'
            const compendioFalla = `${dispositivoCrm} / ${fallaCrm}`

            let totalCobrado = ""
            let montoNeto = ""
            let ivaCalculado = ""

            if (tipoSoporteCalculado === 'Remoto') {
                totalCobrado = "419.00"
                montoNeto = "361.21"
                ivaCalculado = "57.79"
            } else if (ticketMasReciente?.costoReparacion) {
                const costoTotal = parseFloat(ticketMasReciente.costoReparacion)
                if (!isNaN(costoTotal)) {
                    totalCobrado = costoTotal.toFixed(2)
                    const neto = costoTotal / 1.16
                    montoNeto = neto.toFixed(2)
                    ivaCalculado = (costoTotal - neto).toFixed(2)
                }
            } else {
                totalCobrado = "Por cotizar"
                montoNeto = "Pendiente"
                ivaCalculado = "Pendiente"
            }

            const estatusSatCalculado = reqFactura === 'SI' ? 'PENDIENTE TIMBRADO' : 'NO REQUIERE'

            await registrarHistorialEnHoja1(telefonoParaCita, mensajeCliente, respuestaWhatsApp, estatusLead, nombreCrm, dispositivoCrm, fallaCrm)

            await registrarFinanzasEnFacturacion(
                codigoFolio, telefonoParaCita, nombreCrm, tipoSoporteCalculado, compendioFalla, estatusLead,
                reqFactura, rfcCrm, nombreFiscalCrm, cpCrm, regimenCrm, usoCfdiCrm, correoCrm,
                montoNeto, ivaCalculado, totalCobrado, estatusSatCalculado
            )
        }
    } catch (error: any) {
        console.error('🔴 Error bloque salida total:', error.message)
    }
}

// 🌐 MÉTODO GET: Validador Oficial de Webhooks exigido por Meta
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const mode = searchParams.get('hub.mode')
        const token = searchParams.get('hub.verify_token')
        const challenge = searchParams.get('hub.challenge')

        const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN

        if (mode && token) {
            if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                console.log('✅ [META WEBHOOK]: Conexión y Token validados con éxito.');
                return new Response(challenge, { status: 200 })
            } else {
                return new Response('Forbidden', { status: 403 })
            }
        }
        return new Response('Bad Request', { status: 400 })
    } catch (error: any) {
        return new Response('Error', { status: 500 })
    }
}

// 📥 MÉTODO POST: Receptor de Mensajes de WhatsApp desde la Nube de Meta
export async function POST(req: Request) {
    try {
        const body = await req.json()

        // 🛡️ Filtro 1: Validamos que el payload provenga del ecosistema comercial de WhatsApp
        if (body.object !== 'whatsapp_business_account') {
            return new Response('Ignorado', { status: 200 })
        }

        const entry = body.entry?.[0]
        const change = entry?.changes?.[0]
        const value = change?.value

        // 🛡️ Filtro 2: Ignorar si es una actualización de estatus (sent, delivered, read) o está vacío
        if (!value || !value.messages || value.messages.length === 0) {
            return new Response('Ignorado Estatus', { status: 200 })
        }

        const message = value.messages[0]

        // 🛡️ Filtro 3: Validamos que sea exclusivamente un mensaje de texto para no romper a Gemini
        if (message.type !== 'text') {
            return new Response('Ignorado Multimedia', { status: 200 })
        }

        const mensajeCliente = message.text?.body
        const numeroCliente = message.from // Meta nos da la cadena limpia (ej: "525546088200")

        // 🛡️ Filtro 4: Evitamos el eco infinito si nos llega a escribir el mismo número del bot
        if (numeroCliente.includes('5546088200')) {
            return new Response('Eco Ignorado', { status: 200 })
        }

        if (mensajeCliente && numeroCliente) {
            console.log(`📥 [WEBHOOK RECIBIDO]: De: ${numeroCliente} | Texto: "${mensajeCliente}"`);
            await ejecutarLogicaIA(mensajeCliente, numeroCliente)
        }

        return new Response('Processed', { status: 200 })
    } catch (error: any) {
        console.error('🔴 Error en Receptor Webhook Meta:', error.message)
        return new Response('Error', { status: 500 })
    }
}