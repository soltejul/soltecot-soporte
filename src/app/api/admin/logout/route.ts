import { NextResponse } from 'next/server'

export async function POST() {
    const response = NextResponse.json({ success: true })
    // Forzamos a la cookie a expirar de inmediato (maxAge: 0) borrándola del mapa
    response.cookies.set('soltecot_session', '', { maxAge: 0, path: '/' })
    return response
}