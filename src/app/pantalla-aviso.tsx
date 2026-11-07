import { useNavigate } from 'react-router-dom'
import { BotonPrincipal } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import tranquera from '@/assets/tropero/tranquera.webp'
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
      {/* En la compu, a dos columnas: la tranquera a la izquierda y qué pasó con qué hacer a la derecha. */}
      <div className="m-auto grid w-full max-w-[1040px] items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:gap-14">
        <div className="relative hidden aspect-[4/3] overflow-hidden rounded-[32px] border border-borde md:block">
          <img src={tranquera} alt="" className="absolute inset-0 size-full object-cover object-[50%_40%]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,color-mix(in_srgb,var(--fondo)_55%,transparent))]" />
        </div>
        <div className="flex flex-col items-start">
          <span className="grid size-14 place-items-center rounded-[18px] bg-principal-suave md:hidden">
            <Logo soloIsotipo alto={26} />
          </span>
          <h1 className="t-pagina mt-5 text-texto md:mt-0 md:text-[52px]">{titulo}</h1>
          <p className="mt-4 max-w-[460px] text-[18px] leading-snug text-texto-suave">{texto}</p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <BotonPrincipal icono={icono} onClick={onAccion} className="sm:w-auto sm:min-w-[220px]">
              {accion}
            </BotonPrincipal>
            {secundaria && (
              <button type="button" onClick={secundaria.onClick} className="inline-flex h-14 items-center justify-center gap-2 rounded-full border-[1.5px] border-borde bg-superficie px-6 text-[16px] font-bold text-texto hover:border-principal hover:text-principal">
                <Icono nombre="Atrás" tamano={16} />
                {secundaria.texto}
              </button>
            )}
          </div>
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
