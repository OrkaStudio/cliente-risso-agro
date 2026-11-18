// Las partes que se mueven dentro de los botones de Troppero: la palabra que cambia con el
// ancho que viaja, el tilde que se dibuja, el giro de cargando y el ícono que vuelve.
// Las usan los botones de la app (boton.tsx) y la muestra de /estilo/listo.
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion"
import { useLayoutEffect, useRef, useState } from "react"

import { CAMBIO_ANCHO, LISTO_RECOGER, LISTO_TILDE, SALTO } from "@/lib/animacion"
import { cn } from "@/lib/utils"

import { useF } from "./boton-movimiento"

/** El tilde que se dibuja de un trazo. `quieto` lo muestra entero, sin dibujarlo. */
export function Tilde({ tamano = 24, quieto, className }: { tamano?: number; quieto?: boolean; className?: string }) {
  const reducir = useReducedMotion()
  const f = useF()
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <motion.path
        d={LISTO_TILDE.camino}
        // Arranca invisible: con la punta redonda, un trazo de largo 0 se ve como un puntito.
        initial={quieto || reducir ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: LISTO_TILDE.duracion * f, ease: LISTO_TILDE.curva, delay: LISTO_TILDE.demora * f, opacity: { duration: 0.01, delay: LISTO_TILDE.demora * f } }}
      />
    </svg>
  )
}

/** El ícono de siempre, al volver del «Listo»: espera a que el pasto se recoja y aparece
 *  suave. Si entra de golpe, queda un rato terracota encima del verde. */
export function Vuelve({ children }: { children: React.ReactNode }) {
  const f = useF()
  return (
    <motion.span className="grid place-items-center" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...SALTO, visualDuration: SALTO.visualDuration * f, delay: LISTO_RECOGER.visualDuration * 0.75 * f }}>
      {children}
    </motion.span>
  )
}

export function Giro({ className }: { className?: string }) {
  return <span className={cn("size-[18px] animate-spin rounded-full border-2 border-current/30 border-t-current", className)} />
}

/** La palabra del botón. Cuando cambia, la nueva sube y la vieja se va, y el ancho viaja
 *  de una a otra a la par (antes se quedaba en el largo de la vieja y saltaba de golpe).
 *  Si el botón crece («Listo» → «Guardar borrador»), la palabra larga espera a que haya
 *  lugar; si no, entra cortada a la mitad mientras el ancho se abre. */
export function Texto({ k, children }: { k: string; children: React.ReactNode }) {
  const f = useF()
  const medida = useRef<HTMLSpanElement>(null)
  const [ancho, setAncho] = useState<number | "auto">("auto")
  // El ancho de cada palabra ya medida: al volver a una, se sabe antes de pintarla si crece.
  const [anchos, setAnchos] = useState<Record<string, number>>({})
  useLayoutEffect(() => {
    const el = medida.current
    if (!el) return
    // Con decimales y para arriba: offsetWidth redondea y la última letra quedaba cortada.
    const medir = () => {
      const nuevo = Math.ceil(el.getBoundingClientRect().width)
      setAncho((viejo) => (viejo === nuevo ? viejo : nuevo))
      setAnchos((a) => (a[k] === nuevo ? a : { ...a, [k]: nuevo }))
    }
    medir()
    // La palabra también cambia sin cambiar de estado («Anotar $9» → «Anotar $90.000» mientras
    // se escribe; «marcar 1» → «marcar 3»): se vuelve a medir cada vez que cambia su tamaño.
    // Antes se medía sólo al cambiar de estado y el texto nuevo quedaba cortado.
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [k])
  const conocido = anchos[k]
  const crece = typeof ancho === "number" && conocido !== undefined && conocido > ancho + 1
  return (
    <motion.span className="relative grid justify-items-start overflow-hidden text-left whitespace-nowrap" initial={false} animate={{ width: ancho }} transition={{ ...CAMBIO_ANCHO, visualDuration: CAMBIO_ANCHO.visualDuration * f }}>
      {/* Copia invisible de la palabra actual: de acá sale el ancho al que tiene que llegar. */}
      <span ref={medida} aria-hidden className="invisible absolute top-0 left-0">{children}</span>
      <AnimatePresence initial={false}>
        <Palabra key={k} demora={crece ? CAMBIO_ANCHO.visualDuration * 0.7 * f : 0} f={f}>
          {children}
        </Palabra>
      </AnimatePresence>
    </motion.span>
  )
}

/** Una palabra que entra o se va. La demora se fija al aparecer y no cambia después. */
function Palabra({ demora, f, children }: { demora: number; f: number; children: React.ReactNode }) {
  const [espera] = useState(demora)
  // La palabra que se va sigue un rato en la página mientras se desvanece: que el lector de
  // pantalla no la lea (si no, el botón se anunciaba «Borrar Sí, borrar Deshacer»).
  const presente = useIsPresent()
  const salto = { ...SALTO, visualDuration: SALTO.visualDuration * f }
  return (
    <motion.span aria-hidden={presente ? undefined : true} className="[grid-area:1/1]" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { ...salto, delay: espera } }} exit={{ opacity: 0, y: -10, transition: salto }}>
      {children}
    </motion.span>
  )
}

