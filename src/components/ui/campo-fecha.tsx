import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { rootZoom } from '@/lib/zoom'
import { cn } from '@/lib/utils'

/**
 * Campo de fecha en el tema del sistema. Reemplaza a los `<input type="date">`
 * nativos, que abren el calendario del navegador —azul de sistema, tipografía
 * de sistema— y rompen el lenguaje visual de la app. Mismo movimiento que hizo
 * `Dropdown` con los `<select>`.
 *
 * El menú va en un portal posicionado contra la ventana: no lo recorta ningún
 * contenedor con scroll y **sube si no hay espacio abajo**.
 *
 * Las fechas son días del calendario, no instantes: se formatean y se parsean
 * SIEMPRE en hora local. `toISOString()` devuelve UTC y de 21:00 en adelante
 * (Argentina es UTC−3) corre el día — ver la lección de la auditoría.
 */

const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SÁ', 'DO']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** Date → 'YYYY-MM-DD' en hora local. */
function ymd(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}
/** 'YYYY-MM-DD' → Date a medianoche local (`new Date(s)` la parsearía como UTC). */
function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
/** "19 de septiembre de 2026" — como lo diría una persona. */
function largo(s: string): string {
  const d = parseYmd(s)
  if (!d) return ''
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}
/** Lunes a domingo: la semana argentina no arranca en domingo. */
function diaSemanaLunes(d: Date): number {
  return (d.getDay() + 6) % 7
}

type Pos = { left: number; top: number; bottom: number; up: boolean; maxW: number }

export function CampoFecha({
  value,
  onChange,
  id,
  ariaLabel,
  min,
  max,
  className,
  block = true,
  conBorrar = false,
  disabled = false,
}: {
  /** 'YYYY-MM-DD' o '' si está vacío. */
  value: string
  onChange: (value: string) => void
  id?: string
  ariaLabel?: string
  min?: string
  max?: string
  className?: string
  block?: boolean
  /** Muestra "Borrar" — sólo donde la fecha es opcional. */
  conBorrar?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [pos, setPos] = React.useState<Pos | null>(null)
  const btnRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  const hoy = React.useMemo(() => ymd(new Date()), [])
  const elegida = parseYmd(value)
  // El mes que se muestra: el de la fecha elegida, o el de hoy si no hay.
  const [cursor, setCursor] = React.useState(() => {
    const d = elegida ?? new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  /** Al abrir, el calendario arranca en el mes de la fecha elegida (o el de hoy). */
  const alternar = () => {
    if (!open) {
      const d = parseYmd(value) ?? new Date()
      setCursor(new Date(d.getFullYear(), d.getMonth(), 1))
    }
    setOpen((o) => !o)
  }

  const place = React.useCallback(() => {
    const el = btnRef.current
    if (!el) return
    const z = rootZoom()
    const r = el.getBoundingClientRect()
    const vh = window.innerHeight / z
    const vw = window.innerWidth / z
    const aTop = r.top / z
    const aBottom = r.bottom / z
    const ALTO = 340 // alto estimado del calendario
    const below = vh - aBottom
    const up = below < ALTO && aTop > below
    setPos({
      left: r.left / z,
      top: aBottom + 8,
      bottom: vh - aTop + 8,
      up,
      maxW: vw - r.left / z - 8,
    })
  }, [])

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

  // Grilla del mes: se completa con los días del mes anterior/siguiente para
  // que las semanas queden enteras (se dibujan apagados).
  const celdas = React.useMemo(() => {
    const primero = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const arranque = diaSemanaLunes(primero)
    const out: { d: Date; delMes: boolean }[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - arranque + i)
      out.push({ d, delMes: d.getMonth() === cursor.getMonth() })
    }
    // Si la última semana es toda del mes siguiente, se recorta.
    return out.slice(0, out.slice(35).every((c) => !c.delMes) ? 35 : 42)
  }, [cursor])

  const fueraDeRango = (s: string) => (min && s < min) || (max && s > max)
  const mesCursor = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn('relative', block ? 'w-full' : 'inline-block')}>
        <button
          ref={btnRef}
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel ?? 'Elegir fecha'}
          onClick={alternar}
          className={cn(
            'flex h-11 items-center justify-between gap-2 rounded-[10px] border border-border bg-card px-3.5 text-left text-sm font-semibold text-ink shadow-[0_1px_2px_rgba(16,24,19,0.05)] outline-none transition-colors hover:border-faint focus-visible:ring-2 focus-visible:ring-field-soft disabled:opacity-60',
            block && 'w-full',
            open && 'border-primary ring-2 ring-field-soft',
            className,
          )}
        >
          <span className={cn(!value && 'font-medium text-faint')}>
            {value ? largo(value) : 'Elegir fecha'}
          </span>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
        </button>

        {createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={menuRef}
                role="dialog"
                aria-label="Calendario"
                initial={{ opacity: 0, y: pos.up ? 6 : -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: pos.up ? 4 : -4, scale: 0.98 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                style={{
                  position: 'fixed',
                  left: pos.left,
                  ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }),
                  maxWidth: pos.maxW,
                }}
                className="z-[90] w-[304px] rounded-[14px] border border-border bg-card p-3 shadow-[0_18px_44px_rgba(16,24,19,0.18)]"
              >
                {/* Mes + navegación */}
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => mesCursor(-1)}
                    aria-label="Mes anterior"
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="text-[13.5px] font-bold capitalize text-ink">
                    {MESES[cursor.getMonth()]} {cursor.getFullYear()}
                  </span>
                  <button
                    type="button"
                    onClick={() => mesCursor(1)}
                    aria-label="Mes siguiente"
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>

                <div className="mb-1 grid grid-cols-7 gap-0.5">
                  {DIAS.map((d) => (
                    <span
                      key={d}
                      className="py-1 text-center text-[10px] font-bold uppercase tracking-[0.06em] text-faint"
                    >
                      {d}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-0.5">
                  {celdas.map(({ d, delMes }) => {
                    const s = ymd(d)
                    const esHoy = s === hoy
                    const sel = s === value
                    const off = fueraDeRango(s)
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={!!off}
                        onClick={() => {
                          onChange(s)
                          setOpen(false)
                        }}
                        className={cn(
                          'tnum flex h-9 items-center justify-center rounded-lg text-[13px] font-semibold transition-colors',
                          sel
                            ? 'bg-primary text-white'
                            : esHoy
                              ? 'bg-field-soft text-field-deep ring-1 ring-field-deep/30'
                              : delMes
                                ? 'text-ink hover:bg-secondary'
                                : 'text-faint hover:bg-secondary',
                          off && 'pointer-events-none opacity-30',
                        )}
                      >
                        {d.getDate()}
                      </button>
                    )
                  })}
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                  {conBorrar ? (
                    <button
                      type="button"
                      onClick={() => {
                        onChange('')
                        setOpen(false)
                      }}
                      className="rounded-lg px-2 py-1 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-ink"
                    >
                      Borrar
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    disabled={!!fueraDeRango(hoy)}
                    onClick={() => {
                      onChange(hoy)
                      setOpen(false)
                    }}
                    className="rounded-lg px-2 py-1 text-[12.5px] font-bold text-field-deep transition-colors hover:bg-field-soft disabled:opacity-40"
                  >
                    Hoy
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
      </div>
    </MotionConfig>
  )
}
