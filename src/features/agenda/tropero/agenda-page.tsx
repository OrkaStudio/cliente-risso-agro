import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Icono } from '@/components/tropero/icono'
import type { Vencimiento } from '@/features/agenda/api'
import { useVencimientos } from '@/features/agenda/hooks'
import { fmtCompact } from '@/features/analitica/compute'
import { AnotarPlata } from '@/features/analitica/tropero/anotar-plata'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { CampoVisto } from '@/features/campos/campo-visto'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { haceLabel, useParaAtender, type Nivel } from '@/features/inicio/para-atender-api'
import { SeSoluciono } from '@/features/inicio/tropero/el-dia'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import ilustracion from '@/assets/tropero/lotes-del-campo.webp'
import { cheques, cuandoVence, fechaDe, gruposLoQueViene, mesCorto, mesVecino, nombreMes, pactadoDe, pagadoPorMes, pendiente, proximos30, semanasDelMes, series, tituloDe } from './agenda'
import { PagarPanel } from './pagar-panel'

type Pestana = 'viene' | 'calendario' | 'arreglar' | 'cuotas' | 'cheques' | 'pagado'
const CURVA = [0.22, 1, 0.36, 1] as const
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const conSigno = (v: Vencimiento) => `${v.tipo === 'ingreso' ? '+' : '−'}${fmtCompact(v.monto)}`
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const COLOR_NIVEL: Record<Nivel, string> = { atender: 'bg-estado-problema', prevenir: 'bg-estado-atencion', nota: 'bg-neutro-400' }

/**
 * Agenda (rediseño, Figma página 35 «Agenda»): arriba lo que queda en los
 * próximos 30 días, siempre igual, y seis pestañas: lo que viene, el calendario,
 * lo que dejó la recorrida para arreglar, las cuotas, los cheques y lo ya pagado.
 * Tocar un pago o cobro abre «¿Lo pagaste?». El campo es el de la barra izquierda.
 */
