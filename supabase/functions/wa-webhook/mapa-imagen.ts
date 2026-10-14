import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2'
import { svgMapa } from '../_shared/wa/mapa-svg.ts'
import type { MapaCampo } from '../_shared/wa/mapa.ts'
import { fondoSatelital } from '../_shared/wa/mapa-satelital.ts'

let init: Promise<void> | null = null
let font: Uint8Array
async function preparar() {
  if (!init) init = (async () => {
    const [wasm, bytes] = await Promise.all([
      Deno.readFile(new URL('./mapa-assets/resvg.wasm', import.meta.url)),
      Deno.readFile(new URL('./mapa-assets/Inter.ttf', import.meta.url)),
    ])
    font = bytes; await initWasm(wasm)
  })().catch(e => { init = null; throw e })
  await init
}
type Imagen = { bytes: Uint8Array; dibujados: number; faltantes: string[]; satelital: boolean }
const cache = new Map<string, { imagen: Imagen; vence: number }>()
/** Foto de Esri + límites locales; PNG privado, autorizado antes del cache. */
export async function imagenMapa(datos: MapaCampo, fecha: string, fetcher: typeof fetch = fetch) {
  const base = svgMapa(datos, fecha)
  if (!base) return null
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base.svg)))].map(v => v.toString(16).padStart(2, '0')).join('')
  const cached = cache.get(hash)
  if (cached && cached.vence > Date.now()) return cached.imagen
  const fondo = await fondoSatelital(datos, fetcher)
  const model = fondo ? svgMapa(datos, fecha, fondo)! : base
  await preparar()
  const render = new Resvg(model.svg, { font: { fontBuffers: [font], defaultFontFamily: 'Inter' } })
  let bytes: Uint8Array
  try { const png = render.render(); try { bytes = png.asPng() } finally { png.free() } } finally { render.free() }
  if (bytes.length > 5 * 1024 * 1024) throw new Error('El PNG supera el límite de WhatsApp')
  if (cache.size >= 8) cache.delete(cache.keys().next().value!)
  const imagen = { bytes, dibujados: model.dibujados, faltantes: model.faltantes, satelital: !!fondo }
  cache.set(hash, { imagen, vence: Date.now() + (fondo ? 30 * 60 * 1000 : 10 * 1000) })
  return imagen
}
