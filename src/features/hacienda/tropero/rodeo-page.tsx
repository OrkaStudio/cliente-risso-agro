import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Icono } from '@/components/tropero/icono'
import { BotonChico } from '@/components/tropero/boton'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { QueCampo } from '@/features/campos/que-campo'
import { useAnimales, useBajasPendientes, useEventosSenales, usePotreros } from '@/features/hacienda/hooks'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { categoriaNombre, type Especie } from '@/features/hacienda/labels'
import { resumirEventos } from '@/features/hacienda/senales'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import { CaravanasPorExcel, IdentificarSalidas } from './caravanas-paneles'
import { EntradasSalidas } from './entradas-salidas-panel'
import { AnimalNuevo } from './paneles'
import { bajadaDelRodeo, ESTADO_TEXTO, filasDelRodeo, resumirRodeo, type Estado, type FilaRodeo } from './rodeo'

const CURVA = [0.22, 1, 0.36, 1] as const
/** Cuántas filas se ven antes de «Ver los N». */
const PRIMERAS = 12
type Vista = Especie | 'todas'
const ESPECIES: { especie: Vista; nombre: string; icono: 'Hacienda' | 'Vaca' | 'Oveja' | 'Caballo' }[] = [
  { especie: 'todas', nombre: 'Todo el rodeo', icono: 'Hacienda' },
  { especie: 'bovino', nombre: 'Vacunos', icono: 'Vaca' },
  { especie: 'ovino', nombre: 'Ovinos', icono: 'Oveja' },
  { especie: 'equino', nombre: 'Equinos', icono: 'Caballo' },
]
/** La paleta del manual, de la categoría con más cabezas a la de menos. */
const PALETA = ['bg-terracota-500', 'bg-terracota-800', 'bg-trigo-400', 'bg-salvia', 'bg-terracota-300', 'bg-tinta', 'bg-neutro-400', 'bg-trigo-700']
/** Las pestañas de la lista: muestran sólo los de ese estado (filtran). */
const FILTROS: { estado: Estado; texto: string }[] = [
  { estado: 'retiro', texto: 'En retiro' },
  { estado: 'destetar', texto: 'Para destetar' },
  { estado: 'vacia', texto: 'Vacías' },
  { estado: 'vender', texto: 'Para vender' },
  { estado: 'sinElectronica', texto: 'Sin electrónica' },
  { estado: 'sinCaravana', texto: 'Sin caravana' },
]
/** El punto de cada estado: el color sólo marca el significado. */
const PUNTO: Record<Estado, string> = {
  retiro: 'bg-estado-problema',
  destetar: 'bg-trigo-500',
  vender: 'bg-principal',
  vacia: 'bg-estado-problema',
  sinCaravana: 'bg-neutro-400',
  sinElectronica: 'bg-neutro-400',
  prenada: 'bg-salvia',
  nada: 'bg-transparent',
}

/**
 * Hacienda · El rodeo (página 35). Cuántas cabezas hay y dónde, de qué
 * categorías, y la lista de animales ordenada por lo que hay que hacer. Mira el
 * mismo campo que el Inicio («Estás viendo»).
 */
