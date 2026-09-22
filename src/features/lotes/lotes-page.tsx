import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowUpRight,
  Beef,
  LandPlot,
  LayoutGrid,
  Layers,
  Map as MapIcon,
  PencilRuler,
  MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import type { CampoConPotreros, LatLng, PotreroMapa } from '@/features/campos/api'
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
function vmDe(c: CampoConPotreros): CampoVM {
  return {
    id: c.id,
    nombre: c.nombre,
    tipo: c.tipo,
    hectareas: c.hectareas,
    color: colorDeCampo(c.color_idx),
    centro: c.ubicacion.lat != null && c.ubicacion.lon != null ? { lat: c.ubicacion.lat, lon: c.ubicacion.lon } : null,
  }
}

/**
 * Aviso de potreros sin dibujar. Oficina es donde se traza el polígono, así
 * que el aviso tiene que estar acá y no solo en el celular: en Modo Campo el
 * productor descubre que le falta el croquis JUSTO cuando ya está en el campo
 * y no lo puede resolver. Acá sí puede. Con eso el ciclo cierra por los dos lados.
 */
function SinDibujarAviso({ campo }: { campo: CampoConPotreros }) {
  const sinDibujo = campo.sinDibujar
  if (sinDibujo.length === 0) return null
  const todos = sinDibujo.length === campo.potreros.length

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 dark:border-amber-500/40 dark:bg-amber-950/30">
      <PencilRuler className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
      <div className="min-w-0 flex-1 text-[13px] leading-snug text-ink">
        <span className="font-semibold">
          {todos
            ? 'Ninguno de estos potreros está dibujado en el mapa.'
            : `${sinDibujo.length} ${sinDibujo.length === 1 ? 'potrero sin dibujar' : 'potreros sin dibujar'}: ${sinDibujo.join(", ")}.`}
        </span>{' '}
        En el celular, la recorrida usa el croquis para ubicarse en el campo —
        sin dibujo, esos potreros se cargan por lista. Se dibujan una sola vez
        desde la vista <span className="font-semibold">Mapa</span>.
      </div>
    </div>
  )
}

