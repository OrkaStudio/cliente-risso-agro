import { describe, expect, it } from 'vitest'
import { atenderMapa, campoParaMapa, comandoMapa, elegirMapa, noRecuerdaPotrero, type MapaCampo } from './mapa.ts'
import { poligonoMapa, svgMapa } from './mapa-svg.ts'
import { arrancar, conUbicacion, leer, siguientePaso } from './conversacion.ts'
import { payloadImagen } from '../../wa-webhook/meta.ts'
import type { Contexto, Pendiente, Mensaje } from './tipos.ts'

const ctx: Contexto = { hoy: '2026-10-13', nombre: 'Lauti', categoriasGasto: [], campos: [
  { id: 'lp', nombre: 'La Porteña', potreros: [{ id: '7b', nombre: '7B' }, { id: '8b', nombre: '8B' }] },
  { id: 'dg', nombre: 'Don Gilberto', potreros: [{ id: '1a', nombre: '1A' }] },
] }
const pendiente: Pendiente = { tipo: 'potrero', capturaId: 'audio-original', obsIndex: 0, borrador: { tipo: 'recorrida', campoId: 'lp', observaciones: [{ agua: null, pasto: null, electrico: 'cortado', conteo: null, novedad: 'Poste caído', campoId: 'lp' }] } }
const datos: MapaCampo = { id: 'lp', nombre: 'La Porteña', potreros: [
  { id: '7b', nombre: '7B', poligono: [[-36, -59], [-36, -58.99], [-36.01, -58.99], [-36.01, -59]] },
  { id: '8b', nombre: '8B', poligono: [[-36, -58.99], [-36, -58.98], [-36.01, -58.98], [-36.01, -58.99]] },
] }

describe('pedido de mapa sin consumir la carga', () => {
  it.each(['mapa', 'Mandame el mapa', 'Mostrame el mapa!', 'ver mapa', 'enviame un mapa', 'quiero ver el mapa'])('reconoce %s', t => expect(comandoMapa(t)).toEqual({}))
  it('resuelve un campo nombrado', () => expect(campoParaMapa(comandoMapa('mapa de La Porteña')!, ctx, pendiente)?.id).toBe('lp'))
  it('el botón apunta al campo ofrecido', () => expect(campoParaMapa(comandoMapa('', 'ver_mapa@dg')!, ctx, pendiente)?.id).toBe('dg'))
  it('no traga una carga que menciona el mapa', () => expect(comandoMapa('En el 7B según el mapa llovieron 20')).toBeNull())
  it('botones de confirmación siguen su camino', () => expect(comandoMapa('', 'audio-original|si')).toBeNull())
  it('el campo del audio manda sobre el mapa reciente', () => expect(campoParaMapa({}, ctx, pendiente, 'dg')?.id).toBe('lp'))
  it('la observación específica manda sobre el campo general', () => {
    const p = structuredClone(pendiente); if (p.tipo !== 'potrero') throw Error()
    p.borrador.observaciones![0].campoId = 'dg'
    expect(campoParaMapa({}, ctx, p)?.id).toBe('dg')
  })
  it('sin contexto ni elección no adivina entre dos campos', () => expect(campoParaMapa({}, ctx, null)).toBeNull())
  it('un único campo se usa sin pregunta repetida', () => expect(campoParaMapa({}, { ...ctx, campos: [ctx.campos[0]] }, null)?.id).toBe('lp'))
  it('un ID ajeno no se resuelve ni cae al campo activo', () => expect(campoParaMapa({ campoId: 'ajeno' }, ctx, pendiente)).toBeNull())
  it('no cambia el borrador al mostrar el selector', () => {
    const before = JSON.stringify(pendiente)
    expect(elegirMapa(ctx).lista?.filas.map(f => f.id)).toEqual(['ver_mapa@lp', 'ver_mapa@dg'])
    expect(JSON.stringify(pendiente)).toBe(before)
  })
  it('no recordar se conserva como pendiente de identificar', () => {
    expect(noRecuerdaPotrero('No me acuerdo', pendiente)).toBe(true)
    expect(noRecuerdaPotrero('No recuerdo el potrero', pendiente)).toBe(true)
    expect(noRecuerdaPotrero('no', pendiente)).toBe(false)
    expect(noRecuerdaPotrero('No me acuerdo', null)).toBe(false)
  })
})

