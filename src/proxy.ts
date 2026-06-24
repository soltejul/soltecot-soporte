import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 🟢 CAMBIO CLAVE: Renombramos la función exportada de 'middleware' a 'proxy'
export function proxy(request: NextRequest) {
    const url = request.nextUrl.clone()

    // Si el usuario intenta entrar a cualquier ruta de /admin
    if (url.pathname.startsWith('/admin')) {
        // Excluimos la propia página de login para evitar un bucle infinito
        if (url.pathname === '/admin/login') {
            return NextResponse.next()
        }

        // Buscamos la cookie de sesión de Soltecot
        const sesionActiva = request.cookies.get('soltecot_session')

        // 🚨 Si no tiene la cookie activa, lo mandamos directo al Login
        if (!sesionActiva || sesionActiva.value !== 'true') {
            url.pathname = '/admin/login'
            return NextResponse.redirect(url)
        }
    }

    return NextResponse.next()
}

// Configura el filtro para que solo vigile las rutas de administración
export const config = {
    matcher: ['/admin/:path*'],
}