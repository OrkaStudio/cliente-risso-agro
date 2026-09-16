import { type ComponentProps } from 'react'
import { MessageCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { formatearMientrasEscribe } from '@/lib/telefono'
import { cn } from '@/lib/utils'

/**
 * Celular argentino con el `+54 9` fijo adelante: el productor escribe sólo
 * área + número, como lo tiene agendado en WhatsApp. Mientras escribe se
 * pone el guion después de la característica (2923-456789, 11-5555-4444) y
 * si pega el número entero con +54, 0 o 15, se limpia solo.
 */
export function CelularInput({
  value,
  onValueChange,
  invalido = false,
  className,
  ...props
}: Omit<
  ComponentProps<typeof Input>,
  'type' | 'inputMode' | 'value' | 'onChange'
> & {
  value: string
  onValueChange: (formateado: string) => void
  /** Borde rojo en el grupo entero (el input solo no se ve). */
  invalido?: boolean
}) {
  return (
    // El foco lo lleva el grupo (prefijo + input), no el input solo: ver
    // `.celular-grupo` en index.css.
    <div
      className={cn(
        'celular-grupo flex items-stretch rounded-lg border border-input',
        className,
        // Mismo aviso que un Input suelto: borde + halo rojo, pero en el grupo.
        invalido && 'border-destructive ring-3 ring-destructive/20',
      )}
    >
      <span
        aria-hidden
        className="flex shrink-0 items-center gap-1.5 border-r border-input bg-muted/40 px-2.5 text-sm whitespace-nowrap text-muted-foreground/70"
      >
        <MessageCircle className="size-4 text-muted-foreground/55" strokeWidth={1.5} />
        +54 9
      </span>
      <Input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="2923-456789"
        value={value}
        aria-invalid={invalido}
        onChange={(e) => onValueChange(formatearMientrasEscribe(e.target.value))}
        className="rounded-l-none border-0"
        {...props}
      />
    </div>
  )
}
