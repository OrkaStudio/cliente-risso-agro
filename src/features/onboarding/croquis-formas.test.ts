import { describe, expect, it } from 'vitest'
import {
  MARCA,
  RADIO_PUNTO,
  anchoTexto,
  acomodarHacienda,
  acomodarSiembra,
  decidirEtiqueta,
  repartir,
  tintaTexto,
  type Etiqueta,
  type Rect,
} from './croquis-layout'
import { CULTIVOS } from './cultivos-croquis'

/**
 * Todas las formas de potrero que el croquis puede dibujar, no un puñado.
 *
 * Se arman ~2.000 campos (de 1 a 16 potreros; hectáreas parejas, uno
 * dominante con astillas, escalonadas, al azar; con y sin parte del campo
 * sin asignar), se reparten con el MISMO `repartir` del croquis, y en cada
 * potrero que sale se verifica lo que se dibuja con las medidas reales:
 *
 *   · la etiqueta entra en el potrero;
 *   · la hacienda (1, 2 y 3 especies) SIEMPRE se ve —silueta o, si no entra,
 *     punto—, adentro, sin pisar la etiqueta ni pisarse entre sí;
 *   · lo sembrado SIEMPRE se ve —su marca, o si no entra su NOMBRE escrito—,
 *     adentro y sin pisar la etiqueta. El punto queda para nombres muy largos
 *     escritos a mano.
 */

const INTERIOR: Rect = { x: 14, y: 14, w: 392, h: 172 }
/** Lo dibujado tiene que quedar a esta distancia del borde (que se dibuja 2 adentro, con trazo de hasta 2,5 en foco). */
const AIRE_BORDE = 3.4

type Caja = { x0: number; y0: number; x1: number; y1: number }

function formas(): { r: Rect; nombre: string; ha: string }[] {
  let seed = 7
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  const casos: number[][] = []
  for (let n = 1; n <= 16; n++) {
    casos.push(Array(n).fill(100))
    casos.push([1000, ...Array(n - 1).fill(5)])
    casos.push(Array.from({ length: n }, (_, i) => 2 ** i))
    casos.push(Array.from({ length: n }, (_, i) => (i + 1) * 10))
    for (let k = 0; k < 120; k++) casos.push(Array.from({ length: n }, () => Math.round(1 + rnd() ** 3 * 999)))
  }
  const out: { r: Rect; nombre: string; ha: string }[] = []
  casos.forEach((c, ci) => {
    // Campos chicos y grandes: cambian los textos de hectáreas ("0,5 ha", "9.990 ha").
    const factor = ci % 3 === 0 ? 10 : ci % 3 === 1 ? 1 : 0.1
    const letra = 'ABCD'[ci % 4]!
    for (const faltante of [0, 0.3]) {
      const total = c.reduce((a, b) => a + b, 0)
      const items = c.map((a, i) => ({ clave: String(i), area: a }))
      if (faltante) items.push({ clave: '__resto', area: total * faltante })
      const rs = repartir(items, INTERIOR)
      for (const [k, r] of Object.entries(rs)) {
        if (k === '__resto') continue
        const ha = Math.round(c[Number(k)]! * factor * 10) / 10
        out.push({ r, nombre: `${Number(k) + 1}${letra}`, ha: `${ha.toLocaleString('es-AR')} ha` })
      }
    }
  })
  return out
}

const FORMAS = formas()

function adentro(r: Rect, c: Caja): boolean {
  return (
    c.x0 >= r.x + AIRE_BORDE - 0.01 &&
    c.x1 <= r.x + r.w - AIRE_BORDE + 0.01 &&
    c.y0 >= r.y + AIRE_BORDE - 0.01 &&
    c.y1 <= r.y + r.h - AIRE_BORDE + 0.01
  )
}
function seTocan(a: Caja, b: Caja): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
}

