'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminDashboard() {
    const [tickets, setTickets] = useState<any[]>([])
    const [cargando, setCargando] = useState(true)
    const router = useRouter()

    const cargarTickets = async () => {
        try {
            const res = await fetch('/api/tickets')
            const data = await res.json()
            if (res.ok) setTickets(data)
        } catch (err) {
            console.error("Error al cargar órdenes", err)
        } finally {
            setCargando(false)
        }
    }

    useEffect(() => {
        cargarTickets()
    }, [])

    const cambiarEstatus = async (ticketId: string, nuevoEstado: string) => {
        try {
            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticketId, nuevoEstado })
            })
            if (res.ok) {
                cargarTickets()
                alert("Estatus actualizado en Neon y WhatsApp enviado vía Baileys 🚀")
            }
        } catch (err) {
            alert("Error al actualizar el estatus")
        }
    }

    // 🚪 FUNCIÓN DE LOGOUT
    const ejecutarLogout = async () => {
        const res = await fetch('/api/admin/logout', { method: 'POST' })
        if (res.ok) {
            router.push('/admin/login') // Te manda directo a la pantalla oscura de acceso
        }
    }

    if (cargando) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Iniciando el Centro de Control de Soltecot_...</div>

    return (
        <div className="min-h-screen bg-black text-white p-6">
            <div className="max-w-6xl mx-auto">

                {/* ENCABEZADO ACTUALIZADO */}
                <div className="flex justify-between items-center border-b border-zinc-900 pb-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-emerald-400">SOLTECOT_ WORKSHOP</h1>
                        <p className="text-xs text-zinc-500 uppercase tracking-widest">Panel Global de Control de Reparaciones</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link href="/admin/ingreso" className="bg-emerald-600 hover:bg-emerald-500 font-bold px-4 py-2 rounded text-sm transition-colors">
                            ➕ Recibir Nuevo Equipo
                        </Link>
                        <button onClick={ejecutarLogout} className="bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 font-bold px-4 py-2 rounded text-sm transition-colors">
                            🚪 Cerrar Sesión
                        </button>
                    </div>
                </div>

                {/* TABLA DE EQUIPOS (Se queda igual) */}
                <div className="bg-zinc-950 border border-zinc-900 rounded-xl overflow-hidden shadow-2xl">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-zinc-900 border-b border-zinc-800 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                <th className="p-4">Folio</th>
                                <th className="p-4">Cliente / Teléfono</th>
                                <th className="p-4">Equipo</th>
                                <th className="p-4">Falla Reportada</th>
                                <th className="p-4">Estatus en Vivo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900 text-sm">
                            {tickets.map((t) => (
                                <tr key={t.id} className="hover:bg-zinc-900/50 transition-colors">
                                    <td className="p-4 font-bold text-emerald-400">{t.numeroOrden}</td>
                                    <td className="p-4">
                                        <div className="font-semibold text-zinc-200">{t.cliente?.nombre}</div>
                                        <div className="text-xs text-zinc-500">{t.cliente?.telefono}</div>
                                    </td>
                                    <td className="p-4 text-zinc-300 font-medium">{t.equipo}</td>
                                    <td className="p-4 text-zinc-400 max-w-xs truncate">{t.fallaReportada}</td>
                                    <td className="p-4">
                                        <select
                                            value={t.estado}
                                            onChange={(e) => cambiarEstatus(t.id, e.target.value)}
                                            className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-emerald-500 cursor-pointer font-semibold"
                                        >
                                            <option value="RECIBIDO">🛠️ RECIBIDO</option>
                                            <option value="EN_DIAGNOSTICO">🔬 EN DIAGNÓSTICO</option>
                                            <option value="ESPERANDO_REFACCION">📦 ESPERANDO REFACCIÓN</option>
                                            <option value="LISTO_PARA_ENTREGA">✅ LISTO PARA ENTREGA</option>
                                            <option value="ENTREGADO">📦 ENTREGADO</option>
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    )
}