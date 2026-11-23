import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { MapErrorBoundary } from '@/components/map-error-boundary'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { MapaCampo } from '@/features/campos/tropero/mapa-campo'
import { MapaCampos } from '@/features/campos/tropero/mapa-campos'
import type { CampoConPotreros } from '@/features/campos/api'
import { useCamposConPotreros } from '@/features/campos/hooks'
import { useDatosDelCampo } from '@/features/campos/tropero/datos-del-campo'
import { diasPorPotrero, type Dias } from '@/features/campos/tropero/dias'
import { descansoPrevio, historiaDelPotrero, LABOR, type Hecho, type Labor, type MovimientoPotrero } from '@/features/campos/tropero/historia'
import { AGUA, avisosDelCampo, lluviaDesde, PASTO, textoDias, ultimaPorPotrero, type Lluvia, type Observacion } from '@/features/campos/tropero/panorama'
import { usoDeEstado, type Uso } from '@/features/campos/use-campo-mapa'
import { useNombres } from '@/features/empresa/use-nombres'
import { useAnimales } from '@/features/hacienda/hooks'
import { categoriaNombre, especiePorCategoria } from '@/features/hacienda/labels'
import { hoyLocal } from '@/lib/fecha'
import { puedeVer } from '@/features/empresa/secciones'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useMapa } from '@/features/mapa/api'
import type { CampoMapa } from '@/features/mapa/reglas'
import { cn } from '@/lib/utils'
import { BAJADA, TARJETA } from './sistema'
import { Encabezado } from './sistema-ui'

/**
 * Campos en el celular (Lau, 17/11): para ver los campos y lo que tienen
 * adentro, como en la compu. Una sola pantalla: todos juntos sobre el satélite
 * y la lista con lo que suman; tocando uno, el mapa viaja hasta él y abajo
 * aparecen sus potreros y qué hay en cada uno. Se mira; se dibuja en la compu.
 */

const CURVA = [0.22, 1, 0.36, 1] as const
const ha = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
const cabezas = (c: CampoMapa) => c.potreros.reduce((n, p) => n + p.cabezas, 0)
const hectareas = (c: CampoMapa) => c.hectareas ?? c.potreros.reduce((n, p) => n + (p.hectareas ?? 0), 0)
/** Qué tiene, para el color del potrero: lo mismo que en la compu, en suave. */
// Los mismos colores de la compu: el mapa, la leyenda y la lista dicen lo mismo.
const COLOR_USO: Record<Uso, string> = { ganadero: 'var(--color-principal)', agricola: 'var(--color-trigo-400)', vacio: '#8aa5c4' }
const USO_TEXTO: Record<Uso, string> = { ganadero: 'Con hacienda', agricola: 'Sembrado', vacio: 'Descansa' }

