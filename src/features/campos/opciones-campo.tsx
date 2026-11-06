import { cn } from '@/lib/utils'
import { useCampoElegido } from './campo-elegido'

/** La letra del campo en su color, como en la barra. */
export function MarcaCampo({ letra, color, className }: { letra: string; color: string; className?: string }) {
  return (
    <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-extrabold text-white', className)} style={{ background: color }}>
      {letra}
    </span>
  )
}

/**
 * Elegir un campo en un formulario (Lau, 06/11): cada uno con su letra y su
 * color, como en la barra; el elegido, teñido de su color.
 */
export function OpcionesCampo({ campos, elegido, onElegir, etiqueta = 'De qué campo' }: { campos: { id: string; nombre: string }[]; elegido: string; onElegir: (id: string) => void; etiqueta?: string }) {
  const { campos: identidad } = useCampoElegido()
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-2">
      {campos.map((c) => {
        const id = identidad.find((x) => x.id === c.id)
        const si = elegido === c.id
        const color = id?.color ?? 'var(--principal)'
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={si}
            onClick={() => onElegir(c.id)}
            className={cn('inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] py-1 pr-4 pl-1.5 text-[14.5px] font-semibold text-texto transition-colors', !si && 'border-borde bg-superficie hover:border-neutro-300')}
            style={si ? { borderColor: color, background: `color-mix(in srgb, ${color} 16%, var(--superficie))` } : undefined}
          >
            {id ? <MarcaCampo letra={id.letra} color={color} /> : <span className="size-6" />}
            {c.nombre}
          </button>
        )
      })}
    </div>
  )
}
