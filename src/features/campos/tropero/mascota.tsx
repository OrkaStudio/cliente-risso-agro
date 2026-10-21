import { useId } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

// Chispa: el asistente de Tropero hecho personaje (referencia que pasó Lau el
// 20/10: el orbe «Sage» de un dashboard con IA). Una esfera lisa terracota,
// con brillo de vidrio y un resplandor quieto. Nada titila ni cambia de brillo
// (Lau, 20/10: «esa visual que titila es muy molesta»): la vida la dan los
// ojos, con resortes, y movimientos lentos. A dónde va y qué dice lo decide
// acompanante.tsx; los colores se comparan en /estilo/chispa (sólo en dev).

export type Animo = 'normal' | 'festeja' | 'piensa' | 'duerme' | 'guina'
export type Variante = 'terracota' | 'terracota-oscura' | 'sage'

const OJO = '#fffdf8'
const COLORES: Record<Variante, { luz: string; medio: string; sombra: string; resplandor: string }> = {
  terracota: { luz: '#e79a6c', medio: '#b75d31', sombra: '#7a3317', resplandor: '#c8693a' },
  'terracota-oscura': { luz: '#cf7f52', medio: '#97471f', sombra: '#5a220c', resplandor: '#a9552c' },
  sage: { luz: '#c9d4ff', medio: '#5d63f5', sombra: '#3a1fc4', resplandor: '#5b5cff' },
}
const LENTO = { type: 'spring', stiffness: 70, damping: 18, mass: 1 } as const
const SUAVE = { type: 'spring', stiffness: 140, damping: 20 } as const

