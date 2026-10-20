import { describe, expect, it } from 'vitest'
import { hectareasDe, type LatLng } from '@/features/mapa/reglas'
import { adentro, dividir, numeroSiguiente } from './dividir'

// Un cuadrado de ~1 km de lado cerca de Las Flores.
const C: LatLng[] = [
  [-36.0, -59.1],
  [-36.0, -59.089],
  [-36.009, -59.089],
  [-36.009, -59.1],
]

describe('dividir', () => {
  it('una línea de lado a lado deja dos partes que suman el potrero', () => {
    const r = dividir(C, [
      [-35.999, -59.0945],
      [-36.01, -59.0945],
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const [a, b] = r.piezas.map(hectareasDe)
    expect(a! + b!).toBeCloseTo(hectareasDe(C), 1)
    expect(Math.abs(a! - b!)).toBeLessThan(hectareasDe(C) * 0.05)
  })

  it('el quiebre de la línea queda en las dos partes', () => {
    const quiebre: LatLng = [-36.0045, -59.092]
    const r = dividir(C, [[-35.999, -59.095], quiebre, [-36.01, -59.095]])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    for (const p of r.piezas) expect(p).toContainEqual(quiebre)
    expect(hectareasDe(r.piezas[0]) + hectareasDe(r.piezas[1])).toBeCloseTo(hectareasDe(C), 1)
  })

  it('corta una esquina (los dos cruces en lados vecinos)', () => {
    const r = dividir(C, [
      [-35.999, -59.0905],
      [-36.0015, -59.088],
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const chica = Math.min(...r.piezas.map(hectareasDe))
    expect(chica).toBeGreaterThan(0)
    expect(chica).toBeLessThan(hectareasDe(C) * 0.1)
  })

  it('cuenta las puntas enganchadas justo sobre el borde', () => {
    const r = dividir(C, [
      [-36.0, -59.0945],
      [-36.009, -59.0945],
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(hectareasDe(r.piezas[0]) + hectareasDe(r.piezas[1])).toBeCloseTo(hectareasDe(C), 1)
  })

  it('la línea que no termina de cruzar pide seguir', () => {
    expect(dividir(C, [[-35.999, -59.095], [-36.004, -59.095]])).toEqual({ ok: false, motivo: 'falta' })
  })

  it('la que entra y sale dos veces se rechaza', () => {
    expect(
      dividir(C, [
        [-35.999, -59.098],
        [-36.004, -59.098],
        [-36.004, -59.0885],
        [-36.006, -59.0885],
        [-36.006, -59.095],
        [-36.01, -59.095],
      ]),
    ).toEqual({ ok: false, motivo: 'cruza-de-mas' })
  })
})

describe('adentro', () => {
  it('distingue adentro y afuera', () => {
    expect(adentro([-36.004, -59.095], C)).toBe(true)
    expect(adentro([-36.02, -59.095], C)).toBe(false)
  })
})

describe('numeroSiguiente', () => {
  it('sigue al más alto', () => {
    expect(numeroSiguiente(['1B', '9B', '3B'])).toBe('10')
    expect(numeroSiguiente([])).toBe('1')
  })
})
