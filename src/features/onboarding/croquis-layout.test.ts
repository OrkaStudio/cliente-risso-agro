import { describe, expect, it } from 'vitest'
import { MARCA, RADIO_PUNTO, acomodarHacienda, decidirEtiqueta, decidirMarcas, type Rect } from './croquis-layout'

/**
 * La tabla de casos del croquis, una fila por forma de potrero y una columna
 * por cantidad de especies. Cada caso fija DOS cosas: qué modo se elige y que
 * todo lo dibujado cae adentro del potrero. Lo segundo es lo que se venía
 * rompiendo: el modo era el correcto y el tercer punto caía afuera igual.
 */

// Formas con nombre, en unidades del croquis (viewBox 420×200). Todas las
// posibles, generadas del reparto real, están en `croquis-formas.test.ts`;
// acá quedan los casos con nombre, para leer la regla de un vistazo.
const FORMAS: Record<string, Rect> = {
  grande: { x: 20, y: 20, w: 200, h: 160 },
  angostoAlto: { x: 20, y: 20, w: 60, h: 160 },
  astillaVertical: { x: 20, y: 20, w: 22, h: 160 },
  tiraHorizontal: { x: 20, y: 20, w: 180, h: 30 },
  tiraBaja: { x: 20, y: 20, w: 110, h: 20 },
  chico: { x: 20, y: 20, w: 40, h: 40 },
}

/** Lo que se espera de cada forma: la etiqueta completa, y las marcas para 1, 2 y 3 especies. */
const ESPERADO: Record<keyof typeof FORMAS, { etiqueta: string; marcas: [string, string, string] }> = {
  grande: { etiqueta: 'lado', marcas: ['siluetas', 'siluetas', 'siluetas'] },
  angostoAlto: { etiqueta: 'debajo', marcas: ['siluetas', 'siluetas', 'columna'] },
  astillaVertical: { etiqueta: 'nombre', marcas: ['columna', 'columna', 'columna'] },
  tiraHorizontal: { etiqueta: 'lado', marcas: ['siluetasJunto', 'siluetasJunto', 'siluetasJunto'] },
  tiraBaja: { etiqueta: 'lado', marcas: ['junto', 'junto', 'junto'] },
  // Chico: las hectáreas se van de la etiqueta para que entre la silueta.
  chico: { etiqueta: 'debajo', marcas: ['siluetas', 'columna', 'fila'] },
}

function dentro(r: Rect, cx: number, cy: number, izq: number, der: number, arriba: number, abajo: number) {
  return cx - izq >= r.x && cx + der <= r.x + r.w && cy - arriba >= r.y && cy + abajo <= r.y + r.h
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
        // Lo mismo que dibuja el croquis: etiqueta y marcas acomodadas juntas.
        const { etiqueta, marcas: m } = acomodarHacienda(r, '2A', '200 ha', n)
        expect(m.modo).toBe(esperado)
        // Cuando dibuja, dibuja UNA marca por especie — nunca menos.
        expect(m.posiciones).toHaveLength(m.modo === 'nada' ? 0 : n)
        // Y todas adentro del potrero.
        const silueta = m.modo === 'siluetas' || m.modo === 'siluetasJunto'
        for (const p of m.posiciones) {
          const k = m.escala
          const [izq, der, arriba, abajo] = silueta
            ? [MARCA.izq * k, MARCA.der * k, MARCA.arriba * k, MARCA.abajo * k]
            : [RADIO_PUNTO, RADIO_PUNTO, RADIO_PUNTO, RADIO_PUNTO]
          expect(dentro(r, p.cx, p.cy, izq, der, arriba, abajo), `marca en (${p.cx}, ${p.cy}) fuera de ${JSON.stringify(r)}`).toBe(true)
        }
        // Y ninguna encima de la etiqueta (salvo las que van a su lado).
        if (m.modo !== 'junto' && m.modo !== 'siluetasJunto') {
          const arriba = silueta ? MARCA.arriba * m.escala : RADIO_PUNTO
          for (const p of m.posiciones) expect(p.cy - arriba).toBeGreaterThanOrEqual(r.y + etiqueta.alto - 0.01)
        }
      })
    }
  }

  it('sin especies no dibuja nada', () => {
    expect(decidirMarcas(FORMAS.grande, 0, decidirEtiqueta(FORMAS.grande, '2A', '')).modo).toBe('nada')
  })

  it('el caso de Lau: astilla de 10 ha en un campo de 1.000, tres especies — etiqueta parada y columna', () => {
    // Astilla vertical a la derecha del croquis, como 1B en la captura.
    const r: Rect = { x: 380, y: 20, w: 20, h: 150 }
    const e = decidirEtiqueta(r, '1B', '10 ha')
    // No entra acostada con aire: va parada, a lo largo, con sus hectáreas.
    expect(e.modo).toBe('parada')
    expect(e.conHa).toBe(true)
    const m = decidirMarcas(r, 3, e)
    expect(m.modo).toBe('columna')
    expect(m.posiciones).toHaveLength(3)
  })

  it('el otro caso de Lau: tira horizontal de 5 ha, tres especies — siluetas al lado del nombre', () => {
    const r: Rect = { x: 220, y: 150, w: 170, h: 28 }
    const e = decidirEtiqueta(r, '2A', '5 ha')
    expect(e.modo).toBe('lado')
    const m = decidirMarcas(r, 3, e)
    expect(m.modo).toBe('siluetasJunto')
    expect(m.posiciones).toHaveLength(3)
    for (const p of m.posiciones) {
      expect(p.cx - MARCA.izq * m.escala).toBeGreaterThan(e.x + e.ancho)
      expect(dentro(r, p.cx, p.cy, MARCA.izq * m.escala, MARCA.der * m.escala, MARCA.arriba * m.escala, MARCA.abajo * m.escala)).toBe(true)
    }
  })

  it('tira baja donde las siluetas no entran: puntos CENTRADOS, no pegados al nombre', () => {
    // Como 3A de 20 ha en la captura del 24/09: tira baja y no tan ancha.
    const r: Rect = { x: 200, y: 166, w: 110, h: 20 }
    const e = decidirEtiqueta(r, '3A', '20 ha')
    const m = decidirMarcas(r, 3, e)
    expect(m.modo).toBe('junto')
    const medio = (m.posiciones[0]!.cx + m.posiciones[2]!.cx) / 2
    const mitad = (2 * 9 + (RADIO_PUNTO + 0.5) * 2) / 2
    const libre0 = e.x + e.ancho + 6
    const esperado = Math.min(Math.max(r.x + r.w / 2, libre0 + mitad), r.x + r.w - 4 - mitad)
    expect(Math.abs(medio - esperado)).toBeLessThan(0.01)
    for (const p of m.posiciones) expect(dentro(r, p.cx, p.cy, RADIO_PUNTO, RADIO_PUNTO, RADIO_PUNTO, RADIO_PUNTO)).toBe(true)
  })

  it('un potrero chico prefiere siluetas chicas antes que un punto', () => {
    const r: Rect = { x: 20, y: 20, w: 45, h: 44 }
    const { marcas } = acomodarHacienda(r, '4C', '200 ha', 1)
    expect(marcas.modo).toBe('siluetas')
    expect(marcas.escala).toBeLessThan(1)
  })
})