export function AgendaPage() {
  const venc = useVencimientos()
  const empresaId = useEmpresa().data?.empresa_id ?? ''
  const { campos, elegido } = useCampoElegido()
  const arreglarQ = useParaAtender()
  const reducir = useReducedMotion()
  const hoy = hoyLocal()
  const [pestana, setPestana] = useState<Pestana>('viene')
  const [abierto, setAbierto] = useState<Vencimiento | null>(null)
  const [mes, setMes] = useState(hoy.slice(0, 7))

  const items = useMemo(() => (venc.data ?? []).filter((v) => !elegido || v.campoId === elegido.id), [venc.data, elegido])
  const resumen = proximos30(items, hoy)
  const arreglar = useMemo(
    () =>
      (arreglarQ.data?.potreros ?? [])
        .filter((p) => !elegido || p.campoId === elegido.id)
        .flatMap((p) => p.avisos.map((a) => ({ p, a })))
        .sort((x, y) => x.a.urgencia - y.a.urgencia),
    [arreglarQ.data, elegido],
  )

  // Un link del Inicio (`/agenda?mov=<id>`) abre ese pago o cobro.
  const [params, setParams] = useSearchParams()
  const movId = params.get('mov')
  const delLink = movId ? (venc.data?.find((x) => x.id === movId) ?? null) : null
  if (delLink && abierto?.id !== delLink.id) setAbierto(delLink)
  useEffect(() => {
    if (!movId || !venc.data) return
    setParams(
      (p) => {
        p.delete('mov')
        return p
      },
      { replace: true },
    )
  }, [movId, venc.data, setParams])

  const entra = (i: number) => (reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.05, ease: CURVA } })
  const PESTANAS: { v: Pestana; t: string }[] = [
    { v: 'viene', t: 'Lo que viene' },
    { v: 'calendario', t: 'Calendario' },
    { v: 'arreglar', t: arreglar.length ? `Para arreglar, ${arreglar.length}` : 'Para arreglar' },
    { v: 'cuotas', t: 'En cuotas' },
    { v: 'cheques', t: 'Cheques' },
    { v: 'pagado', t: 'Ya pagado' },
  ]

  return (
    <div className="ancho-pagina mx-auto flex w-full flex-col gap-7">
      <motion.div {...entra(0)} className="flex items-end justify-between gap-3">
        <CampoVisto campos={campos} elegido={elegido} />
      </motion.div>

      {/* Lo que queda en los próximos 30 días: siempre igual, cambie la pestaña que cambie. */}
      <motion.section {...entra(1)} className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[17px] font-semibold text-texto-suave">En los próximos 30 días te {resumen.queda >= 0 ? 'quedan' : 'faltan'}</p>
          <h1 className={cn('titulo-display cifra text-[72px] leading-[0.95] tracking-[-0.04em]', resumen.queda >= 0 ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>
            {resumen.queda >= 0 ? '+' : '−'}
            {fmtCompact(Math.abs(resumen.queda))}
          </h1>
          <p className="mt-2 text-[16px] text-texto-suave">
            Cobrás {fmtCompact(resumen.cobra)} y pagás {fmtCompact(resumen.paga)}.{' '}
            {resumen.vencidas ? <b className="text-estado-problema-texto">{resumen.vencidas === 1 ? 'Hay una cosa vencida.' : `Hay ${resumen.vencidas} cosas vencidas.`}</b> : 'No queda nada vencido.'}
          </p>
        </div>
        {empresaId && (
          <AnotarPlata
            empresaId={empresaId}
            campoInicial={elegido?.id}
            vence
            renderTrigger={(abrir) => (
              <button type="button" onClick={() => abrir()} className="inline-flex h-12 items-center gap-3 rounded-full bg-principal py-1 pr-1 pl-5 text-[15.5px] font-bold text-principal-texto hover:bg-terracota-600">
                Anotar algo que vence
                <span className="grid size-10 place-items-center rounded-full bg-acento text-acento-texto">
                  <Icono nombre="Agregar" tamano={16} />
                </span>
              </button>
            )}
          />
        )}
      </motion.section>

      <motion.div {...entra(2)} role="tablist" aria-label="Qué ver" data-guia="agenda-vistas" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-superficie-hundida p-1">
        {PESTANAS.map((p) => (
          <button key={p.v} type="button" role="tab" aria-selected={pestana === p.v} onClick={() => setPestana(p.v)} className={cn('h-10 shrink-0 rounded-full px-4 text-[15px] font-bold whitespace-nowrap transition-colors', pestana === p.v ? 'bg-principal text-principal-texto' : 'text-texto hover:bg-superficie')}>
            {p.t}
          </button>
        ))}
      </motion.div>

      <div data-guia="agenda-contenido">
        {venc.isLoading ? (
          <div className="h-[320px] animate-pulse rounded-[20px] bg-superficie-hundida" aria-busy />
        ) : venc.error ? (
          <p className="text-texto-suave">No pudimos cargar la Agenda. Revisá la conexión y probá de nuevo.</p>
        ) : pestana === 'viene' ? (
          <LoQueViene items={items} hoy={hoy} onAbrir={setAbierto} />
        ) : pestana === 'calendario' ? (
          <Calendario items={items} hoy={hoy} mes={mes} setMes={setMes} onAbrir={setAbierto} />
        ) : pestana === 'arreglar' ? (
          <ParaArreglar filas={arreglar} empresaId={empresaId} cargando={arreglarQ.isLoading} />
        ) : pestana === 'cuotas' ? (
          <Cuotas items={items} empresaId={empresaId} campoId={elegido?.id} />
        ) : pestana === 'cheques' ? (
          <Cheques items={items} hoy={hoy} onAbrir={setAbierto} />
        ) : (
          <YaPagado items={items} onAbrir={setAbierto} />
        )}
      </div>

      {empresaId && <PagarPanel item={abierto} empresaId={empresaId} onCerrar={() => setAbierto(null)} />}
    </div>
  )
}

/** Una fila de pago o cobro: fecha, color, qué es, la acción y el monto. */
function Fila({ v, hoy, onAbrir, accion = true }: { v: Vencimiento; hoy: string; onAbrir: (v: Vencimiento) => void; accion?: boolean }) {
  const f = fechaDe(v)
  const cobro = v.tipo === 'ingreso'
  const vencido = pendiente(v) && f < hoy
  const detalle = [vencido ? cuandoVence(f, hoy).texto : null, pactadoDe(v), v.campo, v.contraparte, v.medio === 'cheque' ? (v.esEcheq ? 'eCheq' : 'cheque') : null].filter(Boolean).join(', ')
  return (
    <li className="group flex items-center gap-5 border-b border-borde/70 py-3.5">
      <span className="w-12 shrink-0 text-center">
        <b className="cifra block text-[26px] leading-none text-texto">{Number(f.slice(8, 10))}</b>
        <span className="text-[13px] font-semibold text-texto-suave">{mesCorto(f)}</span>
      </span>
      <span aria-hidden className={cn('h-11 w-1 shrink-0 rounded-full', vencido ? 'bg-estado-problema' : cobro ? 'bg-estado-bien' : 'bg-estado-atencion')} />
      <button type="button" onClick={() => onAbrir(v)} className="min-w-0 flex-1 text-left">
        <p className="truncate text-[16.5px] font-bold text-texto group-hover:text-principal">{tituloDe(v)}</p>
        <p className={cn('truncate text-[14px]', vencido ? 'text-estado-problema-texto' : 'text-texto-suave')}>{mayuscula(detalle)}</p>
      </button>
      {accion && pendiente(v) && (vencido || f <= hoy) && (
        <button type="button" onClick={() => onAbrir(v)} className="shrink-0 rounded-full border-[1.5px] border-principal px-3.5 py-1.5 text-[14px] font-bold text-principal hover:bg-principal-suave">
          {cobro ? 'Marcar cobrado' : 'Marcar pagado'}
        </button>
      )}
      <span className={cn('cifra w-28 shrink-0 text-right text-[20px] font-bold', cobro ? 'text-estado-bien-texto' : 'text-texto')}>{conSigno(v)}</span>
    </li>
  )
}

function LoQueViene({ items, hoy, onAbrir }: { items: Vencimiento[]; hoy: string; onAbrir: (v: Vencimiento) => void }) {
  const grupos = gruposLoQueViene(items, hoy)
  const conFecha = new Set(items.filter(pendiente).map((v) => v.fechaVencimiento!))
  const mesActual = hoy.slice(0, 7)
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-7">
        {grupos.length === 0 && <Vacio titulo="No hay nada por pagar ni cobrar" texto="Lo que anotes con fecha (un pago, un cobro, un cheque, las cuotas) aparece acá y te avisamos antes." />}
        {grupos.map((g) => (
          <section key={g.clave}>
            <h2 className={cn('titulo-display border-b border-borde pb-2 text-[22px]', g.clave === '0' ? 'text-estado-problema-texto' : 'text-texto')}>{g.titulo}</h2>
            <ul>
              {g.items.map((v) => (
                <Fila key={v.id} v={v} hoy={hoy} onAbrir={onAbrir} />
              ))}
            </ul>
          </section>
        ))}
        {grupos.length > 0 && !grupos.some((g) => g.items.some((v) => v.fechaVencimiento!.slice(0, 7) === mesVecino(mesActual, 1))) && (
          <Vacio titulo={`${mayuscula(nombreMes(mesVecino(mesActual, 1)))}, sin nada todavía`} texto="Lo que tenga fecha aparece solo. Los sueldos, el alquiler y las cuotas, anotalos una vez." />
        )}
      </div>
      <aside className="hidden lg:block">
        <h2 className="titulo-display pb-3 text-[22px] text-texto">{mayuscula(nombreMes(mesActual))}</h2>
        <div className="grid grid-cols-7 gap-y-1.5 text-center">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
            <span key={i} className="pb-1 text-[12.5px] font-semibold text-texto-suave">
              {d}
            </span>
          ))}
          {semanasDelMes(mesActual)
            .flat()
            .map((d) => (
              <span key={d} className={cn('relative mx-auto grid size-9 place-items-center rounded-full text-[15px] font-bold', d.slice(0, 7) !== mesActual ? 'text-transparent' : d === hoy ? 'bg-acento text-acento-texto' : 'text-texto')}>
                {Number(d.slice(8))}
                {d.slice(0, 7) === mesActual && conFecha.has(d) && <span aria-hidden className={cn('absolute bottom-0.5 size-1.5 rounded-full', d < hoy ? 'bg-estado-problema' : 'bg-principal')} />}
              </span>
            ))}
        </div>
      </aside>
    </div>
  )
}

