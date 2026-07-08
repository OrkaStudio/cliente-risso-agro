import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Receipt,
  TrendingUp,
} from 'lucide-react'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useCampos } from '@/features/campos/hooks'
import { useMovimientos, usePendientes } from '@/features/analitica/hooks'
import {
  cuentasPendientes,
  fmtCompact,
  formatARS,
  gastosPorCategoria,
  ingresosPorCategoria,
  porActividad,
  porCampo,
  proyeccionFlujo,
  resultadoPorMes,
  resumen,
  type Modo,
} from '@/features/analitica/compute'
import { CargarDialog } from '@/features/analitica/cargar-dialog'
import { RentabilidadActividad } from '@/features/analitica/rentabilidad-actividad'
import { PosicionIva } from '@/features/analitica/posicion-iva'
import { SeriesRecurrentes } from '@/features/analitica/series-recurrentes'
import { Panel } from '@/components/panel'
import { PageHeader } from '@/components/page-header'
import { Dropdown } from '@/components/ui/dropdown'
import { cn } from '@/lib/utils'

const GSERIE = ['var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--g4)', 'var(--g5)']
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function mesCorto(yyyymm: string): string {
  const m = Number(yyyymm.slice(5, 7))
  return MESES[m - 1] ?? yyyymm
}

/** "Mar 2026" — para la proyección, que puede cruzar años. */
function mesLargo(yyyymm: string): string {
  const m = Number(yyyymm.slice(5, 7))
  return `${MESES[m - 1] ?? yyyymm} ${yyyymm.slice(0, 4)}`
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
  // El motor mantiene las dos bases; al productor le mostramos el resultado
  // del negocio (devengado) + el flujo de fondos proyectado. Sin toggle académico.
  const modo: Modo = 'devengado'
  // Permite llegar filtrado desde el "Resumen del campo" (/analitica?campo=:id).
  const [searchParams] = useSearchParams()
  const [campoF, setCampoF] = useState<string | null>(
    () => searchParams.get('campo'),
  )

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
  const actividades = useMemo(() => porActividad(data, modo), [data, modo])
  const flujo = useMemo(
    () => proyeccionFlujo(pendientesScope),
    [pendientesScope],
  )

  const maxMes = Math.max(1, ...porMes.map((m) => Math.abs(m.resultado)))

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <PageHeader
        title="Analítica"
        meta={
          <>
            Cargá la plata, decidí con la data ·{' '}
            {nombreCampo ?? 'Toda la empresa'}
          </>
        }
        action={
          <>
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
            <CargarDialog empresaId={empresaId} />
          </>
        }
      />

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

          {/* Rentabilidad por campo — comparación (tabla) */}
          <Panel
            title="Rentabilidad por campo"
            sub={campoF ? 'campo filtrado' : 'comparación entre campos'}
          >
            {campos.length === 0 ? (
              <Vacio>Sin movimientos cargados todavía.</Vacio>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left">
                      {['Campo', 'Ingresos', 'Gastos', 'Resultado'].map((h, i) => (
                        <th
                          key={h}
                          className={cn(
                            'px-4 py-3 text-xs font-semibold uppercase tracking-[0.05em] text-faint',
                            i > 0 && 'text-right',
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campos.map((c) => (
                      <tr
                        key={c.campoId}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-ink">
                          {c.nombre}
                        </td>
                        <td className="tnum px-4 py-3 text-right text-sm text-field-deep">
                          {formatARS(c.ingresos)}
                        </td>
                        <td className="tnum px-4 py-3 text-right text-sm text-tierra">
                          {formatARS(c.gastos)}
                        </td>
                        <td
                          className="tnum px-4 py-3 text-right text-sm font-bold"
                          style={{
                            color:
                              c.resultado < 0
                                ? 'var(--destructive)'
                                : 'var(--field-deep)',
                          }}
                        >
                          {formatARS(c.resultado)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Rentabilidad por actividad — qué actividad rinde */}
          <RentabilidadActividad actividades={actividades} />

          {/* Posición de IVA — débito − crédito del período (Resp. Inscripto) */}
          <PosicionIva movimientos={data} empresaId={empresaId} />

          {/* Proyección de flujo de fondos — lo que va a entrar/salir por mes */}
          <Panel
            title="Proyección de flujo de fondos"
            info="Cobros y pagos pendientes agrupados por mes de vencimiento, con el saldo proyectado acumulado. Las cuotas de las series recurrentes ya están incluidas."
          >
            {flujo.length === 0 ? (
              <Vacio>
                Sin cobros ni pagos pendientes con fecha de vencimiento.
              </Vacio>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left">
                      {['Mes', 'Por cobrar', 'Por pagar', 'Neto', 'Saldo acum.'].map(
                        (h, i) => (
                          <th
                            key={h}
                            className={cn(
                              'px-4 py-3 text-xs font-semibold uppercase tracking-[0.05em] text-faint',
                              i > 0 && 'text-right',
                            )}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {flujo.map((f) => (
                      <tr
                        key={f.mes}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-ink">
                          {mesLargo(f.mes)}
                        </td>
                        <td className="tnum px-4 py-3 text-right text-sm text-field-deep">
                          {f.entra ? formatARS(f.entra) : '—'}
                        </td>
                        <td className="tnum px-4 py-3 text-right text-sm text-tierra">
                          {f.sale ? formatARS(f.sale) : '—'}
                        </td>
                        <td
                          className="tnum px-4 py-3 text-right text-sm font-semibold"
                          style={{
                            color:
                              f.neto < 0
                                ? 'var(--destructive)'
                                : 'var(--field-deep)',
                          }}
                        >
                          {formatARS(f.neto)}
                        </td>
                        <td
                          className="tnum px-4 py-3 text-right text-sm font-bold"
                          style={{
                            color:
                              f.acumulado < 0
                                ? 'var(--destructive)'
                                : 'var(--ink)',
                          }}
                        >
                          {formatARS(f.acumulado)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

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

            <Panel title="Plata en camino" sub="resumen — detalle en la agenda">
              {pendientes.isLoading ? (
                <Vacio>Cargando…</Vacio>
              ) : pendientesScope.length === 0 ? (
                <Vacio>Sin cobros ni pagos pendientes.</Vacio>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
                        Por cobrar
                      </div>
                      <div className="tnum mt-1 text-[20px] font-bold leading-none text-field-deep">
                        {cuentas.porCobrar === 0 ? '—' : formatARS(cuentas.porCobrar)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
                        Por pagar
                      </div>
                      <div className="tnum mt-1 text-[20px] font-bold leading-none text-tierra">
                        {cuentas.porPagar === 0 ? '—' : formatARS(cuentas.porPagar)}
                      </div>
                    </div>
                  </div>
                <div className="flex flex-col">
                  {pendientesScope.slice(0, 3).map((v) => {
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
                  <Link
                    to="/agenda"
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-field-soft py-2.5 text-[13px] font-semibold text-field-deep transition-colors hover:bg-field-soft/70"
                  >
                    Ver agenda completa <ArrowRight className="size-4" />
                  </Link>
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

          {/* Recurrentes y cuotas (series activas) */}
          <SeriesRecurrentes movimientos={data} />

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
