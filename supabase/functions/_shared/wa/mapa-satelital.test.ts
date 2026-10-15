import { describe, expect, it } from 'vitest'
import { fondoSatelital, pedidoSatelital } from './mapa-satelital.ts'
import { geometriaMapa, proyectarMapa, svgMapa } from './mapa-svg.ts'
import { atenderMapa } from './mapa.ts'

const campo = { id: 'campo', nombre: 'Campo privado', potreros: [{ id: 'a', nombre: '7B',
  poligono: [[-36, -59], [-36, -58.99], [-36.01, -58.99], [-36.01, -59]] }] }

describe('Satélite georreferenciado para WhatsApp', () => {
  it('encuadre y proyección del raster coinciden con las esquinas de los polígonos', () => {
    const geo = geometriaMapa(campo)!, url = new URL(pedidoSatelital(campo)!)
    const [x0, y0, x1, y1] = url.searchParams.get('bbox')!.split(',').map(Number)
    expect((x1 - x0) / (y1 - y0)).toBeCloseTo(geo.mapW / geo.mapH, 9)
    expect(url.searchParams.get('bboxSR')).toBe('3857')
    expect(url.searchParams.get('imageSR')).toBe('3857')
    for (const p of campo.potreros[0].poligono) {
      const [mx, my] = proyectarMapa(p as [number, number]), [sx, sy] = geo.point(p as [number, number])
      expect((sx - geo.mapX) / geo.mapW).toBeCloseTo((mx - x0) / (x1 - x0), 10)
      expect((sy - geo.mapY) / geo.mapH).toBeCloseTo((y1 - my) / (y1 - y0), 10)
      expect(sx).toBeGreaterThan(geo.mapX); expect(sy).toBeGreaterThan(geo.mapY)
    }
    expect(proyectarMapa([0, 0])[0]).toBe(0)
    expect(proyectarMapa([45, 0])[1]).toBeCloseTo(5621521.486, 2)
  })
  it('el proveedor recibe sólo el encuadre, nunca nombres ni geometrías del reporte', () => {
    const url = pedidoSatelital(campo)!
    expect(new URL(url).hostname).toBe('server.arcgisonline.com')
    expect(url).not.toContain('privado'); expect(url).not.toContain('7B')
  })
  it('sin dibujos no consulta al proveedor ni inventa un fondo', async () => {
    let requests = 0
    expect(await fondoSatelital({ ...campo, potreros: [] }, async () => { requests++; throw Error() })).toBeNull()
    expect(requests).toBe(0)
  })
  it.each([
    new Response('error', { status: 503 }),
    new Response('{"error":"token required"}', { headers: { 'content-type': 'application/json' } }),
    new Response('html', { headers: { 'content-type': 'image/jpeg' } }),
    new Response(new Uint8Array([255, 216, 255, 217]), { headers: { 'content-type': 'image/jpeg', 'content-length': '5000000' } }),
  ])('usa respaldo ante respuesta inválida del proveedor %#', async response => {
    expect(await fondoSatelital(campo, async () => response)).toBeNull()
  })
  it('un proveedor sin conexión conserva la posibilidad de responder', async () => {
    expect(await fondoSatelital(campo, async () => { throw Error('sin red') })).toBeNull()
  })
  it('el satélite conserva nombres y atribución, sin leyenda duplicada ni rellenos', () => {
    const r = svgMapa(campo, '2026-10-14', { dataUri: 'data:image/jpeg;base64,/9j/2Q==', atribucion: 'Fuente: Esri & colaboradores' })!
    expect(r.svg).toContain('<image ')
    expect(r.svg).toContain('Fuente: Esri &amp; colaboradores')
    expect(r.svg).toContain('7B'); expect(r.svg).toContain('stroke="#fff3b3"')
    expect(r.svg).not.toMatch(/<polygon [^>]*fill="(?!none)/)
    expect(r.svg).not.toMatch(/href="https?:/)
    expect(r.svg).toContain('Imagen de referencia')
    expect(r.svg).not.toContain('Todos los potreros')
    expect(r.height).toBe(1220)
    expect(() => svgMapa(campo, '2026-10-14', { dataUri: 'https://ajeno.example/foto', atribucion: '' })).toThrow()
  })
  it('el croquis de respaldo avisa que el satélite falló sin descartar una carga', async () => {
    let caption = ''
    await atenderMapa(campo, { datos: async () => campo,
      render: async () => ({ bytes: new Uint8Array(), dibujados: 1, faltantes: [], satelital: false }),
      enviarImagen: async (_, text) => { caption = text }, responder: async () => {} })
    expect(caption).toContain('satélite no está disponible')
    expect(caption).toContain('acercá')
    expect(caption).not.toContain('referencia están en la lista')
  })
})
