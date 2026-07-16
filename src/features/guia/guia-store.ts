import { useSyncExternalStore } from 'react'
import type { SeccionGuia } from '@/features/guia/pasos'

// Store externo mínimo (idioma de lib/campo-mode): el botón "Guía" de la topbar
// y el overlay viven en árboles distintos del AppShell → sin prop-drilling.
// `pedida` = el usuario pidió relanzar la guía de la sección actual.
let pedida = 0
const listeners = new Set<() => void>()

/** Relanza la guía de la sección actual (botón "Guía" de la topbar). */
export function pedirGuia(): void {
  pedida++
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Contador que incrementa con cada pedido manual — el overlay reacciona al cambio. */
export function useGuiaPedida(): number {
  return useSyncExternalStore(subscribe, () => pedida, () => 0)
}

// ---------------------------------------------------------------------------
// Panel del Asistente (checklist + fichas). El botón de la topbar lo abre; el
// recorrido se relanza DESDE el panel (conviven — decisión de Lau, spec del
// asistente).
// ---------------------------------------------------------------------------

let panelAbierto = false

export function abrirPanel(): void {
  panelAbierto = true
  listeners.forEach((l) => l())
}

export function cerrarPanel(): void {
  panelAbierto = false
  listeners.forEach((l) => l())
}

export function usePanelAbierto(): boolean {
  return useSyncExternalStore(subscribe, () => panelAbierto, () => false)
}

// ---------------------------------------------------------------------------
// Persistencia "ya vio la guía" — localStorage por usuario+sección (decisión de
// intake TASK-043: sin migración; si se pierde, la guía se muestra una vez más
// y siempre queda el botón para relanzarla).
// ---------------------------------------------------------------------------

function claveVista(seccion: SeccionGuia, userId: string): string {
  return `guia.vista.${seccion}.${userId}`
}

export function guiaVista(seccion: SeccionGuia, userId: string): boolean {
  try {
    return localStorage.getItem(claveVista(seccion, userId)) === '1'
  } catch {
    return true // storage bloqueado: mejor no insistir con el auto-arranque
  }
}

export function marcarGuiaVista(seccion: SeccionGuia, userId: string): void {
  try {
    localStorage.setItem(claveVista(seccion, userId), '1')
  } catch {
    /* sin storage no persistimos — la guía volvería a auto-abrirse */
  }
}
