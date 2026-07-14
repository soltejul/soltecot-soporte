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
                <div className="p-4 border-t border-zinc-800 bg-zinc-900">
                    <form onSubmit={manejarEnvio} className="flex gap-2">
                        <input
                            type="text"
                            value={nuevoMensaje}
                            onChange={(e) => setNuevoMensaje(e.target.value)}
                            placeholder="Escribe tu mensaje..."
                            className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                            disabled={enviando}
                        />
                        <button
                            type="submit"
                            disabled={enviando || !nuevoMensaje.trim()}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center justify-center"
                        >
                            {enviando ? '...' : 'Enviar 🚀'}
                        </button>
                    </form>
                    <p className="text-[10px] text-zinc-500 text-center mt-2">
                        Al enviar un mensaje manual, el Bot de IA se silenciará automáticamente.
                    </p>
                </div>
            </div>
        </div>
    )
}