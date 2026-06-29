import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Hash,
  Landmark,
  MousePointerClick,
} from 'lucide-react'
import type { Cheque } from '@/features/cheques/api'
import { LiquidarChequeDialog } from '@/features/cheques/cheques-dialogs'
import { Panel } from '@/components/panel'
import { rootZoom } from '@/lib/zoom'
import { cn } from '@/lib/utils'

const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000)
    return `$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `$${Math.round(abs / 1_000)}k`
  return `$${abs}`
}

function estaVencido(fecha: string | null): boolean {
  if (!fecha) return false
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(y, m - 1, d).getTime() < new Date().setHours(0, 0, 0, 0)
}

/** Fecha con la que el cheque se ubica en el calendario: los ya cobrados/pagados
 *  por su fecha de cobro/pago (cuándo pasó); los pendientes por su vencimiento. */
function fechaEnCalendario(c: Cheque): string | null {
  if (c.estado === 'liquidado') return c.fechaCobroPago ?? c.fechaVencimiento
  return c.fechaVencimiento
}

function diasTexto(fecha: string | null): { texto: string; urgente: boolean } | null {
  if (!fecha) return null
  const [y, m, d] = fecha.split('-').map(Number)
  const dias = Math.round(
    (new Date(y, m - 1, d).getTime() - new Date().setHours(0, 0, 0, 0)) /
      86400000,
  )
  if (dias < 0)
    return { texto: `vencido hace ${-dias} d`, urgente: true }
  if (dias === 0) return { texto: 'vence hoy', urgente: true }
  if (dias === 1) return { texto: 'vence mañana', urgente: true }
  return { texto: `en ${dias} días`, urgente: dias <= 3 }
}

const ddmmaaaa = (f: string) => f.split('-').reverse().join('/')

// Coordenadas en espacio zoomeado (ver lib/zoom): `top`/`bottom` ya resueltos.
type CardPos = { left: number; up: boolean; top: number; bottom: number }

/** Calcula la posición de un popover anclado a `el`, corrigiendo el zoom de
 *  <html> (getBoundingClientRect/window.* vienen en px visuales → dividir por z).
 *  `ancho`/`alto` son estimaciones para decidir el flip y el clamp horizontal. */
function anclarPopover(el: HTMLElement, ancho: number, alto: number): CardPos {
  const z = rootZoom()
  const r = el.getBoundingClientRect()
  const left = r.left / z
  const top = r.top / z
  const bottom = r.bottom / z
  const vw = window.innerWidth / z
  const vh = window.innerHeight / z
  const clampedLeft = Math.min(Math.max(8, left), vw - ancho - 8)
  const espacioAbajo = vh - bottom
  const up = espacioAbajo < alto && top > espacioAbajo
  return {
    left: clampedLeft,
    up,
    top: bottom + 8,
    bottom: vh - top + 8,
  }
}

/** Tarjeta de detalle que aparece al pasar el mouse sobre un chip. Se posiciona
 *  contra la ventana (portal) para que no la recorte la grilla. */
function DetalleCard({
  c,
  pos,
  onEnter,
  onLeave,
}: {
  c: Cheque
  pos: CardPos
  onEnter: () => void
  onLeave: () => void
}) {
  const cobro = c.tipo === 'ingreso'
  const liquidado = c.estado === 'liquidado'
  const dias = liquidado ? null : diasTexto(c.fechaVencimiento)
  const titulo = c.contraparte ?? c.descripcion ?? (cobro ? 'Cobro' : 'Pago')
  return createPortal(
    <AnimatePresence>
      <motion.div
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        initial={{ opacity: 0, y: pos.up ? 6 : -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.13 }}
        style={{
          position: 'fixed',
          left: pos.left,
          width: 268,
          zIndex: 70,
          ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }),
        }}
        className="rounded-xl border border-border bg-card p-3.5 shadow-[0_14px_44px_rgba(16,30,20,0.2)]"
      >
        <div className="flex items-center gap-1.5">
          {/* Estado: si ya se saldó, solo "Pagado/Cobrado" (no "A pagar"). */}
          {liquidado ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-field-deep/12 px-1.5 py-0.5 text-[10.5px] font-bold uppercase text-field-deep">
              <CheckCircle2 className="size-3" />
              {cobro ? 'Cobrado' : 'Pagado'}
            </span>
          ) : (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase',
                cobro
                  ? 'bg-field-soft text-field-deep'
                  : 'bg-tierra-soft text-tierra',
              )}
            >
              {cobro ? (
                <ArrowDownLeft className="size-3" />
              ) : (
                <ArrowUpRight className="size-3" />
              )}
              {cobro ? 'A cobrar' : 'A pagar'}
            </span>
          )}
          {c.esEcheq && (
            <span className="rounded-md bg-sky/15 px-1.5 py-0.5 text-[10.5px] font-bold uppercase text-sky">
              echeq
            </span>
          )}
        </div>

        <div className="mt-2 truncate font-heading text-[15px] font-bold text-ink">
          {titulo}
        </div>
        <div
          className={cn(
            'tnum text-[22px] font-bold leading-tight',
            liquidado
              ? 'text-ink/55' // ya saldado → tono neutro, no alarma
              : cobro
                ? 'text-field-deep'
                : 'text-tierra',
          )}
        >
          {cobro ? '+' : '−'}${Math.round(c.monto).toLocaleString('es-AR')}
        </div>

        <div className="mt-2.5 grid gap-1.5 border-t border-border/60 pt-2.5 text-[12.5px]">
          {c.banco && (
            <div className="flex items-center gap-2">
              <Landmark className="size-3.5 text-faint" />
              <span className="text-muted-foreground">Banco</span>
              <span className="ml-auto font-semibold text-ink">{c.banco}</span>
            </div>
          )}
          {c.numero && (
            <div className="flex items-center gap-2">
              <Hash className="size-3.5 text-faint" />
              <span className="text-muted-foreground">N° de cheque</span>
              <span className="tnum ml-auto font-semibold text-ink">
                {c.numero}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <CalendarClock className="size-3.5 text-faint" />
            <span className="text-muted-foreground">Vence</span>
            <span className="ml-auto flex items-center gap-1.5 font-semibold text-ink">
              {c.fechaVencimiento ? (
                <>
                  <span className="tnum">{ddmmaaaa(c.fechaVencimiento)}</span>
                  {dias && (
                    <span
                      className={cn(
                        'rounded px-1 text-[10.5px] font-bold',
                        dias.urgente
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-secondary text-faint',
                      )}
                    >
                      {dias.texto}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-faint">sin fecha</span>
              )}
            </span>
          </div>
        </div>

        {liquidado ? (
          <div className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-field-soft py-1.5 text-[11.5px] font-semibold text-field-deep">
            <CheckCircle2 className="size-3.5" />
            {cobro ? 'Cobrado' : 'Pagado'}
            {c.fechaCobroPago && ` el ${ddmmaaaa(c.fechaCobroPago)}`}
          </div>
        ) : (
          <div className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-secondary py-1.5 text-[11.5px] font-semibold text-field-deep">
            <MousePointerClick className="size-3.5" />
            Clic para marcar {cobro ? 'cobrado' : 'pagado'}
          </div>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

/** Chip de un cheque dentro de una celda; muestra detalle al hover y liquida al clic. */
function ChequeChip({ c }: { c: Cheque }) {
  const cobro = c.tipo === 'ingreso'
  const liquidado = c.estado === 'liquidado'
  const vencido = !liquidado && estaVencido(c.fechaVencimiento)
  const Icono = liquidado ? Check : cobro ? ArrowDownLeft : ArrowUpRight
  const titulo = c.contraparte ?? c.descripcion ?? (cobro ? 'Cobro' : 'Pago')
  const [pos, setPos] = useState<CardPos | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | undefined>(undefined)

  const abrir = () => {
    window.clearTimeout(timer.current)
    if (!btnRef.current) return
    setPos(anclarPopover(btnRef.current, 268, 230))
  }
  const cerrarDif = () => {
    timer.current = window.setTimeout(() => setPos(null), 110)
  }

  // Saldado = gris "archivado" con check verde (se distingue de los pendientes:
  // verde = a cobrar, rojo = a pagar). Pendiente conserva su identidad.
  const tono = liquidado
    ? 'text-muted-foreground'
    : cobro
      ? 'text-field-deep'
      : 'text-tierra'
  const iconColor = liquidado ? 'text-field-deep' : tono

  const boton = (
    <button
      ref={btnRef}
      type="button"
      onMouseEnter={abrir}
      onMouseLeave={cerrarDif}
      className={cn(
        'flex w-full flex-col gap-px rounded-md border-l-[3px] px-1.5 py-[3px] text-left transition-[filter]',
        liquidado
          ? 'border-field-deep/40 bg-secondary hover:brightness-[0.98]'
          : cobro
            ? 'border-field-deep bg-field-soft hover:brightness-[0.97]'
            : 'border-tierra bg-tierra-soft hover:brightness-[0.97]',
        vencido && 'ring-1 ring-destructive/50',
      )}
    >
      <span className="flex items-center gap-1">
        <Icono className={cn('size-3 shrink-0', iconColor)} />
        <span
          className={cn('truncate text-[10.5px] font-bold leading-tight', tono)}
        >
          {titulo}
        </span>
        {c.esEcheq && (
          <span className="ml-auto shrink-0 rounded bg-sky/15 px-1 text-[8px] font-bold uppercase leading-tight text-sky">
            e
          </span>
        )}
      </span>
      <span className="flex items-baseline justify-between gap-1">
        <span className={cn('tnum text-[12px] font-bold leading-tight', tono)}>
          {cobro ? '+' : '−'}
          {fmtCompact(c.monto)}
        </span>
        {c.banco && (
          <span className="truncate text-[9px] font-medium leading-tight text-ink/50">
            {c.banco}
          </span>
        )}
      </span>
    </button>
  )

  return (
    <>
      {/* Pendiente: clic abre el diálogo de liquidar. Liquidado: solo informativo. */}
      {liquidado ? boton : <LiquidarChequeDialog cheque={c} trigger={boton} />}
      {pos && (
        <DetalleCard
          c={c}
          pos={pos}
          onEnter={() => window.clearTimeout(timer.current)}
          onLeave={() => setPos(null)}
        />
      )}
    </>
  )
}

/** Popover con TODOS los movimientos de un día (scrollable, con sus acciones).
 *  z por debajo del diálogo de liquidar (z-50) y del hover de detalle (z-70). */
function DiaPopover({
  fecha,
  items,
  pos,
  onClose,
}: {
  fecha: Date
  items: Cheque[]
  pos: CardPos
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const titulo = fecha.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return createPortal(
    <>
      {/* Backdrop para cerrar al tocar afuera */}
      <div className="fixed inset-0" style={{ zIndex: 40 }} onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: pos.up ? 6 : -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.13 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: pos.left,
          width: 300,
          zIndex: 41,
          ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }),
        }}
        className="flex max-h-[330px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_14px_44px_rgba(16,30,20,0.22)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
          <span className="font-heading text-[13.5px] font-bold text-ink first-letter:uppercase">
            {titulo}
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-faint">
            {items.length} mov.
          </span>
        </div>
        <div className="scroll-rounded flex flex-col gap-1 overflow-y-auto p-2">
          {items.map((c) => (
            <ChequeChip key={c.id} c={c} />
          ))}
        </div>
      </motion.div>
    </>,
    document.body,
  )
}

/** Contenido de una celda con día: el número y el "+N más" abren el detalle del
 *  día. En la celda se ven hasta 2 chips; el resto vive en el popover. */
function DiaContenido({
  fecha,
  dia,
  items,
  hoyCell,
  pasado,
}: {
  fecha: Date
  dia: number
  items: Cheque[]
  hoyCell: boolean
  pasado: boolean
}) {
  const [pos, setPos] = useState<CardPos | null>(null)

  const abrir = (el: HTMLElement | null) => {
    if (!el) return
    setPos(anclarPopover(el, 300, 330))
  }

  const tieneItems = items.length > 0
  const ocultos = items.length - 2

  const numClass = cn(
    'tnum flex items-center justify-center text-[14px] font-bold leading-none',
    hoyCell
      ? 'size-[26px] rounded-full bg-field-deep text-[13px] text-white shadow-[0_2px_6px_rgba(16,30,20,0.28)]'
      : pasado
        ? 'text-faint'
        : 'text-ink',
  )

  return (
    <div className="relative z-10">
      <div className="mb-1 flex flex-col items-center gap-0.5">
        {tieneItems ? (
          <button
            type="button"
            onClick={(e) => abrir(e.currentTarget)}
            title="Ver el día"
            className={cn(numClass, 'transition-transform hover:scale-110')}
          >
            {dia}
          </button>
        ) : (
          <span className={numClass}>{dia}</span>
        )}
        {hoyCell && (
          <span className="rounded-full bg-field-deep/12 px-1.5 py-[1px] text-[8px] font-bold uppercase leading-none tracking-[0.06em] text-field-deep">
            Hoy
          </span>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        {items.slice(0, 2).map((c) => (
          <ChequeChip key={c.id} c={c} />
        ))}
        {ocultos > 0 && (
          <button
            type="button"
            onClick={(e) => abrir(e.currentTarget)}
            className="mt-0.5 flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[10px] font-bold text-field-deep transition-colors hover:bg-field-soft/70"
          >
            <ChevronDown className="size-3" />+{ocultos} más
          </button>
        )}
      </div>

      {pos && (
        <DiaPopover
          fecha={fecha}
          items={items}
          pos={pos}
          onClose={() => setPos(null)}
        />
      )}
    </div>
  )
}

/** Calendario mensual de cheques pendientes por fecha de vencimiento. */
export function ChequesCalendario({ cheques }: { cheques: Cheque[] }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  const { semanas, sinFecha } = useMemo(() => {
    const porDia = new Map<number, Cheque[]>()
    const sin: Cheque[] = []
    for (const c of cheques) {
      const fecha = fechaEnCalendario(c)
      if (!fecha) {
        sin.push(c)
        continue
      }
      const [y, m, d] = fecha.split('-').map(Number)
      if (y === year && m - 1 === month) {
        const arr = porDia.get(d) ?? []
        arr.push(c)
        porDia.set(d, arr)
      }
    }
    const offset = (new Date(year, month, 1).getDay() + 6) % 7 // lunes = 0
    const diasEnMes = new Date(year, month + 1, 0).getDate()
    type Celda = { dia: number; items: Cheque[] } | null
    const celdas: Celda[] = []
    for (let i = 0; i < offset; i++) celdas.push(null)
    for (let d = 1; d <= diasEnMes; d++)
      celdas.push({ dia: d, items: porDia.get(d) ?? [] })
    while (celdas.length % 7 !== 0) celdas.push(null)
    const sem: Celda[][] = []
    for (let i = 0; i < celdas.length; i += 7) sem.push(celdas.slice(i, i + 7))
    return { semanas: sem, sinFecha: sin }
  }, [cheques, year, month])

  // "Hoy" en estado: se actualiza solo al cambiar de día (timer a medianoche).
  const [hoy, setHoy] = useState(() => new Date())
  useEffect(() => {
    const ahora = new Date()
    const proximaMedianoche = new Date(
      ahora.getFullYear(),
      ahora.getMonth(),
      ahora.getDate() + 1,
      0,
      0,
      1,
    )
    const t = window.setTimeout(
      () => setHoy(new Date()),
      proximaMedianoche.getTime() - ahora.getTime(),
    )
    return () => window.clearTimeout(t)
  }, [hoy])

  const esMesActual = hoy.getFullYear() === year && hoy.getMonth() === month
  const diaHoy = hoy.getDate()

  const mesLabel = cursor.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  })

  const hoy0 = new Date(
    hoy.getFullYear(),
    hoy.getMonth(),
    hoy.getDate(),
  ).getTime()
  const botonNav =
    'flex size-8 items-center justify-center rounded-lg border border-white/60 bg-white/50 text-muted-foreground backdrop-blur transition-colors hover:bg-white/80 hover:text-ink'

  return (
    <Panel className="relative overflow-hidden p-0 bg-gradient-to-br from-field-soft/70 via-card to-field-soft/15">
      {/* Blobs difuminados que dan profundidad al vidrio */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-12 size-56 rounded-full bg-field/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 right-0 size-64 rounded-full bg-field/15 blur-3xl"
      />

      <div className="relative z-10">
        {/* Navegación */}
        <div className="flex items-center justify-between gap-3 border-b border-white/50 px-5 py-3">
          <span className="font-heading text-[18px] font-bold text-ink">
            {mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Mes anterior"
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className={botonNav}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                setCursor(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
              }
              className="h-8 rounded-lg border border-white/60 bg-white/50 px-3 text-[13px] font-semibold text-ink backdrop-blur transition-colors hover:bg-white/80"
            >
              Hoy
            </button>
            <button
              type="button"
              aria-label="Mes siguiente"
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className={botonNav}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        {/* Encabezado de días */}
        <div className="grid grid-cols-7 border-b border-white/50">
          {DIAS.map((d, i) => (
            <div
              key={d}
              className={cn(
                'px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[0.05em]',
                i >= 5 ? 'text-faint/70' : 'text-muted-foreground',
              )}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grilla */}
        <div>
          {semanas.map((sem, i) => (
            <div key={i} className="grid grid-cols-7">
              {sem.map((cel, j) => {
                const hoyCell = !!cel && esMesActual && cel.dia === diaHoy
                const finde = j >= 5
                const pasado =
                  !!cel && new Date(year, month, cel.dia).getTime() < hoy0
                return (
                  <div
                    key={j}
                    className={cn(
                      'relative min-h-[92px] border-b border-r border-white/45 p-1.5 backdrop-blur-md transition-colors last:border-r-0',
                      !cel && 'bg-white/10',
                      cel &&
                        !hoyCell &&
                        (finde
                          ? 'bg-white/25 hover:bg-white/45'
                          : 'bg-white/45 hover:bg-white/65'),
                      hoyCell && 'bg-white/55',
                    )}
                  >
                    {/* Realce redondeado del día de hoy (más lindo que un borde) */}
                    {hoyCell && (
                      <div className="pointer-events-none absolute inset-1 rounded-xl bg-gradient-to-b from-field-soft/90 to-field-soft/35 shadow-[0_2px_12px_rgba(16,30,20,0.12)] ring-1 ring-field-deep/30" />
                    )}
                    {cel && (
                      <DiaContenido
                        fecha={new Date(year, month, cel.dia)}
                        dia={cel.dia}
                        items={cel.items}
                        hoyCell={hoyCell}
                        pasado={pasado}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Sin fecha de vencimiento */}
        {sinFecha.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/50 px-5 py-3">
            <span className="text-[12px] font-semibold text-faint">
              Sin fecha de vencimiento:
            </span>
            {sinFecha.map((c) => (
              <div key={c.id} className="w-44">
                <ChequeChip c={c} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
