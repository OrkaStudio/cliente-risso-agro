import * as React from 'react'
import {
  AnimatePresence,
  MotionConfig,
  motion,
  type Variants,
} from 'framer-motion'
import { Check, ChevronDown, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DropdownOption = {
  value: string
  label: string
  icon?: LucideIcon
  /** Color del ícono (opcional). */
  color?: string
}

function useClickAway(
  ref: React.RefObject<HTMLElement | null>,
  handler: () => void,
) {
  React.useEffect(() => {
    const listener = (e: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return
      handler()
    }
    document.addEventListener('mousedown', listener)
    document.addEventListener('touchstart', listener)
    return () => {
      document.removeEventListener('mousedown', listener)
      document.removeEventListener('touchstart', listener)
    }
  }, [ref, handler])
}

const container: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { when: 'beforeChildren', staggerChildren: 0.04 },
  },
}
const item: Variants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
}

/**
 * Dropdown animado (framer-motion) en el tema del sistema: porcelana/verde.
 * Reemplaza a los <select> nativos. Click-away + Escape para cerrar,
 * highlight que se desliza entre opciones.
 */
export function Dropdown({
  value,
  onChange,
  options,
  className,
  menuClassName,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  className?: string
  menuClassName?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [hovered, setHovered] = React.useState<string | null>(null)
  const ref = React.useRef<HTMLDivElement>(null)
  useClickAway(ref, () => setOpen(false))

  const selected = options.find((o) => o.value === value) ?? options[0]
  const activo = hovered ?? value

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative shrink-0" ref={ref}>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          className={cn(
            'flex h-10 items-center justify-between gap-2 rounded-[10px] border border-border bg-card pl-3.5 pr-2.5 text-sm font-semibold text-ink shadow-[0_1px_2px_rgba(16,24,19,0.05)] outline-none transition-colors hover:border-faint focus-visible:ring-2 focus-visible:ring-field-soft',
            open && 'border-primary ring-2 ring-field-soft',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            {selected?.icon && (
              <selected.icon
                className="size-4 shrink-0"
                style={selected.color ? { color: selected.color } : undefined}
              />
            )}
            <span className="truncate">{selected?.label}</span>
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="flex size-4 shrink-0 items-center justify-center text-faint"
          >
            <ChevronDown className="size-4" />
          </motion.span>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{
                opacity: 1,
                height: 'auto',
                transition: { type: 'spring', stiffness: 500, damping: 32 },
              }}
              exit={{
                opacity: 0,
                height: 0,
                transition: { type: 'spring', stiffness: 500, damping: 32 },
              }}
              className={cn(
                'absolute left-0 top-full z-50 mt-2 min-w-full overflow-hidden',
                menuClassName,
              )}
            >
              <motion.div
                variants={container}
                initial="hidden"
                animate="visible"
                className="relative rounded-xl border border-border bg-card p-1 shadow-[0_12px_40px_rgba(16,30,20,0.16)]"
              >
                {options.map((o) => {
                  const esActivo = o.value === activo
                  const esSel = o.value === value
                  return (
                    <motion.button
                      key={o.value}
                      type="button"
                      variants={item}
                      onClick={() => {
                        onChange(o.value)
                        setOpen(false)
                      }}
                      onHoverStart={() => setHovered(o.value)}
                      onHoverEnd={() => setHovered(null)}
                      className={cn(
                        'relative flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        esActivo ? 'text-ink' : 'text-muted-foreground',
                      )}
                    >
                      {esActivo && (
                        <motion.span
                          layoutId="dropdown-hl"
                          className="absolute inset-0 rounded-lg bg-secondary"
                          transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                        />
                      )}
                      {o.icon && (
                        <o.icon
                          className="relative z-10 size-4 shrink-0"
                          style={o.color ? { color: o.color } : undefined}
                        />
                      )}
                      <span className="relative z-10 flex-1 font-medium">
                        {o.label}
                      </span>
                      {esSel && (
                        <Check className="relative z-10 size-4 shrink-0 text-field-deep" />
                      )}
                    </motion.button>
                  )
                })}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}
