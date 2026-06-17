import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Beef,
  ChevronLeft,
  LandPlot,
  Scale,
  Sprout,
  TrendingUp,
} from 'lucide-react'
import { categoriaColor, categoriaLabel } from '@/features/hacienda/labels'
import {
  estadoCicloColor,
  estadoCicloLabel,
  tipoCampoLabel,
} from '@/features/campos/labels'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { PotreroFormDialog } from '@/features/campos/campos-dialogs'
import { CargarMovimientoDialog } from '@/features/analitica/cargar-movimiento-dialog'
import { useMovimientos } from '@/features/analitica/hooks'
import {
  formatARS,
  gastosPorCategoria,
  ingresosPorCategoria,
  resumen,
} from '@/features/analitica/compute'
import { usePotreroDetalle } from '@/features/potrero/hooks'
import type { PotreroDetalle } from '@/features/potrero/api'
import { CultivoDialog } from '@/features/potrero/cultivo-dialog'
import { Panel } from '@/components/panel'
import { cn } from '@/lib/utils'

/** "12/10/26" a partir de YYYY-MM-DD. */
function fmtFecha(f: string | null): string | null {
  if (!f) return null
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000)
    return `${sign}$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`
  return `${sign}$${abs}`
}

function edad(fechaNacimiento: string | null): string {
  if (!fechaNacimiento) return '—'
  const meses = Math.floor(
    (Date.now() - new Date(fechaNacimiento).getTime()) /
      (1000 * 60 * 60 * 24 * 30.44),
  )
  if (meses < 1) return '< 1 mes'
  if (meses < 24) return `${meses} m`
  return `${Math.floor(meses / 12)} a`
}

/* ===== KPI ===== */
function Kpi({
  label,
  icon: Icon,
  iconColor,
  value,
  unit,
  detail,
}: {
  label: string
  icon: typeof Beef
  iconColor: string
  value: string
  unit?: string
  detail?: string
}) {
  const vacio = value === '—'
  return (
    <div className="flex min-h-[92px] flex-1 flex-col justify-center px-[22px] py-[18px]">
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
        <div className="mt-[7px] text-xs font-medium text-muted-foreground">
          {detail}
        </div>
      )}
    </div>
  )
}

/* ===== Detalle financiero del potrero ===== */
function PlataStat({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
        {label}
      </div>
      <div className="tnum mt-1 text-[18px] font-bold leading-none" style={{ color }}>
        {value}
      </div>
    </div>
  )
}

