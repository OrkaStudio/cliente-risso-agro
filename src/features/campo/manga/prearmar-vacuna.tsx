import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Syringe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CChip, CLabel } from '../ui'
import { Encabezado, Seguir } from './ui-manga'

/**
 * Prearmado de la vacunación: se define UNA vez y vale para todos los animales
 * de la sesión. Es el momento en que se mira la pantalla — después el teléfono
 * se guarda y solo se escanea.
 *
 * Lo que se carga acá va a `evento.datos` y queda en el historial de cada
 * animal, así que tiene que alcanzar para responder "¿qué le pusiste, quién lo
 * aplicó y hasta cuándo no se puede vender?" dentro de un año.
 */

const VACUNAS = [
  'Aftosa',
  'Brucelosis',
  'Carbunclo',
  'Mancha y gangrena',
  'Querato',
  'Antiparasitario',
] as const

/** Los del prospecto, en días. "Sin retiro" es una respuesta legítima: varias
 *  vacunas no tienen, y dejarlo vacío no distingue "no tiene" de "no lo cargué". */
const RETIROS = [0, 30, 60, 90] as const

/** Se recuerdan los últimos usados: en un campo son siempre los mismos dos o
 *  tres, y volver a tipearlos con guantes no aporta nada. */
const CLAVE_VETES = 'risso.manga.veterinarios'

function recordados(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_VETES) ?? '[]')
    return Array.isArray(v) ? v.slice(0, 4) : []
  } catch {
    return []
  }
}

function recordar(nombre: string) {
  const limpio = nombre.trim()
  if (!limpio) return
  const previos = recordados().filter((v) => v !== limpio)
  localStorage.setItem(CLAVE_VETES, JSON.stringify([limpio, ...previos].slice(0, 4)))
}

export type DatosVacuna = {
  /** Todo lo que se aplica en la misma pasada. Cada una queda como un hecho
   *  propio en el historial del animal: son productos distintos. */
  vacunas: string[]
  producto: string | null
  veterinario: string | null
  /** Días de retiro. 0 = el producto no tiene. */
  retiroDias: number
  /** Fecha hasta la que NO se puede mandar a faena (derivada, para no
   *  recalcularla en cada pantalla que la quiera avisar). */
  retiroHasta: string | null
}

export function PrearmarVacuna({
  onListo,
  onVolver,
}: {
  onListo: (d: DatosVacuna) => void
  onVolver: () => void
}) {
  const [vacunas, setVacunas] = useState<string[]>([VACUNAS[0]])
  const [producto, setProducto] = useState('')
  const [vete, setVete] = useState('')
  const [retiro, setRetiro] = useState<number>(0)
  const vetes = recordados()

  const confirmar = () => {
    recordar(vete)
    const hasta =
      retiro > 0
        ? new Date(Date.now() + retiro * 86_400_000).toISOString().slice(0, 10)
        : null
    onListo({
      vacunas,
      producto: producto.trim() || null,
      veterinario: vete.trim() || null,
      retiroDias: retiro,
      retiroHasta: hasta,
    })
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      <Encabezado titulo="Vacunar" sub="Se carga una vez" onVolver={onVolver} />

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
        <div>
          <CLabel className="mb-1.5 block">
            ¿Qué se aplica? — podés marcar varias
          </CLabel>
          {/* Tarjetas y no chips: es la decisión más importante de la pantalla
              y tiene que reconocerse de un vistazo, no leerse. En la manga se
              aplican varias cosas en la misma pasada —meter el rodeo es caro—
              así que se marcan todas y cada una queda como un hecho propio. */}
          <div className="grid grid-cols-2 gap-2">
            {VACUNAS.map((v) => {
              const on = vacunas.includes(v)
              return (
                <motion.button
                  key={v}
                  type="button"
                  onClick={() =>
                    setVacunas((prev) =>
                      prev.includes(v)
                        ? prev.filter((x) => x !== v)
                        : [...prev, v],
                    )
                  }
                  whileTap={{ scale: 0.97 }}
                  aria-pressed={on}
                  className={cn(
                    'relative flex min-h-[60px] items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition-colors',
                    on
                      ? 'border-[var(--c-ok)] bg-[var(--c-ok-soft)]'
                      : 'border-[var(--c-line-strong)] bg-[var(--c-panel)]',
                  )}
                >
                  <Syringe
                    className={cn(
                      'size-4 shrink-0',
                      on ? 'text-[var(--c-ok-deep)]' : 'text-[var(--c-faint)]',
                    )}
                  />
                  <span
                    className={cn(
                      'c-display min-w-0 flex-1 text-[14px] leading-tight',
                      on ? 'text-[var(--c-ok-deep)]' : 'text-[var(--c-ink)]',
                    )}
                  >
                    {v}
                  </span>
                  {on && (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-[var(--c-ok)]">
                      <Check className="size-3.5 text-white" strokeWidth={3.5} />
                    </span>
                  )}
                </motion.button>
              )
            })}
          </div>
        </div>

        <div>
          <CLabel className="mb-1.5 block">Producto · opcional</CLabel>
          <input
            value={producto}
            onChange={(e) => setProducto(e.target.value)}
            autoComplete="off"
            placeholder="Marca y serie"
            className="h-12 w-full rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 text-[15px] text-[var(--c-ink)] outline-none focus:border-[var(--c-ok)]"
          />
        </div>

        <div>
          <CLabel className="mb-1.5 block">Veterinario · opcional</CLabel>
          <input
            value={vete}
            onChange={(e) => setVete(e.target.value)}
            autoComplete="off"
            placeholder="Quién lo aplica"
            className="h-12 w-full rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 text-[15px] text-[var(--c-ink)] outline-none focus:border-[var(--c-ok)]"
          />
          {vetes.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {vetes.map((v) => (
                <CChip
                  key={v}
                  label={v}
                  selected={vete === v}
                  onClick={() => setVete(v)}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <CLabel className="mb-1.5 block">Retiro</CLabel>
          {/* En una sola fila: envueltos en dos, la última opción quedaba
              tapada por el botón de abajo. */}
          <div className="grid grid-cols-4 gap-1.5">
            {RETIROS.map((d) => {
              const on = retiro === d
              return (
                <motion.button
                  key={d}
                  type="button"
                  onClick={() => setRetiro(d)}
                  whileTap={{ scale: 0.96 }}
                  aria-pressed={on}
                  className={cn(
                    'c-display h-11 rounded-lg border-2 text-[13.5px] transition-colors',
                    on
                      ? 'border-[var(--c-ok)] bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]'
                      : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink-soft)]',
                  )}
                >
                  {d === 0 ? 'Sin' : `${d} d`}
                </motion.button>
              )
            })}
          </div>
          <p
            className={cn(
              'mt-1.5 text-[12px] leading-snug',
              retiro > 0 ? 'text-[var(--c-ok-deep)]' : 'text-[var(--c-ink-soft)]',
            )}
          >
            {retiro > 0
              ? `No se pueden vender por ${retiro} días. La web avisa si querés antes.`
              : 'Días de espera antes de faena. Está en el prospecto.'}
            {vacunas.length > 1 &&
              ' Poné el más largo de los que apliques hoy.'}
          </p>
        </div>
      </div>

      <Seguir onClick={confirmar} disabled={vacunas.length === 0}>
        {vacunas.length > 1
          ? `Empezar con ${vacunas.length} vacunas`
          : 'Empezar a vacunar'}
      </Seguir>
    </div>
  )
}