/* ===== Vista LISTA: un bloque por campo con tarjetas de potrero ===== */
function CampoBloque({ campo }: { campo: CampoConPotreros }) {
  const color = colorDeCampo(campo.color_idx)
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
        <>
          <SinDibujarAviso campo={campo} />
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {campo.potreros.map((p) => (
              <PotreroCard key={p.id} p={p} />
            ))}
          </div>
        </>
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
  // ?campo=<id>: el onboarding manda acá con el campo recién creado.
  const [params] = useSearchParams()
  const pedido = params.get('campo')
  const [campoId, setCampoId] = useState(
    (pedido && vms.some((c) => c.id === pedido) ? pedido : vms[0]?.id) ?? '',
  )
  // Si el pedido cambia con la página ya montada (el asistente lleva a otro
  // campo desde la misma sección), se obedece — ajuste de estado durante el
  // render (patrón "state from props"), no un setState en un effect.
  const [pedidoVisto, setPedidoVisto] = useState(pedido)
  if (pedido !== pedidoVisto) {
    setPedidoVisto(pedido)
    if (pedido && vms.some((c) => c.id === pedido)) setCampoId(pedido)
  }
  const [ver, setVer] = useState(0)
  const [marcandoContorno, setMarcandoContorno] = useState(false)
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
  // Los potreros salen de la consulta del mapa (que trae los polígonos), pero
  // mientras esa consulta no respondió —o falló— se usan los de la lista de
  // campos, que ya están cargados: los mismos potreros, sin polígono. Antes
  // el encabezado decía "0 potreros · 27 cab" en ese hueco, y los potreros
  // cargados en el onboarding (todavía sin dibujar) no aparecían para poder
  // asignarles un dibujo. Los tres números del encabezado vienen ahora de
  // la misma fuente, así que no pueden contradecirse.
  const potreros: PotreroMapa[] =
    mapa.data?.potreros ??
    (campoData?.potreros ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      poligono: null,
      estadoCiclo: p.estadoCiclo,
      hectareas: p.hectareas,
      cultivo: p.cultivo,
      cabezas: p.cabezas,
    }))
  const infraRows = infra.data ?? []
  const cabezas = campoData?.totalCabezas ?? 0
  const ha = campoData?.totalHa ?? 0

  return (
    <div className="flex flex-col gap-4">
      {mapa.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-sm"
        >
          <span>No se pudo cargar el mapa de este campo. Los potreros se muestran sin sus dibujos.</span>
          <button
            type="button"
            className="rounded-md border border-input px-2.5 py-1 text-xs font-medium hover:border-ring"
            onClick={() => mapa.refetch()}
          >
            Reintentar
          </button>
        </div>
      )}
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
              {(campoData?.potreros.length ?? potreros.length)} potreros · {cabezas} cab · {ha} ha
            </span>
          </div>
        </div>

        {mapa.isLoading ? (
          <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground lg:h-[500px]">
            Cargando el campo…
          </div>
        ) : editar ? (
          <>
            <div
              data-guia="campos-catastro"
              className="mb-3 flex flex-wrap items-center gap-2.5"
            >
              {/* El catastro automático es de Buenos Aires (ARBA). En otra
                  provincia, o sin provincia cargada, el contorno se marca a
                  mano sobre el satélite — no se promete lo que no hay. */}
              {campoData?.ubicacion.provincia === 'Buenos Aires' || !campoData?.ubicacion.provincia ? (
                <>
                  <CatastroDialog
                    onAplicar={(anillo: LatLng[]) => setContorno.mutate(anillo)}
                    onAplicado={() => setVer((v) => v + 1)}
                  />
                  <span className="text-[12.5px] text-muted-foreground">
                    {campoData?.ubicacion.provincia
                      ? 'Con los tres números de la boleta de ARBA, el contorno se arma solo. Después dibujá los potreros adentro.'
                      : 'Traé el contorno del catastro y dibujá los potreros adentro.'}
                  </span>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant={marcandoContorno ? 'default' : 'outline'}
                    size="sm"
                    data-guia={marcandoContorno ? 'campos-marcando' : 'campos-marcar'}
                    onClick={() => setMarcandoContorno((v) => !v)}
                  >
                    <MapPin className="size-4" />
                    {marcandoContorno ? 'Cancelar' : contorno ? 'Marcar el contorno de nuevo' : 'Marcar el contorno'}
                  </Button>
                  <span className="text-[12.5px] text-muted-foreground">
                    {marcandoContorno
                      ? 'Hacé clic en las esquinas del campo y cerrá en la primera.'
                      : `En ${campoData.ubicacion.provincia} el contorno se marca sobre el satélite. Después dibujá los potreros adentro.`}
                  </span>
                </>
              )}
            </div>
            {/* Ancla del asistente: SOLO el mapa (no todo MapaVista — un ancla
                a pantalla completa no explica nada). */}
            <div data-guia="campos-mapa">
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
                  onDibujarPotrero={async (nombre, poligono, haMedidas) => {
                    const existing = potreros.find((p) => p.nombre === nombre)
                    const id = existing
                      ? existing.id
                      : (
                          await crearPotrero.mutateAsync({
                            empresaId,
                            campoId: vm.id,
                            nombre,
                            estadoCiclo: 'descanso',
                            hectareas: haMedidas > 0 ? haMedidas : null,
                          })
                        ).id
                    await setPoligono.mutateAsync({ potreroId: id, poligono })
                    // Potrero que ya existía (onboarding, con hectáreas de
                    // memoria): el dibujo manda, las hectáreas pasan a ser las
                    // medidas.
                    if (existing && haMedidas > 0) {
                      await guardarPotrero.mutateAsync({
                        id,
                        estadoCiclo: existing.estadoCiclo,
                        hectareas: haMedidas,
                        cultivo: existing.cultivo,
                      })
                    }
                    return id
                  }}
                  onSetPoligono={(potreroId, poligono) =>
                    setPoligono.mutate({ potreroId, poligono })
                  }
                  onSetContorno={(anillo) => {
                    setContorno.mutate(anillo)
                    setVer((v) => v + 1)
                  }}
                  marcarContorno={marcandoContorno}
                  onFinMarcarContorno={() => setMarcandoContorno(false)}
                  onVerPotrero={(id) => navigate(`/potrero/${id}`)}
                />
              </Suspense>
            </MapErrorBoundary>
            </div>
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              Usá la herramienta de polígono (arriba a la izquierda) para{' '}
              <b>dibujar cada potrero</b> y ponele su número. Cuando termines,
              volvé a <b>Vista por potrero</b>.
            </p>
          </>
        ) : (
          <div data-guia="campos-mapa">
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
          </div>
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
          data-guia={val ? 'campos-satelital' : undefined}
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
            <div data-guia="campos-vista">
              <VistaToggle vista={vista} setVista={setVista} />
            </div>
            <div data-guia="campos-acciones">
              <CampoFormDialog empresaId={empresaId} triggerLabel="+ Nuevo campo" />
            </div>
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
        campos.map((c) => <CampoBloque key={c.id} campo={c} />)
      )}
    </div>
  )
}