export function RodeoPage() {
  const navigate = useNavigate()
  const reducir = useReducedMotion()
  const [params, setParams] = useSearchParams()
  const animales = useAnimales()
  const potreros = usePotreros()
  const eventos = useEventosSenales()
  const elegido = useCampoElegido()
  const [especie, setEspecie] = useState<Vista>('todas')
  const [categoria, setCategoria] = useState('')
  const [buscar, setBuscar] = useState('')
  const [todas, setTodas] = useState(false)
  const [nuevo, setNuevo] = useState(false)
  const [entradaSalida, setEntradaSalida] = useState<'entraron' | 'salieron' | null>(null)
  const [panelCaravanas, setPanelCaravanas] = useState<'excel' | 'identificar' | null>(null)
  const pendientes = useBajasPendientes()
  const { data: membresia } = useEmpresa()
  const estado = (params.get('sinCaravana') === '1' ? 'sinCaravana' : params.get('estado')) as Estado | null

  const campoId = elegido.elegido?.id ?? null
  const base = useMemo(() => {
    const activos = (animales.data ?? []).filter((a) => a.estado === 'activo' && a.id)
    const filas = filasDelRodeo(
      activos.map((a) => ({ id: a.id!, categoria: a.categoria, fecha_nacimiento: a.fecha_nacimiento, potrero_id: a.potrero_id, caravana_visual: a.caravana_visual, caravana_rfid: a.caravana_rfid })),
      (potreros.data ?? []).map((p) => ({ id: p.id, nombre: p.nombre, campo_id: p.campo_id })),
      elegido.campos,
      resumirEventos(eventos.data ?? []),
      hoyLocal(),
    )
    return campoId ? filas.filter((f) => f.campoId === campoId) : filas
  }, [animales.data, potreros.data, eventos.data, elegido.campos, campoId])

  if (animales.isLoading || potreros.isLoading) return <div className="mx-auto h-[280px] w-full max-w-[1104px] animate-pulse rounded-[20px] bg-superficie-hundida" aria-busy />
  if (animales.error) return <p className="text-texto-suave">No pudimos cargar la hacienda. Revisá la conexión y probá de nuevo.</p>

  const resumen = resumirRodeo(base, elegido.campos)
  const deEspecie = especie === 'todas' ? base : base.filter((f) => f.especie === especie)
  const r = resumirRodeo(deEspecie, elegido.campos)
  const q = buscar.trim().replace(/\s+/g, '')
  const lista = deEspecie.filter(
    (f) =>
      (!estado || f.estado === estado) &&
      (!categoria || f.categoria === categoria) &&
      (!q || (f.visual ?? '').replace(/\s+/g, '').includes(q) || (f.rfid ?? '').replace(/\s+/g, '').includes(q)),
  )
  const visibles = todas ? lista : lista.slice(0, PRIMERAS)
  // «Todo el rodeo» sólo tiene sentido si hay más de una especie.
  const hayEspecies = (['bovino', 'ovino', 'equino'] as Especie[]).filter((e) => resumen.porEspecie[e] > 0)
  const especies = ESPECIES.filter((e) => (e.especie === 'todas' ? hayEspecies.length > 1 : e.especie === 'bovino' || resumen.porEspecie[e.especie] > 0))
  const vista: Vista = especie === 'todas' && hayEspecies.length <= 1 ? 'bovino' : especie
  const cuantosDe = (e: Vista) => (e === 'todas' ? resumen.total : resumen.porEspecie[e])
  const nombreVista = vista === 'todas' ? (r.total === 1 ? 'cabeza' : 'cabezas') : ESPECIES.find((e) => e.especie === vista)!.nombre.toLowerCase()
  const nCampos = campoId ? 1 : r.porCampo.length
  const elegirEstado = (e: Estado | null) => {
    const p = new URLSearchParams(params)
    p.delete('sinCaravana')
    if (e) p.set('estado', e)
    else p.delete('estado')
    setParams(p, { replace: true })
  }
  const entra = (i: number) => (reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.05, ease: CURVA } })

  return (
    <div className="mx-auto flex w-full max-w-[1104px] flex-col gap-6">
      {especies.length > 1 && <h1 className="sr-only">Hacienda</h1>}
      {/* Qué especie y qué campo */}
      <motion.div {...entra(0)} className="flex flex-wrap items-end justify-between gap-4">
        {especies.length > 1 ? (
          <div role="tablist" aria-label="Especie" className="flex gap-1 rounded-full border border-borde bg-superficie p-1">
            {especies.map((e) => (
              <button
                key={e.especie}
                type="button"
                role="tab"
                aria-selected={vista === e.especie}
                onClick={() => {
                  setEspecie(e.especie)
                  setCategoria('')
                }}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-full px-4 text-[14px] font-bold transition-colors',
                  vista === e.especie ? 'bg-tinta text-superficie' : 'text-texto hover:bg-superficie-hundida',
                )}
              >
                <Icono nombre={e.icono} tamano={16} />
                {e.nombre} {cuantosDe(e.especie)}
              </button>
            ))}
          </div>
        ) : (
          <h1 className="font-heading text-[22px] font-extrabold text-texto">Hacienda</h1>
        )}
        <QueCampo campos={elegido.campos} elegido={elegido.elegido} elegir={elegido.elegir} />
      </motion.div>

      {/* El número del rodeo y de qué está hecho */}
      <motion.section {...entra(1)} className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex flex-col justify-between gap-5 rounded-[20px] border border-borde bg-superficie px-6 py-5">
          <div className="flex items-end gap-4">
            <p className="titulo-display text-[68px] leading-[0.85] tracking-[-0.03em] text-texto">{r.total.toLocaleString('es-AR')}</p>
            <div className="pb-1">
              <p className="font-heading text-[20px] leading-tight font-extrabold text-texto">
                {nombreVista}
                {campoId ? ` en ${elegido.elegido!.nombre}` : nCampos > 1 ? ` en ${['', '', 'dos', 'tres', 'cuatro', 'cinco'][nCampos] ?? nCampos} campos` : ''}
              </p>
              <p className="text-[14.5px] text-texto-suave">{bajadaDelRodeo(r, resumen, vista, !!campoId) || 'Ordenados por lo que hay que hacer.'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => setEntradaSalida('entraron')}
              className="inline-flex h-10 items-center gap-2.5 rounded-full bg-principal py-1 pr-1 pl-4 text-[14.5px] font-bold text-principal-texto hover:bg-terracota-600"
            >
              Entraron
              <span className="grid size-8 place-items-center rounded-full bg-acento text-acento-texto">
                <Icono nombre="Agregar" tamano={16} />
              </span>
            </button>
            <button
              type="button"
              onClick={() => setEntradaSalida('salieron')}
              className="inline-flex h-10 items-center rounded-full bg-acento px-4 text-[14.5px] font-bold text-acento-texto hover:bg-trigo-500"
            >
              Salieron
            </button>

            {membresia?.empresa_id && <AnimalNuevo empresaId={membresia.empresa_id} especie={vista === 'todas' ? 'bovino' : vista} abierto={nuevo} onCerrar={() => setNuevo(false)} />}
            {membresia?.empresa_id && (
              <>
                <CaravanasPorExcel key={`x${panelCaravanas}`} empresaId={membresia.empresa_id} abierto={panelCaravanas === 'excel'} onCerrar={() => setPanelCaravanas(null)} />
                <IdentificarSalidas empresaId={membresia.empresa_id} abierto={panelCaravanas === 'identificar'} onCerrar={() => setPanelCaravanas(null)} />
              </>
            )}
            {membresia?.empresa_id && entradaSalida && (
              <EntradasSalidas
                key={entradaSalida}
                modo={entradaSalida}
                empresaId={membresia.empresa_id}
                abierto
                onCerrar={() => setEntradaSalida(null)}
                onUnoConCaravana={() => {
                  setEntradaSalida(null)
                  setNuevo(true)
                }}
              />
            )}
          </div>
        </div>
        <StockPorCategoria cats={r.porCategoria} total={r.total} especie={vista} />
      </motion.section>

      {/* Algo para resolver: un aviso con su botón (no es un filtro). */}
      {(pendientes.data?.length ?? 0) > 0 && (
        <motion.div {...entra(2)} className="flex items-center gap-4 rounded-[18px] border border-borde bg-superficie px-5 py-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-estado-atencion-suave text-estado-atencion-texto">
            <Icono nombre="Caravana" />
          </span>
          <p className="min-w-0 flex-1 text-[15px] text-texto">
            <b>
              {pendientes.data!.length} {pendientes.data!.length === 1 ? 'animal salió' : 'animales salieron'} sin decir cuál
            </b>
            <span className="block text-[13.5px] text-texto-suave">Se vendieron o murieron por cantidad. Decí qué caravanas eran para que la ficha de cada uno quede bien.</span>
          </p>
          <BotonChico type="button" onClick={() => setPanelCaravanas('identificar')}>
            Decir cuáles
          </BotonChico>
        </motion.div>
      )}

      {/* La lista */}
      <motion.section {...entra(3)} className="overflow-hidden rounded-[20px] border border-borde bg-superficie">
        {/* Filtrar por lo que hay que hacer: pestañas con su cuenta. */}
        {FILTROS.some((f) => r.porEstado[f.estado]) && (
          <div role="tablist" aria-label="Mostrar" className="flex flex-wrap items-center gap-1 border-b border-borde px-4 pt-3">
            {[{ estado: null as Estado | null, texto: 'Todos', n: r.total }, ...FILTROS.filter((f) => r.porEstado[f.estado]).map((f) => ({ ...f, n: r.porEstado[f.estado]! }))].map((f) => {
              const activo = estado === f.estado
              return (
                <button
                  key={f.texto}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  onClick={() => elegirEstado(f.estado)}
                  className={cn(
                    '-mb-px inline-flex h-10 items-center gap-2 border-b-[2.5px] px-3 text-[14.5px] font-bold transition-colors',
                    activo ? 'border-principal text-texto' : 'border-transparent text-texto-suave hover:text-texto',
                  )}
                >
                  {f.estado && <span className={cn('size-2 rounded-full', PUNTO[f.estado])} />}
                  {f.texto}
                  <span className={cn('cifra rounded-full px-1.5 text-[14px]', activo ? 'bg-principal-suave text-principal' : 'bg-superficie-hundida text-texto-suave')}>{f.n}</span>
                </button>
              )
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-3.5">
          <label className="relative flex h-10 min-w-[220px] flex-1 items-center">
            <span className="pointer-events-none absolute left-3.5 text-texto-suave">
              <Icono nombre="Buscar" tamano={16} />
            </span>
            <span className="sr-only">Buscá una caravana</span>
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              inputMode="numeric"
              placeholder="Buscá una caravana"
              className="h-full w-full rounded-full border border-borde bg-fondo pr-4 pl-10 text-[14.5px] text-texto placeholder:text-texto-suave"
            />
          </label>
          <label className="relative inline-flex h-10 items-center">
            <span className="sr-only">Categoría</span>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="h-full appearance-none rounded-full border border-borde bg-fondo pr-9 pl-4 text-[14.5px] font-semibold text-texto"
            >
              <option value="">Todas las categorías</option>
              {r.porCategoria.map((c) => (
                <option key={c.categoria} value={c.categoria}>
                  {categoriaNombre(c.categoria, 2)} · {c.cabezas}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 rotate-90 text-texto-suave">
              <Icono nombre="Siguiente" tamano={16} />
            </span>
          </label>
          <button
            type="button"
            onClick={() => setPanelCaravanas('excel')}
            className="inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-principal bg-superficie px-4 text-[14.5px] font-bold text-principal hover:bg-principal-suave"
          >
            <Icono nombre="Comprobante" tamano={16} /> Caravanas por Excel
          </button>
        </div>

        {lista.length === 0 ? (
          <p className="px-6 py-10 text-center text-[15px] text-texto-suave">
            {deEspecie.length === 0 ? (campoId ? `${elegido.elegido!.nombre} no tiene ${vista === 'todas' ? 'hacienda' : ESPECIES.find((e) => e.especie === vista)!.nombre.toLowerCase()}.` : 'Todavía no hay hacienda cargada.') : 'Ningún animal coincide con lo que elegiste.'}
          </p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-borde text-[13px] font-semibold text-texto-suave">
                <th className="py-3 pl-5 font-semibold">Caravana</th>
                <th className="py-3 font-semibold">Qué es</th>
                <th className="py-3 font-semibold max-md:hidden">Dónde está</th>
                <th className="py-3 font-semibold max-lg:hidden">Último dato</th>
                <th className="py-3 pr-5 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {visibles.map((f) => (
                <Fila key={f.id} f={f} onClick={() => navigate(`/hacienda/${f.id}`)} />
              ))}
            </tbody>
          </table>
        )}
        {lista.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde px-5 py-3.5">
            <p className="text-[14px] text-texto-suave">
              {todas || lista.length <= PRIMERAS ? `${lista.length} ${lista.length === 1 ? 'animal' : 'animales'}` : `Mostrando ${PRIMERAS} de ${lista.length}`}. Ordenados por lo que hay que hacer.
            </p>
            {lista.length > PRIMERAS && (
              <BotonChico type="button" onClick={() => setTodas(!todas)}>
                {todas ? 'Ver menos' : `Ver los ${lista.length}`}
              </BotonChico>
            )}
          </div>
        )}
      </motion.section>
    </div>
  )
}

/** La barra del stock: el ancho es la cantidad; la leyenda nombra y cuenta. */
function StockPorCategoria({ cats, total, especie }: { cats: { categoria: string; cabezas: number }[]; total: number; especie: Vista }) {
  const nombre = { todas: 'cabezas', bovino: 'vacunos', ovino: 'ovinos', equino: 'equinos' }[especie]
  return (
    <section aria-labelledby="stock" className="rounded-[20px] border border-borde bg-superficie px-6 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="stock" className="font-heading text-[17px] font-extrabold text-texto">
          Stock por categoría
        </h2>
        <span className="text-[13.5px] text-texto-suave">
          {total} {nombre}
        </span>
      </div>
      {total === 0 ? (
        <p className="mt-3 text-[14px] text-texto-suave">Sin {nombre} cargados.</p>
      ) : (
        <>
          <div className="mt-3 flex h-3 gap-[3px]">
            {cats.map((c, i) => (
              <span key={c.categoria} className={cn('rounded-full', PALETA[i % PALETA.length])} style={{ flexGrow: c.cabezas }} />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {cats.map((c, i) => (
              <li key={c.categoria} className="flex items-center gap-2 text-[14.5px] text-texto">
                <span className={cn('size-2.5 rounded-full', PALETA[i % PALETA.length])} />
                {categoriaNombre(c.categoria as never, c.cabezas)}
                <b className="cifra text-[17px]">{c.cabezas}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** Una fila: la caravana como se ve en la oreja, qué es, dónde, lo último y qué hacer. */
function Fila({ f, onClick }: { f: FilaRodeo; onClick: () => void }) {
  return (
    <tr onClick={onClick} className="cursor-pointer transition-colors hover:bg-superficie-hundida/50">
      <td className="py-3 pl-5">
        <a
          href={`/hacienda/${f.id}`}
          onClick={(e) => {
            e.preventDefault()
            onClick()
          }}
          className="inline-flex flex-col items-start"
        >
          {f.visual ? (
            <span className="cifra rounded-[8px] border-[1.5px] border-principal px-2 py-0.5 text-[19px] leading-tight font-bold text-principal">{f.visual}</span>
          ) : f.rfid ? (
            <span className="cifra rounded-[8px] border-[1.5px] border-neutro-300 px-2 py-0.5 text-[15px] leading-tight font-bold text-texto">{f.rfid}</span>
          ) : (
            <span className="rounded-[8px] border-[1.5px] border-dashed border-neutro-300 px-2 py-1 text-[12.5px] font-semibold text-texto-suave">sin caravana</span>
          )}
          {(f.visual || f.rfid) && <span className="cifra mt-1 text-[12px] text-texto-suave">{f.visual ? (f.rfid ?? 'sin electrónica') : 'sin visible'}</span>}
        </a>
      </td>
      <td className="py-3 pr-4 text-[15px] font-semibold text-texto">{f.queEs}</td>
      <td className="py-3 pr-4 text-[14.5px] text-texto-suave max-md:hidden">{f.donde ?? 'Sin potrero'}</td>
      <td className="py-3 pr-4 text-[14.5px] text-texto-suave max-lg:hidden">{f.ultimoDato ?? '—'}</td>
      <td className="py-3 pr-5">
        {f.estado !== 'nada' && (
          <span className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-texto">
            <span className={cn('size-2 rounded-full', PUNTO[f.estado])} />
            {ESTADO_TEXTO[f.estado]}
          </span>
        )}
      </td>
    </tr>
  )
}
