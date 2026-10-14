import { describe, expect, it } from 'vitest'
import { payload } from '../../wa-webhook/meta.ts'
import { arrancar, conUbicacion, detalleObs, leer, NOVEDAD_SIN_DATOS, siguientePaso } from './conversacion.ts'
import { limpiarInterpretacion } from './interpretar.ts'
import { potreroEnPunto, type PotreroDibujado } from './resolver.ts'
import { trasRecorrida } from './respuestas.ts'
import type { Borrador, Campo, Contexto, ObsInterpretada, Pendiente } from './tipos.ts'

// Los campos de "Orka Pruebas": el número de potrero se repite entre campos (2A, 2B, 2C, 2D).
const pot = (campo: string, letra: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `${campo}-${i + 1}${letra}`, nombre: `${i + 1}${letra}` }))
const CAMPOS: Campo[] = [
  { id: 'dg', nombre: 'Don Gilberto', potreros: pot('dg', 'A', 3) },
  { id: 'lp', nombre: 'La Porteña', potreros: pot('lp', 'B', 12) },
  { id: 'to', nombre: 'Toimil', potreros: pot('to', 'C', 5) },
  { id: 'pa', nombre: 'Los Pampas', potreros: pot('pa', 'D', 4) },
]
const ctx: Contexto = { hoy: '2026-10-12', nombre: 'Lau', campos: CAMPOS, categoriasGasto: [] }

const obs = (o: Partial<ObsInterpretada>): ObsInterpretada => ({
  potrero: null, campo: null, aca: false, agua: null, pasto: null, electrico: null, conteo: null, novedad: null, ...o,
})
const novedad = (observaciones: ObsInterpretada[], campo: string | null = null) => ({
  ...limpiarInterpretacion({ intent: 'novedad' }), campo, observaciones,
})
function borrador(observaciones: ObsInterpretada[], r = {}, campo: string | null = null): Borrador {
  const a = arrancar(novedad(observaciones, campo), ctx, undefined, r)
  if (!('borrador' in a)) throw new Error('Debe armar borrador')
  return a.borrador
}

describe('lo que devuelve el modelo', () => {
  it('limpia estados, descarta lo vacío y redondea el conteo', () => {
    const it0 = limpiarInterpretacion({
      intent: 'novedad',
      observaciones: [
        { potrero: '2', agua: 'llena', pasto: 'muy lindo', aca: false },
        { potrero: 3, conteo: 80.4, electrico: 'cortado' },
        { potrero: '4' },
        'basura',
      ],
    })
    expect(it0.observaciones).toEqual([
      obs({ potrero: '2', agua: 'llena' }),
      obs({ potrero: '3', conteo: 80, electrico: 'cortado' }),
    ])
  })
  it('sólo la novedad trae observaciones, y como mucho 12', () => {
    expect(limpiarInterpretacion({ intent: 'lluvia', observaciones: [{ novedad: 'x' }] }).observaciones).toEqual([])
    const muchas = Array.from({ length: 20 }, (_, i) => ({ potrero: String(i + 1), novedad: 'ok' }))
    expect(limpiarInterpretacion({ intent: 'novedad', observaciones: muchas }).observaciones).toHaveLength(12)
  })
  it('una novedad sin nada que anotar pide que cuente qué vio', () => {
    expect(arrancar(novedad([]), ctx)).toEqual({ respuesta: NOVEDAD_SIN_DATOS, estado: 'respondida' })
  })
})

