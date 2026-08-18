'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ModalChat from '../../components/ModalChat'
import ModalBloqueos from '../../components/ModalBloqueos'

export default function AdminDashboard() {
    const [tickets, setTickets] = useState<any[]>([])
    const [busqueda, setBusqueda] = useState('')
    const [cargando, setCargando] = useState(true)
    const router = useRouter()

    // 📂 PESTAÑAS Y MODALES
    const [pestanaActiva, setPestanaActiva] = useState<'taller' | 'leads'>('taller')
    const [modalInactividadAbierto, setModalInactividadAbierto] = useState(false)

    // 💬 CENTRO DE CHATS Y MULTIMEDIA
    const [modalChatDirecto, setModalChatDirecto] = useState(false)
    const [conversaciones, setConversaciones] = useState<any[]>([])
    const [cargandoListaChats, setCargandoListaChats] = useState(false)
    const [filtroChat, setFiltroChat] = useState('')

    const [telefonoRescate, setTelefonoRescate] = useState('')
    const [mensajeRescate, setMensajeRescate] = useState('')
    const [archivoAdjunto, setArchivoAdjunto] = useState<File | null>(null)
    const [enviandoRescate, setEnviandoRescate] = useState(false)
    const [historialDirecto, setHistorialDirecto] = useState<any[]>([])
    const [cargandoHistorial, setCargandoHistorial] = useState(false)
    const [estadoBotDirecto, setEstadoBotDirecto] = useState<boolean | null>(null)

    // 💰 PRESUPUESTOS Y MODAL CHAT NATIVO
    const [preciosLeads, setPreciosLeads] = useState<{ [key: string]: string }>({})
    const [mostrarModalPresupuesto, setMostrarModalPresupuesto] = useState(false)
    const [ticketSeleccionado, setTicketSeleccionado] = useState<any>(null)
    const [costoReparacion, setCostoReparacion] = useState('')
    const [notasDiagnostico, setNotasDiagnostico] = useState('')
    const [chatAbierto, setChatAbierto] = useState(false)
    const [clienteSeleccionado, setClienteSeleccionado] = useState<any>(null)

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

    // 📜 CARGAR LISTA DE CONVERSACIONES
    const cargarListaConversaciones = async () => {
        setCargandoListaChats(true)
        try {
            const res = await fetch('/api/admin/mensajes')
            const data = await res.json()
            if (res.ok && data.conversaciones) {
                setConversaciones(data.conversaciones)
            }
        } catch (err) {
            console.error("Error al listar conversaciones", err)
        } finally {
            setCargandoListaChats(false)
        }
    }

    // 📜 CONSULTAR UN CHAT ESPECÍFICO
    const consultarHistorialTelefono = async (num: string) => {
        const cleanNum = num.replace(/[^0-9]/g, '')
        if (cleanNum.length < 10) {
            setHistorialDirecto([])
            setEstadoBotDirecto(null)
            return
        }
        setCargandoHistorial(true)
        try {
            const res = await fetch(`/api/admin/mensajes?telefono=${cleanNum}`)
            const data = await res.json()
            if (res.ok) {
                setHistorialDirecto(data.mensajes || [])
                setEstadoBotDirecto(data.cliente ? data.cliente.atendidoPorBot : true)
            } else {
                setHistorialDirecto([])
                setEstadoBotDirecto(null)
            }
        } catch (err) {
            console.error("Error al cargar chat", err)
            setHistorialDirecto([])
        } finally {
            setCargandoHistorial(false)
        }
    }

    useEffect(() => {
        cargarTickets()
    }, [])

    useEffect(() => {
        if (modalChatDirecto) {
            cargarListaConversaciones()
            if (telefonoRescate) {
                consultarHistorialTelefono(telefonoRescate)
            }
        }
    }, [modalChatDirecto, telefonoRescate])

    const dispararRecordatoriosManual = async () => {
        try {
            const res = await fetch('/api/admin/recordatorios', { method: 'POST' })
            const data = await res.json()
            if (res.ok) {
                alert(`🔔 [SISTEMA]: Se procesaron y enviaron ${data.enviados} recordatorios de WhatsApp con éxito.🚀`)
            } else {
                alert("Error al procesar la cola de recordatorios")
            }
        } catch (err) {
            alert("Error de conexión con el servidor de alertas")
        }
    }

    const toggleBot = async (ticketId: string, botActivoActual: boolean) => {
        try {
            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticketId, botActivo: !botActivoActual })
            })
            if (res.ok) {
                cargarTickets()
            } else {
                alert("No se pudo cambiar el estado del bot")
            }
        } catch (err) {
            console.error("Error al alternar el bot", err)
        }
    }

    const cambiarEstatus = async (ticket: any, nuevoEstado: string) => {
        if (nuevoEstado === 'ESPERANDO_APROBACION') {
            setTicketSeleccionado(ticket)
            setCostoReparacion(ticket.costoReparacion || '')
            setNotasDiagnostico(ticket.notasDiagnostico || '')
            setMostrarModalPresupuesto(true)
            return
        }

        try {
            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticketId: ticket.id, nuevoEstado })
            })
            if (res.ok) {
                cargarTickets()
                alert("Estatus actualizado con éxito 🚀")
            }
        } catch (err) {
            alert("Error al actualizar el estatus")
        }
    }

    const handleReactivarLead = async (ticketId: string, precio: string) => {
        if (!precio || isNaN(Number(precio))) {
            alert("Por favor ingresa un costo numérico válido.")
            return
        }
        try {
            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticketId,
                    costoReparacion: parseFloat(precio),
                    nuevoEstado: 'ESPERANDO_APROBACION',
                    botActivo: true
                })
            })
            if (res.ok) {
                alert("💰 ¡Cotización inyectada! El Asistente Virtual ha retomado el chat en WhatsApp.")
                cargarTickets()
            } else {
                alert("No se pudo reactivar el prospecto.")
            }
        } catch (err) {
            console.error("Error al reactivar lead", err)
        }
    }

    const handleDesecharLead = async (clienteId: string) => {
        if (!confirm("¿Estás seguro de que deseas eliminar este prospecto? Se borrará todo su historial permanentemente de la base de datos para no generar volumen innecesario.")) return
        try {
            const res = await fetch(`/api/tickets?clienteId=${clienteId}`, {
                method: 'DELETE'
            })
            if (res.ok) {
                alert("🧼 Prospecto e historial purgados de Neon con éxito.")
                cargarTickets()
            } else {
                alert("No se pudo eliminar el lead.")
            }
        } catch (err) {
            console.error("Error al desechar lead", err)
        }
    }

    const guardarPresupuestoYEnviar = async () => {
        if (!costoReparacion || isNaN(Number(costoReparacion))) {
            alert("Por favor ingresa un costo numérico válido.")
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
                alert(`💰 Cotización guardada y enviada a ${ticketSeleccionado.cliente?.nombre} por WhatsApp exitosamente! 🚀`)
            }
        } catch (err) {
            alert("Error al enviar el presupuesto")
        }
    }

    const ejecutarLogout = async () => {
        const res = await fetch('/api/admin/logout', { method: 'POST' })
        if (res.ok) router.push('/admin/login')
    }

    const ticketsFiltrados = tickets.filter((t) => {
        const termino = busqueda.toLowerCase().trim()
        const fechaLegible = new Date(t.createdAt).toLocaleDateString('es-MX')

        return (
            t.numeroOrden.toLowerCase().includes(termino) ||
            (t.cliente?.nombre || '').toLowerCase().includes(termino) ||
            t.equipo.toLowerCase().includes(termino) ||
            fechaLegible.includes(termino)
        )
    })

    const esLeadPuro = (t: any) => t.numeroOrden.startsWith('LEAD-') && t.estado === 'ESPERANDO_APROBACION'

    const listaWorkshop = ticketsFiltrados.filter(t => !esLeadPuro(t))
    const listaLeads = ticketsFiltrados.filter(t => esLeadPuro(t))

    const totalWorkshopGlobal = tickets.filter(t => !esLeadPuro(t)).length
    const totalLeadsGlobal = tickets.filter(t => esLeadPuro(t)).length

    const conversacionesFiltradas = conversaciones.filter((c) => {
        const term = filtroChat.toLowerCase().trim()
        return c.telefono.includes(term) || (c.nombre || '').toLowerCase().includes(term)
    })

    if (cargando) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Iniciando el Centro de Control de Soltecot_...</div>

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-6 relative">
            <div className="max-w-6xl mx-auto">

                {/* 🔄 ENCABEZADO RESPONSIVO */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-zinc-900 pb-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-emerald-400">SOLTECOT_ WORKSHOP</h1>
                        <p className="text-xs text-zinc-500 uppercase tracking-widest">Panel Híbrido: Taller y Bandeja de Leads</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                        <button
                            onClick={() => setModalChatDirecto(true)}
                            className="flex-1 md:flex-none bg-indigo-950 hover:bg-indigo-900 text-indigo-400 border border-indigo-900/40 font-bold px-3 py-2 rounded text-xs md:text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
                            title="Abrir Centro de Chats WhatsApp"
                        >
                            💬 Mensajería Directa
                        </button>

                        <button
                            onClick={() => setModalInactividadAbierto(true)}
                            className="flex-1 md:flex-none bg-zinc-950 hover:bg-zinc-900 text-amber-400 border border-amber-900/40 font-bold px-3 py-2 rounded text-xs md:text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
                            title="Programar periodo de inactividad / vacaciones"
                        >
                            🌴 Inactividad
                        </button>

                        <button
                            onClick={dispararRecordatoriosManual}
                            className="flex-1 md:flex-none bg-zinc-950 hover:bg-zinc-900 text-amber-400 border border-amber-900/40 font-bold px-3 py-2 rounded text-xs md:text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
                        >
                            🔔 Recordatorios
                        </button>

                        <Link href="/admin/historial" className="flex-1 md:flex-none bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-bold px-3 py-2 rounded text-xs md:text-sm transition-colors text-center">
                            📜 Historial
                        </Link>

                        <Link href="/admin/ingreso" className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-500 font-bold px-3 py-2 rounded text-xs md:text-sm transition-colors text-center">
                            ➕ Recibir Equipo
                        </Link>

                        <Link
                            href="/admin/tester"
                            className="flex-1 md:flex-none bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-900/50 font-bold px-3 py-2 rounded text-xs md:text-sm transition-colors text-center flex items-center justify-center gap-2 shadow-sm"
                        >
                            🎮 Gamepad Tester
                        </Link>

                        <button onClick={ejecutarLogout} className="bg-zinc-950 hover:bg-zinc-900 text-rose-500 border border-zinc-900 font-semibold px-3 py-2 rounded text-xs md:text-sm transition-colors">
                            🚪
                        </button>
                    </div>
                </div>

                {/* BARRA DE BÚSQUEDA */}
                <div className="mb-6">
                    <input
                        type="text"
                        placeholder="🔍 Buscar por folio, nombre de cliente, dispositivo..."
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-900 rounded-xl p-3 md:p-3.5 text-sm md:text-base text-white outline-none focus:border-emerald-500 transition-colors shadow-inner"
                    />
                </div>

                {/* 📂 PESTAÑAS */}
                <div className="flex border-b border-zinc-900 mb-6 overflow-x-auto pb-1 hide-scrollbar">
                    <button
                        onClick={() => setPestanaActiva('taller')}
                        className={`py-3 px-4 md:px-6 font-bold text-xs uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${pestanaActiva === 'taller'
                            ? 'border-emerald-500 text-emerald-400 bg-zinc-950/40'
                            : 'border-transparent text-zinc-500 hover:text-zinc-300'
                            }`}
                    >
                        🛠️ Banco de Trabajo ({totalWorkshopGlobal})
                    </button>
                    <button
                        onClick={() => setPestanaActiva('leads')}
                        className={`py-3 px-4 md:px-6 font-bold text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${pestanaActiva === 'leads'
                            ? 'border-amber-500 text-amber-400 bg-zinc-950/40'
                            : 'border-transparent text-zinc-500 hover:text-zinc-300'
                            }`}
                    >
                        🎯 Bandeja de Leads ({totalLeadsGlobal})
                        {totalLeadsGlobal > 0 && (
                            <span className="bg-amber-500 text-black text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
                                S.O.S
                            </span>
                        )}
                    </button>
                </div>

                {/* TAB 1: BANCO DE TRABAJO */}
                {pestanaActiva === 'taller' && (
                    <div className="bg-zinc-950 border border-zinc-900 rounded-xl overflow-hidden shadow-2xl animate-fade-in overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[700px]">
                            <thead>
                                <tr className="bg-zinc-900 border-b border-zinc-800 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                    <th className="p-3 md:p-4">Folio</th>
                                    <th className="p-3 md:p-4">Fecha</th>
                                    <th className="p-3 md:p-4">Cliente / Teléfono</th>
                                    <th className="p-3 md:p-4">Agente Bot</th>
                                    <th className="p-3 md:p-4">Equipo</th>
                                    <th className="p-3 md:p-4">Estatus en Taller</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900 text-sm">
                                {listaWorkshop.map((t) => (
                                    <tr key={t.id} className={`transition-all duration-300 ${!t.botActivo
                                        ? 'bg-rose-950/10 border-l-4 border-l-rose-500 hover:bg-rose-950/20'
                                        : 'border-l-4 border-l-transparent hover:bg-zinc-900/50'
                                        }`}>
                                        <td className="p-3 md:p-4 font-bold text-emerald-400">{t.numeroOrden}</td>
                                        <td className="p-3 md:p-4 text-zinc-500 text-xs">{new Date(t.createdAt).toLocaleDateString('es-MX')}</td>
                                        <td className="p-3 md:p-4">
                                            <div className="font-semibold text-zinc-200">{t.cliente?.nombre}</div>
                                            <div className="text-xs text-zinc-500">{t.cliente?.telefono}</div>
                                        </td>
                                        <td className="p-3 md:p-4">
                                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                                                <button
                                                    onClick={() => toggleBot(t.id, t.botActivo)}
                                                    className={`px-3 py-1 rounded-full text-[10px] md:text-xs font-bold border transition-all ${t.botActivo
                                                        ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30 hover:bg-emerald-900/40'
                                                        : 'bg-rose-950 text-rose-400 border-rose-500 shadow-[0_0_12px_rgba(225,29,72,0.4)] animate-pulse'
                                                        }`}
                                                >
                                                    {t.botActivo ? '🤖 IA ACTIVA' : '🚨 MANUAL'}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setClienteSeleccionado(t.cliente)
                                                        setTicketSeleccionado(t)
                                                        setChatAbierto(true)
                                                    }}
                                                    className={`text-[10px] md:text-xs px-3 py-1 rounded-full border transition-colors shadow-sm flex items-center gap-1 ${!t.botActivo ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'}`}
                                                    title="Abrir Chat"
                                                >
                                                    💬 Chat
                                                </button>
                                            </div>
                                        </td>
                                        <td className="p-3 md:p-4 text-zinc-300 font-medium">
                                            {t.equipo}
                                            {t.costoReparacion && (
                                                <div className="text-xs text-amber-500 font-semibold mt-0.5">💰 ${t.costoReparacion}</div>
                                            )}
                                        </td>
                                        <td className="p-3 md:p-4">
                                            <select
                                                value={t.estado}
                                                onChange={(e) => cambiarEstatus(t, e.target.value)}
                                                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-emerald-500 cursor-pointer font-semibold max-w-[150px] truncate"
                                            >
                                                <option value="RECIBIDO">🛠️ RECIBIDO</option>
                                                <option value="EN_DIAGNOSTICO">🔬 DIAGNÓSTICO</option>
                                                <option value="ESPERANDO_APROBACION">⏳ APROBACIÓN</option>
                                                <option value="EN_REPARACION">⚙️ REPARACIÓN</option>
                                                <option value="LISTO_PARA_ENTREGA">✅ LISTO</option>
                                                <option value="ENTREGADO">📦 ENTREGADO</option>
                                                <option value="RECHAZADO">❌ RECHAZADO</option>
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                                {listaWorkshop.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="text-center p-8 text-zinc-600">No se encontraron órdenes activas en el laboratorio.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* TAB 2: BANDEJA DE LEADS */}
                {pestanaActiva === 'leads' && (
                    <div className="bg-zinc-950 border border-zinc-900 rounded-xl overflow-hidden shadow-2xl animate-fade-in overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[700px]">
                            <thead>
                                <tr className="bg-zinc-900 border-b border-zinc-800 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                    <th className="p-3 md:p-4">Prospecto</th>
                                    <th className="p-3 md:p-4">Contacto</th>
                                    <th className="p-3 md:p-4">Interés Inicial</th>
                                    <th className="p-3 md:p-4 text-center">Inyectar Rango / Cotización</th>
                                    <th className="p-3 md:p-4 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900 text-sm">
                                {listaLeads.map((t) => (
                                    <tr key={t.id} className="bg-amber-950/5 hover:bg-amber-950/10 transition-colors border-l-4 border-l-amber-500">
                                        <td className="p-3 md:p-4 font-mono text-xs text-amber-400 font-bold">{t.numeroOrden}</td>
                                        <td className="p-3 md:p-4">
                                            <div className="font-semibold text-zinc-200">{t.cliente?.nombre || 'Prospecto WhatsApp'}</div>
                                            <div className="text-xs text-zinc-500">{t.cliente?.telefono}</div>
                                        </td>
                                        <td className="p-3 md:p-4">
                                            <div className="text-sm font-medium text-zinc-300">{t.equipo}</div>
                                            <div className="text-xs text-zinc-500 truncate max-w-xs">{t.fallaReportada}</div>
                                        </td>
                                        <td className="p-3 md:p-4">
                                            <div className="flex items-center justify-center gap-1 md:gap-2">
                                                <span className="text-zinc-600 text-sm">$</span>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    placeholder="Ej: 1250"
                                                    value={preciosLeads[t.id] || ''}
                                                    onChange={(e) => setPreciosLeads({ ...preciosLeads, [t.id]: e.target.value })}
                                                    className="w-20 md:w-24 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-base text-center focus:border-amber-500 focus:outline-none text-amber-400 font-bold"
                                                />
                                                <button
                                                    onClick={() => handleReactivarLead(t.id, preciosLeads[t.id])}
                                                    className="bg-amber-500 hover:bg-amber-400 text-black text-[10px] md:text-xs font-bold px-2 py-1.5 md:px-3 rounded transition-all tracking-wide shadow-md"
                                                >
                                                    🚀 IA
                                                </button>
                                            </div>
                                        </td>
                                        <td className="p-3 md:p-4 text-center">
                                            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        setClienteSeleccionado(t.cliente)
                                                        setTicketSeleccionado(t)
                                                        setChatAbierto(true)
                                                    }}
                                                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-3 py-1.5 rounded text-xs text-zinc-300 font-medium transition-colors w-full sm:w-auto"
                                                >
                                                    💬 Chat
                                                </button>
                                                <button
                                                    onClick={() => handleDesecharLead(t.clienteId)}
                                                    className="bg-rose-950/30 hover:bg-rose-900 border border-rose-900/40 text-rose-400 text-xs font-semibold px-3 py-1.5 rounded transition-all w-full sm:w-auto"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {listaLeads.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="text-center p-8 text-zinc-600">Bandeja de Leads vacía. No hay prospectos pendientes.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* MODAL: ENVÍO DE PRESUPUESTO */}
            {mostrarModalPresupuesto && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-zinc-950 border border-zinc-900 rounded-2xl w-full max-w-md p-6 shadow-2xl mt-[-10vh]">
                        <h3 className="text-lg font-bold text-amber-400 mb-1">💰 Enviar Presupuesto</h3>
                        <p className="text-xs text-zinc-400 mb-4">Orden: <span className="text-emerald-400 font-mono font-bold">{ticketSeleccionado?.numeroOrden}</span></p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Costo Total ($ MXN)</label>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    placeholder="Ej: 2450"
                                    value={costoReparacion}
                                    onChange={(e) => setCostoReparacion(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-base text-white outline-none focus:border-amber-500 transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Detalles del Diagnóstico</label>
                                <textarea
                                    placeholder="Indica qué componentes se van a reparar..."
                                    rows={3}
                                    value={notasDiagnostico}
                                    onChange={(e) => setNotasDiagnostico(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-base text-white outline-none focus:border-amber-500 transition-colors resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setMostrarModalPresupuesto(false)}
                                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-sm text-zinc-400 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={guardarPresupuestoYEnviar}
                                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-black text-sm transition-colors shadow-lg"
                            >
                                Enviar 🚀
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE CHAT NATIVO */}
            {chatAbierto && clienteSeleccionado && (
                <ModalChat
                    isOpen={chatAbierto}
                    onClose={() => setChatAbierto(false)}
                    clienteId={clienteSeleccionado.id}
                    nombreCliente={clienteSeleccionado.nombre}
                    telefono={clienteSeleccionado.telefono}
                    ticketId={ticketSeleccionado?.id}
                />
            )}

            {/* MODAL DE CONTROL DE INACTIVIDAD */}
            <ModalBloqueos
                isOpen={modalInactividadAbierto}
                onClose={() => setModalInactividadAbierto(false)}
            />

            {/* 💬 MODAL DE CENTRO DE CHATS WHATSAPP (DOS COLUMNAS) */}
            {modalChatDirecto && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in">
                    <div className="bg-zinc-950 border border-zinc-900 rounded-2xl w-full max-w-4xl p-4 md:p-6 shadow-2xl flex flex-col h-[85vh] max-h-[700px]">

                        {/* ENCABEZADO */}
                        <div className="flex justify-between items-center border-b border-zinc-900 pb-3 mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-indigo-400 flex items-center gap-2">
                                    💬 Centro de Mensajería WhatsApp
                                </h3>
                                <p className="text-xs text-zinc-500">Selecciona una conversación previa o inicia un nuevo chat.</p>
                            </div>
                            <button
                                onClick={() => {
                                    setModalChatDirecto(false)
                                    setTelefonoRescate('')
                                    setMensajeRescate('')
                                    setArchivoAdjunto(null)
                                }}
                                className="text-zinc-500 hover:text-white font-bold text-base"
                            >
                                ✕
                            </button>
                        </div>

                        {/* ESTRUCTURA PRINCIPAL DE 2 COLUMNAS */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 overflow-hidden">

                            {/* 👈 COLUMNA IZQUIERDA: LISTA DE CONVERSACIONES */}
                            <div className="md:col-span-5 border-r border-zinc-900 pr-0 md:pr-4 flex flex-col h-full overflow-hidden">

                                {/* BUSCADOR / NUEVO NÚMERO */}
                                <div className="mb-3 space-y-2">
                                    <input
                                        type="text"
                                        placeholder="🔍 Buscar por nombre o teléfono..."
                                        value={filtroChat}
                                        onChange={(e) => setFiltroChat(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                                    />
                                </div>

                                {/* LISTA SCROLLABLE DE CHATS */}
                                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 hide-scrollbar">
                                    {cargandoListaChats ? (
                                        <p className="text-zinc-500 text-center py-8 text-xs">Cargando conversaciones...</p>
                                    ) : conversacionesFiltradas.length === 0 ? (
                                        <div className="text-center py-8 px-2">
                                            <p className="text-zinc-600 text-xs mb-2">No hay chats que coincidan.</p>
                                            {filtroChat.replace(/[^0-9]/g, '').length >= 10 && (
                                                <button
                                                    onClick={() => {
                                                        const clean = filtroChat.replace(/[^0-9]/g, '').slice(-10)
                                                        setTelefonoRescate(clean)
                                                    }}
                                                    className="bg-indigo-950 text-indigo-400 border border-indigo-800 text-[11px] font-bold px-3 py-1.5 rounded-lg"
                                                >
                                                    ➕ Iniciar chat con {filtroChat}
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        conversacionesFiltradas.map((c) => {
                                            const esSeleccionado = telefonoRescate.endsWith(c.telefono.slice(-10))
                                            const ultimoMsg = c.mensajes[0]

                                            return (
                                                <button
                                                    key={c.id}
                                                    onClick={() => setTelefonoRescate(c.telefono)}
                                                    className={`w-full text-left p-3 rounded-xl border transition-all flex flex-col gap-1 ${esSeleccionado
                                                        ? 'bg-indigo-950/60 border-indigo-600/60 text-white shadow-md'
                                                        : 'bg-zinc-900/40 border-zinc-900 text-zinc-300 hover:bg-zinc-900/80 hover:border-zinc-800'
                                                        }`}
                                                >
                                                    <div className="flex justify-between items-center w-full">
                                                        <span className="font-bold text-xs truncate max-w-[130px]">
                                                            {c.nombre !== 'Cliente WhatsApp' ? c.nombre : c.telefono}
                                                        </span>
                                                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${c.atendidoPorBot ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                                                            }`}>
                                                            {c.atendidoPorBot ? '🤖 IA' : '🚨 MAN'}
                                                        </span>
                                                    </div>

                                                    <p className="text-[11px] text-zinc-500 font-mono">{c.telefono}</p>

                                                    {ultimoMsg && (
                                                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                                                            <span className="opacity-60">{ultimoMsg.origen === 'CLIENTE' ? '👤' : '🛠️'} </span>
                                                            {ultimoMsg.texto}
                                                        </p>
                                                    )}
                                                </button>
                                            )
                                        })
                                    )}
                                </div>
                            </div>

                            {/* 👉 COLUMNA DERECHA: VISOR Y ACCIONES DE CHAT */}
                            <div className="md:col-span-7 flex flex-col h-full overflow-hidden space-y-3">

                                {telefonoRescate.length < 10 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-600 space-y-2 border border-dashed border-zinc-900 rounded-xl">
                                        <span className="text-3xl">💬</span>
                                        <p className="text-xs">Selecciona una conversación de la izquierda o ingresa un número de 10 dígitos en el buscador para chatear.</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* BARRA SUPERIOR DE CHAT SELECCIONADO */}
                                        <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 p-2.5 rounded-xl">
                                            <div>
                                                <p className="text-xs font-bold text-indigo-300 font-mono">📱 {telefonoRescate}</p>
                                                <p className="text-[10px] text-zinc-500">
                                                    {estadoBotDirecto ? '🤖 Bot respondiendo' : '🚨 Modo Manual Activo'}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={async () => {
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
                                                            }
                                                        } catch (err) {
                                                            alert('Error al cambiar estado del bot')
                                                        }
                                                    }}
                                                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${estadoBotDirecto
                                                        ? 'bg-amber-950/50 text-amber-400 border-amber-800 hover:bg-amber-900/50'
                                                        : 'bg-emerald-950/50 text-emerald-400 border-emerald-800 hover:bg-emerald-900/50'
                                                        }`}
                                                >
                                                    {estadoBotDirecto ? '🚨 Pausar Bot' : '🤖 Entregar a IA'}
                                                </button>

                                                <button
                                                    onClick={async () => {
                                                        if (!confirm("¿Deseas purgar la conversación de este número de la base de datos?")) return
                                                        try {
                                                            const res = await fetch(`/api/admin/mensajes?telefono=${telefonoRescate}`, { method: 'DELETE' })
                                                            if (res.ok) {
                                                                setHistorialDirecto([])
                                                                setTelefonoRescate('')
                                                                cargarListaConversaciones()
                                                                alert("🧼 Historial de chat purgado con éxito.")
                                                            }
                                                        } catch (err) {
                                                            alert("Error al purgar conversación")
                                                        }
                                                    }}
                                                    className="bg-rose-950/40 hover:bg-rose-900 border border-rose-900/50 text-rose-400 p-1.5 rounded-lg text-xs font-bold transition-colors"
                                                    title="Purga el historial de mensajes"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>

                                        {/* CAJA DE MENSAJES SCROLLABLE CON FECHA Y HORA */}
                                        <div className="flex-1 bg-zinc-900/40 border border-zinc-900 rounded-xl p-3 overflow-y-auto space-y-2 text-xs">
                                            {cargandoHistorial ? (
                                                <p className="text-zinc-500 text-center py-8">Cargando mensajes...</p>
                                            ) : historialDirecto.length === 0 ? (
                                                <p className="text-zinc-600 text-center py-8">Sin historial de mensajes. Escribe abajo para enviar.</p>
                                            ) : (
                                                historialDirecto.map((m: any) => {
                                                    const fechaObj = new Date(m.createdAt)
                                                    const horaFormateada = fechaObj.toLocaleTimeString('es-MX', {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        hour12: true
                                                    })
                                                    const fechaFormateada = fechaObj.toLocaleDateString('es-MX', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        year: '2-digit'
                                                    })

                                                    return (
                                                        <div
                                                            key={m.id}
                                                            className={`p-2.5 rounded-xl max-w-[85%] ${m.origen === 'CLIENTE'
                                                                ? 'bg-zinc-800 text-zinc-200 self-start'
                                                                : 'bg-indigo-950/80 border border-indigo-800/40 text-indigo-200 ml-auto'
                                                                }`}
                                                        >
                                                            {/* ENCABEZADO CON REMITENTE Y HORA DE ENVÍO */}
                                                            <div className="flex justify-between items-center gap-3 mb-1">
                                                                <span className="font-bold text-[10px] opacity-60">
                                                                    {m.origen === 'CLIENTE' ? '👤 Cliente' : '🛠️ Taller / Agente'}
                                                                </span>
                                                                <span className="text-[9px] opacity-50 font-mono">
                                                                    {fechaFormateada} • {horaFormateada}
                                                                </span>
                                                            </div>

                                                            {/* CONTENIDO DEL MENSAJE */}
                                                            <p className="whitespace-pre-wrap">{m.texto}</p>
                                                        </div>
                                                    )
                                                })
                                            )}
                                        </div>

                                        {/* ADJUNTAR Y ENVIAR */}
                                        <div className="space-y-2">
                                            <div>
                                                <input
                                                    type="file"
                                                    accept="image/*,.pdf"
                                                    onChange={(e) => setArchivoAdjunto(e.target.files?.[0] || null)}
                                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-[11px] text-zinc-300 file:mr-2 file:py-0.5 file:px-2 file:rounded-md file:border-0 file:bg-indigo-900/50 file:text-indigo-300 file:font-semibold"
                                                />
                                            </div>

                                            <div className="flex gap-2">
                                                <textarea
                                                    rows={2}
                                                    placeholder="Escribe un mensaje..."
                                                    value={mensajeRescate}
                                                    onChange={(e) => setMensajeRescate(e.target.value)}
                                                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-indigo-500 resize-none"
                                                />
                                                <button
                                                    onClick={async () => {
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

                                                            if (res.ok) {
                                                                setMensajeRescate('')
                                                                setArchivoAdjunto(null)
                                                                consultarHistorialTelefono(telefonoRescate)
                                                                cargarListaConversaciones()
                                                                setEstadoBotDirecto(false)
                                                            } else {
                                                                alert('Error al enviar el mensaje por Meta')
                                                            }
                                                        } catch (err) {
                                                            console.error(err)
                                                            alert('Error de conexión')
                                                        } finally {
                                                            setEnviandoRescate(false)
                                                        }
                                                    }}
                                                    disabled={enviandoRescate}
                                                    className="bg-indigo-600 hover:bg-indigo-500 font-bold text-white text-xs px-4 rounded-xl transition-colors disabled:opacity-50 shadow-md flex items-center justify-center"
                                                >
                                                    {enviandoRescate ? 'Enviando...' : 'Enviar 🚀'}
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}

                            </div>

                        </div>

                    </div>
                </div>
            )}
        </div>
    )
}