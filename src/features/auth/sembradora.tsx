import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CURVA } from '@/lib/animacion'

/**
 * El remolque: un tractor entra desde la izquierda, engancha la tarjeta con
 * una soga y la sube desde abajo. Después larga la soga y se va por la
 * derecha.
 *
 * Va SÓLO en las cuatro pantallas que abren y cierran algo —entrar, crear la
 * cuenta, el primer paso del onboarding y el festejo final—, y no en cada
 * pantalla intermedia. Esa es la lección de las dos versiones anteriores: lo
 * que arruinaba al barrido verde no era el verde, era repetir un gesto fuerte
 * a la frecuencia de uno tranquilo. Un tractor que trae la pantalla es
 * memorable la primera vez y la última; ocho veces seguidas es una traba.
 * Los pasos del medio entran callados (ver `Reveal` y `Paso`).
 *
 * Dura 2,1 s. Con `prefers-reduced-motion` la tarjeta aparece y ya.
 */
export function Remolque({ activo, children }: { activo: boolean; children: ReactNode }) {
  const quieto = useReducedMotion()
  if (!activo || quieto) return <>{children}</>

  return (
    <div className="relative flex w-full justify-center">
      {/* El tractor y su soga. Van en el mismo div que se mueve en X, así la
          soga lo acompaña en vez de quedar colgada en el aire. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-11 z-20 flex justify-center">
        <motion.div
          className="relative text-primary"
          initial={{ x: '-62vw' }}
          animate={{ x: ['-62vw', '0vw', '0vw', '62vw'] }}
          transition={{ duration: 2.1, times: [0, 0.26, 0.74, 1], ease: ['easeOut', 'linear', 'easeIn'] }}
        >
          <Tractor />
          {/* La soga cuelga del enganche trasero y se acorta a medida que la
              tarjeta sube. Al final se suelta. */}
          <motion.div
            className="absolute top-full left-[7px] w-[2px] origin-top rounded-full bg-current opacity-70"
            initial={{ height: 0 }}
            animate={{ height: [0, 0, 128, 20, 0] }}
            transition={{ duration: 2.1, times: [0, 0.2, 0.26, 0.74, 0.84], ease: 'easeOut' }}
          />
        </motion.div>
      </div>

      {/* La tarjeta, remolcada. */}
      <motion.div
        className="flex w-full justify-center"
        initial={{ y: 128, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{
          y: { duration: 1.0, delay: 0.55, ease: CURVA },
          opacity: { duration: 0.3, delay: 0.3 },
        }}
      >
        {children}
      </motion.div>
    </div>
  )
}

/**
 * Tractor de perfil, mirando a la derecha, en una caja de 34×24. A 27 px de
 * alto lo que tiene que leerse es la silueta: rueda trasera grande, cabina
 * alta, escape. El detalle fino se pierde y no importa.
 */
function Tractor() {
  return (
    <svg width="42" height="30" viewBox="0 0 34 24" fill="none">
      {/* Escape, con su humito. */}
      <motion.circle
        cx="11.4"
        cy="3"
        r="1.5"
        className="fill-current"
        initial={{ opacity: 0.5, cy: 3, r: 1.2 }}
        animate={{ opacity: 0, cy: -3, r: 2.6 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'easeOut' }}
      />
      <rect x="10.4" y="4" width="2" height="7" rx="0.8" className="fill-current" />
      {/* Techo y cabina. */}
      <rect x="12.4" y="4.2" width="9.5" height="1.8" rx="0.9" className="fill-current" />
      <path d="M14 6.4 h6.4 l1.2 5.2 h-8.8 z" className="fill-current" opacity="0.55" />
      {/* Cuerpo. */}
      <path
        d="M6 11.4 h19.5 a1.8 1.8 0 0 1 1.8 1.8 v3.2 a1.8 1.8 0 0 1 -1.8 1.8 h-19.5 a1.8 1.8 0 0 1 -1.8 -1.8 v-3.2 a1.8 1.8 0 0 1 1.8 -1.8 z"
        className="fill-current"
      />
      {/* Enganche trasero, de donde sale la soga. */}
      <rect x="3.4" y="14.6" width="3.4" height="1.6" rx="0.8" className="fill-current" />
      {/* Rueda trasera, girando. */}
      <g transform="translate(9.5 16.5)">
        <motion.g animate={{ rotate: 360 }} transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }}>
          <circle r="6" className="fill-current" />
          <circle r="2.4" className="fill-[var(--color-card)]" />
          <rect x="-0.5" y="-5.4" width="1" height="10.8" className="fill-[var(--color-card)]" opacity="0.5" />
          <rect x="-5.4" y="-0.5" width="10.8" height="1" className="fill-[var(--color-card)]" opacity="0.5" />
        </motion.g>
      </g>
      {/* Rueda delantera, más chica y más rápida. */}
      <g transform="translate(25.5 18)">
        <motion.g animate={{ rotate: 360 }} transition={{ duration: 0.5, repeat: Infinity, ease: 'linear' }}>
          <circle r="4.2" className="fill-current" />
          <circle r="1.6" className="fill-[var(--color-card)]" />
        </motion.g>
      </g>
    </svg>
  )
}
