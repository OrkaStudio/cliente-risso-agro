import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Icono } from '@/components/tropero/icono'
import { BotonChico } from '@/components/tropero/boton'
import arreo from '@/assets/tropero/arreo.webp'
import { Cabecera } from '@/components/tropero/cabecera'
import { useCampoElegido, type CampoElegible } from '@/features/campos/campo-elegido'
import { CampoVisto } from '@/features/campos/campo-visto'
import { useCamposConPotreros } from '@/features/campos/hooks'
import { caraSinHacienda } from './sin-hacienda'
import { SinHacienda } from './sin-hacienda-vista'
import { useAnimales, useBajas, useEventosSenales, usePotreros, useSalidasSinIdentificar } from '@/features/hacienda/hooks'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { categoriaNombre, especiePorCategoria, type Especie } from '@/features/hacienda/labels'
import { resumirEventos } from '@/features/hacienda/senales'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import { IdentificarSalidas } from './caravanas-paneles'
import { CargarCaravanas } from './caravanas-carga'
import { EntradasSalidas } from './entradas-salidas-panel'
import { AnimalNuevo } from './paneles'
import { ESTADO_TEXTO, filasDeSalidas, filasDelRodeo, juntarSinCaravana, potrerosDelRodeo, resumirRodeo, type Estado, type FilaRodeo, type FilaSalida, type GrupoPotrero, type GrupoSinCaravana } from './rodeo'
import { usePermiso } from '@/features/empresa/use-permiso'

