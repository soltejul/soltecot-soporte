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

// =========================================================================
// 🔐 FUNCIONES DE UTILERÍA Y AUTENTICACIÓN GOOGLE
// =========================================================================
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
        if (estatus.includes('SOS')) {
            icono = '🚨 Urgente';
        } else if (estatus.includes('MANUAL') || estatus.includes('ATENCION')) {
            icono = '💬 Chat Humano';
        } else if (estatus === 'AGENDADO') {
            icono = '📅 ¡CITA AGENDADA!';
        } else if (estatus === 'FUERA_DE_COBERTURA') {
            icono = '🟡 Fuera de Radio';
        } else if (estatus === 'EN_REPARACION') {
            icono = '⚡ Taller';
        }

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

        const respuestaSábana = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "'Facturación'!A:S"
        })

        const filasExistentes = respuestaSábana.data.values || []
        let numeroDeFilaDestino = -1
        let filaVieja: string[] = []

        for (let i = 0; i < filasExistentes.length; i++) {
            const rowFolio = filasExistentes[i][0]
            const rowTelefono = filasExistentes[i][3]

            if (folio === 'SOL-REM-PENDIENTE') {
                if (rowFolio === 'SOL-REM-PENDIENTE' && rowTelefono === telefono) {
                    numeroDeFilaDestino = i + 1
                    filaVieja = filasExistentes[i]
                    break
                }
            } else {
                if (rowFolio === folio) {
                    numeroDeFilaDestino = i + 1
                    filaVieja = filasExistentes[i]
                    break
                }
            }
        }

        if (numeroDeFilaDestino !== -1 && filaVieja.length > 0) {
            const nombreFinal = (nombre === 'Cliente WhatsApp' && filaVieja[2]) ? filaVieja[2] : nombre;
            const soporteFinal = (tipoSoporte === 'Remoto' && filaVieja[4]) ? filaVieja[4] : tipoSoporte;
            const fallaFinal = (dispositivoFalla.includes('Soporte General') && filaVieja[5]) ? filaVieja[5] : dispositivoFalla;
            const statusFinal = (status === 'PROSPECTO' && filaVieja[6]) ? filaVieja[6] : status;
            const facturaFinal = (reqFactura === 'NO' && filaVieja[7] === 'SI') ? 'SI' : reqFactura;

            const rfcFinal = (!rfc && filaVieja[8]) ? filaVieja[8] : rfc;
            const nombreFiscalFinal = (!nombreFiscal && filaVieja[9]) ? filaVieja[9] : nombreFiscal;
            const cpFinal = (!cp && filaVieja[10]) ? filaVieja[10] : cp;
            const regimenFinal = (!regimen && filaVieja[11]) ? filaVieja[11] : regimen;
            const usoFinal = (!usoCfdi && filaVieja[12]) ? filaVieja[12] : usoCfdi;
            const correoFinal = (!correo && filaVieja[13]) ? filaVieja[13] : correo;

            const netoFinal = (montoNeto === 'Pendiente' && filaVieja[14]) ? filaVieja[14] : montoNeto;
            const ivaFinal = (iva === 'Pendiente' && filaVieja[15]) ? filaVieja[15] : iva;
            const totalFinal = (totalCobrado === 'Por cotizar' && filaVieja[16]) ? filaVieja[16] : totalCobrado;
            const satFinal = (estatusSat === 'NO REQUIERE' && filaVieja[17] === 'PENDIENTE TIMBRADO') ? 'PENDIENTE TIMBRADO' : estatusSat;

            const valoresCombinados = [
                folio, fechaActual, nombreFinal, telefono, soporteFinal, fallaFinal, statusFinal,
                facturaFinal, rfcFinal, nombreFiscalFinal, cpFinal, regimenFinal, usoFinal, correoFinal,
                netoFinal, ivaFinal, totalFinal, satFinal, ""
            ]

            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `'Facturación'!A${numeroDeFilaDestino}:S${numeroDeFilaDestino}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [valoresCombinados] }
            })
            console.log(`✅ [CRM MERGE SUCCESS]: Fila indexada y protegida para el cliente: ${telefono}`)
        } else {
            const valoresFila = [
                folio, fechaActual, nombre, telefono, tipoSoporte, dispositivoFalla, status,
                reqFactura, rfc, nombreFiscal, cp, regimen, usoCfdi, correo, montoNeto, iva, totalCobrado, estatusSat, ""
            ]
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID, range: "'Facturación'!A:S",
                valueInputOption: 'USER_ENTERED', requestBody: { values: [valoresFila] }
            })
            console.log(`📦 [CRM GOOGLE SHEETS]: Fila base inicial creada para el lead: ${telefono}`)
        }
    } catch (error: any) {
        console.error('🔴 Error Sheets Facturación Avanzada:', error.message)
    }
}

async function procesarCitaEnCalendar(telefono: string, fechaIso: string, mensajeCliente: string, tipo: 'ENTREGA' | 'RECOLECCION') {
    try {
        const auth = obtenerAuthGoogle(['https://www.googleapis.com/auth/calendar'])
        const calendar = google.calendar({ version: 'v3', auth })

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
                start: { dateTime: inicioCita.toISOString() },
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

// =========================================================================
// 🧠 MOTOR DE INTELIGENCIA ARTIFICIAL HÍBRIDO (B2B / B2C)
// =========================================================================
async function ejecutarLogicaIA(mensajeCliente: string, numeroCliente: string) {
    const textoNormalizado = mensajeCliente.trim().toLowerCase()

    // 🔍 COMPRENSIÓN DIACRÍTICA AVANZADA (Limpia acentos invisibles de WhatsApp)
    const textoSinAcentos = textoNormalizado.normalize("NFD").replace(/[\u0300-\u036f]/g, "")

    const telefonoLimpio = numeroCliente.replace(/[^0-9]/g, '')
    const telefono10Digitos = telefonoLimpio.slice(-10)

    // -------------------------------------------------------------------------
    // 🏢 MÓDULO VIP B2B: CORTAFUEGOS Y CAPTURA DE LEADS EMPRESARIALES
    // -------------------------------------------------------------------------
    let memoriaB2B = MEMORIA_CHAT.get(`B2B_${numeroCliente}`) || [];
    const esPrimerMensajeB2B = textoSinAcentos.includes('poliza corporativa') || textoSinAcentos.includes('poliza') || textoSinAcentos.includes('pyme');
    const yaEstaEnConversacionB2B = memoriaB2B.length > 0;

    if (esPrimerMensajeB2B || yaEstaEnConversacionB2B) {
        if (esPrimerMensajeB2B) memoriaB2B = [];

        memoriaB2B.push({ role: 'user', parts: [{ text: mensajeCliente }] });
        if (memoriaB2B.length > 8) memoriaB2B = memoriaB2B.slice(-8);

        try {
            const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
            const aiB2B = new GoogleGenAI({ apiKey });
            const fechaHoyB2B = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            const responseB2B = await aiB2B.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: memoriaB2B,
                config: {
                    systemInstruction: `Eres el Asistente Comercial de IA de Soltecot_ B2B en WhatsApp. Tu único objetivo es calificar de manera ejecutiva a encargados de PYMEs para agendar una sesión de consultoría técnica en Google Meet con el Ingeniero Julio. 
                    📅 HOY ES: ${fechaHoyB2B}.
                    Recopila con mucha amabilidad pero de forma directa: Nombre Completo del contacto, Nombre de la Empresa y la Cantidad aproximada de equipos informáticos a cubrir.
                    Enlace oficial de la agenda corporativa: https://calendar.app.google/fWjMnrSUUC5cB3BJA
(Proporciona el enlace de citas del Ingeniero Julio).
                    ⚠️ OBLIGATORIO: En el preciso instante en que le proporciones el link de la agenda, DEBES concatenar al final del mensaje de forma estricta y literal la siguiente etiqueta estructurada de datos en una sola línea sin espacios extras: [DATA_LEAD_B2B]:Nombre Completo|Nombre Empresa|CantidadEquipos`
                }
            });

            const respuestaRawB2B = responseB2B.text || '';
            const matchDataB2B = respuestaRawB2B.match(/\[DATA_LEAD_B2B\]:\s*([^\n\r]+)/i);
            let respuestaWhatsAppB2B = respuestaRawB2B.replace(/\[DATA_LEAD_B2B\]:[^\n]*/gi, '').trim();

            if (matchDataB2B) {
                const camposB2B = matchDataB2B[1].split('|');
                const nombreB2B = camposB2B[0]?.trim() || 'Contacto PYME';
                const empresaB2B = camposB2B[1]?.trim() || 'Empresa';
                const equiposB2B = camposB2B[2]?.trim() || 'No especificado';

                const servicioDetectado = calcularServicioDeMensaje(textoSinAcentos);

                // 📊 Registro analítico histórico en Google Sheets (Pestaña: AnaliticaLeads)
                await registrarAnaliticaB2BEnSheets(telefono10Digitos, nombreB2B, empresaB2B, equiposB2B, servicioDetectado, 'NUEVO');

                // 💾 Registro operativo en Neon con Estatus Pipeline
                const emailVirtualB2B = `${telefono10Digitos}@soltecot-whatsapp.local`;
                const leadExistente = await prisma.leadB2B.findFirst({ where: { email: emailVirtualB2B } });

                if (leadExistente) {
                    await prisma.leadB2B.update({
                        where: { id: leadExistente.id },
                        data: { nombre: nombreB2B, empresa: empresaB2B, mensaje: `Equipos: ${equiposB2B}. Canalizado a Google Meet.`, estado: 'NUEVO' }
                    });
                } else {
                    await prisma.leadB2B.create({
                        data: { nombre: nombreB2B, email: emailVirtualB2B, empresa: empresaB2B, mensaje: `Equipos: ${equiposB2B}. Canalizado a Google Meet.`, estado: 'NUEVO' }
                    });
                }

                // Alerta al centro de mando en Google Chat e Handoff al canal Humano
                await dispararAlertaInmediata(telefono10Digitos, '💼 NUEVO LEAD B2B', `Prospecto corporativo calificado: *${nombreB2B}* de la empresa *"${empresaB2B}"* (${equiposB2B} equipos). Servicio interesado: ${servicioDetectado}.`);

                await prisma.cliente.upsert({
                    where: { telefono: telefono10Digitos },
                    update: { atendidoPorBot: false },
                    create: { telefono: telefono10Digitos, nombre: nombreB2B, atendidoPorBot: false }
                });
            }

            memoriaB2B.push({ role: 'model', parts: [{ text: respuestaWhatsAppB2B }] });
            MEMORIA_CHAT.set(`B2B_${numeroCliente}`, memoriaB2B);
            await enviarMensajeWhatsApp(numeroCliente, respuestaWhatsAppB2B);
            return; // 🛑 CORTE DE FLUJO: Evita que el cliente corporativo toque el taller B2C
        } catch (errorB2B) {
            console.error('🔴 Error crítico en módulo B2B:', errorB2B);
            return;
        }
    }

    // -------------------------------------------------------------------------
    // 🎮 MÓDULO B2C PARTICULARES (SISTEMA DE TALLER OPERATIVO INTACTO)
    // -------------------------------------------------------------------------
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
                update: { atendidoPorBot: false },
                create: { telefono: telefono10Digitos, nombre: 'Cliente WhatsApp', atendidoPorBot: false }
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

            await dispararAlertaInmediata(
                telefono10Digitos,
                'EN_REPARACION',
                `🖥️ [SOPORTE REMOTO] ¡Código Recibido de ${nombreClienteEstetico}! 🔑 Código: ${codigoEncontrado}. Orden: ${ticketActivo.numeroOrden}. ¡Entra a conectarte!`
            )

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

                    🚨 PROTOCOLO EXCLUSIVO PARA OPCIÓN 1 (SOPORTE TÉCNICO REMOTO):
                    1. Si el cliente elige Soporte Remoto, avísale que el costo es de $419 MXN neto y recopila únicamente su Nombre Completo y si requiere Factura (SÍ/NO). 
                    2. En el instante en que el cliente te proporcione su nombre y confirmación de factura, DEBES responderle con las instrucciones exactas de conexión y generar el cierre inmediato:

                    "¡Excelente [Nombre]! Hemos registrado tu solicitud de Soporte Técnico Remoto ($419 MXN). Para que el Ingeniero Julio pueda conectarse a tu equipo y solucionar la falla, sigue estos sencillos pasos:

                    1. Desde la computadora que tiene el problema, ingresa a: **remotedesktop.google.com/support**
                    2. En la sección 'Asistencia remota', haz clic en el botón azul de descarga para instalar la herramienta (si es la primera vez).
                    3. Haz clic en el botón **'+ Generar código'**. Te aparecerá un código numérico de 12 dígitos.
                    4. Escríbeme ese código aquí abajo para que el ingeniero tome el control de tu pantalla de inmediato."

                    3. ⚠️ OBLIGATORIO E INNEGOCIABLE ⚠️: Al final de ese mismísimo mensaje de instrucciones, DEBES concatenar en texto plano y de forma LITERAL las etiquetas de anclaje de salida (calculando la fecha y hora actual en la que estás chateando). Si no las imprimes textualmente, el backend no creará el folio:

                    __AGENDAR_VISITA__:AAAA-MM-DDTHH:MM:00
                    _DIRECCION_CLIENTE_:Soporte Técnico Remoto (Conexión a distancia)
                    [DATA_CRM]:Nombre Completo|PC/Laptop|Soporte Remoto Software|TelefonoDe10Digitos
                    [DATA_FISCAL]:SI (o NO)|RFC|Nombre Fiscal|CP Fiscal|Régimen|Uso CFDI|Correo

                    --- 2. MODALIDADES DE ENTREGA ---
                    1. VISITA AL LABORATORIO: Lunes a viernes (10 AM - 6 PM) y sábados (10 AM - 2 PM).
                    2. RECOLECCIÓN A DOMICILIO: Sábados y domingos (Radio máximo 10km desde el laboratorio).

                    --- 3. REGLAS ESTRICTAS DE ATENCIÓN Y FLUJOS ---
                    🚨 REGLAS ESTRICTAS DE RECOPILACIÓN DE DATOS (¡CANDADOS DE INFORMACIÓN!):
                    - NUNCA pidas el número de teléfono del cliente bajo ninguna circunstancia. El sistema de WhatsApp ya detecta su número y lo procesa internamente.
                    - Si el cliente elige VISITA AL LABORATORIO: Queda ESTRICTAMENTE PROHIBIDO pedirle su dirección física. Solo necesitas su Nombre Completo, Fecha/Hora deseada y si requiere Factura. Al final, en la etiqueta _DIRECCION_CLIENTE_, escribirás exactamente: "Visita en Laboratorio".
                    - Si el cliente elige RECOLECCIÓN A DOMICILIO: SÍ es obligatorio que solicites su dirección completa para validar la cobertura de logística del taller.

                    🚨 REGLA DE RENDICIÓN TAJANTE ANTE PRECIOS (CANDADO ANTIBUCLES MANDATORIO):
                    - Si el cliente te solicita un costo y el valor de Neon es 'Por cotizar', la PRIMERA VEZ debes otorgarle amablemente nuestro rango de mercado ($790 a $2,500 MXN) y ofrecerle Visita o Recolección.
                    - ¡CANDADO ABSOLUTO!: Si notas en el historial que YA MENCIONASTE el rango de precios, o si el cliente vuelve a insistir, objetar, o preguntar cosas como: "¿No me puedes dar costo exacto?", o "quiero hablar con un agente", TIENES ESTRICTAMENTE PROHIBIDO volver a mandarle la dirección o modalidades. Aborta inmediatamente e incluye la etiqueta: __TRANSFERIR_HUMANO__

                    🚨 REGLA DE RESPETO AL HISTORIAL HUMANO (POST-REACTIVACIÓN):
                    - Si el "Costo Total pactado por el Ingeniero Julio" detallado arriba es DIFERENTE a 'Por cotizar', ese es el COSTO REAL Y ÚNICO DEL SERVICIO (ej: ${costoPactado}). Queda ESTRICTAMENTE PROHIBIDO volver a mencionar el rango base de $790 a $2,500 MXN en cualquier parte del chat, incluido el mensaje final de confirmación. Confirma siempre usando el valor exacto de ${costoPactado}. Asume el costo y avanza directo al agendamiento preguntando si prefiere Visita al laboratorio o Recolección a domicilio.

                    🚨 FLUJO CONDICIONAL OBLIGATORIO DE FACTURACIÓN (DOS FASES):
                    - Cuando un cliente acepte el servicio, solicita inicialmente: Nombre Completo, Dirección (solo si es recolección) y si requerirá factura (SÍ/NO).
                    - ¡FASE DE RECOPILACIÓN FISCAL!: Si el usuario responde explícitamente "SÍ" o aporta datos de facturación, TIENES ESTRICTAMENTE PROHIBIDO cerrar la cita o dar el mensaje final de confirmación. En su lugar, debes responder solicitándole los siguientes datos: 1) RFC, 2) Nombre Fiscal o Razón Social, 3) Código Postal Fiscal, 4) Régimen Fiscal, 5) Uso de CFDI y 6) Correo electrónico. 
                    - Solo cuando el cliente te proporcione esos 6 datos fiscales, podrás dar por concluida la cita y emitir el mensaje final de éxito. Mientras no los provea, mantén el chat enfocado en obtenerlos.

                    🚨 REGLA DE MULTI-EQUIPOS (OTRO DISPOSITIVO DIFERENTE):
                    - Si el cliente menciona explícitamente que la consulta corresponde a un equipo DIFERENTE al detallado en la "INFO DEL TICKET ACTUAL EN NEON", trata el caso de inmediato como un flujo nuevo desde cero y aplica el rango base del mercado.

                    🚨 REGLA DE AGENDAMIENTO FÍSICO: NUNCA digas "venga cuando guste". Obliga cordialmente al cliente a fijar un DÍA y HORA exacta dentro de nuestros horarios oficiales antes de cerrar.

                    --- 4. FORMATO OBLIGATORIO DE SALIDA (BLOQUES DE CONTROL) ---
                    - Usa fechas ISO (AAAA-MM-DDTHH:MM:00) únicamente cuando agenden Visita o Recolección.
                    - Es MANDATORIO que cuando confirmes la cita final, coloques las etiquetas estructuradas al final del mensaje de texto exacto de manera literal y en texto plano.

                    --- 5. PLANTILLA DE ANCLAJE VISUAL DE SALIDA (OBLIGATORIA EN CITA FINAL) ---
                    Si estás emitiendo el mensaje de confirmación exitosa de la cita, debes incluir las etiquetas al final de tu respuesta con este orden y formato exacto.

                    🚨 REGLA CRUCIAL DE ZONA HORARIA: Usa estrictamente la hora local de México (formato de 24 horas) tanto en la etiqueta ISO como en el boleto visual. NO sumes ni restes horas para intentar convertir a UTC. Si el cliente agenda a las 2:00 PM, la etiqueta DEBE ser T14:00:00 y el boleto visual DEBE decir 02:00 p.m.

                    __AGENDAR_RECOLECCION__:AAAA-MM-DDTHH:MM:00 (o __AGENDAR_VISITA__:AAAA-MM-DDTHH:MM:00 según corresponda)
                    _DIRECCION_CLIENTE_:Dirección Completa recopilada (🚨 Si es Visita al Laboratorio, escribe exactamente: "Visita en Laboratorio")
                    [DATA_CRM]:Nombre Completo|Dispositivo o Consola|Falla Reportada|TelefonoDe10Digitos
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
            const clienteActualizado = await prisma.cliente.upsert({
                where: { telefono: telefonoParaCita },
                update: { atendidoPorBot: false },
                create: { telefono: telefonoParaCita, nombre: nombreCrm, atendidoPorBot: false }
            })

            if (matchAgente) {
                estatusLead = 'REVISION_MANUAL'

                let ticketLead = ticketMasReciente;
                if (!ticketLead || ticketLead.estado === 'ENTREGADO' || ticketLead.estado === 'RECHAZADO') {
                    ticketLead = await prisma.ticket.create({
                        data: {
                            numeroOrden: `LEAD-${telefonoParaCita}`,
                            equipo: dispositivoCrm,
                            fallaReportada: `${fallaCrm} (Solicitó Humano)`,
                            estado: 'ESPERANDO_APROBACION',
                            clienteId: clienteActualizado.id,
                            notasInternas: `[LEAD EN ESPERA]: El cliente solicita atención humana u objetó el rango base. Último mensaje: "${mensajeCliente}"`
                        }
                    });
                    ticketMasReciente = ticketLead;
                } else {
                    ticketLead = await prisma.ticket.update({
                        where: { id: ticketLead.id },
                        data: { estado: 'ESPERANDO_APROBACION' }
                    });
                    ticketMasReciente = ticketLead;
                }

                await dispararAlertaInmediata(
                    telefonoParaCita,
                    '🚨 S.O.S. AGENTE',
                    `¡Julio, entra al chat! El cliente solicitó un humano o rechazó el precio.\n*Cliente:* ${nombreCrm} (${telefonoParaCita})\n*Folio Lead:* ${ticketLead.numeroOrden}\n*Último mensaje:* "${mensajeCliente}"\n¡Disponible en tu Bandeja de Leads!`
                )
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

            try {
                const clienteFresco = await prisma.cliente.findFirst({
                    where: { telefono: { endsWith: telefono10Digitos } }
                });

                if (clienteFresco?.id) {
                    await prisma.mensaje.create({
                        data: { texto: mensajeCliente, origen: 'CLIENTE', clienteId: clienteFresco.id }
                    });

                    await prisma.mensaje.create({
                        data: { texto: respuestaWhatsApp, origen: 'BOT', clienteId: clienteFresco.id }
                    });
                }
            } catch (errChat) {
                console.error('🔴 Error guardando chat efímero:', errChat);
            }

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

// =========================================================================
// 🛡️ RECEPTORES Y VERIFICACIONES DE CAPA DE RED (GET / POST)
// =========================================================================
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

        // 🛡️ DEDUPLICADOR CENTRALIZADO ANTI-RETRYS DE META
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

            // Clave maestra de reseteo del bot
            if (textoNormalizado === 'kanzer1986') {
                if (clienteExistente) {
                    await prisma.cliente.update({
                        where: { id: clienteExistente.id },
                        data: { atendidoPorBot: true, googleChatThreadId: null }
                    })
                    console.log(`🧼 [RESET SUCCESS]: Hilo de Google Chat borrado en Neon para ${telefono10Digitos}.`)
                }
                MEMORIA_CHAT.delete(numeroCliente)
                MEMORIA_CHAT.delete(`B2B_${numeroCliente}`) // Resetea también la cola de PYMEs
                await enviarMensajeWhatsApp(numeroCliente, "🔄 [SISTEMA]: El asistente virtual ha sido reactivado para este número.")
                return new Response('Bot reseteado', { status: 200 })
            }

            // Captura en vivo cuando el chat está en "Modo Humano"
            if (clienteExistente && clienteExistente.atendidoPorBot === false) {
                console.log(`👤 [HUMAN TAKEOVER]: El bot está silenciado para ${telefono10Digitos}. Enviando alerta...`);

                await prisma.mensaje.create({
                    data: {
                        texto: mensajeCliente,
                        origen: 'CLIENTE',
                        clienteId: clienteExistente.id
                    }
                });
                await dispararAlertaInmediata(
                    telefono10Digitos,
                    '📥 ATENCIÓN MANUAL',
                    `El cliente en atención humana envió un nuevo mensaje:\n💬 "${mensajeCliente}"`
                )
                return new Response('Atendido de forma manual', { status: 200 })
            }

            // Despacho al cerebro de la Inteligencia Artificial Híbrida
            await ejecutarLogicaIA(mensajeCliente, numeroCliente)
        }

        return new Response('Processed', { status: 200 })
    } catch (error: any) {
        console.error('🔴 Error en Receptor Webhook Meta:', error.message)
        return new Response('Error', { status: 500 })
    }
}

// =========================================================================
// 📊 FUNCIONES DE EXTRACCIÓN Y ANALÍTICA B2B
// =========================================================================
function calcularServicioDeMensaje(textoSinAcentos: string): string {
    if (textoSinAcentos.includes("soporte tecnico") || textoSinAcentos.includes("soporte")) return "Pólizas de Soporte";
    if (textoSinAcentos.includes("infraestructura") || textoSinAcentos.includes("redes")) return "Infraestructura y Redes";
    if (textoSinAcentos.includes("cloud") || textoSinAcentos.includes("respaldo")) return "Soluciones Cloud y Respaldos";
    if (textoSinAcentos.includes("desarrollo") || textoSinAcentos.includes("software")) return "Desarrollo de Software a la Medida";
    return "General / No especificado";
}

async function registrarAnaliticaB2BEnSheets(telefono: string, nombre: string, empresa: string, equipos: string, servicio: string, estadoFinal: string) {
    try {
        // Enlaza inteligentemente con tu SPREADSHEET_ID global
        const sheetId = process.env.GOOGLE_B2B_SHEETS_ID || SPREADSHEET_ID;
        if (!sheetId) return;

        // Reutilizamos tu propia lógica nativa de tokens
        const auth = obtenerAuthGoogle(['https://www.googleapis.com/auth/spreadsheets']);
        const sheets = google.sheets({ version: 'v4', auth });

        const fechaHoy = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
        const filaDatos = [fechaHoy, telefono, nombre, empresa, equipos, servicio, "SÍ", estadoFinal];

        await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: 'AnaliticaLeads!A:H',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [filaDatos] }
        });
        console.log(`📊 [ANALYTICS B2B]: Fila indexada con éxito para la empresa: ${empresa}`);
    } catch (e: any) {
        console.error("🔴 Error al escribir analítica B2B en Sheets:", e.message);
    }
}