'use client'

import { useMemo } from 'react'

interface SidebarPanelProps {
    listaUnificada: any[]
    busqueda: string
    setBusqueda: (val: string) => void
    filtroPestana: 'todos' | 'manual' | 'agendados' | 'leads' | 'taller'
    setFiltroPestana: (val: 'todos' | 'manual' | 'agendados' | 'leads' | 'taller') => void
    telefonoRescate: string
    setTelefonoRescate: (tel: string) => void
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

    // 🚀 OPTIMIZACIÓN 1: Cálculo de contadores memorizado (useMemo)
    const conteos = useMemo(() => {
        return {
            todos: listaUnificada.length,
            manual: listaUnificada.filter(i => !i.botActivo).length,
            agendados: listaUnificada.filter(i => i.esAgendado && i.tipo !== 'taller').length,
            leads: listaUnificada.filter(i => i.tipo === 'lead' && !i.esAgendado).length,
            taller: listaUnificada.filter(i => i.tipo === 'taller').length
        }
    }, [listaUnificada])

    // 🚀 OPTIMIZACIÓN 2: Filtrado de búsqueda y pestañas memorizado (useMemo)
    const itemsFiltrados = useMemo(() => {
        const term = busqueda.toLowerCase().trim()
        return listaUnificada.filter((item) => {
            const coincideBusqueda =
                item.telefono.includes(term) ||
                item.nombre.toLowerCase().includes(term) ||
                item.folio.toLowerCase().includes(term) ||
                item.equipo.toLowerCase().includes(term)

            if (!coincideBusqueda) return false

            if (filtroPestana === 'manual') return !item.botActivo
            if (filtroPestana === 'agendados') return item.esAgendado && item.tipo !== 'taller'
            if (filtroPestana === 'taller') return item.tipo === 'taller'
            if (filtroPestana === 'leads') return item.tipo === 'lead' && !item.esAgendado
            return true
        })
    }, [listaUnificada, busqueda, filtroPestana])

    return (
        <aside className={`absolute md:static w-full md:w-[380px] lg:w-[420px] h-full bg-zinc-950 border-r border-zinc-900 flex flex-col shrink-0 z-10 transition-transform duration-300 ${telefonoRescate.length >= 10 ? '-translate-x-full md:translate-x-0' : 'translate-x-0'}`}>

            {/* 🔍 CAJA DE BÚSQUEDA */}
            <div className="p-3 border-b border-zinc-900">
                <input
                    type="text"
                    placeholder="🔍 Buscar cliente, teléfono o folio..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 font-mono transition-colors"
                />
            </div>

            {/* 🏷️ PESTAÑAS DE NAVEGACIÓN */}
            <div className="flex border-b border-zinc-900 bg-zinc-950 text-[11px] font-bold overflow-x-auto hide-scrollbar">
                <button
                    onClick={() => setFiltroPestana('todos')}
                    className={`flex-1 py-2.5 px-2 text-center border-b-2 whitespace-nowrap transition-colors ${filtroPestana === 'todos' ? 'border-emerald-500 text-emerald-400 bg-zinc-900/50' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    Todos ({conteos.todos})
                </button>
                <button
                    onClick={() => setFiltroPestana('manual')}
                    className={`flex-1 py-2.5 px-2 text-center border-b-2 whitespace-nowrap transition-colors ${filtroPestana === 'manual' ? 'border-rose-500 text-rose-400 bg-rose-950/20' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    🚨 Manual ({conteos.manual})
                </button>
                <button
                    onClick={() => setFiltroPestana('agendados')}
                    className={`flex-1 py-2.5 px-2 text-center border-b-2 whitespace-nowrap transition-colors ${filtroPestana === 'agendados' ? 'border-purple-500 text-purple-400 bg-purple-950/30 font-black' : 'border-transparent text-purple-400/70 hover:text-purple-300'}`}
                >
                    📅 Citas ({conteos.agendados})
                </button>
                <button
                    onClick={() => setFiltroPestana('leads')}
                    className={`flex-1 py-2.5 px-2 text-center border-b-2 whitespace-nowrap transition-colors ${filtroPestana === 'leads' ? 'border-amber-500 text-amber-400 bg-zinc-900/50' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    🎯 Leads ({conteos.leads})
                </button>
                <button
                    onClick={() => setFiltroPestana('taller')}
                    className={`flex-1 py-2.5 px-2 text-center border-b-2 whitespace-nowrap transition-colors ${filtroPestana === 'taller' ? 'border-indigo-500 text-indigo-400 bg-zinc-900/50' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    🛠️ Taller ({conteos.taller})
                </button>
            </div>

            {/* 📜 LISTA UNIFICADA DE CHATS */}
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-900 hide-scrollbar pb-20">
                {itemsFiltrados.length === 0 ? (
                    <div className="text-center py-8 px-4 text-zinc-600 text-xs font-mono">
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
                                    : item.esAgendado && !esTallerReal
                                        ? 'bg-purple-950/30 border-l-4 border-l-purple-500 hover:bg-purple-950/40'
                                        : requiereAtencion
                                            ? 'bg-rose-950/20 border-l-4 border-l-rose-500 hover:bg-rose-950/30'
                                            : 'bg-zinc-950 hover:bg-zinc-900/60 border-l-4 border-l-transparent'
                                    }`}
                            >
                                <div className="flex justify-between items-start">
                                    <span className={`font-bold text-xs truncate max-w-[150px] ${item.esAgendado ? 'text-purple-200 font-extrabold' : requiereAtencion ? 'text-rose-200' : 'text-zinc-200'}`}>
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
                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${item.esAgendado && !esTallerReal
                                        ? 'bg-purple-900/80 text-purple-300 border border-purple-600 animate-pulse'
                                        : item.botActivo
                                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                                        }`}>
                                        {item.esAgendado && !esTallerReal ? '📅 CITA CONFIRMADA' : item.botActivo ? '🤖 IA' : '🚨 MAN'}
                                    </span>
                                </div>

                                {ultimoMsg ? (
                                    <p className={`text-xs truncate ${item.esAgendado ? 'text-purple-300/80' : requiereAtencion ? 'text-rose-300 font-medium' : 'text-zinc-400'}`}>
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
                                            : item.esAgendado
                                                ? 'bg-purple-950 text-purple-300 border-purple-800 font-bold'
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
    )
}