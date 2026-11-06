import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { Icono } from '@/components/tropero/icono'
import type { Vencimiento } from '@/features/agenda/api'
import { useLiquidar, useRevertirLiquidacion, useVencimientos } from '@/features/agenda/hooks'
import { fmtCompact } from '@/features/analitica/compute'
import { AnotarPlata } from '@/features/analitica/tropero/anotar-plata'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { CampoVisto } from '@/features/campos/campo-visto'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { haceLabel, useParaAtender, type Nivel } from '@/features/inicio/para-atender-api'
import { SeSoluciono } from '@/features/inicio/tropero/el-dia'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import { cheques, pendiente, semanasQueVienen, tituloDe, mesCorto, type Semana } from './agenda'
import { AgendaCalendario } from './agenda-calendario'
import arroyo from '@/assets/tropero/arroyo-mapa.webp'
import { Cabecera } from '@/components/tropero/cabecera'
import { Cosa } from './agenda-cosa'
import { PagarPanel } from './pagar-panel'
import { PanelLateral } from '@/components/tropero/panel-lateral'

type Filtro = 'todo' | 'pagos' | 'cobros' | 'cheques'
type Forma = 'calendario' | 'lista'
const CLAVE_FORMA = 'agenda-forma'
const leerForma = (): Forma => {
  try {
    return localStorage.getItem(CLAVE_FORMA) === 'lista' ? 'lista' : 'calendario'
  } catch {
    return 'calendario'
  }
}
const CURVA = [0.22, 1, 0.36, 1] as const
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const COLOR_NIVEL: Record<Nivel, string> = { atender: 'bg-estado-problema', prevenir: 'bg-estado-atencion', nota: 'bg-neutro-400' }

/**
 * Agenda (Lau, 05/11, después de cuatro vueltas con el calendario): una sola
 * pantalla, por semana. Un productor tiene entre 5 y 20 cosas con fecha por mes
 * (sueldos, alquiler, cuotas, cheques, cobros de la consignataria): en una
 * grilla mensual el mes queda vacío. Por semana cada cosa se lee entera, con a
 * quién, de qué campo, con qué y el botón para resolverla.
 *
 * Lo vencido sin marcar casi siempre ya se pagó (nadie lo marca): no se grita
 * como deuda, se pregunta «¿Ya pagaste esto?» y se resuelve de una vez. Las
 * tareas del campo que dejó la recorrida van en esta semana. Cuotas, cheques y
 * lo ya pagado no son pestañas: las cuotas y los cheques lo dicen en su fila y
 * se filtran; lo pagado está en Plata.
 */
