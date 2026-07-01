import { useState } from 'react'
import {
  AlertTriangle,
  Check,
  CloudOff,
  MapPin,
  RefreshCw,
  ScanLine,
  Wifi,
} from 'lucide-react'
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown'
import { categoriaLabel } from '@/features/hacienda/labels'
import { cn } from '@/lib/utils'
import { useManga, type AsignacionLocal } from './manga/use-manga'
import type { AnimalSinCaravana, CategoriaAnimal } from './manga/api'

const CATEGORIA_OPTS: DropdownOption[] = (
  Object.entries(categoriaLabel) as [CategoriaAnimal, string][]
).map(([value, label]) => ({ value, label }))
const RAZAS = ['Angus', 'Hereford', 'Brangus', 'Braford', 'Limousin', 'Cruza']
const PELAJES = ['Colorado', 'Negro', 'Blanco', 'Bayo', 'Overo', 'Pampa']

export function MangaPage() {
  const m = useManga()
  // Raza/pelaje "pegajosos": una tropa suele ser uniforme → no se reescriben
  // por animal (viven en el padre, no en el form keyado).
  const [raza, setRaza] = useState('')
  const [pelaje, setPelaje] = useState('')

  if (m.cargando) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Cargando manga…
      </p>
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3.5 p-4">
      {/* Barra de estado: conexión + sincronización */}
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 font-semibold',
            m.online ? 'text-field' : 'text-accent',
          )}
        >
          {m.online ? (
            <Wifi className="size-4" />
          ) : (
            <CloudOff className="size-4" />
          )}
          {m.online ? 'Con señal' : 'Sin señal — se guarda local'}
        </span>
        <button
          type="button"
          onClick={() => void m.sincronizar()}
          disabled={!m.online || m.sinSincronizar === 0 || m.sincronizando}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold transition-colors',
            m.sinSincronizar > 0
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-border text-faint',
          )}
        >
          <RefreshCw
            className={cn('size-3.5', m.sincronizando && 'animate-spin')}
          />
          {m.sinSincronizar > 0
            ? `${m.sinSincronizar} sin sincronizar`
            : 'Todo al día'}
        </button>
      </div>

      {/* Alcance */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
          Alcance
        </span>
        <Dropdown
          block
          ariaLabel="Alcance"
          value={
            m.scope.kind === 'todos' ? 'todos' : `${m.scope.kind}:${m.scope.id}`
          }
          onChange={(key) => {
            const opt = m.scopeOptions.find((o) => o.key === key)
            if (opt) m.setScope(opt.scope)
          }}
          options={m.scopeOptions.map((o) => ({
            value: o.key,
            label: `${o.label} · ${o.pendientes}`,
          }))}
          className="h-12 text-[15px]"
        />
      </div>

      {/* Contador */}
      <div className="flex items-stretch overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,19,0.05)]">
        <div className="flex-1 py-3 text-center">
          <div className="font-heading text-3xl font-bold leading-none text-ink">
            {m.quedan}
          </div>
          <div className="mt-1 text-[11px] font-medium text-faint">quedan</div>
        </div>
        <div className="w-px bg-border" />
        <div className="flex-1 bg-field-soft/40 py-3 text-center">
          <div className="font-heading text-3xl font-bold leading-none text-field-deep">
            {m.listo}
          </div>
          <div className="mt-1 text-[11px] font-medium text-field-deep/70">
            caravaneados
          </div>
        </div>
      </div>

      {/* Animal actual o estado vacío. key=id → el form se resetea solo. */}
      {m.actual ? (
        <AnimalForm
          key={m.actual.id}
          animal={m.actual}
          raza={raza}
          pelaje={pelaje}
          onRaza={setRaza}
          onPelaje={setPelaje}
          onAsignar={(datos) => void m.asignar(m.actual!.id, datos)}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-field-soft text-field">
            <Check className="size-7" strokeWidth={2.2} />
          </div>
          <p className="text-sm font-medium text-ink">
            No quedan animales sin caravana en este alcance.
          </p>
          <button
            type="button"
            onClick={() => void m.descargar()}
            disabled={!m.online}
            className="text-[13px] font-semibold text-field disabled:opacity-40"
          >
            Volver a cargar la lista
          </button>
        </div>
      )}

      {/* Conflictos (RFID duplicado, etc.) */}
      {m.errores.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-accent/40 bg-accent/10 p-3.5">
          <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-accent">
            <AlertTriangle className="size-4" />
            {m.errores.length} con problema al sincronizar
          </div>
          <ul className="flex flex-col gap-1 text-[12px] font-medium text-accent-foreground/80">
            {m.errores.slice(0, 5).map((e) => (
              <li key={e.local_id}>
                <span className="font-semibold">RFID {e.rfid}:</span> {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

type AnimalFormProps = {
  animal: AnimalSinCaravana
  raza: string
  pelaje: string
  onRaza: (v: string) => void
  onPelaje: (v: string) => void
  onAsignar: (datos: AsignacionLocal) => void
}

/**
 * Form de un animal. Se monta keyado por `animal.id`: el RFID/visual/categoría
 * arrancan frescos en cada animal sin necesitar un effect de reset.
 */
function AnimalForm({
  animal,
  raza,
  pelaje,
  onRaza,
  onPelaje,
  onAsignar,
}: AnimalFormProps) {
  const [rfid, setRfid] = useState('')
  const [visual, setVisual] = useState('')
  const [categoria, setCategoria] = useState<CategoriaAnimal>(animal.categoria)
  const [aviso, setAviso] = useState(false)

  const asignar = () => {
    if (!rfid.trim()) {
      setAviso(true)
      return
    }
    onAsignar({
      rfid,
      visual: visual || undefined,
      categoria,
      raza: raza || undefined,
      pelaje: pelaje || undefined,
    })
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)]">
      {/* Contexto: qué tropa/potrero estoy caravaneando */}
      <div className="flex items-center gap-2 border-b border-border/70 bg-secondary/60 px-4 py-2.5">
        <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-full bg-field" />
        <MapPin className="size-3.5 text-faint" />
        <span className="truncate text-[13px] font-semibold text-ink">
          {animal.lote_nombre
            ? `Tropa ${animal.lote_nombre}`
            : (animal.potrero_nombre ?? 'Sin potrero')}
        </span>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {/* RFID: el héroe del flujo (el bastón teclea acá) */}
        <div>
          <label className="mb-1.5 flex items-center justify-between">
            <span className="text-[12px] font-bold text-ink">
              RFID (caravana)
            </span>
            <span className="text-[11px] font-medium text-faint">
              escaneá o escribí
            </span>
          </label>
          <div
            className={cn(
              'flex items-center gap-2.5 rounded-xl border-2 bg-field-soft/40 px-3.5 transition-colors',
              aviso ? 'border-destructive' : 'border-field-soft focus-within:border-field',
            )}
          >
            <ScanLine className="size-5 shrink-0 text-field" />
            <input
              value={rfid}
              onChange={(e) => {
                setRfid(e.target.value)
                if (aviso) setAviso(false)
              }}
              onKeyDown={(e) => {
                // El bastón "teclea" el número + Enter → asigna y pasa al siguiente
                if (e.key === 'Enter') {
                  e.preventDefault()
                  asignar()
                }
              }}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="Número de caravana"
              className="h-13 min-w-0 flex-1 bg-transparent py-3 text-[18px] font-bold tracking-wide text-ink outline-none placeholder:font-medium placeholder:text-faint"
            />
          </div>
          {aviso && (
            <p className="mt-1 text-[12px] font-semibold text-destructive">
              Falta el RFID
            </p>
          )}
        </div>

        {/* Categoría (→ sexo derivado) + visual */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold text-ink">Categoría</span>
            <Dropdown
              block
              ariaLabel="Categoría"
              value={categoria}
              onChange={(v) => setCategoria(v as CategoriaAnimal)}
              options={CATEGORIA_OPTS}
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold text-ink">
              Visual{' '}
              <span className="font-medium text-faint">(opc.)</span>
            </span>
            <input
              value={visual}
              onChange={(e) => setVisual(e.target.value)}
              autoComplete="off"
              placeholder="N°"
              className="h-11 rounded-[10px] border border-border bg-card px-3 text-[15px] font-medium text-ink outline-none transition-colors focus:border-field"
            />
          </div>
        </div>

        {/* Raza / Pelaje como chips (rápido, sin teclado, pegajoso) */}
        <ChipPicker label="Raza" options={RAZAS} value={raza} onChange={onRaza} />
        <ChipPicker
          label="Pelaje"
          options={PELAJES}
          value={pelaje}
          onChange={onPelaje}
        />

        <button
          type="button"
          onClick={asignar}
          className="mt-0.5 flex h-13 items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-[16px] font-bold text-primary-foreground shadow-[0_6px_18px_rgba(16,138,85,0.28)] transition-all hover:bg-primary/90 active:translate-y-px"
        >
          <Check className="size-5" strokeWidth={2.5} />
          Asignar → siguiente
        </button>
      </div>
    </section>
  )
}

/** Selector por chips tocables + "Otro…" con input. Grande para el campo. */
function ChipPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  const esPreset = options.some((o) => o.toLowerCase() === value.toLowerCase())
  const [otro, setOtro] = useState(value !== '' && !esPreset)

  const chip = (activo: boolean) =>
    cn(
      'rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors',
      activo
        ? 'border-field bg-field-soft text-field-deep'
        : 'border-border bg-card text-muted-foreground hover:border-faint',
    )

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-bold text-ink">
        {label} <span className="font-medium text-faint">(opcional)</span>
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const sel = !otro && value.toLowerCase() === o.toLowerCase()
          return (
            <button
              key={o}
              type="button"
              onClick={() => {
                setOtro(false)
                onChange(sel ? '' : o)
              }}
              className={chip(sel)}
            >
              {o}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => {
            setOtro(true)
            onChange('')
          }}
          className={chip(otro)}
        >
          Otro…
        </button>
      </div>
      {otro && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          placeholder={`Escribí ${label.toLowerCase()}`}
          className="h-10 rounded-[10px] border border-border bg-card px-3 text-[15px] font-medium text-ink outline-none transition-colors focus:border-field"
        />
      )}
    </div>
  )
}
