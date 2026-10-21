import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useIsMobile } from '@/lib/use-is-mobile'
import { abiertoSinMapa, seccionBloqueada, useMapaPendiente } from './bloqueo'

/**
 * Primero el campo: hasta que el dueño ubique sus campos y potreros en el
 * mapa, el resto de la app lleva a armarlo, que dice por qué: en la compu, a
 * Campos (el mapa se arma ahí, sin salir de la web); en el celular, al
 * tutorial («Primero, armá tu campo en la compu»). `=== null` a propósito: una
 * membresía guardada de antes no trae el campo y no se bloquea.
 */
export function RequireMapa() {
  const pendiente = useMapaPendiente()
  const { pathname } = useLocation()
  const movil = useIsMobile()
  if (pendiente && !abiertoSinMapa(pathname)) return <Navigate to={movil ? '/mapa' : '/campos'} replace state={{ bloqueada: seccionBloqueada(pathname) }} />
  return <Outlet />
}