function Vacio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex overflow-hidden rounded-[22px] bg-[#fdf6e7]">
      <img src={ilustracion} alt="" className="hidden w-[220px] shrink-0 object-cover sm:block" />
      <div className="px-7 py-6">
        <p className="titulo-display text-[20px] text-texto">{titulo}</p>
        <p className="mt-2 max-w-[440px] text-[14.5px] text-texto-suave">{texto}</p>
      </div>
    </div>
  )
}

function Calendario({ items, hoy, mes, setMes, onAbrir }: { items: Vencimiento[]; hoy: string; mes: string; setMes: (m: string) => void; onAbrir: (v: Vencimiento) => void }) {
  const porDia = new Map<string, Vencimiento[]>()
  for (const v of items) {
    const f = fechaDe(v)
    if (f) porDia.set(f, [...(porDia.get(f) ?? []), v])
  }
  const chip = (v: Vencimiento) => (!pendiente(v) ? 'bg-superficie-hundida text-texto-suave' : fechaDe(v) < hoy ? 'bg-estado-problema-suave text-estado-problema-texto' : v.tipo === 'ingreso' ? 'bg-estado-bien-suave text-estado-bien-texto' : 'bg-principal-suave text-acento-texto')
  return (
    <section>
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="titulo-display text-[26px] text-texto">
          {mayuscula(nombreMes(mes))}
          {mes.slice(0, 4) !== hoy.slice(0, 4) ? ` ${mes.slice(0, 4)}` : ''}
        </h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setMes(mesVecino(mes, -1))} className="h-10 rounded-full border-[1.5px] border-principal px-4 text-[14.5px] font-bold text-principal hover:bg-principal-suave">
            ‹ {mayuscula(nombreMes(mesVecino(mes, -1)))}
          </button>
          <button type="button" onClick={() => setMes(mesVecino(mes, 1))} className="h-10 rounded-full border-[1.5px] border-principal px-4 text-[14.5px] font-bold text-principal hover:bg-principal-suave">
            {mayuscula(nombreMes(mesVecino(mes, 1)))} ›
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d) => (
          <span key={d} className="text-[13.5px] font-semibold text-texto-suave">
            {d}
          </span>
        ))}
        {semanasDelMes(mes)
          .flat()
          .map((d) => {
            const fuera = d.slice(0, 7) !== mes
            const vs = porDia.get(d) ?? []
            return (
              <div key={d} className={cn('flex min-h-[104px] flex-col gap-1 rounded-[14px] p-2', fuera ? 'bg-superficie-hundida/60' : 'bg-superficie', d === hoy && 'ring-2 ring-principal')}>
                <span className={cn('cifra text-[17px] font-bold', d === hoy ? 'text-principal' : fuera ? 'text-texto-suave' : 'text-texto')}>
                  {Number(d.slice(8))}
                  {fuera ? ` ${mesCorto(d)}` : d === hoy ? ' · hoy' : ''}
                </span>
                {vs.slice(0, 3).map((v) => (
                  <button key={v.id} type="button" onClick={() => onAbrir(v)} className={cn('truncate rounded-[8px] px-2 py-1 text-left text-[12.5px] font-semibold', chip(v))} title={`${conSigno(v)} ${tituloDe(v)}`}>
                    {conSigno(v)} {tituloDe(v).toLowerCase()}
                  </button>
                ))}
                {vs.length > 3 && <span className="px-1 text-[12px] font-semibold text-texto-suave">y {vs.length - 3} más</span>}
              </div>
            )
          })}
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13.5px] text-texto-suave">
        {[
          ['bg-estado-problema-suave', 'Vencido'],
          ['bg-principal-suave', 'A pagar'],
          ['bg-estado-bien-suave', 'A cobrar'],
          ['bg-superficie-hundida', 'Ya pagado'],
        ].map(([c, t]) => (
          <span key={t} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('size-3 rounded-[4px]', c)} />
            {t}
          </span>
        ))}
        <span>Tocá uno para marcarlo pagado o ver su detalle.</span>
      </p>
    </section>
  )
}

