'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'

function FormularioLogin() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const callbackUrl = searchParams.get('callbackUrl') || '/admin'

    const [usuario, setUsuario] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [cargando, setCargando] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setCargando(true)

        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario, password }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Credenciales incorrectas')
            }

            // Redirección exitosa respetando el callbackUrl
            router.push(callbackUrl)
            router.refresh()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setCargando(false)
        }
    }

    return (
        <div className="w-full max-w-md p-8 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl space-y-6 font-sans">
            <div className="text-center space-y-2">
                <div className="relative w-48 h-16 mx-auto">
                    <Image
                        src="/logo-soltecot.png"
                        alt="SOLTECOT Logo"
                        fill
                        className="object-contain"
                        priority
                    />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">Acceso Administrativo</h2>
                <p className="text-xs text-zinc-500 font-mono">SOLTECOT_ OS v2 • Control Center</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1 font-mono uppercase">
                        Usuario
                    </label>
                    <input
                        type="text"
                        required
                        value={usuario}
                        onChange={(e) => setUsuario(e.target.value)}
                        placeholder="Ingresa tu usuario"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1 font-mono uppercase">
                        Contraseña
                    </label>
                    <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                    />
                </div>

                {error && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 text-center font-medium">
                        ⚠️ {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={cargando}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 active:scale-95"
                >
                    {cargando ? 'Verificando firmas...' : 'Iniciar Sesión 🔐'}
                </button>
            </form>
        </div>
    )
}

export default function LoginPage() {
    return (
        <main className="min-h-screen bg-black flex items-center justify-center p-4">
            <Suspense fallback={
                <div className="text-xs text-zinc-500 font-mono animate-pulse">
                    Cargando módulo de acceso seguro...
                </div>
            }>
                <FormularioLogin />
            </Suspense>
        </main>
    )
}