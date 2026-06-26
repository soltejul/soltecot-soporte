import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { enviarMensajeWhatsApp } from '../../../../lib/whatsapp'

export const dynamic = 'force-dynamic'

export async function POST() {
    try {
        // 📅 OBTENER FECHA DE HOY EN MÉXICO
        const ahoraMexico = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }))

        // Calcular el año, mes y día de MAÑANA de forma matemática exacta
        const mañana = new Date(ahoraMexico)
        mañana.setDate(ahoraMexico.getDate() + 1)

        const año = mañana.getFullYear()
        const mes = String(mañana.getMonth() + 1).padStart(2, '0')
        const dia = String(mañana.getDate()).padStart(2, '0')

        // 🛡️ CREAR STRINGS DE FECHA EN FORMATO ISO PURO (Límites exactos del día de mañana)
        // Esto le dice a Neon: "Búscame todo lo que caiga entre el primer segundo y el último segundo de este día en específico"
        const inicioMañanaISO = `${año}-${mes}-${dia}T00:00:00.000Z`
        const finMañanaISO = `${año}-${mes}-${dia}T23:59:59.999Z`

        console.log(`📡 [RECORDATORIOS TIMING]: Buscando citas entre ${inicioMañanaISO} y ${finMañanaISO}`)

        // 🐘 Buscar en Neon todas las citas pendientes de mañana
        const citasDeMañana = await prisma.cita.findMany({
            where: {
                fechaCita: {
                    gte: new Date(inicioMañanaISO),
                    lte: new Date(finMañanaISO)
                },
                estado: 'PENDIENTE'
            }
        })

        if (citasDeMañana.length === 0) {
            return NextResponse.json({ success: true, enviados: 0, mensaje: `No hay citas pendientes detectadas en Neon para el día ${año}-${mes}-${dia}.` })
        }

        let contadorEnviados = 0

        // 🚀 Recorrer las citas encontradas y despachar por WhatsApp
        for (const cita of citasDeMañana) {

            // 🛡️ ESCUDO DE PARSEO ANTICRASH: 
            // Si ya es un objeto Date de JS lo dejamos, si viene como string de Neon lo forzamos a instanciarse correctamente.
            const objetoFecha = cita.fechaCita instanceof Date ? cita.fechaCita : new Date(cita.fechaCita)

            let horaFormateada = 'Hora pendiente'

            // Validamos que el timestamp interno de la fecha sea un número real antes de formatear
            if (!isNaN(objetoFecha.getTime())) {
                horaFormateada = objetoFecha.toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true, // 🕐 Cambia a formato natural de 12 horas (Ej: 10:00 AM / 03:30 PM)
                    timeZone: 'America/Mexico_City'
                })
            }

            let textoRecordatorio = ''

            if (cita.tipo === 'ENTREGA') {
                textoRecordatorio = `🔬 *SOLTECOT_ RECORDATORIO DE CITA* 🔬\n\nHola *${cita.nombreCliente}*, te recordamos que el día de mañana tienes una cita programada para traer tu equipo a revisión en nuestro laboratorio.\n\n⏰ *Hora reservada:* ${horaFormateada}\n📍 *Laboratorio:* Hacienda Los Geranios, MZ 45 LT 14, Villas Xaltipa 2-C. Cuautitlán.\n\n_Si tienes algún contratiempo o requieres reprogramar, por favor avísanos por este medio. ¡Te esperamos!_ 🛠️`
            } else {
                textoRecordatorio = `🚚 *SOLTECOT_ RUTA DE RECOLECCIÓN* 🚚\n\nHola *${cita.nombreCliente}*, te recordamos que el día de mañana nuestro equipo de logística pasará a tu domicilio a recolectar tu equipo para ingresarlo al laboratorio.\n\n⏰ *Horario aproximado:* ${horaFormateada}\n📍 *Dirección de arribo:* ${cita.direccion}\n\n_Por favor, ten tu equipo listo (con su cargador en caso de laptops). ¡Vamos en camino!_ 🚚💨`
            }

            // Disparar vía conector unificado Baileys
            const destinatarioReal = cita.telefono.includes('@') ? cita.telefono : `${cita.telefono}@s.whatsapp.net`

            const exito = await enviarMensajeWhatsApp(destinatarioReal, textoRecordatorio)
            if (exito) contadorEnviados++
        }

        return NextResponse.json({ success: true, enviados: contadorEnviados, total: citasDeMañana.length })
    } catch (error: any) {
        console.error("🔴 [ERROR RECORDATORIOS CRON]:", error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}