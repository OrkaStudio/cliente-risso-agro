import { useLayoutEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import satelite from '@/assets/tropero/satelite-demo.webp'

// «Así queda un campo armado» (página 35, bienvenida del tutorial): el campo de
// ejemplo se arma solo sobre una foto satelital real, con el mismo lenguaje que
// el mapa del productor: el borde en terracota, cada potrero con el color de lo
// que tiene (hacienda, sembrado, descanso) y su etiqueta.

const CURVA = [0.22, 1, 0.36, 1] as const
// La foto: 900 × 890. Los alambrados de la zona corren a 45°.
const W = 900
const H = 890

type Tipo = 'hacienda' | 'sembrado' | 'descanso'
type Potrero = { nombre: string; tipo: Tipo; que: string; u: [number, number]; v: [number, number] }

// El campo en coordenadas del alambrado: u a lo largo (abajo a la derecha), v a lo ancho.
const LARGO = 470
const ANCHO = 300
const POTREROS: Potrero[] = [
  { nombre: '1', tipo: 'hacienda', que: '120 cabezas', u: [0, 150], v: [150, 300] },
  { nombre: '2', tipo: 'sembrado', que: 'Soja', u: [150, 300], v: [150, 300] },
  { nombre: '3', tipo: 'descanso', que: '32 días', u: [300, 470], v: [150, 300] },
  { nombre: '4', tipo: 'sembrado', que: 'Trigo', u: [0, 220], v: [0, 150] },
  { nombre: '5', tipo: 'hacienda', que: '85 cabezas', u: [220, 470], v: [0, 150] },
]

const C = 0.7071
const CX = 470
const CY = 430
/** Del alambrado (u, v) a la foto (x, y). */
const punto = (u: number, v: number): [number, number] => [
  CX + (u - LARGO / 2) * C + (v - ANCHO / 2) * C,
  CY + (u - LARGO / 2) * C - (v - ANCHO / 2) * C,
]
const rect = (u: [number, number], v: [number, number]) => [punto(u[0], v[0]), punto(u[1], v[0]), punto(u[1], v[1]), punto(u[0], v[1])]
const puntos = (p: [number, number][]) => p.map((x) => x.join(',')).join(' ')
const BORDE = rect([0, LARGO], [0, ANCHO])

const RELLENO: Record<Tipo, { fill: string; opacidad: number }> = {
  hacienda: { fill: '#b85c2e', opacidad: 0.7 },
  sembrado: { fill: 'url(#surcos)', opacidad: 1 },
  descanso: { fill: '#e3ecdf', opacidad: 0.62 },
}
const ETIQUETA: Record<Tipo, string> = {
  hacienda: 'bg-principal text-principal-texto',
  sembrado: 'bg-acento text-acento-texto',
  descanso: 'bg-superficie text-estado-bien-texto',
}

/** Cómo calza la foto (object-cover) en la caja: para poner las etiquetas en píxeles. */
function useEncaje() {
  const ref = useRef<HTMLDivElement>(null)
  const [e, setE] = useState({ s: 0, ox: 0, oy: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new ResizeObserver(([r]) => {
      const { width: w, height: h } = r.contentRect
      const s = Math.max(w / W, h / H)
      setE({ s, ox: (w - W * s) / 2, oy: (h - H * s) / 2 })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, e] as const
}

export function EjemploCampo() {
  const reducir = useReducedMotion()
  const [ref, { s, ox, oy }] = useEncaje()
  const entra = (demora: number) => (reducir ? { initial: false as const } : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: demora, duration: 0.45, ease: CURVA } })
  return (
    <div ref={ref} className="relative size-full overflow-hidden bg-[#2b3526]">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <pattern id="surcos" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="12" height="12" fill="#ecc46a" fillOpacity="0.78" />
            <rect width="3" height="12" fill="#7a3a1c" fillOpacity="0.16" />
          </pattern>
          <mask id="afuera">
            <rect width={W} height={H} fill="white" />
            <polygon points={puntos(BORDE)} fill="black" />
          </mask>
        </defs>
        <image href={satelite} width={W} height={H} />
        {/* Lo de afuera se apaga: la vista va al campo. */}
        <motion.rect
          width={W}
          height={H}
          fill="#131b16"
          mask="url(#afuera)"
          initial={reducir ? false : { opacity: 0 }}
          animate={{ opacity: 0.42 }}
          transition={{ delay: 0.1, duration: 0.6 }}
        />
        {POTREROS.map((p, i) => (
          <motion.polygon
            key={p.nombre}
            points={puntos(rect(p.u, p.v))}
            fill={RELLENO[p.tipo].fill}
            fillOpacity={RELLENO[p.tipo].opacidad}
            stroke="#fbfaf6"
            strokeWidth={2.5}
            strokeLinejoin="round"
            {...entra(1.2 + i * 0.22)}
          />
        ))}
        <motion.polygon
          points={puntos(BORDE)}
          fill="none"
          stroke="#b85c2e"
          strokeWidth={5}
          strokeLinejoin="round"
          initial={reducir ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.2, duration: 1.1, ease: 'easeInOut' }}
        />
      </svg>

      {s > 0 &&
        POTREROS.map((p, i) => {
          const c = rect(p.u, p.v).reduce((a, b) => [a[0] + b[0] / 4, a[1] + b[1] / 4], [0, 0])
          return (
            <motion.div
              key={p.nombre}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: ox + c[0] * s, top: oy + c[1] * s }}
              initial={reducir ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5 + i * 0.22, duration: 0.4, ease: CURVA }}
            >
              <div className={`flex flex-col items-center rounded-[12px] px-3 py-1.5 shadow-[0_6px_18px_rgba(19,27,22,0.28)] ${ETIQUETA[p.tipo]}`}>
                <span className="font-heading text-[15px] leading-tight font-extrabold">Potrero {p.nombre}</span>
                <span className="text-[12px] leading-tight font-semibold opacity-85">{p.que}</span>
              </div>
            </motion.div>
          )
        })}

      {/* Qué es cada color, como en el mapa del productor. */}
      <motion.div
        className="absolute top-[76px] left-4 flex flex-col gap-1.5 rounded-[14px] bg-superficie/95 px-3.5 py-3 shadow-md md:top-auto md:bottom-7 md:left-7 md:flex-row md:gap-4 md:py-2.5"
        {...entra(2.8)}
      >
        {(
          [
            ['bg-principal', 'Hacienda'],
            ['bg-acento', 'Sembrado'],
            ['bg-estado-bien-suave ring-1 ring-estado-bien/40', 'Descanso'],
          ] as const
        ).map(([color, texto]) => (
          <span key={texto} className="flex items-center gap-2 text-[13px] font-semibold text-texto">
            <span className={`size-3 rounded-[4px] ${color}`} />
            {texto}
          </span>
        ))}
      </motion.div>
      <span className="absolute top-4 right-4 rounded-full bg-acento px-3.5 py-1.5 text-[13px] font-bold text-acento-texto shadow-[0_4px_14px_rgba(19,27,22,0.25)] md:top-7 md:right-7">
        Ejemplo
      </span>
    </div>
  )
}
