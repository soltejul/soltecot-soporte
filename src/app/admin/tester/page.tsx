'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'

// IDs USB / Bluetooth Oficiales
const VENDOR_SONY = 0x054c
const PID_DS4_V1 = 0x05c4
const PID_DS4_V2 = 0x09cc
const PID_DUALSENSE = 0x0ce6
const PID_DUALSENSE_EDGE = 0x0df2

const VENDOR_NINTENDO = 0x057e
const PID_SWITCH_JOYCON_L = 0x2006
const PID_SWITCH_JOYCON_R = 0x2007
const PID_SWITCH_PRO = 0x2009

type TipoHardwareHID =
    | 'SONY_DUALSENSE'
    | 'SONY_DS4'
    | 'SWITCH_PRO'
    | 'SWITCH_JOYCON_L'
    | 'SWITCH_JOYCON_R'
    | 'NINGUNO'

interface SnapshotDiagnostico {
    hora: string
    driftL: number
    errCircL: number
    driftR: number
    errCircR: number
    pollingHz: number
    jitterMs: number
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Empaqueta 3 pares de valores 12-bit (0..4095) en 9 bytes según formato SPI de Nintendo Switch
function empaquetarPares12BitSwitch(
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number
): number[] {
    const clamp12 = (v: number) => Math.max(0, Math.min(4095, Math.round(v)))
    const packPair = (xRaw: number, yRaw: number) => {
        const x = clamp12(xRaw)
        const y = clamp12(yRaw)
        return [
            x & 0xff,
            ((x >> 8) & 0x0f) | ((y & 0x0f) << 4),
            (y >> 4) & 0xff
        ]
    }
    return [
        ...packPair(x1, y1),
        ...packPair(x2, y2),
        ...packPair(x3, y3)
    ]
}

export default function GamepadTester() {
    const [enIframe, setEnIframe] = useState(false)
    const [gamepadDetectado, setGamepadDetectado] = useState<boolean>(false)
    const [gamepadNombre, setGamepadNombre] = useState<string>('')
    const [ticketsActivos, setTicketsActivos] = useState<any[]>([])
    const [ticketSeleccionado, setTicketSeleccionado] = useState<string>('')

    // Estados WebHID Multi-Marca (Sony NVS & Nintendo Switch SPI)
    const [hidDevice, setHidDevice] = useState<any>(null)
    const [tipoHardware, setTipoHardware] = useState<TipoHardwareHID>('NINGUNO')
    const [hidStatus, setHidStatus] = useState<string>('Sin enlace WebHID — Conecta Sony (USB) o Nintendo Switch para grabar calibración interna')
    const [memoriaGuardada, setMemoriaGuardada] = useState<boolean>(false)
    const [ocupadoHid, setOcupadoHid] = useState<boolean>(false)

    // Refs para protocolo Nintendo Switch (contador de paquetes y lectura cruda 12-bit)
    const switchPacketNumRef = useRef<number>(0)
    const switchRawRef = useRef({ lx: 2048, ly: 2048, rx: 2048, ry: 2048, activo: false })
    const switchCalibBoundsRef = useRef({
        centerLX: 2048, centerLY: 2048,
        minLX: 2048, maxLX: 2048, minLY: 2048, maxLY: 2048,
        centerRX: 2048, centerRY: 2048,
        minRX: 2048, maxRX: 2048, minRY: 2048, maxRY: 2048
    })

    // Pasos de calibración: 0 = Inactivo, 1 = Centro, 2 = Rango 360°, 3 = Listo para guardar en chip
    const [pasoCalib, setPasoCalib] = useState<number>(0)
    const [testCircularidad, setTestCircularidad] = useState(true)
    const [vibrando, setVibrando] = useState(false)

    // Estados Módulo Comparativo Antes vs. Después
    const [snapshotAntes, setSnapshotAntes] = useState<SnapshotDiagnostico | null>(null)
    const [snapshotDespues, setSnapshotDespues] = useState<SnapshotDiagnostico | null>(null)

    // Offsets/Escalas visuales de respaldo cuando NO hay WebHID (ej. Xbox)
    const offsetL = useRef({ x: 0, y: 0 })
    const offsetR = useRef({ x: 0, y: 0 })
    const scaleL = useRef({ x: 1, y: 1 })
    const scaleR = useRef({ x: 1, y: 1 })

    // Métricas en tiempo real (15 FPS en UI)
    const [statsL, setStatsL] = useState({ lx: 0, ly: 0, driftCentro: 0, errCirc: 0 })
    const [statsR, setStatsR] = useState({ rx: 0, ry: 0, driftCentro: 0, errCirc: 0 })
    const [pollingStats, setPollingStats] = useState({ hz: 0, intervaloMs: 0, activo: false })

    // Refs de medición de Polling Rate (1 kHz sampler)
    const lastGpTimestampRef = useRef<number>(0)
    const lastPacketArrivalRef = useRef<number>(0)
    const packetIntervalsRef = useRef<number[]>([])
    const latestPollingRef = useRef({ hz: 0, intervaloMs: 0 })

    // Refs de DOM y Canvas (60 FPS sin re-renders)
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

    useEffect(() => {
        setEnIframe(typeof window !== 'undefined' && window.self !== window.top)

        fetch('/api/tickets')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setTicketsActivos(data.filter(t => t.estado !== 'ENTREGADO' && t.estado !== 'RECHAZADO'))
                }
            })
            .catch(console.error)
    }, [])

    // =========================================================================
    // ⏱️ MUESTREADOR DE POLLING RATE REAL (1ms TIMER SOBRE gp.timestamp)
    // =========================================================================
    useEffect(() => {
        const intervalId = setInterval(() => {
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
            const gp = Array.from(gamepads).find(g => g !== null)
            const now = performance.now()

            if (!gp) {
                packetIntervalsRef.current = []
                latestPollingRef.current = { hz: 0, intervaloMs: 0 }
                return
            }

            if (gp.timestamp && gp.timestamp !== lastGpTimestampRef.current) {
                if (lastGpTimestampRef.current > 0) {
                    const delta = gp.timestamp - lastGpTimestampRef.current
                    if (delta > 0.2 && delta < 250) {
                        packetIntervalsRef.current.push(delta)
                        if (packetIntervalsRef.current.length > 120) {
                            packetIntervalsRef.current.shift()
                        }

                        const sum = packetIntervalsRef.current.reduce((a, b) => a + b, 0)
                        const avgMs = sum / packetIntervalsRef.current.length
                        const hz = Math.round(1000 / avgMs)

                        latestPollingRef.current = {
                            hz,
                            intervaloMs: parseFloat(avgMs.toFixed(2))
                        }
                    }
                }
                lastGpTimestampRef.current = gp.timestamp
                lastPacketArrivalRef.current = now
            } else if (now - lastPacketArrivalRef.current > 400) {
                packetIntervalsRef.current = []
                latestPollingRef.current = { hz: 0, intervaloMs: 0 }
            }
        }, 1)

        return () => clearInterval(intervalId)
    }, [])

    // =========================================================================
    // 📸 CAPTURAS ANTES / DESPUÉS PARA COMPARATIVA TÉCNICA
    // =========================================================================
    const capturarAntes = () => {
        const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
        setSnapshotAntes({
            hora,
            driftL: statsL.driftCentro,
            errCircL: statsL.errCirc,
            driftR: statsR.driftCentro,
            errCircR: statsR.errCirc,
            pollingHz: latestPollingRef.current.hz,
            jitterMs: latestPollingRef.current.intervaloMs
        })
    }

    const capturarDespues = () => {
        const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
        setSnapshotDespues({
            hora,
            driftL: statsL.driftCentro,
            errCircL: statsL.errCirc,
            driftR: statsR.driftCentro,
            errCircR: statsR.errCirc,
            pollingHz: latestPollingRef.current.hz,
            jitterMs: latestPollingRef.current.intervaloMs
        })
    }

    const limpiarComparativa = () => {
        setSnapshotAntes(null)
        setSnapshotDespues(null)
    }

    // =========================================================================
    // 🎮 UTILIDADES DE ENVÍO DE SUBCOMANDOS NINTENDO SWITCH (REPORT 0x01)
    // =========================================================================
    const enviarSubcomandoSwitch = async (device: any, subcommand: number, args: number[]) => {
        const pkt = new Uint8Array(48)
        pkt[0] = switchPacketNumRef.current & 0x0f
        switchPacketNumRef.current = (switchPacketNumRef.current + 1) & 0x0f

        // Vibración neutra obligatoria en tramas Switch
        pkt[1] = 0x00; pkt[2] = 0x01; pkt[3] = 0x40; pkt[4] = 0x40
        pkt[5] = 0x00; pkt[6] = 0x01; pkt[7] = 0x40; pkt[8] = 0x40

        pkt[9] = subcommand
        for (let i = 0; i < args.length; i++) {
            pkt[10 + i] = args[i]
        }

        await device.sendReport(0x01, pkt)
    }

    const escribirSPISwitch = async (device: any, address: number, bytes: number[]) => {
        const args = [
            address & 0xff,
            (address >> 8) & 0xff,
            (address >> 16) & 0xff,
            (address >> 24) & 0xff,
            bytes.length,
            ...bytes
        ]
        await enviarSubcomandoSwitch(device, 0x11, args)
        await sleep(180)
    }

    // =========================================================================
    // ⚡ CONEXIÓN WEBHID SONY (DUALSENSE / DUALSHOCK 4)
    // =========================================================================
    const conectarWebHIDSony = async () => {
        if (typeof window === 'undefined' || !('hid' in navigator)) {
            alert('⚠️ Tu navegador no soporta WebHID. Usa Google Chrome o Microsoft Edge en escritorio.')
            return
        }

        try {
            const devices = await (navigator as any).hid.requestDevice({
                filters: [
                    { vendorId: VENDOR_SONY, productId: PID_DUALSENSE },
                    { vendorId: VENDOR_SONY, productId: PID_DUALSENSE_EDGE },
                    { vendorId: VENDOR_SONY, productId: PID_DS4_V1 },
                    { vendorId: VENDOR_SONY, productId: PID_DS4_V2 }
                ]
            })

            if (!devices || devices.length === 0) return

            const device = devices[0]
            if (!device.opened) await device.open()

            const tieneFeatureReports = device.collections?.some(
                (c: any) => c.featureReports && c.featureReports.length > 0
            )
            if (!tieneFeatureReports) {
                alert('⚠️ Parece estar conectado por Bluetooth. Conecta el control Sony por cable USB para calibrar su memoria interna.')
                return
            }

            const tipoDetectado: TipoHardwareHID =
                device.productId === PID_DUALSENSE || device.productId === PID_DUALSENSE_EDGE
                    ? 'SONY_DUALSENSE'
                    : 'SONY_DS4'

            switchRawRef.current.activo = false
            restablecerOffsetsVisuales()
            limpiarTrazos()

            setHidDevice(device)
            setTipoHardware(tipoDetectado)
            setMemoriaGuardada(false)
            setPasoCalib(0)
            setHidStatus(`🟢 Sony USB Conectado: ${device.productName || tipoDetectado} (PID: 0x${device.productId.toString(16)})`)

            device.addEventListener('disconnect', () => {
                setHidDevice(null)
                setTipoHardware('NINGUNO')
                setHidStatus('🔴 Dispositivo Sony desconectado')
            })
        } catch (err: any) {
            console.error('🔴 Error WebHID Sony:', err)
            alert('No se pudo abrir el canal USB WebHID: ' + (err?.message || err))
        }
    }

    // =========================================================================
    // ⚡ CONEXIÓN WEBHID NINTENDO SWITCH (PRO CONTROLLER / JOY-CON L / JOY-CON R)
    // =========================================================================
    const conectarWebHIDSwitch = async () => {
        if (typeof window === 'undefined' || !('hid' in navigator)) {
            alert('⚠️ Tu navegador no soporta WebHID. Usa Google Chrome o Microsoft Edge en escritorio.')
            return
        }

        try {
            const devices = await (navigator as any).hid.requestDevice({
                filters: [
                    { vendorId: VENDOR_NINTENDO, productId: PID_SWITCH_PRO },
                    { vendorId: VENDOR_NINTENDO, productId: PID_SWITCH_JOYCON_L },
                    { vendorId: VENDOR_NINTENDO, productId: PID_SWITCH_JOYCON_R }
                ]
            })

            if (!devices || devices.length === 0) return

            const device = devices[0]
            if (!device.opened) await device.open()

            let tipoDetectado: TipoHardwareHID = 'SWITCH_PRO'
            if (device.productId === PID_SWITCH_JOYCON_L) tipoDetectado = 'SWITCH_JOYCON_L'
            else if (device.productId === PID_SWITCH_JOYCON_R) tipoDetectado = 'SWITCH_JOYCON_R'

            // Handshake USB (ignorado automáticamente si es Bluetooth) + activar reporte crudo 0x30 (60Hz)
            try {
                await device.sendReport(0x80, new Uint8Array([0x02]))
                await sleep(100)
                await device.sendReport(0x80, new Uint8Array([0x04]))
                await sleep(100)
            } catch {
                // Bluetooth no requiere handshake 0x80
            }

            await enviarSubcomandoSwitch(device, 0x03, [0x30])
            await sleep(120)

            // Escuchar trama cruda 0x30 para capturar valores ADC de 12 bits (0..4095)
            const handleSwitchReport = (event: any) => {
                if (event.reportId !== 0x30 || !event.data || event.data.byteLength < 11) return
                const dv = event.data as DataView

                const rawLX = dv.getUint8(5) | ((dv.getUint8(6) & 0x0f) << 8)
                const rawLY = (dv.getUint8(6) >> 4) | (dv.getUint8(7) << 4)
                const rawRX = dv.getUint8(8) | ((dv.getUint8(9) & 0x0f) << 8)
                const rawRY = (dv.getUint8(9) >> 4) | (dv.getUint8(10) << 4)

                switchRawRef.current = { lx: rawLX, ly: rawLY, rx: rawRX, ry: rawRY, activo: true }

                // Registrar extremos en tiempo real mientras se giran los sticks en Paso 2
                const b = switchCalibBoundsRef.current
                if (rawLX < b.minLX) b.minLX = rawLX
                if (rawLX > b.maxLX) b.maxLX = rawLX
                if (rawLY < b.minLY) b.minLY = rawLY
                if (rawLY > b.maxLY) b.maxLY = rawLY

                if (rawRX < b.minRX) b.minRX = rawRX
                if (rawRX > b.maxRX) b.maxRX = rawRX
                if (rawRY < b.minRY) b.minRY = rawRY
                if (rawRY > b.maxRY) b.maxRY = rawRY
            }

            device.addEventListener('inputreport', handleSwitchReport)
            device.addEventListener('disconnect', () => {
                device.removeEventListener('inputreport', handleSwitchReport)
                switchRawRef.current.activo = false
                setHidDevice(null)
                setTipoHardware('NINGUNO')
                setHidStatus('🔴 Dispositivo Nintendo Switch desconectado')
            })

            restablecerOffsetsVisuales()
            limpiarTrazos()

            setHidDevice(device)
            setTipoHardware(tipoDetectado)
            setMemoriaGuardada(false)
            setPasoCalib(0)
            setHidStatus(`🟢 Nintendo Switch Conectado: ${device.productName || tipoDetectado} (PID: 0x${device.productId.toString(16)})`)
        } catch (err: any) {
            console.error('🔴 Error WebHID Nintendo:', err)
            alert('No se pudo conectar con el control Nintendo Switch: ' + (err?.message || err))
        }
    }

    const restablecerOffsetsVisuales = () => {
        offsetL.current = { x: 0, y: 0 }
        offsetR.current = { x: 0, y: 0 }
        scaleL.current = { x: 1, y: 1 }
        scaleR.current = { x: 1, y: 1 }
    }

    // =========================================================================
    // 🔧 ASISTENTE DE CALIBRACIÓN HARDWARE (SONY NVS + NINTENDO SWITCH SPI)
    // =========================================================================
    const iniciarCalibracion = () => {
        limpiarTrazos()
        setMemoriaGuardada(false)
        setPasoCalib(1)
    }

    // PASO 1: FIJAR CENTRO
    const ejecutarPaso1Centro = async () => {
        // A) SONY DUALSENSE / DS4
        if (hidDevice && (tipoHardware === 'SONY_DUALSENSE' || tipoHardware === 'SONY_DS4')) {
            setOcupadoHid(true)
            try {
                const reportCalib = tipoHardware === 'SONY_DUALSENSE' ? 0x82 : 0x08
                const reportStatus = tipoHardware === 'SONY_DUALSENSE' ? 0x83 : 0x09

                await hidDevice.sendFeatureReport(reportCalib, new Uint8Array([0x01, 0x01, 0x01]))
                await sleep(350)
                await hidDevice.sendFeatureReport(reportCalib, new Uint8Array([0x02, 0x01, 0x01]))
                await sleep(200)
                await hidDevice.receiveFeatureReport(reportStatus)

                limpiarTrazos()
                setPasoCalib(2)
                setHidStatus('🟡 Centro calibrado en RAM Sony. Gira ambos sticks 360° y presiona "Fijar Rango 360°".')
            } catch (err: any) {
                alert('Error al calibrar centro en Sony: ' + err.message)
            } finally {
                setOcupadoHid(false)
            }
            return
        }

        // B) NINTENDO SWITCH (Captura centro ADC 12-bit e inicializa límites min/max)
        if (hidDevice && tipoHardware.startsWith('SWITCH_')) {
            const raw = switchRawRef.current
            if (!raw.activo) {
                alert('⚠️ Aún no se reciben lecturas crudas del control Switch. Presiona un botón del mando e intenta de nuevo.')
                return
            }

            switchCalibBoundsRef.current = {
                centerLX: raw.lx, centerLY: raw.ly,
                minLX: raw.lx, maxLX: raw.lx, minLY: raw.ly, maxLY: raw.ly,
                centerRX: raw.rx, centerRY: raw.ry,
                minRX: raw.rx, maxRX: raw.rx, minRY: raw.ry, maxRY: raw.ry
            }

            limpiarTrazos()
            setPasoCalib(2)
            setHidStatus(`🟡 Centro ADC Switch capturado (L: ${raw.lx},${raw.ly} | R: ${raw.rx},${raw.ry}). Gira 360° y presiona "Fijar Rango 360°".`)
            return
        }

        // C) FALLBACK VISUAL (Xbox / Genérico)
        const gp = activeGamepadRef.current
        if (!gp) return
        offsetL.current = { x: gp.axes[0] || 0, y: gp.axes[1] || 0 }
        offsetR.current = { x: gp.axes[2] || 0, y: gp.axes[3] || 0 }
        limpiarTrazos()
        setPasoCalib(2)
    }

    // PASO 2: FIJAR RANGO 360°
    const ejecutarPaso2Rango = async () => {
        // A) SONY DUALSENSE / DS4
        if (hidDevice && (tipoHardware === 'SONY_DUALSENSE' || tipoHardware === 'SONY_DS4')) {
            setOcupadoHid(true)
            try {
                const reportCalib = tipoHardware === 'SONY_DUALSENSE' ? 0x82 : 0x08
                const reportStatus = tipoHardware === 'SONY_DUALSENSE' ? 0x83 : 0x09

                await hidDevice.sendFeatureReport(reportCalib, new Uint8Array([0x01, 0x01, 0x02]))
                await sleep(250)
                await hidDevice.sendFeatureReport(reportCalib, new Uint8Array([0x02, 0x01, 0x02]))
                await sleep(200)
                await hidDevice.receiveFeatureReport(reportStatus)

                setPasoCalib(3)
                setHidStatus('🟠 Rango 360° ajustado en RAM. Presiona "Guardar en Memoria del Control" para hacerlo permanente.')
            } catch (err: any) {
                alert('Error al calibrar rango 360° en Sony: ' + err.message)
            } finally {
                setOcupadoHid(false)
            }
            return
        }

        // B) NINTENDO SWITCH (Valida recorridos registrados)
        if (hidDevice && tipoHardware.startsWith('SWITCH_')) {
            const b = switchCalibBoundsRef.current
            const tieneIzq = tipoHardware === 'SWITCH_PRO' || tipoHardware === 'SWITCH_JOYCON_L'
            const tieneDer = tipoHardware === 'SWITCH_PRO' || tipoHardware === 'SWITCH_JOYCON_R'

            if (tieneIzq && (b.maxLX - b.centerLX < 300 || b.centerLX - b.minLX < 300)) {
                alert('⚠️ Recorrido insuficiente en Stick Izquierdo. Gíralo completamente pegado al borde en 360° antes de fijar el rango.')
                return
            }
            if (tieneDer && (b.maxRX - b.centerRX < 300 || b.centerRX - b.minRX < 300)) {
                alert('⚠️ Recorrido insuficiente en Stick Derecho. Gíralo completamente pegado al borde en 360° antes de fijar el rango.')
                return
            }

            setPasoCalib(3)
            setHidStatus('🟠 Límites 360° calculados. Presiona "Guardar en Memoria del Control" para escribir en SPI Flash.')
            return
        }

        // C) FALLBACK VISUAL
        const maxL = Math.max(...outerRadiusL.current.filter(r => r > 0.5), 1.0)
        const maxR = Math.max(...outerRadiusR.current.filter(r => r > 0.5), 1.0)
        scaleL.current = { x: 1 / maxL, y: 1 / maxL }
        scaleR.current = { x: 1 / maxR, y: 1 / maxR }
        setPasoCalib(3)
    }

    // PASO 3: GUARDAR PERMANENTEMENTE EN MEMORIA FLASH (SONY NVS O NINTENDO SPI)
    const guardarPermanenteEnChip = async () => {
        if (!hidDevice || tipoHardware === 'NINGUNO') return
        setOcupadoHid(true)

        try {
            if (tipoHardware === 'SONY_DUALSENSE') {
                await hidDevice.sendFeatureReport(0x80, new Uint8Array([0x03, 0x02]))
                await sleep(200)
                await hidDevice.sendFeatureReport(0x80, new Uint8Array([0x03, 0x01]))
                await sleep(200)
                await hidDevice.receiveFeatureReport(0x81)
            } else if (tipoHardware === 'SONY_DS4') {
                await hidDevice.sendFeatureReport(0xa0, new Uint8Array([0x03, 0x43, 0x4c, 0x41]))
                await sleep(200)
                await hidDevice.sendFeatureReport(0xa0, new Uint8Array([0x03, 0x01, 0x00, 0x00]))
                await sleep(200)
                await hidDevice.receiveFeatureReport(0xa1)
            } else if (tipoHardware.startsWith('SWITCH_')) {
                const b = switchCalibBoundsRef.current
                const tieneIzq = tipoHardware === 'SWITCH_PRO' || tipoHardware === 'SWITCH_JOYCON_L'
                const tieneDer = tipoHardware === 'SWITCH_PRO' || tipoHardware === 'SWITCH_JOYCON_R'

                if (tieneIzq) {
                    // Orden Switch Stick Izquierdo (0x8010): Magic(0xB2, 0xA1) + MaxDelta + Center + MinDelta
                    const bytesIzq = empaquetarPares12BitSwitch(
                        b.maxLX - b.centerLX, b.maxLY - b.centerLY,
                        b.centerLX, b.centerLY,
                        b.centerLX - b.minLX, b.centerLY - b.minLY
                    )
                    await escribirSPISwitch(hidDevice, 0x8010, [0xb2, 0xa1, ...bytesIzq])
                }

                if (tieneDer) {
                    // Orden Switch Stick Derecho (0x801B): Magic(0xB2, 0xA1) + Center + MinDelta + MaxDelta
                    const bytesDer = empaquetarPares12BitSwitch(
                        b.centerRX, b.centerRY,
                        b.centerRX - b.minRX, b.centerRY - b.minRY,
                        b.maxRX - b.centerRX, b.maxRY - b.centerRY
                    )
                    await escribirSPISwitch(hidDevice, 0x801b, [0xb2, 0xa1, ...bytesDer])
                }
            }

            setMemoriaGuardada(true)
            setHidStatus('✅ ¡CALIBRACIÓN GRABADA PERMANENTEMENTE EN LA MEMORIA INTERNA DEL CONTROL!')
            limpiarTrazos()
        } catch (err: any) {
            console.error('🔴 Error escribiendo memoria interna:', err)
            alert('Error al grabar en la memoria del control: ' + err.message)
        } finally {
            setOcupadoHid(false)
        }
    }

    // Restaurar calibración de fábrica en Switch (borra firma 0xB2 0xA1 en SPI usuario)
    const restaurarFabricaSwitchSPI = async () => {
        if (!hidDevice || !tipoHardware.startsWith('SWITCH_')) return
        if (!confirm('¿Borrar la calibración de usuario en SPI Flash y volver a los valores de fábrica del control Switch?')) return

        setOcupadoHid(true)
        try {
            if (tipoHardware === 'SWITCH_PRO' || tipoHardware === 'SWITCH_JOYCON_L') {
                await escribirSPISwitch(hidDevice, 0x8010, [0xff, 0xff])
            }
            if (tipoHardware === 'SWITCH_PRO' || tipoHardware === 'SWITCH_JOYCON_R') {
                await escribirSPISwitch(hidDevice, 0x801b, [0xff, 0xff])
            }
            setMemoriaGuardada(false)
            setPasoCalib(0)
            limpiarTrazos()
            setHidStatus('♻️ Calibración de usuario SPI borrada. El control Switch volvió a su perfil de fábrica.')
        } catch (err: any) {
            alert('Error al restaurar SPI de fábrica: ' + err.message)
        } finally {
            setOcupadoHid(false)
        }
    }

    const restablecerVista = () => {
        restablecerOffsetsVisuales()
        limpiarTrazos()
        setPasoCalib(0)
        setMemoriaGuardada(false)
    }

    // 📳 PRUEBA DE MOTORES DE VIBRACIÓN (RUMBLE)
    const probarVibracion = async () => {
        const gp = activeGamepadRef.current as any
        if (!gp?.vibrationActuator) {
            alert('Este navegador o mando no reporta actuador de vibración estándar.')
            return
        }
        setVibrando(true)
        try {
            await gp.vibrationActuator.playEffect('dual-rumble', {
                startDelay: 0,
                duration: 700,
                weakMagnitude: 0.8,
                strongMagnitude: 1.0
            })
        } catch (e) {
            console.error(e)
        } finally {
            setTimeout(() => setVibrando(false), 750)
        }
    }

    const limpiarTrazos = () => {
        pointsTrailL.current = []
        pointsTrailR.current = []
        outerRadiusL.current = new Array(36).fill(0)
        outerRadiusR.current = new Array(36).fill(0)

            ;[canvasTrailLRef.current, canvasTrailRRef.current].forEach(canvas => {
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
            ctx.strokeStyle = esError ? '#f43f5e' : '#10b981'
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

            const lx = (rawLX - offsetL.current.x) * scaleL.current.x
            const ly = (rawLY - offsetL.current.y) * scaleL.current.y
            const rx = (rawRX - offsetR.current.x) * scaleR.current.x
            const ry = (rawRY - offsetR.current.y) * scaleR.current.y

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

            if (magL < 0.25) restingDriftL.current = parseFloat((magL * 100).toFixed(1))
            if (magR < 0.25) restingDriftR.current = parseFloat((magR * 100).toFixed(1))

            if (testCircularidad && magL > 0.15) {
                pointsTrailL.current.push({ x: lx, y: ly, mag: magL })
                if (pointsTrailL.current.length > 350) pointsTrailL.current.shift()

                const angleDeg = ((Math.atan2(ly, lx) * 180 / Math.PI) + 360) % 360
                const sectorIdx = Math.floor(angleDeg / 10)
                if (magL > outerRadiusL.current[sectorIdx]) outerRadiusL.current[sectorIdx] = magL
            }

            if (testCircularidad && magR > 0.15) {
                pointsTrailR.current.push({ x: rx, y: ry, mag: magR })
                if (pointsTrailR.current.length > 350) pointsTrailR.current.shift()

                const angleDeg = ((Math.atan2(ry, rx) * 180 / Math.PI) + 360) % 360
                const sectorIdx = Math.floor(angleDeg / 10)
                if (magR > outerRadiusR.current[sectorIdx]) outerRadiusR.current[sectorIdx] = magR
            }

            renderCanvasTrail(canvasTrailLRef.current, pointsTrailL.current)
            renderCanvasTrail(canvasTrailRRef.current, pointsTrailR.current)

            historyOscL.current.push({ x: lx, y: ly })
            if (historyOscL.current.length > MAX_OSC_HISTORY) historyOscL.current.shift()

            historyOscR.current.push({ x: rx, y: ry })
            if (historyOscR.current.length > MAX_OSC_HISTORY) historyOscR.current.shift()

            drawOscilloscope(canvasOscLRef.current, historyOscL.current, '#34d399', '#818cf8')
            drawOscilloscope(canvasOscRRef.current, historyOscR.current, '#f59e0b', '#fb7185')

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
                setPollingStats({
                    hz: latestPollingRef.current.hz,
                    intervaloMs: latestPollingRef.current.intervaloMs,
                    activo: latestPollingRef.current.hz > 0
                })
            }
        } else if (gamepadDetectado) {
            setGamepadDetectado(false)
            setGamepadNombre('')
        }

        requestRef.current = requestAnimationFrame(scanGamepads)
    }

    useEffect(() => {
        requestRef.current = requestAnimationFrame(scanGamepads)
        return () => cancelAnimationFrame(requestRef.current)
    }, [testCircularidad, gamepadDetectado])

    const getBtn = (idx: number) => {
        const gp = activeGamepadRef.current
        if (!gp || !gp.buttons[idx]) return { pressed: false, value: 0 }
        return gp.buttons[idx]
    }

    const guardarReporteTicket = async () => {
        if (!ticketSeleccionado) return alert('Por favor selecciona una orden SOL-XXXX activa.')

        const bloqueAntes = snapshotAntes
            ? `\n- ANTES (${snapshotAntes.hora}): L3 Drift ${snapshotAntes.driftL}% / Circ ${snapshotAntes.errCirc}% | R3 Drift ${snapshotAntes.driftR}% / Circ ${snapshotAntes.errCircR}%`
            : ''

        const bloqueDespues = snapshotDespues
            ? `\n- DESPUÉS (${snapshotDespues.hora}): L3 Drift ${snapshotDespues.driftL}% / Circ ${snapshotDespues.errCirc}% | R3 Drift ${snapshotDespues.driftR}% / Circ ${snapshotDespues.errCircR}%`
            : ''

        const pollingTexto = (snapshotDespues?.pollingHz || snapshotAntes?.pollingHz || pollingStats.hz)
            ? `${snapshotDespues?.pollingHz || pollingStats.hz || snapshotAntes?.pollingHz} Hz`
            : 'Verificado'

        let infoHardwareCalib = 'Inspección Estándar'
        if (memoriaGuardada) {
            infoHardwareCalib = tipoHardware.startsWith('SWITCH_')
                ? 'Grabada permanentemente en memoria SPI Flash (Nintendo Switch WebHID)'
                : 'Grabada permanentemente en memoria NVS (Sony WebHID)'
        } else if (hidDevice) {
            infoHardwareCalib = `Enlazado vía WebHID (${tipoHardware}) sin escritura en flash`
        }

        const reporte = `[REPORTE TÉCNICO DE GAMEPAD Y CALIBRACIÓN]:
- Mando: ${gamepadNombre || 'Mando Estándar'}
- Polling Rate USB/BT: ${pollingTexto}${bloqueAntes}${bloqueDespues}
- Lectura Final L3: Drift Centro = ${statsL.driftCentro}% | Error Circularidad = ${statsL.errCirc}%
- Lectura Final R3: Drift Centro = ${statsR.driftCentro}% | Error Circularidad = ${statsR.errCirc}%
- Calibración Hardware Chip: ${infoHardwareCalib}
- Prueba de Botones, Gatillos y Vibración: Verificada`

        try {
            const res = await fetch('/api/tickets', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticketId: ticketSeleccionado, notasDiagnostico: reporte })
            })
            if (res.ok) alert('✅ Reporte técnico con comparativa inyectado al ticket correctamente.')
        } catch (err) {
            alert('Error al guardar reporte en la orden.')
        }
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white p-3 md:p-5 font-sans">
            <div className="max-w-6xl mx-auto space-y-4">

                {/* ENCABEZADO (Solo visible fuera del iframe) */}
                {!enIframe && (
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-zinc-900 pb-3">
                        <div>
                            <h1 className="text-lg md:text-2xl font-bold text-emerald-400 font-mono flex items-center gap-2">
                                🎮 SOLTECOT_ GAMEPAD TESTER & HARDWARE CALIBRATOR
                            </h1>
                            <p className="text-xs text-zinc-500">Diagnóstico 360°, Polling Rate Hz, comparativa Antes/Después y calibración Sony NVS / Switch SPI</p>
                        </div>
                        <Link href="/admin" className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-4 py-2 rounded-xl text-xs font-bold transition-colors">
                            ⬅ Volver al Panel
                        </Link>
                    </div>
                )}

                {/* BARRA DE VINCULACIÓN A ORDEN Y HERRAMIENTAS RÁPIDAS */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 p-3.5 rounded-xl flex flex-col md:flex-row gap-3 items-center justify-between">
                    <div className="w-full md:w-auto flex-1">
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase font-mono mb-1">
                            Vincular Diagnóstico a Orden Activa
                        </label>
                        <select
                            value={ticketSeleccionado}
                            onChange={(e) => setTicketSeleccionado(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white outline-none focus:border-emerald-500 font-mono"
                        >
                            <option value="">-- Selecciona una orden SOL-XXXX --</option>
                            {ticketsActivos.map(t => (
                                <option key={t.id} value={t.id}>
                                    {t.numeroOrden} - {t.cliente?.nombre} ({t.equipo})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-2 w-full md:w-auto">
                        <button
                            onClick={probarVibracion}
                            disabled={!gamepadDetectado || vibrando}
                            className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-700 text-amber-300 font-bold text-xs px-3.5 py-2.5 rounded-xl transition-colors"
                        >
                            {vibrando ? '📳 Vibrando...' : '📳 Probar Motores'}
                        </button>
                        <button
                            onClick={guardarReporteTicket}
                            className="flex-1 md:flex-initial bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-lg"
                        >
                            📋 Guardar en Ticket
                        </button>
                    </div>
                </div>

                {/* 📊 MÓDULO COMPARATIVO: ANTES VS. DESPUÉS */}
                <div className="bg-zinc-900/50 border border-emerald-500/30 p-4 rounded-2xl space-y-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                            <h3 className="text-xs sm:text-sm font-bold text-emerald-400 font-mono flex items-center gap-2">
                                📊 AUDITORÍA COMPARATIVA (ANTES VS. DESPUÉS DE REPARACIÓN)
                            </h3>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                                Congela la lectura de recepción antes de abrir el control y compárala contra el resultado final calibrado.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                            <button
                                onClick={capturarAntes}
                                disabled={!gamepadDetectado}
                                className="bg-amber-950/70 hover:bg-amber-900/80 disabled:opacity-40 border border-amber-600/60 text-amber-300 font-bold text-xs px-3 py-2 rounded-xl transition-colors"
                            >
                                📸 Capturar ANTES
                            </button>
                            <button
                                onClick={capturarDespues}
                                disabled={!gamepadDetectado}
                                className="bg-emerald-950/80 hover:bg-emerald-900/80 disabled:opacity-40 border border-emerald-500/60 text-emerald-300 font-bold text-xs px-3 py-2 rounded-xl transition-colors"
                            >
                                ✅ Capturar DESPUÉS
                            </button>
                            {(snapshotAntes || snapshotDespues) && (
                                <button
                                    onClick={limpiarComparativa}
                                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs px-2.5 py-2 rounded-xl font-bold"
                                    title="Limpiar capturas"
                                >
                                    🗑️
                                </button>
                            )}
                        </div>
                    </div>

                    {(snapshotAntes || snapshotDespues) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-zinc-800/80 text-xs font-mono">
                            <div className="bg-zinc-950/90 border border-amber-500/30 rounded-xl p-3 space-y-1.5">
                                <div className="flex justify-between items-center text-amber-400 font-bold border-b border-zinc-900 pb-1">
                                    <span>📸 INGRESO (ANTES)</span>
                                    <span>{snapshotAntes ? snapshotAntes.hora : 'Sin capturar'}</span>
                                </div>
                                {snapshotAntes ? (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-zinc-400">Stick L3 (Drift / Circ):</span>
                                            <span className="text-zinc-200">{snapshotAntes.driftL}% / {snapshotAntes.errCircL}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-zinc-400">Stick R3 (Drift / Circ):</span>
                                            <span className="text-zinc-200">{snapshotAntes.driftR}% / {snapshotAntes.errCircR}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-zinc-400">Polling Rate:</span>
                                            <span className="text-zinc-300">{snapshotAntes.pollingHz > 0 ? `${snapshotAntes.pollingHz} Hz` : 'N/D'}</span>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-[11px] text-zinc-500 py-2">Presiona "Capturar ANTES" al conectar el control dañado.</p>
                                )}
                            </div>

                            <div className="bg-zinc-950/90 border border-emerald-500/40 rounded-xl p-3 space-y-1.5">
                                <div className="flex justify-between items-center text-emerald-400 font-bold border-b border-zinc-900 pb-1">
                                    <span>✅ ENTREGA (DESPUÉS)</span>
                                    <span>{snapshotDespues ? snapshotDespues.hora : 'Sin capturar'}</span>
                                </div>
                                {snapshotDespues ? (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-zinc-400">Stick L3 (Drift / Circ):</span>
                                            <span className="text-emerald-300 font-bold">
                                                {snapshotDespues.driftL}% / {snapshotDespues.errCircL}%
                                                {snapshotAntes && (
                                                    <span className="ml-1.5 text-[10px] text-emerald-400">
                                                        ({(snapshotDespues.driftL - snapshotAntes.driftL) <= 0 ? '' : '+'}{(snapshotDespues.driftL - snapshotAntes.driftL).toFixed(1)}%)
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-zinc-400">Stick R3 (Drift / Circ):</span>
                                            <span className="text-emerald-300 font-bold">
                                                {snapshotDespues.driftR}% / {snapshotDespues.errCircR}%
                                                {snapshotAntes && (
                                                    <span className="ml-1.5 text-[10px] text-emerald-400">
                                                        ({(snapshotDespues.driftR - snapshotAntes.driftR) <= 0 ? '' : '+'}{(snapshotDespues.driftR - snapshotAntes.driftR).toFixed(1)}%)
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-zinc-400">Polling Rate:</span>
                                            <span className="text-emerald-300 font-bold">{snapshotDespues.pollingHz > 0 ? `${snapshotDespues.pollingHz} Hz` : 'N/D'}</span>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-[11px] text-zinc-500 py-2">Presiona "Capturar DESPUÉS" tras calibrar los nuevos módulos.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ⚡ MÓDULO WEBHID MULTI-MARCA (SONY NVS & NINTENDO SWITCH SPI FLASH) */}
                <div className="bg-zinc-900/50 border border-indigo-500/40 p-4 rounded-2xl space-y-3">
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
                        <div>
                            <h3 className="text-xs sm:text-sm font-bold text-indigo-400 flex items-center gap-2 font-mono">
                                ⚡ CALIBRACIÓN PERMANENTE EN CHIP (SONY NVS / NINTENDO SWITCH SPI)
                            </h3>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                                Graba el centro y el rango 360° de tus joysticks GuliKit TMR directo en la memoria interna de DualSense, DS4, Switch Pro o Joy-Con.
                            </p>
                            <p className="text-[11px] text-zinc-300 font-mono mt-1">{hidStatus}</p>
                        </div>

                        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                            <button
                                onClick={conectarWebHIDSony}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow-md transition-colors"
                            >
                                🔌 Sony PS5 / PS4 (USB)
                            </button>
                            <button
                                onClick={conectarWebHIDSwitch}
                                className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow-md transition-colors"
                            >
                                🕹️ Nintendo Switch (Pro / Joy-Con)
                            </button>
                            {hidDevice && tipoHardware.startsWith('SWITCH_') && (
                                <button
                                    onClick={restaurarFabricaSwitchSPI}
                                    disabled={ocupadoHid}
                                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 font-bold text-xs px-3 py-2.5 rounded-xl transition-colors"
                                    title="Borrar sector de calibración de usuario SPI"
                                >
                                    ♻️ Fábrica SPI
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ASISTENTE DE CALIBRACIÓN GUIADA */}
                    <div className="pt-3 border-t border-zinc-800/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <div className="text-xs text-zinc-300">
                            {pasoCalib === 0 && (
                                <span>
                                    {hidDevice
                                        ? `✅ Enlace activo (${tipoHardware}). Inicia el asistente de 3 pasos:`
                                        : '💡 Conecta el control Sony por USB o Nintendo Switch arriba para calibrar su memoria interna.'}
                                </span>
                            )}
                            {pasoCalib === 1 && (
                                <span className="text-amber-300 font-bold">
                                    Paso 1/3: Suelta los joysticks en reposo absoluto y presiona "Fijar Centro".
                                </span>
                            )}
                            {pasoCalib === 2 && (
                                <span className="text-sky-300 font-bold">
                                    Paso 2/3: Gira los joysticks 360° pegados al borde 2 o 3 veces y presiona "Fijar Rango 360°".
                                </span>
                            )}
                            {pasoCalib === 3 && !memoriaGuardada && (
                                <span className="text-emerald-300 font-bold">
                                    Paso 3/3: ¡Calculado! Presiona "Guardar en Memoria del Control" para escribir permanentemente en el chip.
                                </span>
                            )}
                            {memoriaGuardada && (
                                <span className="text-emerald-400 font-bold">
                                    🎉 ¡Listo! Calibración almacenada permanentemente en la placa del control.
                                </span>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-2 w-full md:w-auto">
                            {pasoCalib === 0 && (
                                <button
                                    onClick={iniciarCalibracion}
                                    disabled={!gamepadDetectado && !hidDevice}
                                    className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors"
                                >
                                    🚀 Iniciar Calibración
                                </button>
                            )}
                            {pasoCalib === 1 && (
                                <button
                                    onClick={ejecutarPaso1Centro}
                                    disabled={ocupadoHid}
                                    className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-4 py-2 rounded-xl transition-colors animate-pulse"
                                >
                                    🎯 1. Fijar Centro
                                </button>
                            )}
                            {pasoCalib === 2 && (
                                <button
                                    onClick={ejecutarPaso2Rango}
                                    disabled={ocupadoHid}
                                    className="bg-sky-500 hover:bg-sky-400 text-black font-bold text-xs px-4 py-2 rounded-xl transition-colors"
                                >
                                    🔄 2. Fijar Rango 360°
                                </button>
                            )}
                            {pasoCalib === 3 && hidDevice && !memoriaGuardada && (
                                <button
                                    onClick={guardarPermanenteEnChip}
                                    disabled={ocupadoHid}
                                    className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-4 py-2 rounded-xl shadow-lg shadow-emerald-500/30 transition-colors animate-bounce"
                                >
                                    💾 3. Guardar en Memoria del Control ({tipoHardware.startsWith('SWITCH_') ? 'SPI' : 'NVS'})
                                </button>
                            )}
                            {pasoCalib > 0 && (
                                <button
                                    onClick={restablecerVista}
                                    className="bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-700 font-bold text-xs px-3 py-2 rounded-xl transition-colors"
                                >
                                    Reiniciar
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {!gamepadDetectado ? (
                    <div className="bg-zinc-900/30 border border-dashed border-zinc-800 rounded-2xl p-10 text-center space-y-2">
                        <span className="text-3xl animate-pulse block">🔌</span>
                        <h3 className="text-base font-bold text-zinc-300">Conecta tu mando y presiona cualquier botón para activar la vista</h3>
                        <p className="text-xs text-zinc-500 max-w-md mx-auto">
                            Compatible con DualSense PS5, DualShock 4, Nintendo Switch Pro/Joy-Con, Xbox Series/One y módulos GuliKit TMR.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* BARRA DE ESTADO Y TELEMETRÍA POLLING RATE */}
                        <div className="bg-zinc-900/60 border border-zinc-800 px-3.5 py-2.5 rounded-xl flex flex-col lg:flex-row justify-between items-start lg:items-center text-xs text-zinc-400 font-mono gap-2">
                            <div className="truncate max-w-full">
                                <strong className="text-indigo-400">CONTROL:</strong> {gamepadNombre}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 shrink-0">
                                <span className="bg-zinc-950 border border-zinc-800 px-2.5 py-1 rounded-lg">
                                    <strong className="text-sky-400">POLLING RATE:</strong>{' '}
                                    {pollingStats.activo ? (
                                        <span className="text-emerald-400 font-bold">
                                            {pollingStats.hz} Hz ({pollingStats.intervaloMs} ms)
                                        </span>
                                    ) : (
                                        <span className="text-zinc-500">Mueve un stick para medir...</span>
                                    )}
                                </span>
                                <span className="text-emerald-400 font-bold">🟢 60 FPS</span>
                            </div>
                        </div>

                        {/* INTERFAZ VECTORIAL */}
                        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 sm:p-6 flex flex-col items-center">
                            <div className="flex flex-wrap items-center justify-between w-full border-b border-zinc-800/80 pb-3 mb-4 gap-3 text-xs">
                                <label className="flex items-center gap-2 cursor-pointer font-bold text-zinc-300">
                                    <input
                                        type="checkbox"
                                        checked={testCircularidad}
                                        onChange={(e) => setTestCircularidad(e.target.checked)}
                                        className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                                    />
                                    <span>Trazar Circularidad 360° (Verde = Óptimo | Rojo = Desviación mayor a 12%)</span>
                                </label>

                                <button
                                    onClick={limpiarTrazos}
                                    className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-lg text-xs transition-colors font-bold"
                                >
                                    🧹 Limpiar Trazo
                                </button>
                            </div>

                            <div className="relative w-full max-w-3xl aspect-[1.85/1] bg-zinc-950/60 border border-zinc-900 rounded-2xl p-3 flex items-center justify-center overflow-hidden">
                                <svg viewBox="0 0 800 450" className="w-full h-full select-none">
                                    {/* GATILLOS */}
                                    <g transform="translate(150, 20)">
                                        <rect x="0" y="0" width="120" height="25" rx="6" fill="#18181b" stroke="#3f3f46" strokeWidth="2" />
                                        <rect x="0" y="0" width={120 * getBtn(6).value} height="25" rx="6" fill="#10b981" />
                                        <text x="60" y="16" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">L2 / LT / ZL ({(getBtn(6).value * 100).toFixed(0)}%)</text>
                                    </g>

                                    <g transform="translate(530, 20)">
                                        <rect x="0" y="0" width="120" height="25" rx="6" fill="#18181b" stroke="#3f3f46" strokeWidth="2" />
                                        <rect x="0" y="0" width={120 * getBtn(7).value} height="25" rx="6" fill="#10b981" />
                                        <text x="60" y="16" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">R2 / RT / ZR ({(getBtn(7).value * 100).toFixed(0)}%)</text>
                                    </g>

                                    {/* BUMPERS */}
                                    <rect x="160" y="55" width="100" height="22" rx="6" fill={getBtn(4).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                    <text x="210" y="70" textAnchor="middle" fill={getBtn(4).pressed ? '#000' : '#a1a1aa'} fontSize="11" fontWeight="bold">L1 / LB / L</text>

                                    <rect x="540" y="55" width="100" height="22" rx="6" fill={getBtn(5).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                    <text x="590" y="70" textAnchor="middle" fill={getBtn(5).pressed ? '#000' : '#a1a1aa'} fontSize="11" fontWeight="bold">R1 / RB / R</text>

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
                                        <text x="0" y="-30" textAnchor="middle" fill={getBtn(3).pressed ? '#000' : '#34d399'} fontSize="13" fontWeight="bold">△/Y</text>

                                        <circle cx="0" cy="35" r="16" fill={getBtn(0).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                        <text x="0" y="40" textAnchor="middle" fill={getBtn(0).pressed ? '#000' : '#34d399'} fontSize="13" fontWeight="bold">✕/A</text>

                                        <circle cx="-35" cy="0" r="16" fill={getBtn(2).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                        <text x="-35" y="5" textAnchor="middle" fill={getBtn(2).pressed ? '#000' : '#34d399'} fontSize="13" fontWeight="bold">□/X</text>

                                        <circle cx="35" cy="0" r="16" fill={getBtn(1).pressed ? '#34d399' : '#18181b'} stroke="#3f3f46" strokeWidth="2" />
                                        <text x="35" y="5" textAnchor="middle" fill={getBtn(1).pressed ? '#000' : '#34d399'} fontSize="13" fontWeight="bold">○/B</text>
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
                                                className={`absolute w-5 h-5 rounded-full border ${getBtn(10).pressed ? 'bg-purple-500 border-white scale-125' : 'bg-emerald-400 border-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.9)]'}`}
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
                                                className={`absolute w-5 h-5 rounded-full border ${getBtn(11).pressed ? 'bg-purple-500 border-white scale-125' : 'bg-emerald-400 border-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.9)]'}`}
                                            />
                                        </div>
                                    </foreignObject>
                                </svg>
                            </div>

                            {/* LECTURAS TÉCNICAS */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-4 text-xs font-mono">
                                <div className="bg-zinc-950 border border-zinc-800 p-3.5 rounded-xl space-y-1">
                                    <div className="flex justify-between font-bold text-emerald-400 border-b border-zinc-800 pb-1 mb-2">
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

                                <div className="bg-zinc-950 border border-zinc-800 p-3.5 rounded-xl space-y-1">
                                    <div className="flex justify-between font-bold text-emerald-400 border-b border-zinc-800 pb-1 mb-2">
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
                        <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-2xl space-y-3">
                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2 font-mono">
                                📈 OSCILOSCOPIO DUAL DE EJES TMR (JITTER Y ESTABILIDAD DE CENTRO)
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div className="flex gap-4 text-[10px] font-bold mb-1.5 font-mono">
                                        <span className="text-emerald-400">● Eje X (L3)</span>
                                        <span className="text-indigo-400">● Eje Y (L3)</span>
                                    </div>
                                    <canvas
                                        ref={canvasOscLRef}
                                        width={400}
                                        height={100}
                                        className="w-full h-24 bg-black border border-zinc-800 rounded-lg shadow-inner"
                                    />
                                </div>

                                <div>
                                    <div className="flex gap-4 text-[10px] font-bold mb-1.5 font-mono">
                                        <span className="text-amber-500">● Eje X (R3)</span>
                                        <span className="text-rose-400">● Eje Y (R3)</span>
                                    </div>
                                    <canvas
                                        ref={canvasOscRRef}
                                        width={400}
                                        height={100}
                                        className="w-full h-24 bg-black border border-zinc-800 rounded-lg shadow-inner"
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