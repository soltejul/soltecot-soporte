'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'

import ModalBloqueos from '../../components/ModalBloqueos'
import ModalTicket from '../../components/ModalTicket'
import ChatPanel from '../../components/ChatPanel'

const fetcher = (url: string) => fetch(url).then(res => res.json())

const MESES_MAP: Record<string, number> = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
}

// 🧠 PARSER DE FECHAS INDIVIDUALES Y VERBALES
function parseFechaInteligente(raw: string | null | undefined): { formateada: string | null; timestamp: number | null } {
    if (!raw) return { formateada: null, timestamp: null }
    const text = raw.trim()

    // 1. Detección de Formato ISO (ej. 2026-10-02T19:00:00)
    const isoMatch = text.match(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(:\d{2})?/)
    if (isoMatch) {
        const isoStr = isoMatch[0].replace(' ', 'T')
        const d = new Date(isoStr)
        if (!isNaN(d.getTime())) {
            const datePart = d.toLocaleDateString('es-MX', {
                weekday: 'short', day: '2-digit', month: 'short', timeZone: 'America/Mexico_City'
            })
            const timePart = d.toLocaleTimeString('es-MX', {
                hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City'
            })
            return {
                formateada: `${datePart} | ${timePart}`.replace(/\./g, '').toUpperCase(),
                timestamp: d.getTime()
            }
        }
    }

    // 2. Detección de Fecha Verbal en Español (ej. "viernes, 2 de octubre 07:00 p.m.")
    const esMatch = text.match(/(?:(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo),?\s*)?(\d{1,2})\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s*(?:a\s*las?|a)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?)?/i)

    if (esMatch) {
        const diaNum = parseInt(esMatch[2], 10)
        const mesNombre = esMatch[3].toLowerCase()
        const mesIndex = MESES_MAP[mesNombre]

        if (mesIndex !== undefined) {
            let hora = 12
            let min = 0

            if (esMatch[4]) {
                hora = parseInt(esMatch[4], 10)
                if (esMatch[5]) min = parseInt(esMatch[5], 10)
                const ampm = esMatch[6]?.toLowerCase()
                if (ampm && (ampm.includes('pm') || ampm.includes('p.m.')) && hora < 12) {
                    hora += 12
                } else if (ampm && (ampm.includes('am') || ampm.includes('a.m.')) && hora === 12) {
                    hora = 0
                }
            }

            const currentYear = new Date().getFullYear()
            const d = new Date(currentYear, mesIndex, diaNum, hora, min)
            if (!isNaN(d.getTime())) {
                const datePart = d.toLocaleDateString('es-MX', {
                    weekday: 'short', day: '2-digit', month: 'short'
                })
                const timePart = d.toLocaleTimeString('es-MX', {
                    hour: '2-digit', minute: '2-digit', hour12: true
                })
                return {
                    formateada: `${datePart} | ${timePart}`.replace(/\./g, '').toUpperCase(),
                    timestamp: d.getTime()
                }
            }
        }
    }

    return { formateada: null, timestamp: null }
}

// 🧠 EXTRACTOR AVANZADO MULTILÍNEA PARA PLANTILLAS Y MENSAJES DE WHATSAPP
function parseTextoCita(texto: string): { formateada: string | null; timestamp: number | null } {
    if (!texto) return { formateada: null, timestamp: null }

    // A. Plantilla Oficial Soltecot: 📅 *Fecha:* ... \n ⏰ *Hora:* ...
    const matchFechaLine = texto.match(/📅\s*\*?Fecha:\*?\s*([^\n\r]+)/i)
    const matchHoraLine = texto.match(/⏰\s*\*?Hora:\*?\s*([^\n\r]+)/i)

    if (matchFechaLine) {
        const fechaClean = matchFechaLine[1].replace(/\*/g, '').trim()
        const horaClean = matchHoraLine ? matchHoraLine[1].replace(/\*/g, '').trim() : ''
        const combinada = `${fechaClean} ${horaClean}`.trim()

        const resCombinado = parseFechaInteligente(combinada)
        if (resCombinado.formateada) return resCombinado
    }

    // B. Etiqueta Interna del Bot: __AGENDAR_VISITA__: ...
    const matchAgendarTag = texto.match(/__AGENDAR_(VISITA|RECOLECCION)__:\s*([^\n\r]+)/i)
    if (matchAgendarTag && matchAgendarTag[2]) {
        const resTag = parseFechaInteligente(matchAgendarTag[2].trim())
        if (resTag.formateada) return resTag
    }

    // C. Confirmación Conversacional: "**Viernes 2 de octubre** entre las **7:00 PM y 9:00 PM**"
    const matchFraseRango = texto.match(/(?:el|para el)\s*\*?\*?(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)?\s*(\d{1,2})\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\*?\*?\s*(?:entre las|a las)?\s*\*?\*?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i)
    if (matchFraseRango) {
        const diaNum = parseInt(matchFraseRango[2], 10)
        const mesNombre = matchFraseRango[3].toLowerCase()
        const mesIndex = MESES_MAP[mesNombre]
        if (mesIndex !== undefined) {
            let hora = 12
            let min = 0
            if (matchFraseRango[4]) {
                hora = parseInt(matchFraseRango[4], 10)
                if (matchFraseRango[5]) min = parseInt(matchFraseRango[5], 10)
                const ampm = matchFraseRango[6]?.toLowerCase()
                if (ampm && (ampm.includes('pm') || ampm.includes('p.m.')) && hora < 12) {
                    hora += 12
                } else if (ampm && (ampm.includes('am') || ampm.includes('a.m.')) && hora === 12) {
                    hora = 0
                }
            }
            const currentYear = new Date().getFullYear()
            const d = new Date(currentYear, mesIndex, diaNum, hora, min)
            if (!isNaN(d.getTime())) {
                const datePart = d.toLocaleDateString('es-MX', {
                    weekday: 'short', day: '2-digit', month: 'short'
                })
                const timePart = d.toLocaleTimeString('es-MX', {
                    hour: '2-digit', minute: '2-digit', hour12: true
                })
                return {
                    formateada: `${datePart} | ${timePart}`.replace(/\./g, '').toUpperCase(),
                    timestamp: d.getTime()
                }
            }
        }
    }

    return parseFechaInteligente(texto)
}

