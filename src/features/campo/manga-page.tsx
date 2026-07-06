import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CloudOff,
  RefreshCw,
  RotateCcw,
  ScanLine,
  StickyNote,
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

export function MangaPage() {
  const m = useManga()

  if (m.cargando) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        Cargando manga…
      </p>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      {/* ===== Header fijo: estado, alcance, progreso ===== */}
      <header className="flex shrink-0 flex-col gap-3 border-b border-border/70 bg-background px-5 pb-4 pt-4">
        <div className="flex items-center justify-between text-[13px]">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 font-bold',
              m.online ? 'text-field' : 'text-accent',
            )}
          >
            {m.online ? (
              <Wifi className="size-[18px]" />
            ) : (
              <CloudOff className="size-[18px]" />
            )}
            {m.online ? 'Con señal' : 'Sin señal'}
          </span>
          <button
            type="button"
            onClick={() => void m.sincronizar()}
            disabled={!m.online || m.sinSincronizar === 0 || m.sincronizando}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold transition-colors',
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

        <div className="flex items-end gap-3">
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
                label: `${o.label} · ${o.pendientes}`,
              }))}
              className="h-11"
            />
          </div>
          <div className="shrink-0 pb-0.5 text-right leading-none">
            <div className="font-heading text-[26px] font-bold leading-none text-ink tnum">
              {m.quedan}
            </div>
            <div className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-faint">
              quedan
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
            <motion.div
              className="h-full rounded-full bg-field"
              initial={false}
              animate={{ width: `${Math.round(m.progreso * 100)}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 30 }}
            />
          </div>
          <span className="shrink-0 text-[12px] font-bold text-field-deep tnum">
            {m.listo} listos
          </span>
        </div>
      </header>

      {/* Último caravaneo: confirmación + deshacer (pulsa en cada asignación) */}
      {m.ultimo && (
        <div className="shrink-0 px-5 pt-3">
          <motion.div
            key={m.ultimo.local_id}
            initial={{ scale: 0.97, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            className="flex items-center justify-between gap-2 rounded-2xl border border-field/25 bg-field-soft/60 px-3.5 py-2.5"
          >
            <span className="flex min-w-0 items-center gap-2 text-[13px] font-bold text-field-deep">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-field text-white">
                <Check className="size-4" strokeWidth={3} />
              </span>
              <span className="truncate">RFID {m.ultimo.rfid}</span>
            </span>
            <button
              type="button"
              onClick={() => void m.deshacer()}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-faint active:scale-95"
            >
              <RotateCcw className="size-3.5" />
              Deshacer
            </button>
          </motion.div>
        </div>
      )}

      {m.errores.length > 0 && (
        <div className="shrink-0 px-5 pt-3">
          <div className="flex flex-col gap-1.5 rounded-2xl border border-accent/40 bg-accent/10 p-3.5">
            <div className="flex items-center gap-1.5 text-[13px] font-bold text-accent">
              <AlertTriangle className="size-4" />
              {m.errores.length} con problema al subir
            </div>
            <ul className="flex flex-col gap-1 text-[12px] font-medium text-accent-foreground/80">
              {m.errores.slice(0, 4).map((e) => (
                <li key={e.local_id}>
                  <span className="font-semibold">RFID {e.rfid}:</span> {e.error}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ===== Cuerpo ===== */}
      {m.actual ? (
        <AnimalForm
          key={m.actual.id}
          animal={m.actual}
          rfidsUsados={m.rfidsUsados}
          onAsignar={(datos) => {
            // Confirmación háptica al asignar; el pulso visual lo da "Último".
            if ('vibrate' in navigator) navigator.vibrate(50)
            void m.asignar(m.actual!.id, datos)
          }}
        />
      ) : m.sinLista && !m.online ? (
        // Nunca se descargó la lista y no hay señal: decirlo tal cual (no es
        // lo mismo que "todo caravaneado").
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
          <div className="flex size-20 items-center justify-center rounded-3xl bg-secondary text-faint">
            <CloudOff className="size-10" strokeWidth={2} />
          </div>
          <p className="text-[15px] font-semibold text-ink">
            Sin señal y sin lista descargada.
          </p>
          <p className="text-[13.5px] text-ink-soft">
            Entrá una vez con señal para bajar los animales sin caravana; de
            ahí en más la manga anda sin conexión.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
          <div className="flex size-20 items-center justify-center rounded-3xl bg-field-soft text-field">
            <Check className="size-10" strokeWidth={2.2} />
          </div>
          <p className="text-[15px] font-semibold text-ink">
            No quedan animales sin caravana en este alcance.
          </p>
          <button
            type="button"
            onClick={() => void m.descargar()}
            disabled={!m.online}
            className="text-[13.5px] font-semibold text-field disabled:opacity-40"
          >
            Volver a cargar la lista
          </button>
        </div>
      )}
    </div>
  )
}

type AnimalFormProps = {
  animal: AnimalSinCaravana
  rfidsUsados: Set<string>
  onAsignar: (datos: AsignacionLocal) => void
}

/**
 * Form de un animal (keyado por id → arranca fresco). El RFID es el héroe; el
 * botón Asignar queda anclado abajo para que el pulgar lo encuentre siempre.
 * Nota opcional plegada (algo que se observa del animal en la manga).
 */
function AnimalForm({ animal, rfidsUsados, onAsignar }: AnimalFormProps) {
  const [rfid, setRfid] = useState('')
  const [visual, setVisual] = useState('')
  const [categoria, setCategoria] = useState<CategoriaAnimal>(animal.categoria)
  const [nota, setNota] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [abrirNota, setAbrirNota] = useState(false)

  // Aviso instantáneo (sin esperar al sync): RFID ya usado en la sesión O en
  // cualquier animal del rodeo (cache de vigentes).
  const repetido = rfid.trim() !== '' && rfidsUsados.has(rfid.trim().toLowerCase())

  const asignar = () => {
    if (!rfid.trim()) {
      setAviso('Escaneá o escribí el RFID')
      return
    }
    if (repetido) {
      setAviso('Ese RFID ya está en uso en otro animal')
      return
    }
    onAsignar({
      rfid,
      visual: visual || undefined,
      categoria,
      nota: nota.trim() || undefined,
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        {/* Contexto: qué animal estoy por caravanear */}
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="h-5 w-1 shrink-0 rounded-full bg-field"
          />
          <span className="truncate font-heading text-[17px] font-bold text-ink">
            {animal.lote_nombre
              ? `Tropa ${animal.lote_nombre}`
              : (animal.potrero_nombre ?? 'Sin potrero')}
          </span>
        </div>

        {/* RFID: el héroe (el bastón teclea acá) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
            Caravana RFID
          </span>
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
                'size-7 shrink-0',
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
              className="h-[68px] min-w-0 flex-1 bg-transparent text-[22px] font-bold tracking-wide text-ink outline-none placeholder:text-[19px] placeholder:font-semibold placeholder:text-faint"
            />
          </div>
          {aviso ? (
            <p className="flex items-center gap-1 text-[12.5px] font-semibold text-destructive">
              <AlertTriangle className="size-3.5" />
              {aviso}
            </p>
          ) : (
            repetido && (
              <p className="flex items-center gap-1 text-[12.5px] font-semibold text-accent">
                <AlertTriangle className="size-3.5" />
                Ese RFID ya está en uso
              </p>
            )
          )}
        </div>

        {/* Categoría + visual */}
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
              Categoría
            </span>
            <Dropdown
              block
              ariaLabel="Categoría"
              value={categoria}
              onChange={(v) => setCategoria(v as CategoriaAnimal)}
              options={CATEGORIA_OPTS}
              className="h-12"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
              Visual
            </span>
            <input
              value={visual}
              onChange={(e) => setVisual(e.target.value)}
              autoComplete="off"
              placeholder="opc."
              className="h-12 w-24 rounded-xl border border-border bg-card px-3 text-[16px] font-medium text-ink outline-none transition-colors focus:border-field"
            />
          </div>
        </div>

        {/* Nota: plegada (opcional; algo que se observa del animal) */}
        <div className="rounded-2xl border border-border">
          <button
            type="button"
            onClick={() => setAbrirNota((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left"
          >
            <span className="flex min-w-0 items-center gap-2">
              {nota.trim() ? (
                <>
                  <StickyNote className="size-4 shrink-0 text-field" />
                  <span className="truncate text-[14px] font-semibold text-ink">
                    {nota.trim()}
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-2 text-[14px] font-medium text-faint">
                  <StickyNote className="size-4 shrink-0" />
                  Agregar nota (opcional)
                </span>
              )}
            </span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-faint transition-transform',
                abrirNota && 'rotate-180',
              )}
            />
          </button>
          {abrirNota && (
            <div className="border-t border-border px-4 pb-4 pt-3.5">
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                autoFocus
                rows={2}
                placeholder="Ej: renga, ojo lastimado, apartar…"
                className="w-full resize-none rounded-xl border border-border bg-field-soft/30 px-3 py-2.5 text-[15px] text-ink outline-none focus:border-field"
              />
            </div>
          )}
        </div>
      </div>

      {/* Acción principal: footer fijo (siempre a la vista, el pulgar la
          encuentra en el mismo lugar; nunca tapa el contenido que scrollea). */}
      <div className="shrink-0 border-t border-border/70 bg-background px-5 pb-4 pt-3.5">
        <button
          type="button"
          onClick={asignar}
          className="flex h-16 w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-[18px] font-bold text-primary-foreground shadow-[0_10px_24px_rgba(16,138,85,0.32)] transition-all hover:bg-primary/90 active:translate-y-px active:shadow-[0_6px_16px_rgba(16,138,85,0.28)]"
        >
          <Check className="size-6" strokeWidth={2.5} />
          Asignar → siguiente
        </button>
      </div>
    </div>
  )
}
