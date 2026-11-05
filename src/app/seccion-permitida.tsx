import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { primeraRuta, puedeVer, seccionDeRuta } from '@/features/empresa/secciones'
import { useEmpresa } from '@/features/empresa/use-empresa'

/**
 * Lo que no ve, no se abre ni por link: quien entra a una sección que el
 * dueño no le habilitó va a la primera que sí ve. (La base además niega la
 * plata; esto es para que no vea una pantalla vacía.)
 */
export function SeccionPermitida() {
  const { pathname } = useLocation()
  const { data: membresia } = useEmpresa()
  const seccion = seccionDeRuta(pathname)
  const destino = primeraRuta(membresia)
  if (membresia && seccion && !puedeVer(membresia, seccion) && destino !== pathname) return <Navigate to={destino} replace />
  return <Outlet />
}
