'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function HistorialDashboard() {
    const [tickets, setTickets] = useState<any[]>([])
    const [busqueda, setBusqueda] = useState('')
    const [cargando, setCargando] = useState(true)

    // 📅 ESTADOS PARA EL FILTRO DE CALENDARIO (Por defecto, mes en curso)
    const [fechaInicio, setFechaInicio] = useState('')
    const [fechaFin, setFechaFin] = useState('')

    // Efecto inicial para setear de manera automática el mes actual al cargar la pantalla
    useEffect(() => {
        const hoy = new Date()
        const año = hoy.getFullYear()
        const mes = String(hoy.getMonth() + 1).padStart(2, '0')

        // Primer día del mes (Ej: 2026-06-01)
        setFechaInicio(`${año}-${mes}-01`)

        // Último día del mes actual de forma exacta
        const ultimoDia = new Date(año, hoy.getMonth() + 1, 0).getDate()
        setFechaFin(`${año}-${mes}-${String(ultimoDia).padStart(2, '0')}`)
    }, [])

    const cargarHistorial = async () => {
        try {
            const res = await fetch('/api/tickets')
            const data = await res.json()
            if (res.ok) {
                // Filtramos de inmediato los tickets que pertenecen al archivo muerto
                const archivados = data.filter((t: any) => t.estado === 'ENTREGADO' || t.estado === 'RECHAZADO')
                setTickets(archivados)
            }
        } catch (err) {
            console.error("Error al cargar historial", err)
        } finally {
            setCargando(false)
        }
    }

    useEffect(() => {
        cargarHistorial()
    }, [])

    // 🔍 FILTRADO MAESTRO COMBINADO: Rango de Fechas + Texto de Búsqueda
    const ticketsFiltrados = tickets.filter((t) => {
        const termino = busqueda.toLowerCase().trim()
        const fechaLegible = new Date(t.createdAt).toLocaleDateString('es-MX')

        // Formateamos la fecha del ticket para compararla con el calendario (AAAA-MM-DD)
        const fechaTicketObj = new Date(t.createdAt)
        const añoT = fechaTicketObj.getFullYear()
        const mesT = String(fechaTicketObj.getMonth() + 1).padStart(2, '0')
        const diaT = String(fechaTicketObj.getDate()).padStart(2, '0')
        const fechaTicketString = `${añoT}-${mesT}-${diaT}`

        // 1. Validamos si se encuentra dentro del rango de los calendarios
        let dentroDeRango = true
        if (fechaInicio && fechaTicketString < fechaInicio) dentroDeRango = false
        if (fechaFin && fechaTicketString > fechaFin) dentroDeRango = false

        // 2. Validamos el texto escrito en el buscador
        const coincideTexto = (
            t.numeroOrden.toLowerCase().includes(termino) ||
            (t.cliente?.nombre || '').toLowerCase().includes(termino) ||
            t.equipo.toLowerCase().includes(termino) ||
            fechaLegible.includes(termino)
        )

        return dentroDeRango && coincideTexto
    })

    if (cargando) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Abriendo el Archivo Histórico de Soltecot_...</div>

    return (
        <div className="min-h-screen bg-black text-white p-6">
            <div className="max-w-6xl mx-auto">

                {/* ENCABEZADO */}
                <div className="flex justify-between items-center border-b border-zinc-900 pb-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-zinc-400">ARCHIVO HISTÓRICO</h1>
                        <p className="text-xs text-zinc-500 uppercase tracking-widest">Consulta temporal de Órdenes Finalizadas y Rechazos</p>
                    </div>
                    <Link href="/admin" className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-bold px-4 py-2 rounded text-sm transition-colors">
                        ⬅ Volver al Taller Activo
                    </Link>
                </div>

                {/* 🛠️ PANEL DE HERRAMIENTAS: BUSCADOR + CALENDARIOS */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {/* Campo de búsqueda por texto */}
                    <div className="md:col-span-2">
                        <input
                            type="text"
                            placeholder="🔍 Buscar por folio, cliente, equipo..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-900 rounded-xl p-3.5 text-sm text-white outline-none focus:border-zinc-700 transition-colors shadow-inner h-full"
                        />
                    </div>

                    {/* Rangos de Fecha con inputs tipo calendario */}
                    <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-3 flex items-center justify-between gap-3 shadow-inner">
                        <div className="flex flex-col w-1/2">
                            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Desde:</span>
                            <input
                                type="date"
                                value={fechaInicio}
                                onChange={(e) => setFechaInicio(e.target.value)}
                                className="bg-zinc-900 border border-zinc-800 rounded p-1 text-xs text-zinc-300 outline-none focus:border-emerald-500 cursor-pointer text-center font-semibold invert-calendar-icon"
                            />
                        </div>
                        <div className="flex flex-col w-1/2">
                            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Hasta:</span>
                            <input
                                type="date"
                                value={fechaFin}
                                onChange={(e) => setFechaFin(e.target.value)}
                                className="bg-zinc-900 border border-zinc-800 rounded p-1 text-xs text-zinc-300 outline-none focus:border-emerald-500 cursor-pointer text-center font-semibold"
                            />
                        </div>
                    </div>
                </div>

                {/* TABLA DE ARCHIVO HISTÓRICO */}
                <div className="bg-zinc-950 border border-zinc-900 rounded-xl overflow-hidden shadow-2xl">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-zinc-900 border-b border-zinc-800 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                <th className="p-4">Folio</th>
                                <th className="p-4">Fecha de Ingreso</th>
                                <th className="p-4">Cliente</th>
                                <th className="p-4">Equipo</th>
                                <th className="p-4">Resultado Final</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900 text-sm">
                            {ticketsFiltrados.map((t) => (
                                <tr key={t.id} className="hover:bg-zinc-900/30 transition-colors">
                                    <td className="p-4 font-bold text-zinc-400">{t.numeroOrden}</td>
                                    <td className="p-4 text-zinc-500 text-xs">{new Date(t.createdAt).toLocaleDateString('es-MX')}</td>
                                    <td className="p-4">
                                        <div className="font-semibold text-zinc-300">{t.cliente?.nombre}</div>
                                        <div className="text-xs text-zinc-500">{t.cliente?.telefono}</div>
                                    </td>
                                    <td className="p-4 text-zinc-400">{t.equipo}</td>
                                    <td className="p-4">
                                        {t.estado === 'ENTREGADO' ? (
                                            <span className="bg-emerald-950/50 text-emerald-400 border border-emerald-900/60 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider">
                                                📦 ENTREGADO
                                            </span>
                                        ) : (
                                            <span className="bg-rose-950/50 text-rose-400 border border-rose-900/60 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider">
                                                ❌ RECHAZADO
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {ticketsFiltrados.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center p-8 text-zinc-700">No se encontraron órdenes archivadas en este período de tiempo.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    )
}