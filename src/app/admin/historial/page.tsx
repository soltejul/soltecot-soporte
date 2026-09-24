'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'

// Fetcher global para SWR
const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function HistorialDashboard() {
    const [busqueda, setBusqueda] = useState('')
    const [fechaInicio, setFechaInicio] = useState('')
    const [fechaFin, setFechaFin] = useState('')

    // 📅 1. Seteo automático del mes en curso en tiempo local de México
    useEffect(() => {
        const hoy = new Date()
        const año = hoy.getFullYear()
        const mes = String(hoy.getMonth() + 1).padStart(2, '0')

        setFechaInicio(`${año}-${mes}-01`)

        const ultimoDia = new Date(año, hoy.getMonth() + 1, 0).getDate()
        setFechaFin(`${año}-${mes}-${String(ultimoDia).padStart(2, '0')}`)
    }, [])

    // 🚀 2. Fetching con SWR (sincronizado con el Taller en tiempo real)
    const { data: ticketsBrutos = [], isLoading } = useSWR('/api/tickets', fetcher, {
        refreshInterval: 10000,
        revalidateOnFocus: true
    })

    // 📦 3. Filtrado inicial: Solo tickets del archivo muerto
    const ticketsArchivados = useMemo(() => {
        if (!Array.isArray(ticketsBrutos)) return []
        return ticketsBrutos.filter((t: any) => t.estado === 'ENTREGADO' || t.estado === 'RECHAZADO')
    }, [ticketsBrutos])

    // 🔍 4. Filtrado Maestro con Conversión a Zona Horaria de México
    const ticketsFiltrados = useMemo(() => {
        const termino = busqueda.toLowerCase().trim()

        return ticketsArchivados.filter((t: any) => {
            const fechaTicketObj = new Date(t.createdAt)

            // Genera string 'YYYY-MM-DD' en hora local de CDMX
            const fechaMXString = fechaTicketObj.toLocaleDateString('en-CA', {
                timeZone: 'America/Mexico_City'
            })

            // Validación de rango de calendario
            let dentroDeRango = true
            if (fechaInicio && fechaMXString < fechaInicio) dentroDeRango = false
            if (fechaFin && fechaMXString > fechaFin) dentroDeRango = false

            // Búsqueda por texto
            const fechaLegible = fechaTicketObj.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })
            const coincideTexto = (
                t.numeroOrden.toLowerCase().includes(termino) ||
                (t.cliente?.nombre || '').toLowerCase().includes(termino) ||
                (t.cliente?.telefono || '').includes(termino) ||
                t.equipo.toLowerCase().includes(termino) ||
                fechaLegible.includes(termino)
            )

            return dentroDeRango && coincideTexto
        })
    }, [ticketsArchivados, busqueda, fechaInicio, fechaFin])

    // 📊 5. Resumen Financiero Dinámico
    const resumen = useMemo(() => {
        return ticketsFiltrados.reduce(
            (acc: any, t: any) => {
                if (t.estado === 'ENTREGADO') {
                    acc.totalCobrado += (t.costoReparacion || t.costoEstimado || 0)
                    acc.entregados += 1
                } else if (t.estado === 'RECHAZADO') {
                    acc.rechazados += 1
                }
                return acc
            },
            { totalCobrado: 0, entregados: 0, rechazados: 0 }
        )
    }, [ticketsFiltrados])

    if (isLoading && ticketsBrutos.length === 0) {
        return (
            <div className="min-h-screen bg-black text-emerald-400 flex items-center justify-center font-mono">
                <span className="text-2xl mr-3 animate-pulse">📜</span> Abriendo el Archivo Histórico de Soltecot_...
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-black text-white p-4 sm:p-6 font-sans">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* ENCABEZADO Y NAVEGACIÓN */}
                <div className="flex justify-between items-center border-b border-zinc-900 pb-4">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-zinc-300 font-mono tracking-wider">
                            ARCHIVO HISTÓRICO
                        </h1>
                        <p className="text-xs text-zinc-500 uppercase tracking-widest mt-0.5">
                            Órdenes Finalizadas, Entregas y Canceles
                        </p>
                    </div>
                    <Link
                        href="/admin"
                        className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-bold px-3 py-2 rounded-lg text-xs transition-colors flex items-center gap-1.5"
                    >
                        <span>⬅</span> <span>Volver al Taller</span>
                    </Link>
                </div>

                {/* 📊 RESUMEN FINANCIERO Y DE EQUIPOS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Total Cobrado (Período)</span>
                            <span className="text-xl font-bold font-mono text-emerald-400">${resumen.totalCobrado.toFixed(2)} MXN</span>
                        </div>
                        <span className="text-2xl">💰</span>
                    </div>

                    <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Equipos Entregados</span>
                            <span className="text-xl font-bold font-mono text-zinc-200">{resumen.entregados} orden(es)</span>
                        </div>
                        <span className="text-2xl">📦</span>
                    </div>

                    <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Ordenes Rechazadas</span>
                            <span className="text-xl font-bold font-mono text-rose-400">{resumen.rechazados} orden(es)</span>
                        </div>
                        <span className="text-2xl">❌</span>
                    </div>
                </div>

                {/* 🛠️ BUSCADOR Y RANGO DE FECHAS */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                        <input
                            type="text"
                            placeholder="🔍 Buscar por folio, cliente, teléfono o equipo..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-xs sm:text-sm text-white outline-none focus:border-emerald-500 transition-colors font-mono"
                        />
                    </div>

                    <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-2.5 flex items-center justify-between gap-2">
                        <div className="flex flex-col w-1/2">
                            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Desde:</span>
                            <input
                                type="date"
                                value={fechaInicio}
                                onChange={(e) => setFechaInicio(e.target.value)}
                                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 outline-none focus:border-emerald-500 cursor-pointer text-center font-mono"
                            />
                        </div>
                        <div className="flex flex-col w-1/2">
                            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Hasta:</span>
                            <input
                                type="date"
                                value={fechaFin}
                                onChange={(e) => setFechaFin(e.target.value)}
                                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 outline-none focus:border-emerald-500 cursor-pointer text-center font-mono"
                            />
                        </div>
                    </div>
                </div>

                {/* TABLA HISTÓRICA */}
                <div className="bg-zinc-950 border border-zinc-900 rounded-xl overflow-x-auto shadow-2xl">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                            <tr className="bg-zinc-900/80 border-b border-zinc-800 text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                                <th className="p-3.5">Folio</th>
                                <th className="p-3.5">Fecha Ingreso</th>
                                <th className="p-3.5">Cliente</th>
                                <th className="p-3.5">Equipo</th>
                                <th className="p-3.5">Cobrado</th>
                                <th className="p-3.5">Resultado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900 text-xs">
                            {ticketsFiltrados.map((t: any) => (
                                <tr key={t.id} className="hover:bg-zinc-900/40 transition-colors">
                                    <td className="p-3.5 font-bold font-mono text-emerald-400">{t.numeroOrden}</td>
                                    <td className="p-3.5 text-zinc-500 font-mono">
                                        {new Date(t.createdAt).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}
                                    </td>
                                    <td className="p-3.5">
                                        <div className="font-semibold text-zinc-200">{t.cliente?.nombre || 'Sin Nombre'}</div>
                                        <div className="text-[10px] text-zinc-500 font-mono">📱 {t.cliente?.telefono}</div>
                                    </td>
                                    <td className="p-3.5 text-zinc-300">{t.equipo}</td>
                                    <td className="p-3.5 font-mono font-bold text-amber-500">
                                        ${t.costoReparacion || t.costoEstimado || 0}
                                    </td>
                                    <td className="p-3.5">
                                        {t.estado === 'ENTREGADO' ? (
                                            <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold font-mono">
                                                📦 ENTREGADO
                                            </span>
                                        ) : (
                                            <span className="bg-rose-950/60 text-rose-400 border border-rose-800 px-2 py-0.5 rounded text-[10px] font-bold font-mono">
                                                ❌ RECHAZADO
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {ticketsFiltrados.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center p-8 text-zinc-600 font-mono">
                                        No se encontraron registros archivados en este período de tiempo.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    )
}