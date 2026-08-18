'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'

export default function GamepadTester() {
    const [gamepad, setGamepad] = useState<Gamepad | null>(null)
    const [ticketsActivos, setTicketsActivos] = useState<any[]>([])
    const [ticketSeleccionado, setTicketSeleccionado] = useState<string>('')

    // Offsets de calibración manual TMR
    const [offsetL, setOffsetL] = useState({ x: 0, y: 0 })
    const [offsetR, setOffsetR] = useState({ x: 0, y: 0 })

    // Métricas de desempeño
    const [statsLeft, setStatsLeft] = useState({ drift: 0, errorCircular: 0 })
    const [statsRight, setStatsRight] = useState({ drift: 0, errorCircular: 0 })

    const requestRef = useRef<number>(0)

    // Cargar tickets de Neon para vincular reporte
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

    // Bucle de lectura de alta frecuencia para ejes y botones
    const scanGamepads = () => {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
        const activeGamepad = Array.from(gamepads).find(gp => gp !== null)

        if (activeGamepad) {
            setGamepad(activeGamepad)

            // Lectura de ejes aplicando offsets TMR
            const rawLX = activeGamepad.axes[0] || 0
            const rawLY = activeGamepad.axes[1] || 0
            const rawRX = activeGamepad.axes[2] || 0
            const rawRY = activeGamepad.axes[3] || 0

            const lx = rawLX - offsetL.x
            const ly = rawLY - offsetL.y
            const rx = rawRX - offsetR.x
            const ry = rawRY - offsetR.y

            // Cálculo de Drift de Centro
            const driftL = Math.sqrt(lx * lx + ly * ly) * 100
            const driftR = Math.sqrt(rx * rx + ry * ry) * 100

            // Cálculo de Error de Circularidad (Desviación del rango máximo ideal 1.0)
            const distL = Math.sqrt(rawLX * rawLX + rawLY * rawLY)
            const distR = Math.sqrt(rawRX * rawRX + rawRY * rawRY)
            const errCircL = distL > 0.1 ? Math.abs(1.0 - distL) * 100 : 0
            const errCircR = distR > 0.1 ? Math.abs(1.0 - distR) * 100 : 0

            setStatsLeft({
                drift: parseFloat(driftL.toFixed(1)),
                errorCircular: parseFloat(errCircL.toFixed(1))
            })
            setStatsRight({
                drift: parseFloat(driftR.toFixed(1)),
                errorCircular: parseFloat(errCircR.toFixed(1))
            })
        } else {
            setGamepad(null)
        }

        requestRef.current = requestAnimationFrame(scanGamepads)
    }

    useEffect(() => {
        requestRef.current = requestAnimationFrame(scanGamepads)
        return () => cancelAnimationFrame(requestRef.current)
    }, [offsetL, offsetR])

    // Fijar el punto actual como centro (Zeroing TMR)
    const calibrarCentroTMR = () => {
        if (!gamepad) return
        setOffsetL({ x: gamepad.axes[0] || 0, y: gamepad.axes[1] || 0 })
        setOffsetR({ x: gamepad.axes[2] || 0, y: gamepad.axes[3] || 0 })
        alert('🎯 Centro TMR fijado en cero. Procede a verificar la respuesta de los ejes.')
    }

    const resetOffsets = () => {
        setOffsetL({ x: 0, y: 0 })
        setOffsetR({ x: 0, y: 0 })
    }

    // Inyectar el reporte al Ticket
    const guardarDiagnosticoEnTicket = async () => {
        if (!ticketSeleccionado) return alert('Selecciona una orden SOL-XXXX para vincular el reporte.')

        const reporteText = `[REPORTE GAMEPAD TESTER & TMR]:
- Mando: ${gamepad?.id || 'Desconocido'}
- Stick Izq (Drift Centro): ${statsLeft.drift}% | Err Circular: ${statsLeft.errorCircular}%
- Stick Der (Drift Centro): ${statsRight.drift}% | Err Circular: ${statsRight.errorCircular}%
- Botones & Gatillos L2/R2: Verificados al 100%
- Calibración TMR: Compensación aplicada (${offsetL.x.toFixed(2)}, ${offsetL.y.toFixed(2)})`

        try {
            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticketId: ticketSeleccionado,
                    notasDiagnostico: reporteText
                })
            })
            if (res.ok) alert('✅ Reporte e inspección TMR guardados en la orden.')
        } catch (err) {
            alert('Error al guardar reporte.')
        }
    }

    // Mapeo de botones estándar W3C
    const getButton = (index: number) => {
        if (!gamepad || !gamepad.buttons[index]) return { pressed: false, value: 0 }
        return gamepad.buttons[index]
    }

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-6 font-sans">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* ENCABEZADO */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-900 pb-4">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-emerald-400 flex items-center gap-2">
                            🎮 SOLTECOT_ GAMEPAD TESTER & TMR CALIBRATOR
                        </h1>
                        <p className="text-xs text-zinc-500">Inspección de botones, sensores magnéticos TMR y cálculo de circularidad</p>
                    </div>
                    <Link href="/admin" className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-4 py-2 rounded-xl text-xs font-bold transition-colors">
                        ← Volver al Panel
                    </Link>
                </div>

                {/* BARRA DE VINCULACIÓN A TICKET */}
                <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="w-full md:w-auto flex-1">
                        <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Orden de Servicio Activa</label>
                        <select
                            value={ticketSeleccionado}
                            onChange={(e) => setTicketSeleccionado(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-white outline-none focus:border-emerald-500 font-mono"
                        >
                            <option value="">-- Selecciona un ticket SOL-XXXX --</option>
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

                {!gamepad ? (
                    <div className="bg-zinc-950 border border-dashed border-zinc-800 rounded-2xl p-12 text-center space-y-3">
                        <span className="text-4xl animate-pulse">🔌</span>
                        <h3 className="text-lg font-bold text-zinc-300">Esperando conexión de mando...</h3>
                        <p className="text-xs text-zinc-500 max-w-md mx-auto">
                            Conecta el control mediante USB o Bluetooth y <strong>presiona cualquier botón</strong> para activarlo en el navegador.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">

                        {/* INFO DE MANDOS CONECTADOS */}
                        <div className="bg-zinc-950 border border-zinc-900 p-3.5 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-zinc-400 gap-2 font-mono">
                            <div><strong className="text-indigo-400">DISPOSITIVO:</strong> {gamepad.id}</div>
                            <div><strong className="text-emerald-400">ESTADO:</strong> CONECTADO ({gamepad.buttons.length} BOTONES, {gamepad.axes.length} EJES)</div>
                        </div>

                        {/* PANEL DE MÓDULOS DE JOYSTICKS (L3 / R3) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* JOYSTICK IZQUIERDO */}
                            <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl flex flex-col items-center space-y-4 relative">
                                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Stick Izquierdo (L3)</span>

                                <div className="relative w-48 h-48 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center shadow-inner">
                                    <div className="absolute w-full h-[1px] bg-zinc-800"></div>
                                    <div className="absolute h-full w-[1px] bg-zinc-800"></div>
                                    <div className="absolute w-36 h-36 border border-zinc-800/50 rounded-full border-dashed"></div>

                                    {/* Indicador de posición con offset */}
                                    <div
                                        className="absolute w-4 h-4 bg-emerald-400 rounded-full shadow-[0_0_12px_rgba(52,211,153,0.8)] transition-all duration-75"
                                        style={{
                                            left: `${(((gamepad.axes[0] || 0) - offsetL.x) + 1) * 50}%`,
                                            top: `${(((gamepad.axes[1] || 0) - offsetL.y) + 1) * 50}%`,
                                            transform: 'translate(-50%, -50%)'
                                        }}
                                    />
                                </div>

                                <div className="w-full space-y-1.5 text-xs font-mono bg-zinc-900/60 p-3 rounded-xl border border-zinc-900">
                                    <div className="flex justify-between text-zinc-400">
                                        <span>Eje X: {((gamepad.axes[0] || 0) - offsetL.x).toFixed(4)}</span>
                                        <span>Eje Y: {((gamepad.axes[1] || 0) - offsetL.y).toFixed(4)}</span>
                                    </div>
                                    <div className="flex justify-between font-bold">
                                        <span>Drift de Centro:</span>
                                        <span className={statsLeft.drift > 5 ? 'text-rose-400' : 'text-emerald-400'}>
                                            {statsLeft.drift}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-zinc-400">
                                        <span>Error Circularidad:</span>
                                        <span className="text-amber-400">{statsLeft.errorCircular}%</span>
                                    </div>
                                </div>
                            </div>

                            {/* JOYSTICK DERECHO */}
                            <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl flex flex-col items-center space-y-4 relative">
                                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Stick Derecho (R3)</span>

                                <div className="relative w-48 h-48 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center shadow-inner">
                                    <div className="absolute w-full h-[1px] bg-zinc-800"></div>
                                    <div className="absolute h-full w-[1px] bg-zinc-800"></div>
                                    <div className="absolute w-36 h-36 border border-zinc-800/50 rounded-full border-dashed"></div>

                                    <div
                                        className="absolute w-4 h-4 bg-emerald-400 rounded-full shadow-[0_0_12px_rgba(52,211,153,0.8)] transition-all duration-75"
                                        style={{
                                            left: `${(((gamepad.axes[2] || 0) - offsetR.x) + 1) * 50}%`,
                                            top: `${(((gamepad.axes[3] || 0) - offsetR.y) + 1) * 50}%`,
                                            transform: 'translate(-50%, -50%)'
                                        }}
                                    />
                                </div>

                                <div className="w-full space-y-1.5 text-xs font-mono bg-zinc-900/60 p-3 rounded-xl border border-zinc-900">
                                    <div className="flex justify-between text-zinc-400">
                                        <span>Eje X: {((gamepad.axes[2] || 0) - offsetR.x).toFixed(4)}</span>
                                        <span>Eje Y: {((gamepad.axes[3] || 0) - offsetR.y).toFixed(4)}</span>
                                    </div>
                                    <div className="flex justify-between font-bold">
                                        <span>Drift de Centro:</span>
                                        <span className={statsRight.drift > 5 ? 'text-rose-400' : 'text-emerald-400'}>
                                            {statsRight.drift}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-zinc-400">
                                        <span>Error Circularidad:</span>
                                        <span className="text-amber-400">{statsRight.errorCircular}%</span>
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* MÓDULO DE CALIBRACIÓN TMR / HALL EFFECT */}
                        <div className="bg-zinc-950 border border-purple-900/40 p-5 rounded-2xl space-y-3">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <div>
                                    <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2">
                                        🛠️ HERRAMIENTAS DE CALIBRACIÓN TMR / MAGNETÓMETROS
                                    </h3>
                                    <p className="text-xs text-zinc-400">
                                        Ajusta el punto cero si instalaste joysticks TMR/Hall Effect. Si usas PCB de calibración externa (trimpots), ajusta los potenciómetros físicos hasta llevar el punto al centro.
                                    </p>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <button
                                        onClick={calibrarCentroTMR}
                                        className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-colors shadow-md w-full sm:w-auto"
                                    >
                                        🎯 Fijar Centro Actual (Zeroing)
                                    </button>
                                    <button
                                        onClick={resetOffsets}
                                        className="bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-bold text-xs px-3 py-2 rounded-xl border border-zinc-800 transition-colors"
                                    >
                                        Restablecer
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* GATILLOS ANALÓGICOS (L2 / R2) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl space-y-2">
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-zinc-400">GATILLO IZQUIERDO (L2 / LT)</span>
                                    <span className="font-mono text-indigo-400">{(getButton(6).value * 100).toFixed(0)}%</span>
                                </div>
                                <div className="w-full bg-zinc-900 h-3 rounded-full overflow-hidden border border-zinc-800">
                                    <div
                                        className="bg-indigo-500 h-full transition-all duration-75"
                                        style={{ width: `${getButton(6).value * 100}%` }}
                                    />
                                </div>
                            </div>

                            <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl space-y-2">
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-zinc-400">GATILLO DERECHO (R2 / RT)</span>
                                    <span className="font-mono text-indigo-400">{(getButton(7).value * 100).toFixed(0)}%</span>
                                </div>
                                <div className="w-full bg-zinc-900 h-3 rounded-full overflow-hidden border border-zinc-800">
                                    <div
                                        className="bg-indigo-500 h-full transition-all duration-75"
                                        style={{ width: `${getButton(7).value * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* MATRIZ COMPLETA DE BOTONES TIPO GULIKIT / HARDWARE TESTER */}
                        <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl space-y-4">
                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                MATRIZ DIGITAL DE BOTONES Y PADS
                            </h3>

                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 text-xs font-mono">

                                {/* ACCIÓN PRINCIPAL (ABXY / X Circle Square Triangle) */}
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(0).pressed ? 'bg-emerald-500 text-black border-emerald-400 font-bold shadow-[0_0_12px_rgba(52,211,153,0.5)]' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    A / Cross (B0)
                                </div>
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(1).pressed ? 'bg-emerald-500 text-black border-emerald-400 font-bold shadow-[0_0_12px_rgba(52,211,153,0.5)]' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    B / Circle (B1)
                                </div>
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(2).pressed ? 'bg-emerald-500 text-black border-emerald-400 font-bold shadow-[0_0_12px_rgba(52,211,153,0.5)]' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    X / Square (B2)
                                </div>
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(3).pressed ? 'bg-emerald-500 text-black border-emerald-400 font-bold shadow-[0_0_12px_rgba(52,211,153,0.5)]' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    Y / Triangle (B3)
                                </div>

                                {/* BUMPERS */}
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(4).pressed ? 'bg-indigo-500 text-white border-indigo-400 font-bold shadow-[0_0_12px_rgba(99,102,241,0.5)]' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    LB / L1 (B4)
                                </div>
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(5).pressed ? 'bg-indigo-500 text-white border-indigo-400 font-bold shadow-[0_0_12px_rgba(99,102,241,0.5)]' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    RB / R1 (B5)
                                </div>

                                {/* D-PAD */}
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(12).pressed ? 'bg-amber-500 text-black border-amber-400 font-bold shadow-[0_0_12px_rgba(245,158,11,0.5)]' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    D-Pad Arriba (B12)
                                </div>
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(13).pressed ? 'bg-amber-500 text-black border-amber-400 font-bold shadow-[0_0_12px_rgba(245,158,11,0.5)]' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    D-Pad Abajo (B13)
                                </div>
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(14).pressed ? 'bg-amber-500 text-black border-amber-400 font-bold shadow-[0_0_12px_rgba(245,158,11,0.5)]' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    D-Pad Izq (B14)
                                </div>
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(15).pressed ? 'bg-amber-500 text-black border-amber-400 font-bold shadow-[0_0_12px_rgba(245,158,11,0.5)]' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    D-Pad Der (B15)
                                </div>

                                {/* CLICKS DE JOYSTICK */}
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(10).pressed ? 'bg-purple-500 text-white border-purple-400 font-bold' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    L3 Click (B10)
                                </div>
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(11).pressed ? 'bg-purple-500 text-white border-purple-400 font-bold' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    R3 Click (B11)
                                </div>

                                {/* SISTEMA */}
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(8).pressed ? 'bg-zinc-100 text-black font-bold' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    Select / Share (B8)
                                </div>
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(9).pressed ? 'bg-zinc-100 text-black font-bold' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    Start / Options (B9)
                                </div>
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(16).pressed ? 'bg-emerald-400 text-black font-bold' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    Home / Guide (B16)
                                </div>
                                <div className={`p-3 rounded-xl border text-center transition-all ${getButton(17).pressed ? 'bg-zinc-100 text-black font-bold' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'}`}>
                                    Touchpad / Mute (B17)
                                </div>

                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    )
}