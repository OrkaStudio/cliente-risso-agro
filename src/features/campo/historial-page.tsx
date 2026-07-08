import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CloudOff,
  Footprints,
  Loader2,
  RefreshCw,
  Syringe,
  TriangleAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { platadb } from './plata/db'
import { mangadb } from './manga/db'
import { fetchHistorial, type HistItem } from './plata/api'
import {
  agruparPorSemana,
  fetchHistorialManga,
  fetchHistorialRecorridas,
  fetchRecorridaDetalle,
  type MangaHist,
  type ObsDetalle,
  type RecorridaHist,
} from './historial/api'
import { categoriaLabel } from '@/features/hacienda/labels'
import { CSheet } from './ui'

const money = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
/** Monto compacto para la fila (siempre entra): $30M · $45k. */
const compact = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace('.', ',')}M`
  if (a >= 1_000) return `$${Math.round(a / 1_000)}k`
  return `$${a}`
}
const fmtDia = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  return `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}
const fmtFecha = (iso: string) => {
  const s = iso.slice(0, 10).split('-')
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : iso
}

const PASTO: Record<string, string> = { abundante: 'Pasto abundante', normal: 'Pasto normal', escaso: 'Pasto escaso', pelado: 'Pasto pelado' }
const AGUA: Record<string, string> = { llena: 'Agua llena', normal: 'Agua normal', baja: 'Agua baja', seca: 'Agua seca' }
const ELEC: Record<string, string> = { ok: 'Boyero anda', cortado: 'Boyero cortado' }
const CULT: Record<string, string> = { bien: 'Cultivo bien', regular: 'Cultivo regular', mal: 'Cultivo mal' }
const esAlerta = (o: ObsDetalle) =>
  o.pasto === 'pelado' || o.agua === 'seca' || o.electrico === 'cortado' || o.enTratamiento

type Seccion = 'plata' | 'manga' | 'recorrida'
const SECCIONES: { key: Seccion; label: string }[] = [
  { key: 'plata', label: 'Plata' },
  { key: 'manga', label: 'Manga' },
  { key: 'recorrida', label: 'Recorrida' },
]
type SubFiltro = 'todos' | 'gasto' | 'ingreso'

type EntGasto = {
  kind: 'gasto'
  id: string
  cargadoEn: string
  tipo: 'gasto' | 'ingreso'
  monto: number
  categoria: string | null
  campo: string | null
  fecha: string
  descripcion: string | null
  comprobante: string | null
  iva: number | null
  estado?: 'pendiente' | 'error'
}
type EntManga = {
  kind: 'manga'
  id: string
  cargadoEn: string
  rfid: string
  visual: string | null
  categoria: string | null
  estado?: 'pendiente' | 'error'
}
type EntRec = { kind: 'recorrida'; id: string; cargadoEn: string } & RecorridaHist
type Entrada = EntGasto | EntManga | EntRec

/**
 * Historial del Modo Campo: registro visual de "qué se hizo / se cargó",
 * segmentado Plata · Manga · Recorrida y agrupado por semana. Las filas son
 * mínimas (sólo lo que se lee de un vistazo); el detalle completo — monto
 * exacto, comprobante, potreros con su audio — vive en el pop-up al tocar.
 */
