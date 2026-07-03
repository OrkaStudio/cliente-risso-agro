import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowUpRight,
  Beef,
  ChevronLeft,
  Gauge,
  LandPlot,
  Layers,
  MapPin,
  TrendingUp,
} from 'lucide-react'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useCamposConPotreros } from '@/features/campos/hooks'
import type { CampoConPotreros } from '@/features/campos/api'
import { CampoFormDialog, PotreroFormDialog } from '@/features/campos/campos-dialogs'
import { CargaMasivaDialog } from '@/features/hacienda/carga-masiva-dialog'
import { Button } from '@/components/ui/button'
import { estadoCicloColor, estadoCicloLabel, tipoCampoLabel } from '@/features/campos/labels'
import { categoriaColor, categoriaLabel } from '@/features/hacienda/labels'
import { useMovimientos } from '@/features/analitica/hooks'
import { formatARS, porPotrero, resumen } from '@/features/analitica/compute'
import { usoDeEstado, type Uso } from '@/features/campos/use-campo-mapa'
import { PotreroCard } from '@/features/potrero/potrero-card'
import { Panel } from '@/components/panel'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/supabase/types'
import type { MovimientoConDetalle } from '@/features/analitica/api'

type Categoria = Database['public']['Enums']['categoria_animal']
type EstadoCiclo = Database['public']['Enums']['estado_ciclo_potrero']

const USO_LABEL: Record<Uso, string> = {
  ganadero: 'Ganadero',
  agricola: 'Agrícola',
  vacio: 'Sin uso',
}
const USO_COLOR: Record<Uso, string> = {
  ganadero: 'var(--field)',
  agricola: 'var(--sol)',
  vacio: '#94a39a',
}

function StatCell({
  label,
  icon: Icon,
  iconColor,
  value,
  unit,
}: {
  label: string
  icon: typeof Beef
  iconColor: string
  value: string
  unit?: string
}) {
  return (
    <div className="flex min-h-[88px] flex-1 flex-col justify-center px-[22px] py-[18px]">
      <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        <Icon className="size-4" style={{ color: iconColor }} />
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="tnum text-[26px] font-bold leading-none text-ink">
          {value}
        </span>
        {unit && <span className="text-base text-muted-foreground">{unit}</span>}
      </div>
    </div>
  )
}

