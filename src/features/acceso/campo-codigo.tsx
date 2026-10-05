import { forwardRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { codigoDeLoPegado, limpiarCodigo } from './reglas'

/**
 * El código de 6 números en 6 casillas, en dos grupos de 3 (como se lee:
 * 482 913). Por debajo es UN solo input invisible que cubre las casillas:
 * así funcionan pegar, el autocompletado del celular (one-time-code) y el
 * teclado numérico sin lógica de foco casilla por casilla.
 */
export const CampoCodigo = forwardRef<
  HTMLInputElement,
  {
    id: string
    valor: string
    onCambio: (codigo: string) => void
    error?: boolean
    deshabilitado?: boolean
    /** Muestra rayas en vez de casillas vacías (código vencido). */
    vencido?: boolean
    describedBy?: string
    autoFocus?: boolean
  }
>(function CampoCodigo({ id, valor, onCambio, error, deshabilitado, vencido, describedBy, autoFocus }, ref) {
  const [foco, setFoco] = useState(false)
  const activa = Math.min(valor.length, 5)
  return (
    <div className="relative">
      <div aria-hidden className="flex items-stretch justify-between gap-1.5 sm:gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={cn('contents')}>
            {i === 3 && <span className="w-1.5 shrink-0 sm:w-3" />}
            <div
              className={cn(
                'cifra grid h-[60px] min-w-0 flex-1 place-items-center rounded-[14px] border-[1.5px] bg-superficie text-[30px] font-bold text-texto transition-colors',
                error
                  ? 'border-estado-problema'
                  : foco && !deshabilitado && i === activa
                    ? 'border-principal ring-3 ring-principal/15'
                    : valor[i]
                      ? 'border-texto-suave/50'
                      : 'border-borde',
                vencido && 'text-texto-suave/50',
              )}
            >
              {vencido ? '—' : (valor[i] ?? (foco && i === activa ? <span className="h-7 w-0.5 animate-pulse rounded bg-principal" /> : ''))}
            </div>
          </div>
        ))}
      </div>
      <input
        ref={ref}
        id={id}
        name="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        autoFocus={autoFocus}
        disabled={deshabilitado}
        value={valor}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        onChange={(e) => onCambio(limpiarCodigo(e.target.value))}
        onPaste={(e) => {
          const c = codigoDeLoPegado(e.clipboardData.getData('text'))
          if (c) {
            e.preventDefault()
            onCambio(c)
          }
        }}
        className="absolute inset-0 size-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none disabled:cursor-default"
      />
    </div>
  )
})
