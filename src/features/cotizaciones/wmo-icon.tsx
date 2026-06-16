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

/** Ícono según el código WMO de open-meteo. Compartido por el ticker y
 *  el pronóstico. */
export function WmoIcon({
  code,
  className,
}: {
  code: number
  className?: string
}) {
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
