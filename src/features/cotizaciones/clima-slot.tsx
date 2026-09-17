import { ChevronDown, MapPin, Snowflake } from 'lucide-react'
import { useCampoClima } from '@/features/cotizaciones/campo-clima'
import { useClima } from '@/features/cotizaciones/hooks'
import { WmoIcon } from '@/features/cotizaciones/wmo-icon'
import { Link } from 'react-router-dom'

/**
 * Slot del clima en el ticker (Open-Meteo): temperatura actual, máx/mín del
 * día y aviso de helada (clave para el productor). Lluvia en el tooltip.
 *
 * El clima es DEL CAMPO ELEGIDO: con varios campos, el nombre es un selector
 * (la elección se comparte con el panel del Inicio). Sin ningún campo con
 * ubicación, en vez de un clima ajeno muestra "Ubicá tu campo" → Campos.
 * Si la fuente falla, no muestra nada (nunca un valor de muestra).
 */
export function ClimaSlot() {
  const { opciones, actual, elegir, cargando } = useCampoClima()
  const clima = useClima(actual?.ubicacion ?? null)

  if (cargando) return null
  if (!actual) {
    return (
      <Link
        to="/campos"
        className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/55 hover:text-sidebar-foreground"
        title="Cargá la localidad del campo para ver su clima"
      >
        <MapPin className="size-[15px] text-[#e8b75c]" />
        Ubicá tu campo
      </Link>
    )
  }
  if (!clima.data) return null
  const d = clima.data
  return (
    <div
      className="flex shrink-0 items-center gap-2.5"
      title={`${d.descripcion} · ${d.lugar} · lluvia ${d.lluviaProb}%${d.lluviaMm > 0 ? ` (${d.lluviaMm} mm)` : ''}`}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
        <WmoIcon code={d.code} className="size-[15px] text-[#e8b75c]" />
        {opciones.length > 1 ? (
          // Selector nativo, sin estilo propio: en la barra oscura basta con el
          // nombre y la flechita; el menú lo pinta el sistema.
          <span className="relative inline-flex items-center gap-0.5">
            <select
              aria-label="Campo del clima"
              value={actual.id}
              onChange={(e) => elegir(e.target.value)}
              className="cursor-pointer appearance-none bg-transparent pr-3.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/70 outline-none hover:text-sidebar-foreground"
            >
              {opciones.map((o) => (
                <option key={o.id} value={o.id} className="text-ink">
                  {o.nombre}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-0 size-3" />
          </span>
        ) : (
          d.lugar
        )}
      </span>
      <b className="tnum text-sm font-semibold text-white">{d.temp}°</b>
      <span className="tnum hidden text-[11px] font-medium text-sidebar-foreground/45 md:inline">
        {d.max}° / {d.min}°
      </span>
      {d.helada && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#2779c4]/20 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[#8cc2f0]">
          <Snowflake className="size-3" />
          Helada
        </span>
      )}
    </div>
  )
}
