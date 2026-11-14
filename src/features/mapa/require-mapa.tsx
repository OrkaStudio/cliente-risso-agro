import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useCompletarBordes } from '@/features/campos/use-completar-bordes'
import { useIsMobile } from '@/lib/use-is-mobile'
import { abiertoSinMapa, seccionBloqueada, useEstadoMapa } from './bloqueo'

/**
 * Primero el campo: hasta que el dueño ubique sus campos y potreros en el
 * mapa, el resto de la app lleva a armarlo, que dice por qué: en la compu, a
 * Campos (el mapa se arma ahí, sin salir de la web); en el celular, al
 * tutorial («Primero, armá tu campo en la compu»). Se decide con los campos
 * de verdad (bloqueo.ts), no con una marca.
 */
export function RequireMapa() {
  // Los campos con todos sus potreros dibujados y sin borde se completan solos (Daniel).
  useCompletarBordes()
  const { pendiente, cargando } = useEstadoMapa()
  const { pathname } = useLocation()
  const movil = useIsMobile()
  // Sin saber todavía si falta algo, una sección cerrada no se muestra (ni se redirige de más).
  if (cargando && !abiertoSinMapa(pathname)) return null
  if (pendiente && !abiertoSinMapa(pathname)) return <Navigate to={movil ? '/mapa' : '/campos'} replace state={{ bloqueada: seccionBloqueada(pathname) }} />
  return <Outlet />
}
