import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Icono } from '@/components/tropero/icono'
import { CampoVisto } from '@/features/campos/campo-visto'
import { useCampoDesdeUrl, useCampoElegido } from '@/features/campos/campo-elegido'
import { AlquilerDialog } from '@/features/analitica/alquiler-dialog'
import { actividadLabel, fmtCompact, gastosPorCategoria, porActividad, porCampo } from '@/features/analitica/compute'
import { useMovimientos, usePendientes } from '@/features/analitica/hooks'
import { useCampos } from '@/features/campos/hooks'
import { useGordoActual, useNovilloCanuelas } from '@/features/cotizaciones/hooks'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import trigal from '@/assets/tropero/trigal.webp'
import { Cabecera } from '@/components/tropero/cabecera'
import { useDolarHistorico } from './dolar'
import { AnotarPlata } from './anotar-plata'
import { MesAMes } from './mes-a-mes'
import { avisosParaMejorar, campanas as porCampana, comparacionCorta, delPeriodo, gastosUsdPorCategoria, mesAMes, mesMasApretado, periodos, proximos, resumenPeriodo, type Aviso, type Periodo } from './plata'

const CURVA = [0.22, 1, 0.36, 1] as const

const pesos = (n: number) => fmtCompact(n)
const conSigno = (n: number) => (n >= 0 ? `+${fmtCompact(n)}` : fmtCompact(n))
const diaYmes = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00`)
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' }).replace(/^\w/, (c) => c.toUpperCase())
}

/**
 * Plata (rediseño, Figma página 35 «Plata · La plata»). Arriba, cómo vienen los
 * últimos 12 meses y la comparación en dólares; después lo que viene, en qué se
 * va y qué rinde. El campo es el de la barra izquierda.
 */
export function PlataPage() {
  const empresaId = useEmpresa().data?.empresa_id ?? ''
  const movs = useMovimientos()
  const pend = usePendientes()
  const dolar = useDolarHistorico()
  const pedido = useCampoDesdeUrl()
  const identidad = useCampoElegido()
  const campoId = pedido ?? identidad.elegido?.id ?? null
  const reducir = useReducedMotion()
  const navigate = useNavigate()
  const [alquiler, setAlquiler] = useState(false)
  const [vezAlquiler, setVezAlquiler] = useState(0)
  const [vista, setVista] = useState<'actividad' | 'campo'>('campo')
  const [clave, setClave] = useState<Periodo['clave']>('doce')
  const hoy = hoyLocal()
  const campos = useCampos()
  // El precio del gordo como en la barra de arriba: el más reciente, a igual fecha el manual.
  const manual = useGordoActual(empresaId).data
  const canuelas = useNovilloCanuelas().data
  const gordo = (canuelas && (!manual || canuelas.fecha > manual.fecha) ? canuelas.valor : manual?.valor) ?? null
  const serie = useMemo(() => dolar.data ?? [], [dolar.data])
  const todos = useMemo(() => periodos(hoy), [hoy])
  const periodo = todos.find((p) => p.clave === clave)!

  const delCampo = useMemo(() => (movs.data ?? []).filter((m) => !campoId || m.campo_id === campoId), [movs.data, campoId])
  const pendientes = useMemo(() => (pend.data ?? []).filter((p) => !campoId || p.campoId === campoId), [pend.data, campoId])
  const anio = useMemo(() => resumenPeriodo(delCampo, periodo, serie), [delCampo, periodo, serie])
  const doce = useMemo(() => delPeriodo(delCampo, periodo.desde, periodo.hasta), [delCampo, periodo.desde, periodo.hasta])
  const filasCampana = useMemo(() => porCampana(delCampo, hoy, serie), [delCampo, hoy, serie])
  const todosGastos = useMemo(() => gastosPorCategoria(doce, 'caja'), [doce])
  const gastos = todosGastos.slice(0, 5)
  const totalGastos = todosGastos.reduce((s, g) => s + g.monto, 0) || 1
  const apretado = mesMasApretado(pendientes, hoy)
  const meses = useMemo(() => mesAMes(delCampo, pendientes, hoy), [delCampo, pendientes, hoy])
  const viene = proximos(pendientes, hoy, 4)
  const rinde = vista === 'campo' ? porCampo(doce, 'caja').map((c) => ({ ...c, key: c.campoId })) : porActividad(doce, 'caja').map((a) => ({ ...a, key: a.actividad, nombre: a.actividad === 'sin' ? 'Sin actividad' : actividadLabel[a.actividad] }))
  const maxRinde = Math.max(...rinde.map((r) => Math.abs(r.resultado)), 1)
  const hectareas = new Map((campos.data ?? []).map((c) => [c.id, c.hectareas]))
  const avisos = avisosParaMejorar({
    apretado,
    gordo,
    gastosAhora: gastosUsdPorCategoria(delCampo, periodo.desde, periodo.hasta, serie),
    gastosAntes: gastosUsdPorCategoria(delCampo, periodo.antesDesde, periodo.antesHasta, serie),
    campos: porCampo(doce, 'caja').map((c) => ({ campoId: c.campoId, nombre: c.nombre, resultado: c.resultado, gastos: c.gastos, ingresos: c.ingresos, hectareas: hectareas.get(c.campoId) ?? null })),
    periodo,
  })
  const entra = (i: number) => (reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.06, ease: CURVA } })

  if (movs.isLoading) return <div className="mx-auto h-[400px] w-full ancho-pagina animate-pulse rounded-[24px] bg-superficie-hundida" aria-busy />
  if (movs.error) return <p className="text-texto-suave">No pudimos cargar la plata. Revisá la conexión y probá de nuevo.</p>

  const vacio = delCampo.length === 0
  const ganando = anio.resultado >= 0
  const comparacion = comparacionCorta(anio)
  const contra = { doce: 'que el año anterior', campana: 'que la campaña pasada', pasada: 'que la anterior' }[clave]
  const verbo = periodo.enCurso ? (ganando ? 'Van ganando' : 'Van perdiendo') : ganando ? 'Ganaron' : 'Perdieron'

  const BOTON_SEC = 'inline-flex h-12 items-center gap-2 rounded-full border-[1.5px] border-borde bg-superficie/90 px-5 text-[15px] font-bold text-texto backdrop-blur-sm hover:border-principal hover:text-principal'
  const anotar = (abrir: () => void, texto: string, secundario = false) => (
    <button
      type="button"
      onClick={abrir}
      className={cn(
        'inline-flex h-12 items-center gap-3 rounded-full py-1 pr-1 text-[15.5px] font-bold transition-colors',
        secundario ? 'bg-acento px-5 text-acento-texto hover:opacity-90' : 'bg-principal pl-5 text-principal-texto hover:bg-terracota-600',
      )}
    >
      {texto}
      {!secundario && (
        <span className="grid size-10 place-items-center rounded-full bg-acento text-acento-texto">
          <Icono nombre="Agregar" tamano={16} />
        </span>
      )}
    </button>
  )

  return (
    <div className="mx-auto flex w-full ancho-pagina flex-col gap-8">
      {/* El encabezado, como el de cada sección (Lau, 06/11): el resultado del período y lo que se hace. */}
      <motion.div {...entra(0)}>
        <Cabecera imagen={trigal} posicion="50% 62%" derecha={
            <>
              <CampoVisto campos={identidad.campos} elegido={identidad.campos.find((c) => c.id === campoId) ?? null} />
              <Link to="/analitica/movimientos" className="inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-borde bg-superficie px-4 text-[14.5px] font-bold text-texto hover:border-principal hover:text-principal">
                Ver los movimientos
                <Icono nombre="Siguiente" tamano={16} />
              </Link>
            </>
          }>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="t-pagina text-texto">Plata</h1>
            {!vacio && (
              <div role="tablist" aria-label="Período" className="flex shrink-0 gap-1 rounded-full border border-borde bg-superficie p-1">
                {todos.map((p) => (
                  <button key={p.clave} type="button" role="tab" aria-selected={clave === p.clave} onClick={() => setClave(p.clave)} className={cn('h-8 rounded-full px-3.5 text-[13.5px] font-bold whitespace-nowrap transition-colors', clave === p.clave ? 'bg-principal text-principal-texto' : 'text-texto hover:bg-superficie-hundida')}>
                    {p.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
          {vacio ? (
            <p className="mt-3 text-[17px] text-texto-suave">Anotá el primer gasto y mirá cómo viene el campo.</p>
          ) : (
            <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <p className="text-[14.5px] font-semibold text-texto-suave">{verbo}</p>
                <p className={cn('t-numero-hero', ganando ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>{pesos(Math.abs(anio.resultado))}</p>
              </div>
              <div className="flex flex-col gap-1.5 pb-1">
                <p className="flex items-center gap-3 text-[14.5px] whitespace-nowrap text-texto-suave">
                  <span>
                    Entró <b className="t-cifra text-estado-bien-texto">{pesos(anio.entro)}</b>
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    Salió <b className="t-cifra text-estado-problema-texto">{pesos(anio.salio)}</b>
                  </span>
                </p>
                <p className="h-[24px]">
                  {comparacion && (
                    <span className={cn('inline-flex h-full items-center gap-1 rounded-full px-2.5 text-[13px] font-bold whitespace-nowrap', comparacion.sube ? 'bg-estado-bien-suave text-estado-bien-texto' : 'bg-estado-problema-suave text-estado-problema-texto')}>
                      {comparacion.sube ? '▲' : '▼'} {comparacion.texto} {contra}, en dólares
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
          {/* Lo que se hace con la plata, todo junto y a la vista. */}
          <div className="mt-5 flex flex-wrap gap-2.5">
            {empresaId && <span data-guia="analitica-cargar" className="contents"><AnotarPlata empresaId={empresaId} campoInicial={campoId ?? undefined} renderTrigger={(abrir) => anotar(() => abrir(), 'Anotar un gasto')} /></span>}
            {empresaId && (
              <AnotarPlata
                empresaId={empresaId}
                campoInicial={campoId ?? undefined}
                renderTrigger={(abrir) => (
                  <button type="button" onClick={() => abrir(true)} className={BOTON_SEC}>
                    <Icono nombre="Foto" tamano={16} />
                    Escanear un comprobante
                  </button>
                )}
              />
            )}
            <button type="button" data-guia="analitica-alquiler" onClick={() => (setVezAlquiler((v) => v + 1), setAlquiler(true))} className={BOTON_SEC}>
              <Icono nombre="Comprobante" tamano={16} />
              Cargar un alquiler
            </button>
          </div>
        </Cabecera>
      </motion.div>

      {/* Para mejorar: lo que conviene mirar, cada cosa con adónde ir a hacer algo. */}
      {!vacio && avisos.length > 0 && (
        <motion.section {...entra(2)}>
          <h2 className="t-seccion pb-3 text-texto">Para mejorar</h2>
          <ul className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
            {avisos.map((a) => (
              <AvisoTarjeta key={a.id} aviso={a} onIr={() => {
                if (a.accion.campoId) identidad.elegir(a.accion.campoId)
                navigate(a.accion.a)
              }} />
            ))}
          </ul>
        </motion.section>
      )}

      {/* Mes a mes: lo que entró y salió, y lo anotado para los próximos meses. */}
      {!vacio && (
        <motion.section {...entra(2)} className="rounded-[22px] border border-borde bg-superficie px-7 pt-6 pb-3 shadow-[0_1px_0_rgba(19,27,22,0.04),0_12px_32px_-20px_rgba(19,27,22,0.25)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="t-seccion text-texto">Mes a mes</h2>
            <p className="flex items-center gap-4 text-[13.5px] font-semibold text-texto-suave">
              <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-[3px] bg-plata-entra" />Quedó a favor</span>
              <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-[3px] bg-plata-sale" />En contra</span>
              <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-[3px] bg-[repeating-linear-gradient(45deg,var(--texto-suave)_0_2px,transparent_2px_4px)]" />Anotado</span>
            </p>
          </div>
          <MesAMes meses={meses} apretado={apretado} />
        </motion.section>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Lo que viene: el mes más apretado y los próximos cobros y pagos. */}
        <motion.section {...entra(3)}>
          <div className="flex items-center justify-between gap-3 border-b border-borde pb-2">
            <h2 className="t-seccion text-texto">Lo que viene</h2>
            <button type="button" onClick={() => navigate('/agenda')} className="inline-flex h-9 items-center gap-1.5 rounded-full border-[1.5px] border-borde bg-superficie px-3.5 text-[14px] font-bold text-texto transition-colors hover:border-principal hover:text-principal">
              Ver la agenda
            </button>
          </div>
          {viene.length === 0 ? (
            <p className="py-6 text-[15px] text-texto-suave">No hay cobros ni pagos con fecha. Cuando anotes uno que vence, aparece acá y en la Agenda.</p>
          ) : (
            <ul>
              {viene.map((p) => (
                <Fila
                  key={p.id}
                  color={p.tipo === 'ingreso' ? 'bg-estado-bien' : 'bg-acento'}
                  titulo={p.descripcion}
                  detalle={diaYmes(p.fechaVencimiento!)}
                  derecha={<span className={cn('t-cifra font-bold', p.tipo === 'ingreso' ? 'text-estado-bien-texto' : 'text-texto')}>{conSigno((p.tipo === 'ingreso' ? 1 : -1) * (p.monto ?? 0))}</span>}
                />
              ))}
            </ul>
          )}
        </motion.section>

        {/* En qué se va: las categorías de gasto de los últimos 12 meses. */}
        <motion.section {...entra(3)}>
          <h2 className="t-seccion border-b border-borde pb-2 text-texto">En qué se va</h2>
          {gastos.length === 0 ? (
            <p className="py-6 text-[15px] text-texto-suave">Cuando anotes gastos, acá ves en qué se va la plata.</p>
          ) : (
            <ul className="flex flex-col gap-3.5 pt-2">
              {gastos.map((g) => (
                <li key={g.nombre}>
                  <p className="flex items-baseline justify-between gap-3 text-[14.5px] font-semibold text-texto">
                    <span className="truncate">{g.nombre}</span>
                    <span className="shrink-0">
                      <span className="cifra font-bold">{pesos(g.monto)}</span>
                      <span className="cifra ml-1.5 text-texto-suave">{Math.round((g.monto / totalGastos) * 100)} %</span>
                    </span>
                  </p>
                  <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-superficie-hundida">
                    <span className="block h-full rounded-full bg-plata-sale" style={{ width: `${Math.max(3, (g.monto / totalGastos) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      </div>

      {/* Qué rinde: por campo o por actividad, en los últimos 12 meses. */}
      <motion.section {...entra(4)}>
        <div className="flex items-center justify-between gap-3 border-b border-borde pb-3">
          <h2 className="t-seccion text-texto">Qué rinde</h2>
          <div role="tablist" aria-label="Qué rinde" className="flex gap-1 rounded-full bg-superficie-hundida p-1">
            {(['campo', 'actividad'] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={vista === v} onClick={() => setVista(v)} className={cn('h-9 rounded-full px-4 text-[14.5px] font-bold transition-colors', vista === v ? 'bg-principal text-principal-texto' : 'text-texto hover:bg-superficie')}>
                {v === 'campo' ? 'Por campo' : 'Por actividad'}
              </button>
            ))}
          </div>
        </div>
        {rinde.length === 0 ? (
          <p className="py-6 text-[15px] text-texto-suave">Con lo que entra y sale de cada {vista === 'campo' ? 'campo' : 'actividad'}, acá ves cuál deja plata.</p>
        ) : (
          <ul>
            {rinde.map((r) => {
              const ancho = (Math.abs(r.resultado) / maxRinde) * 50
              return (
                <li key={r.key} className="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)_110px] items-center gap-5 border-b border-borde/70 py-3.5 last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate text-[15.5px] font-bold text-texto">{r.nombre}</p>
                    <p className="truncate text-[13.5px] text-texto-suave">Entró {pesos(r.ingresos)}; salió {pesos(r.gastos)}</p>
                  </div>
                  <div className="relative h-3">
                    <span aria-hidden className="absolute inset-y-[-6px] left-1/2 w-px bg-texto/30" />
                    <span
                      aria-hidden
                      className={cn('absolute inset-y-0 rounded-[4px]', r.resultado >= 0 ? 'left-1/2 bg-plata-entra' : 'right-1/2 bg-plata-sale')}
                      style={{ width: `${Math.max(1, ancho)}%` }}
                    />
                  </div>
                  <span className={cn('t-cifra text-right font-bold', r.resultado >= 0 ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>{conSigno(r.resultado)}</span>
                </li>
              )
            })}
          </ul>
        )}
        {vista === 'actividad' && rinde.some((r) => r.key === 'sin') && <p className="pt-3 text-[13.5px] text-texto-suave">Lo «sin actividad» se reparte cuando le digas a cada gasto si es de cría, invernada o agricultura.</p>}
      </motion.section>

      {/* Campaña por campaña: julio a junio, en pesos y en dólares. */}
      {filasCampana.length > 0 && (
        <motion.section {...entra(5)}>
          <h2 className="t-seccion border-b border-borde pb-3 text-texto">Campaña por campaña</h2>
          <table className="w-full text-left">
            <thead>
              <tr className="text-[13px] text-texto-suave">
                <th className="py-2.5 font-semibold">Campaña</th>
                <th className="py-2.5 text-right font-semibold">Entró</th>
                <th className="py-2.5 text-right font-semibold">Salió</th>
                <th className="py-2.5 text-right font-semibold">Resultado</th>
                <th className="py-2.5 text-right font-semibold">En dólares</th>
              </tr>
            </thead>
            <tbody>
              {filasCampana.map((c, i) => {
                const antes = filasCampana[i + 1]
                const cambio = c.usd != null && antes?.usd != null && !c.enCurso && antes.usd !== 0 ? (c.usd - antes.usd) / Math.abs(antes.usd) : null
                return (
                  <tr key={c.nombre} className="border-t border-borde/70">
                    <td className="py-3.5 text-[15.5px] font-bold text-texto">
                      {c.nombre}
                      {c.enCurso && <span className="ml-2 text-[13px] font-semibold text-texto-suave">hasta hoy</span>}
                    </td>
                    <td className="t-cifra py-3.5 text-right text-texto">{pesos(c.entro)}</td>
                    <td className="t-cifra py-3.5 text-right text-texto">{pesos(c.salio)}</td>
                    <td className={cn('t-cifra py-3.5 text-right font-bold', c.resultado >= 0 ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>{conSigno(c.resultado)}</td>
                    <td className="t-cifra py-3.5 text-right text-texto">
                      {c.usd == null ? '—' : `${c.usd >= 0 ? '+' : '−'}US$ ${Math.round(Math.abs(c.usd) / 1000).toLocaleString('es-AR')} mil`}
                      {cambio != null && <span className={cn('ml-2 text-[14px] font-bold', cambio >= 0 ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>{cambio >= 0 ? '▲' : '▼'} {Math.round(Math.abs(cambio) * 100)} %</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </motion.section>
      )}

      {/* La key cambia al abrir: arranca de cero y sale con su animación. */}
      {empresaId && <AlquilerDialog key={vezAlquiler} empresaId={empresaId} campoId={campoId ?? undefined} open={alquiler} onOpenChange={setAlquiler} />}
    </div>
  )
}

function Fila({ color, titulo, detalle, derecha }: { color: string; titulo: string; detalle: string; derecha: React.ReactNode }) {
  return (
    <li className="flex items-center gap-4 border-b border-borde/70 py-3 last:border-b-0">
      <span aria-hidden className={cn('h-9 w-1 shrink-0 rounded-full', color)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15.5px] font-bold text-texto">{titulo}</p>
        <p className="truncate text-[13.5px] text-texto-suave">{detalle}</p>
      </div>
      <div className="shrink-0">{derecha}</div>
    </li>
  )
}

function AvisoTarjeta({ aviso, onIr }: { aviso: Aviso; onIr: () => void }) {
  const max = Math.max(aviso.barras[0].valor, aviso.barras[1].valor, 1)
  return (
    <li className="flex flex-col rounded-[20px] border border-borde bg-superficie p-5">
      <span className={cn('w-fit rounded-full px-2.5 py-0.5 text-[12.5px] font-bold', aviso.tono === 'mal' ? 'bg-estado-problema-suave text-estado-problema-texto' : 'bg-estado-atencion-suave text-estado-atencion-texto')}>{aviso.tema}</span>
      <p className="t-tarjeta mt-2.5 text-texto">{aviso.titulo}</p>
      {/* Las dos cifras, para verlo sin leer. */}
      <div className="mt-4 flex flex-col gap-2.5">
        {aviso.barras.map((b) => (
          <div key={b.texto}>
            <p className="flex items-baseline justify-between text-[13.5px]">
              <span className="font-semibold text-texto-suave">{b.texto}</span>
              <b className={cn('t-cifra', b.tono === 'entra' ? 'text-estado-bien-texto' : b.tono === 'sale' ? 'text-estado-problema-texto' : 'text-texto')}>{b.muestra}</b>
            </p>
            <span className="mt-1 block h-2 rounded-full bg-superficie-hundida">
              <span className={cn('block h-full rounded-full', b.tono === 'entra' ? 'bg-plata-entra' : b.tono === 'sale' ? 'bg-plata-sale' : 'bg-neutro-300')} style={{ width: `${Math.max(2, (b.valor / max) * 100)}%` }} />
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 flex-1 text-[14px] leading-snug text-texto-suave">{aviso.detalle}</p>
      <button type="button" onClick={onIr} className="mt-4 inline-flex h-10 w-fit items-center gap-1.5 rounded-full border-[1.5px] border-principal px-4 text-[14px] font-bold text-principal hover:bg-principal hover:text-principal-texto">
        {aviso.accion.texto}
        <Icono nombre="Siguiente" tamano={16} />
      </button>
    </li>
  )
}
