import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useVencimientos } from '@/features/agenda/hooks'
import type { Vencimiento } from '@/features/agenda/api'
import { cn } from '@/lib/utils'

const MS_DIA = 86400000
const hoy0 = () => new Date().setHours(0, 0, 0, 0)
const tsDe = (f: string) => {
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}
const diasDe = (f: string) => Math.round((tsDe(f) - hoy0()) / MS_DIA)
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

/** Cuántas alertas mostrar en el riel (el resto vive en la Agenda). */
const MAX = 12

function partesFecha(f: string) {
  const [y, m, d] = f.split('-').map(Number)
  const mes = new Date(y, m - 1, d)
    .toLocaleDateString('es-AR', { month: 'short' })
    .replace('.', '')
    .toUpperCase()
  return { dia: d, mes }
}

/** ¿La fecha cae en el mes calendario corriente? */
function esDelMes(f: string): boolean {
  const [y, m] = f.split('-').map(Number)
  const now = new Date()
  return y === now.getFullYear() && m - 1 === now.getMonth()
}

/** Urgencia de una fecha: countdown + color del chip (rojo = vencido/hoy). */
function prioridad(f: string) {
  const d = diasDe(f)
  const vencido = d < 0
  const urgente = vencido || d === 0
  let label: string
  if (vencido) label = 'Vencido'
  else if (d === 0) label = 'Vence hoy'
  else if (d === 1) label = 'Mañana'
  else label = `En ${d} días`
  return {
    urgente,
    label,
    pillCls: urgente ? 'bg-destructive/12 text-destructive' : 'bg-sol-soft text-sol-deep',
  }
}

/** Una alerta = un cobro/pago, como hoja de calendario (talón con el día). */
function Alerta({ v, i }: { v: Vencimiento; i: number }) {
  const cobro = v.tipo === 'ingreso'
  const { dia, mes } = partesFecha(v.fechaVencimiento as string)
  const p = prioridad(v.fechaVencimiento as string)
  const titulo = v.contraparte ?? v.descripcion ?? (cobro ? 'Cobro' : 'Pago')

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 8) * 0.05, duration: 0.35, ease: 'easeOut' }}
      // La fila se acomoda a la cantidad: pocas tarjetas crecen (hasta un tope),
      // muchas quedan a lo mínimo y el riel scrollea.
      className="min-w-[212px] max-w-[300px] flex-1 shrink-0 snap-start"
    >
      <Link
        to={`/agenda?mov=${v.id}`}
        className={cn(
          'group flex w-full overflow-hidden rounded-xl border bg-card shadow-[0_5px_16px_rgba(16,24,19,0.10)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(16,24,19,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field',
          p.urgente ? 'border-destructive/40 ring-1 ring-destructive/35' : 'border-border',
        )}
      >
        {/* Talón: el día, grande — el dato que no hay que olvidar */}
        <div
          className={cn(
            'flex w-[54px] shrink-0 flex-col items-center justify-center gap-0.5 text-white',
            cobro
              ? 'bg-gradient-to-b from-field to-field-deep'
              : 'bg-gradient-to-b from-tierra to-tierra-deep',
          )}
        >
          <span className="tnum text-[22px] font-extrabold leading-none">{dia}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-90">
            {mes}
          </span>
        </div>

        {/* Cuerpo */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2.5">
          <span
            className={cn(
              'flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.07em]',
              cobro ? 'text-field' : 'text-tierra',
            )}
          >
            {cobro ? (
              <ArrowDownLeft className="size-3" />
            ) : (
              <ArrowUpRight className="size-3" />
            )}
            {cobro ? 'Cobrás' : 'Pagás'}
          </span>
          <span
            className={cn(
              'tnum text-[17px] font-extrabold leading-tight tracking-tight',
              cobro ? 'text-field-deep' : 'text-tierra-deep',
            )}
          >
            {pesos(v.monto)}
          </span>
          <span className="truncate text-[12px] font-medium text-ink">{titulo}</span>
          <span
            className={cn(
              'inline-flex w-fit items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold',
              p.pillCls,
            )}
          >
            {p.label}
          </span>
        </div>
      </Link>
    </motion.div>
  )
}

