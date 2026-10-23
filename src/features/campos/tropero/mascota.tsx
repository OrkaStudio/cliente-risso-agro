import { useId } from 'react'
import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from 'framer-motion'

// El asistente de Tropero hecho personaje, sin nombre propio (Lau, 22/10).
// Referencia que pasó Lau el 20/10: el orbe «Sage» de un dashboard con IA. Una esfera lisa terracota
// oscura, con brillo de vidrio y un resplandor quieto. Nada titila (Lau, 20/10:
// «esa visual que titila es muy molesta»).
//
// Cada gesto es una pose clara con un detalle propio, como las «z» de dormir
// (el que más le gustó a Lau, 21/10): habla con boca, piensa con su nube,
// festeja con un salto y cachetes, guiña de costado. El movimiento de fondo
// (flotar, respirar, el vaivén, la mirada que deambula) se calcula cuadro a
// cuadro y pasa por resortes, así un estado se funde en el otro sin cortes.
// A dónde va y qué dice lo decide acompanante.tsx; los gestos se ven todos
// juntos en /estilo/asistente (sólo en dev).

/** `despierta`: el momento de salir del sueño (se estira y abre los ojos). */
export type Animo = 'normal' | 'festeja' | 'piensa' | 'duerme' | 'despierta' | 'guina'
export type Variante = 'terracota' | 'terracota-oscura' | 'sage'
/** La velocidad del viaje (px/s) y `prepara` (0 a 1) mientras junta impulso para salir. */
export type Viaje = { vx: MotionValue<number>; vy: MotionValue<number>; prepara?: MotionValue<number> }

const OJO = '#fffdf8'
const COLORES: Record<Variante, { luz: string; medio: string; sombra: string; resplandor: string; cachete: string }> = {
  terracota: { luz: '#e79a6c', medio: '#b75d31', sombra: '#7a3317', resplandor: '#c8693a', cachete: '#ff9a7a' },
  'terracota-oscura': { luz: '#cf7f52', medio: '#97471f', sombra: '#5a220c', resplandor: '#a9552c', cachete: '#f08a68' },
  sage: { luz: '#c9d4ff', medio: '#5d63f5', sombra: '#3a1fc4', resplandor: '#5b5cff', cachete: '#ff9fc4' },
}
const LENTO = { type: 'spring', stiffness: 70, damping: 18, mass: 1 } as const
const SUAVE = { type: 'spring', stiffness: 90, damping: 17 } as const
const BLANDO = { stiffness: 110, damping: 20 }