function CatLista({
  titulo,
  items,
}: {
  titulo: string
  items: { nombre: string; monto: number }[]
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
        {titulo}
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] text-faint">—</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((c) => (
            <div
              key={c.nombre}
              className="flex items-center justify-between gap-3 text-[13px]"
            >
              <span className="truncate text-ink">{c.nombre}</span>
              <span className="tnum shrink-0 font-semibold text-ink">
                {formatARS(c.monto)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ===== Stock por categoría (stackbar + leyenda) ===== */
function StockCategoria({ d }: { d: PotreroDetalle }) {
  if (d.totalCabezas === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <Beef className="size-7 text-faint" />
        <p className="text-sm text-muted-foreground">
          Este potrero no tiene hacienda activa.
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        {d.porCategoria.map((c) => (
          <span
            key={c.categoria}
            style={{
              width: `${(c.cabezas / d.totalCabezas) * 100}%`,
              background: categoriaColor[c.categoria],
            }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-[13.5px] sm:grid-cols-3">
        {d.porCategoria.map((c) => (
          <div key={c.categoria} className="flex items-center gap-2.5">
            <span
              className="size-[11px] shrink-0 rounded-[3px]"
              style={{ background: categoriaColor[c.categoria] }}
            />
            <span className="text-ink">{categoriaLabel[c.categoria]}</span>
            <span className="tnum ml-auto text-[12.5px] font-bold text-ink">
              {c.cabezas}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ===== Campaña agrícola (cultivo + fechas, carga manual) ===== */
function CampoStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-ink">{children}</div>
    </div>
  )
}

function CampanaAgricola({ d }: { d: PotreroDetalle }) {
  const tiene = Boolean(
    d.cultivo || d.fechaSiembra || d.fechaCosechaEstimada || d.variedad,
  )
  return (
    <Panel
      title="Campaña agrícola"
      action={
        <CultivoDialog potrero={d} triggerLabel={tiene ? 'Editar' : '+ Cargar'} />
      }
    >
      {tiene ? (
        <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
          <CampoStat label="Cultivo">
            <span className="inline-flex items-center gap-2">
              <Sprout className="size-[18px] text-field" />
              {d.cultivo ?? '—'}
            </span>
          </CampoStat>
          {d.variedad && <CampoStat label="Variedad">{d.variedad}</CampoStat>}
          <CampoStat label="Siembra">
            <span className="tnum">{fmtFecha(d.fechaSiembra) ?? '—'}</span>
          </CampoStat>
          <CampoStat label="Cosecha estimada">
            <span className="tnum">{fmtFecha(d.fechaCosechaEstimada) ?? '—'}</span>
          </CampoStat>
        </div>
      ) : (
        <p className="py-1 text-sm text-muted-foreground">
          Sin campaña cargada. Cargá el cultivo, la variedad y las fechas de
          siembra y cosecha.
        </p>
      )}
    </Panel>
  )
}

export function PotreroDetailPage() {
  const { id = '' } = useParams()
  const empresa = useEmpresa()
  const empresaId = empresa.data?.empresa_id ?? ''
  const { data, isLoading, error } = usePotreroDetalle(id)
  const movs = useMovimientos()

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando…</div>
  }
  if (error) {
    return (
      <div className="text-sm text-destructive">
        Error al cargar el potrero: {(error as Error).message}
      </div>
    )
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Potrero no encontrado.</p>
        <Link to="/" className="text-sm font-semibold text-field-deep hover:underline">
          ← Volver al inicio
        </Link>
      </div>
    )
  }

  const densidad =
    data.hectareas && data.hectareas > 0
      ? (data.totalCabezas / data.hectareas).toFixed(1).replace('.', ',')
      : null

  // Finanzas del potrero (cycle-aware): si invirtió y aún no vendió, es
  // "invertido / campaña en curso", no pérdida.
  const delPotrero = (movs.data ?? []).filter((m) => m.potrero_id === id)
  const fin = resumen(delPotrero, 'devengado')
  const sinPlata = fin.ingresos === 0 && fin.gastos === 0
  const enCurso = fin.ingresos === 0 && fin.gastos > 0
  const valorPlata = enCurso ? fin.gastos : fin.resultado
  const margenHa =
    data.hectareas && data.hectareas > 0 && !sinPlata
      ? Math.round(valorPlata / data.hectareas)
      : null
  const gastosCat = gastosPorCategoria(delPotrero, 'devengado')
  const ingresosCat = ingresosPorCategoria(delPotrero, 'devengado')

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div>
        <Link
          to={`/campos/${data.campoId}`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          {data.campoNombre}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-[32px] font-bold tracking-[-0.03em] text-ink">
              {data.nombre}
            </h1>
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-heading text-[12px] font-bold"
              style={{
                color: estadoCicloColor[data.estadoCiclo],
                background: `color-mix(in srgb, ${estadoCicloColor[data.estadoCiclo]} 14%, transparent)`,
              }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ background: estadoCicloColor[data.estadoCiclo] }}
              />
              {estadoCicloLabel[data.estadoCiclo]}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <CargarMovimientoDialog
              empresaId={empresaId}
              campoInicial={data.campoId}
              potreroInicial={data.id}
              triggerLabel="+ Cargar a este potrero"
            />
            <PotreroFormDialog
              empresaId={empresaId}
              campoId={data.campoId}
              potrero={{
                id: data.id,
                nombre: data.nombre,
                estado_ciclo: data.estadoCiclo,
                hectareas: data.hectareas,
                campo_id: data.campoId,
                empresa_id: empresaId,
                establecimiento_id: null,
                created_at: '',
                cultivo: data.cultivo,
                variedad: data.variedad,
                fecha_siembra: data.fechaSiembra,
                fecha_cosecha_estimada: data.fechaCosechaEstimada,
              }}
              triggerLabel="Editar potrero"
              triggerVariant="outline"
            />
          </div>
        </div>
        <p className="mt-1 text-[14.5px] font-medium text-muted-foreground">
          Campo {data.campoNombre} · {tipoCampoLabel[data.campoTipo]}
        </p>
      </div>

      {/* KPIs */}
      <div className="flex flex-wrap overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)] [&>*+*]:border-l [&>*+*]:border-border">
        <Kpi
          label="Hacienda"
          icon={Beef}
          iconColor="var(--field)"
          value={String(data.totalCabezas)}
          detail={`${data.porCategoria.length} ${data.porCategoria.length === 1 ? 'categoría' : 'categorías'}`}
        />
        <Kpi
          label="Superficie"
          icon={LandPlot}
          iconColor="var(--sky)"
          value={data.hectareas == null ? '—' : String(data.hectareas)}
          unit={data.hectareas == null ? undefined : 'ha'}
          detail={data.hectareas == null ? 'sin superficie cargada' : undefined}
        />
        <Kpi
          label="Densidad"
          icon={Scale}
          iconColor="var(--tierra)"
          value={densidad ?? '—'}
          unit={densidad ? 'cab/ha' : undefined}
          detail={densidad ? undefined : 'necesita superficie'}
        />
        <Kpi
          label={enCurso ? 'Invertido' : 'Resultado'}
          icon={TrendingUp}
          iconColor="var(--sol-deep)"
          value={sinPlata ? '—' : fmtCompact(valorPlata)}
          detail={
            sinPlata
              ? 'sin movimientos'
              : enCurso
                ? 'campaña en curso, sin vender'
                : 'devengado · acumulado'
          }
        />
      </div>

      {/* Plata del potrero — detalle financiero */}
      <Panel
        title="Plata del potrero"
        sub={enCurso ? 'campaña en curso' : 'devengado · acumulado'}
      >
        {sinPlata ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Todavía no imputaste gastos ni ingresos a este potrero. Cargalos con
            “+ Cargar a este potrero” para ver acá cómo rinde.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              <PlataStat
                label="Ingresos"
                value={formatARS(fin.ingresos)}
                color="var(--field-deep)"
              />
              <PlataStat
                label="Gastos"
                value={formatARS(fin.gastos)}
                color="var(--tierra)"
              />
              <PlataStat
                label={enCurso ? 'Invertido' : 'Resultado'}
                value={formatARS(valorPlata)}
                color={
                  enCurso
                    ? 'var(--sol-deep)'
                    : fin.resultado < 0
                      ? 'var(--destructive)'
                      : 'var(--field-deep)'
                }
              />
              {margenHa != null && (
                <PlataStat
                  label="Margen / ha"
                  value={`${fmtCompact(margenHa)}/ha`}
                  color="var(--ink)"
                />
              )}
            </div>

            {enCurso && (
              <p className="rounded-lg border border-sol-deep/25 bg-sol-soft/50 px-3.5 py-2.5 text-[13px] text-ink">
                Este potrero está en plena campaña: acumula costos y todavía no
                vendió. <strong>No es pérdida, es inversión</strong> — el
                resultado se sabrá al cosechar/vender.
              </p>
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              <CatLista titulo="Ingresos por categoría" items={ingresosCat} />
              <CatLista titulo="Gastos por categoría" items={gastosCat} />
            </div>

            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
                Movimientos del potrero
              </div>
              <table className="w-full">
                <tbody>
                  {[...delPotrero]
                    .sort((a, b) => (a.fecha_devengo < b.fecha_devengo ? 1 : -1))
                    .slice(0, 10)
                    .map((m) => (
                      <tr
                        key={m.id}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="tnum py-2.5 pr-3 text-[12.5px] text-muted-foreground">
                          {fmtFecha(m.fecha_devengo)}
                        </td>
                        <td className="py-2.5 pr-3 text-[13px] text-ink">
                          {m.categoria?.nombre ?? '—'}
                        </td>
                        <td
                          className={cn(
                            'tnum py-2.5 text-right text-[13px] font-bold',
                            m.tipo === 'gasto'
                              ? 'text-tierra'
                              : 'text-field-deep',
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
          </div>
        )}
      </Panel>

      {/* Campaña agrícola */}
      <CampanaAgricola d={data} />

      {/* Stock + animales */}
      <Panel title="Stock por categoría" sub={`${data.totalCabezas} cabezas`}>
        <StockCategoria d={data} />
      </Panel>

      <Panel title="Hacienda del potrero" sub={`${data.totalCabezas} activos`}>
        {data.animales.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay animales activos en este potrero.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
                <th className="pb-2.5 pr-3 font-bold">Caravana</th>
                <th className="pb-2.5 pr-3 font-bold">Categoría</th>
                <th className="pb-2.5 text-right font-bold">Edad</th>
              </tr>
            </thead>
            <tbody>
              {data.animales.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="tnum py-2.5 pr-3 text-sm font-semibold text-ink">
                    {a.caravana}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="inline-flex items-center gap-2 text-sm text-ink">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: categoriaColor[a.categoria] }}
                      />
                      {categoriaLabel[a.categoria]}
                    </span>
                  </td>
                  <td className="tnum py-2.5 text-right text-sm text-muted-foreground">
                    {edad(a.fechaNacimiento)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
