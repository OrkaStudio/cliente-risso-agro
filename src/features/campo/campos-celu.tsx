import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Icono } from '@/components/tropero/icono'
import { MapErrorBoundary } from '@/components/map-error-boundary'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { MapaCampo } from '@/features/campos/tropero/mapa-campo'
import { MapaCampos } from '@/features/campos/tropero/mapa-campos'
import { puedeVer } from '@/features/empresa/secciones'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useMapa } from '@/features/mapa/api'
import type { CampoMapa, PotreroMapa } from '@/features/mapa/reglas'
import { cn } from '@/lib/utils'
import { BAJADA, TARJETA } from './sistema'
import { Barra, Encabezado } from './sistema-ui'

/**
 * Campos en el celular (Lau, 17/11): para ver los campos y lo que tienen
 * adentro, como en la compu. Todos juntos sobre el satélite y la lista con lo
 * que suman; tocando uno, su mapa con los potreros y qué hay en cada uno. Se
 * mira; el campo se dibuja en la compu.
 */

const CURVA = [0.22, 1, 0.36, 1] as const
const ha = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
const cabezas = (c: CampoMapa) => c.potreros.reduce((n, p) => n + p.cabezas, 0)
const hectareas = (c: CampoMapa) => c.hectareas ?? c.potreros.reduce((n, p) => n + (p.hectareas ?? 0), 0)
/** Qué tiene, para el color del potrero: lo mismo que en la compu, en suave. */
const COLOR_TIPO: Record<NonNullable<PotreroMapa['tipo']>, string | null> = { hacienda: '#b85c2e', sembrado: '#ecc46a', descanso: '#82896b', vacio: null }

export function CamposCelu() {
  const { id } = useParams()
  // Cada pantalla arranca arriba: la key cambia el contenedor que scrollea.
  return (
    <div key={id ?? 'todos'} className="h-full overflow-y-auto bg-fondo">
      {id ? <UnCampo id={id} /> : <TodosLosCampos />}
    </div>
  )
}

function TodosLosCampos() {
  const navigate = useNavigate()
  const reducir = useReducedMotion()
  const { data: membresia } = useEmpresa()
  const mapa = useMapa(membresia?.empresa_id)
  const identidad = useCampoElegido()
  const veHacienda = puedeVer(membresia, 'hacienda')
  const campos = mapa.data ?? []
  const marca = (id: string) => identidad.campos.find((c) => c.id === id)
  const totalHa = campos.reduce((n, c) => n + hectareas(c), 0)
  const totalCab = campos.reduce((n, c) => n + cabezas(c), 0)
  const entra = (i: number) => (reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.05, ease: CURVA } })
  const abrir = (cid: string) => navigate(`/campo/campos/${cid}`)
  return (
    <div className="flex flex-col gap-8 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-6">
      <Barra />
      <motion.section {...entra(0)} aria-labelledby="campos-titulo" className="flex flex-col gap-3">
        <h1 id="campos-titulo" className="px-1 titulo-display text-[30px] text-texto">
          Campos
        </h1>
        {/* Todos sobre el satélite: tocar uno lo abre. */}
        <div className="relative isolate h-[300px] overflow-hidden rounded-[20px] border border-borde bg-tinta">
          {campos.length > 0 && (
            <MapErrorBoundary>
              <MapaCampos campos={campos.map((c) => ({ campo: c, letra: marca(c.id)?.letra ?? '', color: marca(c.id)?.color ?? '#a9552c' }))} onElegir={abrir} />
            </MapErrorBoundary>
          )}
        </div>
      </motion.section>

      <motion.section {...entra(1)} aria-labelledby="campos-lista" className={cn(TARJETA, 'p-4')}>
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
                <button type="button" onClick={() => abrir(c.id)} className="flex w-full items-center gap-3 py-3 text-left last:pb-0">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-extrabold text-white" style={{ background: m?.color ?? '#a9552c' }}>
                    {m?.letra}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-texto">{c.nombre}</span>
                    <span className={BAJADA}>
                      {ha(hectareas(c))} ha · {c.potreros.length} potreros{veHacienda && ` · ${cabezas(c).toLocaleString('es-AR')} cab`}
                    </span>
                  </span>
                  <Icono nombre="Siguiente" tamano={16} className="shrink-0 text-texto-suave" />
                </button>
              </li>
            )
          })}
        </ul>
      </motion.section>
      <div aria-hidden className="h-10" />
    </div>
  )
}

