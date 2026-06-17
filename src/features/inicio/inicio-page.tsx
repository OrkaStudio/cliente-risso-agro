import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Beef,
  CalendarClock,
  LandPlot,
  MapPin,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import { categoriaColor } from '@/features/hacienda/labels'
import { tipoCampoLabel } from '@/features/campos/labels'
import { usePanoramaInicio } from '@/features/inicio/hooks'
import { useCheques } from '@/features/cheques/hooks'
import type { CategoriaConteo, PotreroPanorama } from '@/features/inicio/api'
import { PronosticoPanel } from '@/features/cotizaciones/pronostico-panel'
import { PotreroCard } from '@/features/potrero/potrero-card'
import { Panel } from '@/components/panel'
import { cn } from '@/lib/utils'

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

/* ===== Alerta de cheques que vencen pronto ===== */
function ChequesAlerta() {
  const { data } = useCheques()
  const hoy0 = new Date().setHours(0, 0, 0, 0)
  const urgentes = (data ?? []).filter((c) => {
    if (c.estado !== 'pendiente' || !c.fechaVencimiento) return false
    const [y, m, d] = c.fechaVencimiento.split('-').map(Number)
    const dias = Math.round((new Date(y, m - 1, d).getTime() - hoy0) / 86400000)
    return dias <= 7
  })
  if (urgentes.length === 0) return null

  const aPagar = urgentes
    .filter((c) => c.tipo === 'gasto')
    .reduce((s, c) => s + c.monto, 0)
  const aCobrar = urgentes
    .filter((c) => c.tipo === 'ingreso')
    .reduce((s, c) => s + c.monto, 0)
  const n = urgentes.length

  return (
    <Link
      to="/cheques"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[14px] border border-sol-deep/30 bg-sol-soft px-[22px] py-4 transition-colors hover:border-sol-deep/60"
    >
      <TriangleAlert className="size-5 shrink-0 text-sol-deep" />
      <span className="text-sm font-bold text-ink">
        {n} {n === 1 ? 'cheque vence' : 'cheques vencen'} en los próximos 7 días
      </span>
      <span className="flex items-center gap-3 text-[13px] font-semibold">
        {aPagar > 0 && (
          <span className="text-tierra">a pagar {fmtCompact(aPagar)}</span>
        )}
        {aCobrar > 0 && (
          <span className="text-field-deep">a cobrar {fmtCompact(aCobrar)}</span>
        )}
      </span>
      <span className="ml-auto text-[13px] font-semibold text-field-deep">
        Ver cheques →
      </span>
    </Link>
  )
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

/* ===== Stock por categoría — pictograma del rodeo ===== */
const categoriaPlural: Record<
  Database['public']['Enums']['categoria_animal'],
  string
> = {
  vaca: 'Vacas',
  vaquillona: 'Vaquillonas',
  novillo: 'Novillos',
  ternero: 'Terneros',
  ternera: 'Terneras',
  toro: 'Toros',
  capon: 'Capones',
}

/** Vaca (mdi:cow) — glifo relleno reutilizable. */
function CowGlyph({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <path
        fill="currentColor"
        d="M10.5 18a.5.5 0 0 1 .5.5a.5.5 0 0 1-.5.5a.5.5 0 0 1-.5-.5a.5.5 0 0 1 .5-.5m3 0a.5.5 0 0 1 .5.5a.5.5 0 0 1-.5.5a.5.5 0 0 1-.5-.5a.5.5 0 0 1 .5-.5M10 11a1 1 0 0 1 1 1a1 1 0 0 1-1 1a1 1 0 0 1-1-1a1 1 0 0 1 1-1m4 0a1 1 0 0 1 1 1a1 1 0 0 1-1 1a1 1 0 0 1-1-1a1 1 0 0 1 1-1m4 7c0 2.21-2.69 4-6 4s-6-1.79-6-4c0-.9.45-1.73 1.2-2.4c-.75-1-1.2-2.25-1.2-3.6l.12-1.22c-.54.15-1.19.15-1.72 0c-1.02-.28-2.56-1.43-2.33-2.23s2.14-.95 3.16-.65c.59.17 1.22.6 1.59 1.06l.57-.81C6.79 7.05 7 4 10 3l-.09.14c-.28.44-1 1.83-.24 3.33a6.02 6.02 0 0 1 4.66 0c.76-1.5.04-2.89-.24-3.33L14 3c3 1 3.21 4.05 2.61 5.15l.57.81c.37-.46 1-.89 1.59-1.06c1.02-.3 2.93-.15 3.16.65s-1.31 1.95-2.33 2.23c-.53.15-1.18.15-1.72 0L18 12c0 1.35-.45 2.6-1.2 3.6c.75.67 1.2 1.5 1.2 2.4m-6-2c-2.21 0-4 .9-4 2s1.79 2 4 2s4-.9 4-2s-1.79-2-4-2m0-2c1.12 0 2.17.21 3.07.56c.58-.69.93-1.56.93-2.56a4 4 0 0 0-4-4a4 4 0 0 0-4 4c0 1 .35 1.87.93 2.56c.9-.35 1.95-.56 3.07-.56m2.09-10.86"
      />
    </svg>
  )
}

function RodeoStock({ data, total }: { data: CategoriaConteo[]; total: number }) {
  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <CowGlyph className="size-8 text-faint" />
        <p className="text-sm text-muted-foreground">
          Todavía no hay animales activos cargados.
        </p>
      </div>
    )
  }

  // Pictograma: ~60 vaquitas repartidas por categoría según su proporción.
  const SLOTS = 60
  const herd = data.flatMap((c) =>
    Array.from(
      { length: Math.max(1, Math.round((c.cabezas / total) * SLOTS)) },
      () => categoriaColor[c.categoria],
    ),
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      <div className="flex items-end gap-3">
        <span className="tnum text-[42px] font-bold leading-none text-ink">
          {total}
        </span>
        <span className="pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
          cabezas
          <br />
          {data.length} categorías
        </span>
      </div>

      {/* Pictograma del rodeo */}
      <div className="flex flex-wrap gap-x-1.5 gap-y-1">
        {herd.map((color, i) => (
          <CowGlyph key={i} className="size-5" style={{ color }} />
        ))}
      </div>

      {/* Leyenda */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 border-t border-border/60 pt-4 sm:grid-cols-3">
        {data.map((c) => (
          <div key={c.categoria} className="flex items-center gap-2">
            <CowGlyph
              className="size-4 shrink-0"
              style={{ color: categoriaColor[c.categoria] }}
            />
            <span className="truncate text-[13px] text-ink">
              {categoriaPlural[c.categoria]}
            </span>
            <span className="tnum ml-auto shrink-0 text-[12.5px] font-bold text-ink">
              {c.cabezas}
              <span className="ml-1 text-[10.5px] font-semibold text-faint">
                {Math.round((c.cabezas / total) * 100)}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ===== Grupo de un campo con sus potreros ===== */
type CampoGrupo = {
  id: string
  nombre: string
  tipo: Database['public']['Enums']['tipo_campo']
  potreros: PotreroPanorama[]
  cabezas: number
  hectareas: number
}

function CampoGroup({ campo }: { campo: CampoGrupo }) {
  return (
    <div>
      <div className="mb-3.5 flex items-center justify-between gap-3 border-b border-border pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="size-[18px] shrink-0 text-field" />
          <h4 className="truncate font-heading text-[17px] font-semibold text-ink">
            {campo.nombre}
          </h4>
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {tipoCampoLabel[campo.tipo]}
          </span>
        </div>
        <div className="tnum shrink-0 text-[13px] font-medium text-faint">
          {campo.potreros.length}{' '}
          {campo.potreros.length === 1 ? 'potrero' : 'potreros'} · {campo.cabezas}{' '}
          cab{campo.hectareas > 0 ? ` · ${campo.hectareas} ha` : ''}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {campo.potreros.map((p) => (
          <PotreroCard key={p.id} p={p} />
        ))}
      </div>
    </div>
  )
}

/** Agrupa los potreros por campo (jerarquía real: un campo tiene varios
 *  potreros), ordena campos y potreros por hacienda descendente. */
function agruparPorCampo(potreros: PotreroPanorama[]): CampoGrupo[] {
  const porCampo = potreros.reduce((acc, p) => {
    const g = acc.get(p.campoId) ?? {
      id: p.campoId,
      nombre: p.campoNombre,
      tipo: p.campoTipo,
      potreros: [] as PotreroPanorama[],
      cabezas: 0,
      hectareas: 0,
    }
    return acc.set(p.campoId, {
      ...g,
      potreros: [...g.potreros, p],
      cabezas: g.cabezas + p.cabezas,
      hectareas: g.hectareas + (p.hectareas ?? 0),
    })
  }, new Map<string, CampoGrupo>())

  return [...porCampo.values()]
    .map((c) => ({
      ...c,
      potreros: [...c.potreros].sort((a, b) => b.cabezas - a.cabezas),
    }))
    .sort((a, b) => b.cabezas - a.cabezas)
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
  const camposAgrupados = agruparPorCampo(data.potreros)

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

      {/* Alerta de cheques que vencen pronto */}
      <ChequesAlerta />

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

      {/* Pronóstico 7 días del campo */}
      <PronosticoPanel />

      {/* Stock por categoría + vencimientos */}
      <div className="grid items-stretch gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Stock por categoría"
          info="Cómo se reparte tu rodeo por categoría de hacienda. Cada vaquita del pictograma representa una porción del total de cabezas."
          className="flex flex-col"
        >
          <RodeoStock data={data.porCategoria} total={data.totalCabezas} />
        </Panel>

        <Panel
          title="Próximos vencimientos"
          info="Cobros y pagos pendientes, ordenados por urgencia. En rojo, los que vencen en 3 días o menos."
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
            <div className="flex flex-1 flex-col">
              {proximos.map((v) => {
                const cobro = v.tipo === 'ingreso'
                const urgente =
                  v.diasParaVencer != null && v.diasParaVencer <= 3
                const dias =
                  v.diasParaVencer == null
                    ? '—'
                    : v.diasParaVencer <= 0
                      ? 'hoy'
                      : `en ${v.diasParaVencer} d`
                return (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0"
                  >
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        color: cobro ? 'var(--field-deep)' : 'var(--tierra)',
                        background: cobro
                          ? 'var(--field-soft)'
                          : 'var(--tierra-soft)',
                      }}
                    >
                      {cobro ? (
                        <ArrowDownLeft className="size-4" />
                      ) : (
                        <ArrowUpRight className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-ink">
                        {v.descripcion}
                      </div>
                      <span
                        className={cn(
                          'inline-block rounded-full px-1.5 text-[10.5px] font-bold',
                          urgente
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-secondary text-faint',
                        )}
                      >
                        {dias}
                      </span>
                    </div>
                    <span
                      className={cn(
                        'tnum shrink-0 text-sm font-bold',
                        cobro ? 'text-field-deep' : 'text-ink',
                      )}
                    >
                      {cobro ? '+' : '−'}
                      {v.monto != null ? fmtCompact(v.monto) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
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

      {/* Estado de los campos — agrupado por campo */}
      <Panel
        title="Estado de los campos"
        info="Tus potreros agrupados por campo, con su hacienda y estado de ciclo. Tocá uno para ver todo su detalle."
      >
        {camposAgrupados.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Todavía no hay potreros cargados.{' '}
            <Link to="/campos" className="font-semibold text-field-deep hover:underline">
              Crear el primero →
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-7">
            {camposAgrupados.map((campo) => (
              <CampoGroup key={campo.id} campo={campo} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
