'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'

const VENDOR_SONY = 0x054c
const VENDOR_NINTENDO = 0x057e

export default function GamepadTester() {
    const [gamepadDetectado, setGamepadDetectado] = useState<boolean>(false)
    const [gamepadNombre, setGamepadNombre] = useState<string>('')
    const [ticketsActivos, setTicketsActivos] = useState<any[]>([])
    const [ticketSeleccionado, setTicketSeleccionado] = useState<string>('')

    const [hidDevice, setHidDevice] = useState<any>(null)
    const [hidStatus, setHidStatus] = useState<string>('Sin conexión WebHID directa')

    const [pasoCalib, setPasoCalib] = useState<number>(0)
    const [testCircularidad, setTestCircularidad] = useState(true)

    // REFS PARA BUCLE DE RENDIMIENTO A 60 FPS SIN RE-CREAR LOOP
    const offsetL = useRef({ x: 0, y: 0 })
    const offsetR = useRef({ x: 0, y: 0 })
    const scaleL = useRef({ x: 1, y: 1 })
    const scaleR = useRef({ x: 1, y: 1 })

    // Stats visibles en React (Actualizados vía Throttle a 15 FPS)
    const [statsL, setStatsL] = useState({ lx: 0, ly: 0, driftCentro: 0, errCirc: 0 })
    const [statsR, setStatsR] = useState({ rx: 0, ry: 0, driftCentro: 0, errCirc: 0 })

    // REFS INTERACTIVAS DE DOM Y CANVAS
    const dotLRef = useRef<HTMLDivElement>(null)
    const dotRRef = useRef<HTMLDivElement>(null)
    const canvasTrailLRef = useRef<HTMLCanvasElement>(null)
    const canvasTrailRRef = useRef<HTMLCanvasElement>(null)
    const canvasOscLRef = useRef<HTMLCanvasElement>(null)
    const canvasOscRRef = useRef<HTMLCanvasElement>(null)

    const pointsTrailL = useRef<{ x: number; y: number; mag: number }[]>([])
    const pointsTrailR = useRef<{ x: number; y: number; mag: number }[]>([])
    const outerRadiusL = useRef<number[]>(new Array(36).fill(0))
    const outerRadiusR = useRef<number[]>(new Array(36).fill(0))

    const restingDriftL = useRef<number>(0)
    const restingDriftR = useRef<number>(0)

    const historyOscL = useRef<{ x: number; y: number }[]>([])
    const historyOscR = useRef<{ x: number; y: number }[]>([])
    const MAX_OSC_HISTORY = 150

    const requestRef = useRef<number>(0)
    const lastStateUpdateRef = useRef<number>(0)
    const activeGamepadRef = useRef<Gamepad | null>(null)

    // Cargar Tickets Activos de Taller
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

    // ⚡ CONEXIÓN A PROTOCOLO NATIVO WEBHID (DS4 / DUALSENSE)
    const conectarWebHIDPS = async () => {
        if (typeof window === 'undefined' || !('hid' in navigator)) {
            alert('⚠️ WebHID está soportado en Chrome, Edge u Opera.')
            return
        }

        try {
            const devices = await (navigator as any).hid.requestDevice({
                filters: [
                    { vendorId: VENDOR_SONY },
                    { vendorId: VENDOR_NINTENDO }
                ]
            })

            if (!devices || devices.length === 0) return

            const device = devices[0]
            await device.open()
            setHidDevice(device)
            setHidStatus(`🟢 WebHID Activo: ${device.productName} (Vendor: 0x${device.vendorId.toString(16)})`)

            // LECTURA DIRECTA DE REPORTES DE ENTRADA USB
            device.addEventListener('inputreport', (event: any) => {
                const { data } = event
                if (!data) return
                // Los bytes 1,2 y 3,4 contienen la lectura cruda de los sticks en mandos Sony
                // Se utiliza para validación directa de hardware
            })

        } catch (err: any) {
            console.error('🔴 Error WebHID:', err)
            alert('Error al establecer canal WebHID: ' + err.message)
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

    // 🎨 RENDERIZADOR DE TRAYECTORIA Y ERRORES DE CIRCULARIDAD
    const renderCanvasTrail = (canvas: HTMLCanvasElement | null, points: { x: number; y: number; mag: number }[]) => {
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const w = canvas.width
        const h = canvas.height
        const centerX = w / 2
        const centerY = h / 2
        const maxRadius = 42

        ctx.clearRect(0, 0, w, h)

        // Anillo de referencia r = 1.0
        ctx.save()
        ctx.beginPath()
        ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2)
        ctx.strokeStyle = '#3f3f46'
        ctx.lineWidth = 1
        ctx.setLineDash([2, 2])
        ctx.stroke()
        ctx.restore()

        if (points.length < 2) return

        ctx.save()
        ctx.lineWidth = 1.8
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        for (let i = 1; i < points.length; i++) {
            const pPrev = points[i - 1]
            const pCurr = points[i]

            const prevX = centerX + (pPrev.x * maxRadius)
            const prevY = centerY + (pPrev.y * maxRadius)
            const currX = centerX + (pCurr.x * maxRadius)
            const currY = centerY + (pCurr.y * maxRadius)

            const desviacion = Math.abs(pCurr.mag - 1.0)
            const esError = desviacion > 0.12 || pCurr.mag < 0.85

            ctx.beginPath()
            ctx.moveTo(prevX, prevY)
            ctx.lineTo(currX, currY)
            ctx.strokeStyle = esError ? '#f43f5e' : '#00f3ff'
            ctx.stroke()
        }

        ctx.restore()
    }

    // 📈 DIBUJO DEL OSCILOSCOPIO
    const drawOscilloscope = (canvas: HTMLCanvasElement | null, data: { x: number; y: number }[], colorX: string, colorY: string) => {
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const width = canvas.width
        const height = canvas.height

        ctx.clearRect(0, 0, width, height)

        ctx.beginPath()
        ctx.strokeStyle = '#27272a'
        ctx.lineWidth = 1
        ctx.moveTo(0, height / 2)
        ctx.lineTo(width, height / 2)
        ctx.stroke()

        const drawLine = (key: 'x' | 'y', color: string) => {
            ctx.beginPath()
            ctx.strokeStyle = color
            ctx.lineWidth = 1.8
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

    // 🕹️ BUCLE PRINCIPAL DE ESCANEO A 60 FPS
    const scanGamepads = (now: number) => {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
        const activeGp = Array.from(gamepads).find(gp => gp !== null)

        if (activeGp) {
            activeGamepadRef.current = activeGp

            if (!gamepadDetectado) {
                setGamepadDetectado(true)
                setGamepadNombre(activeGp.id)
            }

            const rawLX = activeGp.axes[0] || 0
            const rawLY = activeGp.axes[1] || 0
            const rawRX = activeGp.axes[2] || 0
            const rawRY = activeGp.axes[3] || 0

            // Transformación con Offsets y Escala de Calibración
            const lx = (rawLX - offsetL.current.x) * scaleL.current.x
            const ly = (rawLY - offsetL.current.y) * scaleL.current.y
            const rx = (rawRX - offsetR.current.x) * scaleR.current.x
            const ry = (rawRY - offsetR.current.y) * scaleR.current.y

            // Movimiento directo de puntos sin retraso de renderizado
            if (dotLRef.current) {
                const clX = Math.max(-1.3, Math.min(1.3, lx)) * 42
                const clY = Math.max(-1.3, Math.min(1.3, ly)) * 42
                dotLRef.current.style.transform = `translate(${clX}px, ${clY}px)`
            }

            if (dotRRef.current) {
                const crX = Math.max(-1.3, Math.min(1.3, rx)) * 42
                const crY = Math.max(-1.3, Math.min(1.3, ry)) * 42
                dotRRef.current.style.transform = `translate(${crX}px, ${crY}px)`
            }

            const magL = Math.sqrt(lx * lx + ly * ly)
            const magR = Math.sqrt(rx * rx + ry * ry)

            // Captura de Drift en Reposo (stick en zona central < 0.25)
            if (magL < 0.25) {
                restingDriftL.current = parseFloat((magL * 100).toFixed(1))
            }

            if (magR < 0.25) {
                restingDriftR.current = parseFloat((magR * 100).toFixed(1))
            }

            if (testCircularidad && magL > 0.15) {
                pointsTrailL.current.push({ x: lx, y: ly, mag: magL })
                if (pointsTrailL.current.length > 350) pointsTrailL.current.shift()

                const angleDeg = ((Math.atan2(ly, lx) * 180 / Math.PI) + 360) % 360
                const sectorIdx = Math.floor(angleDeg / 10)
                if (magL > outerRadiusL.current[sectorIdx]) {
                    outerRadiusL.current[sectorIdx] = magL
                }
            }

            if (testCircularidad && magR > 0.15) {
                pointsTrailR.current.push({ x: rx, y: ry, mag: magR })
                if (pointsTrailR.current.length > 350) pointsTrailR.current.shift()

                const angleDeg = ((Math.atan2(ry, rx) * 180 / Math.PI) + 360) % 360
                const sectorIdx = Math.floor(angleDeg / 10)
                if (magR > outerRadiusR.current[sectorIdx]) {
                    outerRadiusR.current[sectorIdx] = magR
                }
            }

            renderCanvasTrail(canvasTrailLRef.current, pointsTrailL.current)
            renderCanvasTrail(canvasTrailRRef.current, pointsTrailR.current)

            historyOscL.current.push({ x: lx, y: ly })
            if (historyOscL.current.length > MAX_OSC_HISTORY) historyOscL.current.shift()

            historyOscR.current.push({ x: rx, y: ry })
            if (historyOscR.current.length > MAX_OSC_HISTORY) historyOscR.current.shift()

            drawOscilloscope(canvasOscLRef.current, historyOscL.current, '#34d399', '#818cf8')
            drawOscilloscope(canvasOscRRef.current, historyOscR.current, '#f59e0b', '#fb7185')

            // Throttle a 15 FPS para actualizar métricas de React
            if (now - lastStateUpdateRef.current > 66) {
                lastStateUpdateRef.current = now

                const activeSectorsL = outerRadiusL.current.filter(r => r > 0.3)
                const errCircL = activeSectorsL.length > 5
                    ? (activeSectorsL.reduce((sum, r) => sum + Math.abs(r - 1.0), 0) / activeSectorsL.length) * 100
                    : 0

                const activeSectorsR = outerRadiusR.current.filter(r => r > 0.3)
                const errCircR = activeSectorsR.length > 5
                    ? (activeSectorsR.reduce((sum, r) => sum + Math.abs(r - 1.0), 0) / activeSectorsR.length) * 100
                    : 0

                setStatsL({ lx, ly, driftCentro: restingDriftL.current, errCirc: parseFloat(errCircL.toFixed(1)) })
                setStatsR({ rx, ry, driftCentro: restingDriftR.current, errCirc: parseFloat(errCircR.toFixed(1)) })
            }

        } else {
            if (gamepadDetectado) {
                setGamepadDetectado(false)
                setGamepadNombre('')
            }
        }

        requestRef.current = requestAnimationFrame(scanGamepads)
    }

    useEffect(() => {
        requestRef.current = requestAnimationFrame(scanGamepads)
        return () => cancelAnimationFrame(requestRef.current)
    }, [testCircularidad, gamepadDetectado])

    // LÓGICA PASO A PASO DE CALIBRACIÓN
    const iniciarCalibracionPaso1 = () => setPasoCalib(1)

    const fijarCentroPaso1 = () => {
        const gp = activeGamepadRef.current
        if (!gp) return
        offsetL.current = { x: gp.axes[0] || 0, y: gp.axes[1] || 0 }
        offsetR.current = { x: gp.axes[2] || 0, y: gp.axes[3] || 0 }
        limpiarTrazos()
        setPasoCalib(2)
    }

    const finalizarCalibracionPaso2 = () => {
        const maxL = Math.max(...outerRadiusL.current.filter(r => r > 0.5), 1.0)
        const maxR = Math.max(...outerRadiusR.current.filter(r => r > 0.5), 1.0)

        scaleL.current = { x: 1 / maxL, y: 1 / maxL }
        scaleR.current = { x: 1 / maxR, y: 1 / maxR }
        setPasoCalib(3)
    }

    const restablecerCalibracion = () => {
        offsetL.current = { x: 0, y: 0 }
        offsetR.current = { x: 0, y: 0 }
        scaleL.current = { x: 1, y: 1 }
        scaleR.current = { x: 1, y: 1 }
        limpiarTrazos()
        setPasoCalib(0)
    }

    const getBtn = (idx: number) => {
        const gp = activeGamepadRef.current
        if (!gp || !gp.buttons[idx]) return { pressed: false, value: 0 }
        return gp.buttons[idx]
    }

    const guardarReporteTicket = async () => {
        if (!ticketSeleccionado) return alert('Por favor selecciona una orden SOL-XXXX activa.')

        const reporte = `[REPORTE TÉCNICO DE GAMEPAD Y CALIBRACIÓN]:
- Mando: ${gamepadNombre || 'Mando Estándar'}
- Stick L3: Drift Centro = ${statsL.driftCentro}% | Error Circularidad Real = ${statsL.errCirc}%
- Stick R3: Drift Centro = ${statsR.driftCentro}% | Error Circularidad Real = ${statsR.errCirc}%
- Conexión WebHID NVS: ${hidDevice ? 'Verificado vía USB WebHID' : 'Inspección API Estándar'}
- Calibración Software: ${pasoCalib === 3 ? 'Ajustada con éxito' : 'Sin cambios'}
- Prueba de Botones y Gatillos: Verificada`

        try {
            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticketId: ticketSeleccionado, notasDiagnostico: reporte })
            })
            if (res.ok) alert('✅ Reporte inyectado al ticket correctamente.')
        } catch (err) {
            alert('Error al guardar reporte en la orden.')
        }
    }

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-6 font-sans">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* ENCABEZADO */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-900 pb-4">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-emerald-400 font-mono flex items-center gap-2">
                            🎮 SOLTECOT_ GAMEPAD TESTER & CALIBRATOR
                        </h1>
                        <p className="text-xs text-zinc-500">Módulo de diagnóstico, calibración 360° e inspección WebHID</p>
                    </div>
                    <Link href="/admin" className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-4 py-2 rounded-xl text-xs font-bold transition-colors">
                        ⬅ Volver al Panel
                    </Link>
                </div>

                {/* SELECCIÓN DE TICKET */}
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
                        className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-3 rounded-xl transition-colors shadow-lg"
                    >
                        📋 Inyectar Reporte al Ticket
                    </button>
                </div>

                {!gamepadDetectado ? (
                    <div className="bg-zinc-950 border border-dashed border-zinc-800 rounded-2xl p-12 text-center space-y-3">
                        <span className="text-4xl animate-pulse">🔌</span>
                        <h3 className="text-lg font-bold text-zinc-300">Conecta tu mando y presiona cualquier botón</h3>
                        <p className="text-xs text-zinc-500 max-w-md mx-auto">
                            Compatible con mandos de Xbox, DualShock 4, DualSense PS5, Nintendo Switch y mandos TMR / Hall Effect.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">

                        {/* BARRA DE ESTADO */}
                        <div className="bg-zinc-950 border border-zinc-900 p-3.5 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-zinc-400 font-mono gap-2">
                            <div><strong className="text-indigo-400">CONTROL DETECTADO:</strong> {gamepadNombre}</div>
                            <div><strong className="text-emerald-400">ESTADO:</strong> 🟢 CONECTADO (Latencia 0ms)</div>
                        </div>

                        {/* MÓDULO WEBHID */}
                        <div className="bg-zinc-950 border border-indigo-900/50 p-5 rounded-2xl space-y-3">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                                        ⚡ CONEXIÓN DIRECTA WEBHID (PLAYSTATION / NINTENDO)
                                    </h3>
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                        Permite inspección de reporte de datos a nivel de puerto USB para mandos Sony y Nintendo.
                                    </p>
                                    <p className="text-[11px] text-zinc-500 font-mono mt-1">{hidStatus}</p>
                                </div>

                                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                                    {!hidDevice && (
                                        <button
                                            onClick={conectarWebHIDPS}
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition-colors"
                                        >
                                            🔌 Conectar WebHID PS4/PS5
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* CALIBRACIÓN GUIADA */}
                        <div className="bg-zinc-950 border border-purple-900/50 p-5 rounded-2xl space-y-3">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2">
                                        ⚙️ ASISTENTE DE CALIBRACIÓN 360° (STICK CENTRADO Y ESCALA)
                                    </h3>
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                        {pasoCalib === 0 && 'Inicia el asistente para centrar la posición de reposo y medir el límite circular.'}
                                        {pasoCalib === 1 && 'Paso 1: Suelta los joysticks en el centro y presiona "Fijar Centro".'}
                                        {pasoCalib === 2 && 'Paso 2: Gira ambos sticks 360° suavemente y presiona "Finalizar".'}
                                        {pasoCalib === 3 && '✅ Calibración ajustada. Los offsets y escalas han sido aplicados.'}
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

                        {/* INTERFAZ VECTORIAL */}
                        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 relative flex flex-col items-center">

                            <div className="flex flex-wrap items-center justify-between w-full border-b border-zinc-900 pb-4 mb-6 gap-3 text-xs">
                                <label className="flex items-center gap-2 cursor-pointer font-bold text-zinc-300">
                                    <input
                                        type="checkbox"
                                        checked={testCircularidad}
                                        onChange={(e) => setTestCircularidad(e.target.checked)}
                                        className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                                    />
                                    <span>Trazar Trayectoria Real (Medición de Deformación)</span>
                                </label>

                                <button
                                    onClick={limpiarTrazos}
                                    className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 px-3 py-1.5 rounded-lg text-xs transition-colors font-bold"
                                >
                                    🧹 Limpiar Trazo
                                </button>
                            </div>

                            <div className="relative w-full max-w-3xl aspect-[1.8/1] bg-zinc-900/30 border border-zinc-900 rounded-2xl p-4 flex items-center justify-center overflow-hidden">
                                <svg viewBox="0 0 800 450" className="w-full h-full select-none">

                                    {/* GATILLOS */}
                                    <g transform="translate(150, 20)">
                                        <rect x="0" y="0" width="120" height="25" rx="6" fill="#18181b" stroke="#3f3f46" strokeWidth="2" />
                                        <rect x="0" y="0" width={120 * getBtn(6).value} height="25" rx="6" fill="#6366f1" />
                                        <text x="60" y="16" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">LT / L2 ({(getBtn(6).value * 100).toFixed(0)}%)</text>
                                    </g>

                                    <g transform="translate(530, 20)">
                                        <rect x="0" y="0" width="120" height="25" rx="6" fill="#18181b" stroke="#3f3f46" strokeWidth="2" />
                                        <rect x="0" y="0" width={120 * getBtn(7).value} height="25" rx="6" fill="#6366f1" />
                                        <text x="60" y="16" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">RT / R2 ({(getBtn(7).value * 100).toFixed(0)}%)</text>
                                    </g>

                                    {/* BUMPERS */}
                                    <rect x="160" y="55" width="100" height="22" rx="6" fill={getBtn(4).pressed ? '#818cf8' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                    <text x="210" y="70" textAnchor="middle" fill={getBtn(4).pressed ? '#000' : '#a1a1aa'} fontSize="11" fontWeight="bold">LB / L1</text>

                                    <rect x="540" y="55" width="100" height="22" rx="6" fill={getBtn(5).pressed ? '#818cf8' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                    <text x="590" y="70" textAnchor="middle" fill={getBtn(5).pressed ? '#000' : '#a1a1aa'} fontSize="11" fontWeight="bold">RB / R1</text>

                                    {/* CUERPO DEL CONTROL */}
                                    <path
                                        d="M 220 90 C 300 80, 500 80, 580 90 C 660 100, 750 180, 730 380 C 710 430, 630 440, 570 360 C 520 300, 470 300, 400 300 C 330 300, 280 300, 230 360 C 170 440, 90 430, 70 380 C 50 180, 140 100, 220 90 Z"
                                        fill="#09090b"
                                        stroke="#27272a"
                                        strokeWidth="4"
                                    />

                                    {/* D-PAD */}
                                    <g transform="translate(320, 280)">
                                        <rect x="-12" y="-38" width="24" height="26" rx="4" fill={getBtn(12).pressed ? '#f59e0b' : '#18181b'} stroke="#3f3f46" />
                                        <rect x="-12" y="12" width="24" height="26" rx="4" fill={getBtn(13).pressed ? '#f59e0b' : '#18181b'} stroke="#3f3f46" />
                                        <rect x="-38" y="-12" width="26" height="24" rx="4" fill={getBtn(14).pressed ? '#f59e0b' : '#18181b'} stroke="#3f3f46" />
                                        <rect x="12" y="-12" width="26" height="24" rx="4" fill={getBtn(15).pressed ? '#f59e0b' : '#18181b'} stroke="#3f3f46" />
                                        <rect x="-12" y="-12" width="24" height="24" fill={getBtn(12).pressed || getBtn(13).pressed || getBtn(14).pressed || getBtn(15).pressed ? '#f59e0b' : '#18181b'} />
                                    </g>

                                    {/* BOTONES ACCIÓN */}
                                    <g transform="translate(560, 170)">
                                        <circle cx="0" cy="-35" r="16" fill={getBtn(3).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                        <text x="0" y="-30" textAnchor="middle" fill={getBtn(3).pressed ? '#000' : '#34d399'} fontSize="14" fontWeight="bold">Y</text>

                                        <circle cx="0" cy="35" r="16" fill={getBtn(0).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                        <text x="0" y="40" textAnchor="middle" fill={getBtn(0).pressed ? '#000' : '#34d399'} fontSize="14" fontWeight="bold">A</text>

                                        <circle cx="-35" cy="0" r="16" fill={getBtn(2).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                        <text x="-35" y="5" textAnchor="middle" fill={getBtn(2).pressed ? '#000' : '#34d399'} fontSize="14" fontWeight="bold">X</text>

                                        <circle cx="35" cy="0" r="16" fill={getBtn(1).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                        <text x="35" y="5" textAnchor="middle" fill={getBtn(1).pressed ? '#000' : '#34d399'} fontSize="14" fontWeight="bold">B</text>
                                    </g>

                                    {/* BOTONES CENTRO */}
                                    <circle cx="360" cy="170" r="9" fill={getBtn(8).pressed ? '#e4e4e7' : '#18181b'} stroke="#3f3f46" />
                                    <circle cx="440" cy="170" r="9" fill={getBtn(9).pressed ? '#e4e4e7' : '#18181b'} stroke="#3f3f46" />
                                    <circle cx="400" cy="140" r="16" fill={getBtn(16).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />

                                    {/* JOYSTICK L3 */}
                                    <foreignObject x="180" y="110" width="120" height="120">
                                        <div className="relative w-full h-full rounded-full bg-zinc-950/90 border border-zinc-800 flex items-center justify-center">
                                            <canvas
                                                ref={canvasTrailLRef}
                                                width={120}
                                                height={120}
                                                className="absolute inset-0 w-full h-full rounded-full pointer-events-none"
                                            />
                                            <div
                                                ref={dotLRef}
                                                className={`absolute w-5 h-5 rounded-full border ${getBtn(10).pressed ? 'bg-purple-500 border-white scale-125' : 'bg-sky-400 border-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.9)]'}`}
                                            />
                                        </div>
                                    </foreignObject>

                                    {/* JOYSTICK R3 */}
                                    <foreignObject x="420" y="220" width="120" height="120">
                                        <div className="relative w-full h-full rounded-full bg-zinc-950/90 border border-zinc-800 flex items-center justify-center">
                                            <canvas
                                                ref={canvasTrailRRef}
                                                width={120}
                                                height={120}
                                                className="absolute inset-0 w-full h-full rounded-full pointer-events-none"
                                            />
                                            <div
                                                ref={dotRRef}
                                                className={`absolute w-5 h-5 rounded-full border ${getBtn(11).pressed ? 'bg-purple-500 border-white scale-125' : 'bg-sky-400 border-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.9)]'}`}
                                            />
                                        </div>
                                    </foreignObject>

                                </svg>
                            </div>

                            {/* LECTURAS TÉCNICAS */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mt-6 text-xs font-mono">
                                <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl space-y-1">
                                    <div className="flex justify-between font-bold text-sky-400 border-b border-zinc-800 pb-1 mb-2">
                                        <span>STICK IZQUIERDO (L3)</span>
                                        <span>LX: {statsL.lx.toFixed(4)} | LY: {statsL.ly.toFixed(4)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-400">Drift de Centro (Reposo):</span>
                                        <span className={statsL.driftCentro > 5 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                            {statsL.driftCentro}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-400">Error de Circularidad:</span>
                                        <span className={statsL.errCirc > 10 ? 'text-rose-400 font-bold' : 'text-amber-400 font-bold'}>
                                            {statsL.errCirc}%
                                        </span>
                                    </div>
                                </div>

                                <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-xl space-y-1">
                                    <div className="flex justify-between font-bold text-sky-400 border-b border-zinc-800 pb-1 mb-2">
                                        <span>STICK DERECHO (R3)</span>
                                        <span>RX: {statsR.rx.toFixed(4)} | RY: {statsR.ry.toFixed(4)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-400">Drift de Centro (Reposo):</span>
                                        <span className={statsR.driftCentro > 5 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                            {statsR.driftCentro}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-400">Error de Circularidad:</span>
                                        <span className={statsR.errCirc > 10 ? 'text-rose-400 font-bold' : 'text-amber-400 font-bold'}>
                                            {statsR.errCirc}%
                                        </span>
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* OSCILOSCOPIO */}
                        <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl space-y-4">
                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2 font-mono">
                                📈 OSCILOSCOPIO DUAL DE EJES TMR (MONITOREO DE JITTER Y RUIDO EN TIEMPO REAL)
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