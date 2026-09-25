/**
 * Cómo se acomoda lo que va adentro de un potrero del croquis: la etiqueta
 * (nombre y hectáreas), las marcas de hacienda (una por especie) y lo
 * sembrado (su marca, su nombre o un punto).
 *
 * Es un módulo PURO, sin React ni SVG, por una razón: cada potrero puede
 * tener cualquier forma —cuadrado, astilla vertical, tira horizontal— y cada
 * combinación se venía arreglando a medida que Lau la encontraba recorriendo
 * la app. Acá está la regla entera, y `croquis-formas.test.ts` la prueba
 * contra MILES de potreros reales (los que salen de `repartir` con
 * combinaciones de hectáreas), con las medidas reales de lo que se dibuja.
 *
 * Unidades: las del viewBox del croquis (420×200), no píxeles de pantalla.
 *
 * Las medidas salen del navegador (getBBox con Inter, 24/09/2026), no de
 * estimar: la versión anterior suponía siluetas de 14 de alto y miden 21
 * con el contorno, y por eso rozaban la etiqueta en los casos al límite.
 *
 *   Etiqueta   12 px (10 px en potreros chicos); en una tira baja se
 *              centra en el alto; en una astilla donde no entra acostada,
 *              va PARADA (rotada) a lo largo del potrero.
 *   Hacienda   siluetas abajo de la etiqueta → siluetas a su lado →
 *              puntos (columna, fila o al lado), siempre centrados.
 *   Siembra    su marca (con el nombre abajo si sobra) → su NOMBRE escrito
 *              (acostado, al lado, o parado en una astilla) → un punto.
 */

export type Rect = { x: number; y: number; w: number; h: number }

// ===== Medidas reales =====

/** Aire entre lo dibujado y el borde del potrero (el borde se dibuja 2 adentro). */
const BORDE = 4
/** Sangría de la etiqueta cuando no va centrada. */
const SANGRIA = 7
/** Debajo de este ancho la etiqueta va centrada. */
const ANCHO_CENTRAR = 44

/**
 * La caja de UNA marca (silueta de especie o de cultivo) alrededor de su
 * centro, con el contorno incluido. La más grande de todas: el caballo
 * (-11.6..10.5 × -11.3..8) y el trigo (-11.5..8.5 de alto).
 */
export const MARCA = { izq: 12.2, der: 11.2, arriba: 12, abajo: 9.2 }
const MARCA_ANCHO = MARCA.izq + MARCA.der
const MARCA_ALTO = MARCA.arriba + MARCA.abajo
/** Entre dos marcas en fila. */
const AIRE_MARCA = 6
/** Radio de un punto, con su borde. */
export const RADIO_PUNTO = 3
const RADIO_CON_BORDE = RADIO_PUNTO + 0.5
const PASO_PUNTO = 9
const PASO_MINIMO = 7.5

