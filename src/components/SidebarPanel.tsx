'use client'

import { useMemo } from 'react'

interface SidebarPanelProps {
    listaUnificada: any[]
    busqueda: string
    setBusqueda: (v: string) => void
    filtroPestana: 'todos' | 'manual' | 'agendados' | 'recolecciones' | 'leads' | 'taller'
    setFiltroPestana: (v: 'todos' | 'manual' | 'agendados' | 'recolecciones' | 'leads' | 'taller') => void
    telefonoRescate: string
    setTelefonoRescate: (v: string) => void
}

export default function SidebarPanel({
    listaUnificada,
    busqueda,
    setBusqueda,
    filtroPestana,
    setFiltroPestana,
    telefonoRescate,
    setTelefonoRescate
}: SidebarPanelProps) {

    const listaFiltrada = useMemo(() => {
        return listaUnificada.filter((item) => {
            // 1. Búsqueda por texto
            const term = busqueda.toLowerCase().trim()
            const coincideBusqueda = !term ||
                item.nombre?.toLowerCase().includes(term) ||
                item.telefono?.includes(term) ||
                item.folio?.toLowerCase().includes(term) ||
                item.equipo?.toLowerCase().includes(term)

            if (!coincideBusqueda) return false

            // 2. Filtro de pestañas limpio y sin bloqueos cruzados
            if (filtroPestana === 'manual') return !item.botActivo
            if (filtroPestana === 'recolecciones') return item.esRecoleccion
            if (filtroPestana === 'agendados') return item.esAgendado && !item.esRecoleccion
            if (filtroPestana === 'leads') return item.tipo === 'lead' && !item.esAgendado && !item.esRecoleccion
            if (filtroPestana === 'taller') return item.tipo === 'taller'

            return true // 'todos'
        })
    }, [listaUnificada, busqueda, filtroPestana])

    // 🔢 Contadores precisos basados en la naturaleza real del registro
    const conteoRecolecciones = useMemo(() => listaUnificada.filter(i => i.esRecoleccion).length, [listaUnificada])
    const conteoAgendados = useMemo(() => listaUnificada.filter(i => i.esAgendado && !i.esRecoleccion).length, [listaUnificada])
    const conteoManual = useMemo(() => listaUnificada.filter(i => !i.botActivo).length, [listaUnificada])

    return (
        <aside className="w-full md:w-80 lg:w-96 bg-zinc-950 border-r border-zinc-900 flex flex-col h-full shrink-0 font-sans">

            {/* 🔍 BUSCADOR & BARRA DE PESTAÑAS */}
            <div className="p-3 border-b border-zinc-900 space-y-2.5 bg-zinc-900/40">
                <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="🔍 Buscar cliente, folio o equipo..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono transition-colors"
                />

                <div className="flex gap-1 overflow-x-auto pb-1 hide-scrollbar text-[11px] font-mono">
                    <button
                        onClick={() => setFiltroPestana('todos')}
                        className={`px-2.5 py-1 rounded-lg border whitespace-nowrap transition-colors ${filtroPestana === 'todos'
                                ? 'bg-zinc-800 text-white border-zinc-700 font-bold'
                                : 'text-zinc-500 border-transparent hover:text-zinc-300'
                            }`}
                    >
                        Todos ({listaUnificada.length})
                    </button>

                    <button
                        onClick={() => setFiltroPestana('recolecciones')}
                        className={`px-2.5 py-1 rounded-lg border whitespace-nowrap transition-colors flex items-center gap-1 ${filtroPestana === 'recolecciones'
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 font-bold'
                                : 'text-amber-500/70 border-transparent hover:text-amber-400'
                            }`}
                    >
                        🚚 Recolecciones ({conteoRecolecciones})
                    </button>

                    <button
                        onClick={() => setFiltroPestana('agendados')}
                        className={`px-2.5 py-1 rounded-lg border whitespace-nowrap transition-colors flex items-center gap-1 ${filtroPestana === 'agendados'
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold'
                                : 'text-emerald-500/70 border-transparent hover:text-emerald-400'
                            }`}
                    >
                        📍 Citas ({conteoAgendados})
                    </button>

                    <button
                        onClick={() => setFiltroPestana('manual')}
                        className={`px-2.5 py-1 rounded-lg border whitespace-nowrap transition-colors ${filtroPestana === 'manual'
                                ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 font-bold'
                                : 'text-zinc-500 border-transparent hover:text-zinc-300'
                            }`}
                    >
                        🔴 Manual ({conteoManual})
                    </button>

                    <button
                        onClick={() => setFiltroPestana('leads')}
                        className={`px-2.5 py-1 rounded-lg border whitespace-nowrap transition-colors ${filtroPestana === 'leads'
                                ? 'bg-zinc-800 text-white border-zinc-700 font-bold'
                                : 'text-zinc-500 border-transparent hover:text-zinc-300'
                            }`}
                    >
                        Leads
                    </button>

                    <button
                        onClick={() => setFiltroPestana('taller')}
                        className={`px-2.5 py-1 rounded-lg border whitespace-nowrap transition-colors ${filtroPestana === 'taller'
                                ? 'bg-zinc-800 text-white border-zinc-700 font-bold'
                                : 'text-zinc-500 border-transparent hover:text-zinc-300'
                            }`}
                    >
                        Taller
                    </button>
                </div>
            </div>

            {/* 📜 LISTADO LOGÍSTICO */}
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-900">
                {listaFiltrada.length === 0 ? (
                    <p className="text-center text-zinc-600 text-xs py-10 font-mono">No hay registros en este filtro.</p>
                ) : (
                    listaFiltrada.map((item) => {
                        const estaSeleccionado = telefonoRescate.endsWith(item.telefono?.slice(-10) || 'xyz')

                        return (
                            <div
                                key={item.id}
                                onClick={() => setTelefonoRescate(item.telefono)}
                                className={`p-3.5 cursor-pointer transition-all flex flex-col gap-1.5 ${estaSeleccionado
                                        ? 'bg-zinc-900 border-l-4 border-emerald-500'
                                        : item.esRecoleccion
                                            ? 'bg-amber-500/[0.03] hover:bg-amber-500/[0.07]'
                                            : 'hover:bg-zinc-900/50'
                                    }`}
                            >
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-sm text-white truncate max-w-[180px]">
                                            {item.nombre}
                                        </span>
                                        {!item.botActivo && (
                                            <span className="text-[9px] bg-rose-500/20 text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded font-mono font-bold">
                                                MANUAL
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                                        {item.folio}
                                    </span>
                                </div>

                                <p className="text-xs text-zinc-400 line-clamp-1">
                                    💻 {item.equipo}
                                </p>

                                {/* 🏷️ BADGES REALES */}
                                <div className="flex items-center justify-between gap-2 pt-1">
                                    {item.esRecoleccion ? (
                                        <span className="bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                                            🚚 RECOLECCIÓN
                                        </span>
                                    ) : item.esAgendado ? (
                                        <span className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                                            📍 CITA TALLER
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-mono text-zinc-500 uppercase">
                                            {item.estadoTaller?.replace(/_/g, ' ') || 'PROSPECTO'}
                                        </span>
                                    )}

                                    {item.esRecoleccion && (
                                        <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.direccionRecoleccion || 'Cuautitlan Izcalli Edo Mex')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors flex items-center gap-1 font-mono"
                                            title="Abrir ubicación en Google Maps / Waze"
                                        >
                                            🗺️ Ruta
                                        </a>
                                    )}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

        </aside>
    )
}