import * as React from 'react'
import { rootZoom } from '@/lib/zoom'

/**
 * Geometría compartida de las burbujas del asistente (misión, puntitos,
 * invitación): medir un ancla `data-guia` dividiendo por el zoom global
 * ([[lecciones/2026-06-29-zoom-global-gotchas]]) y ubicar la burbuja al
 * lado sin que se salga de la pantalla.
 */

export type Rect = { top: number; left: number; width: number; height: number }

export function medirAncla(ancla: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-guia="${ancla}"]`)
  if (!el) return null
  const z = rootZoom()
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return null
  return { top: r.top / z, left: r.left / z, width: r.width / z, height: r.height / z }
}

/** El ancla está a la vista de verdad: su centro no lo tapa otra cosa (la
 *  pastilla, un panel). elementFromPoint trabaja en px reales → × zoom. */
export function anclaDestapada(ancla: string, r: Rect): boolean {
  const el = document.querySelector<HTMLElement>(`[data-guia="${ancla}"]`)
  if (!el) return false
  const z = rootZoom()
  const hit = document.elementFromPoint((r.left + r.width / 2) * z, (r.top + Math.min(r.height / 2, 24)) * z)
  return !!hit && el.contains(hit)
}

/** Todas las anclas presentes en pantalla ahora. */
export function anclasEnPantalla(): Set<string> {
  const out = new Set<string>()
  document.querySelectorAll<HTMLElement>('[data-guia]').forEach((el) => {
    const v = el.getAttribute('data-guia')
    if (v) out.add(v)
  })
  return out
}

/** Hay un modal abierto (Base UI marca el velo con data-slot; los diálogos
 *  propios sólo llevan role). El panel del asistente no cuenta. */
export function dialogoAbierto(): boolean {
  return (
    document.querySelector(
      '[data-slot="dialog-overlay"], [role="dialog"]:not([aria-label="Asistente"])',
    ) !== null
  )
}

/** Viewport en espacio zoomeado. */
export function viewport() {
  const z = rootZoom()
  return { vw: window.innerWidth / z, vh: window.innerHeight / z }
}

/** Recorta el rect a lo visible (un mapa más alto que la pantalla no puede
 *  mandar la burbuja afuera). */
export function recortar(r: Rect): Rect | null {
  const { vw, vh } = viewport()
  const top = Math.max(r.top, 8)
  const left = Math.max(r.left, 8)
  const bottom = Math.min(r.top + r.height, vh - 8)
  const right = Math.min(r.left + r.width, vw - 8)
  if (bottom <= top || right <= left) return null
  return { top, left, width: right - left, height: bottom - top }
}

const MARGEN = 12

/** Dónde va la burbuja: debajo del ancla si hay lugar, si no arriba; siempre
 *  entera en pantalla. */
export function ubicarJunto(
  rect: Rect | null,
  ancho: number,
  alto: number,
): { left: number; top: number; arriba: boolean } {
  const { vw, vh } = viewport()
  const w = Math.min(ancho, vw - MARGEN * 2)
  if (!rect) {
    // Sin ancla: cerca de la burbuja del asistente (abajo a la derecha).
    return { left: vw - w - 16, top: vh - alto - 84, arriba: true }
  }
  let left = rect.left + rect.width / 2 - w / 2
  left = Math.min(Math.max(left, MARGEN), vw - w - MARGEN)
  const abajo = vh - (rect.top + rect.height)
  let top: number
  let arriba = false
  if (abajo >= alto + MARGEN + 14) {
    top = rect.top + rect.height + 14
  } else if (rect.top >= alto + MARGEN + 14) {
    top = rect.top - 14 - alto
    arriba = true
  } else {
    top = vh - alto - MARGEN
  }
  top = Math.min(Math.max(top, MARGEN), vh - alto - MARGEN)
  return { left, top, arriba }
}

/** Alto real de un bloque (ResizeObserver) con estimación inicial. */
export function useAltoReal<T extends HTMLElement>(estimado: number) {
  const ref = React.useRef<T>(null)
  const [alto, setAlto] = React.useState(estimado)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setAlto(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, alto] as const
}
