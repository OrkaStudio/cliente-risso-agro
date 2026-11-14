import { describe, expect, it } from 'vitest'
import { diasPorPotrero } from './dias'

describe('días por potrero', () => {
  it('adentro desde la primera que sigue; vacío desde la última que salió; sin datos, nada', () => {
    const r = diasPorPotrero(
      ['p1', 'p2', 'p3'],
      [
        { id: 'a', potreroId: 'p1', alta: '2026-09-01T10:00:00Z' },
        { id: 'b', potreroId: 'p1', alta: '2026-08-01T10:00:00Z' },
      ],
      [
        { animalId: 'a', fecha: '2026-10-09', origen: 'p2', destino: 'p1' },
        { animalId: 'b', fecha: '2026-10-01', origen: 'p2', destino: 'p1' },
      ],
      '2026-10-19',
    )
    expect(r.get('p1')).toEqual({ adentro: 18 })
    expect(r.get('p2')).toEqual({ descansa: 10 })
    expect(r.get('p3')).toBeNull()
  })
})
