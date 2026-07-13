import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Beef, Leaf, Sprout, Tractor, Wheat } from 'lucide-react'
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

/**
 * Card de un potrero: estado del ciclo (acento de color), composición de la
 * hacienda (barra + leyenda) o, si no hay animales, la campaña agrícola.
 * Compartida por Inicio y Campos. Linkea al detalle del potrero.
 */
export function PotreroCard({ p }: { p: PotreroCardData }) {
  const densidad =
    p.hectareas && p.hectareas > 0 ? p.cabezas / p.hectareas : null
  const color = estadoCicloColor[p.estadoCiclo]
  const totalComp = p.porCategoria.reduce((s, c) => s + c.cabezas, 0)
  const conHacienda = p.cabezas > 0 && totalComp > 0

  return (
    <Link
      to={`/potrero/${p.id}`}
      style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
      className="block rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,19,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(16,30,20,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-soft"
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
          <div className="mt-3 flex items-baseline gap-1">
            <span className="tnum text-[26px] font-bold leading-none text-ink">
              {p.cabezas}
            </span>
            <span className="text-xs text-muted-foreground">cab</span>
          </div>
          <div className="mt-2.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {p.porCategoria.map((c) => (
              <span
                key={c.categoria}
                style={{
                  width: `${(c.cabezas / totalComp) * 100}%`,
                  background: categoriaColor[c.categoria],
                }}
                title={`${categoriaNombre(c.categoria, c.cabezas)}: ${c.cabezas}`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
            {p.porCategoria.slice(0, 2).map((c) => (
              <span key={c.categoria} className="flex items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: categoriaColor[c.categoria] }}
                />
                <span className="text-muted-foreground">
                  {categoriaNombre(c.categoria, c.cabezas)}
                </span>
                <b className="tnum font-bold text-ink">{c.cabezas}</b>
              </span>
            ))}
            {p.porCategoria.length > 2 && (
              <span className="font-semibold text-faint">
                +{p.porCategoria.length - 2}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <CicloIcon
              estado={p.estadoCiclo}
              className="size-[18px] shrink-0"
              style={{ color }}
            />
            <span className="truncate text-sm font-semibold text-ink">
              {p.cultivo ?? estadoCicloLabel[p.estadoCiclo]}
            </span>
            <span className="shrink-0 text-xs text-faint">· sin hacienda</span>
          </div>
          {(p.fechaSiembra || p.fechaCosechaEstimada) && (
            <div className="tnum mt-1.5 text-xs text-muted-foreground">
              {p.fechaSiembra && `sembrado ${ddmm(p.fechaSiembra)}`}
              {p.fechaSiembra && p.fechaCosechaEstimada && ' · '}
              {p.fechaCosechaEstimada &&
                `cosecha ~${mesAbrev(p.fechaCosechaEstimada)}`}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex min-h-4 gap-3 text-xs font-medium text-muted-foreground">
        <span className="tnum">
          {p.hectareas != null ? `${p.hectareas} ha` : 's/ sup.'}
        </span>
        {densidad != null && conHacienda && (
          <span className="tnum">
            {densidad.toFixed(1).replace('.', ',')} cab/ha
          </span>
        )}
      </div>
    </Link>
  )
}
