/**
 * Google Map Tiles API (2D) para el satélite del mapa de Campos.
 *
 * Por qué Google: en la pampa Esri termina en zoom 17 (~1 m/px) y la imagen
 * suele ser vieja; Google llega a 19–20 con vuelos recientes, y es la imagen
 * que el productor ya conoce de Google Maps. 100.000 tiles/mes gratis; después
 * US$0,60 cada 1.000 (TASK-060).
 *
 * Cómo funciona: la API exige una SESIÓN (token válido ~14 días) creada con
 * el tipo de mapa; los tiles se piden con ese token. La clave es pública
 * (restringida por dominio en Google Cloud). Si no hay clave o la sesión
 * falla, el mapa cae a Esri: nunca se queda sin imagen.
 *
 * Condición de licencia: mostrar el logo de Google y la atribución que
 * devuelve `viewport` para la zona visible. Lo hace el mapa.
 */

const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined
const STORAGE = 'google-tiles-session'

type Sesion = { session: string; expiry: number; mapType: 'satellite' | 'overlay' }

export function googleTilesDisponible(): boolean {
  return Boolean(KEY)
}

function leerSesion(mapType: Sesion['mapType']): Sesion | null {
  try {
    const raw = localStorage.getItem(`${STORAGE}:${mapType}`)
    if (!raw) return null
    const s = JSON.parse(raw) as Sesion
    // Renovar un día antes de que venza.
    return s.expiry - 86_400 > Date.now() / 1000 ? s : null
  } catch {
    return null
  }
}

/**
 * Sesión de tiles. `satellite` = imagen; `overlay` = caminos y nombres
 * transparentes para superponer (reemplaza las capas de referencia de Esri).
 */
export async function sesionGoogle(mapType: Sesion['mapType']): Promise<Sesion | null> {
  if (!KEY) return null
  const cache = leerSesion(mapType)
  if (cache) return cache
  const body =
    mapType === 'satellite'
      ? { mapType: 'satellite', language: 'es-AR', region: 'AR' }
      : {
          mapType: 'roadmap',
          layerTypes: ['layerRoadmap'],
          overlay: true,
          language: 'es-AR',
          region: 'AR',
        }
  const res = await fetch(`https://tile.googleapis.com/v1/createSession?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  const j = (await res.json()) as { session: string; expiry: string }
  const s: Sesion = { session: j.session, expiry: Number(j.expiry), mapType }
  try {
    localStorage.setItem(`${STORAGE}:${mapType}`, JSON.stringify(s))
  } catch {
    /* sin storage: se pide de nuevo la próxima vez */
  }
  return s
}

export function urlTilesGoogle(sesion: Sesion): string {
  return `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${sesion.session}&key=${KEY}`
}

/**
 * Atribución de la zona visible (exigida por Google). Devuelve el texto o
 * null si falla — en ese caso el mapa muestra sólo "Google".
 */
export async function atribucionGoogle(
  sesion: Sesion,
  b: { north: number; south: number; east: number; west: number; zoom: number },
): Promise<string | null> {
  try {
    const q = new URLSearchParams({
      session: sesion.session,
      key: KEY!,
      zoom: String(Math.round(b.zoom)),
      north: String(b.north),
      south: String(b.south),
      east: String(b.east),
      west: String(b.west),
    })
    const res = await fetch(`https://tile.googleapis.com/tile/v1/viewport?${q}`)
    if (!res.ok) return null
    const j = (await res.json()) as { copyright?: string }
    return j.copyright ?? null
  } catch {
    return null
  }
}
