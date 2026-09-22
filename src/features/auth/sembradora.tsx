import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * El remolque. De abajo hacia arriba, en este orden vertical: TRACTOR, SOGA,
 * TARJETA. El tractor, visto desde arriba, sube tirando de la tarjeta que
 * cuelga de la soga; la deja en su lugar, suelta la soga y sigue su rumbo
 * hacia arriba hasta salir por el borde. Saca humo todo el tiempo.
 *
 * Va SÓLO en las cuatro pantallas que abren y cierran algo —entrar, crear la
 * cuenta, el primer paso del onboarding y el festejo final—, y no en cada
 * pantalla intermedia. Un tractor que trae la pantalla es memorable la
 * primera vez y la última; ocho veces seguidas es una traba. Los pasos del
 * medio entran callados (ver `Reveal` y `Paso`).
 *
 * Nada de este componente se extiende por DEBAJO de la tarjeta: cualquier
 * cosa que sobresalga por abajo agranda el área de scroll y deja la pantalla
 * desplazable cuando no hace falta (pasó con unas huellas de ruedas que
 * colgaban 220 px por debajo). El tractor y la soga viven arriba.
 *
 * El desenfoque de la tarjeta mientras sube se SACA del style al terminar,
 * imperativamente por ref. Framer deja `filter: blur(0px)` escrito y eso crea
 * contexto de apilado, que ya encerró una vez la lista de localidades.
 *
 * Dura 3,7 s. Con `prefers-reduced-motion` la tarjeta aparece y ya.
 */
export function Remolque({ activo, children }: { activo: boolean; children: ReactNode }) {
  const quieto = useReducedMotion()
  const tarjeta = useRef<HTMLDivElement>(null)
  if (!activo || quieto) return <>{children}</>

  /** Largo de la soga entre el enganche del tractor y el borde de la tarjeta. */
  const SOGA = 58
  /** Curva pareja: velocidad casi constante en el medio, sin latigazo. */
  const SUBIDA = [0.42, 0, 0.28, 1] as const

  return (
    <div className="relative flex w-full justify-center">
      <RemolqueSinScroll />
      <motion.div
        ref={tarjeta}
        className="relative flex w-full justify-center"
        // Arranca UN VIEWPORT ENTERO por debajo de su lugar: la tarjeta (y el
        // tractor, que va más arriba) entran desde la base de la pantalla, no
        // aparecen en el medio de la nada.
        initial={{ y: '100vh', opacity: 1, filter: 'blur(2px)' }}
        animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
        transition={{
          y: { duration: 2.2, delay: 0.1, ease: SUBIDA },
          filter: { duration: 2.0, delay: 0.3, ease: 'easeOut' },
        }}
        onAnimationComplete={() => tarjeta.current?.style.removeProperty('filter')}
      >
        {/* Tractor y soga, encima de la tarjeta. Suben con ella; al llegar,
            el tractor sigue de largo y la soga se va con él. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/2 z-20 flex -translate-x-1/2 flex-col items-center text-primary"
          style={{ bottom: '100%' }}
          initial={{ y: 0, opacity: 1 }}
          animate={{ y: -900, opacity: [1, 1, 0] }}
          transition={{
            y: { duration: 1.3, delay: 2.35, ease: [0.5, 0, 0.9, 0.4] },
            opacity: { duration: 1.3, delay: 2.35, times: [0, 0.75, 1] },
          }}
        >
          <Tractor />
          {/* La soga: del enganche al borde superior de la tarjeta. */}
          <motion.div
            className="w-[2px] rounded-full bg-[#14261a]"
            style={{ height: SOGA, transformOrigin: 'top' }}
            initial={{ scaleY: 1, opacity: 0.85 }}
            animate={{ scaleY: 0.15, opacity: 0 }}
            transition={{ duration: 0.45, delay: 2.35, ease: 'easeIn' }}
          />
        </motion.div>
        {children}
      </motion.div>
    </div>
  )
}

/**
 * Mientras la tarjeta sube desde abajo de la pantalla, el contenedor con
 * scroll no scrollea. Un elemento transformado fuera de la vista igual cuenta
 * para el área de scroll, así que sin esto aparecía una barra durante dos
 * segundos y el usuario podía scrollear hacia un lugar donde no hay nada.
 * Se restablece al terminar, y siempre al desmontar.
 */
