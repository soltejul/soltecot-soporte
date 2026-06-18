// src/lib/db.ts
import { PrismaClient } from '@prisma/client' // <-- Regresa a la importación normal

declare global {
    var prismaGlobal: PrismaClient | undefined
}

export function getPrisma() {
    if (!globalThis.prismaGlobal) {
        globalThis.prismaGlobal = new PrismaClient()
    }
    return globalThis.prismaGlobal
}