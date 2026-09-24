'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr' // 🚀 El motor de caché y polling en tiempo real

import ModalBloqueos from '../../components/ModalBloqueos'
import ModalTicket from '../../components/ModalTicket'
import SidebarPanel from '../../components/SidebarPanel'
import ChatPanel from '../../components/ChatPanel'

// Función Fetcher global para SWR
const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function AdminDashboard() {
    const router = useRouter()

    // --------------------------------------------------------
    // 🧠 ESTADOS GLOBALES DE LA INTERFAZ
    // --------------------------------------------------------
    const [busqueda, setBusqueda] = useState('')
    const [filtroPestana, setFiltroPestana] = useState<'todos' | 'manual' | 'agendados' | 'leads' | 'taller'>('todos')
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

    // 1. Obtener Tickets de Taller (Refetch cada 10s)
    const {
        data: ticketsBrutos = [],
        mutate: reloadTickets
    } = useSWR('/api/tickets', fetcher, {
        refreshInterval: 10000,
        revalidateOnFocus: true
    })

    // Filtrar solo tickets activos
    const tickets = useMemo(() => {
        if (!Array.isArray(ticketsBrutos)) return []
        return ticketsBrutos.filter((t: any) => t.estado !== 'ENTREGADO' && t.estado !== 'RECHAZADO')
    }, [ticketsBrutos])

    // 2. Obtener Lista de Conversaciones (Leads) (Refetch cada 10s)
    const {
        data: conversacionesData,
        mutate: reloadConversaciones
    } = useSWR('/api/admin/mensajes', fetcher, {
        refreshInterval: 10000
    })
    const conversaciones = conversacionesData?.conversaciones || []

    // 3. Obtener Historial del Chat Activo (Refetch rápido cada 5s solo si hay chat abierto)
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

    // Actualizar el estado optimista del bot cuando cambian los datos reales de la DB
    useEffect(() => {
        if (chatActivoData?.cliente) {
            setEstadoBotOptimista(chatActivoData.cliente.atendidoPorBot)
        }
    }, [chatActivoData])

    // Auto-scroll al abrir un chat por primera vez
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
    // 🧬 LÓGICA DE UNIFICACIÓN (MEMORIZADA)
    // --------------------------------------------------------
    const listaUnificada = useMemo(() => {
        const items: any[] = []
        const telefonosProcesados = new Set<string>()

        const esTextoAgendado = (m: any) => {
            if (!m || !m.texto) return false
            const t = m.texto.toLowerCase()
            return t.includes('confirmad') || t.includes('reservad') || t.includes('te esperamos') || t.includes('agendad')
        }

        tickets.forEach((ticket: any) => {
            const tel10 = ticket.cliente?.telefono?.replace(/[^0-9]/g, '').slice(-10) || ''
            if (tel10) telefonosProcesados.add(tel10)

            const convAsociada = conversaciones.find((c: any) => c.telefono?.endsWith(tel10))
            const esTallerOficial = ticket.numeroOrden && !ticket.numeroOrden.startsWith('LEAD-')

            const tieneConfirmacionMensaje = convAsociada?.mensajes?.some((m: any) => esTextoAgendado(m))
            const tieneTagNotas = ticket.notasInternas?.includes('[AGENDADO]')
            const esAgendado = ticket.estado === 'AGENDADO' || Boolean(tieneConfirmacionMensaje) || Boolean(tieneTagNotas)

            const botActivoCalculado = convAsociada?.atendidoPorBot === false
                ? false
                : (ticket.botActivo ?? convAsociada?.atendidoPorBot ?? true)

            items.push({
                id: ticket.id,
                tipo: esTallerOficial ? 'taller' : 'lead',
                esAgendado,
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
                clienteId: ticket.clienteId
            })
        })

        conversaciones.forEach((conv: any) => {
            const tel10 = conv.telefono?.replace(/[^0-9]/g, '').slice(-10) || ''
            if (!telefonosProcesados.has(tel10)) {
                telefonosProcesados.add(tel10)
                const ultimoMsg = conv.mensajes?.[0]
                const tieneConfirmacionMensaje = conv.mensajes?.some((m: any) => esTextoAgendado(m))

                items.push({
                    id: conv.id,
                    tipo: 'lead',
                    esAgendado: Boolean(tieneConfirmacionMensaje),
                    folio: `LEAD-${tel10}`,
                    nombre: conv.nombre !== 'Cliente WhatsApp' ? conv.nombre : conv.telefono,
                    telefono: conv.telefono,
                    equipo: 'Consulta WhatsApp',
                    falla: ultimoMsg?.texto || 'Consulta general',
                    costo: '',
                    estadoTaller: tieneConfirmacionMensaje ? 'AGENDADO' : 'ESPERANDO_APROBACION',
                    botActivo: conv.atendidoPorBot ?? true,
                    ultimoMensaje: ultimoMsg || null,
                    ticketOriginal: null,
                    clienteId: conv.id
                })
            }
        })

        return items
    }, [tickets, conversaciones])

    const itemSeleccionadoActual = listaUnificada.find(i => i.telefono?.endsWith(telefonoRescate.slice(-10)))
    const ticketSeleccionado = tickets.find((t: any) => t.cliente?.telefono?.endsWith(telefonoRescate.slice(-10))) || null

    // Sincronizar el costo inicial del input si cambiamos de chat
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

            // Mutación optimista en UI (Simula que el mensaje ya se envió)
            const mensajeSimulado = {
                id: 'temp-' + Date.now(),
                texto: mensajeRescate || `📎 Archivo adjunto`,
                origen: 'BOT',
                createdAt: new Date().toISOString()
            }
            reloadChatDirecto({ ...chatActivoData, mensajes: [...historialDirecto, mensajeSimulado] }, false)
            setEstadoBotOptimista(false) // Apagar bot visualmente rápido

            const res = await fetch('/api/admin/chat-directo', { method: 'POST', body: formData })
            const data = await res.json()

            if (res.ok) {
                setMensajeRescate('')
                setArchivoAdjunto(null)
                reloadChatDirecto() // Validar datos reales con el servidor
                reloadConversaciones()

                if (data.tipo === 'plantilla_fallback') {
                    alert('⚠️ Ventana 24h caducada. Se envió la plantilla oficial para reactivar el chat.')
                }
            } else {
                alert('Error al enviar: ' + (data.error || 'Rechazado'))
                reloadChatDirecto() // Revertir mutación optimista
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

        // Mutación Optimista inmediata en UI
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
            } else {
                setEstadoBotOptimista(!nuevoEstado) // Revertir si falla
            }
        } catch (err) {
            setEstadoBotOptimista(!nuevoEstado)
        }
    }

    const cambiarEstatusTaller = async (nuevoEstado: string) => {
        if (!ticketSeleccionado && !telefonoRescate) return
        if (nuevoEstado === 'ESPERANDO_APROBACION') {
            setMostrarModalPresupuesto(true)
            return
        }

        try {
            let targetTicketId = ticketSeleccionado?.id

            if (!targetTicketId && telefonoRescate) {
                const formData = new FormData()
                formData.append('telefono', telefonoRescate)
                formData.append('equipo', 'Consulta WhatsApp')
                formData.append('fallaReportada', 'Cita Agendada')

                const resCreate = await fetch('/api/tickets', { method: 'POST', body: formData })
                const dataCreate = await resCreate.json()
                if (resCreate.ok && dataCreate.ticket) targetTicketId = dataCreate.ticket.id
            }

            if (!targetTicketId) return alert("Error identificando ficha.")

            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticketId: targetTicketId,
                    nuevoEstado,
                    botActivo: nuevoEstado === 'AGENDADO' ? false : undefined
                })
            })

            if (res.ok) {
                reloadTickets()
                reloadConversaciones()
                if (nuevoEstado === 'AGENDADO') setEstadoBotOptimista(false)
                alert(`✅ Estatus actualizado a ${nuevoEstado}.`)
            }
        } catch (err) {
            alert("Error al actualizar estatus")
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
                    notasDiagnostico
                })
            })

            if (res.ok) {
                setMostrarModalPresupuesto(false)
                reloadTickets()
                alert(`💰 Cotización inyectada.`)
            }
        } catch (err) {
            alert("Error al guardar presupuesto")
        }
    }

    const handleDesecharLead = async (clienteId: string) => {
        if (!confirm("¿Estás seguro de purgar este prospecto de Neon?")) return
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

    const dispararRecordatoriosManual = async () => {
        try {
            const res = await fetch('/api/admin/recordatorios', { method: 'POST' })
            const data = await res.json()
            if (res.ok) alert(`🔔 Procesados ${data.enviados} recordatorios.`)
        } catch (err) {
            alert("Error de conexión")
        }
    }

    const ejecutarLogout = async () => {
        const res = await fetch('/api/admin/logout', { method: 'POST' })
        if (res.ok) router.push('/admin/login')
    }

    // Loader Inicial Suave
    if (!ticketsBrutos.length && !conversacionesData && !cargandoHistorial && esPrimeraCargaChat.current) {
        return <div className="h-screen bg-black text-emerald-400 flex flex-col items-center justify-center font-mono">
            <span className="text-4xl mb-4 animate-bounce">⚡</span>
            Inicializando SO Soltecot_...
        </div>
    }

    return (
        <div className="h-screen bg-black text-white flex flex-col font-sans overflow-hidden">

            {/* 🔝 CABECERA PRINCIPAL (NAVBAR) */}
            <header className="h-auto min-h-[3.5rem] py-2 bg-zinc-950 border-b border-zinc-900 px-3 sm:px-4 flex items-center justify-between shrink-0 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <h1 className="text-base sm:text-lg font-bold text-emerald-400 font-mono tracking-wider">SOLTECOT_ OS</h1>
                    <span className="hidden sm:inline bg-zinc-900 text-zinc-400 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border border-zinc-800">
                        Panel Híbrido
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

                    <button onClick={dispararRecordatoriosManual} className="bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-900/40 text-xs font-bold px-2 py-1.5 rounded transition-colors flex items-center gap-1">
                        <span>🔔</span><span className="hidden sm:inline">Recordatorios</span>
                    </button>

                    <button onClick={() => setModalInactividadAbierto(true)} className="bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-900/40 text-xs font-bold px-2 py-1.5 rounded transition-colors flex items-center gap-1">
                        <span>🌴</span><span className="hidden sm:inline">Vacaciones</span>
                    </button>

                    <button onClick={ejecutarLogout} className="bg-zinc-900 hover:bg-zinc-800 text-rose-500 border border-zinc-800 text-xs px-2 py-1.5 rounded font-bold transition-colors">
                        🚪
                    </button>
                </div>
            </header>

            {/* 🍱 LAYOUT PRINCIPAL (SIDEBAR + CHAT) */}
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