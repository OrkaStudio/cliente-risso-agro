/**
 * Prefetch de las rutas lazy: adelanta la descarga+parseo del chunk de cada
 * sección para que el salto sea INSTANTÁNEO (sin el flash de "Cargando…").
 * Se dispara en reposo tras cargar el shell, y al tocar/hover un ítem de nav.
 *
 * Los especificadores de import son EXACTAMENTE los del router → Vite reusa el
 * mismo chunk (importar dos veces no baja nada de más).
 */

type Thunk = () => Promise<unknown>

const hechos = new Set<Thunk>()

/** Dispara la carga del chunk (idempotente; si falla, se puede reintentar). */
export function prefetch(thunk: Thunk): void {
  if (hechos.has(thunk)) return
  hechos.add(thunk)
  thunk().catch(() => hechos.delete(thunk))
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
}

/** En reposo (o a los 1.5 s si no hay requestIdleCallback) precarga los chunks.
 *  Devuelve una función para cancelar si el shell se desmonta antes. */
export function prefetchEnReposo(thunks: Thunk[]): () => void {
  const run = () => thunks.forEach(prefetch)
  const w = window as IdleWindow
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(run, { timeout: 3000 })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(run, 1500)
  return () => window.clearTimeout(id)
}

/** Chunks de las secciones del Modo Campo (móvil). */
export const CHUNKS_CAMPO: Record<string, Thunk> = {
  '/campo/recorrida': () => import('@/features/campo/recorrida-page'),
  '/campo/manga': () => import('@/features/campo/manga-page'),
  '/campo/plata': () => import('@/features/campo/plata-page'),
  '/campo/historial': () => import('@/features/campo/historial-page'),
}

/** Chunks de las secciones del Modo Oficina (escritorio). */
export const CHUNKS_OFICINA: Record<string, Thunk> = {
  '/hacienda': () => import('@/features/hacienda/animales-page'),
  '/campos': () => import('@/features/lotes/lotes-page'),
  '/analitica': () => import('@/features/analitica/analitica-page'),
  '/agenda': () => import('@/features/agenda/agenda-page'),
}
