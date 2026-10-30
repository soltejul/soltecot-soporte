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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            zipCodeDestino,
            tipoPreset = 'controles',
            sentido = 'entrada'
        } = body

        // 🛡️ 1. Extracción y normalización de Valor Declarado y Seguro Opcional
        const rawValor = body.valorDeclarado ??
            body.declaredValue ??
            body.valor_declarado ??
            body.declared_value ??
            body.seguroValor ??
            0

        let cleanValorDeclarado = 0
        if (typeof rawValor === 'number') {
            cleanValorDeclarado = rawValor
        } else if (typeof rawValor === 'string') {
            const soloNumeros = rawValor.replace(/[^0-9.]/g, '')
            cleanValorDeclarado = parseFloat(soloNumeros) || 0
        }

        const rawConSeguro = body.conSeguro ?? body.seguro ?? body.insurance
        const conSeguro = rawConSeguro !== undefined
            ? Boolean(rawConSeguro)
            : (cleanValorDeclarado > 0)

        const cleanClienteCP = String(zipCodeDestino || '').replace(/\D/g, '').trim()
        const cleanTallerCP = String(ORIGIN_CP || '54850').replace(/\D/g, '').trim()

        const cleanOrigen = sentido === 'entrada' ? cleanClienteCP : cleanTallerCP
        const cleanDestino = sentido === 'entrada' ? cleanTallerCP : cleanClienteCP

        if (cleanOrigen.length !== 5 || cleanDestino.length !== 5) {
            return NextResponse.json({
                error: 'Tanto el C.P. de origen como el de destino deben tener 5 dígitos válidos.'
            }, { status: 400 })
        }

        const dims = PRESETS_PAQUETE[tipoPreset] || PRESETS_PAQUETE.controles
        const bearerToken = await obtenerBearerToken()

        const addressFrom = await obtenerUbicacionCompleta(cleanOrigen, bearerToken)
        const addressTo = await obtenerUbicacionCompleta(cleanDestino, bearerToken)

        // 📦 2. Construcción del payload para Skydropx Pro
        const skydropxPayload: any = {
            quotation: {
                zip_code_from: cleanOrigen,
                zip_code_to: cleanDestino,
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

        // 🛡️ Inyección de Seguro y Valor Declarado en la cotización
        if (conSeguro && cleanValorDeclarado > 0) {
            skydropxPayload.quotation.insurance = true
            skydropxPayload.quotation.consignment_note_details = {
                declared_value: cleanValorDeclarado,
                currency: "MXN"
            }
            skydropxPayload.quotation.declared_value = cleanValorDeclarado
            skydropxPayload.quotation.parcel.declared_value = cleanValorDeclarado
        }

        // 3. Solicitud inicial a la API
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

        let listaTarifas: any[] = []
        if (dataResult.included) listaTarifas = dataResult.included
        else if (dataResult.rates) listaTarifas = dataResult.rates
        else if (dataResult.data) listaTarifas = dataResult.data
        else if (Array.isArray(dataResult)) listaTarifas = dataResult

        // Verificar si Paquetexpress ya devolvió precio exitoso
        let paquetexpressListo = listaTarifas.some((t: any) => {
            const prov = String(t.provider_name || t.provider || '').toLowerCase()
            return prov.includes('paquetexpress') && t.success === true && parseFloat(t.total || t.total_pricing || '0') > 0
        })

        // 4. Polling de respaldo si Paquetexpress sigue calculando
        if (!paquetexpressListo && quotationId) {
            console.log(`⏳ [SKYDROPS POLLING]: Esperando actualización de tarifas para ID ${quotationId}...`)
            await delay(1500)

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

        // 5. Normalización estricta y cálculo de seguro
        const tarifasNormalizadas = listaTarifas
            .filter((item: any) => item && item.success === true)
            .map((item: any) => {
                const a = item.attributes || item

                const proveedor = a.provider_name || a.provider_display_name || a.provider || 'PAQUETEXPRESS'
                const servicio = a.provider_service_name || a.service_level_name || 'Express'

                const precioRaw = a.total ?? a.total_pricing ?? a.amount ?? 0
                let precioNum = parseFloat(String(precioRaw)) || 0
                const dias = a.days ?? a.estimated_days ?? 3

                // Detección de prima de seguro devuelta por Skydropx
                let seguroNum = parseFloat(String(a.insurance_price ?? a.insurance_fee ?? a.insurance_cost ?? 0)) || 0

                // 🛡️ Si el cliente solicitó seguro con valor declarado:
                if (conSeguro && cleanValorDeclarado > 0) {
                    if (seguroNum === 0) {
                        // Prima estándar de paquetería (1.25% del valor declarado + IVA 16%, mín. $17.40 MXN)
                        seguroNum = Math.max(17.40, Math.round(cleanValorDeclarado * 0.0125 * 1.16 * 100) / 100)
                    }

                    // Si la tarifa devuelta es solo el flete promocional en seco (ej. $51.25), sumamos la prima
                    if (precioNum <= 55) {
                        precioNum += seguroNum
                    }
                }

                return {
                    rateId: item.id || a.id || 'N/A',
                    proveedor: String(proveedor).toUpperCase(),
                    servicio: String(servicio),
                    precioNum,
                    seguroNum,
                    diasEstimados: Number(dias) || 3
                }
            })
            .filter(t => t.precioNum > 0)

        if (tarifasNormalizadas.length === 0) {
            return NextResponse.json({
                error: `SKYDROPS: No se encontraron tarifas válidas para este CP.`
            }, { status: 400 })
        }

        // Priorizar Paquetexpress
        const paqueteriasPaquetexpress = tarifasNormalizadas.filter(t => t.proveedor.includes('PAQUETEXPRESS'))

        const tarifaGanadora = paqueteriasPaquetexpress.length > 0
            ? paqueteriasPaquetexpress.sort((a, b) => a.precioNum - b.precioNum)[0]
            : tarifasNormalizadas.sort((a, b) => a.precioNum - b.precioNum)[0]

        console.log('🏆 [WINNER SELECTED]:', tarifaGanadora)

        return NextResponse.json({
            success: true,
            presetAplicado: tipoPreset,
            dimensiones: dims,
            valorDeclarado: cleanValorDeclarado,
            conSeguro: Boolean(conSeguro && cleanValorDeclarado > 0),
            cotizacionMejor: tarifaGanadora ? {
                rateId: tarifaGanadora.rateId,
                proveedor: tarifaGanadora.proveedor,
                servicio: tarifaGanadora.servicio,
                precio: tarifaGanadora.precioNum.toFixed(2),
                precioFleteBase: (tarifaGanadora.precioNum - tarifaGanadora.seguroNum).toFixed(2),
                costoSeguro: tarifaGanadora.seguroNum > 0 ? tarifaGanadora.seguroNum.toFixed(2) : '0.00',
                diasEstimados: tarifaGanadora.diasEstimados
            } : null,
            todasLasTarifas: tarifasNormalizadas
        })

    } catch (error: any) {
        console.error('🔴 [CRITICAL QUOTE ERROR]:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}