'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ModalChat from '../../components/ModalChat'

export default function AdminDashboard() {
    const [tickets, setTickets] = useState<any[]>([])
    const [busqueda, setBusqueda] = useState('')
    const [cargando, setCargando] = useState(true)
    const router = useRouter()

    // 📂 ESTADO PARA CONTROL DE PESTAÑAS (TABS)
    const [pestanaActiva, setPestanaActiva] = useState<'taller' | 'leads'>('taller')

    // 💰 PRECIOS DINÁMICOS ASOCIADOS A CADA ROW DE LEAD
    const [preciosLeads, setPreciosLeads] = useState<{ [key: string]: string }>({})

    // 💰 ESTADOS PARA EL MODAL DE PRESUPUESTOS (ÓRDENES REALES)
    const [mostrarModalPresupuesto, setMostrarModalPresupuesto] = useState(false)
    const [ticketSeleccionado, setTicketSeleccionado] = useState<any>(null)
    const [costoReparacion, setCostoReparacion] = useState('')
    const [notasDiagnostico, setNotasDiagnostico] = useState('')

    // 💬 ESTADOS PARA EL MODAL DE CHAT NATIVO
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

    useEffect(() => {
        cargarTickets()
    }, [])

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

    // 🤖 INTERRUPTOR MANUAL DEL BOT
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

    // 🔄 MANEJADOR DE ESTATUS ASÍNCRONO
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

    // 🚀 ACCIÓN: INYECTAR COTIZACIÓN A LEAD Y REGRESAR CONTROL A LA IA
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
                    botActivo: true // La IA toma el volante y pide datos de cita/SAT
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

    // 🗑️ ACCIÓN: PURGAR LEAD EN CASCADA (GARBAGE COLLECTOR)
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

    // 💾 ENVIAR COTIZACIÓN FORMAL DESDE MODAL (TALLER FÍSICO)
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

    // 🔍 APLICAR MOTOR DE BÚSQUEDA GENERAL
    // 🔍 APLICAR MOTOR DE BÚSQUEDA GENERAL
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

    // 🧠 📂 FILTRO INTELIGENTE DE CATEGORÍAS
    // Un Lead solo se queda en la Bandeja si tiene el prefijo LEAD- Y sigue esperando aprobación.
    // Si avanza a EN_REPARACION (ej. Soporte Remoto), se va directo al Banco de Trabajo.
    const esLeadPuro = (t: any) => t.numeroOrden.startsWith('LEAD-') && t.estado === 'ESPERANDO_APROBACION'

    const listaWorkshop = ticketsFiltrados.filter(t => !esLeadPuro(t))
    const listaLeads = ticketsFiltrados.filter(t => esLeadPuro(t))

    const totalWorkshopGlobal = tickets.filter(t => !esLeadPuro(t)).length
    const totalLeadsGlobal = tickets.filter(t => esLeadPuro(t)).length

    if (cargando) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Iniciando el Centro de Control de Soltecot_...</div>

    return (
        <div className="min-h-screen bg-black text-white p-6 relative">
            <div className="max-w-6xl mx-auto">

                {/* ENCABEZADO */}
                <div className="flex justify-between items-center border-b border-zinc-900 pb-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-emerald-400">SOLTECOT_ WORKSHOP</h1>
                        <p className="text-xs text-zinc-500 uppercase tracking-widest">Panel Híbrido: Taller y Bandeja de Leads</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={dispararRecordatoriosManual}
                            className="bg-zinc-950 hover:bg-zinc-900 text-amber-400 border border-amber-900/40 font-bold px-4 py-2 rounded text-sm transition-colors flex items-center gap-2 shadow-sm"
                        >
                            🔔 Recordatorios de Mañana
                        </button>

                        <Link href="/admin/historial" className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-bold px-4 py-2 rounded text-sm transition-colors">
                            📜 Ver Historial / Archivo
                        </Link>

                        <Link href="/admin/ingreso" className="bg-emerald-600 hover:bg-emerald-500 font-bold px-4 py-2 rounded text-sm transition-colors">
                            ➕ Recibir Equipo
                        </Link>

                        <button onClick={ejecutarLogout} className="bg-zinc-950 hover:bg-zinc-900 text-zinc-500 border border-zinc-900 font-semibold px-3 py-2 rounded text-sm transition-colors">
                            🚪 Salir
                        </button>
                    </div>
                </div>

                {/* BARRA DE BÚSQUEDA */}
                <div className="mb-6">
                    <input
                        type="text"
                        placeholder="🔍 Buscar por folio, nombre de cliente, dispositivo o fecha..."
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-900 rounded-xl p-3.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors shadow-inner"
                    />
                </div>

                {/* 📂 NAVEGACIÓN ENTRE PESTAÑAS (TABS) */}
                <div className="flex border-b border-zinc-900 mb-6">
                    <button
                        onClick={() => setPestanaActiva('taller')}
                        className={`py-3 px-6 font-bold text-xs uppercase tracking-wider border-b-2 transition-all ${pestanaActiva === 'taller'
                            ? 'border-emerald-500 text-emerald-400 bg-zinc-950/40'
                            : 'border-transparent text-zinc-500 hover:text-zinc-300'
                            }`}
                    >
                        🛠️ Banco de Trabajo ({totalWorkshopGlobal})
                    </button>
                    <button
                        onClick={() => setPestanaActiva('leads')}
                        className={`py-3 px-6 font-bold text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${pestanaActiva === 'leads'
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

                {/* 💻 CONTENIDO TAB 1: BANCO DE TRABAJO (REPARACIONES REALES) */}
                {pestanaActiva === 'taller' && (
                    <div className="bg-zinc-950 border border-zinc-900 rounded-xl overflow-hidden shadow-2xl animate-fade-in">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-zinc-900 border-b border-zinc-800 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                    <th className="p-4">Folio</th>
                                    <th className="p-4">Fecha</th>
                                    <th className="p-4">Cliente / Teléfono</th>
                                    <th className="p-4">Agente Bot</th>
                                    <th className="p-4">Equipo</th>
                                    <th className="p-4">Estatus en Taller</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900 text-sm">
                                {listaWorkshop.map((t) => (
                                    <tr key={t.id} className={`transition-all duration-300 ${!t.botActivo
                                        ? 'bg-rose-950/10 border-l-4 border-l-rose-500 hover:bg-rose-950/20'
                                        : 'border-l-4 border-l-transparent hover:bg-zinc-900/50'
                                        }`}>
                                        <td className="p-4 font-bold text-emerald-400">{t.numeroOrden}</td>
                                        <td className="p-4 text-zinc-500 text-xs">{new Date(t.createdAt).toLocaleDateString('es-MX')}</td>
                                        <td className="p-4">
                                            <div className="font-semibold text-zinc-200">{t.cliente?.nombre}</div>
                                            <div className="text-xs text-zinc-500">{t.cliente?.telefono}</div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => toggleBot(t.id, t.botActivo)}
                                                    className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${t.botActivo
                                                        ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30 hover:bg-emerald-900/40'
                                                        : 'bg-rose-950 text-rose-400 border-rose-500 shadow-[0_0_12px_rgba(225,29,72,0.4)] animate-pulse'
                                                        }`}
                                                >
                                                    {t.botActivo ? '🤖 IA ACTIVA' : '🚨 MODO MANUAL'}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setClienteSeleccionado(t.cliente)
                                                        setChatAbierto(true)
                                                    }}
                                                    className={`text-xs px-3 py-1 rounded-full border transition-colors shadow-sm flex items-center gap-1 ${!t.botActivo ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'}`}
                                                    title="Abrir Chat"
                                                >
                                                    💬 Chat
                                                </button>
                                            </div>
                                        </td>
                                        <td className="p-4 text-zinc-300 font-medium">
                                            {t.equipo}
                                            {t.costoReparacion && (
                                                <div className="text-xs text-amber-500 font-semibold mt-0.5">💰 Presupuesto: ${t.costoReparacion}</div>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <select
                                                value={t.estado}
                                                onChange={(e) => cambiarEstatus(t, e.target.value)}
                                                className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-emerald-500 cursor-pointer font-semibold"
                                            >
                                                <option value="RECIBIDO">🛠️ RECIBIDO</option>
                                                <option value="EN_DIAGNOSTICO">🔬 EN DIAGNÓSTICO</option>
                                                <option value="ESPERANDO_APROBACION">⏳ ESPERANDO APROBACIÓN</option>
                                                <option value="EN_REPARACION">⚙️ EN REPARACIÓN</option>
                                                <option value="LISTO_PARA_ENTREGA">✅ LISTO PARA ENTREGA</option>
                                                <option value="ENTREGADO">📦 ENTREGADO (Archivar)</option>
                                                <option value="RECHAZADO">❌ RECHAZADO (Archivar)</option>
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

                {/* 🎯 CONTENIDO TAB 2: BANDEJA DE LEADS (PROSPECTOS EN FRÍO / S.O.S) */}
                {pestanaActiva === 'leads' && (
                    <div className="bg-zinc-950 border border-zinc-900 rounded-xl overflow-hidden shadow-2xl animate-fade-in">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-zinc-900 border-b border-zinc-800 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                    <th className="p-4">Prospecto</th>
                                    <th className="p-4">Contacto</th>
                                    <th className="p-4">Interés Inicial</th>
                                    <th className="p-4 text-center">Inyectar Rango / Cotización</th>
                                    <th className="p-4 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900 text-sm">
                                {listaLeads.map((t) => (
                                    <tr key={t.id} className="bg-amber-950/5 hover:bg-amber-950/10 transition-colors border-l-4 border-l-amber-500">
                                        <td className="p-4 font-mono text-xs text-amber-400 font-bold">{t.numeroOrden}</td>
                                        <td className="p-4">
                                            <div className="font-semibold text-zinc-200">{t.cliente?.nombre || 'Prospecto WhatsApp'}</div>
                                            <div className="text-xs text-zinc-500">{t.cliente?.telefono}</div>
                                        </td>
                                        <td className="p-4">
                                            <div className="text-sm font-medium text-zinc-300">{t.equipo}</div>
                                            <div className="text-xs text-zinc-500 truncate max-w-xs">{t.fallaReportada}</div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <span className="text-zinc-600 text-sm">$</span>
                                                <input
                                                    type="number"
                                                    placeholder="Ej: 1250"
                                                    value={preciosLeads[t.id] || ''}
                                                    onChange={(e) => setPreciosLeads({ ...preciosLeads, [t.id]: e.target.value })}
                                                    className="w-24 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-center focus:border-amber-500 focus:outline-none text-amber-400 font-bold"
                                                />
                                                <button
                                                    onClick={() => handleReactivarLead(t.id, preciosLeads[t.id])}
                                                    className="bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-3 py-1.5 rounded transition-all tracking-wide shadow-md"
                                                >
                                                    🚀 RETOMAR IA
                                                </button>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        setClienteSeleccionado(t.cliente)
                                                        setChatAbierto(true)
                                                    }}
                                                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-3 py-1.5 rounded text-xs text-zinc-300 font-medium transition-colors"
                                                >
                                                    💬 Chat
                                                </button>
                                                <button
                                                    onClick={() => handleDesecharLead(t.clienteId)}
                                                    className="bg-rose-950/30 hover:bg-rose-900 border border-rose-900/40 text-rose-400 text-xs font-semibold px-3 py-1.5 rounded transition-all"
                                                >
                                                    🗑️ Desechar
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

            {/* 💰 MODAL FLOTANTE: ENVÍO DE PRESUPUESTO (TALLER) */}
            {
                mostrarModalPresupuesto && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                            <h3 className="text-lg font-bold text-amber-400 mb-1">💰 Enviar Presupuesto de Reparación</h3>
                            <p className="text-xs text-zinc-400 mb-4">Orden: <span className="text-emerald-400 font-mono font-bold">{ticketSeleccionado?.numeroOrden}</span> | {ticketSeleccionado?.equipo}</p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Costo Total ($ MXN)</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: 2450"
                                        value={costoReparacion}
                                        onChange={(e) => setCostoReparacion(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm text-white outline-none focus:border-amber-500 transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Detalles del Diagnóstico técnico</label>
                                    <textarea
                                        placeholder="Indica qué componentes se van a reparar o cambiar..."
                                        rows={3}
                                        value={notasDiagnostico}
                                        onChange={(e) => setNotasDiagnostico(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm text-white outline-none focus:border-amber-500 transition-colors resize-none"
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
                                    Enviar Cotización 🚀
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 💬 MODAL DE CHAT NATIVO (SLIDE-OVER) */}
            {
                chatAbierto && clienteSeleccionado && (
                    <ModalChat
                        isOpen={chatAbierto}
                        onClose={() => setChatAbierto(false)}
                        clienteId={clienteSeleccionado.id}
                        nombreCliente={clienteSeleccionado.nombre}
                        telefono={clienteSeleccionado.telefono}
                    />
                )
            }
        </div >
    )
}