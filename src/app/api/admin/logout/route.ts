import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
    try {
        const response = NextResponse.json(
            { success: true, message: 'Sesión finalizada correctamente' },
            {
                status: 200,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            }
        )

        // 🔐 Destrucción total de la cookie igualando sus atributos de creación
        response.cookies.set('soltecot_session', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 0,
            expires: new Date(0)
        })

        return response
    } catch (error) {
        return NextResponse.json({ error: 'Error al cerrar sesión' }, { status: 500 })
    }
}