import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  Landmark,
  MapPin,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import { useCampos } from '@/features/campos/hooks'
import { useVencimientos, useRevertirLiquidacion } from '@/features/agenda/hooks'
import { useCancelarSerie } from '@/features/analitica/hooks'
import { medioLabel, type Vencimiento } from '@/features/agenda/api'
import { CalendarioVencimientos } from '@/features/agenda/calendario-vencimientos'
import { LiquidarDialog } from '@/features/agenda/liquidar-dialog'
import { CargarDialog } from '@/features/analitica/cargar-dialog'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { ParaAtenderCampo } from '@/features/inicio/para-atender'
import { Panel } from '@/components/panel'
import { Dropdown } from '@/components/ui/dropdown'
import { cn } from '@/lib/utils'

type MedioPago = Database['public']['Enums']['medio_pago']
type Vista = 'proximos' | 'calendario' | 'campo' | 'cuotas' | 'cheques' | 'liquidados' | 'tabla'
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

export function AgendaPage() {
  const venc = useVencimientos()
  const campos = useCampos()
  const revertir = useRevertirLiquidacion()

  const [vista, setVista] = useState<Vista>('proximos')
  const [tipoF, setTipoF] = useState<TipoF>('todos')
  const [medioF, setMedioF] = useState<MedioF>('todos')
  const [campoF, setCampoF] = useState<string>('todos')
  const [horizonte, setHorizonte] = useState<Horizonte>('mes')
  const [verLiquidados, setVerLiquidados] = useState(false)
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string | null>(null)
  const empresa = useEmpresa()

  const data = useMemo(() => venc.data ?? [], [venc.data])

  // Deep-link desde el Inicio (`/agenda?mov=<id>`): abre el modal de ese
  // cobro/pago. Si el id no existe o ya está liquidado, se limpia el param.
  const [params, setParams] = useSearchParams()
  const movId = params.get('mov')
  const movItem = useMemo(
    () => data.find((v) => v.id === movId) ?? null,
    [data, movId],
  )
  const cerrarMov = () =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.delete('mov')
        return p
      },
      { replace: true },
    )
  useEffect(() => {
    if (!movId || venc.isLoading) return
    if (!movItem) cerrarMov() // id inexistente → limpiamos el param
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movId, movItem, venc.isLoading])

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
    return [...map.entries()]
      .map(([serieId, items]) => {
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
          serieId,
          nombre,
          total: ordenadas.length,
          pagadas,
          proxima,
          restante,
          restantes: ordenadas.filter((v) => v.estado === 'pendiente').length,
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
  const pendientes = useMemo(
    () => base.filter((v) => v.estado === 'pendiente' && v.fechaVencimiento),
    [base],
  )
  const flujo30 = useMemo(() => {
    const hoy = hoy0()
    const limite = hoy + 30 * MS_DIA
    const dentro = pendientes
      .filter((v) => {
        const fecha = parseFecha(v.fechaVencimiento!)
        return fecha >= hoy && fecha <= limite
      })
    const cobrar = dentro.filter((v) => v.tipo === 'ingreso').reduce((s, v) => s + v.monto, 0)
    const pagar = dentro.filter((v) => v.tipo === 'gasto').reduce((s, v) => s + v.monto, 0)
    return { cobrar, pagar, neto: cobrar - pagar }
  }, [pendientes])
  const vencidos = pendientes.filter((v) => parseFecha(v.fechaVencimiento!) < hoy0()).length
  const proximos15 = pendientes.filter((v) => {
    const fecha = parseFecha(v.fechaVencimiento!)
    return fecha >= hoy0() && fecha <= hoy0() + 15 * MS_DIA
  }).length
  const movimientosVista = useMemo(() => {
    const candidatos = vista === 'liquidados'
      ? base.filter((v) => v.estado === 'liquidado')
      : vista === 'cheques'
        ? pendientes.filter((v) => v.medio === 'cheque')
        : pendientes
    return candidatos
      .filter((v) => !fechaSeleccionada || fechaAgenda(v) === fechaSeleccionada)
      .sort((a, b) => (fechaAgenda(a) ?? '9999').localeCompare(fechaAgenda(b) ?? '9999'))
  }, [base, fechaSeleccionada, pendientes, vista])

  async function onRevertir(v: Vencimiento) {
    try {
      await revertir.mutateAsync(v)
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
    <div className="flex flex-col gap-5 pb-20">
      {movItem && (
        <LiquidarDialog
          item={movItem}
          open
          onOpenChange={(o) => {
            if (!o) cerrarMov()
          }}
        />
      )}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-ink">Agenda</h1>
          <p className="mt-1 text-xs text-texto-suave">
            Lo que hay que hacer, pagar y cobrar en el campo · {vencidos} vencido{vencidos === 1 ? '' : 's'} · {proximos15} en los próximos 15 días
          </p>
        </div>
        <CargarDialog
          empresaId={empresa.data?.empresa_id ?? ''}
          triggerLabel="Anotar vencimiento"
        />
      </header>

      <div
        data-guia="agenda-vistas"
        className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-secondary p-1"
      >
        {([
          ['proximos', 'Lo que viene'],
          ['calendario', 'Calendario'],
          ['campo', 'Para arreglar'],
          ['cuotas', 'En cuotas'],
          ['cheques', 'Cheques'],
          ['liquidados', 'Ya pagado'],
          ['tabla', 'Tabla'],
        ] as [Vista, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={vista === id}
            onClick={() => {
              setVista(id)
              setFechaSeleccionada(null)
            }}
            className={cn(
              'shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              vista === id
                ? 'bg-card text-ink shadow-sm'
                : 'text-muted-foreground hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {vista !== 'campo' && (
        <section
          aria-label="Filtros de agenda"
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 xl:flex-row xl:items-center xl:justify-between sm:px-4"
        >
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-texto-suave">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-ink">Filtrar agenda</h2>
              <p className="truncate text-[11px] text-texto-suave">
                {tipoF === 'todos' && campoF === 'todos' && medioF === 'todos'
                  ? 'Todos los movimientos, campos y medios de pago'
                  : 'Mostrando resultados filtrados'}
              </p>
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-semibold text-texto-suave">Tipo</span>
              <Dropdown
                ariaLabel="Filtrar por tipo"
                value={tipoF}
                onChange={(value) => setTipoF(value as TipoF)}
                options={[
                  { value: 'todos', label: 'Todos los movimientos' },
                  { value: 'cobrar', label: 'A cobrar' },
                  { value: 'pagar', label: 'A pagar' },
                ]}
                block
              />
            </label>
            <label className="min-w-0">
              <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-texto-suave">
                <MapPin className="size-3" aria-hidden="true" /> Campo
              </span>
              <Dropdown
                ariaLabel="Filtrar por campo"
                value={campoF}
                onChange={setCampoF}
                options={[{ value: 'todos', label: 'Todos los campos' }, ...((campos.data ?? []).map((c) => ({ value: c.id, label: c.nombre })))]}
                block
              />
            </label>
            <label className="min-w-0">
              <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-texto-suave">
                <CreditCard className="size-3" aria-hidden="true" /> Medio de pago
              </span>
              <Dropdown
                ariaLabel="Filtrar por medio de pago"
                value={medioF}
                onChange={(value) => setMedioF(value as MedioF)}
                options={medioOptions}
                block
              />
            </label>
            {(tipoF !== 'todos' || campoF !== 'todos' || medioF !== 'todos') && (
              <button
                type="button"
                onClick={() => {
                  setTipoF('todos')
                  setCampoF('todos')
                  setMedioF('todos')
                }}
                className="h-10 rounded-xl px-3 text-xs font-semibold text-principal transition-colors hover:bg-principal-suave sm:col-span-3 sm:justify-self-end"
              >
                Limpiar
              </button>
            )}
          </div>
        </section>
      )}

      <div data-guia="agenda-contenido">
        {venc.isLoading ? (
          <Panel><p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p></Panel>
        ) : venc.error ? (
          <Panel><p className="py-8 text-center text-sm text-destructive">Error: {(venc.error as Error).message}</p></Panel>
        ) : vista === 'campo' ? (
          <ParaAtenderCampo />
        ) : vista === 'calendario' ? (
          <CalendarioVencimientos items={calItems} />
        ) : vista === 'cuotas' ? (
          <CuotasView series={series} empresaId={empresa.data?.empresa_id ?? ''} />
        ) : vista === 'tabla' ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-faint">Horizonte</span>
              {HORIZONTES.map((h) => (
                <button key={h.id} type="button" onClick={() => setHorizonte(h.id)} className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold', horizonte === h.id ? 'border-field-deep bg-field-soft text-field-deep' : 'border-border bg-card text-muted-foreground')}>
                  {h.label}
                </button>
              ))}
              <button type="button" onClick={() => setVerLiquidados((x) => !x)} className={cn('ml-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold', verLiquidados ? 'border-field-deep bg-field-soft text-field-deep' : 'border-border bg-card text-muted-foreground')}>
                <Eye className="size-3.5" /> Ver liquidados
              </button>
            </div>
            <TablaView lista={lista} onRevertir={onRevertir} revirtiendo={revertir.isPending} />
          </div>
        ) : (vista === 'cheques' || vista === 'liquidados') && movimientosVista.length === 0 ? (
          <Panel>
            <p className="py-12 text-center text-sm text-muted-foreground">
              {vista === 'cheques'
                ? 'No hay cheques pendientes con estos filtros. Los cheques aparecen acá al cargarlos desde Analítica.'
                : 'Todavía no hay pagos ni cobros liquidados con estos filtros.'}
            </p>
          </Panel>
        ) : (
          <AgendaProximos
            items={movimientosVista}
            calendarioItems={base}
            alertas={pendientes.filter((v) => {
              const dias = parseFecha(v.fechaVencimiento!) - hoy0()
              return dias <= 3 * MS_DIA
            }).slice(0, 2)}
            flujo30={flujo30}
            fechaSeleccionada={fechaSeleccionada}
            setFechaSeleccionada={setFechaSeleccionada}
            onRevertir={onRevertir}
            revirtiendo={revertir.isPending}
            titulo={vista === 'liquidados' ? 'Ya pagado y cobrado' : vista === 'cheques' ? 'Cheques pendientes' : 'Lo que viene'}
          />
        )}
      </div>
    </div>
  )
}

function fechaClave(fecha: Date): string {
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fechaCorta(fecha: string): { dia: string; mes: string } {
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return {
    dia: String(d),
    mes: date.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase(),
  }
}

function grupoSemana(fecha: string): { clave: string; titulo: string } {
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const lunes = new Date(y, m - 1, d)
  lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7))
  const hoy = new Date(hoy0())
  const lunesHoy = new Date(hoy)
  lunesHoy.setDate(lunesHoy.getDate() - ((lunesHoy.getDay() + 6) % 7))
  const diferencia = Math.round((lunes.getTime() - lunesHoy.getTime()) / (7 * MS_DIA))
  let titulo: string
  if (diferencia === 0) titulo = 'Esta semana'
  else if (diferencia === 1) titulo = 'La semana que viene'
  else {
    const domingo = new Date(lunes)
    domingo.setDate(domingo.getDate() + 6)
    const inicio = lunes.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '')
    const fin = domingo.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '')
    titulo = `${inicio} al ${fin}`
  }
  return { clave: fechaClave(lunes), titulo: titulo || date.toLocaleDateString('es-AR') }
}

function MiniCalendarioAgenda({
  calendarioItems,
  selected,
  onSelect,
}: {
  calendarioItems: Vencimiento[]
  selected: string | null
  onSelect: (fecha: string | null) => void
}) {
  const [cursor, setCursor] = useState(() => {
    const [y, m] = (selected ?? fechaClave(new Date())).split('-').map(Number)
    return new Date(y, m - 1, 1)
  })
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const diasAntes = (new Date(year, month, 1).getDay() + 6) % 7
  const totalDias = new Date(year, month + 1, 0).getDate()
  const celdas: (number | null)[] = [...Array(diasAntes).fill(null), ...Array.from({ length: totalDias }, (_, i) => i + 1)]
  while (celdas.length % 7) celdas.push(null)
  const conMovimiento = new Set(calendarioItems.map((v) => fechaAgenda(v)).filter((f): f is string => !!f))
  const mes = cursor.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label="Calendario mensual de vencimientos">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-base font-bold capitalize text-ink">{mes}</h2>
        <div className="flex gap-1">
          <button type="button" aria-label="Mes anterior" onClick={() => setCursor(new Date(year, month - 1, 1))} className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary"><ChevronLeft className="size-4" /></button>
          <button type="button" aria-label="Mes siguiente" onClick={() => setCursor(new Date(year, month + 1, 1))} className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary"><ChevronRight className="size-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase text-faint">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={`${d}-${i}`} className="py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {celdas.map((dia, i) => {
          if (!dia) return <span key={`vacio-${i}`} />
          const key = fechaClave(new Date(year, month, dia))
          const activo = selected === key
          const hoy = key === fechaClave(new Date())
          return (
            <button
              key={key}
              type="button"
              aria-label={`${dia} ${mes}${conMovimiento.has(key) ? ', con movimientos' : ''}`}
              aria-pressed={activo}
              onClick={() => onSelect(activo ? null : key)}
              className={cn('relative mx-auto grid size-9 place-items-center rounded-full text-[15px] font-heading font-extrabold tabular-nums transition-colors', activo ? 'bg-acento text-acento-texto' : hoy ? 'ring-1 ring-principal text-ink' : 'text-ink hover:bg-secondary')}
            >
              {dia}
              {conMovimiento.has(key) && <span aria-hidden className="absolute -bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-principal" />}
            </button>
          )
        })}
      </div>
      {selected && <button type="button" onClick={() => onSelect(null)} className="mt-3 text-xs font-semibold text-principal hover:underline">Quitar filtro de fecha</button>}
    </section>
  )
}