function NavBtn({
  dir,
  disabled,
  onClick,
}: {
  dir: 'left' | 'right'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={dir === 'left' ? 'Anterior' : 'Siguiente'}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-faint hover:text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      {dir === 'left' ? (
        <ChevronLeft className="size-4" />
      ) : (
        <ChevronRight className="size-4" />
      )}
    </button>
  )
}

/**
 * Alertas de plata del Inicio: un riel de "hojas de calendario" con lo que hay
 * que atender YA — solo lo vencido sin saldar y lo del mes corriente (lo de más
 * adelante vive en la Agenda). El talón con el día grande hace visible *cuándo*
 * — para que no se junten pagos ni se olviden cobros. Verde = entra, tierra =
 * sale. Cada tarjeta abre su modal en la Agenda (`?mov=<id>`).
 */
export function CobrosPagosProximos() {
  const { data, isLoading } = useVencimientos()

  const { items, nVencidos } = useMemo(() => {
    const base = hoy0()
    const pend = (data ?? [])
      .filter(
        (v) =>
          v.estado === 'pendiente' &&
          v.fechaVencimiento &&
          (tsDe(v.fechaVencimiento) < base || esDelMes(v.fechaVencimiento)),
      )
      .sort((a, b) =>
        (a.fechaVencimiento as string).localeCompare(b.fechaVencimiento as string),
      )
    return {
      items: pend.slice(0, MAX),
      nVencidos: pend.filter((v) => tsDe(v.fechaVencimiento as string) < base).length,
    }
  }, [data])

  const railRef = useRef<HTMLDivElement>(null)
  const [canL, setCanL] = useState(false)
  const [canR, setCanR] = useState(false)

  useEffect(() => {
    const el = railRef.current
    if (!el) return
    const upd = () => {
      setCanL(el.scrollLeft > 4)
      setCanR(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
    }
    upd()
    el.addEventListener('scroll', upd, { passive: true })
    window.addEventListener('resize', upd)
    return () => {
      el.removeEventListener('scroll', upd)
      window.removeEventListener('resize', upd)
    }
  }, [items])

  const mover = (dir: number) => {
    const el = railRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  // Difuminado sólo del lado que tiene más contenido: la primera card nunca se
  // come el fade en reposo (el izquierdo aparece recién al scrollear).
  const fade = 26
  const maskImage = `linear-gradient(to right, ${canL ? 'transparent' : '#000'}, #000 ${fade}px, #000 calc(100% - ${fade}px), ${canR ? 'transparent' : '#000'})`
  const maskStyle: CSSProperties = { maskImage, WebkitMaskImage: maskImage }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 font-heading text-[17px] font-semibold text-ink">
          <span aria-hidden className="h-[18px] w-[3px] shrink-0 rounded-full bg-field" />
          Cobros y pagos que se vienen
          {nVencidos > 0 && (
            <span className="tnum rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive">
              {nVencidos} vencido{nVencidos === 1 ? '' : 's'}
            </span>
          )}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {(canL || canR) && (
            <div className="flex items-center gap-1.5">
              <NavBtn dir="left" disabled={!canL} onClick={() => mover(-1)} />
              <NavBtn dir="right" disabled={!canR} onClick={() => mover(1)} />
            </div>
          )}
          <Link
            to="/agenda"
            className="text-[13px] font-semibold text-field-deep hover:underline"
          >
            Ver en Agenda →
          </Link>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4">
          <CheckCircle2 className="size-6 shrink-0 text-field/70" />
          <div>
            <p className="text-sm font-medium text-ink">Estás al día.</p>
            <p className="text-xs text-faint">
              Nada vencido ni cobros/pagos pendientes este mes.
            </p>
          </div>
        </div>
      ) : (
        <div
          ref={railRef}
          style={maskStyle}
          className="flex snap-x gap-3 overflow-x-auto pb-3 pl-5 pr-4 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((v, i) => (
            <Alerta key={v.id} v={v} i={i} />
          ))}
        </div>
      )}
    </section>
  )
}
