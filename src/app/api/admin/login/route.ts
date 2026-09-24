import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// 🔐 Clave secreta para firmar cookies (USA JWT_SECRET o un fallback derivado del hash)
const SECRET_KEY = process.env.JWT_SECRET || process.env.ADMIN_PASSWORD_HASH_B64 || 'soltecot_super_secret_key_2026'

// 🛡️ Helper para firmar tokens HMAC SHA-256
function generarTokenFirmado(usuario: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const exp = Date.now() + (8 * 60 * 60 * 1000) // Expiración en 8 horas
    const payload = Buffer.from(JSON.stringify({ sub: usuario, exp, role: 'admin' })).toString('base64url')

    const signature = crypto
        .createHmac('sha256', SECRET_KEY)
        .update(`${header}.${payload}`)
        .digest('base64url')

    return `${header}.${payload}.${signature}`
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { usuario, password } = body

        // 1️⃣ VALIDACIÓN Y SANITIZACIÓN DE ENTRADAS (Anti-DoS)
        if (!usuario || typeof usuario !== 'string' || usuario.length > 50 ||
            !password || typeof password !== 'string' || password.length > 100) {

            // Delay disuasorio contra escáneres
            await new Promise((resolve) => setTimeout(resolve, 1500))
            return NextResponse.json({ error: 'Formato de datos no válido' }, { status: 400 })
        }

        const adminUser = process.env.ADMIN_USER
        const adminPasswordHashB64 = process.env.ADMIN_PASSWORD_HASH_B64

        if (!adminUser || !adminPasswordHashB64) {
            return NextResponse.json({ error: 'Configuración de seguridad incompleta en servidor' }, { status: 500 })
        }

        // 2️⃣ RECONSTRUCCIÓN DEL HASH REAL DE BCRYPT
        const adminPasswordHash = Buffer.from(adminPasswordHashB64, 'base64').toString('utf-8')

        // 3️⃣ VERIFICACIÓN DE CREDENCIALES
        const usuarioEsCorrecto = usuario.trim() === adminUser.trim()
        const passwordEsCorrecto = await bcrypt.compare(password, adminPasswordHash)

        if (!usuarioEsCorrecto || !passwordEsCorrecto) {
            // 🛑 DELAY ANTI-FUERZA BRUTA (Frena bots automatizados a 1.5s por intento)
            await new Promise((resolve) => setTimeout(resolve, 1500))
            return NextResponse.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 })
        }

        // 4️⃣ GENERACIÓN DE TOKEN FIRMADO Y RESPUESTA SEGURO
        const sessionToken = generarTokenFirmado(adminUser)
        const response = NextResponse.json({ success: true, message: 'Acceso concedido' })

        // 🔐 Cookie HttpOnly, SameSite Strict con Token Criptográfico Firmado
        response.cookies.set('soltecot_session', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 60 * 60 * 8, // 8 Horas
            path: '/',
        })

        return response

    } catch (error) {
        // Delay disuasorio en caso de excepción
        await new Promise((resolve) => setTimeout(resolve, 1500))
        return NextResponse.json({ error: 'Anomalía en el servidor de autenticación' }, { status: 500 })
    }
}