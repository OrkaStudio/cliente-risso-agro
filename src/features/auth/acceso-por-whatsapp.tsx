import { useQueryClient } from '@tanstack/react-query'
import { PantallaAviso } from '@/app/pantalla-aviso'
import { WHATSAPP_TROPERO } from '@/features/acceso/reglas'
import { useAuth } from '@/features/auth/auth-context'
import { olvidarCuentaElegida } from '@/features/empresa/cuenta-activa'

/**
 * Quien el dueño invitó «Sólo por WhatsApp» (permisos, 14/11) no usa la app:
 * si igual entra, se le dice dónde está lo suyo, con el botón para abrirlo.
 * Si además está en otras cuentas (varias cuentas, 14/11), puede entrar con otra.
 */
export function AccesoPorWhatsapp({ empresa, otrasCuentas = false }: { empresa: string | null; otrasCuentas?: boolean }) {
  const { user, signOut } = useAuth()
  const qc = useQueryClient()
  return (
    <PantallaAviso
      pantallaEntera
      titulo="Tu acceso es por WhatsApp"
      texto={`${empresa ? `En ${empresa}, l` : 'L'}o tuyo lo mandás por WhatsApp: novedades, gastos o facturas. No hace falta usar la app.`}
      accion="Abrir WhatsApp"
      icono="Celular"
      onAccion={() => window.open(`https://wa.me/${WHATSAPP_TROPERO}`, '_blank', 'noopener')}
      secundaria={
        otrasCuentas && user
          ? {
              texto: 'Entrar con otra cuenta',
              onClick: () => {
                olvidarCuentaElegida(user.id)
                void qc.invalidateQueries({ queryKey: ['empresa'] })
              },
            }
          : { texto: 'Salir', onClick: () => void signOut() }
      }
    />
  )
}
