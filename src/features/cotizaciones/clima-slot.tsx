import { Snowflake } from 'lucide-react'
import { useClima } from '@/features/cotizaciones/hooks'
import { WmoIcon } from '@/features/cotizaciones/wmo-icon'

/**
 * Slot del clima en el ticker (Open-Meteo): temperatura actual, máx/mín del
 * día y aviso de helada (clave para el productor). Lluvia en el tooltip. Si
 * la fuente falla, no muestra nada (nunca un valor de muestra).
 */
export function ClimaSlot() {
  const clima = useClima()
  if (!clima.data) return null
  const d = clima.data
  return (
    <div
      className="flex shrink-0 items-center gap-2.5"
      title={`${d.descripcion} · ${d.lugar} · lluvia ${d.lluviaProb}%${d.lluviaMm > 0 ? ` (${d.lluviaMm} mm)` : ''}`}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
        <WmoIcon code={d.code} className="size-[15px] text-[#e8b75c]" />
        {d.lugar}
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
