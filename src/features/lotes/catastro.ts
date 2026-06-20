// Consulta de parcelas al catastro de la Provincia de Buenos Aires (ARBA),
// vía el WFS público de GeoARBA (CORS abierto, sin token). Devuelve el contorno
// real de la parcela rural a partir de la nomenclatura catastral
// (Partido / Circunscripción / Parcela). Verificado contra geo.arba.gov.ar.
import type { LatLng } from '@/features/lotes/geo'

const WFS = 'https://geo.arba.gov.ar/geoserver/idera/wfs'

const ROMANOS: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
  XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15,
}

/** Circunscripción: acepta romano ("II") o número ("2") → "02". */
function circ2(v: string): string {
  const s = v.trim().toUpperCase()
  const n = ROMANOS[s] ?? parseInt(s, 10)
  return String(Number.isNaN(n) ? 0 : n).padStart(2, '0')
}

export type ParcelaCatastro = {
  cca: string
  areaHa: number
  anillo: LatLng[] // anillo exterior [lat, lng]
}

/**
 * Busca parcelas rurales por nomenclatura. El `cca` rural tiene la forma
 * `PPP CC <ceros> PARCELA 000`, así que filtramos por esos extremos.
 */
export async function buscarParcelaRural(input: {
  partido: string
  circ: string
  parcela: string
}): Promise<ParcelaCatastro[]> {
  const ppp = input.partido.trim().replace(/\D/g, '').padStart(3, '0')
  if (ppp === '000') throw new Error('Falta el partido')
  // Circunscripción es opcional: partido + parcela suele alcanzar.
  const cc = input.circ.trim() ? circ2(input.circ) : ''
  // La parcela puede tener letra (ej. "1758A"). En el cca el final es
  // `<numero> + 00 + <letra o 0>` → "175800A" / "385000".
  const raw = input.parcela.trim().toUpperCase()
  const num = raw.replace(/[^0-9]/g, '')
  if (!num) throw new Error('Falta el número de parcela')
  const suf = /[A-Z]$/.test(raw) ? raw.slice(-1) : '0'
  const tail = `${num}00${suf}`

  const cql = `cca LIKE '${ppp}${cc}%${tail}'`
  const url =
    `${WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeNames=idera:Parcela&outputFormat=application/json` +
    `&srsName=EPSG:4326&count=12&CQL_FILTER=${encodeURIComponent(cql)}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Catastro respondió ${res.status}`)
  const json = (await res.json()) as {
    features?: {
      geometry: { type: string; coordinates: number[][][] | number[][][][] }
      properties?: { cca?: string; ara1?: number }
    }[]
  }

  const out: ParcelaCatastro[] = []
  for (const f of json.features ?? []) {
    const g = f.geometry
    if (!g) continue
    const ring = (
      g.type === 'MultiPolygon'
        ? (g.coordinates as number[][][][])[0]?.[0]
        : (g.coordinates as number[][][])[0]
    ) as number[][] | undefined
    if (!ring || ring.length < 3) continue
    out.push({
      cca: f.properties?.cca ?? '',
      areaHa: Math.round(((f.properties?.ara1 ?? 0) / 10000) * 100) / 100,
      anillo: ring.map((p) => [p[1], p[0]] as LatLng),
    })
  }
  // las parcelas más grandes primero (suelen ser la rural buscada)
  return out.sort((a, b) => b.areaHa - a.areaHa)
}
