import * as React from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/auth-context'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useEstadoPuestaAPunto } from '@/features/guia/checklist'
import { Recorrido } from '@/features/guia/guia'
import {
  useMarcarVista,
  usePendiente,
  useRecibimientoPedido,
} from '@/features/guia/guia-store'
import { nombreDe } from '@/features/guia/nombre-usuario'
import { pasosRecibimiento } from '@/features/guia/pasos-recibimiento'
import { seccionDeRuta } from '@/features/guia/pasos'

/**
 * El recibimiento: lo primero que ve el productor en la Oficina después del
 * onboarding — UNA vez por persona (tabla `guia_vista`), en dos pasos con
 * la misma escena del recorrido:
 *
 *   1. "Ya está tu empresa": lo que cargó, con sus números.
 *   2. "Lo que sigue": el primer paso pendiente de la puesta a punto, con la
 *      luz sobre el botón real si está en esta pantalla y el CTA que lo abre.
 *
 * Nada más se dispara mientras dura: la pastilla y el chip de oferta esperan
 * a que la escena termine (`setEscenaActiva`). Se puede volver a ver desde
 * el panel del asistente (`pedirRecibimiento`).
 *
 * Sólo en las secciones principales de Oficina (donde hay anclas); si el
 * productor cae en otra ruta, espera a que llegue a una. Cargando el
 * estado, o sin red, no aparece: mejor no recibir que recibir dos veces.
 */
export function Recibimiento() {
  const location = useLocation()
  const seccion = seccionDeRuta(location.pathname)
  const pendiente = usePendiente('recibimiento')
  const pedido = useRecibimientoPedido()
  const estado = useEstadoPuestaAPunto()
  const marcarVista = useMarcarVista()
  const { user } = useAuth()
  const empresa = useEmpresa()

  // Pedidos manuales ("Volver a ver la bienvenida"): sólo los posteriores
  // al montaje.
  const pedidoInicial = React.useRef(pedido)
  const [activo, setActivo] = React.useState<number | null>(null)
  // Ya lo mostramos en esta sesión: aunque el cache tarde en actualizarse,
  // no se repite.
  const mostrado = React.useRef(false)

  const listo = seccion !== null && estado.isSuccess && empresa.isSuccess

  // Primera vez: tras dejar que la página se acomode (el onboarding recién
  // navegó y las secciones cargan sus chunks).
  React.useEffect(() => {
    if (!listo || !pendiente || mostrado.current || activo !== null) return
    const t = setTimeout(() => {
      mostrado.current = true
      setActivo(0)
    }, 900)
    return () => clearTimeout(t)
  }, [listo, pendiente, activo])

  React.useEffect(() => {
    if (pedido === pedidoInicial.current || !listo) return
    const t = setTimeout(() => setActivo(pedido), 0)
    return () => clearTimeout(t)
  }, [pedido, listo])

  if (activo === null || !listo || !estado.data) return null

  const nombre = nombreDe(user?.user_metadata)
  const nombreEmpresa = empresa.data?.empresa?.nombre ?? null

  return (
    <Recorrido
      key={`recibimiento:${activo}`}
      nombre="Bienvenida"
      pasos={pasosRecibimiento(estado.data, nombre, nombreEmpresa)}
      onFin={() => {
        setActivo(null)
        marcarVista('recibimiento')
      }}
    />
  )
}
