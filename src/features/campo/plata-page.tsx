import { useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Camera,
  Check,
  ChevronDown,
  CloudOff,
  Landmark,
  Mic,
  Pencil,
  RotateCcw,
  Repeat,
  Wifi,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlata } from './plata/use-plata'
import { fotoAJpegBlob, type MedioPago, type TipoMov } from './plata/api'
import { CChip, CLabel, CNumpad, CSheet, NotaVoz } from './ui'

const fmt = (n: number) => `$${n.toLocaleString('es-AR')}`
const fmtCorto = (n: number) =>
  n >= 1000 && n % 1000 === 0 ? `$${(n / 1000).toLocaleString('es-AR')}k` : fmt(n)

// Detalles frecuentes: un toque en vez de tipear en la camioneta.
const DETALLES = ['Gasoil', 'Repuestos', 'Veterinaria', 'Ferretería', 'Flete', 'Comida'] as const

/**
 * Plata v2 (spec plata-carga-rapida): cargar un gasto común en <5 segundos.
 * Tres zonas fijas sin scroll — visor de monto con el toggle integrado +
 * montos frecuentes, numpad, y DOS filas: obligatorios (categoría/campo como
 * chips-con-valor que abren hoja) y opcionales (foto · detalle · efectivo ·
 * transf · voz). "Otra vez lo mismo" repite la última carga en un toque.
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
        <p className="c-display text-[16px] text-[var(--c-ink)]">
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
            className="c-display text-[14px] text-[var(--c-ok-deep)] underline underline-offset-4"
          >
            Reintentar
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      {/* ===== Barra: señal · hoy · cola ===== */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--c-line)] bg-[var(--c-panel)] px-4 py-2">
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
              <span className="c-mono text-[14px] font-bold text-[var(--c-ink)]">
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
              'c-label rounded-md border px-2 py-1.5 !text-[10.5px]',
              p.sinSubir > 0 ? 'c-hazard' : 'border-transparent !text-[var(--c-faint)]',
            )}
          >
            {p.sinSubir > 0 ? `${p.sinSubir} sin subir` : 'Al día'}
          </button>
        </div>
      </header>

      {p.errores.length > 0 && (
        <div className="shrink-0 px-4 pt-2">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--c-bad)]/45 bg-[var(--c-bad-soft)] px-2.5 py-1.5">
            <span className="c-label flex min-w-0 items-center gap-1.5 !text-[11px] !text-[var(--c-bad)]">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span className="truncate">
                {p.errores.length} con problema · {p.errores[0].error}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void p.reintentarErrores()}
              disabled={!p.online}
              className="c-label shrink-0 !text-[11px] !text-[var(--c-bad)] underline underline-offset-2 disabled:opacity-50"
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

type Hoja = null | 'categoria' | 'campo'