export function HistorialPage() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [seccion, setSeccion] = useState<Seccion>('plata')
  const [sub, setSub] = useState<SubFiltro>('todos')
  const [gastos, setGastos] = useState<HistItem[]>([])
  const [manga, setManga] = useState<MangaHist[]>([])
  const [recorridas, setRecorridas] = useState<RecorridaHist[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<Entrada | null>(null)

  const gastosPend = useLiveQuery(
    () => platadb.outbox.where('estado').notEqual('sincronizada').toArray(),
    [],
  )
  const mangaPend = useLiveQuery(
    () => mangadb.outbox.where('estado').notEqual('sincronizada').toArray(),
    [],
  )

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const cargar = async (s: Seccion) => {
    if (!navigator.onLine) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)
    try {
      if (s === 'plata') setGastos(await fetchHistorial())
      else if (s === 'manga') setManga(await fetchHistorialManga())
      else setRecorridas(await fetchHistorialRecorridas())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void cargar(seccion), 0)
    return () => clearTimeout(t)
  }, [seccion, online])

  const previews = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of gastosPend ?? []) {
      if (p.foto) map.set(p.id, URL.createObjectURL(p.foto))
    }
    return map
  }, [gastosPend])
  useEffect(() => {
    return () => {
      for (const u of previews.values()) URL.revokeObjectURL(u)
    }
  }, [previews])

  const grupos = useMemo(() => {
    let ent: Entrada[]
    if (seccion === 'plata') {
      const pend: Entrada[] = (gastosPend ?? []).map((p) => ({
        kind: 'gasto',
        id: p.id,
        cargadoEn: new Date(p.created_at).toISOString(),
        tipo: p.tipo,
        monto: p.monto,
        categoria: p.categoria_nombre,
        campo: null,
        fecha: p.fecha,
        descripcion: p.descripcion,
        comprobante: previews.get(p.id) ?? null,
        iva: null,
        estado: p.estado === 'error' ? 'error' : 'pendiente',
      }))
      const srv: Entrada[] = gastos.map((m) => ({
        kind: 'gasto',
        id: m.id,
        cargadoEn: m.cargadoEn,
        tipo: m.tipo,
        monto: m.monto,
        categoria: m.categoria,
        campo: m.campo,
        fecha: m.fecha,
        descripcion: m.descripcion,
        comprobante: m.comprobanteUrl,
        iva: m.ivaTotal,
      }))
      ent = [...pend, ...srv].filter((e) =>
        e.kind === 'gasto' && sub !== 'todos' ? e.tipo === sub : true,
      )
    } else if (seccion === 'manga') {
      const pend: Entrada[] = (mangaPend ?? []).map((p) => ({
        kind: 'manga',
        id: String(p.local_id),
        cargadoEn: new Date(p.created_at).toISOString(),
        rfid: p.rfid,
        visual: p.visual,
        categoria: categoriaLabel[p.categoria] ?? p.categoria,
        estado: p.estado === 'error' ? 'error' : 'pendiente',
      }))
      const srv: Entrada[] = manga.map((c) => ({
        kind: 'manga',
        id: c.id,
        cargadoEn: c.cargadoEn,
        rfid: c.rfid,
        visual: c.visual,
        categoria: c.categoria ? categoriaLabel[c.categoria] : null,
      }))
      ent = [...pend, ...srv]
    } else {
      ent = recorridas.map((r) => ({ kind: 'recorrida', ...r }))
    }
    ent.sort((a, b) => b.cargadoEn.localeCompare(a.cargadoEn))
    return agruparPorSemana(ent, (e) => e.cargadoEn)
  }, [seccion, sub, gastos, manga, recorridas, gastosPend, mangaPend, previews])

  const vacio = !cargando && grupos.length === 0

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      <header className="shrink-0 border-b border-[var(--c-line)] bg-[var(--c-panel)] px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="c-display text-[16px] text-[var(--c-ink)]">Historial</span>
          <button
            type="button"
            onClick={() => void cargar(seccion)}
            disabled={!online || cargando}
            aria-label="Actualizar"
            className="flex size-8 items-center justify-center rounded-lg border border-[var(--c-line-strong)] text-[var(--c-ink-soft)] disabled:opacity-40"
          >
            <RefreshCw className={cn('size-4', cargando && 'animate-spin')} />
          </button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-[var(--c-sunk)] p-1">
          {SECCIONES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSeccion(s.key)}
              className={cn(
                'rounded-lg py-2 text-[13px] font-semibold transition-colors',
                seccion === s.key
                  ? 'bg-[var(--c-panel)] text-[var(--c-ink)] c-hard-sm'
                  : 'text-[var(--c-ink-soft)]',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        {seccion === 'plata' && (
          <div className="mt-2 flex gap-1.5">
            {(['todos', 'gasto', 'ingreso'] as SubFiltro[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSub(k)}
                className={cn(
                  'rounded-lg border px-3 py-1 text-[12px] font-semibold transition-colors',
                  sub === k
                    ? 'border-[var(--c-ok)] bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]'
                    : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink-soft)]',
                )}
              >
                {k === 'todos' ? 'Todos' : k === 'gasto' ? 'Gastos' : 'Ingresos'}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {grupos.map((g) => (
          <div key={g.key} className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between px-0.5">
              <span className="c-label !text-[11px] !text-[var(--c-ink-soft)]">{g.label}</span>
              <span className="c-label !text-[10px] !text-[var(--c-faint)]">{g.items.length}</span>
            </div>
            <div className="space-y-1.5">
              {g.items.map((e) =>
                e.kind === 'gasto' ? (
                  <FilaGasto key={e.id} e={e} onAbrir={() => setDetalle(e)} />
                ) : e.kind === 'manga' ? (
                  <FilaManga key={e.id} e={e} onAbrir={() => setDetalle(e)} />
                ) : (
                  <FilaRecorrida key={e.id} e={e} onAbrir={() => setDetalle(e)} />
                ),
              )}
            </div>
          </div>
        ))}

        {cargando && (
          <div className="flex items-center justify-center gap-2 py-8 text-[var(--c-ink-soft)]">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-[13px]">Cargando…</span>
          </div>
        )}

        {vacio && (
          <div className="flex flex-col items-center justify-center gap-2 px-8 py-14 text-center">
            <CloudOff className="size-9 text-[var(--c-faint)]" />
            <p className="c-display text-[15px] text-[var(--c-ink)]">
              {online ? 'Nada por acá todavía' : 'Sin señal'}
            </p>
            <p className="text-[13px] text-[var(--c-ink-soft)]">
              {online
                ? 'Lo que hagas en esta sección va a aparecer acá, por semana.'
                : 'Conectate para ver el historial completo.'}
            </p>
          </div>
        )}

        {error && (
          <p className="c-label px-1 py-3 !text-[12px] !text-[var(--c-bad)]">{error}</p>
        )}
      </div>

      <CSheet
        open={!!detalle}
        title={
          detalle?.kind === 'manga'
            ? 'Caravaneo'
            : detalle?.kind === 'recorrida'
              ? 'Recorrida'
              : 'Movimiento'
        }
        onClose={() => setDetalle(null)}
      >
        {detalle?.kind === 'gasto' && <DetalleGasto e={detalle} />}
        {detalle?.kind === 'manga' && <DetalleManga e={detalle} />}
        {detalle?.kind === 'recorrida' && <DetalleRecorrida e={detalle} />}
      </CSheet>
    </div>
  )
}

// ===== Filas (mínimas y tocables) =====

/** Punto de estado sobre el ícono (sin subir / error) — sin texto, sin ruido. */
function Punto({ estado }: { estado?: 'pendiente' | 'error' }) {
  if (!estado) return null
  return (
    <span
      className={cn(
        'absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-[var(--c-panel)]',
        estado === 'error' ? 'bg-[var(--c-bad)]' : 'bg-[var(--c-warn)]',
      )}
    />
  )
}

function Card({
  accent,
  onClick,
  children,
}: {
  accent: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="c-panel flex w-full items-stretch gap-0 overflow-hidden !rounded-xl text-left transition-transform active:scale-[0.985]"
    >
      <span className="w-1 shrink-0" style={{ background: accent }} />
      <div className="flex flex-1 items-center gap-3 py-2.5 pl-3 pr-3">{children}</div>
    </button>
  )
}

function FilaGasto({ e, onAbrir }: { e: EntGasto; onAbrir: () => void }) {
  const esGasto = e.tipo === 'gasto'
  return (
    <Card accent={esGasto ? 'var(--c-warn)' : 'var(--c-ok)'} onClick={onAbrir}>
      <span
        className={cn(
          'relative flex size-9 shrink-0 items-center justify-center rounded-lg',
          esGasto
            ? 'bg-[var(--c-warn-soft)] text-[var(--c-warn-deep)]'
            : 'bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]',
        )}
      >
        {esGasto ? (
          <ArrowUpRight className="size-4.5" strokeWidth={2.5} />
        ) : (
          <ArrowDownLeft className="size-4.5" strokeWidth={2.5} />
        )}
        <Punto estado={e.estado} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-[var(--c-ink)]">
        {e.categoria ?? (esGasto ? 'Gasto' : 'Ingreso')}
      </span>
      <span
        className={cn(
          'c-mono shrink-0 text-[15px] font-bold tabular-nums',
          esGasto ? 'text-[var(--c-warn-deep)]' : 'text-[var(--c-ok-deep)]',
        )}
      >
        {esGasto ? '−' : '+'}
        {compact(e.monto)}
      </span>
    </Card>
  )
}

function FilaManga({ e, onAbrir }: { e: EntManga; onAbrir: () => void }) {
  return (
    <Card accent="var(--c-mid)" onClick={onAbrir}>
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--c-sunk)] text-[var(--c-ink)]">
        <Syringe className="size-4.5" strokeWidth={2.2} />
        <Punto estado={e.estado} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[14.5px] font-semibold text-[var(--c-ink)]">
          {e.categoria ?? 'Caravaneado'}
        </span>
        <span className="c-mono block truncate text-[11.5px] text-[var(--c-ink-soft)]">
          …{e.rfid.slice(-6)}
          {e.visual ? ` · N° ${e.visual}` : ''}
        </span>
      </div>
      <span className="shrink-0 text-[11.5px] font-medium text-[var(--c-faint)]">
        {fmtDia(e.cargadoEn)}
      </span>
    </Card>
  )
}