export function Mascota({
  tam = 64,
  mira = { x: 0, y: 0 },
  habla = false,
  parpadea = false,
  animo = 'normal',
  variante = 'terracota-oscura',
  viaje,
}: {
  tam?: number
  /** Hacia dónde miran los ojos, de -1 a 1. */
  mira?: { x: number; y: number }
  habla?: boolean
  parpadea?: boolean
  animo?: Animo
  variante?: Variante
  viaje?: Viaje
}) {
  const quieto = !!useReducedMotion()
  const id = useId().replace(/:/g, '')
  const c = COLORES[variante]
  const duerme = animo === 'duerme'
  const festeja = animo === 'festeja'
  const piensa = animo === 'piensa'
  const guina = animo === 'guina'
  const despierta = animo === 'despierta'
  const mx = Math.max(-1, Math.min(1, mira.x))
  const my = Math.max(-1, Math.min(1, mira.y))
  // Pensando: mira arriba, a un costado.
  const ojoX = piensa ? 5 : mx * 5
  const ojoY = piensa ? -6 : duerme ? 1 : my * 4

  // ===== El movimiento de fondo, cuadro a cuadro =====
  const flotar = useSpring(0, { stiffness: 30, damping: 12 })
  const respira = useMotionValue(0)
  const vaiven = useSpring(0, { stiffness: 40, damping: 14 })
  const deambulaX = useSpring(0, { stiffness: 40, damping: 13 })
  const deambulaY = useSpring(0, { stiffness: 40, damping: 13 })
  const boca = useSpring(0.3, { stiffness: 260, damping: 24 })
  useAnimationFrame((ms) => {
    if (quieto) return
    const s = (periodo: number) => Math.sin((2 * Math.PI * ms) / periodo)
    flotar.set(duerme ? 3 : -tam * 0.0175 * (1 + s(4600)))
    respira.set(duerme ? 0 : s(3900))
    // El vaivén de la cabeza: lento quieta, asiente al hablar, se mece al festejar.
    vaiven.set(
      duerme || guina ? 0 : festeja ? 4 * s(1500) : piensa ? 2.4 * s(3600) : habla ? 2.6 * s(1900) * (0.55 + 0.45 * s(730)) : 1.6 * s(7300) + 0.7 * s(3100),
    )
    // La mirada deambula sola (pensando, de un lado al otro, buscando).
    const libre = !duerme && !festeja
    deambulaX.set(piensa ? 2.4 * s(3300) : libre ? 2.2 * s(5300) * s(2300) : 0)
    deambulaY.set(piensa ? s(4100) : libre ? 1.2 * s(6100) * s(1900) : 0)
    // La boca al hablar: abre y cierra con un ritmo que no se repite igual.
    boca.set(habla ? 0.35 + 0.65 * Math.abs(s(520) * s(1330)) : 0.3)
  })
  const respiraX = useTransform(respira, (r) => 1 - r * 0.01)
  const respiraY = useTransform(respira, (r) => 1 + r * 0.02)

  // ===== El viaje: se inclina, se estira, deja una cola de luz y mira adelante =====
  const cero = useMotionValue(0)
  const vx = viaje?.vx ?? cero
  const vy = viaje?.vy ?? cero
  const rapidez = useTransform([vx, vy], ([a, b]) => Math.hypot(a as number, b as number))
  const inclina = useSpring(useTransform(vx, [-900, 0, 900], [-12, 0, 12]), BLANDO)
  const estira = useSpring(useTransform(rapidez, [0, 1600], [0, 0.13]), BLANDO)
  const estiraX = useTransform(estira, (e) => 1 + e)
  const estiraY = useTransform(estira, (e) => 1 - e * 0.7)
  const colaOp = useSpring(useTransform(rapidez, [60, 650], [0, 0.85]), BLANDO)
  const colaX = useSpring(useTransform(vx, [-900, 900], [22, -22]), BLANDO)
  const colaY = useSpring(useTransform(vy, [-900, 900], [22, -22]), BLANDO)
  const cola2X = useTransform(colaX, (v) => v * 2)
  const cola2Y = useTransform(colaY, (v) => v * 2)
  const guiaX = useSpring(useTransform(vx, [-700, 700], [-5, 5]), BLANDO)
  const guiaY = useSpring(useTransform(vy, [-700, 700], [-4, 4]), BLANDO)
  // Antes de salir junta impulso: se agacha un poco.
  const prepara = useSpring(viaje?.prepara ?? cero, { stiffness: 160, damping: 16 })
  const preparaX = useTransform(prepara, (p) => 1 + p * 0.08)
  const preparaY = useTransform(prepara, (p) => 1 - p * 0.1)

  // ===== La pose de cada ánimo =====
  const pose = festeja
    ? { y: [0, 2, -10, 0, 0], scaleY: [1, 0.86, 1.09, 0.93, 1], scaleX: [1, 1.1, 0.93, 1.06, 1] }
    : guina
      ? { y: [0, -4, 0], scaleY: [1, 1.05, 1], scaleX: [1, 0.97, 1] }
      : despierta
        ? { y: [0, 0, -3, 0], scaleY: [0.95, 0.93, 1.1, 1], scaleX: [1.04, 1.06, 0.93, 1] }
        : duerme
        ? { y: 0, scaleX: 1.04, scaleY: 0.95 }
        : { y: 0, scaleX: 1, scaleY: 1 }
  const tiempoPose = festeja
    ? { duration: 1.1, times: [0, 0.2, 0.48, 0.78, 1], ease: 'easeInOut' as const }
    : guina
      ? { duration: 0.7, ease: 'easeInOut' as const }
      : despierta
        ? { duration: 0.9, times: [0, 0.25, 0.6, 1], ease: 'easeInOut' as const }
        : LENTO

  const formaIzq = duerme ? 'dormido' : festeja ? 'feliz' : 'abierto'
  const formaDer = duerme ? 'dormido' : festeja || guina ? 'feliz' : 'abierto'

  return (
    <span className="relative inline-block" style={{ width: tam, height: tam }}>
      <motion.span className="absolute inset-0" style={quieto ? undefined : { y: flotar }}>
        {/* La pose: pensando ladea la cabeza, guiñando también; dormida se inclina. */}
        <motion.span className="absolute inset-0" animate={{ rotate: piensa ? 8 : guina ? -9 : duerme ? -6 : 0 }} transition={LENTO}>
          <motion.span className="absolute inset-0" style={quieto ? undefined : { rotate: vaiven }}>
            <motion.span className="absolute inset-0" style={quieto ? undefined : { rotate: inclina, scaleX: estiraX, scaleY: estiraY }}>
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

                {/* La cola de luz: aparece sólo en viaje, detrás, del lado de donde viene. */}
                <motion.g style={{ opacity: colaOp }} filter={`url(#${id}-difuso)`}>
                  <motion.circle cx="50" cy="52" r="20" fill={c.resplandor} style={{ x: colaX, y: colaY }} />
                  <motion.circle cx="50" cy="52" r="13" fill={c.resplandor} opacity="0.6" style={{ x: cola2X, y: cola2Y }} />
                </motion.g>

                {/* El resplandor: quieto. Festejando se enciende una vez, sin latir. */}
                <motion.circle cx="50" cy="52" r="33" fill={c.resplandor} filter={`url(#${id}-difuso)`} initial={false} animate={{ opacity: duerme ? 0.12 : festeja ? 0.6 : 0.32 }} transition={{ duration: 0.8, ease: 'easeOut' }} />

                <motion.g style={{ transformBox: 'fill-box', transformOrigin: '50% 90%', scaleX: preparaX, scaleY: preparaY }}>
                  {/* La pose del ánimo: el salto de festejo (se agacha, sube estirada, cae y se asienta). */}
                  <motion.g style={{ transformBox: 'fill-box', transformOrigin: '50% 90%' }} animate={quieto ? undefined : pose} transition={tiempoPose}>
                    {/* Respira despacio. */}
                    <motion.g style={quieto ? undefined : { transformBox: 'fill-box', transformOrigin: '50% 90%', scaleX: respiraX, scaleY: respiraY }}>
                      <circle cx="50" cy="52" r="27" fill={`url(#${id}-cuerpo)`} />
                      <circle cx="50" cy="52" r="27" fill={`url(#${id}-borde)`} />
                      {/* El brillo de vidrio. */}
                      <ellipse cx="40" cy="38" rx="9.5" ry="5.5" fill="#ffffff" opacity="0.4" filter={`url(#${id}-suave)`} transform="rotate(-28 40 38)" />
                      <circle cx="35" cy="41.5" r="1.5" fill="#ffffff" opacity="0.75" />

                      {/* Los cachetes: festejando los dos, guiñando el del ojo cerrado. */}
                      <motion.ellipse cx="32" cy="63" rx="5.5" ry="3.2" fill={c.cachete} filter={`url(#${id}-suave)`} initial={false} animate={{ opacity: festeja ? 0.55 : 0 }} transition={{ duration: 0.6 }} />
                      <motion.ellipse cx="68" cy="63" rx="5.5" ry="3.2" fill={c.cachete} filter={`url(#${id}-suave)`} initial={false} animate={{ opacity: festeja || guina ? 0.55 : 0 }} transition={{ duration: 0.6 }} />

                      {/* La cara: mira a donde va en viaje, deambula sola y sigue al mouse. */}
                      <motion.g style={{ x: guiaX, y: guiaY }}>
                        <motion.g style={quieto ? undefined : { x: deambulaX, y: deambulaY }}>
                          <motion.g animate={{ x: ojoX, y: ojoY }} transition={SUAVE} filter={`url(#${id}-ojo)`}>
                            <Ojo cx={39.5} forma={formaIzq} parpadea={parpadea} abre={piensa ? 0.62 : guina ? 1.08 : 1} />
                            <Ojo cx={60.5} forma={formaDer} parpadea={parpadea} abre={piensa ? 0.85 : 1} />
                          </motion.g>
                          <motion.g animate={{ x: ojoX * 0.55, y: ojoY * 0.35 }} transition={SUAVE}>
                            <Boca habla={habla && !duerme && !festeja} festeja={festeja} guina={guina} piensa={piensa && !habla} abre={boca} />
                          </motion.g>
                        </motion.g>
                      </motion.g>
                    </motion.g>
                  </motion.g>
                </motion.g>
              </svg>
            </motion.span>
          </motion.span>
        </motion.span>
      </motion.span>

      {/* Pensando: la nube de pensar, con tres puntos que se encienden de a uno, despacio. */}
      <AnimatePresence>
        {piensa && !quieto && (
          <motion.span key="nube" className="pointer-events-none absolute" style={{ left: tam * 0.74, top: -tam * 0.16 }} exit={{ opacity: 0, transition: { duration: 0.4 } }}>
            {[
              { d: 0.07, x: 0, y: tam * 0.24 },
              { d: 0.1, x: tam * 0.07, y: tam * 0.13 },
            ].map((b, i) => (
              <motion.span
                key={i}
                className="absolute rounded-full"
                style={{ width: tam * b.d, height: tam * b.d, left: b.x, top: b.y, background: OJO, boxShadow: '0 2px 6px rgba(59,22,8,0.22)' }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 160, damping: 15, delay: 0.15 + i * 0.15 }}
              />
            ))}
            <motion.span
              className="absolute flex items-center justify-center rounded-full"
              style={{ left: tam * 0.14, top: -tam * 0.06, width: tam * 0.42, height: tam * 0.22, gap: tam * 0.035, background: OJO, boxShadow: '0 3px 10px rgba(59,22,8,0.25)' }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 140, damping: 15, delay: 0.45 }}
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="block rounded-full"
                  style={{ width: tam * 0.05, height: tam * 0.05, background: c.medio }}
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -tam * 0.015, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, delay: 0.6 + i * 0.27, ease: 'easeInOut' }}
                />
              ))}
            </motion.span>
          </motion.span>
        )}
      </AnimatePresence>

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
function Ojo({ cx, forma, parpadea, abre }: { cx: number; forma: 'abierto' | 'feliz' | 'dormido'; parpadea: boolean; abre: number }) {
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
          animate={{ scaleY: parpadea ? 0.1 : abre, opacity: 1 }}
          exit={{ scaleY: 0.1, opacity: 0 }}
          transition={parpadea ? { duration: 0.11, ease: 'easeIn' } : { ...SUAVE, scaleY: { duration: 0.22, ease: 'easeOut' } }}
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

/** La boca: sólo aparece cuando dice algo con ella (hablar, festejar, guiñar, el «mmm» de pensar). */
function Boca({ habla, festeja, guina, piensa, abre }: { habla: boolean; festeja: boolean; guina: boolean; piensa: boolean; abre: MotionValue<number> }) {
  const forma = festeja ? 'sonrisa' : guina ? 'picara' : habla ? 'habla' : piensa ? 'mmm' : null
  return (
    <AnimatePresence initial={false}>
      {forma === 'habla' && (
        <motion.ellipse
          key="habla"
          cx="50"
          cy="68.5"
          rx="4.8"
          ry="4"
          fill={OJO}
          style={{ transformBox: 'fill-box', transformOrigin: '50% 30%', scaleY: abre }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.95 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
        />
      )}
      {forma === 'sonrisa' && (
        <motion.path
          key="sonrisa"
          d="M42.5 64.5 Q50 74 57.5 64.5 Q50 67 42.5 64.5 Z"
          fill={OJO}
          style={{ transformBox: 'fill-box', transformOrigin: '50% 0%' }}
          initial={{ opacity: 0, scaleY: 0.2 }}
          animate={{ opacity: 0.95, scaleY: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          transition={{ type: 'spring', stiffness: 160, damping: 14, delay: 0.15 }}
        />
      )}
      {(forma === 'picara' || forma === 'mmm') && (
        <motion.path
          key={forma}
          d={forma === 'picara' ? 'M44.5 67 Q51 70.5 57 64.5' : 'M46 68.5 Q50 67.6 54.5 68.2'}
          stroke={OJO}
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.95 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
        />
      )}
    </AnimatePresence>
  )
}
