import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import arreo from '@/assets/tropero/arreo.webp'
import { Icono } from '@/components/tropero/icono'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useAnimales, useEventosSenales, usePotreros, useSalidasSinIdentificar } from '@/features/hacienda/hooks'
import { categoriaNombre } from '@/features/hacienda/labels'
import { resumirEventos } from '@/features/hacienda/senales'
import { ESTADO_TEXTO, filasDeSalidas, filasDelRodeo, juntarSinCaravana, potrerosDelRodeo, resumirRodeo, type Estado, type FilaRodeo, type GrupoSinCaravana } from '@/features/hacienda/tropero/rodeo'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import { BAJADA, MONTO, TARJETA } from './sistema'
import { Barra, Encabezado, Portada } from './sistema-ui'

/**
 * Hacienda en el celular (Lau, 17/11): para ver el rodeo y encontrar un animal
 * rápido. Arriba cuánto hay y de qué; enseguida el buscador de caravanas; y la
 * lista: sin buscar, cada potrero con lo que tiene; buscando, filtrando o
 * tocando un potrero, los animales (los de caravana de a uno, los sin caravana
 * juntos). Se mira; lo que entra y sale se manda por audio o se carga en la compu.
 */

const CURVA = [0.22, 1, 0.36, 1] as const
const COLOR: Record<string, string> = { vaca: '#b85c2e', vaquillona: '#d98a5f', ternera: '#ecc46a', ternero: '#9aa384', novillo: '#6f775c', capon: '#5b6250', toro: '#3e4434', oveja: '#cfc6b6', yegua: '#8f877b' }
const OTRO = '#c8c1b4'
/** Los filtros que sirven en el campo: lo que pide hacer algo y lo que falta identificar. */
const FILTROS: Estado[] = ['destetar', 'vender', 'retiro', 'vacia', 'prenada', 'sinCaravana', 'sinElectronica']
const MAX = 40

