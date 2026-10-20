import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { PanelLateral } from '@/components/tropero/panel-lateral'
import { Segmentos } from '@/components/tropero/segmentos'
import { MapErrorBoundary } from '@/components/map-error-boundary'
import type { CampoConPotreros } from '@/features/campos/api'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { CampoFormDialog } from '@/features/campos/campos-dialogs'
import { useActualizarCampo, useActualizarPotreroMapa, useCamposConPotreros, useInfraestructura } from '@/features/campos/hooks'
import { tipoCampoLabel } from '@/features/campos/labels'
import { usoDeEstado, usoToEstadoCiclo, type Uso } from '@/features/campos/use-campo-mapa'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useAnimales } from '@/features/hacienda/hooks'
import { categoriaNombre, especiePorCategoria } from '@/features/hacienda/labels'
import { useMapa } from '@/features/mapa/api'
import { CargarLaborDialog } from '@/features/potrero/cargar-labor-dialog'
import { estadoDe } from '@/features/mapa/reglas'
import { hoyLocal } from '@/lib/fecha'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { diasPorPotrero, type Dias } from './dias'
import { descansoPrevio, historiaDelPotrero, LABOR, type Hecho, type Labor, type MovimientoPotrero } from './historia'
import { MapaCampo, type Marca } from './mapa-campo'
import { AGUA, avisosDelCampo, lluviaDesde, PASTO, textoDias, ultimaPorPotrero, type Aviso, type Lluvia, type Observacion } from './panorama'

const EditorCampo = lazy(() => import('./editor-campo'))

// Campos (rediseño, Figma «Mapa y potreros», nodo 1050:2). Arriba, el campo:
// cuál es, sus números y lo que pide atención. En el medio, el mapa (satélite
// con los potreros pintados por lo que tienen, o el croquis) y al lado lo del
// potrero tocado. Abajo, todos los potreros con lo que hay adentro de cada uno.
// Se dibuja aparte: mientras falte ubicar algo, o a pedido.

type Potrero = CampoConPotreros['potreros'][number]

/** El color de lo que tiene cada potrero: el mismo en el mapa, el croquis, la leyenda y la lista. */
const COLOR: Record<Uso, string> = {
  ganadero: 'var(--color-principal)',
  agricola: 'var(--color-trigo-400)',
  vacio: 'var(--color-salvia)',
}
const USO_TEXTO: Record<Uso, string> = { ganadero: 'Con hacienda', agricola: 'Sembrado', vacio: 'Descansa' }
const ha = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
/** Una fecha `n` días antes de `hoy` (AAAA-MM-DD). */
const antes = (hoy: string, n: number) => new Date(Date.parse(hoy) - n * 86_400_000).toISOString().slice(0, 10)
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

