import { useEmpresa } from '@/features/empresa/use-empresa'

/** Lo que anda antes del mapa (decisión del 30/09): el Inicio y Campos; en el
 *  celular, el Hoy del Modo Campo («Hoy, sin campo»). */
const ABIERTO = [/^\/$/, /^\/campos(\/|$)/, /^\/campo$/]

export const abiertoSinMapa = (ruta: string) => ABIERTO.some((r) => r.test(ruta))

/** Lo que dice el tutorial cuando se llega desde una sección que todavía no se abrió. */
const SECCION: Record<string, string> = {
  hacienda: 'La Hacienda',
  analitica: 'La Analítica',
  agenda: 'La Agenda',
}
export const seccionBloqueada = (ruta: string) => SECCION[ruta.split('/')[1] ?? ''] ?? 'Esa sección'

/** El dueño todavía no terminó de ubicar sus campos en el mapa. */
export function useMapaPendiente(): boolean {
  const { data: m } = useEmpresa()
  return m?.rol === 'dueno' && m.empresa?.mapa_completo_at === null
}
