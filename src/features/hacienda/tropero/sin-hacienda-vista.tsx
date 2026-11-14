import { Icono, type NombreIcono } from '@/components/tropero/icono'
import type { CaraSinHacienda } from './sin-hacienda'
import { useQuienMira } from '@/features/empresa/use-quien-mira'

const ha = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

/**
 * Hacienda cuando el campo no tiene animales (Lau, 29/10). Dos caras: el campo
 * agrícola dice qué tiene sembrado y lleva a Campos; el que falta cargar ofrece
 * las formas de cargarla. Nada de un 0 grande ni una tabla vacía.
 */
export function SinHacienda({
  carga = true,
  cara,
  campo,
  onEntraron,
  onPlanilla,
  onVerCampo,
}: {
  /** Con Hacienda en «Ve» no se ofrece cargar (permisos, 13/11). */
  carga?: boolean
  cara: CaraSinHacienda
  /** El campo elegido; null con «Todos tus campos». */
  campo: string | null
  onEntraron: () => void
  onPlanilla: () => void
  onVerCampo: () => void
}) {
  const quien = useQuienMira()
  if (cara.tipo === 'agricola')
    return (
      <div className="flex flex-col gap-5 px-7 py-7 lg:col-span-2 lg:flex-row lg:items-center lg:gap-8">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-trigo-100 text-trigo-700">
          <Icono nombre="Campos" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="t-seccion text-texto">{campo} es agrícola</h2>
          <p className="mt-1 text-[15px] text-texto-suave">No tiene hacienda. Esto es lo que tiene:</p>
          <p className="t-cifra-chica mt-3 flex flex-wrap gap-x-4 gap-y-1 text-texto">
            <span>
              <b>{ha(cara.hectareas)}</b> ha
            </span>
            {cara.sembrado.map((s) => (
              <span key={s.cultivo}>
                {s.cultivo} <b>{ha(s.hectareas)}</b> ha
              </span>
            ))}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
          <button type="button" onClick={onVerCampo} className="inline-flex h-11 items-center gap-2 rounded-full bg-principal px-5 text-[14.5px] font-bold text-principal-texto hover:bg-terracota-600">
            Ver {campo} en Campos
            <Icono nombre="Siguiente" tamano={16} />
          </button>
          {carga && (
            <button type="button" onClick={onEntraron} className="inline-flex h-9 items-center gap-1.5 rounded-full border-[1.5px] border-borde bg-superficie px-3.5 text-[14px] font-bold text-texto transition-colors hover:border-principal hover:text-principal">
              ¿Entraron animales? Cargalos
            </button>
          )}
        </div>
      </div>
    )

  if (!carga)
    return (
      <div className="flex flex-col gap-1 px-7 py-7 lg:col-span-2">
        <h2 className="t-seccion text-texto">Todavía no hay hacienda cargada {campo ? `en ${campo}` : `en ${quien.enLosCampos}`}</h2>
        <p className="text-[15px] text-texto-suave">Cuando el dueño la cargue, la vas a ver acá.</p>
      </div>
    )
  const formas: { icono: NombreIcono; titulo: string; detalle: string; onClick: () => void }[] = [
    { icono: 'Agregar', titulo: 'Entraron', detalle: 'Los compraste, nacieron o vinieron de otro campo tuyo.', onClick: onEntraron },
    { icono: 'Comprobante', titulo: 'Desde una planilla', detalle: 'La del veterinario o la tuya: la leemos y la revisás antes de guardar.', onClick: onPlanilla },
  ]
  return (
    <div className="flex flex-col gap-5 px-7 py-7 lg:col-span-2">
      <div>
        <h2 className="t-seccion text-texto">Todavía no cargaste la hacienda {campo ? `de ${campo}` : `de ${quien.enLosCampos}`}</h2>
        <p className="mt-1 text-[15px] text-texto-suave">Elegí cómo cargarla:</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {formas.map((f) => (
          <button
            key={f.titulo}
            type="button"
            onClick={f.onClick}
            className="group flex items-start gap-4 rounded-[18px] border border-borde bg-fondo/50 p-5 text-left transition-colors hover:border-principal/40 hover:bg-principal-suave/40"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-principal-suave text-principal">
              <Icono nombre={f.icono} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[17px] font-bold text-texto">
                {f.titulo}
                <Icono nombre="Siguiente" tamano={16} className="text-principal transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block text-[14px] leading-snug text-texto-suave">{f.detalle}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
