import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CloudOff,
  Footprints,
  Image as ImageIcon,
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
  type MangaHist,
  type RecorridaHist,
} from './historial/api'
import { categoriaLabel } from '@/features/hacienda/labels'
import { CSheet } from './ui'

const money = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const fmtDia = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  return `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

type Seccion = 'gastos' | 'manga' | 'recorrida'
const SECCIONES: { key: Seccion; label: string }[] = [
  { key: 'gastos', label: 'Gastos' },
  { key: 'manga', label: 'Manga' },
  { key: 'recorrida', label: 'Recorrida' },
]

// Entradas normalizadas: todo lleva `cargadoEn` (ISO) para agrupar por semana.
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
 * segmentado por Gastos · Manga · Recorrida y agrupado por semana (por cuándo
 * se cargó). Doble check rápido desde el teléfono, sin salir a Oficina. Lo
 * "sin subir" del outbox local aparece arriba con su badge.
 */
export function HistorialPage() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [seccion, setSeccion] = useState<Seccion>('gastos')
  const [gastos, setGastos] = useState<HistItem[]>([])
  const [manga, setManga] = useState<MangaHist[]>([])
  const [recorridas, setRecorridas] = useState<RecorridaHist[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ver, setVer] = useState<string | null>(null)

  // Pendientes locales (feedback inmediato de lo recién cargado).
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
      if (s === 'gastos') setGastos(await fetchHistorial())
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

  // ObjectURLs de las fotos locales pendientes (gastos).
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

  // Entradas de la sección activa (pendientes + servidor) → por semana.
  const grupos = useMemo(() => {
    let ent: Entrada[]
    if (seccion === 'gastos') {
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
      }))
      ent = [...pend, ...srv]
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
  }, [seccion, gastos, manga, recorridas, gastosPend, mangaPend, previews])

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
        {/* Segmentado Gastos · Manga · Recorrida */}
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
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {grupos.map((g) => (
          <div key={g.key} className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between px-0.5">
              <span className="c-label !text-[11px] !text-[var(--c-ink-soft)]">{g.label}</span>
              <span className="c-label !text-[10px] !text-[var(--c-faint)]">
                {g.items.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {g.items.map((e) =>
                e.kind === 'gasto' ? (
                  <FilaGasto key={e.id} e={e} onVer={() => e.comprobante && setVer(e.comprobante)} />
                ) : e.kind === 'manga' ? (
                  <FilaManga key={e.id} e={e} />
                ) : (
                  <FilaRecorrida key={e.id} e={e} />
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

      <CSheet open={!!ver} title="Comprobante" onClose={() => setVer(null)}>
        {ver && (
          <img
            src={ver}
            alt="Comprobante"
            className="mx-auto max-h-[60vh] w-full rounded-xl object-contain"
          />
        )}
      </CSheet>
    </div>
  )
}

// ===== Filas =====

function Badge({ estado }: { estado?: 'pendiente' | 'error' }) {
  if (!estado) return null
  return (
    <span
      className={cn(
        'c-label shrink-0 rounded px-1 py-0.5 !text-[9px]',
        estado === 'error'
          ? 'bg-[var(--c-bad-soft)] !text-[var(--c-bad)]'
          : 'bg-[var(--c-warn-soft)] !text-[var(--c-warn-deep)]',
      )}
    >
      {estado === 'error' ? 'error' : 'sin subir'}
    </span>
  )
}

/** Card base con acento de color a la izquierda (identifica el tipo). */
function Card({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <div className="c-panel flex items-stretch gap-0 overflow-hidden !rounded-xl">
      <span className="w-1 shrink-0" style={{ background: accent }} />
      <div className="flex flex-1 items-center gap-3 p-2.5 pl-3">{children}</div>
    </div>
  )
}

function FilaGasto({ e, onVer }: { e: EntGasto; onVer: () => void }) {
  const esGasto = e.tipo === 'gasto'
  const accent = esGasto ? 'var(--c-warn)' : 'var(--c-ok)'
  return (
    <Card accent={accent}>
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
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
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[14px] font-semibold text-[var(--c-ink)]">
          {e.categoria ?? (esGasto ? 'Gasto' : 'Ingreso')}
        </span>
        <div className="flex min-w-0 items-center gap-1">
          <Badge estado={e.estado} />
          <span className="truncate text-[12px] text-[var(--c-ink-soft)]">
            {[e.campo, e.descripcion].filter(Boolean).join(' · ') ||
              (esGasto ? 'Gasto' : 'Ingreso')}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div
          className={cn(
            'c-mono text-right text-[14.5px] font-bold',
            esGasto ? 'text-[var(--c-warn-deep)]' : 'text-[var(--c-ok-deep)]',
          )}
        >
          {esGasto ? '−' : '+'}
          {money(e.monto)}
        </div>
        {e.comprobante ? (
          <button
            type="button"
            onClick={onVer}
            aria-label="Ver comprobante"
            className="size-10 shrink-0 overflow-hidden rounded-lg border border-[var(--c-line-strong)]"
          >
            <img src={e.comprobante} alt="" className="size-full object-cover" />
          </button>
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--c-line-strong)] text-[var(--c-faint)]">
            <ImageIcon className="size-4" />
          </span>
        )}
      </div>
    </Card>
  )
}

function FilaManga({ e }: { e: EntManga }) {
  return (
    <Card accent="var(--c-mid)">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--c-sunk)] text-[var(--c-ink)]">
        <Syringe className="size-4.5" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold text-[var(--c-ink)]">
            {e.categoria ?? 'Caravaneado'}
          </span>
          <Badge estado={e.estado} />
        </div>
        <div className="c-mono truncate text-[12px] text-[var(--c-ink-soft)]">
          RFID …{e.rfid.slice(-6)}
          {e.visual ? ` · N° ${e.visual}` : ''}
        </div>
      </div>
      <span className="shrink-0 text-[11.5px] font-medium text-[var(--c-faint)]">
        {fmtDia(e.cargadoEn)}
      </span>
    </Card>
  )
}

function FilaRecorrida({ e }: { e: EntRec }) {
  return (
    <Card accent="var(--c-ok)">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]">
        <Footprints className="size-4.5" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[14px] font-semibold text-[var(--c-ink)]">
          Recorrida{e.campo ? ` · ${e.campo}` : ''}
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[var(--c-ink-soft)]">
          <span>{e.potreros} potreros</span>
          {e.alertas > 0 && (
            <span className="flex items-center gap-0.5 font-semibold text-[var(--c-warn-deep)]">
              <TriangleAlert className="size-3" />
              {e.alertas}
            </span>
          )}
        </div>
      </div>
      <span className="shrink-0 text-[11.5px] font-medium text-[var(--c-faint)]">
        {fmtDia(e.fecha)}
      </span>
    </Card>
  )
}
