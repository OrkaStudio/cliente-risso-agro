import { useState } from 'react'
import {
  AlertTriangle,
  Check,
  CloudOff,
  RefreshCw,
  Syringe,
  Wifi,
} from 'lucide-react'
import { categoriaLabel } from '@/features/hacienda/labels'
import { cn } from '@/lib/utils'
import { useManga, type AsignacionLocal } from './manga/use-manga'
import type { AnimalSinCaravana, CategoriaAnimal } from './manga/api'

const CATEGORIAS = Object.entries(categoriaLabel) as [CategoriaAnimal, string][]
const RAZAS = ['Angus', 'Hereford', 'Brangus', 'Braford', 'Limousin', 'Cruza']
const PELAJES = ['Colorado', 'Negro', 'Blanco', 'Bayo', 'Overo', 'Pampa']

export function MangaPage() {
  const m = useManga()
  // Raza/pelaje "pegajosos": una tropa suele ser uniforme → no se reescriben
  // por animal (viven en el padre, no en el form keyado).
  const [raza, setRaza] = useState('')
  const [pelaje, setPelaje] = useState('')

  if (m.cargando) {
    return <p className="p-6 text-sm text-muted-foreground">Cargando manga…</p>
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      {/* Barra de estado: conexión + sincronización */}
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 font-medium',
            m.online ? 'text-primary' : 'text-amber-600',
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
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 font-medium text-foreground disabled:opacity-40"
        >
          <RefreshCw
            className={cn('size-3.5', m.sincronizando && 'animate-spin')}
          />
          {m.sinSincronizar > 0
            ? `${m.sinSincronizar} sin sincronizar`
            : 'Todo sincronizado'}
        </button>
      </div>

      {/* Alcance */}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Alcance
        </span>
        <select
          value={
            m.scope.kind === 'todos' ? 'todos' : `${m.scope.kind}:${m.scope.id}`
          }
          onChange={(e) => {
            const opt = m.scopeOptions.find((o) => o.key === e.target.value)
            if (opt) m.setScope(opt.scope)
          }}
          className="h-11 rounded-xl border border-border bg-card px-3 text-[15px]"
        >
          {m.scopeOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label} ({o.pendientes})
            </option>
          ))}
        </select>
      </label>

      {/* Contador */}
      <div className="flex items-center justify-around rounded-xl bg-muted/50 py-2.5 text-center">
        <div>
          <div className="font-heading text-2xl font-bold text-foreground">
            {m.quedan}
          </div>
          <div className="text-[11px] text-muted-foreground">quedan</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <div className="font-heading text-2xl font-bold text-primary">
            {m.listo}
          </div>
          <div className="text-[11px] text-muted-foreground">listo</div>
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
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Syringe className="size-6" />
          </div>
          <p className="text-sm text-muted-foreground">
            No quedan animales sin caravana en este alcance.
          </p>
          <button
            type="button"
            onClick={() => void m.descargar()}
            disabled={!m.online}
            className="text-[13px] font-medium text-primary disabled:opacity-40"
          >
            Volver a cargar la lista
          </button>
        </div>
      )}

      {/* Conflictos (RFID duplicado, etc.) */}
      {m.errores.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-700">
            <AlertTriangle className="size-4" />
            {m.errores.length} con problema al sincronizar
          </div>
          <ul className="flex flex-col gap-1 text-[12px] text-amber-800">
            {m.errores.slice(0, 5).map((e) => (
              <li key={e.local_id}>
                RFID {e.rfid}: {e.error}
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
  const [aviso, setAviso] = useState<string | null>(null)

  const asignar = () => {
    if (!rfid.trim()) {
      setAviso('Falta el RFID')
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
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-heading text-lg font-bold text-foreground">
          {categoriaLabel[animal.categoria]}
        </span>
        <span className="text-[12px] text-muted-foreground">
          {animal.lote_nombre
            ? `Tropa ${animal.lote_nombre}`
            : (animal.potrero_nombre ?? 'Sin potrero')}
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-foreground">
          RFID (caravana) *
        </span>
        <input
          value={rfid}
          onChange={(e) => setRfid(e.target.value)}
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
          placeholder="Escaneá o escribí el RFID"
          className="h-12 rounded-xl border border-border bg-background px-3 text-[16px]"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-foreground">
          Visual (opcional)
        </span>
        <input
          value={visual}
          onChange={(e) => setVisual(e.target.value)}
          autoComplete="off"
          placeholder="N° de caravana visual"
          className="h-11 rounded-xl border border-border bg-background px-3 text-[15px]"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-foreground">
          Categoría
        </span>
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as CategoriaAnimal)}
          className="h-11 rounded-xl border border-border bg-background px-3 text-[15px]"
        >
          {CATEGORIAS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-foreground">Raza</span>
          <input
            list="razas"
            value={raza}
            onChange={(e) => onRaza(e.target.value)}
            placeholder="Raza"
            className="h-11 rounded-xl border border-border bg-background px-3 text-[15px]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-foreground">
            Pelaje
          </span>
          <input
            list="pelajes"
            value={pelaje}
            onChange={(e) => onPelaje(e.target.value)}
            placeholder="Pelaje"
            className="h-11 rounded-xl border border-border bg-background px-3 text-[15px]"
          />
        </label>
      </div>
      <datalist id="razas">
        {RAZAS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <datalist id="pelajes">
        {PELAJES.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {aviso && (
        <p className="text-[12px] font-medium text-destructive">{aviso}</p>
      )}

      <button
        type="button"
        onClick={asignar}
        className="mt-1 flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground"
      >
        <Check className="size-5" />
        Asignar → siguiente
      </button>
    </div>
  )
}
