import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Ícono de ayuda con tooltip al hover: explica qué muestra el panel. */
function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex shrink-0">
      <Info className="size-[18px] cursor-help text-faint transition-colors hover:text-ink" />
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-7 z-30 w-60 rounded-xl border border-border bg-card p-3 text-[12.5px] font-medium leading-snug text-muted-foreground opacity-0 shadow-[0_12px_40px_rgba(16,30,20,0.18)] transition-opacity duration-150 group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  )
}

/**
 * Panel base del Modo Oficina: blanco, hairline, sombra crisp.
 * Cabecera con título + (acción | info | sub a la derecha). Guía: el mockup
 * design/dashboard-agro-ai.html.
 */
export function Panel({
  title,
  sub,
  info,
  action,
  children,
  className,
  guia,
}: {
  title?: string
  sub?: string
  info?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  /** Ancla para la guía asistida (data-guia) — ver features/guia. */
  guia?: string
}) {
  const hasHeader = Boolean(title || sub || info || action)
  return (
    <section
      data-guia={guia}
      className={cn(
        'rounded-[14px] border border-border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)]',
        className,
      )}
    >
      {hasHeader && (
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-border/70 pb-4">
          <h3 className="flex items-center gap-2.5 font-heading text-[17px] font-semibold text-ink">
            {/* Acento que ancla el título (no más título aislado) */}
            <span
              aria-hidden
              className="h-[18px] w-[3px] shrink-0 rounded-full bg-field"
            />
            {title}
          </h3>
          {action ??
            (info ? (
              <InfoTip text={info} />
            ) : (
              sub && <span className="text-[13.5px] text-faint">{sub}</span>
            ))}
        </div>
      )}
      {children}
    </section>
  )
}
