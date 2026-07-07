import { type ReactNode } from 'react'
import { Delete } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Primitivas del Modo Campo. Mismo lenguaje visual que Oficina (tarjetas
 * blancas, hairline, verde campo, mono para datos); lo field-first está en
 * los targets grandes y en que el color aparece AL ELEGIR — sin ruido en
 * reposo. Ver campo.css.
 */

export type Tono = 'ok' | 'mid' | 'warn' | 'bad' | 'ink'

const TONO_FILL: Record<Tono, string> = {
  ok: 'border-[var(--c-ok)] bg-[var(--c-ok)] text-white',
  mid: 'border-[var(--c-mid)] bg-[var(--c-mid)] text-white',
  warn: 'border-[var(--c-warn)] bg-[var(--c-warn)] text-white',
  bad: 'border-[var(--c-bad)] bg-[var(--c-bad)] text-white',
  ink: 'border-[var(--c-ink)] bg-[var(--c-ink)] text-white',
}
const TONO_TEXT: Record<Tono, string> = {
  ok: 'text-[var(--c-ok-deep)]',
  mid: 'text-[#5c7a15]',
  warn: 'text-[var(--c-warn-deep)]',
  bad: 'text-[var(--c-bad)]',
  ink: 'text-[var(--c-ink)]',
}
export { TONO_TEXT }

export function CLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('c-label block', className)}>{children}</span>
}

/**
 * Botón de estado: en reposo es una tarjeta neutra (sin ruido); al elegirlo
 * se llena con su color semántico. Target alto (h-13) para dedo con guante.
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
        'flex h-13 items-center justify-center rounded-xl border px-1 text-[13.5px] font-semibold transition-colors active:scale-[0.98]',
        selected
          ? cn(TONO_FILL[tono], 'c-hard-sm')
          : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink-soft)]',
        className,
      )}
    >
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
        'shrink-0 rounded-xl border px-3 py-2 text-[13.5px] font-semibold transition-colors active:scale-[0.98]',
        selected
          ? 'border-[var(--c-ok)] bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]'
          : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink-soft)]',
        className,
      )}
    >
      {label}
    </button>
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
            className="flex h-11 items-center justify-center rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-sunk)] text-[var(--c-ink-soft)] transition-transform active:scale-95"
          >
            <Delete className="size-5" />
          </button>
        ) : (
          <button
            key={k}
            type="button"
            onClick={() => onDigit(k)}
            className="c-mono flex h-11 items-center justify-center rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[19px] font-bold text-[var(--c-ink)] transition-transform active:scale-95"
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
        className="absolute inset-0 bg-[var(--c-ink)]/40"
      />
      <div className="relative max-h-[75%] overflow-y-auto rounded-t-2xl border-t border-[var(--c-line)] bg-[var(--c-panel)] px-4 pb-6 pt-3 shadow-[0_-8px_30px_rgba(16,30,20,0.18)]">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[var(--c-line-strong)]" />
        <CLabel className="mb-3 !text-[11px]">{title}</CLabel>
        {children}
      </div>
    </div>
  )
}
