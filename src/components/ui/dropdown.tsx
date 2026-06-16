import * as React from 'react'
import { createPortal } from 'react-dom'
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
  color?: string
}

const container: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { when: 'beforeChildren', staggerChildren: 0.035 },
  },
}
const item: Variants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18 } },
}

type Pos = {
  left: number
  width: number
  up: boolean
  anchorTop: number
  anchorBottom: number
  maxH: number
}

/**
 * Dropdown animado (framer-motion) en el tema del sistema. Reemplaza a los
 * <select> nativos. El menú se renderiza en un portal posicionado contra la
 * ventana: nunca lo recorta un contenedor con scroll y **sube si no hay
 * espacio abajo** (flip). Si hay muchas opciones, el menú scrollea.
 */
export function Dropdown({
  value,
  onChange,
  options,
  className,
  ariaLabel,
  block = false,
}: {
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  className?: string
  ariaLabel?: string
  block?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [hovered, setHovered] = React.useState<string | null>(null)
  const [pos, setPos] = React.useState<Pos | null>(null)
  const btnRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value) ?? options[0]
  const activo = hovered ?? value

  const place = React.useCallback(() => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const M = 8
    const below = window.innerHeight - r.bottom
    const above = r.top
    const estimate = Math.min(options.length * 40 + 12, 320)
    const up = below < Math.min(estimate, 260) && above > below
    const maxH = Math.max(140, (up ? above : below) - M - 8)
    setPos({
      left: r.left,
      width: r.width,
      up,
      anchorTop: r.top,
      anchorBottom: r.bottom,
      maxH,
    })
  }, [options.length])

  // Posicionar al abrir + seguir al trigger en scroll/resize.
  React.useLayoutEffect(() => {
    if (!open) return
    place()
    const onMove = () => place()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, place])

  // Cerrar con click afuera (trigger + menú están en árboles distintos) o Escape.
  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn('relative', block ? 'w-full' : 'inline-block')}>
        <button
          ref={btnRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex h-10 items-center justify-between gap-2 rounded-[10px] border border-border bg-card pl-3.5 pr-2.5 text-sm font-semibold text-ink shadow-[0_1px_2px_rgba(16,24,19,0.05)] outline-none transition-colors hover:border-faint focus-visible:ring-2 focus-visible:ring-field-soft',
            block && 'w-full',
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
      </div>

      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={menuRef}
              role="listbox"
              initial={{ opacity: 0, y: pos.up ? 6 : -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: pos.up ? 6 : -6 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              style={{
                position: 'fixed',
                left: pos.left,
                minWidth: pos.width,
                maxWidth: window.innerWidth - pos.left - 8,
                zIndex: 60,
                ...(pos.up
                  ? { bottom: window.innerHeight - pos.anchorTop + 8 }
                  : { top: pos.anchorBottom + 8 }),
              }}
            >
              <motion.div
                variants={container}
                initial="hidden"
                animate="visible"
                className="overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-[0_12px_40px_rgba(16,30,20,0.18)]"
                style={{ maxHeight: pos.maxH }}
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
        </AnimatePresence>,
        document.body,
      )}
    </MotionConfig>
  )
}
