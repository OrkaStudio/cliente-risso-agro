import { PantallaAviso } from '@/app/pantalla-aviso'
import { WHATSAPP_TROPERO } from '@/features/acceso/reglas'
import { useAuth } from '@/features/auth/auth-context'

/**
 * Quien el dueño invitó «Sólo por WhatsApp» (permisos, 14/11) no usa la app:
 * si igual entra, se le dice dónde está lo suyo, con el botón para abrirlo.
 */
export function AccesoPorWhatsapp({ empresa }: { empresa: string | null }) {
  const { signOut } = useAuth()
  return (
    <PantallaAviso
      pantallaEntera
      titulo="Tu acceso es por WhatsApp"
      texto={`${empresa ? `En ${empresa}, l` : 'L'}o tuyo lo mandás por WhatsApp: novedades, gastos o facturas. No hace falta usar la app.`}
      accion="Abrir WhatsApp"
      icono="Celular"
      onAccion={() => window.open(`https://wa.me/${WHATSAPP_TROPERO}`, '_blank', 'noopener')}
      secundaria={{ texto: 'Salir', onClick: () => void signOut() }}
    />
  )
}
