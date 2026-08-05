import { motion } from 'framer-motion'
import { Check, CloudOff, RefreshCw } from 'lucide-react'
import { CLabel } from '../ui'
import { IconoDestino, Seguir } from './ui-manga'
import {
  colorLado,
  destinoLabel,
  ladoFlecha,
  ordenarPorLado,
  type PlanSalidas,
} from './salidas'

/**
 * Cierre del trabajo: qué quedó hecho.
 *
 * Existe porque en la manga nadie mira la pantalla mientras trabaja — la única
 * lectura tranquila del día es esta. Tiene que responder tres cosas de un
 * vistazo: cuántos pasaron, cómo se repartieron y si falta subir algo.
 *
 * El tilde entra con resorte y una sola vez: es la señal de que el trabajo
 * terminó, no un adorno.
 */
export function CerrarTrabajo({
  titulo,
  hechos,
  total,
  porSalida,
  plan,
  sinSubir,
  conError,
  online,
  onSincronizar,
  onSalir,
}: {
  titulo: string
  hechos: number
  total: number
  /** `salida.id` → cuántos salieron por ahí. */
  porSalida: Record<string, number>
  plan?: PlanSalidas
  sinSubir: number
  conError: number
  online: boolean
  onSincronizar: () => void
  onSalir: () => void
}) {
  const faltan = total > 0 ? Math.max(0, total - hechos) : 0

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 py-8">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 20 }}
          className="flex size-20 items-center justify-center rounded-full bg-[var(--c-ok-soft)]"
        >
          <Check className="size-11 text-[var(--c-ok-deep)]" strokeWidth={2.8} />
        </motion.div>

        <div className="text-center">
          <motion.div
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.08 }}
          >
            <span className="c-mono block text-[52px] font-bold leading-none text-[var(--c-ink)]">
              {hechos}
            </span>
            <p className="c-display mt-1.5 text-[17px] text-[var(--c-ink)]">
              {hechos === 1 ? 'animal pasó' : 'animales pasaron'}
            </p>
            <CLabel className="mt-0.5 block">{titulo}</CLabel>
          </motion.div>
        </div>

        {/* Cómo se repartieron. En un destete, madres y crías tienen que cerrar
            parejo — si no, algo se escapó y este es el momento de verlo. */}
        {plan && plan.salidas.length > 0 && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.14 }}
            className="flex w-full flex-col gap-1.5"
          >
            <CLabel className="mb-0.5">Cómo salieron</CLabel>
            {ordenarPorLado(plan.salidas).map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2.5 rounded-xl border-2 bg-[var(--c-panel)] px-3.5 py-2.5"
                style={{ borderColor: colorLado[s.lado].borde }}
              >
                <span
                  className="c-display shrink-0 text-[16px] leading-none"
                  style={{ color: colorLado[s.lado].tinta }}
                  aria-hidden
                >
                  {ladoFlecha[s.lado]}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="c-display block truncate text-[14.5px]"
                    style={{ color: colorLado[s.lado].tinta }}
                  >
                    {s.etiqueta}
                  </span>
                  <span className="flex items-center gap-1 truncate text-[12px] text-[var(--c-ink-soft)]">
                    <IconoDestino destino={s.destino} className="size-3.5" />
                    <span className="truncate">{destinoLabel(s.destino)}</span>
                  </span>
                </span>
                <span className="c-mono shrink-0 text-[20px] font-bold text-[var(--c-ink)]">
                  {porSalida[s.id] ?? 0}
                </span>
              </div>
            ))}
          </motion.div>
        )}

        {faltan > 0 && (
          <p className="text-center text-[13px] leading-snug text-[var(--c-warn-deep)]">
            Quedaron <b className="c-mono">{faltan}</b> sin pasar de los {total}{' '}
            que había. Si terminaste igual, está bien — la cuenta queda anotada.
          </p>
        )}

        {/* Lo único accionable del cierre: si algo no subió, se ve acá. */}
        {(sinSubir > 0 || conError > 0) && (
          <div className="flex w-full flex-col gap-2 rounded-xl border border-[var(--c-warn)]/45 bg-[var(--c-warn-soft)] px-3.5 py-3">
            <span className="flex items-center gap-2 text-[13px] font-bold text-[var(--c-warn-deep)]">
              <CloudOff className="size-4" />
              {sinSubir > 0
                ? `${sinSubir} sin subir todavía`
                : `${conError} con problema al subir`}
            </span>
            <span className="text-[12.5px] leading-snug text-[var(--c-warn-deep)]">
              {online
                ? 'Tocá para reintentar ahora.'
                : 'Quedan guardados en el teléfono y suben solos cuando haya señal.'}
            </span>
            {online && (
              <button
                type="button"
                onClick={onSincronizar}
                className="c-display mt-0.5 flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--c-warn)] bg-[var(--c-panel)] text-[14px] text-[var(--c-warn-deep)]"
              >
                <RefreshCw className="size-4" />
                Subir ahora
              </button>
            )}
          </div>
        )}
      </div>

      <Seguir onClick={onSalir}>Listo</Seguir>
    </div>
  )
}