/** Las cajas de tinta de la etiqueta, tal como la dibuja `CroquisVivo`. */
function cajasEtiqueta(r: Rect, e: Etiqueta, nombre: string, ha: string): Caja[] {
  const t = tintaTexto(e.tamano)
  if (e.modo === 'parada') {
    const t10 = tintaTexto(10)
    return [{ x0: e.x - t10.arriba, x1: e.x + t10.abajo, y0: r.y + e.base - e.ancho, y1: r.y + e.base }]
  }
  const wN = anchoTexto(nombre, e.tamano, true)
  const w1 = e.modo === 'lado' ? e.ancho : wN
  const linea = (w: number, base: number, tt: { arriba: number; abajo: number }): Caja => ({
    x0: e.centrada ? e.x - w / 2 : e.x,
    x1: e.centrada ? e.x + w / 2 : e.x + w,
    y0: r.y + base - tt.arriba,
    y1: r.y + base + tt.abajo,
  })
  const cajas = [linea(w1, e.base, t)]
  if (e.modo === 'debajo') cajas.push(linea(anchoTexto(ha, 10, false), e.base + 12, tintaTexto(10)))
  return cajas
}

const cajaMarca = (cx: number, cy: number, k = 1): Caja => ({
  x0: cx - MARCA.izq * k,
  x1: cx + MARCA.der * k,
  y0: cy - MARCA.arriba * k,
  y1: cy + MARCA.abajo * k,
})
const cajaPunto = (cx: number, cy: number): Caja => ({
  x0: cx - RADIO_PUNTO - 0.5,
  x1: cx + RADIO_PUNTO + 0.5,
  y0: cy - RADIO_PUNTO - 0.5,
  y1: cy + RADIO_PUNTO + 0.5,
})

/**
 * Las fallas agrupadas por tipo ("Pastura: queda un punto": 104), para que
 * si algo se rompe se vea el patrón y no diez ejemplos sueltos.
 */
function agrupar(malas: string[]): Record<string, number> {
  const g: Record<string, number> = {}
  for (const x of malas) {
    const k = x.replace(/potrero [0-9.×]+ en \([0-9., ]+\)/, '').replace(/"[^"]*"/, '').trim()
    g[k] = (g[k] ?? 0) + 1
  }
  return g
}

function describir(r: Rect) {
  return `potrero ${r.w.toFixed(1)}×${r.h.toFixed(1)} en (${r.x.toFixed(1)}, ${r.y.toFixed(1)})`
}

