import { type ReactNode } from 'react'
import { Delete } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Primitivas del Modo Campo ("tablero de máquina"). Comparten el lenguaje
 * entre manga / recorrida / plata: bordes 2px, sombras duras, labels
 * condensadas, datos en mono. Ver campo.css.
 */

export type Tono = 'ok' | 'mid' | 'warn' | 'bad' | 'ink'

const TONO_FILL: Record<Tono, string> = {
  ok: 'bg-[var(--c-ok)] text-white border-[var(--c-ink)]',
  mid: 'bg-[#71941f] text-white border-[var(--c-ink)]',
  warn: 'bg-[var(--c-warn)] text-white border-[var(--c-ink)]',
  bad: 'bg-[var(--c-bad)] text-white border-[var(--c-ink)]',
  ink: 'bg-[var(--c-ink)] text-[var(--c-panel)] border-[var(--c-ink)]',
}
const TONO_TEXT: Record<Tono, string> = {
  ok: 'text-[var(--c-ok-deep)]',
  mid: 'text-[#5c7a15]',
  warn: 'text-[var(--c-warn)]',
  bad: 'text-[var(--c-bad)]',
  ink: 'text-[var(--c-ink)]',
}
const TONO_TICK: Record<Tono, string> = {
  ok: 'bg-[var(--c-ok)]',
  mid: 'bg-[#71941f]',
  warn: 'bg-[var(--c-warn)]',
  bad: 'bg-[var(--c-bad)]',
  ink: 'bg-[var(--c-ink)]',
}

export function CLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('c-label block', className)}>{children}</span>
}

/**
 * Botón de estado con la semántica SIEMPRE visible: sin seleccionar muestra su
 * tono en texto + tick de color; seleccionado se llena del tono. Nada de gris
 * mudo hasta que toques.
 */
export function CSegBtn({
  label,
  tono,
  selected,
  onClick,
  className,
}: {
  label: string
  tono: Tono
  selected: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'c-display flex h-13 items-center justify-center gap-1.5 rounded-lg border-2 px-1 text-[14px] uppercase tracking-wide transition-colors',
        selected
          ? cn(TONO_FILL[tono], 'c-hard-sm')
          : cn(
              'border-[var(--c-ink)]/25 bg-[var(--c-panel)]',
              TONO_TEXT[tono],
            ),
        className,
      )}
    >
      {!selected && (
        <span
          aria-hidden
          className={cn('h-2.5 w-2.5 shrink-0 rounded-[2px]', TONO_TICK[tono])}
        />
      )}
      {label}
    </button>
  )
}

/** Chip seleccionable (notas rápidas, detalle, categorías). */
export function CChip({
  label,
  selected,
  onClick,
  className,
}: {
  label: string
  selected: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'c-display shrink-0 rounded-lg border-2 px-3 py-2 text-[13px] uppercase tracking-wide transition-colors',
        selected
          ? 'border-[var(--c-ink)] bg-[var(--c-ink)] text-[var(--c-panel)]'
          : 'border-[var(--c-ink)]/30 bg-[var(--c-panel)] text-[var(--c-ink-soft)]',
        className,
      )}
    >
      {label}
    </button>
  )
}

/** Bloque de dato del header-instrumento: label chiquita + cifra mono. */
export function CGauge({
  label,
  value,
  tono = 'ink',
  className,
}: {
  label: string
  value: ReactNode
  tono?: Tono
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-end leading-none', className)}>
      <span className={cn('c-mono text-[30px] font-bold', TONO_TEXT[tono])}>
        {value}
      </span>
      <CLabel className="mt-1">{label}</CLabel>
    </div>
  )
}

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back'] as const

/**
 * Numpad propio: cero teclado del sistema. Teclas grandes mono, tecla `000`
 * para montos redondos (la mayoría en el campo lo son).
 */
export function CNumpad({
  onDigit,
  onBackspace,
  className,
}: {
  onDigit: (d: string) => void
  onBackspace: () => void
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-3 gap-1.5', className)}>
      {NUMPAD_KEYS.map((k) =>
        k === 'back' ? (
          <button
            key={k}
            type="button"
            aria-label="Borrar"
            onClick={onBackspace}
            className="c-hard-sm flex h-11 items-center justify-center rounded-lg border-2 border-[var(--c-ink)] bg-[var(--c-sunk)] text-[var(--c-ink)]"
          >
            <Delete className="size-5" />
          </button>
        ) : (
          <button
            key={k}
            type="button"
            onClick={() => onDigit(k)}
            className="c-mono c-hard-sm flex h-11 items-center justify-center rounded-lg border-2 border-[var(--c-ink)] bg-[var(--c-panel)] text-[19px] font-bold text-[var(--c-ink)]"
          >
            {k}
          </button>
        ),
      )}
    </div>
  )
}

/** Hoja inferior simple (elegir categoría en la manga) — dentro del shell. */
export function CSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--c-ink)]/45"
      />
      <div className="relative max-h-[75%] overflow-y-auto rounded-t-2xl border-2 border-b-0 border-[var(--c-ink)] bg-[var(--c-panel)] px-4 pb-6 pt-3">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[var(--c-ink)]/25" />
        <CLabel className="mb-3 text-[12px]">{title}</CLabel>
        {children}
      </div>
    </div>
  )
}
