'use client'

import { useState, useRef } from 'react'
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
    const [fotos, setFotos] = useState<File[]>([])
    const [cargando, setCargando] = useState(false)
    const [mensajeExito, setMensajeExito] = useState('')
    const [error, setError] = useState('')

    const fileInputRef = useRef<HTMLInputElement>(null)

    // 🗜️ Helper: Comprime imágenes en el navegador antes de subir
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
            let fileIds: string[] = []

            if (fotos.length > 0) {
                // 1️⃣ Comprimir todas las fotos en paralelo antes de subir
                const fotosComprimidas = await Promise.all(
                    fotos.map((f) => comprimirImagen(f))
                )

                const formData = new FormData()
                fotosComprimidas.forEach((f) => formData.append('files', f))
                formData.append('folio', `TEL_${form.telefono}`)

                const resFotos = await fetch('/api/upload-evidencia', {
                    method: 'POST',
                    body: formData,
                })
                const dataFotos = await resFotos.json()

                if (!resFotos.ok) {
                    throw new Error(dataFotos.error || 'Error al subir las fotos a Drive')
                }

                fileIds = dataFotos.fileIds
            }

            // 2️⃣ Crear la orden
            const payload = {
                ...form,
                fotosIngreso: fileIds,
            }

            const res = await fetch('/api/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const data = await res.json()

            if (!res.ok) throw new Error(data.error || 'Error al procesar el ingreso')

            setMensajeExito(`¡Orden generada con éxito! Folio asignado: ${data.ticket.numeroOrden}`)
            setForm({
                telefono: '',
                nombre: '',
                equipo: '',
                fallaReportada: '',
                costoEstimado: '',
                notasInternas: '',
            })
            setFotos([])
        } catch (err: any) {
            setError(err.message)
        } finally {
            setCargando(false)
        }
    }

    return (
        <div className="min-h-screen bg-black text-white p-8 flex flex-col items-center justify-center">
            <div className="w-full max-w-lg bg-zinc-950 border border-zinc-900 rounded-xl p-8 shadow-2xl">
                {/* ENCABEZADO */}
                <div className="flex justify-between items-start border-b border-zinc-900 pb-4 mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-emerald-400">SOLTECOT_ INTERNAL</h2>
                        <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-0.5">Recepción de Equipos</p>
                    </div>
                    <Link
                        href="/admin"
                        className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-bold px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-1.5"
                    >
                        ⬅ Volver
                    </Link>
                </div>

                <form onSubmit={manejarEnvio} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Teléfono del Cliente (Obligatorio)</label>
                        <input
                            type="text"
                            required
                            placeholder="Ej: 5510203040"
                            value={form.telefono}
                            onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Nombre Completo</label>
                        <input
                            type="text"
                            placeholder="Ej: Julio López"
                            value={form.nombre}
                            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Equipo / Dispositivo (Obligatorio)</label>
                        <input
                            type="text"
                            required
                            placeholder="Ej: PlayStation 5 Slim o Laptop Dell Inspiron"
                            value={form.equipo}
                            onChange={(e) => setForm({ ...form, equipo: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Falla Reportada por el Cliente (Obligatorio)</label>
                        <textarea
                            required
                            rows={2}
                            placeholder="Ej: Se apaga a los 10 minutos por sobrecalentamiento"
                            value={form.fallaReportada}
                            onChange={(e) => setForm({ ...form, fallaReportada: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Costo Estimado ($)</label>
                            <input
                                type="number"
                                placeholder="Ej: 1200"
                                value={form.costoEstimado}
                                onChange={(e) => setForm({ ...form, costoEstimado: e.target.value })}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Estatus Inicial</label>
                            <div className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-emerald-400 font-bold border-dashed border-emerald-900 text-center">
                                🛠️ RECIBIDO
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase">Notas Técnicas / Diagnóstico Interno</label>
                        <textarea
                            rows={2}
                            placeholder="Detalles ocultos para el taller (Ej: Trae sello de garantía roto)"
                            value={form.notasInternas}
                            onChange={(e) => setForm({ ...form, notasInternas: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors resize-none"
                        />
                    </div>

                    {/* 📸 SECCIÓN DE EVIDENCIA FOTOGRÁFICA */}
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
                            className="w-full border-2 border-dashed border-zinc-800 hover:border-emerald-500 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-semibold py-3 rounded text-sm transition-colors flex justify-center items-center gap-2"
                        >
                            📷 Tomar / Subir Foto
                        </button>

                        {fotos.length > 0 && (
                            <div className="flex gap-3 mt-3 overflow-x-auto pb-2">
                                {fotos.map((foto, index) => (
                                    <div key={index} className="relative flex-shrink-0 w-16 h-16 rounded border border-zinc-700 overflow-hidden group">
                                        <Image
                                            src={URL.createObjectURL(foto)}
                                            alt={`Evidencia ${index}`}
                                            fill
                                            className="object-cover"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => eliminarFoto(index)}
                                            className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs font-bold"
                                        >
                                            ❌
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={cargando}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded text-sm transition-colors mt-4 disabled:opacity-50"
                    >
                        {cargando ? 'Guardando Orden y Subiendo Fotos...' : '🚀 Dar Entrada e Imprimir Orden'}
                    </button>
                </form>

                {error && <p className="text-center text-rose-500 text-sm font-semibold mt-4">⚠️ {error}</p>}
                {mensajeExito && <p className="text-center text-emerald-400 text-sm font-semibold mt-4">✅ {mensajeExito}</p>}
            </div>
        </div>
    )
}