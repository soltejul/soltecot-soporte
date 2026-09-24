'use client'

import { RefObject } from 'react'

interface ChatPanelProps {
    telefonoRescate: string
    setTelefonoRescate: (tel: string) => void
    itemSeleccionadoActual: any
    ticketSeleccionado: any
    costoReparacion: string
    setCostoReparacion: (val: string) => void
    estadoBotDirecto: boolean | null
    toggleBotActual: () => Promise<void>
    cambiarEstatusTaller: (nuevoEstado: string) => Promise<void>
    guardarPresupuestoYEnviar: () => Promise<void>
    handleDesecharLead: (clienteId: string) => Promise<void>
    setTicketDetalle: (ticket: any) => void
    cargandoHistorial: boolean
    historialDirecto: any[]
    chatEndRef: RefObject<HTMLDivElement | null>
    handleEnviarPlantillaCotizacion: (telefono: string) => Promise<void>
    mensajeRescate: string
    setMensajeRescate: (msg: string) => void
    archivoAdjunto: File | null
    setArchivoAdjunto: (file: File | null) => void
    enviandoRescate: boolean
    handleEnviarMensaje: () => Promise<void>
}

export default function ChatPanel({
    telefonoRescate,
    setTelefonoRescate,
    itemSeleccionadoActual,
    ticketSeleccionado,
    costoReparacion,
    setCostoReparacion,
    estadoBotDirecto,
    toggleBotActual,
    cambiarEstatusTaller,
    guardarPresupuestoYEnviar,
    handleDesecharLead,
    setTicketDetalle,
    cargandoHistorial,
    historialDirecto,
    chatEndRef,
    handleEnviarPlantillaCotizacion,
    mensajeRescate,
    setMensajeRescate,
    archivoAdjunto,
    setArchivoAdjunto,
    enviandoRescate,
    handleEnviarMensaje
}: ChatPanelProps) {

    if (telefonoRescate.length < 10) {
        return (
            <main className="flex-1 bg-zinc-900/30 flex flex-col h-full overflow-hidden w-full relative">
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-600 space-y-2">
                    <span className="text-4xl">💬</span>
                    <p className="text-xs font-mono">Selecciona un equipo u orden de la izquierda para comenzar a gestionar.</p>
                </div>
            </main>
        )
    }

    return (
        <main className="flex-1 bg-zinc-900/30 flex flex-col h-full overflow-hidden w-full relative">

            {/* 🔝 CABECERA DEL CHAT */}
            <div className="h-16 bg-zinc-950 border-b border-zinc-900 px-2 sm:px-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 sm:gap-3">
                    <button
                        onClick={() => setTelefonoRescate('')}
                        className="md:hidden text-zinc-400 p-1 hover:text-white"
                        title="Volver a la lista"
                    >
                        ⬅️
                    </button>
                    <div className="hidden sm:flex w-10 h-10 rounded-full bg-zinc-800 items-center justify-center font-bold text-emerald-400 border border-zinc-700">
                        {telefonoRescate.slice(-2)}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-sm text-zinc-100 truncate max-w-[120px] sm:max-w-[200px]">
                                {ticketSeleccionado?.cliente?.nombre || itemSeleccionadoActual?.nombre || 'Cliente WhatsApp'}
                            </h2>
                            <span className={`border text-[9px] sm:text-[10px] font-mono px-2 py-0.5 rounded font-bold hidden sm:inline-block ${itemSeleccionadoActual?.tipo === 'taller'
                                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                : 'bg-amber-950 text-amber-400 border-amber-800/60'
                                }`}>
                                {itemSeleccionadoActual?.folio || 'LEAD-WHATSAPP'}
                            </span>
                        </div>
                        <p className="text-[10px] sm:text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-emerald-400">📱 {telefonoRescate}</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={itemSeleccionadoActual?.esAgendado ? 'AGENDADO' : (ticketSeleccionado?.estado || 'ESPERANDO_APROBACION')}
                        onChange={(e) => cambiarEstatusTaller(e.target.value)}
                        className="hidden sm:block bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-amber-400 font-bold outline-none cursor-pointer focus:border-amber-500 font-mono transition-colors"
                    >
                        <option value="AGENDADO">📅 CITA AGENDADA</option>
                        <option value="RECIBIDO">🛠️ RECIBIDO EN TALLER</option>
                        <option value="EN_DIAGNOSTICO">🔬 EN DIAGNÓSTICO</option>
                        <option value="ESPERANDO_APROBACION">⏳ APROBACIÓN PENDIENTE</option>
                        <option value="EN_REPARACION">⚙️ EN REPARACIÓN</option>
                        <option value="LISTO_PARA_ENTREGA">✅ LISTO PARA ENTREGAR</option>
                        <option value="ENTREGADO">📦 ENTREGADO</option>
                        <option value="RECHAZADO">❌ RECHAZADO</option>
                    </select>

                    <button
                        onClick={toggleBotActual}
                        className={`text-[10px] sm:text-xs font-bold px-2 sm:px-3 py-1.5 rounded-lg border transition-all ${estadoBotDirecto
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800 hover:bg-emerald-900'
                            : 'bg-rose-950 text-rose-400 border-rose-600 shadow-[0_0_12px_rgba(225,29,72,0.4)] animate-pulse hover:bg-rose-900'
                            }`}
                    >
                        {estadoBotDirecto ? '🤖 IA Activa' : '🚨 MODO MANUAL ACTIVO'}
                    </button>
                </div>
            </div>

            {/* 💵 BARRA DE ACCIONES RÁPIDAS Y MONTO */}
            <div className="bg-zinc-950/80 border-b border-zinc-900 px-3 sm:px-4 py-2 flex items-center justify-between text-xs flex-wrap gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                    <span className="text-zinc-400 font-semibold hidden sm:inline">Costo:</span>
                    <span className="text-zinc-500 font-bold">$</span>
                    <input
                        type="number"
                        placeholder="Monto"
                        value={costoReparacion}
                        onChange={(e) => setCostoReparacion(e.target.value)}
                        className="w-20 sm:w-24 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-amber-400 font-mono font-bold text-center outline-none focus:border-amber-500 transition-colors"
                    />
                    {ticketSeleccionado && (
                        <button
                            onClick={guardarPresupuestoYEnviar}
                            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-2 sm:px-3 py-1 rounded transition-colors text-[10px] sm:text-xs whitespace-nowrap"
                        >
                            🚀 Inyectar y Reactivar IA
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {itemSeleccionadoActual?.clienteId && (
                        <button
                            onClick={() => handleDesecharLead(itemSeleccionadoActual.clienteId)}
                            className="bg-rose-950/40 hover:bg-rose-900 text-rose-400 text-[10px] px-2 py-1 rounded border border-rose-900/50 transition-colors"
                            title="Purgar Lead definitivamente"
                        >
                            🗑️ Purgar
                        </button>
                    )}
                    {ticketSeleccionado && (
                        <button
                            onClick={() => setTicketDetalle(ticketSeleccionado)}
                            className="bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-[10px] sm:text-[11px] px-2.5 py-1 rounded border border-zinc-800 transition-colors"
                        >
                            📋 Ficha
                        </button>
                    )}
                </div>
            </div>

            {/* 💬 HISTORIAL DE MENSAJES */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 text-xs bg-[url('/bg-chat.png')] bg-cover bg-center">
                {cargandoHistorial ? (
                    <p className="text-zinc-500 text-center py-8 font-mono">Sincronizando chat...</p>
                ) : historialDirecto.length === 0 ? (
                    <p className="text-zinc-600 text-center py-8 font-mono">Escribe abajo para iniciar la conversación.</p>
                ) : (
                    historialDirecto.map((m: any) => {
                        const esCliente = m.origen === 'CLIENTE'
                        return (
                            <div
                                key={m.id}
                                className={`flex flex-col ${esCliente ? 'items-start max-w-[85%] sm:max-w-[75%]' : 'items-end max-w-[85%] sm:max-w-[75%] ml-auto'}`}
                            >
                                <div
                                    className={`p-2.5 sm:p-3 rounded-2xl border whitespace-pre-wrap ${esCliente
                                        ? 'bg-zinc-800 text-zinc-100 rounded-tl-none border-zinc-700/50 shadow-md'
                                        : 'bg-[#18332f] text-emerald-50 rounded-tr-none border-[#224b45] shadow-md'
                                        }`}
                                >
                                    <div className="flex justify-between items-center gap-3 mb-1 text-[9px] opacity-60">
                                        <span className="font-bold">{esCliente ? '👤 Cliente' : '🛠️ Taller'}</span>
                                    </div>
                                    <p className="text-xs">{m.texto}</p>
                                    <div className="flex items-center justify-end gap-1 text-[9px] font-mono mt-1 opacity-60">
                                        <span>{new Date(m.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                                        {!esCliente && <span className="text-emerald-400 font-bold" title="Mensaje enviado vía Meta Cloud API">✓✓</span>}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
                <div ref={chatEndRef} />
            </div>

            {/* ⚡ PLANTILLAS Y ATAJOS PREDEFINIDOS */}
            <div className="bg-zinc-950 px-3 sm:px-4 pt-2 pb-1 flex items-center gap-2 overflow-x-auto text-[11px] hide-scrollbar border-t border-zinc-900 shrink-0">
                <button
                    onClick={() => handleEnviarPlantillaCotizacion(telefonoRescate)}
                    className="bg-amber-950/40 hover:bg-amber-900/60 text-amber-400 px-3 py-1.5 rounded-full border border-amber-900/40 whitespace-nowrap transition-colors shadow-sm font-semibold"
                >
                    ⚡ Plantilla de Cotización (+24h)
                </button>
                <button
                    onClick={() => setMensajeRescate("📍 *Ubicación del Laboratorio Soltecot:*\nEstamos en Hacienda Los Geranios, MZ 45 LT 14, Villas Xaltipa 2-C. Cuautitlán, Estado de México.\n\n🗺️ Google Maps: https://maps.google.com/?q=19.68430387588073,-99.15870193124036\n\n🕒 *Horarios con Cita Previa:*\nLunes a Viernes: 7:00 PM a 9:30 PM\nSábados: 10:00 AM a 6:00 PM")}
                    className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-full border border-zinc-800 whitespace-nowrap transition-colors"
                >
                    📍 Ubicación
                </button>
                <button
                    onClick={() => setMensajeRescate("💳 *Datos Bancarios Oficiales Soltecot:*\n\nBanco: BBVA\nCuenta CLABE: 0121 8001 2345 6789 01\nBeneficiario: Solutions & Technology On Time\n\nPor favor, envíame tu comprobante por aquí una vez realizado el pago para ingresarlo al sistema. 🧾")}
                    className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-full border border-zinc-800 whitespace-nowrap transition-colors"
                >
                    💳 Pago BBVA
                </button>
            </div>

            {/* 🚀 BARRA DE ENTRADA Y ENVÍO */}
            <div className="p-2 sm:p-3 bg-zinc-950 flex flex-wrap items-center gap-2 border-t border-zinc-900 shrink-0">
                <label
                    className="cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 p-2.5 sm:p-3 rounded-xl transition-colors flex items-center justify-center shrink-0"
                    title="Adjuntar foto, video o documento"
                >
                    <span className="text-base sm:text-lg">📷</span>
                    <input
                        type="file"
                        accept="image/*,video/*,.pdf"
                        onChange={(e) => setArchivoAdjunto(e.target.files?.[0] || null)}
                        className="hidden"
                    />
                </label>

                <div className="flex-1 relative min-w-[150px]">
                    <textarea
                        rows={1}
                        placeholder={archivoAdjunto ? `📎 Adjunto: ${archivoAdjunto.name}` : "Escribe un mensaje..."}
                        value={mensajeRescate}
                        onChange={(e) => setMensajeRescate(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleEnviarMensaje()
                            }
                        }}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 sm:py-3 text-xs sm:text-sm text-white outline-none focus:border-[#224b45] resize-none font-sans transition-colors"
                    />
                </div>

                <button
                    onClick={handleEnviarMensaje}
                    disabled={enviandoRescate || (!mensajeRescate.trim() && !archivoAdjunto)}
                    className="bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-xs sm:text-sm px-4 py-2.5 sm:py-3 rounded-xl transition-colors shadow-lg shrink-0 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span className="hidden sm:inline">{enviandoRescate ? 'Enviando...' : 'Enviar'}</span>
                    <span>🚀</span>
                </button>
            </div>
        </main>
    )
}