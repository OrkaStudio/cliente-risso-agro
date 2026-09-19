import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CircleCheck, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * El festejo del final: confeti que cae una vez (en los colores del campo:
 * verde, ámbar, oro, cielo) y un número que cuenta hacia arriba. Sin
 * librerías: cuarenta partículas con framer, y nada si el equipo pide
 * "reducir movimiento".
 */

const COLORES = ['#1f7a47', '#e9b45f', '#f5b301', '#38bdf8', '#f1ebd9', '#d98a5a']

function Particula({ i, alto }: { i: number; alto: number }) {
  // Determinista por índice: el mismo confeti en cada render, sin Math.random en render.
  const seed = (i * 9301 + 49297) % 233280
  const r = (n: number) => ((seed * (n + 1)) % 1000) / 1000
  const x = r(1) * 100
  const delay = r(2) * 1.4
  const dur = 2.6 + r(3) * 1.6
  const giro = (r(4) - 0.5) * 720
  const ancho = 8 + r(5) * 7
  const largo = 10 + r(6) * 10
  const color = COLORES[i % COLORES.length]!
  const deriva = (r(7) - 0.5) * 120
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-0 block rounded-[2px]"
      style={{ left: `${x}%`, width: ancho, height: largo, background: color }}
      initial={{ y: -24, x: 0, rotate: 0, opacity: 0 }}
      animate={{ y: alto + 40, x: deriva, rotate: giro, opacity: [0, 1, 1, 0.9, 0] }}
      transition={{ duration: dur, delay, ease: [0.2, 0.6, 0.4, 1], opacity: { times: [0, 0.08, 0.7, 0.9, 1], duration: dur, delay } }}
    />
  )
}

/** Confeti a pantalla completa del contenedor, una sola vez al montar. */
export function Confeti({ cantidad = 90, alto = 900 }: { cantidad?: number; alto?: number }) {
  const reducido = useReducedMotion()
  const [activo, setActivo] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setActivo(false), 5200)
    return () => clearTimeout(t)
  }, [])
  if (reducido || !activo) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: cantidad }, (_, i) => (
        <Particula key={i} i={i} alto={alto} />
      ))}
    </div>
  )
}

/** Un número que sube de 0 al valor, con easing, en ~0,9 s. */
export function Contador({ valor, className, sufijo }: { valor: number; className?: string; sufijo?: string }) {
  const reducido = useReducedMotion()
  const [n, setN] = useState(reducido ? valor : 0)
  useEffect(() => {
    if (reducido) return
    let raf = 0
    const inicio = performance.now()
    const dur = 900
    const tick = (t: number) => {
      const p = Math.min(1, (t - inicio) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      setN(Math.round(valor * e))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [valor, reducido])
  const mostrado = reducido ? valor : n
  return (
    <span className={cn('tabular-nums', className)}>
      {mostrado.toLocaleString('es-AR')}
      {sufijo ? <span className="ml-1 text-[0.55em] font-medium text-muted-foreground">{sufijo}</span> : null}
    </span>
  )
}

/** El sello del final: tilde que aparece con un rebote y chispas. */
export function SelloListo() {
  return (
    <motion.span
      className="relative mx-auto flex size-16 items-center justify-center rounded-full bg-primary text-white shadow-[0_10px_30px_rgba(31,122,71,0.35)]"
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
    >
      <CircleCheck className="size-8" strokeWidth={2.5} />
      <motion.span
        aria-hidden
        className="absolute -right-1 -top-1 text-[#e9b45f]"
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: [0, 1.2, 1], rotate: 0 }}
        transition={{ delay: 0.45, duration: 0.5 }}
      >
        <Sparkles className="size-5" />
      </motion.span>
    </motion.span>
  )
}
