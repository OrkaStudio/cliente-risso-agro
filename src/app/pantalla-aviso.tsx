import { useNavigate } from 'react-router-dom'
import { BotonPrincipal } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import { Logo } from '@/components/tropero/logo'
import type { NombreIcono } from '@/components/tropero/iconos-svg'
import { cn } from '@/lib/utils'

/**
 * Lo que se ve cuando algo no está o falló: el isotipo, qué pasó en una línea,
 * qué hacer y un botón para hacerlo. Con `pantallaEntera` lleva la marca arriba
 * (cuando no hay barra lateral, como en un error de la app).
 */
export function PantallaAviso({
  titulo,
  texto,
  accion,
  icono,
  onAccion,
  secundaria,
  pantallaEntera = false,
}: {
  titulo: string
  texto: string
  accion: string
  icono: NombreIcono
  onAccion: () => void
  secundaria?: { texto: string; onClick: () => void }
  pantallaEntera?: boolean
}) {
  return (
    <div className={cn('flex flex-col bg-fondo', pantallaEntera ? 'min-h-[100dvh] px-6 py-8 sm:px-10' : 'min-h-[70vh] py-10')}>
      {pantallaEntera && <Logo alto={28} />}
      <div className="m-auto flex w-full max-w-[460px] flex-col items-start">
        <span className="grid size-16 place-items-center rounded-[20px] bg-principal-suave">
          <Logo soloIsotipo alto={30} />
        </span>
        <h1 className="t-pagina mt-6 text-texto">{titulo}</h1>
        <p className="mt-3 text-[17px] leading-snug text-texto-suave">{texto}</p>
        <div className="mt-8 flex w-full flex-col gap-3">
          <BotonPrincipal icono={icono} onClick={onAccion}>
            {accion}
          </BotonPrincipal>
          {secundaria && (
            <button type="button" onClick={secundaria.onClick} className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-borde bg-superficie text-[16px] font-bold text-texto hover:border-principal hover:text-principal">
              <Icono nombre="Atrás" tamano={16} />
              {secundaria.texto}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Una dirección que no existe (un link viejo o mal escrito), dentro de la app. */
export function NoEncontrada() {
  const navigate = useNavigate()
  return (
    <PantallaAviso
      titulo="No encontramos esta página"
      texto="Puede que el link sea viejo o que esté mal escrito. Tus datos están bien."
      accion="Ir al Inicio"
      icono="Inicio"
      onAccion={() => navigate('/')}
      secundaria={window.history.length > 1 ? { texto: 'Volver a donde estabas', onClick: () => navigate(-1) } : undefined}
    />
  )
}