function FilaRecorrida({ e, onAbrir }: { e: EntRec; onAbrir: () => void }) {
  return (
    <Card accent="var(--c-ok)" onClick={onAbrir}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]">
        <Footprints className="size-4.5" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[14.5px] font-semibold text-[var(--c-ink)]">
          {e.campo ?? 'Recorrida'}
        </span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--c-ink-soft)]">
          {e.potreros} potreros
          {e.alertas > 0 && (
            <span className="inline-flex items-center gap-0.5 font-semibold text-[var(--c-warn-deep)]">
              <TriangleAlert className="size-3" />
              {e.alertas}
            </span>
          )}
        </span>
      </div>
      <span className="shrink-0 text-[11.5px] font-medium text-[var(--c-faint)]">
        {fmtDia(e.fecha)}
      </span>
    </Card>
  )
}

// ===== Detalle (pop-up) — hero + revelado escalonado =====

/** Tarjeta de dato (label arriba, valor abajo), en grilla. */
function Dato({ k, v, full }: { k: string; v: React.ReactNode; full?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--c-line)] bg-[var(--c-sunk)] px-3 py-2',
        full && 'col-span-2',
      )}
    >
      <span className="c-label block !text-[10px]">{k}</span>
      <span className="mt-0.5 block text-[14px] font-semibold text-[var(--c-ink)]">{v}</span>
    </div>
  )
}