describe('croquis: todas las formas de potrero', () => {
  it(`se generan muchas formas, de todos los tipos (${FORMAS.length})`, () => {
    expect(FORMAS.length).toBeGreaterThan(20000)
    const menor = Math.min(...FORMAS.map(({ r }) => Math.min(r.w, r.h)))
    // El piso del 5 % de `repartir` garantiza que no hay potreros más finos que esto.
    expect(menor).toBeGreaterThan(18)
  })

  it('la etiqueta entra siempre', () => {
    const malas: string[] = []
    for (const { r, nombre, ha } of FORMAS) {
      const e = decidirEtiqueta(r, nombre, ha)
      for (const c of cajasEtiqueta(r, e, nombre, ha))
        if (!adentro(r, c)) malas.push(`${describir(r)} "${nombre} ${ha}" (${e.modo})`)
    }
    expect(agrupar(malas)).toEqual({})
  })

  for (const n of [1, 2, 3] as const) {
    it(`la hacienda (${n} especie${n > 1 ? 's' : ''}) se ve siempre: silueta o punto, adentro y sin pisar nada`, () => {
      const malas: string[] = []
      const modos: Record<string, number> = {}
      for (const { r, nombre, ha } of FORMAS) {
        const { etiqueta: e, marcas: m } = acomodarHacienda(r, nombre, ha, n)
        modos[m.modo] = (modos[m.modo] ?? 0) + 1
        if (m.modo === 'nada') {
          malas.push(`${describir(r)}: no se dibuja nada`)
          continue
        }
        const silueta = m.modo === 'siluetas' || m.modo === 'siluetasJunto'
        const cajas = m.posiciones.map((p) => (silueta ? cajaMarca(p.cx, p.cy, m.escala) : cajaPunto(p.cx, p.cy)))
        const etiqueta = cajasEtiqueta(r, e, nombre, ha)
        cajas.forEach((c, i) => {
          if (!adentro(r, c)) malas.push(`${describir(r)}: ${m.modo} ${i} se sale`)
          if (etiqueta.some((l) => seTocan(l, c))) malas.push(`${describir(r)}: ${m.modo} ${i} pisa la etiqueta (${e.modo})`)
          for (let j = 0; j < i; j++) if (seTocan(cajas[j]!, c)) malas.push(`${describir(r)}: ${m.modo} ${i} pisa a ${j}`)
        })
      }
      console.log(`hacienda ×${n}:`, modos)
      expect(agrupar(malas)).toEqual({})
    })
  }

  const NOMBRES = [...CULTIVOS, 'Cebada', 'MAÍZ']
  it(`lo sembrado se ve siempre (${NOMBRES.join(', ')}): marca o nombre escrito, nunca un punto`, () => {
    const malas: string[] = []
    const tipos: Record<string, number> = {}
    for (const { r, nombre, ha } of FORMAS) {
      for (const cultivo of NOMBRES) {
        const { etiqueta: e, siembra: s } = acomodarSiembra(r, nombre, ha, cultivo)
        const etiqueta = cajasEtiqueta(r, e, nombre, ha)
        if (!s) {
          malas.push(`${describir(r)} ${cultivo}: no se dibuja nada`)
          continue
        }
        tipos[s.tipo] = (tipos[s.tipo] ?? 0) + 1
        if (s.tipo === 'punto') malas.push(`${describir(r)} ${cultivo}: queda un punto`)
        const t = tintaTexto(10)
        const wT = anchoTexto(cultivo, 10, true)
        const cajas: Caja[] =
          s.tipo === 'marca'
            ? [
                cajaMarca(s.cx, s.cy, s.escala),
                ...(s.baseNombre !== null
                  ? [{ x0: s.cx - wT / 2, x1: s.cx + wT / 2, y0: s.baseNombre - t.arriba, y1: s.baseNombre + t.abajo }]
                  : []),
              ]
            : s.tipo === 'texto'
              ? [{ x0: s.cx - wT / 2, x1: s.cx + wT / 2, y0: s.cy - t.arriba, y1: s.cy + t.abajo }]
              : s.tipo === 'textoParado'
                ? [{ x0: s.cx - t.arriba, x1: s.cx + t.abajo, y0: s.cy - wT / 2, y1: s.cy + wT / 2 }]
                : [cajaPunto(s.cx, s.cy)]
        for (const c of cajas) {
          if (!adentro(r, c)) malas.push(`${describir(r)} ${cultivo}: ${s.tipo} se sale`)
          if (etiqueta.some((l) => seTocan(l, c))) malas.push(`${describir(r)} ${cultivo}: ${s.tipo} pisa la etiqueta (${e.modo})`)
        }
        if (cajas.length === 2 && seTocan(cajas[0]!, cajas[1]!)) malas.push(`${describir(r)} ${cultivo}: el nombre pisa la marca`)
      }
    }
    console.log('siembra:', tipos)
    expect(agrupar(malas)).toEqual({})
  })

  it('un nombre larguísimo escrito a mano: si no entra de ninguna forma, punto — pero adentro', () => {
    for (const { r, nombre, ha } of FORMAS.slice(0, 3000)) {
      const { siembra: s } = acomodarSiembra(r, nombre, ha, 'Sorgo forrajero de segunda')
      expect(s).not.toBeNull()
      if (s!.tipo === 'punto') expect(adentro(r, cajaPunto(s!.cx, s!.cy))).toBe(true)
    }
  })
})
