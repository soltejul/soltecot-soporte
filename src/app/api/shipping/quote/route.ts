import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const CLIENT_ID = process.env.SKYDROPS_CLIENT_ID || ''
const CLIENT_SECRET = process.env.SKYDROPS_CLIENT_SECRET || ''
const ORIGIN_CP = process.env.SKYDROPS_ORIGIN_CP || '54850'

const PRESETS_PAQUETE: Record<string, { length: number; width: number; height: number; weight: number }> = {
    controles: { length: 30, width: 25, height: 15, weight: 1.5 },
    consolas_chicas: { length: 35, width: 30, height: 20, weight: 3.5 },
    consolas_grandes: { length: 45, width: 35, height: 25, weight: 5.5 },
    laptops: { length: 45, width: 35, height: 15, weight: 3.5 }
}

async function obtenerBearerToken() {
    const response = await fetch('https://api-pro.skydropx.com/api/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: CLIENT_ID.trim(),
            client_secret: CLIENT_SECRET.trim()
        })
    })
    const data = await response.json()
    return data.access_token
}

async function obtenerUbicacionCompleta(zipCode: string, token: string) {
    try {
        const res = await fetch(`https://api-pro.skydropx.com/api/v1/zip_codes?zip_code=${zipCode}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        if (res.ok) {
            const data = await res.json()
            const list = Array.isArray(data) ? data : (data.zip_codes || data.data || [])
            if (list.length > 0) {
                const item = list[0]
                let coloniaValida = 'Centro'
                if (item.colonies && Array.isArray(item.colonies) && item.colonies.length > 0) {
                    coloniaValida = item.colonies[0]
                } else if (item.neighborhood) {
                    coloniaValida = item.neighborhood
                }
                return {
                    country_code: 'MX',
                    postal_code: String(zipCode),
                    area_level1: item.state || item.state_code || 'MEX',
                    area_level2: item.municipality || item.city || 'Ciudad de México',
                    area_level3: coloniaValida
                }
            }
        }
    } catch (e) { }
    return { country_code: 'MX', postal_code: String(zipCode), area_level1: 'MEX', area_level2: 'Ciudad de México', area_level3: 'Centro' }
}

// ⏰ FUNCIÓN DE ESPERA (Delay) PARA POLLING ASÍNCRONO
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { zipCodeDestino, tipoPreset = 'controles' } = body

        const cleanDestino = String(zipCodeDestino || '').replace(/\D/g, '').trim()
        const cleanOrigen = String(ORIGIN_CP || '54850').replace(/\D/g, '').trim()

        const dims = PRESETS_PAQUETE[tipoPreset] || PRESETS_PAQUETE.controles
        const bearerToken = await obtenerBearerToken()

        const addressFrom = await obtenerUbicacionCompleta(cleanOrigen, bearerToken)
        const addressTo = await obtenerUbicacionCompleta(cleanDestino, bearerToken)

        const skydropxPayload = {
            quotation: {
                address_from: addressFrom,
                address_to: addressTo,
                parcel: {
                    length: Number(dims.length),
                    width: Number(dims.width),
                    height: Number(dims.height),
                    weight: Number(dims.weight),
                    distance_unit: "cm",
                    mass_unit: "kg"
                }
            }
        }

        // 1. PRIMER LLAMADO A COTIZACIÓN
        const resSkydropx = await fetch('https://api-pro.skydropx.com/api/v1/quotations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${bearerToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(skydropxPayload)
        })

        let dataResult = await resSkydropx.json()
        let quotationId = dataResult.id || dataResult.data?.id

        // 2. EXTRAER TARIFAS (FILTRANDO LAS PENDING)
        let listaTarifas: any[] = []
        if (dataResult.included) listaTarifas = dataResult.included
        else if (dataResult.rates) listaTarifas = dataResult.rates
        else if (dataResult.data) listaTarifas = dataResult.data
        else if (Array.isArray(dataResult)) listaTarifas = dataResult

        // Verificar si las tarifas tienen precios reales o siguen en null (pending)
        let hayPreciosReales = listaTarifas.some((t: any) => parseFloat(t.total || t.amount || t.total_pricing || '0') > 0)

        // 3. ESTRATEGIA DE REINTENTO (POLLING) SI ESTÁN EN "PENDING"
        if (!hayPreciosReales && quotationId) {
            console.log(`⏳ [SKYDROPS ASYNC]: Tarifas pendientes. Esperando 1.5s para consultar de nuevo el ID: ${quotationId}`)
            await delay(1500) // Esperamos a que Skydropx termine de calcular los precios con las paqueterías

            const resPolling = await fetch(`https://api-pro.skydropx.com/api/v1/quotations/${quotationId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/json'
                }
            })

            if (resPolling.ok) {
                const dataPolling = await resPolling.json()
                if (dataPolling.included) listaTarifas = dataPolling.included
                else if (dataPolling.rates) listaTarifas = dataPolling.rates
                else if (dataPolling.data) listaTarifas = dataPolling.data
            }
        }

        // 4. MAPEO EXHAUSTIVO FINAL
        const tarifasNormalizadas = listaTarifas.map((item: any) => {
            const a = item.attributes || item

            // Las llaves que detectamos en el error: provider_name y provider_service_name
            const proveedor = a.provider_name || a.provider || 'Paquetexpress'
            const servicio = a.provider_service_name || a.service_level_name || 'Express'

            // Las llaves de monto: total, amount o total_pricing
            const precioRaw = a.total ?? a.amount ?? a.total_pricing ?? 0
            const precioNum = parseFloat(String(precioRaw)) || 0

            const dias = a.days ?? a.estimated_days ?? 3

            return {
                rateId: item.id || a.id || 'N/A',
                proveedor: String(proveedor).toUpperCase(),
                servicio: String(servicio),
                precioNum,
                diasEstimados: Number(dias) || 3
            }
        }).filter(t => t.precioNum > 0) // Descartar permanentemente las que se hayan quedado en null o 0

        // Si después del reintento no hay nada válido
        if (tarifasNormalizadas.length === 0) {
            return NextResponse.json({
                error: `SKYDROPS ASYNC REJECT: Skydropx no devolvió precios reales en el tiempo esperado.`
            }, { status: 400 })
        }

        // Priorizar Paquetexpress
        const paqueteriasPaquetexpress = tarifasNormalizadas.filter(t => t.proveedor.includes('PAQUETEXPRESS'))

        const tarifaGanadora = paqueteriasPaquetexpress.length > 0
            ? paqueteriasPaquetexpress.sort((a, b) => a.precioNum - b.precioNum)[0]
            : tarifasNormalizadas.sort((a, b) => a.precioNum - b.precioNum)[0]

        return NextResponse.json({
            success: true,
            presetAplicado: tipoPreset,
            dimensiones: dims,
            cotizacionMejor: tarifaGanadora ? {
                rateId: tarifaGanadora.rateId,
                proveedor: tarifaGanadora.proveedor,
                servicio: tarifaGanadora.servicio,
                precio: tarifaGanadora.precioNum.toFixed(2),
                diasEstimados: tarifaGanadora.diasEstimados
            } : null,
            todasLasTarifas: tarifasNormalizadas
        })

    } catch (error: any) {
        console.error('🔴 [CRITICAL QUOTE ERROR]:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}