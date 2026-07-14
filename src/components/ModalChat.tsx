'use client'

import { useEffect, useState, useRef } from 'react'

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
}

export default function ModalChat({ isOpen, onClose, clienteId, nombreCliente, telefono }: ModalChatProps) {
    const [mensajes, setMensajes] = useState<Mensaje[]>([])
    const [nuevoMensaje, setNuevoMensaje] = useState('')
    const [cargando, setCargando] = useState(false)
    const [enviando, setEnviando] = useState(false)
    const mensajesFinRef = useRef<HTMLDivElement>(null)

    // 📥 Cargar historial y hacer Auto-Refresh (Polling)
    useEffect(() => {
        if (!isOpen || !clienteId) return

        const cargarMensajes = async () => {
            try {
                const res = await fetch(`/api/chat?clienteId=${clienteId}`)
                if (res.ok) {
                    const data = await res.json()
                    setMensajes(data)
                }
            } catch (error) {
                console.error("Error al cargar chat:", error)
            } finally {
                setCargando(false)
            }
        }

        setCargando(true)
        cargarMensajes()

        const intervalo = setInterval(cargarMensajes, 4000)
        return () => clearInterval(intervalo)
    }, [isOpen, clienteId])

    // 👇 Auto-Scroll hacia el último mensaje
    useEffect(() => {
        mensajesFinRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [mensajes])

    // 🚀 Enviar Mensaje
    const manejarEnvio = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!nuevoMensaje.trim()) return

        setEnviando(true)
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clienteId, texto: nuevoMensaje })
            })

            if (res.ok) {
                const { mensaje } = await res.json()
                setMensajes(prev => [...prev, mensaje])
                setNuevoMensaje('')
            }
        } catch (error) {
            console.error("Error al enviar mensaje:", error)
        } finally {
            setEnviando(false)
        }
    }

    if (!isOpen) return null

    return (
        /* 🚨 CAMBIO 1: El Backdrop oscuro ahora detecta clics externos para cerrar el modal */
        <div
            onClick={onClose}
            className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm cursor-pointer"
        >
            {/* Contenedor del Panel Lateral */}
            {/* 🚨 CAMBIO 2: Frenamos la propagación del clic (stopPropagation) y restauramos el cursor */}
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col transform transition-transform duration-300 cursor-default"
            >

                {/* 🏷️ HEADER DEL CHAT */}
                <div className="p-4 border-b border-zinc-800 bg-zinc-900 flex justify-between items-center">
                    <div>
                        <h3 className="text-white font-bold flex items-center gap-2">
                            💬 {nombreCliente}
                        </h3>
                        <p className="text-emerald-400 text-xs font-mono">{telefono}</p>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white bg-zinc-800 hover:bg-rose-500 rounded px-3 py-1 transition-colors text-sm font-bold">
                        Cerrar ✕
                    </button>
                </div>

                {/* 📜 ÁREA DE MENSAJES */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-950/50">
                    {cargando && mensajes.length === 0 ? (
                        <p className="text-center text-zinc-500 text-sm mt-10">Cargando conexión segura...</p>
                    ) : mensajes.length === 0 ? (
                        <p className="text-center text-zinc-600 text-sm mt-10">No hay historial de chat efímero activo.</p>
                    ) : (
                        mensajes.map((msg) => {
                            const esMio = msg.origen === 'HUMANO' || msg.origen === 'BOT'
                            return (
                                <div key={msg.id} className={`flex flex-col ${esMio ? 'items-end' : 'items-start'}`}>
                                    <span className="text-[10px] text-zinc-500 mb-1 px-1">
                                        {msg.origen === 'BOT' ? '🤖 IA Soltecot' : msg.origen === 'HUMANO' ? '👨‍💻 Tú (Taller)' : '📱 Cliente'}
                                    </span>
                                    <div className={`max-w-[85%] rounded-lg px-4 py-2 text-sm shadow-md whitespace-pre-wrap ${msg.origen === 'HUMANO' ? 'bg-emerald-600 text-white rounded-br-none' :
                                        msg.origen === 'BOT' ? 'bg-zinc-800 text-emerald-300 border border-emerald-900 rounded-br-none' :
                                            'bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-bl-none'
                                        }`}>
                                        {msg.texto}
                                    </div>
                                    <span className="text-[9px] text-zinc-600 mt-1">
                                        {new Date(msg.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            )
                        })
                    )}
                    <div ref={mensajesFinRef} />
                </div>

                {/* ✍️ ÁREA DE TEXTO (INPUT) */}
                {/* ✍️ ÁREA DE TEXTO (INPUT) CON RESPUESTAS RÁPIDAS */}
                <div className="p-4 border-t border-zinc-800 bg-zinc-900">

                    {/* ⚡ BOTONES DE RESPUESTAS RÁPIDAS */}
                    <div className="flex gap-2 mb-3 px-1 overflow-x-auto pb-1 scrollbar-hide">
                        <button
                            type="button"
                            onClick={() => setNuevoMensaje("Hola, te comparto nuestros datos bancarios oficiales para realizar tu depósito/transferencia:\n\n🏦 *Banco:* BBVA\n💳 *Cuenta CLABE:* 0121 8001 2345 6789 01\n👤 *Beneficiario:* Solutions & Technology On Time\n\n🙏 Por favor, envíame el comprobante o captura por este medio una vez realizado para validarlo y anexarlo a tu orden. ¡Gracias! 🔬")}
                            className="whitespace-nowrap text-[10px] font-bold bg-zinc-800 hover:bg-emerald-900/60 text-emerald-400 px-3 py-1.5 rounded-full border border-zinc-700 hover:border-emerald-700 transition-colors shadow-sm"
                        >
                            🏦 Datos Bancarios
                        </button>
                        <button
                            type="button"
                            onClick={() => setNuevoMensaje("📍 *Ubicación del Laboratorio:*\n\nHacienda Los Geranios, MZ 45 LT 14, Villas Xaltipa 2-C. Cuautitlán, Estado de México, C.P. 54850. (Recepción en entrada principal).\n\n🗺️ *Google Maps:* https://maps.google.com/?q=19.68430387588073,-99.15870193124036")}
                            className="whitespace-nowrap text-[10px] font-bold bg-zinc-800 hover:bg-amber-900/60 text-amber-400 px-3 py-1.5 rounded-full border border-zinc-700 hover:border-amber-700 transition-colors shadow-sm"
                        >
                            📍 Ubicación Maps
                        </button>
                    </div>

                    <form onSubmit={manejarEnvio} className="flex gap-2">
                        <textarea
                            value={nuevoMensaje}
                            onChange={(e) => setNuevoMensaje(e.target.value)}
                            placeholder="Escribe tu mensaje manual aquí..."
                            className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 resize-none overflow-hidden"
                            disabled={enviando}
                            rows={nuevoMensaje.split('\n').length > 1 ? Math.min(nuevoMensaje.split('\n').length, 5) : 1}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    manejarEnvio(e);
                                }
                            }}
                        />
                        <button
                            type="submit"
                            disabled={enviando || !nuevoMensaje.trim()}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center justify-center self-end h-[38px]"
                        >
                            {enviando ? '...' : 'Enviar 🚀'}
                        </button>
                    </form>
                    <p className="text-[10px] text-zinc-500 text-center mt-2">
                        💡 Tip: Presiona Enter para enviar, Shift+Enter para salto de línea. El bot se silenciará al enviar.
                    </p>
                </div>
            </div>
        </div>
    )
}