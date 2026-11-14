import { cn } from '@/lib/utils'

/**
 * El encabezado de cada sección (Lau, 06/11: «hagamos todos como el del
 * Inicio»): tarjeta clara, a la izquierda lo de la sección y a la derecha una
 * ilustración abstracta de la marca, fundida con el fondo, con «Estás viendo».
 */
export function Cabecera({
  imagen,
  posicion = '50% 50%',
  derecha,
  encima,
  children,
  className,
}: {
  /** La ilustración (assets/tropero): lotes, pastura, textura, arroyo. */
  imagen: string
  /** object-position de la ilustración, para encuadrar lo lindo. */
  posicion?: string
  /** Lo de arriba a la derecha (una acción). */
  derecha?: React.ReactNode
  /** La línea chica arriba del título (Estás viendo). */
  encima?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('relative isolate flex min-h-[112px] flex-wrap items-center gap-x-6 gap-y-4 overflow-hidden rounded-[20px] border border-borde bg-superficie px-7 py-5', className)}>
      <img src={imagen} alt="" className="absolute inset-y-0 right-0 -z-20 h-full w-[62%] object-cover" style={{ objectPosition: posicion }} />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,var(--superficie)_38%,color-mix(in_srgb,var(--superficie)_70%,transparent)_58%,transparent_85%)]" />
      <div className="min-w-0 flex-1">
        {encima && <div className="mb-1.5">{encima}</div>}
        {children}
      </div>
      {derecha && <div className="flex shrink-0 flex-col items-end gap-3 self-start">{derecha}</div>}
    </section>
  )
}
