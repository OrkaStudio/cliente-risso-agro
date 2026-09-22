export type SeccionGuia = 'inicio' | 'hacienda' | 'campos' | 'agenda' | 'analitica'

export const NOMBRE_SECCION: Record<SeccionGuia, string> = {
  inicio: 'Inicio',
  hacienda: 'Hacienda',
  campos: 'Campos',
  agenda: 'Agenda',
  analitica: 'Analítica',
}

/**
 * Sección de Oficina para una ruta. Sólo las páginas principales (las
 * subrutas como la ficha del animal no tienen anclas del asistente).
 */
export function seccionDeRuta(pathname: string): SeccionGuia | null {
  if (pathname === '/') return 'inicio'
  if (pathname === '/hacienda') return 'hacienda'
  if (pathname === '/campos') return 'campos'
  if (pathname === '/agenda') return 'agenda'
  if (pathname === '/analitica') return 'analitica'
  return null
}
