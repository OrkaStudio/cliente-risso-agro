/**
 * Cómo se acomoda lo que va adentro de un potrero del croquis: la etiqueta
 * (nombre y hectáreas) y las marcas de hacienda (una por especie).
 *
 * Es un módulo PURO, sin React ni SVG, por una razón: cada potrero puede
 * tener cualquier forma —cuadrado, astilla vertical, tira horizontal— y
 * cualquier cantidad de especies, y cada combinación se venía arreglando a
 * medida que Lau la encontraba recorriendo la app. Acá está la tabla entera,
 * con un test por caso (`croquis-layout.test.ts`), para que la próxima forma
 * rara no sea una sorpresa.
 *
 * Unidades: las del viewBox del croquis (420×200), no píxeles de pantalla.
 *
 * ┌──────────────────────┬──────────────────────┬──────────────────────────┐
 * │ Forma del potrero    │ Etiqueta             │ Marcas (1 a 3 especies)  │
 * ├──────────────────────┼──────────────────────┼──────────────────────────┤
 * │ Grande               │ "3A 700 ha" al lado  │ siluetas en fila         │
 * │ Angosto y alto       │ "4A" y "200 ha" abajo│ siluetas si entran, si   │
 * │  (w ≥ 44)            │                      │ no columna de puntos     │
 * │ Astilla vertical     │ "1B" centrado, sin ha│ columna de puntos        │
 * │  (w < 44)            │                      │                          │
 * │ Tira horizontal      │ "2A 5 ha" al lado    │ puntos JUNTO al nombre,  │
 * │  (h chico, w grande) │                      │ en la misma línea        │
 * │ Chico en los dos     │ nombre centrado      │ fila de puntos si entra, │
 * │  sentidos            │                      │ si no nada               │
 * │ Minúsculo            │ nombre centrado      │ nada — está en el hover  │
 * └──────────────────────┴──────────────────────┴──────────────────────────┘
 */

export type Rect = { x: number; y: number; w: number; h: number }

/** Ancho estimado del texto: semibold 12 para el nombre, normal 10 para las ha. */
const ANCHO_NOMBRE = 7.2
const ANCHO_HA = 5.4
const MARGEN = 8
/** Ancho de una silueta y aire entre dos. */
const SILUETA = 22
const AIRE_SILUETA = 8
/** Radio de un punto y paso entre dos (el paso se achica hasta el mínimo). */
export const RADIO_PUNTO = 3
const PASO_PUNTO = 9
const PASO_MINIMO = 6
/** Alto de una línea de etiqueta y de dos. */
const ALTO_UNA_LINEA = 22
const ALTO_DOS_LINEAS = 32
/** Debajo de este ancho la etiqueta va centrada, sin sangría izquierda. */
const ANCHO_CENTRAR = 44

export type Etiqueta = {
  modo: 'lado' | 'debajo' | 'nombre'
  /** Centrada horizontalmente (potreros angostos) o con sangría izquierda. */
  centrada: boolean
  /** Coordenada x del ancla del texto, en el sistema del croquis. */
  x: number
  /** Alto que ocupa, contado desde el borde superior del potrero. */
  alto: number
  /** Ancho estimado de la primera línea (para poner marcas a su derecha). */
  ancho: number
}

export function decidirEtiqueta(r: Rect, nombre: string, textoHa: string): Etiqueta {
  const anchoNombre = nombre.length * ANCHO_NOMBRE
  const anchoHa = textoHa.length * ANCHO_HA
  const centrada = r.w < ANCHO_CENTRAR
  const x = centrada ? r.x + r.w / 2 : r.x + MARGEN

  if (textoHa && !centrada && r.w >= anchoNombre + anchoHa + 20) {
    return { modo: 'lado', centrada, x, alto: ALTO_UNA_LINEA, ancho: anchoNombre + 4 + anchoHa }
  }
  if (textoHa && r.w >= anchoHa + 16 && r.h >= 42) {
    return { modo: 'debajo', centrada, x, alto: ALTO_DOS_LINEAS, ancho: Math.max(anchoNombre, anchoHa) }
  }
  return { modo: 'nombre', centrada, x, alto: Math.min(ALTO_UNA_LINEA, r.h), ancho: anchoNombre }
}

