// Edge function: landing-evento
//
// Recibe los avisos anónimos de la landing (troppero.com): una visita, un toque en «Probalo por
// WhatsApp» o la elección de un horario. Los guarda en interno.landing_evento para el tramo de
// arriba del embudo en la planilla viva (`planilla-telemetria`).
//
// Público y sin JWT (la landing no tiene sesión). Barreras: sólo acepta el origen de la landing,
// cuerpos chicos, valores de una lista cerrada y un tope por conexión. No guarda IP ni nada que
// identifique a la persona. La landing lo llama con navigator.sendBeacon (texto plano, sin preflight).

import postgres from 'npm:postgres@3.4.5'

const ORIGENES = new Set(['https://troppero.com', 'https://www.troppero.com'])
const TIPOS = new Set(['visita', 'whatsapp', 'horario'])
const DISPOSITIVOS = new Set(['movil', 'escritorio'])

// Tope simple por IP dentro de esta instancia (la IP no se guarda en la base).
const VENTANA_MS = 60_000
const TOPE = 30
const vistos = new Map<string, { desde: number; n: number }>()
function pasado(ip: string): boolean {
  const ahora = Date.now()
  const v = vistos.get(ip)
  if (!v || ahora - v.desde > VENTANA_MS) {
    vistos.set(ip, { desde: ahora, n: 1 })
    if (vistos.size > 5000) vistos.clear()
    return false
  }
  v.n++
  return v.n > TOPE
}

const texto = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().replace(/[\u0000-\u001f]/g, '').slice(0, max) : null

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 })

Deno.serve(async (req) => {
  const origen = req.headers.get('origin') ?? ''
  const cors: Record<string, string> = ORIGENES.has(origen) ? { 'Access-Control-Allow-Origin': origen, Vary: 'Origin' } : {}
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST' } })
  if (req.method !== 'POST' || !ORIGENES.has(origen)) return new Response(null, { status: 403 })

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
  if (ip && pasado(ip)) return new Response(null, { status: 429, headers: cors })

  const cuerpo = await req.text()
  if (cuerpo.length > 600) return new Response(null, { status: 413, headers: cors })
  let d: Record<string, unknown>
  try {
    d = JSON.parse(cuerpo)
  } catch {
    return new Response(null, { status: 400, headers: cors })
  }
  if (!TIPOS.has(String(d.tipo))) return new Response(null, { status: 400, headers: cors })
  const dispositivo = DISPOSITIVOS.has(String(d.dispositivo)) ? String(d.dispositivo) : null

  try {
    await sql`
      insert into interno.landing_evento (tipo, donde, origen, dispositivo)
      values (${String(d.tipo)}, ${texto(d.donde, 40)}, ${texto(d.origen, 60)}, ${dispositivo})`
  } catch (err) {
    console.error('[landing-evento]', err)
    return new Response(null, { status: 500, headers: cors })
  }
  return new Response(null, { status: 204, headers: cors })
})
