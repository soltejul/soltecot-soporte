'use client'

import { useState } from 'react'

interface TicketModalProps {
    ticketDetalle: any | null
    mostrarModalPresupuesto: boolean
    costoReparacion: string
    notasDiagnostico: string
    onCloseDetalle: () => void
    onClosePresupuesto: () => void
    setCostoReparacion: (val: string) => void
    setNotasDiagnostico: (val: string) => void
    onGuardarPresupuesto: () => Promise<void>
    onReloadTickets: () => void
}

export default function TicketModal({
    ticketDetalle,
    mostrarModalPresupuesto,
    costoReparacion,
    notasDiagnostico,
    onCloseDetalle,
    onClosePresupuesto,
    setCostoReparacion,
    setNotasDiagnostico,
    onGuardarPresupuesto,
    onReloadTickets
}: TicketModalProps) {
    const [actualizandoTelefono, setActualizandoTelefono] = useState(false)

    const handleActualizarTelefono = async () => {
        if (!ticketDetalle) return
        const inputEl = document.getElementById(`edit-phone-${ticketDetalle.id}`) as HTMLInputElement
        const rawPhone = inputEl?.value || ''
        const clean = rawPhone.replace(/[^0-9]/g, '').slice(-10)

        if (!clean || clean.length < 10) {
            alert('Por favor ingresa un número válido de 10 dígitos.')
            return
        }

        setActualizandoTelefono(true)
        try {
            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticketId: ticketDetalle.id,
                    telefonoNuevo: clean,
                    reenviarNotificacion: true
                })
            })

            if (res.ok) {
                alert(`✅ Teléfono actualizado a ${clean} y notificación reenviada.`)
                onCloseDetalle()
                onReloadTickets()
            } else {
                alert('Error al actualizar el teléfono.')
            }
        } catch (err) {
            alert('Error de conexión al servidor.')
        } finally {
            setActualizandoTelefono(false)
        }
    }

    return (
        <>
            {/* 📋 MODAL 1: FICHA DETALLADA DE INGRESO */}
            {ticketDetalle && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-zinc-950 border border-zinc-900 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-start border-b border-zinc-900 pb-3">
                            <div>
                                <h3 className="text-lg font-bold text-emerald-400 font-mono">
                                    📋 FICHA DE INGRESO
                                </h3>
                                <p className="text-xs font-mono text-zinc-400 mt-1">{ticketDetalle.numeroOrden}</p>
                                <p className="text-[10px] text-zinc-500">
                                    Registrado el {new Date(ticketDetalle.createdAt).toLocaleString('es-MX')}
                                </p>
                            </div>
                            <button
                                onClick={onCloseDetalle}
                                className="text-zinc-500 hover:text-white font-bold text-base"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-900">
                                <span className="text-zinc-500 uppercase font-bold text-[10px] block mb-1">Cliente y Contacto</span>
                                <p className="text-zinc-200 font-semibold text-sm">{ticketDetalle.cliente?.nombre || 'Sin Nombre'}</p>

                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                    <span className="text-sm">📱</span>
                                    <input
                                        type="text"
                                        defaultValue={ticketDetalle.cliente?.telefono || ''}
                                        id={`edit-phone-${ticketDetalle.id}`}
                                        className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-emerald-400 font-mono focus:border-emerald-500 outline-none w-36"
                                        placeholder="10 dígitos"
                                    />
                                    <button
                                        onClick={handleActualizarTelefono}
                                        disabled={actualizandoTelefono}
                                        className="bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-800 text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {actualizandoTelefono ? 'Guardando...' : '✏️ Actualizar'}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-900 space-y-2">
                                <div>
                                    <span className="text-zinc-500 uppercase font-bold text-[10px] block mb-0.5">Dispositivo / Equipo</span>
                                    <p className="text-zinc-200 font-bold">{ticketDetalle.equipo}</p>
                                </div>
                                <div>
                                    <span className="text-zinc-500 uppercase font-bold text-[10px] block mb-0.5">Falla Reportada</span>
                                    <p className="text-amber-300 font-medium bg-zinc-950/80 p-2 rounded-lg border border-zinc-800/80">
                                        {ticketDetalle.fallaReportada || 'Sin detalle de falla.'}
                                    </p>
                                </div>
                            </div>

                            {ticketDetalle.notasDiagnostico && (
                                <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-900">
                                    <span className="text-zinc-500 uppercase font-bold text-[10px] block mb-1">Notas de Diagnóstico en Taller</span>
                                    <p className="text-indigo-300 font-mono text-[11px] whitespace-pre-wrap">{ticketDetalle.notasDiagnostico}</p>
                                </div>
                            )}

                            {ticketDetalle.fotosIngreso && ticketDetalle.fotosIngreso.length > 0 && (
                                <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-900">
                                    <span className="text-zinc-500 uppercase font-bold text-[10px] block mb-2">Evidencias Fotográficas</span>
                                    <div className="flex flex-wrap gap-2">
                                        {ticketDetalle.fotosIngreso.map((fotoId: string, idx: number) => (
                                            <a
                                                key={fotoId}
                                                href={`https://drive.google.com/file/d/${fotoId}/view`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                            >
                                                📷 Foto Evidencia {idx + 1}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end pt-2">
                            <button
                                onClick={onCloseDetalle}
                                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 font-bold transition-colors"
                            >
                                Cerrar Ficha
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 💰 MODAL 2: ENVIAR PRESUPUESTO / COTIZACIÓN */}
            {mostrarModalPresupuesto && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-zinc-950 border border-zinc-900 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-amber-400 mb-1">💰 Enviar Presupuesto</h3>
                        <p className="text-xs text-zinc-400 mb-4">Ingresa el monto para autorizar la orden de taller.</p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Costo Total ($ MXN)</label>
                                <input
                                    type="number"
                                    placeholder="Ej: 2450"
                                    value={costoReparacion}
                                    onChange={(e) => setCostoReparacion(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-base text-white outline-none focus:border-amber-500 font-mono"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Detalles del Diagnóstico</label>
                                <textarea
                                    placeholder="Indica qué componentes se van a reparar..."
                                    rows={3}
                                    value={notasDiagnostico}
                                    onChange={(e) => setNotasDiagnostico(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm text-white outline-none focus:border-amber-500 resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={onClosePresupuesto}
                                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-400 font-bold transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={onGuardarPresupuesto}
                                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-black text-xs transition-colors"
                            >
                                Enviar 🚀
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}