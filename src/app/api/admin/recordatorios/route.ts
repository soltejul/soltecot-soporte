import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { enviarMensajeWhatsApp } from '../../../../lib/whatsapp'

export const dynamic = 'force-dynamic'

export async function POST() {
    try {
        // 📅 OBTENER FECHA DE HOY EN MÉXICO (Forzando la zona horaria)
        const ahoraMexicoString = new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" })
        const ahoraMexico = new Date(ahoraMexicoString)

        // Calcular el año, mes y día de MAÑANA de forma matemática exacta
        const mañana = new Date(ahoraMexico)
        mañana.setDate(ahoraMexico.getDate() + 1)

        const año = mañana.getFullYear()
        const mes = String(mañana.getMonth() + 1).padStart(2, '0')
        const dia = String(mañana.getDate()).padStart(2, '0')

        // 🛡️ CREAR STRINGS DE FECHA CON EL OFFSET DE MÉXICO (-06:00)
        // Quitamos la "Z" (Zulu/UTC) y le ponemos explícitamente -06:00. 
        // Así Neon sabe perfectamente cuándo empieza y termina el día en México.
        const inicioMañanaMX = `${año}-${mes}-${dia}T00:00:00.000-06:00`
        const finMañanaMX = `${año}-${mes}-${dia}T23:59:59.999-06:00`

        console.log(`📡 [RECORDATORIOS TIMING]: Buscando citas entre ${inicioMañanaMX} y ${finMañanaMX}`)

        // 🐘 Buscar en Neon todas las citas pendientes de mañana
        const citasDeMañana = await prisma.cita.findMany({
            where: {
                fechaCita: {
                    gte: new Date(inicioMañanaMX),
                    lte: new Date(finMañanaMX)
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

            // 🛡️ ESCUDO DE PARSEO ANTICRASH
            const objetoFecha = cita.fechaCita instanceof Date ? cita.fechaCita : new Date(cita.fechaCita)

            let horaFormateada = 'Hora pendiente'

            // Convertimos la hora de la base de datos a formato local de México para el mensaje
            if (!isNaN(objetoFecha.getTime())) {
                horaFormateada = objetoFecha.toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true, // 🕐 Cambia a formato natural de 12 horas (Ej: 10:00 a.m.)
                    timeZone: 'America/Mexico_City' // 👈 Garantiza que diga la hora en MX
                })
            }

            let textoRecordatorio = ''

            if (cita.tipo === 'ENTREGA') {
                textoRecordatorio = `🔬 *SOLTECOT_ RECORDATORIO DE CITA* 🔬\n\nHola *${cita.nombreCliente}*, te recordamos que el día de mañana tienes una cita programada para traer tu equipo a revisión en nuestro laboratorio.\n\n⏰ *Hora reservada:* ${horaFormateada}\n📍 *Laboratorio:* Hacienda Los Geranios, MZ 45 LT 14, Villas Xaltipa 2-C. Cuautitlán.\n\n_Si tienes algún contratiempo o requieres reprogramar, por favor avísanos por este medio. ¡Te esperamos!_ 🛠️`
            } else {
                textoRecordatorio = `🚚 *SOLTECOT_ RUTA DE RECOLECCIÓN* 🚚\n\nHola *${cita.nombreCliente}*, te recordamos que el día de mañana nuestro equipo de logística pasará a tu domicilio a recolectar tu equipo para ingresarlo al laboratorio.\n\n⏰ *Horario aproximado:* ${horaFormateada}\n📍 *Dirección de arribo:* ${cita.direccion}\n\n_Por favor, ten tu equipo listo (con su cargador en caso de laptops). ¡Vamos en camino!_ 🚚💨`
            }

            // Disparar vía Meta / Baileys
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