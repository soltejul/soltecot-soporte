'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminDashboard() {
    const [tickets, setTickets] = useState<any[]>([])
    const [busqueda, setBusqueda] = useState('')
    const [cargando, setCargando] = useState(true)
    const router = useRouter()

    // 💰 ESTADOS PARA EL MODAL DE PRESUPUESTOS (PUNTO 3)
    const [mostrarModalPresupuesto, setMostrarModalPresupuesto] = useState(false)
    const [ticketSeleccionado, setTicketSeleccionado] = useState<any>(null)
    const [costoReparacion, setCostoReparacion] = useState('')
    const [notasDiagnostico, setNotasDiagnostico] = useState('')

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

    // 🤖 INTERRUPTOR MANUAL DEL BOT (PUNTO 2)
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
        // Si el estado es Esperando Aprobación, abrimos el modal en lugar de guardar directo
        if (nuevoEstado === 'ESPERANDO_APROBACION') {
            setTicketSeleccionado(ticket)
            setCostoReparacion(ticket.costoReparacion || '')
            setNotasDiagnostico(ticket.notasDiagnostico || '')
            setMostrarModalPresupuesto(true)
            return
        }

        // Flujo normal para otros estados
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

    // 💾 ENVIAR COTIZACIÓN FORMAL (PUNTO 3)
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

    if (cargando) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Iniciando el Centro de Control de Soltecot_...</div>

    return (
        <div className="min-h-screen bg-black text-white p-6 relative">
            <div className="max-w-6xl mx-auto">

                {/* ENCABEZADO */}
                <div className="flex justify-between items-center border-b border-zinc-900 pb-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-emerald-400">SOLTECOT_ WORKSHOP</h1>
                        <p className="text-xs text-zinc-500 uppercase tracking-widest">Panel de Reparaciones Activas en Laboratorio</p>
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
                        placeholder="🔍 Buscar orden por folio, nombre de cliente, dispositivo o fecha..."
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-900 rounded-xl p-3.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors shadow-inner"
                    />
                </div>

                {/* TABLA DE TRABAJO ACTIVO */}
                <div className="bg-zinc-950 border border-zinc-900 rounded-xl overflow-hidden shadow-2xl">
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
                            {ticketsFiltrados.map((t) => (
                                <tr key={t.id} className="hover:bg-zinc-900/50 transition-colors">
                                    <td className="p-4 font-bold text-emerald-400">{t.numeroOrden}</td>
                                    <td className="p-4 text-zinc-500 text-xs">{new Date(t.createdAt).toLocaleDateString('es-MX')}</td>
                                    <td className="p-4">
                                        <div className="font-semibold text-zinc-200">{t.cliente?.nombre}</div>
                                        <div className="text-xs text-zinc-500">{t.cliente?.telefono}</div>
                                    </td>
                                    {/* INTERRUPTOR DEL BOT (PUNTO 2) */}
                                    <td className="p-4">
                                        <button
                                            onClick={() => toggleBot(t.id, t.botActivo)}
                                            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${t.botActivo
                                                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30 hover:bg-emerald-900/40'
                                                    : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:bg-zinc-800'
                                                }`}
                                        >
                                            {t.botActivo ? '🤖 IA ACTIVA' : '👤 MANUAL'}
                                        </button>
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
                            {ticketsFiltrados.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center p-8 text-zinc-600">No se encontraron órdenes activas.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 💰 MODAL FLOTANTE: ENVÍO DE PRESUPUESTO (PUNTO 3) */}
            {mostrarModalPresupuesto && (
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
            )}
        </div>
    )
}