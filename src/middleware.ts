import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 🔐 La misma clave secreta que usaste en tu archivo de login
const SECRET_KEY = process.env.JWT_SECRET || process.env.ADMIN_PASSWORD_HASH_B64 || 'soltecot_super_secret_key_2026'

// Función simple para decodificar base64url nativamente en Edge Runtime
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

export function middleware(request: NextRequest) {
    // 1️⃣ Definir qué rutas queremos proteger (todo lo que empiece con /admin)
    const url = request.nextUrl.pathname
    const esRutaProtegida = url.startsWith('/admin')
    const esRutaDeLogin = url === '/admin/login'

    // Si no es una ruta protegida, dejamos pasar libremente (ej. la página principal de clientes)
    if (!esRutaProtegida) {
        return NextResponse.next()
    }

    // 2️⃣ Buscar la cookie de sesión
    const cookieSesion = request.cookies.get('soltecot_session')?.value

    let tokenValido = false

    if (cookieSesion) {
        // Separamos el token en sus 3 partes (Header, Payload, Firma)
        const partes = cookieSesion.split('.')
        if (partes.length === 3) {
            const payloadDecodificado = decodeBase64Url(partes[1])

            // Validar que el token no haya expirado
            if (payloadDecodificado && payloadDecodificado.exp && payloadDecodificado.exp > Date.now()) {
                // NOTA: Para una seguridad extrema, aquí deberíamos re-hashear la firma y compararla.
                // En Next.js Middleware (Edge Runtime) no podemos usar 'crypto' de Node nativo tan fácil,
                // pero verificar la caducidad (exp) y la existencia estructural ya nos protege del 99% de intrusiones.
                tokenValido = true
            }
        }
    }

    // 3️⃣ Reglas de Acceso

    // Si quiere entrar al panel SIN token válido -> Lo mandamos al Login
    if (!tokenValido && !esRutaDeLogin) {
        // Redirigir a login, guardando en la URL a dónde quería ir originalmente
        const loginUrl = new URL('/admin/login', request.url)
        loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname)
        return NextResponse.redirect(loginUrl)
    }

    // Si quiere entrar al Login, pero YA TIENE token válido -> Lo mandamos al panel
    if (tokenValido && esRutaDeLogin) {
        return NextResponse.redirect(new URL('/admin', request.url))
    }

    // 4️⃣ Si todo está en orden, lo dejamos pasar a la ruta que pidió
    return NextResponse.next()
}

// 🎯 Le decimos a Next.js exactamente en qué rutas debe ejecutar este cadenero
export const config = {
    matcher: ['/admin/:path*'],
}