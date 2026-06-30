import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Tractor } from 'lucide-react'
import { useIsMobile } from '@/lib/use-is-mobile'
import { setForceOficina, useForceOficina } from '@/lib/campo-mode'

/**
 * Gate de navegación por dispositivo. La app es UNA sola web; lo que cambia
 * según el equipo es QUÉ se ve:
 *   · En un teléfono se entra al **Modo Campo** (la oficina es ruido en el campo).
 *   · En escritorio se ve todo (Modo Oficina completo).
 * No hay app aparte: este componente solo redirige y elige el shell por ruta.
 *
 * Las rutas de Oficina cuelgan de `AppShell`; las de Campo, de `CampoShell`
 * (ver router). Acá solo decidimos a cuál mandar a un móvil parado en Oficina.
 */
export function ResponsiveShell() {
  const isMobile = useIsMobile()
  const forceOficina = useForceOficina()
  const location = useLocation()
  const enCampo = location.pathname.startsWith('/campo')

  // Teléfono, sin override y parado en una ruta de Oficina → al Modo Campo.
  if (isMobile && !forceOficina && !enCampo) {
    return <Navigate to="/campo/manga" replace />
  }

  return (
    <>
      <Outlet />
      {/* Móvil que se escapó a Oficina: cómo volver al Campo sin tocar el
          AppShell de escritorio. */}
      {isMobile && forceOficina && !enCampo && <VolverACampo />}
    </>
  )
}

function VolverACampo() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => {
        setForceOficina(false)
        navigate('/campo/manga')
      }}
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_rgba(16,30,20,0.28)]"
    >
      <Tractor className="size-4" />
      Volver a Modo Campo
    </button>
  )
}
