import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useEmpresa } from '@/features/empresa/use-empresa'

/** Lo que anda antes del mapa (decisión del 30/09): el Inicio y Campos. */
const ABIERTO = [/^\/$/, /^\/campos(\/|$)/]

/**
 * Primero el campo: hasta que el dueño ubique sus campos y potreros en el
 * mapa, el resto de la app lleva al tutorial. `=== null` a propósito: una
 * membresía guardada de antes no trae el campo y no se bloquea.
 */
export function RequireMapa() {
  const { data: m } = useEmpresa()
  const { pathname } = useLocation()
  const pendiente = m?.rol === 'dueno' && m.empresa?.mapa_completo_at === null
  if (pendiente && !ABIERTO.some((r) => r.test(pathname))) return <Navigate to="/mapa" replace />
  return <Outlet />
}