/** Lo que se cargó del campo: movimientos (días), recorridas (pasto y agua) y lluvia. */
function useDatosDelCampo(empresaId: string, campoId: string, potreroIds: string[]) {
  return useQuery({
    queryKey: ['campo-datos', campoId, potreroIds.join(',')],
    enabled: !!empresaId && !!campoId,
    queryFn: async () => {
      const desde = antes(hoyLocal(), 365)
      const [movs, obs, ll, lab] = await Promise.all([
        supabase.from('evento').select('animal_id, fecha, datos').eq('empresa_id', empresaId).eq('tipo', 'movimiento'),
        potreroIds.length ? supabase.from('observacion_potrero').select('potrero_id, created_at, pasto, agua, electrico, novedad').in('potrero_id', potreroIds).order('created_at', { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
        supabase.from('lluvia').select('fecha, mm').eq('campo_id', campoId).gte('fecha', desde),
        potreroIds.length ? supabase.from('labor_potrero').select('potrero_id, fecha, tipo, cultivo, nota, kg_cosechados').in('potrero_id', potreroIds).order('fecha', { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
      ])
      if (lab.error) throw lab.error
      if (movs.error) throw movs.error
      if (obs.error) throw obs.error
      if (ll.error) throw ll.error
      return {
        movimientos: (movs.data ?? []).map((e) => {
          const d = (e.datos ?? {}) as Record<string, unknown>
          return {
            animalId: e.animal_id,
            fecha: e.fecha,
            origen: (d.potrero_origen_id as string) ?? null,
            destino: (d.potrero_destino_id as string) ?? null,
            origenNombre: (d.potrero_origen as string) ?? null,
            destinoNombre: (d.potrero_destino as string) ?? null,
          }
        }),
        labores: (lab.data ?? []).map((l): Labor => ({ potreroId: l.potrero_id, fecha: l.fecha, tipo: l.tipo, cultivo: l.cultivo, nota: l.nota, kg: l.kg_cosechados })),
        observaciones: (obs.data ?? []).map((o): Observacion => ({ potreroId: o.potrero_id, fecha: o.created_at.slice(0, 10), pasto: o.pasto, agua: o.agua, electrico: o.electrico, novedad: o.novedad })),
        lluvias: (ll.data ?? []) as Lluvia[],
      }
    },
  })
}

export function CamposPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data: membresia } = useEmpresa()
  const empresaId = membresia?.empresa_id ?? ''
  const camposQ = useCamposConPotreros()
  const mapaQ = useMapa(empresaId || undefined)
  const identidad = useCampoElegido()
  const qc = useQueryClient()
  const animalesQ = useAnimales()
  const campos = camposQ.data ?? []
  const pedido = params.get('campo')
  const campoId = (pedido && campos.some((c) => c.id === pedido) ? pedido : identidad.elegido?.id) ?? campos[0]?.id ?? ''
  const campo = campos.find((c) => c.id === campoId)
  const mapa = mapaQ.data?.find((c) => c.id === campoId)
  const datosQ = useDatosDelCampo(empresaId, campoId, campo?.potreros.map((p) => p.id) ?? [])
  const infraQ = useInfraestructura(campoId)
  const [potreroId, setPotreroId] = useState<string | null>(null)
  const [dibujar, setDibujar] = useState(false)
  const [panel, setPanel] = useState<'campo' | 'potrero' | null>(null)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !panel && setPotreroId(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [panel])

  const hoy = hoyLocal()
  const dias = diasPorPotrero(
    campo?.potreros.map((p) => p.id) ?? [],
    (animalesQ.data ?? []).filter((a) => a.estado === 'activo' && a.id).map((a) => ({ id: a.id!, potreroId: a.potrero_id, alta: a.created_at ?? hoy })),
    datosQ.data?.movimientos ?? [],
    hoy,
  )
  const ultima = ultimaPorPotrero(datosQ.data?.observaciones ?? [])
  const marcas: Marca[] = (infraQ.data ?? []).map((m) => ({ id: m.id, tipo: m.tipo, lat: m.lat, lng: m.lng }))

  if (camposQ.isLoading || mapaQ.isLoading) return <div className="mx-auto h-[560px] w-full max-w-[1280px] animate-pulse rounded-[24px] bg-superficie-hundida" aria-busy />
  if (camposQ.error) return <p className="text-texto-suave">No pudimos cargar los campos. Revisá la conexión y probá de nuevo.</p>
  if (!campo || !mapa)
    return (
      <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4 py-16 text-center">
        <h1 className="titulo-display text-[34px] text-texto">Todavía no hay campos</h1>
        <CampoFormDialog empresaId={empresaId} triggerLabel="+ Sumar un campo" triggerClassName={BOTON} onCreado={(id) => (qc.invalidateQueries({ queryKey: ['mapa'] }), setParams((p) => (p.set('campo', id), p)))} />
      </div>
    )

  const estado = estadoDe(mapa)
  const listo = estado.tipo === 'listo'
  const editando = dibujar || (!listo && estado.tipo !== 'sin-borde')
  const potrero = campo.potreros.find((p) => p.id === potreroId) ?? null
  const usoDe = (id: string): Uso => {
    const p = campo.potreros.find((x) => x.id === id)
    return p ? usoDeEstado(p.estadoCiclo) : 'vacio'
  }
  const dibujados = new Set(mapa.potreros.filter((p) => p.poligono).map((p) => p.id))
  const avisos = avisosDelCampo(
    campo.potreros.map((p) => ({ id: p.id, nombre: p.nombre, dibujado: dibujados.has(p.id) })),
    ultima,
  )
  const lluvia30 = lluviaDesde(datosQ.data?.lluvias ?? [], antes(hoy, 30))
  const elegirCampo = (id: string) => {
    setParams((p) => (p.set('campo', id), p))
    identidad.elegir(id)
    setPotreroId(null)
    setDibujar(false)
  }
  const tocar = (id: string) => setPotreroId((x) => (x === id ? null : id))
  const lugar = [tipoCampoLabel[campo.tipo], campo.ubicacion.localidad].filter(Boolean).join(' · ')

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 lg:h-[calc(100dvh-57px-80px)]">
      {/* Arriba, aparte del mapa: qué campo */}
      <div className="flex flex-wrap items-center gap-2">
        {campos.length > 5 ? (
          <label className="relative inline-flex">
            <span className="sr-only">Campo</span>
            <select value={campo.id} onChange={(e) => elegirCampo(e.target.value)} className="h-10 max-w-[300px] appearance-none truncate rounded-full border border-borde bg-superficie pr-9 pl-4 text-[15px] font-bold text-texto">
              {campos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <Icono nombre="Desplegar" tamano={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2" />
          </label>
        ) : (
          <div className="flex flex-wrap gap-1 rounded-full bg-superficie-hundida p-1" role="group" aria-label="Campo">
            {campos.map((c) => {
              const id = identidad.campos.find((x) => x.id === c.id)
              const si = c.id === campo.id
              return (
                <button key={c.id} type="button" aria-pressed={si} onClick={() => elegirCampo(c.id)} className={cn('inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[14.5px] font-bold transition-colors', si ? 'bg-texto text-superficie' : 'text-texto hover:bg-superficie')}>
                  {id && (
                    <span className="grid size-5 place-items-center rounded-[6px] text-[11px] font-extrabold text-white" style={{ background: id.color }}>
                      {id.letra}
                    </span>
                  )}
                  {c.nombre}
                </button>
              )
            })}
          </div>
        )}
        <CampoFormDialog empresaId={empresaId} triggerLabel="+ Sumar un campo" triggerClassName="inline-flex h-10 items-center rounded-full px-3 text-[14.5px] font-bold text-principal hover:bg-principal-suave" onCreado={(id) => (qc.invalidateQueries({ queryKey: ['mapa'] }), elegirCampo(id))} />
      </div>

      {/* El mapa, con una sola tarjeta: el campo, o el potrero tocado */}
      <section className={cn('relative isolate min-h-[560px] flex-1 overflow-hidden rounded-[24px] border border-borde bg-tinta', editando && 'max-lg:h-[calc(100dvh-190px)]')}>
        <div className="absolute inset-0">
          {estado.tipo === 'sin-borde' ? (
            <div className="grid size-full place-items-center bg-pasto-oscuro px-6 lg:pr-[420px]">
              <div className="flex max-w-[400px] flex-col items-center gap-3 rounded-[20px] bg-superficie px-6 py-7 text-center shadow-sm">
                <b className="text-[18px] text-texto">{campo.nombre} todavía no está en el mapa</b>
                <p className="text-[14.5px] text-texto-suave">Se busca el campo en el satélite, se marca el borde y se dibuja cada uno de los {campo.potreros.length} potreros que cargaste.</p>
                <BotonPrincipal icono="Siguiente" onClick={() => navigate(`/mapa/${campo.id}`)}>
                  Ubicarlo en el mapa
                </BotonPrincipal>
              </div>
            </div>
          ) : editando ? (
            <MapErrorBoundary>
              <Suspense fallback={<div className="size-full animate-pulse bg-tinta" aria-busy />}>
                <EditorCampo key={campo.id} campo={campo} mapa={mapa} empresaId={empresaId} onEmpezo={() => setDibujar(true)} onSalir={listo ? () => setDibujar(false) : null} />
              </Suspense>
            </MapErrorBoundary>
          ) : (
            <MapaCampo campo={mapa} elegido={potreroId} onElegir={tocar} onFondo={() => setPotreroId(null)} color={(p) => COLOR[usoDe(p.id)]} dato={() => null} marcas={marcas} margenDerecho={420} />
          )}
        </div>

        {!editando && listo && (
          <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap gap-3 rounded-full bg-superficie/95 px-3.5 py-1.5 text-[13px] font-semibold text-texto shadow-sm">
            {(['ganadero', 'agricola', 'vacio'] as Uso[]).map((u) => (
              <span key={u} className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-[4px]" style={{ background: COLOR[u] }} />
                {USO_TEXTO[u]}
              </span>
            ))}
          </div>
        )}

        {!editando && (
          <aside className="relative z-[500] m-3 flex flex-col gap-4 rounded-[22px] bg-superficie p-5 shadow-[0_12px_40px_rgba(19,27,22,0.22)] lg:absolute lg:top-3 lg:right-3 lg:m-0 lg:max-h-[calc(100%-24px)] lg:w-[380px] lg:overflow-y-auto">
            {potrero ? (
              <DetallePotrero
                key={potrero.id}
                p={potrero}
                campoNombre={campo.nombre}
                dias={dias.get(potrero.id) ?? null}
                obs={ultima.get(potrero.id) ?? null}
                lluvias={datosQ.data?.lluvias ?? []}
                movimientos={datosQ.data?.movimientos ?? []}
                historia={historiaDelPotrero(potrero.id, datosQ.data?.observaciones ?? [], datosQ.data?.movimientos ?? [], datosQ.data?.labores ?? [])}
                labores={(datosQ.data?.labores ?? []).filter((l) => l.potreroId === potrero.id)}
                onCerrar={() => setPotreroId(null)}
                onCorregir={() => setPanel('potrero')}
              />
            ) : (
              <ResumenCampo
                campo={campo}
                listo={listo}
                lugar={lugar}
                lluvia={datosQ.data ? Math.round(lluvia30) : null}
                avisos={avisos}
                onAviso={(id) => (id ? setPotreroId(id) : setDibujar(true))}
                onCorregir={() => setPanel('campo')}
              />
            )}
          </aside>
        )}
      </section>

      <CorregirCampo campo={campo} abierto={panel === 'campo'} onCerrar={() => setPanel(null)} empresaId={empresaId} onDibujar={estado.tipo === 'sin-borde' ? () => navigate(`/mapa/${campo.id}`) : () => (setPanel(null), setPotreroId(null), setDibujar(true))} />
      {potrero && <CorregirPotrero campoId={campo.id} p={potrero} abierto={panel === 'potrero'} onCerrar={() => setPanel(null)} />}
    </div>
  )
}

const BOTON = 'inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-principal bg-superficie px-4 text-[14.5px] font-bold text-principal transition-colors hover:bg-principal-suave'

function Numero({ n, texto }: { n: string; texto: string }) {
  return (
    <div>
      <dd className="titulo-display text-[30px] leading-none text-texto">{n}</dd>
      <dt className="mt-1 text-[13px] text-texto-suave">{texto}</dt>
    </div>
  )
}

function ResumenCampo({
  campo,
  listo,
  lugar,
  lluvia,
  avisos,
  onAviso,
  onCorregir,
}: {
  campo: CampoConPotreros
  listo: boolean
  lugar: string
  lluvia: number | null
  avisos: Aviso[]
  onAviso: (potreroId: string | null) => void
  onCorregir: () => void
}) {
  const usos = (['ganadero', 'agricola', 'vacio'] as Uso[])
    .map((u) => [u, campo.potreros.filter((p) => usoDeEstado(p.estadoCiclo) === u)] as const)
    .map(([u, ps]) => ({ u, ha: ps.reduce((t, p) => t + (p.hectareas ?? 0), 0), n: ps.length }))
    .filter((x) => x.n > 0)
  return (
    <>
      <div>
        {lugar && <p className="text-[14px] font-semibold text-texto-suave">{lugar}</p>}
        <h1 className="titulo-display text-[38px] leading-[1] tracking-[-0.02em] text-texto">{campo.nombre}</h1>
      </div>
      <dl className="flex gap-6">
        <Numero n={ha(campo.totalHa)} texto="hectáreas" />
        <Numero n={campo.totalCabezas.toLocaleString('es-AR')} texto="cabezas" />
        {lluvia != null && <Numero n={`${lluvia} mm`} texto="lluvia, 30 días" />}
      </dl>
      {usos.length > 0 && (
        <div>
          <p className="text-[14px] font-semibold text-texto">En qué están las {ha(campo.totalHa)} hectáreas</p>
          <div className="mt-2 flex h-2.5 gap-1 overflow-hidden rounded-full">
            {usos.map((x) => (
              <span key={x.u} className="h-full rounded-full" style={{ flexGrow: x.ha || x.n, background: COLOR[x.u] }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-texto-suave">
            {usos.map((x) => (
              <span key={x.u} className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: COLOR[x.u] }} />
                {USO_TEXTO[x.u]} {ha(x.ha)} ha
              </span>
            ))}
          </div>
        </div>
      )}
      {avisos.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Lo que pide atención">
          {avisos.map((a) => (
            <li key={a.texto}>
              <button type="button" onClick={() => onAviso(a.potreroId)} className={cn('flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[14px] font-semibold', a.tono === 'problema' ? 'bg-estado-problema-suave text-estado-problema-texto' : 'bg-estado-atencion-suave text-estado-atencion-texto')}>
                <span className={cn('size-2 shrink-0 rounded-full', a.tono === 'problema' ? 'bg-estado-problema' : 'bg-estado-atencion')} />
                {a.texto}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[14px] text-texto-suave">{listo ? 'Tocá un potrero para ver qué hay adentro y desde cuándo.' : 'Cuando estén todos los potreros dibujados, el mapa muestra qué tiene cada uno.'}</p>
      <button type="button" onClick={onCorregir} className={cn(BOTON, 'self-start')}>
        <Icono nombre="Editar" tamano={16} /> Corregir el campo
      </button>
    </>
  )
}

function DetallePotrero({
  p,
  campoNombre,
  dias,
  obs,
  lluvias,
  movimientos,
  historia,
  labores,
  onCerrar,
  onCorregir,
}: {
  p: Potrero
  campoNombre: string
  dias: Dias
  obs: Observacion | null
  lluvias: Lluvia[]
  movimientos: MovimientoPotrero[]
  historia: Hecho[]
  labores: Labor[]
  onCerrar: () => void
  onCorregir: () => void
}) {
  const navigate = useNavigate()
  const [verHistoria, setVerHistoria] = useState(false)
  const [labor, setLabor] = useState(false)
  const hoy = hoyLocal()
  const uso = usoDeEstado(p.estadoCiclo)
  const adentro = dias && 'adentro' in dias ? dias.adentro : null
  const entrada = adentro != null ? antes(hoy, adentro) : null
  const descanso = entrada ? descansoPrevio(p.id, entrada, movimientos) : null
  const carga = p.cabezas && p.hectareas ? (p.cabezas / p.hectareas).toLocaleString('es-AR', { maximumFractionDigits: 1 }) : '—'
  // Volver: de la historia al potrero; del potrero a todo el campo (también con Esc o tocando afuera del campo).
  const volver = (
    <button
      type="button"
      onClick={verHistoria ? () => setVerHistoria(false) : onCerrar}
      className="-mt-1 -ml-1 inline-flex h-9 items-center gap-1.5 self-start rounded-full bg-superficie-hundida pr-3.5 pl-2.5 text-[14px] font-bold text-texto transition-colors hover:bg-borde"
    >
      <span className="rotate-180">
        <Icono nombre="Siguiente" tamano={16} />
      </span>
      {verHistoria ? `Volver al ${p.nombre}` : `Ver todo ${campoNombre}`}
    </button>
  )

  if (verHistoria)
    return (
      <>
        {volver}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="titulo-display text-[26px] leading-[1.05] text-texto">Lo que pasó en el {p.nombre}</h2>
            <p className="mt-1 text-[14px] text-texto-suave">{[p.hectareas ? `${ha(p.hectareas)} ha` : null, p.cabezas ? `${p.cabezas} cabezas` : null].filter(Boolean).join(', ')}</p>
          </div>
          </div>
        {historia.length === 0 ? (
          <p className="text-[14.5px] text-texto-suave">Todavía no hay nada anotado en este potrero.</p>
        ) : (
          <ol className="flex flex-col">
            {historia.slice(0, 30).map((h, i) => (
              <li key={i} className="grid grid-cols-[52px_12px_minmax(0,1fr)] gap-x-3">
                <span className="cifra pt-0.5 text-right text-[15px] font-bold text-texto">{ddmm(h.fecha)}</span>
                <span className="flex flex-col items-center">
                  <span className={cn('mt-1.5 size-2.5 rounded-full', h.tipo === 'recorrida' ? 'bg-salvia' : h.tipo === 'labor' ? 'bg-trigo-400' : 'bg-principal')} />
                  {i < Math.min(historia.length, 30) - 1 && <span className="w-px flex-1 bg-borde" />}
                </span>
                <div className="pb-4">
                  <p className="text-[15px] font-bold text-texto">{h.titulo}</p>
                  {h.detalle && <p className="text-[14px] text-texto-suave">{h.detalle}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </>
    )

  return (
    <>
      {volver}
      <div className="flex items-start justify-between gap-3">
        <div>
          {uso === 'agricola' && p.fechaSiembra ? (
            <>
              <p className="text-[14px] text-texto-suave">{[p.nombre, p.cultivo?.toLowerCase(), p.hectareas ? `${ha(p.hectareas)} ha` : null].filter(Boolean).join(', ')}</p>
              <h2 className="titulo-display text-[48px] leading-[0.95] text-texto">Día {Math.max(0, Math.round((Date.parse(hoy) - Date.parse(p.fechaSiembra)) / 86_400_000))}</h2>
            </>
          ) : (
            <>
              <h2 className="titulo-display text-[64px] leading-[0.9] text-texto">{p.nombre}</h2>
              <p className="mt-2 text-[15px] text-texto-suave">{[p.hectareas ? `${ha(p.hectareas)} ha` : null, uso === 'ganadero' ? 'hacienda' : uso === 'agricola' ? (p.cultivo ?? 'sembrado') : 'descansa'].filter(Boolean).join(', ')}</p>
            </>
          )}
        </div>
      </div>

      {uso === 'ganadero' && (
        <>
          <dl className="flex gap-6">
            <Numero n={String(p.cabezas)} texto="cabezas" />
            <Numero n={adentro != null ? `${adentro} d` : '—'} texto="adentro" />
            <Numero n={carga} texto="cab/ha" />
          </dl>
          {adentro != null && descanso != null && (
            <div>
              <div className="flex h-2 gap-1 overflow-hidden rounded-full">
                <span className="h-full rounded-full bg-salvia" style={{ flexGrow: descanso || 1 }} />
                <span className="h-full rounded-full bg-principal" style={{ flexGrow: adentro || 1 }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[13.5px]">
                <span className="text-texto-suave">Descansó {descanso} días</span>
                <span className="text-principal">{adentro} días adentro</span>
              </div>
            </div>
          )}
          {p.porCategoria.length > 0 && <QueHay cats={p.porCategoria} />}
        </>
      )}

      {uso === 'agricola' && p.fechaSiembra && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-superficie-hundida">
            {p.fechaCosechaEstimada && (
              <span
                className="block h-full rounded-full bg-trigo-400"
                style={{ width: `${Math.min(100, Math.max(4, (100 * (Date.parse(hoy) - Date.parse(p.fechaSiembra))) / Math.max(1, Date.parse(p.fechaCosechaEstimada) - Date.parse(p.fechaSiembra))))}%` }}
              />
            )}
          </div>
          <div className="mt-1.5 flex justify-between text-[13px] text-texto-suave">
            <span>Sembrado el {ddmm(p.fechaSiembra)}</span>
            {p.fechaCosechaEstimada && <span>Cosecha cerca del {ddmm(p.fechaCosechaEstimada)}</span>}
          </div>
        </div>
      )}

      {uso === 'vacio' && dias && 'descansa' in dias && <p className="text-[15px] font-semibold text-texto">{textoDias(dias)}</p>}

      {(() => {
        const desde = entrada ?? (uso === 'agricola' ? p.fechaSiembra : dias && 'descansa' in dias ? antes(hoy, dias.descansa) : null)
        const mm = desde ? lluviaDesde(lluvias, desde) : 0
        return mm > 0 ? (
          <p className="flex items-center gap-2.5 rounded-[14px] bg-fondo px-4 py-2.5 text-[14.5px] text-texto">
            <Icono nombre="Lluvia" tamano={16} className="text-texto-suave" />
            <span>
              <b>{Math.round(mm)} mm</b> {entrada ? 'desde que entraron' : uso === 'agricola' ? 'desde la siembra' : 'en el descanso'}
            </span>
          </p>
        ) : null
      })()}

      {obs && (obs.agua === 'baja' || obs.agua === 'seca' || obs.pasto === 'escaso' || obs.pasto === 'pelado' || obs.electrico === 'cortado') && (
        <div className="rounded-[14px] bg-estado-problema-suave px-4 py-2.5 text-[14.5px] text-estado-problema-texto">
          <b>En la recorrida del {ddmm(obs.fecha)}:</b>{' '}
          {[obs.electrico === 'cortado' && 'eléctrico cortado', (obs.agua === 'baja' || obs.agua === 'seca') && `agua ${AGUA[obs.agua].toLowerCase()}`, (obs.pasto === 'escaso' || obs.pasto === 'pelado') && `pasto ${PASTO[obs.pasto].toLowerCase()}`].filter(Boolean).join(', ')}
          {obs.novedad && <span className="block text-[13.5px]">«{obs.novedad}»</span>}
        </div>
      )}

      {uso === 'agricola' && labores.length > 0 && (
        <div>
          <p className="text-[13.5px] font-semibold text-texto-suave">Lo último</p>
          <ul className="mt-1 flex flex-col divide-y divide-borde">
            {labores.slice(0, 3).map((l, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-1.5 text-[14.5px]">
                <b className="text-texto">{LABOR[l.tipo]}</b>
                <span className="flex-1 truncate text-right text-[13px] text-texto-suave">{l.cultivo ?? l.nota ?? ''}</span>
                <b className="cifra text-texto">{ddmm(l.fecha)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto flex flex-col items-start gap-2">
        {uso === 'ganadero' && p.cabezas > 0 && (
          <button type="button" onClick={() => navigate(`/hacienda?potrero=${p.id}`)} className="inline-flex h-11 items-center gap-2.5 rounded-full bg-principal py-1 pr-1 pl-4 text-[15px] font-bold text-principal-texto hover:bg-terracota-600">
            Ver {p.cabezas === 1 ? 'el animal' : `las ${p.cabezas}`}
            <span className="grid size-9 place-items-center rounded-full bg-acento text-acento-texto">
              <Icono nombre="Siguiente" tamano={16} />
            </span>
          </button>
        )}
        {uso === 'agricola' && (
          <button type="button" onClick={() => setLabor(true)} className="inline-flex h-11 items-center gap-2.5 rounded-full bg-principal py-1 pr-1 pl-4 text-[15px] font-bold text-principal-texto hover:bg-terracota-600">
            Anotar una labor
            <span className="grid size-9 place-items-center rounded-full bg-acento text-acento-texto">
              <Icono nombre="Agregar" tamano={16} />
            </span>
          </button>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setVerHistoria(true)} className={BOTON_CHICO}>
            Ver la historia del {p.nombre}
          </button>
          <button type="button" onClick={onCorregir} className={BOTON_CHICO}>
            Corregir
          </button>
        </div>
      </div>
      <CargarLaborDialog potreroId={p.id} potreroNombre={p.nombre} open={labor} onOpenChange={setLabor} />
    </>
  )
}

const ICONO_CAT = (c: Potrero['porCategoria'][number]['categoria']): NombreIcono =>
  c === 'ternero' || c === 'ternera' ? 'Ternero' : especiePorCategoria[c] === 'ovino' ? 'Oveja' : especiePorCategoria[c] === 'equino' ? 'Caballo' : 'Vaca'

/** Lo que hay adentro, de un vistazo: cada categoría con su ícono, cuántas y cuánto pesa en el potrero. */
function QueHay({ cats }: { cats: Potrero['porCategoria'] }) {
  const orden = [...cats].sort((a, b) => b.cabezas - a.cabezas)
  const max = Math.max(1, ...orden.map((c) => c.cabezas))
  return (
    <ul className="flex flex-col gap-2" aria-label="Qué hay adentro">
      {orden.map((c) => (
        <li key={c.categoria} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[10px] bg-principal-suave text-principal">
            <Icono nombre={ICONO_CAT(c.categoria)} />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-[14.5px] font-semibold text-texto">{categoriaNombre(c.categoria, c.cabezas)}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-superficie-hundida">
              <span className="block h-full rounded-full bg-principal" style={{ width: `${(100 * c.cabezas) / max}%` }} />
            </span>
          </span>
          <b className="titulo-display min-w-[2ch] text-right text-[24px] leading-none text-texto">{c.cabezas}</b>
        </li>
      ))}
    </ul>
  )
}

const BOTON_CHICO = 'inline-flex h-9 items-center rounded-full border-[1.5px] border-principal px-3.5 text-[14px] font-bold text-principal hover:bg-principal-suave'

function CorregirCampo({ campo, abierto, onCerrar, empresaId, onDibujar }: { campo: CampoConPotreros; abierto: boolean; onCerrar: () => void; empresaId: string; onDibujar: () => void }) {
  const [nombre, setNombre] = useState(campo.nombre)
  const [tipo, setTipo] = useState(campo.tipo)
  const [abiertoAntes, setAbiertoAntes] = useState(false)
  const mut = useActualizarCampo()
  const qc = useQueryClient()
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto)
    if (abierto) {
      setNombre(campo.nombre)
      setTipo(campo.tipo)
    }
  }
  const cambia = nombre.trim() !== campo.nombre || tipo !== campo.tipo
  async function guardar() {
    try {
      await mut.mutateAsync({ id: campo.id, nombre, tipo, hectareas: campo.hectareas, actividad: campo.actividad })
      qc.invalidateQueries({ queryKey: ['mapa', empresaId] })
      toast.success('Listo: el campo quedó corregido')
      onCerrar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }
  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Corregir el campo"
      bajada="El nombre, si es propio o alquilado, y el dibujo de los potreros."
      pie={
        <BotonPrincipal icono="Guardar" cargando={mut.isPending} disabled={!cambia || !nombre.trim() || mut.isPending} onClick={guardar}>
          Guardar
        </BotonPrincipal>
      }
    >
      <div className="flex flex-col gap-5">
        <CampoTexto etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-semibold text-texto">Es</span>
          <Segmentos
            etiqueta="Propio o alquilado"
            valor={tipo}
            onCambio={setTipo}
            opciones={[
              { valor: 'propio', texto: 'Propio' },
              { valor: 'alquilado', texto: 'Alquilado' },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2 rounded-[16px] border border-borde bg-superficie p-4">
          <span className="text-[15px] font-bold text-texto">El dibujo</span>
          <span className="text-[14px] text-texto-suave">Para corregir el borde de un potrero, dibujar uno que falta o sumar uno nuevo, sobre el satélite.</span>
          <button type="button" onClick={onDibujar} className={cn(BOTON, 'self-start')}>
            <Icono nombre="Editar" tamano={16} /> Dibujar en el satélite
          </button>
        </div>
      </div>
    </PanelLateral>
  )
}

function CorregirPotrero({ campoId, p, abierto, onCerrar }: { campoId: string; p: Potrero; abierto: boolean; onCerrar: () => void }) {
  const [uso, setUso] = useState<Uso>(usoDeEstado(p.estadoCiclo))
  const [hectareas, setHectareas] = useState(p.hectareas != null ? String(p.hectareas) : '')
  const [cultivo, setCultivo] = useState(p.cultivo ?? '')
  const [abiertoAntes, setAbiertoAntes] = useState(false)
  const mut = useActualizarPotreroMapa(campoId)
  const qc = useQueryClient()
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto)
    if (abierto) {
      setUso(usoDeEstado(p.estadoCiclo))
      setHectareas(p.hectareas != null ? String(p.hectareas) : '')
      setCultivo(p.cultivo ?? '')
    }
  }
  const nHa = hectareas.trim() === '' ? null : Number(hectareas.replace(',', '.'))
  const haMal = nHa != null && (!Number.isFinite(nHa) || nHa <= 0)
  async function guardar() {
    try {
      await mut.mutateAsync({ id: p.id, estadoCiclo: usoToEstadoCiclo(uso, p.estadoCiclo), hectareas: nHa, cultivo: uso === 'agricola' ? cultivo.trim() || null : null })
      qc.invalidateQueries({ queryKey: ['mapa'] })
      toast.success(`Listo: el ${p.nombre} quedó corregido`)
      onCerrar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }
  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Corregir el ${p.nombre}`}
      bajada="Lo que está mal cargado. La hacienda se mueve desde Hacienda; el dibujo, en el satélite."
      pie={
        <BotonPrincipal icono="Guardar" cargando={mut.isPending} disabled={haMal || mut.isPending} onClick={guardar}>
          Guardar
        </BotonPrincipal>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-semibold text-texto">Qué tiene</span>
          <Segmentos
            etiqueta="Qué tiene"
            valor={uso}
            onCambio={setUso}
            opciones={[
              { valor: 'ganadero', texto: 'Hacienda' },
              { valor: 'agricola', texto: 'Sembrado' },
              { valor: 'vacio', texto: 'Descanso' },
            ]}
          />
        </div>
        <CampoTexto etiqueta="Hectáreas" inputMode="decimal" unidad="ha" value={hectareas} onChange={(e) => setHectareas(e.target.value)} error={haMal ? 'Escribí un número mayor que cero.' : undefined} />
        {uso === 'agricola' && <CampoTexto etiqueta="Cultivo" placeholder="Trigo, soja, pastura…" value={cultivo} onChange={(e) => setCultivo(e.target.value)} />}
      </div>
    </PanelLateral>
  )
}
