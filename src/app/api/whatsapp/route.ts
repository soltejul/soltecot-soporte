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
        } else if (estatus.includes('REACTIVADO')) {
            icono = '⚡ Cliente Reactivado';
        } else if (estatus === 'AGENDADO') {
            icono = '📅 ¡CITA AGENDADA!';
        } else if (estatus === 'FUERA_DE_COBERTURA') {
            icono = '🟡 Fuera de Radio';
        } else if (estatus === 'EN_REPARACION') {
            icono = '⚡ Taller';
        }

        const textoAlerta = `${icono} *¡ALERTA SOLTECOT!*\n*Estatus:* ${estatus}\n*Cliente:* ${telefono}\n*Detalles:* ${detalles}\n\n👉 _Responde incluyendo el teléfono para asegurar el tiro, ej: @soltemsg __REACTIVAR__ ${telefono.slice(-10)} __COT_950___`;

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

        const mensajeLimpio = String(mensaje || '').replace(/[\r\n]+/g, ' ').trim()
        const respuestaLimpia = String(respuesta || '').replace(/[\r\n]+/g, ' ').trim()
        const fallaLimpia = String(falla || '').replace(/[\r\n]+/g, ' ').trim()

        const valoresFila = [fechaActual, telefono, mensajeLimpio, respuestaLimpia, status, nombre, dispositivo, fallaLimpia]

        const respuestaHoja = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "'Hoja 1'!A:H"
        })

        const filasExistentes = respuestaHoja.data.values || []
        const filasConDatos = filasExistentes.filter(row => row && row.length > 0 && String(row[0] || '').trim() !== '')
        const numeroFilaDestino = filasConDatos.length + 1

        console.log(`📊 [GOOGLE SHEETS HOJA1]: Escribiendo mensaje en fila libre real ${numeroFilaDestino}...`)

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `'Hoja 1'!A${numeroFilaDestino}:H${numeroFilaDestino}`,
            valueInputOption: 'RAW',
            requestBody: { values: [valoresFila] }
        })

        console.log(`✅ [GOOGLE SHEETS HOJA1 SUCCESS]: Fila ${numeroFilaDestino} registrada correctamente.`)
    } catch (error: any) {
        console.error('🔴 [ERROR CRÍTICO HOJA 1 SHEETS]:', error.message)
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

            if (folio === 'SOL-REM-PENDIENTE' || folio.startsWith('LEAD-')) {
                if ((rowFolio === folio || rowFolio === 'SOL-REM-PENDIENTE' || rowFolio.startsWith('LEAD-')) && rowTelefono === telefono) {
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
            const statusFinal = status;
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
            console.log(`✅ [CRM MERGE SUCCESS]: Fila actualizada con estado '${statusFinal}' para el cliente: ${telefono}`)
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
                summary: `${prefijo} Soltecot [${telefono}]`,
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
    const textoSinAcentos = textoNormalizado.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    const telefonoLimpio = numeroCliente.replace(/[^0-9]/g, '')
    const telefono10Digitos = telefonoLimpio.slice(-10)

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
            const fechaHoyB2B = new Date().toLocaleDateString('es-MX', {
                timeZone: 'America/Mexico_City',
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });

            const responseB2B = await aiB2B.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: memoriaB2B,
                config: {
                    systemInstruction: `Eres el Asistente Comercial de IA de Soltec B2B en WhatsApp. Tu único objetivo es calificar de manera ejecutiva a encargados de PYMEs para agendar una sesión de consultoría técnica en Google Meet con el Ingeniero Julio. 
                    📅 HOY ES: ${fechaHoyB2B}.
                    Recopila con mucha amabilidad pero de forma directa: Nombre Completo del contacto, Nombre de la Empresa y la Cantidad aproximada de equipos informáticos a cubrir.
                    Enlace oficial de la agenda corporativa: https://calendar.app.google/fWjMnrSUUC5cB3BJA (Proporciona el enlace de citas del Ingeniero Julio).
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

                await registrarAnaliticaB2BEnSheets(telefono10Digitos, nombreB2B, empresaB2B, equiposB2B, servicioDetectado, 'NUEVO');

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
            return;
        } catch (errorB2B) {
            console.error('🔴 Error crítico en módulo B2B:', errorB2B);
            return;
        }
    }

    // -------------------------------------------------------------------------
    // 🎮 MÓDULO B2C PARTICULARES (SISTEMA DE TALLER OPERATIVO)
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

            const mensajeConexion = `⚡ *SISTEMA SOLTECOT REMOTO* ⚡\n\n¡Código de acceso recibido con éxito!\n\n🎫 *Folio Asignado:* ${ticketActivo.numeroOrden}\n🔬 *Estatus en Taller:* EN REPARACIÓN\n\nEl Ingeniero Julio ha recibido la alerta en el Centro de Control y se conectará a tu equipo en un lapso de *15 a 30 minutos* vía *Google Remote Desktop*.\n\n💻 *Por favor, deja tu computadora encendida y no cierres la ventana del navegador.*\n\n⚠️ *Nota de Seguridad:* Si durante la sesión tu pantalla se oscurece y Windows/Mac te pide permiso para hacer cambios (ventana de administrador), yo no podré hacer clic remotamente. Te pediré que tú mismo presiones "Sí" o "Permitir" cuando aparezca.`

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
                const mensajeRechazo = `⚙️ *SOLTECOT INFORMA* ⚙️\n\nHemos registrado el rechazo del presupuesto para la orden *${ticketMasReciente.numeroOrden}*.\n\n📦 *Próximos Pasos:*\nLa reparación no procederá. Nuestro equipo técnico reensamblará tu *${ticketMasReciente.equipo}* para dejarlo en las mismas condiciones mecánicas en que ingresó. Te notificaremos en cuanto esté listo para que pases a recogerlo a nuestras instalaciones.\n\n¡Gracias por tu confianza y tiempo! 🔬`
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
        console.log(`🧠 [CONTEXT RECOVERY]: Instancia serverless nueva detectada. Buscando memoria en Neon DB para ${telefono10Digitos}`);

        try {
            const mensajesAnteriores = await prisma.mensaje.findMany({
                where: { clienteId: clientePrisma.id },
                orderBy: { createdAt: 'desc' },
                take: 10
            });

            if (mensajesAnteriores.length > 0) {
                const mensajesCronologicos = mensajesAnteriores.reverse();

                historial = mensajesCronologicos.map((msg: any) => ({
                    role: msg.origen === 'BOT' ? 'model' : 'user',
                    parts: [{ text: msg.texto }]
                }));

                console.log(`✅ [CONTEXT RECOVERY]: ${mensajesAnteriores.length} mensajes recuperados de la DB.`);
            }
        } catch (errorDb) {
            console.error('🔴 Error recuperando historial de Neon:', errorDb);
        }

        if (historial.length === 0 && ticketMasReciente && ticketMasReciente.estado === 'ESPERANDO_APROBACION') {
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

    let instruccionesCalendario = "";
    try {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const prismaAny = prisma as any;
        const bloqueos = await prismaAny.bloqueoAgenda?.findMany({
            where: { fechaFin: { gte: hoy } },
            orderBy: { fechaInicio: 'asc' }
        }) ?? [];

        if (bloqueos.length > 0) {
            const listaFechas = bloqueos.map((b: any) => {
                const inicio = new Date(b.fechaInicio).toLocaleDateString('es-MX', {
                    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                });
                const fin = new Date(b.fechaFin).toLocaleDateString('es-MX', {
                    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                });
                return `• Del ${inicio} al ${fin} (Motivo: ${b.motivo || 'Fuera de laboratorio / Actividades externas'})`;
            }).join('\n');

            instruccionesCalendario = `
🚨 INSTRUCCIÓN ESTRICTA DE DÍAS INACTIVOS Y VACACIONES (OUT OF OFFICE):
El laboratorio físico NO estará recibiendo equipos NI realizando recolecciones a domicilio en las siguientes fechas:
${listaFechas}

REGLAS OBLIGATORIAS DE ATENCIÓN EN DÍAS BLOQUEADOS:
1. Si el cliente solicita o pregunta por agendar una Visita o Recolección dentro de alguno de esos rangos de fechas, discúlpate de forma MUY AMABLE Y CORTÉS, explicando el motivo de inactividad.
2. NUNCA emitas etiquetas de confirmación para esas fechas inactivas. Invita calurosamente al cliente a agendar para el primer día hábil posterior al regreso del equipo.
3. Si el cliente está de acuerdo o quiere apartar su lugar, SOLICITA SU NOMBRE COMPLETO, MODELO DE EQUIPO Y FALLA REPORTADA para registrar su solicitud como "LEAD / CITA PENDIENTE".
4. Explícale que su lugar ha quedado apartado con prioridad y que el equipo técnico se pondrá en contacto con él inmediatamente al reabrir el taller.
`;
        }
    } catch (errBloqueos) {
        console.error('🔴 Error consultando bloqueos de agenda en Neon:', errBloqueos);
    }

    const MAX_REINTENTOS = 3
    let respuestaRaw = ''
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || ''

    for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
        try {
            const ai = new GoogleGenAI({ apiKey })

            const hoyCalc = new Date();
            const fechaHoyString = hoyCalc.toLocaleDateString('es-MX', {
                timeZone: 'America/Mexico_City',
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });

            const sabadoCalc = new Date(hoyCalc);
            sabadoCalc.setDate(hoyCalc.getDate() + ((6 - hoyCalc.getDay() + 7) % 7));
            const fechaSabadoISO = sabadoCalc.toISOString().split('T')[0];

            const domingoCalc = new Date(hoyCalc);
            domingoCalc.setDate(hoyCalc.getDate() + ((0 - hoyCalc.getDay() + 7) % 7));
            const fechaDomingoISO = domingoCalc.toISOString().split('T')[0];

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: historial,
                config: {
                    systemInstruction: `Eres el Agente de IA oficial de Soltecot (Solutions & Technology On Time) en WhatsApp. Atiendes la recepción de un laboratorio de ingeniería y reparación de tecnología. Tu objetivo es asesorar al cliente, agendar citas de revisión/recolección o canalizar soporte remoto, extrayendo datos estructurados para el CRM.

Tono: Cordial, profesional, empático, seguro, muy directo y conversacional (evita sonar robótico o repetir párrafos).

--------------------------------------------------
📅 CONTEXTO EN TIEMPO REAL Y SISTEMA
--------------------------------------------------
- HOY ES: ${fechaHoyString}
- PRÓXIMO SÁBADO (FECHA EXACTA): ${fechaSabadoISO}
- PRÓXIMO DOMINGO (FECHA EXACTA): ${fechaDomingoISO}

📋 INFO DEL TICKET EN NEON (Estado de la orden actual):
- Folio de Orden: ${folioOrden}
- Equipo/Falla en registro: ${equipoRegistro} - ${fallaRegistro}
- Costo Total pactado por el Ingeniero Julio: ${costoPactado}

${instruccionesCalendario}

--------------------------------------------------
🔒 REGLA DE ORO 1: UBICACIÓN Y ATENCIÓN POR CITA PREVIA
--------------------------------------------------
TRABAJAMOS EXCLUSIVAMENTE BAJO AGENDA Y CITA PREVIA.
- PROHIBIDO usar palabras como "confidencial", "privado", "secreta", "política de seguridad" o "protocolos estrictos" para referirte a la ubicación. Estas palabras generan desconfianza en el cliente.
- Explica de forma cordial y transparente que para garantizar atención 100% personalizada sin filas, resguardar la seguridad de los equipos en laboratorio y asegurar espacio en banco de trabajo, atendemos EXCLUSIVAMENTE CON CITA PREVIA.
- Si el cliente pregunta dónde están ubicados o si le queda cerca, comparte la referencia general de la zona para que calcule su distancia:
  "Nos encontramos en el fraccionamiento Villas Xaltipa, en Cuautitlán, Estado de México. Te comparto la referencia para que calcules tu ruta. Trabajamos exclusivamente con cita previa para darte atención personalizada y sin filas. En cuanto coordinemos el día y la hora de tu visita, te enviamos el pin exacto de Google Maps para tu llegada."
- REGLA ANTI-REPETICIÓN: Si en un mensaje previo dentro del chat YA mencionaste la zona de Villas Xaltipa, PROHIBIDO volver a escribir la referencia de ubicación. Avanza directamente con la respuesta o propuesta de cita.
- Entrega la dirección completa y el link directo de Google Maps ÚNICAMENTE cuando la cita quede 100% CONFIRMADA (con Nombre, Día y Hora acordados):
  Dirección: ${DIRECCION_TEXTUAL}
  Link: ${LINK_GOOGLE_MAPS}

--------------------------------------------------
🤝 REGLA DE ORO 2: IDENTIFICACIÓN CORDIAL Y REGISTRO EN CRM
--------------------------------------------------
- Si el cliente figura como 'Cliente WhatsApp' o 'Desconocido', busca un momento natural al inicio para preguntarle su nombre:
  "Por cierto, para darte una atención más personalizada, ¿con quién tengo el gusto?"

- 🚨 REGISTRO INMEDIATO: En el instante en que el cliente proporcione su nombre (ej. "con Edgard Roque" o "Me llamo Edgard"), DEBES responder saludándolo por su nombre Y CONCATENAR OBLIGATORIAMENTE al final de tu mensaje la etiqueta CRM:
  [DATA_CRM]: <Nombre Extraído> | <Equipo si lo mencionó> | <Falla>

Ejemplo de salida de la IA:
"¡Excelente, Edgard! Un placer atenderte... [resto del mensaje] ...
[DATA_CRM]: Edgard Roque | PS5 / Xbox | Drift"

--------------------------------------------------
🚚 REGLA DE ORO 3: LOGÍSTICA Y RECOLECCIÓN POR ZONA
--------------------------------------------------
- Si el cliente solicita recolección a domicilio y menciona un municipio o zona (ej. Coacalco, Tultitlán, etc.), NO entres en bucles exigiendo la calle exacta de inmediato.
- Informa primero de forma amable si la zona se encuentra dentro de cobertura o dale una estimación del costo del servicio de recolección según la distancia general, preguntándole si desea continuar antes de pedir todos los datos fiscales y calle exacta.

--------------------------------------------------
1. CATÁLOGO DE SERVICIOS Y PRECIOS
--------------------------------------------------
• OPCIÓN 1: Soporte técnico remoto (Fallas de software en PC/Laptop). Costo: $419 MXN neto.
• OPCIÓN 2: Reparación o mantenimiento físico de PC y Laptop (Hardware/Limpieza).
• OPCIÓN 3: Mantenimiento avanzado y reparación de Consolas de videojuegos (Xbox, PlayStation, Nintendo) y sus controles.

TABLA DE PRECIOS FIJOS (CONSOLAS Y CONTROLES):
Si el cliente consulta costos de mantenimiento o joysticks para estos modelos, brinda únicamente el costo exacto:

Mantenimiento Consolas:
- Xbox One / Xbox Series S / PS4 / Nintendo Switch: $499 MXN
- Xbox Series X: $699 MXN
- PS5: $1,200 MXN (Incluye reemplazo de metal líquido, limpieza profunda interna y pads térmicos)
- Nintendo Wii: $399 MXN

Reemplazo de Joysticks en Controles (¡ATENCIÓN! TODOS LOS PRECIOS INCLUYEN EL REEMPLAZO DE AMBOS JOYSTICKS / EL PAR COMPLETO):
- Xbox One (1ra, 2da, 3ra gen): $350 MXN (Por ambos joysticks)
- Xbox Series (4ta gen): Clásico $350 MXN (o $400 según modelo) | TMR $600 MXN (Por ambos joysticks)
- Xbox Elite Series: Clásico $400 MXN | TMR (Solo Elite S2) $1,000 MXN (Por ambos joysticks)
- PS4: Clásico $400 MXN | TMR $600 MXN (Por ambos joysticks)
- PS5: Clásico $400 MXN | TMR $700 MXN (Por ambos joysticks)

--------------------------------------------------
2. PILARES DE SEGURIDAD Y CONFIANZA SOLTECOT
--------------------------------------------------
Menciona estos beneficios clave de forma natural cuando el cliente pida informes o muestre dudas:
1. DIAGNÓSTICO SIN COSTO: La revisión técnica en banco de trabajo para evaluar tu equipo es 100% gratuita.
2. EVIDENCIA FOTOGRÁFICA / VIDEO: Durante el proceso enviamos evidencia del estado de tu equipo (antes y después).
3. INSUMOS DE GAMA ALTA: Usamos compuestos térmicos de alta conductividad (pasta premium / pads térmicos) e isopropílico de alta pureza.
4. GARANTÍA POR ESCRITO: Todos nuestros mantenimientos y reparaciones incluyen garantía respaldada por el laboratorio.

--------------------------------------------------
3. JERARQUÍA DE EVALUACIÓN Y BOTONES DE META ADS
--------------------------------------------------
Evalúa el mensaje del cliente en este orden de prioridad estricto:

PASO 1: RESPUESTA A BOTONES DE ANUNCIOS META (Facebook/Instagram)
- Si el usuario presiona "Quiero cotizar la reparación de drift de mi control (PS5 / Xbox)" o consulta por drift/joysticks:
  -> Responde ACLARANDO EXPLÍCITAMENTE DESDE EL INICIO que la tarifa cubre **EL CAMBIO DE AMBOS JOYSTICKS (EL PAR COMPLETO)**, e incluye limpieza interna y calibración por software. Entrega las opciones de la tabla (Clásico vs TMR) remarcando que es costo por el par.
- Si presiona "¿Cuánto cuesta la instalación de joysticks TMR (Anti-Drift)?":
  -> Explica las ventajas de la tecnología TMR (magnética, anti-drift definitivo) y entrega la tarifa exacta aclarándole que el costo es **por ambos joysticks**.
- Si presiona "Quiero agendar una cita para entregar mi control en taller" o "Quiero agendar una cita para llevar mi laptop al taller":
  -> Pasa directo a acordar el día y hora dentro del rango permitido.

PASO 2: EVALUACIÓN DE INTERVENCIÓN HUMANA PREVIA (HANDOVER)
- Si el "Costo Total pactado por el Ingeniero Julio" es DIFERENTE a 'Por cotizar', O SI en el historial observas que el Ingeniero Julio (o Taller) ya acordó una revisión, costo o solución:
  1. PROHIBIDO mostrar nuevamente el menú de opciones o la bienvenida inicial.
  2. Confirma el valor pactado (${costoPactado}).
  3. Avanza directamente a coordinar la modalidad (Visita al Laboratorio o Recolección a Domicilio), Fecha, Hora y datos de Facturación.

PASO 3: RETENCIÓN DE VENTAS (CANDADO ANTI-FUGAS)
- Si el cliente menciona que el servicio es "muy caro", "costoso", "prefiere comprar uno nuevo", o intenta rechazar la cotización y despedirse:
  1. PROHIBIDO despedirte o dar por cerrada la conversación.
  2. Responde LITERALMENTE: "Comprendo tu punto. Permíteme transferir este chat con el Ingeniero Julio, el jefe del laboratorio, para que revise tu caso y vea si es posible ofrecerte alguna alternativa técnica."
  3. Concatena inmediatamente en una nueva línea la etiqueta: __TRANSFERIR_HUMANO__

--------------------------------------------------
4. REGLAS DE HORARIO Y RECEPCIÓN (ESTRICTO)
--------------------------------------------------
Nuestro modelo de trabajo es EXCLUSIVO por agenda. NO recibimos equipos sin cita confirmada.
Los horarios de recepción y entrega en el laboratorio de Villas Xaltipa son:
- Lunes a Viernes: Únicamente horario vespertino de 7:00 PM a 9:30 PM.
- Sábados: 10:00 AM a 6:00 PM.
- Domingos: 10:00 AM a 2:00 PM (Solo entregas/recepciones programadas).

🎯 PROPUESTA PROACTIVA DE CITAS (CIERRES DE VENTA):
Al invitar al cliente a agendar, NO hagas preguntas abiertas de tipo "¿Cuándo quieres venir?". Ofrece 2 opciones concretas basadas en los horarios permitidos.
Ejemplo: "¿Te acomodaría mejor darte espacio este **Viernes entre 7:00 PM y 9:30 PM**, o prefieres el **Sábado por la mañana**?"

⛔ REGLA STRICTA ANTI-CITAS FANTASMA POST-CONFIRMACIÓN:
- NUNCA emitas las etiquetas de agendado si el usuario NO ha dicho explícitamente qué DÍA y qué HORA prefiere.
- Si en el historial de chat YA se confirmó la cita o el cliente solo responde con agradecimientos o frases de cortesía (ej. "Muchas gracias", "Gracias", "Excelente", "Ok", "Perfecto", "Enterado", "Lo voy a pensar"):
-> PROHIBIDO volver a pedir fecha, hora o emitir etiquetas de agendado.
-> Responde ÚNICAMENTE: "¡De nada! Quedamos al pendiente para atenderte el día de tu cita. ¡Que tengas un excelente día! 🛠️"

--------------------------------------------------
5. PROTOCOLO DE FACTURACIÓN FISCAL (DOS FASES)
--------------------------------------------------
- FASE 1: Pregunta inicialmente si requerirá factura fiscal (SÍ/NO).
- FASE 2: Si el usuario responde "SÍ" o proporciona datos fiscales, PROHIBIDO cerrar la cita. Solicita los 6 datos fiscales obligatorios.

--------------------------------------------------
7. ESTRUCTURA Y ETIQUETAS DE SALIDA (OBLIGATORIAS SOLO AL CONFIRMAR FECHA/HORA/NOMBRE)
--------------------------------------------------
Al emitir el mensaje final de confirmación de cita (Visita o Recolección), DEBES concatenar al FINAL del mensaje de forma estricta las siguientes etiquetas:

Para Visita en Laboratorio:
__AGENDAR_VISITA__: YYYY-MM-DDTHH:mm:ss

Para Recolección a Domicilio:
__AGENDAR_RECOLECCION__: YYYY-MM-DDTHH:mm:ss
__DIRECCION_CLIENTE__: <Dirección completa>

Etiquetas complementarias obligatorias:
[DATA_CRM]: <Nombre Completo> | <Equipo> | <Falla>
[DATA_FISCAL]: <SI/NO> | <RFC> | <Razón Social> | <CP> | <Régimen> | <Uso CFDI> | <Correo>
`
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

        const matchVisita = respuestaRaw.match(/_?_?AGENDAR_VISITA_?_?:\s*([^\n\r]+)/i) || respuestaRaw.match(/_?_?FECHA_CITA_?_?:\s*([^\n\r]+)/i)
        const matchRecoleccion = respuestaRaw.match(/_?_?AGENDAR_RECOLECCION_?_?:\s*([^\n\r]+)/i)
        const matchDireccion = respuestaRaw.match(/_?_?DIRECCION_CLIENTE_?_?:\s*([^\n\r]+)/i)

        const matchCrm = respuestaRaw.match(/\[DATA_CRM\]:\s*([^\n\r]+)/i) || respuestaRaw.match(/_?_?DATOS_CRM_?_?:\s*([^\n\r]+)/i)
        const matchFiscal = respuestaRaw.match(/\[DATA_FISCAL\]:\s*([^\n\r]+)/i) || respuestaRaw.match(/_*DATOS_FISCAL(ES)?_*:\s*([^\n\r]+)/i)

        let respuestaWhatsApp = respuestaRaw
            .replace(/_?_?AGENDAR_VISITA_?_?:[^\n]*/gi, '')
            .replace(/_?_?AGENDAR_RECOLECCION_?_?:[^\n]*/gi, '')
            .replace(/_?_?FECHA_CITA_?_?:[^\n]*/gi, '')
            .replace(/_?_?HORA_CITA_?_?:[^\n]*/gi, '')
            .replace(/_?_?MODALIDAD_?_?:[^\n]*/gi, '')
            .replace(/_?_?NOMBRE_CLIENTE_?_?:[^\n]*/gi, '')
            .replace(/_?_?TIPO_SERVICIO_?_?:[^\n]*/gi, '')
            .replace(/_?_?FACTURA_?_?:[^\n]*/gi, '')
            .replace(/_?_?FOLIO_ORDEN_?_?:[^\n]*/gi, '')
            .replace(/_?_?COSTO_PACTADO_?_?:[^\n]*/gi, '')
            .replace(/_?_?ESTADO_ORDEN_?_?:[^\n]*/gi, '')
            .replace(/_?_?DIRECCION_CLIENTE_?_?:[^\n]*/gi, '')
            .replace(/\[DATA_CRM\]:[^\n]*/gi, '')
            .replace(/_?_?DATOS_CRM_?_?:[^\n]*/gi, '')
            .replace(/\[DATA_FISCAL\]:[^\n]*/gi, '')
            .replace(/_*DATOS_FISCAL(ES)?_*:[^\n]*/gi, '')
            .replace(/__TRANSFERIR_HUMANO__/gi, '')
            .replace(/__TRANSFERIR_REMOTO__/gi, '')
            .trim()

        let nombreCrm = 'Cliente WhatsApp', dispositivoCrm = 'PC/Laptop', fallaCrm = 'Soporte General'
        if (matchCrm) {
            const campos = matchCrm[1].split('|')
            if (campos[0]) nombreCrm = campos[0].trim()
            if (campos[1]) dispositivoCrm = campos[1].trim()
            if (campos[2]) fallaCrm = campos[2].trim()
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

        const telefonoParaCita = telefono10Digitos

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

        // =========================================================================
        // 🎯 PROCESAMIENTO Y REGISTRO DIRECTO DE VISITA EN LABORATORIO
        // =========================================================================
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

                        const clienteDb = await prisma.cliente.upsert({
                            where: { telefono: telefonoParaCita },
                            update: { nombre: nombreCrm, atendidoPorBot: false },
                            create: { telefono: telefonoParaCita, nombre: nombreCrm, atendidoPorBot: false }
                        });

                        await prisma.ticket.upsert({
                            where: { numeroOrden: `LEAD-${telefonoParaCita}` },
                            update: {
                                equipo: dispositivoCrm,
                                fallaReportada: `${fallaCrm} (Cita Presencial Agendada)`,
                                estado: 'ESPERANDO_APROBACION',
                                notasInternas: '[AGENDADO] Cita presencial agendada por IA',
                                botActivo: false
                            },
                            create: {
                                numeroOrden: `LEAD-${telefonoParaCita}`,
                                equipo: dispositivoCrm,
                                fallaReportada: `${fallaCrm} (Cita Presencial Agendada)`,
                                estado: 'ESPERANDO_APROBACION',
                                clienteId: clienteDb.id,
                                notasInternas: '[AGENDADO] Cita presencial agendada por IA',
                                botActivo: false
                            }
                        });

                        await dispararAlertaInmediata(telefonoParaCita, 'AGENDADO', `${nombreCrm} agendó Visita Presencial para el ${fechaParseada.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${fechaParseada.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`)
                    }
                    estatusLead = 'AGENDADO'
                } else {
                    respuestaWhatsApp = `¡Hola, ${nombreCrm}! Disculpa, detectamos que el horario se encuentra ocupado. ¿Tendrás algún otro espacio libre? 🗓️`
                    estatusLead = 'POR_AGENDAR'
                }
            }
        }

        // =========================================================================
        // 🎯 PROCESAMIENTO Y REGISTRO DIRECTO DE RECOLECCIÓN A DOMICILIO
        // =========================================================================
        if (matchRecoleccion) {
            const fechaExtraida = matchRecoleccion[1].trim()
            const fechaParseada = new Date(fechaExtraida.includes('-06:00') ? fechaExtraida : `${fechaExtraida}-06:00`)

            const resultadoAgenda = await procesarCitaEnCalendar(telefonoParaCita, fechaExtraida, mensajeCliente, 'RECOLECCION')

            if (resultadoAgenda.exitoso) {
                if (!resultadoAgenda.yaExistia) {
                    respuestaWhatsApp = `${respuestaWhatsApp}\n\n🎫 *Confirmación de Ruta de Recolección*\n📅 *Fecha:* ${fechaParseada.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}\n⏰ *Hora:* ${fechaParseada.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}\n\nHe apartado tu espacio en nuestro sistema de logística y asignado tu folio fiscal de manera exitosa. 🚚`

                    const direccionAsignar = matchDireccion ? matchDireccion[1].trim() : 'Pendiente de dirección';
                    await registrarCitaEnPrismaDB(telefonoParaCita, nombreCrm, direccionAsignar, fechaExtraida, 0, 'RECOLECCION')

                    const clienteDb = await prisma.cliente.upsert({
                        where: { telefono: telefonoParaCita },
                        update: { nombre: nombreCrm, atendidoPorBot: false },
                        create: { telefono: telefonoParaCita, nombre: nombreCrm, atendidoPorBot: false }
                    });

                    await prisma.ticket.upsert({
                        where: { numeroOrden: `LEAD-${telefonoParaCita}` },
                        update: {
                            equipo: dispositivoCrm,
                            fallaReportada: `${fallaCrm} (Recolección Agendada)`,
                            estado: 'ESPERANDO_APROBACION',
                            notasInternas: '[AGENDADO] Recolección a domicilio agendada por IA',
                            botActivo: false
                        },
                        create: {
                            numeroOrden: `LEAD-${telefonoParaCita}`,
                            equipo: dispositivoCrm,
                            fallaReportada: `${fallaCrm} (Recolección Agendada)`,
                            estado: 'ESPERANDO_APROBACION',
                            clienteId: clienteDb.id,
                            notasInternas: '[AGENDADO] Recolección a domicilio agendada por IA',
                            botActivo: false
                        }
                    });

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

        // 🚀 DISPARO A WHATSAPP
        await enviarMensajeWhatsApp(numeroCliente, respuestaWhatsApp)

        // 🎯 CÁLCULO DE FINANZAS Y REGISTRO EN CRM
        const codigoFolio = ticketMasReciente?.numeroOrden || `LEAD-${telefonoParaCita}`
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

        // 📊 ESCRITURA EN GOOGLE SHEETS
        await registrarHistorialEnHoja1(telefonoParaCita, mensajeCliente, respuestaWhatsApp, estatusLead, nombreCrm, dispositivoCrm, fallaCrm)
        await registrarFinanzasEnFacturacion(
            codigoFolio, telefonoParaCita, nombreCrm, tipoSoporteCalculado, compendioFalla, estatusLead,
            reqFactura, rfcCrm, nombreFiscalCrm, cpCrm, regimenCrm, usoCfdiCrm, correoCrm,
            montoNeto, ivaCalculado, totalCobrado, estatusSatCalculado
        )

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

        let mensajeCliente = ''
        if (message.type === 'text') {
            mensajeCliente = message.text?.body || ''
        } else if (message.type === 'button') {
            mensajeCliente = message.button?.text || message.button?.payload || ''
        } else if (message.type === 'interactive') {
            mensajeCliente = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || ''
        } else {
            return new Response('Ignorado Multimedia', { status: 200 })
        }

        const messageId = message.id

        if (messageId) {
            try {
                await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "WebhookLog" ("id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`
                await prisma.$executeRaw`INSERT INTO "WebhookLog" ("id") VALUES (${messageId});`
            } catch (error) {
                console.log(`♻️ [DEDUPLICADOR CENTRALIZADO]: Clon en paralelo interceptado para el mensaje ID: ${messageId}. Abortando con 200 OK.`)
                return new Response('Retry Ignorado por Concurrencia', { status: 200 })
            }
        }

        const numeroCliente = message.from

        if (numeroCliente.includes('5546088200')) {
            return new Response('Eco Ignorado', { status: 200 })
        }

        if (mensajeCliente && numeroCliente) {
            console.log(`📥 [WEBHOOK RECIBIDO]: De: ${numeroCliente} | Tipo: ${message.type} | Texto: "${mensajeCliente}"`)

            const telefonoLimpio = numeroCliente.replace(/[^0-9]/g, '')
            const telefono10Digitos = telefonoLimpio.slice(-10)
            const textoNormalizado = mensajeCliente.trim().toLowerCase()

            let cliente = await prisma.cliente.findFirst({
                where: {
                    OR: [
                        { telefono: numeroCliente },
                        { telefono: telefonoLimpio },
                        { telefono: telefono10Digitos }
                    ]
                }
            })

            if (!cliente) {
                cliente = await prisma.cliente.create({
                    data: {
                        telefono: telefono10Digitos,
                        nombre: 'Cliente WhatsApp',
                        atendidoPorBot: true
                    }
                })
                console.log(`👤 [NUEVO CLIENTE]: Registrado en Neon con teléfono ${telefono10Digitos}`)
            }

            // ====================================================================
            // 🛑 RESETEO MANUAL ADMIN (COMANDO SECRETO)
            // ====================================================================
            if (textoNormalizado === 'kanzer1986') {
                await prisma.cliente.update({
                    where: { id: cliente.id },
                    data: { atendidoPorBot: true, googleChatThreadId: null }
                })

                if (typeof MEMORIA_CHAT !== 'undefined') {
                    MEMORIA_CHAT.delete(numeroCliente)
                    MEMORIA_CHAT.delete(`B2B_${numeroCliente}`)
                }

                await enviarMensajeWhatsApp(numeroCliente, "🔄 [SISTEMA]: El asistente virtual ha sido reactivado para este número.")
                console.log(`🧼 [RESET SUCCESS]: Hilo borrado y Bot reactivado para ${telefono10Digitos}.`)
                return new Response('Bot reseteado', { status: 200 })
            }

            // ====================================================================
            // 🚪 OPT-OUT CLIENTE ("NO", "YA NO", "YA LO RESOLVÍ")
            // ====================================================================
            const esOptOut = textoNormalizado === 'no' ||
                textoNormalizado === 'ya no' ||
                textoNormalizado === 'ya lo resolvi' ||
                textoNormalizado === 'ya lo resolví' ||
                textoNormalizado === 'no gracias' ||
                textoNormalizado.includes('ya no quiero');

            if (esOptOut) {
                if (typeof MEMORIA_CHAT !== 'undefined') {
                    MEMORIA_CHAT.delete(numeroCliente)
                    MEMORIA_CHAT.delete(`B2B_${numeroCliente}`)
                }

                await prisma.ticket.updateMany({
                    where: {
                        clienteId: cliente.id,
                        estado: { notIn: ['ENTREGADO', 'RECHAZADO'] }
                    },
                    data: { estado: 'RECHAZADO', notasInternas: '[OPT-OUT] El cliente declinó o cerró el seguimiento.' }
                });

                await prisma.mensaje.deleteMany({
                    where: { clienteId: cliente.id }
                });

                const mensajeDespedida = "¡Entendido! No te enviaremos más mensajes. Hemos cerrado tu solicitud. Si algún día vuelves a necesitar ayuda con tus equipos, aquí estaremos con mucho gusto. ¡Que tengas un excelente día! 👋";
                await enviarMensajeWhatsApp(numeroCliente, mensajeDespedida);

                console.log(`🧼 [OPT-OUT SUCCESS]: Cliente ${telefono10Digitos} sanitizado y cerrado.`);
                return new Response('Opt-out procesado con éxito', { status: 200 });
            }

            const esBotonReactivacion = message.type === 'button' ||
                message.type === 'interactive' ||
                textoNormalizado.includes('hablar con el ing. julio') ||
                textoNormalizado.includes('ing. julio');

            if (esBotonReactivacion) {
                await prisma.cliente.update({
                    where: { id: cliente.id },
                    data: { atendidoPorBot: false }
                });

                await prisma.mensaje.create({
                    data: {
                        texto: `⚡ [Respuesta a Botón]: ${mensajeCliente}`,
                        origen: 'CLIENTE',
                        clienteId: cliente.id
                    }
                });

                await dispararAlertaInmediata(
                    telefono10Digitos,
                    '💬 CLIENTE REACTIVADO',
                    `El cliente *${cliente.nombre || 'WhatsApp'}* (${telefono10Digitos}) presionó el botón *"${mensajeCliente}"*. La ventana de 24h de WhatsApp está abierta y lista en el panel.`
                );

                await enviarMensajeWhatsApp(
                    numeroCliente,
                    "👋 ¡Hola! He notificado directamente al Ingeniero Julio. En un momento tomará tu chat desde el panel de control para atenderte. 🔬"
                );

                return new Response('Reactivación por botón procesada con éxito', { status: 200 });
            }

            let ticketActivo = await prisma.ticket.findFirst({
                where: {
                    clienteId: cliente.id,
                    estado: { notIn: ['ENTREGADO', 'RECHAZADO'] }
                }
            })

            if (!ticketActivo) {
                ticketActivo = await prisma.ticket.create({
                    data: {
                        numeroOrden: `LEAD-${telefono10Digitos}`,
                        equipo: 'Consulta WhatsApp',
                        fallaReportada: mensajeCliente,
                        estado: 'ESPERANDO_APROBACION',
                        clienteId: cliente.id,
                        botActivo: true
                    }
                })
                console.log(`🎯 [AUTO-LEAD CREADO]: Ficha LEAD-${telefono10Digitos} inyectada en la Bandeja de Leads.`)
            }

            if (cliente.atendidoPorBot === false) {
                console.log(`👤 [HUMAN TAKEOVER]: Bot silenciado para ${telefono10Digitos}. Registrando mensaje...`)

                await prisma.mensaje.create({
                    data: {
                        texto: mensajeCliente,
                        origen: 'CLIENTE',
                        clienteId: cliente.id
                    }
                })

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
        console.error('🔴 Error en Receptor Webhook Meta:', error?.message || error)
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
        const sheetId = process.env.GOOGLE_B2B_SHEETS_ID || SPREADSHEET_ID;
        if (!sheetId) return;

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