function AgendaProximos({
  items,
  calendarioItems,
  alertas,
  flujo30,
  fechaSeleccionada,
  setFechaSeleccionada,
  onRevertir,
  revirtiendo,
  titulo,
}: {
  items: Vencimiento[]
  calendarioItems: Vencimiento[]
  alertas: Vencimiento[]
  flujo30: { cobrar: number; pagar: number; neto: number }
  fechaSeleccionada: string | null
  setFechaSeleccionada: (v: string | null) => void
  onRevertir: (v: Vencimiento) => void
  revirtiendo: boolean
  titulo: string
}) {
  const grupos = useMemo(() => {
    const map = new Map<string, { titulo: string; items: Vencimiento[] }>()
    for (const item of items) {
      const fecha = fechaAgenda(item)
      if (!fecha) continue
      const grupo = grupoSemana(fecha)
      const actual = map.get(grupo.clave) ?? { titulo: grupo.titulo, items: [] }
      actual.items.push(item)
      map.set(grupo.clave, actual)
    }
    return [...map.entries()]
  }, [items])
  const mayor = Math.max(flujo30.cobrar, flujo30.pagar, 1)

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(270px,0.85fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="px-1 py-2 sm:px-2">
          <p className="text-sm font-semibold text-texto-suave sm:text-base">En los próximos 30 días te quedan</p>
          <p className={cn('titulo-display mt-1 text-[clamp(2rem,10vw,3rem)] sm:text-[clamp(3rem,8.33vw,7.5rem)]', flujo30.neto < 0 ? 'text-principal' : 'text-estado-bien-texto')}>
            {flujo30.neto > 0 ? '+' : flujo30.neto < 0 ? '−' : ''}{fmt(Math.abs(flujo30.neto))}
          </p>
          <p className="mt-2 text-sm text-texto-suave sm:text-base">Cobrás <span className="tnum font-semibold text-ink">{fmt(flujo30.cobrar)}</span> y pagás <span className="tnum font-semibold text-ink">{fmt(flujo30.pagar)}</span>.</p>
        </section>

        {alertas.length > 0 && (
          <section aria-labelledby="agenda-atender" className="flex flex-col gap-2">
            <h2 id="agenda-atender" className="font-heading text-sm font-bold text-ink">Para atender ya</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {alertas.map((item) => {
                const dias = Math.floor((parseFecha(item.fechaVencimiento!) - hoy0()) / MS_DIA)
                const vence = dias < 0 ? `Venció hace ${-dias} días` : dias === 0 ? 'Vence hoy' : `Vence en ${dias} días`
                return (
                  <article key={item.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                    <div className="min-w-0">
                      <p className={cn('text-[11px] font-bold', dias <= 0 ? 'text-estado-problema-texto' : 'text-estado-atencion-texto')}>{vence}</p>
                      <p className="mt-1 truncate text-sm font-semibold text-ink">{item.contraparte ?? item.descripcion ?? item.categoria ?? (item.tipo === 'ingreso' ? 'Cobro' : 'Pago')}</p>
                      <p className="truncate text-xs text-texto-suave">{item.campo ?? medioLabel(item.medio, item.esEcheq)}</p>
                    </div>
                    <LiquidarDialog item={item} />
                  </article>
                )
              })}
            </div>
          </section>
        )}

        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <div>
              <h2 className="font-heading text-sm font-bold text-ink">{titulo}</h2>
              {fechaSeleccionada && <p className="mt-0.5 text-xs text-texto-suave">{fechaSeleccionada.split('-').reverse().join('/')}</p>}
            </div>
          </div>
          {grupos.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">{fechaSeleccionada ? 'No hay movimientos para esa fecha.' : calendarioItems.length === 0 && titulo === 'Lo que viene' ? 'Todavía no hay cobros ni pagos con fecha. Anotalos con el botón “Anotar vencimiento”.' : 'No hay movimientos para mostrar con estos filtros.'}</p>
          ) : (
            <div className="px-4 sm:px-5">
              {grupos.map(([key, grupo]) => (
                <div key={key}>
                  <h3 className="border-b border-border/70 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-texto-suave">{grupo.titulo}</h3>
                  {grupo.items.map((item) => {
                    const fecha = fechaAgenda(item)!
                    const fechaUI = fechaCorta(fecha)
                    const ingreso = item.tipo === 'ingreso'
                    const pagado = item.estado === 'liquidado'
                    return (
                      <article key={item.id} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 border-b border-border/70 py-3 last:border-0 sm:grid-cols-[52px_minmax(0,1fr)_auto_auto] sm:gap-4">
                        <div className="text-center leading-none">
                          <span className="titulo-display block text-[22px] text-ink">{fechaUI.dia}</span>
                          <span className="mt-1 block text-[10px] font-semibold text-texto-suave">{fechaUI.mes}</span>
                        </div>
                        <div className="min-w-0 border-l-2 border-principal pl-3">
                          <p className="truncate text-sm font-semibold text-ink">{item.contraparte ?? item.descripcion ?? item.categoria ?? (ingreso ? 'Cobro' : 'Pago')}</p>
                          <p className="truncate text-xs text-texto-suave">{[item.campo, item.categoria, medioLabel(item.medio, item.esEcheq)].filter(Boolean).join(' · ')}</p>
                        </div>
                        <div className="flex items-center gap-2 sm:justify-end">
                          <span className={cn('rounded-full px-2 py-1 text-[10px] font-semibold', pagado ? 'bg-estado-bien-suave text-estado-bien-texto' : ingreso ? 'bg-field-soft text-field-deep' : 'bg-principal-suave text-principal')}>
                            {pagado ? (ingreso ? 'Cobrado' : 'Pagado') : ingreso ? 'Cobro' : 'Pago'}
                          </span>
                        </div>
                        <div className="col-start-2 flex items-center justify-between gap-2 sm:col-start-auto sm:justify-end">
                          <span className={cn('tnum whitespace-nowrap text-base font-bold sm:text-lg', ingreso ? 'text-estado-bien-texto' : 'text-ink')}>{ingreso ? '+' : '−'}{fmt(item.monto)}</span>
                          {pagado ? (
                            <button type="button" onClick={() => onRevertir(item)} disabled={revirtiendo} className="text-[11px] font-semibold text-texto-suave hover:text-ink">Deshacer</button>
                          ) : (
                            <LiquidarDialog item={item} />
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <MiniCalendarioAgenda calendarioItems={calendarioItems} selected={fechaSeleccionada} onSelect={setFechaSeleccionada} />
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-heading text-sm font-bold text-ink">Próximos 30 días</h2>
          <div className="mt-3 space-y-4">
            <div>
              <div className="flex items-baseline justify-between gap-3"><span className="text-sm text-texto-suave">A cobrar</span><span className="tnum text-lg font-bold text-ink">{fmt(flujo30.cobrar)}</span></div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-estado-bien" style={{ width: `${(flujo30.cobrar / mayor) * 100}%` }} /></div>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-3"><span className="text-sm text-texto-suave">A pagar</span><span className="tnum text-lg font-bold text-ink">{fmt(flujo30.pagar)}</span></div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-principal" style={{ width: `${(flujo30.pagar / mayor) * 100}%` }} /></div>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2"><span className="text-sm font-semibold text-texto-suave">Te quedan</span><span className={cn('tnum text-xl font-bold', flujo30.neto < 0 ? 'text-principal' : 'text-estado-bien-texto')}>{flujo30.neto < 0 ? '−' : '+'}{fmt(Math.abs(flujo30.neto))}</span></div>
          </div>
        </section>
      </aside>
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
  serieId: string
  nombre: string
  total: number
  pagadas: number
  proxima: Vencimiento | null
  restante: number
  restantes: number
  tipo: Vencimiento['tipo']
}

/** Cancelar las cuotas que faltan de una serie (vino de Analítica — la
 *  gestión de cuotas vive acá, decisión de curaduría de Lau 17/07). */
function CancelarSerie({ serieId, restantes }: { serieId: string; restantes: number }) {
  const [confirmar, setConfirmar] = useState(false)
  const cancelar = useCancelarSerie()

  async function onCancelar() {
    try {
      await cancelar.mutateAsync(serieId)
      toast.success('Cuotas restantes canceladas')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    }
  }

  if (confirmar) {
    return (
      <span className="flex items-center justify-center gap-2 text-[12px]">
        <span className="text-muted-foreground">¿Anular {restantes}?</span>
        <button
          type="button"
          onClick={onCancelar}
          disabled={cancelar.isPending}
          className="rounded-lg bg-destructive px-2.5 py-1 font-semibold text-white"
        >
          Sí
        </button>
        <button
          type="button"
          onClick={() => setConfirmar(false)}
          className="rounded-lg border border-border px-2.5 py-1 font-semibold text-muted-foreground"
        >
          No
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setConfirmar(true)}
      className="w-full rounded-lg border border-border bg-card py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
    >
      Cancelar restantes
    </button>
  )
}

function CuotasView({ series, empresaId }: { series: SerieResumen[]; empresaId: string }) {
  const restanteTotal = series.reduce((total, serie) => total + serie.restante, 0)
  if (series.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
        <p className="font-heading text-xl font-bold text-ink">Todavía no hay cuotas anotadas</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Anotá una compra o un ingreso en cuotas y vas a encontrar acá todas sus fechas.
        </p>
        <div className="mt-5 inline-flex">
          <CargarDialog empresaId={empresaId} triggerLabel="Anotar en cuotas" triggerVariant="outline" />
        </div>
      </div>
    )
  }
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="border-b border-border/70 px-5 py-5 sm:px-7">
        <p className="text-sm font-semibold text-muted-foreground">Te queda por pagar en cuotas</p>
        <p className="tnum mt-1 font-heading text-5xl font-bold tracking-tight text-ink sm:text-6xl">
          {fmt(restanteTotal)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          En {series.length} {series.length === 1 ? 'compra' : 'compras'}
        </p>
      </header>
      <div className="divide-y divide-border/70">
        {series.map((s, i) => {
          const cobro = s.tipo === 'ingreso'
          const pct = Math.round((s.pagadas / s.total) * 100)
          const prox = s.proxima
          const proxInfo = prox ? diasInfo(prox) : null
          return (
            <div
              key={i}
              className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-7"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-heading text-lg font-bold text-ink">{s.nombre}</h2>
                  <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold uppercase', cobro ? 'bg-field-soft text-field-deep' : 'bg-tierra-soft text-tierra')}>
                    {cobro ? 'Cobro' : 'Pago'}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>{s.pagadas} de {s.total} cuotas pagadas</span>
                  {prox && <span>Próxima: {prox.fechaVencimiento}</span>}
                </div>
                <div className="mt-3 flex max-w-xl items-center gap-3">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-field-deep" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="tnum shrink-0 text-sm font-bold text-ink">{s.pagadas}/{s.total}</span>
                </div>
                {prox && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Cuota de <span className="tnum font-bold text-ink">{fmt(prox.monto)}</span>
                    {proxInfo && <span className={cn('ml-2 font-semibold', proxInfo.urgente ? 'text-destructive' : 'text-muted-foreground')}>{proxInfo.texto}</span>}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <div className="sm:text-right">
                  <p className="text-xs font-semibold text-muted-foreground">Restante</p>
                  <p className="tnum font-heading text-2xl font-bold text-ink">{fmt(s.restante)}</p>
                </div>
                {prox && (
                  <div className="flex flex-col gap-2">
                    <LiquidarDialog item={prox} />
                    <CancelarSerie serieId={s.serieId} restantes={s.restantes} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <footer className="flex flex-col gap-4 border-t border-border/70 bg-secondary/30 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <p className="max-w-xl text-sm text-muted-foreground">
          ¿Compraste algo más en cuotas? Anotalo una vez y aparecen todas las fechas.
        </p>
        <CargarDialog empresaId={empresaId} triggerLabel="Anotar en cuotas" triggerVariant="outline" />
      </footer>
    </section>
  )
}
