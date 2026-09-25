'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

interface Mensaje {
    id: string
    texto: string
    origen: 'CLIENTE' | 'BOT' | 'HUMANO'
    createdAt: string
}

interface ModalChatProps {
    isOpen: boolean
    onClose: () => void
    clienteId: string
    nombreCliente: string
    telefono: string
    ticketId?: string
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

    if (esHoy) {
        return `Hoy, ${horaFormateada}`
    }
    if (esAyer) {
        return `Ayer, ${horaFormateada}`
    }

    const fechaCorta = fecha.toLocaleDateString('es-MX', {
        timeZone: 'America/Mexico_City',
        day: 'numeric',
        month: 'short'
    })

    return `${fechaCorta}, ${horaFormateada}`
}

export default function ModalChat({ isOpen, onClose, clienteId, nombreCliente, telefono, ticketId }: ModalChatProps) {
    const [mensajes, setMensajes] = useState<Mensaje[]>([])
    const [nuevoMensaje, setNuevoMensaje] = useState('')
    const [cargando, setCargando] = useState(false)
    const [enviando, setEnviando] = useState(false)
    const [subiendoFoto, setSubiendoFoto] = useState(false)

    const mensajesFinRef = useRef<HTMLDivElement>(null)
    const cameraInputRef = useRef<HTMLInputElement>(null)

    // 📥 CARGAR HISTORIAL DESDE LA API OFICIAL
    const cargarMensajes = useCallback(async () => {
        if (!telefono) return
        try {
            const cleanPhone = telefono.replace(/[^0-9]/g, '').slice(-10)
            const res = await fetch(`/api/admin/mensajes?telefono=${cleanPhone}`)
            if (res.ok) {
                const data = await res.json()
                if (Array.isArray(data.mensajes)) {
                    setMensajes(data.mensajes)
                }
            }
        } catch (error) {
            console.error("Error al cargar historial de chat:", error)
        } finally {
            setCargando(false)
        }
    }, [telefono])

    // 🔄 AUTO-REFRESH (Polling cada 4s mientras el modal esté abierto)
    useEffect(() => {
        if (!isOpen || !telefono) return

        setCargando(true)
        cargarMensajes()

        const intervalo = setInterval(cargarMensajes, 4000)
        return () => clearInterval(intervalo)
    }, [isOpen, telefono, cargarMensajes])

    // ⌨️ CIERRE CON TECLA ESCAPE
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        if (isOpen) window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    // 👇 AUTO-SCROLL HACIA EL ÚLTIMO MENSAJE
    useEffect(() => {
        mensajesFinRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [mensajes])

    // 📷 SUBIR FOTO DE EVIDENCIA A DRIVE Y ENVIAR POR WHATSAPP
    const enviarFotoAvance = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!ticketId) {
            alert('⚠️ No se encontró un folio de orden activo asociado para guardar la imagen en Google Drive.')
            return
        }

        setSubiendoFoto(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('ticketId', ticketId)
            formData.append('notaAvance', nuevoMensaje.trim() || 'Evidencia técnica del servicio:')

            const res = await fetch('/api/tickets/enviar-avance', {
                method: 'POST',
                body: formData,
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Error al enviar la imagen')

            setNuevoMensaje('')
            cargarMensajes()
        } catch (err: any) {
            alert(`⚠️ ${err.message}`)
        } finally {
            setSubiendoFoto(false)
            if (e.target) e.target.value = ''
        }
    }

    // 🚀 ENVIAR MENSAJE MANUAL DE TEXTO (API CHAT DIRECTO)
    const manejarEnvio = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!nuevoMensaje.trim()) return

        setEnviando(true)
        try {
            const res = await fetch('/api/admin/chat-directo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clienteId, texto: nuevoMensaje.trim() })
            })

            if (res.ok) {
                const data = await res.json()
                if (data.mensaje) {
                    setMensajes(prev => [...prev, data.mensaje])
                } else {
                    cargarMensajes()
                }
                setNuevoMensaje('')
            } else {
                const errData = await res.json()
                alert(`⚠️ Error: ${errData.error || 'No se pudo despachar el mensaje'}`)
            }
        } catch (error) {
            console.error("Error al enviar mensaje:", error)
        } finally {
            setEnviando(false)
        }
    }

    if (!isOpen) return null

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm transition-opacity"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md h-full bg-zinc-950 border-l border-zinc-900 shadow-2xl flex flex-col cursor-default font-sans"
            >

                {/* 🏷️ ENCABEZADO DE CHAT */}
                <div className="p-4 border-b border-zinc-900 bg-zinc-900/90 flex justify-between items-center">
                    <div>
                        <h3 className="text-white font-bold flex items-center gap-2 text-sm">
                            💬 {nombreCliente}
                        </h3>
                        <p className="text-emerald-400 text-xs font-mono mt-0.5">📱 {telefono}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-1.5 transition-colors text-xs font-bold"
                    >
                        ✕ Cerrar
                    </button>
                </div>

                {/* 📜 ÁREA DE CONVERSACIÓN */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-950">
                    {cargando && mensajes.length === 0 ? (
                        <p className="text-center text-zinc-500 text-xs mt-10 font-mono animate-pulse">Cargando conversación en vivo...</p>
                    ) : mensajes.length === 0 ? (
                        <p className="text-center text-zinc-600 text-xs mt-10 font-mono">No hay mensajes previos con este cliente.</p>
                    ) : (
                        mensajes.map((msg) => {
                            const esMio = msg.origen === 'HUMANO' || msg.origen === 'BOT'
                            return (
                                <div key={msg.id} className={`flex flex-col ${esMio ? 'items-end' : 'items-start'}`}>
                                    <span className="text-[9px] text-zinc-500 mb-1 px-1 font-mono uppercase tracking-wider">
                                        {msg.origen === 'BOT' ? '🤖 IA Soltecot' : msg.origen === 'HUMANO' ? '👨‍💻 Tú (Taller)' : '📱 Cliente'}
                                    </span>
                                    <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs shadow-md whitespace-pre-wrap leading-relaxed ${msg.origen === 'HUMANO' ? 'bg-emerald-600 text-white rounded-br-none font-medium' :
                                        msg.origen === 'BOT' ? 'bg-zinc-900 text-emerald-300 border border-emerald-900/50 rounded-br-none' :
                                            'bg-zinc-900 text-zinc-200 border border-zinc-800 rounded-bl-none'
                                        }`}>
                                        {msg.texto}
                                    </div>

                                    {/* 🕒 FECHA Y HORA DETALLADAS */}
                                    <span className="text-[9px] text-zinc-600 mt-1 font-mono">
                                        {formatearFechaHora(msg.createdAt)}
                                    </span>
                                </div>
                            )
                        })
                    )}
                    <div ref={mensajesFinRef} />
                </div>

                {/* ✍️ ÁREA DE TEXTO Y PLANTILLAS */}
                <div className="p-3 border-t border-zinc-900 bg-zinc-900/90">

                    {/* ⚡ PLANTILLAS RÁPIDAS */}
                    <div className="flex gap-2 mb-2 px-0.5 overflow-x-auto pb-1.5 hide-scrollbar">
                        <button
                            type="button"
                            onClick={() => setNuevoMensaje("Hola, te comparto nuestros datos bancarios oficiales para realizar tu depósito/transferencia:\n\n🏦 *Banco:* BBVA\n💳 *Cuenta CLABE:* 012 180 015425417770 2\n👤 *Beneficiario:* Julio Cesar López Castro\n\n🙏 Por favor, envíame el comprobante o captura por este medio una vez realizado para validarlo y anexarlo a tu orden. ¡Gracias!")}
                            className="whitespace-nowrap text-[10px] font-bold bg-zinc-800 hover:bg-emerald-950/80 text-emerald-400 px-3 py-1.5 rounded-full border border-zinc-700 hover:border-emerald-800 transition-colors shadow-sm font-mono"
                        >
                            🏦 Datos Bancarios
                        </button>
                        <button
                            type="button"
                            onClick={() => setNuevoMensaje("📍 *Ubicación del Laboratorio:*\n\nHacienda Los Geranios, MZ 45 LT 14, Villas Xaltipa 2-C. Cuautitlán, Estado de México, C.P. 54850. (Recepción en entrada principal).\n\n🗺️ *Google Maps:* https://maps.google.com/?q=19.68430387588073,-99.15870193124036")}
                            className="whitespace-nowrap text-[10px] font-bold bg-zinc-800 hover:bg-amber-950/80 text-amber-400 px-3 py-1.5 rounded-full border border-zinc-700 hover:border-amber-800 transition-colors shadow-sm font-mono"
                        >
                            📍 Ubicación Maps
                        </button>
                    </div>

                    {/* FORMULARIO DE TEXTO Y CÁMARA */}
                    <form onSubmit={manejarEnvio} className="flex items-end gap-2">
                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            ref={cameraInputRef}
                            onChange={enviarFotoAvance}
                            className="hidden"
                        />

                        <button
                            type="button"
                            disabled={subiendoFoto}
                            onClick={() => cameraInputRef.current?.click()}
                            className="bg-zinc-800 hover:bg-zinc-700 text-amber-400 p-2 rounded-xl border border-zinc-700 transition-colors flex justify-center items-center h-[38px] w-[38px] flex-shrink-0"
                            title="Tomar y subir foto de avance a Google Drive"
                        >
                            {subiendoFoto ? '⏳' : '📷'}
                        </button>

                        <textarea
                            value={nuevoMensaje}
                            onChange={(e) => setNuevoMensaje(e.target.value)}
                            placeholder="Escribe un mensaje o nota..."
                            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 resize-none min-h-[38px]"
                            disabled={enviando || subiendoFoto}
                            rows={1}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    manejarEnvio(e)
                                }
                            }}
                        />

                        <button
                            type="submit"
                            disabled={enviando || subiendoFoto || !nuevoMensaje.trim()}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3.5 rounded-xl text-xs transition-colors disabled:opacity-50 flex items-center justify-center h-[38px] flex-shrink-0"
                        >
                            {enviando ? '...' : 'Enviar 🚀'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}