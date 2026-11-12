'use client'

import { useState, useEffect } from 'react'

interface ModalCatalogoProps {
    isOpen: boolean
    onClose: () => void
}

const PRESETS_TIEMPO = [
    'Mismo día / Express (24 hrs)',
    '1 a 2 días hábiles',
    '2 a 3 días hábiles',
    '3 a 5 días hábiles',
    '5 a 7 días hábiles'
]

export default function ModalCatalogo({ isOpen, onClose }: ModalCatalogoProps) {
    const [servicios, setServicios] = useState<any[]>([])
    const [tiempoEntrega, setTiempoEntrega] = useState('1 a 2 días hábiles')
    const [notaCarga, setNotaCarga] = useState('')
    const [cargando, setCargando] = useState(false)
    const [guardandoTiempo, setGuardandoTiempo] = useState(false)

    // Formulario nuevo producto
    const [nuevoNombre, setNuevoNombre] = useState('')
    const [nuevaCategoria, setNuevaCategoria] = useState('Controles')
    const [nuevoPrecio, setNuevoPrecio] = useState('')
    const [nuevaDesc, setNuevaDesc] = useState('')
    const [creando, setCreando] = useState(false)

    // Edición rápida de precio
    const [editandoId, setEditandoId] = useState<string | null>(null)
    const [precioEditado, setPrecioEditado] = useState('')

    const cargarDatos = async () => {
        setCargando(true)
        try {
            const res = await fetch('/api/admin/catalogo')
            const data = await res.json()
            if (data.success) {
                setServicios(data.servicios || [])
                if (data.config) {
                    setTiempoEntrega(data.config.tiempoEntregaActual || '1 a 2 días hábiles')
                    setNotaCarga(data.config.notaCargaTrabajo || '')
                }
            }
        } catch (e) {
            console.error('Error cargando catálogo:', e)
        } finally {
            setCargando(false)
        }
    }

    useEffect(() => {
        if (isOpen) cargarDatos()
    }, [isOpen])

    const handleGuardarTiempo = async (tiempoSeleccionado?: string) => {
        const valorFinal = tiempoSeleccionado || tiempoEntrega
        setTiempoEntrega(valorFinal)
        setGuardandoTiempo(true)
        try {
            const res = await fetch('/api/admin/catalogo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'actualizar_tiempo',
                    tiempoEntregaActual: valorFinal,
                    notaCargaTrabajo: notaCarga
                })
            })
            if (res.ok) {
                alert(`⏱️ Tiempo de entrega actualizado a: "${valorFinal}". El bot de WhatsApp ya lo informará a los clientes.`)
            }
        } catch (e) {
            alert('Error al actualizar tiempo de entrega.')
        } finally {
            setGuardandoTiempo(false)
        }
    }

    const handleAgregarServicio = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!nuevoNombre.trim() || !nuevoPrecio) return
        setCreando(true)
        try {
            const res = await fetch('/api/admin/catalogo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre: nuevoNombre,
                    categoria: nuevaCategoria,
                    precio: parseFloat(nuevoPrecio),
                    descripcion: nuevaDesc
                })
            })
            if (res.ok) {
                setNuevoNombre('')
                setNuevoPrecio('')
                setNuevaDesc('')
                cargarDatos()
            }
        } catch (e) {
            alert('Error al guardar producto.')
        } finally {
            setCreando(false)
        }
    }

    const handleActualizarPrecio = async (id: string) => {
        if (!precioEditado || isNaN(Number(precioEditado))) return
        try {
            const res = await fetch('/api/admin/catalogo', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, precio: parseFloat(precioEditado) })
            })
            if (res.ok) {
                setEditandoId(null)
                cargarDatos()
            }
        } catch (e) {
            alert('Error actualizando precio.')
        }
    }

    const handleToggleActivo = async (servicio: any) => {
        try {
            await fetch('/api/admin/catalogo', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: servicio.id, activo: !servicio.activo })
            })
            cargarDatos()
        } catch (e) { }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>

                {/* Cabecera */}
                <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
                    <div>
                        <h3 className="text-white font-bold font-mono text-sm flex items-center gap-2">
                            🏷️ Catálogo de Precios & Tiempos de Entrega
                        </h3>
                        <p className="text-[11px] text-zinc-400 font-mono">
                            Los cambios se sincronizan en tiempo real con el asistente de WhatsApp
                        </p>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white font-bold px-2 py-1">❌</button>
                </div>

                <div className="p-5 overflow-y-auto space-y-6">

                    {/* SECCIÓN 1: TIEMPO DE ENTREGA SEGÚN CARGA DEL TALLER */}
                    <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-mono font-bold text-amber-400 uppercase">
                                ⏱️ Tiempo Estimado de Reparación y Entrega Vigente
                            </h4>
                            <span className="text-[11px] font-mono bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded-lg border border-amber-500/40 font-bold">
                                Actual: {tiempoEntrega}
                            </span>
                        </div>

                        {/* Botones rápidos de carga de trabajo */}
                        <div className="flex flex-wrap gap-2">
                            {PRESETS_TIEMPO.map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => handleGuardarTiempo(preset)}
                                    disabled={guardandoTiempo}
                                    className={`text-[11px] font-mono px-3 py-1.5 rounded-xl border transition-all ${tiempoEntrega === preset
                                            ? 'bg-amber-500 text-black border-amber-400 font-bold'
                                            : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-amber-500/50'
                                        }`}
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>

                        {/* Personalizado + Nota opcional */}
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                            <input
                                type="text"
                                value={tiempoEntrega}
                                onChange={(e) => setTiempoEntrega(e.target.value)}
                                placeholder="Ej. 3 a 5 días hábiles"
                                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-amber-500"
                            />
                            <input
                                type="text"
                                value={notaCarga}
                                onChange={(e) => setNotaCarga(e.target.value)}
                                placeholder="Nota opcional (ej. Alta carga en banco)"
                                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 font-mono outline-none focus:border-amber-500"
                            />
                            <button
                                onClick={() => handleGuardarTiempo()}
                                disabled={guardandoTiempo}
                                className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs px-4 py-2 rounded-xl transition-colors shrink-0"
                            >
                                {guardandoTiempo ? 'Guardando...' : '💾 Fijar Tiempo'}
                            </button>
                        </div>
                    </div>

                    {/* SECCIÓN 2: AGREGAR NUEVO PRODUCTO O SERVICIO */}
                    <form onSubmit={handleAgregarServicio} className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                        <h4 className="text-xs font-mono font-bold text-emerald-400 uppercase">
                            ➕ Agregar Servicio o Refacción al Catálogo
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                            <input
                                type="text"
                                required
                                placeholder="Nombre (ej. TMR 720° para Dual Sense Edge)"
                                value={nuevoNombre}
                                onChange={(e) => setNuevoNombre(e.target.value)}
                                className="sm:col-span-5 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                            />
                            <select
                                value={nuevaCategoria}
                                onChange={(e) => setNuevaCategoria(e.target.value)}
                                className="sm:col-span-3 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 font-mono outline-none focus:border-emerald-500"
                            >
                                <option value="Controles">🎮 Controles</option>
                                <option value="Consolas">🕹️ Consolas</option>
                                <option value="Modificaciones">⚡ Modificaciones / Magia</option>
                                <option value="Mantenimiento">🧼 Mantenimiento</option>
                                <option value="Laptops / PC">💻 Laptops / PC</option>
                            </select>
                            <input
                                type="number"
                                required
                                placeholder="Precio ($ MXN)"
                                value={nuevoPrecio}
                                onChange={(e) => setNuevoPrecio(e.target.value)}
                                className="sm:col-span-2 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono font-bold outline-none focus:border-emerald-500"
                            />
                            <button
                                type="submit"
                                disabled={creando}
                                className="sm:col-span-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 rounded-xl transition-colors"
                            >
                                {creando ? '...' : 'Agregar'}
                            </button>
                        </div>
                        <input
                            type="text"
                            placeholder="Detalles incluidos (opcional, ej. Incluye instalación, calibración y garantía)"
                            value={nuevaDesc}
                            onChange={(e) => setNuevaDesc(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-400 outline-none focus:border-emerald-500"
                        />
                    </form>

                    {/* SECCIÓN 3: LISTA DE PRECIOS CONFIGURADOS */}
                    <div>
                        <h4 className="text-xs font-mono font-bold text-zinc-400 uppercase mb-2.5">
                            📋 Lista Oficial de Servicios ({servicios.length})
                        </h4>

                        {cargando ? (
                            <p className="text-xs font-mono text-zinc-500 text-center py-6">Cargando catálogo...</p>
                        ) : servicios.length === 0 ? (
                            <p className="text-xs font-mono text-zinc-600 text-center py-8 bg-zinc-900/30 rounded-xl border border-zinc-900">
                                Aún no hay servicios personalizados registrados. Agrega el primero arriba.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {servicios.map((srv) => (
                                    <div key={srv.id} className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${srv.activo ? 'bg-zinc-900/80 border-zinc-800' : 'bg-zinc-950 border-zinc-900 opacity-50'}`}>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-mono bg-zinc-950 text-zinc-400 px-2 py-0.5 rounded border border-zinc-800">
                                                    {srv.categoria}
                                                </span>
                                                <p className="text-xs font-bold text-white">{srv.nombre}</p>
                                            </div>
                                            {srv.descripcion && (
                                                <p className="text-[11px] text-zinc-400 mt-0.5">{srv.descripcion}</p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            {editandoId === srv.id ? (
                                                <div className="flex items-center gap-1">
                                                    <span className="text-xs text-zinc-400">$</span>
                                                    <input
                                                        type="number"
                                                        value={precioEditado}
                                                        onChange={(e) => setPrecioEditado(e.target.value)}
                                                        className="w-20 bg-zinc-950 border border-emerald-500 rounded px-2 py-1 text-xs text-emerald-400 font-mono font-bold outline-none"
                                                        autoFocus
                                                    />
                                                    <button onClick={() => handleActualizarPrecio(srv.id)} className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded">
                                                        OK
                                                    </button>
                                                    <button onClick={() => setEditandoId(null)} className="text-zinc-500 text-xs px-1">
                                                        ✕
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        setEditandoId(srv.id)
                                                        setPrecioEditado(srv.precio.toString())
                                                    }}
                                                    title="Clic para modificar precio"
                                                    className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-800/70 px-3 py-1 rounded-lg transition-colors"
                                                >
                                                    ${Number(srv.precio).toLocaleString('es-MX')} MXN ✏️
                                                </button>
                                            )}

                                            <button
                                                onClick={() => handleToggleActivo(srv)}
                                                className={`text-[10px] font-mono px-2 py-1 rounded border ${srv.activo ? 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-amber-400' : 'bg-emerald-950/40 text-emerald-400 border-emerald-800'}`}
                                            >
                                                {srv.activo ? 'Pausar' : 'Activar'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}