import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'

import { Icono } from '@/components/tropero/icono'
import type { MovimientoConDetalle } from '@/features/analitica/api'
import { fmtCompact } from '@/features/analitica/compute'
import { useMovimientos } from '@/features/analitica/hooks'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { CampoVisto } from '@/features/campos/campo-visto'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useNombres } from '@/features/empresa/use-nombres'
import { usePermiso } from '@/features/empresa/use-permiso'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import { AnotarPlata } from './anotar-plata'
import { ElegirPeriodo } from './elegir-periodo'
import { MovimientoPanel } from './movimiento-panel'
import { aCsv, coincide, DESDE_EL_PRINCIPIO, enRango, nombreMes, periodoEntre, periodos, type Periodo } from './plata'
import { fechaDe, useDarPorBueno } from './dar-por-bueno'
import { Dia, FilaMovimiento, Grupo, RevisarMovimientos } from './revisar-movimientos'

type Pestana = 'todos' | 'revisar'
type Tipo = 'todo' | 'gasto' | 'ingreso'
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Plata · Movimientos (Lau, 24/11: unificado con «Revisar», con su visual). Una sola página:
 * arriba qué se mira y cuánto suma, con «Anotar un movimiento»; dos pestañas, «Todos» y
 * «Para revisar» (lo que cargó el equipo); en «Todos», una fila de filtros (las fechas, como
 * en Plata, salió o entró, quién cargó y la búsqueda) y la lista agrupada por mes, con lo
 * nuevo marcado y resuelto en la misma fila. El campo es el de la barra izquierda.
 */
