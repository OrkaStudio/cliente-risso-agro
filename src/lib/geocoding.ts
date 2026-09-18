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
    results?: { name: string; admin1?: string; latitude: number; longitude: number }[]
  }
  const vistos = new Set<string>()
  return (j.results ?? []).flatMap((r) => {
    const provincia = normalizarProvincia(r.admin1 ?? '')
    const clave = `${r.name}|${provincia}`
    // Open-Meteo repite la misma localidad como ciudad y como partido.
    if (vistos.has(clave)) return []
    vistos.add(clave)
    return [{ nombre: r.name, provincia, lat: r.latitude, lon: r.longitude }]
  })
}

/** Open-Meteo trae "Buenos Aires" también para la Ciudad; "Provincia de …" a veces. */
function normalizarProvincia(admin1: string): string {
  return admin1.replace(/^Provincia de /i, '').replace(/^Ciudad Autónoma de Buenos Aires$/i, 'CABA')
}

export function etiquetaLocalidad(l: Pick<Localidad, 'nombre' | 'provincia'>): string {
  return l.provincia ? `${l.nombre}, ${l.provincia}` : l.nombre
}
