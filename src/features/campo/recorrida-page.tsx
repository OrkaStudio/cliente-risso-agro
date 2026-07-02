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
  bien: 'border-field bg-field text-white shadow-[0_6px_16px_rgba(16,138,85,0.28)]',
  ok: 'border-lima bg-lima/85 text-ink shadow-[0_6px_16px_rgba(120,170,60,0.22)]',
  alerta: 'border-accent bg-accent text-white shadow-[0_6px_16px_rgba(217,138,24,0.28)]',
  mal: 'border-destructive bg-destructive text-white shadow-[0_6px_16px_rgba(200,50,50,0.24)]',
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
      <div className="flex h-full items-center justify-center text-faint">
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
    <div className="mx-auto flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto p-5">
      <div>
        <h1 className="font-heading text-[26px] font-bold text-ink">Recorrida</h1>
        <p className="mt-0.5 text-[14px] text-ink-soft">
          Elegí el campo para arrancar la recorrida de hoy.
        </p>
      </div>
      {r.error && (
        <p className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-[13px] font-semibold text-destructive">
          {r.error}
        </p>
      )}
      {!r.online && (
        <p className="flex items-center gap-2 rounded-xl bg-secondary px-3.5 py-2.5 text-[13px] font-medium text-ink-soft">
          <CloudOff className="size-4 shrink-0 text-accent" /> Sin señal: para
          empezar una recorrida hace falta conexión una vez.
        </p>
      )}
      <div className="flex flex-col gap-3">
        {r.campos.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={r.iniciando || !r.online}
            onClick={() => void r.empezar(c)}
            className="group flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-5 text-left shadow-sm transition-all hover:border-field hover:shadow-md active:scale-[0.99] disabled:opacity-50"
          >
            <span className="flex items-center gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-field-soft text-field">
                <MapPin className="size-5" />
              </span>
              <span className="font-heading text-[18px] font-bold text-ink">
                {c.nombre}
              </span>
            </span>
            <ChevronRight className="size-5 text-faint transition-transform group-hover:translate-x-0.5" />
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
      <div className="flex h-full items-center justify-center px-8 text-center text-faint">
        Este campo no tiene potreros cargados.
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      {/* ===== Header fijo ===== */}
      <header className="flex shrink-0 flex-col gap-3 border-b border-border/70 bg-background px-5 pb-4 pt-4">
        <div className="flex items-center justify-between">
          <span
            className={cn(
              'flex items-center gap-1.5 text-[14px] font-bold',
              r.online ? 'text-field-deep' : 'text-accent',
            )}
          >
            {r.online ? (
              <Wifi className="size-[18px]" />
            ) : (
              <CloudOff className="size-[18px]" />
            )}
            {r.online ? r.meta!.campo_nombre : 'Sin señal'}
          </span>
          {r.sinSubir > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[12px] font-semibold text-accent">
              <RefreshCw
                className={cn('size-3.5', r.sincronizando && 'animate-spin')}
              />
              {r.sinSubir} sin subir
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Dropdown
              value={String(paso)}
              onChange={(v) => setPaso(Number(v))}
              options={opcionesSalto}
              block
              ariaLabel="Elegir potrero"
              className="h-11"
            />
          </div>
          <span className="shrink-0 text-[13px] font-bold text-faint tnum">
            {paso + 1}/{r.total}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <motion.div
            className="h-full rounded-full bg-field"
            initial={false}
            animate={{ width: `${Math.round((r.hechos / r.total) * 100)}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 30 }}
          />
        </div>
      </header>

      {/* ===== Paso actual (scrollea) ===== */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <PotreroForm
          key={potrero.id}
          nombre={potrero.nombre}
          cabezas={potrero.cabezas}
          inicial={obsAForm(r.obsPorPotrero.get(potrero.id))}
          onGuardar={(f) => void r.guardar(potrero.id, f)}
        />
      </div>

      {/* ===== Navegación inferior (footer fijo) ===== */}
      <div className="flex shrink-0 items-center gap-2.5 border-t border-border bg-card px-5 py-3.5">
        <button
          type="button"
          disabled={paso === 0}
          onClick={() => setPaso((p) => Math.max(0, p - 1))}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border text-ink transition-colors active:scale-95 disabled:opacity-40"
          aria-label="Anterior"
        >
          <ChevronLeft className="size-6" />
        </button>
        {paso < r.total - 1 ? (
          <button
            type="button"
            onClick={() => setPaso((p) => Math.min(r.total - 1, p + 1))}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-field text-[16px] font-bold text-white shadow-[0_8px_20px_rgba(16,138,85,0.28)] transition-all active:translate-y-px"
          >
            Siguiente potrero
            <ChevronRight className="size-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onCierre}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-field text-[16px] font-bold text-white shadow-[0_8px_20px_rgba(16,138,85,0.28)] transition-all active:translate-y-px"
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-field-soft text-field">
          <MapPin className="size-5" />
        </span>
        <h2 className="font-heading text-[22px] font-bold text-ink">{nombre}</h2>
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

      <div className="flex gap-3">
        {/* Conteo */}
        <div className="flex-1 rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-bold text-ink">Conteo</span>
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
            className="h-12 w-full rounded-xl border border-border bg-field-soft/30 px-3 text-[20px] font-bold text-ink outline-none focus:border-field"
          />
        </div>

        {/* En tratamiento */}
        <button
          type="button"
          onClick={() =>
            commit({ ...form, en_tratamiento: !form.en_tratamiento })
          }
          className={cn(
            'flex w-[116px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 transition-colors active:scale-[0.98]',
            form.en_tratamiento
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border bg-card text-ink-soft',
          )}
        >
          <Stethoscope className="size-6" />
          <span className="whitespace-pre-line text-center text-[12.5px] font-semibold leading-tight">
            {form.en_tratamiento ? 'En\ntratamiento' : 'Sin\ntratamiento'}
          </span>
        </button>
      </div>

      {/* Novedad (plegable) */}
      {abrirNovedad ? (
        <div className="rounded-2xl border border-border bg-card p-4">
          <label className="mb-2 block text-[13px] font-bold text-ink">
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
            className="w-full resize-none rounded-xl border border-border bg-field-soft/30 px-3 py-2.5 text-[15px] text-ink outline-none focus:border-field"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAbrirNovedad(true)}
          className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-3 text-left text-[14px] font-semibold text-faint transition-colors hover:border-faint"
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
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-ink">
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
    <div
      className={cn(
        'grid gap-2',
        opciones.length === 2 ? 'grid-cols-2' : 'grid-cols-4',
      )}
    >
      {opciones.map((o) => {
        const sel = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'flex h-14 items-center justify-center rounded-xl border-2 text-[13.5px] font-bold transition-all active:scale-[0.97]',
              sel
                ? TONO_CLS[o.tono]
                : 'border-border bg-field-soft/20 text-ink-soft hover:border-faint',
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
      if (o.pasto === 'escaso' || o.pasto === 'pelado')
        motivos.push(`pasto ${o.pasto}`)
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
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pt-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-field-soft text-field">
            <Flag className="size-5" />
          </span>
          <h1 className="font-heading text-[24px] font-bold text-ink">
            Cierre de recorrida
          </h1>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 text-[15px] text-ink">
          Recorriste{' '}
          <span className="font-bold text-field-deep">
            {r.hechos} de {r.total}
          </span>{' '}
          potreros de {r.meta?.campo_nombre}.
        </div>

        {/* Necesita atención */}
        <div>
          <h2 className="mb-2.5 flex items-center gap-1.5 text-[15px] font-bold text-ink">
            <AlertTriangle className="size-4 text-accent" /> Necesita atención
          </h2>
          {atencion.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-field-soft/50 px-3.5 py-3 text-[14px] font-medium text-field-deep">
              <Check className="size-4" /> Todo en orden.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {atencion.map((a) => (
                <div
                  key={a.nombre}
                  className="rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-2.5"
                >
                  <span className="text-[14px] font-bold text-ink">
                    {a.nombre}
                  </span>
                  <span className="ml-2 text-[13px] text-ink-soft">
                    {a.motivos.join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lluvia */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <label className="mb-2 flex items-center gap-1.5 text-[15px] font-bold text-ink">
            <CloudRain className="size-4 text-field" /> Lluvia de hoy (mm)
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={mm}
            onChange={(e) => setMm(e.target.value)}
            placeholder="opcional"
            className="h-13 w-full rounded-xl border border-border bg-field-soft/30 px-3.5 text-[20px] font-bold text-ink outline-none focus:border-field"
          />
        </div>
      </div>

      {/* Acciones (footer fijo) */}
      <div className="flex shrink-0 flex-col gap-2.5 border-t border-border bg-card px-5 pb-5 pt-3.5">
        <button
          type="button"
          disabled={terminando}
          onClick={() => void terminar()}
          className="flex h-15 items-center justify-center gap-2.5 rounded-2xl bg-field text-[17px] font-bold text-white shadow-[0_10px_24px_rgba(16,138,85,0.3)] transition-all active:translate-y-px disabled:opacity-60"
        >
          <Check className="size-6" strokeWidth={2.5} />
          {terminando ? 'Guardando…' : 'Terminar y guardar'}
        </button>
        <button
          type="button"
          onClick={onVolver}
          className="flex h-12 items-center justify-center rounded-2xl border border-border text-[15px] font-semibold text-ink transition-colors active:scale-[0.99]"
        >
          Volver a los potreros
        </button>
      </div>
    </div>
  )
}
