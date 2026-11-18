import { geometriaMapa, type FondoSatelital } from './mapa-svg.ts'
import type { MapaCampo } from './mapa.ts'

const servicio = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export'
const atribucion = 'Fuente: Esri, Vantor, Earthstar Geographics y la comunidad GIS.'
const limite = 4 * 1024 * 1024

export function pedidoSatelital(datos: MapaCampo, focoId?: string): string | null {
  const geo = geometriaMapa(datos, focoId)
  if (!geo) return null
  // Bbox y raster tienen exactamente la misma proporción en Web Mercator.
  const params = new URLSearchParams({ bbox: geo.extent.join(','), bboxSR: '3857', imageSR: '3857',
    size: `${geo.mapW},${geo.mapH}`, format: 'jpg', f: 'image' })
  return `${servicio}?${params}`
}

/** Sólo envía al proveedor el encuadre; no nombres, reportes, usuarios ni GPS. */
export async function fondoSatelital(datos: MapaCampo, fetcher: typeof fetch = fetch): Promise<FondoSatelital | null> {
  // El detalle recorta la misma referencia geográfica. Exportar parcelas muy
  // pequeñas devolvió 500 «bytes» del proveedor; no inventar resolución adicional.
  const url = pedidoSatelital(datos)
  if (!url) return null
  const inicio = performance.now()
  let intentos = 1
  let estado: number | undefined
  let fase: 'conexion' | 'lectura' = 'conexion'
  const fallo = (motivo: string) => {
    console.warn('wa-webhook fondo satelital', { motivo, estado, intentos, ms: Math.round(performance.now() - inicio) })
    return null
  }
  try {
    let response = await fetcher(url, { redirect: 'error' })
    estado = response.status
    if (estado === 429 || estado >= 500) {
      await response.body?.cancel().catch(() => {})
      intentos++
      response = await fetcher(url, { redirect: 'error' })
      estado = response.status
    }
    const rechazo = !response.ok ? 'http'
      : !response.headers.get('content-type')?.toLowerCase().startsWith('image/jpeg') ? 'tipo'
      : Number(response.headers.get('content-length')) > limite ? 'tamaño' : null
    if (rechazo) {
      await response.body?.cancel().catch(() => {})
      return fallo(rechazo)
    }
    const reader = response.body?.getReader()
    if (!reader) return fallo('cuerpo vacío')
    fase = 'lectura'
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      for (;;) {
        const next = await reader.read()
        if (next.done) break
        length += next.value.length
        if (length > limite) { await reader.cancel().catch(() => {}); return fallo('tamaño') }
        chunks.push(next.value)
      }
    } finally { reader.releaseLock() }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[length - 2] !== 0xff || bytes[length - 1] !== 0xd9) return fallo('jpeg inválido')
    let binary = ''
    for (let i = 0; i < length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    return { dataUri: `data:image/jpeg;base64,${btoa(binary)}`, atribucion, extent: geometriaMapa(datos)!.extent }
  } catch { return fallo(fase) }
}
