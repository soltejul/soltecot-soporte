'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
    const [usuario, setUsuario] = useState('')
    const [password, setPassword] = useState('')
    const [cargando, setCargando] = useState(false)
    const [error, setError] = useState('')
    const router = useRouter()

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

            // 🔓 Si es correcto, el middleware nos dejará pasar a la zona de ingreso
            router.push('/admin/ingreso')
            router.refresh()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setCargando(false)
        }
    }

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-xl p-8 shadow-2xl">
                <h2 className="text-xl font-bold text-center mb-1 text-emerald-400">SOLTECOT_ SECURE</h2>
                <p className="text-zinc-600 text-[10px] text-center mb-6 uppercase tracking-widest">Área Restringida para Personal Técnico</p>

                <form onSubmit={manejarLogin} className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-semibold text-zinc-400 mb-1 uppercase tracking-wider">Usuario Administrador</label>
                        <input
                            type="text"
                            required
                            value={usuario}
                            onChange={(e) => setUsuario(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-semibold text-zinc-400 mb-1 uppercase tracking-wider">Contraseña</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={cargando}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded text-sm transition-colors mt-2 disabled:opacity-50"
                    >
                        {cargando ? 'Autenticando...' : '🔒 Iniciar Sesión'}
                    </button>
                </form>

                {error && <p className="text-center text-rose-500 text-xs font-semibold mt-4">⚠️ {error}</p>}
            </div>
        </div>
    )
}