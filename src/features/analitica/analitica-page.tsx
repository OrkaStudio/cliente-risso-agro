import { useMemo, useState, type ComponentType } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Beef,
  Building2,
  CircleDashed,
  Receipt,
  TrendingUp,
  Wheat,
} from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useCampos, useCamposConPotreros } from '@/features/campos/hooks'
import { useMovimientos, usePendientes } from '@/features/analitica/hooks'
import {
  actividadLabel,
  cuentasPendientes,
  formatARS,
  gastosPorCategoria,
  ingresosPorCategoria,
  porActividad,
  porCampo,
  porPotrero,
  resultadoPorMes,
  resumen,
  type Modo,
} from '@/features/analitica/compute'
import { CargarMovimientoDialog } from '@/features/analitica/cargar-movimiento-dialog'
import { RentabilidadPotreros } from '@/features/analitica/rentabilidad-potreros'
import { Panel } from '@/components/panel'
import { Dropdown } from '@/components/ui/dropdown'
import { cn } from '@/lib/utils'

const GSERIE = ['var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--g4)', 'var(--g5)']
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function mesCorto(yyyymm: string): string {
  const m = Number(yyyymm.slice(5, 7))
  return MESES[m - 1] ?? yyyymm
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`
  return `${sign}$${abs}`
}

type Actividad = Database['public']['Enums']['actividad_movimiento']
const actividadMeta: Record<
  Actividad | 'sin',
  { color: string; Icon: ComponentType<{ className?: string }> }
> = {
  cria: { color: 'var(--ganado)', Icon: Beef },
  invernada: { color: 'var(--g1)', Icon: TrendingUp },
  agricultura: { color: 'var(--sol-deep)', Icon: Wheat },
  estructura: { color: 'var(--tierra)', Icon: Building2 },
  sin: { color: 'var(--faint)', Icon: CircleDashed },
}

const estadoMov: Record<string, { label: string; cls: string }> = {
  liquidado: { label: 'Liquidado', cls: 'bg-field-soft text-field-deep' },
  pendiente: { label: 'Pendiente', cls: 'bg-sol-soft text-sol-deep' },
  anulado: { label: 'Anulado', cls: 'bg-secondary text-faint' },
}

export function AnaliticaPage() {
  const empresa = useEmpresa()
  const empresaId = empresa.data?.empresa_id ?? ''
  const movs = useMovimientos()
  const pendientes = usePendientes()
  const camposLista = useCampos()
  const camposConPotreros = useCamposConPotreros()
  // El motor mantiene las dos bases; al productor le mostramos el resultado
  // del negocio (devengado) + el flujo de fondos proyectado. Sin toggle académico.
  const modo: Modo = 'devengado'
  const [campoF, setCampoF] = useState<string | null>(null)

  const nombreCampo =
    (camposLista.data ?? []).find((c) => c.id === campoF)?.nombre ?? null

  // Alcance del apartado: si hay un campo elegido, todo se acota a sus
  // movimientos (y la "plata en camino" a sus pendientes).
  const data = useMemo(() => {
    const todos = movs.data ?? []
    return campoF ? todos.filter((m) => m.campo_id === campoF) : todos
  }, [movs.data, campoF])
  const pendientesScope = useMemo(() => {
    const todos = pendientes.data ?? []
    return campoF ? todos.filter((v) => v.campoId === campoF) : todos
  }, [pendientes.data, campoF])

  const res = useMemo(() => resumen(data, modo), [data, modo])
  const campos = useMemo(() => porCampo(data, modo), [data, modo])
  const categorias = useMemo(() => gastosPorCategoria(data, modo), [data, modo])
  const ingCategorias = useMemo(
    () => ingresosPorCategoria(data, modo),
    [data, modo],
  )
  const porMes = useMemo(() => resultadoPorMes(data, modo), [data, modo])
  const cuentas = useMemo(() => cuentasPendientes(data), [data])
  const potreros = useMemo(() => porPotrero(data, modo), [data, modo])
  const actividades = useMemo(() => porActividad(data, modo), [data, modo])

  const maxMes = Math.max(1, ...porMes.map((m) => Math.abs(m.resultado)))
  const maxAct = Math.max(1, ...actividades.map((a) => Math.abs(a.resultado)))

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[32px] font-bold tracking-[-0.03em] text-ink">
            Analítica
          </h1>
          <p className="mt-1 text-[14.5px] font-medium text-muted-foreground">
            Cargá la plata, decidí con la data ·{' '}
            {nombreCampo ?? 'Toda la empresa'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Dropdown
            ariaLabel="Filtrar por campo"
            value={campoF ?? 'empresa'}
            onChange={(v) => setCampoF(v === 'empresa' ? null : v)}
            options={[
              { value: 'empresa', label: 'Toda la empresa' },
              ...(camposLista.data ?? []).map((c) => ({
                value: c.id,
                label: c.nombre,
              })),
            ]}
          />
          <CargarMovimientoDialog empresaId={empresaId} />
        </div>
      </div>

      {movs.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : movs.error ? (
        <p className="text-sm text-destructive">
          Error al cargar: {(movs.error as Error).message}
        </p>
      ) : (
        <>
          {/* KPIs */}
          <div className="flex flex-wrap overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)] [&>*+*]:border-l [&>*+*]:border-border">
            <KpiCell label="Ingresos" icon={Banknote} color="var(--field)" value={formatARS(res.ingresos)} />
            <KpiCell label="Gastos" icon={Receipt} color="var(--tierra)" value={formatARS(res.gastos)} />
            <KpiCell
              label="Resultado"
              icon={TrendingUp}
              color="var(--sol-deep)"
              value={formatARS(res.resultado)}
              valueColor={res.resultado < 0 ? 'var(--destructive)' : 'var(--field-deep)'}
            />
            <KpiCell
              label="Por cobrar"
              icon={ArrowDownLeft}
              color="var(--field)"
              value={cuentas.porCobrar === 0 ? '—' : formatARS(cuentas.porCobrar)}
              sub="pendiente"
            />
            <KpiCell
              label="Por pagar"
              icon={ArrowUpRight}
              color="var(--tierra)"
              value={cuentas.porPagar === 0 ? '—' : formatARS(cuentas.porPagar)}
              sub="pendiente"
            />
          </div>

          {/* Rentabilidad por potrero — cards, una por potrero */}
          <RentabilidadPotreros
            campos={campos}
            potreros={potreros}
            camposConPotreros={camposConPotreros.data ?? []}
          />

          {/* Rentabilidad por actividad — qué actividad rinde */}
          {actividades.length > 0 && (
            <Panel
              title="Rentabilidad por actividad"
              sub="qué actividad rinde y cuál no"
            >
              <div className="flex flex-col gap-4">
                {actividades.map((a) => {
                  const meta = actividadMeta[a.actividad]
                  const neg = a.resultado < 0
                  const numColor = neg
                    ? 'var(--destructive)'
                    : 'var(--field-deep)'
                  return (
                    <div key={a.actividad} className="flex items-center gap-3.5">
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          color: meta.color,
                          background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                        }}
                      >
                        <meta.Icon className="size-[19px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-semibold text-ink">
                            {a.actividad === 'sin'
                              ? 'Sin asignar'
                              : actividadLabel[a.actividad]}
                          </span>
                          <span
                            className="tnum shrink-0 text-[15px] font-bold"
                            style={{ color: numColor }}
                          >
                            {fmtCompact(a.resultado)}
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(Math.abs(a.resultado) / maxAct) * 100}%`,
                              background: neg ? 'var(--destructive)' : meta.color,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Panel>
          )}

          {/* Resultado por mes + Plata en camino */}
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Panel
              title="Resultado por mes"
              sub="ingresos − gastos"
              className="flex flex-col"
            >
              {porMes.length === 0 ? (
                <Vacio>Sin movimientos para graficar.</Vacio>
              ) : (
                <div className="flex min-h-[11rem] flex-1 items-end gap-2.5 border-b border-border/60 pb-0">
                  {porMes.map((m, i) => {
                    const last = i === porMes.length - 1
                    const neg = m.resultado < 0
                    const fill = neg
                      ? 'linear-gradient(180deg, #e0584b, var(--destructive))'
                      : last
                        ? 'linear-gradient(180deg, var(--field), var(--field-deep))'
                        : 'linear-gradient(180deg, var(--g1), color-mix(in srgb, var(--g1) 75%, #000))'
                    return (
                      <div
                        key={m.mes}
                        className="group flex h-full flex-1 flex-col items-center justify-end gap-2"
                        title={`${mesCorto(m.mes)}: ${fmtCompact(m.resultado)}`}
                      >
                        <span
                          className={cn(
                            'tnum text-[10.5px] transition-opacity',
                            neg
                              ? 'text-destructive'
                              : last
                                ? 'font-bold text-field-deep'
                                : 'text-muted-foreground',
                          )}
                        >
                          {fmtCompact(m.resultado)}
                        </span>
                        <div
                          className="w-[62%] rounded-t-lg transition-all duration-200 group-hover:brightness-105"
                          style={{
                            height: `${(Math.abs(m.resultado) / maxMes) * 92 + 2}%`,
                            background: fill,
                            boxShadow: last
                              ? '0 0 0 2px color-mix(in srgb, var(--field-deep) 22%, transparent)'
                              : undefined,
                          }}
                        />
                        <span
                          className={cn(
                            'text-[10.5px] font-semibold',
                            last ? 'text-field-deep' : 'text-faint',
                          )}
                        >
                          {mesCorto(m.mes)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>

            <Panel title="Plata en camino" sub="cobros y pagos">
              {pendientes.isLoading ? (
                <Vacio>Cargando…</Vacio>
              ) : pendientesScope.length === 0 ? (
                <Vacio>Sin cobros ni pagos pendientes.</Vacio>
              ) : (
                <div className="flex flex-col">
                  {pendientesScope.slice(0, 6).map((v) => {
                    const cobro = v.tipo === 'ingreso'
                    const urgente = v.diasParaVencer != null && v.diasParaVencer <= 3
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
            </Panel>
          </div>

          {/* Ingresos + Gastos por categoría — una sola card, dos columnas */}
          <Panel title="Movimientos por categoría" sub="ingresos vs gastos">
            <div className="grid gap-x-10 gap-y-6 md:grid-cols-2 md:divide-x md:divide-border/60">
              <div className="md:pr-10">
                <div className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-field-deep">
                  <ArrowDownLeft className="size-4" />
                  Ingresos
                </div>
                {ingCategorias.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">Sin ingresos.</p>
                ) : (
                  <CategoriaBreakdown items={ingCategorias} />
                )}
              </div>
              <div>
                <div className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-tierra">
                  <ArrowUpRight className="size-4" />
                  Gastos
                </div>
                {categorias.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">Sin gastos.</p>
                ) : (
                  <CategoriaBreakdown items={categorias} />
                )}
              </div>
            </div>
          </Panel>

          {/* Movimientos recientes */}
          <Panel
            title="Movimientos"
            sub={data.length ? `${data.length} en total` : undefined}
          >
            {data.length === 0 ? (
              <Vacio>Todavía no cargaste movimientos.</Vacio>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left">
                      {['Fecha', 'Categoría', 'Campo', 'Estado', 'Monto'].map((h, i) => (
                        <th
                          key={h}
                          className={cn(
                            'px-4 py-3.5 text-xs font-semibold uppercase tracking-[0.05em] text-faint',
                            i === 4 && 'text-right',
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.slice(0, 12).map((m) => {
                      const est = estadoMov[m.estado] ?? {
                        label: m.estado,
                        cls: 'bg-secondary text-faint',
                      }
                      const gasto = m.tipo === 'gasto'
                      return (
                        <tr
                          key={m.id}
                          className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40"
                        >
                          <td className="tnum px-4 py-3 text-[13px] text-muted-foreground">
                            {m.fecha_devengo.split('-').reverse().join('/')}
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2 text-sm font-medium text-ink">
                              <span
                                className="size-1.5 shrink-0 rounded-full"
                                style={{
                                  background: gasto
                                    ? 'var(--tierra)'
                                    : 'var(--field-deep)',
                                }}
                              />
                              {m.categoria?.nombre ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {m.campo?.nombre ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-[11px] font-bold',
                                est.cls,
                              )}
                            >
                              {est.label}
                            </span>
                          </td>
                          <td
                            className={cn(
                              'tnum px-4 py-3 text-right text-sm font-bold',
                              gasto ? 'text-tierra' : 'text-field-deep',
                            )}
                          >
                            {gasto ? '−' : '+'}
                            {formatARS(Number(m.monto))}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}

/** Ranking de categorías: cada fila con su barra de participación + monto + %. */
function CategoriaBreakdown({ items }: { items: { nombre: string; monto: number }[] }) {
  const total = items.reduce((s, c) => s + c.monto, 0) || 1
  const max = Math.max(...items.map((c) => c.monto), 1)
  return (
    <div className="flex flex-col gap-3.5">
      {items.map((c, i) => {
        const color = GSERIE[i % GSERIE.length]
        const pct = Math.round((c.monto / total) * 100)
        return (
          <div key={c.nombre}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-[13.5px]">
                <span
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ background: color }}
                />
                <span className="truncate text-ink">{c.nombre}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="tnum text-[13px] font-bold text-ink">
                  {fmtCompact(c.monto)}
                </span>
                <span className="tnum w-8 text-right text-[11px] text-faint">
                  {pct}%
                </span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full"
                style={{ width: `${(c.monto / max) * 100}%`, background: color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function KpiCell({
  label,
  icon: Icon,
  color,
  value,
  valueColor,
  sub,
}: {
  label: string
  icon: typeof Banknote
  color: string
  value: string
  valueColor?: string
  sub?: string
}) {
  return (
    <div className="min-w-40 flex-1 px-[22px] py-[18px]">
      <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        <Icon className="size-4" style={{ color }} />
        {label}
      </div>
      <div
        className="tnum mt-2 text-[24px] font-bold leading-none"
        style={{ color: valueColor ?? 'var(--ink)' }}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-xs font-medium text-faint">{sub}</div>}
    </div>
  )
}

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
  )
}
