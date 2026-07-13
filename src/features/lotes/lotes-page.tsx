import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  Beef,
  LandPlot,
  LayoutGrid,
  Layers,
  Map as MapIcon,
} from 'lucide-react'
import {
  useCamposConPotreros,
  useCrearInfraestructura,
  useActualizarInfraestructura,
  useBorrarInfraestructura,
  useInfraestructura,
  useActualizarPotreroMapa,
  useCrearPotrero,
  useSetCampoContorno,
  useSetPotreroPoligono,
} from '@/features/campos/hooks'
import {
  colorDeCampo,
  useCampoMapa,
  type CampoVM,
} from '@/features/campos/use-campo-mapa'
import type { CampoConPotreros, LatLng } from '@/features/campos/api'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { CampoFormDialog } from '@/features/campos/campos-dialogs'
import { PageHeader, Stat } from '@/components/page-header'
import { PotreroCard } from '@/features/potrero/potrero-card'
import { MapErrorBoundary } from '@/components/map-error-boundary'
// El mapa satelital (Leaflet + Geoman) se carga lazy y aislado: si falla —al
// cargar su chunk o al renderizar— cae SOLO su recuadro, no toda la app.
// Ver lección leaflet-geoman-prod-build.
const CampoMapaReal = lazy(() =>
  import('@/features/lotes/campo-mapa-real').then((m) => ({
    default: m.CampoMapaReal,
  })),
)
import { CampoVista } from '@/features/lotes/campo-vista'
import { CatastroDialog } from '@/features/lotes/catastro-dialog'
import {
  MoverAnimalesDialog,
  type PuntoMovimiento,
} from '@/features/hacienda/mover-animales-dialog'
import { cn } from '@/lib/utils'

type Vista = 'mapa' | 'lista'

/* ===== KPI (barra instrumental, igual que Inicio/Campos) ===== */
function Kpi({
  label,
  icon: Icon,
  iconColor,
  value,
  unit,
  detail,
}: {
  label: string
  icon: typeof Beef
  iconColor: string
  value: string
  unit?: string
  detail?: string
}) {
  return (
    <div className="flex min-h-[92px] flex-1 flex-col items-center justify-center px-[22px] py-[18px] text-center">
      <div className="flex items-center justify-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        <Icon className="size-4" style={{ color: iconColor }} />
        {label}
      </div>
      <div className="mt-2 flex items-baseline justify-center gap-1">
        <span className="tnum text-[26px] font-bold leading-none text-ink">
          {value}
        </span>
        {unit && <span className="text-base text-muted-foreground">{unit}</span>}
      </div>
      {detail && (
        <div className="mt-[7px] text-xs font-medium text-muted-foreground">
          {detail}
        </div>
      )}
    </div>
  )
}

/** Construye el CampoVM (identidad real + color) para los componentes del mapa. */
function vmDe(c: CampoConPotreros, index: number): CampoVM {
  return {
    id: c.id,
    nombre: c.nombre,
    tipo: c.tipo,
    hectareas: c.hectareas,
    color: colorDeCampo(index, c.nombre),
  }
}