const rise = (i: number) => ({ animationDelay: `${i * 55}ms` }) as React.CSSProperties

function DetalleGasto({ e }: { e: EntGasto }) {
  const esGasto = e.tipo === 'gasto'
  const [zoom, setZoom] = useState(false)
  return (
    <div className="space-y-2.5">
      {/* Hero: el monto manda, con el tono del tipo */}
      <div
        className={cn(
          'c-rise relative overflow-hidden rounded-2xl p-4',
          esGasto ? 'bg-[var(--c-warn-soft)]' : 'bg-[var(--c-ok-soft)]',
        )}
        style={rise(0)}
      >
        {esGasto ? (
          <ArrowUpRight
            className="pointer-events-none absolute -right-3 -top-3 size-24 text-[var(--c-warn)]/15"
            strokeWidth={2}
          />
        ) : (
          <ArrowDownLeft
            className="pointer-events-none absolute -right-3 -top-3 size-24 text-[var(--c-ok)]/15"
            strokeWidth={2}
          />
        )}
        <span
          className={cn(
            'c-label relative !text-[11px]',
            esGasto ? '!text-[var(--c-warn-deep)]' : '!text-[var(--c-ok-deep)]',
          )}
        >
          {esGasto ? 'Gasto' : 'Ingreso'}
        </span>
        <div
          className={cn(
            'c-mono relative mt-1 text-[30px] font-bold leading-none tabular-nums',
            esGasto ? 'text-[var(--c-warn-deep)]' : 'text-[var(--c-ok-deep)]',
          )}
        >
          {esGasto ? '−' : '+'}
          {money(e.monto)}
        </div>
        <div className="relative mt-1.5 text-[12px] font-medium text-[var(--c-ink-soft)]">
          {e.categoria ?? '—'} · cargado {fmtDia(e.cargadoEn)}
        </div>
      </div>

      {/* Datos en grilla */}
      <div className="c-rise grid grid-cols-2 gap-2" style={rise(1)}>
        <Dato k="Fecha" v={fmtFecha(e.fecha)} />
        {e.campo && <Dato k="Campo" v={e.campo} />}
        {e.iva ? <Dato k="IVA" v={money(e.iva)} /> : null}
        {e.estado && (
          <Dato k="Estado" v={e.estado === 'error' ? 'Error al subir' : 'Sin subir'} />
        )}
        {e.descripcion && <Dato k="Detalle" v={e.descripcion} full />}
      </div>

      {/* Comprobante */}
      {e.comprobante && (
        <div className="c-rise" style={rise(2)}>
          <span className="c-label mb-1.5 block !text-[10px]">Comprobante</span>
          <button
            type="button"
            onClick={() => setZoom((z) => !z)}
            className="block w-full overflow-hidden rounded-xl border border-[var(--c-line)]"
          >
            <img
              src={e.comprobante}
              alt="Comprobante"
              className={cn(
                'mx-auto w-full bg-[var(--c-sunk)] object-contain transition-all',
                zoom ? 'max-h-[70vh]' : 'max-h-[38vh]',
              )}
            />
          </button>
        </div>
      )}
    </div>
  )
}

