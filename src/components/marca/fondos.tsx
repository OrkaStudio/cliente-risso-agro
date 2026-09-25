import { useId, useMemo } from 'react'
import { useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * Fondos de marca de Tropero (reemplazan al sol y el molino).
 *
 * - `FondoPotreros`: el campo visto desde arriba, como el croquis de la app.
 *   Animado, una recorrida: los potreros se marcan de a uno.
 * - `FondoSendas`: huellas paralelas que cruzan el campo; una es la senda y
 *   la tropa va por ella.
 * - `TexturaPotreros`: sólo los alambrados, para usar muy tenue detrás de la
 *   barra lateral.
 *
 * Mismo generador (con semilla) que las láminas del manual y los videos de
 * marca: el dibujo es siempre el mismo. Decorativos: `aria-hidden`. Con
 * "reducir movimiento" quedan quietos (ver `.fondo-tropero` en index.css).
 */

const W = 1920
const H = 1080

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const f1 = (v: number) => Math.round(v * 10) / 10

type Punto = [number, number]
type Potrero = {
  pts: string
  tono: number
  surcos: string[]
  vacas: { x: number; y: number; rot: number }[]
}

/** Grilla irregular de 7×4 potreros (misma semilla que el manual). */
function potreros(seed: number, nTonos: number): Potrero[] {
  const r = rng(seed)
  const cols = 7
  const rows = 4
  const cw = W / cols
  const ch = H / rows
  const P: Punto[][] = []
  for (let j = 0; j <= rows; j++) {
    P.push([])
    for (let i = 0; i <= cols; i++) {
      const borde = i === 0 || j === 0 || i === cols || j === rows
      P[j]!.push([
        i * cw + (borde ? 0 : (r() - 0.5) * cw * 0.5),
        j * ch + (borde ? 0 : (r() - 0.5) * ch * 0.5),
      ])
    }
  }
  const out: Potrero[] = []
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const q = [P[j]![i]!, P[j]![i + 1]!, P[j + 1]![i + 1]!, P[j + 1]![i]!]
      const cx = q.reduce((s, p) => s + p[0], 0) / 4
      const cy = q.reduce((s, p) => s + p[1], 0) / 4
      const pts = (s: number) =>
        q.map(([x, y]) => `${f1(cx + (x - cx) * s)},${f1(cy + (y - cy) * s)}`).join(' ')
      const tono = Math.floor(r() * nTonos)
      const tipo = r()
      const surcos: string[] = []
      const vacas: Potrero['vacas'] = []
      if (tipo < 0.3) for (const s of [0.82, 0.64, 0.46, 0.28]) surcos.push(pts(s))
      else if (tipo < 0.55)
        for (let k = 0; k < 9; k++) {
          const u = r()
          const v = r()
          const x =
            q[0]![0] * (1 - u) * (1 - v) + q[1]![0] * u * (1 - v) + q[2]![0] * u * v + q[3]![0] * (1 - u) * v
          const y =
            q[0]![1] * (1 - u) * (1 - v) + q[1]![1] * u * (1 - v) + q[2]![1] * u * v + q[3]![1] * (1 - u) * v
          vacas.push({ x: f1(cx + (x - cx) * 0.8), y: f1(cy + (y - cy) * 0.8), rot: Math.round(r() * 80 - 40) })
        }
      out.push({ pts: pts(1), tono, surcos, vacas })
    }
  return out
}

export function FondoPotreros({
  className,
  tonos,
  linea,
  realce,
  animado = true,
}: {
  className?: string
  /** Rellenos de los potreros (de 3 a 5 tonos de la superficie de marca). */
  tonos: string[]
  /** Alambrados. */
  linea: string
  /** Hacienda y el contorno de la recorrida. */
  realce: string
  animado?: boolean
}) {
  const lotes = useMemo(() => potreros(11, tonos.length), [tonos.length])
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className={cn('fondo-tropero', animado && 'fondo-tropero--animado', className)}
    >
      {lotes.map((p, i) => (
        <g key={i} className="potrero" style={{ ['--i' as string]: i }}>
          <polygon points={p.pts} fill={tonos[p.tono]} stroke={linea} strokeOpacity={0.35} strokeWidth={2} />
          {p.surcos.map((s, k) => (
            <polygon key={k} points={s} fill="none" stroke={linea} strokeOpacity={0.18} strokeWidth={2} />
          ))}
          {p.vacas.map((v, k) => (
            <ellipse key={k} cx={v.x} cy={v.y} rx={7} ry={4.5} transform={`rotate(${v.rot} ${v.x} ${v.y})`} fill={realce} />
          ))}
          <polygon className="marca" points={p.pts} fill="none" stroke={realce} strokeWidth={4} opacity={0} />
        </g>
      ))}
    </svg>
  )
}

