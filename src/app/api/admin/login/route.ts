import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

export async function POST(request: Request) {
    try {
        const { usuario, password } = await request.json()

        const adminUser = process.env.ADMIN_USER
        const adminPasswordHashB64 = process.env.ADMIN_PASSWORD_HASH_B64 // Leemos la versión Base64

        if (!adminUser || !adminPasswordHashB64) {
            return NextResponse.json({ error: 'Configuración de seguridad incompleta' }, { status: 500 })
        }

        // 🔓 TRADUCTOR AUTOMÁTICO: Convertimos el Base64 de vuelta al Hash real de 60 caracteres
        const adminPasswordHash = Buffer.from(adminPasswordHashB64, 'base64').toString('utf-8')

        console.log("--------------------------------------------------")
        console.log("👤 USUARIO INTENTANDO:", `[${usuario}]` === `[${adminUser}]` ? "✅ COINCIDE" : "❌ NO COINCIDE")
        console.log("🔑 LONGITUD DEL HASH RECONSTRUIDO:", adminPasswordHash.length)

        const passwordEsCorrecto = await bcrypt.compare(password, adminPasswordHash)
        console.log("🔒 RESULTADO DE BCRYPT:", passwordEsCorrecto ? "✅ CONTRASEÑA CORRECTA" : "❌ HASH NO COINCIDE")
        console.log("--------------------------------------------------")

        if (usuario === adminUser && passwordEsCorrecto) {
            const response = NextResponse.json({ success: true, message: 'Acceso concedido' })

            response.cookies.set('soltecot_session', 'true', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 60 * 60 * 8, // 8 horas de sesión
                path: '/',
            })

            return response
        }

        return NextResponse.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 })
    } catch (error) {
        return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 })
    }
}