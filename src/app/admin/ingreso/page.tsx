'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function RegistroOrdenAdmin() {
    const [form, setForm] = useState({
        telefono: '',
        nombre: '',
        equipo: '',
        fallaReportada: '',
        costoEstimado: '',
        notasInternas: ''
    })

    const [buscandoCliente, setBuscandoCliente] = useState(false)
    const [clienteRegistradoPrevio, setClienteRegistradoPrevio] = useState(false)

    const [fotos, setFotos] = useState<File[]>([])
    const [previews, setPreviews] = useState<string[]>([])
    const [cargando, setCargando] = useState(false)
    const [mensajeExito, setMensajeExito] = useState('')
    const [error, setError] = useState('')

    const fileInputRef = useRef<HTMLInputElement>(null)

    // 🔍 AUTOCOMPLETADO DE CLIENTE POR TELÉFONO
    const buscarClienteExistente = async (telefonoRaw: string) => {
        const clean = telefonoRaw.replace(/[^0-9]/g, '').slice(-10)
        if (clean.length < 10) return

        setBuscandoCliente(true)
        try {
            const res = await fetch(`/api/admin/mensajes?telefono=${clean}`)
            const data = await res.json()

            if (res.ok && data.cliente) {
                const nombreBd = data.cliente.nombre
                if (nombreBd && nombreBd !== 'Cliente WhatsApp' && nombreBd !== 'Desconocido') {
                    setForm((prev) => ({ ...prev, nombre: nombreBd }))
                    setClienteRegistradoPrevio(true)
                }
            }
        } catch (err) {
            console.error("Error al buscar cliente previo:", err)
        } finally {
            setBuscandoCliente(false)
        }
    }

    const manejarCambioTelefono = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setForm({ ...form, telefono: val })
        setClienteRegistradoPrevio(false)

        const clean = val.replace(/[^0-9]/g, '').slice(-10)
        if (clean.length === 10) {
            buscarClienteExistente(clean)
        }
    }

    // 🖼️ GESTIÓN DE PREVIEWS Y LIMPIEZA DE MEMORIA
    useEffect(() => {
        if (fotos.length === 0) {
            setPreviews([])
            return
        }

        const objectUrls = fotos.map((f) => URL.createObjectURL(f))
        setPreviews(objectUrls)

        // Limpieza de objetos de memoria al desmontar/cambiar
        return () => {
            objectUrls.forEach((url) => URL.revokeObjectURL(url))
        }
    }, [fotos])

    // 🗜️ COMPRESIÓN DE IMÁGENES VÍA CANVAS (1280px / 0.75 JPEG)
    const comprimirImagen = (archivo: File): Promise<File> => {
        return new Promise((resolve) => {
            const reader = new FileReader()
            reader.readAsDataURL(archivo)
            reader.onload = (event) => {
                const img = new window.Image()
                img.src = event.target?.result as string
                img.onload = () => {
                    const canvas = document.createElement('canvas')
                    const MAX_ANCHO = 1280
                    const escala = MAX_ANCHO / img.width
                    const ancho = img.width > MAX_ANCHO ? MAX_ANCHO : img.width
                    const alto = img.width > MAX_ANCHO ? img.height * escala : img.height

                    canvas.width = ancho
                    canvas.height = alto

                    const ctx = canvas.getContext('2d')
                    ctx?.drawImage(img, 0, 0, ancho, alto)

                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                const fotoComprimida = new File([blob], archivo.name, {
                                    type: 'image/jpeg',
                                    lastModified: Date.now(),
                                })
                                resolve(fotoComprimida)
                            } else {
                                resolve(archivo)
                            }
                        },
                        'image/jpeg',
                        0.75
                    )
                }
                img.onerror = () => resolve(archivo)
            }
            reader.onerror = () => resolve(archivo)
        })
    }

    const manejarSeleccionFotos = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const archivosArray = Array.from(e.target.files)
            setFotos((prev) => [...prev, ...archivosArray])
        }
    }

    const eliminarFoto = (index: number) => {
        setFotos((prev) => prev.filter((_, i) => i !== index))
    }

    const manejarEnvio = async (e: React.FormEvent) => {
        e.preventDefault()
        setCargando(true)
        setError('')
        setMensajeExito('')

        try {
            const telefonoLimpio = form.telefono.replace(/[^0-9]/g, '').slice(-10)
            if (telefonoLimpio.length < 10) {
                throw new Error('El número de teléfono debe contener al menos 10 dígitos válidos.')
            }

            // 1️⃣ Comprimir fotos en cliente
            const fotosComprimidas = await Promise.all(
                fotos.map((f) => comprimirImagen(f))
            )

            // 2️⃣ Construcción de FormData
            const formData = new FormData()
            formData.append('telefono', telefonoLimpio)
            formData.append('nombre', form.nombre)
            formData.append('equipo', form.equipo)
            formData.append('fallaReportada', form.fallaReportada)
            formData.append('costoEstimado', form.costoEstimado)
            formData.append('notasInternas', form.notasInternas)

            fotosComprimidas.forEach((f) => {
                formData.append('files', f)
            })

            // 3️⃣ Envío atómico
            const res = await fetch('/api/tickets', {
                method: 'POST',
                body: formData,
            })

            const data = await res.json()

            if (!res.ok) throw new Error(data.error || 'Error al procesar el ingreso')

            setMensajeExito(`¡Orden generada con éxito y notificación enviada! Folio: ${data.ticket.numeroOrden}`)
            setForm({
                telefono: '',
                nombre: '',
                equipo: '',
                fallaReportada: '',
                costoEstimado: '',
                notasInternas: '',
            })
            setFotos([])
            setClienteRegistradoPrevio(false)

        } catch (err: any) {
            setError(err.message)
        } finally {
            setCargando(false)
        }
    }

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-8 flex flex-col items-center justify-center font-sans">
            <div className="w-full max-w-lg bg-zinc-950 border border-zinc-900 rounded-2xl p-6 md:p-8 shadow-2xl">

                {/* ENCABEZADO */}
                <div className="flex justify-between items-start border-b border-zinc-900 pb-4 mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-emerald-400 font-mono">SOLTECOT_ RECEPCIÓN</h2>
                        <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-0.5">Ingreso de Equipos a Laboratorio</p>
                    </div>
                    <Link
                        href="/admin"
                        className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5"
                    >
                        <span>⬅</span> <span>Volver</span>
                    </Link>
                </div>

                <form onSubmit={manejarEnvio} className="space-y-4">

                    {/* TELÉFONO CON BÚSQUEDA EN TIEMPO REAL */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-semibold text-zinc-400 uppercase">Teléfono del Cliente *</label>
                            {buscandoCliente && <span className="text-[10px] text-emerald-400 font-mono animate-pulse">🔍 Buscando en DB...</span>}
                            {clienteRegistradoPrevio && <span className="text-[10px] text-purple-400 font-bold font-mono">✅ Cliente Registrado</span>}
                        </div>
                        <input
                            type="tel"
                            inputMode="tel"
                            required
                            placeholder="10 dígitos (Ej: 5510203040)"
                            value={form.telefono}
                            onChange={manejarCambioTelefono}
                            onBlur={() => buscarClienteExistente(form.telefono)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-base text-white outline-none focus:border-emerald-500 transition-colors font-mono"
                        />
                    </div>

                    {/* NOMBRE COMPLETO */}
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Nombre Completo</label>
                        <input
                            type="text"
                            placeholder="Ej: Julio López"
                            value={form.nombre}
                            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    {/* EQUIPO / DISPOSITIVO */}
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Equipo / Dispositivo *</label>
                        <input
                            type="text"
                            required
                            placeholder="Ej: PlayStation 5 Slim o Laptop Dell Inspiron"
                            value={form.equipo}
                            onChange={(e) => setForm({ ...form, equipo: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    {/* FALLA REPORTADA */}
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Falla Reportada por el Cliente *</label>
                        <textarea
                            required
                            rows={2}
                            placeholder="Ej: Drift en joystick izquierdo o sobrecalentamiento"
                            value={form.fallaReportada}
                            onChange={(e) => setForm({ ...form, fallaReportada: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors resize-none"
                        />
                    </div>

                    {/* COSTO ESTIMADO Y ESTATUS */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Costo Estimado ($)</label>
                            <input
                                type="number"
                                inputMode="decimal"
                                placeholder="Ej: 1200"
                                value={form.costoEstimado}
                                onChange={(e) => setForm({ ...form, costoEstimado: e.target.value })}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-sm text-amber-400 font-mono font-bold outline-none focus:border-emerald-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Estatus Inicial</label>
                            <div className="w-full bg-zinc-900 border border-dashed border-emerald-800/80 rounded-xl p-2.5 text-xs text-emerald-400 font-bold text-center font-mono">
                                🛠️ RECIBIDO
                            </div>
                        </div>
                    </div>

                    {/* NOTAS INTERNAS */}
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Notas Técnicas / Diagnóstico Interno</label>
                        <textarea
                            rows={2}
                            placeholder="Detalles ocultos para el taller (Ej: Sello roto, rayón en carcasa)"
                            value={form.notasInternas}
                            onChange={(e) => setForm({ ...form, notasInternas: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors resize-none"
                        />
                    </div>

                    {/* 📸 EVIDENCIA FOTOGRÁFICA DE INGRESO */}
                    <div className="pt-2 border-t border-zinc-900">
                        <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase">Evidencia Fotográfica de Ingreso</label>

                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            capture="environment"
                            ref={fileInputRef}
                            onChange={manejarSeleccionFotos}
                            className="hidden"
                        />

                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full border-2 border-dashed border-zinc-800 hover:border-emerald-500 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 font-semibold py-3 rounded-xl text-xs transition-colors flex justify-center items-center gap-2"
                        >
                            📷 Tomar / Subir Foto de Evidencia
                        </button>

                        {previews.length > 0 && (
                            <div className="flex gap-2 mt-3 overflow-x-auto pb-2 hide-scrollbar">
                                {previews.map((src, index) => (
                                    <div key={index} className="relative flex-shrink-0 w-16 h-16 rounded-xl border border-zinc-800 overflow-hidden group">
                                        <Image
                                            src={src}
                                            alt={`Evidencia ${index + 1}`}
                                            fill
                                            unoptimized
                                            className="object-cover"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => eliminarFoto(index)}
                                            className="absolute inset-0 bg-black/70 text-rose-400 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs font-bold"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={cargando}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-sm transition-colors mt-4 disabled:opacity-50 shadow-lg"
                    >
                        {cargando ? 'Guardando Orden y Subiendo Fotos...' : '🚀 Dar Entrada e Iniciar Orden'}
                    </button>
                </form>

                {error && <p className="text-center text-rose-400 text-xs font-semibold mt-4">⚠️ {error}</p>}
                {mensajeExito && <p className="text-center text-emerald-400 text-xs font-semibold mt-4 font-mono">✅ {mensajeExito}</p>}
            </div>
        </div>
    )
}