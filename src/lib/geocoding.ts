/**
 * Localidades argentinas por nombre, vía Open-Meteo Geocoding (gratis, sin
 * clave, CORS abierto — el mismo proveedor del pronóstico). El productor
 * escribe "Pehuajó" y elige "Pehuajó, Buenos Aires": de ahí salen la
 * provincia y el centro para el clima, sin listas que tipear.
 */
export type Localidad = {
  nombre: string
  /** Provincia (admin1 de Open-Meteo), ej. "Buenos Aires", "Córdoba". */
  provincia: string
  lat: number
  lon: number
}

export async function buscarLocalidades(texto: string): Promise<Localidad[]> {
  const q = texto.trim()
  if (q.length < 2) return []
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
    `&count=8&language=es&countryCode=AR`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`geocoding ${res.status}`)
  const j = (await res.json()) as {
    results?: {
      name: string
      admin1?: string
      latitude: number
      longitude: number
      feature_code?: string
    }[]
  }
  return depurarResultados(j.results ?? [])
}

/**
 * Sólo pueblos y ciudades: Open-Meteo mezcla aeródromos ("Aeropuerto de Río
 * Cuarto", "Chascomus North") que el productor no busca y que dejan el clima
 * en una pista. Los lugares poblados son los de código PPL* de GeoNames.
 */
export function depurarResultados(
  results: { name: string; admin1?: string; latitude: number; longitude: number; feature_code?: string }[],
): Localidad[] {
  const vistos = new Set<string>()
  return results.flatMap((r) => {
    if (r.feature_code && !r.feature_code.startsWith('PPL')) return []
    const nombre = normalizarNombre(r.name)
    const provincia = normalizarProvincia(r.admin1 ?? '')
    const clave = `${nombre}|${provincia}`
    // Open-Meteo repite la misma localidad como ciudad y como partido.
    if (vistos.has(clave)) return []
    vistos.add(clave)
    return [{ nombre, provincia, lat: r.latitude, lon: r.longitude }]
  })
}

/** "Ciudad de Río Cuarto" → "Río Cuarto": el productor escribe el nombre, no el título. */
function normalizarNombre(nombre: string): string {
  return nombre.replace(/^Ciudad de /i, '')
}

/** Open-Meteo trae "Buenos Aires" también para la Ciudad; "Provincia de …" o "Provincia del …" a veces. */
function normalizarProvincia(admin1: string): string {
  return admin1.replace(/^Provincia del? /i, '').replace(/^Ciudad Autónoma de Buenos Aires$/i, 'CABA')
}

export function etiquetaLocalidad(l: Pick<Localidad, 'nombre' | 'provincia'>): string {
  return l.provincia ? `${l.nombre}, ${l.provincia}` : l.nombre
}
