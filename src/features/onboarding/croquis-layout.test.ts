import { describe, expect, it } from 'vitest'
import { RADIO_PUNTO, decidirEtiqueta, decidirMarcas, type Rect } from './croquis-layout'

/**
 * La tabla de casos del croquis, una fila por forma de potrero y una columna
 * por cantidad de especies. Cada caso fija DOS cosas: qué modo se elige y que
 * todo lo dibujado cae adentro del potrero. Lo segundo es lo que se venía
 * rompiendo: el modo era el correcto y el tercer punto caía afuera igual.
 */

// Formas reales, en unidades del croquis (viewBox 420×200).
const FORMAS: Record<string, Rect> = {
  grande: { x: 20, y: 20, w: 200, h: 160 },
  angostoAlto: { x: 20, y: 20, w: 60, h: 160 },
  astillaVertical: { x: 20, y: 20, w: 22, h: 160 },
  tiraHorizontal: { x: 20, y: 20, w: 180, h: 30 },
  chico: { x: 20, y: 20, w: 40, h: 40 },
  minusculo: { x: 20, y: 20, w: 14, h: 14 },
}

/** Lo que se espera de cada forma, para 1, 2 y 3 especies. */
const ESPERADO: Record<keyof typeof FORMAS, { etiqueta: string; marcas: [string, string, string] }> = {
  grande: { etiqueta: 'lado', marcas: ['siluetas', 'siluetas', 'siluetas'] },
  angostoAlto: { etiqueta: 'debajo', marcas: ['siluetas', 'siluetas', 'columna'] },
  astillaVertical: { etiqueta: 'nombre', marcas: ['columna', 'columna', 'columna'] },
  tiraHorizontal: { etiqueta: 'lado', marcas: ['junto', 'junto', 'junto'] },
  chico: { etiqueta: 'nombre', marcas: ['columna', 'columna', 'fila'] },
  minusculo: { etiqueta: 'nombre', marcas: ['nada', 'nada', 'nada'] },
}

function dentro(r: Rect, cx: number, cy: number, mitadAncho: number, mitadAlto: number) {
  return cx - mitadAncho >= r.x && cx + mitadAncho <= r.x + r.w && cy - mitadAlto >= r.y && cy + mitadAlto <= r.y + r.h
}

describe('croquis: etiqueta', () => {
  for (const [forma, r] of Object.entries(FORMAS)) {
    it(`${forma}: ${ESPERADO[forma].etiqueta}`, () => {
      const e = decidirEtiqueta(r, '2A', '200 ha')
      expect(e.modo).toBe(ESPERADO[forma].etiqueta)
      // La etiqueta nunca ocupa más alto que el potrero.
      expect(e.alto).toBeLessThanOrEqual(r.h)
    })
  }

  it('se centra en los potreros angostos y lleva sangría en los anchos', () => {
    expect(decidirEtiqueta(FORMAS.astillaVertical, '1B', '10 ha').centrada).toBe(true)
    expect(decidirEtiqueta(FORMAS.grande, '1B', '10 ha').centrada).toBe(false)
  })

  it('sin hectáreas siempre es sólo el nombre', () => {
    expect(decidirEtiqueta(FORMAS.grande, '2A', '').modo).toBe('nombre')
  })
})

describe('croquis: marcas de hacienda', () => {
  for (const [forma, r] of Object.entries(FORMAS)) {
    for (const n of [1, 2, 3] as const) {
      const esperado = ESPERADO[forma].marcas[n - 1]
      it(`${forma} con ${n} especie${n > 1 ? 's' : ''}: ${esperado}`, () => {
        const etiqueta = decidirEtiqueta(r, '2A', '200 ha')
        const m = decidirMarcas(r, n, etiqueta)
        expect(m.modo).toBe(esperado)
        // Cuando dibuja, dibuja UNA marca por especie — nunca menos.
        expect(m.posiciones).toHaveLength(m.modo === 'nada' ? 0 : n)
        // Y todas adentro del potrero.
        for (const p of m.posiciones) {
          const [mw, mh] = m.modo === 'siluetas' ? [11, 7] : [RADIO_PUNTO, RADIO_PUNTO]
          expect(dentro(r, p.cx, p.cy, mw, mh), `marca en (${p.cx}, ${p.cy}) fuera de ${JSON.stringify(r)}`).toBe(true)
        }
        // Y ninguna encima de la etiqueta (salvo `junto`, que va a su lado).
        if (m.modo !== 'junto') {
          for (const p of m.posiciones) expect(p.cy - RADIO_PUNTO).toBeGreaterThanOrEqual(r.y + etiqueta.alto - 2)
        }
      })
    }
  }

  it('sin especies no dibuja nada', () => {
    expect(decidirMarcas(FORMAS.grande, 0, decidirEtiqueta(FORMAS.grande, '2A', '')).modo).toBe('nada')
  })

  it('el caso de Lau: potrero de 10 ha en un campo de 1.000, tres especies', () => {
    // Astilla vertical a la derecha del croquis, como 1B en la captura.
    const r: Rect = { x: 380, y: 20, w: 20, h: 150 }
    const e = decidirEtiqueta(r, '1B', '10 ha')
    expect(e.modo).toBe('nombre')
    expect(e.centrada).toBe(true)
    const m = decidirMarcas(r, 3, e)
    expect(m.modo).toBe('columna')
    expect(m.posiciones).toHaveLength(3)
  })

  it('el otro caso de Lau: tira horizontal de 5 ha, tres especies', () => {
    const r: Rect = { x: 220, y: 150, w: 170, h: 28 }
    const e = decidirEtiqueta(r, '2A', '5 ha')
    expect(e.modo).toBe('lado')
    const m = decidirMarcas(r, 3, e)
    expect(m.modo).toBe('junto')
    expect(m.posiciones).toHaveLength(3)
    // A la derecha de la etiqueta, en su misma línea.
    for (const p of m.posiciones) {
      expect(p.cx).toBeGreaterThan(e.x + e.ancho)
      expect(p.cy).toBeLessThan(r.y + e.alto)
    }
  })
})
