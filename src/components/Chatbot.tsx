'use client'

import { useState } from 'react'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
}

export default function Chatbot() {
    const [isOpen, setIsOpen] = useState(false)
    const [localInput, setLocalInput] = useState('')
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(false)

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!localInput.trim() || isLoading) return

        // 1. Registrar mensaje del usuario
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: localInput.trim()
        }

        const historialActualizado = [...messages, userMessage]
        setMessages(historialActualizado)
        setLocalInput('')
        setIsLoading(true)

        try {
            // 2. Petición nativa al backend de Next.js
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: historialActualizado })
            })

            // 🛡️ Si la respuesta NO es correcta, extraemos el error y lo lanzamos al catch
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.details || errorData.error || 'Error desconocido en el servidor');
            }

            // 🚀 CÓDIGO DE ÉXITO: Fuera del condicional de error
            // 3. Inicializar el mensaje del asistente vacío para el streaming
            const assistantMessageId = (Date.now() + 1).toString()
            setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant', content: '' }])

            // 4. Leer el flujo de datos (Stream Reader)
            const reader = response.body?.getReader()
            const decoder = new TextDecoder()
            let acumulado = ''

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    // 1. Decodificamos el fragmento de texto puro que llega del servidor
                    const chunk = decoder.decode(value, { stream: true })
                    acumulado += chunk

                    // 2. Lo inyectamos directo en la pantalla del chat en tiempo real
                    setMessages(prev => prev.map(m =>
                        m.id === assistantMessageId
                            ? { ...m, content: acumulado }
                            : m
                    ))
                }
            }
        } catch (error: any) {
            console.error("❌ Error capturado en el cliente:", error)
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: `⚠️ Error: ${error?.message || 'Hubo un problema al procesar tu solicitud en el servidor.'}`
            }])
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="fixed bottom-6 right-6 z-50 font-sans">
            {/* Botón Flotante Redondo */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="bg-[#00e676] hover:bg-[#00c853] text-black font-bold p-4 rounded-full shadow-lg transition-all transform hover:scale-105 flex items-center justify-center gap-2"
                >
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-black"></span>
                    </span>
                    Soporte IA_
                </button>
            )}

            {/* Ventana de Chat Expandida */}
            {isOpen && (
                <div className="bg-[#121212] border border-zinc-800 w-80 sm:w-96 h-[500px] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                    {/* Encabezado */}
                    <div className="bg-zinc-900 p-4 border-b border-zinc-800 flex justify-between items-center">
                        <div>
                            <h3 className="text-white font-bold text-sm">Soltecot_ Asistente</h3>
                            <p className="text-xs text-[#00e676]">En línea 24/7</p>
                        </div>

                        {/* 📥 CONTENEDOR DE BOTONES (WhatsApp + Cerrar) */}
                        <div className="flex items-center gap-2">
                            <a
                                href="https://wa.me/5546088200" // 👈 REEMPLAZA ESTO: Pon el número oficial de Soltecot con su código de país sin el "+"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-[#00e676] hover:bg-[#00c853] text-black font-bold px-2 py-1 rounded-md text-[10px] transition-colors tracking-wide flex items-center gap-1"
                            >
                                🔀 Pasar a WA
                            </a>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-zinc-400 hover:text-white text-xs bg-zinc-800 px-2 py-1 rounded-md transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>

                    {/* Caja de Mensajes */}
                    <div className="flex-1 p-4 overflow-y-auto space-y-4">
                        {messages.length === 0 && (
                            <div className="text-zinc-500 text-xs text-center mt-20 px-4 leading-relaxed">
                                ¡Hola! Pregúntame por costos de reparación, consulta el estatus de tu orden (ej: <b>SOL-1001</b>) o solicita una recolección para el fin de semana.
                            </div>
                        )}

                        {messages.map((m) => (
                            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed ${m.role === 'user'
                                        ? 'bg-[#00e676] text-black font-medium rounded-tr-none'
                                        : 'bg-zinc-900 text-zinc-200 border border-zinc-800 rounded-tl-none'
                                        }`}
                                >
                                    {m.content}
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="text-zinc-500 text-xs animate-pulse">Soltecot_ está pensando...</div>
                        )}
                    </div>

                    {/* Formulario de Entrada */}
                    <form onSubmit={handleFormSubmit} className="p-3 bg-zinc-900/50 border-t border-zinc-800 flex gap-2">
                        <input
                            value={localInput}
                            onChange={(e) => setLocalInput(e.target.value)}
                            placeholder="Escribe tu duda aquí..."
                            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00e676] transition-colors"
                        />
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="bg-[#00e676] hover:bg-[#00c853] disabled:bg-zinc-700 text-black font-bold px-4 py-2 rounded-xl text-xs transition-colors"
                        >
                            Enviar
                        </button>
                    </form>
                </div>
            )}
        </div>
    )
}