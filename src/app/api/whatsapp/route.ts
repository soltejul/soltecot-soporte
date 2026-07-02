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

// 🔐 FUNCIÓN AUXILIAR: Autenticación centralizada mediante Variable de Entorno (Evita errores ENOENT)
function obtenerAuthGoogle(scopes: string[]) {
    const credencialesRaw = process.env.GOOGLE_APPLICATION_CREDENTIALS
    if (!credencialesRaw) {
        throw new Error('🔴 [CRÍTICO]: La variable GOOGLE_APPLICATION_CREDENTIALS no está configurada en el entorno.')
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
        console.log(`🐘 [PRISMA]: Cita [${tipo}] guardada exitosamente con el teléfono de contacto: ${telefono}`)
    } catch (error: any) {
        console.error('🔴 [PRISMA ERROR CITA]:', error.message)
    }
}

async function registrarEnGoogleSheets(
    folio: string,
    telefono: string,
    nombre: string,
    tipoSoporte: string,
    dispositivoFalla: string,
    status: string,
    reqFactura: string,
    rfc: string,
    nombreFiscal: string,
    cp: string,
    regimen: string,
    usoCfdi: string,
    correo: string,
    montoNeto: string,
    iva: string,
    totalCobrado: string,
    estatusSat: string
) {
    try {
        // Usa la función centralizada y segura
        const auth = obtenerAuthGoogle(['https://www.googleapis.com/auth/spreadsheets'])
        const sheets = google.sheets({ version: 'v4', auth })
        const fechaActual = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })

        const valoresFila = [
            folio,
            fechaActual,
            nombre,
            telefono,
            tipoSoporte,
            dispositivoFalla,
            status,
            reqFactura,
            rfc,
            nombreFiscal,
            cp,
            regimen,
            usoCfdi,
            correo,
            montoNeto,
            iva,
            totalCobrado,
            estatusSat,
            ""
        ]

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Facturación!A:S',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [valoresFila] }
        })
    } catch (error: any) {
        console.error('🔴 Error Sheets Facturación Avanzada:', error.message)
    }
}

