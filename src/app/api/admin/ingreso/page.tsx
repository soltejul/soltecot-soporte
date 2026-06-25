'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function RegistroOrdenAdmin() {
    const [form, setForm] = useState({
        telefono: '',
        nombre: '',
        equipo: '',
        fallaReportada: '',
        costoEstimado: '',
        notasInternas: ''
    })
    const [cargando, setCargando] = useState(false)
    const [mensajeExito, setMensajeExito] = useState('')
    const [error, setError] = useState('')

    const manejarEnvio = async (e: React.FormEvent) => {
        e.preventDefault()
        setCargando(true)
        setError('')
        setMensajeExito('')

        try {
            const res = await fetch('/api/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            })
            const data = await res.json()

            if (!res.ok) throw new Error(data.error || 'Error al procesar el ingreso')

            setMensajeExito(`¡Orden generada con éxito! Folio asignado: ${data.ticket.numeroOrden}`)
            setForm({ telefono: '', nombre: '', equipo: '', fallaReportada: '', costoEstimado: '', notasInternas: '' })
        } catch (err: any) {
            setError(err.message)
        } finally {
            setCargando(false)
        }
    }

    return (
        <div className="min-h-screen bg-black text-white p-8 flex flex-col items-center justify-center">
            <div className="w-full max-w-lg bg-zinc-950 border border-zinc-900 rounded-xl p-8 shadow-2xl">

                {/* ⬅ ENCABEZADO AJUSTADO CON BOTÓN DE ESCAPE INTEGRADO */}
                <div className="flex justify-between items-start border-b border-zinc-900 pb-4 mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-emerald-400">SOLTECOT_ INTERNAL</h2>
                        <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-0.5">Recepción de Equipos</p>
                    </div>
                    <Link
                        href="/admin"
                        className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-bold px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-1.5"
                    >
                        ⬅ Volver
                    </Link>
                </div>

                <form onSubmit={manejarEnvio} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Teléfono del Cliente (Obligatorio)</label>
                        <input
                            type="text"
                            required
                            placeholder="Ej: 5510203040"
                            value={form.telefono}
                            onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Nombre Completo</label>
                        <input
                            type="text"
                            placeholder="Ej: Julio López"
                            value={form.nombre}
                            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Equipo / Dispositivo (Obligatorio)</label>
                        <input
                            type="text"
                            required
                            placeholder="Ej: PlayStation 5 Slim o Laptop Dell Inspiron"
                            value={form.equipo}
                            onChange={(e) => setForm({ ...form, equipo: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Falla Reportada por el Cliente (Obligatorio)</label>
                        <textarea
                            required
                            rows={2}
                            placeholder="Ej: Se apaga a los 10 minutos por sobrecalentamiento"
                            value={form.fallaReportada}
                            onChange={(e) => setForm({ ...form, fallaReportada: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Costo Estimado ($)</label>
                            <input
                                type="number"
                                placeholder="Ej: 1200"
                                value={form.costoEstimado}
                                onChange={(e) => setForm({ ...form, costoEstimado: e.target.value })}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Estatus Inicial</label>
                            <div className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-emerald-400 font-bold border-dashed border-emerald-900 text-center">
                                🛠️ RECIBIDO
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Notas Técnicas / Diagnóstico Interno</label>
                        <textarea
                            rows={2}
                            placeholder="Detalles ocultos para el taller (Ej: Trae sello de garantía roto)"
                            value={form.notasInternas}
                            onChange={(e) => setForm({ ...form, notasInternas: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors resize-none"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={cargando}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded text-sm transition-colors mt-2 disabled:opacity-50"
                    >
                        {cargando ? 'Generando Folio...' : '🚀 Dar Entrada e Imprimir Orden'}
                    </button>
                </form>

                {error && <p className="text-center text-rose-500 text-sm font-semibold mt-4">⚠️ {error}</p>}
                {mensajeExito && <p className="text-center text-emerald-400 text-sm font-semibold mt-4">✅ {mensajeExito}</p>}
            </div>
        </div>
    )
}