function DetalleManga({ e }: { e: EntManga }) {
  return (
    <div className="space-y-2.5">
      <div className="c-rise relative overflow-hidden rounded-2xl bg-[var(--c-sunk)] p-4" style={rise(0)}>
        <Syringe
          className="pointer-events-none absolute -right-2 -top-2 size-20 text-[var(--c-ink)]/[0.06]"
          strokeWidth={2}
        />
        <span className="c-label relative !text-[11px]">Caravaneado</span>
        <div className="relative mt-1 text-[24px] font-bold leading-none text-[var(--c-ink)]">
          {e.categoria ?? 'Animal'}
        </div>
        <div className="relative mt-1.5 text-[12px] font-medium text-[var(--c-ink-soft)]">
          cargado {fmtDia(e.cargadoEn)}
        </div>
      </div>
      <div className="c-rise grid grid-cols-2 gap-2" style={rise(1)}>
        <Dato k="RFID" v={<span className="c-mono text-[13px]">{e.rfid}</span>} full />
        {e.visual && <Dato k="N° visual" v={<span className="c-mono">{e.visual}</span>} />}
        {e.estado && (
          <Dato k="Estado" v={e.estado === 'error' ? 'Error al subir' : 'Sin subir'} />
        )}
      </div>
    </div>
  )
}