export type ModoMarcas = 'siluetas' | 'columna' | 'fila' | 'junto' | 'nada'
export type Marcas = { modo: ModoMarcas; posiciones: { cx: number; cy: number }[] }

/**
 * Dónde van las marcas de `n` especies, dado el potrero y la etiqueta que ya
 * ocupa lugar arriba. Se prueba en orden de preferencia y se devuelve la
 * primera que entra.
 */
export function decidirMarcas(r: Rect, n: number, etiqueta: Etiqueta): Marcas {
  if (n <= 0) return { modo: 'nada', posiciones: [] }

  const altoLibre = r.h - etiqueta.alto - 6
  const cyLibre = r.y + etiqueta.alto + altoLibre / 2
  const cxCentro = r.x + r.w / 2

  // 1. Siluetas en fila, centradas en el espacio libre.
  const anchoFila = n * SILUETA + (n - 1) * AIRE_SILUETA
  if (altoLibre >= 16 && anchoFila <= r.w - MARGEN) {
    const x0 = cxCentro - anchoFila / 2 + SILUETA / 2
    return {
      modo: 'siluetas',
      posiciones: Array.from({ length: n }, (_, i) => ({ cx: x0 + i * (SILUETA + AIRE_SILUETA), cy: cyLibre })),
    }
  }

  // 2. Columna de puntos: cuando hay alto pero no ancho.
  const pasoColumna = n === 1 ? 0 : Math.min(PASO_PUNTO, (altoLibre - RADIO_PUNTO * 2) / (n - 1))
  if (r.w >= RADIO_PUNTO * 2 + 8 && altoLibre >= RADIO_PUNTO * 2 + 2 && (n === 1 || pasoColumna >= PASO_MINIMO)) {
    const alto = (n - 1) * pasoColumna
    return {
      modo: 'columna',
      posiciones: Array.from({ length: n }, (_, i) => ({ cx: cxCentro, cy: cyLibre - alto / 2 + i * pasoColumna })),
    }
  }

  // 3. Fila de puntos debajo de la etiqueta: cuando hay ancho pero poco alto.
  const pasoFila = n === 1 ? 0 : Math.min(PASO_PUNTO, (r.w - MARGEN - RADIO_PUNTO * 2) / (n - 1))
  if (altoLibre >= RADIO_PUNTO * 2 + 2 && (n === 1 || pasoFila >= PASO_MINIMO)) {
    const ancho = (n - 1) * pasoFila
    return {
      modo: 'fila',
      posiciones: Array.from({ length: n }, (_, i) => ({ cx: cxCentro - ancho / 2 + i * pasoFila, cy: cyLibre })),
    }
  }

  // 4. Junto al nombre, en su misma línea: la tira horizontal, donde la
  //    etiqueta se come todo el alto. Sólo con etiqueta a la izquierda.
  if (!etiqueta.centrada && etiqueta.modo !== 'debajo') {
    const x0 = etiqueta.x + etiqueta.ancho + MARGEN + RADIO_PUNTO
    const anchoNecesario = x0 + (n - 1) * PASO_MINIMO + RADIO_PUNTO + 4
    if (anchoNecesario <= r.x + r.w && r.h >= 14) {
      const paso = Math.min(PASO_PUNTO, (r.x + r.w - 4 - RADIO_PUNTO - x0) / Math.max(1, n - 1))
      return {
        modo: 'junto',
        posiciones: Array.from({ length: n }, (_, i) => ({ cx: x0 + i * (n === 1 ? 0 : paso), cy: r.y + 12 })),
      }
    }
  }

  return { modo: 'nada', posiciones: [] }
}
