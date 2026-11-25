import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { IconoDestino } from './ui-manga'
import { colorLado, destinoLabel, ladoFlecha, ladoLabel, ordenarPorLado, type Salida } from './salidas'

/**
 * Las puertas del cepo: la mitad de abajo de la pantalla de trabajo.
 *
 * Antes esto eran CUATRO bloques distintos —el cartel del animal, los botones
 * del tacto, los chips del aparte libre y los contadores— que decían lo mismo
 * de cuatro formas y dejaban media pantalla vacía. Son una sola cosa: **la
 * salida**. Acá se ven todas juntas, del tamaño que da la pantalla.
 *
 * Lo que hace entendible el aparte es que la puerta de la izquierda ESTÁ a la
 * izquierda. La dirección se dice cuatro veces —posición, flecha, color y
 * palabra— para que se resuelva de reojo, con el animal moviéndose y sin
 * mirar fijo.
 *
 * Una misma pieza sirve para los tres modos porque la diferencia no es la
 * forma sino quién decide:
 *   · `categoria` → la app enciende sola la puerta que le toca al animal.
 *   · `resultado` → el operario toca la puerta, y ese toque ES el resultado.
 *   · `libre`     → el operario deja una puerta puesta hasta que mueva la reja.
 */

export function Puertas({
  salidas,
  porSalida,
  encendida,
  heroEncendida,
  activa,
  onElegir,
  pidiendoToque,
}: {
  salidas: Salida[]
  /** `salida.id` → cuántos salieron por ahí. */
  porSalida: Record<string, number>
  /** La que acaba de recibir un animal. Se enciende y las otras se apagan. */
  encendida: string | null
  /** Qué ES el animal que acaba de pasar. Puede no ser el nombre del grupo:
   *  en un grupo "Vacas y vaquillonas", el que pasó es una vaquillona. */
  heroEncendida?: string | null
  /** Modo libre: la puerta que quedó puesta. */
  activa?: string | null
  /** Ausente = las puertas son indicadores, no botones. */
  onElegir?: (s: Salida) => void
  /** Hay un animal identificado esperando que se toque una puerta. */
  pidiendoToque?: boolean
}) {
  const enOrden = ordenarPorLado(salidas)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {pidiendoToque && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="c-label shrink-0 text-center !text-[11.5px] !text-[var(--c-ink-soft)]"
        >
          Tocá por dónde sale
        </motion.p>
      )}

      <div className="flex min-h-0 flex-1 gap-2">
        {enOrden.map((s) => {
          const c = colorLado[s.lado]
          const on = encendida === s.id
          const puesta = activa === s.id
          const tocable = Boolean(onElegir)
          // La flecha se pega al borde EXTERNO de su puerta: la de la
          // izquierda apunta y se va hacia afuera de la pantalla.
          const alinear =
            s.lado === 'izq'
              ? 'items-start'
              : s.lado === 'der'
                ? 'items-end'
                : 'items-center'

          const Contenido = (
            <>
              <span
                className={cn('flex w-full', alinear, 'justify-between')}
                aria-hidden
              >
                <span
                  className="leading-none"
                  style={{
                    color: on ? '#fff' : c.tinta,
                    fontSize: on ? 34 : 26,
                  }}
                >
                  {ladoFlecha[s.lado]}
                </span>
              </span>

              <span className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 text-center">
                <span
                  data-testid={on ? 'cartel-hero' : undefined}
                  className="c-display max-w-full truncate leading-none"
                  style={{
                    color: on ? '#fff' : c.tinta,
                    fontSize: on ? 25 : 17,
                  }}
                >
                  {on && heroEncendida ? heroEncendida : s.etiqueta}
                </span>
                <span
                  className="c-mono font-bold leading-none"
                  style={{
                    color: on ? '#fff' : 'var(--c-ink)',
                    fontSize: on ? 36 : 30,
                  }}
                >
                  {porSalida[s.id] ?? 0}
                </span>
              </span>

              <span
                className="flex w-full items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[11.5px] font-semibold"
                style={{
                  backgroundColor: on ? 'rgba(255,255,255,.18)' : c.fondo,
                  color: on ? '#fff' : c.tinta,
                }}
              >
                <IconoDestino destino={s.destino} className="size-3.5" />
                <span className="truncate">{destinoLabel(s.destino)}</span>
              </span>

              <span
                className="c-label !text-[9.5px]"
                style={{ color: on ? 'rgba(255,255,255,.8)' : 'var(--c-faint)' }}
              >
                {ladoLabel[s.lado]}
              </span>
            </>
          )

          // La puerta encendida se llena con la TINTA (el tono profundo), no
          // con el borde: el verde medio de `--c-ok` con letra blanca encima no
          // se lee, y esta es justo la que hay que leer de reojo a un brazo.
          const estilo = {
            borderColor: on ? c.tinta : c.borde,
            backgroundColor: on ? c.tinta : puesta ? c.fondo : 'var(--c-panel)',
          }
          const clases = cn(
            'flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-hidden rounded-2xl px-2 py-2.5 transition-colors',
            on || puesta ? 'border-4' : 'border-2',
            !on && !puesta && !tocable && 'opacity-70',
          )

          return onElegir ? (
            <motion.button
              key={s.id}
              type="button"
              onClick={() => onElegir(s)}
              whileTap={{ scale: 0.97 }}
              animate={on ? { scale: [1, 1.03, 1] } : { scale: 1 }}
              transition={{ duration: 0.28 }}
              className={clases}
              style={estilo}
              aria-label={`${s.etiqueta} — ${ladoLabel[s.lado]}, ${destinoLabel(s.destino)}`}
            >
              {Contenido}
            </motion.button>
          ) : (
            <motion.div
              key={s.id}
              animate={on ? { scale: [1, 1.03, 1] } : { scale: 1 }}
              transition={{ duration: 0.28 }}
              className={clases}
              style={estilo}
            >
              {Contenido}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
