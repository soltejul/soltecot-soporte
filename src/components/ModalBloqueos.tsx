'use client'

import { useState, useEffect } from 'react'

interface Bloqueo {
    id: string
    fechaInicio: string
    fechaFin: string
    motivo: string
}

export default function ModalBloqueos({
    isOpen,
    onClose
}: {
    isOpen: boolean
    onClose: () => void
}) {
    const [bloqueos, setBloqueos] = useState<Bloqueo[]>([])
    const [cargando, setCargando] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [form, setForm] = useState({
        fechaInicio: '',
        fechaFin: '',
        motivo: ''
    })

    const cargarBloqueos = async () => {
        setCargando(true)
        try {
            const res = await fetch('/api/admin/bloqueos')
            const data = await res.json()
            if (Array.isArray(data)) setBloqueos(data)
        } catch (error) {
            console.error('Error cargando bloqueos:', error)
        } finally {
            setCargando(false)
        }
    }

    useEffect(() => {
        if (isOpen) cargarBloqueos()
    }, [isOpen])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.fechaInicio || !form.fechaFin) return alert('Selecciona fecha de inicio y fin')

        setGuardando(true)
        try {
            // 💡 Forzamos 'T00:00:00' para asegurarnos de que la fecha se envíe limpia en hora local
            const res = await fetch('/api/admin/bloqueos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    fechaInicio: `${form.fechaInicio}T00:00:00`,
                    fechaFin: `${form.fechaFin}T23:59:59`
                })
            })

            if (!res.ok) throw new Error('Error al guardar el bloqueo')

            setForm({ fechaInicio: '', fechaFin: '', motivo: '' })
            await cargarBloqueos()
        } catch (error: any) {
            alert(error.message)
        } finally {
            setGuardando(false)
        }
    }

    const eliminarBloqueo = async (id: string) => {
        if (!confirm('¿Deseas eliminar este periodo de inactividad? La IA volverá a agendar citas normalmente.')) return

        try {
            const res = await fetch(`/api/admin/bloqueos?id=${id}`, { method: 'DELETE' })
            if (res.ok) {
                setBloqueos((prev) => prev.filter((b) => b.id !== id))
            }
        } catch (error) {
            console.error('Error al eliminar bloqueo:', error)
        }
    }

    // 🗓️ Función de formato de fecha blindada contra desfase UTC
    const formatearFecha = (fechaStr: string, opciones: Intl.DateTimeFormatOptions) => {
        return new Date(fechaStr).toLocaleDateString('es-MX', {
            ...opciones,
            timeZone: 'UTC' // 👈 Mantiene el día exacto seleccionado
        })
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl text-white space-y-6 animate-in fade-in zoom-in duration-200">

                {/* ENCABEZADO */}
                <div className="flex justify-between items-center border-b border-zinc-900 pb-4">
                    <div>
                        <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                            📅 Control de Inactividad (Out of Office)
                        </h3>
                        <p className="text-zinc-500 text-xs mt-0.5">
                            La IA bloqueará citas y capturará Leads en estas fechas.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-zinc-400 hover:text-white bg-zinc-900 p-2 rounded-lg text-xs font-bold transition-colors"
                    >
                        ✕
                    </button>
                </div>

                {/* FORMULARIO DE NUEVO BLOQUEO */}
                <form onSubmit={handleSubmit} className="space-y-4 bg-zinc-900/50 p-4 rounded-xl border border-zinc-900">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                        ➕ Programar Inactividad / Vacaciones
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-semibold text-zinc-400 mb-1 uppercase">Fecha Inicio</label>
                            <input
                                type="date"
                                required
                                value={form.fechaInicio}
                                onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-white outline-none focus:border-emerald-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-zinc-400 mb-1 uppercase">Fecha Fin</label>
                            <input
                                type="date"
                                required
                                value={form.fechaFin}
                                onChange={(e) => setForm({ ...form, fechaFin: e.target.value })}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-white outline-none focus:border-emerald-500 transition-colors"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[11px] font-semibold text-zinc-400 mb-1 uppercase">Motivo (Opcional)</label>
                        <input
                            type="text"
                            placeholder="Ej: Mantenimiento de laboratorio / Salida fuera"
                            value={form.motivo}
                            onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-white outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={guardando}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg text-xs transition-colors disabled:opacity-50"
                    >
                        {guardando ? 'Notificando a la IA...' : '🔒 Bloquear Fechas en Agenda'}
                    </button>
                </form>

                {/* LISTA DE PERIODOS REGISTRADOS */}
                <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
                        📋 Periodos Bloqueados Activos ({bloqueos.length})
                    </h4>

                    {cargando ? (
                        <p className="text-xs text-zinc-500 text-center py-4">Cargando fechas...</p>
                    ) : bloqueos.length === 0 ? (
                        <p className="text-xs text-zinc-500 text-center py-4 border border-dashed border-zinc-900 rounded-xl">
                            No hay bloqueos activos. Operación normal en agenda.
                        </p>
                    ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {bloqueos.map((b) => (
                                <div
                                    key={b.id}
                                    className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-xs"
                                >
                                    <div>
                                        <p className="font-bold text-amber-400">
                                            {formatearFecha(b.fechaInicio, { day: 'numeric', month: 'short' })}
                                            {' ➔ '}
                                            {formatearFecha(b.fechaFin, { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </p>
                                        <p className="text-zinc-400 text-[11px] mt-0.5">
                                            {b.motivo || 'Fuera de laboratorio'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => eliminarBloqueo(b.id)}
                                        className="bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-900/50 px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition-colors"
                                    >
                                        🗑️ Eliminar
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </div>
    )
}