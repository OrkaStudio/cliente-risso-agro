// Edge function: extraer-comprobante
//
// Recibe la foto de un ticket/factura/remito y devuelve los campos de un
// movimiento financiero ya estructurados, para PRE-LLENAR el formulario.
// El usuario siempre revisa y confirma — sugiere, no impone.
//
// Usa Claude Haiku 4.5 con visión. La API key vive como secret del servidor
// (ANTHROPIC_API_KEY), NUNCA en el bundle del cliente. La function está
// protegida por JWT (verify_jwt por defecto): solo usuarios logueados.
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

const PROMPT = `Sos un asistente que lee comprobantes argentinos (tickets, facturas A/B/C, remitos, recibos) de un campo ganadero/agrícola y extrae los datos para cargar un movimiento financiero.

Reglas:
- "monto" = el TOTAL final del comprobante (con IVA si aparece). Solo el número, sin separadores ni símbolos.
- "fecha" en formato YYYY-MM-DD. Si el comprobante no muestra el año, usá el año actual. Si no hay fecha legible, devolvé null.
- "tipo": "gasto" si es una compra/pago (lo más común en facturas de proveedores), "ingreso" si es una venta/cobro del campo.
- "contraparte": razón social o nombre del emisor del comprobante (el proveedor para un gasto; el comprador para un ingreso).
- "descripcion": resumen corto de qué se compró/vendió (ej: "Antiparasitario y vacunas", "Gasoil 200 L"). Máximo ~60 caracteres.
- "categoria_id": SOLO si el comprobante encaja claramente con una de las categorías de la lista. Devolvé el id EXACTO de esa lista. Si dudás, devolvé null. NUNCA inventes una categoría que no esté en la lista.
- "confianza": "alta" si los datos clave (monto, fecha) se leen nítidos; "media" si algo es dudoso; "baja" si la imagen es difícil de leer.
- Si un dato no se puede leer con seguridad, devolvé null para ese campo. No inventes datos.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

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
        .join('\n') || '(sin categorías disponibles)'

    const anthropic = new Anthropic({ apiKey })

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      tools: [
        {
          name: 'registrar_comprobante',
          description:
            'Devuelve los campos extraídos del comprobante para pre-llenar el formulario de movimiento.',
          input_schema: {
            type: 'object',
            properties: {
              tipo: { type: ['string', 'null'], enum: ['gasto', 'ingreso', null] },
              monto: { type: ['number', 'null'] },
              fecha: {
                type: ['string', 'null'],
                description: 'YYYY-MM-DD',
              },
              descripcion: { type: ['string', 'null'] },
              contraparte: { type: ['string', 'null'] },
              categoria_id: {
                type: ['string', 'null'],
                description: 'id EXACTO de la lista, o null',
              },
              confianza: {
                type: 'string',
                enum: ['alta', 'media', 'baja'],
              },
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
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `${PROMPT}\n\nCategorías disponibles (id | nombre):\n${listaCats}`,
            },
          ],
        },
      ],
    })

    const toolUse = msg.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use')
      return json({ error: 'No se pudo leer el comprobante' }, 502)

    // Validá que la categoría sugerida exista de verdad (certero o nada).
    const out = toolUse.input as Record<string, unknown>
    const catId = out.categoria_id
    if (catId && !cats.some((c) => c.id === catId)) out.categoria_id = null

    return json(out)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return json({ error: message }, 500)
  }
})
