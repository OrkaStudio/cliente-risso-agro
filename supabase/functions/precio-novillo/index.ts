// Edge function: precio-novillo
//
// Trae el precio promedio del NOVILLO del Mercado Agroganadero de Cañuelas
// (la referencia del país) para que nadie tenga que escribirlo: alimenta el
// ticker y el alquiler pactado en kilos. La tabla diaria "Precios por
// Categoría" responde a un POST simple sin login; la página no manda CORS,
// por eso pasa por acá y no por el navegador.
//
// GET ?fecha=YYYY-MM-DD (opcional; default: hoy, y si no hubo remate busca
// hacia atrás hasta 7 días — fin de semana y feriados).
// Respuesta: { valor, fecha, fuente, categorias: [{nombre, promedio, cabezas}] }
// valor = promedio general de NOVILLOS ($/kg vivo).
//
// Cache: se guarda en memoria del worker por fecha; el cliente además la
// cachea 12 h. Con JWT: es un dato público, pero no es un endpoint abierto.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const URL_CANUELAS = 'https://www.mercadoagroganadero.com.ar/dll/hacienda1.dll/haciinfo000502'
const FUENTE = 'Mercado Agroganadero de Cañuelas'

type Categoria = { nombre: string; promedio: number; cabezas: number }
type Resultado = { valor: number; fecha: string; fuente: string; categorias: Categoria[] }

const cache = new Map<string, Resultado | null>()

function ddmmaaaa(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function restarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))

/** Parsea la tabla: filas "NOVILLOS <sub> <min> <max> <promedio> <mediana> <cabezas> ..." y la fila de total. */
function parsear(html: string): Resultado | null {
  const texto = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
  const bloque = texto.match(/NOVILLOS\b.*?(?=NOVILLITOS\b|VACAS\b|$)/)?.[0]
  if (!bloque) return null
  const filas = [...bloque.matchAll(/NOVILLOS\s+([A-Za-zñÑ.+\- ]+?)\s+(\d{3,4})?\s*([\d.]+,\d{3})\s+([\d.]+,\d{3})\s+([\d.]+,\d{3})\s+([\d.]+,\d{3})\s+(\d+)\s+\$/g)]
  const categorias: Categoria[] = filas.map((m) => ({
    nombre: `Novillos ${m[1]!.trim()}`,
    promedio: num(m[5]!),
    cabezas: Number(m[7]),
  }))
  // Fila de totales del bloque: "------- ... <promedio general> <cabezas> $..."
  const total = bloque.match(/-{5,}[\s-]*([\d.]+,\d{3})\s+(\d+)\s+\$/)
  const valor = total ? num(total[1]!) : categorias.length ? categorias.reduce((s, c) => s + c.promedio * c.cabezas, 0) / categorias.reduce((s, c) => s + c.cabezas, 0) : null
  if (!valor || !Number.isFinite(valor)) return null
  return { valor: Math.round(valor * 100) / 100, fecha: '', fuente: FUENTE, categorias }
}

async function traer(fecha: string): Promise<Resultado | null> {
  if (cache.has(fecha)) return cache.get(fecha)!
  const body = new URLSearchParams({
    ID: '', CP: '', FLASH: '', USUARIO: 'SIN IDENTIFICAR', OPCIONMENU: '', OPCIONSUBMENU: '',
    txtFechaIni: ddmmaaaa(fecha), txtFechaFin: ddmmaaaa(fecha),
  })
  const res = await fetch(URL_CANUELAS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 (risso-agro)' },
    body,
  })
  if (!res.ok) throw new Error(`Cañuelas ${res.status}`)
  const html = new TextDecoder('latin1').decode(await res.arrayBuffer())
  const r = parsear(html)
  const out = r ? { ...r, fecha } : null
  cache.set(fecha, out)
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'GET') return json({ error: 'GET' }, 405)
  const url = new URL(req.url)
  const hoy = new Date().toISOString().slice(0, 10)
  const pedida = url.searchParams.get('fecha') ?? hoy
  try {
    // Sin remate ese día (fin de semana, feriado): el último disponible.
    for (let i = 0; i < 7; i++) {
      const fecha = restarDias(pedida, i)
      const r = await traer(fecha)
      if (r) return json(r)
    }
    return json({ error: 'Sin precios en los últimos 7 días' }, 404)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'error' }, 502)
  }
})
