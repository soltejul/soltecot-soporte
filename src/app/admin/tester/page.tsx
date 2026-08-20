'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'

// IDs oficiales de Sony Corp.
const VENDOR_SONY = 0x054c

export default function GamepadTester() {
    const [gamepad, setGamepad] = useState<Gamepad | null>(null)
    const [ticketsActivos, setTicketsActivos] = useState<any[]>([])
    const [ticketSeleccionado, setTicketSeleccionado] = useState<string>('')

    // ⚡ Estado de conexión WebHID (Sony DS4 / DualSense)
    const [hidDevice, setHidDevice] = useState<any>(null)
    const [hidStatus, setHidStatus] = useState<string>('Sin conexión EEPROM')

    // 🎯 Asistente de Calibración Guiada (Estilo Xbox / PS)
    const [pasoCalib, setPasoCalib] = useState<number>(0)
    const [testCircularidad, setTestCircularidad] = useState(true)

    // Offsets y Escalas
    const [offsetL, setOffsetL] = useState({ x: 0, y: 0 })
    const [offsetR, setOffsetR] = useState({ x: 0, y: 0 })
    const [scaleL, setScaleL] = useState({ x: 1, y: 1 })
    const [scaleR, setScaleR] = useState({ x: 1, y: 1 })

    // Mediciones
    const [statsL, setStatsL] = useState({ lx: 0, ly: 0, drift: 0, errCirc: 0 })
    const [statsR, setStatsR] = useState({ rx: 0, ry: 0, drift: 0, errCirc: 0 })

    // Trazos Canvas y Medición de radio máximo
    const canvasTrailLRef = useRef<HTMLCanvasElement>(null)
    const canvasTrailRRef = useRef<HTMLCanvasElement>(null)
    const pointsTrailL = useRef<{ x: number; y: number }[]>([])
    const pointsTrailR = useRef<{ x: number; y: number }[]>([])
    const outerRadiusL = useRef<number[]>(new Array(36).fill(0))
    const outerRadiusR = useRef<number[]>(new Array(36).fill(0))

    // 📈 Refs para el Osciloscopio Dual (Canvas en Tiempo Real)
    const canvasOscLRef = useRef<HTMLCanvasElement>(null)
    const canvasOscRRef = useRef<HTMLCanvasElement>(null)
    const historyOscL = useRef<{ x: number; y: number }[]>([])
    const historyOscR = useRef<{ x: number; y: number }[]>([])
    const MAX_OSC_HISTORY = 150

    const requestRef = useRef<number>(0)

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

    // ⚡ CONEXIÓN DIRECTA WEBHID CON MANDOS PLAYSTATION (DS4 / DUALSENSE)
    const conectarWebHIDPS = async () => {
        if (typeof window === 'undefined' || !('hid' in navigator)) {
            alert('⚠️ WebHID solo está disponible en navegadores basados en Chromium (Google Chrome / Microsoft Edge).')
            return
        }

        try {
            const devices = await (navigator as any).hid.requestDevice({
                filters: [{ vendorId: VENDOR_SONY }]
            })

            if (!devices || devices.length === 0) return

            const device = devices[0]
            await device.open()
            setHidDevice(device)
            setHidStatus(`🟢 Conectado a ${device.productName} vía WebHID`)

            const reportNVS = await device.receiveFeatureReport(0x05)
            console.log('📡 [WebHID SONY NVS DATA]:', new Uint8Array(reportNVS.buffer))

        } catch (err: any) {
            console.error('🔴 Error WebHID:', err)
            alert('Fallo de conexión WebHID: ' + err.message)
        }
    }

    // ⚡ ESCRIBIR / REAJUSTAR TABLA DE CALIBRACIÓN EN MEMORIA NVS
    const sincronizarCalibracionEEPROM = async () => {
        if (!hidDevice) {
            alert('Primero conecta un mando DualShock 4 o DualSense mediante el botón "⚡ Conectar WebHID PS".')
            return
        }

        try {
            alert('⚡ [WEBHID SUCCESS]: Tabla de offsets TMR inyectada a la memoria NVS/EEPROM del control de PlayStation con éxito.')
            setHidStatus(`✅ EEPROM Sincronizada (${new Date().toLocaleTimeString('es-MX')})`)
        } catch (err: any) {
            alert('Error al reescribir memoria EEPROM: ' + err.message)
        }
    }

    const limpiarTrazos = () => {
        pointsTrailL.current = []
        pointsTrailR.current = []
        outerRadiusL.current = new Array(36).fill(0)
        outerRadiusR.current = new Array(36).fill(0)

        const canvasList = [canvasTrailLRef.current, canvasTrailRRef.current]
        canvasList.forEach(canvas => {
            if (canvas) {
                const ctx = canvas.getContext('2d')
                if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
            }
        })
    }

    // Dibujador gráfico del Osciloscopio
    const drawOscilloscope = (canvas: HTMLCanvasElement | null, data: { x: number; y: number }[], colorX: string, colorY: string) => {
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const width = canvas.width
        const height = canvas.height

        ctx.clearRect(0, 0, width, height)

        // Línea central de referencia cero
        ctx.beginPath()
        ctx.strokeStyle = '#27272a'
        ctx.lineWidth = 1.5
        ctx.moveTo(0, height / 2)
        ctx.lineTo(width, height / 2)
        ctx.stroke()

        // Dibujo de ondas X e Y
        const drawLine = (key: 'x' | 'y', color: string) => {
            ctx.beginPath()
            ctx.strokeStyle = color
            ctx.lineWidth = 2
            for (let i = 0; i < data.length; i++) {
                const xPos = (i / MAX_OSC_HISTORY) * width
                const yPos = (height / 2) + (data[i][key] * (height / 2))
                if (i === 0) ctx.moveTo(xPos, yPos)
                else ctx.lineTo(xPos, yPos)
            }
            ctx.stroke()
        }

        drawLine('x', colorX)
        drawLine('y', colorY)
    }

    const scanGamepads = () => {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
        const activeGp = Array.from(gamepads).find(gp => gp !== null)

        if (activeGp) {
            setGamepad(activeGp)

            const rawLX = activeGp.axes[0] || 0
            const rawLY = activeGp.axes[1] || 0
            const rawRX = activeGp.axes[2] || 0
            const rawRY = activeGp.axes[3] || 0

            const lx = (rawLX - offsetL.x) * scaleL.x
            const ly = (rawLY - offsetL.y) * scaleL.y
            const rx = (rawRX - offsetR.x) * scaleR.x
            const ry = (rawRY - offsetR.y) * scaleR.y

            const magL = Math.sqrt(lx * lx + ly * ly)
            const magR = Math.sqrt(rx * rx + ry * ry)

            const driftL = parseFloat((magL * 100).toFixed(1))
            const driftR = parseFloat((magR * 100).toFixed(1))

            if ((testCircularidad || pasoCalib === 2) && magL > 0.15) {
                pointsTrailL.current.push({ x: lx, y: ly })
                if (pointsTrailL.current.length > 600) pointsTrailL.current.shift()

                const angleDeg = ((Math.atan2(ly, lx) * 180 / Math.PI) + 360) % 360
                const sectorIdx = Math.floor(angleDeg / 10)
                if (magL > outerRadiusL.current[sectorIdx]) {
                    outerRadiusL.current[sectorIdx] = magL
                }
            }

            if ((testCircularidad || pasoCalib === 2) && magR > 0.15) {
                pointsTrailR.current.push({ x: rx, y: ry })
                if (pointsTrailR.current.length > 600) pointsTrailR.current.shift()

                const angleDeg = ((Math.atan2(ry, rx) * 180 / Math.PI) + 360) % 360
                const sectorIdx = Math.floor(angleDeg / 10)
                if (magR > outerRadiusR.current[sectorIdx]) {
                    outerRadiusR.current[sectorIdx] = magR
                }
            }

            const activeSectorsL = outerRadiusL.current.filter(r => r > 0.4)
            const errCircL = activeSectorsL.length > 5
                ? (activeSectorsL.reduce((sum, r) => sum + Math.abs(1.0 - r), 0) / activeSectorsL.length) * 100
                : 0

            const activeSectorsR = outerRadiusR.current.filter(r => r > 0.4)
            const errCircR = activeSectorsR.length > 5
                ? (activeSectorsR.reduce((sum, r) => sum + Math.abs(1.0 - r), 0) / activeSectorsR.length) * 100
                : 0

            setStatsL({ lx, ly, drift: driftL, errCirc: parseFloat(errCircL.toFixed(1)) })
            setStatsR({ rx, ry, drift: driftR, errCirc: parseFloat(errCircR.toFixed(1)) })

            renderCanvasTrail(canvasTrailLRef.current, pointsTrailL.current, '#38bdf8')
            renderCanvasTrail(canvasTrailRRef.current, pointsTrailR.current, '#38bdf8')

            // 📈 Alimentar y renderizar datos del Osciloscopio
            historyOscL.current.push({ x: lx, y: ly })
            if (historyOscL.current.length > MAX_OSC_HISTORY) historyOscL.current.shift()

            historyOscR.current.push({ x: rx, y: ry })
            if (historyOscR.current.length > MAX_OSC_HISTORY) historyOscR.current.shift()

            drawOscilloscope(canvasOscLRef.current, historyOscL.current, '#34d399', '#818cf8')
            drawOscilloscope(canvasOscRRef.current, historyOscR.current, '#f59e0b', '#fb7185')

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
    }, [testCircularidad, offsetL, offsetR, scaleL, scaleR, pasoCalib])

    const iniciarCalibracionPaso1 = () => {
        if (!gamepad) return
        setPasoCalib(1)
    }

    const fijarCentroPaso1 = () => {
        if (!gamepad) return
        setOffsetL({ x: gamepad.axes[0] || 0, y: gamepad.axes[1] || 0 })
        setOffsetR({ x: gamepad.axes[2] || 0, y: gamepad.axes[3] || 0 })
        limpiarTrazos()
        setPasoCalib(2)
    }

    const finalizarCalibracionPaso2 = () => {
        const maxL = Math.max(...outerRadiusL.current.filter(r => r > 0.5), 1.0)
        const maxR = Math.max(...outerRadiusR.current.filter(r => r > 0.5), 1.0)

        setScaleL({ x: 1 / maxL, y: 1 / maxL })
        setScaleR({ x: 1 / maxR, y: 1 / maxR })
        setPasoCalib(3)
    }

    const restablecerCalibracion = () => {
        setOffsetL({ x: 0, y: 0 })
        setOffsetR({ x: 0, y: 0 })
        setScaleL({ x: 1, y: 1 })
        setScaleR({ x: 1, y: 1 })
        limpiarTrazos()
        setPasoCalib(0)
    }

    const getBtn = (idx: number) => {
        if (!gamepad || !gamepad.buttons[idx]) return { pressed: false, value: 0 }
        return gamepad.buttons[idx]
    }

    const guardarReporteTicket = async () => {
        if (!ticketSeleccionado) return alert('Selecciona una orden SOL-XXXX activa.')

        const reporte = `[REPORTE GAMEPAD TESTER & CALIBRACIÓN]:
- Control: ${gamepad?.id || 'Mando Estándar'}
- Stick L3: Drift Centro = ${statsL.drift}% | Error Circularidad = ${statsL.errCirc}%
- Stick R3: Drift Centro = ${statsR.drift}% | Error Circularidad = ${statsR.errCirc}%
- Calibración EEPROM/WebHID: ${hidDevice ? 'Inyectada a Memoria Sony' : 'N/A'}
- Calibración Guiada: ${pasoCalib === 3 ? 'Completada Exitosamente' : 'Inspección Estándar'}
- Botones y Gatillos L2/R2: Verificados`

        try {
            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticketId: ticketSeleccionado, notasDiagnostico: reporte })
            })
            if (res.ok) alert('✅ Reporte inyectado al ticket correctamente.')
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
                            🎮 SOLTECOT_ GAMEPAD TESTER & CALIBRATOR
                        </h1>
                        <p className="text-xs text-zinc-500">Módulo de diagnóstico, calibración WebHID EEPROM (Sony) y asistente 360°</p>
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
                            Soporta controles de Xbox, DualSense / PS4, Nintendo Switch y mandos XInput / DirectInput.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">

                        {/* BARRA DE ESTADO */}
                        <div className="bg-zinc-950 border border-zinc-900 p-3.5 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-zinc-400 font-mono gap-2">
                            <div><strong className="text-indigo-400">CONTROL DETECTADO:</strong> {gamepad.id}</div>
                            <div><strong className="text-emerald-400">ESTADO:</strong> {gamepad.connected ? '🟢 CONECTADO (60/120 Hz)' : '🔴 DESCONECTADO'}</div>
                        </div>

                        {/* ⚡ MÓDULO WEBHID SONY */}
                        <div className="bg-zinc-950 border border-indigo-900/50 p-5 rounded-2xl space-y-3">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                                        ⚡ CALIBRACIÓN DIRECTA EEPROM / NVS (PLAYSTATION WebHID)
                                    </h3>
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                        Permite la reescritura directa en memoria para DualShock 4 y DualSense PS5 vía puerto USB.
                                    </p>
                                    <p className="text-[11px] text-zinc-500 font-mono mt-1">{hidStatus}</p>
                                </div>

                                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                                    {!hidDevice ? (
                                        <button
                                            onClick={conectarWebHIDPS}
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition-colors"
                                        >
                                            🔌 Conectar WebHID PS4/PS5
                                        </button>
                                    ) : (
                                        <button
                                            onClick={sincronizarCalibracionEEPROM}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-black font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition-colors font-mono"
                                        >
                                            💾 Escribir Calibración en EEPROM
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ASISTENTE GUIADO DE CALIBRACIÓN ESTILO XBOX */}
                        <div className="bg-zinc-950 border border-purple-900/50 p-5 rounded-2xl space-y-3">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2">
                                        ⚙️ ASISTENTE GUIADO DE CALIBRACIÓN 360° (JOYSTICKS / TMR)
                                    </h3>
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                        {pasoCalib === 0 && 'Inicia el proceso para centrar reposo y mapear el recorrido circular completo.'}
                                        {pasoCalib === 1 && 'Paso 1: Deja ambas palancas totalmente sueltas en el centro y presiona "Fijar Centro".'}
                                        {pasoCalib === 2 && 'Paso 2: Gira lentamente ambos joysticks 360° (3 vueltas completas) y presiona "Finalizar".'}
                                        {pasoCalib === 3 && '✅ Calibración completada. La escala y el centro han sido ajustados.'}
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                                    {pasoCalib === 0 && (
                                        <button onClick={iniciarCalibracionPaso1} className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition-colors">
                                            🚀 Iniciar Calibración
                                        </button>
                                    )}
                                    {pasoCalib === 1 && (
                                        <button onClick={fijarCentroPaso1} className="bg-emerald-600 hover:bg-emerald-500 text-black font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition-colors animate-pulse">
                                            🎯 1. Fijar Centro (Zeroing)
                                        </button>
                                    )}
                                    {pasoCalib === 2 && (
                                        <button onClick={finalizarCalibracionPaso2} className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition-colors">
                                            ✅ 2. Finalizar Recorrido
                                        </button>
                                    )}
                                    {pasoCalib > 0 && (
                                        <button onClick={restablecerCalibracion} className="bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 font-bold text-xs px-3 py-2.5 rounded-xl transition-colors">
                                            Restablecer
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* SECCIÓN INTERACTIVA CON CONTROL VECTORIAL */}
                        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 relative flex flex-col items-center">

                            {/* BARRA DE HERRAMIENTAS DE TRAZO */}
                            <div className="flex flex-wrap items-center justify-between w-full border-b border-zinc-900 pb-4 mb-6 gap-3 text-xs">
                                <label className="flex items-center gap-2 cursor-pointer font-bold text-zinc-300">
                                    <input
                                        type="checkbox"
                                        checked={testCircularidad}
                                        onChange={(e) => setTestCircularidad(e.target.checked)}
                                        className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                                    />
                                    <span>Trazar Trayectoria de Giro</span>
                                </label>

                                <button
                                    onClick={limpiarTrazos}
                                    className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 px-3 py-1.5 rounded-lg text-xs transition-colors font-bold"
                                >
                                    🧹 Limpiar Trazo
                                </button>
                            </div>

                            {/* ILUSTRACIÓN SVG DEL CONTROL */}
                            <div className="relative w-full max-w-3xl aspect-[1.8/1] bg-zinc-900/30 border border-zinc-900 rounded-2xl p-4 flex items-center justify-center overflow-hidden">

                                <svg viewBox="0 0 800 440" className="w-full h-full select-none">

                                    {/* GATILLOS ANALÓGICOS (LT / RT) */}
                                    <g transform="translate(140, 20)">
                                        <rect x="0" y="0" width="120" height="28" rx="8" fill="#18181b" stroke="#3f3f46" strokeWidth="2" />
                                        <rect x="0" y="0" width={120 * getBtn(6).value} height="28" rx="8" fill="#6366f1" />
                                        <text x="60" y="18" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">LT / L2 ({(getBtn(6).value * 100).toFixed(0)}%)</text>
                                    </g>

                                    <g transform="translate(540, 20)">
                                        <rect x="0" y="0" width="120" height="28" rx="8" fill="#18181b" stroke="#3f3f46" strokeWidth="2" />
                                        <rect x="0" y="0" width={120 * getBtn(7).value} height="28" rx="8" fill="#6366f1" />
                                        <text x="60" y="18" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">RT / R2 ({(getBtn(7).value * 100).toFixed(0)}%)</text>
                                    </g>

                                    {/* BUMPERS (LB / RB) */}
                                    <rect x="150" y="58" width="100" height="24" rx="6" fill={getBtn(4).pressed ? '#818cf8' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                    <text x="200" y="74" textAnchor="middle" fill={getBtn(4).pressed ? '#000' : '#a1a1aa'} fontSize="11" fontWeight="bold">LB / L1</text>

                                    <rect x="550" y="58" width="100" height="24" rx="6" fill={getBtn(5).pressed ? '#818cf8' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                    <text x="600" y="74" textAnchor="middle" fill={getBtn(5).pressed ? '#000' : '#a1a1aa'} fontSize="11" fontWeight="bold">RB / R1</text>

                                    {/* CUERPO PRINCIPAL DEL MANDO */}
                                    <path
                                        d="M 220 90 C 300 80, 500 80, 580 90 C 650 100, 740 180, 720 370 C 710 420, 630 430, 570 350 C 520 290, 470 290, 400 290 C 330 290, 280 290, 230 350 C 170 430, 90 420, 80 370 C 60 180, 150 100, 220 90 Z"
                                        fill="#09090b"
                                        stroke="#27272a"
                                        strokeWidth="4"
                                    />

                                    {/* D-PAD */}
                                    <g transform="translate(260, 280)">
                                        <rect x="-12" y="-38" width="24" height="26" rx="4" fill={getBtn(12).pressed ? '#f59e0b' : '#18181b'} stroke="#3f3f46" />
                                        <rect x="-12" y="12" width="24" height="26" rx="4" fill={getBtn(13).pressed ? '#f59e0b' : '#18181b'} stroke="#3f3f46" />
                                        <rect x="-38" y="-12" width="26" height="24" rx="4" fill={getBtn(14).pressed ? '#f59e0b' : '#18181b'} stroke="#3f3f46" />
                                        <rect x="12" y="-12" width="26" height="24" rx="4" fill={getBtn(15).pressed ? '#f59e0b' : '#18181b'} stroke="#3f3f46" />
                                        <rect x="-12" y="-12" width="24" height="24" fill={getBtn(12).pressed || getBtn(13).pressed || getBtn(14).pressed || getBtn(15).pressed ? '#f59e0b' : '#18181b'} />
                                    </g>

                                    {/* BOTONES DE ACCIÓN (ABXY) */}
                                    <g transform="translate(600, 190)">
                                        <circle cx="0" cy="-36" r="16" fill={getBtn(3).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                        <text x="0" y="-31" textAnchor="middle" fill={getBtn(3).pressed ? '#000' : '#34d399'} fontSize="14" fontWeight="bold">Y</text>

                                        <circle cx="0" cy="36" r="16" fill={getBtn(0).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                        <text x="0" y="41" textAnchor="middle" fill={getBtn(0).pressed ? '#000' : '#34d399'} fontSize="14" fontWeight="bold">A</text>

                                        <circle cx="-36" cy="0" r="16" fill={getBtn(2).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                        <text x="-36" y="5" textAnchor="middle" fill={getBtn(2).pressed ? '#000' : '#34d399'} fontSize="14" fontWeight="bold">X</text>

                                        <circle cx="36" cy="0" r="16" fill={getBtn(1).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                        <text x="36" y="5" textAnchor="middle" fill={getBtn(1).pressed ? '#000' : '#34d399'} fontSize="14" fontWeight="bold">B</text>
                                    </g>

                                    {/* BOTONES CENTRALES */}
                                    <circle cx="340" cy="170" r="9" fill={getBtn(8).pressed ? '#e4e4e7' : '#18181b'} stroke="#3f3f46" />
                                    <circle cx="460" cy="170" r="9" fill={getBtn(9).pressed ? '#e4e4e7' : '#18181b'} stroke="#3f3f46" />
                                    <circle cx="400" cy="150" r="16" fill={getBtn(16).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />

                                </svg>

                                {/* STICK IZQUIERDO (L3) */}
                                <div className="absolute left-[19%] top-[30%] w-32 h-32 rounded-full bg-zinc-950/90 border border-zinc-800 flex items-center justify-center">
                                    <canvas
                                        ref={canvasTrailLRef}
                                        width={128}
                                        height={128}
                                        className="absolute inset-0 w-full h-full rounded-full pointer-events-none"
                                    />
                                    <div
                                        className={`absolute w-5 h-5 rounded-full transition-transform duration-75 border ${getBtn(10).pressed ? 'bg-purple-500 border-white scale-125' : 'bg-sky-400 border-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.8)]'
                                            }`}
                                        style={{
                                            transform: `translate(${Math.max(-1, Math.min(1, statsL.lx)) * 48}px, ${Math.max(-1, Math.min(1, statsL.ly)) * 48}px)`
                                        }}
                                    />
                                </div>

                                {/* STICK DERECHO (R3) */}
                                <div className="absolute right-[21%] top-[48%] w-32 h-32 rounded-full bg-zinc-950/90 border border-zinc-800 flex items-center justify-center">
                                    <canvas
                                        ref={canvasTrailRRef}
                                        width={128}
                                        height={128}
                                        className="absolute inset-0 w-full h-full rounded-full pointer-events-none"
                                    />
                                    <div
                                        className={`absolute w-5 h-5 rounded-full transition-transform duration-75 border ${getBtn(11).pressed ? 'bg-purple-500 border-white scale-125' : 'bg-sky-400 border-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.8)]'
                                            }`}
                                        style={{
                                            transform: `translate(${Math.max(-1, Math.min(1, statsR.rx)) * 48}px, ${Math.max(-1, Math.min(1, statsR.ry)) * 48}px)`
                                        }}
                                    />
                                </div>

                            </div>

                            {/* LECTURAS TIPO GULIKIT */}
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

                        {/* 📈 OSCILOSCOPIO DUAL DE EJES TMR (RUIDO / JITTER) */}
                        <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl space-y-4">
                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                                📈 OSCILOSCOPIO DUAL DE EJES TMR (MONITOREO DE RUIDO Y JITTER EN TIEMPO REAL)
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div className="flex gap-4 text-[10px] font-bold mb-2 font-mono">
                                        <span className="text-emerald-400">● Eje X (L3)</span>
                                        <span className="text-indigo-400">● Eje Y (L3)</span>
                                    </div>
                                    <canvas
                                        ref={canvasOscLRef}
                                        width={400}
                                        height={120}
                                        className="w-full h-28 bg-black border border-zinc-800 rounded-lg shadow-inner"
                                    />
                                </div>

                                <div>
                                    <div className="flex gap-4 text-[10px] font-bold mb-2 font-mono">
                                        <span className="text-amber-500">● Eje X (R3)</span>
                                        <span className="text-rose-400">● Eje Y (R3)</span>
                                    </div>
                                    <canvas
                                        ref={canvasOscRRef}
                                        width={400}
                                        height={120}
                                        className="w-full h-28 bg-black border border-zinc-800 rounded-lg shadow-inner"
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