/* ===== Vista LISTA: un bloque por campo con tarjetas de potrero ===== */
function CampoBloque({ campo, index }: { campo: CampoConPotreros; index: number }) {
  const color = colorDeCampo(index, campo.nombre)
  return (
    <section className="rounded-[14px] border border-border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex size-9 items-center justify-center rounded-xl font-heading text-[16px] font-bold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
            style={{ background: color.hex }}
            title={`Color ${color.nombre}`}
          >
            {color.letra}
          </span>
          <h3 className="font-heading text-[26px] font-bold tracking-[-0.02em] text-ink">
            {campo.nombre}
          </h3>
        </div>
        <span className="tnum text-[13px] text-faint">
          {campo.potreros.length} potreros · {campo.totalCabezas} cab ·{' '}
          {campo.totalHa} ha
        </span>
      </div>
      {campo.potreros.length === 0 ? (
        <p className="py-2 text-[13px] text-faint">
          Este campo todavía no tiene potreros.
        </p>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {campo.potreros.map((p) => (
            <PotreroCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </section>
  )
}

/* ===== Vista MAPA: selector de campo + vista contenida / edición satelital ===== */
function MapaVista({ campos }: { campos: CampoConPotreros[] }) {
  const navigate = useNavigate()
  const empresa = useEmpresa()
  const empresaId = empresa.data?.empresa_id ?? ''

  const vms = campos.map(vmDe)
  const [campoId, setCampoId] = useState(vms[0]?.id ?? '')
  const [ver, setVer] = useState(0)
  const vm = vms.find((c) => c.id === campoId) ?? vms[0]
  const campoData = campos.find((c) => c.id === vm?.id)

  // Datos reales del campo seleccionado (geometría + potreros + infra).
  const mapa = useCampoMapa(campoId)
  const infra = useInfraestructura(campoId)

  // Mutaciones (todas contra Supabase).
  const guardarPotrero = useActualizarPotreroMapa(campoId)
  const crearInfra = useCrearInfraestructura(campoId)
  const actualizarInfra = useActualizarInfraestructura(campoId)
  const borrarInfra = useBorrarInfraestructura(campoId)
  const setContorno = useSetCampoContorno(campoId)
  const crearPotrero = useCrearPotrero(campoId)
  const setPoligono = useSetPotreroPoligono(campoId)

  // Modo mover: vive ACÁ (no en CampoVista) para sobrevivir al cambio de
  // campo por las pills → el destino puede ser un potrero de OTRO campo.
  const [moverOrigen, setMoverOrigen] = useState<PuntoMovimiento | null>(null)
  const [moverDestino, setMoverDestino] = useState<PuntoMovimiento | null>(null)

  // Modo edición (satelital). Se decide una vez por campo, al cargar su
  // geometría: arranca en edición si todavía no está delimitado. No se deriva
  // de la geometría en cada render (evita saltar al traer el catastro).
  const [editar, setEditar] = useState(false)
  const decidedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!campoId || mapa.isLoading) return
    if (decidedRef.current === campoId) return
    decidedRef.current = campoId
    const hasGeo =
      !!mapa.data?.contorno ||
      (mapa.data?.potreros.some((p) => p.poligono) ?? false)
    setEditar(!hasGeo)
  }, [campoId, mapa.isLoading, mapa.data])

  if (!vm) return null

  const contorno = mapa.data?.contorno ?? null
  const potreros = mapa.data?.potreros ?? []
  const infraRows = infra.data ?? []
  const cabezas = campoData?.totalCabezas ?? 0
  const ha = campoData?.totalHa ?? 0

  return (
    <div className="flex flex-col gap-4">
      {/* Selector de campo */}
      <div className="flex flex-wrap gap-2">
        {vms.map((c) => {
          const activo = c.id === vm.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCampoId(c.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                activo
                  ? 'border-transparent text-white'
                  : 'border-border text-muted-foreground hover:bg-secondary',
              )}
              style={activo ? { background: c.color.hex } : undefined}
            >
              <span
                className="size-2.5 rounded-full"
                style={{
                  background: activo ? 'rgba(255,255,255,0.9)' : c.color.hex,
                }}
              />
              {c.nombre}
            </button>
          )
        })}
      </div>

      <section className="rounded-[14px] border border-border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)]">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex size-9 items-center justify-center rounded-xl font-heading text-[16px] font-bold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
                style={{ background: vm.color.hex }}
                title={`Color ${vm.color.nombre}`}
              >
                {vm.color.letra}
              </span>
              <h3 className="font-heading text-[26px] font-bold tracking-[-0.02em] text-ink">
                {vm.nombre}
              </h3>
            </div>
            <VistaCampoToggle editar={editar} setEditar={setEditar} />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Link
              to={`/campos/${vm.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[13px] font-semibold text-field-deep transition-colors hover:bg-field-soft"
            >
              Resumen del campo
              <ArrowUpRight className="size-4" />
            </Link>
            <span className="tnum text-[13px] text-faint">
              {potreros.length} potreros · {cabezas} cab · {ha} ha
            </span>
          </div>
        </div>

        {mapa.isLoading ? (
          <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground lg:h-[500px]">
            Cargando el campo…
          </div>
        ) : editar ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <CatastroDialog
                onAplicar={(anillo: LatLng[]) => setContorno.mutate(anillo)}
                onAplicado={() => setVer((v) => v + 1)}
              />
              <span className="text-[12.5px] text-muted-foreground">
                Traé el contorno del catastro y dibujá los potreros adentro.
              </span>
            </div>
            <MapErrorBoundary>
              <Suspense
                fallback={
                  <div className="flex min-h-[360px] w-full items-center justify-center rounded-2xl border border-border bg-secondary/40 text-[12.5px] text-muted-foreground">
                    Cargando mapa…
                  </div>
                }
              >
                <CampoMapaReal
                  key={`${vm.id}-${ver}`}
                  campo={vm}
                  contorno={contorno}
                  potreros={potreros}
                  onDibujarPotrero={async (nombre, poligono) => {
                    const existing = potreros.find((p) => p.nombre === nombre)
                    const id = existing
                      ? existing.id
                      : await crearPotrero.mutateAsync({
                          empresaId,
                          campoId: vm.id,
                          nombre,
                          estadoCiclo: 'descanso',
                        })
                    await setPoligono.mutateAsync({ potreroId: id, poligono })
                    return id
                  }}
                  onSetPoligono={(potreroId, poligono) =>
                    setPoligono.mutate({ potreroId, poligono })
                  }
                  onVerPotrero={(id) => navigate(`/potrero/${id}`)}
                />
              </Suspense>
            </MapErrorBoundary>
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              Usá la herramienta de polígono (arriba a la izquierda) para{' '}
              <b>dibujar cada potrero</b> y ponele su número. Cuando termines,
              volvé a <b>Vista por potrero</b>.
            </p>
          </>
        ) : (
          <CampoVista
            key={vm.id}
            campo={vm}
            contorno={contorno}
            potreros={potreros}
            infra={infraRows}
            onMoverDesde={(info) =>
              setMoverOrigen({
                campoId: vm.id,
                campoNombre: vm.nombre,
                campoColor: vm.color.hex,
                potreroId: info.potreroId,
                potreroNombre: info.numero,
                cabezas: info.cabezas,
              })
            }
            mover={
              moverOrigen
                ? {
                    activo: !moverDestino,
                    origenPotreroId:
                      moverOrigen.campoId === vm.id ? moverOrigen.potreroId : null,
                    origenLabel: `${moverOrigen.potreroNombre} · ${moverOrigen.campoNombre}`,
                    origenCabezas: moverOrigen.cabezas,
                    onElegirDestino: (potreroId, nombre) =>
                      setMoverDestino({
                        campoId: vm.id,
                        campoNombre: vm.nombre,
                        campoColor: vm.color.hex,
                        potreroId,
                        potreroNombre: nombre,
                      }),
                    onCancelar: () => setMoverOrigen(null),
                  }
                : undefined
            }
            onGuardarPotrero={(potreroId, v) =>
              guardarPotrero.mutate({
                id: potreroId,
                estadoCiclo: v.estadoCiclo,
                hectareas: v.hectareas,
                cultivo: v.cultivo,
              })
            }
            onCrearInfra={async (input) => {
              const row = await crearInfra.mutateAsync({
                empresa_id: empresaId,
                campo_id: vm.id,
                tipo: input.tipo,
                lat: input.lat,
                lng: input.lng,
                radio_m: input.radio_m ?? null,
                angulo_deg: input.angulo_deg ?? null,
              })
              return { id: row.id }
            }}
            onActualizarInfra={(id, patch) =>
              actualizarInfra.mutate({ id, patch })
            }
            onBorrarInfra={(id) => borrarInfra.mutate(id)}
            onVerPotrero={(id) => navigate(`/potrero/${id}`)}
          />
        )}
      </section>

      {/* Confirmación del movimiento (origen y destino ya tocados en el mapa) */}
      {moverOrigen && moverDestino && (
        <MoverAnimalesDialog
          empresaId={empresaId}
          origen={moverOrigen}
          destino={moverDestino}
          onOpenChange={(v) => {
            if (!v) {
              setMoverOrigen(null)
              setMoverDestino(null)
            }
          }}
        />
      )}
    </div>
  )
}

/* Toggle de vista del campo: plano por potrero ↔ satelital (editar) */
function VistaCampoToggle({
  editar,
  setEditar,
}: {
  editar: boolean
  setEditar: (v: boolean) => void
}) {
  const items: [boolean, string, typeof MapIcon][] = [
    [false, 'Vista por potrero', LayoutGrid],
    [true, 'Vista satelital', MapIcon],
  ]
  return (
    <div className="inline-flex rounded-xl border border-border bg-card p-1">
      {items.map(([val, label, Icon]) => (
        <button
          key={label}
          type="button"
          onClick={() => setEditar(val)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors',
            editar === val
              ? 'bg-field-soft text-field-deep'
              : 'text-muted-foreground hover:text-ink',
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

function VistaToggle({
  vista,
  setVista,
}: {
  vista: Vista
  setVista: (v: Vista) => void
}) {
  const items: [Vista, string, typeof MapIcon][] = [
    ['mapa', 'Mapa', MapIcon],
    ['lista', 'Lista', LayoutGrid],
  ]
  return (
    <div className="inline-flex rounded-xl border border-border bg-card p-1">
      {items.map(([v, label, Icon]) => (
        <button
          key={v}
          type="button"
          onClick={() => setVista(v)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors',
            vista === v
              ? 'bg-field-soft text-field-deep'
              : 'text-muted-foreground hover:text-ink',
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

export function LotesPage() {
  const { data: campos = [], isLoading } = useCamposConPotreros()
  const empresa = useEmpresa()
  const empresaId = empresa.data?.empresa_id ?? ''
  const [vista, setVista] = useState<Vista>('mapa')

  const totalPotreros = campos.reduce((s, c) => s + c.potreros.length, 0)
  const totalCabezas = campos.reduce((s, c) => s + c.totalCabezas, 0)
  const totalHa = campos.reduce((s, c) => s + c.totalHa, 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <PageHeader
        title="Campos"
        meta={
          <>
            <Stat>{campos.length}</Stat> campos · <Stat>{totalPotreros}</Stat>{' '}
            potreros · superficie y uso de cada potrero
          </>
        }
        action={
          <>
            <VistaToggle vista={vista} setVista={setVista} />
            <CampoFormDialog empresaId={empresaId} triggerLabel="+ Nuevo campo" />
          </>
        }
      />

      {/* KPIs */}
      <div className="flex flex-wrap overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)] [&>*+*]:border-l [&>*+*]:border-border">
        <Kpi
          label="Campos"
          icon={MapIcon}
          iconColor="var(--field)"
          value={String(campos.length)}
        />
        <Kpi
          label="Potreros"
          icon={Layers}
          iconColor="var(--field)"
          value={String(totalPotreros)}
        />
        <Kpi
          label="Hacienda total"
          icon={Beef}
          iconColor="var(--tierra)"
          value={String(totalCabezas)}
          unit="cab"
        />
        <Kpi
          label="Superficie"
          icon={LandPlot}
          iconColor="var(--field)"
          value={String(totalHa)}
          unit="ha"
        />
      </div>

      {isLoading ? (
        <div className="rounded-[14px] border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Cargando campos…
        </div>
      ) : campos.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Todavía no hay campos cargados.
        </div>
      ) : vista === 'mapa' ? (
        <MapaVista campos={campos} />
      ) : (
        campos.map((c, i) => <CampoBloque key={c.id} campo={c} index={i} />)
      )}
    </div>
  )
}
