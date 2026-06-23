import { ArrowRight, Beef, LandPlot, Layers, MousePointer2, Sprout } from 'lucide-react'
import { especieColor, especieLabel, type Especie } from '@/features/lotes/domain'
import type { Campo } from '@/features/lotes/mock'

export type Uso = 'ganadero' | 'agricola' | 'vacio'

/** Color y etiqueta por uso del potrero (doble codificación: borde = campo,
 *  relleno = uso). */
export const USO: Record<Uso, { label: string; color: string }> = {
  ganadero: { label: 'Ganadero', color: '#3f9d52' },
  agricola: { label: 'Agrícola', color: '#d6a032' },
  vacio: { label: 'Vacío', color: '#94a39a' },
}

export type PotreroInfo = {
  numero: string
  uso: Uso
  ha?: number
  especie?: Especie
  proposito?: string
  loteCodigo?: string
  cabezas?: number
  loteId?: string
  cultivo?: string
}

function UsoBadge({ uso }: { uso: Uso }) {
  const m = USO[uso]
  const Icon = uso === 'ganadero' ? Beef : uso === 'agricola' ? Sprout : LandPlot
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.03em]"
      style={{
        background: `color-mix(in srgb, ${m.color} 16%, transparent)`,
        color: m.color,
      }}
    >
      <Icon className="size-3.5" />
      {m.label}
    </span>
  )
}

function Dato({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Beef
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <Icon className="size-4 text-faint" />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-semibold text-ink">{children}</span>
    </div>
  )
}

export function PotreroSidePanel({
  info,
  campo,
  onVerLote,
}: {
  info: PotreroInfo | null
  campo: Campo
  onVerLote: (loteId: string) => void
}) {
  return (
    <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,19,0.05)] lg:h-[560px] lg:w-[300px]">
      {/* Cabecera: campo */}
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
        <span
          className="inline-flex size-7 items-center justify-center rounded-lg font-heading text-[13px] font-bold text-white"
          style={{ background: campo.color.hex }}
        >
          {campo.color.letra}
        </span>
        <span className="font-heading text-[15px] font-semibold text-ink">
          {campo.nombre}
        </span>
      </div>

      {info ? (
        <div className="flex flex-1 flex-col gap-3.5 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-heading text-[26px] font-bold tracking-[-0.02em] text-ink">
              Potrero {info.numero}
            </span>
            <UsoBadge uso={info.uso} />
          </div>

          {info.uso === 'ganadero' && (
            <div className="tnum text-[30px] font-bold leading-none text-ink">
              {info.cabezas}{' '}
              <span className="text-[14px] font-semibold text-muted-foreground">
                cabezas
              </span>
            </div>
          )}

          <div className="grid gap-2 border-t border-border/60 pt-3">
            {info.ha != null && (
              <Dato icon={LandPlot} label="Superficie">
                {info.ha} ha
              </Dato>
            )}
            {info.uso === 'ganadero' && info.especie && (
              <Dato icon={Beef} label="Especie">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: especieColor[info.especie] }}
                  />
                  {especieLabel[info.especie]}
                </span>
              </Dato>
            )}
            {info.loteCodigo && (
              <Dato icon={Layers} label="Lote">
                {info.loteCodigo}
                {info.proposito && (
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    · {info.proposito}
                  </span>
                )}
              </Dato>
            )}
            {info.uso === 'agricola' && info.cultivo && (
              <Dato icon={Sprout} label="Cultivo">
                {info.cultivo}
              </Dato>
            )}
          </div>

          <div className="mt-auto">
            {info.uso === 'ganadero' && info.loteId ? (
              <button
                type="button"
                onClick={() => onVerLote(info.loteId!)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-field-soft py-2.5 text-[13px] font-semibold text-field-deep transition-colors hover:bg-field-soft/70"
              >
                Ver lote <ArrowRight className="size-4" />
              </button>
            ) : info.uso === 'vacio' ? (
              <p className="rounded-xl bg-secondary py-2.5 text-center text-[12.5px] font-medium text-faint">
                Sin hacienda ni cultivo
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col p-4">
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <MousePointer2 className="size-7 text-faint" />
            <p className="text-[13px] text-muted-foreground">
              Pasá el mouse sobre un potrero para ver su detalle.
            </p>
          </div>
          <div className="grid gap-2 border-t border-border/60 pt-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
              Referencias
            </span>
            {(Object.keys(USO) as Uso[]).map((u) => (
              <div key={u} className="flex items-center gap-2.5 text-[12.5px]">
                <span
                  className="size-3.5 rounded-[4px] border"
                  style={{
                    background: `${USO[u].color}33`,
                    borderColor: USO[u].color,
                  }}
                />
                <span className="text-ink">{USO[u].label}</span>
              </div>
            ))}
            <div className="mt-0.5 flex items-center gap-2.5 text-[12.5px]">
              <span
                className="h-[3px] w-3.5 rounded"
                style={{ background: campo.color.hex }}
              />
              <span className="text-muted-foreground">
                Borde = color del campo
              </span>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