export function AgendaPage() {
  const venc = useVencimientos()
  const empresaId = useEmpresa().data?.empresa_id ?? ''
  const { campos, elegido } = useCampoElegido()
  const arreglarQ = useParaAtender()
  const reducir = useReducedMotion()
  const hoy = hoyLocal()
  const [abierto, setAbierto] = useState<Vencimiento | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todo')
  const [cuantas, setCuantas] = useState(5)
  // El calendario es lo principal (Lau, 05/11); la lista por semana, la otra forma. Se recuerda en este navegador.
  // Un link con ?mes=2026-12 (desde «Para mejorar» de Plata) abre el calendario en ese mes.
  const [paramsMes] = useSearchParams()
  const mesPedido = /^\d{4}-\d{2}$/.test(paramsMes.get('mes') ?? '') ? paramsMes.get('mes') : null
  const [forma, setForma] = useState<Forma>(() => (mesPedido ? 'calendario' : leerForma()))
  const elegirForma = (f: Forma) => {
    setForma(f)
    try {
      localStorage.setItem(CLAVE_FORMA, f)
    } catch {
      /* sin storage: queda en esta visita */
    }
  }
  const [revisar, setRevisar] = useState(false)
  // Si el detalle se abrió desde «¿Ya pagaste esto?», tiene «Volver a la lista».
  const [desdeRevisar, setDesdeRevisar] = useState(false)

  const todos = useMemo(() => (venc.data ?? []).filter((v) => !elegido || v.campoId === elegido.id), [venc.data, elegido])
  const items = useMemo(
    () => todos.filter((v) => (filtro === 'pagos' ? v.tipo === 'gasto' : filtro === 'cobros' ? v.tipo === 'ingreso' : filtro === 'cheques' ? v.medio === 'cheque' : true)),
    [todos, filtro],
  )
  const vencidos = useMemo(() => todos.filter((v) => pendiente(v) && v.fechaVencimiento! < hoy).sort((a, b) => a.fechaVencimiento!.localeCompare(b.fechaVencimiento!)), [todos, hoy])
  const semanas = useMemo(() => semanasQueVienen(items, hoy, cuantas), [items, hoy, cuantas])
  const cuatro = semanasQueVienen(todos, hoy, 4)
  const sale4 = cuatro.reduce((s, x) => s + x.sale, 0)
  const entra4 = cuatro.reduce((s, x) => s + x.entra, 0)
  const tareas = useMemo(
    () =>
      (arreglarQ.data?.potreros ?? [])
        .filter((p) => !elegido || p.campoId === elegido.id)
        .flatMap((p) => p.avisos.map((a) => ({ p, a })))
        .sort((x, y) => x.a.urgencia - y.a.urgencia),
    [arreglarQ.data, elegido],
  )
  const enCartera = filtro === 'cheques' ? cheques(todos, hoy) : null

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

  return (
    <div className="ancho-pagina mx-auto flex w-full flex-col gap-5">
      {/* El encabezado, como el de cada sección (Lau, 06/11): qué viene, qué mostrar y anotar. */}
      <motion.div {...entra(0)}>
        <Cabecera
          imagen={arroyo}
          posicion="40% 45%"
          derecha={
            <>
              <CampoVisto campos={campos} elegido={elegido} />
              <div role="radiogroup" aria-label="Verlo como" className="flex gap-1 rounded-full border border-borde bg-superficie p-1">
                {(
                  [
                    ['calendario', 'Calendario', 'Agenda'],
                    ['lista', 'Lista por semana', 'Comprobante'],
                  ] as const
                ).map(([v, t, ic]) => (
                  <button key={v} type="button" role="radio" aria-checked={forma === v} onClick={() => elegirForma(v)} className={cn('inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14.5px] font-bold transition-colors', forma === v ? 'bg-principal text-principal-texto' : 'text-texto hover:bg-superficie-hundida')}>
                    <Icono nombre={ic} tamano={16} />
                    {t}
                  </button>
                ))}
              </div>
            </>
          }
        >
          <h1 className="t-pagina text-texto">Agenda</h1>
          <p className="mt-2 max-w-[600px] text-[17px] leading-snug text-texto-suave">
            {sale4 || entra4 ? (
              <>
                En las próximas 4 semanas pagás <b className="t-cifra text-estado-problema-texto">{fmtCompact(sale4)}</b> y cobrás <b className="t-cifra text-estado-bien-texto">{fmtCompact(entra4)}</b>.
              </>
            ) : (
              'No hay nada por pagar ni cobrar en las próximas 4 semanas.'
            )}
          </p>
          {enCartera && (
            <p className="mt-1 text-[15px] text-texto-suave">
              Cheques: tenés <b className="t-cifra text-estado-bien-texto">{fmtCompact(enCartera.enCartera)}</b> para cobrar y diste <b className="t-cifra text-estado-problema-texto">{fmtCompact(enCartera.emitidos)}</b> que te van a debitar.
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {empresaId && (
              <AnotarPlata
                empresaId={empresaId}
                campoInicial={elegido?.id}
                vence
                renderTrigger={(abrir) => (
                  <button type="button" onClick={() => abrir()} className="inline-flex h-10 items-center gap-2.5 rounded-full bg-principal py-1 pr-1 pl-4 text-[14.5px] font-bold text-principal-texto hover:bg-terracota-600">
                    Anotar un pago o un cobro
                    <span className="grid size-8 place-items-center rounded-full bg-acento text-acento-texto">
                      <Icono nombre="Agregar" tamano={16} />
                    </span>
                  </button>
                )}
              />
            )}
            {/* Los filtros: botones para elegir, con su tilde el elegido. */}
            <div role="radiogroup" aria-label="Qué mostrar" className="flex flex-wrap gap-2">
              {(
                [
                  ['todo', 'Todo'],
                  ['pagos', 'Lo que pago'],
                  ['cobros', 'Lo que cobro'],
                  ['cheques', 'Cheques'],
                ] as [Filtro, string][]
              ).map(([v, t]) => (
                <button key={v} type="button" role="radio" aria-checked={filtro === v} onClick={() => setFiltro(v)} className={cn('inline-flex h-10 items-center gap-1.5 rounded-full border-[1.5px] px-4 text-[14.5px] font-bold transition-colors', filtro === v ? 'border-acento bg-acento text-acento-texto' : 'border-borde bg-superficie/90 text-texto hover:border-neutro-300')}>
                  {filtro === v && <Icono nombre="Guardar" tamano={16} />}
                  {t}
                </button>
              ))}
            </div>
          </div>
        </Cabecera>
      </motion.div>

      {/* Lo vencido sin marcar: se pregunta, no se grita. */}
      {vencidos.length > 0 && (
        <motion.button {...entra(2)} type="button" onClick={() => setRevisar(true)} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[20px] border-[1.5px] border-estado-atencion/50 bg-estado-atencion-suave/70 px-5 py-3.5 text-left transition-colors hover:bg-estado-atencion-suave">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-estado-atencion text-[17px] font-black text-superficie">!</span>
          <span className="min-w-0 flex-1 text-[16px] text-texto">
            <b>{vencidos.length === 1 ? 'Una cosa venció' : `${vencidos.length} cosas vencieron`} y no {vencidos.length === 1 ? 'la' : 'las'} marcaste.</b> ¿Ya {vencidos.every((v) => v.tipo === 'ingreso') ? 'las cobraste' : 'están pagadas'}?
          </span>
          <span className="inline-flex h-10 items-center rounded-full bg-principal px-5 text-[15px] font-bold text-principal-texto">Revisarlas</span>
        </motion.button>
      )}
      <PanelLateral chico abierto={revisar} onCerrar={() => setRevisar(false)} titulo="¿Ya pagaste esto?" bajada="Vencieron y no los marcaste. Lo que ya está, queda en Plata con la fecha en que vencía. Tildá lo que ya pagaste o cobraste." ancho>
        {vencidos.length > 0 ? <YaPagaste key={vencidos.map((v) => v.id).join()} vencidos={vencidos} hoy={hoy} onAbrir={(v) => (setRevisar(false), setDesdeRevisar(true), setAbierto(v))} /> : <p className="text-[15.5px] text-texto">Listo: no queda nada vencido sin marcar.</p>}
      </PanelLateral>

      {forma === 'calendario' ? (
        venc.isLoading ? (
          <div className="h-[520px] animate-pulse rounded-[24px] bg-superficie-hundida" aria-busy />
        ) : (
          <AgendaCalendario key={mesPedido ?? 'hoy'} mesInicial={mesPedido ?? undefined} items={items} hoy={hoy} empresaId={empresaId} campoId={elegido?.id} onAbrir={setAbierto} />
        )
      ) : (
        <>
      {/* Las semanas: una sola superficie, cada semana una franja. */}
      <motion.section aria-label="Las próximas semanas" className="overflow-hidden rounded-[24px] border border-borde bg-superficie">
        {venc.isLoading ? (
          <div className="h-[320px] animate-pulse bg-superficie-hundida" aria-busy />
        ) : venc.error ? (
          <p className="p-6 text-texto-suave">No pudimos cargar la Agenda. Revisá la conexión y probá de nuevo.</p>
        ) : (
          tramos(semanas, filtro === 'todo' ? tareas : []).map((t) =>
            t.vacias ? <SemanasVacias key={t.vacias[0]!.desde} semanas={t.vacias} /> : <FranjaSemana key={t.s.desde} s={t.s} hoy={hoy} tareas={t.tareas} empresaId={empresaId} onAbrir={setAbierto} />,
          )
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde px-6 py-4">
          <p className="text-[14.5px] text-texto-suave">Lo que ya pagaste o cobraste está en Plata, en los movimientos.</p>
          <button type="button" onClick={() => setCuantas((c) => c + 4)} className="h-11 rounded-full border-[1.5px] border-principal px-5 text-[15px] font-bold text-principal hover:bg-principal-suave">
            Ver 4 semanas más
          </button>
        </div>
      </motion.section>

        </>
      )}

      {empresaId && <PagarPanel item={abierto} empresaId={empresaId} onCerrar={() => (setAbierto(null), setDesdeRevisar(false))} onVolver={desdeRevisar ? () => (setAbierto(null), setDesdeRevisar(false), setRevisar(true)) : undefined} />}
    </div>
  )
}

/** «¿Ya pagaste esto?»: lo vencido sin marcar, tildado, para resolverlo de una vez. */
function YaPagaste({ vencidos, hoy, onAbrir }: { vencidos: Vencimiento[]; hoy: string; onAbrir: (v: Vencimiento) => void }) {
  const liquidar = useLiquidar()
  const revertir = useRevertirLiquidacion()
  const [tildados, setTildados] = useState<Set<string>>(() => new Set())
  const [ocupado, setOcupado] = useState(false)
  const elegidos = vencidos.filter((v) => tildados.has(v.id))

  async function marcar() {
    setOcupado(true)
    try {
      // El día que vencía: es cuando casi seguro se pagó.
      for (const v of elegidos) await liquidar.mutateAsync({ id: v.id, fecha: v.fechaVencimiento! })
      toast.success(`Listo: ${elegidos.length === 1 ? 'marcaste 1 cosa vencida' : `marcaste ${elegidos.length} cosas vencidas`}`, {
        description: elegidos.length === 1 ? 'Pasó a Plata con la fecha en que vencía.' : 'Pasaron a Plata con la fecha en que vencían.',
        action: { label: 'Deshacer', onClick: () => elegidos.forEach((v) => revertir.mutate({ id: v.id, fechaVencimiento: v.fechaVencimiento, fechaCobroPago: v.fechaVencimiento })) },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo. Probá de nuevo.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section aria-label="Vencido sin marcar">
      <button type="button" disabled={!elegidos.length || ocupado} onClick={() => void marcar()} className="mb-2 h-12 w-full rounded-full bg-principal px-6 text-[15.5px] font-bold text-principal-texto hover:bg-terracota-600 disabled:opacity-40">
        {ocupado ? 'Marcando…' : elegidos.length ? `Sí, ya ${elegidos.length === 1 ? 'está' : 'están'}: marcar ${elegidos.length}` : 'Tildá lo que ya está'}
      </button>
      <button type="button" onClick={() => setTildados(elegidos.length === vencidos.length ? new Set() : new Set(vencidos.map((v) => v.id)))} className="mb-1 h-10 rounded-full border-[1.5px] border-borde bg-superficie px-4 text-[14.5px] font-bold text-texto hover:border-principal hover:text-principal">
        {elegidos.length === vencidos.length ? 'Destildar todas' : 'Tildar todas'}
      </button>
      <ul className="divide-y divide-borde">
        {vencidos.map((v) => {
          const si = tildados.has(v.id)
          const cobro = v.tipo === 'ingreso'
          const dias = Math.round((Date.parse(`${hoy}T12:00:00`) - Date.parse(`${v.fechaVencimiento}T12:00:00`)) / 86_400_000)
          return (
            <li key={v.id} className="flex items-center gap-1 py-1.5">
              {/* El tilde con un área grande para tocar; el resto de la fila abre el detalle. */}
              <button
                type="button"
                role="checkbox"
                aria-checked={si}
                aria-label={`${si ? 'Destildar' : 'Tildar'}: ${tituloDe(v)}`}
                onClick={() =>
                  setTildados((t) => {
                    const n = new Set(t)
                    if (si) n.delete(v.id)
                    else n.add(v.id)
                    return n
                  })
                }
                className="group/tilde grid size-12 shrink-0 place-items-center rounded-[14px] transition-colors hover:bg-principal-suave"
              >
                <span className={cn('grid size-7 place-items-center rounded-[8px] border-2 transition-colors', si ? 'border-principal bg-principal text-principal-texto' : 'border-texto/40 bg-superficie group-hover/tilde:border-principal')}>{si && <Icono nombre="Guardar" tamano={16} />}</span>
              </button>
              <button type="button" onClick={() => onAbrir(v)} className="group flex min-w-0 flex-1 items-center gap-4 rounded-[14px] border-[1.5px] border-transparent px-3 py-2.5 text-left transition-colors hover:border-principal/50 hover:bg-principal-suave/70">
                <span className="w-12 shrink-0 text-[14px] font-semibold text-texto-suave">
                  {Number(v.fechaVencimiento!.slice(8))} {mesCorto(v.fechaVencimiento!)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-texto group-hover:text-principal">
                    {cobro ? 'Cobrar' : 'Pagar'}: {tituloDe(v)}
                  </span>
                  <span className="block truncate text-[14px] text-texto-suave">{[v.contraparte, v.campo, `venció hace ${dias} ${dias === 1 ? 'día' : 'días'}`].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={cn('t-cifra shrink-0', cobro ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>
                  {cobro ? '+' : '−'}
                  {pesos(v.monto)}
                </span>
                <span className="grid size-8 shrink-0 place-items-center rounded-full text-texto-suave transition-colors group-hover:bg-principal group-hover:text-principal-texto">
                  <Icono nombre="Siguiente" tamano={16} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

type Tarea = { p: { key: string; observacionId: string; potrero: string; campo: string; cabezas: number; hace: number }; a: { key: string; tipo: Parameters<typeof SeSoluciono>[0]['senal']['tipo']; nivel: Nivel; titulo: string } }

/** Las semanas en tramos: las que tienen algo, de a una; las vacías seguidas, juntas en una línea. */
function tramos(semanas: Semana[], tareas: Tarea[]) {
  const out: ({ s: Semana; tareas: Tarea[]; vacias?: undefined } | { vacias: Semana[] })[] = []
  semanas.forEach((s, i) => {
    const t = i === 0 ? tareas : []
    if (s.items.length || t.length) return void out.push({ s, tareas: t })
    const prev = out[out.length - 1]
    if (prev?.vacias) prev.vacias.push(s)
    else out.push({ vacias: [s] })
  })
  return out
}

/** Una o varias semanas sin nada: una línea fina, que no compita con lo que sí hay. */
function SemanasVacias({ semanas }: { semanas: Semana[] }) {
  const a = semanas[0]!
  const b = semanas[semanas.length - 1]!
  const titulo = semanas.length === 1 ? a.titulo : `Del ${Number(a.desde.slice(8))} de ${mesCorto(a.desde)} al ${Number(b.hasta.slice(8))} de ${mesCorto(b.hasta)}`
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-borde bg-superficie-hundida/40 px-6 py-3.5 last:border-b-0">
      <span className="text-[15px] font-bold text-texto-suave">{titulo}</span>
      <span className="text-[14.5px] text-texto-suave/80">Nada que pagar ni cobrar.</span>
    </div>
  )
}

/** Una semana con cosas: a la izquierda cuál es y cuánto se mueve, destacado; a la derecha, cada cosa en su tarjeta. */
function FranjaSemana({ s, hoy, tareas, empresaId, onAbrir }: { s: Semana; hoy: string; tareas: Tarea[]; empresaId: string; onAbrir: (v: Vencimiento) => void }) {
  const rango = `${Number(s.desde.slice(8))} de ${mesCorto(s.desde)} al ${Number(s.hasta.slice(8))} de ${mesCorto(s.hasta)}`
  const actual = s.desde <= hoy && hoy <= s.hasta
  return (
    <div className="grid border-b border-borde last:border-b-0 md:grid-cols-[220px_minmax(0,1fr)]">
      <div className="flex flex-col gap-0.5 px-6 pt-5 md:py-6">
        {actual && <span className="text-[13px] font-semibold text-principal">Ahora</span>}
        <h2 className="t-tarjeta text-texto">{s.titulo.startsWith('Del') ? rango.charAt(0).toUpperCase() + rango.slice(1) : s.titulo}</h2>
        {!s.titulo.startsWith('Del') && <p className="text-[14px] font-semibold text-texto-suave">{rango}</p>}
        {(s.sale > 0 || s.entra > 0) && (
          <div className="mt-3 flex flex-col gap-0.5 text-[15px] text-texto-suave">
            {s.sale > 0 && (
              <span>
                Pagás <span className="t-cifra text-estado-problema-texto">{fmtCompact(s.sale)}</span>
              </span>
            )}
            {s.entra > 0 && (
              <span>
                Cobrás <span className="t-cifra text-estado-bien-texto">{fmtCompact(s.entra)}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <div className="px-3 pb-3 md:py-3 md:pr-5 md:pl-0">
          <ul className="flex flex-col divide-y divide-borde/70">
            {s.items.map((v) => (
              <Cosa key={v.id} v={v} hoy={hoy} onAbrir={onAbrir} />
            ))}
            {tareas.map((t) => (
              <li key={`${t.p.key}-${t.a.key}`} className="flex items-center gap-4 px-3 py-3.5">
                <span className="w-10 shrink-0 text-center text-[12.5px] font-semibold text-texto-suave">Campo</span>
                <span aria-hidden className={cn('h-11 w-1 shrink-0 rounded-full', COLOR_NIVEL[t.a.nivel])} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16.5px] font-bold text-texto">
                    {t.a.titulo} en el {t.p.potrero}
                  </p>
                  <p className="truncate text-[14.5px] text-texto/70">{[t.p.campo, t.p.cabezas > 0 ? `${t.p.cabezas} animales adentro` : null, `lo vio la recorrida ${haceLabel(t.p.hace)}`].filter(Boolean).join(' · ')}</p>
                </div>
                <SeSoluciono senal={{ potreroId: t.p.key, observacionId: t.p.observacionId, tipo: t.a.tipo }} empresaId={empresaId} />
              </li>
            ))}
          </ul>
      </div>
    </div>
  )
}
