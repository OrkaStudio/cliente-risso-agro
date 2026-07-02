import { type ReactNode, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  CloudRain,
  Droplets,
  Flag,
  Leaf,
  MapPin,
  RefreshCw,
  Stethoscope,
  Wifi,
  Zap,
} from 'lucide-react'
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown'
import { cn } from '@/lib/utils'
import { useRecorrida } from './recorrida/use-recorrida'
import type {
  AguaEstado,
  ElectricoEstado,
  PastoEstado,
} from './recorrida/api'

type Tono = 'bien' | 'ok' | 'alerta' | 'mal'

const TONO_CLS: Record<Tono, string> = {
  bien: 'border-field bg-field text-white',
  ok: 'border-lima bg-lima/80 text-ink',
  alerta: 'border-accent bg-accent text-white',
  mal: 'border-destructive bg-destructive text-white',
}

const PASTO: { value: PastoEstado; label: string; tono: Tono }[] = [
  { value: 'abundante', label: 'Abundante', tono: 'bien' },
  { value: 'normal', label: 'Normal', tono: 'ok' },
  { value: 'escaso', label: 'Escaso', tono: 'alerta' },
  { value: 'pelado', label: 'Pelado', tono: 'mal' },
]
const AGUA: { value: AguaEstado; label: string; tono: Tono }[] = [
  { value: 'llena', label: 'Llena', tono: 'bien' },
  { value: 'normal', label: 'Normal', tono: 'ok' },
  { value: 'baja', label: 'Baja', tono: 'alerta' },
  { value: 'seca', label: 'Seca', tono: 'mal' },
]
const ELECTRICO: { value: ElectricoEstado; label: string; tono: Tono }[] = [
  { value: 'ok', label: 'OK', tono: 'bien' },
  { value: 'cortado', label: 'Cortado', tono: 'mal' },
]

type Form = {
  pasto: PastoEstado | null
  agua: AguaEstado | null
  electrico: ElectricoEstado | null
  conteo: number | null
  en_tratamiento: boolean
  novedad: string | null
}
const FORM_VACIO: Form = {
  pasto: null,
  agua: null,
  electrico: null,
  conteo: null,
  en_tratamiento: false,
  novedad: null,
}

export function RecorridaPage() {
  const r = useRecorrida()
  const [vista, setVista] = useState<'stepper' | 'cierre'>('stepper')

  if (r.cargando) {
    return (
      <div className="flex flex-1 items-center justify-center text-faint">
        Cargando…
      </div>
    )
  }

  if (!r.meta) {
    return <SelectorCampo r={r} />
  }

  if (vista === 'cierre') {
    return <Cierre r={r} onVolver={() => setVista('stepper')} />
  }

  return <Stepper r={r} onCierre={() => setVista('cierre')} />
}