describe('la recorrida de Fran: tres potreros en un audio', () => {
  const audio = [
    obs({ potrero: '2', campo: 'La Porteña', agua: 'llena', novedad: 'mucha agua, la aguada rebalsa' }),
    obs({ potrero: '5', campo: 'La Porteña', novedad: '15 terneros' }),
    obs({ potrero: '7', campo: 'La Porteña', novedad: 'faltan 2 terneros' }),
  ]

  it('una sola propuesta, agrupada por campo, sin preguntar nada', () => {
    const paso = siguientePaso('c', borrador(audio), ctx)
    if (paso.k !== 'proponer') throw new Error(`Debe proponer, fue ${paso.k}`)
    expect(paso.mensaje.texto).toBe(
      'Anoto en la recorrida de hoy:\nLa Porteña\n' +
        '• *2B*: aguada llena, mucha agua, la aguada rebalsa\n' +
        '• *5B*: 15 terneros\n' +
        '• *7B*: faltan 2 terneros',
    )
    expect(paso.mensaje.botones?.map((b) => b.titulo)).toEqual(['Sí', 'Corregir', 'Cancelar'])
    expect(paso.borrador.observaciones?.map((o) => o.potreroId)).toEqual(['lp-2B', 'lp-5B', 'lp-7B'])
  })

  it('confirmar con Sí lleva las tres observaciones resueltas', () => {
    const paso = siguientePaso('c', borrador(audio), ctx)
    if (paso.k !== 'proponer') throw new Error('Debe proponer')
    const l = leer({ botonId: 'c|si' }, paso.pendiente, ctx)
    expect(l.k === 'confirmar' && l.borrador.observaciones?.length).toBe(3)
  })
})

describe('qué potrero es', () => {
  it('"el 2" sin campo existe en los cuatro campos: pregunta cuál, mostrando qué vio', () => {
    const paso = siguientePaso('c', borrador([obs({ potrero: '2', novedad: 'molino roto' })]), ctx)
    if (paso.k !== 'preguntar') throw new Error('Debe preguntar')
    expect(paso.mensaje.texto).toBe('Hay un potrero 2 en Don Gilberto, La Porteña, Toimil, Los Pampas. ¿Cuál es el de «molino roto»?')
    expect(paso.mensaje.lista?.filas).toHaveLength(4)
    expect(paso.pendiente).toMatchObject({ tipo: 'potrero', obsIndex: 0 })
  })

  it('elegir el campo una vez desempata el resto del audio', () => {
    const b = borrador([obs({ potrero: '2', novedad: 'molino roto' }), obs({ potrero: '5', pasto: 'escaso' })])
    const paso = siguientePaso('c', b, ctx)
    if (paso.k !== 'preguntar') throw new Error('Debe preguntar')
    const l = leer({ botonId: 'c|p=lp-2B' }, paso.pendiente, ctx)
    if (l.k !== 'seguir') throw new Error('Debe seguir')
    expect(l.borrador.campoId).toBe('lp')
    const despues = siguientePaso('c', l.borrador, ctx)
    expect(despues.k === 'proponer' && despues.borrador.observaciones?.map((o) => o.potreroId)).toEqual(['lp-2B', 'lp-5B'])
  })

  it('también escribiendo el potrero', () => {
    const paso = siguientePaso('c', borrador([obs({ potrero: '2', novedad: 'molino roto' })]), ctx)
    if (paso.k !== 'preguntar') throw new Error('Debe preguntar')
    const l = leer({ texto: '2C' }, paso.pendiente, ctx)
    expect(l.k === 'seguir' && l.borrador.observaciones?.[0].potreroId).toBe('to-2C')
  })

  it('el campo que recorre hoy desempata sin preguntar', () => {
    const paso = siguientePaso('c', borrador([obs({ potrero: '2', novedad: 'molino roto' })], { campoHoy: 'lp' }), ctx)
    expect(paso.k === 'proponer' && paso.borrador.observaciones?.[0].potreroId).toBe('lp-2B')
  })

  it('si en el campo de hoy no está, lo busca en todos', () => {
    const paso = siguientePaso('c', borrador([obs({ potrero: '7', novedad: 'aguada seca' })], { campoHoy: 'dg' }), ctx)
    expect(paso.k === 'proponer' && paso.borrador.observaciones?.[0].potreroId).toBe('lp-7B')
  })

  it('el campo nombrado en el mensaje manda sobre el de hoy', () => {
    const paso = siguientePaso('c', borrador([obs({ potrero: '2', campo: 'Toimil', novedad: 'x' })], { campoHoy: 'lp' }), ctx)
    expect(paso.k === 'proponer' && paso.borrador.observaciones?.[0].potreroId).toBe('to-2C')
  })

  it('un potrero que no existe no se anota, y se avisa', () => {
    const paso = siguientePaso('c', borrador([obs({ potrero: '40', novedad: 'x' }), obs({ potrero: '7', novedad: 'y' })]), ctx)
    if (paso.k !== 'proponer') throw new Error('Debe proponer')
    expect(paso.mensaje.texto.startsWith('No encontré el potrero «40»: eso no lo anoto. Anoto en la recorrida de hoy:')).toBe(true)
    expect(paso.borrador.observaciones).toHaveLength(1)
  })

  it('si no existe ninguno, no propone nada', () => {
    const paso = siguientePaso('c', borrador([obs({ potrero: '40', novedad: 'x' })]), ctx)
    expect(paso.k === 'decir' && paso.mensaje.texto).toBe('No encontré el potrero «40»: eso no lo anoto. Decime el potrero como figura en la app.')
  })
})

