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
    const CHAT_WEBHOOK_URL = process.env.GOOGLE_CHAT_WEBHOOK || '';
    if (!CHAT_WEBHOOK_URL) return;

    try {
        const cliente = await prisma.cliente.findFirst({
            where: {
                OR: [
                    { telefono: telefono },
                    { telefono: { endsWith: telefono.slice(-10) } }
                ]
            }
        });

        let icono = '🟢';
        if (estatus.includes('SOS') || estatus.includes('MANUAL')) icono = '🚨';
        if (estatus === 'FUERA_DE_COBERTURA') icono = '🟡';
        if (estatus === 'EN_REPARACION') icono = '⚡';

        const textoAlerta = `${icono} *¡ALERTA SOLTECOT_!*\n*Estatus:* ${estatus}\n*Cliente:* ${telefono}\n*Detalles:* ${detalles}\n\n👉 _Responde incluyendo el teléfono para asegurar el tiro, ej: @soltemsg __REACTIVAR__ ${telefono.slice(-10)} __COT_950___`;

        const payload: any = { text: textoAlerta };

        if (cliente?.googleChatThreadId) {
            payload.thread = { name: `spaces/AAQAIpXMCK0/threads/${cliente.googleChatThreadId}` };
        }

        console.log(`📡 [GOOGLE CHAT]: Despachando alerta hacia Google...`);
        let respuestaGoogle = await fetch(CHAT_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify(payload)
        });

        if (!respuestaGoogle.ok) {
            respuestaGoogle = await fetch(CHAT_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                body: JSON.stringify({ text: textoAlerta })
            });
        }

        if (respuestaGoogle.ok) {
            const datosRespuesta = await respuestaGoogle.json();
            const threadNameFull = datosRespuesta?.thread?.name;

            if (threadNameFull) {
                const threadIdCorto = threadNameFull.split('/').pop();
                if (threadIdCorto && cliente) {
                    await prisma.cliente.update({
                        where: { id: cliente.id },
                        data: { googleChatThreadId: threadIdCorto }
                    });
                    console.log(`🚀 [NEON CRITICAL SUCCESS]: Hilo nativo '${threadIdCorto}' guardado para ${cliente.telefono}`);
                }
            }
        }
    } catch (error: any) {
        console.error('🔴 Error Crítico en dispararAlertaInmediata:', error.message)
    }
}

async function registrarEnPrismaDB(telefono: string, nombre: string, mensaje: string, respuesta: string) {
    try {
        return await prisma.cliente.upsert({
            where: { telefono: telefono },
            update: { nombre: nombre !== 'Desconocido' && nombre !== 'Cliente WhatsApp' ? nombre : undefined },
            create: { telefono: telefono, nombre: nombre }
        })
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

        const respuestaSábana = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID, range: "'Facturación'!A:A"
        })

        const filasExistentes = respuestaSábana.data.values || []
        let numeroDeFilaDestino = -1

        for (let i = 0; i < filasExistentes.length; i++) {
            if (filasExistentes[i][0] === folio) {
                numeroDeFilaDestino = i + 1
                break
            }
        }

        if (numeroDeFilaDestino !== -1) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID, range: `'Facturación'!A${numeroDeFilaDestino}:S${numeroDeFilaDestino}`,
                valueInputOption: 'USER_ENTERED', requestBody: { values: [valoresFila] }
            })
        } else {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID, range: "'Facturación'!A:S",
                valueInputOption: 'USER_ENTERED', requestBody: { values: [valoresFila] }
            })
        }
    } catch (error: any) {
        console.error('🔴 Error Sheets Facturación Avanzada:', error.message)
    }
}