/** Ancho de texto por letra, medido con Inter. Conservador: si sobra, cae al plan B. */
function anchoLetra(c: string, tamano: number, negrita: boolean): number {
  const base = /[0-9]/.test(c)
    ? 6.2
    : /[A-ZÁÉÍÓÚÑ]/.test(c)
      ? /[MW]/.test(c)
        ? 9.4
        : 7.2
      : /[ilí.,'|]/.test(c)
        ? 2.9
        : c === ' '
          ? 2.9
          : /[mw]/.test(c)
            ? 8.3
            : 5.7
  return (base * tamano) / 10 * (negrita ? 1.04 : 1)
}
export function anchoTexto(t: string, tamano: number, negrita = true): number {
  let w = 0
  for (const c of t) w += anchoLetra(c, tamano, negrita)
  return w
}
/** Alto de tinta de una línea de texto sobre y bajo su línea de base. */
export function tintaTexto(tamano: number): { arriba: number; abajo: number } {
  return { arriba: tamano * 0.78, abajo: tamano * 0.22 }
}

// ===== Etiqueta =====

export type Etiqueta = {
  /** `lado`: "2A 70 ha" en una línea · `debajo`: nombre y ha en dos ·
   *  `nombre`: sólo el nombre · `parada`: rotada, a lo largo de una astilla. */
  modo: 'lado' | 'debajo' | 'nombre' | 'parada'
  /** Centrada horizontalmente (potreros angostos) o con sangría. */
  centrada: boolean
  /** Ancla del texto: x, y la línea de base de la primera línea. */
  x: number
  base: number
  tamano: 10 | 12
  /** Alto que ocupa, contado desde el borde superior del potrero. */
  alto: number
  /** Ancho de la primera línea (para poner cosas a su derecha). */
  ancho: number
  /** Si lleva las hectáreas (en `parada`, van en la misma línea). */
  conHa: boolean
}

export function decidirEtiqueta(r: Rect, nombre: string, textoHa: string): Etiqueta {
  const tamano: 10 | 12 = r.w < 70 || r.h < 40 ? 10 : 12
  const tinta = tintaTexto(tamano)
  const wN = anchoTexto(nombre, tamano, true)
  const wH = textoHa ? anchoTexto(textoHa, 10, false) : 0
  const centrada = r.w < ANCHO_CENTRAR
  const x = centrada ? r.x + r.w / 2 : r.x + SANGRIA
  // Centrada, puede llegar hasta el aire mínimo del borde (3,5): así "1B"
  // entra acostado en una astilla de 20.
  const libreX = centrada ? r.w - 7 : r.w - SANGRIA - BORDE
  // La línea de base: arriba, con aire; en una tira baja, centrada en el alto.
  const baseArriba = BORDE + 3 + tinta.arriba
  const baseCentrada = r.h / 2 + tinta.arriba / 2 - tinta.abajo / 2
  const base = Math.min(baseArriba, baseCentrada)
  const alto1 = base + tinta.abajo + 3

  if (wN <= libreX) {
    if (textoHa && !centrada && wN + 4 + wH <= libreX) {
      return { modo: 'lado', centrada, x, base, tamano, alto: alto1, ancho: wN + 4 + wH, conHa: true }
    }
    const base2 = base + 12
    if (textoHa && wH <= libreX && base2 + 2.2 + BORDE <= r.h) {
      return { modo: 'debajo', centrada, x, base, tamano, alto: base2 + 2.2 + 3, ancho: Math.max(wN, wH), conHa: true }
    }
    return { modo: 'nombre', centrada, x, base, tamano, alto: alto1, ancho: wN, conHa: false }
  }
  // No entra acostada: parada, a lo largo del potrero, leída de abajo arriba.
  const w10 = anchoTexto(nombre, 10, true)
  const conHa = !!textoHa && w10 + 4 + wH <= r.h - 2 * BORDE
  const largo = conHa ? w10 + 4 + wH : w10
  return {
    modo: 'parada',
    centrada: true,
    // La línea de base de un texto rotado -90° es vertical: x la ubica
    // centrada en el ancho; `base` es donde termina (abajo) el texto.
    x: r.x + r.w / 2 + tintaTexto(10).arriba / 2 - tintaTexto(10).abajo / 2,
    base: BORDE + 1 + largo,
    tamano: 10,
    alto: BORDE + 1 + largo + 4,
    ancho: largo,
    conHa,
  }
}

// ===== Hacienda =====

export type ModoMarcas = 'siluetas' | 'siluetasJunto' | 'columna' | 'fila' | 'junto' | 'nada'
export type Marcas = {
  modo: ModoMarcas
  posiciones: { cx: number; cy: number }[]
  /** Tamaño de las siluetas: 1, o chicas en un potrero chico (antes que puntos). */
  escala: number
}

/**
 * Los tamaños que prueban las siluetas antes de rendirse a los puntos. La
 * más chica, en pantalla, sigue midiendo ~17 px: se reconoce.
 */
export const ESCALAS = [1, 0.78, 0.66] as const

/**
 * El espacio libre a la derecha de una etiqueta de una línea, y dónde
 * centrar algo de `ancho` ahí: en el centro del potrero si entra sin pisar
 * la etiqueta, si no en el centro del espacio libre.
 */
export function centroJunto(r: Rect, etiqueta: Etiqueta, ancho: number): number | null {
  if (etiqueta.centrada || (etiqueta.modo !== 'lado' && etiqueta.modo !== 'nombre')) return null
  const x0 = etiqueta.x + etiqueta.ancho + 6
  const x1 = r.x + r.w - BORDE
  if (ancho > x1 - x0) return null
  return Math.min(Math.max(r.x + r.w / 2, x0 + ancho / 2), x1 - ancho / 2)
}

/** La franja libre debajo de la etiqueta. */
function franja(r: Rect, etiqueta: Etiqueta): { y0: number; y1: number; alto: number } {
  const y0 = r.y + etiqueta.alto
  const y1 = r.y + r.h - BORDE
  return { y0, y1, alto: y1 - y0 }
}

/**
 * Dónde van las marcas de `n` especies. Se prueba en orden de preferencia y
 * se devuelve la primera que entra.
 */
export function decidirMarcas(r: Rect, n: number, etiqueta: Etiqueta): Marcas {
  if (n <= 0) return { modo: 'nada', posiciones: [], escala: 1 }
  const f = franja(r, etiqueta)
  const cxCentro = r.x + r.w / 2

  // Siluetas: a tamaño normal y, si no entran, chicas — siempre antes que
  // un punto, que no dice qué animal es.
  for (const k of ESCALAS) {
    const ancho = MARCA_ANCHO * k
    const alto = MARCA_ALTO * k
    const anchoFila = n * ancho + (n - 1) * AIRE_MARCA * k
    const enFila = (cx: number, cy: number) =>
      Array.from({ length: n }, (_, i) => ({
        cx: cx - anchoFila / 2 + MARCA.izq * k + i * (ancho + AIRE_MARCA * k),
        cy,
      }))
    // 1. En fila, centradas en la franja libre de abajo.
    if (f.alto >= alto + 2 && anchoFila <= r.w - 2 * BORDE) {
      const cy = (f.y0 + f.y1) / 2 + ((MARCA.arriba - MARCA.abajo) * k) / 2
      return { modo: 'siluetas', posiciones: enFila(cxCentro, cy), escala: k }
    }
    // 2. En la MISMA línea que la etiqueta: la tira ancha, donde abajo no hay
    //    lugar pero al costado sobra.
    if (r.h - 2 * BORDE >= alto) {
      const cx = centroJunto(r, etiqueta, anchoFila)
      if (cx !== null) {
        const cy = r.y + r.h / 2 + ((MARCA.arriba - MARCA.abajo) * k) / 2
        return { modo: 'siluetasJunto', posiciones: enFila(cx, cy), escala: k }
      }
    }
  }

  // 3. Columna de puntos: cuando hay alto pero no ancho.
  const pasoColumna = n === 1 ? 0 : Math.min(PASO_PUNTO, (f.alto - 2 * RADIO_CON_BORDE) / (n - 1))
  if (
    r.w >= 2 * RADIO_CON_BORDE + 2 * BORDE &&
    f.alto >= 2 * RADIO_CON_BORDE &&
    (n === 1 || pasoColumna >= PASO_MINIMO)
  ) {
    const cy0 = (f.y0 + f.y1) / 2 - ((n - 1) * pasoColumna) / 2
    return {
      modo: 'columna',
      posiciones: Array.from({ length: n }, (_, i) => ({ cx: cxCentro, cy: cy0 + i * pasoColumna })),
      escala: 1,
    }
  }

  // 4. Fila de puntos debajo de la etiqueta: hay ancho pero poco alto.
  const pasoFila = n === 1 ? 0 : Math.min(PASO_PUNTO, (r.w - 2 * BORDE - 2 * RADIO_CON_BORDE) / (n - 1))
  if (f.alto >= 2 * RADIO_CON_BORDE && (n === 1 || pasoFila >= PASO_MINIMO)) {
    const cx0 = cxCentro - ((n - 1) * pasoFila) / 2
    return {
      modo: 'fila',
      posiciones: Array.from({ length: n }, (_, i) => ({ cx: cx0 + i * pasoFila, cy: (f.y0 + f.y1) / 2 })),
      escala: 1,
    }
  }

  // 5. Puntos en la misma línea que la etiqueta, centrados.
  const anchoPuntos = (n - 1) * PASO_PUNTO + 2 * RADIO_CON_BORDE
  const cx = centroJunto(r, etiqueta, anchoPuntos)
  if (cx !== null) {
    const t = tintaTexto(etiqueta.tamano)
    const cy = r.y + etiqueta.base - (t.arriba - t.abajo) / 2
    const x0 = cx - ((n - 1) * PASO_PUNTO) / 2
    return {
      modo: 'junto',
      posiciones: Array.from({ length: n }, (_, i) => ({ cx: x0 + i * PASO_PUNTO, cy })),
      escala: 1,
    }
  }

  return { modo: 'nada', posiciones: [], escala: 1 }
}

// ===== Siembra =====

export type Siembra = {
  tipo: 'marca' | 'texto' | 'textoParado' | 'punto'
  /** Centro de la marca o del punto; para texto, el ancla (centro, línea de base). */
  cx: number
  cy: number
  /** Sólo en `marca`: el nombre va debajo, con su línea de base acá. */
  baseNombre: number | null
  /** Sólo en `marca`: 1, o chica en un potrero chico. */
  escala: number
}

/**
 * Qué se dibuja para lo sembrado, en orden de preferencia:
 *   1. la marca del cultivo (con su nombre debajo si sobra lugar);
 *   2. si la marca no entra, el NOMBRE escrito ("Pastura"): abajo de la
 *      etiqueta, a su lado, o parado en una astilla — se lee mejor que un
 *      punto de color que nadie sabe qué es;
 *   3. y sólo si tampoco entra el texto, un punto centrado.
 */
export function decidirSiembra(r: Rect, etiqueta: Etiqueta, cultivo: string): Siembra | null {
  const { modo, posiciones, escala } = decidirMarcas(r, 1, etiqueta)
  const pos = posiciones[0]
  const wT = anchoTexto(cultivo, 10, true)
  const tinta = tintaTexto(10)
  const altoTexto = tinta.arriba + tinta.abajo
  const f = franja(r, etiqueta)

  if (pos && modo === 'siluetas') {
    // Marca + nombre debajo, si entran los dos juntos en la franja.
    const juntos = MARCA_ALTO * escala + 3 + altoTexto
    if (f.alto >= juntos + 2 && wT <= r.w - 2 * BORDE) {
      const y0 = (f.y0 + f.y1) / 2 - juntos / 2
      const cy = y0 + MARCA.arriba * escala
      return { tipo: 'marca', cx: pos.cx, cy, baseNombre: cy + MARCA.abajo * escala + 3 + tinta.arriba, escala }
    }
    return { tipo: 'marca', cx: pos.cx, cy: pos.cy, baseNombre: null, escala }
  }
  if (pos && modo === 'siluetasJunto') return { tipo: 'marca', cx: pos.cx, cy: pos.cy, baseNombre: null, escala }

  // El nombre acostado, en la franja de abajo.
  if (f.alto >= altoTexto + 2 && wT <= r.w - 2 * BORDE) {
    return { tipo: 'texto', cx: r.x + r.w / 2, cy: (f.y0 + f.y1) / 2 + (tinta.arriba - tinta.abajo) / 2, baseNombre: null, escala: 1 }
  }
  // Al lado de la etiqueta, en su misma línea de base.
  const alLado = centroJunto(r, etiqueta, wT)
  if (alLado !== null) return { tipo: 'texto', cx: alLado, cy: r.y + etiqueta.base, baseNombre: null, escala: 1 }
  // Parado, en una astilla: a lo largo de la franja de abajo.
  if (f.alto >= wT + 2 && r.w - 2 * BORDE >= altoTexto) {
    return {
      tipo: 'textoParado',
      cx: r.x + r.w / 2 + (tinta.arriba - tinta.abajo) / 2,
      cy: (f.y0 + f.y1) / 2,
      baseNombre: null,
      escala: 1,
    }
  }
  if (!pos) return null
  return { tipo: 'punto', cx: pos.cx, cy: pos.cy, baseNombre: null, escala: 1 }
}

// ===== Etiqueta y contenido, juntos =====

/**
 * Las etiquetas posibles de un potrero, de la más completa a la más corta:
 * con las hectáreas y sin ellas.
 */
function etiquetasPosibles(r: Rect, nombre: string, textoHa: string): Etiqueta[] {
  const completa = decidirEtiqueta(r, nombre, textoHa)
  return completa.conHa ? [completa, decidirEtiqueta(r, nombre, '')] : [completa]
}

const NIVEL_MARCAS: Record<ModoMarcas, number> = { siluetas: 2, siluetasJunto: 2, columna: 1, fila: 1, junto: 1, nada: 0 }
const NIVEL_SIEMBRA: Record<Siembra['tipo'], number> = { marca: 3, texto: 2, textoParado: 2, punto: 1 }

/**
 * Etiqueta y hacienda decididas JUNTAS. Lo que importa es ver qué hay en el
 * potrero: si con las hectáreas en la etiqueta las siluetas no entran (o no
 * entra nada) y sin ellas sí, las hectáreas se sacan. Están en la ficha.
 */
export function acomodarHacienda(
  r: Rect,
  nombre: string,
  textoHa: string,
  n: number,
): { etiqueta: Etiqueta; marcas: Marcas } {
  let mejor: { etiqueta: Etiqueta; marcas: Marcas } | null = null
  for (const etiqueta of etiquetasPosibles(r, nombre, textoHa)) {
    const marcas = decidirMarcas(r, n, etiqueta)
    if (!mejor || NIVEL_MARCAS[marcas.modo] > NIVEL_MARCAS[mejor.marcas.modo]) mejor = { etiqueta, marcas }
  }
  return mejor!
}

/** Lo mismo para lo sembrado: marca > nombre escrito > punto. */
export function acomodarSiembra(
  r: Rect,
  nombre: string,
  textoHa: string,
  cultivo: string,
): { etiqueta: Etiqueta; siembra: Siembra | null } {
  let mejor: { etiqueta: Etiqueta; siembra: Siembra | null } | null = null
  for (const etiqueta of etiquetasPosibles(r, nombre, textoHa)) {
    const siembra = decidirSiembra(r, etiqueta, cultivo)
    const nivel = siembra ? NIVEL_SIEMBRA[siembra.tipo] : 0
    const nivelMejor = mejor?.siembra ? NIVEL_SIEMBRA[mejor.siembra.tipo] : 0
    if (!mejor || nivel > nivelMejor) mejor = { etiqueta, siembra }
  }
  return mejor!
}

/**
 * Reparto en tiras (squarified treemap simplificado): los potreros se
 * ordenan de mayor a menor y se van llenando tiras a lo largo del lado
 * corto; cada tira se cierra cuando agregar el siguiente empeoraría la
 * proporción de sus rectángulos. Da cuadrados razonables, sin astillas ni
 * solapamientos, con cualquier mezcla de tamaños.
 */
export function repartir(items: { clave: string; area: number }[], r: Rect): Record<string, Rect> {
  const out: Record<string, Rect> = {}
  const validos = items.filter((i) => i.area > 0)
  if (validos.length === 0) return out
  const total = validos.reduce((s, i) => s + i.area, 0)
  // Piso visual: ningún potrero ocupa menos del 5 % del croquis. 2 ha en
  // 1.000 son reales, pero una astilla de 3 px no le dice nada a nadie; el
  // resto se reescala para que sigan sumando el campo.
  const piso = total * 0.05
  const ajustados = validos.map((i) => ({ clave: i.clave, area: Math.max(i.area, piso) }))
  const totalAjustado = ajustados.reduce((s, i) => s + i.area, 0)
  const escala = (r.w * r.h) / totalAjustado
  const restantes = [...ajustados].sort((x, y) => y.area - x.area).map((i) => ({ clave: i.clave, area: i.area * escala }))
  let libre: Rect = { ...r }

  const peor = (tira: { area: number }[], lado: number) => {
    const suma = tira.reduce((s, i) => s + i.area, 0)
    const grosor = suma / lado
    let w = 0
    for (const i of tira) {
      const largo = i.area / grosor
      w = Math.max(w, Math.max(largo / grosor, grosor / largo))
    }
    return w
  }

  while (restantes.length > 0) {
    const horizontal = libre.w >= libre.h
    const lado = horizontal ? libre.h : libre.w
    const tira: { clave: string; area: number }[] = [restantes.shift()!]
    while (restantes.length > 0 && peor([...tira, restantes[0]!], lado) <= peor(tira, lado)) {
      tira.push(restantes.shift()!)
    }
    const suma = tira.reduce((s, i) => s + i.area, 0)
    const grosor = suma / lado
    let avance = 0
    for (const i of tira) {
      const largo = i.area / grosor
      out[i.clave] = horizontal
        ? { x: libre.x, y: libre.y + avance, w: grosor, h: largo }
        : { x: libre.x + avance, y: libre.y, w: largo, h: grosor }
      avance += largo
    }
    libre = horizontal
      ? { x: libre.x + grosor, y: libre.y, w: libre.w - grosor, h: libre.h }
      : { x: libre.x, y: libre.y + grosor, w: libre.w, h: libre.h - grosor }
  }
  return out
}