function DetalleRecorrida({ e }: { e: EntRec }) {
  const [obs, setObs] = useState<ObsDetalle[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const d = await fetchRecorridaDetalle(e.id)
        if (vivo) setObs(d)
      } catch (x) {
        if (vivo) setErr(x instanceof Error ? x.message : 'No se pudo cargar')
      }
    })()
    return () => {
      vivo = false
    }
  }, [e.id])

  return (
    <div className="space-y-2.5">
      {/* Hero con stats */}
      <div className="c-rise relative overflow-hidden rounded-2xl bg-[var(--c-ok-soft)] p-4" style={rise(0)}>
        <Footprints
          className="pointer-events-none absolute -right-2 -top-2 size-20 text-[var(--c-ok)]/15"
          strokeWidth={2}
        />
        <span className="c-label relative !text-[11px] !text-[var(--c-ok-deep)]">
          {fmtFecha(e.fecha)} · cargado {fmtDia(e.cargadoEn)}
        </span>
        <div className="relative mt-1 text-[22px] font-bold leading-none text-[var(--c-ink)]">
          {e.campo ?? 'Campo'}
        </div>
        <div className="relative mt-2.5 flex gap-1.5">
          <span className="rounded-lg bg-[var(--c-panel)]/70 px-2.5 py-1 text-[12px] font-semibold text-[var(--c-ink)]">
            {e.potreros} potreros
          </span>
          {e.alertas > 0 && (
            <span className="flex items-center gap-1 rounded-lg bg-[var(--c-warn-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--c-warn-deep)]">
              <TriangleAlert className="size-3.5" />
              {e.alertas} con atención
            </span>
          )}
        </div>
      </div>

      {!obs && !err && (
        <div className="flex items-center gap-2 py-4 text-[var(--c-ink-soft)]">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-[13px]">Cargando potreros…</span>
        </div>
      )}
      {err && <p className="c-label py-3 !text-[12px] !text-[var(--c-bad)]">{err}</p>}

      <div className="space-y-1.5">
        {(obs ?? []).map((o, i) => {
          const chips = [
            o.pasto && PASTO[o.pasto],
            o.agua && AGUA[o.agua],
            o.electrico && ELEC[o.electrico],
            o.cultivo && CULT[o.cultivo],
            o.enTratamiento && 'En tratamiento',
          ].filter(Boolean) as string[]
          const alerta = esAlerta(o)
          return (
            <div
              key={i}
              className={cn(
                'c-rise rounded-xl border p-2.5',
                alerta
                  ? 'border-[var(--c-warn)]/45 bg-[var(--c-warn-soft)]'
                  : 'border-[var(--c-line)] bg-[var(--c-panel)]',
              )}
              style={rise(i + 1)}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--c-ink)]">
                  {alerta && <TriangleAlert className="size-3.5 text-[var(--c-warn-deep)]" />}
                  {o.potrero ?? 'Potrero'}
                </span>
                {o.conteo != null && (
                  <span className="c-mono text-[13px] font-bold text-[var(--c-ink)]">
                    {o.conteo} cab.
                  </span>
                )}
              </div>
              {chips.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {chips.map((c) => (
                    <span
                      key={c}
                      className={cn(
                        'rounded-md px-1.5 py-0.5 text-[10.5px] font-medium',
                        alerta
                          ? 'bg-[var(--c-panel)]/70 text-[var(--c-ink-soft)]'
                          : 'bg-[var(--c-sunk)] text-[var(--c-ink-soft)]',
                      )}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {o.novedad && (
                <p className="mt-1.5 text-[12.5px] text-[var(--c-ink-soft)]">{o.novedad}</p>
              )}
              {o.audioUrl && (
                <audio controls src={o.audioUrl} className="mt-2 h-9 w-full" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
