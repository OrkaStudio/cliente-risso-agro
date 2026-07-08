import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CloudOff,
  ImageIcon,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { platadb } from './plata/db'
import { fetchHistorial, type HistItem } from './plata/api'
import { CSheet } from './ui'

const money = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const fmtFecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y.slice(2)}`
}

type Filtro = 'todos' | 'gasto' | 'ingreso' | 'foto'

const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'gasto', label: 'Gastos' },
  { key: 'ingreso', label: 'Ingresos' },
  { key: 'foto', label: 'Con comprobante' },
]

/**
 * Historial del Modo Campo: mirar/confirmar desde el teléfono lo cargado, sin
 * salir a Oficina. Muestra lo "sin subir" del outbox local (con su foto local)
 * arriba y, con señal, los últimos movimientos del servidor con su comprobante
 * firmado. El filtro "Con comprobante" lo vuelve una galería de comprobantes.
 */
export function HistorialPage() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [items, setItems] = useState<HistItem[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [ver, setVer] = useState<string | null>(null)

  // Pendientes locales (aún no subidos): feedback inmediato de lo recién cargado.
  const pendientes = useLiveQuery(
    () => platadb.outbox.where('estado').notEqual('sincronizada').reverse().toArray(),
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

  const cargar = async () => {
    if (!navigator.onLine) {
      setCargando(false)
      return
    }
    setCargando(true)
    setError(null)
    try {
      setItems(await fetchHistorial())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 0)
    return () => clearTimeout(t)
  }, [online])

  // ObjectURLs para las fotos locales de los pendientes (se revocan al cambiar).
  const previews = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of pendientes ?? []) {
      if (p.foto) map.set(p.id, URL.createObjectURL(p.foto))
    }
    return map
  }, [pendientes])
  useEffect(() => {
    return () => {
      for (const url of previews.values()) URL.revokeObjectURL(url)
    }
  }, [previews])

  const pendMostrar = (pendientes ?? []).filter((p) => {
    if (filtro === 'gasto') return p.tipo === 'gasto'
    if (filtro === 'ingreso') return p.tipo === 'ingreso'
    if (filtro === 'foto') return !!p.foto
    return true
  })
  const itemsMostrar = items.filter((m) => {
    if (filtro === 'gasto') return m.tipo === 'gasto'
    if (filtro === 'ingreso') return m.tipo === 'ingreso'
    if (filtro === 'foto') return !!m.comprobanteUrl
    return true
  })
  const vacio =
    !cargando && pendMostrar.length === 0 && itemsMostrar.length === 0

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      <header className="shrink-0 border-b border-[var(--c-line)] bg-[var(--c-panel)] px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="c-display text-[16px] text-[var(--c-ink)]">Historial</span>
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={!online || cargando}
            aria-label="Actualizar"
            className="flex size-8 items-center justify-center rounded-lg border border-[var(--c-line-strong)] text-[var(--c-ink-soft)] disabled:opacity-40"
          >
            <RefreshCw className={cn('size-4', cargando && 'animate-spin')} />
          </button>
        </div>
        <div className="c-strip -mx-4 mt-2 flex gap-1.5 px-4">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFiltro(f.key)}
              className={cn(
                'shrink-0 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                filtro === f.key
                  ? 'border-[var(--c-ok)] bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]'
                  : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink-soft)]',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
        {/* Pendientes locales */}
        {pendMostrar.map((p) => (
          <Fila
            key={p.id}
            tipo={p.tipo}
            monto={p.monto}
            categoria={p.categoria_nombre}
            campo={null}
            fecha={p.fecha}
            descripcion={p.descripcion}
            thumb={previews.get(p.id) ?? null}
            sinSubir={p.estado === 'pendiente'}
            error={p.estado === 'error'}
            onVer={previews.get(p.id) ? () => setVer(previews.get(p.id)!) : undefined}
          />
        ))}

        {/* Servidor */}
        {itemsMostrar.map((m) => (
          <Fila
            key={m.id}
            tipo={m.tipo}
            monto={m.monto}
            categoria={m.categoria}
            campo={m.campo}
            fecha={m.fecha}
            descripcion={m.descripcion}
            iva={m.ivaTotal}
            thumb={m.comprobanteUrl}
            onVer={m.comprobanteUrl ? () => setVer(m.comprobanteUrl!) : undefined}
          />
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
                ? filtro === 'foto'
                  ? 'Todavía no cargaste ningún comprobante.'
                  : 'Lo que cargues en Plata va a aparecer acá.'
                : 'Conectate para ver el historial completo.'}
            </p>
          </div>
        )}

        {error && (
          <p className="c-label px-1 py-3 !text-[12px] !text-[var(--c-bad)]">{error}</p>
        )}
      </div>

      {/* Comprobante en grande */}
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

function Fila({
  tipo,
  monto,
  categoria,
  campo,
  fecha,
  descripcion,
  iva,
  thumb,
  sinSubir,
  error,
  onVer,
}: {
  tipo: 'gasto' | 'ingreso'
  monto: number
  categoria: string | null
  campo: string | null
  fecha: string
  descripcion: string | null
  iva?: number | null
  thumb: string | null
  sinSubir?: boolean
  error?: boolean
  onVer?: () => void
}) {
  const esGasto = tipo === 'gasto'
  return (
    <div className="c-panel flex items-center gap-3 !rounded-xl p-2.5">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          esGasto
            ? 'bg-[var(--c-sunk)] text-[var(--c-ink)]'
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
        <div className="truncate text-[14px] font-semibold text-[var(--c-ink)]">
          {categoria ?? (esGasto ? 'Gasto' : 'Ingreso')}
        </div>
        <div className="truncate text-[12px] text-[var(--c-ink-soft)]">
          {[fmtFecha(fecha), campo, descripcion].filter(Boolean).join(' · ')}
        </div>
        {(sinSubir || error) && (
          <span
            className={cn(
              'c-label mt-0.5 inline-block !text-[10px]',
              error ? '!text-[var(--c-bad)]' : '!text-[var(--c-warn-deep)]',
            )}
          >
            {error ? 'error al subir' : 'sin subir'}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right leading-tight">
          <div
            className={cn(
              'c-mono text-[14.5px] font-bold',
              esGasto ? 'text-[var(--c-ink)]' : 'text-[var(--c-ok-deep)]',
            )}
          >
            {esGasto ? '−' : '+'}
            {money(monto)}
          </div>
          {iva ? (
            <div className="c-label !text-[9.5px]">IVA {money(iva)}</div>
          ) : null}
        </div>
        {thumb ? (
          <button
            type="button"
            onClick={onVer}
            aria-label="Ver comprobante"
            className="size-10 shrink-0 overflow-hidden rounded-lg border border-[var(--c-line-strong)]"
          >
            <img src={thumb} alt="" className="size-full object-cover" />
          </button>
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--c-line-strong)] text-[var(--c-faint)]">
            <ImageIcon className="size-4" />
          </span>
        )}
      </div>
    </div>
  )
}
