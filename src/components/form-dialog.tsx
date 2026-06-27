// Exporta componentes + helpers de estilo del mismo módulo (patrón del repo).
/* eslint-disable react-refresh/only-export-components */
import { type FormEvent, type ReactNode } from 'react'
import { motion, type Variants } from 'framer-motion'
import { Check, X, type LucideIcon } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// Estilos compartidos de los formularios del Modo Oficina.
export const formField =
  'h-10 w-full rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-ink shadow-[0_1px_2px_rgba(16,24,19,0.05)] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-field-soft placeholder:text-faint'
export const formLabel = 'mb-1.5 block text-[12px] font-semibold text-ink'

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}
/** Entrada escalonada de cada campo del formulario. */
export const formItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 320, damping: 26 },
  },
}

/** Checkbox con estilo de tarjeta seleccionable (más prolijo que el nativo). */
export function CheckCard({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-semibold transition-colors',
        checked
          ? 'border-primary bg-field-soft text-field-deep'
          : 'border-border bg-card text-ink hover:border-faint',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
          checked ? 'border-primary bg-primary text-white' : 'border-faint bg-card',
        )}
      >
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      {children}
    </label>
  )
}

/**
 * Marco común de los formularios en diálogo: header con ícono + título +
 * subtítulo + cerrar, cuerpo scrolleable (la scrollbar arranca debajo del
 * header) y footer fijo con la acción + difuminado suave hacia el contenido.
 * Cada campo del cuerpo debería ser un `motion.div variants={formItem}`.
 */
export function FormDialog({
  open,
  onOpenChange,
  icon: Icon,
  title,
  subtitle,
  onSubmit,
  footer,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  icon: LucideIcon
  title: string
  subtitle?: string
  onSubmit: (e: FormEvent) => void
  /** Acción(es) del footer (botón de submit). */
  footer: ReactNode
  children: ReactNode
  /** Override del ancho del diálogo (por defecto sm:max-w-[470px]). */
  className?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'flex max-h-[90svh] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[470px]',
          className,
        )}
      >
        {/* Header con identidad (fijo: la scrollbar arranca debajo) */}
        <div className="flex shrink-0 items-start gap-3 border-b border-border bg-gradient-to-br from-field-soft via-card to-card px-5 py-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-field-deep text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]">
            <Icon className="size-[22px]" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <DialogTitle className="font-heading text-[19px] font-bold leading-tight text-ink">
              {title}
            </DialogTitle>
            {subtitle && (
              <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
          <DialogClose
            render={
              <button
                type="button"
                aria-label="Cerrar"
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-ink"
              />
            }
          >
            <X className="size-[18px]" />
          </DialogClose>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          {/* Cuerpo scrolleable */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="scroll-rounded grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-5 pb-6 pt-4"
          >
            {children}
          </motion.div>

          {/* Footer fijo (siempre visible) con difuminado suave por encima */}
          <div className="relative shrink-0 px-5 pb-5 pt-3">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-5 h-5 bg-gradient-to-t from-popover to-transparent"
            />
            {footer}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