/** Sólo los alambrados: textura tenue para superficies de marca. */
export function TexturaPotreros({ className, linea }: { className?: string; linea: string }) {
  const lotes = useMemo(() => potreros(11, 1), [])
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className}>
      {lotes.map((p, i) => (
        <g key={i} fill="none" stroke={linea}>
          <polygon points={p.pts} strokeWidth={3} />
          {p.surcos.slice(0, 2).map((s, k) => (
            <polygon key={k} points={s} strokeWidth={2} strokeOpacity={0.5} />
          ))}
        </g>
      ))}
    </svg>
  )
}

type Senda = { d: string; ancho: number; opacidad: number }

function sendas(seed: number) {
  const r = rng(seed)
  const N = 15
  const lineas: Senda[] = []
  let guia: Punto[] = []
  for (let i = 0; i < N; i++) {
    const o = (i - 7) * 64
    const c: Punto[] = [
      [-120, 1010 + o],
      [520 + r() * 50, 930 + o],
      [980 + r() * 50, 420 + o * 0.9],
      [W + 120, 170 + o * 0.8],
    ]
    const d = `M ${f1(c[0]![0])} ${f1(c[0]![1])} C ${f1(c[1]![0])} ${f1(c[1]![1])} ${f1(c[2]![0])} ${f1(c[2]![1])} ${f1(c[3]![0])} ${f1(c[3]![1])}`
    if (i === 8) {
      guia = c
      lineas.push({ d, ancho: 7, opacidad: 1 })
      continue
    }
    lineas.push({ d, ancho: i % 4 === 0 ? 5 : 3, opacidad: +(0.4 + r() * 0.45).toFixed(2) })
  }
  // La tropa: filas en semicírculo, como se arrea para no perder animales.
  const tropa: { x: number; y: number; rx: number; ry: number; rot: number }[] = []
  for (let fila = 0; fila < 4; fila++) {
    const R = 26 + fila * 22
    const n = 4 + fila * 2
    for (let k = 0; k < n; k++) {
      const a = Math.PI * (0.62 + (0.76 * (k + 0.5)) / n) + (r() - 0.5) * 0.12
      tropa.push({
        x: f1(Math.cos(a) * R * 1.3),
        y: f1(Math.sin(a) * R),
        rx: f1(7.5 + r() * 2.5),
        ry: f1(4.6 + r() * 1.2),
        rot: Math.round(r() * 40 - 20),
      })
    }
  }
  // Pose quieta (sin animación): la tropa a 60 % de la senda, mirando hacia adelante.
  const B = (t: number) => {
    const u = 1 - t
    return [0, 1].map(
      (k) => u * u * u * guia[0]![k]! + 3 * u * u * t * guia[1]![k]! + 3 * u * t * t * guia[2]![k]! + t * t * t * guia[3]![k]!,
    ) as Punto
  }
  const [px, py] = B(0.6)
  const [qx, qy] = B(0.61)
  const pose = `translate(${f1(px)} ${f1(py)}) rotate(${f1((Math.atan2(qy - py, qx - px) * 180) / Math.PI)})`
  return { lineas, tropa, pose, indiceGuia: 8 }
}

export function FondoSendas({
  className,
  linea,
  realce,
  animado = true,
}: {
  className?: string
  /** Las huellas. */
  linea: string
  /** La senda que sigue la tropa y la tropa misma. */
  realce: string
  animado?: boolean
}) {
  const s = useMemo(() => sendas(3), [])
  const guia = s.lineas[s.indiceGuia]!
  const quieto = useReducedMotion()
  const mover = animado && !quieto
  // Id único: la escena de login se monta dos veces (panel y fondo del teléfono).
  const idGuia = `senda-${useId().replace(/:/g, '')}`
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className={cn('fondo-tropero', mover && 'fondo-tropero--animado', className)}
    >
      {s.lineas.map((l, i) =>
        i === s.indiceGuia ? null : (
          <path
            key={i}
            className="senda"
            style={{ ['--i' as string]: i }}
            d={l.d}
            fill="none"
            stroke={linea}
            strokeWidth={l.ancho}
            strokeLinecap="round"
            opacity={l.opacidad}
            pathLength={1000}
          />
        ),
      )}
      <path
        id={idGuia}
        className="senda senda-guia"
        d={guia.d}
        fill="none"
        stroke={realce}
        strokeWidth={7}
        strokeLinecap="round"
        pathLength={1000}
      />
      <g className="tropa" transform={mover ? undefined : s.pose}>
        {s.tropa.map((v, i) => (
          <ellipse key={i} cx={v.x} cy={v.y} rx={v.rx} ry={v.ry} transform={`rotate(${v.rot} ${v.x} ${v.y})`} fill={realce} />
        ))}
        {mover ? (
          <animateMotion dur="14s" repeatCount="indefinite" rotate="auto" keyPoints="0.04;0.04;0.92;0.92" keyTimes="0;0.3;0.92;1" calcMode="linear">
            <mpath href={`#${idGuia}`} />
          </animateMotion>
        ) : null}
      </g>
    </svg>
  )
}