async function procesarCitaEnCalendar(telefono: string, fechaIso: string, mensajeCliente: string, tipo: 'ENTREGA' | 'RECOLECCION') {
    try {
        // Usa la función centralizada y segura
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
        // Usa la función centralizada y segura
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
            include: {
                tickets: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        })

        ticketMasReciente = clientePrisma?.tickets[0]

        const regexCodigoRemoto = /\b\d{4}\s?\d{4}\s?\d{4}\b|\b\d{12}\b/
        if (regexCodigoRemoto.test(textoNormalizado)) {
            const codigoEncontrado = mensajeCliente.match(regexCodigoRemoto)![0].replace(/\s/g, '')

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

            const codigoFormateado = `${codigoEncontrado.slice(0, 4)}-${codigoEncontrado.slice(4, 8)}-${codigoEncontrado.slice(8, 12)}`
            await dispararAlertaInmediata(
                telefono10Digitos,
                'EN_REPARACION',
                `🖥️ *SESIÓN REMOTA EN ESPERA*\n• *Cliente:* ${clientePrisma?.nombre || 'Particular'}\n• *Equipo:* ${ticketMasReciente?.equipo || 'PC/Laptop'}\n👉 *CÓDIGO DE CONEXIÓN:* ${codigoFormateado}\n\nCopialo y entra desde tu MacNeo a: https://remotedesktop.google.com/support`
            )
            return
        }

        if (ticketMasReciente && ticketMasReciente.estado === 'ESPERANDO_APROBACION') {
            if (textoNormalizado === 'aceptar' || textoNormalizado === 'acepto' || textoNormalizado === 'autorizar') {
                await prisma.ticket.update({
                    where: { id: ticketMasReciente.id },
                    data: { estado: 'EN_REPARACION' }
                })

                const anticipo = (ticketMasReciente.costoReparacion || 0) * 0.50
                const mensajeAceptacion = `✨ *¡Excelente decisión, ${clientePrisma?.nombre || 'Cliente'}!* ✨\n\nHemos registrado tu autorización para proceder con la reparación de tu *${ticketMasReciente.equipo}* (Orden: ${ticketMasReciente.numeroOrden}).\n\n💳 *Instrucciones de Prepago (50%):*\nPara activar las órdenes de refacciones y asignarle prioridad en el banco de trabajo, es necesario realizar el depósito del anticipo reglamentario:\n👉 *Monto del Anticipo:* $${anticipo.toFixed(2)} MXN\n\n🏦 *Datos Bancarios Oficiales:* \n• *Banco:* BBVA\n• *Cuenta CLABE:* 0121 8001 2345 6789 01\n• *Beneficiario:* Solutions & Technology On Time\n• *Concepto/Referencia:* ${ticketMasReciente.numeroOrden}\n\n🙏 Una vez realizado el movimiento, por favor compártenos el comprobante por aquí para validar tu pago y arrancar el microscopio de inmediato. 🔬`

                await enviarMensajeWhatsApp(numeroCliente, mensajeAceptacion)
                await dispararAlertaInmediata(telefono10Digitos, 'EN_REPARACION', `✅ ¡Presupuesto Aceptado! El cliente autorizó la orden ${ticketMasReciente.numeroOrden}. Anticipo requerido: $${anticipo}`)
                return
            }

            if (textoNormalizado === 'rechazar' || textoNormalizado === 'rechazo' || textoNormalizado === 'cancelar') {
                await prisma.ticket.update({
                    where: { id: ticketMasReciente.id },
                    data: { estado: 'RECHAZADO' }
                })

                const mensajeRechazo = `⚙️ *SOLTECOT_ INFORMA* ⚙️\n\nEntendemos perfectamente, *${clientePrisma?.nombre || 'Cliente'}*. Hemos registrado el rechazo del presupuesto para la orden *${ticketMasReciente.numeroOrden}*.\n\n📦 *Próximos Pasos:*\nLa reparación no procederá. Nuestro equipo técnico reensamblará tu *${ticketMasReciente.equipo}* para dejarlo en las mismas condiciones mecánicas en que ingresó. Te notificaremos en cuanto esté listo para que pases a recogerlo a nuestras instalaciones.\n\n¡Gracias por tu confianza y tiempo! 🔬`

                await enviarMensajeWhatsApp(numeroCliente, mensajeRechazo)
                await dispararAlertaInmediata(telefono10Digitos, 'RECHAZADO', `❌ Presupuesto CVancelado. El cliente rechazó la orden ${ticketMasReciente.numeroOrden}. El equipo regresa a ensamblaje de devolución.`)
                return
            }
        }

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
                    systemInstruction: `Eres el Agente de IA oficial de Soltecot_ (Solutions & Technology On Time) en WhatsApp. Atiendes la recepción de un laboratorio de reparación de computadoras y laptops. Tu objetivo es guiar al cliente de manera clara y profesional para agendar citas de entrega o recolección, y extraer información relevante para el CRM. Debes mantener un tono cordial, profesional y empático, evitando tecnicismos innecesarios.
                    
📅 HOY ES: ${fechaHoyString}.
📍 DIRECCIÓN FÍSICA: ${DIRECCION_TEXTUAL}
🗺️ GOOGLE MAPS: ${LINK_GOOGLE_MAPS}

MODALIDADES DE ATENCIÓN DISPONIBLES:
1. VISITA DIRECTA AL LABORATORIO: De lunes a viernes (10 AM a 6 PM) y sábados (10 AM a 2 PM). El cliente viene en persona.
2. SERVICIO DE RECOLECCIÓN A DOMICILIO: Sábados y domingos (Radio máximo 10km).
3. 🖥️ SOPORTE TÉCNICO REMOTO INMEDIATO (NUEVO): Ideal para problemas de software, optimización, eliminación de virus o instalación de paqueterías. Se realiza de forma 100% segura mediante Google Remote Desktop sin que el cliente salga de casa.

💰 TARIFAS Y TRANSPARENCIA FISCAL (SOPORTE REMOTO):
- Al informar sobre el costo del Soporte Técnico Remoto, sé directo y transparente: La tarifa fija es de $419 MXN. 
- REGLA ESTRICTA RESICO: Todos nuestros precios YA INCLUYEN IVA. Si el cliente pregunta por factura, dile con total seguridad: "¡Por supuesto! En Soltecot_ somos un laboratorio formalizado y emitimos factura fiscal CFDI 4.0 en todos nuestros servicios, el precio ya incluye el 16% de IVA."
- Si solicitan factura, indícales: "Con gusto. Al finalizar y liquidar tu soporte, puedes enviarme por este chat tu Constancia de Situación Fiscal en PDF, tu correo electrónico y el Uso de CFDI, y tu factura te llegará en menos de 24 horas."

🚨 REGLA DE TRIAGE REMOTO Y EXTRACCIÓN DE CÓDIGO:
- Si el problema del cliente es puramente de Software/Sistemas o lentitud, ofrécéle de inmediato el *Soporte Técnico Remoto*. 
- Si el cliente acepta la sesión remota, indícale de forma muy clara y amable los siguientes pasos exactos:
  1. Entrar desde su computadora a: https://remotedesktop.google.com/support
  2. Hacer clic en "Asistencia remota" y descargar la pequeña herramienta oficial de Google.
  3. Darle clic al botón "+ Generar código" y enviarte los 12 dígitos resultantes por este chat para que el Ingeniero Julio se conecte de inmediato.
- FILTRO ESTRICTO DE CÓDIGO: El código de acceso de Google consta exactamente de 12 dígitos numéricos continuos (ej: 949643192295). Si detectas un bloque de 12 números en el mensaje del usuario, sin importar si viene acompañado de saludos o texto extra, extráelo inmediatamente como el código de acceso legítimo y pasa de inmediato al formato de confirmación final. No se lo vuelvas a solicitar.

🚨 REGLA DE ORO DE CAPTURA (OBLIGATORIA):
- Solicita SIEMPRE el Nombre Completo y un número de teléfono de 10 dígitos para aperturar su folio de servicio técnico en el sistema, sea físico o remoto.

⚠️ REGLA DE SEGURIDAD CONVERSACIONAL (PROHIBIDO PLACEHOLDERS FANTASMA):
- NUNCA uses la palabra literal "Nombre" o cadenas como "[Nombre del Cliente]" in tus respuestas finales como marcador de posición. Si lograste extraer el nombre del cliente (ej: Pedro), úsalo. Si no tienes certeza de su nombre o el usuario no lo ha provisto, utiliza expresiones amables y genéricas como "estimado cliente", "amigo", o simplemente omítelo con un "¡Perfecto!" o "Excelente", pero jamás envíes una plantilla rota con texto técnico expuesto.

🚨 CONFIRMACIÓN FINAL DE CONEXIÓN REMOTA:
En cuanto recibas y valides los 12 dígitos del código de Google Remote Desktop, debes confirmar el inicio del enlace técnico con esta estructura estricta, formal y profesional (adaptando el nombre si lo tienes):
"⚡ SISTEMA SOLTECOT_ REMOTO ⚡
-----------------------------------------
¡Código de acceso recibido con éxito!
• Folio Temporal: SOL-REM-PENDIENTE
• Técnico Asignado: Ing. Julio López

El Ingeniero Julio ha recibido la alerta en su banco de trabajo doméstico y se está enlazando a tu computadora en este momento vía Google Remote Desktop. Por favor, mantén tu pantalla activa y acepta la solicitud de entrada en tu monitor. 🔬💻"

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
                await dispararAlertaInmediata(telefonoParaCita, 'AGENDADO', `${nombreCrm} agendó Visita Presencial para ${dispositivoCrm}`)
            } else {
                respuestaWhatsApp = `¡Hola, ${nombreCrm}! Disculpa la interrupción. Al intentar asegurar tu folio en nuestro sistema, detectamos que el horario de las **${new Date(fechaExtraida).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' })}** para tu visita al laboratorio se acaba de ocupar.\n\n⏳ ¿Tendrás algún otro horario disponible entre semana (10 AM a 6 PM) o el sábado antes de las 2 PM para asignarte un espacio libre?`
                estatusLead = 'POR_AGENDAR'
            }
        }

        if (matchRecoleccion) {
            tipoSoporteCalculado = 'Recolección'
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
            tipoSoporteCalculado = 'Recolección'
            const direccionExtraida = matchDireccion[1].trim()

            const ultimaCitaPrisma = await prisma.cita.findFirst({
                where: { telefono: telefonoParaCita },
                orderBy: { createdAt: 'desc' }
            })

            const tipoCitaActual = ultimaCitaPrisma?.tipo || 'RECOLECCION'

            if (tipoCitaActual === 'ENTREGA') {
                estatusLead = 'AGENDADO'
                tipoSoporteCalculado = 'Visita Física'
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
                codigoFolio,
                telefonoParaCita,
                nombreCrm,
                tipoSoporteCalculado,
                compendioFalla,
                estatusLead,
                reqFactura,
                rfcCrm,
                nombreFiscalCrm,
                cpCrm,
                regimenCrm,
                usoCfdiCrm,
                correoCrm,
                montoNeto,
                ivaCalculado,
                totalCobrado,
                estatusSatCalculado
            )
        }
    } catch (error: any) {
        console.error('🔴 Error bloque salida total:', error.message)
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