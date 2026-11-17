import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import arreo from '@/assets/tropero/arreo.webp'
import { Icono } from '@/components/tropero/icono'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useAnimales, useEventosSenales, usePotreros, useSalidasSinIdentificar } from '@/features/hacienda/hooks'
import { categoriaNombre } from '@/features/hacienda/labels'
import { resumirEventos } from '@/features/hacienda/senales'
import type { Database } from '@/lib/supabase/types'
import { ESTADO_TEXTO, filasDeSalidas, filasDelRodeo, juntarSinCaravana, potrerosDelRodeo, resumirRodeo, type Estado, type FilaRodeo, type GrupoPotrero, type GrupoSinCaravana } from '@/features/hacienda/tropero/rodeo'

type Categoria = Database['public']['Enums']['categoria_animal']
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import { BAJADA, TARJETA } from './sistema'
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
  const [categoria, setCategoria] = useState<Categoria | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
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
  const filtrando = !!q || !!estado || !!categoria || potrero !== undefined
  // Buscar una caravana busca en todo; el filtro y el potrero se suman.
  const lista = base.filter(
    (f) =>
      (!q || (f.visual ?? '').replace(/\s+/g, '').includes(q) || (f.rfid ?? '').replace(/\s+/g, '').includes(q)) &&
      (q || !estado || f.estado === estado) &&
      (q || !categoria || f.categoria === categoria) &&
      (q || potrero === undefined || f.potreroId === potrero),
  )
  const items = juntarSinCaravana(lista)
  const visibles = mas ? items : items.slice(0, MAX)
  const grupos = potrerosDelRodeo(base)
  const nombrePotrero = potrero === undefined ? null : potrero === null ? 'Sin potrero' : (grupos.find((g) => g.potreroId === potrero)?.donde ?? '')
  const limpiar = () => {
    setBuscar('')
    setEstado(null)
    setCategoria(null)
    setPotrero(undefined)
    setMas(false)
  }

  return (
    <div className="h-full overflow-y-auto">
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
        <motion.section {...entra(1)} aria-label="Buscar un animal" className={cn(TARJETA, 'flex flex-col gap-3 p-3')}>
          <label className="flex h-12 items-center gap-2.5 rounded-full border-[1.5px] border-transparent bg-fondo px-4 focus-within:border-principal">
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
          {/* Los filtros en una sola tira: primero qué es, después lo que hay que hacer (con su punto de color). */}
          <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]" role="group" aria-label="Filtrar">
            {resumen.porCategoria.map((c) => (
              <Filtro key={c.categoria} activo={categoria === c.categoria} n={c.cabezas} onClick={() => (setCategoria((x) => (x === c.categoria ? null : c.categoria)), setMas(false))}>
                <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: COLOR[c.categoria] ?? OTRO }} />
                {categoriaNombre(c.categoria, 2)}
              </Filtro>
            ))}
            {FILTROS.some((e) => (resumen.porEstado[e] ?? 0) > 0) && <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-borde" />}
            {FILTROS.filter((e) => (resumen.porEstado[e] ?? 0) > 0).map((e) => (
              <Filtro key={e} activo={estado === e} n={resumen.porEstado[e]!} onClick={() => (setEstado((x) => (x === e ? null : e)), setMas(false))}>
                <Icono nombre={e === 'sinCaravana' || e === 'sinElectronica' ? 'Caravana' : 'Agenda'} tamano={16} className="size-3.5" />
                {ESTADO_TEXTO[e]}
              </Filtro>
            ))}
          </div>
        </motion.section>

        <motion.section {...entra(2)} aria-labelledby="hacienda-lista" className={cn(TARJETA, 'p-4')}>
          {filtrando ? (
            <>
              <Encabezado id="hacienda-lista" titulo={`${lista.length.toLocaleString('es-AR')} ${lista.length === 1 ? 'animal' : 'animales'}`} bajada={lista.some((f) => f.visual || f.rfid) ? 'Tocá uno para ver su ficha' : 'Sin caravana no se distingue uno de otro'} />
              {/* Lo que se está filtrando, a la vista: cada cosa con su × para sacarla. */}
              <div className="mt-3 flex flex-wrap gap-2">
                {q && <Activo onQuitar={() => setBuscar('')}>Caravana «{buscar.trim()}»</Activo>}
                {potrero !== undefined && <Activo onQuitar={() => setPotrero(undefined)}>{nombrePotrero}</Activo>}
                {categoria && <Activo onQuitar={() => setCategoria(null)}>{categoriaNombre(categoria, 2)}</Activo>}
                {estado && <Activo onQuitar={() => setEstado(null)}>{ESTADO_TEXTO[estado]}</Activo>}
                {[q, potrero !== undefined, categoria, estado].filter(Boolean).length > 1 && (
                  <button type="button" onClick={limpiar} className="h-8 px-1 text-[13.5px] font-bold text-principal">
                    Sacar todo
                  </button>
                )}
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
              <Encabezado id="hacienda-lista" titulo="Por potrero" bajada="Tocá uno para ver qué tiene" />
              <ul className="mt-3 divide-y divide-borde">
                {grupos.map((g) => (
                  <PotreroFila key={g.potreroId ?? 'sin'} g={g} abierto={abierto === `p-${g.potreroId}`} onTocar={() => setAbierto((x) => (x === `p-${g.potreroId}` ? null : `p-${g.potreroId}`))} onVer={() => (setPotrero(g.potreroId), setAbierto(null))} />
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

/** Un animal con caravana: se reconoce por el número; tocándolo, su ficha. */
function FilaAnimal({ f }: { f: FilaRodeo }) {
  const navigate = useNavigate()
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <button type="button" onClick={() => navigate(`/campo/hacienda/${f.id}`)} className="flex w-full items-center gap-3 text-left">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f7e7bd] text-acento-texto">
          <Icono nombre="Caravana" tamano={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-texto">{f.visual ?? f.rfid}</span>
          <span className={cn(BAJADA, 'block truncate')}>{[f.queEs, f.donde, f.ultimoDato].filter(Boolean).join(' · ')}</span>
        </span>
        {f.estado !== 'nada' && <Chip estado={f.estado} />}
        <Icono nombre="Siguiente" tamano={16} className="shrink-0 text-texto-suave" />
      </button>
    </li>
  )
}

/** Los sin caravana, juntos: sin caravana no hay cómo distinguir uno de otro (Lau, 17/11: no se listan de a uno). */
function FilaGrupo({ g }: { g: GrupoSinCaravana }) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-superficie-hundida text-texto-suave">
        <Icono nombre="Vaca" tamano={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-texto">
          {g.n.toLocaleString('es-AR')} {g.categoria ? categoriaNombre(g.categoria, g.n).toLocaleLowerCase('es-AR') : 'sin categoría'} sin caravana
        </span>
        <span className={cn(BAJADA, 'block')}>{[g.donde ?? 'Sin potrero', 'se distinguen cuando tengan caravana'].join(' · ')}</span>
      </span>
      {g.estado !== 'nada' && g.estado !== 'sinCaravana' && <Chip estado={g.estado} />}
    </li>
  )
}

/** Un potrero: qué tiene en una línea; abierto, cada categoría y cuántos tienen caravana. */
function PotreroFila({ g, abierto, onTocar, onVer }: { g: GrupoPotrero; abierto: boolean; onTocar: () => void; onVer: () => void }) {
  const [nombre, ...resto] = (g.donde ?? '').split(', ')
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <button type="button" onClick={onTocar} aria-expanded={abierto} className="flex w-full items-center gap-3 text-left">
        <span className={cn('grid h-9 min-w-9 shrink-0 place-items-center rounded-full px-2 text-[13px] font-extrabold', g.potreroId ? 'bg-superficie-hundida text-texto' : 'border-[1.5px] border-dashed border-acento text-acento-texto')}>{g.potreroId ? nombre : '?'}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-texto">
            {g.total.toLocaleString('es-AR')} {g.total === 1 ? 'animal' : 'animales'}
            {g.potreroId ? '' : ' sin potrero'}
          </span>
          <span className={cn(BAJADA, 'block truncate')}>
            {[
              g.porCategoria
                .slice(0, 2)
                .map((c) => `${c.n.toLocaleString('es-AR')} ${c.categoria ? categoriaNombre(c.categoria, c.n).toLocaleLowerCase('es-AR') : 'sin categoría'}`)
                .join(', ') + (g.porCategoria.length > 2 ? '…' : ''),
              resto.join(', '),
              g.atender > 0 ? `${g.atender} para atender` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <Icono nombre="Desplegar" tamano={16} className={cn('shrink-0 text-texto-suave transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <div className="mt-3 ml-12 flex flex-col gap-3">
          <span className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
            {g.porCategoria.map((c) => (
              <span key={c.categoria ?? 'sin'} style={{ flexGrow: c.n, background: (c.categoria && COLOR[c.categoria]) || OTRO }} />
            ))}
          </span>
          <ul className="flex flex-col gap-1.5">
            {g.porCategoria.map((c) => (
              <li key={c.categoria ?? 'sin'} className="flex items-center gap-2 text-[14px] text-texto">
                <span className="size-2.5 rounded-[3px]" style={{ background: (c.categoria && COLOR[c.categoria]) || OTRO }} />
                <span className="flex-1">{c.categoria ? categoriaNombre(c.categoria, c.n) : 'Sin categoría'}</span>
                <b className="tabular-nums">{c.n.toLocaleString('es-AR')}</b>
              </li>
            ))}
          </ul>
          <p className={BAJADA}>
            {g.conCaravana.toLocaleString('es-AR')} con caravana · {(g.total - g.conCaravana).toLocaleString('es-AR')} sin caravana
          </p>
          <button type="button" onClick={onVer} className="flex h-9 items-center justify-center gap-1.5 self-start rounded-full border-[1.5px] border-principal/55 px-4 text-[13.5px] font-bold text-principal">
            Ver sus animales
            <Icono nombre="Siguiente" tamano={16} />
          </button>
        </div>
      )}
    </li>
  )
}

function Filtro({ activo, n, onClick, children }: { activo: boolean; n: number; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activo} className={cn('flex h-9 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[13.5px] font-bold whitespace-nowrap', activo ? 'border-principal bg-principal text-principal-texto' : 'border-borde bg-superficie text-texto')}>
      {children}
      <span className={cn('tabular-nums', activo ? 'text-principal-texto/80' : 'text-texto-suave')}>{n.toLocaleString('es-AR')}</span>
    </button>
  )
}

/** Un filtro puesto: se ve qué se está mirando y se saca con la ×. */
function Activo({ onQuitar, children }: { onQuitar: () => void; children: React.ReactNode }) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-full bg-principal-suave pr-1 pl-3 text-[13.5px] font-bold text-principal">
      {children}
      <button type="button" onClick={onQuitar} aria-label={`Sacar «${typeof children === 'string' ? children : 'filtro'}»`} className="grid size-6 place-items-center rounded-full">
        <Icono nombre="Cerrar" tamano={16} className="size-3.5" />
      </button>
    </span>
  )
}

function Chip({ estado }: { estado: Estado }) {
  const atender = estado === 'retiro' || estado === 'destetar' || estado === 'vender' || estado === 'vacia'
  return <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-bold whitespace-nowrap', atender ? 'bg-estado-atencion-suave text-estado-atencion-texto' : 'bg-superficie-hundida text-texto-suave')}>{ESTADO_TEXTO[estado]}</span>
}
