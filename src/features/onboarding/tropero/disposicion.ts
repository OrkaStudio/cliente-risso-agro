import type { CSSProperties } from 'react'
import type { PotreroOnb } from './modelo'

// Qué entra en un potrero del croquis y a qué tamaño (onboarding y cierre).
// El potrero puede medir de 40 a 900 px por lado: el nombre y las hectáreas
// aparecen siempre; los íconos y el dato grande (cabezas, cultivo, días) se
// achican, cambian de lugar o pasan a la línea de las hectáreas antes que
// cortarse. Es pura para poder probarla con todos los tamaños.

export type Fuente = 'display' | 'heading' | 'texto'

/** Ancho de un texto en px. En el navegador se mide de verdad; en los tests, se estima. */
export type Medir = (texto: string, fuente: Fuente, tam: number) => number

/** Estimación conservadora (Archivo Black, Archivo ExtraBold, Inter semibold). */
export const medirEstimado: Medir = (texto, fuente, tam) =>
  texto.length * tam * (fuente === 'display' ? 0.72 : fuente === 'heading' ? 0.64 : 0.58)

export type DatosPotrero = {
  nombre: string
  /** Las hectáreas, de la forma más completa a la más corta: «35,5 ha», «36 ha». */
  ha: string[]
  /** El dato grande: «40» (cabezas), «Soja», «30 días». */
  dato: string | null
  /** Lo que acompaña al dato grande si hay lugar: «descansando». */
  bajada?: string
  /** Cuántos íconos (especies, la marca del cultivo, el agua del descanso). */
  iconos: number
}

export type Disposicion = {
  pad: number
  nombre: number
  ha: number
  /** Cuál de las formas de las hectáreas entra. */
  haTexto: string
  /** Las hectáreas al lado del nombre (potrero bajo) o debajo. */
  haEnLinea: boolean
  icono: number
  /** Los íconos arriba a la derecha, en una fila abajo, o no entran. */
  iconos: 'arriba' | 'abajo' | 'no'
  /** El dato grande: en grande (1 o 2 líneas), en la línea de las hectáreas, o no entra. */
  dato:
    | { donde: 'grande'; tam: number; lineas: 1 | 2 }
    /** Chico, al lado de las hectáreas o debajo (en una o dos líneas). */
    | { donde: 'linea'; aparte: boolean; lineas: 1 | 2; tam: number }
    | { donde: 'no' }
  bajada: boolean
}

const entre = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const ALTO = 1.15 // alto de línea
const DATO_MAX = 76
const DATO_MIN = 14