describe('render desde geometrías registradas', () => {
  it('conserva nombres, orientación y no usa imágenes externas', () => {
    const r = svgMapa(datos, ctx.hoy)!
    expect(r.dibujados).toBe(2); expect(r.faltantes).toEqual([])
    expect(r.svg).toContain('La Porteña'); expect(r.svg).toContain('7B'); expect(r.svg).toContain('8B')
    expect(r.svg).not.toMatch(/(?:href|src)="https?:/); expect(r.svg.match(/<polygon /g)).toHaveLength(2)
  })
  it('sin geometría responde sin inventar un mapa', () => expect(svgMapa({ ...datos, potreros: [{ ...datos.potreros[0], poligono: null }] }, ctx.hoy)).toBeNull())
  it('un dibujo inválido se informa como faltante', () => {
    const r = svgMapa({ ...datos, potreros: [datos.potreros[0], { ...datos.potreros[1], poligono: [[0, 1], [NaN, 3], [4, 5]] }] }, ctx.hoy)!
    expect(r.dibujados).toBe(1); expect(r.faltantes).toEqual(['8B'])
  })
  it.each([[[1, 2]], [[1, 2], [3, 4], [5, 6]], [[300, 1], [301, 2], [302, 4]], [[1, Infinity], [1, 2], [2, 2]], 'geometria'].map(v => [v]))('rechaza coordenadas/área inválidas %#', value => expect(poligonoMapa(value)).toBeNull())
  it('escapa texto de campo y potrero', () => {
    const r = svgMapa({ ...datos, nombre: '<script>&campo', potreros: [{ ...datos.potreros[0], nombre: '<img>&7B' }] }, ctx.hoy)!
    expect(r.svg).toContain('&lt;script&gt;&amp;campo'); expect(r.svg).not.toContain('<script>')
    expect(r.svg).toContain('&lt;img&gt;')
  })
})

describe('imagen privada y borrador de audio preservado', () => {
  it('dos observaciones sin ubicación se completan por separado', () => {
    const b = structuredClone(pendiente.borrador)
    b.observaciones![0].aca = true
    b.observaciones!.push({ agua: 'seca', pasto: null, electrico: null, conteo: null, novedad: 'Bebedero sin agua', aca: true, campoId: 'lp' })
    const first = siguientePaso('audio-original', b, ctx)
    if (first.k !== 'preguntar') throw Error()
    const reply = leer({ texto: '7B' }, first.pendiente, ctx)
    if (reply.k !== 'seguir') throw Error()
    expect(reply.borrador.observaciones?.[0].potreroMencion).toBe('7B')
    expect(reply.borrador.observaciones?.[1].potreroMencion).toBeUndefined()
    const next = siguientePaso('audio-original', reply.borrador, ctx)
    expect(next).toMatchObject({ k: 'preguntar', pendiente: { tipo: 'ubicacion', obsIndex: 1, capturaId: 'audio-original' } })
  })
  it('GPS en respuesta completa sólo la observación que se está ubicando', () => {
    const b = structuredClone(pendiente.borrador)
    b.observaciones![0].aca = true
    b.observaciones!.push({ agua: 'seca', pasto: null, electrico: null, conteo: null, novedad: 'Otra observación', aca: true })
    const result = conUbicacion(b, { campoId: 'lp', potreroId: '7b' }, 0)
    expect(result.observaciones?.[0].potreroId).toBe('7b')
    expect(result.observaciones?.[1].potreroId).toBeUndefined()
  })
  it('enviar la imagen permite completar sólo esa observación', async () => {
    const before = JSON.stringify(pendiente), sent: unknown[] = []
    const ok = await atenderMapa(ctx.campos[0], { datos: async () => datos, render: async () => ({ bytes: new Uint8Array([137, 80, 78, 71]), dibujados: 2, faltantes: [] }), enviarImagen: async (...v) => { sent.push(v) }, responder: async () => {} })
    expect(ok).toBe(true); expect(sent).toHaveLength(1); expect(JSON.stringify(pendiente)).toBe(before)
    const next = leer({ texto: '7B' }, pendiente, ctx)
    expect(next).toMatchObject({ k: 'seguir', capturaId: 'audio-original', borrador: { observaciones: [{ potreroId: '7b', electrico: 'cortado', novedad: 'Poste caído' }] } })
    if (next.k !== 'seguir') throw Error()
    expect(siguientePaso(next.capturaId, next.borrador, ctx).k).toBe('proponer')
  })
  it('sin permisos no renderiza ni envía geometría', async () => {
    const messages: Mensaje[] = []
    const ok = await atenderMapa(ctx.campos[0], { datos: async () => null, render: async () => { throw Error('no debe renderizar') }, enviarImagen: async () => { throw Error('no debe enviar') }, responder: async m => { messages.push(m) } })
    expect(ok).toBe(false); expect(messages[0].texto).toContain('no está disponible')
  })
  it('un campo diferente en la respuesta no se envía', async () => {
    const ok = await atenderMapa(ctx.campos[0], { datos: async () => ({ ...datos, id: 'ajeno' }), render: async () => { throw Error('no debe renderizar') }, enviarImagen: async () => {}, responder: async () => {} })
    expect(ok).toBe(false)
  })
  it('sin dibujos devuelve los nombres reales', async () => {
    const messages: Mensaje[] = []
    await atenderMapa(ctx.campos[0], { datos: async () => datos, render: async () => null, enviarImagen: async () => { throw Error('no debe enviar') }, responder: async m => { messages.push(m) } })
    expect(messages[0].texto).toContain('7B, 8B')
  })
  it('el fallo de envío no muta el pendiente', async () => {
    const before = JSON.stringify(pendiente)
    await expect(atenderMapa(ctx.campos[0], { datos: async () => datos, render: async () => ({ bytes: new Uint8Array(), dibujados: 2, faltantes: [] }), enviarImagen: async () => { throw Error('Meta caído') }, responder: async () => {} })).rejects.toThrow('Meta caído')
    expect(JSON.stringify(pendiente)).toBe(before)
  })
  it('payload usa media ID sin link público y respeta caption Unicode', () => {
    const body = payloadImagen('qa', 'media-privado', '🌾'.repeat(2000))
    expect(body).toMatchObject({ type: 'image', image: { id: 'media-privado' } })
    expect(body.image).not.toHaveProperty('link')
    expect([...(body.image as { caption: string }).caption]).toHaveLength(1024)
  })
  it('el alcance de hacienda está bloqueado deliberadamente', () => {
    const it = { intent: 'no_soportado' as const }
    expect(arrancar(it as Parameters<typeof arrancar>[0], ctx)).toMatchObject({ estado: 'descartada' })
  })
})