function PlataForm({ p }: { p: ReturnType<typeof usePlata> }) {
  const [tipo, setTipo] = useState<TipoMov>('gasto')
  const [monto, setMonto] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [campoId, setCampoId] = useState(p.campoDefault)
  const [medio, setMedio] = useState<MedioPago | null>(null)
  const [detalles, setDetalles] = useState<Set<string>>(new Set())
  const [detalleLibre, setDetalleLibre] = useState('')
  const [abrirDetalle, setAbrirDetalle] = useState(false)
  const [abrirVoz, setAbrirVoz] = useState(false)
  const [audio, setAudio] = useState<Blob | null>(null)
  const [foto, setFoto] = useState<Blob | null>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [procesandoFoto, setProcesandoFoto] = useState(false)
  const [hoja, setHoja] = useState<Hoja>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const montoNum = Number(monto)
  const categorias = p.categorias.filter(
    (c) => c.aplica_a === null || c.aplica_a === tipo,
  )
  const esGasto = tipo === 'gasto'
  const categoria = p.categorias.find((c) => c.id === categoriaId)
  const campo = p.campos.find((c) => c.id === campoId)

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

  /** "Otra vez lo mismo": repite la última carga (sin foto ni audio — esos
   *  son del día). El monto queda listo para ajustar con el numpad. */
  const repetirUltima = () => {
    const u = p.ultimo
    if (!u) return
    setTipo(u.tipo)
    setMonto(String(u.monto))
    setCategoriaId(u.categoria_id)
    setCampoId(u.campo_id)
    setMedio(u.medio_pago)
    const partes = (u.descripcion ?? '').split(' · ').filter(Boolean)
    setDetalles(new Set(partes.filter((x) => (DETALLES as readonly string[]).includes(x))))
    setDetalleLibre(partes.filter((x) => !(DETALLES as readonly string[]).includes(x)).join(' · '))
    setAviso(null)
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
    if (!campo || !categoria) return setAviso('Elegí el campo')
    if ('vibrate' in navigator) navigator.vibrate(50)
    const descripcion = [...detalles, detalleLibre.trim()].filter(Boolean).join(' · ')
    await p.guardar({
      tipo,
      monto: montoNum,
      categoriaId: categoria.id,
      categoriaNombre: categoria.nombre,
      campoId: campo.id,
      empresaId: campo.empresa_id,
      descripcion,
      medioPago: medio,
      foto,
      audio,
    })
    // Lista para la próxima: quedan tipo y campo (cargas seguidas).
    setMonto('')
    setCategoriaId('')
    setMedio(null)
    setDetalles(new Set())
    setDetalleLibre('')
    setAbrirDetalle(false)
    setAbrirVoz(false)
    setAudio(null)
    limpiarFoto()
    setAviso(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-2.5">
        {/* Otra vez lo mismo: la carga recurrente en un toque */}
        {p.ultimo && p.ultimo.estado !== 'error' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={repetirUltima}
              className="c-hard-sm flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--c-ok)]/45 bg-[var(--c-ok-soft)] px-3 text-left"
            >
              <Repeat className="size-4 shrink-0 text-[var(--c-ok-deep)]" />
              <span className="c-mono shrink-0 text-[13.5px] font-bold text-[var(--c-ok-deep)]">
                {p.ultimo.tipo === 'gasto' ? '−' : '+'}
                {fmt(p.ultimo.monto)}
              </span>
              <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--c-ink-soft)]">
                {p.ultimo.categoria_nombre}
                {p.ultimo.descripcion ? ` · ${p.ultimo.descripcion}` : ''}
              </span>
              <span className="c-label ml-auto shrink-0 !text-[10px] !text-[var(--c-ok-deep)]">
                otra vez
              </span>
            </button>
            {p.ultimo.estado === 'pendiente' && (
              <button
                type="button"
                onClick={() => void p.deshacer(p.ultimo!.id)}
                aria-label="Deshacer última carga"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink-soft)] active:scale-95"
              >
                <RotateCcw className="size-4" />
              </button>
            )}
          </div>
        )}

        {/* ===== Zona 1 · Visor: toggle integrado + monto rey ===== */}
        <div
          className={cn(
            'c-panel flex items-stretch overflow-hidden',
            aviso === 'Poné el monto' && '!border-[var(--c-bad)]/60',
          )}
        >
          <div className="flex w-[104px] shrink-0 flex-col border-r border-[var(--c-line)]">
            <button
              type="button"
              onClick={() => cambiarTipo('gasto')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 text-[13.5px] font-semibold transition-colors',
                esGasto
                  ? 'bg-[var(--c-ink)] text-white'
                  : 'bg-[var(--c-panel)] text-[var(--c-faint)]',
              )}
            >
              <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
              Gasto
            </button>
            <button
              type="button"
              onClick={() => cambiarTipo('ingreso')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 border-t border-[var(--c-line)] text-[13.5px] font-semibold transition-colors',
                !esGasto
                  ? 'bg-[var(--c-ok)] text-white'
                  : 'bg-[var(--c-panel)] text-[var(--c-faint)]',
              )}
            >
              <ArrowDownLeft className="size-3.5" strokeWidth={2.5} />
              Ingreso
            </button>
          </div>
          <div className="flex h-[72px] min-w-0 flex-1 items-center justify-end px-4">
            <span
              className={cn(
                'c-mono truncate text-[34px] font-bold leading-none',
                monto
                  ? esGasto
                    ? 'text-[var(--c-ink)]'
                    : 'text-[var(--c-ok-deep)]'
                  : 'text-[var(--c-faint)]',
              )}
            >
              {esGasto ? '−' : '+'}${monto ? Number(monto).toLocaleString('es-AR') : '0'}
            </span>
          </div>
        </div>

        {/* Montos frecuentes: un toque */}
        <div className="grid grid-cols-4 gap-1.5">
          {p.montosFrecuentes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMonto(String(m))
                if (aviso) setAviso(null)
              }}
              className="c-mono h-9 rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[13px] font-bold text-[var(--c-ink-soft)] transition-transform active:scale-95"
            >
              {fmtCorto(m)}
            </button>
          ))}
        </div>

        {/* ===== Zona 2 · Numpad ===== */}
        <CNumpad
          onDigit={(d) => {
            setMonto((m) => (m + d).replace(/^0+(?=\d)/, '').slice(0, 10))
            if (aviso) setAviso(null)
          }}
          onBackspace={() => setMonto((m) => m.slice(0, -1))}
        />

        {/* ===== Zona 3 · Obligatorios: chips-con-valor → hoja ===== */}
        <div className="grid grid-cols-2 gap-1.5">
          <Selector
            label="Categoría"
            valor={categoria?.nombre ?? null}
            alerta={aviso === 'Elegí la categoría'}
            onClick={() => setHoja('categoria')}
          />
          <Selector
            label="Campo"
            valor={campo?.nombre ?? null}
            alerta={aviso === 'Elegí el campo'}
            onClick={() => setHoja('campo')}
          />
        </div>

        {/* Opcionales: una fila — foto · detalle · medio de pago · voz */}
        <div className="grid grid-cols-5 gap-1.5">
          {/* Sin `capture`: el chooser nativo ofrece cámara O galería. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => void onElegirFoto(e)}
            className="hidden"
          />
          <Opcional
            icon={<Camera className="size-4.5" />}
            label={procesandoFoto ? '…' : 'Foto'}
            activo={!!foto}
            onClick={() => (foto ? limpiarFoto() : fileRef.current?.click())}
          />
          <Opcional
            icon={<Pencil className="size-4.5" />}
            label="Detalle"
            activo={abrirDetalle || detalles.size > 0 || !!detalleLibre.trim()}
            onClick={() => setAbrirDetalle((v) => !v)}
          />
          <Opcional
            icon={<Banknote className="size-4.5" />}
            label="Efect."
            activo={medio === 'efectivo'}
            onClick={() => setMedio((m) => (m === 'efectivo' ? null : 'efectivo'))}
          />
          <Opcional
            icon={<Landmark className="size-4.5" />}
            label="Transf."
            activo={medio === 'transferencia'}
            onClick={() =>
              setMedio((m) => (m === 'transferencia' ? null : 'transferencia'))
            }
          />
          <Opcional
            icon={<Mic className="size-4.5" />}
            label="Voz"
            activo={!!audio || abrirVoz}
            onClick={() => setAbrirVoz((v) => !v)}
          />
        </div>

        {/* Expansiones (solo si se activan — el default queda compacto) */}
        {foto && fotoUrl && (
          <div className="flex items-center gap-2.5 rounded-xl border border-[var(--c-line)] bg-[var(--c-panel)] p-2">
            <img
              src={fotoUrl}
              alt="Comprobante"
              className="h-10 w-10 shrink-0 rounded-lg object-cover"
            />
            <span className="c-label min-w-0 flex-1 !text-[11px]">Foto lista</span>
            <button
              type="button"
              onClick={limpiarFoto}
              aria-label="Quitar foto"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--c-line-strong)] text-[var(--c-ink-soft)]"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {abrirDetalle && (
          <div>
            <div className="c-strip -mx-4 flex gap-1.5 px-4">
              {DETALLES.map((d) => (
                <CChip
                  key={d}
                  label={d}
                  selected={detalles.has(d)}
                  onClick={() => toggleDetalle(d)}
                  className="!py-1.5 !text-[12.5px]"
                />
              ))}
            </div>
            <input
              value={detalleLibre}
              onChange={(e) => setDetalleLibre(e.target.value)}
              autoComplete="off"
              placeholder="Otro detalle…"
              className="mt-1.5 h-9 w-full rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 text-[13.5px] text-[var(--c-ink)] outline-none focus:border-[var(--c-ok)]"
            />
          </div>
        )}
        {(abrirVoz || audio) && <NotaVoz audio={audio} onAudio={setAudio} />}

        {aviso && (
          <p className="c-label flex items-center gap-1 !text-[12px] !text-[var(--c-bad)]">
            <AlertTriangle className="size-3.5" />
            {aviso}
          </p>
        )}
      </div>

      {/* Acción principal: footer fijo */}
      <div className="shrink-0 border-t border-[var(--c-line)] bg-[var(--c-bg)] px-4 pb-3.5 pt-2.5">
        <button
          type="button"
          onClick={() => void guardar()}
          className={cn(
            'c-display c-hard flex h-14 w-full items-center justify-center gap-2.5 rounded-xl border border-transparent text-[18px]',
            esGasto ? 'bg-[var(--c-ink)] text-white' : 'bg-[var(--c-ok)] text-white',
          )}
        >
          <Check className="size-6" strokeWidth={2.5} />
          Guardar {esGasto ? 'gasto' : 'ingreso'}
        </button>
      </div>

      {/* Hojas de selección: botones grandes, nada de listas apretadas */}
      <CSheet
        open={hoja === 'categoria'}
        title={`Categoría del ${esGasto ? 'gasto' : 'ingreso'}`}
        onClose={() => setHoja(null)}
      >
        <div className="grid grid-cols-2 gap-1.5">
          {categorias.map((c) => (
            <BotonHoja
              key={c.id}
              label={c.nombre}
              selected={categoriaId === c.id}
              onClick={() => {
                setCategoriaId(c.id)
                setHoja(null)
                if (aviso) setAviso(null)
              }}
            />
          ))}
        </div>
      </CSheet>
      <CSheet open={hoja === 'campo'} title="Campo" onClose={() => setHoja(null)}>
        <div className="grid grid-cols-2 gap-1.5">
          {p.campos.map((c) => (
            <BotonHoja
              key={c.id}
              label={c.nombre}
              selected={campoId === c.id}
              onClick={() => {
                setCampoId(c.id)
                setHoja(null)
                if (aviso) setAviso(null)
              }}
            />
          ))}
        </div>
      </CSheet>
    </div>
  )
}