export function Chispa({
  tam = 64,
  mira = { x: 0, y: 0 },
  habla = false,
  vuela = false,
  parpadea = false,
  animo = 'normal',
  variante = 'terracota',
}: {
  tam?: number
  /** Hacia dónde miran los ojos, de -1 a 1. */
  mira?: { x: number; y: number }
  habla?: boolean
  vuela?: boolean
  parpadea?: boolean
  animo?: Animo
  variante?: Variante
}) {
  const quieto = !!useReducedMotion()
  const id = useId().replace(/:/g, '')
  const c = COLORES[variante]
  const duerme = animo === 'duerme'
  const festeja = animo === 'festeja'
  const piensa = animo === 'piensa'
  const guina = animo === 'guina'
  const mx = Math.max(-1, Math.min(1, mira.x))
  const my = Math.max(-1, Math.min(1, mira.y))
  // Pensando: mira arriba, a un costado.
  const ojoX = piensa ? 6 : mx * 5
  const ojoY = piensa ? -6 : duerme ? 1 : my * 4

  return (
    <span className="relative inline-block" style={{ width: tam, height: tam }}>
      {/* Flota despacio. Pensando ladea la cabeza; dormida se inclina y baja un poco. */}
      <motion.span
        className="absolute inset-0"
        animate={quieto ? {} : { y: duerme ? 3 : [0, -tam * 0.035, 0], rotate: piensa ? 8 : duerme ? -6 : 0 }}
        transition={{ y: duerme ? LENTO : { duration: 4.5, repeat: Infinity, ease: 'easeInOut' }, rotate: LENTO }}
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          <defs>
            <radialGradient id={`${id}-cuerpo`} cx="36%" cy="30%" r="78%">
              <stop offset="0%" stopColor={c.luz} />
              <stop offset="52%" stopColor={c.medio} />
              <stop offset="100%" stopColor={c.sombra} />
            </radialGradient>
            <radialGradient id={`${id}-borde`} cx="50%" cy="50%" r="50%">
              <stop offset="80%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="100%" stopColor="#ffe9cf" stopOpacity="0.45" />
            </radialGradient>
            <filter id={`${id}-difuso`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="9" />
            </filter>
            <filter id={`${id}-suave`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.4" />
            </filter>
            <filter id={`${id}-ojo`} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0.8" stdDeviation="0.9" floodColor="#3b1608" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* El resplandor: quieto. Festejando se enciende una vez, sin latir. */}
          <motion.circle cx="50" cy="52" r="33" fill={c.resplandor} filter={`url(#${id}-difuso)`} initial={false} animate={{ opacity: duerme ? 0.12 : festeja ? 0.6 : 0.32 }} transition={{ duration: 0.8, ease: 'easeOut' }} />

          {/* El cuerpo: se estira al volar y se achata dormido, con resorte lento. */}
          <motion.g
            style={{ transformBox: 'fill-box', transformOrigin: '50% 60%' }}
            animate={{ scaleX: vuela ? 1.1 : duerme ? 1.04 : 1, scaleY: vuela ? 0.92 : duerme ? 0.95 : 1, y: habla && !quieto ? [0, -1.6, 0] : 0 }}
            transition={{ scaleX: LENTO, scaleY: LENTO, y: habla ? { duration: 0.7, repeat: Infinity, ease: 'easeInOut' } : SUAVE }}
          >
            <circle cx="50" cy="52" r="27" fill={`url(#${id}-cuerpo)`} />
            <circle cx="50" cy="52" r="27" fill={`url(#${id}-borde)`} />
            {/* El brillo de vidrio. */}
            <ellipse cx="40" cy="38" rx="9.5" ry="5.5" fill="#ffffff" opacity="0.4" filter={`url(#${id}-suave)`} transform="rotate(-28 40 38)" />
            <circle cx="35" cy="41.5" r="1.5" fill="#ffffff" opacity="0.75" />

            {/* Los ojos. */}
            <motion.g animate={{ x: ojoX, y: ojoY }} transition={SUAVE} filter={`url(#${id}-ojo)`}>
              <Ojo cx={39.5} forma={duerme ? 'dormido' : festeja ? 'feliz' : 'abierto'} parpadea={parpadea} entrecerrado={piensa} />
              <Ojo cx={60.5} forma={duerme ? 'dormido' : festeja || guina ? 'feliz' : 'abierto'} parpadea={parpadea} entrecerrado={piensa} />
            </motion.g>
          </motion.g>
        </svg>
      </motion.span>

      {/* Durmiendo: las «z» suben despacio, crecen y se desvanecen, de a una. */}
      <AnimatePresence>
        {duerme && !quieto && (
          <motion.span key="zetas" className="pointer-events-none absolute" style={{ left: tam * 0.7, top: tam * 0.02 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="absolute font-extrabold"
                style={{ fontSize: tam * (0.15 + i * 0.05), color: OJO, textShadow: `0 1px 4px ${c.sombra}`, fontFamily: 'ui-rounded, system-ui, sans-serif' }}
                initial={{ x: 0, y: 0, opacity: 0 }}
                animate={{ x: [0, tam * 0.08, tam * 0.15], y: [0, -tam * 0.2, -tam * 0.4], opacity: [0, 0.85, 0] }}
                transition={{ duration: 3.6, repeat: Infinity, delay: i * 1.2, ease: 'easeInOut' }}
              >
                z
              </motion.span>
            ))}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

/** Un ojo: píldora que parpadea, o la forma de la expresión, que se dibuja de un trazo. */
function Ojo({ cx, forma, parpadea, entrecerrado }: { cx: number; forma: 'abierto' | 'feliz' | 'dormido'; parpadea: boolean; entrecerrado: boolean }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {forma === 'abierto' ? (
        <motion.rect
          key="abierto"
          x={cx - 4.5}
          y="41"
          width="9"
          height="20"
          rx="4.5"
          fill={OJO}
          style={{ transformBox: 'fill-box', transformOrigin: '50% 60%' }}
          initial={{ scaleY: 0.1, opacity: 0 }}
          animate={{ scaleY: parpadea ? 0.1 : entrecerrado ? 0.72 : 1, opacity: 1 }}
          exit={{ scaleY: 0.1, opacity: 0 }}
          transition={parpadea ? { duration: 0.1 } : SUAVE}
        />
      ) : (
        <motion.path
          key={forma}
          d={forma === 'feliz' ? `M${cx - 6} 54 q 6 -9 12 0` : `M${cx - 6} 51 q 6 6 12 0`}
          stroke={OJO}
          strokeWidth="4.2"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        />
      )}
    </AnimatePresence>
  )
}