async function procesarCitaEnCalendar(telefono: string, fechaIso: string, mensajeCliente: string, tipo: 'ENTREGA' | 'RECOLECCION') {
    try {
        const auth = obtenerAuthGoogle(['https://www.googleapis.com/auth/calendar'])
        const calendar = google.calendar({ version: 'v3', auth })

        // 🇲🇽 SELLO HORARIO MÉXICO: Si la fecha no trae offset, le inyectamos estrictamente el GMT-6
        const fechaConOffset = fechaIso.includes('-06:00') || fechaIso.includes('Z')
            ? fechaIso
            : `${fechaIso}-06:00`;

        const inicioCita = new Date(fechaConOffset)
        const finCita = new Date(inicioCita.getTime() + (60 * 60 * 1000))

        const listaEventos = await calendar.events.list({
            calendarId: CALENDAR_ID,
            timeMin: inicioCita.toISOString(),
            timeMax: finCita.toISOString(),
            singleEvents: true,
        })

        if (listaEventos.data.items && listaEventos.data.items.length > 0) {
            const yaAgendadoPorMismoCliente = listaEventos.data.items.some(evento => evento.summary?.includes(`[${telefono}]`))
            if (yaAgendadoPorMismoCliente) {
                return { exitoso: true, eventId: listaEventos.data.items[0].id, yaExistia: true }
            }
            return { exitoso: false, motivo: 'ocupado' }
        }

        const prefijo = tipo === 'RECOLECCION' ? '🚚 Recolección' : '🔬 Visita Laboratorio'

        const nuevoEvento = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            requestBody: {
                summary: `${prefijo} Soltecot_ [${telefono}]`,
                description: `Contacto: ${telefono}\nSolicitud: ${mensajeCliente}`,
                start: { dateTime: inicioCita.toISOString() }, // Google Calendar lee el string ISO absoluto con Z
                end: { dateTime: finCita.toISOString() },
            },
        })
        return { exitoso: true, eventId: nuevoEvento.data.id, yaExistia: false }
    } catch (error: any) {
        console.error('🔴 [CALENDAR CRITICAL ERROR]:', error.message);
        return { exitoso: false, motivo: 'error' }
    }
}