describe('«acá»: el potrero sale de la ubicación', () => {
  const aca = [obs({ aca: true, novedad: 'el molino no anda' })]

  it('permite ubicar la observación por mapa sin solicitar GPS', () => {
    const paso = siguientePaso('c', borrador(aca), ctx)
    if (paso.k !== 'preguntar') throw new Error('Debe preguntar')
    expect(paso.mensaje).toEqual({
      texto: '¿En qué potrero pasó? Mirá el mapa y escribí el nombre; conservé lo que contaste.',
      botones: [{ id: 'ver_mapa', titulo: 'Ver mapa' }],
    })
    expect(paso.pendiente.tipo).toBe('ubicacion')
  })

  it('sin nombrar potrero conserva el audio y ofrece el mapa', () => {
    const paso = siguientePaso('c', borrador([obs({ novedad: 'alambrado cortado' })]), ctx)
    expect(paso.k === 'preguntar' && paso.pendiente.tipo).toBe('ubicacion')
  })

  it('con la ubicación, propone en ese potrero', () => {
    const b = conUbicacion(borrador(aca), { potreroId: 'pa-3D', campoId: 'pa' })
    const paso = siguientePaso('c', b, ctx)
    expect(paso.k === 'proponer' && paso.mensaje.texto).toBe('Anoto en la recorrida de hoy:\nLos Pampas\n• *3D*: el molino no anda')
  })

  it('la ubicación sólo completa lo que dijo «acá»', () => {
    const b = conUbicacion(borrador([...aca, obs({ potrero: '7', campo: 'La Porteña', novedad: 'y' })]), { potreroId: 'pa-3D', campoId: 'pa' })
    const paso = siguientePaso('c', b, ctx)
    expect(paso.k === 'proponer' && paso.borrador.observaciones?.map((o) => o.potreroId)).toEqual(['pa-3D', 'lp-7B'])
  })

  it('si contesta con el nombre en vez de la ubicación, sirve igual', () => {
    const paso = siguientePaso('c', borrador(aca), ctx)
    if (paso.k !== 'preguntar') throw new Error('Debe preguntar')
    const l = leer({ texto: '5B' }, paso.pendiente, ctx)
    if (l.k !== 'seguir') throw new Error('Debe seguir')
    expect(siguientePaso('c', l.borrador, ctx)).toMatchObject({ k: 'proponer' })
  })

  it('si contesta otra cosa, es un mensaje nuevo', () => {
    const paso = siguientePaso('c', borrador(aca), ctx)
    if (paso.k !== 'preguntar') throw new Error('Debe preguntar')
    expect(leer({ texto: 'llovieron 10 en Toimil' }, paso.pendiente, ctx)).toEqual({ k: 'nuevo', abandona: 'c' })
  })

  it('si compartió la ubicación antes, el mensaje siguiente va a ese potrero sin preguntar', () => {
    const paso = siguientePaso('c', borrador(aca, { ubicado: { potreroId: 'to-4C', campoId: 'to' } }), ctx)
    expect(paso.k === 'proponer' && paso.borrador.observaciones?.[0].potreroId).toBe('to-4C')
  })

  it('después de compartir la ubicación, el próximo mensaje es nuevo', () => {
    const p: Pendiente = { tipo: 'ubicado', capturaId: null, ubicado: { potreroId: 'to-4C', campoId: 'to' } }
    expect(leer({ texto: 'el molino no anda' }, p, ctx)).toEqual({ k: 'nuevo', abandona: null })
    expect(leer({ botonId: 'vieja|si' }, p, ctx).k).toBe('viejo')
  })
})

