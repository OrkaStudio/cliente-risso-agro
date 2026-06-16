import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

/**
 * noticias-agro — agrega titulares de medios del agro (RSS) y los devuelve
 * como JSON. Corre en el server (sin el problema de CORS del browser).
 * Solo lee feeds públicos: no toca la DB ni usa service_role.
 */

const FEEDS = [
  { fuente: 'Infocampo', url: 'https://www.infocampo.com.ar/feed/' },
  { fuente: 'Valor Carne', url: 'https://www.valorcarne.com.ar/feed/' },
  { fuente: 'Bichos de Campo', url: 'https://www.bichosdecampo.com/feed/' },
]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/&#8211;/g, '–')
    .replace(/&aacute;/g, 'á')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .trim()
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return m ? decode(m[1]) : ''
}

type Noticia = { titulo: string; link: string; fecha: string; fuente: string }

function parseFeed(xml: string, fuente: string): Noticia[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? []
  const out: Noticia[] = []
  for (const block of items) {
    const titulo = pick(block, 'title')
    const link = pick(block, 'link')
    const fecha = pick(block, 'pubDate')
    if (titulo && link) out.push({ titulo, link, fecha, fuente })
  }
  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  const settled = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const r = await fetch(f.url, { signal: AbortSignal.timeout(8000) })
      if (!r.ok) return [] as Noticia[]
      return parseFeed(await r.text(), f.fuente)
    }),
  )

  const todas = settled.flatMap((s) =>
    s.status === 'fulfilled' ? s.value : [],
  )
  todas.sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  )

  return new Response(JSON.stringify({ noticias: todas.slice(0, 8) }), {
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=900',
    },
  })
})
