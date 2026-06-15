import { Link } from 'react-router-dom'
import {
  Beef,
  CalendarClock,
  LandPlot,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import { categoriaColor, categoriaLabel } from '@/features/hacienda/labels'
import { estadoCicloLabel } from '@/features/campos/labels'
import { usePanoramaInicio } from '@/features/inicio/hooks'
import type { CategoriaConteo, PotreroPanorama } from '@/features/inicio/api'
import { Panel } from '@/components/panel'
import { cn } from '@/lib/utils'

type EstadoCiclo = Database['public']['Enums']['estado_ciclo_potrero']

/* Estado del ciclo del potrero → color del badge (cartográfico apagado). */
const CICLO_COLOR: Record<EstadoCiclo, string> = {
  ganadero: 'var(--g1)',
  descanso: 'var(--g2)',
  preparacion: 'var(--tierra)',
  siembra: 'var(--lima)',
  cultivo: 'var(--g3)',
  cosecha: 'var(--sol)',
  rastrojo: 'var(--g5)',
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000)
    return `${sign}$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`
  return `${sign}$${abs}`
}

function fechaLarga(): string {
  const s = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/* ===== KPI ===== */
function Kpi({
  label,
  icon: Icon,
  iconColor,
  value,
  unit,
  detail,
  detailColor,
}: {
  label: string
  icon: typeof Beef
  iconColor: string
  value: string
  unit?: string
  detail?: string
  detailColor?: string
}) {
  const vacio = value === '—'
  return (
    <div className="flex min-h-[96px] flex-1 flex-col justify-center px-[22px] py-[18px]">
      <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        <Icon className="size-4" style={{ color: iconColor }} />
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span
          className={cn(
            'tnum text-[26px] font-bold leading-none',
            vacio ? 'text-faint' : 'text-ink',
          )}
        >
          {value}
        </span>
        {unit && <span className="text-base text-muted-foreground">{unit}</span>}
      </div>
      {detail && (
        <div
          className="mt-[7px] text-xs font-medium"
          style={{ color: detailColor ?? 'var(--muted-foreground)' }}
        >
          {detail}
        </div>
      )}
    </div>
  )
}

/* ===== Donut de stock por categoría ===== */
function DonutStock({
  data,
  total,
}: {
  data: CategoriaConteo[]
  total: number
}) {
  if (total === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
        <Beef className="size-7 text-faint" />
        <p className="text-sm text-muted-foreground">
          Todavía no hay animales activos cargados.
        </p>
      </div>
    )
  }
  // Segmentos con gap de 1 unidad (circunferencia ≈ 100). El offset de cada
  // segmento es el acumulado de los anteriores (sin mutar variables externas).
  const segs = data.map((c, i) => {
    const prev = data
      .slice(0, i)
      .reduce((s, x) => s + (x.cabezas / total) * 100, 0)
    const visible = Math.max((c.cabezas / total) * 100 - 1, 0.5)
    return {
      color: categoriaColor[c.categoria],
      dash: `${visible} ${100 - visible}`,
      offset: 25 - prev,
    }
  })
  return (
    <div className="flex flex-1 flex-wrap items-center justify-center gap-x-9 gap-y-5">
      <svg width="158" height="158" viewBox="0 0 42 42" className="shrink-0">
        <circle
          cx="21"
          cy="21"
          r="15.9"
          fill="none"
          stroke="var(--secondary)"
          strokeWidth="5.5"
        />
        {segs.map((s, i) => (
          <circle
            key={i}
            cx="21"
            cy="21"
            r="15.9"
            fill="none"
            stroke={s.color}
            strokeWidth="5.5"
            strokeDasharray={s.dash}
            strokeDashoffset={s.offset}
          />
        ))}
        <text
          x="21"
          y="20.2"
          textAnchor="middle"
          fontSize="8"
          fontWeight="700"
          fill="var(--ink)"
          fontFamily="JetBrains Mono"
          letterSpacing="-0.5"
        >
          {total}
        </text>
        <text
          x="21"
          y="26.5"
          textAnchor="middle"
          fontSize="2.6"
          fill="var(--faint)"
          fontFamily="Inter"
          fontWeight="600"
          letterSpacing="0.4"
        >
          CABEZAS
        </text>
      </svg>
      <div className="flex min-w-[168px] flex-col gap-2.5 text-[13.5px]">
        {data.map((c) => (
          <div key={c.categoria} className="flex items-center gap-2.5">
            <span
              className="size-[11px] shrink-0 rounded-[3px]"
              style={{ background: categoriaColor[c.categoria] }}
            />
            <span className="text-ink">{categoriaLabel[c.categoria]}</span>
            <span className="tnum ml-auto text-[12.5px] font-bold text-ink">
              {c.cabezas}
              <span className="ml-1.5 text-[10.5px] font-semibold text-faint">
                {Math.round((c.cabezas / total) * 100)}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ===== Card de potrero (estado de los campos) ===== */
function PotreroCard({ p }: { p: PotreroPanorama }) {
  const densidad =
    p.hectareas && p.hectareas > 0 ? p.cabezas / p.hectareas : null
  return (
    <div className="rounded-[11px] border border-border bg-secondary/60 p-4 transition-shadow hover:shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-heading text-base font-semibold text-ink">
            {p.nombre}
          </div>
          <div className="mt-0.5 truncate text-xs text-faint">
            {p.campoNombre}
          </div>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-heading text-[11px] font-bold"
          style={{
            color: CICLO_COLOR[p.estadoCiclo],
            background: 'color-mix(in srgb, ' + CICLO_COLOR[p.estadoCiclo] + ' 14%, transparent)',
          }}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ background: CICLO_COLOR[p.estadoCiclo] }}
          />
          {estadoCicloLabel[p.estadoCiclo]}
        </span>
      </div>
      <div className="mt-4 flex items-baseline gap-1">
        <span
          className={cn(
            'tnum text-[28px] font-bold leading-none',
            p.cabezas === 0 ? 'text-faint' : 'text-ink',
          )}
        >
          {p.cabezas}
        </span>
        <span className="text-xs text-muted-foreground">
          {p.cabezas === 0 ? 'sin hacienda' : 'cab'}
        </span>
      </div>
      <div className="mt-2 flex min-h-4 gap-3 text-xs font-medium text-muted-foreground">
        <span className="tnum">
          {p.hectareas != null ? `${p.hectareas} ha` : 's/ sup.'}
        </span>
        {densidad != null && (
          <span className="tnum">
            {densidad.toFixed(1).replace('.', ',')} cab/ha
          </span>
        )}
      </div>
    </div>
  )
}

export function InicioPage() {
  const { data, isLoading, error } = usePanoramaInicio()

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando…</div>
  }
  if (error) {
    return (
      <div className="text-sm text-destructive">
        Error al cargar el panorama: {(error as Error).message}
      </div>
    )
  }
  if (!data) return null

  const campos = new Set(data.potreros.map((p) => p.campoNombre)).size
  const superficie = data.potreros.reduce((s, p) => s + (p.hectareas ?? 0), 0)
  const proximos = data.vencimientos.slice(0, 5)
  // Lo relevante primero: potreros con más hacienda arriba, vacíos al final.
  const potrerosOrden = [...data.potreros].sort((a, b) => b.cabezas - a.cabezas)

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div>
        <h1 className="font-heading text-[32px] font-bold tracking-[-0.03em] text-ink">
          La empresa hoy
        </h1>
        <p className="mt-1 text-[14.5px] font-medium text-muted-foreground">
          {fechaLarga()} · {campos} {campos === 1 ? 'campo' : 'campos'} ·{' '}
          {data.potreros.length} potreros
        </p>
      </div>

      {/* KPIs — barra instrumental con celdas divididas por hairline */}
      <div className="flex flex-wrap overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)] [&>*+*]:border-l [&>*+*]:border-border">
        <Kpi
          label="Stock total"
          icon={Beef}
          iconColor="var(--field)"
          value={String(data.totalCabezas)}
          detail={`${data.porCategoria.length} categorías`}
        />
        <Kpi
          label="Resultado del año"
          icon={data.netoAnual >= 0 ? TrendingUp : Wallet}
          iconColor="var(--sol-deep)"
          value={data.netoAnual === 0 ? '—' : fmtCompact(data.netoAnual)}
          detail={data.netoAnual === 0 ? 'sin movimientos cargados' : 'flujo de caja · devengado'}
          detailColor={
            data.netoAnual > 0
              ? 'var(--field-deep)'
              : data.netoAnual < 0
                ? 'var(--destructive)'
                : undefined
          }
        />
        <Kpi
          label="Por pagar"
          icon={CalendarClock}
          iconColor="var(--tierra)"
          value={data.porPagarTotal === 0 ? '—' : fmtCompact(data.porPagarTotal)}
          detail={
            data.vencimientos.length === 0
              ? 'al día'
              : `${data.vencimientos.length} pendiente${data.vencimientos.length === 1 ? '' : 's'}`
          }
        />
        <Kpi
          label="Superficie"
          icon={LandPlot}
          iconColor="var(--sky)"
          value={superficie === 0 ? '—' : String(superficie)}
          unit={superficie === 0 ? undefined : 'ha'}
          detail={`${data.potreros.length} potreros`}
        />
      </div>

      {/* Stock por categoría + vencimientos */}
      <div className="grid items-stretch gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Stock por categoría"
          sub={`${data.totalCabezas} cabezas`}
          className="flex flex-col"
        >
          <DonutStock data={data.porCategoria} total={data.totalCabezas} />
        </Panel>

        <Panel
          title="Próximos vencimientos"
          sub="cobros y pagos"
          className="flex flex-col"
        >
          {proximos.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
              <CalendarClock className="size-7 text-faint" />
              <p className="text-sm text-muted-foreground">
                Sin vencimientos próximos.
              </p>
              <p className="text-xs text-faint">
                Los cobros y pagos pendientes aparecen acá.
              </p>
            </div>
          ) : (
            <table className="w-full">
              <tbody>
                {proximos.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="py-3 pr-3">
                      <div className="text-sm font-semibold text-ink">
                        {v.descripcion}
                      </div>
                      <div className="text-xs text-faint">
                        {v.tipo === 'ingreso' ? 'Cobro' : 'Pago'}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-right">
                      <span
                        className={cn(
                          'tnum text-xs font-bold',
                          v.diasParaVencer != null && v.diasParaVencer <= 3
                            ? 'text-destructive'
                            : 'text-muted-foreground',
                        )}
                      >
                        {v.diasParaVencer != null
                          ? v.diasParaVencer <= 0
                            ? 'hoy'
                            : `en ${v.diasParaVencer} d`
                          : '—'}
                      </span>
                    </td>
                    <td className="tnum py-3 text-right text-sm font-bold text-ink">
                      {v.monto != null ? fmtCompact(v.monto) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-4 border-t border-border/60 pt-3 text-[13px]">
            <Link
              to="/analitica"
              className="font-semibold text-field-deep hover:underline"
            >
              Ver Analítica →
            </Link>
          </div>
        </Panel>
      </div>

      {/* Estado de los campos */}
      <Panel title="Estado de los campos" sub="tocá un potrero para entrar">
        {data.potreros.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Todavía no hay potreros cargados.{' '}
            <Link to="/campos" className="font-semibold text-field-deep hover:underline">
              Crear el primero →
            </Link>
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            {potrerosOrden.map((p) => (
              <PotreroCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
