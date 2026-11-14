import { describe, expect, it } from 'vitest'
import { descansoPrevio, historiaDelPotrero, type MovimientoPotrero } from './historia'

const mov = (animalId: string, fecha: string, origen: string | null, destino: string | null): MovimientoPotrero => ({ animalId, fecha, origen, destino, origenNombre: origen?.toUpperCase() ?? null, destinoNombre: destino?.toUpperCase() ?? null })

describe('la historia del potrero', () => {
  const movs = [mov('a', '2026-08-01', '11b', '4b'), mov('a', '2026-08-26', '4b', '11b'), mov('b', '2026-08-26', '4b', '11b')]
  it('descansó desde la última salida hasta que volvió a entrar', () => {
    expect(descansoPrevio('11b', '2026-08-26', movs)).toBe(25)
    expect(descansoPrevio('4b', '2026-08-01', movs)).toBeNull()
  })
  it('junta las entradas del mismo día, con recorridas y labores, de lo nuevo a lo viejo', () => {
    const h = historiaDelPotrero(
      '11b',
      [{ potreroId: '11b', fecha: '2026-09-22', pasto: 'normal', agua: null, electrico: 'cortado', novedad: 'Boyero cortado' }],
      movs,
      [{ potreroId: '11b', fecha: '2026-07-10', tipo: 'fertilizacion', cultivo: null, nota: 'Urea', kg: null }],
    )
    expect(h.map((x) => [x.fecha, x.titulo, x.detalle])).toEqual([
      ['2026-09-22', 'Recorrida', 'pasto normal, eléctrico cortado. «Boyero cortado»'],
      ['2026-08-26', 'Entraron 2 animales', 'Desde el 4B'],
      ['2026-08-01', 'Salió 1 animal', 'Al 4B'],
      ['2026-07-10', 'Fertilización', 'Urea'],
    ])
  })
})
