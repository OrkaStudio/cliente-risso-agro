import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CloudOff,
  Pencil,
  RefreshCw,
  RotateCcw,
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
  // Raza/pelaje "pegajosos" (una tropa es uniforme) → viven en el padre.
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
    <div className="mx-auto flex h-full max-w-md flex-col">
      {/* Franja fina: estado + alcance + progreso (sin cartelones) */}
      <div className="flex flex-col gap-2 px-4 pb-2 pt-3">
        <div className="flex items-center justify-between text-[12px]">
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
            {m.online ? 'Con señal' : 'Sin señal'}
          </span>
          <button
            type="button"
            onClick={() => void m.sincronizar()}
            disabled={!m.online || m.sinSincronizar === 0 || m.sincronizando}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-semibold transition-colors',
              m.sinSincronizar > 0
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-transparent text-faint',
            )}
          >
            <RefreshCw
              className={cn('size-3.5', m.sincronizando && 'animate-spin')}
            />
            {m.sinSincronizar > 0 ? `${m.sinSincronizar} sin subir` : 'Al día'}
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <Dropdown
              block
              ariaLabel="Alcance"
              value={
                m.scope.kind === 'todos'
                  ? 'todos'
                  : `${m.scope.kind}:${m.scope.id}`
              }
              onChange={(key) => {
                const opt = m.scopeOptions.find((o) => o.key === key)
                if (opt) m.setScope(opt.scope)
              }}
              options={m.scopeOptions.map((o) => ({
                value: o.key,
                label: o.label,
              }))}
              className="h-10"
            />
          </div>
          <div className="shrink-0 text-right leading-none">
            <span className="font-heading text-xl font-bold text-ink">
              {m.quedan}
            </span>
            <span className="ml-1 text-[12px] font-medium text-faint">
              quedan
            </span>
          </div>
        </div>

        {/* Progreso del alcance */}
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <motion.div
              className="h-full rounded-full bg-field"
              initial={false}
              animate={{ width: `${Math.round(m.progreso * 100)}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 30 }}
            />
          </div>
          <span className="shrink-0 text-[11px] font-semibold text-field-deep">
            {m.listo} listos
          </span>
        </div>

        {/* Último caravaneo: confirmación + deshacer (pulsa en cada asignación) */}
        {m.ultimo && (
          <motion.div
            key={m.ultimo.local_id}
            initial={{ scale: 0.97, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            className="flex items-center justify-between gap-2 rounded-xl border border-field/30 bg-field-soft/60 px-3 py-2"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold text-field-deep">
              <Check className="size-4 shrink-0" strokeWidth={2.5} />
              <span className="truncate">RFID {m.ultimo.rfid} listo</span>
            </span>
            <button
              type="button"
              onClick={() => void m.deshacer()}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[12px] font-semibold text-ink transition-colors hover:border-faint"
            >
              <RotateCcw className="size-3.5" />
              Deshacer
            </button>
          </motion.div>
        )}
      </div>

      {/* Cuerpo */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {m.actual ? (
          <AnimalForm
            key={m.actual.id}
            animal={m.actual}
            raza={raza}
            pelaje={pelaje}
            rfidsUsados={m.rfidsUsados}
            onRaza={setRaza}
            onPelaje={setPelaje}
            onAsignar={(datos) => {
              // Confirmación háptica (vibra) al asignar; el pulso visual lo da
              // la barra "Último".
              if ('vibrate' in navigator) navigator.vibrate(50)
              void m.asignar(m.actual!.id, datos)
            }}
          />
        ) : (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-14 text-center">
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

        {m.errores.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 rounded-2xl border border-accent/40 bg-accent/10 p-3.5">
            <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-accent">
              <AlertTriangle className="size-4" />
              {m.errores.length} con problema al subir
            </div>
            <ul className="flex flex-col gap-1 text-[12px] font-medium text-accent-foreground/80">
              {m.errores.slice(0, 4).map((e) => (
                <li key={e.local_id}>
                  <span className="font-semibold">RFID {e.rfid}:</span>{' '}
                  {e.error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

type AnimalFormProps = {
  animal: AnimalSinCaravana
  raza: string
  pelaje: string
  rfidsUsados: Set<string>
  onRaza: (v: string) => void
  onPelaje: (v: string) => void
  onAsignar: (datos: AsignacionLocal) => void
}

/**
 * Form de un animal (keyado por id → arranca fresco). Vía rápida siempre a la
 * vista: contexto + RFID + categoría + Asignar. Raza/pelaje plegados (una
 * tropa es uniforme) para no meter ruido; se abren a un toque.
 */
function AnimalForm({
  animal,
  raza,
  pelaje,
  rfidsUsados,
  onRaza,
  onPelaje,
  onAsignar,
}: AnimalFormProps) {
  const [rfid, setRfid] = useState('')
  const [visual, setVisual] = useState('')
  const [categoria, setCategoria] = useState<CategoriaAnimal>(animal.categoria)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abrirDatos, setAbrirDatos] = useState(false)

  // Aviso instantáneo (sin esperar al sync): ¿ya usé este RFID en la sesión?
  const repetido = rfid.trim() !== '' && rfidsUsados.has(rfid.trim().toLowerCase())

  const asignar = () => {
    if (!rfid.trim()) {
      setAviso('Escaneá o escribí el RFID')
      return
    }
    if (repetido) {
      setAviso('Ese RFID ya lo usaste recién')
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

  const resumenDatos = [raza, pelaje].filter(Boolean).join(' · ')

  return (
    <section className="mt-1 flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,19,0.05),0_6px_18px_rgba(16,24,19,0.05)]">
      {/* Contexto */}
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-full bg-field" />
        <span className="truncate text-[13px] font-semibold text-ink">
          {animal.lote_nombre
            ? `Tropa ${animal.lote_nombre}`
            : (animal.potrero_nombre ?? 'Sin potrero')}
        </span>
      </div>

      {/* RFID: el héroe (el bastón teclea acá) */}
      <div
        className={cn(
          'flex items-center gap-3 rounded-2xl border-2 bg-field-soft/40 px-4 transition-colors',
          aviso
            ? 'border-destructive'
            : repetido
              ? 'border-accent'
              : 'border-field-soft focus-within:border-field',
        )}
      >
        <ScanLine
          className={cn(
            'size-6 shrink-0',
            repetido ? 'text-accent' : 'text-field',
          )}
        />
        <input
          value={rfid}
          onChange={(e) => {
            setRfid(e.target.value)
            if (aviso) setAviso(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              asignar()
            }
          }}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="Escaneá el RFID"
          className="h-15 min-w-0 flex-1 bg-transparent text-[19px] font-bold tracking-wide text-ink outline-none placeholder:font-semibold placeholder:text-faint"
        />
      </div>
      {aviso ? (
        <p className="-mt-2 text-[12px] font-semibold text-destructive">
          {aviso}
        </p>
      ) : (
        repetido && (
          <p className="-mt-2 flex items-center gap-1 text-[12px] font-semibold text-accent">
            <AlertTriangle className="size-3.5" />
            Ya usaste ese RFID recién
          </p>
        )
      )}

      {/* Categoría (compacta) + visual */}
      <div className="grid grid-cols-[1fr_auto] items-end gap-2.5">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-faint">
            Categoría
          </span>
          <Dropdown
            block
            ariaLabel="Categoría"
            value={categoria}
            onChange={(v) => setCategoria(v as CategoriaAnimal)}
            options={CATEGORIA_OPTS}
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-faint">
            Visual
          </span>
          <input
            value={visual}
            onChange={(e) => setVisual(e.target.value)}
            autoComplete="off"
            placeholder="opc."
            className="h-11 w-24 rounded-[10px] border border-border bg-card px-3 text-[15px] font-medium text-ink outline-none transition-colors focus:border-field"
          />
        </div>
      </div>

      {/* Raza / Pelaje: plegado (resumen a la vista, se abre a un toque) */}
      <div className="rounded-xl border border-border">
        <button
          type="button"
          onClick={() => setAbrirDatos((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            {resumenDatos ? (
              <>
                <Pencil className="size-3.5 shrink-0 text-field" />
                <span className="truncate text-[13.5px] font-semibold text-ink">
                  {resumenDatos}
                </span>
              </>
            ) : (
              <span className="text-[13.5px] font-medium text-faint">
                + Raza y pelaje (opcional)
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-faint transition-transform',
              abrirDatos && 'rotate-180',
            )}
          />
        </button>
        {abrirDatos && (
          <div className="flex flex-col gap-3 border-t border-border px-3.5 pb-3.5 pt-3">
            <ChipPicker
              label="Raza"
              options={RAZAS}
              value={raza}
              onChange={onRaza}
            />
            <ChipPicker
              label="Pelaje"
              options={PELAJES}
              value={pelaje}
              onChange={onPelaje}
            />
          </div>
        )}
      </div>

      {/* Acción principal */}
      <button
        type="button"
        onClick={asignar}
        className="flex h-15 items-center justify-center gap-2.5 rounded-2xl bg-primary text-[17px] font-bold text-primary-foreground shadow-[0_8px_20px_rgba(16,138,85,0.3)] transition-all hover:bg-primary/90 active:translate-y-px"
      >
        <Check className="size-6" strokeWidth={2.5} />
        Asignar → siguiente
      </button>
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
      'rounded-full border px-3.5 py-2 text-[13.5px] font-semibold transition-colors',
      activo
        ? 'border-field bg-field-soft text-field-deep'
        : 'border-border bg-card text-muted-foreground hover:border-faint',
    )

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wide text-faint">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
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
