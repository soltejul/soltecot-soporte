
import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export async function DELETE() {
    try {
        const haceDiezDias = new Date()
        haceDiezDias.setDate(haceDiezDias.getDate() - 10)

        // 🛡️ CANDADO DE SEGURIDAD: Solo purga si no tiene cita, recolección u orden oficial de taller
        const resultado = await prisma.cliente.deleteMany({
            where: {
                updatedAt: { lte: haceDiezDias },
                tickets: {
                    none: {
                        OR: [
                            { estado: 'AGENDADO' },
                            { estado: 'RECOLECCION' },
                            { estado: 'RECIBIDO' },
                            { estado: 'EN_DIAGNOSTICO' },
                            { estado: 'EN_REPARACION' },
                            { estado: 'LISTO_PARA_ENTREGA' },
                            { notasInternas: { contains: '[AGENDADO]' } },
                            { notasInternas: { contains: '[RECOLECCION]' } }
                        ]
                    }
                }
            }
        })

        console.log(`🧹 [PURGA 10D COMPLETADA]: Se eliminaron ${resultado.count} leads inactivos de Neon DB.`)
        return NextResponse.json({ success: true, purgados: resultado.count }, { status: 200 })

    } catch (error: any) {
        console.error('🔴 [PURGA ERROR]:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}