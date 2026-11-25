import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CLabel } from '../ui'
import { Seguir } from './ui-manga'
import {
  ACTIVIDADES,
  estaLista,
  type ClaveActividad,
} from './actividades'

/**
 * Primera pantalla de la manga: qué se va a hacer hoy.
 *
 * Va antes que nada porque decide todo lo que sigue — qué se prearma, qué pide
 * cada escaneo y cómo se ve la pantalla de trabajo. Preguntarla al final
 * obligaría a rehacer el camino.
 *
 * Es multi-selección a propósito: meter el rodeo a la manga es caro y casi
 * nunca se hace una sola cosa por pasada (se vacuna Y se tacta).
 */
export function ElegirActividad({
  elegidas,
  onToggle,
  onSeguir,
}: {
  elegidas: Set<ClaveActividad>
  onToggle: (c: ClaveActividad) => void
  onSeguir: () => void
}) {
  const cuantas = elegidas.size
  // Solo se puede seguir con lo que ya está construido. Las demás se ven —el
  // productor merece saber a dónde va la manga— pero no arrancan a medias.
  const listas = [...elegidas].filter(estaLista).length
  const puede = cuantas > 0 && listas === cuantas

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        <h1 className="c-display text-[21px] text-[var(--c-ink)]">
          ¿Qué se hace hoy?
        </h1>
        <p className="text-[13px] leading-snug text-[var(--c-ink-soft)]">
          Marcá todo lo que se vaya a hacer en esta pasada.
        </p>

        <div className="mt-1 grid grid-cols-2 gap-2.5">
          {ACTIVIDADES.map((a) => {
            const on = elegidas.has(a.clave)
            const lista = estaLista(a.clave)
            return (
              <motion.button
                key={a.clave}
                type="button"
                onClick={() => onToggle(a.clave)}
                whileTap={{ scale: 0.97 }}
                aria-pressed={on}
                className={cn(
                  'relative flex min-h-[104px] flex-col items-start justify-center gap-1 rounded-2xl border-2 px-3.5 py-3 text-left transition-colors',
                  on
                    ? 'border-[var(--c-ok)] bg-[var(--c-ok-soft)]'
                    : 'border-[var(--c-line-strong)] bg-[var(--c-panel)]',
                  !lista && 'opacity-70',
                )}
              >
                {on && (
                  <motion.span
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                    className="absolute right-2.5 top-2.5 flex size-6 items-center justify-center rounded-lg bg-[var(--c-ok)]"
                  >
                    <Check className="size-4 text-white" strokeWidth={3.5} />
                  </motion.span>
                )}
                <span
                  className={cn(
                    'c-display text-[16.5px] leading-tight',
                    on ? 'text-[var(--c-ok-deep)]' : 'text-[var(--c-ink)]',
                  )}
                >
                  {a.nombre}
                </span>
                <span className="text-[11.5px] leading-tight text-[var(--c-ink-soft)]">
                  {a.detalle}
                </span>
                {!lista && (
                  <CLabel className="mt-0.5 !text-[9.5px] !text-[var(--c-warn-deep)]">
                    En camino
                  </CLabel>
                )}
              </motion.button>
            )
          })}
        </div>
      </div>

      <Seguir onClick={onSeguir} disabled={!puede}>
        {cuantas === 0
          ? 'Elegí qué se hace'
          : listas < cuantas
            ? 'Todavía no está lista'
            : cuantas === 1
              ? 'Elegir los animales'
              : `Elegir los animales · ${cuantas} trabajos`}
      </Seguir>
    </div>
  )
}
