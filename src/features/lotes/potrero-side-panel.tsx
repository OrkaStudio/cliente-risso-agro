import { useState } from 'react'
import {
  ArrowRight,
  Beef,
  LandPlot,
  MousePointer2,
  Pencil,
  Sprout,
} from 'lucide-react'
import { FEATURE_MAP, type FeatureId } from '@/features/lotes/potrero-features'
import {
  usoToEstadoCiclo,
  type CampoVM,
  type Uso,
} from '@/features/campos/use-campo-mapa'
import type { Database } from '@/lib/supabase/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type EstadoCiclo = Database['public']['Enums']['estado_ciclo_potrero']

export type { Uso }

export const USO: Record<Uso, { label: string; color: string }> = {
  ganadero: { label: 'Ganadero', color: '#3f9d52' },
  agricola: { label: 'Agrícola', color: '#d6a032' },
  vacio: { label: 'Vacío', color: '#94a39a' },
}

export type PotreroInfo = {
  /** Identidad real del potrero (UUID). */
  potreroId: string
  /** Etiqueta visible = potrero.nombre (ej. "9", "1A"). */
  numero: string
  uso: Uso
  /** Estado de ciclo real, para preservar el estado fino al editar. */
  estadoCiclo: EstadoCiclo
  ha?: number | null
  cabezas?: number
  cultivo?: string | null
  features?: FeatureId[]
}

export type EditarPotrero = {
  onGuardar: (
    potreroId: string,
    v: {
      hectareas?: number | null
      cultivo?: string | null
      estadoCiclo: EstadoCiclo
    },
  ) => void
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

/* ===== Formulario de edición del potrero ===== */
function FormEditar({
  info,
  edit,
  onClose,
}: {
  info: PotreroInfo
  edit: EditarPotrero
  onClose: () => void
}) {
  const [estado, setEstado] = useState<Uso>(info.uso)
  const [hectareas, setHectareas] = useState(info.ha != null ? String(info.ha) : '')
  const [cultivo, setCultivo] = useState(info.cultivo ?? '')

  function guardar() {
    const ha = parseFloat(hectareas.replace(',', '.'))
    edit.onGuardar(info.potreroId, {
      hectareas: Number.isFinite(ha) ? ha : null,
      cultivo: estado === 'agricola' ? cultivo.trim() || null : null,
      estadoCiclo: usoToEstadoCiclo(estado, info.estadoCiclo),
    })
    onClose()
  }

  const estados: Uso[] = ['ganadero', 'agricola', 'vacio']

  return (
    <div className="flex flex-1 flex-col gap-3.5 p-4">
      <span className="font-heading text-[22px] font-bold tracking-[-0.02em] text-ink">
        Potrero {info.numero}
      </span>

      <div className="grid gap-2">
        <Label htmlFor="pot-ha">Hectáreas</Label>
        <Input
          id="pot-ha"
          value={hectareas}
          onChange={(e) => setHectareas(e.target.value)}
          inputMode="decimal"
          placeholder="55"
        />
      </div>

      <div className="grid gap-2">
        <Label>Estado</Label>
        <div className="flex gap-1.5">
          {estados.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setEstado(u)}
              className={cn(
                'flex-1 rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition-colors',
                estado === u
                  ? 'border-transparent text-white'
                  : 'border-border text-muted-foreground hover:bg-secondary',
              )}
              style={estado === u ? { background: USO[u].color } : undefined}
            >
              {USO[u].label}
            </button>
          ))}
        </div>
      </div>

      {estado === 'agricola' && (
        <div className="grid gap-2">
          <Label htmlFor="pot-cultivo">Cultivo</Label>
          <Input
            id="pot-cultivo"
            value={cultivo}
            onChange={(e) => setCultivo(e.target.value)}
            placeholder="Trigo, Soja…"
          />
        </div>
      )}

      <div className="mt-auto flex gap-2">
        <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
          Cancelar
        </Button>
        <Button size="sm" onClick={guardar} className="flex-1">
          Guardar
        </Button>
      </div>
    </div>
  )
}

export function PotreroSidePanel({
  info,
  campo,
  onVerPotrero,
  edit,
}: {
  info: PotreroInfo | null
  campo: CampoVM
  onVerPotrero?: (potreroId: string) => void
  edit?: EditarPotrero
}) {
  // Snapshot del potrero al abrir la edición → el hover no lo cambia mientras editás.
  const [editInfo, setEditInfo] = useState<PotreroInfo | null>(null)

  return (
    <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,19,0.05)] lg:h-auto lg:w-[300px]">
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

      {editInfo && edit ? (
        <FormEditar
          info={editInfo}
          edit={edit}
          onClose={() => setEditInfo(null)}
        />
      ) : info ? (
        <div className="flex flex-1 flex-col gap-3.5 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-heading text-[26px] font-bold tracking-[-0.02em] text-ink">
              Potrero {info.numero}
            </span>
            <UsoBadge uso={info.uso} />
          </div>

          {info.uso === 'ganadero' && (
            <div className="tnum text-[30px] font-bold leading-none text-ink">
              {info.cabezas ?? 0}{' '}
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
            {info.uso === 'agricola' && info.cultivo && (
              <Dato icon={Sprout} label="Cultivo">
                {info.cultivo}
              </Dato>
            )}
            {info.features && info.features.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {info.features.map((fid) => {
                  const F = FEATURE_MAP[fid]
                  return (
                    <span
                      key={fid}
                      className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-[11.5px] font-semibold text-ink"
                    >
                      <F.Icon className="size-3.5 text-field-deep" />
                      {F.label}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-auto grid gap-2">
            {onVerPotrero && (
              <button
                type="button"
                onClick={() => onVerPotrero(info.potreroId)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-field-soft py-2.5 text-[13px] font-semibold text-field-deep transition-colors hover:bg-field-soft/70"
              >
                Ver potrero <ArrowRight className="size-4" />
              </button>
            )}
            {edit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditInfo(info)}
              >
                <Pencil className="size-4" />
                Editar potrero
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col p-4">
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <MousePointer2 className="size-7 text-faint" />
            <p className="text-[13px] text-muted-foreground">
              Pasá el mouse o tocá un potrero para ver y editar su detalle.
            </p>
          </div>
          <div className="grid gap-2 border-t border-border/60 pt-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
              Referencias · color = campo
            </span>
            <div className="flex items-center gap-2.5 text-[12.5px]">
              <span
                className="size-3.5 rounded-[4px] border"
                style={{
                  background: `${campo.color.hex}88`,
                  borderColor: campo.color.hex,
                }}
              />
              <span className="text-ink">Ganadero</span>
              <span className="ml-auto text-faint">sólido</span>
            </div>
            <div className="flex items-center gap-2.5 text-[12.5px]">
              <span
                className="size-3.5 rounded-[4px] border"
                style={{
                  background: `${campo.color.hex}22`,
                  backgroundImage: `repeating-linear-gradient(45deg, ${campo.color.hex} 0 2px, transparent 2px 5px)`,
                  borderColor: campo.color.hex,
                }}
              />
              <span className="text-ink">Agrícola</span>
              <span className="ml-auto text-faint">surcos</span>
            </div>
            <div className="flex items-center gap-2.5 text-[12.5px]">
              <span
                className="size-3.5 rounded-[4px]"
                style={{
                  background: `${campo.color.hex}14`,
                  border: `1.5px dashed ${campo.color.hex}99`,
                }}
              />
              <span className="text-ink">Vacío</span>
              <span className="ml-auto text-faint">tenue</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