describe('lo que se dice', () => {
  it('detalle de una observación con todo', () => {
    expect(detalleObs({ agua: 'baja', pasto: 'escaso', electrico: 'cortado', conteo: 80, novedad: 'faltan 2 terneros' }))
      .toBe('aguada baja, pasto escaso, eléctrico cortado, 80 cabezas, faltan 2 terneros')
  })
  it('una muerte avisa que la baja se hace en la app', () => {
    const paso = siguientePaso('c', borrador([obs({ potrero: '3', campo: 'La Porteña', novedad: 'vaca muerta, caravana 4521' })]), ctx)
    expect(paso.k === 'proponer' && paso.mensaje.texto).toContain('La baja del animal no la hago por acá')
  })
  it('después de guardar, cuánto va de la recorrida de hoy', () => {
    expect(trasRecorrida(3, [{ campo: 'La Porteña', recorridos: 4, total: 12 }]))
      .toBe('Listo, anoté 3 potreros en la recorrida de hoy. Hoy van 4 de 12 en La Porteña.')
    expect(trasRecorrida(1, [])).toBe('Listo, anoté 1 potrero en la recorrida de hoy.')
  })
  it('el pedido de ubicación va como el mensaje interactivo de Meta', () => {
    expect(payload('549', { texto: '¿Dónde estás?', pedirUbicacion: true })).toEqual({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: '549', type: 'interactive',
      interactive: { type: 'location_request_message', body: { text: '¿Dónde estás?' }, action: { name: 'send_location' } },
    })
  })
})

describe('en qué potrero cae la ubicación', () => {
  // Cuadrados de 0,01° (≈1 km) en coordenadas del partido.
  const cuadrado = (lat: number, lng: number): [number, number][] =>
    [[lat, lng], [lat, lng + 0.01], [lat - 0.01, lng + 0.01], [lat - 0.01, lng]]
  const potreros: PotreroDibujado[] = [
    { id: 'a', nombre: '1A', campoId: 'dg', campo: 'Don Gilberto', poligono: cuadrado(-35.9, -59.37) },
    { id: 'b', nombre: '2A', campoId: 'dg', campo: 'Don Gilberto', poligono: cuadrado(-35.9, -59.36) },
  ]

  it('adentro de uno', () => {
    expect(potreroEnPunto(-35.905, -59.365, potreros)?.nombre).toBe('1A')
    expect(potreroEnPunto(-35.905, -59.355, potreros)?.nombre).toBe('2A')
  })
  it('afuera de todos', () => {
    expect(potreroEnPunto(-35.8, -59.365, potreros)).toBeNull()
  })
  it('en dos dibujos superpuestos no adivina', () => {
    const encimados = [...potreros, { ...potreros[0], id: 'c', nombre: '1A bis' }]
    expect(potreroEnPunto(-35.905, -59.365, encimados)).toBeNull()
  })
  it('un dibujo con menos de tres puntos no cuenta', () => {
    expect(potreroEnPunto(-35.905, -59.365, [{ ...potreros[0], poligono: [[-35.9, -59.37], [-35.91, -59.36]] }])).toBeNull()
  })
})
