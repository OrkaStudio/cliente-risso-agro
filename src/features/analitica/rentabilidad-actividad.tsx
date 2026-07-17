import type { ComponentType } from 'react'
import { Beef, Building2, CircleDashed, TrendingUp, Wheat } from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import {
  actividadLabel,
  fmtCompact,
  formatARS,
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
 * "Qué actividad rinde y cuál no" — SOLO actividades productivas en la escala
 * (cría/invernada/agricultura). "Estructura" no es una actividad: es el costo
 * general del campo, y si entra a la escala aplasta a las demás (feedback de
 * Lau 17/07) → va aparte como línea propia. "Sin asignar" invita a categorizar.
 */
export function RentabilidadActividad({
  actividades,
}: {
  actividades: LineaActividad[]
}) {
  if (actividades.length === 0) return null

  const productivas = actividades.filter(
    (a) => a.actividad !== 'estructura' && a.actividad !== 'sin',
  )
  const estructura = actividades.find((a) => a.actividad === 'estructura')
  const sinAsignar = actividades.find((a) => a.actividad === 'sin')
  const maxAct = Math.max(1, ...productivas.map((a) => Math.abs(a.resultado)))

  return (
    <Panel title="Rentabilidad por actividad" sub="qué actividad rinde y cuál no">
      <div className="flex flex-col gap-4">
        {productivas.length === 0 ? (
          <p className="py-3 text-center text-[13px] text-muted-foreground">
            Cuando cargues movimientos con actividad (cría, invernada,
            agricultura), acá ves cuál rinde.
          </p>
        ) : (
          productivas.map((a) => {
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
                      {actividadLabel[a.actividad as Actividad]}
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
          })
        )}

        {/* Costos generales y sin asignar: informan, no compiten en la escala */}
        {(estructura || sinAsignar) && (
          <div className="flex flex-col gap-2 border-t border-border/70 pt-3">
            {estructura && (
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="size-4 text-tierra" />
                  Gastos generales del campo (estructura)
                </span>
                <span className="tnum font-bold text-tierra">
                  {formatARS(estructura.resultado)}
                </span>
              </div>
            )}
            {sinAsignar && (
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <CircleDashed className="size-4 text-faint" />
                  Sin actividad asignada — asignala al cargar
                </span>
                <span className="tnum font-bold text-ink">
                  {formatARS(sinAsignar.resultado)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}
