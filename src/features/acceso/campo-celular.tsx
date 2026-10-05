import { useId } from 'react'
import { formatearMientrasEscribe } from '@/lib/telefono'
import { cn } from '@/lib/utils'

/**
 * El celular como en la 35: «+54 9» fijo adelante y el número formateado
 * mientras se escribe (2241 55-8820). Si pegan el número entero con +54, 0 o
 * 15, se limpia solo (formatearMientrasEscribe).
 */
export function CampoCelular({
  etiqueta,
  valor,
  onCambio,
  ayuda,
  error,
  invalido = false,
  autoFocus,
  className,
  children,
}: {
  etiqueta: string
  valor: string
  onCambio: (formateado: string) => void
  ayuda?: React.ReactNode
  error?: React.ReactNode
  /** Borde rojo sin mensaje (el mensaje está en otra tarjeta). */
  invalido?: boolean
  autoFocus?: boolean
  className?: string
  /** Algo debajo del mensaje (p. ej. el botón «Entrar con este número»). */
  children?: React.ReactNode
}) {
  const id = useId()
  const mensaje = error ?? ayuda
  return (
    <div className={cn('flex flex-col gap-[7px] md:gap-2', className)}>
      <label htmlFor={id} className="text-[14px] font-semibold text-texto md:text-[14.5px]">
        {etiqueta}
      </label>
      <div
        className={cn(
          'flex items-center gap-[0.3em] rounded-2xl border-[1.5px] bg-superficie px-[18px] text-[16px] text-texto transition-colors focus-within:border-principal',
          error || invalido ? 'border-estado-problema' : 'border-borde',
        )}
      >
        <span aria-hidden className="select-none">
          +54 9
        </span>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="2241 55-8820"
          value={valor}
          autoFocus={autoFocus}
          aria-invalid={error || invalido ? true : undefined}
          aria-describedby={mensaje ? `${id}-ayuda` : undefined}
          onChange={(e) => onCambio(formatearMientrasEscribe(e.target.value))}
          className="min-w-0 flex-1 bg-transparent py-4 outline-none placeholder:text-texto-suave/60 md:py-[17px]"
        />
      </div>
      {mensaje && (
        <p
          id={`${id}-ayuda`}
          className={cn('text-[13px] md:text-[13.5px]', error ? 'text-estado-problema-texto' : 'text-texto-suave')}
        >
          {mensaje}
        </p>
      )}
      {children}
    </div>
  )
}
