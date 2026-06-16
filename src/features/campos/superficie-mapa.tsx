import { Link } from 'react-router-dom'
import { estadoCicloColor, estadoCicloLabel } from '@/features/campos/labels'
import { CicloIcon, type PotreroCardData } from '@/features/potrero/potrero-card'
import { squarify } from '@/features/campos/treemap'

/**
 * Mapa de superficie: cada potrero es un bloque con área proporcional a sus
 * hectáreas, coloreado por estado de ciclo. Toca un bloque para entrar.
 *
 * Para que los potreros chicos no queden ilegibles cuando las superficies
 * son muy dispares (ej. 200 ha vs 10 ha), comprimimos la escala (área ∝
 * ha^0.6): se preserva el orden y "más grande = más grande", pero los chicos
 * ganan superficie usable. El número exacto de ha va en cada bloque.
 *
 * `ratio` = ancho/alto del contenedor (más alto = más bajo/compacto).
 */
const EXP = 0.6

export function SuperficieMapa({
  potreros,
  ratio = 2.6,
}: {
  potreros: PotreroCardData[]
  ratio?: number
}) {
  const REF_W = 1000
  const REF_H = REF_W / ratio
  const tiles = squarify(
    potreros.map((p) => ({
      datum: p,
      value: Math.pow(p.hectareas && p.hectareas > 0 ? p.hectareas : 0.3, EXP),
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
    <div className="relative w-full" style={{ aspectRatio: String(ratio) }}>
      {tiles.map((t) => {
        const p = t.datum
        const color = estadoCicloColor[p.estadoCiclo]
        const wPct = (t.w / REF_W) * 100
        const hPct = (t.h / REF_H) * 100
        const grande = wPct > 18 && hPct > 32
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
              className="group absolute inset-[4px] flex flex-col justify-between gap-1 overflow-hidden rounded-xl p-3 transition-all hover:z-10 hover:brightness-[0.98] hover:shadow-[0_4px_16px_rgba(16,24,19,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-soft"
              style={{
                background: `color-mix(in srgb, ${color} 15%, var(--card))`,
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 34%, transparent)`,
              }}
            >
              {/* Nombre + estado (siempre) */}
              <div className="flex min-w-0 items-start gap-1.5">
                <span
                  className="mt-[5px] size-1.5 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <span className="line-clamp-2 font-heading text-[13px] font-bold leading-tight text-ink">
                  {p.nombre}
                </span>
              </div>

              {/* Pie: actividad (si entra) + hectáreas (siempre) */}
              <div className="flex items-end justify-between gap-2">
                {grande ? (
                  <span className="flex min-w-0 items-center gap-1 text-[12px] font-semibold text-ink/80">
                    <CicloIcon
                      estado={p.estadoCiclo}
                      className="size-3.5 shrink-0"
                      style={{ color }}
                    />
                    <span className="truncate">{sec}</span>
                  </span>
                ) : (
                  <span />
                )}
                <span className="tnum shrink-0 whitespace-nowrap text-[12px] font-bold text-ink">
                  {p.hectareas ?? '—'}
                  <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">
                    ha
                  </span>
                </span>
              </div>
            </Link>
          </div>
        )
      })}
    </div>
  )
}
