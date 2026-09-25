import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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
 * Sin `filter` en la tarjeta, a propósito: además de costar por cuadro,
 * framer deja `blur(0px)` escrito al terminar y eso crea contexto de
 * apilado, que ya encerró una vez la lista de localidades.
 *
 * Dura ~3,5 s según el alto de la pantalla. Con `prefers-reduced-motion` la
 * tarjeta aparece y ya.
 */
/** Las tipografías que cambian el alto de la tarjeta: títulos y cuerpo. */
const FUENTES = ['700 24px Archivo', '400 15px Inter', '600 15px Inter']
function fuentesListas(): boolean {
  if (typeof document === 'undefined' || !document.fonts) return true
  try {
    return FUENTES.every((f) => document.fonts.check(f))
  } catch {
    return true
  }
}

export function Remolque({ activo: pedido, children }: { activo: boolean; children: ReactNode }) {
  const quieto = useReducedMotion()
  // Se decide al montar y no cambia: si el remolque pasara de tractor a
  // suave (o al revés) con la tarjeta ya en pantalla, React desarmaría y
  // volvería a armar todo lo de adentro, y la tarjeta saltaba de alto.
  const [activo] = useState(pedido)
  // Arranca cuando están las tipografías. Con `font-display: swap` la letra
  // cambiaba de tamaño a mitad del viaje; la tarjeta está centrada, así que
  // cambiaba de alto y el tractor y la tarjeta daban un salto juntos (10 px a
  // los 90 ms, 4 px a los 690 ms): la "breve traba". Máximo 1,2 s de espera.
  // `document.fonts.status` NO sirve: vale 'loaded' antes de que el navegador
  // pida ninguna tipografía (todavía no pintó texto). Se piden explícitas.
  const [fuentes, setFuentes] = useState(() => fuentesListas())
  useEffect(() => {
    if (fuentes) return
    let vivo = true
    const listo = () => vivo && setFuentes(true)
    // Cargada no es aplicada: el texto cambia de medida uno o dos cuadros
    // DESPUÉS de que la fuente termina de bajar. Se esperan dos cuadros más.
    const aplicada = () => requestAnimationFrame(() => requestAnimationFrame(listo))
    void Promise.all(FUENTES.map((f) => document.fonts.load(f))).then(aplicada, aplicada)
    const t = window.setTimeout(listo, 1200)
    return () => {
      vivo = false
      window.clearTimeout(t)
    }
  }, [fuentes])
  if (quieto) return <>{children}</>
  // Sin tractor, la tarjeta igual ENTRA: sube un poco y aparece. Aparecer de
  // golpe (sobre todo al llegar desde otra pantalla) se veía como un corte.
  if (!activo) {
    return (
      <motion.div
        className="flex w-full justify-center"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    )
  }

  // Todo en píxeles, calculado una vez: el tractor y la tarjeta tienen que
  // ir a LA MISMA velocidad, y eso no se puede expresar con "100vh" en uno y
  // una curva en el otro.
  const H = typeof window === 'undefined' ? 900 : window.innerHeight
  /** Largo de la soga entre el enganche del tractor y el borde de la tarjeta. */
  const SOGA = 58
  /** Alto del tractor. */
  const TRACTOR = 62
  /** Velocidad de crucero, px/s: un viewport entero cada 2,2 s. La del
   *  tractor de punta a punta, y la de la tarjeta hasta que frena. */
  const V = H / 2.2
  /** Hasta dónde sigue el tractor después de soltar: un buen tramo arriba. */
  const SALIDA = Math.round(H * 0.6)
  const tractorDuracion = (H + SALIDA + TRACTOR) / V
  /**
   * La tarjeta va a velocidad V hasta que le falta el 14 % del camino, y ahí
   * frena UNIFORMEMENTE hasta cero. Frenar uniforme desde V cubre la mitad
   * de lo que cubriría a V constante, así que ese último 14 % del camino
   * lleva el doble de tiempo del que llevaría a crucero.
   *
   * Los números salen de eso, no de probar a ojo: si el tramo de frenado
   * arranca a otra velocidad que la de crucero, la tarjeta pega un tirón en
   * el enganche — con `easeOut` arrancaba un 70 % más rápido de golpe, y eso
   * era lo que se veía como "se traba".
   */
  const FRENADO = 0.14
  const tCrucero = (1 - FRENADO) * (H / V)
  const tFrenado = 2 * FRENADO * (H / V)
  const tarjetaDuracion = tCrucero + tFrenado
  /** Frenado uniforme (y = 2x − x²) como bezier cúbica: arranca con la
   *  pendiente del crucero y termina en cero. */
  const FRENO = [0.333, 0.667, 0.667, 1] as const

  return (
    <div className="relative flex w-full justify-center">
      <RemolqueSinScroll />

      {/* El tractor, a velocidad constante de abajo hacia arriba, sin
          detenerse nunca: la trabada que se veía era la tarjeta frenando a
          cero y el tractor volviendo a arrancar desde cero. Ahora pasa de
          largo. La soga cuelga de él y se suelta cuando la tarjeta frena. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 z-20 flex -translate-x-1/2 flex-col items-center text-primary"
        style={{ bottom: '100%', willChange: 'transform' }}
        // Mientras cargan las tipografías todo espera abajo, fuera de la vista.
        // El árbol es el MISMO antes y después: sólo arranca la animación (si
        // se cambiaba de árbol, la tarjeta se volvía a montar y saltaba).
        initial={{ y: H }}
        animate={fuentes ? { y: -SALIDA - TRACTOR } : { y: H }}
        transition={{ duration: tractorDuracion, delay: 0.1, ease: 'linear' }}
      >
        <Tractor />
        <motion.div
          className="w-[2px] rounded-full bg-[#14261a]"
          style={{ height: SOGA, transformOrigin: 'top' }}
          initial={{ scaleY: 1, opacity: 0.85 }}
          animate={fuentes ? { scaleY: 0.1, opacity: 0 } : { scaleY: 1, opacity: 0.85 }}
          transition={{ duration: 0.4, delay: 0.1 + tCrucero, ease: 'easeIn' }}
        />
      </motion.div>

      {/* La tarjeta: sube a la velocidad del tractor y en el último tramo
          frena suave hasta su lugar. Sin filtros: un blur animado sobre toda
          la tarjeta en una pantalla retina es lo que más cuesta por cuadro. */}
      <motion.div
        className="relative z-10 flex w-full justify-center"
        style={{ willChange: 'transform' }}
        initial={{ y: H }}
        animate={fuentes ? { y: [H, H * FRENADO, 0] } : { y: H }}
        transition={{
          duration: tarjetaDuracion,
          delay: 0.1,
          times: [0, tCrucero / tarjetaDuracion, 1],
          ease: ['linear', FRENO],
        }}
      >
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
    }, 2700)
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
    <svg width="44" height="62" viewBox="0 0 44 62" fill="none">
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
