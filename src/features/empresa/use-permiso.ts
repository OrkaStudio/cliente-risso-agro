import { puedeCargar, puedeVer, type Seccion } from './secciones'
import { useEmpresa } from './use-empresa'

/**
 * Qué puede hacer quien mira en una sección (permisos, 13/11). Con «Ve» se
 * muestra todo pero sin los botones de cargar o corregir; la base igual
 * rechaza lo que no corresponde.
 */
export function usePermiso(s: Seccion) {
  const { data: membresia } = useEmpresa()
  return { ve: puedeVer(membresia, s), carga: puedeCargar(membresia, s) }
}
