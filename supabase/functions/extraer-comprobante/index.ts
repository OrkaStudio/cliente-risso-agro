// Edge function: extraer-comprobante
//
// Recibe la foto de un ticket/factura/remito/liquidacion y devuelve los campos
// de un movimiento financiero ya estructurados, INCLUYENDO el IVA discriminado
// (una o varias lineas: el caso real son las liquidaciones de consignataria con
// venta al 10,5% + comisiones y gastos al 21%). Pre-llena el formulario: el
// usuario siempre revisa y confirma.
//
// Usa Claude Haiku 4.5 con vision. La API key vive como secret del servidor
// (ANTHROPIC_API_KEY), NUNCA en el bundle del cliente. Protegida por JWT.
//
// Setear el secret una vez:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...  (o desde el dashboard)

import Anthropic from 'npm:@anthropic-ai/sdk@0.69.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

type CategoriaIn = {
  id: string
  nombre: string
  grupo: string
  aplica_a: string | null
}

const PROMPT = `Sos un asistente que lee comprobantes argentinos (tickets, facturas A/B/C, remitos, recibos y liquidaciones de hacienda de consignataria) de un campo ganadero/agricola y extrae los datos para cargar un movimiento financiero con su IVA discriminado.

Reglas generales:
- "monto" = el TOTAL final del comprobante (lo que efectivamente se paga o cobra, neto de deducciones si es una liquidacion). Solo el numero, sin separadores ni simbolos.
- "fecha" en formato YYYY-MM-DD. Si no muestra el anio, usa el actual. Si no hay fecha legible, null.
- "tipo": "gasto" si es una compra/pago (facturas de proveedores), "ingreso" si es una venta/cobro del campo (liquidacion de hacienda, venta de granos).
- "contraparte": razon social o nombre del emisor (el proveedor para un gasto; el comprador/consignataria para un ingreso).
- "cuit": CUIT de la contraparte si aparece (solo digitos, sin guiones). Si no, null.
- "comprobante_tipo": "a", "b", "c" segun la letra del comprobante fiscal; "otro" para remito/recibo/ticket no fiscal o si no se distingue.
- "descripcion": resumen corto de que se compro/vendio (max ~60 caracteres).
- "categoria_id": SOLO si encaja claramente con una categoria de la lista; devolve el id EXACTO. Si dudas, null. NUNCA inventes.
- "confianza": "alta" si monto y fecha se leen nitidos; "media" si algo es dudoso; "baja" si la imagen es dificil.

IVA discriminado ("iva_lineas"): una entrada por cada base imponible con su alicuota.
- En una factura A comun suele haber UNA linea (neto + 21% o 10,5%).
- En una liquidacion de consignataria suele haber VARIAS: la venta de hacienda al 10,5% (concepto "Venta hacienda") y las comisiones / gastos de remate / guia al 21% (concepto segun aparezca). Las comisiones y gastos son montos NEGATIVOS para el productor pero su neto e IVA se cargan en POSITIVO en su linea (el signo lo maneja la app).
- Cada linea: "concepto" (texto corto de que es), "neto" (base imponible, numero), "alicuota" (21, 10.5, 27 o 0), "iva" (el importe de IVA de esa linea).
- Si el comprobante NO discrimina IVA (factura B/C, ticket) devolve "iva_lineas": [] (array vacio). No inventes el IVA.
- Si un dato no se lee con seguridad, null (o array vacio para iva_lineas). No inventes.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Metodo no permitido' }, 405)

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey)
      return json({ error: 'Falta ANTHROPIC_API_KEY en el servidor' }, 500)

    const { imageBase64, mediaType, categorias } = await req.json()
    if (!imageBase64 || !mediaType)
      return json({ error: 'Falta la imagen del comprobante' }, 400)

    const cats: CategoriaIn[] = Array.isArray(categorias) ? categorias : []
    const listaCats =
      cats
        .map(
          (c) =>
            `- ${c.id} | ${c.nombre} (${c.grupo}; aplica a: ${c.aplica_a ?? 'gasto e ingreso'})`,
        )
        .join('\n') || '(sin categorias disponibles)'

    const anthropic = new Anthropic({ apiKey })

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1536,
      tools: [
        {
          name: 'registrar_comprobante',
          description:
            'Devuelve los campos extraidos del comprobante (incluido el IVA discriminado) para pre-llenar el formulario de movimiento.',
          input_schema: {
            type: 'object',
            properties: {
              tipo: { type: ['string', 'null'], enum: ['gasto', 'ingreso', null] },
              monto: { type: ['number', 'null'] },
              fecha: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
              descripcion: { type: ['string', 'null'] },
              contraparte: { type: ['string', 'null'] },
              cuit: { type: ['string', 'null'], description: 'solo digitos' },
              comprobante_tipo: {
                type: ['string', 'null'],
                enum: ['a', 'b', 'c', 'otro', null],
              },
              categoria_id: {
                type: ['string', 'null'],
                description: 'id EXACTO de la lista, o null',
              },
              iva_lineas: {
                type: 'array',
                description: 'Lineas de IVA discriminado; vacio si no discrimina.',
                items: {
                  type: 'object',
                  properties: {
                    concepto: { type: ['string', 'null'] },
                    neto: { type: 'number' },
                    alicuota: { type: 'number', enum: [21, 10.5, 27, 0] },
                    iva: { type: 'number' },
                  },
                  required: ['neto', 'alicuota', 'iva'],
                },
              },
              confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
            },
            required: ['tipo', 'monto', 'fecha', 'confianza'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'registrar_comprobante' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageBase64 },
            },
            {
              type: 'text',
              text: `${PROMPT}\n\nCategorias disponibles (id | nombre):\n${listaCats}`,
            },
          ],
        },
      ],
    })

    const toolUse = msg.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use')
      return json({ error: 'No se pudo leer el comprobante' }, 502)

    const out = toolUse.input as Record<string, unknown>
    // Certero o nada: si la categoria sugerida no existe, la anulamos.
    const catId = out.categoria_id
    if (catId && !cats.some((c) => c.id === catId)) out.categoria_id = null
    // Normalizamos iva_lineas a array.
    if (!Array.isArray(out.iva_lineas)) out.iva_lineas = []

    return json(out)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return json({ error: message }, 500)
  }
})
