import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from 'lucide-react'
import { useClima } from '@/features/cotizaciones/hooks'

/** Ícono del ticker según el código WMO de open-meteo. */
function WmoIcon({ code, className }: { code: number; className?: string }) {
  if (code <= 1) return <Sun className={className} />
  if (code === 2) return <CloudSun className={className} />
  if (code === 45 || code === 48) return <CloudFog className={className} />
  if (code >= 51 && code <= 57) return <CloudDrizzle className={className} />
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return <CloudRain className={className} />
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return <CloudSnow className={className} />
  if (code >= 95) return <CloudLightning className={className} />
  return <Cloud className={className} />
}

/**
 * Slot del clima en el ticker (Open-Meteo). Si la fuente falla, no
 * muestra nada (nunca un valor de muestra).
 */
export function ClimaSlot() {
  const clima = useClima()
  if (!clima.data) return null
  return (
    <>
      <span className="h-6 w-px bg-sidebar-border" />
      <div
        className="flex shrink-0 items-center gap-2"
        title={`${clima.data.descripcion} · ${clima.data.lugar}`}
      >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
        <WmoIcon code={clima.data.code} className="size-[15px] text-[#e8b75c]" />
        {clima.data.lugar}
      </span>
        <b className="tnum text-sm font-semibold text-white">
          {clima.data.temp}°
        </b>
      </div>
    </>
  )
}
