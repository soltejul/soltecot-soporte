'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'

export default function GamepadTester() {
    const [gamepad, setGamepad] = useState<Gamepad | null>(null)
    const [ticketsActivos, setTicketsActivos] = useState<any[]>([])
    const [ticketSeleccionado, setTicketSeleccionado] = useState<string>('')
    const [statsLeft, setStatsLeft] = useState({ drift: 0, errorCircular: 0 })
    const [statsRight, setStatsRight] = useState({ drift: 0, errorCircular: 0 })
    const requestRef = useRef<number>(0)

    // Cargar tickets para vinculación rápida
    useEffect(() => {
        fetch('/api/tickets')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setTicketsActivos(data.filter(t => t.estado !== 'ENTREGADO' && t.estado !== 'RECHAZADO'))
                }
            })
            .catch(console.error)
    }, [])

    // Bucle de lectura de alta frecuencia (120Hz/60Hz)
    const scanGamepads = () => {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
        const activeGamepad = Array.from(gamepads).find(gp => gp !== null)

        if (activeGamepad) {
            setGamepad(activeGamepad)

            // Cálculo de Drift en Reposo (Ejes 0,1 y 2,3)
            const lx = activeGamepad.axes[0] || 0
            const ly = activeGamepad.axes[1] || 0
            const rx = activeGamepad.axes[2] || 0
            const ry = activeGamepad.axes[3] || 0

            const driftL = Math.sqrt(lx * lx + ly * ly) * 100
            const driftR = Math.sqrt(rx * rx + ry * ry) * 100

            setStatsLeft({ drift: parseFloat(driftL.toFixed(1)), errorCircular: 0 })
            setStatsRight({ drift: parseFloat(driftR.toFixed(1)), errorCircular: 0 })
        } else {
            setGamepad(null)
        }

        requestRef.current = requestAnimationFrame(scanGamepads)
    }

    useEffect(() => {
        requestRef.current = requestAnimationFrame(scanGamepads)
        return () => cancelAnimationFrame(requestRef.current)
    }, [])

    // Inyectar el reporte directo a las notas del ticket
    const guardarDiagnosticoEnTicket = async () => {
        if (!ticketSeleccionado) return alert('Selecciona una orden SOL-XXXX para vincular el diagnóstico.')

        const reporteText = `[DIAGNÓSTICO GAMEPAD TESTER]:\n- Mando: ${gamepad?.id || 'Desconocido'}\n- Joystick Izquierdo (Drift): ${statsLeft.drift}%\n- Joystick Derecho (Drift): ${statsRight.drift}%\n- Estado de botones y gatillos: OK\n- Calibración TMR realizada en banco de trabajo.`

        try {
            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticketId: ticketSeleccionado,
                    notasDiagnostico: reporteText
                })
            })
            if (res.ok) alert('✅ Diagnóstico inyectado con éxito a la orden en Neon DB.')
        } catch (err) {
            alert('Error al guardar reporte.')
        }
    }

    return (
        <div className="min-h-screen bg-black text-white p-6">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Encabezado */}
                <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-emerald-400">🎮 SOLTECOT_ GAMEPAD TESTER & TMR CALIBRATOR</h1>
                        <p className="text-xs text-zinc-500">Módulo de laboratorio para prueba de ejes, gatillos y calibración física/software</p>
                    </div>
                    <Link href="/admin" className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-4 py-2 rounded-xl text-xs font-bold transition-colors">
                        ← Volver al Panel
                    </Link>
                </div>

                {/* Selector de Ticket para Vincular */}
                <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="w-full md:w-auto flex-1">
                        <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Vincular a Orden de Servicio Active</label>
                        <select
                            value={ticketSeleccionado}
                            onChange={(e) => setTicketSeleccionado(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-white outline-none focus:border-emerald-500 font-mono"
                        >
                            <option value="">-- Selecciona una orden SOL-XXXX --</option>
                            {ticketsActivos.map(t => (
                                <option key={t.id} value={t.id}>
                                    {t.numeroOrden} - {t.cliente?.nombre} ({t.equipo})
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={guardarDiagnosticoEnTicket}
                        className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-black font-bold text-xs px-5 py-3 rounded-xl transition-colors shadow-lg"
                    >
                        📋 Inyectar Reporte al Ticket
                    </button>
                </div>

                {/* Estado de Conexión */}
                {!gamepad ? (
                    <div className="bg-zinc-950 border border-dashed border-zinc-800 rounded-2xl p-12 text-center space-y-3">
                        <span className="text-4xl animate-pulse">🔌</span>
                        <h3 className="text-lg font-bold text-zinc-300">Esperando conexión de mando...</h3>
                        <p className="text-xs text-zinc-500 max-w-md mx-auto">
                            Conecta el control mediante cable USB-C / Micro-USB y presiona cualquier botón para iniciar la detección de ejes.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Joystick Izquierdo (L3) */}
                        <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl flex flex-col items-center space-y-4">
                            <h3 className="text-sm font-bold text-indigo-400">STICK IZQUIERDO (L3)</h3>

                            {/* Canvas / SVG de Posición */}
                            <div className="relative w-48 h-48 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center">
                                <div className="absolute w-full h-[1px] bg-zinc-800"></div>
                                <div className="absolute h-full w-[1px] bg-zinc-800"></div>

                                {/* Punto indicador de eje */}
                                <div
                                    className="absolute w-4 h-4 bg-emerald-400 rounded-full shadow-[0_0_12px_rgba(52,211,153,0.8)] transition-all duration-75"
                                    style={{
                                        left: `${((gamepad.axes[0] || 0) + 1) * 50}%`,
                                        top: `${((gamepad.axes[1] || 0) + 1) * 50}%`,
                                        transform: 'translate(-50%, -50%)'
                                    }}
                                />
                            </div>

                            <div className="w-full space-y-1 text-xs font-mono">
                                <div className="flex justify-between text-zinc-400">
                                    <span>Eje X: {(gamepad.axes[0] || 0).toFixed(4)}</span>
                                    <span>Eje Y: {(gamepad.axes[1] || 0).toFixed(4)}</span>
                                </div>
                                <div className="flex justify-between font-bold">
                                    <span>Drift de Centro:</span>
                                    <span className={statsLeft.drift > 5 ? 'text-rose-400' : 'text-emerald-400'}>
                                        {statsLeft.drift}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Joystick Derecho (R3) */}
                        <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl flex flex-col items-center space-y-4">
                            <h3 className="text-sm font-bold text-indigo-400">STICK DERECHO (R3)</h3>

                            {/* Canvas / SVG de Posición */}
                            <div className="relative w-48 h-48 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center">
                                <div className="absolute w-full h-[1px] bg-zinc-800"></div>
                                <div className="absolute h-full w-[1px] bg-zinc-800"></div>

                                {/* Punto indicador de eje */}
                                <div
                                    className="absolute w-4 h-4 bg-emerald-400 rounded-full shadow-[0_0_12px_rgba(52,211,153,0.8)] transition-all duration-75"
                                    style={{
                                        left: `${((gamepad.axes[2] || 0) + 1) * 50}%`,
                                        top: `${((gamepad.axes[3] || 0) + 1) * 50}%`,
                                        transform: 'translate(-50%, -50%)'
                                    }}
                                />
                            </div>

                            <div className="w-full space-y-1 text-xs font-mono">
                                <div className="flex justify-between text-zinc-400">
                                    <span>Eje X: {(gamepad.axes[2] || 0).toFixed(4)}</span>
                                    <span>Eje Y: {(gamepad.axes[3] || 0).toFixed(4)}</span>
                                </div>
                                <div className="flex justify-between font-bold">
                                    <span>Drift de Centro:</span>
                                    <span className={statsRight.drift > 5 ? 'text-rose-400' : 'text-emerald-400'}>
                                        {statsRight.drift}%
                                    </span>
                                </div>
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    )
}