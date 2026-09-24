import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SECRET_KEY = process.env.JWT_SECRET || process.env.ADMIN_PASSWORD_HASH_B64 || 'soltecot_super_secret_key_2026'

function decodeBase64Url(str: string) {
    try {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
        while (base64.length % 4) base64 += '='
        const decoded = atob(base64)
        return JSON.parse(decoded)
    } catch (e) {
        return null
    }
}

export function proxy(request: NextRequest) {
    const url = request.nextUrl.pathname
    const esRutaProtegida = url.startsWith('/admin')
    const esRutaDeLogin = url === '/admin/login'

    // Si no es una ruta de administración, dejamos pasar
    if (!esRutaProtegida) {
        return NextResponse.next()
    }

    // Buscar cookie de sesión
    const cookieSesion = request.cookies.get('soltecot_session')?.value
    let tokenValido = false

    if (cookieSesion) {
        const partes = cookieSesion.split('.')
        if (partes.length === 3) {
            const payloadDecodificado = decodeBase64Url(partes[1])

            // Validar expiración del token
            if (payloadDecodificado && payloadDecodificado.exp && payloadDecodificado.exp > Date.now()) {
                tokenValido = true
            }
        }
    }

    // Reglas de redirección
    if (!tokenValido && !esRutaDeLogin) {
        const loginUrl = new URL('/admin/login', request.url)
        loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname)
        return NextResponse.redirect(loginUrl)
    }

    if (tokenValido && esRutaDeLogin) {
        return NextResponse.redirect(new URL('/admin', request.url))
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/admin/:path*'],
}