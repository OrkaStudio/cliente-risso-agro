import * as React from 'react'
import { motion } from 'framer-motion'
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import { Panel } from '@/components/panel'
import { cn } from '@/lib/utils'

/**
 * Metric card "AI" de Analítica (dirección visual elegida por Lau, 17/07):
 * número grande + tendencia + gráfico fundido en la card (degradé + grilla de
 * puntos) con scrubbing al pasar el mouse. Implementación propia sobre los
 * tokens del sistema — sin libs de charts.
 */

export type PuntoSerie = {
  /** Clave estable (YYYY-MM). */
  clave: string
  /** Etiqueta corta para el eje/tooltip ("Ago 26"). */
  label: string
  valor: number
}

type Accent = 'field' | 'rose' | 'sky'

const ACCENTS: Record<Accent, { stroke: string; text: string }> = {
  field: { stroke: 'var(--field)', text: 'var(--field-deep)' },
  rose: { stroke: 'var(--destructive)', text: 'var(--destructive)' },
  sky: { stroke: 'var(--sky)', text: 'var(--sky)' },
}

/** Catmull-Rom → Bézier: curva suave que pasa por todos los puntos. */
function pathSuave(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  const d: string[] = [`M ${pts[0].x} ${pts[0].y}`]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`)
  }
  return d.join(' ')
}

// Tamaño lógico del lienzo (se estira al contenedor; strokes no escalan).
const W = 600
const H = 240
const PAD_Y = 26

export function MetricChart({
  serie,
  vista,
  accent,
  formatter,
  marcador,
}: {
  serie: PuntoSerie[]
  vista: 'barras' | 'curva'
  accent: Accent
  formatter: (n: number) => string
  /** Índice a resaltar por defecto (ej. "hoy"); default último. */
  marcador?: number
}) {
  const color = ACCENTS[accent]
  const uid = React.useId().replace(/:/g, '')
  const [hover, setHover] = React.useState<number | null>(null)

  const n = serie.length
  const idx = hover ?? marcador ?? n - 1
  const punto = serie[idx]

  const min = Math.min(0, ...serie.map((p) => p.valor))
  const max = Math.max(0, ...serie.map((p) => p.valor))
  const span = max - min || 1
  const y = (v: number) => PAD_Y + (1 - (v - min) / span) * (H - PAD_Y * 2)
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W)
  const y0 = y(0)

  const pts = serie.map((p, i) => ({ x: x(i), y: y(p.valor) }))

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - r.left) / r.width
    setHover(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))))
  }

  if (n === 0) return null

  const bw = Math.min(34, (W / n) * 0.55)

  /** Barra con esquinas redondeadas SOLO en la punta del dato (el extremo del
   *  eje queda recto — spec de marks del sistema de dataviz). */
  const barPath = (cx: number, v: number) => {
    const xl = cx - bw / 2
    const xr = cx + bw / 2
    const yv = y(v)
    const r = Math.min(3, bw / 2, Math.abs(yv - y0))
    if (v >= 0) {
      // punta arriba
      return `M ${xl} ${y0} L ${xl} ${yv + r} Q ${xl} ${yv} ${xl + r} ${yv} L ${xr - r} ${yv} Q ${xr} ${yv} ${xr} ${yv + r} L ${xr} ${y0} Z`
    }
    // punta abajo
    return `M ${xl} ${y0} L ${xl} ${yv - r} Q ${xl} ${yv} ${xl + r} ${yv} L ${xr - r} ${yv} Q ${xr} ${yv} ${xr} ${yv - r} L ${xr} ${y0} Z`
  }

  // Eje X: meses cada tanto, con el último SIEMPRE — y los intermedios que le
  // quedarían encima se saltean (nada de labels pisados).
  const paso = Math.max(1, Math.ceil(n / 6))
  // El último siempre; los intermedios solo si quedan a ≥2 puntos del último
  // (nunca dos labels pegados).
  const conLabel = (i: number) => i === n - 1 || (i % paso === 0 && n - 1 - i >= 2)

  return (
    <div
      className="absolute inset-0"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <div className="absolute inset-x-0 bottom-[18px] top-0">
      <svg
        className="h-full w-full"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color.stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color.stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Eje cero (visible cuando hay negativos) */}
        {min < 0 && (
          <line
            x1="0"
            x2={W}
            y1={y0}
            y2={y0}
            stroke="var(--border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="4 4"
          />
        )}

        {vista === 'curva' ? (
          <>
            <path
              d={`${pathSuave(pts)} L ${W} ${y0} L 0 ${y0} Z`}
              fill={`url(#area-${uid})`}
            />
            <path
              d={pathSuave(pts)}
              fill="none"
              stroke={color.stroke}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        ) : (
          serie.map((p, i) => (
            <path
              key={p.clave}
              d={barPath(x(i), p.valor)}
              fill={p.valor < 0 ? 'var(--destructive)' : color.stroke}
              opacity={i === idx ? 1 : 0.55}
            />
          ))
        )}

        {/* Guía vertical del punto activo */}
        <line
          x1={x(idx)}
          x2={x(idx)}
          y1={PAD_Y / 2}
          y2={H - PAD_Y / 2}
          stroke="var(--faint)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          strokeDasharray="3 4"
          opacity={hover != null ? 0.7 : 0}
        />
      </svg>

      {/* Punto activo (div posicionado por % → no se deforma con el estiramiento) */}
      {vista === 'curva' && punto && (
        <motion.span
          className="pointer-events-none absolute z-10 size-2.5 rounded-full border-2 border-white"
          style={{
            left: `${(x(idx) / W) * 100}%`,
            top: `${(y(punto.valor) / H) * 100}%`,
            translateX: '-50%',
            translateY: '-50%',
            background: color.stroke,
            boxShadow: `0 0 0 4px color-mix(in srgb, ${color.stroke} 25%, transparent)`,
          }}
          animate={hover == null ? { scale: [1, 1.25, 1] } : { scale: 1 }}
          transition={
            hover == null ? { duration: 2.4, repeat: Infinity } : { duration: 0.1 }
          }
        />
      )}

      {/* Tooltip */}
      {punto && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-xl border border-border bg-card px-2.5 py-1.5 text-center shadow-[0_8px_24px_rgba(10,20,14,0.16)] transition-opacity"
          style={{
            left: `${Math.min(Math.max((x(idx) / W) * 100, 12), 88)}%`,
            top: 2,
            opacity: hover != null ? 1 : 0,
          }}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
            {punto.label}
          </div>
          <div
            className="tnum text-[13px] font-bold leading-tight"
            style={{ color: punto.valor < 0 ? 'var(--destructive)' : 'var(--ink)' }}
          >
            {formatter(punto.valor)}
          </div>
        </div>
      )}
      </div>

      {/* Eje X: meses */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[16px]">
        {serie.map(
          (p, i) =>
            conLabel(i) && (
              <span
                key={p.clave}
                className={cn(
                  'tnum absolute whitespace-nowrap text-[10px] font-semibold',
                  i === idx ? 'text-ink' : 'text-faint',
                )}
                style={{
                  left: `${(x(i) / W) * 100}%`,
                  transform:
                    i === 0
                      ? 'none'
                      : i === n - 1
                        ? 'translateX(-100%)'
                        : 'translateX(-50%)',
                }}
              >
                {p.label}
              </span>
            ),
        )}
      </div>
    </div>
  )
}

