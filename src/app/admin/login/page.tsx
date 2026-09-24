'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'

export default function AdminLogin() {
    const [usuario, setUsuario] = useState('')
    const [password, setPassword] = useState('')
    const [cargando, setCargando] = useState(false)
    const [error, setError] = useState('')

    const router = useRouter()
    const searchParams = useSearchParams()
    const callbackUrl = searchParams.get('callbackUrl') || '/admin'

    // Precargar un estado inicial limpio en caso de haber un error residual
    useEffect(() => {
        setError('')
    }, [usuario, password])

    const manejarLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setCargando(true)
        setError('')

        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario, password })
            })
            const data = await res.json()

            if (!res.ok) throw new Error(data.error || 'Credenciales inválidas')

            // 🔓 Si es correcto, el middleware nos dejará pasar y nos manda a la ruta solicitada
            router.push(callbackUrl)
            router.refresh()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setCargando(false)
        }
    }

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-2xl p-8 shadow-2xl relative overflow-hidden">

                {/* Elemento de diseño sutil de fondo */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <div className="flex flex-col items-center mb-6 relative z-10">
                    <div className="relative w-48 h-12 mb-3">
                        <Image
                            src="/logo-soltecot.png"
                            alt="Soltecot Logo"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                    <p className="text-zinc-500 text-[9px] text-center uppercase tracking-[0.2em] font-bold">
                        Área Restringida para Personal Técnico
                    </p>
                </div>

                <form onSubmit={manejarLogin} className="space-y-4 relative z-10">
                    <div>
                        <label className="block text-[10px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">
                            Usuario Administrador
                        </label>
                        <input
                            type="text"
                            required
                            autoComplete="username"
                            value={usuario}
                            onChange={(e) => setUsuario(e.target.value)}
                            className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 text-sm text-emerald-400 font-mono outline-none focus:border-emerald-500 focus:bg-zinc-900 transition-all"
                            placeholder="Ej. admin"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">
                            Contraseña de Acceso
                        </label>
                        <input
                            type="password"
                            required
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 text-sm text-white font-mono outline-none focus:border-emerald-500 focus:bg-zinc-900 transition-all tracking-widest"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={cargando}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-sm transition-all mt-4 disabled:opacity-50 shadow-lg shadow-emerald-900/20 active:scale-[0.98]"
                    >
                        {cargando ? 'Verificando Credenciales...' : 'Iniciar Sesión Segura'}
                    </button>
                </form>

                {error && (
                    <div className="mt-4 p-3 bg-rose-950/30 border border-rose-900/50 rounded-lg text-center animate-fade-in relative z-10">
                        <p className="text-rose-400 text-[11px] font-bold">{error}</p>
                    </div>
                )}
            </div>

            <div className="mt-8 text-center text-zinc-600 text-[10px] font-mono">
                <p>SOLTECOT_ OS v2.0</p>
                <p>Conexión cifrada a servidor central</p>
            </div>
        </div>
    )
}