function UnCampo({ id }: { id: string }) {
  const navigate = useNavigate()
  const reducir = useReducedMotion()
  const { data: membresia } = useEmpresa()
  const mapa = useMapa(membresia?.empresa_id)
  const identidad = useCampoElegido()
  const veHacienda = puedeVer(membresia, 'hacienda')
  const [elegido, setElegido] = useState<string | null>(null)
  const campo = mapa.data?.find((c) => c.id === id)
  const m = identidad.campos.find((c) => c.id === id)
  const entra = (i: number) => (reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.05, ease: CURVA } })
  if (mapa.isLoading) return <div className="m-4 h-[300px] animate-pulse rounded-[20px] bg-superficie-hundida" aria-busy />
  if (!campo) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Barra />
        <p className="text-[15px] text-texto-suave">No encontramos ese campo.</p>
        <button type="button" onClick={() => navigate('/campo/campos')} className="self-start text-[15px] font-bold text-principal">
          Ver los campos
        </button>
      </div>
    )
  }
  // Los potreros con más hacienda primero; los vacíos al final.
  const potreros = [...campo.potreros].sort((a, b) => b.cabezas - a.cabezas || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
  const dibujado = !!campo.contorno || campo.potreros.some((p) => p.poligono)
  return (
    <div className="flex flex-col gap-8 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-6">
      <Barra />
      <motion.section {...entra(0)} aria-labelledby="campo-titulo" className="flex flex-col gap-3">
        <button type="button" onClick={() => navigate('/campo/campos')} className="flex items-center gap-1 self-start text-[14px] font-bold text-principal">
          <Icono nombre="Siguiente" tamano={16} className="rotate-180" />
          Campos
        </button>
        <h1 id="campo-titulo" className="flex items-center gap-2.5 px-1 titulo-display text-[30px] leading-tight text-texto">
          <span className="grid size-9 shrink-0 place-items-center rounded-full font-sans text-[14px] font-extrabold text-white" style={{ background: m?.color ?? '#a9552c' }}>
            {m?.letra}
          </span>
          <span className="min-w-0 truncate">{campo.nombre}</span>
        </h1>
        <p className={cn(BAJADA, 'px-1')}>
          {ha(hectareas(campo))} ha · {campo.potreros.length} potreros{veHacienda && ` · ${cabezas(campo).toLocaleString('es-AR')} cabezas`}
          {campo.localidad ? ` · ${campo.localidad}` : ''}
        </p>
        {dibujado ? (
          <div className="relative isolate h-[320px] overflow-hidden rounded-[20px] border border-borde bg-tinta">
            <MapErrorBoundary>
              <MapaCampo campo={campo} elegido={elegido} onElegir={(pid) => setElegido((x) => (x === pid ? null : pid))} onFondo={() => setElegido(null)} color={(p) => (veHacienda ? COLOR_TIPO[p.tipo ?? 'vacio'] : null)} dato={(p) => (veHacienda && p.cabezas ? `${p.cabezas} cab` : null)} />
            </MapErrorBoundary>
          </div>
        ) : (
          <p className={cn(TARJETA, 'p-4 text-[15px] text-texto-suave')}>Este campo todavía no está dibujado. Se arma en la compu.</p>
        )}
      </motion.section>

      <motion.section {...entra(1)} aria-labelledby="campo-potreros" className={cn(TARJETA, 'p-4')}>
        <Encabezado id="campo-potreros" titulo="Potreros" bajada="Qué hay en cada uno. Tocalo acá o en el mapa." />
        <ul className="mt-3 divide-y divide-borde">
          {potreros.map((p) => {
            const activo = elegido === p.id
            return (
              <li key={p.id}>
                <button type="button" onClick={() => setElegido((x) => (x === p.id ? null : p.id))} aria-pressed={activo} className={cn('-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-[14px] px-2 py-3 text-left transition-colors', activo && 'bg-principal-suave/60')}>
                  <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-full bg-superficie-hundida px-2 text-[13px] font-extrabold text-texto">{p.nombre}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-texto">{p.que || 'Sin nada cargado'}</span>
                    <span className={BAJADA}>{p.hectareas ? `${ha(p.hectareas)} ha` : 'Sin hectáreas'}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </motion.section>
      <div aria-hidden className="h-10" />
    </div>
  )
}