export function MetricCard({
  titulo,
  sub,
  headline,
  tendencia,
  tendenciaLabel,
  accent,
  serie,
  vista,
  formatter,
  marcador,
  footer,
  vacio,
  guia,
  className,
}: {
  titulo: string
  /** Contexto corto (va a la derecha del título, como en todos los Panels). */
  sub?: string
  /** Número grande ya formateado. SIEMPRE en tinta — el color semántico vive
   *  en el chip de tendencia y en el gráfico (regla KPI-card: el valor es
   *  neutro, el delta califica). */
  headline: string
  /** % de variación vs el período anterior; null = sin comparación. */
  tendencia?: number | null
  tendenciaLabel?: string
  accent: Accent
  serie: PuntoSerie[]
  vista: 'barras' | 'curva'
  formatter: (n: number) => string
  marcador?: number
  /** Datos exactos al pie. */
  footer?: React.ReactNode
  /** Mensaje cuando no hay datos. */
  vacio?: string
  guia?: string
  className?: string
}) {
  const gridId = React.useId().replace(/:/g, '')
  const color = ACCENTS[accent]
  const hayDatos = serie.length >= 2

  const TrendIcon =
    tendencia == null || Math.abs(tendencia) < 0.5
      ? ArrowRight
      : tendencia >= 0
        ? ArrowUp
        : ArrowDown
  const trendColor =
    tendencia == null || Math.abs(tendencia) < 0.5
      ? 'var(--faint)'
      : tendencia >= 0
        ? 'var(--field-deep)'
        : 'var(--destructive)'

  return (
    <Panel title={titulo} sub={sub} guia={guia} className={cn('flex flex-col', className)}>
      {/* Valor + delta (misma gramática en todas las metric cards) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="tnum font-heading text-[34px] font-bold leading-none tracking-tight text-ink">
          {headline}
        </div>
        {tendencia != null && (
          <span
            className="flex shrink-0 items-center gap-1 rounded-full bg-secondary/80 px-2 py-1 text-[12.5px] font-bold"
            style={{ color: trendColor }}
          >
            <TrendIcon className="size-3.5" strokeWidth={2.5} />
            {Math.abs(tendencia).toFixed(0)}%
            {tendenciaLabel && (
              <span className="font-medium text-faint"> {tendenciaLabel}</span>
            )}
          </span>
        )}
      </div>

      {/* Franja del gráfico: contenida, con su eje de meses */}
      {hayDatos ? (
        <div className="relative mt-4 h-[180px] overflow-hidden rounded-xl">
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to top, color-mix(in srgb, ${color.stroke} 8%, transparent), transparent 80%)`,
            }}
          />
          {/* Grilla de puntos (firma visual AI) */}
          <div
            className="absolute inset-0 text-ink/[0.10]"
            style={{
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 55%)',
              maskImage: 'linear-gradient(to bottom, transparent, black 55%)',
            }}
          >
            <svg className="h-full w-full" aria-hidden>
              <defs>
                <pattern
                  id={`grid-${gridId}`}
                  width="14"
                  height="14"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="1" cy="1" r="1" fill="currentColor" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#grid-${gridId})`} />
            </svg>
          </div>
          <div className="absolute inset-x-2 inset-y-0">
            <MetricChart
              serie={serie}
              vista={vista}
              accent={accent}
              formatter={formatter}
              marcador={marcador}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-[180px] flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
          {vacio ?? 'Todavía no hay datos para este período.'}
        </div>
      )}

      {/* Pie con los datos exactos */}
      {footer && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border/70 pt-3 text-[12.5px]">
          {footer}
        </div>
      )}
    </Panel>
  )
}

/** Dato exacto del footer: etiqueta + valor con color. */
export function FooterDato({
  label,
  valor,
  color,
}: {
  label: string
  valor: string
  color?: string
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
        {label}
      </span>
      <span className="tnum font-bold" style={{ color: color ?? 'var(--ink)' }}>
        {valor}
      </span>
    </span>
  )
}
