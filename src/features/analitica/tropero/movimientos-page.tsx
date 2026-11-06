import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icono } from '@/components/tropero/icono'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { CampoVisto } from '@/features/campos/campo-visto'
import { AnotarPlata } from './anotar-plata'
import { fmtCompact, formatARS } from '@/features/analitica/compute'
import { useMovimientos } from '@/features/analitica/hooks'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import { aCsv, coincide, comprobanteTexto, enRango, medioTexto, nombreMes, type Rango } from './plata'

/**
 * Plata · Los movimientos (Figma página 35): cuánto salió en el período, los
 * filtros de tiempo, la búsqueda por proveedor o CUIT, bajar a Excel y la
 * lista. El campo es el de la barra izquierda.
 */
export function MovimientosPage() {
  const empresaId = useEmpresa().data?.empresa_id ?? ''
  const movs = useMovimientos()
  const identidad = useCampoElegido()
  const campoId = identidad.elegido?.id ?? null
  const hoy = hoyLocal()
  const [params] = useSearchParams()
  const [rango, setRango] = useState<Rango>(() => (['mes', 'anio', '12m', 'todo'].includes(params.get('rango') ?? '') ? (params.get('rango') as Rango) : 'mes'))
  const [q, setQ] = useState(() => params.get('q') ?? '')

  const lista = useMemo(
    () =>
      (movs.data ?? [])
        .filter((m) => (!campoId || m.campo_id === campoId) && enRango(m, rango, hoy) && coincide(m, q))
        .sort((a, b) => (b.fecha_cobro_pago ?? b.fecha_devengo).localeCompare(a.fecha_cobro_pago ?? a.fecha_devengo)),
    [movs.data, campoId, rango, hoy, q],
  )
  const salio = lista.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + Number(m.monto), 0)
  const entro = lista.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0)
  const cuando = { mes: `En ${nombreMes(hoy.slice(0, 7))}`, anio: `En ${hoy.slice(0, 4)}`, '12m': 'En los últimos 12 meses', todo: 'Desde el principio' }[rango]
  const RANGOS: { v: Rango; t: string }[] = [
    { v: 'mes', t: nombreMes(hoy.slice(0, 7)).replace(/^\w/, (c) => c.toUpperCase()) },
    { v: 'anio', t: 'Este año' },
    { v: '12m', t: '12 meses' },
    { v: 'todo', t: 'Todo' },
  ]

  function bajar() {
    const url = URL.createObjectURL(new Blob([aCsv(lista)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `plata-${hoy}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto flex w-full ancho-pagina flex-col gap-7">
      <div className="flex items-end justify-between gap-3">
        <Link to="/analitica" className="inline-flex h-10 items-center gap-1.5 rounded-full border-[1.5px] border-borde bg-superficie pr-4 pl-3 text-[14.5px] font-bold text-texto hover:border-principal hover:text-principal">
          <Icono nombre="Siguiente" tamano={16} className="rotate-180" />
          Volver a Plata
        </Link>
        <CampoVisto campos={identidad.campos} elegido={identidad.elegido} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[18px] font-semibold text-texto-suave">{cuando} salieron</p>
          <h1 className="t-numero-hero text-texto">{fmtCompact(salio)}</h1>
          <p className="mt-2 text-[16px] text-texto-suave">
            en {lista.length} {lista.length === 1 ? 'movimiento' : 'movimientos'}
            {entro > 0 && `, y entraron ${fmtCompact(entro)}`}
          </p>
        </div>
        <div className="flex gap-2.5">
          <button type="button" onClick={bajar} disabled={lista.length === 0} className="inline-flex h-12 items-center rounded-full border-[1.5px] border-principal px-5 text-[15.5px] font-bold text-principal hover:bg-principal-suave disabled:opacity-40">
            Bajar a Excel
          </button>
          {empresaId && (
            <AnotarPlata
              empresaId={empresaId}
              campoInicial={campoId ?? undefined}
              renderTrigger={(abrir) => (
                <button type="button" onClick={() => abrir()} className="inline-flex h-12 items-center gap-3 rounded-full bg-principal py-1 pr-1 pl-5 text-[15.5px] font-bold text-principal-texto hover:bg-terracota-600">
                  Anotar
                  <span className="grid size-10 place-items-center rounded-full bg-acento text-acento-texto">
                    <Icono nombre="Agregar" tamano={16} />
                  </span>
                </button>
              )}
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div role="tablist" aria-label="Período" className="flex flex-wrap gap-2">
          {RANGOS.map((r) => (
            <button key={r.v} type="button" role="tab" aria-selected={rango === r.v} onClick={() => setRango(r.v)} className={cn('h-11 rounded-full px-4 text-[15px] font-bold transition-colors', rango === r.v ? 'bg-acento text-acento-texto' : 'border-[1.5px] border-borde bg-superficie text-texto hover:border-neutro-300')}>
              {r.t}
            </button>
          ))}
        </div>
        <label className="ml-auto flex h-11 min-w-[260px] items-center gap-2 rounded-full border-[1.5px] border-borde bg-superficie px-4 focus-within:border-principal/60">
          <Icono nombre="Buscar" tamano={16} className="text-texto-suave" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Proveedor, detalle o CUIT" aria-label="Buscar un movimiento" className="w-full bg-transparent text-[15px] text-texto outline-none placeholder:text-texto-suave" />
        </label>
      </div>

      {movs.isLoading ? (
        <div className="h-[300px] animate-pulse rounded-[20px] bg-superficie-hundida" aria-busy />
      ) : lista.length === 0 ? (
        <p className="border-t border-borde py-10 text-center text-[15.5px] text-texto-suave">{q ? 'No hay movimientos con esa búsqueda.' : 'No hay movimientos en este período.'}</p>
      ) : (
        <ul className="border-t border-borde">
          {lista.map((m) => {
            const f = m.fecha_cobro_pago ?? m.fecha_devengo
            const ingreso = m.tipo === 'ingreso'
            const medio = medioTexto(m)
            // Como las filas de la Agenda: el título y, debajo, todo lo demás en una línea gris.
            const detalle = [m.categoria?.nombre, m.campo?.nombre, m.contraparte, medio, comprobanteTexto(m)].filter(Boolean).join(' · ')
            return (
              <li key={m.id} className="flex items-center gap-5 border-b border-borde/70 py-4">
                <span className="t-cifra w-14 shrink-0 text-texto-suave">{`${f.slice(8, 10)}/${f.slice(5, 7)}`}
                  {f.slice(0, 4) !== hoy.slice(0, 4) && <span className="block text-[13px] font-semibold">{f.slice(0, 4)}</span>}</span>
                <span aria-hidden className={cn('h-10 w-1 shrink-0 rounded-full', ingreso ? 'bg-estado-bien' : 'bg-estado-problema/80')} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16.5px] font-semibold text-texto">{m.descripcion || m.categoria?.nombre || (ingreso ? 'Ingreso' : 'Gasto')}</p>
                  <p className="truncate text-[14.5px] text-texto-suave">{detalle}</p>
                </div>
                <span className={cn('t-cifra w-36 shrink-0 text-right', ingreso ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>
                  {ingreso ? '+' : '−'}
                  {formatARS(Number(m.monto)).replace('-', '').replace(/\s/g, '')}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
