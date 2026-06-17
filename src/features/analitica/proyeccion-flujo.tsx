import { useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import type { Pendiente } from '@/features/analitica/api'
import { formatARS, proyectarFlujo } from '@/features/analitica/compute'
import { Panel } from '@/components/panel'
import { cn } from '@/lib/utils'

const KEY = 'risso-flujo-saldo'

function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000)
    return `${sign}$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`
  return `${sign}$${abs}`
}

const ddmm = (f: string) => {
  const [, m, d] = f.split('-')
  return `${d}/${m}`
}

/**
 * Flujo de fondos proyectado: la pregunta "¿me va a alcanzar la plata?".
 * Desde el saldo de hoy, aplica los cobros/pagos pendientes por vencimiento y
 * dibuja cómo evoluciona la caja, avisando si en algún momento queda en rojo.
 */
export function ProyeccionFlujo({
  saldoSugerido,
  pendientes,
}: {
  saldoSugerido: number
  pendientes: Pendiente[]
}) {
  // Saldo de hoy: editable y persistido. Si no se tocó, usa el estimado vivo.
  const [saldoManual, setSaldoManual] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : window.localStorage.getItem(KEY),
  )
  const saldo =
    saldoManual !== null && saldoManual !== ''
      ? Number(saldoManual)
      : Math.round(saldoSugerido)

  const proy = useMemo(
    () => proyectarFlujo(saldo, pendientes),
    [saldo, pendientes],
  )

  function onSaldo(v: string) {
    const limpio = v.replace(/[^\d-]/g, '')
    setSaldoManual(limpio)
    window.localStorage.setItem(KEY, limpio)
  }
  function usarEstimado() {
    setSaldoManual(null)
    window.localStorage.removeItem(KEY)
  }

  const hayEventos = proy.eventos.length > 0

  return (
    <Panel className="relative overflow-hidden bg-gradient-to-br from-field-soft/50 via-card to-card p-0">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 size-56 rounded-full bg-field/15 blur-3xl"
      />
      <div className="relative z-10 p-6">
        {/* Encabezado + saldo editable */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-[18px] font-bold text-ink">
              Flujo de fondos
            </h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Cómo viene tu plata los próximos 90 días · toda la empresa
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card/70 px-3.5 py-2 backdrop-blur">
            <label
              htmlFor="flujo-saldo"
              className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
            >
              <Wallet className="size-3.5" />
              Plata disponible hoy
            </label>
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-heading text-sm font-bold text-faint">
                  $
                </span>
                <input
                  id="flujo-saldo"
                  type="text"
                  inputMode="numeric"
                  value={saldo ? saldo.toLocaleString('es-AR') : '0'}
                  onChange={(e) => onSaldo(e.target.value)}
                  className="tnum h-9 w-36 rounded-lg border border-border bg-card pl-6 pr-2 text-right text-[15px] font-bold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-field-soft"
                />
              </div>
            </div>
            {saldoManual !== null && saldoManual !== '' && (
              <button
                type="button"
                onClick={usarEstimado}
                className="mt-1 text-[10.5px] font-semibold text-field-deep hover:underline"
              >
                Usar estimado ({fmtCompact(Math.round(saldoSugerido))})
              </button>
            )}
          </div>
        </div>

        {/* Alerta de saldo negativo */}
        {proy.primerNegativo && (
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-destructive/30 bg-destructive/[0.06] px-4 py-3">
            <TriangleAlert className="size-5 shrink-0 text-destructive" />
            <span className="text-sm font-bold text-ink">
              El {ddmm(proy.primerNegativo.fecha)} tu caja queda en{' '}
              <span className="text-destructive">
                {formatARS(proy.primerNegativo.balance)}
              </span>
            </span>
            <span className="text-[13px] text-muted-foreground">
              — adelantá un cobro, descontá un cheque o pedí plazo en un pago.
            </span>
          </div>
        )}

        {/* Resumen del horizonte */}
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
          <Resumen
            label="A cobrar"
            value={proy.totalCobrar}
            color="var(--field-deep)"
            icon={ArrowDownLeft}
          />
          <Resumen
            label="A pagar"
            value={proy.totalPagar}
            color="var(--tierra)"
            icon={ArrowUpRight}
          />
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
              Saldo en 90 días
            </div>
            <div
              className={cn(
                'tnum mt-1 text-[18px] font-bold leading-none',
                proy.saldoFinal < 0 ? 'text-destructive' : 'text-ink',
              )}
            >
              {formatARS(proy.saldoFinal)}
            </div>
          </div>
        </div>

        {/* Gráfico */}
        {hayEventos ? (
          <FlujoChart proy={proy} />
        ) : (
          <p className="mt-6 rounded-xl border border-dashed border-border bg-card/50 py-8 text-center text-sm text-muted-foreground">
            No hay cobros ni pagos pendientes con fecha para proyectar.
          </p>
        )}

        {/* Ledger de eventos */}
        {hayEventos && (
          <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card/60">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-[0.05em] text-faint">
                  <th className="px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5">Concepto</th>
                  <th className="px-4 py-2.5 text-right">Movimiento</th>
                  <th className="px-4 py-2.5 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {proy.eventos.slice(0, 12).map((e) => {
                  const cobro = e.tipo === 'ingreso'
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="tnum px-4 py-2.5 text-[13px] font-semibold text-muted-foreground">
                        {ddmm(e.fecha)}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-ink">
                        {e.descripcion}
                      </td>
                      <td
                        className={cn(
                          'tnum px-4 py-2.5 text-right text-[13px] font-bold',
                          cobro ? 'text-field-deep' : 'text-tierra',
                        )}
                      >
                        {cobro ? '+' : '−'}
                        {fmtCompact(e.monto)}
                      </td>
                      <td
                        className={cn(
                          'tnum px-4 py-2.5 text-right text-[13px] font-bold',
                          e.balance < 0 ? 'text-destructive' : 'text-ink',
                        )}
                      >
                        {formatARS(e.balance)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {proy.sinFecha.length > 0 && (
          <p className="mt-3 text-[12px] text-faint">
            {proy.sinFecha.length} pendiente
            {proy.sinFecha.length === 1 ? '' : 's'} sin fecha de vencimiento — no
            entran en la proyección hasta que les pongas fecha.
          </p>
        )}
      </div>
    </Panel>
  )
}

function Resumen({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string
  value: number
  color: string
  icon: typeof ArrowDownLeft
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
        <Icon className="size-3.5" style={{ color }} />
        {label}
      </div>
      <div className="tnum mt-1 text-[18px] font-bold leading-none" style={{ color }}>
        {formatARS(value)}
      </div>
    </div>
  )
}

/** Gráfico de área del saldo proyectado, con banda roja bajo cero. */
function FlujoChart({ proy }: { proy: ReturnType<typeof proyectarFlujo> }) {
  const W = 100
  const H = 44
  const pts = proy.puntos
  const n = pts.length
  const valores = pts.map((p) => p.balance)
  const yMax = Math.max(0, ...valores)
  const yMin = Math.min(0, ...valores)
  const pad = (yMax - yMin) * 0.12 || 1
  const top = yMax + pad
  const bot = yMin - pad
  const xOf = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W)
  const yOf = (v: number) => ((top - v) / (top - bot)) * H
  const zeroY = yOf(0)

  const linePts = pts.map((p, i) => `${xOf(i)},${yOf(p.balance)}`).join(' ')
  const areaPath =
    `M ${xOf(0)},${zeroY} ` +
    pts.map((p, i) => `L ${xOf(i)},${yOf(p.balance)}`).join(' ') +
    ` L ${xOf(n - 1)},${zeroY} Z`

  const hayRojo = yMin < 0

  return (
    <div className="mt-5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-44 w-full"
      >
        {/* Banda de peligro bajo cero */}
        {hayRojo && (
          <rect
            x="0"
            y={zeroY}
            width={W}
            height={H - zeroY}
            fill="var(--destructive)"
            opacity="0.07"
          />
        )}
        {/* Área bajo la curva */}
        <path d={areaPath} fill="var(--field)" opacity="0.12" />
        {/* Línea cero */}
        <line
          x1="0"
          y1={zeroY}
          x2={W}
          y2={zeroY}
          stroke="var(--faint)"
          strokeWidth="0.4"
          strokeDasharray="1.5 1.5"
          vectorEffect="non-scaling-stroke"
        />
        {/* Curva del saldo */}
        <polyline
          points={linePts}
          fill="none"
          stroke="var(--field-deep)"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Puntos de evento */}
        {pts.map((p, i) =>
          i === 0 ? null : (
            <circle
              key={i}
              cx={xOf(i)}
              cy={yOf(p.balance)}
              r="1.4"
              fill={p.balance < 0 ? 'var(--destructive)' : 'var(--field-deep)'}
              vectorEffect="non-scaling-stroke"
            />
          ),
        )}
      </svg>
      <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-faint">
        <span>Hoy · {formatARS(proy.saldoInicial)}</span>
        <span
          className={cn(
            proy.minBalance < 0 ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          Mínimo: {formatARS(proy.minBalance)} ({ddmm(proy.fechaMin)})
        </span>
      </div>
    </div>
  )
}
