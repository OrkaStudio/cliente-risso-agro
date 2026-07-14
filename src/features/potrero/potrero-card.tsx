import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Beef, LandPlot, Leaf, Sprout, Tractor, Wheat } from 'lucide-react'
import { Contador } from '@/components/contador'
import type { Database } from '@/lib/supabase/types'
import { categoriaColor, categoriaNombre } from '@/features/hacienda/labels'
import { estadoCicloColor, estadoCicloLabel } from '@/features/campos/labels'

type EstadoCiclo = Database['public']['Enums']['estado_ciclo_potrero']

/** Datos que la card necesita (subset de un potrero enriquecido). */
export type PotreroCardData = {
  id: string
  nombre: string
  estadoCiclo: EstadoCiclo
  hectareas: number | null
  cabezas: number
  porCategoria: { categoria: Database['public']['Enums']['categoria_animal']; cabezas: number }[]
  cultivo: string | null
  fechaSiembra: string | null
  fechaCosechaEstimada: string | null
  destino: Database['public']['Enums']['destino_campania'] | null
}

const MESES_ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function ddmm(fecha: string): string {
  const [, m, d] = fecha.split('-')
  return `${d}/${m}`
}

function mesAbrev(fecha: string): string {
  const m = Number(fecha.slice(5, 7))
  return MESES_ABREV[m - 1] ?? ''
}

/* Ícono según el estado del ciclo del potrero. */
export function CicloIcon({
  estado,
  className,
  style,
}: {
  estado: EstadoCiclo
  className?: string
  style?: CSSProperties
}) {
  const props = { className, style }
  switch (estado) {
    case 'ganadero':
      return <Beef {...props} />
    case 'descanso':
      return <Leaf {...props} />
    case 'preparacion':
      return <Tractor {...props} />
    case 'siembra':
    case 'cultivo':
      return <Sprout {...props} />
    case 'cosecha':
    case 'rastrojo':
      return <Wheat {...props} />
    default:
      return <Leaf {...props} />
  }
}

/** Densidad legible: "2,7" · "<0,1" cuando es minúscula (nunca un "0,0" mudo). */
function densidadLabel(d: number): string {
  if (d > 0 && d < 0.05) return '<0,1'
  return d.toFixed(1).replace('.', ',')
}

/**
 * Card de un potrero: acento y lavado de color según el estado del ciclo,
 * cabezas como protagonista (contador animado), composición como barra
 * segmentada animada + chips por categoría, y pie con superficie/densidad.
 * Compartida por Inicio y Campos. Linkea al detalle del potrero.
 */
export function PotreroCard({ p }: { p: PotreroCardData }) {
  const densidad =
    p.hectareas && p.hectareas > 0 ? p.cabezas / p.hectareas : null
  const color = estadoCicloColor[p.estadoCiclo]
  const totalComp = p.porCategoria.reduce((s, c) => s + c.cabezas, 0)
  const conHacienda = p.cabezas > 0 && totalComp > 0
  const MAX_CHIPS = 3

  return (
    <Link
      to={`/potrero/${p.id}`}
      style={{
        borderLeftColor: color,
        borderLeftWidth: '3px',
        background: `linear-gradient(165deg, color-mix(in srgb, ${color} 6%, var(--card)) 0%, var(--card) 46%)`,
      }}
      className="group flex flex-col rounded-2xl border border-border p-4 shadow-[0_1px_2px_rgba(16,24,19,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(16,30,20,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-soft"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 font-heading text-base font-semibold text-ink">
          {p.nombre}
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-heading text-[11px] font-bold"
          style={{
            color,
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
          }}
        >
          <span className="size-1.5 rounded-full" style={{ background: color }} />
          {estadoCicloLabel[p.estadoCiclo]}
        </span>
      </div>

      {conHacienda ? (
        <>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="tnum text-[30px] font-bold leading-none tracking-tight text-ink">
              <Contador n={p.cabezas} />
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {p.cabezas === 1 ? 'cabeza' : 'cabezas'}
            </span>
          </div>

          {/* Composición: barra segmentada que se despliega al montar */}
          <div className="mt-3 flex h-[7px] gap-[3px]">
            {p.porCategoria.map((c, i) => (
              <motion.span
                key={c.categoria}
                initial={{ flexGrow: 0.0001, opacity: 0 }}
                animate={{ flexGrow: c.cabezas / totalComp, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.08 * i, ease: 'easeOut' }}
                className="min-w-[5px] rounded-full"
                style={{ background: categoriaColor[c.categoria] }}
                title={`${categoriaNombre(c.categoria, c.cabezas)}: ${c.cabezas}`}
              />
            ))}
          </div>

          {/* Chips por categoría (todas, no una leyenda recortada) */}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {p.porCategoria.slice(0, MAX_CHIPS).map((c) => (
              <span
                key={c.categoria}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-2 py-[3px] text-[11px] font-medium text-muted-foreground"
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: categoriaColor[c.categoria] }}
                />
                <b className="tnum font-bold text-ink">{c.cabezas}</b>
                {categoriaNombre(c.categoria, c.cabezas)}
              </span>
            ))}
            {p.porCategoria.length > MAX_CHIPS && (
              <span
                className="inline-flex items-center rounded-full border border-border/70 bg-card/70 px-2 py-[3px] text-[11px] font-bold text-faint"
                title={p.porCategoria
                  .slice(MAX_CHIPS)
                  .map((c) => `${categoriaNombre(c.categoria, c.cabezas)}: ${c.cabezas}`)
                  .join(' · ')}
              >
                +{p.porCategoria.length - MAX_CHIPS}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="mt-3 flex flex-1 flex-col justify-center py-1.5">
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: `color-mix(in srgb, ${color} 13%, transparent)` }}
            >
              <CicloIcon estado={p.estadoCiclo} className="size-[18px]" style={{ color }} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">
                {p.cultivo ?? estadoCicloLabel[p.estadoCiclo]}
              </div>
              <div className="text-xs text-faint">sin hacienda</div>
            </div>
          </div>
          {(p.fechaSiembra || p.fechaCosechaEstimada) && (
            <div className="tnum mt-2 text-xs text-muted-foreground">
              {p.fechaSiembra && `sembrado ${ddmm(p.fechaSiembra)}`}
              {p.fechaSiembra && p.fechaCosechaEstimada && ' · '}
              {p.fechaCosechaEstimada &&
                `cosecha ~${mesAbrev(p.fechaCosechaEstimada)}`}
            </div>
          )}
        </div>
      )}

      {/* Pie: superficie y carga animal */}
      <div className="mt-auto flex items-center gap-3 pt-3 text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <LandPlot className="size-3.5 text-faint" />
          {p.hectareas != null && p.hectareas > 0 ? (
            <span className="tnum">{p.hectareas} ha</span>
          ) : (
            <span className="text-faint">sin superficie</span>
          )}
        </span>
        {densidad != null && conHacienda && (
          <span className="flex items-center gap-1.5">
            <Beef className="size-3.5 text-faint" />
            <span className="tnum">{densidadLabel(densidad)} cab/ha</span>
          </span>
        )}
      </div>
    </Link>
  )
}
