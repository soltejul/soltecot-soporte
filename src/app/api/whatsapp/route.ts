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
    } catch (error: any) {
        console.error('🔴 [PRISMA ERROR CITA]:', error.message)
    }
}

async function registrarEnGoogleSheets(
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
            spreadsheetId: SPREADSHEET_ID, range: 'Facturación!A:S',
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

async function eliminarCitaEnCalendar(eventId: string) {
    try {
        const auth = obtenerAuthGoogle(['https://www.googleapis.com/auth/calendar'])
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
    let ticketMasReciente: any = null

    try {
        const clientePrisma = await prisma.cliente.findFirst({
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

        // 🖥️ 1. INTERCEPTOR INTELIGENTE AUTOMATIZADO CON PARCHE DE MEMORIA V2
        const regexCodigoRemoto = /\b\d{4}\s?\d{4}\s?\d{4}\b|\b\d{12}\b/
        if (regexCodigoRemoto.test(textoNormalizado)) {
            const codigoEncontrado = mensajeCliente.match(regexCodigoRemoto)![0].replace(/\s/g, '')

            if (ticketMasReciente) {
                await prisma.ticket.update({
                    where: { id: ticketMasReciente.id },
                    data: { estado: 'EN_REPARACION', notasInternas: `[SESIÓN REMOTA] Código: ${codigoEncontrado}` }
                })
            }

            // ⚡ CORRECCIÓN: Quitamos el placeholder roto "Nombre" e inyectamos el nombre real dinámico
            const nombreClienteEstetico = clientePrisma?.nombre && clientePrisma.nombre !== 'Desconocido' ? clientePrisma.nombre : 'amigo'

            const mensajeConexion = `⚡ *SISTEMA SOLTECOT_ REMOTO* ⚡\n\n¡Código de acceso recibido con éxito, *${nombreClienteEstetico}*!\n\nEl Ingeniero Julio ha recibido la alerta en el Centro de Control y se está enlazando a tu equipo en este momento vía *Google Remote Desktop*.\n\n💻 *Por favor, mantén abierta tu ventana del navegador y no cierres el código.* Verás la actividad de soporte técnico en tu pantalla en unos segundos. 🔬`

            await enviarMensajeWhatsApp(numeroCliente, mensajeConexion)

            // 🔥 PARCHE DE MEMORIA: Guardamos esta interacción en el historial para que Gemini sepa que ya te conectaste
            let historialLocal = MEMORIA_CHAT.get(numeroCliente) || []
            historialLocal.push({ role: 'user', parts: [{ text: mensajeCliente }] })
            historialLocal.push({ role: 'model', parts: [{ text: mensajeConexion }] })
            if (historialLocal.length > 12) historialLocal = historialLocal.slice(-12)
            MEMORIA_CHAT.set(numeroCliente, historialLocal)

            // 🚀 REGISTRO EN SHEETS DESDE EL INTERCEPTOR PARA NO PERDER LA FILA EN SOPORTES EXPRESS
            const codigoFolio = ticketMasReciente?.numeroOrden || 'SOL-REM-PENDIENTE'
            await registrarEnGoogleSheets(
                codigoFolio,
                telefono10Digitos, // <- Cambio aquí
                nombreClienteEstetico,
                'Remoto',
                ticketMasReciente?.equipo || 'Instalación de Software / Soporte Express',
                'EN_REPARACION',
                'NO',
                '', '', '', '', '', '',
                '361.21',
                '57.79',
                '419.00',
                'NO REQUIERE'
            )

            const codigoFormateado = `${codigoEncontrado.slice(0, 4)}-${codigoEncontrado.slice(4, 8)}-${codigoEncontrado.slice(8, 12)}`
            await dispararAlertaInmediata(telefono10Digitos, 'EN_REPARACION', `🖥️ *SESIÓN REMOTA EN ESPERA*\n• *Cliente:* ${nombreClienteEstetico}\n👉 *CÓDIGO:* ${codigoFormateado}\n\nEntra desde tu MacNeo a: https://remotedesktop.google.com/support`)
            return
        }

        if (ticketMasReciente && ticketMasReciente.estado === 'ESPERANDO_APROBACION') {
            if (textoNormalizado === 'aceptar' || textoNormalizado === 'acepto' || textoNormalizado === 'autorizar') {
                await prisma.ticket.update({ where: { id: ticketMasReciente.id }, data: { estado: 'EN_REPARACION' } })
                const anticipo = (ticketMasReciente.costoReparacion || 0) * 0.50
                const mensajeAceptacion = `✨ *¡Excelente decisión, ${clientePrisma?.nombre || 'Cliente'}!* ✨\n\nHemos registrado tu autorización para proceder con la reparación de tu *${ticketMasReciente.equipo}* (Orden: ${ticketMasReciente.numeroOrden}).\n\n💳 *Instrucciones de Prepago (50%):*\nPara activar las órdenes de refacciones y asignarle prioridad en el banco de trabajo, es necesario realizar el depósito del anticipo reglamentario:\n👉 *Monto del Anticipo:* $${anticipo.toFixed(2)} MXN\n\n🏦 *Datos Bancarios Oficiales:* \n• *Banco:* BBVA\n• *Cuenta CLABE:* 0121 8001 2345 6789 01\n• *Beneficiario:* Solutions & Technology On Time\n• *Concepto/Referencia:* ${ticketMasReciente.numeroOrden}\n\n🙏 Una vez realizado el movimiento, por favor compártenos el comprobante por aquí para validar tu pago y arrancar el microscopio de inmediato. 🔬`
                await enviarMensajeWhatsApp(numeroCliente, mensajeAceptacion)
                await dispararAlertaInmediata(telefono10Digitos, 'EN_REPARACION', `✅ ¡Presupuesto Aceptado! Orden ${ticketMasReciente.numeroOrden}. Anticipo: $${anticipo}`)
                return
            }

            if (textoNormalizado === 'rechazar' || textoNormalizado === 'rechazo' || textoNormalizado === 'cancelar') {
                await prisma.ticket.update({ where: { id: ticketMasReciente.id }, data: { estado: 'RECHAZADO' } })
                const mensajeRechazo = `⚙️ *SOLTECOT_ INFORMA* ⚙️\n\nEntendemos perfectamente, *${clientePrisma?.nombre || 'Cliente'}*. Hemos registrado el rechazo del presupuesto para la orden *${ticketMasReciente.numeroOrden}*.\n\n📦 *Próximos Pasos:*\nLa reparación no procederá. Nuestro equipo técnico reensamblará tu *${ticketMasReciente.equipo}* para dejarlo en las mismas condiciones mecánicas en que ingresó. Te notificaremos en cuanto esté listo para que pases a recogerlo a nuestras instalaciones.\n\n¡Gracias por tu confianza y tiempo! 🔬`
                await enviarMensajeWhatsApp(numeroCliente, mensajeRechazo)
                await dispararAlertaInmediata(telefono10Digitos, 'RECHAZADO', `❌ Presupuesto Rechazado. La orden ${ticketMasReciente.numeroOrden} regresa a ensamblaje de devolución.`)
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
                    systemInstruction: `Eres el Agente de IA oficial de Soltecot_ (Solutions & Technology On Time) en WhatsApp. Atiendes la recepción de un laboratorio de reparación de computadoras y laptops. Tu objetivo es guiar al cliente de manera clara y profesional para agendar citas de entrega o recolección, y extraer información relevante para el CRM. Debes mantener un tono cordial, profesional y empático, evitando tecnicismos innecesarios.
                    
📅 HOY ES: ${fechaHoyString}.
📍 DIRECCIÓN FÍSICA: ${DIRECCION_TEXTUAL}
🗺️ GOOGLE MAPS: ${LINK_GOOGLE_MAPS}

MODALIDADES DE ATENCIÓN DISPONIBLES:
1. VISITA DIRECTA AL LABORATORIO: De lunes a viernes (10 AM a 6 PM) y sábados (10 AM a 2 PM). El cliente viene en persona.
2. SERVICIO DE RECOLECCIÓN A DOMICILIO: Sábados y domingos (Radio máximo 10km).
3. 🖥️ SOPORTE TÉCNICO REMOTO INMEDIATO (NUEVO): Ideal para problemas de software, optimización, eliminación de virus o instalación de paqueterías. Se realiza de forma 100% segura mediante Google Remote Desktop sin que el cliente salga de casa.

💰 TARIFAS Y TRANSPARENCIA FISCAL (SOPORTE REMOTO):
- La tarifa fija de Soporte Remoto es de $419 MXN neto.
- REGLA ESTRICTA RESICO: Todos nuestros precios YA INCLUYEN IVA. Si el cliente pregunta por factura, dile con total seguridad: "¡Por supuesto! En Soltecot_ somos un laboratorio formalizado y emitimos factura fiscal CFDI 4.0 en todos nuestros servicios, el precio ya incluye el 16% de IVA."

🚨 FLUJO SECUENCIAL DE APERTURA (OBLIGATORIO PASO A PASO):
- PASO 1 (Datos Básicos): Cuando el cliente acepte el servicio técnico (remoto o físico), solicítale únicamente su Nombre Completo, confirme su Teléfono y añade la pregunta cerrada: "¿Requieres factura fiscal CFDI 4.0 para tu servicio? (Por favor responde únicamente SÍ o NO)".
- PASO 2 (Bifurcación Fiscal):
  • Si el cliente responde "NO" o indica que no requiere factura: Pasa directamente a entregarle las instrucciones de soporte técnico (Pasos de Google Remote Desktop si es remoto, o confirmación de cita si es físico). Envía la etiqueta: __DATOS_FISCALES__:NO||||||
  • Si el cliente responde "SÍ" o solicita factura: Pasa a pedirle amablemente sus datos fiscales (RFC, Nombre Fiscal, CP, Régimen, Uso de CFDI y Correo) o indícale que puede adjuntar su Constancia de Situación Fiscal en PDF. Una vez que te provea los datos, entrégale las instrucciones de conexión de Google Remote Desktop.

🚨 REGLA DE TRIAGE REMOTO:
- Si acepta la sesión remota e indica los datos, guíalo con los pasos de Google Remote Desktop:
  1. Entrar desde su computadora a: https://remotedesktop.google.com/support
  2. Descargar la herramienta en "Asistencia remota".
  3. Hacer clic en "+ Generar código" y pasarte los 12 dígitos.

⚠️ CONDUCTA POST-CONEXIÓN:
- Si en el historial de chat ves que ya se envió el mensaje de conexión exitosa ("⚡ SISTEMA SOLTECOT_ REMOTO ⚡") y el cliente dice cosas como "listo gracias", "entendido", u oraciones cortas afirmativas, significa que el Ingeniero Julio ya está enlazado a su monitor. Respóndele de forma humana y atenta: "¡De nada! El Ingeniero Julio ya se encuentra trabajando en tu equipo en este momento. Mantén tu pantalla activa y en cuanto finalice la instalación/reparación, te lo notificaremos de inmediato por este chat. ¡Gracias por tu confianza!"

🚨 REGLA DE ORO DE ETIQUETAS:
- Si coordinan visita física: __AGENDAR_VISITA__:AAAA-MM-DDTHH:MM:00
- Si coordinan recolección física: __AGENDAR_RECOLECCION__:AAAA-MM-DDTHH:MM:00
- Si te da su dirección de ruta: __DIRECCION_CLIENTE__:[dirección limpia]
                    
📊 EXTRAER ATRIBUTOS CRM Y DATOS FISCALES AMPLIADOS:
Añade siempre al final de cada respuesta dos bloques estructurados:
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

        let nombreCrm = 'Desconocido', dispositivoCrm = 'No especificado', fallaCrm = 'No especificada', telefonoRealCrm = ''
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

        const telefonoParaCita = (telefonoRealCrm && telefonoRealCrm.length >= 10) ? telefonoRealCrm.slice(-10) : numeroCliente

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
                respuestaWhatsApp = `¡Hola, ${nombreCrm}! Detectamos que el horario solicitado se acaba de ocupar. ¿Tendrás algún otro espacio disponible libre?`
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
                respuestaWhatsApp = `¡Hola, ${nombreCrm}! Ese horario en la ruta ya no tiene cupo. ¿Tendrás algún otro espacio libre?`
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
                if (kilometrosReal !== -1 && kilometrosReal <= RADIO_MAXIMO_KM) {
                    respuestaWhatsApp = `${respuestaWhatsApp}\n\n📍 *Rango de Cobertura Válido:* Tu domicilio se encuentra a *${kilometrosReal.toFixed(1)} km*, dentro del rango operativo. 🚚💨`
                    estatusLead = 'AGENDADO'
                    if (ultimaCitaPrisma && ultimaCitaPrisma.tipo === 'RECOLECCION') {
                        await prisma.cita.update({ where: { id: ultimaCitaPrisma.id }, data: { direccion: direccionExtraida, distanciaKm: kilometrosReal, estado: 'PENDIENTE' } })
                    }
                    await dispararAlertaInmediata(telefonoParaCita, 'AGENDADO', `${nombreCrm} agendó Recolección en: ${direccionExtraida}`)
                } else {
                    respuestaWhatsApp = `Tu dirección se encuentra fuera de nuestro límite de **${RADIO_MAXIMO_KM} km**. Con gusto te recibimos presencialmente en el laboratorio. 🛠️`
                    estatusLead = 'FUERA_DE_COBERTURA'
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

            await registrarEnGoogleSheets(
                codigoFolio, telefonoParaCita, nombreCrm, tipoSoporteCalculado, compendioFalla, estatusLead,
                reqFactura, rfcCrm, nombreFiscalCrm, cpCrm, regimenCrm, usoCfdiCrm, correoCrm,
                montoNeto, ivaCalculado, totalCobrado, estatusSatCalculado
            )
        }
    } catch (error: any) {
        console.error('🔴 Error bloque salida total:', error.message)
    }
}

export async function POST(req: Request) {
    try {
        const event = await req.json()
        if (event.type !== 'message' || !event.data || event.data.type !== 'chat') return new Response('Ignorado', { status: 200 })
        if (event.data.fromMe === true || event.data.from.includes('5546088200')) return new Response('Eco Ignorado', { status: 200 })
        await ejecutarLogicaIA(event.data.body, event.data.from)
        return new Response('Processed', { status: 200 })
    } catch (error) {
        return new Response('Error', { status: 500 })
    }
}