// ---------------------------------------------------------------------------
// Selector de campo
// ---------------------------------------------------------------------------
function SelectorCampo({ r }: { r: ReturnType<typeof useRecorrida> }) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div>
        <h1 className="font-heading text-xl font-bold text-ink">Recorrida</h1>
        <p className="text-[13px] text-faint">
          Elegí el campo para arrancar la recorrida de hoy.
        </p>
      </div>
      {r.error && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] font-semibold text-destructive">
          {r.error}
        </p>
      )}
      {!r.online && (
        <p className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-[13px] font-medium text-ink-soft">
          <CloudOff className="size-4 text-accent" /> Sin señal: para empezar una
          recorrida hace falta conexión una vez.
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        {r.campos.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={r.iniciando || !r.online}
            onClick={() => void r.empezar(c)}
            className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-4 text-left shadow-sm transition-colors hover:border-field disabled:opacity-50"
          >
            <span className="flex items-center gap-3">
              <MapPin className="size-5 text-field" />
              <span className="font-heading text-[16px] font-bold text-ink">
                {c.nombre}
              </span>
            </span>
            <ChevronRight className="size-5 text-faint" />
          </button>
        ))}
        {r.online && r.campos.length === 0 && !r.error && (
          <p className="text-[13px] text-faint">No hay campos cargados todavía.</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stepper por potrero
// ---------------------------------------------------------------------------
function Stepper({
  r,
  onCierre,
}: {
  r: ReturnType<typeof useRecorrida>
  onCierre: () => void
}) {
  const [paso, setPaso] = useState(0)
  const potrero = r.potreros[paso]

  const opcionesSalto: DropdownOption[] = r.potreros.map((p, i) => ({
    value: String(i),
    label: `${p.hecho ? '✓ ' : ''}${p.nombre}`,
  }))

  if (!potrero) {
    return (
      <div className="flex flex-1 items-center justify-center text-faint">
        Este campo no tiene potreros cargados.
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Franja de estado */}
      <div className="flex flex-col gap-2 px-4 pb-2 pt-3">
        <div className="flex items-center justify-between">
          <span
            className={cn(
              'flex items-center gap-1.5 text-[13px] font-semibold',
              r.online ? 'text-field-deep' : 'text-accent',
            )}
          >
            {r.online ? (
              <Wifi className="size-4" />
            ) : (
              <CloudOff className="size-4" />
            )}
            {r.online ? r.meta!.campo_nombre : 'Sin señal'}
          </span>
          {r.sinSubir > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[12px] font-semibold text-accent">
              <RefreshCw
                className={cn('size-3.5', r.sincronizando && 'animate-spin')}
              />
              {r.sinSubir} sin subir
            </span>
          )}
        </div>

        {/* Selector de potrero (saltar) + progreso */}
        <div className="flex items-center gap-2.5">
          <Dropdown
            value={String(paso)}
            onChange={(v) => setPaso(Number(v))}
            options={opcionesSalto}
            block
            ariaLabel="Elegir potrero"
            className="flex-1"
          />
          <span className="shrink-0 text-right text-[12px] font-semibold text-faint">
            {paso + 1}/{r.total}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <motion.div
            className="h-full rounded-full bg-field"
            initial={false}
            animate={{ width: `${Math.round((r.hechos / r.total) * 100)}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 30 }}
          />
        </div>
      </div>

      {/* Paso actual */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <PotreroForm
          key={potrero.id}
          nombre={potrero.nombre}
          cabezas={potrero.cabezas}
          inicial={obsAForm(r.obsPorPotrero.get(potrero.id))}
          onGuardar={(f) => void r.guardar(potrero.id, f)}
        />
      </div>

      {/* Navegación inferior */}
      <div className="flex items-center gap-2 border-t border-border bg-card px-4 py-3">
        <button
          type="button"
          disabled={paso === 0}
          onClick={() => setPaso((p) => Math.max(0, p - 1))}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border text-ink disabled:opacity-40"
          aria-label="Anterior"
        >
          <ChevronLeft className="size-5" />
        </button>
        {paso < r.total - 1 ? (
          <button
            type="button"
            onClick={() => setPaso((p) => Math.min(r.total - 1, p + 1))}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-field text-[15px] font-bold text-white"
          >
            Siguiente potrero
            <ChevronRight className="size-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onCierre}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-field text-[15px] font-bold text-white"
          >
            <Flag className="size-5" />
            Terminar recorrida
          </button>
        )}
      </div>
    </div>
  )
}

function obsAForm(o: ReturnType<
  ReturnType<typeof useRecorrida>['obsPorPotrero']['get']
>): Form {
  if (!o) return FORM_VACIO
  return {
    pasto: o.pasto,
    agua: o.agua,
    electrico: o.electrico,
    conteo: o.conteo,
    en_tratamiento: o.en_tratamiento,
    novedad: o.novedad,
  }
}

// ---------------------------------------------------------------------------
// Formulario de un potrero
// ---------------------------------------------------------------------------
function PotreroForm({
  nombre,
  cabezas,
  inicial,
  onGuardar,
}: {
  nombre: string
  cabezas: number
  inicial: Form
  onGuardar: (f: Form) => void
}) {
  const [form, setForm] = useState<Form>(inicial)
  const [abrirNovedad, setAbrirNovedad] = useState(!!inicial.novedad)

  // Persiste apenas cambia algo (upsert idempotente en Dexie + cola).
  const commit = (next: Form) => {
    setForm(next)
    onGuardar(next)
  }

  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="flex items-center gap-2">
        <MapPin className="size-5 text-field" />
        <h2 className="font-heading text-[19px] font-bold text-ink">{nombre}</h2>
      </div>

      <Bloque icon={<Leaf className="size-4" />} titulo="Pasto">
        <Segmento
          opciones={PASTO}
          value={form.pasto}
          onChange={(v) => commit({ ...form, pasto: v })}
        />
      </Bloque>

      <Bloque icon={<Droplets className="size-4" />} titulo="Agua">
        <Segmento
          opciones={AGUA}
          value={form.agua}
          onChange={(v) => commit({ ...form, agua: v })}
        />
      </Bloque>

      <Bloque icon={<Zap className="size-4" />} titulo="Eléctrico">
        <Segmento
          opciones={ELECTRICO}
          value={form.electrico}
          onChange={(v) => commit({ ...form, electrico: v })}
        />
      </Bloque>

      <div className="flex gap-2.5">
        {/* Conteo */}
        <div className="flex-1 rounded-2xl border border-border bg-card p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink">Conteo</span>
            {cabezas > 0 && (
              <span className="text-[11px] font-medium text-faint">
                esperado: {cabezas}
              </span>
            )}
          </div>
          <input
            type="number"
            inputMode="numeric"
            value={form.conteo ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                conteo: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            onBlur={() => onGuardar(form)}
            placeholder="—"
            className="h-11 w-full rounded-xl border border-border bg-field-soft/30 px-3 text-[18px] font-bold text-ink outline-none focus:border-field"
          />
        </div>

        {/* En tratamiento */}
        <button
          type="button"
          onClick={() =>
            commit({ ...form, en_tratamiento: !form.en_tratamiento })
          }
          className={cn(
            'flex w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border p-3 transition-colors',
            form.en_tratamiento
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border bg-card text-ink-soft',
          )}
        >
          <Stethoscope className="size-5" />
          <span className="text-center text-[12px] font-semibold leading-tight">
            {form.en_tratamiento ? 'En\ntratamiento' : 'Sin\ntratamiento'}
          </span>
        </button>
      </div>

      {/* Novedad (plegable) */}
      {abrirNovedad ? (
        <div className="rounded-2xl border border-border bg-card p-3">
          <label className="mb-1.5 block text-[13px] font-semibold text-ink">
            Novedad
          </label>
          <textarea
            value={form.novedad ?? ''}
            onChange={(e) =>
              setForm({ ...form, novedad: e.target.value || null })
            }
            onBlur={() => onGuardar(form)}
            rows={2}
            placeholder="Anotá algo (opcional)…"
            className="w-full resize-none rounded-xl border border-border bg-field-soft/30 px-3 py-2 text-[14px] text-ink outline-none focus:border-field"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAbrirNovedad(true)}
          className="rounded-2xl border border-dashed border-border bg-card/60 px-3 py-2.5 text-left text-[13px] font-semibold text-faint"
        >
          + Novedad
        </button>
      )}
    </div>
  )
}

function Bloque({
  icon,
  titulo,
  children,
}: {
  icon: ReactNode
  titulo: string
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <span className="text-field">{icon}</span>
        {titulo}
      </div>
      {children}
    </div>
  )
}

function Segmento<T extends string>({
  opciones,
  value,
  onChange,
}: {
  opciones: { value: T; label: string; tono: Tono }[]
  value: T | null
  onChange: (v: T) => void
}) {
  return (
    <div className={cn('grid gap-1.5', opciones.length === 2 ? 'grid-cols-2' : 'grid-cols-4')}>
      {opciones.map((o) => {
        const sel = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'flex h-12 items-center justify-center rounded-xl border-2 text-[13px] font-bold transition-all',
              sel
                ? TONO_CLS[o.tono]
                : 'border-border bg-field-soft/20 text-ink-soft',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cierre
// ---------------------------------------------------------------------------
function Cierre({
  r,
  onVolver,
}: {
  r: ReturnType<typeof useRecorrida>
  onVolver: () => void
}) {
  const [mm, setMm] = useState<string>(
    r.meta?.lluvia_mm != null ? String(r.meta.lluvia_mm) : '',
  )
  const [terminando, setTerminando] = useState(false)

  // Potreros que necesitan atención (para el resumen).
  const atencion = useMemo(() => {
    const items: { nombre: string; motivos: string[] }[] = []
    for (const p of r.potreros) {
      const o = r.obsPorPotrero.get(p.id)
      if (!o) continue
      const motivos: string[] = []
      if (o.pasto === 'escaso' || o.pasto === 'pelado') motivos.push(`pasto ${o.pasto}`)
      if (o.agua === 'baja' || o.agua === 'seca') motivos.push(`agua ${o.agua}`)
      if (o.electrico === 'cortado') motivos.push('eléctrico cortado')
      if (o.en_tratamiento) motivos.push('en tratamiento')
      if (o.novedad) motivos.push('novedad')
      if (motivos.length) items.push({ nombre: p.nombre, motivos })
    }
    return items
  }, [r.potreros, r.obsPorPotrero])

  const terminar = async () => {
    setTerminando(true)
    await r.setLluvia(mm === '' ? null : Number(mm))
    await r.terminar()
    // al terminar, meta se limpia → RecorridaPage vuelve al selector
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Flag className="size-6 text-field" />
        <h1 className="font-heading text-xl font-bold text-ink">
          Cierre de recorrida
        </h1>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3 text-[14px] text-ink">
        Recorriste{' '}
        <span className="font-bold text-field-deep">
          {r.hechos} de {r.total}
        </span>{' '}
        potreros de {r.meta?.campo_nombre}.
      </div>

      {/* Necesita atención */}
      <div>
        <h2 className="mb-2 flex items-center gap-1.5 text-[14px] font-bold text-ink">
          <AlertTriangle className="size-4 text-accent" /> Necesita atención
        </h2>
        {atencion.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-field-soft/50 px-3 py-2.5 text-[13px] font-medium text-field-deep">
            <Check className="size-4" /> Todo en orden.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {atencion.map((a) => (
              <div
                key={a.nombre}
                className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2"
              >
                <span className="text-[13.5px] font-bold text-ink">{a.nombre}</span>
                <span className="ml-2 text-[12.5px] text-ink-soft">
                  {a.motivos.join(' · ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lluvia */}
      <div className="rounded-2xl border border-border bg-card p-3">
        <label className="mb-1.5 flex items-center gap-1.5 text-[14px] font-semibold text-ink">
          <CloudRain className="size-4 text-field" /> Lluvia de hoy (mm)
        </label>
        <input
          type="number"
          inputMode="numeric"
          value={mm}
          onChange={(e) => setMm(e.target.value)}
          placeholder="opcional"
          className="h-12 w-full rounded-xl border border-border bg-field-soft/30 px-3 text-[18px] font-bold text-ink outline-none focus:border-field"
        />
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <button
          type="button"
          disabled={terminando}
          onClick={() => void terminar()}
          className="flex h-13 items-center justify-center gap-2 rounded-2xl bg-field text-[16px] font-bold text-white disabled:opacity-60"
        >
          <Check className="size-5" />
          {terminando ? 'Guardando…' : 'Terminar y guardar'}
        </button>
        <button
          type="button"
          onClick={onVolver}
          className="flex h-11 items-center justify-center rounded-2xl border border-border text-[14px] font-semibold text-ink"
        >
          Volver a los potreros
        </button>
      </div>
    </div>
  )
}
