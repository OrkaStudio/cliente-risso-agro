import { useEffect, useRef } from 'react'

/**
 * Captura lecturas del bastón RFID a nivel DOCUMENTO, tenga el foco quien lo
 * tenga.
 *
 * Por qué a nivel documento: el bastón es un teclado Bluetooth. Si el cursor no
 * está parado en el input, la lectura se teclea AL VACÍO y se pierde sin que
 * nadie se entere. En la manga, con guantes y el animal apurado, eso es una
 * caravana perdida. Escuchando en el documento la agarramos igual.
 *
 * Cómo distinguimos un escaneo de alguien tecleando: por VELOCIDAD. El bastón
 * teclea 15 dígitos en menos de lo que una persona teclea dos. Si las teclas
 * llegan pegadas (gaps chicos) y son varias seguidas, es el bastón.
 */

/**
 * Dos umbrales, no uno — la diferencia importa el día de la prueba:
 *
 * · AGRUPA (generoso): hasta acá las teclas siguen siendo la MISMA lectura.
 *   Un bastón con Bluetooth lento puede tardar 200ms entre caracteres; si
 *   agrupáramos con el umbral fino, cada dígito sería una "lectura" de 1
 *   caracter y el lector parecería roto cuando en realidad anda.
 * · ESCANEO (fino): si TODOS los gaps bajan de acá, fue una ráfaga de bastón
 *   y no un dedo. Solo esto habilita el rescate automático en la manga —
 *   hijackear texto que alguien está tipeando sería peor que perder la lectura.
 */
const GAP_AGRUPA_MS = 400
const GAP_ESCANEO_MS = 120
/** Mínimo de caracteres para que una ráfaga cuente como escaneo (no un tipeo). */
const MIN_CHARS = 4
/** Si no llega terminador, se cierra la ráfaga por inactividad. */
const CIERRE_MS = 450

export type Terminador = 'enter' | 'tab' | 'timeout'

export type Lectura = {
  /** Lo que llegó tal cual, sin tocar. */
  crudo: string
  /** Milisegundos entre cada tecla (largo = crudo.length - 1). */
  gaps: number[]
  /** Cómo cerró: el lector mandó Enter/Tab, o cortamos por inactividad. */
  terminador: Terminador
  /** Duración total de la ráfaga (primera a última tecla). */
  duracionMs: number
  /** Gap promedio — el número que delata si es bastón o dedo. */
  gapPromedioMs: number
  /** Ráfaga rápida y larga = bastón. Lento o corto = alguien tecleando. */
  esEscaneo: boolean
  /** Qué elemento tenía el foco cuando entró la lectura. */
  focoEn: string
  /** El foco estaba en un campo de texto (o sea: NO se perdió). */
  focoEnCampo: boolean
  /**
   * El foco estaba en EL campo que espera el escaneo (`data-scan-target`).
   * Si es true el input ya recibió las teclas solo y no hay que escribirlas de
   * nuevo; si es false, la lectura iba camino a perderse y hay que rescatarla.
   */
  focoEnObjetivo: boolean
  /** Momento de la lectura. */
  ts: number
}

type Foco = { nombre: string; esCampo: boolean; esObjetivo: boolean }

function describirFoco(el: Element | null): Foco {
  if (!el || el === document.body)
    return { nombre: 'ningún campo', esCampo: false, esObjetivo: false }
  const tag = el.tagName.toLowerCase()
  const esCampo =
    tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable
  const etiqueta =
    el.getAttribute('aria-label') ??
    el.getAttribute('name') ??
    el.getAttribute('placeholder') ??
    tag
  return { nombre: etiqueta, esCampo, esObjetivo: el.hasAttribute('data-scan-target') }
}

export type OpcionesScanner = {
  /** Se llama con CADA ráfaga cerrada (escaneo o tipeo). */
  onLectura: (l: Lectura) => void
  /** Apaga el capturador sin desmontar el componente. */
  activo?: boolean
}

export function useScanner({ onLectura, activo = true }: OpcionesScanner) {
  // El callback vive en un ref: el listener se registra UNA vez y no se
  // recrea en cada render (si se recreara, una ráfaga a mitad de camino
  // perdería su buffer y se partiría la lectura al medio).
  const cb = useRef(onLectura)
  useEffect(() => {
    cb.current = onLectura
  })

  useEffect(() => {
    if (!activo) return

    let buffer = ''
    let tiempos: number[] = []
    let foco: Foco | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const emitir = (terminador: Terminador) => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (buffer.length === 0) return
      // Ráfaga corta cerrada por inactividad = ruido de tecleo suelto, no una
      // lectura. Sin este filtro, alguien tipeando llena el historial de
      // "lecturas" de un caracter y ensucia el veredicto sobre el lector.
      if (buffer.length < MIN_CHARS && terminador === 'timeout') {
        buffer = ''
        tiempos = []
        foco = null
        return
      }

      const gaps: number[] = []
      for (let i = 1; i < tiempos.length; i++) gaps.push(tiempos[i] - tiempos[i - 1])
      const duracionMs =
        tiempos.length > 1 ? tiempos[tiempos.length - 1] - tiempos[0] : 0
      const gapPromedioMs =
        gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0

      const lectura: Lectura = {
        crudo: buffer,
        gaps,
        terminador,
        duracionMs,
        gapPromedioMs,
        esEscaneo:
          buffer.length >= MIN_CHARS && gaps.every((g) => g <= GAP_ESCANEO_MS),
        focoEn: foco?.nombre ?? 'ningún campo',
        focoEnCampo: foco?.esCampo ?? false,
        focoEnObjetivo: foco?.esObjetivo ?? false,
        ts: Date.now(),
      }

      buffer = ''
      tiempos = []
      foco = null
      cb.current(lectura)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      // Terminadores: el lector los manda para "confirmar" la lectura.
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buffer.length > 0) emitir(e.key === 'Enter' ? 'enter' : 'tab')
        return
      }
      // Solo caracteres imprimibles; ignoramos flechas, shift, F1, etc.
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return

      const ahora = performance.now()
      const ultimo = tiempos[tiempos.length - 1]
      // Gap grande = arranca una ráfaga nueva; la anterior se cierra y se emite.
      if (ultimo !== undefined && ahora - ultimo > GAP_AGRUPA_MS) emitir('timeout')

      if (buffer.length === 0) foco = describirFoco(document.activeElement)
      buffer += e.key
      tiempos.push(ahora)

      if (timer) clearTimeout(timer)
      timer = setTimeout(() => emitir('timeout'), CIERRE_MS)
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (timer) clearTimeout(timer)
    }
  }, [activo])
}