/** Chip-con-valor de obligatorio: muestra lo elegido, abre la hoja. */
function Selector({
  label,
  valor,
  alerta,
  onClick,
}: {
  label: string
  valor: string | null
  alerta: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-12 items-center justify-between rounded-xl border px-3 text-left transition-colors',
        alerta
          ? 'border-[var(--c-bad)]/60 bg-[var(--c-panel)]'
          : valor
            ? 'border-[var(--c-ok)]/45 bg-[var(--c-ok-soft)]'
            : 'border-[var(--c-line-strong)] bg-[var(--c-panel)]',
      )}
    >
      <span className="min-w-0">
        <CLabel className="!text-[9.5px]">{label}</CLabel>
        <span
          className={cn(
            'block truncate text-[14px] font-semibold leading-tight',
            valor ? 'text-[var(--c-ok-deep)]' : 'text-[var(--c-faint)]',
          )}
        >
          {valor ?? 'Elegí…'}
        </span>
      </span>
      <ChevronDown className="size-4 shrink-0 text-[var(--c-faint)]" />
    </button>
  )
}

/** Toggle compacto de la fila de opcionales. */
function Opcional({
  icon,
  label,
  activo,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  activo: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl border transition-colors active:scale-95',
        activo
          ? 'border-[var(--c-ok)]/45 bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]'
          : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink-soft)]',
      )}
    >
      {icon}
      <span className="c-label !text-[9px] !text-current">{label}</span>
    </button>
  )
}

/** Botón grande de hoja de selección. */
function BotonHoja({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-12 rounded-xl border text-[14.5px] font-semibold transition-colors',
        selected
          ? 'border-[var(--c-ok)] bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]'
          : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink-soft)]',
      )}
    >
      {label}
    </button>
  )
}
