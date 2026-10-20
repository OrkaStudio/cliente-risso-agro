import { describe, expect, it } from 'vitest'
import { avisosDelCampo, lluviaDesde, textoDias, ultimaPorPotrero, type Observacion } from './panorama'

const o = (potreroId: string, fecha: string, x: Partial<Observacion> = {}): Observacion => ({ potreroId, fecha, pasto: null, agua: null, electrico: null, novedad: null, ...x })

describe('lo que importa de cada potrero', () => {
  it('se queda con la última recorrida y avisa sólo lo que se vio mal', () => {
    const u = ultimaPorPotrero([o('p1', '2026-10-01', { agua: 'seca' }), o('p1', '2026-10-12', { agua: 'baja', pasto: 'pelado' }), o('p2', '2026-10-10', { electrico: 'cortado' })])
    expect(u.get('p1')!.fecha).toBe('2026-10-12')
    const a = avisosDelCampo(
      [
        { id: 'p1', nombre: '1A', dibujado: true },
        { id: 'p2', nombre: '2A', dibujado: true },
        { id: 'p3', nombre: '3A', dibujado: false },
      ],
      u,
    )
    expect(a.map((x) => x.texto)).toEqual(['1A: agua baja, pasto pelado', '2A: eléctrico cortado', 'Falta dibujar el 3A'])
  })
  it('lluvia desde una fecha y los días en palabras', () => {
    expect(lluviaDesde([{ fecha: '2026-10-01', mm: 10 }, { fecha: '2026-10-09', mm: 22 }, { fecha: '2026-10-15', mm: 20 }], '2026-10-09T08:00:00')).toBe(42)
    expect(textoDias({ adentro: 23 })).toBe('23 días adentro')
    expect(textoDias({ descansa: 1 })).toBe('Descansa hace 1 día')
    expect(textoDias(null)).toBeNull()
  })
})
