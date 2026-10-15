import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2'
import jpeg from 'npm:jpeg-js@0.4.4'
import { geometriaMapa,svgMapa,type FondoSatelital } from '../_shared/wa/mapa-svg.ts'
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
/** Recortar antes de escalar evita que WASM expanda la foto entera a cientos
 * de megapíxeles para mostrar una parcela pequeña. Conserva el encuadre real. */
function recortarFondo(datos:MapaCampo,fondo:FondoSatelital,focoId:string):FondoSatelital{
  if(!fondo.extent)return fondo
  const target=geometriaMapa(datos,focoId)!.extent,source=fondo.extent
  const bytes=Uint8Array.from(atob(fondo.dataUri.split(',')[1]),c=>c.charCodeAt(0))
  const image=jpeg.decode(bytes,{useTArray:true,maxResolutionInMP:4,maxMemoryUsageInMB:48})
  const dx=source[2]-source[0],dy=source[3]-source[1]
  const x0=Math.max(0,Math.floor((target[0]-source[0])/dx*image.width)),y0=Math.max(0,Math.floor((source[3]-target[3])/dy*image.height))
  const x1=Math.min(image.width,Math.ceil((target[2]-source[0])/dx*image.width)),y1=Math.min(image.height,Math.ceil((source[3]-target[1])/dy*image.height))
  const width=x1-x0,height=y1-y0
  if(width<1||height<1)throw Error('El detalle quedó fuera de la foto de referencia')
  const pixels=new Uint8Array(width*height*4)
  for(let y=0;y<height;y++)pixels.set(image.data.subarray(((y0+y)*image.width+x0)*4,((y0+y)*image.width+x1)*4),y*width*4)
  const cropped=jpeg.encode({data:pixels,width,height},92).data
  let binary=''
  for(let i=0;i<cropped.length;i+=8192)binary+=String.fromCharCode(...cropped.subarray(i,i+8192))
  return {...fondo,dataUri:`data:image/jpeg;base64,${btoa(binary)}`,extent:[source[0]+x0/image.width*dx,source[3]-y1/image.height*dy,source[0]+x1/image.width*dx,source[3]-y0/image.height*dy]}
}
/** Foto de Esri + límites locales; PNG privado, autorizado antes del cache. */
export async function imagenMapa(datos: MapaCampo, fecha: string, fetcher: typeof fetch = fetch, focoId?: string) {
  const base = svgMapa(datos, fecha, undefined, focoId)
  if (!base) return null
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base.svg)))].map(v => v.toString(16).padStart(2, '0')).join('')
  const cached = cache.get(hash)
  if (cached && cached.vence > Date.now()) return cached.imagen
  const general = await fondoSatelital(datos, fetcher)
  const fondo = general && focoId ? recortarFondo(datos,general,focoId) : general
  const model = fondo ? svgMapa(datos, fecha, fondo, focoId)! : base
  await preparar()
  const render = new Resvg(model.svg, { font: { fontBuffers: [font], defaultFontFamily: 'Inter' } })
  let bytes: Uint8Array
  try { const image = render.render(); try { bytes = fondo ? new Uint8Array(jpeg.encode({ data: image.pixels, width: image.width, height: image.height }, 82).data) : image.asPng() } finally { image.free() } } finally { render.free() }
  if (bytes.length > 5 * 1024 * 1024) throw new Error('La imagen supera el límite de WhatsApp')
  if (cache.size >= 8) cache.delete(cache.keys().next().value!)
  const imagen = { bytes, dibujados: model.dibujados, faltantes: model.faltantes, satelital: !!fondo }
  cache.set(hash, { imagen, vence: Date.now() + (fondo ? 30 * 60 * 1000 : 10 * 1000) })
  return imagen
}
