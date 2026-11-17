import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useIsMobile } from '@/lib/use-is-mobile'
import { useMedirUso } from '@/features/guia/medir'

/**
 * Gate de navegación por dispositivo. La app es UNA sola web; lo que cambia
 * según el equipo es QUÉ se ve:
 *   · En un teléfono se entra al **Modo Campo** (la oficina es ruido en el campo).
 *   · En escritorio se ve el Modo Oficina, y el Modo Campo no se puede abrir.
 * No hay app aparte: este componente solo redirige y elige el shell por ruta.
 *
 * Las rutas de Oficina cuelgan de `AppShell`; las de Campo, de `CampoShell`
 * (ver router). Acá solo decidimos a cuál mandar a un móvil parado en Oficina.
 */
export function ResponsiveShell() {
  useMedirUso()
  const isMobile = useIsMobile()
  const location = useLocation()
  const enCampo = location.pathname.startsWith('/campo')
  const rutaOficina = `${location.pathname}${location.search}${location.hash}`
  const regresoResponsive = (location.state as { regresoResponsive?: string } | null)?.regresoResponsive
  // Recién terminó el onboarding: la app entra con un fundido, no de golpe.
  // Se decide una vez al montar (navegar dentro de la app no lo repite).
  const quieto = useReducedMotion()
  // En escritorio lo resuelve AppShell (la barra ya está en su lugar).
  const [bienvenida] = useState(
    () => !quieto && isMobile && !!(location.state as { bienvenida?: boolean } | null)?.bienvenida,
  )

  // El Modo Campo no se abre desde la compu: es para el celular, en el potrero.
  // Una ruta /campo en escritorio (link viejo, URL escrita, ventana achicada y
  // vuelta a agrandar) vuelve a la Oficina. Ojo: `enCampo` también cubre
  // /campos (el editor del mapa en el celular), que en la compu es Oficina.
  const modoCampo = location.pathname === '/campo' || location.pathname.startsWith('/campo/')
  if (!isMobile && modoCampo) {
    return <Navigate to={regresoResponsive ?? '/'} replace state={null} />
  }

  // El celular y la compu son dos cosas separadas (Lau, 17/11): un teléfono
  // parado en una ruta de la compu vuelve siempre al celular, sin excepción.
  if (isMobile && !enCampo) {
    return <Navigate to="/campo" replace state={{ regresoResponsive: rutaOficina }} />
  }

  return (
    <>
      {bienvenida ? (
        <motion.div
          className="h-full"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <Outlet />
        </motion.div>
      ) : (
        <Outlet />
      )}
    </>
  )
}