export function disponer(w: number, h: number, d: DatosPotrero, medir: Medir = medirEstimado): Disposicion {
  const pad = Math.round(entre(Math.min(w, h) * 0.09, Math.min(w, h) < 56 ? 4 : 6, 18))
  const lw = Math.max(0, w - pad * 2)
  const lh = Math.max(0, h - pad * 2)

  // Nombre y hectáreas: crecen con el potrero y entran siempre. Si no entran,
  // primero en una línea, después más chicos, y al final las hectáreas redondeadas.
  const entra = (n: number, a: number, t: string) => {
    const wn = medir(d.nombre, 'heading', n)
    const wa = medir(t, 'texto', a)
    if (Math.max(wn, wa) <= lw && n * ALTO + a * 1.3 <= lh) return 'debajo'
    if (n * ALTO <= lh && wn + 6 + wa <= lw) return 'linea'
    return null
  }
  let nombre = entre(Math.min(w, h * 1.3) * 0.09, 11, 22)
  let ha = entre(nombre * 0.66, 10, 14)
  let haTexto = d.ha[0]!
  let lugar = entra(nombre, ha, haTexto)
  while (!lugar) {
    const corta = d.ha.find((t) => entra(nombre, ha, t))
    if (corta) {
      haTexto = corta
      lugar = entra(nombre, ha, corta)
      break
    }
    if (nombre <= 9) {
      haTexto = d.ha.at(-1)!
      lugar = 'debajo'
      break
    }
    nombre -= 0.5
    ha = entre(nombre * 0.66, 8, 14)
    lugar = entra(nombre, ha, haTexto)
  }
  // Se prueban las combinaciones (hectáreas debajo o al lado; con o sin íconos)
  // y gana la que muestra el dato más grande. El dato vale más que los íconos.
  const candidatos: Disposicion[] = []
  for (const enLinea of lugar === 'linea' ? [true] : [false, true])
    for (const conIconos of [true, false]) {
      const x = probar(enLinea, conIconos)
      if (x) candidatos.push(x)
    }
  const puntaje = (x: Disposicion) =>
    (x.dato.donde === 'grande' ? 1000 + x.dato.tam * (x.dato.lineas === 1 ? 2 : 1) : x.dato.donde === 'linea' ? 500 - (x.dato.aparte ? 0 : 10) : 0) +
    (x.iconos !== 'no' ? 40 : 0) +
    (x.haEnLinea ? 0 : 20)
  return candidatos.sort((x, y) => puntaje(y) - puntaje(x))[0]!

  function probar(haEnLinea: boolean, conIconos: boolean): Disposicion | null {
    if (haEnLinea && !(nombre * ALTO <= lh && medir(d.nombre, 'heading', nombre) + 6 + medir(haTexto, 'texto', ha) <= lw)) return null
    const encabezado = haEnLinea ? nombre * ALTO : nombre * ALTO + ha * 1.3
    const anchoEncabezado = haEnLinea
      ? medir(d.nombre, 'heading', nombre) + 6 + medir(haTexto, 'texto', ha)
      : Math.max(medir(d.nombre, 'heading', nombre), medir(haTexto, 'texto', ha))

    // Íconos: arriba a la derecha si hay ancho; si no, una fila abajo; si no, nada.
    let icono = entre(nombre * 1.15, 12, 30)
    let iconos: Disposicion['iconos'] = 'no'
    const fila = (t: number) => d.iconos * t + (d.iconos - 1) * 4
    if (conIconos && d.iconos > 0) {
      if (anchoEncabezado + 8 + fila(icono) <= lw && icono <= encabezado + 6) iconos = 'arriba'
      else {
        while (fila(icono) > lw && icono > 10) icono -= 1
        if (fila(icono) <= lw && encabezado + 6 + icono <= lh) iconos = 'abajo'
      }
    }
    const resto = lh - encabezado - (iconos === 'abajo' ? icono + 6 : 0) - 4

    // El dato grande: crece con el potrero; si no entra, va en la línea de las hectáreas.
    let dato: Disposicion['dato'] = { donde: 'no' }
    let bajada = false
    if (d.dato) {
      const conBajada = d.bajada ? 14 * ALTO + 2 : 0
      const unaLinea = (alto: number) => Math.min(alto / ALTO, (lw / medir(d.dato!, 'display', 100)) * 100, DATO_MAX)
      const palabras = d.dato.split(' ')
      const larga = palabras.reduce((a, b) => (b.length > a.length ? b : a), '')
      const t1 = unaLinea(resto - conBajada)
      const t1b = unaLinea(resto)
      if (t1 >= DATO_MIN) {
        dato = { donde: 'grande', tam: Math.floor(t1), lineas: 1 }
        bajada = !!d.bajada
      } else if (t1b >= DATO_MIN) {
        dato = { donde: 'grande', tam: Math.floor(t1b), lineas: 1 }
      } else if (palabras.length > 1) {
        const t2 = Math.min(resto / (2 * ALTO), (lw / medir(larga, 'display', 100)) * 100, DATO_MAX)
        if (t2 >= DATO_MIN) dato = { donde: 'grande', tam: Math.floor(t2), lineas: 2 }
      }
      if (dato.donde === 'no') {
        // Chico: «40 ha · Soja»; si no entra a lo ancho, debajo, en una o dos líneas.
        const linea = medir(`${haTexto} · ${d.dato}`, 'texto', ha) + (haEnLinea ? medir(d.nombre, 'heading', nombre) + 6 : 0)
        const libre = lh - encabezado - (iconos === 'abajo' ? icono + 6 : 0)
        // Debajo, a la medida (hasta 8 px), en una línea o en dos.
        const cabe = (t: string) => Math.min(ha, (lw / medir(t, 'texto', 100)) * 100)
        if (linea <= lw) dato = { donde: 'linea', aparte: false, lineas: 1, tam: ha }
        else if (cabe(d.dato) >= 8 && libre >= cabe(d.dato) * 1.3) dato = { donde: 'linea', aparte: true, lineas: 1, tam: cabe(d.dato) }
        else if (palabras.length > 1 && cabe(larga) >= 8 && libre >= cabe(larga) * 2.6)
          dato = { donde: 'linea', aparte: true, lineas: 2, tam: cabe(larga) }
      }
    }
    return { pad, nombre, ha, haTexto, haEnLinea, icono, iconos, dato, bajada }
  }
}

/** El color de cada potrero según lo que tiene (onboarding y cierre). */
export function fondoPotrero(c: PotreroOnb['contenido']): { clase: string; estilo: CSSProperties } {
  if (c?.tipo === 'hacienda') return { clase: 'border-principal bg-principal text-principal-texto', estilo: {} }
  if (c?.tipo === 'sembrado')
    return {
      clase: 'border-acento bg-acento text-acento-texto',
      estilo: {
        backgroundImage:
          'repeating-linear-gradient(-55deg, transparent 0 22px, color-mix(in srgb, var(--acento-texto) 14%, transparent) 22px 24px)',
      },
    }
  if (c?.tipo === 'descanso')
    return {
      clase: 'border-estado-bien/30 bg-estado-bien-suave text-estado-bien-texto',
      estilo: {
        // Pasto que crece: matas suaves, sin texto encima.
        backgroundImage:
          'radial-gradient(circle at 20% 80%, color-mix(in srgb, var(--estado-bien) 16%, transparent) 0 3px, transparent 4px), radial-gradient(circle at 70% 40%, color-mix(in srgb, var(--estado-bien) 12%, transparent) 0 2.5px, transparent 3.5px)',
        backgroundSize: '28px 28px, 22px 22px',
      },
    }
  return { clase: 'border-borde bg-superficie text-texto', estilo: {} }
}