function ParaArreglar({ filas, empresaId, cargando }: { filas: { p: { key: string; observacionId: string; potrero: string; campo: string; cabezas: number; hace: number }; a: { key: string; tipo: Parameters<typeof SeSoluciono>[0]['senal']['tipo']; nivel: Nivel; titulo: string; detalle?: string } }[]; empresaId: string; cargando: boolean }) {
  if (cargando) return <div className="h-[240px] animate-pulse rounded-[20px] bg-superficie-hundida" aria-busy />
  return (
    <section>
      <p className="titulo-display cifra text-[72px] leading-none text-texto">{filas.length}</p>
      <p className="mt-2 text-[17px] font-semibold text-texto-suave">{filas.length === 1 ? 'cosa para arreglar, la dejó la recorrida' : 'cosas para arreglar, las dejó la recorrida'}</p>
      {filas.length === 0 ? (
        <p className="mt-6 border-t border-borde py-6 text-[15px] text-texto-suave">Nada para arreglar. Lo que vea la recorrida en el campo (agua, alambrado, el eléctrico) aparece acá.</p>
      ) : (
        <ul className="mt-6 border-t border-borde">
          {filas.map(({ p, a }) => (
            <li key={`${p.key}-${a.key}`} className="flex items-center gap-5 border-b border-borde/70 py-4">
              <span aria-hidden className={cn('h-11 w-1 shrink-0 rounded-full', COLOR_NIVEL[a.nivel])} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16.5px] font-bold text-texto">
                  {a.titulo} en el {p.potrero}
                </p>
                <p className="truncate text-[14px] text-texto-suave">{[p.campo, p.cabezas > 0 ? `${p.cabezas} animales adentro` : null, a.detalle].filter(Boolean).join('. ')}</p>
              </div>
              <span className="shrink-0 text-[14px] text-texto-suave">{haceLabel(p.hace)}</span>
              <SeSoluciono senal={{ potreroId: p.key, observacionId: p.observacionId, tipo: a.tipo }} empresaId={empresaId} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-5 text-[14px] text-texto-suave">Cuando en el campo tocan «Se solucionó», acá se tacha solo.</p>
    </section>
  )
}

function Cuotas({ items, empresaId, campoId }: { items: Vencimiento[]; empresaId: string; campoId?: string }) {
  const lista = series(items)
  const falta = lista.filter((s) => s.tipo === 'gasto').reduce((x, s) => x + s.falta, 0)
  return (
    <section>
      <p className="titulo-display cifra text-[72px] leading-none text-texto">{fmtCompact(falta)}</p>
      <p className="mt-2 text-[17px] font-semibold text-texto-suave">
        faltan pagar en cuotas{lista.length ? `, en ${lista.length === 1 ? 'una compra' : `${lista.length} compras`}` : ''}
      </p>
      {lista.length > 0 && (
        <ul className="mt-6 border-t border-borde">
          {lista.map((s) => (
            <li key={s.serieId} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto] items-center gap-6 border-b border-borde/70 py-4">
              <div className="min-w-0">
                <p className="truncate text-[16.5px] font-bold text-texto">{s.nombre}</p>
                <p className="truncate text-[14px] text-texto-suave">{[s.detalle, `${pesos(s.cuota)} por cuota`].filter(Boolean).join('. ')}</p>
              </div>
              <div className="flex gap-1" aria-label={`${s.pagadas} de ${s.total} pagas`}>
                {Array.from({ length: s.total }, (_, i) => (
                  <span key={i} className={cn('h-3.5 flex-1 rounded-[4px]', i < s.pagadas ? 'bg-estado-bien' : i === s.pagadas ? 'bg-estado-atencion' : 'bg-superficie-hundida')} />
                ))}
              </div>
              <div className="text-right">
                <p className="titulo-display cifra text-[19px] text-texto">Faltan {fmtCompact(s.falta)}</p>
                <p className="text-[13.5px] text-texto-suave">
                  {s.pagadas} de {s.total} pagas{s.proxima ? `. Próxima el ${Number(s.proxima.slice(8))} de ${nombreMes(s.proxima.slice(0, 7))}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-superficie-hundida px-6 py-5">
        <p className="text-[15.5px] text-texto">¿Compraste algo en cuotas? Anotalo una vez y aparecen todas las fechas.</p>
        {empresaId && (
          <AnotarPlata
            empresaId={empresaId}
            campoInicial={campoId}
            vence
            renderTrigger={(abrir) => (
              <button type="button" onClick={() => abrir()} className="h-11 rounded-full border-[1.5px] border-principal px-5 text-[15px] font-bold text-principal hover:bg-principal-suave">
                Anotar en cuotas
              </button>
            )}
          />
        )}
      </div>
    </section>
  )
}

function Cheques({ items, hoy, onAbrir }: { items: Vencimiento[]; hoy: string; onAbrir: (v: Vencimiento) => void }) {
  const { lista, enCartera, emitidos } = cheques(items, hoy)
  const tono: Record<string, string> = { 'En cartera': 'text-texto', 'Por debitar': 'bg-estado-atencion-suave text-estado-atencion-texto', Cobrado: 'bg-estado-bien-suave text-estado-bien-texto', Debitado: 'bg-superficie-hundida text-texto-suave' }
  return (
    <section>
      <div className="flex flex-wrap gap-x-16 gap-y-4">
        <div>
          <p className="text-[17px] font-semibold text-texto-suave">En cartera</p>
          <p className="titulo-display cifra text-[60px] leading-none text-estado-bien-texto">+{fmtCompact(enCartera)}</p>
        </div>
        <div>
          <p className="text-[17px] font-semibold text-texto-suave">Emitidos</p>
          <p className="titulo-display cifra text-[60px] leading-none text-texto">−{fmtCompact(emitidos)}</p>
        </div>
      </div>
      {lista.length === 0 ? (
        <p className="mt-6 border-t border-borde py-6 text-[15px] text-texto-suave">No hay cheques. Cuando anotes un pago o cobro con cheque, aparece acá con su banco y su fecha.</p>
      ) : (
        <ul className="mt-6 border-t border-borde">
          {lista.map(({ v, estado }) => (
            <li key={v.id}>
              <button type="button" onClick={() => onAbrir(v)} className="group flex w-full items-center gap-5 border-b border-borde/70 py-4 text-left">
                <span className="w-[150px] shrink-0 rounded-[12px] border border-borde bg-superficie px-3 py-2">
                  <b className="block truncate text-[13.5px] text-texto">{v.chequeBanco || (v.esEcheq ? 'eCheq' : 'Cheque')}</b>
                  <span className="cifra block truncate text-[15px] font-bold text-texto-suave">{v.chequeNumero || (v.esEcheq ? 'eCheq' : 'de papel')}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[16.5px] text-texto group-hover:text-principal">{v.contraparte || tituloDe(v)}</b>
                  <span className="block truncate text-[14px] text-texto-suave">
                    {v.esEcheq ? 'eCheq' : 'Cheque'} {v.tipo === 'ingreso' ? 'recibido' : 'emitido'}.{' '}
                    {pendiente(v) ? `${v.tipo === 'ingreso' ? 'Se cobra desde' : 'Te lo debitan'} el ${Number(v.fechaVencimiento!.slice(8))}/${Number(v.fechaVencimiento!.slice(5, 7))}` : `${estado} el ${Number(v.fechaCobroPago!.slice(8))}/${Number(v.fechaCobroPago!.slice(5, 7))}`}
                  </span>
                </span>
                <span className={cn('shrink-0 rounded-full px-3 py-1 text-[13px] font-bold', tono[estado])}>{estado}</span>
                <span className={cn('cifra w-32 shrink-0 text-right text-[20px] font-bold', v.tipo === 'ingreso' ? 'text-estado-bien-texto' : 'text-texto')}>
                  {v.tipo === 'ingreso' ? '+' : '−'}
                  {pesos(v.monto)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-5 text-[14px] text-texto-suave">Cada cheque también aparece en «Lo que viene» el día que se cobra o que te lo debitan.</p>
    </section>
  )
}

function YaPagado({ items, onAbrir }: { items: Vencimiento[]; onAbrir: (v: Vencimiento) => void }) {
  const meses = pagadoPorMes(items)
  const [cuantos, setCuantos] = useState(2)
  if (meses.length === 0) return <p className="border-t border-borde py-6 text-[15px] text-texto-suave">Todavía no marcaste nada como pagado o cobrado.</p>
  return (
    <div className="flex flex-col gap-8">
      {meses.slice(0, cuantos).map((m) => (
        <section key={m.ym}>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-borde pb-2">
            <h2 className="titulo-display text-[32px] text-texto">
              {mayuscula(nombreMes(m.ym))}
              {m.ym.slice(0, 4) !== hoyLocal().slice(0, 4) ? ` ${m.ym.slice(0, 4)}` : ''}
            </h2>
            <span className="text-[16px] font-bold text-estado-bien-texto">Entró +{fmtCompact(m.entro)}</span>
            <span className="text-[16px] font-bold text-texto">Salió −{fmtCompact(m.salio)}</span>
          </div>
          <ul>
            {m.items.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => onAbrir(v)} className="group flex w-full items-center gap-5 border-b border-borde/70 py-3.5 text-left">
                  <span className="cifra w-10 shrink-0 text-[22px] font-bold text-texto-suave">{Number(v.fechaCobroPago!.slice(8))}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[16.5px] text-texto group-hover:text-principal">{tituloDe(v)}</b>
                    <span className="block truncate text-[14px] text-texto-suave">{mayuscula([v.categoria, v.campo, v.contraparte].filter(Boolean).join(', '))}</span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1.5 text-[13.5px] text-texto-suave md:flex">
                    <Icono nombre="Comprobante" tamano={16} />
                    {v.conComprobante ? 'Con comprobante' : 'Sin comprobante'}
                  </span>
                  <span className={cn('cifra w-32 shrink-0 text-right text-[20px] font-bold', v.tipo === 'ingreso' ? 'text-estado-bien-texto' : 'text-texto')}>
                    {v.tipo === 'ingreso' ? '+' : '−'}
                    {pesos(v.monto)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {meses.length > cuantos && (
        <button type="button" onClick={() => setCuantos((c) => c + 3)} className="h-11 w-fit rounded-full border-[1.5px] border-principal px-5 text-[15px] font-bold text-principal hover:bg-principal-suave">
          Ver meses anteriores
        </button>
      )}
    </div>
  )
}
