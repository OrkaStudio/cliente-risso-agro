import { Link } from 'react-router-dom'
import { estadoCicloColor, estadoCicloLabel } from '@/features/campos/labels'
import { CicloIcon, type PotreroCardData } from '@/features/potrero/potrero-card'
import { squarify } from '@/features/campos/treemap'

/* Espacio de referencia para el treemap (relación 2:1). El contenedor usa
 * el mismo aspect-ratio, así los % mapean exacto a cualquier ancho. */
const REF_W = 1000
const REF_H = 500

/**
 * Mapa de superficie: cada potrero es un bloque con área proporcional a sus
 * hectáreas, coloreado por estado de ciclo. Reemplaza la grilla de cards por
 * algo que se lee como la superficie real del campo. Toca un bloque para
 * entrar al potrero.
 */
export function SuperficieMapa({ potreros }: { potreros: PotreroCardData[] }) {
  const tiles = squarify(
    potreros.map((p) => ({
      datum: p,
      value: p.hectareas && p.hectareas > 0 ? p.hectareas : 0.5,
    })),
    { x: 0, y: 0, w: REF_W, h: REF_H },
  )

  if (tiles.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Cargá las hectáreas de los potreros para ver el mapa de superficie.
      </p>
    )
  }

  return (
    <div className="relative aspect-[2/1] w-full">
      {tiles.map((t) => {
        const p = t.datum
        const color = estadoCicloColor[p.estadoCiclo]
        const wPct = (t.w / REF_W) * 100
        const hPct = (t.h / REF_H) * 100
        const grande = wPct > 15 && hPct > 24
        const medio = wPct > 10 && hPct > 14
        const conHacienda = p.cabezas > 0
        const sec = conHacienda
          ? `${p.cabezas} cab`
          : (p.cultivo ?? estadoCicloLabel[p.estadoCiclo])
        return (
          <div
            key={p.id}
            className="absolute"
            style={{
              left: `${(t.x / REF_W) * 100}%`,
              top: `${(t.y / REF_H) * 100}%`,
              width: `${wPct}%`,
              height: `${hPct}%`,
            }}
          >
            <Link
              to={`/potrero/${p.id}`}
              title={`${p.nombre} · ${estadoCicloLabel[p.estadoCiclo]} · ${p.hectareas ?? '—'} ha · ${sec}`}
              className="absolute inset-[3px] flex flex-col justify-between overflow-hidden rounded-[10px] p-2.5 transition-[filter] hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-soft"
              style={{
                background: `color-mix(in srgb, ${color} 16%, var(--card))`,
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 32%, transparent)`,
              }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <span className="truncate font-heading text-[13px] font-bold text-ink">
                  {p.nombre}
                </span>
              </div>
              {grande ? (
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-[12px] font-semibold text-ink">
                      <CicloIcon
                        estado={p.estadoCiclo}
                        className="size-3.5 shrink-0"
                        style={{ color }}
                      />
                      <span className="truncate">{sec}</span>
                    </div>
                  </div>
                  <span className="tnum shrink-0 text-[12px] font-bold text-ink">
                    {p.hectareas ?? '—'}
                    <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">
                      ha
                    </span>
                  </span>
                </div>
              ) : medio ? (
                <span className="tnum text-[11px] font-bold text-ink">
                  {p.hectareas ?? '—'} ha
                </span>
              ) : null}
            </Link>
          </div>
        )
      })}
    </div>
  )
}
