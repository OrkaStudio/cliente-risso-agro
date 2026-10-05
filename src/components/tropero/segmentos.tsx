import { cn } from '@/lib/utils'
import { Icono, type NombreIcono } from './icono'

/**
 * Selector de una opción entre pocas (Propio / Alquilado, Hacienda / Sembrado /
 * Descanso…), como en la 35: una píldora hundida y la opción elegida en
 * terracota. Es un radiogroup: se recorre con las flechas.
 */
export function Segmentos<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambio,
  className,
}: {
  /** Para lectores de pantalla (y la etiqueta visible la pone quien lo usa). */
  etiqueta: string
  opciones: { valor: T; texto: string; icono?: NombreIcono; marca?: React.ReactNode }[]
  valor: T | null
  onCambio: (v: T) => void
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      className={cn('flex gap-1 rounded-full bg-superficie-hundida p-1', className)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
        const i = Math.max(0, opciones.findIndex((o) => o.valor === valor))
        const sig = opciones[(i + (e.key === 'ArrowRight' ? 1 : opciones.length - 1)) % opciones.length]!
        onCambio(sig.valor)
        e.preventDefault()
      }}
    >
      {opciones.map((o) => {
        const activo = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            tabIndex={activo || (valor === null && o === opciones[0]) ? 0 : -1}
            onClick={() => onCambio(o.valor)}
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[14px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-principal/40',
              activo ? 'bg-principal text-principal-texto' : 'text-texto hover:bg-superficie/70',
            )}
          >
            {o.icono && <Icono nombre={o.icono} tamano={16} />}
            {o.texto}
            {o.marca}
          </button>
        )
      })}
    </div>
  )
}
