import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { abiertoSinMapa, seccionBloqueada, useMapaPendiente } from './bloqueo'

/**
 * Primero el campo: hasta que el dueño ubique sus campos y potreros en el
 * mapa, el resto de la app lleva al tutorial, que dice por qué. `=== null` a
 * propósito: una membresía guardada de antes no trae el campo y no se bloquea.
 */
export function RequireMapa() {
  const pendiente = useMapaPendiente()
  const { pathname } = useLocation()
  if (pendiente && !abiertoSinMapa(pathname)) return <Navigate to="/mapa" replace state={{ bloqueada: seccionBloqueada(pathname) }} />
  return <Outlet />
}
