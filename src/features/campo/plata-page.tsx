import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  Check,
  CloudOff,
  RotateCcw,
  Wifi,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlata } from './plata/use-plata'
import { fotoAJpegBlob, type TipoMov } from './plata/api'
import { CChip, CLabel, CNumpad } from './ui'

const fmt = (n: number) => `$${n.toLocaleString('es-AR')}`

// Detalles frecuentes: un toque en vez de tipear en la camioneta.
const DETALLES = ['Gasoil', 'Repuestos', 'Veterinaria', 'Ferretería', 'Flete', 'Comida'] as const

/**
 * Plata (Modo Campo): registrar UN gasto o ingreso ahí mismo, sin señal y
 * casi sin tipear: numpad propio (cero teclado del sistema), categorías y
 * detalle por chips, campo por bloques. Fecha = hoy, estado = liquidado;
 * lo fino (pendientes, cuotas, cheques, potrero) se completa en Oficina.
 */
export function PlataPage() {
  const p = usePlata()

  if (p.cargando) {
    return <p className="c-label p-8 text-center !text-[13px]">Cargando…</p>
  }

  if (p.categorias.length === 0 || p.campos.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <CloudOff className="size-10 text-[var(--c-faint)]" />
        <p className="c-display text-[16px] uppercase tracking-wide text-[var(--c-ink)]">
          {p.online
            ? 'Cargando categorías y campos…'
            : 'Sin señal y sin datos guardados'}
        </p>
        {!p.online && (
          <p className="text-[13.5px] text-[var(--c-ink-soft)]">
            Entrá una vez con señal para poder cargar plata sin conexión.
          </p>
        )}
        {p.online && (
          <button
            type="button"
            onClick={() => void p.cargarRefs()}
            className="c-display text-[14px] uppercase text-[var(--c-ok-deep)] underline underline-offset-4"
          >
            Reintentar
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      {/* ===== Barra de instrumento: señal · hoy · cola ===== */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-[var(--c-ink)] bg-[var(--c-panel)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          {p.online ? (
            <Wifi className="size-4 text-[var(--c-ok-deep)]" strokeWidth={2.5} />
          ) : (
            <CloudOff className="size-4 text-[var(--c-warn)]" strokeWidth={2.5} />
          )}
          <CLabel className={cn('!text-[11px]', !p.online && '!text-[var(--c-warn)]')}>
            {p.online ? 'Señal' : 'Sin señal'}
          </CLabel>
        </div>
        <div className="flex items-center gap-3">
          {p.hoyCantidad > 0 && (
            <div className="text-right leading-none">
              <span className="c-mono text-[15px] font-bold text-[var(--c-ink)]">
                {p.hoyGastos > 0 && `−${fmt(p.hoyGastos)}`}
                {p.hoyGastos > 0 && p.hoyIngresos > 0 && ' · '}
                {p.hoyIngresos > 0 && `+${fmt(p.hoyIngresos)}`}
              </span>
              <CLabel className="mt-0.5 text-right">
                Hoy · {p.hoyCantidad} {p.hoyCantidad === 1 ? 'carga' : 'cargas'}
              </CLabel>
            </div>
          )}
          <button
            type="button"
            onClick={() => void p.sincronizar()}
            disabled={!p.online || p.sinSubir === 0}
            className={cn(
              'c-label rounded-md border-2 px-2 py-1.5 !text-[10.5px]',
              p.sinSubir > 0
                ? 'c-hazard border-[var(--c-ink)] !text-[var(--c-ink)]'
                : 'border-transparent !text-[var(--c-faint)]',
            )}
          >
            {p.sinSubir > 0 ? `${p.sinSubir} sin subir` : 'Al día'}
          </button>
        </div>
      </header>

      {/* Último cargado: ticker + deshacer mientras no subió */}
      {p.ultimo && p.ultimo.estado !== 'error' && (
        <div className="shrink-0 px-4 pt-2.5">
          <motion.div
            key={p.ultimo.id}
            className="c-stamp flex items-center justify-between gap-2 rounded-lg border-2 border-[var(--c-ok-deep)] bg-[var(--c-ok-soft)] px-3 py-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Check className="size-4 shrink-0 text-[var(--c-ok-deep)]" strokeWidth={3} />
              <span className="c-mono truncate text-[13.5px] font-bold text-[var(--c-ok-deep)]">
                {p.ultimo.tipo === 'gasto' ? '−' : '+'}
                {fmt(p.ultimo.monto)}
              </span>
              <span className="c-label truncate">{p.ultimo.categoria_nombre}</span>
            </span>
            {p.ultimo.estado === 'pendiente' && (
              <button
                type="button"
                onClick={() => void p.deshacer(p.ultimo!.id)}
                className="c-label flex shrink-0 items-center gap-1 rounded-md border-2 border-[var(--c-ink)] bg-[var(--c-panel)] px-2 py-1 !text-[10.5px]"
              >
                <RotateCcw className="size-3" />
                Deshacer
              </button>
            )}
          </motion.div>
        </div>
      )}

      {p.errores.length > 0 && (
        <div className="shrink-0 px-4 pt-2.5">
          <div className="flex flex-col gap-1 rounded-lg border-2 border-[var(--c-bad)] bg-[var(--c-bad-soft)] p-2.5">
            <div className="c-label flex items-center gap-1.5 !text-[11px] !text-[var(--c-bad)]">
              <AlertTriangle className="size-3.5" />
              {p.errores.length} con problema al subir
            </div>
            {p.errores.slice(0, 2).map((e) => (
              <p key={e.id} className="text-[12px] text-[var(--c-ink-soft)]">
                <span className="c-mono font-bold">{fmt(e.monto)}</span> {e.categoria_nombre}: {e.error}
              </p>
            ))}
            <button
              type="button"
              onClick={() => void p.reintentarErrores()}
              disabled={!p.online}
              className="c-label self-start !text-[11px] !text-[var(--c-bad)] underline underline-offset-2 disabled:opacity-50"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      <PlataForm p={p} />
    </div>
  )
}

function PlataForm({ p }: { p: ReturnType<typeof usePlata> }) {
  const [tipo, setTipo] = useState<TipoMov>('gasto')
  const [monto, setMonto] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [campoId, setCampoId] = useState(p.campoDefault)
  const [detalles, setDetalles] = useState<Set<string>>(new Set())
  const [detalleLibre, setDetalleLibre] = useState('')
  const [foto, setFoto] = useState<Blob | null>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [procesandoFoto, setProcesandoFoto] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const montoNum = Number(monto)
  const categorias = p.categorias.filter(
    (c) => c.aplica_a === null || c.aplica_a === tipo,
  )
  const esGasto = tipo === 'gasto'

  const cambiarTipo = (t: TipoMov) => {
    setTipo(t)
    const cat = p.categorias.find((c) => c.id === categoriaId)
    if (cat && cat.aplica_a !== null && cat.aplica_a !== t) setCategoriaId('')
  }

  const toggleDetalle = (d: string) => {
    setDetalles((prev) => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })
  }

  const limpiarFoto = () => {
    if (fotoUrl) URL.revokeObjectURL(fotoUrl)
    setFoto(null)
    setFotoUrl(null)
  }

  async function onElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setProcesandoFoto(true)
    try {
      const blob = await fotoAJpegBlob(file)
      limpiarFoto()
      setFoto(blob)
      setFotoUrl(URL.createObjectURL(blob))
    } catch {
      setAviso('No se pudo procesar la foto')
    } finally {
      setProcesandoFoto(false)
    }
  }

  const guardar = async () => {
    if (!montoNum || montoNum <= 0) return setAviso('Poné el monto')
    if (!categoriaId) return setAviso('Elegí la categoría')
    if (!campoId) return setAviso('Elegí el campo')
    const campo = p.campos.find((c) => c.id === campoId)
    const cat = p.categorias.find((c) => c.id === categoriaId)
    if (!campo || !cat) return
    if ('vibrate' in navigator) navigator.vibrate(50)
    const descripcion = [...detalles, detalleLibre.trim()]
      .filter(Boolean)
      .join(' · ')
    await p.guardar({
      tipo,
      monto: montoNum,
      categoriaId: cat.id,
      categoriaNombre: cat.nombre,
      campoId: campo.id,
      empresaId: campo.empresa_id,
      descripcion,
      foto,
    })
    // Listo para la próxima: quedan tipo y campo (cargas seguidas).
    setMonto('')
    setCategoriaId('')
    setDetalles(new Set())
    setDetalleLibre('')
    limpiarFoto()
    setAviso(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-2.5">
        {/* Tipo: dos bloques — gasto tinta, ingreso verde */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => cambiarTipo('gasto')}
            className={cn(
              'c-display flex h-12 items-center justify-center gap-2 rounded-lg border-2 text-[15px] uppercase tracking-wide transition-colors',
              esGasto
                ? 'c-hard-sm border-[var(--c-ink)] bg-[var(--c-ink)] text-[var(--c-panel)]'
                : 'border-[var(--c-ink)]/25 bg-[var(--c-panel)] text-[var(--c-ink-soft)]',
            )}
          >
            <ArrowUpRight className="size-4.5" strokeWidth={2.5} />
            Gasto
          </button>
          <button
            type="button"
            onClick={() => cambiarTipo('ingreso')}
            className={cn(
              'c-display flex h-12 items-center justify-center gap-2 rounded-lg border-2 text-[15px] uppercase tracking-wide transition-colors',
              !esGasto
                ? 'c-hard-sm border-[var(--c-ink)] bg-[var(--c-ok)] text-white'
                : 'border-[var(--c-ink)]/25 bg-[var(--c-panel)] text-[var(--c-ok-deep)]',
            )}
          >
            <ArrowDownLeft className="size-4.5" strokeWidth={2.5} />
            Ingreso
          </button>
        </div>

        {/* Visor de monto + numpad propio (cero teclado del sistema) */}
        <div>
          <div
            className={cn(
              'c-panel flex h-13 items-center justify-between px-4',
              aviso === 'Poné el monto' && 'border-[var(--c-bad)]',
            )}
          >
            <span className={cn('c-label !text-[12px]', esGasto ? '!text-[var(--c-ink-soft)]' : '!text-[var(--c-ok-deep)]')}>
              {esGasto ? 'Sale −' : 'Entra +'}
            </span>
            <span
              className={cn(
                'c-mono text-[28px] font-bold leading-none',
                monto ? 'text-[var(--c-ink)]' : 'text-[var(--c-faint)]',
              )}
            >
              ${monto ? Number(monto).toLocaleString('es-AR') : '0'}
            </span>
          </div>
          <CNumpad
            className="mt-1.5"
            onDigit={(d) => {
              setMonto((m) => (m + d).replace(/^0+(?=\d)/, '').slice(0, 10))
              if (aviso) setAviso(null)
            }}
            onBackspace={() => setMonto((m) => m.slice(0, -1))}
          />
        </div>

        {/* Categoría: chips a la vista, un toque */}
        <div>
          <CLabel className={cn('mb-1.5', aviso === 'Elegí la categoría' && '!text-[var(--c-bad)]')}>
            Categoría {esGasto ? 'del gasto' : 'del ingreso'}
          </CLabel>
          <div className="flex flex-wrap gap-1.5">
            {categorias.map((c) => (
              <CChip
                key={c.id}
                label={c.nombre}
                selected={categoriaId === c.id}
                onClick={() => {
                  setCategoriaId(c.id)
                  if (aviso) setAviso(null)
                }}
              />
            ))}
          </div>
        </div>

        {/* Campo: bloques (son 2-3, siempre a la vista) */}
        <div>
          <CLabel className="mb-1.5">Campo</CLabel>
          <div className="flex gap-1.5">
            {p.campos.map((c) => (
              <CChip
                key={c.id}
                label={c.nombre}
                selected={campoId === c.id}
                onClick={() => setCampoId(c.id)}
                className="flex-1 truncate text-center"
              />
            ))}
          </div>
        </div>

        {/* Detalle por chips + libre (opcional) */}
        <div>
          <CLabel className="mb-1.5">Detalle · opcional</CLabel>
          <div className="c-strip -mx-4 flex gap-1.5 px-4">
            {DETALLES.map((d) => (
              <CChip
                key={d}
                label={d}
                selected={detalles.has(d)}
                onClick={() => toggleDetalle(d)}
              />
            ))}
          </div>
          <input
            value={detalleLibre}
            onChange={(e) => setDetalleLibre(e.target.value)}
            autoComplete="off"
            placeholder="Otro detalle…"
            className="mt-1.5 h-10 w-full rounded-lg border-2 border-[var(--c-ink)]/25 bg-[var(--c-panel)] px-3 text-[14px] text-[var(--c-ink)] outline-none focus:border-[var(--c-ink)]"
          />
        </div>

        {/* Foto del comprobante */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void onElegirFoto(e)}
          className="hidden"
        />
        {fotoUrl ? (
          <div className="c-panel flex items-center gap-3 p-2.5">
            <img
              src={fotoUrl}
              alt="Comprobante"
              className="h-12 w-12 shrink-0 rounded-md border-2 border-[var(--c-ink)] object-cover"
            />
            <span className="c-label min-w-0 flex-1 !text-[12px]">Foto lista</span>
            <button
              type="button"
              onClick={limpiarFoto}
              aria-label="Quitar foto"
              className="flex size-9 shrink-0 items-center justify-center rounded-md border-2 border-[var(--c-ink)]/30 text-[var(--c-ink-soft)]"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={procesandoFoto}
            className="c-label flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--c-ink)]/40 bg-[var(--c-panel)]/60 py-3 !text-[12px] disabled:opacity-60"
          >
            <Camera className="size-4.5" />
            {procesandoFoto ? 'Procesando…' : 'Foto del comprobante · opcional'}
          </button>
        )}

        {aviso && (
          <p className="c-label flex items-center gap-1 !text-[12px] !text-[var(--c-bad)]">
            <AlertTriangle className="size-3.5" />
            {aviso}
          </p>
        )}
      </div>

      {/* Acción principal: footer fijo */}
      <div className="shrink-0 border-t-2 border-[var(--c-ink)] bg-[var(--c-bg)] px-4 pb-3.5 pt-3">
        <button
          type="button"
          onClick={() => void guardar()}
          className={cn(
            'c-display c-hard flex h-15 w-full items-center justify-center gap-2.5 rounded-xl border-2 border-[var(--c-ink)] text-[19px] uppercase tracking-wide',
            esGasto
              ? 'bg-[var(--c-ink)] text-[var(--c-panel)]'
              : 'bg-[var(--c-ok)] text-white',
          )}
        >
          <Check className="size-6" strokeWidth={2.5} />
          Guardar {esGasto ? 'gasto' : 'ingreso'}
        </button>
      </div>
    </div>
  )
}