export function HaciendaCelu() {
  const reducir = useReducedMotion()
  const animales = useAnimales()
  const potreros = usePotreros()
  const eventos = useEventosSenales()
  const salidasQ = useSalidasSinIdentificar()
  const elegido = useCampoElegido()
  const campoId = elegido.elegido?.id ?? null
  const [buscar, setBuscar] = useState('')
  const [estado, setEstado] = useState<Estado | null>(null)
  const [potrero, setPotrero] = useState<string | null | undefined>(undefined)
  const [mas, setMas] = useState(false)
  const entra = (i: number) => (reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.05, ease: CURVA } })

  const pots = useMemo(() => (potreros.data ?? []).map((p) => ({ id: p.id, nombre: p.nombre, campo_id: p.campo_id })), [potreros.data])
  const base = useMemo(() => {
    const activos = (animales.data ?? []).filter((a) => a.estado === 'activo' && a.id)
    const filas = filasDelRodeo(
      activos.map((a) => ({ id: a.id!, categoria: a.categoria, fecha_nacimiento: a.fecha_nacimiento, potrero_id: a.potrero_id, caravana_visual: a.caravana_visual, caravana_rfid: a.caravana_rfid })),
      pots,
      elegido.campos,
      resumirEventos(eventos.data ?? []),
      hoyLocal(),
    )
    return campoId ? filas.filter((f) => f.campoId === campoId) : filas
  }, [animales.data, pots, eventos.data, elegido.campos, campoId])

  if (animales.isLoading || potreros.isLoading) return <div className="m-4 h-[300px] animate-pulse rounded-[20px] bg-superficie-hundida" aria-busy />

  const salidas = filasDeSalidas(salidasQ.data ?? [], pots, elegido.campos).filter((x) => !campoId || x.campoId === campoId)
  const resumen = resumirRodeo(base, elegido.campos, salidas)
  const q = buscar.trim().replace(/\s+/g, '')
  const filtrando = !!q || !!estado || potrero !== undefined
  // Buscar una caravana busca en todo; el filtro y el potrero se suman.
  const lista = base.filter(
    (f) =>
      (!q || (f.visual ?? '').replace(/\s+/g, '').includes(q) || (f.rfid ?? '').replace(/\s+/g, '').includes(q)) &&
      (q || !estado || f.estado === estado) &&
      (q || potrero === undefined || f.potreroId === potrero),
  )
  const items = juntarSinCaravana(lista)
  const visibles = mas ? items : items.slice(0, MAX)
  const grupos = potrerosDelRodeo(base)
  const nombrePotrero = potrero === undefined ? null : potrero === null ? 'Sin potrero' : (grupos.find((g) => g.potreroId === potrero)?.donde ?? '')
  const limpiar = () => {
    setBuscar('')
    setEstado(null)
    setPotrero(undefined)
    setMas(false)
  }

  return (
    <div className="h-full overflow-y-auto bg-fondo">
      <div className="flex flex-col gap-8 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-6">
        <Barra />
        <motion.section {...entra(0)} aria-labelledby="hacienda-titulo" className="flex flex-col gap-3">
          <Portada id="hacienda-titulo" titulo="Hacienda" imagen={arreo} posicion="70% 50%" />
          {/* Cuánto hay y de qué. */}
          <div className={cn(TARJETA, 'flex flex-col gap-3 p-4')}>
            <p className="flex items-baseline gap-2">
              <span className="titulo-display text-[34px] leading-none text-texto">{resumen.total.toLocaleString('es-AR')}</span>
              <span className={cn(BAJADA, 'font-semibold')}>cabezas</span>
            </p>
            {resumen.porCategoria.length > 0 && (
              <>
                <span className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
                  {resumen.porCategoria.map((c) => (
                    <span key={c.categoria} style={{ flexGrow: c.cabezas, background: COLOR[c.categoria] ?? OTRO }} />
                  ))}
                </span>
                <ul className="flex flex-wrap gap-2">
                  {resumen.porCategoria.map((c) => (
                    <li key={c.categoria} className="inline-flex items-center gap-1.5 rounded-full bg-fondo py-1.5 pr-3 pl-2.5 text-[13.5px] text-texto">
                      <span className="size-2.5 rounded-[3px]" style={{ background: COLOR[c.categoria] ?? OTRO }} />
                      {categoriaNombre(c.categoria, c.cabezas)} <b className="font-bold tabular-nums">{c.cabezas.toLocaleString('es-AR')}</b>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </motion.section>

        {/* Buscar: lo primero para encontrar un animal. */}
        <motion.section {...entra(1)} aria-label="Buscar un animal" className="flex flex-col gap-3">
          <label className="flex h-12 items-center gap-2.5 rounded-full border-[1.5px] border-borde bg-superficie px-4 focus-within:border-principal">
            <Icono nombre="Buscar" tamano={16} className="shrink-0 text-texto-suave" />
            <input
              value={buscar}
              onChange={(e) => (setBuscar(e.target.value), setMas(false))}
              inputMode="search"
              placeholder="Buscá una caravana"
              aria-label="Buscá una caravana"
              className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-texto outline-none placeholder:text-texto-suave"
            />
            {buscar && (
              <button type="button" onClick={() => setBuscar('')} aria-label="Borrar la búsqueda" className="grid size-8 place-items-center rounded-full text-texto-suave">
                <Icono nombre="Cerrar" tamano={16} />
              </button>
            )}
          </label>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {FILTROS.filter((e) => (resumen.porEstado[e] ?? 0) > 0).map((e) => (
              <button key={e} type="button" onClick={() => (setEstado((x) => (x === e ? null : e)), setMas(false))} aria-pressed={estado === e} className={cn('flex h-9 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[13.5px] font-bold whitespace-nowrap', estado === e ? 'border-principal bg-principal text-principal-texto' : 'border-borde bg-superficie text-texto')}>
                {ESTADO_TEXTO[e]}
                <span className={cn('tabular-nums', estado === e ? 'text-principal-texto/80' : 'text-texto-suave')}>{resumen.porEstado[e]}</span>
              </button>
            ))}
          </div>
        </motion.section>

        <motion.section {...entra(2)} aria-labelledby="hacienda-lista" className={cn(TARJETA, 'p-4')}>
          {filtrando ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <Encabezado id="hacienda-lista" titulo={q ? `Caravana «${buscar.trim()}»` : estado ? ESTADO_TEXTO[estado] : (nombrePotrero ?? '')} bajada={`${lista.length.toLocaleString('es-AR')} ${lista.length === 1 ? 'animal' : 'animales'}${nombrePotrero && (q || estado) ? ` · ${nombrePotrero}` : ''}`} />
                <button type="button" onClick={limpiar} className="mt-1 shrink-0 text-[14px] font-bold text-principal">
                  Ver todo
                </button>
              </div>
              {lista.length === 0 ? (
                <p className={cn(BAJADA, 'mt-3')}>{q ? 'No hay ningún animal con esa caravana.' : 'No hay animales acá.'}</p>
              ) : (
                <ul className="mt-3 divide-y divide-borde">
                  {visibles.map((it) => (it.tipo === 'animal' ? <FilaAnimal key={it.f.id} f={it.f} /> : <FilaGrupo key={it.g.key} g={it.g} />))}
                </ul>
              )}
              {items.length > MAX && (
                <button type="button" onClick={() => setMas((x) => !x)} className="mt-3 flex w-full items-center justify-center gap-1.5 border-t border-borde pt-3 text-[14px] font-bold text-principal">
                  {mas ? 'Ver menos' : 'Ver más'}
                  <Icono nombre="Desplegar" tamano={16} className={cn('transition-transform', mas && 'rotate-180')} />
                </button>
              )}
            </>
          ) : (
            <>
              <Encabezado id="hacienda-lista" titulo="Por potrero" bajada="Tocá uno para ver sus animales" />
              <ul className="mt-3 divide-y divide-borde">
                {grupos.map((g) => (
                  <li key={g.potreroId ?? 'sin'}>
                    <button type="button" onClick={() => setPotrero(g.potreroId)} className="flex w-full items-center gap-3 py-3 text-left">
                      <span className={cn('grid h-9 min-w-9 shrink-0 place-items-center rounded-full px-2 text-[13px] font-extrabold', g.potreroId ? 'bg-superficie-hundida text-texto' : 'border-[1.5px] border-dashed border-acento text-acento-texto')}>
                        {g.potreroId ? (g.donde ?? '').split(',')[0] : '?'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-texto">
                          {g.porCategoria
                            .slice(0, 2)
                            .map((c) => `${c.n} ${c.categoria ? categoriaNombre(c.categoria, c.n).toLocaleLowerCase('es-AR') : 'sin categoría'}`)
                            .join(', ')}
                          {g.porCategoria.length > 2 ? '…' : ''}
                        </span>
                        <span className={BAJADA}>
                          {g.potreroId ? (g.donde ?? '').split(', ').slice(1).join(', ') || 'Potrero' : 'Sin potrero'}
                          {g.atender > 0 ? ` · ${g.atender} para atender` : ''}
                        </span>
                      </span>
                      <span className={cn(MONTO, 'text-texto')}>{g.total}</span>
                      <Icono nombre="Siguiente" tamano={16} className="shrink-0 text-texto-suave" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </motion.section>
        <div aria-hidden className="h-10" />
      </div>
    </div>
  )
}

/** Un animal con caravana: se reconoce por el número; tocándolo, lo que se sabe de él. */
function FilaAnimal({ f }: { f: FilaRodeo }) {
  const [abierto, setAbierto] = useState(false)
  const datos = [
    ['Caravana electrónica', f.rfid],
    ['Edad', f.edad],
    ['Peso', f.peso],
    ['Tacto', f.tacto],
    ['Retiro', f.retiro],
    ['Lo último', f.ultimoDato],
  ].filter((x): x is [string, string] => !!x[1])
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <button type="button" onClick={() => setAbierto((x) => !x)} aria-expanded={abierto} className="flex w-full items-center gap-3 text-left">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f7e7bd] text-acento-texto">
          <Icono nombre="Caravana" tamano={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-texto">{f.visual ?? f.rfid}</span>
          <span className={cn(BAJADA, 'block truncate')}>
            {f.queEs}
            {f.donde ? ` · ${f.donde}` : ''}
          </span>
        </span>
        {f.estado !== 'nada' && <Chip estado={f.estado} />}
      </button>
      {abierto && (
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 pl-12 text-[14px]">
          {datos.length === 0 ? (
            <dd className={cn(BAJADA, 'col-span-2')}>Todavía no hay datos de este animal.</dd>
          ) : (
            datos.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-texto-suave">{k}</dt>
                <dd className="truncate font-semibold text-texto">{v}</dd>
              </div>
            ))
          )}
        </dl>
      )}
    </li>
  )
}

/** Los sin caravana, juntos: no hay cómo distinguir uno de otro. */
function FilaGrupo({ g }: { g: GrupoSinCaravana }) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-superficie-hundida text-texto-suave">
        <Icono nombre="Vaca" tamano={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-texto">
          {g.n} {g.categoria ? categoriaNombre(g.categoria, g.n).toLocaleLowerCase('es-AR') : 'sin categoría'} sin caravana
        </span>
        <span className={cn(BAJADA, 'block truncate')}>{g.donde ?? 'Sin potrero'}</span>
      </span>
      {g.estado !== 'nada' && g.estado !== 'sinCaravana' && <Chip estado={g.estado} />}
    </li>
  )
}

function Chip({ estado }: { estado: Estado }) {
  const atender = estado === 'retiro' || estado === 'destetar' || estado === 'vender' || estado === 'vacia'
  return <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-bold whitespace-nowrap', atender ? 'bg-estado-atencion-suave text-estado-atencion-texto' : 'bg-superficie-hundida text-texto-suave')}>{ESTADO_TEXTO[estado]}</span>
}
