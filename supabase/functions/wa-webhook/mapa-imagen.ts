import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2'
import { svgMapa } from '../_shared/wa/mapa-svg.ts'
import type { MapaCampo } from '../_shared/wa/mapa.ts'

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
const cache = new Map<string, Uint8Array>()
/** Assets locales y WASM; no transmite coordenadas a un render externo. */
export async function imagenMapa(datos: MapaCampo, fecha: string) {
  const model = svgMapa(datos, fecha)
  if (!model) return null
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(model.svg)))].map(v => v.toString(16).padStart(2, '0')).join('')
  let bytes = cache.get(hash)
  if (!bytes) {
    await preparar()
    const render = new Resvg(model.svg, { font: { fontBuffers: [font], defaultFontFamily: 'Inter' } })
    try { const png = render.render(); try { bytes = png.asPng() } finally { png.free() } } finally { render.free() }
    if (bytes.length > 5 * 1024 * 1024) throw new Error('El PNG supera el límite de WhatsApp')
    if (cache.size >= 8) cache.delete(cache.keys().next().value!)
    cache.set(hash, bytes)
  }
  return { bytes, dibujados: model.dibujados, faltantes: model.faltantes }
}
