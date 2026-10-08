import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Icono } from '@/components/tropero/icono'
import satelite from '@/assets/tropero/satelite-demo.webp'

// «Mirá cómo, sobre tu campo» (página 35): una animación corta de 6 s que
// muestra el gesto del paso, sobre una foto satelital. Se repite a pedido.

export type TipoDemo = 'arrastrar' | 'esquinas' | 'potrero'

const DURACION = 6
const CURVA = [0.22, 1, 0.36, 1] as const

/** Un dedo (cursor) que se mueve por los puntos dados, tocando en cada uno. */
function Cursor({ xs, ys, tocar }: { xs: number[]; ys: number[]; tocar: boolean }) {
  return (
    <motion.g
      initial={{ x: xs[0], y: ys[0] }}
      animate={{ x: xs, y: ys }}
      transition={{ duration: DURACION, ease: 'easeInOut', times: xs.map((_, i) => i / (xs.length - 1)) }}
    >
      {tocar && (
        <motion.circle
          r={10}
          fill="none"
          stroke="#ecc46a"
          strokeWidth={2}
          initial={{ scale: 0.3, opacity: 0.9 }}
          animate={{ scale: [0.3, 1.4], opacity: [0.9, 0] }}
          transition={{ duration: DURACION / (xs.length - 1), repeat: xs.length - 2, ease: 'easeOut' }}
        />
      )}
      <path d="M0 0 L0 17 L4.5 13 L8 20 L11 18.5 L7.5 11.5 L13 11.5 Z" fill="#fbfaf6" stroke="#131b16" strokeWidth={1.2} />
    </motion.g>
  )
}

function Escena({ tipo }: { tipo: TipoDemo }) {
  if (tipo === 'arrastrar') {
    // El mapa se corre mientras el dedo lo arrastra.
    return (
      <>
        <motion.image
          href={satelite}
          width={420}
          height={260}
          preserveAspectRatio="xMidYMid slice"
          initial={{ x: -60, y: -20 }}
          animate={{ x: [-60, -10, -10, 20], y: [-20, 0, 0, 10] }}
          transition={{ duration: DURACION, times: [0, 0.4, 0.6, 1], ease: 'easeInOut' }}
        />
        <Cursor xs={[150, 200, 200, 230]} ys={[90, 110, 110, 120]} tocar={false} />
      </>
    )
  }
  const pts =
    tipo === 'esquinas'
      ? [
          [70, 40],
          [250, 30],
          [270, 130],
          [90, 140],
        ]
      : [
          [110, 55],
          [190, 50],
          [195, 105],
          [115, 110],
        ]
  const paso = DURACION / (pts.length + 1)
  return (
    <>
      <image href={satelite} width={320} height={170} preserveAspectRatio="xMidYMid slice" />
      {tipo === 'potrero' && (
        <rect x={60} y={25} width={220} height={120} rx={4} fill="#b85c2e" fillOpacity={0.1} stroke="#b85c2e" strokeWidth={2} />
      )}
      <motion.polygon
        points={pts.map((p) => p.join(',')).join(' ')}
        fill={tipo === 'potrero' ? '#b85c2e' : 'none'}
        fillOpacity={0.85}
        stroke={tipo === 'potrero' ? '#fbfaf6' : '#ecc46a'}
        strokeWidth={2.5}
        strokeDasharray={tipo === 'esquinas' ? '7 6' : undefined}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1] }}
        transition={{ duration: DURACION, times: [0, 0.78, 0.84, 1] }}
      />
      {pts.map(([x, y], i) => (
        <motion.circle
          key={i}
          cx={x}
          cy={y}
          r={5}
          fill="#fbfaf6"
          stroke="#b85c2e"
          strokeWidth={2.5}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: paso * (i + 1), duration: 0.25, ease: CURVA }}
        />
      ))}
      <Cursor xs={[160, ...pts.map((p) => p[0]!), pts[0]![0]!]} ys={[160, ...pts.map((p) => p[1]!), pts[0]![1]!]} tocar />
    </>
  )
}

export function Demo({ tipo }: { tipo: TipoDemo }) {
  const [vuelta, setVuelta] = useState(0)
  const reducir = useReducedMotion()
  return (
    <div className="relative h-[136px] overflow-hidden rounded-[18px] bg-[#1f2a1f] md:h-[150px]">
      {reducir ? (
        <img src={satelite} alt="" className="absolute inset-0 size-full object-cover opacity-70" />
      ) : (
        <svg key={vuelta} viewBox="0 0 320 170" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden>
          <Escena tipo={tipo} />
        </svg>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/25" />
      <p className="absolute top-3.5 left-4 text-[14px] font-semibold text-superficie">Mirá cómo, sobre tu campo</p>
      {!reducir && (
        <button
          type="button"
          onClick={() => setVuelta((v) => v + 1)}
          className="absolute bottom-3.5 left-4 inline-flex items-center gap-1.5 rounded-full bg-acento px-3.5 py-1.5 text-[13px] font-bold text-acento-texto"
        >
          <Icono nombre="Siguiente" tamano={16} />
          Ver de nuevo, {DURACION} s
        </button>
      )}
    </div>
  )
}
