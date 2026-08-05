import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { CLabel } from '../ui'

/**
 * Piezas compartidas del flujo de manga. Existen para que los cuatro pasos se
 * sientan UNA pantalla que avanza y no cuatro pantallas distintas: mismo
 * encabezado, misma forma de volver, mismo ritmo de entrada.
 *
 * El movimiento es corto y con resorte, nunca un fade largo: en el campo la
 * animación tiene que confirmar que algo pasó, no hacerse notar.
 */

/** Entrada de paso: sube apenas y aparece. Respeta reduced-motion global. */
export function Paso({ children, k }: { children: ReactNode; k: string }) {
  return (
    <motion.div
      key={k}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
      className="flex h-full flex-col"
    >
      {children}
    </motion.div>
  )
}

/** Encabezado con volver. Es el ancla del flujo: siempre en el mismo lugar. */
export function Encabezado({
  titulo,
  sub,
  onVolver,
  derecha,
}: {
  titulo: string
  sub?: string
  onVolver?: () => void
  derecha?: ReactNode
}) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-[var(--c-line)] bg-[var(--c-panel)] px-3 py-2.5">
      {onVolver && (
        <button
          type="button"
          onClick={onVolver}
          aria-label="Volver"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--c-ink-soft)] transition-colors active:bg-[var(--c-sunk)]"
        >
          <ArrowLeft className="size-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="c-display truncate text-[15.5px] leading-tight text-[var(--c-ink)]">
          {titulo}
        </div>
        {sub && <CLabel className="block truncate !text-[10px]">{sub}</CLabel>}
      </div>
      {derecha}
    </header>
  )
}

/**
 * Opción grande de una lista de decisiones. Ícono a la izquierda para que se
 * reconozca antes de leer, título y una línea que explica la consecuencia —
 * que en la manga casi siempre es lo que importa ("lo mueve de verdad").
 */
export function OpcionDestino({
  icono,
  titulo,
  detalle,
  acento,
  onClick,
}: {
  icono: ReactNode
  titulo: string
  detalle: string
  acento: { borde: string; fondo: string; tinta: string }
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.985 }}
      className="flex items-center gap-3.5 rounded-2xl border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-4 py-3.5 text-left"
    >
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: acento.fondo, color: acento.tinta }}
      >
        {icono}
      </span>
      <span className="min-w-0 flex-1">
        <span className="c-display block text-[16px] leading-tight text-[var(--c-ink)]">
          {titulo}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--c-ink-soft)]">
          {detalle}
        </span>
      </span>
    </motion.button>
  )
}

/** Botón principal del paso: siempre abajo, siempre del mismo alto. */
export function Seguir({
  children,
  onClick,
  disabled,
  color,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  color?: string
}) {
  return (
    <div className="shrink-0 border-t border-[var(--c-line)] bg-[var(--c-bg)] px-4 pb-3.5 pt-3">
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        whileTap={disabled ? undefined : { scale: 0.985 }}
        className="c-display c-hard flex h-15 w-full items-center justify-center rounded-xl border border-transparent text-[18px] text-white disabled:opacity-40"
        style={{ backgroundColor: color ?? 'var(--c-ok)' }}
      >
        {children}
      </motion.button>
    </div>
  )
}
