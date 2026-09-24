// src/lib/db.ts
// 🔌 Re-exportamos la instancia única Singleton para proteger Neon DB de fugas de conexiones
import { prisma } from './prisma'

export function getPrisma() {
    return prisma
}

export { prisma }