const CURVA = [0.22, 1, 0.36, 1] as const
/** Cuántas filas se ven antes de «Ver los N». */
const PRIMERAS = 12
/** `?potrero=sin`: los que no están en ningún potrero. */
const SIN_POTRERO = 'sin'
/** Hay algún filtro de estado (una pestaña) elegido. */
const filtroActivoDe = (salieron: boolean, sinIdentificar: boolean, estado: string | null) => salieron || sinIdentificar || !!estado
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
type Filtro = Estado | 'sinIdentificar' | 'salieron'
const GRUPO_ATENDER = ['sinIdentificar', 'retiro', 'destetar', 'vacia', 'vender'] as const
const GRUPO_DATOS = ['sinCaravana', 'sinElectronica'] as const
const TEXTO_FILTRO: Record<string, string> = { sinIdentificar: 'Sin identificar', ...Object.fromEntries(FILTROS.map((f) => [f.estado, f.texto])) }
/** Qué es cada filtro y qué conviene hacer: una línea, debajo de las píldoras. */
const EXPLICA: Record<string, string> = {
  sinIdentificar: 'Salieron sin decir cuál. Tocá la fila para decir cuál fue.',
  retiro: 'Tienen un tratamiento con retiro: no se pueden vender hasta la fecha.',
  destetar: 'Terneros de 6 a 8 meses. Cuando los destetes, anotalo en su ficha.',
  vacia: 'Dieron vacías en el último tacto. Mirá si conviene venderlas o darles otro servicio.',
  vender: 'Novillos que pasaron los 400 kg.',
  sinCaravana: 'No tienen caravana: se la ponés con una planilla, o abriendo un grupo, desde la ficha de cada uno.',
  sinElectronica: 'Tienen la visible pero no el chip.',
  salieron: 'Vendidos y muertos, del más reciente al más viejo.',
  prenada: '',
  nada: '',
}
const COLUMNA: Record<string, string> = {
  todos: 'Último dato',
  sinIdentificar: 'Último dato',
  retiro: 'Qué le dieron y hasta cuándo',
  destetar: 'Último peso',
  vacia: 'Tacto',
  vender: 'Último peso',
  sinCaravana: 'Último dato',
  sinElectronica: 'Cómo completarla',
  salieron: 'Cuándo y cómo',
  prenada: 'Último dato',
  nada: 'Último dato',
}

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
  const { carga } = usePermiso('hacienda')
  const navigate = useNavigate()
  const reducir = useReducedMotion()
  const [params, setParams] = useSearchParams()
  const animales = useAnimales()
  const potreros = usePotreros()
  const camposQ = useCamposConPotreros()
  const eventos = useEventosSenales()
  const elegido = useCampoElegido()
  const [especie, setEspecie] = useState<Vista>('todas')
  const [categoria, setCategoria] = useState('')
  const [buscar, setBuscar] = useState('')
  const [todas, setTodas] = useState(false)
  // Con animales con caravana, se puede pasar de «por potrero» a la lista de a uno.
  const [porAnimal, setPorAnimal] = useState(false)
  // Los grupos sin caravana abiertos (se ven sus animales, para llegar a cada ficha).
  // Desde Campos («Ver los animales»): ese potrero llega abierto en la lista, en su
  // lugar, y no en otra vista que no decía dónde estabas (Lau, 25/11).
  const potreroPedido = params.get('potrero')
  const keyPedido = potreroPedido ? `p:${potreroPedido === SIN_POTRERO ? '' : potreroPedido}` : null
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(keyPedido ? [keyPedido] : []))
  const abrirGrupo = (key: string) =>
    setAbiertos((a) => {
      const b = new Set(a)
      if (b.has(key)) b.delete(key)
      else b.add(key)
      return b
    })
  const [nuevo, setNuevo] = useState(false)
  const [entradaSalida, setEntradaSalida] = useState<'entraron' | 'salieron' | null>(null)
  // Los paneles quedan montados mientras salen (si no, se cortan en seco al cerrar)
  // y arrancan de cero cada vez que se abren: `vez` cambia su key al abrir, no al cerrar.
  const [modoES, setModoES] = useState<'entraron' | 'salieron'>('entraron')
  const [vez, setVez] = useState(0)
  const abrirES = (m: 'entraron' | 'salieron') => {
    setModoES(m)
    setVez((v) => v + 1)
    setEntradaSalida(m)
  }
  const abrirPlanilla = () => {
    setVez((v) => v + 1)
    setPanelCaravanas('excel')
  }
  const [panelCaravanas, setPanelCaravanas] = useState<'excel' | 'identificar' | null>(params.get('salida') && carga ? 'identificar' : null)
  const salidasQ = useSalidasSinIdentificar()
  const [salidaFoco, setSalidaFoco] = useState<string | null>(params.get('salida'))
  const { data: membresia } = useEmpresa()
  const estadoParam = params.get('sinCaravana') === '1' ? 'sinCaravana' : params.get('estado')
  const verSinIdentificar = estadoParam === 'sinIdentificar'
  const verSalieron = estadoParam === 'salieron'
  const estado = (verSinIdentificar || verSalieron ? null : estadoParam) as Estado | null
  const bajas = useBajas()

  const campoId = elegido.elegido?.id ?? null
  // Ya cargada la lista, baja hasta ese potrero y saca el pedido de la dirección.
  useEffect(() => {
    if (!keyPedido || animales.isLoading || potreros.isLoading) return
    const t = setTimeout(() => {
      document.getElementById(keyPedido)?.scrollIntoView({ behavior: reducir ? 'auto' : 'smooth', block: 'start' })
      setParams((p) => (p.delete('potrero'), p), { replace: true })
    }, 250)
    return () => clearTimeout(t)
  }, [keyPedido, animales.isLoading, potreros.isLoading]) // eslint-disable-line react-hooks/exhaustive-deps
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

  if (animales.isLoading || potreros.isLoading) return <div className="mx-auto h-[280px] w-full ancho-pagina animate-pulse rounded-[20px] bg-superficie-hundida" aria-busy />
  if (animales.error) return <p className="text-texto-suave">No pudimos cargar la hacienda. Revisá la conexión y probá de nuevo.</p>

  // Las salidas que restaron el número sin decir cuál fue (del campo que se mira).
  const salidasTodas = filasDeSalidas(salidasQ.data ?? [], (potreros.data ?? []).map((p) => ({ id: p.id, nombre: p.nombre, campo_id: p.campo_id })), elegido.campos).filter(
    (x) => !campoId || x.campoId === campoId,
  )
  const resumen = resumirRodeo(base, elegido.campos, salidasTodas)
  const deEspecie = especie === 'todas' ? base : base.filter((f) => f.especie === especie)
  const vistaEspecie = especie
  const salidas = salidasTodas.filter((x) => (especie === 'todas' || x.especie === especie) && (!categoria || x.categoria === categoria))
  const r = resumirRodeo(deEspecie, elegido.campos, especie === 'todas' ? salidasTodas : salidasTodas.filter((x) => x.especie === especie))
  const sinIdentificar = salidas.reduce((t, x) => t + x.pendientes, 0)
  const q = buscar.trim().replace(/\s+/g, '')
  const lista = deEspecie.filter(
    (f) =>
      // Buscar una caravana busca en todo el rodeo, esté en la pestaña que esté.
      !verSalieron &&
      (q || (!verSinIdentificar && (!estado || f.estado === estado))) &&
      (!categoria || f.categoria === categoria) &&
      (!q || (f.visual ?? '').replace(/\s+/g, '').includes(q) || (f.rfid ?? '').replace(/\s+/g, '').includes(q)),
  )
  // Los que ya no están: los de la vista (especie, campo, categoría), del más reciente al más viejo.
  const potCampo = new Map((potreros.data ?? []).map((p) => [p.id, p.campo_id]))
  const bajaDe = new Map((bajas.data ?? []).map((b) => [b.animalId, b]))
  const salidos = (animales.data ?? [])
    .filter((a) => a.estado !== 'activo' && a.estado !== 'corregido' && a.id && a.categoria)
    .filter((a) => (vistaEspecie === 'todas' || especiePorCategoria[a.categoria!] === vistaEspecie) && (!categoria || a.categoria === categoria))
    .filter((a) => !campoId || (a.potrero_id && potCampo.get(a.potrero_id) === campoId))
    .filter((a) => !q || (a.caravana_visual ?? '').replace(/\s+/g, '').includes(q) || (a.caravana_rfid ?? '').replace(/\s+/g, '').includes(q))
    .map((a) => ({ a, b: bajaDe.get(a.id!) }))
    .sort((x, y) => (y.b?.fecha ?? '').localeCompare(x.b?.fecha ?? ''))
  const nSalieron = (animales.data ?? []).filter((a) => a.estado !== 'activo' && a.estado !== 'corregido' && a.categoria && (vistaEspecie === 'todas' || especiePorCategoria[a.categoria] === vistaEspecie) && (!campoId || (a.potrero_id && potCampo.get(a.potrero_id) === campoId))).length
  // Sin buscar ni filtrar: cada potrero con lo que tiene. Si no, de a uno los de
  // caravana y juntos los que no tienen (Lau, 16/11).
  const hayConCaravana = lista.some((f) => f.visual || f.rfid)
  const porPotrero = !q && !filtroActivoDe(verSalieron, verSinIdentificar, estado) && !(porAnimal && hayConCaravana)
  const grupos = porPotrero ? potrerosDelRodeo(lista) : []
  const items = porPotrero ? [] : juntarSinCaravana(lista)
  const visibles = todas ? items : items.slice(0, PRIMERAS)
  // «Todo el rodeo» sólo tiene sentido si hay más de una especie.
  const hayEspecies = (['bovino', 'ovino', 'equino'] as Especie[]).filter((e) => resumen.porEspecie[e] > 0)
  const especies = ESPECIES.filter((e) => (e.especie === 'todas' ? hayEspecies.length > 1 : e.especie === 'bovino' || resumen.porEspecie[e.especie] > 0))
  const vista: Vista = especie === 'todas' && hayEspecies.length <= 1 ? 'bovino' : especie
  // Sin animales en lo que se mira (y sin historia que mostrar): una de dos caras, no un 0 y una tabla vacía.
  const vacio = base.length === 0 && nSalieron === 0 && sinIdentificar === 0
  // Lo general que tiene todo potrero, aunque no se cargue nada más: hectáreas y su campo.
  const infoPotrero = new Map<string, { ha: number | null; campo: CampoElegible | null }>()
  for (const c of camposQ.data ?? []) for (const pt of c.potreros) infoPotrero.set(pt.id, { ha: pt.hectareas, campo: elegido.campos.find((x) => x.id === c.id) ?? null })
  const cara = caraSinHacienda(campoId ? (camposQ.data?.find((c) => c.id === campoId) ?? null) : null)
  const cuantosDe = (e: Vista) => (e === 'todas' ? resumen.total : resumen.porEspecie[e])
  const nombreVista = vista === 'todas' ? (r.total === 1 ? 'cabeza' : 'cabezas') : ESPECIES.find((e) => e.especie === vista)!.nombre.toLowerCase()
  const filtroActivo: Filtro | null = verSalieron ? 'salieron' : verSinIdentificar ? 'sinIdentificar' : estado
  const elegirEstado = (e: Estado | 'sinIdentificar' | 'salieron' | null) => {
    const p = new URLSearchParams(params)
    p.delete('sinCaravana')
    if (e) p.set('estado', e)
    else p.delete('estado')
    setParams(p, { replace: true })
  }
  const entra = (i: number) => (reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.05, ease: CURVA } })

  return (
    <div className="mx-auto flex w-full ancho-pagina flex-col gap-6">
      {/* El encabezado, como el de cada sección (Lau, 06/11): Hacienda, las especies y qué campo. */}
      <motion.div {...entra(0)} className="@container">
        <Cabecera
          imagen={arreo}
          posicion="40% 78%"
          encima={<CampoVisto campos={elegido.campos} elegido={elegido.elegido} />}
        >
          <h1 className="t-pagina text-texto">Hacienda</h1>
          {especies.length > 1 && (
            <div className="mt-3 flex">
          <div role="tablist" aria-label="Especie" className="flex shrink-0 gap-6">
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
                    aria-label={`${e.nombre} ${cuantosDe(e.especie)}`}
                    title={e.nombre}
                    className={cn(
                      'inline-flex items-center gap-1.5 border-b-2 pb-1.5 text-[15px] font-bold whitespace-nowrap transition-colors',
                      vista === e.especie ? 'border-principal text-texto' : 'border-transparent text-texto-suave hover:text-texto',
                    )}
                  >
                    <Icono nombre={e.icono} tamano={16} />
                    <span>{e.nombre}</span>
                    <span className="cifra">{cuantosDe(e.especie)}</span>
                  </button>
                ))}
              </div>
    
            </div>
          )}
        </Cabecera>
      </motion.div>

      {/* El número del rodeo, de dónde y de qué está hecho, y lo que se hace: una sola tarjeta. */}
      <motion.section {...entra(1)} className="grid rounded-[20px] border border-borde bg-superficie lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {vacio ? (
          <SinHacienda
            carga={carga}
            cara={cara}
            campo={elegido.elegido?.nombre ?? null}
            onEntraron={() => abrirES('entraron')}
            onPlanilla={() => abrirPlanilla()}
            onVerCampo={() => navigate('/campos')}
          />
        ) : (
          <>
        <div className="flex flex-col gap-5 px-6 py-5">
        <div>
          <p className="flex items-baseline gap-3">
            <span className="t-numero-hero text-texto">{r.total.toLocaleString('es-AR')}</span>
            <span className="t-tarjeta text-texto">{nombreVista}</span>
          </p>
          {/* De qué campo: la letra y el color de cada uno, como en la barra (Lau, 05/11). */}
          {campoId && elegido.elegido ? (
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              <PastillaCampo campo={elegido.elegido} />
            </ul>
          ) : (
            r.porCampo.length > 1 && (
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                {r.porCampo.map((c) => {
                  const id = elegido.campos.find((x) => x.id === c.id)
                  return id ? <PastillaCampo key={c.id} campo={id} cabezas={c.cabezas} /> : null
                })}
              </ul>
            )
          )}
        </div>

        {/* Con Hacienda en «Ve» no se carga nada (permisos, 13/11). */}
        {carga && (
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            data-guia="hacienda-entraron"
            onClick={() => abrirES('entraron')}
            className="inline-flex h-10 items-center gap-2.5 rounded-full bg-principal py-1 pr-1 pl-4 text-[14.5px] font-bold text-principal-texto hover:bg-terracota-600"
          >
            Entraron
            <span className="grid size-8 place-items-center rounded-full bg-acento text-acento-texto">
              <Icono nombre="Agregar" tamano={16} />
            </span>
          </button>
          <button
            type="button"
            onClick={() => abrirES('salieron')}
            className="inline-flex h-10 items-center justify-center rounded-full border-[1.5px] border-principal bg-superficie px-4 text-[14.5px] font-bold text-principal hover:bg-principal-suave"
          >
            Salieron
          </button>
        </div>
        )}
        </div>
        <div className="flex items-center border-borde px-6 py-5 max-lg:border-t lg:border-l">
          <StockPorCategoria cats={r.porCategoria} total={r.total} />
        </div>
          </>
        )}
            {membresia?.empresa_id && <AnimalNuevo empresaId={membresia.empresa_id} especie={vista === 'todas' ? 'bovino' : vista} abierto={nuevo} onCerrar={() => setNuevo(false)} onVolver={() => (setNuevo(false), abrirES('entraron'))} />}
            {membresia?.empresa_id && (
              <>
                <CargarCaravanas key={`planilla-${vez}`} empresaId={membresia.empresa_id} abierto={panelCaravanas === 'excel'} onCerrar={() => setPanelCaravanas(null)} />
                <IdentificarSalidas
                  empresaId={membresia.empresa_id}
                  abierto={panelCaravanas === 'identificar'}
                  salidaFoco={salidaFoco}
                  onCerrar={() => {
                    setPanelCaravanas(null)
                    setSalidaFoco(null)
                    if (params.has('salida')) {
                      const p = new URLSearchParams(params)
                      p.delete('salida')
                      setParams(p, { replace: true })
                    }
                  }}
                />
              </>
            )}
            {membresia?.empresa_id && (
              <EntradasSalidas
                key={`${modoES}-${vez}`}
                modo={modoES}
                empresaId={membresia.empresa_id}
                abierto={entradaSalida != null}
                onCerrar={() => setEntradaSalida(null)}
                onUnoConCaravana={() => {
                  setEntradaSalida(null)
                  setNuevo(true)
                }}
              />
            )}
      </motion.section>

      {/* Algo para resolver: un aviso con su botón (no es un filtro). */}
      {sinIdentificar > 0 && (
        <motion.div {...entra(2)} className="flex items-center gap-4 rounded-[18px] border border-borde bg-superficie px-5 py-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-estado-atencion-suave text-estado-atencion-texto">
            <Icono nombre="Caravana" />
          </span>
          <p className="min-w-0 flex-1 text-[15px] text-texto">
            <b>
              {sinIdentificar} {sinIdentificar === 1 ? 'animal salió' : 'animales salieron'} sin decir cuál
            </b>
            <span className="block text-[13.5px] text-texto-suave">{carga ? 'Ya se restaron del número. Cuando sepas cuál fue, decilo acá o en su ficha.' : 'Ya se restaron del número.'}</span>
          </p>
          {carga && (
            <BotonChico type="button" onClick={() => setPanelCaravanas('identificar')}>
              {sinIdentificar === 1 ? 'Decir cuál' : 'Decir cuáles'}
            </BotonChico>
          )}
        </motion.div>
      )}

      {/* La lista */}
      {!vacio && (
      <motion.section {...entra(3)} className="overflow-hidden rounded-[20px] border border-borde bg-superficie">
        {/* Filtrar: agrupado por intención (para atender, datos que faltan, los que ya no están). */}
        {(FILTROS.some((f) => r.porEstado[f.estado]) || sinIdentificar > 0 || nSalieron > 0) && (
          <div className="border-b border-borde px-5 pt-4 pb-3.5">
            <div role="tablist" aria-label="Mostrar" className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
              <Pildora activo={!verSinIdentificar && !verSalieron && !estado} onClick={() => elegirEstado(null)} texto="Todos" n={r.total} />
              {(GRUPO_ATENDER.some((e) => (e === 'sinIdentificar' ? sinIdentificar : r.porEstado[e])) ) && (
                <>
                  <span aria-hidden className="mx-1 h-6 w-px bg-borde" />
                  {GRUPO_ATENDER.map((e) => {
                    const n = e === 'sinIdentificar' ? sinIdentificar : (r.porEstado[e] ?? 0)
                    if (!n) return null
                    const activo = e === 'sinIdentificar' ? verSinIdentificar : !verSinIdentificar && !verSalieron && estado === e
                    return <Pildora key={e} activo={activo} onClick={() => elegirEstado(activo ? null : e)} texto={TEXTO_FILTRO[e]} n={n} />
                  })}
                </>
              )}
              {GRUPO_DATOS.some((e) => r.porEstado[e]) && (
                <>
                  <span aria-hidden className="mx-1 h-6 w-px bg-borde" />
                  {GRUPO_DATOS.filter((e) => r.porEstado[e]).map((e) => {
                    const activo = !verSinIdentificar && !verSalieron && estado === e
                    return <Pildora key={e} activo={activo} onClick={() => elegirEstado(activo ? null : e)} texto={TEXTO_FILTRO[e]} n={r.porEstado[e]!} />
                  })}
                </>
              )}
              {nSalieron > 0 && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={verSalieron}
                  onClick={() => elegirEstado(verSalieron ? null : 'salieron')}
                  className={cn('ml-auto inline-flex h-9 items-center gap-1.5 border-b-2 px-1 text-[14.5px] font-bold transition-colors', verSalieron ? 'border-principal text-texto' : 'border-transparent text-texto-suave hover:text-texto')}
                >
                  Salieron <span className="cifra">{nSalieron}</span>
                </button>
              )}
            </div>
            {filtroActivo && <p className="mt-3 text-[14px] text-texto-suave">{EXPLICA[filtroActivo]}</p>}
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
          {carga && (
          <button
            type="button"
            onClick={() => abrirPlanilla()}
            className="inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-principal bg-superficie px-4 text-[14.5px] font-bold text-principal hover:bg-principal-suave"
          >
            <Icono nombre="Comprobante" tamano={16} /> Caravanas desde una planilla
          </button>
          )}
          {!q && !filtroActivo && hayConCaravana && (
            <div role="radiogroup" aria-label="Cómo ver la lista" className="inline-flex h-10 rounded-full bg-superficie-hundida p-1">
              {[
                { valor: false, texto: 'Por potrero' },
                { valor: true, texto: 'Lista' },
              ].map((o) => (
                <button
                  key={o.texto}
                  type="button"
                  role="radio"
                  aria-checked={porAnimal === o.valor}
                  onClick={() => setPorAnimal(o.valor)}
                  className={cn('rounded-full px-4 text-[14px] font-bold transition-colors', porAnimal === o.valor ? 'bg-superficie text-texto shadow-sm' : 'text-texto-suave hover:text-texto')}
                >
                  {o.texto}
                </button>
              ))}
            </div>
          )}
        </div>

        {lista.length === 0 && salidos.length === 0 && (verSalieron || q || !(verSinIdentificar || (!estado && salidas.length > 0))) ? (
          <p className="px-6 py-10 text-center text-[15px] text-texto-suave">
            {deEspecie.length === 0 ? (campoId ? `${elegido.elegido!.nombre} no tiene ${vista === 'todas' ? 'hacienda' : ESPECIES.find((e) => e.especie === vista)!.nombre.toLowerCase()}.` : 'Todavía no hay hacienda cargada.') : 'Ningún animal coincide con lo que elegiste.'}
          </p>
        ) : (
          <table className="w-full text-left">
            {/* Sin encabezados a la vista (Lau, 24/11: menos ruido): cada fila dice lo suyo. */}
            <thead className="sr-only">
              <tr>
                <th>{porPotrero ? 'Potrero' : 'Caravana'}</th>
                <th>{porPotrero ? 'Qué hay' : 'Qué es y dónde está'}</th>
                <th>{porPotrero ? 'Para hacer' : 'Estado'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde/60">
              {!q &&
                !verSalieron &&
                (verSinIdentificar || !estado) &&
                (verSinIdentificar ? salidas : salidas.slice(0, 3)).map((x) => (
                  <FilaDeSalida
                    key={x.salidaId}
                    x={x}
                    onClick={() => {
                      if (!carga) return
                      setSalidaFoco(x.salidaId)
                      setPanelCaravanas('identificar')
                    }}
                  />
                ))}
              {!q && !verSalieron && !verSinIdentificar && !estado && salidas.length > 3 && (
                <tr onClick={() => elegirEstado('sinIdentificar')} className="cursor-pointer transition-colors hover:bg-superficie-hundida/40">
                  <td className="w-px py-3 pr-3.5 pl-5" />
                  <td className="py-3 text-[14px] font-semibold text-texto-suave" colSpan={2}>
                    <button type="button" onClick={(e) => (e.stopPropagation(), elegirEstado('sinIdentificar'))} className="inline-flex items-center gap-1 text-principal hover:underline">
                      Ver las otras {salidas.length - 3} salidas sin decir cuál <Icono nombre="Siguiente" tamano={16} />
                    </button>
                  </td>
                </tr>
              )}
              {/* Cada potrero se despliega ahí mismo con sus animales (Lau, 25/11): suave, sin sacudir la página. */}
              {grupos.map((g) => {
                const key = `p:${g.potreroId ?? ''}`
                const abierto = abiertos.has(key)
                const pot = g.potreroId ? infoPotrero.get(g.potreroId) : undefined
                return (
                  <Fragment key={key}>
                    <FilaPotrero id={key} g={g} ha={pot?.ha ?? null} campo={pot?.campo ?? null} abierto={abierto} onClick={() => abrirGrupo(key)} />
                    <tr aria-hidden={!abierto} className="border-0">
                      <td colSpan={3} className="p-0">
                        <AnimatePresence initial={false}>
                          {abierto && (
                            <motion.div
                              key="adentro"
                              initial={reducir ? { opacity: 0 } : { height: 0, opacity: 0 }}
                              animate={reducir ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                              exit={reducir ? { opacity: 0 } : { height: 0, opacity: 0 }}
                              transition={{ height: { duration: 0.38, ease: CURVA }, opacity: { duration: 0.24 } }}
                              className="overflow-hidden"
                            >
                              <AdentroPotrero
                                items={juntarSinCaravana(lista.filter((f) => f.potreroId === g.potreroId))}
                                abiertos={abiertos}
                                onGrupo={abrirGrupo}
                                onAnimal={(id) => navigate(`/hacienda/${id}`)}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
              {visibles.map((it) =>
                it.tipo === 'animal' ? (
                  <Fila key={it.f.id} f={it.f} filtro={filtroActivo} onClick={() => navigate(`/hacienda/${it.f.id}`)} />
                ) : (
                  <Fragment key={it.g.key}>
                    <FilaSinCaravana g={it.g} filtro={filtroActivo} abierto={abiertos.has(it.g.key)} onClick={() => abrirGrupo(it.g.key)} />
                    {abiertos.has(it.g.key) && it.g.filas.map((f) => <Fila key={f.id} f={f} filtro={filtroActivo} adentro onClick={() => navigate(`/hacienda/${f.id}`)} />)}
                  </Fragment>
                ),
              )}
              {/* Los que salieron: en su pestaña, o si la búsqueda los encuentra. */}
              {(verSalieron || q) &&
                salidos.map(({ a, b }) => <FilaSalido key={a.id} conEstado={!verSalieron} a={a} b={b} donde={a.potrero_id ? (potreros.data?.find((p) => p.id === a.potrero_id)?.nombre ?? '') : ''} onClick={() => navigate(`/hacienda/${a.id}`)} />)}
            </tbody>
          </table>
        )}
        {lista.length > 0 && !verSalieron && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde px-5 py-3.5">
            <p className="text-[14px] text-texto-suave">
              {porPotrero
                ? `${grupos.length === 1 ? 'Un potrero' : `${grupos.length} potreros`}, ${lista.length} ${lista.length === 1 ? 'animal' : 'animales'}. Tocá uno para ver sus animales.`
                : `${lista.length} ${lista.length === 1 ? 'animal' : 'animales'}${items.length < lista.length ? ', los sin caravana juntos' : ''}. Ordenados por lo que hay que hacer.`}
            </p>
            {!porPotrero && items.length > PRIMERAS && (
              <BotonChico type="button" onClick={() => setTodas(!todas)}>
                {todas ? 'Ver menos' : 'Ver todos'}
              </BotonChico>
            )}
          </div>
        )}
      </motion.section>
      )}
    </div>
  )
}

/** La composición del rodeo: una barra (el ancho es la cantidad) y debajo cada categoría con su número. */
function StockPorCategoria({ cats, total }: { cats: { categoria: string; cabezas: number }[]; total: number }) {
  if (total === 0) return <p className="text-[14.5px] text-texto-suave">Todavía no hay hacienda en esta vista.</p>
  return (
    <section aria-label="Por categoría" className="w-full min-w-0">
      <p className="mb-3 text-[14px] font-semibold text-texto-suave">Por categoría</p>
      <div className="flex h-3.5 gap-[3px]">
        {cats.map((c, i) => (
          <span key={c.categoria} className={cn('rounded-full', PALETA[i % PALETA.length])} style={{ flexGrow: c.cabezas }} title={`${categoriaNombre(c.categoria as never, c.cabezas)}: ${c.cabezas}`} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {cats.map((c, i) => (
          <li key={c.categoria} className="flex items-center gap-2 text-[14.5px] text-texto">
            <span className={cn('size-2.5 shrink-0 rounded-full', PALETA[i % PALETA.length])} />
            <span>{categoriaNombre(c.categoria as never, c.cabezas)}</span>
            <b className="t-cifra">{c.cabezas}</b>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Las filas, con la visual de Movimientos (Lau, 24/11): a la izquierda la marca (caravana o
// potrero); qué es, y debajo en gris y en una línea, dónde y el dato; a la derecha, el estado.
const TR = 'group cursor-pointer transition-colors hover:bg-superficie-hundida/40'
const TD1 = 'w-px py-3.5 pr-3.5 pl-5 align-middle'
const TD3 = 'w-px py-3.5 pr-5 text-right align-middle whitespace-nowrap'
const meta = (partes: (string | null | undefined | false)[]) => partes.filter(Boolean).join(' · ')

/** El estado, como una pastilla chica con su punto. */
function Estado({ punto, texto }: { punto: string; texto: string }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-superficie-hundida px-2.5 text-[12.5px] font-bold text-texto">
      <span className={cn('size-2 rounded-full', punto)} />
      {texto}
    </span>
  )
}

/** Una fila: la caravana como se ve en la oreja, qué es, dónde, el dato y qué hacer. */
function Fila({ f, filtro, onClick, adentro = false, hondo = false, sinDonde = false }: { f: FilaRodeo; filtro: Filtro | null; onClick: () => void; adentro?: boolean; hondo?: boolean; sinDonde?: boolean }) {
  // El dato cambia con el filtro: lo que importa para esa decisión.
  const dato =
    filtro === 'retiro'
      ? f.retiro
      : filtro === 'destetar' || filtro === 'vender'
        ? f.peso
        : filtro === 'vacia'
          ? f.tacto
          : filtro === 'sinCaravana' || filtro === 'sinElectronica'
            ? 'se completa desde su ficha o con una planilla'
            : f.ultimoDato
  // Dentro de su potrero no se repite dónde está; sin nada antes, el dato va sin «·».
  const antes = meta([sinDonde ? null : (f.donde ?? 'Sin potrero'), f.estado === 'sinElectronica' && !filtro ? null : f.visual ? (f.rfid ? null : 'sin electrónica') : f.rfid ? 'sin visible' : null])
  return (
    <tr onClick={onClick} className={cn(TR, adentro && 'bg-fondo/50')}>
      <td className={cn(TD1, adentro && 'pl-10', hondo && 'pl-16')}>
        <a
          href={`/hacienda/${f.id}`}
          onClick={(e) => {
            e.preventDefault()
            onClick()
          }}
          className="inline-flex"
        >
          {f.visual ? (
            <span className="t-cifra inline-grid h-9 min-w-12 place-items-center rounded-[10px] border-[1.5px] border-principal px-2 font-bold text-principal">{f.visual}</span>
          ) : f.rfid ? (
            <span className="t-cifra-chica inline-grid h-9 min-w-12 place-items-center rounded-[10px] border-[1.5px] border-neutro-300 px-2 font-bold text-texto">{f.rfid}</span>
          ) : (
            <span className="inline-grid h-9 min-w-12 place-items-center rounded-[10px] border-[1.5px] border-dashed border-neutro-300 px-2 text-[11.5px] font-semibold text-texto-suave">s/c</span>
          )}
        </a>
      </td>
      <td className="py-3.5 pr-4">
        <span className="block text-[15px] font-semibold text-texto">{f.queEs}</span>
        <span className="mt-0.5 block text-[13px] text-texto-suave">
          {antes}
          {dato && (
            <>
              {antes && ' · '}
              <span className={cn(filtro && 'font-semibold text-texto')}>{filtro && filtro !== 'sinCaravana' && filtro !== 'sinElectronica' ? `${COLUMNA[filtro]}: ${dato}` : dato}</span>
            </>
          )}
        </span>
      </td>
      <td className={TD3}>{!filtro && f.estado !== 'nada' && <Estado punto={PUNTO[f.estado]} texto={ESTADO_TEXTO[f.estado]} />}</td>
    </tr>
  )
}

/** «6,8 cab/ha»: la carga, con un decimal (o dos si es muy baja). */
function carga(cabezas: number, ha: number | null): string | null {
  if (!ha || ha <= 0) return null
  const c = cabezas / ha
  return `${c.toLocaleString('es-AR', { maximumFractionDigits: c < 1 ? 2 : 1 })} cab/ha`
}

/**
 * Un potrero de la lista (Lau, 25/11: «no hay jerarquía»). Primero cuál es y
 * cuántas cabezas tiene; abajo de qué son (barra y números) y la carga, que sale
 * de las hectáreas y vale para todos aunque no se cargue nada más. A la derecha,
 * sólo si hay algo para hacer, y la flecha que se despliega.
 */
function FilaPotrero({ id, g, ha, campo, abierto, onClick }: { id: string; g: GrupoPotrero; ha: number | null; campo: CampoElegible | null; abierto: boolean; onClick: () => void }) {
  const [potrero, nombreCampo] = g.donde ? g.donde.split(', ') : ['Sin potrero', null]
  const cats = g.porCategoria.slice(0, 4)
  const resto = g.porCategoria.slice(4).reduce((t, c) => t + c.n, 0)
  const cxh = carga(g.total, ha)
  return (
    <tr id={id} onClick={onClick} aria-expanded={abierto} className={cn('group scroll-mt-24 cursor-pointer transition-colors duration-300', abierto ? 'bg-superficie-hundida/45' : 'hover:bg-superficie-hundida/30')}>
      <td className="w-px py-4 pr-4 pl-5 align-middle">
        {/* Botón y no link (regla de la marca): el que se alcanza con el teclado. */}
        <button
          type="button"
          aria-expanded={abierto}
          aria-label={`${abierto ? 'Cerrar' : 'Ver'} los animales del ${g.donde ? potrero : 'que no está en un potrero'}`}
          onClick={(e) => (e.stopPropagation(), onClick())}
          className={cn(
            'relative grid size-14 place-items-center rounded-[14px] font-heading text-[19px] font-extrabold tracking-[-0.01em] transition-colors duration-300',
            !g.donde ? 'border-[1.5px] border-dashed border-neutro-300 text-texto-suave' : abierto ? 'bg-texto text-superficie' : 'bg-superficie-hundida text-texto group-hover:bg-neutro-200',
          )}
        >
          {g.donde ? potrero : '?'}
          {campo && (
            <span className="absolute -right-1 -bottom-1 grid size-[18px] place-items-center rounded-[5px] text-[10px] font-extrabold text-white ring-2 ring-superficie" style={{ background: campo.color }}>
              {campo.letra}
            </span>
          )}
        </button>
      </td>
      <td className="py-4 pr-4 align-middle">
        <p className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="text-[19px] leading-none font-extrabold text-texto tabular-nums">{g.total.toLocaleString('es-AR')}</span>
          <span className="text-[14.5px] font-semibold text-texto">{g.total === 1 ? 'cabeza' : 'cabezas'}</span>
          {(cxh || ha) && (
            <span className="text-[13.5px] text-texto-suave">
              {meta([cxh, ha ? `${ha.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ha` : null, nombreCampo])}
            </span>
          )}
          {!g.donde && <span className="text-[13.5px] text-texto-suave">sin potrero asignado</span>}
        </p>
        {/* De qué son: la barra dice la proporción, los números lo exacto. */}
        <div className="mt-2.5 flex max-w-[520px] flex-col gap-1.5">
          <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full">
            {g.porCategoria.map((c, i) => (
              <span key={c.categoria ?? 'x'} className={cn('rounded-full', PALETA[i % PALETA.length])} style={{ flexGrow: c.n }} />
            ))}
          </div>
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-texto-suave">
            {cats.map((c, i) => (
              <span key={c.categoria ?? 'x'} className="inline-flex items-center gap-1.5">
                <span className={cn('size-1.5 rounded-full', PALETA[i % PALETA.length])} />
                <b className="font-bold text-texto tabular-nums">{c.n}</b> {c.categoria ? categoriaNombre(c.categoria, c.n).toLowerCase() : c.n === 1 ? 'animal' : 'animales'}
              </span>
            ))}
            {resto > 0 && <span>y {resto} más</span>}
          </p>
        </div>
      </td>
      <td className="w-px py-4 pr-5 text-right align-middle whitespace-nowrap">
        <span className="inline-flex items-center gap-3">
          {g.atender > 0 && <Estado punto="bg-estado-atencion" texto={g.atender === 1 ? '1 para atender' : `${g.atender} para atender`} />}
          {/* La flecha apunta adonde se abre y gira al cerrarse. */}
          <span className={cn('grid size-9 place-items-center rounded-full transition-[transform,background-color,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]', abierto ? 'rotate-180 bg-texto text-superficie' : 'text-texto-suave group-hover:bg-superficie-hundida group-hover:text-texto')}>
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </span>
      </td>
    </tr>
  )
}

/** El ícono de cada categoría, para que se reconozca sin leer. */
function iconoCategoria(c: FilaRodeo['categoria']): 'Vaca' | 'Ternero' | 'Oveja' | 'Caballo' {
  if (!c) return 'Vaca'
  if (c === 'ternero' || c === 'ternera') return 'Ternero'
  const e = especiePorCategoria[c]
  return e === 'ovino' ? 'Oveja' : e === 'equino' ? 'Caballo' : 'Vaca'
}

/**
 * Lo que hay adentro de un potrero desplegado: una lista propia, más chica y
 * metida un nivel, de un solo renglón por animal (Lau, 25/11: si falta el peso o
 * la edad no queda un hueco). Lo que se sabe va al lado del nombre; el estado, a
 * la derecha. Los sin caravana, juntos por categoría, se abren igual que acá.
 */
function AdentroPotrero({ items, abiertos, onGrupo, onAnimal }: { items: ReturnType<typeof juntarSinCaravana>; abiertos: Set<string>; onGrupo: (k: string) => void; onAnimal: (id: string) => void }) {
  return (
    <div className="border-y border-borde/60 bg-fondo/70 px-5 py-3 pl-[92px]">
      <ul className="divide-y divide-borde/50 overflow-hidden rounded-[14px] bg-superficie shadow-[inset_0_0_0_1px_var(--borde)]">
        {items.map((it) =>
          it.tipo === 'animal' ? (
            <li key={it.f.id}>
              <RenglonAnimal f={it.f} onClick={() => onAnimal(it.f.id)} />
            </li>
          ) : (
            <li key={it.g.key}>
              <button type="button" aria-expanded={abiertos.has(it.g.key)} onClick={() => onGrupo(it.g.key)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-superficie-hundida/40">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-superficie-hundida text-texto">
                  <Icono nombre={iconoCategoria(it.g.categoria)} tamano={16} />
                </span>
                <span className="min-w-0 flex-1 text-[14.5px] text-texto">
                  <b className="font-bold tabular-nums">{it.g.n}</b> {it.g.categoria ? categoriaNombre(it.g.categoria, it.g.n).toLowerCase() : it.g.n === 1 ? 'animal' : 'animales'}
                  <span className="text-texto-suave"> sin caravana</span>
                </span>
                {it.g.estado !== 'nada' && it.g.estado !== 'sinCaravana' && <Estado punto={PUNTO[it.g.estado]} texto={ESTADO_TEXTO[it.g.estado]} />}
                <span className={cn('grid size-7 place-items-center rounded-full text-texto-suave transition-transform duration-300', abiertos.has(it.g.key) && 'rotate-180')}>
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </button>
              <AnimatePresence initial={false}>
                {abiertos.has(it.g.key) && (
                  <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ height: { duration: 0.32, ease: CURVA }, opacity: { duration: 0.2 } }} className="overflow-hidden border-t border-borde/50 bg-fondo/50">
                    {it.g.filas.map((f) => (
                      <li key={f.id} className="pl-6">
                        <RenglonAnimal f={f} onClick={() => onAnimal(f.id)} />
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

/** Un animal en un renglón: la caravana (o su ícono), qué es y lo que se sepa, y su estado. */
function RenglonAnimal({ f, onClick }: { f: FilaRodeo; onClick: () => void }) {
  const dato = f.ultimoDato
  return (
    <a
      href={`/hacienda/${f.id}`}
      onClick={(e) => {
        e.preventDefault()
        onClick()
      }}
      className="group/a flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-superficie-hundida/40"
    >
      {f.visual ? (
        <span className="t-cifra inline-grid h-9 min-w-[52px] place-items-center rounded-[10px] border-[1.5px] border-principal px-2 text-[15px] font-bold text-principal">{f.visual}</span>
      ) : f.rfid ? (
        <span className="t-cifra-chica inline-grid h-9 min-w-[52px] place-items-center rounded-[10px] border-[1.5px] border-neutro-300 px-2 font-bold text-texto">{f.rfid.slice(-4)}</span>
      ) : (
        <span className="grid size-9 place-items-center rounded-[10px] bg-superficie-hundida text-texto-suave">
          <Icono nombre={iconoCategoria(f.categoria)} tamano={16} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[14.5px]">
        <span className="font-semibold text-texto">{f.queEs}</span>
        {dato && <span className="text-texto-suave"> · {dato}</span>}
      </span>
      {/* Sin caravana ya lo dice el ícono en lugar del número. */}
      {f.estado !== 'nada' && f.estado !== 'sinCaravana' && <Estado punto={PUNTO[f.estado]} texto={ESTADO_TEXTO[f.estado]} />}
      <span className="text-texto-suave/50 transition-colors group-hover/a:text-texto">
        <Icono nombre="Siguiente" tamano={16} />
      </span>
    </a>
  )
}

/** Los que no tienen caravana, juntos: no hay cómo distinguirlos uno de otro. Se abre para ver cada uno. */
function FilaSinCaravana({ g, filtro, abierto, onClick, adentro = false }: { g: GrupoSinCaravana; filtro: Filtro | null; abierto: boolean; onClick: () => void; adentro?: boolean }) {
  const que = `${g.n} ${g.categoria ? categoriaNombre(g.categoria, g.n).toLowerCase() : g.n === 1 ? 'animal' : 'animales'}`
  return (
    <tr onClick={onClick} aria-expanded={abierto} className={cn(TR, adentro && 'bg-fondo/50')}>
      <td className={cn(TD1, adentro && 'pl-10')}>
        <span className="inline-grid h-9 min-w-12 place-items-center rounded-[10px] border-[1.5px] border-dashed border-neutro-300 px-2 text-[11.5px] font-semibold text-texto-suave">s/c</span>
      </td>
      <td className="py-3.5 pr-4">
        <button type="button" onClick={(e) => (e.stopPropagation(), onClick())} className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-texto">
          {que} sin caravana
          <span className={cn('text-texto-suave transition-transform', abierto ? '-rotate-90' : 'rotate-90')}>
            <Icono nombre="Siguiente" tamano={16} />
          </span>
        </button>
        <span className="mt-0.5 block text-[13px] text-texto-suave">{meta([adentro ? null : (g.donde ?? 'Sin potrero'), abierto ? null : 'tocá para ver cada uno'])}</span>
      </td>
      <td className={TD3}>{!filtro && g.estado !== 'nada' && <Estado punto={PUNTO[g.estado]} texto={ESTADO_TEXTO[g.estado]} />}</td>
    </tr>
  )
}

const DIA = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Una salida sin identificar, como fila de la lista: no es un animal, es una cuenta pendiente. */
function FilaDeSalida({ x, onClick }: { x: FilaSalida; onClick: () => void }) {
  const que = `${x.pendientes} ${categoriaNombre(x.categoria, x.pendientes).toLowerCase()}`
  const verbo = x.motivo === 'muerte' ? (x.pendientes === 1 ? 'murió' : 'murieron') : x.pendientes === 1 ? 'vendida' : 'vendidas'
  const cual = x.pendientes === 1 ? 'cuál' : 'cuáles'
  return (
    <tr onClick={onClick} className={TR}>
      <td className={TD1}>
        <span className="inline-grid h-9 min-w-12 place-items-center rounded-[10px] border-[1.5px] border-dashed border-estado-atencion text-[16px] font-bold text-estado-atencion-texto">?</span>
      </td>
      <td className="py-3.5 pr-4">
        <span className="block text-[15px] font-semibold text-texto">
          {que} {verbo}
        </span>
        <span className="mt-0.5 block text-[13px] text-texto-suave">{meta([x.donde, `el ${DIA(x.fecha)}, sin decir ${cual}`, x.posibles ? `${x.posibles} pueden ser` : null])}</span>
      </td>
      <td className={TD3}>
        <span className="inline-flex h-8 items-center rounded-full px-3 text-[13px] font-bold text-texto shadow-[inset_0_0_0_1.5px_var(--borde)] transition-colors group-hover:bg-principal group-hover:text-principal-texto group-hover:shadow-none">
          Decir {cual}
        </span>
      </td>
    </tr>
  )
}

/** Un animal que ya no está: cuándo y cómo salió. Gris, para no confundirlo con el rodeo. */
function FilaSalido({ a, b, donde, onClick, conEstado = true }: { conEstado?: boolean; a: { caravana_visual: string | null; caravana_rfid: string | null; categoria: string | null; estado: string | null }; b?: { fecha: string; sinIdentificar: boolean }; donde: string; onClick: () => void }) {
  const fem = ['vaca', 'vaquillona', 'ternera', 'oveja', 'cordera', 'yegua', 'potranca'].includes(a.categoria ?? '')
  const como = a.estado === 'muerto' ? 'Murió' : fem ? 'Vendida' : 'Vendido'
  return (
    <tr onClick={onClick} className={cn(TR, 'text-texto-suave')}>
      <td className={TD1}>
        <span className="t-cifra inline-grid h-9 min-w-12 place-items-center rounded-[10px] border-[1.5px] border-neutro-300 px-2 font-bold text-texto-suave">{a.caravana_visual ?? a.caravana_rfid?.slice(-4) ?? 's/c'}</span>
      </td>
      <td className="py-3.5 pr-4">
        <span className="block text-[15px] font-semibold">{a.categoria ? categoriaNombre(a.categoria as never, 1) : 'Animal'}</span>
        <span className="mt-0.5 block text-[13px]">{meta([b ? `${como} el ${DIA(b.fecha)}${b.sinIdentificar ? ', sin identificar' : ''}` : como, donde ? `salió del ${donde}` : null])}</span>
      </td>
      <td className={TD3}>{conEstado && <Estado punto="bg-neutro-400" texto={como} />}</td>
    </tr>
  )
}

/** Una píldora de filtro: la elegida en tinta, el resto con borde. */
function Pildora({ activo, onClick, texto, n, punto }: { activo: boolean; onClick: () => void; texto: string; n: number; punto?: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activo}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-2 border-b-2 px-1 text-[14.5px] font-bold transition-colors',
        activo ? 'border-principal text-texto' : 'border-transparent text-texto-suave hover:text-texto',
      )}
    >
      {punto && <span className={cn('size-2 rounded-full', punto)} />}
      {texto}
      <span className={cn('t-cifra-chica', activo ? 'text-principal' : 'text-texto-suave')}>{n}</span>
    </button>
  )
}

/** Un campo con su letra y su color, en una pastilla teñida de ese color (con sus cabezas si hay varios). */
function PastillaCampo({ campo, cabezas }: { campo: CampoElegible; cabezas?: number }) {
  return (
    <li className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-texto">
      <span className="grid size-5 place-items-center rounded-[6px] text-[11px] font-extrabold text-white" style={{ background: campo.color }}>
        {campo.letra}
      </span>
      {cabezas === undefined ? `En ${campo.nombre}` : campo.nombre}
      {cabezas !== undefined && <b className="t-cifra text-texto">{cabezas}</b>}
    </li>
  )
}
