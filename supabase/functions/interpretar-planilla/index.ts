// Edge function: interpretar-planilla
//
// La planilla de caravanas que sube el productor (la del veterinario, la de
// SENASA o una hecha a mano) casi nunca tiene los títulos que esperamos. Esta
// función le muestra a Claude una MUESTRA de cada hoja (las primeras filas y
// los valores distintos de cada columna) y devuelve sólo CÓMO leerla: en qué
// hoja y fila están los títulos, qué columna es cada cosa, qué categoría y
// qué potrero quiere decir cada palabra y en qué orden vienen las fechas.
//
// Los números de caravana NUNCA salen de acá: la app copia cada celda tal
// como está en el archivo. Si la IA se equivoca, se ve en la tabla antes de
// guardar. Si esta función falla, la app lee la planilla por los títulos.
//
// Usa Claude Haiku 5.5 con salida estructurada. La API key es un secret del
// servidor (ANTHROPIC_API_KEY), NUNCA va en el bundle. Protegida por JWT.

import Anthropic from 'npm:@anthropic-ai/sdk@0.130.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type HojaMuestra = { nombre: string; filas: number; primeras: string[][]; valoresPorColumna: string[][] }

const COLUMNAS = ['visual', 'rfid', 'categoria', 'potrero', 'nacimiento', 'raza'] as const

const PROMPT = `Sos parte de Tropero, una app de gestión ganadera argentina. Un productor subió una planilla para ponerle número de caravana a animales que ya tiene cargados. Tu trabajo es decir CÓMO leerla; no copies ni corrijas los números.

Te paso una muestra de cada hoja: las primeras filas tal como vienen y, por columna (empezando en 0), los valores distintos que aparecen.

Devolvé:
- "hoja": el índice (desde 0) de la hoja que tiene los animales.
- "fila_titulos": el índice (desde 0, dentro de "primeras") de la fila con los títulos de las columnas. Si la planilla no tiene títulos, la fila anterior a la primera fila con datos (puede ser -1).
- "columnas": el índice de cada columna, o null si no está:
  - "visual": la caravana visible, el número corto que se lee de lejos (suele tener de 1 a 6 cifras). Puede llamarse Nro, Número, Tag, Caravana, Id, Botón visual, etc.
  - "rfid": la caravana electrónica / chip / RFID / EID: 15 cifras, en Argentina suele empezar con 032 (puede venir con espacios o como número sin el 0 inicial).
  - "categoria": qué animal es (vaca, vaquillona, ternero, novillo, toro, oveja, etc., o abreviaturas como "Vq", "Tro", "Nov").
  - "potrero": el potrero, lote o cuadro donde está.
  - "nacimiento": la fecha de nacimiento.
  - "raza": la raza.
  Una columna sirve para una sola cosa. Si dudás, null: es mejor que el productor la elija a que se lea mal.
- "categorias": para cada valor distinto de la columna de categoría, a qué categoría de la lista corresponde (o null si no se puede saber). Considerá sexo y edad: "Ternero" macho es ternero, "Ternera" hembra es ternera; "Vaq" es vaquillona; "Nov" novillo; "MEJ" o "Torito" suele ser toro. Sólo valores que aparecen en la muestra.
- "potreros": para cada valor distinto de la columna de potrero, a qué potrero de la lista corresponde (o null). Sólo si es claramente el mismo ("Pot. 11B", "11 B", "potrero 11b" → "11B"). Si hay dos posibles, null.
- "fecha": el orden de las fechas de texto: "dia_mes_anio" (lo normal en Argentina), "mes_dia_anio" (si algún valor tiene el segundo número mayor a 12) o "anio_mes_dia"; null si no hay fechas.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'Falta ANTHROPIC_API_KEY en el servidor' }, 500)

    const cuerpo = await req.text()
    if (cuerpo.length > 300_000) return json({ error: 'La muestra es demasiado grande' }, 413)
    const { hojas, categorias, potreros } = JSON.parse(cuerpo) as {
      hojas: HojaMuestra[]
      categorias: { valor: string; nombre: string }[]
      potreros: string[]
    }
    if (!Array.isArray(hojas) || hojas.length === 0) return json({ error: 'Falta la muestra de la planilla' }, 400)
    const cats = (Array.isArray(categorias) ? categorias : []).filter((c) => /^[a-z_]+$/.test(c?.valor ?? ''))
    const pots = (Array.isArray(potreros) ? potreros : []).filter((p) => typeof p === 'string' && p.trim()).slice(0, 300)
    if (cats.length === 0) return json({ error: 'Faltan las categorías' }, 400)

    const indice = { type: ['integer', 'null'] }
    const schema = {
      type: 'object',
      properties: {
        hoja: { type: 'integer' },
        fila_titulos: { type: 'integer' },
        columnas: {
          type: 'object',
          properties: Object.fromEntries(COLUMNAS.map((c) => [c, indice])),
          required: [...COLUMNAS],
          additionalProperties: false,
        },
        categorias: {
          type: 'array',
          items: {
            type: 'object',
            properties: { texto: { type: 'string' }, categoria: { anyOf: [{ type: 'string', enum: cats.map((c) => c.valor) }, { type: 'null' }] } },
            required: ['texto', 'categoria'],
            additionalProperties: false,
          },
        },
        potreros: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              texto: { type: 'string' },
              potrero: pots.length ? { anyOf: [{ type: 'string', enum: pots }, { type: 'null' }] } : { type: 'null' },
            },
            required: ['texto', 'potrero'],
            additionalProperties: false,
          },
        },
        fecha: { anyOf: [{ type: 'string', enum: ['dia_mes_anio', 'mes_dia_anio', 'anio_mes_dia'] }, { type: 'null' }] },
      },
      required: ['hoja', 'fila_titulos', 'columnas', 'categorias', 'potreros', 'fecha'],
      additionalProperties: false,
    }

    const anthropic = new Anthropic({ apiKey })
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system: PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            categorias: cats.map((c) => `${c.valor} (${c.nombre})`),
            potreros: pots,
            hojas: hojas.slice(0, 5),
          }),
        },
      ],
    } as Anthropic.MessageCreateParamsNonStreaming)

    if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') return json({ error: 'No se pudo interpretar la planilla' }, 502)
    const bloque = msg.content.find((b) => b.type === 'text')
    if (!bloque || bloque.type !== 'text') return json({ error: 'No se pudo interpretar la planilla' }, 502)
    return json(JSON.parse(bloque.text))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return json({ error: message }, 500)
  }
})
