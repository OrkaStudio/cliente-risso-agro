import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, CalendarClock, ChevronDown } from 'lucide-react'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useCamposConPotreros } from '@/features/campos/hooks'
import { useMovimientos, usePendientes } from '@/features/analitica/hooks'
import {
  fmtCompact,
  formatARS,
  gastosPorCategoria,
  porActividad,
  porCampo,
  proyeccionFlujo,
  rangoAnterior,
  rangoPeriodo,
  realizadosEnRango,
  resumen,
  serieMensualNeto,
  periodoLabel,
  type Periodo,
} from '@/features/analitica/compute'
import { CargarDialog } from '@/features/analitica/cargar-dialog'
import { RentabilidadActividad } from '@/features/analitica/rentabilidad-actividad'
import { PosicionIva } from '@/features/analitica/posicion-iva'
import {
  FooterDato,
  MetricCard,
  type PuntoSerie,
} from '@/features/analitica/metric-card'
import { Panel } from '@/components/panel'
import { PageHeader } from '@/components/page-header'
import { Dropdown } from '@/components/ui/dropdown'
import { cn } from '@/lib/utils'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** "Ago 26" — corto, con año (los rangos pueden cruzar años). */
function mesLabel(yyyymm: string): string {
  const m = Number(yyyymm.slice(5, 7))
  return `${MESES[m - 1] ?? yyyymm} ${yyyymm.slice(2, 4)}`
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
  const campos = useCamposConPotreros()
  // Permite llegar filtrado desde el "Resumen del campo" (/analitica?campo=:id).
  const [searchParams] = useSearchParams()
  const [campoF, setCampoF] = useState<string | null>(
    () => searchParams.get('campo'),
  )
  const [periodo, setPeriodo] = useState<Periodo>('12m')

  const nombreCampo =
    (campos.data ?? []).find((c) => c.id === campoF)?.nombre ?? null

  // Alcance: si hay un campo elegido, todo se acota a él.
  const data = useMemo(() => {
    const todos = movs.data ?? []
    return campoF ? todos.filter((m) => m.campo_id === campoF) : todos
  }, [movs.data, campoF])
  const pendientesScope = useMemo(() => {
    const todos = pendientes.data ?? []
    return campoF ? todos.filter((v) => v.campoId === campoF) : todos
  }, [pendientes.data, campoF])

  // ===== Regla madre: lo retrospectivo = SOLO realizado, dentro del período =====
  const rango = useMemo(() => rangoPeriodo(periodo), [periodo])
  const realizados = useMemo(
    () => realizadosEnRango(data, rango.desde, rango.hasta),
    [data, rango],
  )
  const res = useMemo(() => resumen(realizados, 'caja'), [realizados])

  // Tendencia vs período anterior equivalente (solo si el período la define).
  const tendencia = useMemo(() => {
    const prev = rangoAnterior(periodo)
    if (!prev) return null
    const resPrev = resumen(
      realizadosEnRango(data, prev.desde, prev.hasta),
      'caja',
    )
    if (resPrev.resultado === 0) return null
    return (
      ((res.resultado - resPrev.resultado) / Math.abs(resPrev.resultado)) * 100
    )
  }, [data, periodo, res.resultado])

  const serieResultado: PuntoSerie[] = useMemo(
    () =>
      serieMensualNeto(realizados, rango.desde, rango.hasta).map((p) => ({
        clave: p.mes,
        label: mesLabel(p.mes),
        valor: p.valor,
      })),
    [realizados, rango],
  )

  // ===== Lo que viene: proyección 12 meses (pendientes por vencimiento) =====
  const proyeccion = useMemo(() => {
    const flujo = proyeccionFlujo(pendientesScope)
    const hastaMes = (() => {
      const d = new Date()
      d.setMonth(d.getMonth() + 12)
      return d.toISOString().slice(0, 7)
    })()
    return flujo.filter((f) => f.mes <= hastaMes)
  }, [pendientesScope])

  const serieProyeccion: PuntoSerie[] = useMemo(
    () =>
      proyeccion.map((f) => ({
        clave: f.mes,
        label: mesLabel(f.mes),
        valor: f.acumulado,
      })),
    [proyeccion],
  )
  const peorMes = useMemo(
    () =>
      proyeccion.reduce<(typeof proyeccion)[number] | null>(
        (peor, f) => (peor == null || f.acumulado < peor.acumulado ? f : peor),
        null,
      ),
    [proyeccion],
  )
  const totalCobrar = proyeccion.reduce((s, f) => s + f.entra, 0)
  const totalPagar = proyeccion.reduce((s, f) => s + f.sale, 0)
  const saldoFinal = proyeccion.at(-1)?.acumulado ?? 0

  // ===== Rentabilidades (realizado) =====
  const lineasCampo = useMemo(() => porCampo(realizados, 'caja'), [realizados])
  const haPorCampo = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of campos.data ?? []) map.set(c.id, c.totalHa)
    return map
  }, [campos.data])
  const actividades = useMemo(
    () => porActividad(realizados, 'caja'),
    [realizados],
  )
  const categorias = useMemo(
    () => gastosPorCategoria(realizados, 'caja'),
    [realizados],
  )

  // Movimientos del detalle: lo más cercano a hoy primero (pasado o futuro).
  const hoy = rango.hasta
  const detalle = useMemo(() => {
    const dist = (f: string) =>
      Math.abs(new Date(f).getTime() - new Date(hoy).getTime())
    return [...data].sort(
      (a, b) => dist(a.fecha_devengo) - dist(b.fecha_devengo),
    )
  }, [data, hoy])

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <PageHeader
        title="Analítica"
        meta={
          <>
            Cargá la plata, decidí con la data ·{' '}
            {nombreCampo ?? 'Toda la empresa'} · {periodoLabel[periodo]}
          </>
        }
        action={
          <>
            <Dropdown
              ariaLabel="Período"
              value={periodo}
              onChange={(v) => setPeriodo(v as Periodo)}
              options={[
                { value: '12m', label: 'Últimos 12 meses' },
                { value: 'anio', label: 'Este año' },
                { value: 'todo', label: 'Desde el inicio' },
              ]}
            />
            <Dropdown
              ariaLabel="Filtrar por campo"
              value={campoF ?? 'empresa'}
              onChange={(v) => setCampoF(v === 'empresa' ? null : v)}
              options={[
                { value: 'empresa', label: 'Toda la empresa' },
                ...(campos.data ?? []).map((c) => ({
                  value: c.id,
                  label: c.nombre,
                })),
              ]}
            />
            <div data-guia="analitica-cargar">
              <CargarDialog empresaId={empresaId} />
            </div>
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
          {/* ===== Héroes: lo que pasó / lo que viene ===== */}
          <div className="grid gap-5 xl:grid-cols-2">
            <MetricCard
              titulo="Resultado"
              sub="lo que entró y salió de verdad"
              headline={fmtCompact(res.resultado)}
              tendencia={tendencia}
              tendenciaLabel="vs anterior"
              accent={res.resultado < 0 ? 'rose' : 'field'}
              serie={serieResultado}
              vista="barras"
              formatter={fmtCompact}
              vacio="Cuando liquides cobros o pagos, acá vas a ver tu resultado mes a mes."
              footer={
                <>
                  <FooterDato
                    label="Entró"
                    valor={formatARS(res.ingresos)}
                    color="var(--field-deep)"
                  />
                  <FooterDato
                    label="Salió"
                    valor={formatARS(res.gastos)}
                    color="var(--tierra)"
                  />
                </>
              }
            />

            <MetricCard
              guia="analitica-flujo"
              titulo="Plata proyectada"
              sub="comprometido · próximos 12 meses"
              headline={fmtCompact(saldoFinal)}
              accent={(peorMes?.acumulado ?? 0) < 0 ? 'rose' : 'sky'}
              serie={serieProyeccion}
              vista="curva"
              formatter={fmtCompact}
              vacio="Sin cobros ni pagos con fecha por delante. Los que cargues con vencimiento aparecen acá."
              footer={
                <>
                  <FooterDato
                    label="A cobrar"
                    valor={formatARS(totalCobrar)}
                    color="var(--field-deep)"
                  />
                  <FooterDato
                    label="A pagar"
                    valor={formatARS(totalPagar)}
                    color="var(--tierra)"
                  />
                  {peorMes && peorMes.acumulado < 0 && (
                    <span className="ml-auto flex items-center gap-1.5 text-[12px] font-semibold text-destructive">
                      <CalendarClock className="size-3.5" />
                      Mes más apretado: {mesLabel(peorMes.mes)} (
                      {fmtCompact(peorMes.acumulado)})
                    </span>
                  )}
                </>
              }
            />
          </div>

          {/* ===== Rentabilidades + IVA + categorías: un solo grid fluido —
               si una card no tiene qué mostrar (ej. IVA sin comprobantes)
               no deja un hueco, las demás se acomodan. ===== */}
          <div className="grid items-start gap-5 xl:grid-cols-2">
            <Panel
              title="Rentabilidad por campo"
              guia="analitica-rentabilidad"
              sub="resultado y $/ha del período"
            >
              {lineasCampo.length === 0 ? (
                <Vacio>Sin plata realizada en el período.</Vacio>
              ) : (
                <RentabilidadCampos lineas={lineasCampo} haPorCampo={haPorCampo} />
              )}
            </Panel>

            <RentabilidadActividad actividades={actividades} />

            <PosicionIva movimientos={data} empresaId={empresaId} />

            <Panel title="En qué se va la plata" sub="gastos del período por categoría">
              {categorias.length === 0 ? (
                <Vacio>Sin gastos realizados en el período.</Vacio>
              ) : (
                <CategoriaBreakdown items={categorias.slice(0, 6)} />
              )}
            </Panel>
          </div>

          {/* ===== Detalle: todos los movimientos (colapsado) ===== */}
          <details className="group rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)]">
            <summary className="flex cursor-pointer list-none items-center gap-2.5 px-6 py-4 [&::-webkit-details-marker]:hidden">
              <span className="h-[18px] w-[3px] rounded-full bg-field" aria-hidden />
              <span className="font-heading text-[17px] font-semibold text-ink">
                Todos los movimientos
              </span>
              <span className="text-[13px] text-faint">
                {data.length} cargado{data.length === 1 ? '' : 's'}
              </span>
              <span className="ml-auto flex items-center gap-3">
                <Link
                  to="/agenda"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-[13px] font-semibold text-field-deep hover:underline"
                >
                  Vencimientos y cuotas, en la Agenda
                  <ArrowRight className="size-3.5" />
                </Link>
                <ChevronDown className="size-4 text-faint transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <div className="border-t border-border/70 px-6 pb-5 pt-1">
              {detalle.length === 0 ? (
                <Vacio>Todavía no cargaste movimientos.</Vacio>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-left">
                        {['Fecha', 'Categoría', 'Campo', 'Estado', 'Monto'].map(
                          (h, i) => (
                            <th
                              key={h}
                              className={cn(
                                'px-4 py-3.5 text-xs font-semibold uppercase tracking-[0.05em] text-faint',
                                i === 4 && 'text-right',
                              )}
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.slice(0, 15).map((m) => {
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
            </div>
          </details>
        </>
      )}
    </div>
  )
}

/** Rentabilidad por campo: barra comparativa + $/ha, el idioma del productor. */
function RentabilidadCampos({
  lineas,
  haPorCampo,
}: {
  lineas: { campoId: string; nombre: string; ingresos: number; gastos: number; resultado: number }[]
  haPorCampo: Map<string, number>
}) {
  const maxAbs = Math.max(1, ...lineas.map((c) => Math.abs(c.resultado)))
  return (
    <div className="flex flex-col gap-4">
      {lineas.map((c) => {
        const ha = haPorCampo.get(c.campoId) ?? 0
        const porHa = ha > 0 ? c.resultado / ha : null
        const neg = c.resultado < 0
        return (
          <div key={c.campoId}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[14px] font-semibold text-ink">
                {c.nombre}
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                {porHa != null && (
                  <span
                    className="tnum text-[12px] font-semibold"
                    style={{
                      color: neg ? 'var(--destructive)' : 'var(--field-deep)',
                    }}
                  >
                    {fmtCompact(Math.round(porHa))}/ha
                  </span>
                )}
                <span
                  className="tnum text-[14px] font-bold"
                  style={{
                    color: neg ? 'var(--destructive)' : 'var(--field-deep)',
                  }}
                >
                  {formatARS(c.resultado)}
                </span>
              </span>
            </div>
            {/* Barra divergente: nace del centro, izquierda = pérdida */}
            <div className="relative h-2 overflow-hidden rounded-full bg-secondary">
              <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
              <span
                className="absolute inset-y-0 rounded-full"
                style={{
                  left: neg
                    ? `${50 - (Math.abs(c.resultado) / maxAbs) * 50}%`
                    : '50%',
                  width: `${(Math.abs(c.resultado) / maxAbs) * 50}%`,
                  background: neg ? 'var(--destructive)' : 'var(--field)',
                }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-faint">
              <span className="tnum">entró {fmtCompact(c.ingresos)}</span>
              <span className="tnum">salió {fmtCompact(c.gastos)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const GSERIE = ['var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--g4)', 'var(--g5)']

/** Ranking de categorías: barra de participación + monto + %. */
function CategoriaBreakdown({ items }: { items: { nombre: string; monto: number }[] }) {
  const total = items.reduce((s, c) => s + c.monto, 0) || 1
  const max = Math.max(...items.map((c) => c.monto), 1)
  return (
    <div className="flex flex-col gap-3.5">
      {items.map((c, i) => {
        const color = GSERIE[i % GSERIE.length]
        const pct = (c.monto / total) * 100
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
                <span className="tnum w-9 text-right text-[11px] text-faint">
                  {pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`}
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

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
  )
}
