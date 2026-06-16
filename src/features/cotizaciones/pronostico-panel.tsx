import { Droplets, Snowflake } from 'lucide-react'
import { CAMPO_PRINCIPAL } from '@/features/cotizaciones/api'
import { usePronostico } from '@/features/cotizaciones/hooks'
import { WmoIcon } from '@/features/cotizaciones/wmo-icon'
import { Panel } from '@/components/panel'

/** Día de la semana abreviado en español a partir de YYYY-MM-DD. */
function diaCorto(fecha: string, primero: boolean): string {
  if (primero) return 'Hoy'
  const [y, m, d] = fecha.split('-').map(Number)
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  return dias[new Date(y, m - 1, d).getDay()] ?? fecha
}

/** Pronóstico de 7 días del campo (Open-Meteo). Para planificar la semana:
 *  lluvia, heladas y temperaturas. Si la fuente falla, no muestra nada. */
export function PronosticoPanel() {
  const pron = usePronostico()
  if (!pron.data || pron.data.length === 0) return null

  return (
    <Panel
      title="Pronóstico 7 días"
      sub={CAMPO_PRINCIPAL.nombre}
    >
      <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7">
        {pron.data.map((d, i) => (
          <div
            key={d.fecha}
            title={`${d.descripcion} · lluvia ${d.lluviaProb}%${d.lluviaMm > 0 ? ` (${d.lluviaMm} mm)` : ''}`}
            className="flex flex-col items-center gap-2 rounded-[11px] border border-border bg-secondary/50 px-2 py-3 text-center"
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-faint">
              {diaCorto(d.fecha, i === 0)}
            </span>
            <WmoIcon code={d.code} className="size-6 text-sol-deep" />
            <div className="flex items-baseline gap-1.5">
              <span className="tnum text-sm font-bold text-ink">{d.max}°</span>
              <span className="tnum text-xs text-faint">{d.min}°</span>
            </div>
            {d.helada ? (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-sky">
                <Snowflake className="size-3" />
                Helada
              </span>
            ) : d.lluviaProb >= 30 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky">
                <Droplets className="size-3" />
                {d.lluviaProb}%
              </span>
            ) : (
              <span className="text-[11px] text-faint">—</span>
            )}
          </div>
        ))}
      </div>
    </Panel>
  )
}
