import type { Database } from '@/lib/supabase/types'
import { coloresPorCategoria, categoriaNombre } from '@/features/hacienda/labels'

type Categoria = Database['public']['Enums']['categoria_animal']

/**
 * Composición por categoría: barra apilada (con 2px de aire entre segmentos) +
 * tarjetas donde el número grande vive PEGADO a su categoría (no en extremos
 * opuestos → no se mezcla al leer). Tinte + borde en el color de la categoría
 * (paleta agro anclada a la marca). Compartida por el potrero y el campo.
 */
export function ComposicionView({
  items,
  total,
}: {
  items: { categoria: Categoria; cabezas: number }[]
  total: number
}) {
  const colores = coloresPorCategoria(items.map((c) => c.categoria))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-secondary">
        {items.map((c) => (
          <span
            key={c.categoria}
            className="first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(c.cabezas / total) * 100}%`,
              background: colores[c.categoria],
            }}
            title={`${categoriaNombre(c.categoria, c.cabezas)}: ${c.cabezas}`}
          />
        ))}
      </div>
      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
      >
        {items.map((c) => {
          const col = colores[c.categoria]
          const pct = Math.round((c.cabezas / total) * 100)
          return (
            <div
              key={c.categoria}
              className="rounded-xl border border-border/50 px-3.5 py-2.5"
              style={{
                background: `color-mix(in srgb, ${col} 8%, var(--card))`,
                borderLeft: `3px solid ${col}`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-semibold text-ink">
                  {categoriaNombre(c.categoria, c.cabezas)}
                </span>
                <span className="tnum shrink-0 text-[12px] font-semibold text-faint">
                  {pct}%
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="tnum text-[24px] font-bold leading-none text-ink">
                  {c.cabezas}
                </span>
                <span className="text-[12px] font-medium text-muted-foreground">
                  cab
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
