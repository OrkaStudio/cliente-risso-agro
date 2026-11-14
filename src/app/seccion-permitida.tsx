import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { cargaDeRuta, primeraRuta, puedeCargar, puedeVer, seccionDeRuta } from '@/features/empresa/secciones'
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
  // En el Modo Campo cada pantalla es para cargar: sin ese permiso, vuelve a Hoy.
  const carga = cargaDeRuta(pathname)
  if (membresia && carga && !puedeCargar(membresia, carga)) return <Navigate to="/campo" replace />
  if (membresia && seccion && !carga && !puedeVer(membresia, seccion) && destino !== pathname) return <Navigate to={destino} replace />
  return <Outlet />
}
