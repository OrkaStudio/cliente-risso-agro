import { describe, expect, it } from 'vitest'
import type { PotreroAtencion } from '../para-atender-api'
import type { Vencimiento } from '../api'
import { lineaDePlata, chipsDelDia, porDondeVaElMapa, cosasParaHoy, fraseDelDia, inicioDeCampania, plataCorta, proximos30, saludo } from './dia'

const potrero = (nombre: string, nivel: 'atender' | 'prevenir', extra: Partial<PotreroAtencion> = {}): PotreroAtencion => ({
  key: nombre,
  observacionId: `o-${nombre}`,
  potrero: nombre,
  campo: 'La Porteña',
  cabezas: 60,
  avisos: [{ key: 'a', tipo: 'electrico', nivel, urgencia: 1, icon: (() => null) as never, titulo: 'El eléctrico está cortado' }],
  nivel,
  urgencia: 1,
  hace: 3,
  to: `/potrero/${nombre}`,
  ...extra,
})
const venc = (id: string, dias: number, tipo: 'gasto' | 'ingreso' = 'gasto', monto = 350000): Vencimiento => ({
  id,
  descripcion: `Cosa ${id}`,
  tipo,
  monto,
  fechaVencimiento: null,
  diasParaVencer: dias,
})

describe('para atender hoy', () => {
  it('ordena de lo urgente a lo que puede esperar y corta en cuatro', () => {
    const cs = cosasParaHoy(
      [potrero('4B', 'prevenir'), potrero('11B', 'atender')],
      [venc('a', 10), venc('b', -2), venc('c', 1, 'ingreso')],
      [{ key: 'x', campo: 'Los Pampas', cabezas: 46, hace: 15, to: '/campo/recorrida' }],
    )
    expect(cs.map((c) => c.key)).toEqual(['p-11B', 'v-b', 'p-4B', 'v-c'])
    expect(cs[0]).toMatchObject({ tono: 'problema', titulo: 'El eléctrico está cortado en el 11B', detalle: 'Desde hace 3 días. Hay 60 animales adentro.' })
    expect(cs[1]).toMatchObject({ detalle: 'Venció hace dos días. $350.000.', accion: { texto: 'Registrar el pago' } })
    expect(cs[3]!.accion.texto).toBe('Registrar el cobro')
  })
  it('sin nada, lista vacía', () => {
    expect(cosasParaHoy([], [venc('a', 20)], [])).toEqual([])
  })
})

describe('lo que dice arriba', () => {
  it('saluda según la hora', () => {
    expect(saludo(8, 'Daniel')).toBe('Buen día, Daniel.')
    expect(saludo(15, 'Daniel')).toBe('Buenas tardes, Daniel.')
    expect(saludo(21, '')).toBe('Buenas noches.')
  })
  it('arma la frase con lo que hay', () => {
    expect(fraseDelDia({ temp: 17, lugar: 'La Porteña', lluvia60: 142, cosas: 4 })).toBe(
      '17 grados en La Porteña. Llovieron 142 mm en dos meses y hay cuatro cosas para atender.',
    )
    expect(fraseDelDia({ temp: null, lugar: null, lluvia60: null, cosas: 0 })).toBe('No hay nada urgente.')
    expect(fraseDelDia({ temp: 9, lugar: 'Los Pampas', lluvia60: 0, cosas: 1 })).toBe('9 grados en Los Pampas. Hay una cosa para atender.')
  })
})

describe('la plata', () => {
  it('la campaña arranca en julio', () => {
    expect(inicioDeCampania(new Date(2026, 9, 9))).toBe('2026-07-01')
    expect(inicioDeCampania(new Date(2026, 2, 1))).toBe('2025-07-01')
  })
  it('los próximos 30 días: cobros menos pagos, sin lo vencido', () => {
    expect(proximos30([venc('a', 4), venc('b', 9, 'ingreso', 18_900_000), venc('c', -1), venc('d', 45)])).toBe(18_550_000)
  })
  it('en corto', () => {
    expect(plataCorta(36_900_000)).toBe('$36,9M')
    expect(plataCorta(7_750_000, true)).toBe('+$7,75M')
    expect(plataCorta(-350_000, true)).toBe('−$350.000')
  })
})

describe('por dónde va el mapa', () => {
  const c = (nombre: string, contorno: boolean, potreros: boolean[]) => ({
    id: nombre,
    nombre,
    provincia: 'Buenos Aires',
    lat: null,
    lon: null,
    hectareas: 100,
    contorno: contorno ? ([[0, 0], [0, 1], [1, 1]] as [number, number][]) : null,
    potreros: potreros.map((d, i) => ({ id: `${i}`, nombre: `${i}A`, hectareas: 10, poligono: d ? ([[0, 0]] as [number, number][]) : null, cabezas: 0, que: '' })),
  })
  it('dice el campo, el paso y los minutos', () => {
    expect(porDondeVaElMapa([c('La Porteña', false, [false, false, false]), c('Los Pampas', false, [false, false])])).toBe(
      'La Porteña: vas por el borde. Después, Los Pampas. Unos 11 minutos',
    )
    expect(porDondeVaElMapa([c('La Porteña', true, [true, false])])).toBe('La Porteña: falta un potrero. Unos 2 minutos')
  })
})

describe('los chips de la cabecera', () => {
  const cosa = (key: string): import('./dia').Cosa => ({ key, tono: 'problema', titulo: '', detalle: '', accion: { texto: '', to: '' }, icono: 'Plata', lugar: '', que: '', datos: [] })
  it('lo del campo, lo vencido y la lluvia, en ese orden', () => {
    const cs = chipsDelDia({ cosas: [cosa('p-1'), cosa('p-2'), cosa('v-1')], vencimientos: [venc('a', -2)], lluviaManana: 82 })
    expect(cs.map((c) => c.texto)).toEqual(['2 cosas en el campo', '1 pago vencido', '82 % de lluvia mañana'])
    expect(cs[1]!.destino).toBe('/agenda')
  })
  it('sin vencidos avisa lo de la semana; sin nada, que está todo en orden', () => {
    expect(chipsDelDia({ cosas: [], vencimientos: [venc('a', 4)], lluviaManana: 10 }).map((c) => c.texto)).toEqual(['1 vence esta semana'])
    expect(chipsDelDia({ cosas: [], vencimientos: [], lluviaManana: null })[0]!.texto).toBe('Todo en orden hoy')
  })
})

describe('la línea de la plata', () => {
  it('suma lo que entra y sale en 30 días y aparta lo vencido', () => {
    const l = lineaDePlata([venc('a', -2), venc('b', 4, 'gasto', 5_400_000), venc('c', 9, 'ingreso', 18_900_000), venc('d', 45)])
    expect(l).toMatchObject({ entra: 18_900_000, sale: 5_400_000, queda: 13_500_000, vencido: 350_000, maximo: 18_900_000 })
    expect(l.vencidos.map((p) => p.id)).toEqual(['a'])
    expect(l.futuros.map((p) => p.id)).toEqual(['b', 'c'])
  })
  it('la tarjeta de un potrero dice dónde, qué y cuánto, y cómo marcarla', () => {
    const [c] = cosasParaHoy([potrero('11B', 'atender')], [], [])
    expect(c).toMatchObject({ icono: 'Eléctrico', lugar: '11B', que: 'El eléctrico está cortado', datos: ['hace 3 días', '60 animales'], senal: { potreroId: '11B', tipo: 'electrico' } })
  })
})
