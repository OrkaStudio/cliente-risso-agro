import { useMemo, useState } from 'react'
import {
  ArrowDownLeft,
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
  formatARS,
  gastosPorCategoria,
  ingresosPorCategoria,
  porCampo,
  resultadoPorMes,
  resumen,
  type Modo,
} from '@/features/analitica/compute'
import { CargarMovimientoDialog } from '@/features/analitica/cargar-movimiento-dialog'
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

export function AnaliticaPage() {
  const empresa = useEmpresa()
  const empresaId = empresa.data?.empresa_id ?? ''
  const movs = useMovimientos()
  const pendientes = usePendientes()
  const camposLista = useCampos()
  const [modo, setModo] = useState<Modo>('devengado')
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

  const maxCampo = Math.max(1, ...campos.map((c) => Math.abs(c.monto)))
  const maxMes = Math.max(1, ...porMes.map((m) => Math.abs(m.resultado)))

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
        <CargarMovimientoDialog empresaId={empresaId} />
      </div>

      {/* Toggle devengado/caja */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-10 rounded-[10px] border border-border bg-secondary p-0.5">
          {(['devengado', 'caja'] as Modo[]).map((m) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={cn(
                'rounded-[7px] px-4 text-[13.5px] font-semibold capitalize transition-colors',
                modo === m
                  ? 'bg-card text-ink shadow-[0_1px_3px_rgba(16,24,19,0.08)]'
                  : 'text-muted-foreground hover:text-ink',
              )}
            >
              {m}
            </button>
          ))}
        </div>
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
        <span className="text-xs text-faint">
          {modo === 'devengado'
            ? 'Devengado: la economía real, sin importar cuándo entró/salió la plata.'
            : 'Caja: solo lo que ya se cobró o pagó de verdad.'}
        </span>
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

          {/* Resultado por mes + Plata en camino */}
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Panel title="Resultado por mes" sub={modo === 'caja' ? 'caja' : 'devengado'}>
              {porMes.length === 0 ? (
                <Vacio>Sin movimientos para graficar.</Vacio>
              ) : (
                <div
                  className="flex h-40 items-end gap-2 px-1 pb-3 pt-1"
                  style={{
                    backgroundImage:
                      'linear-gradient(rgba(16,24,19,0.05) 1px, transparent 1px)',
                    backgroundSize: '100% 25%',
                  }}
                >
                  {porMes.map((m, i) => {
                    const last = i === porMes.length - 1
                    return (
                      <div
                        key={m.mes}
                        className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                      >
                        <span
                          className={cn(
                            'tnum text-[11px]',
                            last ? 'font-bold text-field-deep' : 'text-muted-foreground',
                          )}
                        >
                          {fmtCompact(m.resultado)}
                        </span>
                        <div
                          className="w-[55%] rounded-t-sm"
                          style={{
                            height: `${(Math.abs(m.resultado) / maxMes) * 100}%`,
                            background:
                              m.resultado < 0
                                ? 'var(--destructive)'
                                : last
                                  ? 'var(--field-deep)'
                                  : 'var(--g1)',
                          }}
                        />
                        <span className="text-[11px] font-semibold text-faint">
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
                <table className="w-full">
                  <tbody>
                    {pendientesScope.slice(0, 6).map((v) => (
                      <tr key={v.id} className="border-b border-border/60 last:border-0">
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
                        <td
                          className={cn(
                            'tnum py-3 text-right text-sm font-bold',
                            v.tipo === 'ingreso' ? 'text-field-deep' : 'text-ink',
                          )}
                        >
                          {v.tipo === 'ingreso' ? '+' : '−'}
                          {v.monto != null ? fmtCompact(v.monto) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>

          {/* Ingresos + Gastos por categoría */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Ingresos por categoría">
              {ingCategorias.length === 0 ? (
                <Vacio>Sin ingresos.</Vacio>
              ) : (
                <CategoriaBreakdown items={ingCategorias} />
              )}
            </Panel>
            <Panel title="Gastos por categoría">
              {categorias.length === 0 ? (
                <Vacio>Sin gastos.</Vacio>
              ) : (
                <CategoriaBreakdown items={categorias} />
              )}
            </Panel>
          </div>

          {/* Rentabilidad por campo */}
          <Panel title="Rentabilidad por campo" sub="ingresos − gastos">
            {campos.length === 0 ? (
              <Vacio>Sin datos.</Vacio>
            ) : (
              <div className="flex flex-col gap-3.5">
                {campos.map((c) => (
                  <div key={c.nombre} className="flex items-center gap-3.5 text-sm">
                    <span className="w-28 shrink-0 truncate font-semibold text-ink">
                      {c.nombre}
                    </span>
                    <div className="h-3.5 flex-1 overflow-hidden rounded bg-secondary">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${(Math.abs(c.monto) / maxCampo) * 100}%`,
                          background: c.monto < 0 ? 'var(--destructive)' : 'var(--g1)',
                        }}
                      />
                    </div>
                    <span
                      className={cn(
                        'tnum w-24 shrink-0 text-right text-[13px] font-bold',
                        c.monto < 0 ? 'text-destructive' : 'text-field-deep',
                      )}
                    >
                      {fmtCompact(c.monto)}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
                    {data.slice(0, 12).map((m) => (
                      <tr
                        key={m.id}
                        className="border-b border-border/60 last:border-0 hover:bg-secondary/50"
                      >
                        <td className="tnum px-4 py-3 text-sm text-muted-foreground">
                          {m.fecha_devengo}
                        </td>
                        <td className="px-4 py-3 text-sm text-ink">
                          {m.categoria?.nombre ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {m.campo?.nombre ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                            {m.estado}
                          </span>
                        </td>
                        <td
                          className={cn(
                            'tnum px-4 py-3 text-right text-sm font-bold',
                            m.tipo === 'gasto' ? 'text-destructive' : 'text-field-deep',
                          )}
                        >
                          {m.tipo === 'gasto' ? '−' : '+'}
                          {formatARS(Number(m.monto))}
                        </td>
                      </tr>
                    ))}
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

/** Barra apilada + leyenda de montos por categoría (ingresos o gastos). */
function CategoriaBreakdown({ items }: { items: { nombre: string; monto: number }[] }) {
  const total = items.reduce((s, c) => s + c.monto, 0) || 1
  return (
    <>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-md">
        {items.map((c, i) => (
          <span
            key={c.nombre}
            className="h-full rounded-sm"
            style={{
              width: `${(c.monto / total) * 100}%`,
              background: GSERIE[i % GSERIE.length],
            }}
            title={`${c.nombre}: ${formatARS(c.monto)}`}
          />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2.5 text-[13.5px] sm:grid-cols-2">
        {items.map((c, i) => (
          <div key={c.nombre} className="flex items-center gap-2.5">
            <span
              className="size-[11px] shrink-0 rounded-[3px]"
              style={{ background: GSERIE[i % GSERIE.length] }}
            />
            <span className="truncate text-ink">{c.nombre}</span>
            <span className="tnum ml-auto text-[12.5px] font-bold text-ink">
              {fmtCompact(c.monto)}
            </span>
          </div>
        ))}
      </div>
    </>
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
