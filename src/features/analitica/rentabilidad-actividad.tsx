import type { ComponentType } from 'react'
import { Beef, Building2, CircleDashed, TrendingUp, Wheat } from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import {
  actividadLabel,
  fmtCompact,
  type LineaActividad,
} from '@/features/analitica/compute'
import { Panel } from '@/components/panel'

type Actividad = Database['public']['Enums']['actividad_movimiento']

/** Identidad visual de cada actividad: vive en el ícono (color + figura). */
const actividadMeta: Record<
  Actividad | 'sin',
  { color: string; Icon: ComponentType<{ className?: string }> }
> = {
  cria: { color: 'var(--ganado)', Icon: Beef },
  invernada: { color: 'var(--g1)', Icon: TrendingUp },
  agricultura: { color: 'var(--sol-deep)', Icon: Wheat },
  estructura: { color: 'var(--tierra)', Icon: Building2 },
  sin: { color: 'var(--faint)', Icon: CircleDashed },
}

/**
 * "Qué actividad rinde y cuál no". El color de la barra es SEMÁNTICO por
 * resultado (verde = gana, rojo = pierde) para responder de un vistazo la
 * pregunta del panel; la identidad de la actividad va en el ícono y la magnitud
 * en el largo de la barra.
 */
export function RentabilidadActividad({
  actividades,
}: {
  actividades: LineaActividad[]
}) {
  if (actividades.length === 0) return null
  const maxAct = Math.max(1, ...actividades.map((a) => Math.abs(a.resultado)))

  return (
    <Panel title="Rentabilidad por actividad" sub="qué actividad rinde y cuál no">
      <div className="flex flex-col gap-4">
        {actividades.map((a) => {
          const meta = actividadMeta[a.actividad]
          const neg = a.resultado < 0
          const numColor = neg ? 'var(--destructive)' : 'var(--field-deep)'
          const barFill = neg
            ? 'linear-gradient(90deg, #e0584b, var(--destructive))'
            : 'linear-gradient(90deg, var(--field), var(--field-deep))'
          return (
            <div key={a.actividad} className="flex items-center gap-3.5">
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                style={{
                  color: meta.color,
                  background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                }}
              >
                <meta.Icon className="size-[19px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold text-ink">
                    {a.actividad === 'sin'
                      ? 'Sin asignar'
                      : actividadLabel[a.actividad]}
                  </span>
                  <span
                    className="tnum shrink-0 text-[15px] font-bold"
                    style={{ color: numColor }}
                  >
                    {fmtCompact(a.resultado)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(Math.abs(a.resultado) / maxAct) * 100}%`,
                      background: barFill,
                    }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
