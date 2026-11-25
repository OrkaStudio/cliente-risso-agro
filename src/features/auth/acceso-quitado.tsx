import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { PantallaAviso } from '@/app/pantalla-aviso'
import { visto } from './acceso-quitado-aviso'
import { useAuth } from './auth-context'

/**
 * Le sacaron el acceso y no le queda ninguna cuenta (Lau, 25/11): antes la app lo
 * mandaba a «Creá tu campo» como a un productor nuevo. Se le dice qué pasó y que
 * lo suyo queda; si también tiene campo propio, lo arma desde acá.
 */
export function AccesoQuitado({ empresa }: { empresa: { empresa_id: string; nombre: string } }) {
  const { signOut } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  return (
    <PantallaAviso
      pantallaEntera
      titulo={`Ya no tenés acceso a ${empresa.nombre}`}
      texto="El dueño te sacó el acceso. Lo que cargaste queda, con tu nombre. Si fue un error, pedile que te invite de nuevo."
      accion="Salir"
      icono="Salir"
      etiqueta={{ texto: 'Sin acceso', tono: 'gris' }}
      onAccion={() => void signOut()}
      secundaria={{
        texto: 'Armar mi propio campo',
        onClick: () => {
          void visto(empresa.empresa_id).then(() => qc.invalidateQueries({ queryKey: ['empresa'] }).then(() => navigate('/onboarding')))
        },
      }}
    />
  )
}