function RemolqueSinScroll() {
  const marca = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const contenedor = marca.current?.closest<HTMLElement>('[data-auth-scroll]')
    if (!contenedor) return
    const previo = contenedor.style.overflowY
    contenedor.style.overflowY = 'hidden'
    contenedor.scrollTop = 0
    const t = setTimeout(() => {
      contenedor.style.overflowY = previo
    }, 2400)
    return () => {
      clearTimeout(t)
      contenedor.style.overflowY = previo
    }
  }, [])
  return <span ref={marca} hidden />
}

/**
 * Tractor visto desde arriba, apuntando hacia arriba, 44×62. Lo que lo hace
 * tractor y no auto: las ruedas traseras el doble de grandes que las
 * delanteras y con dibujo en la banda, el capot angosto y largo con la
 * parrilla adelante, la cabina ancha atrás con el parabrisas, el escape a un
 * costado del capot y el enganche atrás de todo. Dos tonos: el verde de la
 * marca para la chapa y un verde casi negro para las ruedas.
 */
function Tractor() {
  return (
    <svg
      width="44"
      height="62"
      viewBox="0 0 44 62"
      fill="none"
      className="drop-shadow-[0_3px_6px_rgba(10,20,13,0.35)]"
    >
      {/* Ruedas traseras, grandes, con dibujo en la banda. */}
      <rect x="0" y="33" width="11" height="25" rx="3.5" fill="#14261a" />
      <rect x="33" y="33" width="11" height="25" rx="3.5" fill="#14261a" />
      <g stroke="#3f5c47" strokeWidth="1.4" strokeLinecap="round">
        <path d="M2.5 37.5h6M2.5 41.5h6M2.5 45.5h6M2.5 49.5h6M2.5 53.5h6" />
        <path d="M35.5 37.5h6M35.5 41.5h6M35.5 45.5h6M35.5 49.5h6M35.5 53.5h6" />
      </g>
      {/* Ruedas delanteras, chicas. */}
      <rect x="5" y="8" width="7" height="14" rx="2.5" fill="#14261a" />
      <rect x="32" y="8" width="7" height="14" rx="2.5" fill="#14261a" />
      {/* Ejes. */}
      <rect x="9" y="42" width="26" height="6" rx="1" fill="#14261a" opacity="0.7" />
      <rect x="11" y="13" width="22" height="4" rx="1" fill="#14261a" opacity="0.7" />
      {/* Capot, angosto y largo. */}
      <rect x="13" y="1" width="18" height="31" rx="4" fill="currentColor" />
      <rect x="15.5" y="12" width="13" height="16" rx="2" fill="#0a140d" opacity="0.12" />
      {/* Parrilla y faros, al frente. */}
      <rect x="16.5" y="3.5" width="11" height="5" rx="1" fill="#0a140d" opacity="0.45" />
      <circle cx="15.2" cy="2.8" r="1.7" fill="#f7f1dc" />
      <circle cx="28.8" cy="2.8" r="1.7" fill="#f7f1dc" />
      {/* Escape, a un costado del capot. El humo sale de acá. */}
      <circle cx="14.5" cy="26" r="2.2" fill="#14261a" />
      <Humo cx={14.5} cy={26} retraso={0} />
      <Humo cx={14.5} cy={26} retraso={0.45} />
      <Humo cx={14.5} cy={26} retraso={0.9} />
      {/* Cabina, ancha, con parabrisas y techo. */}
      <rect x="9" y="30" width="26" height="25" rx="4.5" fill="currentColor" />
      <rect x="11.5" y="32.5" width="21" height="20" rx="3" fill="#0a140d" opacity="0.35" />
      <rect x="13" y="33.5" width="18" height="6.5" rx="2" fill="#dbe9df" opacity="0.9" />
      <rect x="14.5" y="42.5" width="15" height="8.5" rx="2" fill="currentColor" />
      {/* Enganche trasero: de acá sale la soga. */}
      <rect x="19" y="54" width="6" height="8" rx="1.8" fill="#14261a" />
    </svg>
  )
}

/**
 * Una bocanada de humo: nace en el escape, crece, se corre un poco hacia
 * atrás (abajo, porque el tractor avanza hacia arriba) y se disuelve.
 */
function Humo({ cx, cy, retraso }: { cx: number; cy: number; retraso: number }) {
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={2}
      fill="#9fb3a5"
      initial={{ opacity: 0, cx, cy, r: 1.6 }}
      animate={{ opacity: [0, 0.6, 0], cx: cx - 5, cy: cy + 13, r: 5 }}
      transition={{ duration: 1.35, delay: retraso, repeat: Infinity, ease: 'easeOut' }}
    />
  )
}
