import { describe, expect, it } from 'vitest'
import { disponer, medirEstimado as medir, type DatosPotrero } from './disposicion'

// Todos los tamaños de potrero que puede dar el croquis, con todo lo que puede llevar adentro.
const LADOS = [40, 48, 56, 64, 80, 96, 120, 150, 200, 260, 340, 460, 620, 900]
const CASOS: DatosPotrero[] = [
  { nombre: '1A', ha: ['40 ha'], dato: null, iconos: 0 }, // vacío
  { nombre: '4C', ha: ['40 ha'], dato: '7', iconos: 3 }, // tres especies
  { nombre: '12B', ha: ['1.250 ha', '1250'], dato: '1240', iconos: 1 },
  { nombre: '2A', ha: ['60 ha'], dato: 'Soja', iconos: 1 },
  { nombre: '5C', ha: ['35,5 ha', '36 ha', '36'], dato: 'Girasol', iconos: 1 },
  { nombre: '2A', ha: ['60 ha'], dato: 'Cebada cervecera', iconos: 1 },
  { nombre: '3A', ha: ['50 ha'], dato: '30 días', bajada: 'descansando', iconos: 1 },
]

describe('lo que entra en cada potrero', () => {
  for (const d of CASOS)
    it(`${d.nombre} · ${d.dato ?? 'vacío'}: nada se corta y las hectáreas siempre están`, () => {
      for (const w of LADOS)
        for (const h of LADOS) {
          const x = disponer(w, h, d)
          const lw = w - x.pad * 2
          const lh = h - x.pad * 2
          const caso = `${w}×${h}`
          // Nombre y hectáreas a la vista, sin pasarse del ancho.
          if (x.haEnLinea) expect(medir(d.nombre, 'heading', x.nombre) + 6 + medir(x.haTexto, 'texto', x.ha), caso).toBeLessThanOrEqual(lw + 0.5)
          else {
            expect(medir(d.nombre, 'heading', x.nombre), caso).toBeLessThanOrEqual(lw + 0.5)
            expect(medir(x.haTexto, 'texto', x.ha), caso).toBeLessThanOrEqual(lw + 0.5)
          }
          expect(x.ha, caso).toBeGreaterThanOrEqual(8)
          expect(x.nombre, caso).toBeGreaterThanOrEqual(9)
          // El dato grande entra a lo ancho y a lo alto.
          if (x.dato.donde === 'grande') {
            const palabra = x.dato.lineas === 2 ? d.dato!.split(' ').reduce((a, b) => (b.length > a.length ? b : a)) : d.dato!
            expect(medir(palabra, 'display', x.dato.tam), caso).toBeLessThanOrEqual(lw + 0.5)
            const alto = (x.haEnLinea ? x.nombre * 1.15 : x.nombre * 1.15 + x.ha * 1.3) + x.dato.tam * 1.15 * x.dato.lineas
            expect(alto, caso).toBeLessThanOrEqual(lh + 0.5)
          }
          // Desde un potrero mediano, el dato siempre se ve.
          if (d.dato && w >= 64 && h >= 56) expect(x.dato.donde, caso).not.toBe('no')
        }
    })

  it('el dato crece con el potrero', () => {
    const d = CASOS[3]!
    const chico = disponer(150, 150, d)
    const grande = disponer(800, 600, d)
    expect(chico.dato.donde).toBe('grande')
    expect(grande.dato.donde === 'grande' && chico.dato.donde === 'grande' && grande.dato.tam > chico.dato.tam * 1.8).toBe(true)
  })

  it('en un potrero angosto los íconos bajan a una fila y las hectáreas siguen', () => {
    const x = disponer(96, 200, CASOS[1]!)
    expect(x.iconos).toBe('abajo')
    expect(x.haEnLinea).toBe(false)
  })
})