export function CamposCelu() {
  const { id = null } = useParams()
  const navigate = useNavigate()
  const reducir = useReducedMotion()
  const { data: membresia } = useEmpresa()
  const mapa = useMapa(membresia?.empresa_id)
  const camposQ = useCamposConPotreros()
  const identidad = useCampoElegido()
  const veHacienda = puedeVer(membresia, 'hacienda')
  const scroll = useRef<HTMLDivElement>(null)
  const detalle = useRef<HTMLDivElement>(null)
  // El potrero tocado es de un campo: al cambiar de campo se suelta solo.
  const [tocado, setTocado] = useState<{ campo: string; potrero: string } | null>(null)
  const elegido = tocado && tocado.campo === id ? tocado.potrero : null
  // El último campo abierto: al volver a todos, el mapa se aleja desde ahí.
  const [ultimo, setUltimo] = useState<string | null>(id)
  if (id && id !== ultimo) setUltimo(id)

  const campos = mapa.data ?? []
  const campoMapa = id ? campos.find((c) => c.id === id) : undefined
  const campo = id ? camposQ.data?.find((c) => c.id === id) : undefined
  const dibujado = !!campoMapa?.potreros.some((p) => p.poligono)
  const marca = (cid: string) => identidad.campos.find((c) => c.id === cid)
  const usoDe = (pid: string): Uso => {
    const e = campo?.potreros.find((x) => x.id === pid)?.estadoCiclo
    return e ? usoDeEstado(e) : 'vacio'
  }
  // Un solo mapa (Lau, 17/11): tocar un campo no cambia de pantalla; el mapa viaja hasta él y
  // cambia lo de abajo. Si se lo tocó en la lista, primero se sube para ver el viaje.
  const abrir = (cid: string) => {
    scroll.current?.scrollTo({ top: 0, behavior: reducir ? 'auto' : 'smooth' })
    navigate(`/campo/campos/${cid}`)
  }
  const volver = () => {
    scroll.current?.scrollTo({ top: 0, behavior: reducir ? 'auto' : 'smooth' })
    navigate('/campo/campos')
  }
  // Tocar un potrero (en el mapa o en la lista) abre su detalle debajo del mapa (Lau: el panel va abajo).
  const elegir = (pid: string | null) => {
    setTocado(pid && id ? { campo: id, potrero: pid } : null)
    if (pid) requestAnimationFrame(() => detalle.current?.scrollIntoView({ block: 'nearest', behavior: reducir ? 'auto' : 'smooth' }))
  }
  const cargando = mapa.isLoading || camposQ.isLoading

  return (
    <div ref={scroll} className="h-full overflow-y-auto">
      <div className="flex flex-col gap-8 px-4 pt-[calc(var(--enc,0px)+12px)] pb-[calc(var(--barra,0px)+24px)]">
        <section aria-labelledby="campos-titulo" className="flex flex-col gap-3">
          <h1 id="campos-titulo" className="flex h-9 items-center px-1 titulo-display text-[30px] leading-tight text-texto">
            Campos
          </h1>
          <div className="relative isolate h-[300px] overflow-hidden rounded-[20px] border border-borde bg-tinta">
            {campos.length > 0 && (
              <MapErrorBoundary>
                {campoMapa && dibujado ? (
                  <MapaCampo
                    key={campoMapa.id}
                    campo={campoMapa}
                    elegido={elegido}
                    onElegir={(pid) => elegir(elegido === pid ? null : pid)}
                    onFondo={() => elegir(null)}
                    color={(p) => COLOR_USO[usoDe(p.id)]}
                    dato={(p) => (veHacienda && p.cabezas ? `${p.cabezas} cab` : null)}
                    entrando
                  />
                ) : (
                  <MapaCampos campos={campos.map((c) => ({ campo: c, letra: marca(c.id)?.letra ?? '', color: marca(c.id)?.color ?? '#a9552c' }))} onElegir={abrir} desde={id ? null : ultimo} />
                )}
              </MapErrorBoundary>
            )}
            {/* Desde un campo, volver a ver todos: sobre el mapa, donde se mira. */}
            {id && (
              <button type="button" onClick={volver} className="absolute top-2.5 left-2.5 z-[500] flex h-8 items-center gap-1 rounded-full bg-superficie/95 pr-3 pl-2 text-[13px] font-bold text-texto shadow-[0_4px_14px_rgba(0,0,0,0.25)]">
                <Icono nombre="Siguiente" tamano={16} className="rotate-180" />
                Todos los campos
              </button>
            )}
          </div>
          {id && dibujado && (
            <div className="-mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[13px] text-texto-suave">
              {(['ganadero', 'agricola', 'vacio'] as Uso[]).map((u) => (
                <span key={u} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px]" style={{ background: COLOR_USO[u] }} />
                  {USO_TEXTO[u]}
                </span>
              ))}
            </div>
          )}
        </section>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={id ?? 'todos'}
            initial={reducir ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducir ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: CURVA }}
            className="flex flex-col gap-6"
          >
            {!id ? (
              <ListaCampos campos={campos} marca={marca} veHacienda={veHacienda} onAbrir={abrir} />
            ) : cargando ? (
              <div className="h-[220px] animate-pulse rounded-[20px] bg-superficie-hundida" aria-busy />
            ) : campoMapa && campo ? (
              <DelCampo campo={campo} campoMapa={campoMapa} marca={marca(campo.id)} veHacienda={veHacienda} elegido={elegido} elegir={elegir} detalle={detalle} />
            ) : (
              <div className={cn(TARJETA, 'flex flex-col gap-3 p-4')}>
                <p className="text-[15px] text-texto-suave">No encontramos ese campo.</p>
                <button type="button" onClick={volver} className="self-start text-[15px] font-bold text-principal">
                  Ver los campos
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

type Marca = { letra: string; color: string } | undefined

function ListaCampos({ campos, marca, veHacienda, onAbrir }: { campos: CampoMapa[]; marca: (id: string) => Marca; veHacienda: boolean; onAbrir: (id: string) => void }) {
  const totalHa = campos.reduce((n, c) => n + hectareas(c), 0)
  const totalCab = campos.reduce((n, c) => n + cabezas(c), 0)
  return (
    <section aria-labelledby="campos-lista" className={cn(TARJETA, 'p-4')}>
      <Encabezado id="campos-lista" titulo={`${campos.length === 1 ? 'Tu campo' : `Tus ${campos.length} campos`}`} bajada="Tocá uno para ver sus potreros" />
      <div className="mt-3 grid grid-cols-2 gap-3 border-b border-borde pb-3">
        <p className="flex flex-col">
          <span className="titulo-display text-[26px] leading-none text-texto">{ha(totalHa)}</span>
          <span className={BAJADA}>hectáreas</span>
        </p>
        {veHacienda && (
          <p className="flex flex-col">
            <span className="titulo-display text-[26px] leading-none text-texto">{totalCab.toLocaleString('es-AR')}</span>
            <span className={BAJADA}>cabezas</span>
          </p>
        )}
      </div>
      <ul className="divide-y divide-borde">
        {campos.map((c) => {
          const m = marca(c.id)
          return (
            <li key={c.id}>
              <button type="button" onClick={() => onAbrir(c.id)} className="flex w-full items-center gap-3 py-3 text-left last:pb-0">
                <span className="grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-extrabold text-white" style={{ background: m?.color ?? '#a9552c' }}>
                  {m?.letra}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-texto">{c.nombre}</span>
                  <span className={BAJADA}>
                    {ha(hectareas(c))} ha · {c.potreros.length} {c.potreros.length === 1 ? 'potrero' : 'potreros'}
                    {veHacienda && ` · ${cabezas(c).toLocaleString('es-AR')} cab`}
                  </span>
                </span>
                <Icono nombre="Siguiente" tamano={16} className="shrink-0 text-texto-suave" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function DelCampo({ campo, campoMapa, marca: m, veHacienda, elegido, elegir, detalle }: { campo: CampoConPotreros; campoMapa: CampoMapa; marca: Marca; veHacienda: boolean; elegido: string | null; elegir: (pid: string | null) => void; detalle: React.RefObject<HTMLDivElement | null> }) {
  const { data: membresia } = useEmpresa()
  const animales = useAnimales()
  const datos = useDatosDelCampo(membresia?.empresa_id ?? '', campo.id, campo.potreros.map((p) => p.id))
  const hoy = hoyLocal()
  const dias = diasPorPotrero(
    campo.potreros.map((p) => p.id),
    (animales.data ?? []).filter((a) => a.estado === 'activo' && a.id).map((a) => ({ id: a.id!, potreroId: a.potrero_id, alta: a.created_at ?? hoy })),
    datos.data?.movimientos ?? [],
    hoy,
  )
  const ultima = ultimaPorPotrero(datos.data?.observaciones ?? [])
  const dibujados = new Set(campoMapa.potreros.filter((p) => p.poligono).map((p) => p.id))
  const avisos = avisosDelCampo(campo.potreros.map((p) => ({ id: p.id, nombre: p.nombre, dibujado: dibujados.has(p.id) })), ultima)
  const lluvia30 = lluviaDesde(datos.data?.lluvias ?? [], new Date(Date.parse(hoy) - 30 * 86_400_000).toISOString().slice(0, 10))
  const usos = (['ganadero', 'agricola', 'vacio'] as Uso[])
    .map((u) => ({ u, ps: campo.potreros.filter((p) => usoDeEstado(p.estadoCiclo) === u) }))
    .map(({ u, ps }) => ({ u, ha: ps.reduce((t, p) => t + (p.hectareas ?? 0), 0), n: ps.length }))
    .filter((x) => x.n > 0)
  const potreros = [...campo.potreros].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
  const potrero = campo.potreros.find((p) => p.id === elegido) ?? null
  return (
    <>
      {/* El potrero tocado, pegado al mapa. */}
      <div ref={detalle} className="scroll-mt-4 empty:hidden">
        {potrero && (
          <DetallePotrero
            key={potrero.id}
            p={potrero}
            dias={dias.get(potrero.id) ?? null}
            obs={ultima.get(potrero.id) ?? null}
            lluvias={datos.data?.lluvias ?? []}
            movimientos={datos.data?.movimientos ?? []}
            historia={historiaDelPotrero(potrero.id, datos.data?.observaciones ?? [], datos.data?.movimientos ?? [], datos.data?.labores ?? [])}
            labores={(datos.data?.labores ?? []).filter((l) => l.potreroId === potrero.id)}
            veHacienda={veHacienda}
            onCerrar={() => elegir(null)}
          />
        )}
      </div>

      {/* El campo: cuál es, sus números y en qué están sus hectáreas. */}
      <section aria-labelledby="campo-titulo" className={cn(TARJETA, 'flex flex-col gap-4 p-4')}>
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full text-[15px] font-extrabold text-white" style={{ background: m?.color ?? '#a9552c' }}>
            {m?.letra}
          </span>
          <div className="min-w-0">
            <h2 id="campo-titulo" className="titulo-display truncate text-[26px] leading-tight text-texto">
              {campo.nombre}
            </h2>
            {campo.ubicacion.localidad && <p className={BAJADA}>{campo.ubicacion.localidad}</p>}
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-2 border-y border-borde py-3">
          <Num n={ha(campo.totalHa)} t="hectáreas" />
          {veHacienda ? <Num n={campo.totalCabezas.toLocaleString('es-AR')} t="cabezas" /> : <Num n={String(campo.potreros.length)} t="potreros" />}
          {/* Es la lluvia anotada en el pluviómetro: sin anotaciones, «0 mm» diría que no llovió. */}
          {(datos.data?.lluvias.length ?? 0) > 0 ? <Num n={`${Math.round(lluvia30)} mm`} t="lluvia anotada, 30 d" /> : <Num n="—" t="sin lluvia anotada" />}
        </dl>
        {usos.length > 0 && (
          <div>
            <p className="text-[14px] font-semibold text-texto">En qué están las {ha(campo.totalHa)} hectáreas</p>
            <div className="mt-2 flex h-2.5 gap-1 overflow-hidden rounded-full">
              {usos.map((x) => (
                <span key={x.u} className="h-full rounded-full" style={{ flexGrow: x.ha || x.n, background: COLOR_USO[x.u] }} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-texto-suave">
              {usos.map((x) => (
                <span key={x.u} className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: COLOR_USO[x.u] }} />
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
                <button type="button" onClick={() => a.potreroId && elegir(a.potreroId)} className={cn('flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[14px] font-semibold', a.tono === 'problema' ? 'bg-estado-problema-suave text-estado-problema-texto' : 'bg-estado-atencion-suave text-estado-atencion-texto')}>
                  <span className={cn('size-2 shrink-0 rounded-full', a.tono === 'problema' ? 'bg-estado-problema' : 'bg-estado-atencion')} />
                  {a.texto}
                </button>
              </li>
            ))}
          </ul>
        )}
        {dibujados.size === 0 && <p className={BAJADA}>Este campo todavía no está dibujado. Se arma en la compu.</p>}
      </section>

      <section aria-labelledby="campo-potreros" className={cn(TARJETA, 'p-4')}>
        <Encabezado id="campo-potreros" titulo="Potreros" bajada="Qué hay en cada uno y desde cuándo. Tocalo para ver más." />
        <ul className="mt-3 divide-y divide-borde">
          {potreros.map((p) => {
            const u = usoDeEstado(p.estadoCiclo)
            const d = dias.get(p.id) ?? null
            const activo = elegido === p.id
            const que = u === 'ganadero' ? (veHacienda && p.cabezas ? `${p.cabezas} ${p.cabezas === 1 ? 'cabeza' : 'cabezas'}` : 'Con hacienda') : u === 'agricola' ? (p.cultivo ?? 'Sembrado') : 'Descansa'
            const meta = [p.hectareas ? `${ha(p.hectareas)} ha` : null, d ? textoDias(d) : null].filter(Boolean).join(' · ')
            return (
              <li key={p.id}>
                <button type="button" onClick={() => elegir(activo ? null : p.id)} aria-pressed={activo} className={cn('-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-[14px] px-2 py-3 text-left transition-colors', activo && 'bg-principal-suave/60')}>
                  <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-full px-2 text-[13px] font-extrabold text-white" style={{ background: COLOR_USO[u] }}>
                    {p.nombre}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-texto">{que}</span>
                    <span className={cn(BAJADA, 'block truncate')}>{meta || 'Sin datos todavía'}</span>
                  </span>
                  {ultima.get(p.id) && <span title="Tiene recorrida" className="size-2 shrink-0 rounded-full bg-salvia" />}
                  <Icono nombre="Siguiente" tamano={16} className="shrink-0 text-texto-suave" />
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}

function Num({ n, t }: { n: string; t: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dd className="titulo-display truncate text-[22px] leading-tight text-texto">{n}</dd>
      <dt className={BAJADA}>{t}</dt>
    </div>
  )
}

type PotreroC = CampoConPotreros['potreros'][number]
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const ICONO_CAT = (c: PotreroC['porCategoria'][number]['categoria']): NombreIcono =>
  c === 'ternero' || c === 'ternera' ? 'Ternero' : especiePorCategoria[c] === 'ovino' ? 'Oveja' : especiePorCategoria[c] === 'equino' ? 'Caballo' : 'Vaca'

/** Lo de un potrero, como en la compu: qué hay, desde cuándo, lo que se vio y su historia. */
function DetallePotrero({ p, dias, obs, lluvias, movimientos, historia, labores, veHacienda, onCerrar }: { p: PotreroC; dias: Dias; obs: Observacion | null; lluvias: Lluvia[]; movimientos: MovimientoPotrero[]; historia: Hecho[]; labores: Labor[]; veHacienda: boolean; onCerrar: () => void }) {
  const navigate = useNavigate()
  const { quienCargo } = useNombres()
  const [verHistoria, setVerHistoria] = useState(false)
  const hoy = hoyLocal()
  const uso = usoDeEstado(p.estadoCiclo)
  const adentro = dias && 'adentro' in dias ? dias.adentro : null
  const entrada = adentro != null ? new Date(Date.parse(hoy) - adentro * 86_400_000).toISOString().slice(0, 10) : null
  const descanso = entrada ? descansoPrevio(p.id, entrada, movimientos) : null
  const carga = p.cabezas && p.hectareas ? (p.cabezas / p.hectareas).toLocaleString('es-AR', { maximumFractionDigits: 1 }) : '—'
  const desde = entrada ?? (uso === 'agricola' ? p.fechaSiembra : dias && 'descansa' in dias ? new Date(Date.parse(hoy) - dias.descansa * 86_400_000).toISOString().slice(0, 10) : null)
  const mm = desde ? lluviaDesde(lluvias, desde) : 0
  const alerta = obs && (obs.agua === 'baja' || obs.agua === 'seca' || obs.pasto === 'escaso' || obs.pasto === 'pelado' || obs.electrico === 'cortado')
  return (
    <section aria-labelledby="potrero-titulo" className={cn(TARJETA, 'flex flex-col gap-4 border-principal/40 p-4')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="potrero-titulo" className="titulo-display text-[34px] leading-none text-texto">
            {p.nombre}
          </h2>
          <p className={cn(BAJADA, 'mt-1')}>{[p.hectareas ? `${ha(p.hectareas)} ha` : null, uso === 'ganadero' ? 'con hacienda' : uso === 'agricola' ? (p.cultivo ?? 'sembrado') : 'descansa'].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar el potrero" className="grid size-9 shrink-0 place-items-center rounded-full bg-superficie-hundida text-texto">
          <Icono nombre="Cerrar" tamano={16} />
        </button>
      </div>

      {uso === 'ganadero' && veHacienda && (
        <>
          <dl className="grid grid-cols-3 gap-2 border-y border-borde py-3">
            <Num n={String(p.cabezas)} t="cabezas" />
            <Num n={adentro != null ? `${adentro} d` : '—'} t="adentro" />
            <Num n={carga} t="cab/ha" />
          </dl>
          {adentro != null && descanso != null && (
            <div>
              <div className="flex h-2 gap-1 overflow-hidden rounded-full">
                <span className="h-full rounded-full" style={{ flexGrow: descanso || 1, background: COLOR_USO.vacio }} />
                <span className="h-full rounded-full bg-principal" style={{ flexGrow: adentro || 1 }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[13.5px]">
                <span className="text-texto-suave">Descansó {descanso} días</span>
                <span className="text-principal">{adentro} días adentro</span>
              </div>
            </div>
          )}
          {p.porCategoria.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="Qué hay adentro">
              {[...p.porCategoria]
                .sort((a, b) => b.cabezas - a.cabezas)
                .map((c, _i, arr) => (
                  <li key={c.categoria} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-full bg-principal-suave text-principal">
                      <Icono nombre={ICONO_CAT(c.categoria)} tamano={16} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="text-[14.5px] font-semibold text-texto">{categoriaNombre(c.categoria, c.cabezas)}</span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-superficie-hundida">
                        <span className="block h-full rounded-full bg-principal" style={{ width: `${(100 * c.cabezas) / Math.max(1, arr[0]!.cabezas)}%` }} />
                      </span>
                    </span>
                    <b className="text-[15px] font-bold tabular-nums text-texto">{c.cabezas}</b>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}

      {uso === 'agricola' && p.fechaSiembra && (
        <div>
          <p className="titulo-display text-[26px] text-texto">Día {Math.max(0, Math.round((Date.parse(hoy) - Date.parse(p.fechaSiembra)) / 86_400_000))}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-superficie-hundida">
            {p.fechaCosechaEstimada && <span className="block h-full rounded-full bg-trigo-400" style={{ width: `${Math.min(100, Math.max(4, (100 * (Date.parse(hoy) - Date.parse(p.fechaSiembra))) / Math.max(1, Date.parse(p.fechaCosechaEstimada) - Date.parse(p.fechaSiembra))))}%` }} />}
          </div>
          <div className="mt-1.5 flex justify-between text-[13px] text-texto-suave">
            <span>Sembrado el {ddmm(p.fechaSiembra)}</span>
            {p.fechaCosechaEstimada && <span>Cosecha cerca del {ddmm(p.fechaCosechaEstimada)}</span>}
          </div>
        </div>
      )}

      {uso === 'vacio' && dias && 'descansa' in dias && <p className="text-[15px] font-semibold text-texto">{textoDias(dias)}</p>}

      {mm > 0 && (
        <p className="flex items-center gap-2.5 rounded-[14px] bg-fondo px-3.5 py-2.5 text-[14.5px] text-texto">
          <Icono nombre="Lluvia" tamano={16} className="text-sky" />
          <span>
            <b>{Math.round(mm)} mm</b> {entrada ? 'desde que entraron' : uso === 'agricola' ? 'desde la siembra' : 'en el descanso'}
          </span>
        </p>
      )}

      {obs && (
        <div className={cn('rounded-[14px] px-3.5 py-2.5 text-[14.5px]', alerta ? 'bg-estado-problema-suave text-estado-problema-texto' : 'bg-fondo text-texto')}>
          <b>Última recorrida, {ddmm(obs.fecha)}:</b>{' '}
          {[obs.pasto && `pasto ${PASTO[obs.pasto].toLowerCase()}`, obs.agua && `agua ${AGUA[obs.agua].toLowerCase()}`, obs.electrico === 'cortado' && 'eléctrico cortado'].filter(Boolean).join(', ') || 'sin novedades'}
          {obs.novedad && <span className="block text-[13.5px]">«{obs.novedad}»</span>}
        </div>
      )}

      {uso === 'agricola' && labores.length > 0 && (
        <div>
          <p className={cn(BAJADA, 'font-semibold')}>Lo último</p>
          <ul className="mt-1 flex flex-col divide-y divide-borde">
            {labores.slice(0, 3).map((l, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-1.5 text-[14.5px]">
                <b className="text-texto">{LABOR[l.tipo]}</b>
                <span className="flex-1 truncate text-right text-[13px] text-texto-suave">{l.cultivo ?? l.nota ?? ''}</span>
                <b className="tabular-nums text-texto">{ddmm(l.fecha)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {uso === 'ganadero' && veHacienda && p.cabezas > 0 && (
          <button type="button" onClick={() => navigate(`/campo/hacienda?potrero=${p.id}`)} className="flex h-10 items-center gap-1.5 rounded-full bg-principal px-4 text-[14px] font-bold text-principal-texto">
            Ver {p.cabezas === 1 ? 'el animal' : `los ${p.cabezas} animales`}
            <Icono nombre="Siguiente" tamano={16} />
          </button>
        )}
        <button type="button" onClick={() => setVerHistoria((x) => !x)} aria-expanded={verHistoria} className="flex h-10 items-center gap-1.5 rounded-full border-[1.5px] border-principal/55 px-4 text-[14px] font-bold text-principal">
          {verHistoria ? 'Ocultar la historia' : 'Ver su historia'}
          <Icono nombre="Desplegar" tamano={16} className={cn('transition-transform', verHistoria && 'rotate-180')} />
        </button>
      </div>

      {verHistoria &&
        (historia.length === 0 ? (
          <p className={BAJADA}>Todavía no hay nada anotado en este potrero.</p>
        ) : (
          <ol className="flex flex-col">
            {historia.slice(0, 20).map((h, i, arr) => (
              <li key={i} className="grid grid-cols-[44px_12px_minmax(0,1fr)] gap-x-3">
                <span className="pt-0.5 text-right text-[13.5px] font-bold tabular-nums text-texto">{ddmm(h.fecha)}</span>
                <span className="flex flex-col items-center">
                  <span className={cn('mt-1.5 size-2.5 rounded-full', h.tipo === 'recorrida' ? 'bg-salvia' : h.tipo === 'labor' ? 'bg-trigo-400' : 'bg-principal')} />
                  {i < arr.length - 1 && <span className="w-px flex-1 bg-borde" />}
                </span>
                <div className="pb-3">
                  <p className="text-[15px] font-semibold text-texto">{h.titulo}</p>
                  {h.detalle && <p className={BAJADA}>{h.detalle}</p>}
                  {quienCargo(h.createdBy, h.canal) && <p className="text-[12.5px] font-semibold text-acento-texto">{quienCargo(h.createdBy, h.canal)}</p>}
                </div>
              </li>
            ))}
          </ol>
        ))}
    </section>
  )
}