export default function AdminDashboard() {
    const router = useRouter()

    // --------------------------------------------------------
    // 🧠 ESTADOS GLOBALES DE LA INTERFAZ & CHATS VISTOS
    // --------------------------------------------------------
    const [busqueda, setBusqueda] = useState('')
    const [filtroPestana, setFiltroPestana] = useState<'todos' | 'citas' | 'taller' | 'envios' | 'leads'>('citas')
    const [modalInactividadAbierto, setModalInactividadAbierto] = useState(false)
    const [ticketDetalle, setTicketDetalle] = useState<any>(null)
    const [mostrarModalPresupuesto, setMostrarModalPresupuesto] = useState(false)

    // Estados del Chat / Drawer Activo
    const [telefonoRescate, setTelefonoRescate] = useState('')
    const [mensajeRescate, setMensajeRescate] = useState('')
    const [archivoAdjunto, setArchivoAdjunto] = useState<File | null>(null)
    const [enviandoRescate, setEnviandoRescate] = useState(false)
    const [costoReparacion, setCostoReparacion] = useState('')
    const [notasDiagnostico, setNotasDiagnostico] = useState('')

    // 👁️ REGISTRO DE CHATS LEÍDOS
    const [chatsVistos, setChatsVistos] = useState<Record<string, string>>({})

    useEffect(() => {
        try {
            const guardados = localStorage.getItem('soltecot_chats_vistos')
            if (guardados) setChatsVistos(JSON.parse(guardados))
        } catch (e) { }
    }, [])

    const handleSeleccionarChat = (telefono: string, fechaUltimoMsg?: string) => {
        setTelefonoRescate(telefono)
        if (telefono && fechaUltimoMsg) {
            const tel10 = telefono.replace(/[^0-9]/g, '').slice(-10)
            const nuevosVistos = { ...chatsVistos, [tel10]: fechaUltimoMsg }
            setChatsVistos(nuevosVistos)
            try {
                localStorage.setItem('soltecot_chats_vistos', JSON.stringify(nuevosVistos))
            } catch (e) { }
        }
    }

    const chatEndRef = useRef<HTMLDivElement | null>(null)
    const esPrimeraCargaChat = useRef(true)

    // --------------------------------------------------------
    // 🚀 SWR: FETCHING INTELIGENTE Y POLLING
    // --------------------------------------------------------
    const {
        data: ticketsBrutos = [],
        mutate: reloadTickets
    } = useSWR('/api/tickets', fetcher, {
        refreshInterval: 10000,
        revalidateOnFocus: true
    })

    const tickets = useMemo(() => {
        if (!Array.isArray(ticketsBrutos)) return []
        return ticketsBrutos.filter((t: any) => t.estado !== 'ENTREGADO' && t.estado !== 'RECHAZADO')
    }, [ticketsBrutos])

    const {
        data: conversacionesData,
        mutate: reloadConversaciones
    } = useSWR('/api/admin/mensajes', fetcher, {
        refreshInterval: 10000
    })
    const conversaciones = conversacionesData?.conversaciones || []

    const {
        data: chatActivoData,
        mutate: reloadChatDirecto,
        isLoading: cargandoHistorial
    } = useSWR(
        telefonoRescate.length >= 10 ? `/api/admin/mensajes?telefono=${telefonoRescate.replace(/[^0-9]/g, '')}` : null,
        fetcher,
        { refreshInterval: 5000 }
    )

    const historialDirecto = chatActivoData?.comparableMensajes || chatActivoData?.mensajes || []
    const [estadoBotOptimista, setEstadoBotOptimista] = useState<boolean | null>(null)

    useEffect(() => {
        if (chatActivoData?.cliente) {
            setEstadoBotOptimista(chatActivoData.cliente.atendidoPorBot)
        }
    }, [chatActivoData])

    useEffect(() => {
        if (telefonoRescate) {
            esPrimeraCargaChat.current = true
        }
    }, [telefonoRescate])

    useEffect(() => {
        if (esPrimeraCargaChat.current && historialDirecto.length > 0) {
            chatEndRef.current?.scrollIntoView({ behavior: 'auto' })
            esPrimeraCargaChat.current = false
        }
    }, [historialDirecto])

    // --------------------------------------------------------
    // 🚚 LÓGICA DE UNIFICACIÓN, EXTRACCIÓN DE FECHAS Y ORDENAMIENTO CRONOLÓGICO
    // --------------------------------------------------------
    const listaUnificada = useMemo(() => {
        const items: any[] = []
        const telefonosProcesados = new Set<string>()

        const esTextoRecoleccionConfirmada = (m: any) => {
            if (!m || !m.texto) return false
            if (m.texto.includes('RECORDATORIO AUTOMÁTICO')) return false
            const t = m.texto.toLowerCase()
            return t.includes('confirmamos la cita de recolección') || t.includes('cita de recolección para') || t.includes('recolección confirmada')
        }

        const esTextoCitaConfirmada = (m: any) => {
            if (!m || !m.texto) return false
            if (m.texto.includes('RECORDATORIO AUTOMÁTICO')) return false
            const t = m.texto.toLowerCase()
            return t.includes('cita está confirmada') || t.includes('te esperamos en nuestro laboratorio') || t.includes('cita confirmada') || t.includes('agendamos tu cita')
        }

        // 🧠 RASTREO PROFUNDO EN CAMPOS Y MENSAJES DE CONVERSACIÓN
        const extraerFechaYSortValue = (ticket: any, conv: any) => {
            const fuentesTextuales = [
                ticket?.fechaAgendada,
                ticket?.fechaCita,
                ticket?.notasInternas,
                ticket?.fallaReportada
            ]

            const mensajes = conv?.mensajes || []
            for (const m of mensajes) {
                if (m?.texto) fuentesTextuales.push(m.texto)
            }

            for (const fuente of fuentesTextuales) {
                if (fuente) {
                    const parseado = parseTextoCita(String(fuente))
                    if (parseado.formateada) {
                        return parseado
                    }
                }
            }

            return { formateada: null, timestamp: null }
        }

        tickets.forEach((ticket: any) => {
            const tel10 = ticket.cliente?.telefono?.replace(/[^0-9]/g, '').slice(-10) || ''
            if (tel10) telefonosProcesados.add(tel10)

            const convAsociada = conversaciones.find((c: any) => c.telefono?.endsWith(tel10))
            const esTallerOficial = ticket.numeroOrden && !ticket.numeroOrden.startsWith('LEAD-')

            const tieneTagRecoleccion = ticket.notasInternas?.includes('[RECOLECCION]')
            const tieneTagEnvio = ticket.notasInternas?.includes('[ENVIO]') || ticket.tipoLogistica === 'ENVIO_PAQUETERIA'
            const tieneConfirmacionChatRecoleccion = convAsociada?.mensajes?.some((m: any) => esTextoRecoleccionConfirmada(m))

            const esRecoleccion = ticket.estado === 'RECOLECCION' || Boolean(tieneTagRecoleccion) || Boolean(tieneConfirmacionChatRecoleccion)
            const esEnvioPaqueteria = Boolean(tieneTagEnvio)

            const tieneTagAgendado = ticket.notasInternas?.includes('[AGENDADO]')
            const tieneConfirmacionChatCita = convAsociada?.mensajes?.some((m: any) => esTextoCitaConfirmada(m))
            const esAgendado = !esRecoleccion && !esEnvioPaqueteria && (ticket.estado === 'AGENDADO' || Boolean(tieneTagAgendado) || Boolean(tieneConfirmacionChatCita))

            const { formateada, timestamp } = extraerFechaYSortValue(ticket, convAsociada)
            let fechaCitaFormateada = formateada

            if (!fechaCitaFormateada) {
                if (esRecoleccion) fechaCitaFormateada = "RECOLECCIÓN PROGRAMADA"
                else if (esAgendado) fechaCitaFormateada = "CITA PROGRAMADA"
            }

            const ultimoMsg = convAsociada?.mensajes?.[0]
            const fechaUltimoMsgTime = ultimoMsg?.createdAt ? new Date(ultimoMsg.createdAt).getTime() : 0
            const fechaUltimoVistoTime = chatsVistos[tel10] ? new Date(chatsVistos[tel10]).getTime() : 0
            const requiereAtencion = ultimoMsg?.origen === 'CLIENTE' && fechaUltimoMsgTime > fechaUltimoVistoTime

            const botActivoCalculado = convAsociada?.atendidoPorBot === false
                ? false
                : (ticket.botActivo ?? convAsociada?.atendidoPorBot ?? true)

            items.push({
                id: ticket.id,
                tipo: esTallerOficial ? 'taller' : 'lead',
                esAgendado,
                esRecoleccion,
                esEnvioPaqueteria,
                fechaCitaFormateada,
                fechaCitaTimestamp: timestamp,
                requiereAtencion,
                folio: ticket.numeroOrden,
                nombre: ticket.cliente?.nombre || convAsociada?.nombre || 'Cliente WhatsApp',
                telefono: ticket.cliente?.telefono || convAsociada?.telefono || '',
                equipo: ticket.equipo,
                falla: ticket.fallaReportada,
                estadoTaller: ticket.estado,
                botActivo: botActivoCalculado,
                ultimoMensaje: ultimoMsg || null,
                ticketOriginal: ticket,
                clienteId: ticket.clienteId,
                updatedAt: ticket.updatedAt
            })
        })

        conversaciones.forEach((conv: any) => {
            const tel10 = conv.telefono?.replace(/[^0-9]/g, '').slice(-10) || ''
            if (!telefonosProcesados.has(tel10)) {
                telefonosProcesados.add(tel10)
                const ultimoMsg = conv.mensajes?.[0]

                const tieneConfirmacionChatRecoleccion = conv.mensajes?.some((m: any) => esTextoRecoleccionConfirmada(m))
                const tieneConfirmacionChatCita = conv.mensajes?.some((m: any) => esTextoCitaConfirmada(m))
                const esRecoleccion = Boolean(tieneConfirmacionChatRecoleccion)
                const esAgendado = !esRecoleccion && Boolean(tieneConfirmacionChatCita)

                const { formateada, timestamp } = extraerFechaYSortValue(null, conv)
                let fechaCitaFormateada = formateada

                if (!fechaCitaFormateada) {
                    if (esRecoleccion) fechaCitaFormateada = "RECOLECCIÓN PROGRAMADA"
                    else if (esAgendado) fechaCitaFormateada = "CITA PROGRAMADA"
                }

                const fechaUltimoMsgTime = ultimoMsg?.createdAt ? new Date(ultimoMsg.createdAt).getTime() : 0
                const fechaUltimoVistoTime = chatsVistos[tel10] ? new Date(chatsVistos[tel10]).getTime() : 0
                const requiereAtencion = ultimoMsg?.origen === 'CLIENTE' && fechaUltimoMsgTime > fechaUltimoVistoTime

                items.push({
                    id: conv.id,
                    tipo: 'lead',
                    esAgendado,
                    esRecoleccion,
                    esEnvioPaqueteria: false,
                    fechaCitaFormateada,
                    fechaCitaTimestamp: timestamp,
                    requiereAtencion,
                    folio: `LEAD-${tel10}`,
                    nombre: conv.nombre !== 'Cliente WhatsApp' ? conv.nombre : conv.telefono,
                    telefono: conv.telefono,
                    equipo: 'Consulta WhatsApp',
                    falla: ultimoMsg?.texto || 'Consulta general',
                    estadoTaller: esRecoleccion ? 'RECOLECCION' : (esAgendado ? 'AGENDADO' : 'ESPERANDO_APROBACION'),
                    botActivo: conv.atendidoPorBot ?? true,
                    ultimoMensaje: ultimoMsg || null,
                    ticketOriginal: null,
                    clienteId: conv.id,
                    updatedAt: conv.updatedAt || new Date().toISOString()
                })
            }
        })

        // 🚨 ORDENAMIENTO CRONOLÓGICO DE CITAS:
        // 1. Mensajes NO Leídos (requiereAtencion) arriba.
        // 2. Citas ordenadas por fecha más cercana/inmediata primero (ascendente por timestamp).
        return items.sort((a, b) => {
            if (a.requiereAtencion && !b.requiereAtencion) return -1
            if (!a.requiereAtencion && b.requiereAtencion) return 1

            if (a.esAgendado && b.esAgendado) {
                if (a.fechaCitaTimestamp && b.fechaCitaTimestamp) {
                    return a.fechaCitaTimestamp - b.fechaCitaTimestamp
                }
                if (a.fechaCitaTimestamp && !b.fechaCitaTimestamp) return -1
                if (!a.fechaCitaTimestamp && b.fechaCitaTimestamp) return 1
            }

            if (a.esRecoleccion && !b.esRecoleccion) return -1
            if (!a.esRecoleccion && b.esRecoleccion) return 1

            if (a.esAgendado && !b.esAgendado) return -1
            if (!a.esAgendado && b.esAgendado) return 1

            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        })
    }, [tickets, conversaciones, chatsVistos])

    // 📊 METRICAS KPI EN TIEMPO REAL
    const kpis = useMemo(() => {
        const citasCount = listaUnificada.filter(i => i.esAgendado).length
        const tallerCount = listaUnificada.filter(i => i.tipo === 'taller' && ['RECIBIDO', 'EN_DIAGNOSTICO', 'EN_REPARACION'].includes(i.estadoTaller)).length
        const logisticaCount = listaUnificada.filter(i => i.esRecoleccion || i.esEnvioPaqueteria).length
        const leadsCount = listaUnificada.filter(i => i.tipo === 'lead' && !i.esAgendado && !i.esRecoleccion).length
        return { citasCount, tallerCount, logisticaCount, leadsCount }
    }, [listaUnificada])

    // 🔍 FILTRADO Y BÚSQUEDA APLICADA
    const listaFiltrada = useMemo(() => {
        return listaUnificada.filter(item => {
            const term = busqueda.toLowerCase().trim()
            const coincide = !term ||
                item.nombre?.toLowerCase().includes(term) ||
                item.telefono?.includes(term) ||
                item.folio?.toLowerCase().includes(term) ||
                item.equipo?.toLowerCase().includes(term)

            if (!coincide) return false

            if (filtroPestana === 'citas') return item.esAgendado
            if (filtroPestana === 'taller') return item.tipo === 'taller' || ['RECIBIDO', 'EN_DIAGNOSTICO', 'EN_REPARACION', 'LISTO_PARA_ENTREGA'].includes(item.estadoTaller)
            if (filtroPestana === 'envios') return item.esRecoleccion || item.esEnvioPaqueteria
            if (filtroPestana === 'leads') return item.tipo === 'lead' && !item.esAgendado && !item.esRecoleccion
            return true
        })
    }, [listaUnificada, busqueda, filtroPestana])

    const itemSeleccionadoActual = listaUnificada.find(i => i.telefono?.endsWith(telefonoRescate.slice(-10)))
    const ticketSeleccionado = tickets.find((t: any) => t.cliente?.telefono?.endsWith(telefonoRescate.slice(-10))) || null

    useEffect(() => {
        if (ticketSeleccionado?.costoReparacion) {
            setCostoReparacion(ticketSeleccionado.costoReparacion.toString())
        } else {
            setCostoReparacion('')
        }
    }, [telefonoRescate, ticketSeleccionado?.costoReparacion])

    // --------------------------------------------------------
    // ⚙️ ACCIONES Y MUTACIONES
    // --------------------------------------------------------
    const handleEnviarMensaje = async () => {
        const cleanNum = telefonoRescate.replace(/[^0-9]/g, '')
        if (cleanNum.length < 10) return alert('Ingresa un número válido')
        if (!mensajeRescate.trim() && !archivoAdjunto) return

        setEnviandoRescate(true)
        try {
            const formData = new FormData()
            formData.append('telefono', telefonoRescate)
            formData.append('mensaje', mensajeRescate)
            if (archivoAdjunto) formData.append('archivo', archivoAdjunto)

            const mensajeSimulado = {
                id: 'temp-' + Date.now(),
                texto: mensajeRescate || `📎 Archivo adjunto`,
                origen: 'BOT',
                createdAt: new Date().toISOString()
            }
            reloadChatDirecto({ ...chatActivoData, mensajes: [...historialDirecto, mensajeSimulado] }, false)
            setEstadoBotOptimista(false)

            const res = await fetch('/api/admin/chat-directo', { method: 'POST', body: formData })
            const data = await res.json()

            if (res.ok) {
                setMensajeRescate('')
                setArchivoAdjunto(null)
                reloadChatDirecto()
                reloadConversaciones()
            } else {
                alert('Error al enviar: ' + (data.error || 'Rechazado'))
                reloadChatDirecto()
            }
        } catch (err) {
            alert('Error de conexión')
            reloadChatDirecto()
        } finally {
            setEnviandoRescate(false)
        }
    }

    const handleEnviarPlantillaCotizacion = async (telefono: string) => {
        const cleanNum = telefono.replace(/[^0-9]/g, '')
        if (cleanNum.length < 10) return alert('Número inválido')

        const equipoPrompt = prompt('Escribe el nombre del equipo a cotizar:', ticketSeleccionado?.equipo || 'su equipo')
        if (equipoPrompt === null) return

        const rangoCostoPrompt = prompt('Escribe la cotización a enviar:', costoReparacion ? `$${costoReparacion} MXN` : '$350 y $600 MXN')
        if (rangoCostoPrompt === null) return

        setEnviandoRescate(true)
        try {
            const formData = new FormData()
            formData.append('telefono', telefono)
            formData.append('usarPlantilla', 'true')
            formData.append('equipo', equipoPrompt)
            formData.append('rangoCosto', rangoCostoPrompt)

            const res = await fetch('/api/admin/chat-directo', { method: 'POST', body: formData })
            if (res.ok) {
                alert('🚀 Plantilla enviada con éxito.')
                setEstadoBotOptimista(false)
                reloadChatDirecto()
                reloadConversaciones()
            } else {
                alert('🔴 Error al enviar plantilla.')
            }
        } catch (err) {
            alert('Error de conexión')
        } finally {
            setEnviandoRescate(false)
        }
    }

    const toggleBotActual = async () => {
        if (!telefonoRescate) return
        const nuevoEstado = !estadoBotOptimista
        setEstadoBotOptimista(nuevoEstado)

        try {
            const res = await fetch('/api/admin/chat-directo', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telefono: telefonoRescate, botActivo: nuevoEstado })
            })
            if (res.ok) {
                reloadConversaciones()
                reloadTickets()
                reloadChatDirecto()
            } else {
                setEstadoBotOptimista(!nuevoEstado)
            }
        } catch (err) {
            setEstadoBotOptimista(!nuevoEstado)
        }
    }

    const cambiarEstatusTaller = async (nuevoEstado: string) => {
        if (!ticketSeleccionado?.id) return
        const estadosManuales = ['RECIBIDO', 'EN_DIAGNOSTICO', 'EN_REPARACION', 'AGENDADO', 'RECOLECCION']
        const apagarBot = estadosManuales.includes(nuevoEstado)

        try {
            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticketId: ticketSeleccionado.id,
                    nuevoEstado: nuevoEstado,
                    botActivo: !apagarBot,
                    reenviarNotificacion: true
                })
            })

            if (res.ok) {
                reloadTickets()
                reloadConversaciones()
                reloadChatDirecto()
            }
        } catch (error) {
            console.error('Error cambiando estatus:', error)
        }
    }

    const guardarPresupuestoYEnviar = async () => {
        if (!costoReparacion || isNaN(Number(costoReparacion))) return alert("Ingresa un costo numérico válido.")

        try {
            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticketId: ticketSeleccionado.id,
                    nuevoEstado: 'ESPERANDO_APROBACION',
                    costoReparacion: parseFloat(costoReparacion),
                    notasDiagnostico,
                    botActivo: true
                })
            })

            if (res.ok) {
                setMostrarModalPresupuesto(false)
                reloadTickets()
                reloadConversaciones()
                reloadChatDirecto()
                alert(`💰 Cotización inyectada. IA Reactivada.`)
            }
        } catch (err) {
            alert("Error al guardar presupuesto")
        }
    }

    const handleDesecharLead = async (clienteId: string) => {
        if (!confirm("¿Estás seguro de purgar este prospecto de Neon DB?")) return
        try {
            const res = await fetch(`/api/tickets?clienteId=${clienteId}`, { method: 'DELETE' })
            if (res.ok) {
                setTelefonoRescate('')
                reloadTickets()
                reloadConversaciones()
            }
        } catch (err) {
            alert("Error al eliminar lead")
        }
    }

    const dispararRecordatoriosManual = async () => {
        try {
            const res = await fetch('/api/admin/seguimiento-72h', { method: 'POST' })
            const data = await res.json()
            if (res.ok) {
                alert(`⚡ Barrido de 72h completado. Se enviaron ${data.enviados} plantillas de seguimiento.`)
                reloadTickets()
                reloadConversaciones()
            }
        } catch (err) {
            alert("Error de conexión al ejecutar el barrido de 72h")
        }
    }

    const ejecutarLogout = async () => {
        const res = await fetch('/api/admin/logout', { method: 'POST' })
        if (res.ok) router.push('/admin/login')
    }

    if (!ticketsBrutos.length && !conversacionesData && !cargandoHistorial && esPrimeraCargaChat.current) {
        return <div className="h-screen bg-black text-emerald-400 flex flex-col items-center justify-center font-mono">
            <span className="text-4xl mb-4 animate-bounce">⚡</span>
            Cargando Soltecot Dashboard v2.0...
        </div>
    }

    return (
        <div className="h-screen bg-zinc-950 text-white flex flex-col font-sans overflow-hidden relative">

            {/* 🔝 CABECERA CONTROL CENTER */}
            <header className="h-16 bg-zinc-950 border-b border-zinc-900 px-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-mono font-bold text-lg">
                        S
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-white font-mono tracking-wide flex items-center gap-2">
                            SOLTECOT <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono">v2.0 DEV</span>
                        </h1>
                        <p className="text-[10px] text-zinc-500 font-mono">Laboratorio & Sistema Logístico Nacional</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Link href="/admin/ingreso" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-950/50">
                        <span>➕</span><span className="hidden md:inline">Nueva Orden</span>
                    </Link>

                    <button onClick={dispararRecordatoriosManual} className="bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-900/40 text-xs font-bold px-3 py-2 rounded-xl transition-all flex items-center gap-1.5" title="Ejecutar barrido manual de 72h">
                        <span>🔔</span><span className="hidden md:inline">Sweep 72h</span>
                    </button>
                    <button onClick={() => setModalInactividadAbierto(true)} className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-bold px-3 py-2 rounded-xl transition-colors">
                        🌴 <span className="hidden md:inline">Vacaciones</span>
                    </button>
                    <button onClick={ejecutarLogout} className="bg-zinc-900 hover:bg-zinc-800 text-rose-400 border border-zinc-800 text-xs p-2 rounded-xl font-bold transition-colors">
                        🚪
                    </button>
                </div>
            </header>

            {/* 📊 BARRA KPIS METRICAS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-zinc-900/40 border-b border-zinc-900 shrink-0">
                <div onClick={() => setFiltroPestana('citas')} className={`cursor-pointer p-3.5 rounded-2xl border transition-all ${filtroPestana === 'citas' ? 'bg-emerald-950/30 border-emerald-500/50 shadow-lg' : 'bg-zinc-950 border-zinc-900 hover:border-zinc-800'}`}>
                    <div className="flex justify-between items-center text-[10px] sm:text-xs text-zinc-400 font-mono">
                        <span>📍 CITAS LABORATORIO</span>
                        <span className="text-emerald-400">📅</span>
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-white mt-1 font-mono">{kpis.citasCount}</div>
                </div>

                <div onClick={() => setFiltroPestana('taller')} className={`cursor-pointer p-3.5 rounded-2xl border transition-all ${filtroPestana === 'taller' ? 'bg-purple-950/30 border-purple-500/50 shadow-lg' : 'bg-zinc-950 border-zinc-900 hover:border-zinc-800'}`}>
                    <div className="flex justify-between items-center text-[10px] sm:text-xs text-zinc-400 font-mono">
                        <span>🛠 BANCO DE TRABAJO</span>
                        <span className="text-purple-400">⚙️</span>
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-white mt-1 font-mono">{kpis.tallerCount}</div>
                </div>

                <div onClick={() => setFiltroPestana('envios')} className={`cursor-pointer p-3.5 rounded-2xl border transition-all ${filtroPestana === 'envios' ? 'bg-blue-950/30 border-blue-500/50 shadow-lg' : 'bg-zinc-950 border-zinc-900 hover:border-zinc-800'}`}>
                    <div className="flex justify-between items-center text-[10px] sm:text-xs text-zinc-400 font-mono">
                        <span>📦 LOGÍSTICA & ENVÍOS</span>
                        <span className="text-blue-400">🚚</span>
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-white mt-1 font-mono">{kpis.logisticaCount}</div>
                </div>

                <div onClick={() => setFiltroPestana('leads')} className={`cursor-pointer p-3.5 rounded-2xl border transition-all ${filtroPestana === 'leads' ? 'bg-amber-950/30 border-amber-500/50 shadow-lg' : 'bg-zinc-950 border-zinc-900 hover:border-zinc-800'}`}>
                    <div className="flex justify-between items-center text-[10px] sm:text-xs text-zinc-400 font-mono">
                        <span>🔴 PROSPECTOS / LEADS</span>
                        <span className="text-amber-400">💬</span>
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-white mt-1 font-mono">{kpis.leadsCount}</div>
                </div>
            </div>

            {/* 🔍 BARRA DE BÚSQUEDA Y PESTAÑAS */}
            <div className="px-4 py-3 bg-zinc-950 border-b border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="w-full sm:w-auto flex items-center gap-1.5 overflow-x-auto text-xs font-mono pb-1 sm:pb-0 hide-scrollbar">
                    <button onClick={() => setFiltroPestana('citas')} className={`px-3 py-1.5 rounded-xl border transition-all whitespace-nowrap ${filtroPestana === 'citas' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold' : 'text-zinc-400 border-transparent hover:text-zinc-200'}`}>
                        📍 Citas
                    </button>
                    <button onClick={() => setFiltroPestana('taller')} className={`px-3 py-1.5 rounded-xl border transition-all whitespace-nowrap ${filtroPestana === 'taller' ? 'bg-purple-500/20 text-purple-400 border-purple-500/40 font-bold' : 'text-zinc-400 border-transparent hover:text-zinc-200'}`}>
                        🛠 Taller
                    </button>
                    <button onClick={() => setFiltroPestana('envios')} className={`px-3 py-1.5 rounded-xl border transition-all whitespace-nowrap ${filtroPestana === 'envios' ? 'bg-blue-500/20 text-blue-400 border-blue-500/40 font-bold' : 'text-zinc-400 border-transparent hover:text-zinc-200'}`}>
                        📦 Logística
                    </button>
                    <button onClick={() => setFiltroPestana('leads')} className={`px-3 py-1.5 rounded-xl border transition-all whitespace-nowrap ${filtroPestana === 'leads' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 font-bold' : 'text-zinc-400 border-transparent hover:text-zinc-200'}`}>
                        🔴 Leads
                    </button>
                    <button onClick={() => setFiltroPestana('todos')} className={`px-3 py-1.5 rounded-xl border transition-all whitespace-nowrap ${filtroPestana === 'todos' ? 'bg-zinc-800 text-white border-zinc-700 font-bold' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>
                        📋 Todos
                    </button>
                </div>

                <div className="w-full sm:w-72 relative">
                    <input
                        type="text"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="🔍 Buscar cliente o folio..."
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono transition-all"
                    />
                </div>
            </div>

            {/* 📋 VISTA EN LISTA DE CLIENTES Y ORDENES */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {listaFiltrada.length === 0 ? (
                    <div className="text-center py-16 text-zinc-600 font-mono text-xs">
                        No hay registros en esta sección.
                    </div>
                ) : (
                    listaFiltrada.map((item) => {
                        const estaSeleccionado = telefonoRescate.endsWith(item.telefono?.slice(-10) || 'xyz')

                        return (
                            <div
                                key={item.id}
                                onClick={() => handleSeleccionarChat(item.telefono, item.ultimoMensaje?.createdAt)}
                                className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${estaSeleccionado
                                        ? 'bg-zinc-900 border-emerald-500/80 shadow-lg'
                                        : item.requiereAtencion
                                            ? 'bg-rose-950/20 border-rose-500/60 hover:bg-rose-950/40 shadow-[0_0_15px_rgba(225,29,72,0.2)]'
                                            : 'bg-zinc-950/60 border-zinc-900 hover:border-zinc-800 hover:bg-zinc-900/40'
                                    }`}
                            >
                                <div className="flex items-center gap-3 w-full sm:w-auto min-w-[220px]">
                                    <div className="relative">
                                        <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-emerald-400 font-mono shrink-0">
                                            {item.nombre?.slice(0, 2).toUpperCase() || 'WA'}
                                        </div>
                                        {item.requiereAtencion && (
                                            <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500 border-2 border-zinc-900"></span>
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-bold text-sm text-white">{item.nombre}</h3>

                                            {item.requiereAtencion && (
                                                <span className="text-[9px] bg-rose-500/20 text-rose-400 border border-rose-500/50 px-1.5 py-0.5 rounded font-mono font-bold animate-pulse">
                                                    NUEVO
                                                </span>
                                            )}

                                            {!item.botActivo && !item.requiereAtencion && (
                                                <span className="text-[9px] bg-rose-500/10 text-rose-500/60 border border-rose-500/20 px-1.5 py-0.5 rounded font-mono font-bold">
                                                    MANUAL
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-zinc-400 font-mono">📱 {item.telefono}</p>
                                    </div>
                                </div>

                                <div className="flex-1 w-full sm:w-auto min-w-[180px]">
                                    <p className="text-xs text-zinc-300 font-semibold truncate">💻 {item.equipo}</p>
                                    <p className={`text-[11px] truncate ${item.requiereAtencion ? 'text-white font-medium italic' : 'text-zinc-500'}`}>
                                        {item.requiereAtencion && item.ultimoMensaje?.texto
                                            ? `💬 ${item.ultimoMensaje.texto}`
                                            : item.falla}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap sm:justify-end w-full sm:w-auto pt-2 sm:pt-0 border-t border-zinc-900 sm:border-0 mt-2 sm:mt-0">

                                    {/* 📅 BADGE DE FECHA / HORA EXTRAÍDA Y RESALTADA */}
                                    {item.fechaCitaFormateada && (
                                        <span className="bg-emerald-950/90 border border-emerald-500/80 text-emerald-300 text-[11px] font-mono font-bold px-3 py-1 rounded-lg flex items-center gap-1.5 shadow-md shadow-emerald-950/40 whitespace-nowrap">
                                            <span>📅</span>
                                            <span>{item.fechaCitaFormateada}</span>
                                        </span>
                                    )}

                                    {item.esEnvioPaqueteria ? (
                                        <span className="bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg whitespace-nowrap">
                                            📦 PAQUETEXPRESS
                                        </span>
                                    ) : item.esRecoleccion ? (
                                        <span className="bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg whitespace-nowrap">
                                            🚚 RECOLECCIÓN LOCAL
                                        </span>
                                    ) : item.esAgendado ? (
                                        <span className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg whitespace-nowrap">
                                            📍 CITA TALLER
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-mono text-zinc-500 uppercase bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-lg whitespace-nowrap">
                                            {item.estadoTaller?.replace(/_/g, ' ') || 'PROSPECTO'}
                                        </span>
                                    )}

                                    <span className="text-xs font-mono text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800">
                                        {item.folio}
                                    </span>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {/* 🚪 MODAL SLIDE-OVER LATERAL */}
            {telefonoRescate && (
                <div
                    className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity"
                    onClick={() => setTelefonoRescate('')}
                >
                    <div
                        className="w-full md:w-[650px] lg:w-[750px] bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setTelefonoRescate('')}
                            className="absolute top-4 left-4 z-50 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white p-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1 shadow-md opacity-70 hover:opacity-100"
                        >
                            <span>❌</span>
                        </button>

                        <div className="flex-1 pt-12 overflow-hidden flex flex-col">
                            <ChatPanel
                                telefonoRescate={telefonoRescate}
                                setTelefonoRescate={setTelefonoRescate}
                                itemSeleccionadoActual={itemSeleccionadoActual}
                                ticketSeleccionado={ticketSeleccionado}
                                costoReparacion={costoReparacion}
                                setCostoReparacion={setCostoReparacion}
                                estadoBotDirecto={estadoBotOptimista}
                                toggleBotActual={toggleBotActual}
                                cambiarEstatusTaller={cambiarEstatusTaller}
                                guardarPresupuestoYEnviar={guardarPresupuestoYEnviar}
                                handleDesecharLead={handleDesecharLead}
                                setTicketDetalle={setTicketDetalle}
                                cargandoHistorial={cargandoHistorial}
                                historialDirecto={historialDirecto}
                                chatEndRef={chatEndRef}
                                handleEnviarPlantillaCotizacion={handleEnviarPlantillaCotizacion}
                                mensajeRescate={mensajeRescate}
                                setMensajeRescate={setMensajeRescate}
                                archivoAdjunto={archivoAdjunto}
                                setArchivoAdjunto={setArchivoAdjunto}
                                enviandoRescate={enviandoRescate}
                                handleEnviarMensaje={handleEnviarMensaje}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* 🧩 MODALES SUPERPUESTOS */}
            <ModalTicket
                ticketDetalle={ticketDetalle}
                mostrarModalPresupuesto={mostrarModalPresupuesto}
                costoReparacion={costoReparacion}
                notasDiagnostico={notasDiagnostico}
                onCloseDetalle={() => setTicketDetalle(null)}
                onClosePresupuesto={() => setMostrarModalPresupuesto(false)}
                setCostoReparacion={setCostoReparacion}
                setNotasDiagnostico={setNotasDiagnostico}
                onGuardarPresupuesto={guardarPresupuestoYEnviar}
                onReloadTickets={reloadTickets}
            />

            <ModalBloqueos
                isOpen={modalInactividadAbierto}
                onClose={() => setModalInactividadAbierto(false)}
            />
        </div>
    )
}