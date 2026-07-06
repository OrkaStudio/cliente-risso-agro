import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  Check,
  CloudOff,
  RefreshCw,
  RotateCcw,
  Wifi,
  X,
} from 'lucide-react'
import { Dropdown } from '@/components/ui/dropdown'
import { cn } from '@/lib/utils'
import { usePlata } from './plata/use-plata'
import { fotoAJpegBlob, type TipoMov } from './plata/api'

const fmtMonto = (n: number) => `$${n.toLocaleString('es-AR')}`

/**
 * Plata (Modo Campo): registrar UN gasto o ingreso ahí mismo, sin señal.
 * Mínimo viable de campo: tipo + monto + categoría + campo (+ foto y detalle
 * opcionales). Fecha = hoy, estado = liquidado. Todo lo demás (pendientes,
 * cuotas, cheques, potrero, actividad) se completa/edita en Oficina.
 * Offline-first con el mismo patrón outbox que manga/recorrida.
 */
export function PlataPage() {
  const p = usePlata()

  if (p.cargando) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        Cargando…
      </p>
    )
  }

  // Sin cache y sin señal: no hay categorías/campos para armar el form.
  if (p.categorias.length === 0 || p.campos.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <CloudOff className="size-10 text-faint" />
        <p className="text-[15px] font-semibold text-ink">
          {p.online
            ? 'Cargando categorías y campos…'
            : 'Sin señal y sin datos guardados.'}
        </p>
        {!p.online && (
          <p className="text-[13.5px] text-ink-soft">
            Entrá una vez con señal para poder cargar plata sin conexión.
          </p>
        )}
        {p.online && (
          <button
            type="button"
            onClick={() => void p.cargarRefs()}
            className="text-[13.5px] font-semibold text-field"
          >
            Reintentar
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      {/* ===== Header fijo: estado de señal + sin subir ===== */}
      <header className="flex shrink-0 items-center justify-between border-b border-border/70 bg-background px-5 py-3 text-[13px]">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 font-bold',
            p.online ? 'text-field' : 'text-accent',
          )}
        >
          {p.online ? (
            <Wifi className="size-[18px]" />
          ) : (
            <CloudOff className="size-[18px]" />
          )}
          {p.online ? 'Con señal' : 'Sin señal'}
        </span>
        <button
          type="button"
          onClick={() => void p.sincronizar()}
          disabled={!p.online || p.sinSubir === 0}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold transition-colors',
            p.sinSubir > 0
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-transparent text-faint',
          )}
        >
          <RefreshCw className="size-3.5" />
          {p.sinSubir > 0 ? `${p.sinSubir} sin subir` : 'Al día'}
        </button>
      </header>

      {/* Último cargado: confirmación + deshacer mientras no subió */}
      {p.ultimo && p.ultimo.estado !== 'error' && (
        <div className="shrink-0 px-5 pt-3">
          <motion.div
            key={p.ultimo.id}
            initial={{ scale: 0.97, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            className="flex items-center justify-between gap-2 rounded-2xl border border-field/25 bg-field-soft/60 px-3.5 py-2.5"
          >
            <span className="flex min-w-0 items-center gap-2 text-[13px] font-bold text-field-deep">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-field text-white">
                <Check className="size-4" strokeWidth={3} />
              </span>
              <span className="truncate">
                {p.ultimo.tipo === 'gasto' ? 'Gasto' : 'Ingreso'}{' '}
                {fmtMonto(p.ultimo.monto)} · {p.ultimo.categoria_nombre}
              </span>
            </span>
            {p.ultimo.estado === 'pendiente' && (
              <button
                type="button"
                onClick={() => void p.deshacer(p.ultimo!.id)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-faint active:scale-95"
              >
                <RotateCcw className="size-3.5" />
                Deshacer
              </button>
            )}
          </motion.div>
        </div>
      )}

      {p.errores.length > 0 && (
        <div className="shrink-0 px-5 pt-3">
          <div className="flex flex-col gap-1.5 rounded-2xl border border-accent/40 bg-accent/10 p-3.5">
            <div className="flex items-center gap-1.5 text-[13px] font-bold text-accent">
              <AlertTriangle className="size-4" />
              {p.errores.length} con problema al subir
            </div>
            <ul className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
              {p.errores.slice(0, 3).map((e) => (
                <li key={e.id}>
                  <span className="font-semibold">
                    {fmtMonto(e.monto)} {e.categoria_nombre}:
                  </span>{' '}
                  {e.error}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => void p.reintentarErrores()}
              disabled={!p.online}
              className="mt-0.5 self-start text-[13px] font-semibold text-accent disabled:opacity-50"
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
  const [detalle, setDetalle] = useState('')
  const [foto, setFoto] = useState<Blob | null>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [procesandoFoto, setProcesandoFoto] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const montoNum = Number(monto)
  const categorias = p.categorias.filter(
    (c) => c.aplica_a === null || c.aplica_a === tipo,
  )

  const cambiarTipo = (t: TipoMov) => {
    setTipo(t)
    // Si la categoría elegida no aplica al nuevo tipo, se limpia.
    const cat = p.categorias.find((c) => c.id === categoriaId)
    if (cat && cat.aplica_a !== null && cat.aplica_a !== t) setCategoriaId('')
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
    if (!montoNum || montoNum <= 0) {
      setAviso('Poné el monto')
      return
    }
    if (!categoriaId) {
      setAviso('Elegí la categoría')
      return
    }
    if (!campoId) {
      setAviso('Elegí el campo')
      return
    }
    const campo = p.campos.find((c) => c.id === campoId)
    const cat = p.categorias.find((c) => c.id === categoriaId)
    if (!campo || !cat) return
    if ('vibrate' in navigator) navigator.vibrate(50)
    await p.guardar({
      tipo,
      monto: montoNum,
      categoriaId: cat.id,
      categoriaNombre: cat.nombre,
      campoId: campo.id,
      empresaId: campo.empresa_id,
      descripcion: detalle,
      foto,
    })
    // Listo para el próximo: se conservan tipo y campo (cargas seguidas).
    setMonto('')
    setCategoriaId('')
    setDetalle('')
    limpiarFoto()
    setAviso(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {/* Tipo: gasto / ingreso */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => cambiarTipo('gasto')}
            className={cn(
              'flex h-14 items-center justify-center gap-2 rounded-2xl border-2 text-[15px] font-bold transition-colors active:scale-[0.98]',
              tipo === 'gasto'
                ? 'border-tierra bg-tierra-soft text-tierra'
                : 'border-border bg-card text-muted-foreground',
            )}
          >
            <ArrowUpRight className="size-5" />
            Gasto
          </button>
          <button
            type="button"
            onClick={() => cambiarTipo('ingreso')}
            className={cn(
              'flex h-14 items-center justify-center gap-2 rounded-2xl border-2 text-[15px] font-bold transition-colors active:scale-[0.98]',
              tipo === 'ingreso'
                ? 'border-field bg-field-soft text-field-deep'
                : 'border-border bg-card text-muted-foreground',
            )}
          >
            <ArrowDownLeft className="size-5" />
            Ingreso
          </button>
        </div>

        {/* Monto: el héroe */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
            Monto
          </span>
          <div
            className={cn(
              'flex items-center gap-2 rounded-2xl border-2 bg-field-soft/40 px-4 transition-colors',
              aviso === 'Poné el monto'
                ? 'border-destructive'
                : 'border-field-soft focus-within:border-field',
            )}
          >
            <span className="font-heading text-[24px] font-bold text-faint">
              $
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              value={monto ? Number(monto).toLocaleString('es-AR') : ''}
              onChange={(e) => {
                setMonto(e.target.value.replace(/\D/g, ''))
                if (aviso) setAviso(null)
              }}
              className="tnum h-[60px] min-w-0 flex-1 bg-transparent text-[26px] font-bold text-ink outline-none placeholder:text-faint"
            />
          </div>
        </div>

        {/* Categoría + campo */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
              Categoría
            </span>
            <Dropdown
              block
              ariaLabel="Categoría"
              value={categoriaId}
              onChange={(v) => {
                setCategoriaId(v)
                if (aviso) setAviso(null)
              }}
              options={[
                { value: '', label: 'Elegí…' },
                ...categorias.map((c) => ({ value: c.id, label: c.nombre })),
              ]}
              className="h-12"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
              Campo
            </span>
            <Dropdown
              block
              ariaLabel="Campo"
              value={campoId}
              onChange={(v) => {
                setCampoId(v)
                if (aviso) setAviso(null)
              }}
              options={p.campos.map((c) => ({ value: c.id, label: c.nombre }))}
              className="h-12"
            />
          </div>
        </div>

        {/* Foto del comprobante (opcional) */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void onElegirFoto(e)}
          className="hidden"
        />
        {fotoUrl ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
            <img
              src={fotoUrl}
              alt="Comprobante"
              className="h-14 w-14 shrink-0 rounded-xl object-cover"
            />
            <span className="min-w-0 flex-1 text-[14px] font-semibold text-ink">
              Foto lista
            </span>
            <button
              type="button"
              onClick={limpiarFoto}
              aria-label="Quitar foto"
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-soft active:scale-95"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={procesandoFoto}
            className="flex items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-field/40 bg-field-soft/30 px-4 py-3.5 text-[14px] font-bold text-field-deep transition-colors active:scale-[0.99] disabled:opacity-60"
          >
            <Camera className="size-5" />
            {procesandoFoto ? 'Procesando…' : 'Foto del comprobante (opcional)'}
          </button>
        )}

        {/* Detalle opcional */}
        <input
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          autoComplete="off"
          placeholder="Detalle (opcional): gasoil, repuesto…"
          className="h-12 rounded-xl border border-border bg-card px-3.5 text-[15px] text-ink outline-none transition-colors focus:border-field"
        />

        {aviso && (
          <p className="flex items-center gap-1 text-[13px] font-semibold text-destructive">
            <AlertTriangle className="size-3.5" />
            {aviso}
          </p>
        )}
      </div>

      {/* Acción principal: footer fijo */}
      <div className="shrink-0 border-t border-border/70 bg-background px-5 pb-4 pt-3.5">
        <button
          type="button"
          onClick={() => void guardar()}
          className="flex h-16 w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-[18px] font-bold text-primary-foreground shadow-[0_10px_24px_rgba(16,138,85,0.32)] transition-all hover:bg-primary/90 active:translate-y-px"
        >
          <Check className="size-6" strokeWidth={2.5} />
          Guardar {tipo === 'gasto' ? 'gasto' : 'ingreso'}
        </button>
      </div>
    </div>
  )
}
