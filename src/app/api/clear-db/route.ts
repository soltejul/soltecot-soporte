import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma' // 🔌 Ajusta los '../' según dónde se ubique tu instancia de Prisma

export async function GET() {
    try {
        // 🧨 FULMINACIÓN CONTROLADA: Limpia las tablas en cascada para evitar errores de Foreign Keys
        // Como usas UUIDs, el RESTART IDENTITY no es obligatorio, pero CASCADE limpia las dependencias de golpe.
        await prisma.$executeRawUnsafe(`
            TRUNCATE TABLE "Cita", "Ticket", "Cliente" CASCADE;
        `)

        console.log("🧼 [DATABASE SANITIZED]: El lienzo de Neon está 100% en blanco para las pruebas.")

        return NextResponse.json({
            success: true,
            message: "Lienzo en blanco conseguido. Las tablas Cliente, Ticket y Cita han sido vaciadas por completo."
        })
    } catch (error: any) {
        console.error("🔴 Error crítico al vaciar la base de datos:", error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}