// Exporta el componente + helpers (USO/tipos) del mismo módulo (patrón del repo).
/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState, type CSSProperties } from 'react'
import {
  ArrowRight,
  ArrowRightLeft,
  Beef,
  Layers,
  LandPlot,
  MousePointer2,
  Pencil,
  Sprout,
} from 'lucide-react'
import { FEATURE_MAP, type FeatureId } from '@/features/lotes/potrero-features'
import { CargaMasivaDialog } from '@/features/hacienda/carga-masiva-dialog'
import { useTropasDelPotrero } from '@/features/hacienda/hooks'
import {
  coloresPorCategoria,
  categoriaNombre,
  propositoLabel,
} from '@/features/hacienda/labels'
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
type Categoria = Database['public']['Enums']['categoria_animal']

export type { Uso }

/**
 * Colores semánticos por actividad (canal principal de diferenciación en el
 * mapa). Fuente única: la usan el mapa (relleno y pill), el mapa de edición y el
 * glosario, para que todo diga lo mismo.
 */
export const USO: Record<Uso, { label: string; color: string }> = {
  ganadero: { label: 'Ganadero', color: '#3f9d52' }, // verde
  agricola: { label: 'Agrícola', color: '#c6871a' }, // ámbar
  vacio: { label: 'Vacío', color: '#7d8a93' }, // gris
}

/**
 * Estilo del swatch del glosario — replica el relleno del mapa: base con el
 * COLOR DEL CAMPO (identidad) y la actividad marcada con textura: ganadero con
 * PUNTOS (rebaño visto desde arriba), agrícola con surcos ÁMBAR, vacío HUECO
 * (casi sin relleno + punteado).
 */
export function fillStyleUso(hex: string, uso: Uso): CSSProperties {
  if (uso === 'ganadero')
    return {
      background: `${hex}94`,
      backgroundImage: `radial-gradient(circle, #0c1c14 1.1px, transparent 1.6px)`,
      backgroundSize: '6px 6px',
      border: `1.5px solid ${hex}`,
    }
  if (uso === 'agricola')
    return {
      background: `${hex}88`,
      backgroundImage: `repeating-linear-gradient(45deg, ${USO.agricola.color} 0 3px, transparent 3px 7px)`,
      border: `1.5px solid ${hex}`,
    }
  return { background: `${hex}0f`, border: `1.5px dashed ${hex}aa` }
}

/**
 * Glosario para poner DEBAJO del mapa (siempre a la vista). El COLOR identifica
 * al campo; la TEXTURA del relleno dice la actividad del potrero.
 */
export function ReferenciasPotrero({ campo }: { campo: CampoVM }) {
  const hex = campo.color.hex
  const items: { uso: Uso; sub: string }[] = [
    { uso: 'ganadero', sub: 'puntos' },
    { uso: 'agricola', sub: 'surcos' },
    { uso: 'vacio', sub: 'hueco' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_1px_2px_rgba(16,24,19,0.05)]">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
          Referencias
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11.5px] font-semibold"
          style={{ color: hex }}
        >
          <span className="size-2.5 rounded-full" style={{ background: hex }} />
          color = {campo.nombre}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
        {items.map(({ uso, sub }) => (
          <span key={uso} className="inline-flex items-center gap-2 text-[13px]">
            <span
              className="size-5 shrink-0 rounded-[6px]"
              style={fillStyleUso(hex, uso)}
            />
            <span className="font-semibold text-ink">{USO[uso].label}</span>
            <span className="text-[12px] text-faint">· {sub}</span>
          </span>
        ))}
      </div>
    </div>
  )
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

/** Datos del modo mover que el panel necesita para GUIAR el paso a paso. */
export type MoverPanel = {
  origenPotreroId: string | null
  origenLabel: string
  origenCabezas?: number
  onCancelar: () => void
}

/** Panel-guía mientras se elige el destino: muestra el origen fijo, qué
 *  potrero está bajo el mouse como candidato y cómo confirmar o cancelar. */
