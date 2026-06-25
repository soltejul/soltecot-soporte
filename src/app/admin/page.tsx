'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminDashboard() {
    const [tickets, setTickets] = useState<any[]>([])
    const [busqueda, setBusqueda] = useState('')
    const [cargando, setCargando] = useState(true)
    const router = useRouter()

    const cargarTickets = async () => {
        try {
            const res = await fetch('/api/tickets')
            const data = await res.json()
            if (res.ok) {
                // 🚨 FILTRO MAESTRO: Solo dejamos en el main dashboard los equipos activos en el taller
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
                alert(`🔔 [SISTEMA]: Se procesaron y enviaron ${data.enviados} recordatorios de WhatsApp para el día de mañana con éxito.🚀`)
            } else {
                alert("Error al procesar la cola de recordatorios")
            }
        } catch (err) {
            alert("Error de conexión con el servidor de alertas")
        }
    }

    const cambiarEstatus = async (ticketId: string, nuevoEstado: string) => {
        try {
            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticketId, nuevoEstado })
            })
            if (res.ok) {
                cargarTickets() // Al cambiar a ENTREGADO o RECHAZADO desaparecerá mágicamente al recargar
                alert("Estatus actualizado y WhatsApp enviado 🚀")
            }
        } catch (err) {
            alert("Error al actualizar el estatus")
        }
    }

    const ejecutarLogout = async () => {
        const res = await fetch('/api/admin/logout', { method: 'POST' })
        if (res.ok) router.push('/admin/login')
    }

    // 🔍 BUSCADOR MULTI-CRITERIO: Filtra en vivo por Folio, Nombre, Equipo o Fecha
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
        <div className="min-h-screen bg-black text-white p-6">
            <div className="max-w-6xl mx-auto">

                {/* ENCABEZADO */}
                <div className="flex justify-between items-center border-b border-zinc-900 pb-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-emerald-400">SOLTECOT_ WORKSHOP</h1>
                        <p className="text-xs text-zinc-500 uppercase tracking-widest">Panel de Reparaciones Activas en Laboratorio</p>
                    </div>

                    {/* 🛠️ CONTENEDOR DE ACCIONES DE NAVEGACIÓN UNIFICADO */}
                    <div className="flex items-center gap-3">
                        {/* 🔔 BOTÓN DE ALERTA ADMINISTRATIVA INTEGRADO */}
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

                {/* 🔍 BARRA DE BÚSQUEDA INTELIGENTE */}
                <div className="mb-6">
                    <input
                        type="text"
                        placeholder="🔍 Buscar orden por folio, nombre de cliente, dispositivo o fecha (ej: 25/06/2026)..."
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
                                    <td className="p-4 text-zinc-300 font-medium">{t.equipo}</td>
                                    <td className="p-4">
                                        <select
                                            value={t.estado}
                                            onChange={(e) => cambiarEstatus(t.id, e.target.value)}
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
                                    <td colSpan={5} className="text-center p-8 text-zinc-600">No se encontraron órdenes activas que coincidan con la búsqueda.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    )
}