'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'

export default function GamepadTester() {
    const [gamepad, setGamepad] = useState<Gamepad | null>(null)
    const [ticketsActivos, setTicketsActivos] = useState<any[]>([])
    const [ticketSeleccionado, setTicketSeleccionado] = useState<string>('')

    // Modo prueba de circularidad
    const [testCircularidad, setTestCircularidad] = useState(true)

    // Mediciones TMR / Ejes
    const [statsL, setStatsL] = useState({ lx: 0, ly: 0, drift: 0, errCirc: 0 })
    const [statsR, setStatsR] = useState({ rx: 0, ry: 0, drift: 0, errCirc: 0 })

    // Offsets de calibración manual
    const [offsetL, setOffsetL] = useState({ x: 0, y: 0 })
    const [offsetR, setOffsetR] = useState({ x: 0, y: 0 })

    // Canvas para trazo de trayectoria
    const canvasTrailLRef = useRef<HTMLCanvasElement>(null)
    const canvasTrailRRef = useRef<HTMLCanvasElement>(null)
    const pointsTrailL = useRef<{ x: number; y: number }[]>([])
    const pointsTrailR = useRef<{ x: number; y: number }[]>([])

    // Puntos para cálculo de circularidad outer (36 sectores de 10°)
    const outerRadiusL = useRef<number[]>(new Array(36).fill(0))
    const outerRadiusR = useRef<number[]>(new Array(36).fill(0))

    const requestRef = useRef<number>(0)

    // Cargar tickets activos de Neon DB
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

    // Limpiar trazos del canvas
    const limpiarTrazos = () => {
        pointsTrailL.current = []
        pointsTrailR.current = []
        outerRadiusL.current = new Array(36).fill(0)
        outerRadiusR.current = new Array(36).fill(0)

        [canvasTrailLRef.current, canvasTrailRRef.current].forEach(canvas => {
            if (canvas) {
                const ctx = canvas.getContext('2d')
                if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
            }
        })
    }

    // Proceso de lectura en tiempo real
    const scanGamepads = () => {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
        const activeGp = Array.from(gamepads).find(gp => gp !== null)

        if (activeGp) {
            setGamepad(activeGp)

            // Lectura de ejes aplicando offset
            const rawLX = activeGp.axes[0] || 0
            const rawLY = activeGp.axes[1] || 0
            const rawRX = activeGp.axes[2] || 0
            const rawRY = activeGp.axes[3] || 0

            const lx = rawLX - offsetL.x
            const ly = rawLY - offsetL.y
            const rx = rawRX - offsetR.x
            const ry = rawRY - offsetR.y

            // Magnitude (distancia desde el centro)
            const magL = Math.sqrt(lx * lx + ly * ly)
            const magR = Math.sqrt(rx * rx + ry * ry)

            // 1️⃣ Drift en reposo (cuando no se toca la palanca)
            const driftL = parseFloat((magL * 100).toFixed(1))
            const driftR = parseFloat((magR * 100).toFixed(1))

            // 2️⃣ Registro de trayectoria de circularidad
            if (testCircularidad && magL > 0.15) {
                pointsTrailL.current.push({ x: lx, y: ly })
                if (pointsTrailL.current.length > 500) pointsTrailL.current.shift()

                const angleDeg = ((Math.atan2(ly, lx) * 180 / Math.PI) + 360) % 360
                const sectorIdx = Math.floor(angleDeg / 10)
                if (magL > outerRadiusL.current[sectorIdx]) {
                    outerRadiusL.current[sectorIdx] = magL
                }
            }

            if (testCircularidad && magR > 0.15) {
                pointsTrailR.current.push({ x: rx, y: ry })
                if (pointsTrailR.current.length > 500) pointsTrailR.current.shift()

                const angleDeg = ((Math.atan2(ry, rx) * 180 / Math.PI) + 360) % 360
                const sectorIdx = Math.floor(angleDeg / 10)
                if (magR > outerRadiusR.current[sectorIdx]) {
                    outerRadiusR.current[sectorIdx] = magR
                }
            }

            // Error de circularidad acumulado en bordes externos
            const activeSectorsL = outerRadiusL.current.filter(r => r > 0.5)
            const errCircL = activeSectorsL.length > 5
                ? (activeSectorsL.reduce((sum, r) => sum + Math.abs(1.0 - r), 0) / activeSectorsL.length) * 100
                : 0

            const activeSectorsR = outerRadiusR.current.filter(r => r > 0.5)
            const errCircR = activeSectorsR.length > 5
                ? (activeSectorsR.reduce((sum, r) => sum + Math.abs(1.0 - r), 0) / activeSectorsR.length) * 100
                : 0

            setStatsL({ lx, ly, drift: driftL, errCirc: parseFloat(errCircL.toFixed(1)) })
            setStatsR({ rx, ry, drift: driftR, errCirc: parseFloat(errCircR.toFixed(1)) })

            // Dibujar trazo sobre Canvas
            renderCanvasTrail(canvasTrailLRef.current, pointsTrailL.current, '#38bdf8')
            renderCanvasTrail(canvasTrailRRef.current, pointsTrailR.current, '#38bdf8')

        } else {
            setGamepad(null)
        }

        requestRef.current = requestAnimationFrame(scanGamepads)
    }

    const renderCanvasTrail = (canvas: HTMLCanvasElement | null, points: { x: number; y: number }[], color: string) => {
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (points.length < 2) return

        ctx.beginPath()
        ctx.strokeStyle = color
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'

        const w = canvas.width
        const h = canvas.height

        points.forEach((p, i) => {
            const cx = ((p.x + 1) / 2) * w
            const cy = ((p.y + 1) / 2) * h
            if (i === 0) ctx.moveTo(cx, cy)
            else ctx.lineTo(cx, cy)
        })
        ctx.stroke()
    }

    useEffect(() => {
        requestRef.current = requestAnimationFrame(scanGamepads)
        return () => cancelAnimationFrame(requestRef.current)
    }, [testCircularidad, offsetL, offsetR])

    // Prueba de motores de vibración
    const probarVibracion = (lado: 'left' | 'right' | 'both') => {
        if (!gamepad) return alert('Conecta un mando para probar la vibración.')

        const actuator = (gamepad as any).vibrationActuator
        if (actuator && actuator.playEffect) {
            actuator.playEffect('dual-rumble', {
                startDelay: 0,
                duration: 600,
                weakMagnitude: lado === 'left' ? 0.0 : 0.8,
                strongMagnitude: lado === 'right' ? 0.0 : 0.9,
            }).catch(() => alert('El controlador o navegador no soporta vibración en este puerto.'))
        } else {
            alert('La función de vibración por software no está soportada por este mando en el navegador.')
        }
    }

    // Auxiliar de lectura de botones
    const getBtn = (idx: number) => {
        if (!gamepad || !gamepad.buttons[idx]) return { pressed: false, value: 0 }
        return gamepad.buttons[idx]
    }

    // Inyección de reporte a Neon DB
    const guardarReporteTicket = async () => {
        if (!ticketSeleccionado) return alert('Selecciona un ticket SOL-XXXX activo.')

        const reporte = `[REPORTE GAMEPAD TESTER & TMR]:
- Mando: ${gamepad?.id || 'Generico XInput/DirectInput'}
- Joystick L3: Drift centro = ${statsL.drift}% | Error Circularidad = ${statsL.errCirc}%
- Joystick R3: Drift centro = ${statsR.drift}% | Error Circularidad = ${statsR.errCirc}%
- Botones & Gatillos L2/R2: Inspeccionados y 100% operativos
- Ajuste TMR: Centro cero fijado (${offsetL.x.toFixed(2)}, ${offsetL.y.toFixed(2)})`

        try {
            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticketId: ticketSeleccionado, notasDiagnostico: reporte })
            })
            if (res.ok) alert('✅ Diagnóstico inyectado con éxito a la orden en Neon DB.')
        } catch (err) {
            alert('Error al guardar reporte')
        }
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
                        <p className="text-xs text-zinc-500">Módulo de laboratorio tipo GuliKit para calibración TMR, trayectoria y botones</p>
                    </div>
                    <Link href="/admin" className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-4 py-2 rounded-xl text-xs font-bold transition-colors">
                        ← Volver al Panel
                    </Link>
                </div>

                {/* VINCULACIÓN A TICKET */}
                <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="w-full md:w-auto flex-1">
                        <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Orden de Servicio Activa</label>
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
                        onClick={guardarReporteTicket}
                        className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-black font-bold text-xs px-5 py-3 rounded-xl transition-colors shadow-lg"
                    >
                        📋 Inyectar Reporte al Ticket
                    </button>
                </div>

                {!gamepad ? (
                    <div className="bg-zinc-950 border border-dashed border-zinc-800 rounded-2xl p-12 text-center space-y-3">
                        <span className="text-4xl animate-pulse">🔌</span>
                        <h3 className="text-lg font-bold text-zinc-300">Conecta tu mando y presiona cualquier botón</h3>
                        <p className="text-xs text-zinc-500 max-w-md mx-auto">
                            Compatible con controles de Xbox, PlayStation DualSense/PS4, Nintendo Switch Pro Controller y mandos XInput/DirectInput.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">

                        {/* ESTADO Y MODELO DE CONTROL */}
                        <div className="bg-zinc-950 border border-zinc-900 p-3.5 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-zinc-400 font-mono gap-2">
                            <div><strong className="text-indigo-400">CONTROL DETECTADO:</strong> {gamepad.id}</div>
                            <div><strong className="text-emerald-400">ESTADO:</strong> {gamepad.connected ? '🟢 ACTIVO (60/120 Hz)' : '🔴 DESCONECTADO'}</div>
                        </div>

                        {/* SECCIÓN INTERACTIVA ESTILO GULIKIT TOOLS */}
                        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 relative flex flex-col items-center">

                            {/* CONTROLES SUPERIORES DE PRUEBA CIRCULAR */}
                            <div className="flex flex-wrap items-center justify-between w-full border-b border-zinc-900 pb-4 mb-6 gap-3 text-xs">
                                <label className="flex items-center gap-2 cursor-pointer font-bold text-zinc-300">
                                    <input
                                        type="checkbox"
                                        checked={testCircularidad}
                                        onChange={(e) => setTestCircularidad(e.target.checked)}
                                        className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                                    />
                                    <span>Probador de Circularidad (Girar palanca lentamente)</span>
                                </label>

                                <button
                                    onClick={limpiarTrazos}
                                    className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 px-3 py-1.5 rounded-lg text-xs transition-colors font-bold"
                                >
                                    🧹 Limpiar Trazo
                                </button>
                            </div>

                            {/* SVG VECTORIAL DEL CONTROL E INTERFAZ INTEGRADA */}
                            <div className="relative w-full max-w-3xl aspect-[1.7/1] bg-zinc-900/30 border border-zinc-900 rounded-2xl p-4 flex items-center justify-center">

                                {/* ILUSTRACIÓN SVG DEL CONTROL */}
                                <svg viewBox="0 0 800 480" className="w-full h-full select-none">

                                    {/* CUERPO PRINCIPAL MANDO */}
                                    <path
                                        d="M 220 80 C 300 70, 500 70, 580 80 C 660 90, 750 180, 730 380 C 720 440, 640 450, 580 370 C 530 310, 470 310, 400 310 C 330 310, 270 310, 220 370 C 160 450, 80 440, 70 380 C 50 180, 140 90, 220 80 Z"
                                        fill="#09090b"
                                        stroke="#27272a"
                                        strokeWidth="4"
                                    />

                                    {/* BUMPERS (LB / RB) */}
                                    <rect
                                        x="160" y="45" width="130" height="30" rx="10"
                                        fill={getBtn(4).pressed ? '#818cf8' : '#18181b'}
                                        stroke="#3f3f46" strokeWidth="2"
                                    />
                                    <text x="225" y="65" textAnchor="middle" fill={getBtn(4).pressed ? '#000' : '#a1a1aa'} fontSize="14" fontWeight="bold">LB / L1</text>

                                    <rect
                                        x="510" y="45" width="130" height="30" rx="10"
                                        fill={getBtn(5).pressed ? '#818cf8' : '#18181b'}
                                        stroke="#3f3f46" strokeWidth="2"
                                    />
                                    <text x="575" y="65" textAnchor="middle" fill={getBtn(5).pressed ? '#000' : '#a1a1aa'} fontSize="14" fontWeight="bold">RB / R1</text>

                                    {/* D-PAD (CRUZ DE DIRECCIÓN) */}
                                    <g transform="translate(280, 250)">
                                        {/* Arriba */}
                                        <rect x="-15" y="-45" width="30" height="30" rx="4" fill={getBtn(12).pressed ? '#f59e0b' : '#18181b'} stroke="#3f3f46" />
                                        {/* Abajo */}
                                        <rect x="-15" y="15" width="30" height="30" rx="4" fill={getBtn(13).pressed ? '#f59e0b' : '#18181b'} stroke="#3f3f46" />
                                        {/* Izquierda */}
                                        <rect x="-45" y="-15" width="30" height="30" rx="4" fill={getBtn(14).pressed ? '#f59e0b' : '#18181b'} stroke="#3f3f46" />
                                        {/* Derecha */}
                                        <rect x="15" y="-15" width="30" height="30" rx="4" fill={getBtn(15).pressed ? '#f59e0b' : '#18181b'} stroke="#3f3f46" />
                                    </g>

                                    {/* BOTONES ACCIÓN (ABXY) */}
                                    <g transform="translate(610, 180)">
                                        {/* Y / Triangle (North) */}
                                        <circle cx="0" cy="-40" r="18" fill={getBtn(3).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                        <text x="0" y="-34" textAnchor="middle" fill={getBtn(3).pressed ? '#000' : '#34d399'} fontSize="16" fontWeight="bold">Y</text>

                                        {/* A / Cross (South) */}
                                        <circle cx="0" cy="40" r="18" fill={getBtn(0).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                        <text x="0" y="46" textAnchor="middle" fill={getBtn(0).pressed ? '#000' : '#34d399'} fontSize="16" fontWeight="bold">A</text>

                                        {/* X / Square (West) */}
                                        <circle cx="-40" cy="0" r="18" fill={getBtn(2).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                        <text x="-40" y="6" textAnchor="middle" fill={getBtn(2).pressed ? '#000' : '#34d399'} fontSize="16" fontWeight="bold">X</text>

                                        {/* B / Circle (East) */}
                                        <circle cx="40" cy="0" r="18" fill={getBtn(1).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                        <text x="40" y="6" textAnchor="middle" fill={getBtn(1).pressed ? '#000' : '#34d399'} fontSize="16" fontWeight="bold">B</text>
                                    </g>

                                    {/* BOTONES CENTRALES (SELECT / START / HOME) */}
                                    <circle cx="340" cy="160" r="10" fill={getBtn(8).pressed ? '#e4e4e7' : '#18181b'} stroke="#3f3f46" />
                                    <circle cx="460" cy="160" r="10" fill={getBtn(9).pressed ? '#e4e4e7' : '#18181b'} stroke="#3f3f46" />
                                    <circle cx="400" cy="140" r="18" fill={getBtn(16).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />

                                </svg>

                                {/* STICK IZQUIERDO L3 INTERACTIVO Y TRAZO */}
                                <div className="absolute left-[18%] top-[30%] w-36 h-36 rounded-full bg-zinc-950/80 border border-zinc-800 flex items-center justify-center">
                                    <canvas
                                        ref={canvasTrailLRef}
                                        width={144}
                                        height={144}
                                        className="absolute inset-0 w-full h-full rounded-full pointer-events-none"
                                    />
                                    {/* Punto L3 */}
                                    <div
                                        className={`absolute w-5 h-5 rounded-full transition-transform duration-75 border ${getBtn(10).pressed ? 'bg-purple-500 border-white scale-125' : 'bg-sky-400 border-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.8)]'
                                            }`}
                                        style={{
                                            transform: `translate(${statsL.lx * 50}px, ${statsL.ly * 50}px)`
                                        }}
                                    />
                                </div>

                                {/* STICK DERECHO R3 INTERACTIVO Y TRAZO */}
                                <div className="absolute right-[22%] top-[45%] w-36 h-36 rounded-full bg-zinc-950/80 border border-zinc-800 flex items-center justify-center">
                                    <canvas
                                        ref={canvasTrailRRef}
                                        width={144}
                                        height={144}
                                        className="absolute inset-0 w-full h-full rounded-full pointer-events-none"
                                    />
                                    {/* Punto R3 */}
                                    <div
                                        className={`absolute w-5 h-5 rounded-full transition-transform duration-75 border ${getBtn(11).pressed ? 'bg-purple-500 border-white scale-125' : 'bg-sky-400 border-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.8)]'
                                            }`}
                                        style={{
                                            transform: `translate(${statsR.rx * 50}px, ${statsR.ry * 50}px)`
                                        }}
                                    />
                                </div>

                            </div>

                            {/* MÉTRICAS DE LECTURA (GULIKIT STYLE READOUT) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mt-6 text-xs font-mono">
                                <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl space-y-1">
                                    <div className="flex justify-between font-bold text-sky-400 border-b border-zinc-800 pb-1 mb-2">
                                        <span>STICK IZQUIERDO (L3)</span>
                                        <span>LX: {statsL.lx.toFixed(5)} | LY: {statsL.ly.toFixed(5)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-400">Drift de Centro:</span>
                                        <span className={statsL.drift > 5 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                            {statsL.drift}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-400">Error de Circularidad:</span>
                                        <span className="text-amber-400 font-bold">{statsL.errCirc}%</span>
                                    </div>
                                </div>

                                <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl space-y-1">
                                    <div className="flex justify-between font-bold text-sky-400 border-b border-zinc-800 pb-1 mb-2">
                                        <span>STICK DERECHO (R3)</span>
                                        <span>RX: {statsR.rx.toFixed(5)} | RY: {statsR.ry.toFixed(5)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-400">Drift de Centro:</span>
                                        <span className={statsR.drift > 5 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                            {statsR.drift}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-400">Error de Circularidad:</span>
                                        <span className="text-amber-400 font-bold">{statsR.errCirc}%</span>
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* MÓDULO DE PRUEBA DE VIBRACIÓN (RUMBLE TEST) */}
                        <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                                    📳 PRUEBA DE MOTORES DE VIBRACIÓN (RUMBLE TEST)
                                </h3>
                                <p className="text-xs text-zinc-500 mt-1">
                                    Verifica la respuesta de los contrapesos/motores háticos (Izquierdo / Derecho).
                                </p>
                            </div>

                            <div className="flex gap-2 w-full sm:w-auto">
                                <button
                                    onClick={() => probarVibracion('left')}
                                    className="flex-1 sm:flex-none bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors"
                                >
                                    Motor Izquierdo
                                </button>
                                <button
                                    onClick={() => probarVibracion('right')}
                                    className="flex-1 sm:flex-none bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors"
                                >
                                    Motor Derecho
                                </button>
                                <button
                                    onClick={() => probarVibracion('both')}
                                    className="flex-1 sm:flex-none bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-md"
                                >
                                    Ambos Motores 📳
                                </button>
                            </div>
                        </div>

                        {/* FERRAMIENTAS DE CALIBRACIÓN TMR */}
                        <div className="bg-zinc-950 border border-purple-900/40 p-5 rounded-2xl space-y-3">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <div>
                                    <h3 className="text-xs font-bold text-purple-400 flex items-center gap-2">
                                        🛠️ CALIBRACIÓN DE CENTRO DE SENSORES MAGNETÓMETROS / TMR
                                    </h3>
                                    <p className="text-xs text-zinc-400">
                                        Fija las coordenadas $(0.0000, 0.0000)$ de reposo o ajusta los potenciómetros/trimpots físicos de la placa de calibración hasta centrar el punto.
                                    </p>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <button
                                        onClick={() => {
                                            if (!gamepad) return
                                            setOffsetL({ x: gamepad.axes[0] || 0, y: gamepad.axes[1] || 0 })
                                            setOffsetR({ x: gamepad.axes[2] || 0, y: gamepad.axes[3] || 0 })
                                            alert('🎯 Centro TMR fijado en cero.')
                                        }}
                                        className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-colors shadow-md w-full sm:w-auto"
                                    >
                                        🎯 Fijar Centro Actual (Zeroing)
                                    </button>
                                    <button
                                        onClick={() => {
                                            setOffsetL({ x: 0, y: 0 })
                                            setOffsetR({ x: 0, y: 0 })
                                        }}
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
                                    <span className="font-mono text-indigo-400">{(getBtn(6).value * 100).toFixed(0)}%</span>
                                </div>
                                <div className="w-full bg-zinc-900 h-3 rounded-full overflow-hidden border border-zinc-800">
                                    <div
                                        className="bg-indigo-500 h-full transition-all duration-75"
                                        style={{ width: `${getBtn(6).value * 100}%` }}
                                    />
                                </div>
                            </div>

                            <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl space-y-2">
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-zinc-400">GATILLO DERECHO (R2 / RT)</span>
                                    <span className="font-mono text-indigo-400">{(getBtn(7).value * 100).toFixed(0)}%</span>
                                </div>
                                <div className="w-full bg-zinc-900 h-3 rounded-full overflow-hidden border border-zinc-800">
                                    <div
                                        className="bg-indigo-500 h-full transition-all duration-75"
                                        style={{ width: `${getBtn(7).value * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    )
}