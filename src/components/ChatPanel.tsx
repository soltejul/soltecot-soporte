'use client'

import { RefObject, useState, useEffect } from 'react'

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

// 📅 FORMATEADOR INTELIGENTE DE FECHA Y HORA (CDMX)
function formatearFechaHora(fechaIso: string) {
    if (!fechaIso) return ''
    const fecha = new Date(fechaIso)
    if (isNaN(fecha.getTime())) return ''

    const horaFormateada = fecha.toLocaleTimeString('es-MX', {
        timeZone: 'America/Mexico_City',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    })

    const hoy = new Date()
    const esHoy = fecha.toDateString() === hoy.toDateString()

    const ayer = new Date()
    ayer.setDate(hoy.getDate() - 1)
    const esAyer = fecha.toDateString() === ayer.toDateString()

    if (esHoy) return `Hoy, ${horaFormateada}`
    if (esAyer) return `Ayer, ${horaFormateada}`

    const fechaCorta = fecha.toLocaleDateString('es-MX', {
        timeZone: 'America/Mexico_City',
        day: 'numeric',
        month: 'short'
    })

    return `${fechaCorta}, ${horaFormateada}`
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

    // 🗓️ ESTADO: SELECTOR DE CITA
    const [fechaCitaInput, setFechaCitaInput] = useState('')
    const [guardandoCita, setGuardandoCita] = useState(false)

    // 📦 ESTADOS: COTIZADOR Y GENERADOR SKYDROPS
    const [modalCotizadorAbierto, setModalCotizadorAbierto] = useState(false)
    const [zipCodeDestino, setZipCodeDestino] = useState('')
    const [tipoPreset, setTipoPreset] = useState('controles')
    const [sentido, setSentido] = useState<'entrada' | 'salida'>('entrada')
    const [cargandoCotizacion, setCargandoCotizacion] = useState(false)
    const [cotizacionGanadora, setCotizacionGanadora] = useState<any>(null)
    const [generandoGuia, setGenerandoGuia] = useState(false)

    useEffect(() => {
        if (ticketSeleccionado?.fechaAgendada) {
            try {
                const d = new Date(ticketSeleccionado.fechaAgendada)
                if (!isNaN(d.getTime())) {
                    const isoLocal = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16)
                    setFechaCitaInput(isoLocal)
                }
            } catch (e) {
                setFechaCitaInput('')
            }
        } else {
            setFechaCitaInput('')
        }
    }, [ticketSeleccionado])

    const handleGuardarFechaCita = async () => {
        if (!fechaCitaInput) return alert("Selecciona una fecha y hora válidas.")
        if (!ticketSeleccionado?.id) return alert("Selecciona una orden de taller válida.")

        setGuardandoCita(true)
        try {
            // 🇲🇽 Fijamos la hora local de CDMX agregando el offset -06:00 directamente
            const fechaIsoObj = `${fechaCitaInput}:00-06:00`

            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticketId: ticketSeleccionado.id,
                    fechaIso: fechaIsoObj,
                    fechaAgendada: fechaIsoObj,
                    nuevoEstado: 'AGENDADO',
                    notasInternas: `[ISO_DATE: ${fechaIsoObj}] [AGENDADO]`,
                    botActivo: true
                })
            })

            if (res.ok) {
                alert("📅 Cita registrada con éxito en Neon DB y Google Calendar.")
                window.location.reload()
            } else {
                alert("🔴 Error al guardar la fecha de cita.")
            }
        } catch (err) {
            alert("🔴 Error de conexión con el servidor.")
        } finally {
            setGuardandoCita(false)
        }
    }

    const handleCotizarEnvio = async () => {
        if (zipCodeDestino.length !== 5) return alert("Ingresa un Código Postal de 5 dígitos.")

        setCargandoCotizacion(true)
        setCotizacionGanadora(null)

        try {
            const res = await fetch('/api/shipping/quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ zipCodeDestino, tipoPreset, sentido })
            })
            const data = await res.json()

            if (res.ok && data.success) {
                if (data.cotizacionMejor) {
                    setCotizacionGanadora(data.cotizacionMejor)
                } else {
                    alert("No se encontraron paqueterías disponibles para este CP.")
                }
            } else {
                alert(`🔴 Error: ${data.error || 'Fallo en cotización'}`)
            }
        } catch (error) {
            alert("Error de conexión con la API de Skydrops.")
        } finally {
            setCargandoCotizacion(false)
        }
    }

    // 🚀 FUNCIÓN: GENERAR Y DESCARGAR GUÍA EN PDF
    const handleGenerarGuia = async () => {
        const rateId = cotizacionGanadora?.rateId

        if (!rateId) {
            return alert("No hay una tarifa válida seleccionada para generar la guía.")
        }

        setGenerandoGuia(true)

        try {
            const res = await fetch('/api/shipping/label', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rateId })
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Error al procesar la guía con Skydrops.')
            }

            if (data.labelUrl) {
                // Abrir PDF de la etiqueta directamente en una pestaña nueva
                window.open(data.labelUrl, '_blank')
                alert(`¡Guía de ${data.carrierName || 'Paquetexpress'} creada con éxito!\n\nNúmero de rastreo: ${data.trackingNumber}`)
            } else {
                alert(`¡Guía creada con éxito!\n\nNúmero de rastreo: ${data.trackingNumber}`)
            }

        } catch (error: any) {
            alert(`🔴 Error al generar guía: ${error.message}`)
        } finally {
            setGenerandoGuia(false)
        }
    }

    if (telefonoRescate.length < 10) {
        return (
            <main className={`flex-1 bg-zinc-900/30 flex-col h-full overflow-hidden w-full relative ${telefonoRescate ? 'flex' : 'hidden md:flex'}`}>
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-600 space-y-2">
                    <span className="text-4xl">💬</span>
                    <p className="text-xs font-mono">Selecciona un equipo u orden de la izquierda para comenzar a gestionar.</p>
                </div>
            </main>
        )
    }

    return (
        <main className={`flex-1 bg-zinc-900/30 flex-col h-full overflow-hidden w-full relative ${telefonoRescate ? 'flex' : 'hidden md:flex'}`}>

            {/* 🔝 CABECERA DEL CHAT */}
            <div className="h-16 bg-zinc-950 border-b border-zinc-900 px-2 sm:px-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 sm:gap-3">
                    <button
                        onClick={() => setTelefonoRescate('')}
                        className="md:hidden text-zinc-400 p-2 hover:text-white font-bold text-xs flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg"
                    >
                        <span>⬅️</span>
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
                        value={
                            itemSeleccionadoActual?.esRecoleccion
                                ? 'RECOLECCION'
                                : itemSeleccionadoActual?.esAgendado
                                    ? 'AGENDADO'
                                    : (ticketSeleccionado?.estado || 'ESPERANDO_APROBACION')
                        }
                        onChange={(e) => cambiarEstatusTaller(e.target.value)}
                        className="hidden sm:block bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-amber-400 font-bold outline-none cursor-pointer focus:border-amber-500 font-mono transition-colors"
                    >
                        <option value="AGENDADO">📅 CITA AGENDADA</option>
                        <option value="RECOLECCION">🚚 RECOLECCIÓN A DOMICILIO</option>
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
                        {estadoBotDirecto ? '🤖 IA Activa' : '🚨 MODO MANUAL'}
                    </button>
                </div>
            </div>

            {/* 💵 BARRA DE ACCIONES RÁPIDAS */}
            <div className="bg-zinc-950/80 border-b border-zinc-900 px-3 sm:px-4 py-2 flex items-center justify-between text-xs flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    {/* COSTO DE REPARACIÓN */}
                    <div className="flex items-center gap-1">
                        <span className="text-zinc-500 font-bold">$</span>
                        <input
                            type="number"
                            placeholder="Monto"
                            value={costoReparacion}
                            onChange={(e) => setCostoReparacion(e.target.value)}
                            className="w-20 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-amber-400 font-mono font-bold text-center outline-none focus:border-amber-500 transition-colors"
                        />
                        {ticketSeleccionado && (
                            <button
                                onClick={guardarPresupuestoYEnviar}
                                className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-2 py-1 rounded transition-colors text-[10px] whitespace-nowrap"
                            >
                                🚀 Inyectar
                            </button>
                        )}
                    </div>

                    {/* 📅 SELECTOR MANUAL DE CITA */}
                    {ticketSeleccionado && (
                        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5">
                            <span className="text-emerald-400 font-bold text-[10px]">📅 Cita:</span>
                            <input
                                type="datetime-local"
                                value={fechaCitaInput}
                                onChange={(e) => setFechaCitaInput(e.target.value)}
                                className="bg-transparent text-emerald-400 font-mono text-[10px] outline-none cursor-pointer"
                            />
                            <button
                                onClick={handleGuardarFechaCita}
                                disabled={guardandoCita}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[9px] px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                            >
                                Fijar
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* 📦 BOTON SKYDROPS */}
                    <button
                        onClick={() => setModalCotizadorAbierto(!modalCotizadorAbierto)}
                        className="bg-blue-950/40 hover:bg-blue-900/60 text-blue-400 text-[10px] sm:text-[11px] px-2.5 py-1 rounded border border-blue-900/50 transition-colors font-bold flex items-center gap-1"
                    >
                        📦 Envíos
                    </button>

                    <button
                        onClick={async () => {
                            if (!telefonoRescate) return
                            try {
                                const res = await fetch('/api/admin/recordatorios', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ ticketId: ticketSeleccionado?.id, telefono: telefonoRescate })
                                })
                                const data = await res.json()
                                if (data.success) alert(`✅ ${data.mensaje}`)
                                else alert(`🔴 Error: ${data.error}`)
                            } catch (e: any) { alert('🔴 Error de conexión.') }
                        }}
                        className="bg-amber-950/40 hover:bg-amber-900/60 text-amber-400 text-[10px] sm:text-[11px] px-2.5 py-1 rounded border border-amber-900/50 transition-colors font-bold"
                    >
                        🔔 Remind
                    </button>

                    {itemSeleccionadoActual?.clienteId && (
                        <button
                            onClick={() => handleDesecharLead(itemSeleccionadoActual.clienteId)}
                            className="bg-rose-950/40 hover:bg-rose-900 text-rose-400 text-[10px] px-2 py-1 rounded border border-rose-900/50 transition-colors"
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

            {/* 📦 MODAL DESLIZABLE SKYDROPS COTIZADOR */}
            {modalCotizadorAbierto && (
                <div className="bg-zinc-900 border-b border-zinc-800 p-3 sm:p-4 text-xs shadow-inner">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-blue-400 font-bold flex items-center gap-1.5"><span className="text-base">📦</span> Cotizador Skydrops (Paquetexpress)</h3>
                        <button onClick={() => setModalCotizadorAbierto(false)} className="text-zinc-500 hover:text-zinc-300">❌ Cerrar</button>
                    </div>

                    <div className="flex flex-wrap gap-3 items-end">
                        <div>
                            <label className="block text-[10px] text-zinc-400 mb-1">C.P. Cliente</label>
                            <input
                                type="text"
                                placeholder="Ej. 04600"
                                maxLength={5}
                                value={zipCodeDestino}
                                onChange={(e) => setZipCodeDestino(e.target.value.replace(/\D/g, ''))}
                                className="w-24 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-white outline-none focus:border-blue-500 font-mono"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] text-zinc-400 mb-1">Tipo de Envío</label>
                            <select
                                value={sentido}
                                onChange={(e) => setSentido(e.target.value as 'entrada' | 'salida')}
                                className="w-44 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-white outline-none focus:border-blue-500 font-mono"
                            >
                                <option value="entrada">📥 Recepción (Cliente ➔ Taller)</option>
                                <option value="salida">📤 Retorno (Taller ➔ Cliente)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] text-zinc-400 mb-1">Tipo de Paquete</label>
                            <select
                                value={tipoPreset}
                                onChange={(e) => setTipoPreset(e.target.value)}
                                className="w-40 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-white outline-none focus:border-blue-500 font-mono"
                            >
                                <option value="controles">🎮 1 a 3 Controles</option>
                                <option value="consolas_chicas">🕹️ Consola Chica (Switch/Series S)</option>
                                <option value="consolas_grandes">🖥️ Consola Grande (PS5/Series X)</option>
                                <option value="laptops">💻 Laptop / PC</option>
                            </select>
                        </div>

                        <button
                            onClick={handleCotizarEnvio}
                            disabled={cargandoCotizacion || zipCodeDestino.length < 5}
                            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-1.5 rounded disabled:opacity-50 transition-colors"
                        >
                            {cargandoCotizacion ? '⏳ Consultando...' : '🔍 Cotizar Tarifa'}
                        </button>
                    </div>

                    {/* RESULTADO DE LA COTIZACION */}
                    {cotizacionGanadora && (
                        <div className="mt-4 p-3 bg-blue-950/20 border border-blue-900/50 rounded-lg flex items-center justify-between">
                            <div>
                                <p className="text-blue-400 font-bold uppercase">{cotizacionGanadora.proveedor}</p>
                                <p className="text-zinc-400 text-[10px]">
                                    {cotizacionGanadora.servicio} • Entrega estim. {cotizacionGanadora.diasEstimados} días hábiles
                                    <span className="ml-2 font-mono text-emerald-400 font-bold">
                                        [{sentido === 'entrada' ? '📥 Recepción' : '📤 Retorno'}]
                                    </span>
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-bold text-white font-mono">${cotizacionGanadora.precio} <span className="text-[10px] text-zinc-500">MXN</span></p>
                                <button
                                    onClick={handleGenerarGuia}
                                    disabled={generandoGuia}
                                    className="mt-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white border border-emerald-500 px-3 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer disabled:cursor-not-allowed shadow-sm"
                                >
                                    {generandoGuia ? '⏳ Generando Guía...' : '📄 Generar y Descargar Guía PDF'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 💬 HISTORIAL DE MENSAJES CON FECHA INTELIGENTE */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 text-xs bg-zinc-950/50 bg-cover bg-center">
                {cargandoHistorial ? (
                    <p className="text-zinc-500 text-center py-8 font-mono">Sincronizando chat...</p>
                ) : historialDirecto.length === 0 ? (
                    <p className="text-zinc-600 text-center py-8 font-mono">Escribe abajo para iniciar la conversación.</p>
                ) : (
                    historialDirecto.map((m: any) => {
                        const esCliente = m.origen === 'CLIENTE'
                        return (
                            <div key={m.id} className={`flex flex-col ${esCliente ? 'items-start max-w-[85%] sm:max-w-[75%]' : 'items-end max-w-[85%] sm:max-w-[75%] ml-auto'}`}>
                                <div className={`p-2.5 sm:p-3 rounded-2xl border whitespace-pre-wrap ${esCliente ? 'bg-zinc-800 text-zinc-100 rounded-tl-none border-zinc-700/50 shadow-md' : 'bg-[#18332f] text-emerald-50 rounded-tr-none border-[#224b45] shadow-md'}`}>
                                    <div className="flex justify-between items-center gap-3 mb-1 text-[9px] opacity-60">
                                        <span className="font-bold">{esCliente ? '👤 Cliente' : '🛠️ Taller'}</span>
                                    </div>
                                    <p className="text-xs">{m.texto}</p>
                                    <div className="flex items-center justify-end gap-1 text-[9px] font-mono mt-1 opacity-60">
                                        <span>{formatearFechaHora(m.createdAt)}</span>
                                        {!esCliente && <span className="text-emerald-400 font-bold">✓✓</span>}
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
                <button onClick={() => handleEnviarPlantillaCotizacion(telefonoRescate)} className="bg-amber-950/40 hover:bg-amber-900/60 text-amber-400 px-3 py-1.5 rounded-full border border-amber-900/40 whitespace-nowrap transition-colors shadow-sm font-semibold">
                    ⚡ Plantilla de Cotización (+24h)
                </button>
                <button onClick={() => setMensajeRescate("📍 *Ubicación del Laboratorio Soltecot:*\nEstamos en Hacienda Los Geranios, MZ 45 LT 14, Villas Xaltipa 2-C. Cuautitlán, Estado de México.\n\n🗺️ Google Maps: https://maps.google.com/?q=19.68430387588073,-99.15870193124036\n\n🕒 *Horarios con Cita Previa:*\nLunes a Jueves: 7:00 PM a 9:00 PM\nSábados: 11:00 AM a 2:00 PM")} className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-full border border-zinc-800 whitespace-nowrap transition-colors">
                    📍 Ubicación
                </button>
                <button onClick={() => setMensajeRescate("💳 *Datos Bancarios Oficiales Soltecot:*\n\nInstitución: Mercado Pago\nCLABE: 722969010772346142\nBeneficiario: Julio Cesar Lopez Castro\n\nPor favor, envíame tu comprobante por aquí una vez realizado el pago para ingresarlo al sistema. 🧾")} className="bg-blue-950/30 hover:bg-blue-900/50 text-blue-300 px-3 py-1.5 rounded-full border border-blue-900/50 whitespace-nowrap transition-colors">
                    💳 Mercado Pago (Sin Factura)
                </button>
                <button onClick={() => setMensajeRescate("💳 *Datos Bancarios Oficiales (Para Facturación):*\n\nBanco: BBVA\nCuenta CLABE: 0121 8001 2345 6789 01\nBeneficiario: Julio César López Castro\n\nPor favor, envíame tu comprobante por aquí una vez realizado el pago para ingresarlo al sistema. 🧾")} className="bg-indigo-950/30 hover:bg-indigo-900/50 text-indigo-300 px-3 py-1.5 rounded-full border border-indigo-900/50 whitespace-nowrap transition-colors">
                    💳 BBVA (Requiere Factura)
                </button>
            </div>

            {/* 🚀 BARRA DE ENTRADA Y ENVÍO */}
            <div className="p-2 sm:p-3 bg-zinc-950 flex flex-wrap items-center gap-2 border-t border-zinc-900 shrink-0">
                <label className="cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 p-2.5 sm:p-3 rounded-xl transition-colors flex items-center justify-center shrink-0">
                    <span className="text-base sm:text-lg">📷</span>
                    <input type="file" accept="image/*,video/*,.pdf" onChange={(e) => setArchivoAdjunto(e.target.files?.[0] || null)} className="hidden" />
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

                <button onClick={handleEnviarMensaje} disabled={enviandoRescate || (!mensajeRescate.trim() && !archivoAdjunto)} className="bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-xs sm:text-sm px-4 py-2.5 sm:py-3 rounded-xl transition-colors shadow-lg shrink-0 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
                    <span className="hidden sm:inline">{enviandoRescate ? 'Enviando...' : 'Enviar'}</span>
                    <span>🚀</span>
                </button>
            </div>
        </main>
    )
}