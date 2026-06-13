import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Panel base del Modo Oficina: blanco, hairline, sombra crisp.
 * Cabecera con título + (sub | acción a la derecha). Guía: el mockup
 * design/dashboard-agro-ai.html.
 */
export function Panel({
  title,
  sub,
  action,
  children,
  className,
}: {
  title?: string
  sub?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  const hasHeader = Boolean(title || sub || action)
  return (
    <section
      className={cn(
        'rounded-[14px] border border-border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)]',
        className,
      )}
    >
      {hasHeader && (
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="font-heading text-[17px] font-semibold text-ink">
            {title}
          </h3>
          {action ??
            (sub && <span className="text-[13.5px] text-faint">{sub}</span>)}
        </div>
      )}
      {children}
    </section>
  )
}
