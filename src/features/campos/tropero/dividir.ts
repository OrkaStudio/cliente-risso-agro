// Editor del mapa: dividir un potrero con una línea (Figma 1054:1268, «M4 ·
// Dividí con una línea») y saber qué potrero se tocó. Sin React ni red.
// Plano en [lat, lng]: a escala de un potrero la curvatura no cuenta.
import type { LatLng } from '@/features/mapa/reglas'

type Corte = { punto: LatLng; tramo: number; t: number; lado: number; s: number }

/** Dónde se cruzan los segmentos a→b y c→d (t sobre a→b, s sobre c→d), o null. */
function cruce(a: LatLng, b: LatLng, c: LatLng, d: LatLng): { t: number; s: number } | null {
  const r = [b[0] - a[0], b[1] - a[1]]
  const q = [d[0] - c[0], d[1] - c[1]]
  const den = r[0]! * q[1]! - r[1]! * q[0]!
  if (Math.abs(den) < 1e-18) return null
  const ac = [c[0] - a[0], c[1] - a[1]]
  const t = (ac[0]! * q[1]! - ac[1]! * q[0]!) / den
  const s = (ac[0]! * r[1]! - ac[1]! * r[0]!) / den
  return t >= 0 && t <= 1 && s >= 0 && s <= 1 ? { t, s } : null
}

/** El dibujo sin el último punto repetido (algunos llegan cerrados). */
function abierto(p: LatLng[]): LatLng[] {
  const [a, z] = [p[0], p[p.length - 1]]
  return p.length > 1 && a && z && a[0] === z[0] && a[1] === z[1] ? p.slice(0, -1) : p
}

/** Los vértices del borde al ir de un corte al otro, hacia adelante. */
function recorrido(anillo: LatLng[], desde: Corte, hasta: Corte): LatLng[] {
  const n = anillo.length
  const out: LatLng[] = []
  if (desde.lado === hasta.lado && desde.s <= hasta.s) return out
  let i = (desde.lado + 1) % n
  for (let k = 0; k < n; k++) {
    out.push(anillo[i]!)
    if (i === hasta.lado) break
    i = (i + 1) % n
  }
  return out
}

export type Division =
  | { ok: true; piezas: [LatLng[], LatLng[]] }
  /** `falta`: la línea todavía no cruzó el potrero de lado a lado. */
  | { ok: false; motivo: 'falta' | 'cruza-de-mas' }

/**
 * Corta el potrero con la línea que marcó el productor (el alambrado nuevo).
 * La línea tiene que entrar por un lado y salir por otro: dos cruces con el
 * borde, ni más ni menos. Los puntos del medio quedan como el quiebre del
 * alambrado, compartido por las dos partes.
 */
export function dividir(poligono: LatLng[], marcada: LatLng[]): Division {
  const anillo = abierto(poligono)
  const linea = estirar(marcada)
  const n = anillo.length
  const cortes: Corte[] = []
  for (let tramo = 0; tramo < linea.length - 1; tramo++) {
    for (let lado = 0; lado < n; lado++) {
      const x = cruce(linea[tramo]!, linea[tramo + 1]!, anillo[lado]!, anillo[(lado + 1) % n]!)
      if (!x) continue
      const a = linea[tramo]!
      const b = linea[tramo + 1]!
      const punto: LatLng = [a[0] + (b[0] - a[0]) * x.t, a[1] + (b[1] - a[1]) * x.t]
      // Un cruce justo en un vértice aparece en los dos lados que lo comparten.
      if (cortes.some((c) => Math.abs(c.punto[0] - punto[0]) < 1e-12 && Math.abs(c.punto[1] - punto[1]) < 1e-12)) continue
      cortes.push({ punto, tramo, t: x.t, lado, s: x.s })
    }
  }
  if (cortes.length < 2) return { ok: false, motivo: 'falta' }
  if (cortes.length > 2) return { ok: false, motivo: 'cruza-de-mas' }
  const [p1, p2] = [...cortes].sort((a, b) => a.tramo + a.t - (b.tramo + b.t)) as [Corte, Corte]
  const quiebres = linea.slice(p1.tramo + 1, p2.tramo + 1)
  const a: LatLng[] = [p1.punto, ...quiebres, p2.punto, ...recorrido(anillo, p2, p1)]
  const b: LatLng[] = [p2.punto, ...[...quiebres].reverse(), p1.punto, ...recorrido(anillo, p1, p2)]
  if (a.length < 3 || b.length < 3) return { ok: false, motivo: 'falta' }
  return { ok: true, piezas: [a, b] }
}

/**
 * La línea, un poco más larga en las dos puntas. El mapa engancha los puntos
 * al alambrado: una punta que quedó justo sobre el borde tiene que contar como
 * cruce (sin esto, en el celular la división no se armaba nunca).
 */
function estirar(linea: LatLng[]): LatLng[] {
  if (linea.length < 2) return linea
  const mas = (desde: LatLng, hacia: LatLng): LatLng => [hacia[0] + (hacia[0] - desde[0]) * 1e-3, hacia[1] + (hacia[1] - desde[1]) * 1e-3]
  const n = linea.length
  return [mas(linea[1]!, linea[0]!), ...linea.slice(1, -1), mas(linea[n - 2]!, linea[n - 1]!)]
}

/** El punto cae adentro del dibujo (rayo hacia el este). */
export function adentro(punto: LatLng, poligono: LatLng[]): boolean {
  const [y, x] = punto
  let si = false
  const p = abierto(poligono)
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [yi, xi] = p[i]!
    const [yj, xj] = p[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) si = !si
  }
  return si
}

/** El número que sigue en el campo: con 1B…9B, «10». */
export function numeroSiguiente(nombres: string[]): string {
  const usados = nombres.map((n) => parseInt(n.match(/^\d+/)?.[0] ?? '', 10)).filter((n) => Number.isFinite(n))
  return String((usados.length ? Math.max(...usados) : 0) + 1)
}
