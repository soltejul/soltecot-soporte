'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ModalBloqueos from '../../components/ModalBloqueos'

export default function AdminDashboard() {
    const [tickets, setTickets] = useState<any[]>([])
    const [busqueda, setBusqueda] = useState('')
    const [cargando, setCargando] = useState(true)
    const router = useRouter()

    // 📂 PESTAÑAS Y MODALES
    const [filtroPestana, setFiltroPestana] = useState<'todos' | 'manual' | 'leads' | 'taller'>('todos')
    const [modalInactividadAbierto, setModalInactividadAbierto] = useState(false)

    // 🔍 MODAL DETALLE DE FOLIO (FICHA DE INGRESO)
    const [ticketDetalle, setTicketDetalle] = useState<any>(null)

    // 💬 CENTRO DE CHATS Y MULTIMEDIA NATIVO
    const [conversaciones, setConversaciones] = useState<any[]>([])
    const [telefonoRescate, setTelefonoRescate] = useState('')
    const [mensajeRescate, setMensajeRescate] = useState('')
    const [archivoAdjunto, setArchivoAdjunto] = useState<File | null>(null)
    const [enviandoRescate, setEnviandoRescate] = useState(false)
    const [historialDirecto, setHistorialDirecto] = useState<any[]>([])
    const [cargandoHistorial, setCargandoHistorial] = useState(false)
    const [estadoBotDirecto, setEstadoBotDirecto] = useState<boolean | null>(null)

    // 💰 PRESUPUESTOS Y GESTIÓN DE ORDEN SELECCIONADA
    const [mostrarModalPresupuesto, setMostrarModalPresupuesto] = useState(false)
    const [ticketSeleccionado, setTicketSeleccionado] = useState<any>(null)
    const [costoReparacion, setCostoReparacion] = useState('')
    const [notasDiagnostico, setNotasDiagnostico] = useState('')

    // 🛡️ REFS PARA CONTROL SILENCIOSO DE SCROLL Y POLLING SIN PARPADEO
    const chatEndRef = useRef<HTMLDivElement | null>(null)
    const historialRef = useRef<any[]>([])
    historialRef.current = historialDirecto
    const esPrimeraCargaChat = useRef(true)

    // 📜 CARGAR ÓRDENES DE TALLER Y LEADS
    const cargarTickets = async () => {
        try {
            const res = await fetch('/api/tickets')
            const data = await res.json()
            if (res.ok) {
                const activos = data.filter((t: any) => t.estado !== 'ENTREGADO' && t.estado !== 'RECHAZADO')
                setTickets(activos)
            }
        } catch (err) {
            console.error("Error al cargar órdenes", err)
        } finally {
            setCargando(false)
        }
    }

    // 📜 CARGAR LISTA DE CONVERSACIONES DE WHATSAPP
    const cargarListaConversaciones = async () => {
        try {
            const res = await fetch('/api/admin/mensajes')
            const data = await res.json()
            if (res.ok && data.conversaciones) {
                setConversaciones(data.conversaciones)
            }
        } catch (err) {
            console.error("Error al listar conversaciones", err)
        }
    }

    // 📜 CONSULTAR HISTORIAL DE UN CHAT ESPECÍFICO (COMPLETAMENTE SILENCIOSO)
    const consultarHistorialTelefono = async (num: string, silenciarCarga = false) => {
        const cleanNum = num.replace(/[^0-9]/g, '')
        if (cleanNum.length < 10) {
            setHistorialDirecto([])
            setEstadoBotDirecto(null)
            return
        }
        if (!silenciarCarga) setCargandoHistorial(true)
        try {
            const res = await fetch(`/api/admin/mensajes?telefono=${cleanNum}`)
            const data = await res.json()
            if (res.ok) {
                const nuevosMsgs = data.comparableMensajes || data.mensajes || []

                // 🤐 COMPARA SI REALMENTE CAMBIARON LOS MENSAJES PARA EVITAR RE-RENDERS Y PARPADEO
                const esDiferente = JSON.stringify(nuevosMsgs) !== JSON.stringify(historialRef.current)
                if (esDiferente) {
                    setHistorialDirecto(nuevosMsgs)
                }

                const botActivoReal = data.cliente ? data.cliente.atendidoPorBot : true
                setEstadoBotDirecto(botActivoReal)
            }
        } catch (err) {
            console.error("Error al cargar chat", err)
        } finally {
            if (!silenciarCarga) setCargandoHistorial(false)
        }
    }

    useEffect(() => {
        cargarTickets()
        cargarListaConversaciones()

        const intervaloGlobal = setInterval(() => {
            cargarListaConversaciones()
            cargarTickets()
        }, 10000)
        return () => clearInterval(intervaloGlobal)
    }, [])

    // 🎯 CARGA DE CHAT SELECCIONADO (SIN VINCULAR A LA LISTA COMPLETA DE TICKETS PARA EVITAR RE-EJECUCIONES)
    useEffect(() => {
        if (telefonoRescate) {
            esPrimeraCargaChat.current = true
            consultarHistorialTelefono(telefonoRescate, false)

            const ticketAsociado = tickets.find(t => t.cliente?.telefono?.endsWith(telefonoRescate.slice(-10)))
            setTicketSeleccionado(ticketAsociado || null)
            if (ticketAsociado?.costoReparacion) {
                setCostoReparacion(ticketAsociado.costoReparacion.toString())
            } else {
                setCostoReparacion('')
            }

            const intervaloChat = setInterval(() => {
                consultarHistorialTelefono(telefonoRescate, true)
            }, 5000)
            return () => clearInterval(intervaloChat)
        }
    }, [telefonoRescate])

    // 🔒 SCROLL INTELIGENTE: SÓLO AL ABRIR CHAT O AL MANDAR UN MENSAJE
    useEffect(() => {
        if (esPrimeraCargaChat.current && historialDirecto.length > 0) {
            chatEndRef.current?.scrollIntoView({ behavior: 'auto' })
            esPrimeraCargaChat.current = false
        }
    }, [historialDirecto])

    // ⚡ UNIFICACIÓN ATÓMICA DE TICKETS + CONVERSACIONES
    const listaUnificada = (() => {
        const items: any[] = []
        const telefonosProcesados = new Set<string>()

        // 1️⃣ Añadir todas las órdenes activas del taller (SOL-XXXX y LEAD-XXXX)
        tickets.forEach(ticket => {
            const tel10 = ticket.cliente?.telefono?.replace(/[^0-9]/g, '').slice(-10) || ''
            if (tel10) telefonosProcesados.add(tel10)

            const convAsociada = conversaciones.find(c => c.telefono?.endsWith(tel10))
            const esTallerOficial = ticket.numeroOrden && !ticket.numeroOrden.startsWith('LEAD-')

            // Prioridad absoluta al estado manual del cliente
            const botActivoCalculado = convAsociada?.atendidoPorBot === false
                ? false
                : (ticket.botActivo ?? convAsociada?.atendidoPorBot ?? true)

            items.push({
                id: ticket.id,
                tipo: esTallerOficial ? 'taller' : 'lead',
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

        // 2️⃣ Añadir conversaciones sueltas de WhatsApp
        conversaciones.forEach(conv => {
            const tel10 = conv.telefono?.replace(/[^0-9]/g, '').slice(-10) || ''
            if (!telefonosProcesados.has(tel10)) {
                telefonosProcesados.add(tel10)
                const ultimoMsg = conv.mensajes?.[0]

                items.push({
                    id: conv.id,
                    tipo: 'lead',
                    folio: `LEAD-${tel10}`,
                    nombre: conv.nombre !== 'Cliente WhatsApp' ? conv.nombre : conv.telefono,
                    telefono: conv.telefono,
                    equipo: 'Consulta WhatsApp',
                    falla: ultimoMsg?.texto || 'Consulta general',
                    costo: '',
                    estadoTaller: 'ESPERANDO_APROBACION',
                    botActivo: conv.atendidoPorBot ?? true,
                    ultimoMensaje: ultimoMsg || null,
                    ticketOriginal: null,
                    clienteId: conv.id
                })
            }
        })

        return items
    })()

    // 🎯 FILTRADO UNIFICADO POR BÚSQUEDA Y PESTAÑA
    const itemsFiltrados = listaUnificada.filter((item) => {
        const term = busqueda.toLowerCase().trim()
        const coincideBusqueda =
            item.telefono.includes(term) ||
            item.nombre.toLowerCase().includes(term) ||
            item.folio.toLowerCase().includes(term) ||
            item.equipo.toLowerCase().includes(term)

        if (!coincideBusqueda) return false

        if (filtroPestana === 'manual') return !item.botActivo
        if (filtroPestana === 'taller') return item.tipo === 'taller'
        if (filtroPestana === 'leads') return item.tipo === 'lead'
        return true
    })

    // 📊 CONTEOS EXACTOS
    const conteoTodos = listaUnificada.length
    const conteoManual = listaUnificada.filter(i => !i.botActivo).length
    const conteoTaller = listaUnificada.filter(i => i.tipo === 'taller').length
    const conteoLeads = listaUnificada.filter(i => i.tipo === 'lead').length

    // ⚡ ACCIONES DE CHAT
    const handleEnviarMensaje = async () => {
        const cleanNum = telefonoRescate.replace(/[^0-9]/g, '')
        if (cleanNum.length < 10) return alert('Ingresa un número válido de 10 dígitos')
        if (!mensajeRescate.trim() && !archivoAdjunto) return alert('Escribe un mensaje o adjunta un archivo')

        setEnviandoRescate(true)
        try {
            const formData = new FormData()
            formData.append('telefono', telefonoRescate)
            formData.append('mensaje', mensajeRescate)
            if (archivoAdjunto) formData.append('archivo', archivoAdjunto)

            const res = await fetch('/api/admin/chat-directo', {
                method: 'POST',
                body: formData
            })

            const data = await res.json()

            if (res.ok) {
                setMensajeRescate('')
                setArchivoAdjunto(null)

                esPrimeraCargaChat.current = true // Fuerza el scroll al fondo al enviar mensaje propio
                consultarHistorialTelefono(telefonoRescate, true)
                cargarListaConversaciones()
                setEstadoBotDirecto(false)

                if (data.tipo === 'plantilla_fallback') {
                    alert('⚠️ Pasaron más de 24h desde el último mensaje del cliente. Se envió la plantilla oficial para reactivar el chat.')
                }
            } else {
                alert('Error al enviar mensaje por Meta: ' + (data.error || 'Rechazado'))
            }
        } catch (err) {
            console.error(err)
            alert('Error de conexión')
        } finally {
            setEnviandoRescate(false)
        }
    }

    const handleEnviarPlantillaCotizacion = async (telefono: string) => {
        const cleanNum = telefono.replace(/[^0-9]/g, '')
        if (cleanNum.length < 10) return alert('Ingresa un número válido de 10 dígitos')

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

            const res = await fetch('/api/admin/chat-directo', {
                method: 'POST',
                body: formData
            })

            const data = await res.json()

            if (res.ok) {
                alert('🚀 Plantilla enviada. El canal de chat directo ha quedado abierto.')
                esPrimeraCargaChat.current = true
                consultarHistorialTelefono(telefono, true)
                cargarListaConversaciones()
                setEstadoBotDirecto(false)
            } else {
                alert('🔴 Error: ' + (data.error || 'Rechazado por Meta'))
            }
        } catch (err) {
            alert('Error de conexión')
        } finally {
            setEnviandoRescate(false)
        }
    }

    const handleDesecharLead = async (clienteId: string) => {
        if (!confirm("¿Estás seguro de purgar este prospecto de Neon? Se borrará todo su historial permanentemente.")) return
        try {
            const res = await fetch(`/api/tickets?clienteId=${clienteId}`, { method: 'DELETE' })
            if (res.ok) {
                alert("Prospecto e historial purgados de Neon con éxito.")
                setTelefonoRescate('')
                cargarTickets()
                cargarListaConversaciones()
            } else {
                alert("No se pudo eliminar el lead.")
            }
        } catch (err) {
            console.error("Error al desechar lead", err)
        }
    }

    const toggleBotActual = async () => {
        if (!telefonoRescate) return
        const nuevoEstado = !estadoBotDirecto
        try {
            const res = await fetch('/api/admin/chat-directo', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telefono: telefonoRescate, botActivo: nuevoEstado })
            })
            if (res.ok) {
                setEstadoBotDirecto(nuevoEstado)
                cargarListaConversaciones()
                cargarTickets()
            }
        } catch (err) {
            alert('Error al cambiar estado de la IA')
        }
    }

    const cambiarEstatusTaller = async (nuevoEstado: string) => {
        if (!ticketSeleccionado) return
        if (nuevoEstado === 'ESPERANDO_APROBACION') {
            setMostrarModalPresupuesto(true)
            return
        }

        try {
            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticketId: ticketSeleccionado.id, nuevoEstado })
            })
            if (res.ok) {
                cargarTickets()
                alert("Estatus actualizado con éxito 🚀")
            }
        } catch (err) {
            alert("Error al actualizar estatus")
        }
    }

    const guardarPresupuestoYEnviar = async () => {
        if (!costoReparacion || isNaN(Number(costoReparacion))) {
            alert("Ingresa un costo numérico válido.")
            return
        }

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
                cargarTickets()
                alert(`💰 Cotización inyectada e informada al cliente.`)
            }
        } catch (err) {
            alert("Error al guardar presupuesto")
        }
    }

    const dispararRecordatoriosManual = async () => {
        try {
            const res = await fetch('/api/admin/recordatorios', { method: 'POST' })
            const data = await res.json()
            if (res.ok) {
                alert(`🔔 [SISTEMA]: Procesados ${data.enviados} recordatorios de WhatsApp con éxito. 🚀`)
            }
        } catch (err) {
            alert("Error de conexión")
        }
    }

    const ejecutarLogout = async () => {
        const res = await fetch('/api/admin/logout', { method: 'POST' })
        if (res.ok) router.push('/admin/login')
    }

    if (cargando) return <div className="h-screen bg-black text-white flex items-center justify-center font-mono">Iniciando SO Soltecot_...</div>

    return (
        <div className="h-screen bg-black text-white flex flex-col font-sans overflow-hidden">

            {/* 🔄 BARRA SUPERIOR DE NAVEGACIÓN RESPONSIVA */}
            <header className="h-auto min-h-[3.5rem] py-2 bg-zinc-950 border-b border-zinc-900 px-3 sm:px-4 flex items-center justify-between shrink-0 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <h1 className="text-base sm:text-lg font-bold text-emerald-400 font-mono tracking-wider">SOLTECOT_ OS</h1>
                    <span className="hidden sm:inline bg-zinc-900 text-zinc-400 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border border-zinc-800">
                        Panel Híbrido
                    </span>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <Link
                        href="/admin/ingreso"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-2.5 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm"
                        title="Recibir Equipo en Mostrador"
                    >
                        <span>➕</span>
                        <span className="text-[11px] sm:text-xs">Recibir Equipo</span>
                    </Link>

                    <Link href="/admin/tester" className="bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800/60 text-xs font-bold px-2 py-1.5 rounded transition-colors flex items-center gap-1" title="Gamepad Tester">
                        <span>🎮</span>
                        <span className="hidden sm:inline">Tester</span>
                    </Link>

                    <Link href="/admin/historial" className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-bold px-2 py-1.5 rounded transition-colors flex items-center gap-1" title="Historial">
                        <span>📜</span>
                        <span className="hidden sm:inline">Historial</span>
                    </Link>

                    <button
                        onClick={dispararRecordatoriosManual}
                        className="bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-900/40 text-xs font-bold px-2 py-1.5 rounded transition-colors flex items-center gap-1"
                        title="Procesar cola de recordatorios"
                    >
                        <span>🔔</span>
                        <span className="hidden sm:inline">Recordatorios</span>
                    </button>

                    <button
                        onClick={() => setModalInactividadAbierto(true)}
                        className="bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-900/40 text-xs font-bold px-2 py-1.5 rounded transition-colors flex items-center gap-1"
                        title="Programar vacaciones o inactividad"
                    >
                        <span>🌴</span>
                        <span className="hidden sm:inline">Vacaciones</span>
                    </button>

                    <button onClick={ejecutarLogout} className="bg-zinc-900 hover:bg-zinc-800 text-rose-500 border border-zinc-800 text-xs px-2 py-1.5 rounded font-bold transition-colors">
                        🚪
                    </button>
                </div>
            </header>

            {/* 💬 CONTENEDOR PRINCIPAL TIPO WHATSAPP WEB (2 COLUMNAS) */}
            <div className="flex-1 flex overflow-hidden relative">

                {/* 👈 COLUMNA IZQUIERDA: BUSCADOR, FILTROS Y REGISTROS DE TALLER / LEADS */}
                <aside className={`absolute md:static w-full md:w-[380px] lg:w-[420px] h-full bg-zinc-950 border-r border-zinc-900 flex flex-col shrink-0 z-10 transition-transform duration-300 ${telefonoRescate.length >= 10 ? '-translate-x-full md:translate-x-0' : 'translate-x-0'}`}>

                    {/* BUSCADOR */}
                    <div className="p-3 border-b border-zinc-900">
                        <input
                            type="text"
                            placeholder="🔍 Buscar cliente, teléfono o folio..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 font-mono"
                        />
                    </div>

                    {/* PESTAÑAS DE FILTRADO */}
                    <div className="flex border-b border-zinc-900 bg-zinc-950 text-xs font-bold">
                        <button
                            onClick={() => setFiltroPestana('todos')}
                            className={`flex-1 py-2.5 text-center border-b-2 ${filtroPestana === 'todos' ? 'border-emerald-500 text-emerald-400 bg-zinc-900/50' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Todos ({conteoTodos})
                        </button>
                        <button
                            onClick={() => setFiltroPestana('manual')}
                            className={`flex-1 py-2.5 text-center border-b-2 flex items-center justify-center gap-1 ${filtroPestana === 'manual' ? 'border-rose-500 text-rose-400 bg-rose-950/20' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                        >
                            🚨 Manual ({conteoManual})
                        </button>
                        <button
                            onClick={() => setFiltroPestana('leads')}
                            className={`flex-1 py-2.5 text-center border-b-2 ${filtroPestana === 'leads' ? 'border-amber-500 text-amber-400 bg-zinc-900/50' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                        >
                            🎯 Leads ({conteoLeads})
                        </button>
                        <button
                            onClick={() => setFiltroPestana('taller')}
                            className={`flex-1 py-2.5 text-center border-b-2 ${filtroPestana === 'taller' ? 'border-indigo-500 text-indigo-400 bg-zinc-900/50' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                        >
                            🛠️ Taller ({conteoTaller})
                        </button>
                    </div>

                    {/* LISTA DE REGISTROS (UNIFICADA DE TALLER Y CHATS) */}
                    <div className="flex-1 overflow-y-auto divide-y divide-zinc-900 hide-scrollbar pb-20">
                        {itemsFiltrados.length === 0 ? (
                            <div className="text-center py-8 px-4 text-zinc-600 text-xs">
                                No hay registros en esta sección.
                            </div>
                        ) : (
                            itemsFiltrados.map((item) => {
                                const esSeleccionado = telefonoRescate.endsWith(item.telefono.slice(-10))
                                const ultimoMsg = item.ultimoMensaje
                                const esMensajeCliente = ultimoMsg?.origen === 'CLIENTE'
                                const requiereAtencion = !item.botActivo && esMensajeCliente
                                const esTallerReal = item.tipo === 'taller'

                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => setTelefonoRescate(item.telefono)}
                                        className={`p-3 cursor-pointer transition-colors space-y-1 ${esSeleccionado
                                            ? 'bg-indigo-950/60 border-l-4 border-l-indigo-500'
                                            : requiereAtencion
                                                ? 'bg-rose-950/20 border-l-4 border-l-rose-500 hover:bg-rose-950/30'
                                                : 'bg-zinc-950 hover:bg-zinc-900/60 border-l-4 border-l-transparent'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <span className={`font-bold text-xs truncate max-w-[150px] ${requiereAtencion ? 'text-rose-200' : 'text-zinc-200'}`}>
                                                {item.nombre}
                                            </span>
                                            {ultimoMsg && (
                                                <span className="text-[10px] font-mono text-zinc-500">
                                                    {new Date(ultimoMsg.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex justify-between items-center text-[11px]">
                                            <span className="text-zinc-500 font-mono">📱 {item.telefono}</span>
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${item.botActivo
                                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                                : requiereAtencion
                                                    ? 'bg-rose-950 text-rose-400 border border-rose-800 animate-pulse'
                                                    : 'bg-rose-950 text-rose-400 border border-rose-800'
                                                }`}>
                                                {item.botActivo ? '🤖 IA' : requiereAtencion ? '🚨 RESPUESTA' : '🚨 MAN'}
                                            </span>
                                        </div>

                                        {ultimoMsg ? (
                                            <p className={`text-xs truncate ${requiereAtencion ? 'text-rose-300 font-medium' : 'text-zinc-400'}`}>
                                                <span className="opacity-60">{esMensajeCliente ? '👤 ' : '🛠️ '}</span>
                                                {ultimoMsg.texto}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-zinc-500 truncate italic">
                                                Falla: {item.falla}
                                            </p>
                                        )}

                                        <div className="flex items-center justify-between pt-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${esTallerReal
                                                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800 font-bold'
                                                    : 'bg-amber-950/40 text-amber-400 border-amber-900'
                                                    }`}>
                                                    {item.folio}
                                                </span>
                                                <span className="text-[10px] text-zinc-400 truncate max-w-[150px]">
                                                    {item.equipo}
                                                </span>
                                            </div>
                                            {item.costo && (
                                                <span className="text-[10px] font-mono font-bold text-amber-500">
                                                    ${item.costo}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </aside>

                {/* 👉 COLUMNA DERECHA: CHAT DEDICADO Y FICHA TÉCNICA */}
                <main className="flex-1 bg-zinc-900/30 flex flex-col h-full overflow-hidden w-full relative">

                    {telefonoRescate.length < 10 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-600 space-y-2">
                            <span className="text-4xl">💬</span>
                            <p className="text-xs">Selecciona un equipo u orden de la izquierda para comenzar a gestionar.</p>
                        </div>
                    ) : (
                        <>
                            {/* HEADER DEL CHAT ACTIVO */}
                            <div className="h-16 bg-zinc-950 border-b border-zinc-900 px-2 sm:px-4 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2 sm:gap-3">
                                    <button
                                        onClick={() => setTelefonoRescate('')}
                                        className="md:hidden text-zinc-400 p-1"
                                    >
                                        ⬅️
                                    </button>
                                    <div className="hidden sm:flex w-10 h-10 rounded-full bg-zinc-800 items-center justify-center font-bold text-emerald-400 border border-zinc-700">
                                        {telefonoRescate.slice(-2)}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="font-bold text-sm text-zinc-100 truncate max-w-[120px] sm:max-w-[200px]">
                                                {ticketSeleccionado?.cliente?.nombre || 'Cliente WhatsApp'}
                                            </h2>
                                            {ticketSeleccionado && (
                                                <span className={`border text-[9px] sm:text-[10px] font-mono px-2 py-0.5 rounded font-bold hidden sm:inline-block ${!ticketSeleccionado.numeroOrden.startsWith('LEAD-')
                                                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                                    : 'bg-amber-950 text-amber-400 border-amber-800/60'
                                                    }`}>
                                                    {ticketSeleccionado.numeroOrden}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[10px] sm:text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
                                            <span className="font-mono text-emerald-400">📱 {telefonoRescate}</span>
                                        </p>
                                    </div>
                                </div>

                                {/* ACCIONES Y CONTROL DE MODO DE ATENCIÓN */}
                                <div className="flex items-center gap-2">
                                    {ticketSeleccionado && (
                                        <select
                                            value={ticketSeleccionado.estado}
                                            onChange={(e) => cambiarEstatusTaller(e.target.value)}
                                            className="hidden sm:block bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-amber-400 font-bold outline-none cursor-pointer focus:border-amber-500"
                                        >
                                            <option value="RECIBIDO">🛠️ RECIBIDO</option>
                                            <option value="EN_DIAGNOSTICO">🔬 DIAGNÓSTICO</option>
                                            <option value="ESPERANDO_APROBACION">⏳ APROBACIÓN</option>
                                            <option value="EN_REPARACION">⚙️ REPARACIÓN</option>
                                            <option value="LISTO_PARA_ENTREGA">✅ LISTO</option>
                                            <option value="ENTREGADO">📦 ENTREGADO</option>
                                            <option value="RECHAZADO">❌ RECHAZADO</option>
                                        </select>
                                    )}

                                    <button
                                        onClick={toggleBotActual}
                                        className={`text-[10px] sm:text-xs font-bold px-2 sm:px-3 py-1.5 rounded-lg border transition-all ${estadoBotDirecto
                                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800 hover:bg-emerald-900'
                                            : 'bg-rose-950 text-rose-400 border-rose-600 shadow-[0_0_12px_rgba(225,29,72,0.4)] animate-pulse hover:bg-rose-900'
                                            }`}
                                    >
                                        {estadoBotDirecto ? '🤖 IA Activa' : '🚨 MODO MANUAL ACTIVO'}
                                    </button>
                                </div>
                            </div>

                            {/* BARRA SUPERIOR DE COTIZACIÓN RÁPIDA */}
                            <div className="bg-zinc-950/80 border-b border-zinc-900 px-3 sm:px-4 py-2 flex items-center justify-between text-xs flex-wrap gap-2">
                                <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                                    <span className="text-zinc-400 font-semibold hidden sm:inline">Costo:</span>
                                    <span className="text-zinc-500 font-bold">$</span>
                                    <input
                                        type="number"
                                        placeholder="Monto"
                                        value={costoReparacion}
                                        onChange={(e) => setCostoReparacion(e.target.value)}
                                        className="w-20 sm:w-24 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-amber-400 font-mono font-bold text-center outline-none focus:border-amber-500"
                                    />
                                    {ticketSeleccionado && (
                                        <button
                                            onClick={guardarPresupuestoYEnviar}
                                            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-2 sm:px-3 py-1 rounded transition-colors text-[10px] sm:text-xs whitespace-nowrap"
                                        >
                                            🚀 Inyectar y Reactivar IA
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    {ticketSeleccionado && ticketSeleccionado.numeroOrden.startsWith('LEAD-') && (
                                        <button
                                            onClick={() => handleDesecharLead(ticketSeleccionado.clienteId)}
                                            className="bg-rose-950/40 hover:bg-rose-900 text-rose-400 text-[10px] px-2 py-1 rounded border border-rose-900/50"
                                            title="Purgar Lead definitivamente"
                                        >
                                            🗑️
                                        </button>
                                    )}
                                    {ticketSeleccionado && (
                                        <button
                                            onClick={() => setTicketDetalle(ticketSeleccionado)}
                                            className="bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-[10px] sm:text-[11px] px-2.5 py-1 rounded border border-zinc-800"
                                        >
                                            📋 Ficha
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* VISOR DE CONVERSACIÓN (HISTORIAL DE CHAT) */}
                            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 text-xs bg-[url('/bg-chat.png')] bg-cover bg-center">
                                {cargandoHistorial ? (
                                    <p className="text-zinc-500 text-center py-8">Sincronizando chat...</p>
                                ) : historialDirecto.length === 0 ? (
                                    <p className="text-zinc-600 text-center py-8">Escribe abajo para iniciar la conversación.</p>
                                ) : (
                                    historialDirecto.map((m: any) => {
                                        const esCliente = m.origen === 'CLIENTE'
                                        return (
                                            <div
                                                key={m.id}
                                                className={`flex flex-col ${esCliente ? 'items-start max-w-[85%] sm:max-w-[75%]' : 'items-end max-w-[85%] sm:max-w-[75%] ml-auto'}`}
                                            >
                                                <div
                                                    className={`p-2.5 sm:p-3 rounded-2xl border whitespace-pre-wrap ${esCliente
                                                        ? 'bg-zinc-800 text-zinc-100 rounded-tl-none border-zinc-700/50 shadow-md'
                                                        : 'bg-[#18332f] text-emerald-50 rounded-tr-none border-[#224b45] shadow-md'
                                                        }`}
                                                >
                                                    <div className="flex justify-between items-center gap-3 mb-1 text-[9px] opacity-60">
                                                        <span className="font-bold">{esCliente ? '👤 Cliente' : '🛠️ Taller'}</span>
                                                    </div>
                                                    <p className="text-xs">{m.texto}</p>
                                                    <div className="flex items-center justify-end gap-1 text-[9px] font-mono mt-1 opacity-60">
                                                        <span>{new Date(m.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                                                        {!esCliente && <span className="text-emerald-400 font-bold" title="Mensaje enviado vía Meta Cloud API">✓✓</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            {/* CHIPS DE ACCIÓN RÁPIDA (PLANTILLAS Y SHORTCUTS) */}
                            <div className="bg-zinc-950 px-3 sm:px-4 pt-2 pb-1 flex items-center gap-2 overflow-x-auto text-[11px] hide-scrollbar border-t border-zinc-900 shrink-0">
                                <button
                                    onClick={() => handleEnviarPlantillaCotizacion(telefonoRescate)}
                                    className="bg-amber-950/40 hover:bg-amber-900/60 text-amber-400 px-3 py-1.5 rounded-full border border-amber-900/40 whitespace-nowrap transition-colors shadow-sm font-semibold"
                                >
                                    ⚡ Plantilla de Cotización (+24h)
                                </button>
                                <button
                                    onClick={() => setMensajeRescate("📍 *Ubicación del Laboratorio Soltecot:*\nEstamos en Hacienda Los Geranios, MZ 45 LT 14, Villas Xaltipa 2-C. Cuautitlán, Estado de México.\n\n🗺️ Google Maps: https://maps.google.com/?q=19.68430387588073,-99.15870193124036\n\n🕒 *Horarios con Cita Previa:*\nLunes a Viernes: 7:00 PM a 9:30 PM\nSábados: 10:00 AM a 6:00 PM")}
                                    className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-full border border-zinc-800 whitespace-nowrap transition-colors"
                                >
                                    📍 Ubicación
                                </button>
                                <button
                                    onClick={() => setMensajeRescate("💳 *Datos Bancarios Oficiales Soltecot:*\n\nBanco: BBVA\nCuenta CLABE: 0121 8001 2345 6789 01\nBeneficiario: Solutions & Technology On Time\n\nPor favor, envíame tu comprobante por aquí una vez realizado el pago para ingresarlo al sistema. 🧾")}
                                    className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-full border border-zinc-800 whitespace-nowrap transition-colors"
                                >
                                    💳 Pago BBVA
                                </button>
                            </div>

                            {/* FOOTER DE ENVIAR MENSAJE Y ADJUNTAR EVIDENCIA */}
                            <div className="p-2 sm:p-3 bg-zinc-950 flex flex-wrap items-center gap-2 border-t border-zinc-900 shrink-0">
                                <label
                                    className="cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 p-2.5 sm:p-3 rounded-xl transition-colors flex items-center justify-center shrink-0"
                                    title="Adjuntar foto/video"
                                >
                                    <span className="text-base sm:text-lg">📷</span>
                                    <input
                                        type="file"
                                        accept="image/*,video/*,.pdf"
                                        onChange={(e) => setArchivoAdjunto(e.target.files?.[0] || null)}
                                        className="hidden"
                                    />
                                </label>

                                <div className="flex-1 relative min-w-[150px]">
                                    <textarea
                                        rows={1}
                                        placeholder={archivoAdjunto ? `📎 Adjunto: ${archivoAdjunto.name}` : "Mensaje..."}
                                        value={mensajeRescate}
                                        onChange={(e) => setMensajeRescate(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault()
                                                handleEnviarMensaje()
                                            }
                                        }}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 sm:py-3 text-xs sm:text-sm text-white outline-none focus:border-[#224b45] resize-none font-sans"
                                    />
                                </div>

                                <button
                                    onClick={handleEnviarMensaje}
                                    disabled={enviandoRescate || (!mensajeRescate.trim() && !archivoAdjunto)}
                                    className="bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-xs sm:text-sm px-4 py-2.5 sm:py-3 rounded-xl transition-colors shadow-lg shrink-0 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="hidden sm:inline">{enviandoRescate ? 'Enviando...' : 'Enviar'}</span>
                                    <span>🚀</span>
                                </button>
                            </div>
                        </>
                    )}
                </main>

            </div>

            {/* 📋 MODAL DETALLE DE FICHA TÉCNICA DE RECEPCIÓN */}
            {ticketDetalle && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-zinc-950 border border-zinc-900 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-start border-b border-zinc-900 pb-3">
                            <div>
                                <h3 className="text-lg font-bold text-emerald-400 font-mono">
                                    📋 FICHA DE INGRESO
                                </h3>
                                <p className="text-xs font-mono text-zinc-400 mt-1">{ticketDetalle.numeroOrden}</p>
                                <p className="text-[10px] text-zinc-500">
                                    Registrado el {new Date(ticketDetalle.createdAt).toLocaleString('es-MX')}
                                </p>
                            </div>
                            <button
                                onClick={() => setTicketDetalle(null)}
                                className="text-zinc-500 hover:text-white font-bold text-base"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            {/* DATOS DEL CLIENTE CON EDICIÓN DE TELÉFONO */}
                            <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-900">
                                <span className="text-zinc-500 uppercase font-bold text-[10px] block mb-1">Cliente y Contacto</span>
                                <p className="text-zinc-200 font-semibold text-sm">{ticketDetalle.cliente?.nombre || 'Sin Nombre'}</p>

                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                    <span className="text-sm">📱</span>
                                    <input
                                        type="text"
                                        defaultValue={ticketDetalle.cliente?.telefono || ''}
                                        id={`edit-phone-${ticketDetalle.id}`}
                                        className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-emerald-400 font-mono focus:border-emerald-500 outline-none w-36"
                                        placeholder="10 dígitos"
                                    />
                                    <button
                                        onClick={async () => {
                                            const inputEl = document.getElementById(`edit-phone-${ticketDetalle.id}`) as HTMLInputElement
                                            const rawPhone = inputEl?.value || ''
                                            const clean = rawPhone.replace(/[^0-9]/g, '').slice(-10)

                                            if (!clean || clean.length < 10) return alert('Por favor ingresa un número de 10 dígitos.')

                                            try {
                                                const res = await fetch('/api/tickets', {
                                                    method: 'PATCH',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ ticketId: ticketDetalle.id, telefonoNuevo: clean, reenviarNotificacion: true })
                                                })
                                                if (res.ok) {
                                                    alert(`✅ Teléfono actualizado a ${clean} y notificación reenviada.`)
                                                    setTicketDetalle(null)
                                                    cargarTickets()
                                                }
                                            } catch (err) {
                                                alert('Error de conexión')
                                            }
                                        }}
                                        className="bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-800 text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors"
                                    >
                                        ✏️ Actualizar
                                    </button>
                                </div>
                            </div>

                            {/* EQUIPO Y FALLA REPORTADA */}
                            <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-900 space-y-2">
                                <div>
                                    <span className="text-zinc-500 uppercase font-bold text-[10px] block mb-0.5">Dispositivo / Equipo</span>
                                    <p className="text-zinc-200 font-bold">{ticketDetalle.equipo}</p>
                                </div>
                                <div>
                                    <span className="text-zinc-500 uppercase font-bold text-[10px] block mb-0.5">Falla Reportada</span>
                                    <p className="text-amber-300 font-medium bg-zinc-950/80 p-2 rounded-lg border border-zinc-800/80">
                                        {ticketDetalle.fallaReportada || 'Sin detalle de falla.'}
                                    </p>
                                </div>
                            </div>

                            {/* DIAGNÓSTICO EN TALLER */}
                            {ticketDetalle.notasDiagnostico && (
                                <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-900">
                                    <span className="text-zinc-500 uppercase font-bold text-[10px] block mb-1">Notas de Diagnóstico en Taller</span>
                                    <p className="text-indigo-300 font-mono text-[11px] whitespace-pre-wrap">{ticketDetalle.notasDiagnostico}</p>
                                </div>
                            )}

                            {/* EVIDENCIA GOOGLE DRIVE */}
                            {ticketDetalle.fotosIngreso && ticketDetalle.fotosIngreso.length > 0 && (
                                <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-900">
                                    <span className="text-zinc-500 uppercase font-bold text-[10px] block mb-2">Evidencias Fotográficas</span>
                                    <div className="flex flex-wrap gap-2">
                                        {ticketDetalle.fotosIngreso.map((fotoId: string, idx: number) => (
                                            <a
                                                key={fotoId}
                                                href={`https://drive.google.com/file/d/${fotoId}/view`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                            >
                                                📷 Foto Evidencia {idx + 1}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end pt-2">
                            <button
                                onClick={() => setTicketDetalle(null)}
                                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 font-bold transition-colors"
                            >
                                Cerrar Ficha
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE PRESUPUESTO */}
            {mostrarModalPresupuesto && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-zinc-950 border border-zinc-900 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-amber-400 mb-1">💰 Enviar Presupuesto</h3>
                        <p className="text-xs text-zinc-400 mb-4">Orden: <span className="text-emerald-400 font-mono font-bold">{ticketSeleccionado?.numeroOrden}</span></p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Costo Total ($ MXN)</label>
                                <input
                                    type="number"
                                    placeholder="Ej: 2450"
                                    value={costoReparacion}
                                    onChange={(e) => setCostoReparacion(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-base text-white outline-none focus:border-amber-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Detalles del Diagnóstico</label>
                                <textarea
                                    placeholder="Indica qué componentes se van a reparar..."
                                    rows={3}
                                    value={notasDiagnostico}
                                    onChange={(e) => setNotasDiagnostico(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-base text-white outline-none focus:border-amber-500 resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setMostrarModalPresupuesto(false)}
                                className="px-4 py-2 rounded-xl bg-zinc-900 text-sm text-zinc-400"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={guardarPresupuestoYEnviar}
                                className="px-4 py-2 rounded-xl bg-amber-500 font-bold text-black text-sm"
                            >
                                Enviar 🚀
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE BLOQUEOS / VACACIONES */}
            <ModalBloqueos
                isOpen={modalInactividadAbierto}
                onClose={() => setModalInactividadAbierto(false)}
            />
        </div>
    )
}