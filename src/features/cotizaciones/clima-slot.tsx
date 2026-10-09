import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, MapPin, Snowflake } from 'lucide-react'
import { useCampoClima } from '@/features/cotizaciones/campo-clima'
import { useClima } from '@/features/cotizaciones/hooks'
import { WmoIcon } from '@/features/cotizaciones/wmo-icon'
import { cn } from '@/lib/utils'
import { PILDORA } from './pildora'

/**
 * El clima en la barra superior (Open-Meteo): temperatura, máx/mín y aviso de
 * helada, del campo elegido. Con varios campos, el nombre abre un menú para
 * elegir (la elección se comparte con el Inicio). Sin campo ubicado, lleva a
 * Campos. Si la fuente falla, no muestra nada (nunca un valor de muestra).
 */
export function ClimaSlot() {
  const { opciones, actual, elegir, cargando } = useCampoClima()
  const clima = useClima(actual?.ubicacion ?? null)
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)

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
  const varios = opciones.length > 1
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => varios && setAbierto((v) => !v)}
        aria-expanded={varios ? abierto : undefined}
        title={`${d.descripcion} · lluvia ${d.lluviaProb} %${d.lluviaMm > 0 ? ` (${d.lluviaMm} mm)` : ''}`}
        className={cn(PILDORA, !varios && 'cursor-default hover:border-borde')}
      >
        <WmoIcon code={d.code} className="size-4 text-estado-atencion" />
        <span className="text-[13px] text-texto-suave">{actual.nombre}</span>
        <b className="cifra text-[15px] font-bold text-texto">{d.temp}°</b>
        <span className="cifra hidden text-[12.5px] text-texto-suave lg:inline">
          {d.max}° / {d.min}°
        </span>
        {d.helada && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#e1ebf2] px-2 py-0.5 text-[11.5px] font-bold text-[#215a7e]">
            <Snowflake className="size-3" />
            Helada
          </span>
        )}
        {varios && <ChevronDown className="size-3.5 text-texto-suave" />}
      </button>
      {abierto && (
        <ul className="absolute top-11 right-0 z-50 min-w-[200px] overflow-hidden rounded-[14px] border border-borde bg-superficie py-1.5 shadow-lg">
          {opciones.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => {
                  elegir(o.id)
                  setAbierto(false)
                }}
                className={cn('w-full px-4 py-2.5 text-left text-[14.5px] text-texto hover:bg-superficie-hundida', o.id === actual.id && 'font-bold')}
              >
                {o.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
