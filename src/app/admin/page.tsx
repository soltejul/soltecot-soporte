'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'

import ModalBloqueos from '../../components/ModalBloqueos'
import ModalTicket from '../../components/ModalTicket'
import SidebarPanel from '../../components/SidebarPanel'
import ChatPanel from '../../components/ChatPanel'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function AdminDashboard() {
    const router = useRouter()

    // --------------------------------------------------------
    // 🧠 ESTADOS GLOBALES DE LA INTERFAZ
    // --------------------------------------------------------
    const [busqueda, setBusqueda] = useState('')
    const [filtroPestana, setFiltroPestana] = useState<'todos' | 'manual' | 'agendados' | 'recolecciones' | 'leads' | 'taller'>('todos')
    const [modalInactividadAbierto, setModalInactividadAbierto] = useState(false)
    const [ticketDetalle, setTicketDetalle] = useState<any>(null)
    const [mostrarModalPresupuesto, setMostrarModalPresupuesto] = useState(false)

    // Estados del Chat Activo
    const [telefonoRescate, setTelefonoRescate] = useState('')
    const [mensajeRescate, setMensajeRescate] = useState('')
    const [archivoAdjunto, setArchivoAdjunto] = useState<File | null>(null)
    const [enviandoRescate, setEnviandoRescate] = useState(false)
    const [costoReparacion, setCostoReparacion] = useState('')
    const [notasDiagnostico, setNotasDiagnostico] = useState('')

    // Referencias para UX
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
    // 🚚 LÓGICA DE UNIFICACIÓN Y CLASIFICACIÓN LOGÍSTICA
    // --------------------------------------------------------
    const listaUnificada = useMemo(() => {
        const items: any[] = []
        const telefonosProcesados = new Set<string>()

        // 🧠 DETECTOR DE CONFIRMACIÓN REAL DE RECOLECCIÓN
        const esTextoRecoleccionConfirmada = (m: any) => {
            if (!m || !m.texto) return false
            if (m.texto.includes('RECORDATORIO AUTOMÁTICO')) return false

            const t = m.texto.toLowerCase()
            return (
                t.includes('confirmamos la cita de recolección') ||
                t.includes('cita de recolección para') ||
                t.includes('dirección de recolección es') ||
                t.includes('recolección sigue programada') ||
                t.includes('recolección confirmada') ||
                t.includes('pasará por tu equipo')
            )
        }

        // 🧠 DETECTOR DE CONFIRMACIÓN REAL DE CITA EN TALLER
        const esTextoCitaConfirmada = (m: any) => {
            if (!m || !m.texto) return false
            if (m.texto.includes('RECORDATORIO AUTOMÁTICO')) return false

            const t = m.texto.toLowerCase()
            return (
                t.includes('cita está confirmada') ||
                t.includes('confirmada para mañana') ||
                t.includes('te esperamos en nuestro laboratorio') ||
                t.includes('te esperamos con gusto')
            )
        }

        const extraerDireccion = (notas: string | null) => {
            if (!notas) return null
            const match = notas.match(/\[RECOLECCION:\s*([^\]]+)\]/i)
            return match ? match[1] : null
        }

        tickets.forEach((ticket: any) => {
            const tel10 = ticket.cliente?.telefono?.replace(/[^0-9]/g, '').slice(-10) || ''
            if (tel10) telefonosProcesados.add(tel10)

            const convAsociada = conversaciones.find((c: any) => c.telefono?.endsWith(tel10))
            const esTallerOficial = ticket.numeroOrden && !ticket.numeroOrden.startsWith('LEAD-')

            // Evaluar confirmación en mensajes del chat o etiquetas del ticket
            const tieneTagRecoleccion = ticket.notasInternas?.includes('[RECOLECCION]')
            const tieneConfirmacionChatRecoleccion = convAsociada?.mensajes?.some((m: any) => esTextoRecoleccionConfirmada(m))
            const esRecoleccion = ticket.estado === 'RECOLECCION' || Boolean(tieneTagRecoleccion) || Boolean(tieneConfirmacionChatRecoleccion)

            const tieneTagAgendado = ticket.notasInternas?.includes('[AGENDADO]')
            const tieneConfirmacionChatCita = convAsociada?.mensajes?.some((m: any) => esTextoCitaConfirmada(m))
            const esAgendado = !esRecoleccion && (ticket.estado === 'AGENDADO' || Boolean(tieneTagAgendado) || Boolean(tieneConfirmacionChatCita))

            const direccionRecoleccion = extraerDireccion(ticket.notasInternas)

            const botActivoCalculado = convAsociada?.atendidoPorBot === false
                ? false
                : (ticket.botActivo ?? convAsociada?.atendidoPorBot ?? true)

            items.push({
                id: ticket.id,
                tipo: esTallerOficial ? 'taller' : 'lead',
                esAgendado,
                esRecoleccion,
                direccionRecoleccion,
                folio: ticket.numeroOrden,
                nombre: ticket.cliente?.nombre || convAsociada?.nombre || 'Cliente WhatsApp',
                telefono: ticket.cliente?.telefono || convAsociada?.telefono || '',
                equipo: ticket.equipo,
                falla: ticket.fallaReportada,
                costo: ticket.costoReparacion || ticket.costoEstimado || '',
                estadoTaller: ticket.estado,
                botActivo: botActivoCalculado,
                ultimoMensaje: convAsociada?.mensajes?.[0] || null,
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

                items.push({
                    id: conv.id,
                    tipo: 'lead',
                    esAgendado: !tieneConfirmacionChatRecoleccion && Boolean(tieneConfirmacionChatCita),
                    esRecoleccion: Boolean(tieneConfirmacionChatRecoleccion),
                    direccionRecoleccion: null,
                    folio: `LEAD-${tel10}`,
                    nombre: conv.nombre !== 'Cliente WhatsApp' ? conv.nombre : conv.telefono,
                    telefono: conv.telefono,
                    equipo: 'Consulta WhatsApp',
                    falla: ultimoMsg?.texto || 'Consulta general',
                    costo: '',
                    estadoTaller: tieneConfirmacionChatRecoleccion ? 'RECOLECCION' : (tieneConfirmacionChatCita ? 'AGENDADO' : 'ESPERANDO_APROBACION'),
                    botActivo: conv.atendidoPorBot ?? true,
                    ultimoMensaje: ultimoMsg || null,
                    ticketOriginal: null,
                    clienteId: conv.id,
                    updatedAt: conv.updatedAt || new Date().toISOString()
                })
            }
        })

        // 🕒 ORDENAMIENTO LOGÍSTICO: Recolecciones y Citas van siempre hasta arriba
        return items.sort((a, b) => {
            if (a.esRecoleccion && !b.esRecoleccion) return -1
            if (!a.esRecoleccion && b.esRecoleccion) return 1
            if (a.esAgendado && !b.esAgendado) return -1
            if (!a.esAgendado && b.esAgendado) return 1
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        })
    }, [tickets, conversaciones])

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

                if (data.tipo === 'plantilla_fallback') {
                    alert('⚠️ Ventana 24h caducada. Se envió la plantilla oficial para reactivar el chat.')
                }
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

        // Estados donde el taller toma el control físico y el bot debe silenciarse
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
                alert("Prospecto purgado con éxito.")
            }
        } catch (err) {
            alert("Error al eliminar lead")
        }
    }

    // ⚡ BARRIDO DE 72 HORAS DE SEGUIMIENTO A INACTIVOS
    const dispararRecordatoriosManual = async () => {
        try {
            const res = await fetch('/api/admin/seguimiento-72h', { method: 'POST' })
            const data = await res.json()
            if (res.ok) {
                alert(`⚡ Barrido de 72h completado. Se enviaron ${data.enviados} plantillas de seguimiento.`)
                reloadTickets()
                reloadConversaciones()
            } else {
                alert(`🔴 Error en barrido: ${data.error || 'No se pudo completar'}`)
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
            Inicializando SO Soltecot_...
        </div>
    }

    return (
        <div className="h-screen bg-black text-white flex flex-col font-sans overflow-hidden">

            {/* 🔝 CABECERA PRINCIPAL */}
            <header className="h-auto min-h-[3.5rem] py-2 bg-zinc-950 border-b border-zinc-900 px-3 sm:px-4 flex items-center justify-between shrink-0 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <h1 className="text-base sm:text-lg font-bold text-emerald-400 font-mono tracking-wider">SOLTECOT_ OS</h1>
                    <span className="hidden sm:inline bg-zinc-900 text-zinc-400 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border border-zinc-800">
                        Control Center
                    </span>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <Link href="/admin/ingreso" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-2.5 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm">
                        <span>➕</span><span className="text-[11px] sm:text-xs">Recibir Equipo</span>
                    </Link>

                    <Link href="/admin/tester" className="bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800/60 text-xs font-bold px-2 py-1.5 rounded transition-colors flex items-center gap-1">
                        <span>🎮</span><span className="hidden sm:inline">Tester</span>
                    </Link>

                    <Link href="/admin/historial" className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-bold px-2 py-1.5 rounded transition-colors hidden md:block">
                        📜 Historial
                    </Link>

                    <button
                        onClick={dispararRecordatoriosManual}
                        className="bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-900/40 text-xs font-bold px-2 py-1.5 rounded transition-colors flex items-center gap-1"
                        title="Ejecutar barrido automático de plantillas para prospectos con 72h sin respuesta"
                    >
                        <span>🔔</span><span className="hidden sm:inline">Sweep 72h</span>
                    </button>

                    <button onClick={() => setModalInactividadAbierto(true)} className="bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-900/40 text-xs font-bold px-2 py-1.5 rounded transition-colors flex items-center gap-1">
                        <span>🌴</span><span className="hidden sm:inline">Vacaciones</span>
                    </button>

                    <button onClick={ejecutarLogout} className="bg-zinc-900 hover:bg-zinc-800 text-rose-500 border border-zinc-800 text-xs px-2 py-1.5 rounded font-bold transition-colors">
                        🚪
                    </button>
                </div>
            </header>

            {/* 🍱 LAYOUT PRINCIPAL */}
            <div className="flex-1 flex overflow-hidden relative">

                <SidebarPanel
                    listaUnificada={listaUnificada}
                    busqueda={busqueda}
                    setBusqueda={setBusqueda}
                    filtroPestana={filtroPestana}
                    setFiltroPestana={setFiltroPestana}
                    telefonoRescate={telefonoRescate}
                    setTelefonoRescate={setTelefonoRescate}
                />

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