async function eliminarCitaEnCalendar(telefono: string) {
    try {
        const auth = obtenerAuthGoogle(['https://www.googleapis.com/auth/calendar'])
        const calendar = google.calendar({ version: 'v3', auth })
        const tiempoMinimo = new Date().toISOString()

        const listaEventos = await calendar.events.list({
            calendarId: CALENDAR_ID, q: telefono, timeMin: tiempoMinimo, singleEvents: true
        })

        if (listaEventos.data.items && listaEventos.data.items.length > 0) {
            for (const evento of listaEventos.data.items) {
                if (evento.id && evento.summary?.includes('Recolección')) {
                    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: evento.id })
                    console.log(`🗑️ [GOOGLE CALENDAR]: Evento cancelado para: ${telefono}`)
                }
            }
        }
    } catch (error: any) {
        console.error('🔴 Error en Calendar:', error.message)
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

        if (clientePrisma && clientePrisma.atendidoPorBot === false) {
            console.log(`👤 [HUMAN TAKEOVER]: El bot está silenciado para el cliente ${telefono10Digitos}.`);
            return;
        }

        const regexCodigoRemoto = /\b\d{4}\s?\d{4}\s?\d{4}\b|\b\d{12}\b/
        if (regexCodigoRemoto.test(textoNormalizado)) {
            const codigoEncontrado = mensajeCliente.match(regexCodigoRemoto)![0].replace(/\s/g, '')

            const clienteExpress = await prisma.cliente.upsert({
                where: { telefono: telefono10Digitos },
                update: {},
                create: { telefono: telefono10Digitos, nombre: 'Cliente WhatsApp', atendidoPorBot: true }
            })

            let clienteIdParaTicket = clienteExpress.id
            let nombreClienteEstetico = clienteExpress.nombre && clienteExpress.nombre !== 'Desconocido' && clienteExpress.nombre !== 'Cliente WhatsApp'
                ? clienteExpress.nombre : 'Cliente WhatsApp'

            let ticketActivo = ticketMasReciente
            if (!ticketActivo || ticketActivo.estado === 'ENTREGADO' || ticketActivo.estado === 'RECHAZADO') {
                const ultimoTicketGlobal = await prisma.ticket.findFirst({ orderBy: { createdAt: 'desc' }, select: { numeroOrden: true } })
                let nuevoFolio = 'SOL-1001'
                if (ultimoTicketGlobal?.numeroOrden) {
                    nuevoFolio = `SOL-${parseInt(ultimoTicketGlobal.numeroOrden.split('-')[1]) + 1}`
                }

                ticketActivo = await prisma.ticket.create({
                    data: {
                        numeroOrden: nuevoFolio, equipo: 'Soporte Técnico Remoto', fallaReportada: 'Instalación de Software / Optimización Express',
                        clienteId: clienteIdParaTicket!, estado: 'EN_REPARACION', notasInternas: `[SESIÓN REMOTA ACTIVA] Código: ${codigoEncontrado}`
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
                const mensajeRechazo = `⚙️ *SOLTECOT_ INFORMA* ⚙️\n\nHemos registrado el rechazo del presupuesto para la orden *${ticketMasReciente.numeroOrden}*.\n\n📦 *Próximos Pasos:*\nLa reparación no procederá. Nuestro equipo técnico reensamblará tu *${ticketMasReciente.equipo}* para dejarlo en las mismas condiciones mecánicas en que ingresó. Te notificaremos en cuanto esté listo para que pases a recogerlo a nuestras installations.\n\n¡Gracias por tu confianza y tiempo! 🔬`
                await enviarMensajeWhatsApp(numeroCliente, mensajeRechazo)
                await dispararAlertaInmediata(telefono10Digitos, 'RECHAZADO', `❌ Presupuesto Cancelado. La orden ${ticketMasReciente.numeroOrden} regresa a ensamblaje de devolución.`)
                return
            }
        }

    } catch (dbError: any) {
        console.error('🔴 Error al validar escudos en el webhook:', dbError.message)
    }

    let historial = MEMORIA_CHAT.get(numeroCliente) || []

    // 🧠 RECONSTRUCTOR DE MEMORIA SERVERLESS (Shield Anti-Amnesia)
    if (historial.length === 0 && clientePrisma) {
        console.log(`🧠 [CONTEXT RECOVERY]: Instancia serverless nueva detectada. Reconstruyendo contexto para ${telefono10Digitos}`);
        if (ticketMasReciente && ticketMasReciente.estado === 'ESPERANDO_APROBACION') {
            historial.push({ role: 'user', parts: [{ text: 'Continuar con mi orden anterior' }] });
            historial.push({
                role: 'model',
                parts: [{ text: `¡Hola de nuevo! Ya tengo lista la cotización autorizada por el Ingeniero Julio por un total de $${ticketMasReciente.costoReparacion} MXN. Para proceder, ¿te gustaría agendar una visita presencial a nuestro laboratorio o prefieres coordinar la recolección a domicilio?` }]
            });
        }
    }

    const tieneHandoffPrevio = historial.some(h =>
        h.parts?.some((p: any) => p.text?.includes('__TRANSFERIR_HUMANO__'))
    )

    if (tieneHandoffPrevio) {
        console.log(`🧼 [SANEAMIENTO MEMORIA]: Detectado handoff previo en el historial. Limpiando fantasmas para ${telefono10Digitos}.`)
        historial = []
    }
    historial.push({ role: 'user', parts: [{ text: mensajeCliente }] })
    if (historial.length > 12) historial = historial.slice(-12)

    const esPreventaActiva = ticketMasReciente && ticketMasReciente.estado === 'ESPERANDO_APROBACION';
    const folioOrden = esPreventaActiva ? ticketMasReciente.numeroOrden : 'SOL-REM-PENDIENTE';
    const equipoRegistro = esPreventaActiva ? ticketMasReciente.equipo : 'No especificado';
    const fallaRegistro = esPreventaActiva ? ticketMasReciente.fallaReportada : 'No especificada';
    const costoPactado = (esPreventaActiva && ticketMasReciente.costoReparacion)
        ? `$${ticketMasReciente.costoReparacion} MXN` : 'Por cotizar';

    const MAX_REINTENTOS = 3
    let respuestaRaw = ''
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || ''

    for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
        try {
            const ai = new GoogleGenAI({ apiKey })
            const fechaHoyString = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: historial,
                config: {
                    systemInstruction: `Eres el Agente de IA oficial de Soltecot_ (Solutions & Technology On Time) en WhatsApp. Atiendes la recepción de un laboratorio de reparación de tecnología. Tu objetivo es guiar al cliente para elegir un servicio, agendar su cita o registrar un soporte remoto, extrayendo la información limpia para el CRM. Tono: Cordial, profesional, empático, seguro y muy directo.

📅 HOY ES: ${fechaHoyString}.
📍 DIRECCIÓN FÍSICA: ${DIRECCION_TEXTUAL}
🗺️ GOOGLE MAPS: ${LINK_GOOGLE_MAPS}

📋 [SISTEMA] INFO DEL TICKET ACTUAL EN NEON (Contexto en Tiempo Real):
- Folio de Orden: ${folioOrden}
- Equipo/Falla en registro: ${equipoRegistro} - ${fallaRegistro}
- Costo Total pactado por el Ingeniero Julio: ${costoPactado}

--- 1. CATÁLOGO DE SERVICIOS OFICIALES ---
• OPCIÓN 1: Soporte técnico remoto (Fallas de software en PC/Laptop). Costo: $419 MXN neto.
• OPCIÓN 2: Reparación o mantenimiento físico de PC y Laptop (Hardware/Limpieza).
• OPCIÓN 3: Mantenimiento advanced de Consolas de videojuegos (Xbox, PlayStation, Nintendo).

--- 2. MODALIDADES DE ENTREGA ---
1. VISITA AL LABORATORIO: Lunes a viernes (10 AM - 6 PM) and sábados (10 AM - 2 PM).
2. RECOLECCIÓN A DOMICILIO: Sábados y domingos (Radio máximo 10km desde el laboratorio).

--- 3. REGLAS ESTRICTAS DE ATENCIÓN Y FLUJOS ---

🚨 REGLA DE RENDICIÓN TAJANTE ANTE PRECIOS (CANDADO ANTIBUCLES MANDATORIO):
- Si el cliente te solicita un costo y el valor de Neon es 'Por cotizar', la PRIMERA VEZ debes otorgarle amablemente nuestro rango de mercado ($790 a $2,500 MXN) y ofrecerle Visita o Recolección.
- ¡CANDADO ABSOLUTO!: Si notas en el historial que YA MENCIONASTE el rango de precios, o si el cliente vuelve a insistir, objetar, o preguntar cosas como: "¿No me puedes dar costo exacto?", o "quiero hablar con un agente", TIENES ESTRICTAMENTE PROHIBIDO volver a mandarle la dirección o modalidades. Aborta inmediatamente e incluye la etiqueta: __TRANSFERIR_HUMANO__

🚨 REGLA DE RESPETO AL HISTORIAL HUMANO (POST-REACTIVACIÓN):
- Si el "Costo Total pactado por el Ingeniero Julio" detallado arriba es DIFERENTE a 'Por cotizar', ese es el COSTO REAL Y ÚNICO DEL SERVICIO (ej: ${costoPactado}). Queda ESTRICTAMENTE PROHIBIDO volver a mencionar el rango base de $790 a $2,500 MXN en cualquier parte del chat, incluido el mensaje final de confirmación. Confirma siempre usando el valor exacto de ${costoPactado}. Asume el costo y avanza directo al agendamiento preguntando si prefiere Visita al laboratorio o Recolección a domicilio.

🚨 FLUJO CONDICIONAL OBLIGATORIO DE FACTURACIÓN (DOS FASES):
- Cuando un cliente acepte el servicio, solicita inicialmente: Nombre Completo, Dirección (si es recolección) y si requerirá factura (SÍ/NO).
- ¡FASE DE RECOPILACIÓN FISCAL!: Si el usuario responde explícitamente "SÍ" o aporta datos de facturación, TIENES ESTRICTAMENTE PROHIBIDO cerrar la cita o dar el mensaje final de confirmación. En su lugar, debes responder solicitándole de forma cordial y obligatoria los siguientes datos: 1) RFC, 2) Nombre Fiscal o Razón Social, 3) Código Postal Fiscal, 4) Régimen Fiscal, 5) Uso de CFDI y 6) Correo electrónico. 
- Solo cuando el cliente te proporcione esos 6 datos fiscales, podrás dar por concluida la cita y emitir el mensaje final de éxito. Mientras no los provea, mantén el chat enfocado en obtenerlos.

🚨 REGLA DE MULTI-EQUIPOS (OTRO DISPOSITIVO DIFERENTE):
- Si el cliente menciona explícitamente que la consulta corresponde a un equipo DIFERENTE al detallado en la "INFO DEL TICKET ACTUAL EN NEON", trata el caso de inmediato como un flujo nuevo desde cero y aplica el rango base del mercado.

🚨 REGLA DE AGENDAMIENTO FÍSICO: NUNCA digas "venga cuando guste". Obliga cordialmente al cliente a fijar un DÍA y HORA exacta dentro de nuestros horarios oficiales antes de cerrar.

--- 4. FORMATO OBLIGATORIO DE SALIDA (BLOQUES DE CONTROL) ---
- Usa fechas ISO (AAAA-MM-DDTHH:MM:00) únicamente cuando agenden Visita o Recolección.
- Es MANDATORIO que cuando confirmes la cita final, coloques las etiquetas estructuradas al final del mensaje de texto exacto.

--- 5. PLANTILLA DE ANCLAJE VISUAL DE SALIDA (OBLIGATORIA EN CITA FINAL) ---
Si estás emitiendo el mensaje de confirmación exitosa de la cita, debes incluir las etiquetas al final de tu respuesta con este orden y formato exacto:
__AGENDAR_RECOLECCION__:AAAA-MM-DDTHH:MM:00 (o __AGENDAR_VISITA__: según corresponda)
_DIRECCION_CLIENTE_:Dirección Completa recopilada
[DATA_CRM]:Nombre Completo|Dispositivo|Falla|TelefonoDe10Digitos
[DATA_FISCAL]:SI (o NO)|RFC|Nombre Fiscal|CP Fiscal|Régimen|Uso CFDI|Correo`
                }
            })
            respuestaRaw = response.text || ''
            break
        } catch (error: any) {
            console.error(`🔴 [GEMINI REINTENTO ${intento}/3 FALLÓ]:`, error.message)
            if (intento === MAX_REINTENTOS) {
                if (clientePrisma?.id) {
                    await prisma.cliente.update({ where: { id: clientePrisma.id }, data: { atendidoPorBot: false } })
                }
                await dispararAlertaInmediata(telefono10Digitos, '🚨 FALLA TÉCNICA IA', `El motor de IA sufrió una anomalía.`)
                return
            }
            await new Promise(resolve => setTimeout(resolve, 2000))
        }
    }

    try {
        let estatusLead = 'PROSPECTO'
        let tipoSoporteCalculado = 'Remoto'

        const matchAgente = respuestaRaw.includes('__TRANSFERIR_HUMANO__');
        const matchRemoteHandoff = respuestaRaw.includes('__TRANSFERIR_REMOTO__');

        // Regex Case Insensitive y tolerantes a espacios para máxima captura de ganchos de control
        const matchVisita = respuestaRaw.match(/__AGENDAR_VISITA__:\s*([^\n\r]+)/i)
        const matchRecoleccion = respuestaRaw.match(/__AGENDAR_RECOLECCION__:\s*([^\n\r]+)/i)
        const matchDireccion = respuestaRaw.match(/_?_?DIRECCION_CLIENTE_?_?:\s*([^\n\r]+)/i)

        const matchCrm = respuestaRaw.match(/\[DATA_CRM\]:\s*([^\n\r]+)/i) || respuestaRaw.match(/__DATOS_CRM__:\s*([^\n\r]+)/i)
        const matchFiscal = respuestaRaw.match(/\[DATA_FISCAL\]:\s*([^\n\r]+)/i) || respuestaRaw.match(/_*DATOS_FISCAL(ES)?_*:\s*([^\n\r]+)/i)

        let respuestaWhatsApp = respuestaRaw
            .replace(/__AGENDAR_VISITA__:[^\n]*/gi, '')
            .replace(/__AGENDAR_RECOLECCION__:[^\n]*/gi, '')
            .replace(/_?_?DIRECCION_CLIENTE_?_?:[^\n]*/gi, '')
            .replace(/\[DATA_CRM\]:[^\n]*/gi, '')
            .replace(/__DATOS_CRM__:[^\n]*/gi, '')
            .replace(/\[DATA_FISCAL\]:[^\n]*/gi, '')
            .replace(/_*DATOS_FISCAL(ES)?_*:[^\n]*/gi, '')
            .replace(/__TRANSFERIR_HUMANO__/gi, '')
            .replace(/__TRANSFERIR_REMOTO__/gi, '')
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
            if (camposFiscales[0]) {
                const valorRawFactura = camposFiscales[0].trim().toUpperCase()
                // FLEXIBILIDAD ABSOLUTA: Si el bloque lleva "SI", "SÍ" o "REQ", se marca afirmativo
                reqFactura = (valorRawFactura.includes('SI') || valorRawFactura.includes('SÍ') || valorRawFactura.includes('REQ')) ? 'SI' : 'NO'
            }
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

        await registrarEnPrismaDB(telefonoParaCita, nombreCrm, mensajeCliente, respuestaWhatsApp)

        if (matchAgente || matchRemoteHandoff) {
            await prisma.cliente.upsert({
                where: { telefono: telefonoParaCita },
                update: { atendidoPorBot: false },
                create: { telefono: telefonoParaCita, nombre: nombreCrm, atendidoPorBot: false }
            })

            if (matchAgente) {
                estatusLead = 'REVISION_MANUAL'
                await dispararAlertaInmediata(telefonoParaCita, '🚨 S.O.S. AGENTE', `¡Julio, entra al chat! El cliente solicitó un humano o rechazó el precio.\n*Cliente:* ${nombreCrm} (${telefonoParaCita})\n*Último mensaje:* "${mensajeCliente}"`)
            } else {
                estatusLead = 'EN_REPARACION'
                await dispararAlertaInmediata(telefonoParaCita, '⚡ EN_REPARACION', `¡Sesión Remota Solicitada!`)
            }
        }

        if (matchVisita || ticketMasReciente?.equipo?.toLowerCase().includes('laboratorio')) {
            tipoSoporteCalculado = 'Visita Física'
        } else if (matchRecoleccion || matchDireccion || ticketMasReciente?.equipo?.toLowerCase().includes('recolección')) {
            tipoSoporteCalculado = 'Recolección'
        } else if (ticketMasReciente?.costoReparacion && parseFloat(ticketMasReciente.costoReparacion) !== 419) {
            tipoSoporteCalculado = 'Reparación Física'
        }

        if (matchVisita) {
            const fechaExtraida = matchVisita[1].trim()
            const fechaParseada = new Date(fechaExtraida)

            if (isNaN(fechaParseada.getTime())) {
                respuestaWhatsApp = `¡Entendido! Para poder agendar tu visita, ¿podrías indicarme la fecha y hora de forma un poco más clara? 🗓️`
                estatusLead = 'POR_AGENDAR'
            } else {
                const resultadoAgenda = await procesarCitaEnCalendar(telefonoParaCita, fechaExtraida, mensajeCliente, 'ENTREGA')
                if (resultadoAgenda.exitoso) {
                    if (!resultadoAgenda.yaExistia) {
                        respuestaWhatsApp = `${respuestaWhatsApp}\n\n🎫 *Cita Confirmada en Laboratorio*\n📅 *Fecha:* ${fechaParseada.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}\n⏰ *Hora:* ${fechaParseada.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}\n\n¡Tu espacio de recepción ha quedado reservado con éxito! 🛠️⚙️`
                        await registrarCitaEnPrismaDB(telefonoParaCita, nombreCrm, 'Entrega Presencial en Laboratorio', fechaExtraida, 0, 'ENTREGA')
                        await dispararAlertaInmediata(telefonoParaCita, 'AGENDADO', `${nombreCrm} agendó Visita Presencial`)
                    }
                    estatusLead = 'AGENDADO'
                } else {
                    respuestaWhatsApp = `¡Hola, ${nombreCrm}! Disculpa, detectamos que el horario se encuentra ocupado. ¿Tendrás algún otro espacio libre? 🗓️`
                    estatusLead = 'POR_AGENDAR'
                }
            }
        }

        if (matchRecoleccion) {
            const fechaExtraida = matchRecoleccion[1].trim()
            const fechaParseada = new Date(fechaExtraida.includes('-06:00') ? fechaExtraida : `${fechaExtraida}-06:00`)

            const resultadoAgenda = await procesarCitaEnCalendar(telefonoParaCita, fechaExtraida, mensajeCliente, 'RECOLECCION')

            if (resultadoAgenda.exitoso) {
                if (!resultadoAgenda.yaExistia) {
                    respuestaWhatsApp = `${respuestaWhatsApp}\n\n🎫 *Confirmación de Ruta de Recolección*\n📅 *Fecha:* ${fechaParseada.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}\n⏰ *Hora:* ${fechaParseada.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}\n\nHe apartado tu espacio en nuestro sistema de logística y asignado tu folio fiscal de manera exitosa. 🚚`

                    const direccionAsignar = matchDireccion ? matchDireccion[1].trim() : 'Pendiente de dirección';
                    await registrarCitaEnPrismaDB(telefonoParaCita, nombreCrm, direccionAsignar, fechaExtraida, 0, 'RECOLECCION')
                    await dispararAlertaInmediata(telefonoParaCita, 'AGENDADO', `${nombreCrm} agendó Recolección a Domicilio`)
                }
                estatusLead = 'AGENDADO'
            } else {
                respuestaWhatsApp = `¡Hola! Ese horario en la ruta ya no tiene cupo. ¿Tendrás algún otro espacio libre?`
                estatusLead = 'POR_AGENDAR'
            }
        }

        if (matchDireccion && !matchRecoleccion) {
            const direccionExtraida = matchDireccion[1].trim()
            const ultimaCitaPrisma = await prisma.cita.findFirst({ where: { telefono: telefonoParaCita }, orderBy: { createdAt: 'desc' } })

            if (ultimaCitaPrisma?.tipo === 'ENTREGA') {
                estatusLead = 'AGENDADO'
            } else {
                const kilometrosReal = await calcularDistanciaKm(direccionExtraida, apiKey)

                if (kilometrosReal === -1) {
                    respuestaWhatsApp = `¡Gracias por tu dirección! Un agente la va a revisar manualmente.`
                    estatusLead = 'REVISION_MANUAL'
                } else if (kilometrosReal <= RADIO_MAXIMO_KM) {
                    estatusLead = 'AGENDADO'
                } else {
                    await eliminarCitaEnCalendar(telefonoParaCita)
                    respuestaWhatsApp = `¡Gracias por los datos! Sin embargo, nuestro sistema detectó que tu dirección se encuentra a ${kilometrosReal.toFixed(1)} km, lo cual supera nuestro rango máximo...`
                    estatusLead = 'FUERA_DE_COBERTURA'
                }
            }
        }

        historial.push({ role: 'model', parts: [{ text: respuestaWhatsApp }] })
        if (historial.length > 12) historial = historial.slice(-12)
        MEMORIA_CHAT.set(numeroCliente, historial)

        const exitoEnvio = await enviarMensajeWhatsApp(numeroCliente, respuestaWhatsApp)
        if (exitoEnvio) {
            const codigoFolio = ticketMasReciente?.numeroOrden || 'SOL-REM-PENDIENTE'
            const compendioFalla = `${dispositivoCrm} / ${fallaCrm}`

            let totalCobrado = "", montoNeto = "", ivaCalculado = ""

            if (ticketMasReciente?.costoReparacion) {
                const costoTotal = parseFloat(ticketMasReciente.costoReparacion)
                if (!isNaN(costoTotal)) {
                    totalCobrado = costoTotal.toFixed(2)
                    const neto = costoTotal / 1.16
                    montoNeto = neto.toFixed(2)
                    ivaCalculado = (costoTotal - neto).toFixed(2)
                }
            } else {
                totalCobrado = "Por cotizar"; montoNeto = "Pendiente"; ivaCalculado = "Pendiente"
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
        console.error('🔴 Error crítico en el bloque de salida total:', error.message)
    }
}

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

export async function POST(req: Request) {
    try {
        const body = await req.json()

        if (body.object !== 'whatsapp_business_account') {
            return new Response('Ignorado', { status: 200 })
        }

        const entry = body.entry?.[0]
        const change = entry?.changes?.[0]
        const value = change?.value

        if (!value || !value.messages || value.messages.length === 0) {
            return new Response('Ignorado Estatus', { status: 200 })
        }

        const message = value.messages[0]

        if (message.type !== 'text') {
            return new Response('Ignorado Multimedia', { status: 200 })
        }

        const messageId = message.id;

        if (messageId) {
            try {
                await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "WebhookLog" ("id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`;
                await prisma.$executeRaw`INSERT INTO "WebhookLog" ("id") VALUES (${messageId});`;
            } catch (error) {
                console.log(`♻️ [DEDUPLICADOR CENTRALIZADO]: Clon en paralelo interceptado para el mensaje ID: ${messageId}. Abortando con 200 OK.`);
                return new Response('Retry Ignorado por Concurrencia', { status: 200 });
            }
        }

        const mensajeCliente = message.text?.body
        const numeroCliente = message.from

        if (numeroCliente.includes('5546088200')) {
            return new Response('Eco Ignorado', { status: 200 })
        }

        if (mensajeCliente && numeroCliente) {
            console.log(`📥 [WEBHOOK RECIBIDO]: De: ${numeroCliente} | Texto: "${mensajeCliente}"`);

            const telefonoLimpio = numeroCliente.replace(/[^0-9]/g, '')
            const telefono10Digitos = telefonoLimpio.slice(-10)
            const textoNormalizado = mensajeCliente.trim().toLowerCase()

            const clienteExistente = await prisma.cliente.findFirst({
                where: {
                    OR: [
                        { telefono: numeroCliente },
                        { telefono: telefonoLimpio },
                        { telefono: telefono10Digitos }
                    ]
                }
            })

            if (textoNormalizado === 'reset') {
                if (clienteExistente) {
                    await prisma.cliente.update({
                        where: { id: clienteExistente.id },
                        data: { atendidoPorBot: true, googleChatThreadId: null }
                    })
                    console.log(`🧼 [RESET SUCCESS]: Hilo de Google Chat borrado en Neon para ${telefono10Digitos}.`)
                }
                MEMORIA_CHAT.delete(numeroCliente)
                await enviarMensajeWhatsApp(numeroCliente, "🔄 [SISTEMA]: El asistente virtual ha sido reactivado para este número.")
                return new Response('Bot reseteado', { status: 200 })
            }

            if (clienteExistente && clienteExistente.atendidoPorBot === false) {
                console.log(`👤 [HUMAN TAKEOVER]: El bot está silenciado para ${telefono10Digitos}. Enviando alerta...`);
                await dispararAlertaInmediata(
                    telefono10Digitos,
                    '📥 ATENCIÓN MANUAL',
                    `El cliente en atención humana envió un nuevo mensaje:\n💬 "${mensajeCliente}"`
                )
                return new Response('Atendido de forma manual', { status: 200 })
            }

            await ejecutarLogicaIA(mensajeCliente, numeroCliente)
        }

        return new Response('Processed', { status: 200 })
    } catch (error: any) {
        console.error('🔴 Error en Receptor Webhook Meta:', error.message)
        return new Response('Error', { status: 500 })
    }
}