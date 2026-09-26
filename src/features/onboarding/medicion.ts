import { registrar } from '@/lib/telemetria'

/**
 * Los eventos del onboarding, con el tiempo de cada paso ya calculado.
 *
 * `duracion_ms` = desde el último `paso_visto` de ese paso en esta página
 * hasta que se completa o se saltea. Tras una recarga cuenta desde que el
 * paso volvió a verse (la tabla tiene los `ts_cliente` para recalcularlo).
 *
 * Un paso salteado no se cuenta además como completado: "Los completo
 * después" también llama a `onListo`.
 */

export type PasoOnboarding = 'empresa' | 'campo' | 'potreros' | 'hacienda' | 'otro'

const vistoEn = new Map<PasoOnboarding, number>()
const salteado = new Set<PasoOnboarding>()
let inicioOnboarding: number | null = null

function desde(paso: PasoOnboarding): number | null {
  const t = vistoEn.get(paso)
  return t === undefined ? null : Date.now() - t
}

export function onboardingIniciado(): void {
  // Una vez por carga de página (StrictMode monta dos veces en desarrollo).
  if (inicioOnboarding !== null) return
  inicioOnboarding = Date.now()
  registrar('onboarding_iniciado')
}

export function pasoVisto(paso: PasoOnboarding, indice: number): void {
  vistoEn.set(paso, Date.now())
  salteado.delete(paso)
  registrar('paso_visto', { paso, indice })
}

export function pasoCompletado(
  paso: PasoOnboarding,
  resumen: Record<string, string | number | boolean | null | string[]> = {},
): void {
  if (salteado.has(paso)) return
  registrar('paso_completado', { paso, duracion_ms: desde(paso), ...resumen })
}

export function pasoSalteado(paso: PasoOnboarding): void {
  salteado.add(paso)
  registrar('paso_salteado', { paso, duracion_ms: desde(paso) })
}

/** Una validación rechazó. `campo` = qué faltó o estuvo mal, no el valor. */
export function pasoError(paso: PasoOnboarding, campo: string): void {
  registrar('paso_error', { paso, campo })
}

export function onboardingCompletado(resumen: {
  campos: number
  potreros: number
  cabezas: number
  potreros_sembrados: number
  con_alquiler: boolean
}): void {
  registrar('onboarding_completado', {
    ...resumen,
    // Sin inicio en esta página (recargó a mitad): el total sale de la tabla.
    duracion_total_ms: inicioOnboarding === null ? null : Date.now() - inicioOnboarding,
  })
}

/** Sólo para tests. */
export function _reiniciarMedicion(): void {
  vistoEn.clear()
  salteado.clear()
  inicioOnboarding = null
}