export function MovimientosPage() {
  const empresaId = useEmpresa().data?.empresa_id ?? ''
  const movs = useMovimientos()
  const identidad = useCampoElegido()
  const campoId = identidad.elegido?.id ?? null
  const hoy = hoyLocal()
  const [params] = useSearchParams()
  const { quienCargo, nombreDe } = useNombres()
  const { carga } = usePermiso('plata')
  const darPorBueno = useDarPorBueno()
  const todos = periodos(hoy)

  // El período: el que trae el link (desde Plata, el que se estaba mirando). Sin link, este mes;
  // si este mes todavía no tiene nada, los 12 meses (no abrir en «$0»).
  const [elegido, setElegido] = useState<Periodo | null>(() => {
    const r = params.get('rango')
    if (r === 'fechas' && ES_FECHA.test(params.get('desde') ?? '') && ES_FECHA.test(params.get('hasta') ?? '')) return periodoEntre(params.get('desde')!, params.get('hasta')!, hoy)
    if (r === '12m') return todos[0]!
    if (r === 'campana') return todos[1]!
    if (r === 'pasada') return todos[2]!
    if (r === 'todo') return periodoEntre(DESDE_EL_PRINCIPIO, hoy, hoy)
    if (r === 'anio') return periodoEntre(`${hoy.slice(0, 4)}-01-01`, hoy, hoy)
    if (r === 'mes') return periodoEntre(`${hoy.slice(0, 7)}-01`, hoy, hoy)
    return null
  })
  const hayEsteMes = (movs.data ?? []).some((m) => (!campoId || m.campo_id === campoId) && enRango(m, 'mes', hoy))
  const periodo = elegido ?? (movs.data && !hayEsteMes ? todos[0]! : periodoEntre(`${hoy.slice(0, 7)}-01`, hoy, hoy))

  const [pestana, setPestana] = useState<Pestana>(() => (params.get('nuevos') === '1' ? 'revisar' : 'todos'))
  const [q, setQ] = useState(() => params.get('q') ?? '')
  const [tipo, setTipo] = useState<Tipo>('todo')
  const [quien, setQuien] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<MovimientoConDetalle | null>(null)
  const [editar, setEditar] = useState(false)
  const abrir = (m: MovimientoConDetalle, e = false) => (setEditar(e), setAbierto(m))

  const esNuevo = (m: MovimientoConDetalle) => carga && !m.revisado_at
  const nuevos = (movs.data ?? []).filter(esNuevo)
  // Quién cargó: por nombre (dos cuentas con el mismo nombre son una opción).
  const nombresAutores = [...new Set((movs.data ?? []).map((m) => m.created_by).filter((x): x is string => !!x).map((a) => nombreDe(a)))].sort((a, b) => (a === 'Vos' ? -1 : b === 'Vos' ? 1 : a.localeCompare(b, 'es')))

  const lista = (movs.data ?? [])
    .filter(
      (m) =>
        (!campoId || m.campo_id === campoId) &&
        enRango(m, 'fechas', hoy, { desde: periodo.desde, hasta: periodo.hasta }) &&
        (tipo === 'todo' || m.tipo === tipo) &&
        coincide(m, q) &&
        (quien === null || (m.created_by ? nombreDe(m.created_by) : '') === quien),
    )
    .sort((a, b) => fechaDe(b).localeCompare(fechaDe(a)))
  const suma = (xs: MovimientoConDetalle[], t: 'gasto' | 'ingreso') => xs.filter((m) => m.tipo === t).reduce((s, m) => s + Number(m.monto), 0)
  const salio = suma(lista, 'gasto')
  const entro = suma(lista, 'ingreso')
  // Agrupado por mes, con lo que salió y entró en cada uno.
  const meses: { clave: string; movs: MovimientoConDetalle[] }[] = []
  for (const m of lista) {
    const k = fechaDe(m).slice(0, 7)
    const g = meses.at(-1)
    if (g?.clave === k) g.movs.push(m)
    else meses.push({ clave: k, movs: [m] })
  }
  const filtrando = tipo !== 'todo' || quien !== null || q.trim() !== ''

  function bajar() {
    const url = URL.createObjectURL(new Blob([aCsv(lista)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `plata-${periodo.desde}-a-${periodo.hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto flex w-full ancho-pagina flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link to="/analitica" className="inline-flex h-10 items-center gap-1.5 rounded-full border-[1.5px] border-borde bg-superficie pr-4 pl-3 text-[14.5px] font-bold text-texto hover:border-principal hover:text-principal">
          <Icono nombre="Siguiente" tamano={16} className="rotate-180" />
          Volver a Plata
        </Link>
        <CampoVisto campos={identidad.campos} elegido={identidad.elegido} />
      </div>

      {/* Qué es, cuánto suma y la acción principal. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-pagina text-texto">Movimientos</h1>
          <p className="mt-2 text-[15.5px] text-texto-suave">
            {pestana === 'todos' ? (
              <>
                <b className="text-texto">{lista.length === 1 ? '1 movimiento' : `${lista.length} movimientos`}</b>
                {salio > 0 && <> · salieron <b className="text-estado-problema-texto">{fmtCompact(salio)}</b></>}
                {entro > 0 && <> · entraron <b className="text-estado-bien-texto">{fmtCompact(entro)}</b></>}
              </>
            ) : (
              'Lo que cargó tu equipo y todavía no miraste.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pestana === 'todos' && (
            <button type="button" onClick={bajar} disabled={lista.length === 0} className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-[14.5px] font-semibold text-texto hover:bg-superficie disabled:opacity-40">
              <Icono nombre="Descargar" tamano={16} />
              Bajar a Excel
            </button>
          )}
          {empresaId && (
            <AnotarPlata
              empresaId={empresaId}
              campoInicial={campoId ?? undefined}
              renderTrigger={(abrirAnotar) => (
                <button type="button" onClick={() => abrirAnotar()} className="inline-flex h-11 items-center gap-2.5 rounded-full bg-principal py-1 pr-1 pl-5 text-[15px] font-bold text-principal-texto hover:bg-terracota-600">
                  Anotar un movimiento
                  <span className="grid size-9 place-items-center rounded-full bg-acento text-acento-texto">
                    <Icono nombre="Agregar" tamano={16} />
                  </span>
                </button>
              )}
            />
          )}
        </div>
      </div>

      {/* Las dos pestañas: todo lo anotado, o lo que cargó el equipo para revisar. */}
      {carga && (
        <div role="tablist" aria-label="Movimientos" className="flex w-fit gap-1 rounded-full bg-superficie-hundida p-1">
          {([
            ['todos', 'Todos'],
            ['revisar', 'Para revisar'],
          ] as const).map(([id, texto]) => {
            const si = pestana === id
            return (
              <button key={id} type="button" role="tab" aria-selected={si} onClick={() => setPestana(id)} className="relative flex h-9 items-center gap-2 rounded-full px-4 text-[14.5px] font-bold">
                {si && <motion.span layoutId="pestana-movs" transition={{ type: 'spring', stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-full bg-superficie shadow-[0_1px_4px_rgb(58_26_13/.15)]" />}
                <span className={cn('relative', si ? 'text-texto' : 'text-texto-suave')}>{texto}</span>
                {id === 'revisar' && nuevos.length > 0 && <span className="relative rounded-full bg-principal px-1.5 text-[12px] leading-[18px] text-principal-texto">{nuevos.length}</span>}
              </button>
            )
          })}
        </div>
      )}

      {pestana === 'revisar' ? (
        movs.isLoading ? (
          <div className="h-[300px] animate-pulse rounded-[20px] bg-superficie-hundida" aria-busy />
        ) : (
          <RevisarMovimientos nuevos={nuevos} quienCargo={quienCargo} onAbrir={abrir} onVerTodos={() => setPestana('todos')} />
        )
      ) : (
        <>
          {/* Los filtros, en una fila: las fechas (como en Plata), salió o entró, quién y la búsqueda. */}
          <div className="flex flex-wrap items-center gap-2">
            <ElegirPeriodo conTodo periodos={todos} periodo={periodo} onElegir={setElegido} hoy={hoy} />
            <div role="radiogroup" aria-label="Salió o entró" className="flex h-10 gap-0.5 rounded-full bg-superficie p-1 shadow-[inset_0_0_0_1.5px_var(--borde)]">
              {([
                ['todo', 'Todo'],
                ['gasto', 'Salió'],
                ['ingreso', 'Entró'],
              ] as const).map(([v, t]) => (
                <button key={v} type="button" role="radio" aria-checked={tipo === v} onClick={() => setTipo(v)} className={cn('rounded-full px-3 text-[13.5px] font-bold transition-colors', tipo === v ? 'bg-principal text-principal-texto' : 'text-texto-suave hover:text-texto')}>
                  {t}
                </button>
              ))}
            </div>
            {nombresAutores.length > 1 && (
              <label className={cn('flex h-10 items-center gap-2 rounded-full bg-superficie pr-2 pl-3.5 text-[14px] font-bold shadow-[inset_0_0_0_1.5px_var(--borde)]', quien && 'text-principal shadow-[inset_0_0_0_1.5px_var(--principal)]')}>
                <Icono nombre="Usuario" tamano={16} />
                <select aria-label="Quién cargó" value={quien ?? ''} onChange={(e) => setQuien(e.target.value || null)} className="bg-transparent pr-1 outline-none">
                  <option value="">Cargó cualquiera</option>
                  {nombresAutores.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="ml-auto flex h-10 min-w-[240px] items-center gap-2 rounded-full bg-superficie px-3.5 shadow-[inset_0_0_0_1.5px_var(--borde)] focus-within:shadow-[inset_0_0_0_1.5px_var(--principal)] max-sm:ml-0 max-sm:w-full">
              <Icono nombre="Buscar" tamano={16} className="text-texto-suave" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Proveedor, detalle o CUIT" aria-label="Buscar un movimiento" className="w-full bg-transparent text-[14.5px] text-texto outline-none placeholder:text-texto-suave" />
            </label>
          </div>

          {/* Lo nuevo dentro del período, a la vista: se resuelve en la misma fila o en «Para revisar». */}
          {carga && nuevos.length > 0 && lista.some(esNuevo) && (
            // Cuántos, qué son y la acción (Lau, 24/11: el copy anterior era una instrucción larga).
            <button type="button" onClick={() => setPestana('revisar')} className="-mt-2 flex w-fit items-center gap-2.5 rounded-full bg-principal-suave/50 py-1.5 pr-2 pl-3 text-left text-[14px] text-texto hover:bg-principal-suave">
              <span className="rounded-full bg-principal px-2 py-0.5 text-[11.5px] font-bold text-principal-texto">{lista.filter(esNuevo).length}</span>
              <span>
                {lista.filter(esNuevo).length === 1 ? 'Tu equipo cargó un movimiento que todavía no revisaste' : `Tu equipo cargó ${lista.filter(esNuevo).length} movimientos que todavía no revisaste`}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-principal px-2.5 py-1 text-[13px] font-bold text-principal-texto">
                Revisar
                <Icono nombre="Siguiente" tamano={16} />
              </span>
            </button>
          )}

          {movs.isLoading ? (
            <div className="h-[300px] animate-pulse rounded-[20px] bg-superficie-hundida" aria-busy />
          ) : lista.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[24px] bg-superficie px-6 py-10 text-center shadow-[inset_0_0_0_1px_var(--borde)]">
              <p className="text-[15.5px] text-texto-suave">{filtrando ? 'Nada con esos filtros en estas fechas.' : 'No hay movimientos en estas fechas.'}</p>
              {filtrando ? (
                <button type="button" onClick={() => (setTipo('todo'), setQuien(null), setQ(''))} className="text-[14.5px] font-bold text-principal underline underline-offset-2">
                  Sacar los filtros
                </button>
              ) : (
                <button type="button" onClick={() => setElegido(periodoEntre(DESDE_EL_PRINCIPIO, hoy, hoy))} className="text-[14.5px] font-bold text-principal underline underline-offset-2">
                  Ver desde el principio
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {meses.map((g) => {
                const s = suma(g.movs, 'gasto')
                const e = suma(g.movs, 'ingreso')
                const nombre = nombreMes(g.clave).replace(/^\w/, (c) => c.toUpperCase())
                return (
                  <Grupo
                    key={g.clave}
                    etiqueta={`${nombre} ${g.clave.slice(0, 4)}`}
                    titulo={
                      <>
                        {nombre} <span className="font-normal text-texto-suave">{g.clave.slice(0, 4)}</span>
                      </>
                    }
                    detalle={
                      <span className="flex items-baseline gap-3 text-[13px]">
                        {s > 0 && (
                          <span>
                            Salió <b className="t-cifra-chica text-texto">{fmtCompact(s)}</b>
                          </span>
                        )}
                        {e > 0 && (
                          <span>
                            Entró <b className="t-cifra-chica text-estado-bien-texto">{fmtCompact(e)}</b>
                          </span>
                        )}
                      </span>
                    }
                  >
                    {/* Por día: la fecha una vez, como separador, no en cada fila. */}
                    {g.movs.flatMap((m, i) => {
                      const dia = fechaDe(m)
                      const fila = <FilaMovimiento key={m.id} m={m} nuevo={esNuevo(m)} quien={quienCargo(m.created_by, m.canal)} sinCampo={!!campoId} onAbrir={abrir} onBien={(x) => void darPorBueno([x.id], 'lo diste por bueno')} />
                      return i === 0 || fechaDe(g.movs[i - 1]!) !== dia ? [<Dia key={`d${dia}`} ymd={dia} />, fila] : [fila]
                    })}
                  </Grupo>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Mirarlo y cerrarlo no lo da por revisado: eso lo deciden «Está bien», «Corregir» o «Anular». */}
      <MovimientoPanel m={abierto} editar={editar} onCerrar={() => setAbierto(null)} />
    </div>
  )
}