/** Barra apilada + leyenda (composición del rodeo, uso del suelo). */
function Distribucion({
  items,
  total,
  unidad,
}: {
  items: { key: string; label: string; value: number; color: string }[]
  total: number
  unidad?: string
}) {
  return (
    <>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        {items.map((it) => (
          <span
            key={it.key}
            style={{ width: `${(it.value / total) * 100}%`, background: it.color }}
            title={`${it.label}: ${it.value}`}
          />
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2.5">
        {items.map((it) => (
          <div key={it.key} className="flex items-center gap-2.5 text-[13.5px]">
            <span
              className="size-3 shrink-0 rounded-[4px]"
              style={{ background: it.color }}
            />
            <span className="text-ink">{it.label}</span>
            <span className="ml-auto tnum font-semibold text-ink">
              {it.value}
              {unidad ? ` ${unidad}` : ''}
            </span>
            <span className="tnum w-11 text-right text-faint">
              {Math.round((it.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

function EmptyMini({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-[13px] text-muted-foreground">{children}</p>
  )
}

/* ===== Composición del rodeo (suma de animales por categoría) ===== */
function ComposicionRodeo({ campo }: { campo: CampoConPotreros }) {
  const acc = new Map<Categoria, number>()
  for (const p of campo.potreros)
    for (const c of p.porCategoria)
      acc.set(c.categoria, (acc.get(c.categoria) ?? 0) + c.cabezas)
  const items = [...acc.entries()]
    .map(([categoria, cabezas]) => ({
      key: categoria,
      label: categoriaLabel[categoria],
      value: cabezas,
      color: categoriaColor[categoria],
    }))
    .sort((a, b) => b.value - a.value)
  const total = items.reduce((s, c) => s + c.value, 0)

  return (
    <Panel
      title="Composición del rodeo"
      info="Suma de animales del campo agrupados por categoría, sumando todos sus potreros."
    >
      {total === 0 ? (
        <EmptyMini>Todavía no hay hacienda cargada en este campo.</EmptyMini>
      ) : (
        <>
          <div className="mb-4 flex items-baseline gap-1.5">
            <span className="tnum text-[30px] font-bold leading-none text-ink">
              {total}
            </span>
            <span className="text-[14px] font-semibold text-muted-foreground">
              cabezas
            </span>
          </div>
          <Distribucion items={items} total={total} />
        </>
      )}
    </Panel>
  )
}

/* ===== Uso del suelo (hectáreas por uso) + estados de ciclo ===== */
function UsoDelSuelo({ campo }: { campo: CampoConPotreros }) {
  const haPorUso: Record<Uso, number> = { ganadero: 0, agricola: 0, vacio: 0 }
  const conteoEstado = new Map<EstadoCiclo, number>()
  let sinSuperficie = 0
  for (const p of campo.potreros) {
    const u = usoDeEstado(p.estadoCiclo)
    if (p.hectareas != null && p.hectareas > 0) haPorUso[u] += p.hectareas
    else sinSuperficie++
    conteoEstado.set(p.estadoCiclo, (conteoEstado.get(p.estadoCiclo) ?? 0) + 1)
  }
  const items = (['ganadero', 'agricola', 'vacio'] as Uso[])
    .map((u) => ({
      key: u,
      label: USO_LABEL[u],
      value: Math.round(haPorUso[u]),
      color: USO_COLOR[u],
    }))
    .filter((it) => it.value > 0)
  const totalHa = items.reduce((s, c) => s + c.value, 0)
  const estados = [...conteoEstado.entries()].sort((a, b) => b[1] - a[1])

  return (
    <Panel
      title="Uso del suelo"
      info="Hectáreas del campo según el uso de cada potrero (derivado de su estado de ciclo). Abajo, el detalle por estado."
    >
      {totalHa === 0 ? (
        <EmptyMini>
          Los potreros todavía no tienen superficie cargada.
        </EmptyMini>
      ) : (
        <>
          <Distribucion items={items} total={totalHa} unidad="ha" />
          {sinSuperficie > 0 && (
            <p className="mt-3 text-[12.5px] text-faint">
              {sinSuperficie}{' '}
              {sinSuperficie === 1 ? 'potrero' : 'potreros'} sin superficie
              cargada.
            </p>
          )}
        </>
      )}

      {estados.length > 0 && (
        <div className="mt-5 border-t border-border/60 pt-4">
          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
            Estado de los potreros
          </div>
          <div className="flex flex-wrap gap-2">
            {estados.map(([estado, n]) => (
              <span
                key={estado}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
                style={{
                  color: estadoCicloColor[estado],
                  background: `color-mix(in srgb, ${estadoCicloColor[estado]} 14%, transparent)`,
                }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: estadoCicloColor[estado] }}
                />
                {estadoCicloLabel[estado]}
                <span className="tnum">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

/* ===== Rentabilidad del campo (snapshot → link a Analítica) ===== */
type EstadoFin = 'sin' | 'curso' | 'gana' | 'pierde'
function estadoFin(r: { ingresos: number; gastos: number; resultado: number }): EstadoFin {
  if (r.ingresos === 0 && r.gastos === 0) return 'sin'
  if (r.ingresos === 0 && r.gastos > 0) return 'curso' // invertido, ciclo abierto
  return r.resultado >= 0 ? 'gana' : 'pierde'
}
const FIN_COLOR: Record<EstadoFin, string> = {
  sin: 'var(--faint)',
  curso: 'var(--sol-deep)',
  gana: 'var(--field-deep)',
  pierde: 'var(--destructive)',
}
const FIN_LABEL: Record<EstadoFin, string> = {
  sin: 'Sin movimientos',
  curso: 'Invertido (ciclo abierto)',
  gana: 'Ganancia',
  pierde: 'Pérdida',
}

function RentabilidadCampo({
  campoId,
  movimientos,
  cargando,
  ha,
}: {
  campoId: string
  movimientos: MovimientoConDetalle[]
  cargando: boolean
  ha: number | null
}) {
  const delCampo = movimientos.filter((m) => m.campo_id === campoId)
  const r = resumen(delCampo, 'devengado')
  const estado = estadoFin(r)
  // Forraje/ciclo abierto: el número que importa es lo invertido (gastos).
  const valor = estado === 'curso' ? r.gastos : r.resultado
  const valorHa = ha != null && ha > 0 && estado !== 'sin' ? Math.round(valor / ha) : null

  const action = (
    <Link
      to={`/analitica?campo=${campoId}`}
      className="inline-flex items-center gap-1 text-[13px] font-semibold text-field-deep transition-colors hover:underline"
    >
      Ver en Analítica
      <ArrowUpRight className="size-4" />
    </Link>
  )

  return (
    <Panel title="Rentabilidad del campo" action={action}>
      {cargando ? (
        <p className="py-4 text-[13px] text-muted-foreground">Cargando…</p>
      ) : estado === 'sin' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 py-1">
          <p className="text-[13px] text-muted-foreground">
            Todavía no hay movimientos cargados en este campo. Cargá ingresos y
            gastos para ver si da ganancia.
          </p>
          <Link
            to={`/analitica?campo=${campoId}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-field-soft px-3.5 py-1.5 text-[13px] font-semibold text-field-deep transition-colors hover:bg-field-soft/70"
          >
            <TrendingUp className="size-4" />
            Cargar movimientos
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">
              {FIN_LABEL[estado]}
            </div>
            <div
              className="tnum mt-1.5 text-[34px] font-bold leading-none"
              style={{ color: FIN_COLOR[estado] }}
            >
              {formatARS(valor)}
            </div>
            {valorHa != null && (
              <div className="tnum mt-1.5 text-[13px] font-semibold text-muted-foreground">
                {formatARS(valorHa)}/ha
              </div>
            )}
          </div>
          <div className="flex gap-8">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
                Ingresos
              </div>
              <div className="tnum mt-1 text-[18px] font-bold text-field-deep">
                {formatARS(r.ingresos)}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
                Gastos
              </div>
              <div className="tnum mt-1 text-[18px] font-bold text-tierra">
                {formatARS(r.gastos)}
              </div>
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

/* ===== Rentabilidad por potrero (tabla) ===== */
function RentabilidadPorPotrero({
  campo,
  movimientos,
}: {
  campo: CampoConPotreros
  movimientos: MovimientoConDetalle[]
}) {
  const delCampo = movimientos.filter((m) => m.campo_id === campo.id)
  if (delCampo.length === 0) return null // sin plata cargada → no se muestra

  const fin = new Map(porPotrero(delCampo, 'devengado').map((p) => [p.potreroId, p]))
  const haDe = new Map(campo.potreros.map((p) => [p.id, p.hectareas]))
  // Todos los potreros del campo (con 0 si no tienen movimientos), por resultado.
  const filas = campo.potreros
    .map((p) => {
      const f = fin.get(p.id)
      return {
        id: p.id,
        nombre: p.nombre,
        ingresos: f?.ingresos ?? 0,
        gastos: f?.gastos ?? 0,
        resultado: f?.resultado ?? 0,
        ha: haDe.get(p.id) ?? null,
      }
    })
    .sort((a, b) => b.resultado - a.resultado)

  return (
    <Panel title="Rentabilidad por potrero" sub="resultado de cada potrero del campo">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left">
              {['Potrero', 'Ingresos', 'Gastos', 'Resultado', '$/ha'].map((h, i) => (
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
            {filas.map((f) => {
              const sin = f.ingresos === 0 && f.gastos === 0
              const resHa =
                f.ha != null && f.ha > 0 && !sin ? Math.round(f.resultado / f.ha) : null
              return (
                <tr
                  key={f.id}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="px-4 py-3 text-sm font-medium text-ink">
                    {f.nombre}
                  </td>
                  <td className="tnum px-4 py-3 text-right text-sm text-field-deep">
                    {f.ingresos ? formatARS(f.ingresos) : '—'}
                  </td>
                  <td className="tnum px-4 py-3 text-right text-sm text-tierra">
                    {f.gastos ? formatARS(f.gastos) : '—'}
                  </td>
                  <td
                    className="tnum px-4 py-3 text-right text-sm font-bold"
                    style={{
                      color: sin
                        ? 'var(--faint)'
                        : f.resultado < 0
                          ? 'var(--destructive)'
                          : 'var(--field-deep)',
                    }}
                  >
                    {sin ? '—' : formatARS(f.resultado)}
                  </td>
                  <td className="tnum px-4 py-3 text-right text-sm text-muted-foreground">
                    {resHa != null ? formatARS(resHa) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

export function CampoDetailPage() {
  const { id = '' } = useParams()
  const empresa = useEmpresa()
  const empresaId = empresa.data?.empresa_id ?? ''
  const campos = useCamposConPotreros()
  const movs = useMovimientos()
  const [cargaOpen, setCargaOpen] = useState(false)

  if (campos.isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando…</div>
  }
  if (campos.error) {
    return (
      <div className="text-sm text-destructive">
        Error al cargar: {(campos.error as Error).message}
      </div>
    )
  }
  const campo = campos.data?.find((c) => c.id === id)
  if (!campo) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Campo no encontrado.</p>
        <Link
          to="/campos"
          className="text-sm font-semibold text-field-deep hover:underline"
        >
          ← Volver a Campos
        </Link>
      </div>
    )
  }

  const ha = campo.totalHa > 0 ? campo.totalHa : campo.hectareas
  const carga =
    ha != null && ha > 0
      ? (campo.totalCabezas / ha).toFixed(1).replace('.', ',')
      : null

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div>
        <Link
          to="/campos"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          Campos
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <MapPin className="size-6 shrink-0 text-field" />
            <h1 className="font-heading text-[32px] font-bold tracking-[-0.03em] text-ink">
              {campo.nombre}
            </h1>
            <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[12px] font-semibold text-muted-foreground">
              {tipoCampoLabel[campo.tipo]}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CampoFormDialog
              empresaId={empresaId}
              campo={{
                id: campo.id,
                nombre: campo.nombre,
                tipo: campo.tipo,
                hectareas: campo.hectareas,
                empresa_id: empresaId,
                created_at: '',
                contorno: null,
              }}
              triggerLabel="Editar campo"
              triggerVariant="outline"
            />
            <PotreroFormDialog
              empresaId={empresaId}
              campoId={campo.id}
              triggerLabel="+ Nuevo potrero"
            />
            {campo.potreros.length > 0 && (
              <>
                <Button onClick={() => setCargaOpen(true)} className="gap-1.5">
                  <Layers className="size-4" />
                  Cargar lote
                </Button>
                <CargaMasivaDialog
                  open={cargaOpen}
                  onOpenChange={setCargaOpen}
                  prefill={{ campoId: campo.id, campoNombre: campo.nombre }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="flex flex-wrap overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)] [&>*+*]:border-l [&>*+*]:border-border">
        <StatCell
          label="Potreros"
          icon={MapPin}
          iconColor="var(--field)"
          value={String(campo.potreros.length)}
        />
        <StatCell
          label="Hacienda"
          icon={Beef}
          iconColor="var(--tierra)"
          value={String(campo.totalCabezas)}
          unit="cab"
        />
        <StatCell
          label="Superficie"
          icon={LandPlot}
          iconColor="var(--sky)"
          value={ha != null && ha > 0 ? String(ha) : '—'}
          unit={ha != null && ha > 0 ? 'ha' : undefined}
        />
        <StatCell
          label="Carga"
          icon={Gauge}
          iconColor="var(--g3)"
          value={carga ?? '—'}
          unit={carga ? 'cab/ha' : undefined}
        />
      </div>

      {campo.potreros.length === 0 ? (
        <section className="rounded-[14px] border border-border bg-card p-10 text-center shadow-[0_1px_2px_rgba(16,24,19,0.05)]">
          <p className="text-sm text-muted-foreground">
            Este campo no tiene potreros todavía. Creá el primero con “+ Nuevo
            potrero”.
          </p>
        </section>
      ) : (
        <>
          {/* Rentabilidad del campo (snapshot → Analítica) */}
          <RentabilidadCampo
            campoId={campo.id}
            movimientos={movs.data ?? []}
            cargando={movs.isLoading}
            ha={ha}
          />

          {/* Composición del rodeo + uso del suelo */}
          <div className="grid gap-5 lg:grid-cols-2">
            <ComposicionRodeo campo={campo} />
            <UsoDelSuelo campo={campo} />
          </div>

          {/* Rentabilidad por potrero (solo si hay movimientos) */}
          <RentabilidadPorPotrero campo={campo} movimientos={movs.data ?? []} />

          {/* Potreros del campo */}
          <Panel
            title="Potreros"
            sub={`${campo.potreros.length} ${campo.potreros.length === 1 ? 'potrero' : 'potreros'} · tocá uno para entrar`}
          >
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
              {campo.potreros.map((p) => (
                <PotreroCard key={p.id} p={p} />
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
