import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CURVA } from '@/lib/animacion'

/**
 * La sembradora: un tractor cruza el ancho de la pantalla una sola vez, al
 * entrar, y deja atrás un surco. El contenido aparece detrás de él —cada
 * bloque arranca cuando el tractor ya le pasó por encima—, así que no es
 * decoración al costado: es lo que trae el contenido.
 *
 * Por qué acá y no en cada campo del formulario: el barrido verde que había
 * antes usaba un gesto fuerte a la frecuencia de uno tranquilo. Se repetía
 * en los ocho campos de un form y cansaba. Un gesto con personalidad va UNA
 * VEZ por pantalla; adentro del formulario el escalonado se mantiene mudo
 * (ver `Reveal`).
 *
 * Dura 1,1 s y no se repite. Con `prefers-reduced-motion` no aparece.
 */
export function Sembradora() {
  const quieto = useReducedMotion()
  const [terminado, setTerminado] = useState(false)
  // Sólo en el primer montaje de la pantalla: si el componente se re-renderiza
  // no vuelve a pasar el tractor.
  const yaPaso = useRef(false)
  useEffect(() => {
    yaPaso.current = true
  }, [])

  if (quieto || terminado) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -top-7 z-0 h-6 overflow-visible"
    >
      {/* El surco: se dibuja detrás del tractor y se apaga cuando él sale. */}
      <motion.div
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-[linear-gradient(90deg,transparent,var(--color-primary)_18%,var(--color-primary)_82%,transparent)] opacity-25"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1, opacity: [0.25, 0.25, 0] }}
        transition={{ duration: 1.5, ease: CURVA, times: [0, 0.7, 1] }}
      />
      {/* El tractor. Entra desde afuera del borde y sale por el otro lado. */}
      <motion.div
        className="absolute bottom-0 text-primary"
        initial={{ left: '-8%' }}
        animate={{ left: '104%' }}
        transition={{ duration: 1.1, ease: [0.4, 0, 0.2, 1] }}
        onAnimationComplete={() => setTerminado(true)}
      >
        <Tractor />
      </motion.div>
    </div>
  )
}

/**
 * Tractor de perfil, mirando a la derecha, en una caja de 34×24. A 22 px de
 * alto lo que tiene que leerse es la silueta: rueda trasera grande, cabina
 * alta, escape. El detalle fino se pierde y no importa.
 */
function Tractor() {
  return (
    <svg width="38" height="27" viewBox="0 0 34 24" fill="none">
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
      {/* Rueda trasera, girando. */}
      <g transform="translate(9.5 16.5)">
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }}
        >
          <circle r="6" className="fill-current" />
          <circle r="2.4" className="fill-[var(--color-card)]" />
          <rect x="-0.5" y="-5.4" width="1" height="10.8" className="fill-[var(--color-card)]" opacity="0.5" />
          <rect x="-5.4" y="-0.5" width="10.8" height="1" className="fill-[var(--color-card)]" opacity="0.5" />
        </motion.g>
      </g>
      {/* Rueda delantera, más chica y más rápida. */}
      <g transform="translate(25.5 18)">
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 0.5, repeat: Infinity, ease: 'linear' }}
        >
          <circle r="4.2" className="fill-current" />
          <circle r="1.6" className="fill-[var(--color-card)]" />
        </motion.g>
      </g>
    </svg>
  )
}
