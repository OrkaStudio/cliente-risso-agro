import { useMemo, useState, type ComponentType } from 'react'
import { toast } from 'sonner'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Eye,
  Landmark,
  Layers,
  Table2,
  Undo2,
} from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import { useCampos } from '@/features/campos/hooks'
import { useVencimientos, useRevertirLiquidacion } from '@/features/agenda/hooks'
import { medioLabel, type Vencimiento } from '@/features/agenda/api'
import { CalendarioVencimientos } from '@/features/agenda/calendario-vencimientos'
import { LiquidarDialog } from '@/features/agenda/liquidar-dialog'
import { Panel } from '@/components/panel'
import { PageHeader, Stat } from '@/components/page-header'
import { Dropdown } from '@/components/ui/dropdown'
import { cn } from '@/lib/utils'

type MedioPago = Database['public']['Enums']['medio_pago']
type Vista = 'calendario' | 'tabla' | 'cuotas'
type TipoF = 'todos' | 'cobrar' | 'pagar'
type MedioF = 'todos' | MedioPago | 'echeq'
type Horizonte = 'vencidos' | 'mes' | '30' | '60' | '90' | 'todo'

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

const MS_DIA = 86400000
const hoy0 = () => new Date().setHours(0, 0, 0, 0)
function parseFecha(f: string): number {
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

/** Fecha con la que el ítem cae en la agenda (cobro/pago si liquidado; venc. si no). */
function fechaAgenda(v: Vencimiento): string | null {
  if (v.estado === 'liquidado') return v.fechaCobroPago ?? v.fechaVencimiento
  return v.fechaVencimiento
}

function diasInfo(v: Vencimiento): { texto: string; urgente: boolean } {
  if (v.estado === 'liquidado')
    return { texto: v.tipo === 'ingreso' ? 'cobrado' : 'pagado', urgente: false }
  if (!v.fechaVencimiento) return { texto: 'sin fecha', urgente: false }
  const dias = Math.round((parseFecha(v.fechaVencimiento) - hoy0()) / MS_DIA)
  if (dias < 0) return { texto: `vencido hace ${-dias} d`, urgente: true }
  if (dias === 0) return { texto: 'vence hoy', urgente: true }
  return { texto: `en ${dias} d`, urgente: dias <= 3 }
}

const HORIZONTES: { id: Horizonte; label: string }[] = [
  { id: 'vencidos', label: 'Vencidos' },
  { id: 'mes', label: 'Este mes' },
  { id: '30', label: '30 d' },
  { id: '60', label: '60 d' },
  { id: '90', label: '90 d' },
  { id: 'todo', label: 'Todo' },
]

function dentroHorizonte(v: Vencimiento, h: Horizonte): boolean {
  if (h === 'todo') return true
  const f = fechaAgenda(v)
  if (!f) return false
  const t = parseFecha(f)
  const base = hoy0()
  if (h === 'vencidos') return v.estado === 'pendiente' && t < base
  if (h === 'mes') {
    const now = new Date()
    const d = new Date(t)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }
  const dias = Number(h)
  return t >= base && t <= base + dias * MS_DIA
}

function matchMedio(v: Vencimiento, m: MedioF): boolean {
  if (m === 'todos') return true
  if (m === 'echeq') return v.medio === 'cheque' && v.esEcheq
  if (m === 'cheque') return v.medio === 'cheque' && !v.esEcheq
  return v.medio === m
}

/** Pill de filtro con ícono y contador. */
function FilterPill({
  active,
  onClick,
  label,
  count,
  tono,
  icon: Icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
  tono: 'neutro' | 'cobro' | 'pago'
  icon?: ComponentType<{ className?: string }>
}) {
  const activo = {
    neutro: 'border-ink/25 bg-ink/[0.06] text-ink',
    cobro: 'border-field-deep bg-field-soft text-field-deep',
    pago: 'border-tierra bg-tierra-soft text-tierra',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-10 items-center gap-2 rounded-[11px] border px-3.5 text-[13.5px] font-semibold transition-colors',
        active
          ? activo[tono]
          : 'border-border bg-card text-muted-foreground hover:border-faint hover:text-ink',
      )}
    >
      {Icon && <Icon className="size-4" />}
      {label}
      {count != null && (
        <span
          className={cn(
            'tnum flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
            active ? 'bg-white/70 text-current' : 'bg-secondary text-faint',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

export function AgendaPage() {
  const venc = useVencimientos()
  const campos = useCampos()
  const revertir = useRevertirLiquidacion()

  const [vista, setVista] = useState<Vista>('calendario')
  const [tipoF, setTipoF] = useState<TipoF>('todos')
  const [medioF, setMedioF] = useState<MedioF>('todos')
  const [campoF, setCampoF] = useState<string>('todos')
  const [horizonte, setHorizonte] = useState<Horizonte>('mes')
  const [verLiquidados, setVerLiquidados] = useState(false)

  const data = useMemo(() => venc.data ?? [], [venc.data])

  // Filtros que aplican a TODAS las vistas (no el horizonte ni "ver liquidados").
  const base = useMemo(
    () =>
      data.filter((v) => {
        if (tipoF === 'cobrar' && v.tipo !== 'ingreso') return false
        if (tipoF === 'pagar' && v.tipo !== 'gasto') return false
        if (!matchMedio(v, medioF)) return false
        if (campoF !== 'todos' && v.campoId !== campoF) return false
        return true
      }),
    [data, tipoF, medioF, campoF],
  )

  // KPIs: pendientes del alcance (medio/campo), por cobrar / por pagar.
  const { porCobrar, porPagar, nCobrar, nPagar } = useMemo(() => {
    const pend = data.filter(
      (v) =>
        v.estado === 'pendiente' &&
        matchMedio(v, medioF) &&
        (campoF === 'todos' || v.campoId === campoF),
    )
    const cobrar = pend.filter((v) => v.tipo === 'ingreso')
    const pagar = pend.filter((v) => v.tipo === 'gasto')
    return {
      porCobrar: cobrar.reduce((s, v) => s + v.monto, 0),
      porPagar: pagar.reduce((s, v) => s + v.monto, 0),
      nCobrar: cobrar.length,
      nPagar: pagar.length,
    }
  }, [data, medioF, campoF])

  // Tabla: base + horizonte + (pendientes, salvo "ver liquidados").
  const lista = useMemo(
    () =>
      base
        .filter((v) => (verLiquidados ? true : v.estado === 'pendiente'))
        .filter((v) => dentroHorizonte(v, horizonte))
        .sort((a, b) => {
          const fa = fechaAgenda(a) ?? '9999'
          const fb = fechaAgenda(b) ?? '9999'
          return fa.localeCompare(fb)
        }),
    [base, horizonte, verLiquidados],
  )

  // Cuotas: solo lo que pertenece a una serie, agrupado por serie.
  const series = useMemo(() => {
    const map = new Map<string, Vencimiento[]>()
    for (const v of base) {
      if (!v.serieId) continue
      const arr = map.get(v.serieId) ?? []
      arr.push(v)
      map.set(v.serieId, arr)
    }
    return [...map.values()]
      .map((items) => {
        const ordenadas = [...items].sort((a, b) =>
          (a.fechaVencimiento ?? '').localeCompare(b.fechaVencimiento ?? ''),
        )
        const pagadas = ordenadas.filter((v) => v.estado === 'liquidado').length
        const proxima = ordenadas.find((v) => v.estado === 'pendiente') ?? null
        const restante = ordenadas
          .filter((v) => v.estado === 'pendiente')
          .reduce((s, v) => s + v.monto, 0)
        const nombre =
          (ordenadas[0].descripcion ?? ordenadas[0].contraparte ?? 'Serie')
            .replace(/\s*\(cuota.*$/i, '')
            .trim()
        return {
          nombre,
          total: ordenadas.length,
          pagadas,
          proxima,
          restante,
          tipo: ordenadas[0].tipo,
        }
      })
      .sort((a, b) => {
        const fa = a.proxima?.fechaVencimiento ?? '9999'
        const fb = b.proxima?.fechaVencimiento ?? '9999'
        return fa.localeCompare(fb)
      })
  }, [base])

  const calItems = base

  async function onRevertir(v: Vencimiento) {
    try {
      await revertir.mutateAsync(v.id)
      toast.success('Vuelto a pendiente')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    }
  }

  const medioOptions = [
    { value: 'todos', label: 'Todos los medios' },
    { value: 'efectivo', label: 'Efectivo' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'echeq', label: 'Echeq' },
    { value: 'mercadopago', label: 'MercadoPago' },
    { value: 'otro', label: 'Otro' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Agenda"
        meta={
          <>
            <Stat>{nCobrar + nPagar}</Stat> pendientes ·{' '}
            <Stat>{fmt(porCobrar)}</Stat> a cobrar ·{' '}
            <Stat>{fmt(porPagar)}</Stat> a pagar
          </>
        }
      />

      {/* KPIs */}
      <div className="flex flex-wrap overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)] [&>*+*]:border-l [&>*+*]:border-border">
        <div className="min-w-44 flex-1 px-[22px] py-[18px]">
          <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            <ArrowDownLeft className="size-4 text-field" />
            Por cobrar
          </div>
          <div className="tnum mt-2 text-[24px] font-bold leading-none text-field-deep">
            {porCobrar === 0 ? '—' : fmt(porCobrar)}
          </div>
          <div className="mt-1.5 text-xs font-medium text-faint">
            {nCobrar} pendiente{nCobrar === 1 ? '' : 's'}
          </div>
        </div>
        <div className="min-w-44 flex-1 px-[22px] py-[18px]">
          <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            <ArrowUpRight className="size-4 text-tierra" />
            Por pagar
          </div>
          <div className="tnum mt-2 text-[24px] font-bold leading-none text-ink">
            {porPagar === 0 ? '—' : fmt(porPagar)}
          </div>
          <div className="mt-1.5 text-xs font-medium text-faint">
            {nPagar} pendiente{nPagar === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Vista */}
          <div className="flex h-10 rounded-[11px] border border-border bg-secondary p-1">
            {(
              [
                ['calendario', 'Calendario', CalendarDays],
                ['tabla', 'Tabla', Table2],
                ['cuotas', 'Cuotas', Layers],
              ] as [Vista, string, ComponentType<{ className?: string }>][]
            ).map(([v, lbl, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={cn(
                  'flex items-center gap-1.5 rounded-[8px] px-3.5 text-[13.5px] font-semibold transition-colors',
                  vista === v
                    ? 'bg-card text-ink shadow-[0_1px_3px_rgba(16,24,19,0.1)]'
                    : 'text-muted-foreground hover:text-ink',
                )}
              >
                <Icon className="size-4" />
                {lbl}
              </button>
            ))}
          </div>

          {/* Tipo */}
          <FilterPill
            active={tipoF === 'todos'}
            onClick={() => setTipoF('todos')}
            label="Todos"
            tono="neutro"
          />
          <FilterPill
            active={tipoF === 'cobrar'}
            onClick={() => setTipoF('cobrar')}
            label="A cobrar"
            tono="cobro"
            icon={ArrowDownLeft}
          />
          <FilterPill
            active={tipoF === 'pagar'}
            onClick={() => setTipoF('pagar')}
            label="A pagar"
            tono="pago"
            icon={ArrowUpRight}
          />

          {/* Medio + campo */}
          <Dropdown
            ariaLabel="Filtrar por medio de pago"
            value={medioF}
            onChange={(v) => setMedioF(v as MedioF)}
            options={medioOptions}
          />
          <Dropdown
            ariaLabel="Filtrar por campo"
            value={campoF}
            onChange={setCampoF}
            options={[
              { value: 'todos', label: 'Todos los campos' },
              ...(campos.data ?? []).map((c) => ({ value: c.id, label: c.nombre })),
            ]}
          />

          {vista === 'tabla' && (
            <button
              type="button"
              onClick={() => setVerLiquidados((x) => !x)}
              className={cn(
                'ml-auto flex h-10 items-center gap-2 rounded-[11px] border px-3.5 text-[13px] font-semibold transition-colors',
                verLiquidados
                  ? 'border-field-deep bg-field-soft text-field-deep'
                  : 'border-border bg-card text-muted-foreground hover:border-faint hover:text-ink',
              )}
            >
              <Eye className="size-4" />
              Ver liquidados
            </button>
          )}
        </div>

        {/* Horizonte temporal (solo en tabla) */}
        {vista === 'tabla' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] font-semibold uppercase tracking-[0.05em] text-faint">
              Horizonte
            </span>
            {HORIZONTES.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setHorizonte(h.id)}
                className={cn(
                  'h-8 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors',
                  horizonte === h.id
                    ? 'border-primary bg-field-soft text-field-deep'
                    : 'border-border bg-card text-muted-foreground hover:text-ink',
                )}
              >
                {h.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contenido */}
      {venc.isLoading ? (
        <Panel>
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
        </Panel>
      ) : venc.error ? (
        <Panel>
          <p className="py-8 text-center text-sm text-destructive">
            Error: {(venc.error as Error).message}
          </p>
        </Panel>
      ) : data.length === 0 ? (
        <Panel>
          <p className="py-12 text-center text-sm text-muted-foreground">
            Todavía no hay cobros ni pagos con fecha. Cargalos desde Analítica.
          </p>
        </Panel>
      ) : vista === 'calendario' ? (
        <CalendarioVencimientos items={calItems} />
      ) : vista === 'cuotas' ? (
        <CuotasView series={series} />
      ) : (
        <TablaView
          lista={lista}
          onRevertir={onRevertir}
          revirtiendo={revertir.isPending}
        />
      )}
    </div>
  )
}

/* ===== Tabla ===== */
function TablaView({
  lista,
  onRevertir,
  revirtiendo,
}: {
  lista: Vencimiento[]
  onRevertir: (v: Vencimiento) => void
  revirtiendo: boolean
}) {
  if (lista.length === 0) {
    return (
      <Panel>
        <p className="py-12 text-center text-sm text-muted-foreground">
          Sin movimientos con esos filtros.
        </p>
      </Panel>
    )
  }
  return (
    <Panel>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
              <th className="pb-2.5 pr-3">Vencimiento</th>
              <th className="pb-2.5 pr-3">Detalle</th>
              <th className="pb-2.5 pr-3">Campo</th>
              <th className="pb-2.5 pr-3 text-right">Monto</th>
              <th className="pb-2.5 pl-3" />
            </tr>
          </thead>
          <tbody>
            {lista.map((v) => {
              const di = diasInfo(v)
              const cobro = v.tipo === 'ingreso'
              return (
                <tr key={v.id} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-3">
                    <span
                      className={cn(
                        'tnum text-[13px] font-bold',
                        di.urgente ? 'text-destructive' : 'text-ink',
                      )}
                    >
                      {di.texto}
                    </span>
                    {v.fechaVencimiento && v.estado === 'pendiente' && (
                      <div className="tnum text-[11px] text-faint">
                        {v.fechaVencimiento.split('-').reverse().join('/')}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase',
                          cobro
                            ? 'bg-field-soft text-field-deep'
                            : 'bg-tierra-soft text-tierra',
                        )}
                      >
                        {cobro ? 'Cobro' : 'Pago'}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[10.5px] font-bold uppercase text-muted-foreground">
                        {medioLabel(v.medio, v.esEcheq)}
                      </span>
                      <span className="text-sm font-semibold text-ink">
                        {v.contraparte ?? v.descripcion ?? '—'}
                      </span>
                    </div>
                    {(v.chequeBanco || v.chequeNumero) && (
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                        <Landmark className="size-3" />
                        {v.chequeBanco}
                        {v.chequeBanco && v.chequeNumero && ' · '}
                        {v.chequeNumero && <span className="tnum">N° {v.chequeNumero}</span>}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-sm text-muted-foreground">
                    {v.campo ?? '—'}
                  </td>
                  <td
                    className={cn(
                      'tnum py-3 pr-3 text-right text-sm font-bold',
                      cobro ? 'text-field-deep' : 'text-ink',
                    )}
                  >
                    {cobro ? '+' : '−'}
                    {fmt(v.monto)}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    {v.estado === 'pendiente' ? (
                      <LiquidarDialog item={v} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRevertir(v)}
                        disabled={revirtiendo}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-ink"
                      >
                        <Undo2 className="size-3.5" />
                        Deshacer
                      </button>
                    )}
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

/* ===== Cuotas (plan por serie) ===== */
type SerieResumen = {
  nombre: string
  total: number
  pagadas: number
  proxima: Vencimiento | null
  restante: number
  tipo: Vencimiento['tipo']
}

function CuotasView({ series }: { series: SerieResumen[] }) {
  if (series.length === 0) {
    return (
      <Panel>
        <p className="py-12 text-center text-sm text-muted-foreground">
          No hay series de cuotas con estos filtros. Las series se crean al cargar
          un gasto/ingreso recurrente en Analítica.
        </p>
      </Panel>
    )
  }
  return (
    <Panel title="Planes de cuotas" sub="series recurrentes por vencimiento">
      <div className="grid gap-3.5 sm:grid-cols-2">
        {series.map((s, i) => {
          const cobro = s.tipo === 'ingreso'
          const pct = Math.round((s.pagadas / s.total) * 100)
          const prox = s.proxima
          const proxInfo = prox ? diasInfo(prox) : null
          return (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,19,0.05)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="truncate font-heading text-[15px] font-bold text-ink">
                  {s.nombre}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase',
                    cobro
                      ? 'bg-field-soft text-field-deep'
                      : 'bg-tierra-soft text-tierra',
                  )}
                >
                  {cobro ? 'Cobro' : 'Pago'}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-field-deep"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="tnum shrink-0 text-[12px] font-bold text-ink">
                  {s.pagadas}/{s.total}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-[13px]">
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-faint">
                    Próxima cuota
                  </div>
                  {prox ? (
                    <div className="mt-0.5">
                      <span className="tnum font-bold text-ink">
                        {fmt(prox.monto)}
                      </span>
                      {proxInfo && (
                        <span
                          className={cn(
                            'ml-1.5 rounded px-1 text-[10.5px] font-bold',
                            proxInfo.urgente
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-secondary text-faint',
                          )}
                        >
                          {proxInfo.texto}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="mt-0.5 font-semibold text-field-deep">
                      Completa ✓
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-faint">
                    Restante
                  </div>
                  <div className="tnum mt-0.5 font-bold text-ink">
                    {s.restante === 0 ? '—' : fmt(s.restante)}
                  </div>
                </div>
              </div>

              {prox && (
                <div className="mt-3">
                  <LiquidarDialog item={prox} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
