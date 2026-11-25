import jpeg from 'npm:jpeg-js@0.4.4'
import { imagenMapa } from '../../functions/wa-webhook/mapa-imagen.ts'
import { svgMapa } from '../../functions/_shared/wa/mapa-svg.ts'
const sample = { id: 'campo-qa', nombre: 'Campo de ejemplo · La Porteña', potreros: [
  { id: '7b', nombre: '7B', poligono: [[-36,-59],[-36,-58.99],[-36.01,-58.99],[-36.01,-59]] },
  { id: '8b', nombre: '8B', poligono: [[-36,-58.99],[-36,-58.98],[-36.01,-58.98],[-36.01,-58.99]] },
  { id: '11b', nombre: '11B', poligono: [[-36.01,-59],[-36.01,-58.98],[-36.022,-58.98],[-36.022,-59]] },
  { id: '4b', nombre: '4B', poligono: null },
] }
Deno.test('PNG real, nombres acentuados, cache y faltantes', async () => {
  const offline: typeof fetch = async () => { throw Error('Sin conexión al proveedor') }
  const t = performance.now(), image = await imagenMapa(sample, '2026-10-13', offline)
  if (!image || image.bytes[0] !== 137 || image.bytes[1] !== 80 || image.dibujados !== 3 || image.faltantes[0] !== '4B') throw Error('PNG/contadores incorrectos')
  const model = svgMapa(sample, '2026-10-13')!
  await Deno.mkdir('output/wa-mapa', { recursive: true })
  await Deno.writeFile('output/wa-mapa/mapa-ejemplo.png', image.bytes)
  await Deno.writeTextFile('output/wa-mapa/mapa-ejemplo.svg', model.svg)
  const warm = await imagenMapa(sample, '2026-10-13', offline)
  if (warm?.bytes !== image.bytes) throw Error('No reutiliza imagen idéntica')
  const changed = await imagenMapa({ ...sample, nombre: 'Nombre corregido' }, '2026-10-13', offline)
  if (changed?.bytes === image.bytes) throw Error('Cache no invalida cambio')
  console.log(JSON.stringify({ bytes:image.bytes.length, width:model.width,height:model.height,elapsed_ms:Math.round(performance.now()-t), network_requests:0 }))
})

Deno.test('la vista general y los detalles reutilizan la misma descarga de fondo', async () => {
  const jpegBytes = new Uint8Array(jpeg.encode({
    data: new Uint8Array(64 * 64 * 4).fill(170), width: 64, height: 64,
  }, 75).data)
  const campo = { ...sample, id: 'qa-fondo-compartido' }
  let llamadas = 0
  let inicio!: () => void
  let continuar!: () => void
  const iniciada = new Promise<void>(r => { inicio = r })
  const espera = new Promise<void>(r => { continuar = r })
  const proveedor: typeof fetch = async () => {
    llamadas++
    inicio()
    await espera
    return new Response(jpegBytes.slice(), { headers: { 'content-type': 'image/jpeg' } })
  }
  const general = imagenMapa(campo, '2026-10-13', proveedor)
  await iniciada
  const detalle = imagenMapa(campo, '2026-10-13', proveedor, '7b')
  continuar()
  const [vista, acercamiento] = await Promise.all([general, detalle])
  const otro = await imagenMapa(campo, '2026-10-13', proveedor, '8b')
  if (![vista, acercamiento, otro].every(r => r?.satelital && r.bytes[0] === 255 && r.bytes[1] === 216)) {
    throw Error('La vista general y los detalles deben ser JPEG con fondo')
  }
  if (Number(llamadas) !== 1) throw Error('El mismo encuadre se descargó más de una vez')
  await imagenMapa({ ...campo, id: 'qa-otro-campo' }, '2026-10-13', proveedor, '7b')
  if (Number(llamadas) !== 2) throw Error('La caché reutilizó el fondo para otro campo')
})
