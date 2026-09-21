import { useRef, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * El remolque: un tractor visto desde arriba sube desde abajo de la pantalla
 * EMPUJANDO la tarjeta, la deja en su lugar y se va marcha atrás. Deja las
 * huellas de las ruedas por donde pasó —detrás de él, o sea debajo—, y se
 * borran a medida que la tarjeta llega.
 *
 * Empuja, no tira: si tirara desde arriba, las huellas quedarían debajo de la
 * tarjeta y no se verían nunca (la tarjeta es más alta que el recorrido).
 * Empujando desde abajo, las huellas quedan a la vista entre el tractor y el
 * borde inferior, que es donde uno espera verlas.
 *
 * Va SÓLO en las cuatro pantallas que abren y cierran algo —entrar, crear la
 * cuenta, el primer paso del onboarding y el festejo final—, y no en cada
 * pantalla intermedia. Un tractor que trae la pantalla es memorable la
 * primera vez y la última; ocho veces seguidas es una traba. Los pasos del
 * medio entran callados (ver `Reveal` y `Paso`).
 *
 * El desenfoque de la tarjeta mientras sube se SACA del style al terminar,
 * imperativamente por ref. Framer deja `filter: blur(0px)` escrito y eso crea
 * contexto de apilado, que ya encerró una vez la lista de localidades. La
 * prop `style` no alcanza para limpiarlo: framer escribe después de React.
 *
 * Dura 2,4 s. Con `prefers-reduced-motion` la tarjeta aparece y ya.
 */
export function Remolque({ activo, children }: { activo: boolean; children: ReactNode }) {
  const quieto = useReducedMotion()
  const tarjeta = useRef<HTMLDivElement>(null)
  if (!activo || quieto) return <>{children}</>

  // Cuánto sube la tarjeta. Modesto a propósito: alcanza para que se lea
  // "viene de abajo" sin sacar la tarjeta del viewport en pantallas bajas.
  const RECORRIDO = 190
  // Curva pareja (ease-in-out), no la expo de la app: acá lo que se quiere
  // es ver el trayecto, no llegar rápido. Un tractor no da latigazos.
  const SUBIDA = [0.55, 0.05, 0.25, 1] as const

  return (
    <div className="relative flex w-full justify-center">
      {/* Las huellas: dos líneas de trazos desde donde arrancó el tractor
          hasta donde está ahora. Ancladas ABAJO (donde arrancó) y creciendo
          hacia arriba al ritmo de la subida, así nunca van por delante. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 z-0 flex -translate-x-1/2 gap-[18px]"
        style={{ bottom: -(RECORRIDO + 34) }}
        initial={{ height: 30, opacity: 0 }}
        animate={{
          height: RECORRIDO + 30,
          opacity: [0, 0.5, 0.5, 0],
          filter: ['blur(0px)', 'blur(0px)', 'blur(0.5px)', 'blur(2px)'],
        }}
        transition={{
          height: { duration: 1.6, delay: 0.1, ease: SUBIDA },
          opacity: { duration: 2.3, times: [0, 0.08, 0.72, 1] },
          filter: { duration: 2.3, times: [0, 0.08, 0.72, 1] },
        }}
      >
        <span className="h-full w-[6px] rounded-full bg-[repeating-linear-gradient(to_bottom,var(--color-primary)_0_7px,transparent_7px_13px)]" />
        <span className="h-full w-[6px] rounded-full bg-[repeating-linear-gradient(to_bottom,var(--color-primary)_0_7px,transparent_7px_13px)]" />
      </motion.div>

      {/* Tractor + tarjeta, remolcados juntos. */}
      <motion.div
        ref={tarjeta}
        className="relative z-10 flex w-full justify-center"
        initial={{ y: RECORRIDO, opacity: 0, filter: 'blur(3px)' }}
        animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
        transition={{
          y: { duration: 1.6, delay: 0.1, ease: SUBIDA },
          opacity: { duration: 0.18 },
          filter: { duration: 1.5, delay: 0.2, ease: 'easeOut' },
        }}
        onAnimationComplete={() => {
          // Ver la nota de arriba: sin filtro residual.
          tarjeta.current?.style.removeProperty('filter')
        }}
      >
        {/* El tractor, empujando desde abajo. Al dejar la tarjeta se va
            marcha atrás, desvaneciéndose. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/2 -bottom-9 z-20 -translate-x-1/2 text-primary"
          initial={{ y: 0, opacity: 1 }}
          animate={{ y: 260, opacity: 0 }}
          transition={{ duration: 0.7, delay: 1.7, ease: 'easeIn' }}
        >
          <TractorDesdeArriba />
        </motion.div>
        {children}
      </motion.div>
    </div>
  )
}

/**
 * Tractor visto desde arriba, apuntando hacia arriba, en una caja de 30×34.
 * Lo que tiene que leerse a 30 px: dos ruedas traseras grandes, dos
 * delanteras chicas, la cabina y el escape. Nada más.
 */
function TractorDesdeArriba() {
  return (
    <svg width="30" height="34" viewBox="0 0 30 34" fill="none">
      {/* Ruedas traseras, anchas. */}
      <rect x="1" y="21" width="6" height="11" rx="2" className="fill-current" />
      <rect x="23" y="21" width="6" height="11" rx="2" className="fill-current" />
      {/* Ruedas delanteras, angostas. */}
      <rect x="4" y="5" width="4" height="8" rx="1.5" className="fill-current" opacity="0.85" />
      <rect x="22" y="5" width="4" height="8" rx="1.5" className="fill-current" opacity="0.85" />
      {/* Chasis. */}
      <rect x="8" y="3" width="14" height="29" rx="3" className="fill-current" />
      {/* Capot, un poco más claro, y la cabina atrás. */}
      <rect x="10.5" y="5" width="9" height="11" rx="1.5" className="fill-[var(--color-card)]" opacity="0.28" />
      <rect x="10" y="18" width="10" height="11" rx="2" className="fill-[var(--color-card)]" opacity="0.5" />
      {/* Escape, con su humito hacia atrás. */}
      <circle cx="9.5" cy="19" r="1.4" className="fill-[var(--color-card)]" opacity="0.9" />
      <motion.circle
        cx="9.5"
        cy="21"
        r="1.4"
        className="fill-current"
        initial={{ opacity: 0.45, cy: 22, r: 1.2 }}
        animate={{ opacity: 0, cy: 34, r: 3 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'easeOut' }}
      />
    </svg>
  )
}
