import { useNavigate } from 'react-router-dom'
import { MapPin, Snowflake } from 'lucide-react'
import { useCampoClima } from '@/features/cotizaciones/campo-clima'
import { useClima } from '@/features/cotizaciones/hooks'
import { WmoIcon } from '@/features/cotizaciones/wmo-icon'
import { cn } from '@/lib/utils'
import { PILDORA } from './pildora'

/**
 * El clima en la barra superior (Open-Meteo): temperatura, máx/mín y aviso de
 * helada, del campo elegido en la barra izquierda (con «Todos tus campos», el
 * primero con ubicación, con su nombre a la vista). Acá no se elige. Sin campo ubicado, lleva a
 * Campos. Si la fuente falla, no muestra nada (nunca un valor de muestra).
 */
export function ClimaSlot() {
  const { actual, cargando } = useCampoClima()
  const clima = useClima(actual?.ubicacion ?? null)
  const navigate = useNavigate()

  if (cargando) return null
  if (!actual) {
    return (
      <button type="button" onClick={() => navigate('/campos')} className={cn(PILDORA, 'text-[13px] font-semibold text-principal')}>
        <MapPin className="size-4" />
        Ubicá tu campo para ver el clima
      </button>
    )
  }
  if (!clima.data) return null
  const d = clima.data
  return (
    <div
      title={`${d.descripcion} · lluvia ${d.lluviaProb} %${d.lluviaMm > 0 ? ` (${d.lluviaMm} mm)` : ''}`}
      className={cn(PILDORA, 'cursor-default hover:border-borde')}
    >
      <WmoIcon code={d.code} className="size-4 text-estado-atencion" />
      <span className="text-[13px] text-texto-suave">{actual.nombre}</span>
      <b className="t-cifra-chica font-bold text-texto">{d.temp}°</b>
      <span className="t-cifra-mini hidden text-texto-suave lg:inline">
        {d.max}° / {d.min}°
      </span>
      {d.helada && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#e1ebf2] px-2 py-0.5 text-[11.5px] font-bold text-[#215a7e]">
          <Snowflake className="size-3" />
          Helada
        </span>
      )}
    </div>
  )
}
