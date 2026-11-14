import { useEmpresa } from '@/features/empresa/use-empresa'
import { useMapa } from './api'
import { bordeDesdePotreros, campoPendiente, type CampoMapa } from './reglas'

/** Lo que anda antes del mapa (decisión del 30/09): el Inicio y Campos; en el
 *  celular, el Hoy del Modo Campo («Hoy, sin campo»). Configuración (tu cuenta) siempre. */
const ABIERTO = [/^\/$/, /^\/campos(\/|$)/, /^\/campo$/, /^\/configuracion$/]

export const abiertoSinMapa = (ruta: string) => ABIERTO.some((r) => r.test(ruta))

/** Lo que dice el tutorial cuando se llega desde una sección que todavía no se abrió. */
const SECCION: Record<string, string> = {
  hacienda: 'La Hacienda',
  analitica: 'La Analítica',
  agenda: 'La Agenda',
}
export const seccionBloqueada = (ruta: string) => SECCION[ruta.split('/')[1] ?? ''] ?? 'Esa sección'

/**
 * El dueño todavía no terminó de ubicar sus campos en el mapa: algún campo sin
 * borde o con un potrero sin dibujar (adentro). Se mira cada vez, no una marca
 * que se pone una sola vez (Lau, 30/10): sumar un campo vuelve a trabar hasta
 * dibujarlo. Mientras cargan los campos, no se sabe: `cargando`.
 */
export function useEstadoMapa(): { pendiente: boolean; cargando: boolean } {
  const { data: m, isLoading: cargaEmpresa } = useEmpresa()
  const dueno = m?.rol === 'dueno'
  const { data: campos, isLoading } = useMapa(dueno ? m?.empresa_id : undefined)
  if (cargaEmpresa || (dueno && isLoading)) return { pendiente: false, cargando: true }
  return { pendiente: dueno && !!campos && primerPendiente(campos) !== null, cargando: false }
}

export function useMapaPendiente(): boolean {
  return useEstadoMapa().pendiente
}

/** El primer campo sin terminar. Un borde que sale de los potreros ya dibujados se completa solo (useCompletarBordes): no cuenta. */
export function primerPendiente(campos: CampoMapa[]): CampoMapa | null {
  return campoPendiente(campos.map((c) => (c.contorno ? c : { ...c, contorno: bordeDesdePotreros(c.potreros) })))
}