function GuiaMover({ mover, info }: { mover: MoverPanel; info: PotreroInfo | null }) {
  const esOrigen = info?.potreroId === mover.origenPotreroId
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="size-4 shrink-0 text-field-deep" />
        <span className="font-heading text-[17px] font-bold tracking-[-0.01em] text-ink">
          Moviendo animales
        </span>
      </div>

      <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
        <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
          Desde
        </span>
        <span className="text-[13.5px] font-semibold text-ink">
          Potrero {mover.origenLabel}
        </span>
        {mover.origenCabezas != null && (
          <span className="tnum text-[13px] text-muted-foreground">
            {' '}
            · {mover.origenCabezas} cab
          </span>
        )}
      </div>

      {info && !esOrigen ? (
        <div className="rounded-xl border-2 border-dashed border-field/60 bg-field-soft/50 px-3 py-2.5">
          <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-field-deep">
            Destino
          </span>
          <span className="text-[13.5px] font-semibold text-ink">
            Potrero {info.numero}
          </span>
          <span className="tnum text-[13px] text-muted-foreground">
            {' '}
            · {info.uso === 'ganadero' ? `${info.cabezas ?? 0} cab` : USO[info.uso].label}
          </span>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Tocalo para confirmarlo como destino.
          </p>
        </div>
      ) : esOrigen ? (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Ese es el potrero de origen — elegí otro como destino.
        </p>
      ) : (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Ahora tocá en el mapa el potrero adonde van los animales. ¿Van a otro
          campo? Cambiá de campo con los botones de arriba.
        </p>
      )}

      <p className="text-[12px] leading-snug text-faint">
        Un potrero vacío también sirve como destino.
      </p>

      <div className="mt-auto">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={mover.onCancelar}
        >
          Cancelar movimiento
        </Button>
      </div>
    </div>
  )
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
  onMoverDesde,
  mover,
  edit,
}: {
  info: PotreroInfo | null
  campo: CampoVM
  onVerPotrero?: (potreroId: string) => void
  /** Arranca el modo mover con este potrero como ORIGEN (el destino se toca en el mapa). */
  onMoverDesde?: (info: PotreroInfo) => void
  /** Con el modo mover activo, el panel se vuelve la guía del paso a paso. */
  mover?: MoverPanel
  edit?: EditarPotrero
}) {
  // Snapshot del potrero al abrir edición/carga → el hover no lo cambia mientras
  // el formulario está abierto.
  const [editInfo, setEditInfo] = useState<PotreroInfo | null>(null)
  const [cargaInfo, setCargaInfo] = useState<PotreroInfo | null>(null)
  const [verTropas, setVerTropas] = useState(false)
  // Tropas del potrero activo (cacheado por potrero; el hover no re-consulta).
  const tropas = useTropasDelPotrero(info?.potreroId ?? null)

  // Composición del potrero = suma de las categorías de TODAS sus tropas. Es lo
  // que el productor quiere leer de un vistazo ("cuántos terneros, vacas") sin
  // entrar al potrero. Las tropas quedan como detalle secundario (colapsable).
  const composicion = useMemo(() => {
    const acc = new Map<Categoria, number>()
    for (const t of tropas.data ?? [])
      for (const c of t.composicion)
        acc.set(c.categoria, (acc.get(c.categoria) ?? 0) + c.cabezas)
    return [...acc.entries()]
      .map(([categoria, cabezas]) => ({ categoria, cabezas }))
      .sort((a, b) => b.cabezas - a.cabezas)
  }, [tropas.data])
  // Colores por presencia → mismo criterio que el gráfico del detalle.
  const composColores = useMemo(
    () => coloresPorCategoria(composicion.map((c) => c.categoria)),
    [composicion],
  )

  return (
    <>
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

      {mover ? (
        <GuiaMover mover={mover} info={info} />
      ) : editInfo && edit ? (
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

          {/* Potrero ganadero vacío: decir qué hacer, no dejar el 0 mudo. */}
          {info.uso === 'ganadero' && (info.cabezas ?? 0) === 0 && (
            <p className="text-[12.5px] leading-snug text-muted-foreground">
              Este potrero no tiene animales todavía. Sumalos con{' '}
              <b>“Cargar animales”</b>, o movelos desde otro potrero con{' '}
              <b>“Mover animales”</b>.
            </p>
          )}

          {/* Composición por categoría (suma de todas las tropas): lo que el
              productor necesita sin entrar al potrero. Punto de color = misma
              paleta que Analítica; el número es el protagonista. */}
          {info.uso === 'ganadero' && composicion.length > 0 && (
            <div className="grid gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
                Composición
              </span>
              <div className="grid gap-1.5 rounded-xl bg-secondary/60 px-3 py-2.5">
                {composicion.map((c) => (
                  <div
                    key={c.categoria}
                    className="flex items-center gap-2 text-[13px]"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: composColores[c.categoria] }}
                    />
                    <span className="min-w-0 truncate text-ink">
                      {categoriaNombre(c.categoria, c.cabezas)}
                    </span>
                    <span className="tnum ml-auto shrink-0 font-semibold text-ink">
                      {c.cabezas}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tropas del potrero: detalle secundario para planificar movimientos.
              Colapsado por defecto — la composición ya responde el "qué hay". */}
          {info.uso === 'ganadero' && (tropas.data?.length ?? 0) > 0 && (
            <div className="grid gap-1.5">
              <button
                type="button"
                onClick={() => setVerTropas((v) => !v)}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-field-deep transition-colors hover:text-field"
              >
                <Layers className="size-3.5" />
                {verTropas
                  ? 'Ocultar tropas'
                  : `Ver ${tropas.data!.length} ${tropas.data!.length === 1 ? 'tropa' : 'tropas'}`}
              </button>
              {verTropas && (
                <div className="grid gap-1.5 rounded-xl bg-secondary/60 px-3 py-2.5">
                  {tropas.data!.map((t) => (
                    <div
                      key={t.loteId ?? 'sueltos'}
                      className="flex items-baseline justify-between gap-2 text-[12.5px]"
                    >
                      <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-ink">
                        <Layers className="size-3.5 shrink-0 text-field-deep" />
                        <span className="truncate">
                          {t.nombre ?? 'Sueltos (sin tropa)'}
                        </span>
                        {t.proposito && (
                          <span className="shrink-0 rounded-full bg-card px-1.5 py-[1px] text-[10px] font-semibold text-muted-foreground">
                            {propositoLabel[t.proposito as keyof typeof propositoLabel] ??
                              t.proposito}
                          </span>
                        )}
                      </span>
                      <span className="tnum shrink-0 font-semibold text-muted-foreground">
                        {t.cabezas} cab
                      </span>
                    </div>
                  ))}
                </div>
              )}
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
            {/* Carga de animales / lote directo a ESTE potrero (ya elegido en el
                mapa) → el diálogo abre con el destino fijo. */}
            <button
              type="button"
              onClick={() => setCargaInfo(info)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-field py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(16,30,20,0.18)] transition-colors hover:bg-field-deep"
            >
              <Layers className="size-4" />
              Cargar animales
            </button>
            {/* Mover: el origen queda fijo acá; el DESTINO se toca en el mapa. */}
            {onMoverDesde && info.uso === 'ganadero' && (info.cabezas ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => onMoverDesde(info)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-field-soft py-2.5 text-[13px] font-semibold text-field-deep transition-colors hover:bg-field-soft/70"
              >
                <ArrowRightLeft className="size-4" />
                Mover animales
              </button>
            )}
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
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <MousePointer2 className="size-7 text-faint" />
          <p className="text-[13px] text-muted-foreground">
            Tocá un potrero del mapa para ver su detalle.
          </p>
          <p className="text-[12px] leading-snug text-faint">
            Desde acá cargás animales, los movés entre potreros y editás la
            superficie o el uso de cada uno.
          </p>
        </div>
      )}
    </aside>

    {/* Carga de animales con el potrero YA fijo (snapshot: el hover no lo mueve).
        El diálogo se muestra en su modo de un solo destino. */}
    {cargaInfo && (
      <CargaMasivaDialog
        open
        onOpenChange={(v) => {
          if (!v) setCargaInfo(null)
        }}
        prefill={{
          campoId: campo.id,
          potreroId: cargaInfo.potreroId,
          campoNombre: campo.nombre,
          potreroNombre: cargaInfo.numero,
        }}
      />
    )}
    </>
  )
}
