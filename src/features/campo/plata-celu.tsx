import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import trigal from '@/assets/tropero/trigal.webp'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { actividadLabel, fmtCompact, gastosPorCategoria, porActividad, porCampo } from '@/features/analitica/compute'
import { useMovimientos, usePendientes } from '@/features/analitica/hooks'
import { useDolarHistorico } from '@/features/analitica/tropero/dolar'
import { avisosParaMejorar, campanas as porCampana, comparacionCorta, delPeriodo, gastosUsdPorCategoria, mesAMes, mesMasApretado, periodos, proximos, resumenPeriodo, type Aviso, type Mes, type Periodo } from '@/features/analitica/tropero/plata'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useCampos } from '@/features/campos/hooks'
import { useGordoActual, useNovilloCanuelas } from '@/features/cotizaciones/hooks'
import { puedeCargar, veePlata } from '@/features/empresa/secciones'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import { PlataPage } from './plata-page'
import { BAJADA, MONTO, TARJETA } from './sistema'
import { Encabezado, Portada } from './sistema-ui'

/**
 * Plata en el celular (Lau, 17/11; maqueta elegida). Lo mismo que la Plata de
 * la compu, en el orden en que se mira en el celular y con el sistema de Hoy:
 *   1. ¿Cómo vengo? El resultado del período, lo que entró y salió, en dólares.
 *   2. Anotar un gasto (el teclado del celular, anda sin señal) o con la foto.
 *   3. Para mejorar: un renglón por aviso; tocándolo se abre el detalle.
 *   4. Lo que viene, 5. mes a mes, 6. en qué se va, 7. qué rinde, 8. campañas.
 * Nada lleva a una pantalla de la compu (Lau, 17/11): lo que se hace, se hace acá.
 * Quien carga la plata pero no la ve entra directo al teclado.
 */

const CURVA = [0.22, 1, 0.36, 1] as const

const pesos = (n: number) => fmtCompact(n)
const conSigno = (n: number) => (n >= 0 ? `+${fmtCompact(n)}` : fmtCompact(n))
const diaYmes = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^\w/, (c) => c.toUpperCase())
// La comparación ya está en dólares (US$): alcanza con decir contra qué.
const CONTRA: Record<Periodo['clave'], string> = { doce: 'que el año anterior', campana: 'que la campaña pasada', pasada: 'que la anterior' }
// En el celular, el período en palabras cortas que entran en una línea.
const ETIQUETA_PERIODO: Record<Periodo['clave'], string> = { doce: '12 meses', campana: 'Esta campaña', pasada: 'La pasada' }
const ICONO_AVISO: Record<string, NombreIcono> = { apretado: 'Agenda', subio: 'Plata', campo: 'Campos' }

export function PlataCelu() {
  const { data: membresia } = useEmpresa()
  const [anotar, setAnotar] = useState<null | 'teclado' | 'foto'>(null)
  const ve = veePlata(membresia)
  const carga = puedeCargar(membresia, 'plata')
  // Carga pero no ve los números (un encargado): el teclado es toda su Plata.
  if (!ve) return <PlataPage />
  return (
    <>
      {/* El shell no scrollea: cada pantalla trae el suyo (como Hoy). */}
      <div className="h-full overflow-y-auto">
        <PlataNumeros carga={carga} onAnotar={setAnotar} />
      </div>
      {anotar && (
        <div role="dialog" aria-modal="true" aria-label="Anotar un gasto" className="fixed inset-0 z-[60] flex flex-col bg-fondo">
          <PlataPage onCerrar={() => setAnotar(null)} conFoto={anotar === 'foto'} />
        </div>
      )}
    </>
  )
}

function PlataNumeros({ carga, onAnotar }: { carga: boolean; onAnotar: (modo: 'teclado' | 'foto') => void }) {
  const empresaId = useEmpresa().data?.empresa_id ?? ''
  const movs = useMovimientos()
  const pend = usePendientes()
  const dolar = useDolarHistorico()
  const identidad = useCampoElegido()
  const campoId = identidad.elegido?.id ?? null
  const campos = useCampos()
  const manualQ = useGordoActual(empresaId)
  const canuelasQ = useNovilloCanuelas()
  const reducir = useReducedMotion()
  const [clave, setClave] = useState<Periodo['clave']>('doce')
  const [vista, setVista] = useState<'campo' | 'actividad'>('campo')
  const [abierto, setAbierto] = useState<string | null>(null)
  const hoy = hoyLocal()
  const manual = manualQ.data
  const canuelas = canuelasQ.data
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
  const entra = (i: number) => (reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.05, ease: CURVA } })

  const cargando = movs.isLoading || pend.isLoading || dolar.isLoading || campos.isLoading || manualQ.isLoading || canuelasQ.isLoading
  const vacio = delCampo.length === 0
  const ganando = anio.resultado >= 0
  const comparacion = comparacionCorta(anio)
  const verbo = periodo.enCurso ? (ganando ? 'Van ganando' : 'Van perdiendo') : ganando ? 'Ganaron' : 'Perdieron'

  return (
    <div className="flex flex-col gap-8 px-4 pt-[calc(var(--enc,0px)+12px)] pb-[calc(var(--barra,0px)+24px)]">

      {/* 1. ¿Cómo vengo? */}
      <motion.section {...entra(0)} aria-labelledby="plata-titulo" className="flex flex-col gap-3">
        <Portada id="plata-titulo" titulo="Plata" imagen={trigal} posicion="50% 62%" />
        {/* El resultado en una tarjeta: el período, cuánto, de dónde sale y qué se hace. */}
        <div className={cn(TARJETA, 'flex flex-col gap-4 p-4')}>
          {!vacio && (
            <div className="flex items-center gap-2">
            <div role="tablist" aria-label="Período" className="flex flex-1 gap-1 rounded-full bg-superficie-hundida p-1">
              {todos.map((p) => (
                <button key={p.clave} type="button" role="tab" aria-selected={clave === p.clave} onClick={() => setClave(p.clave)} className={cn('h-8 flex-1 rounded-full px-2 text-[13.5px] font-bold whitespace-nowrap transition-colors', clave === p.clave ? 'bg-principal text-principal-texto' : 'text-texto')}>
                  {ETIQUETA_PERIODO[p.clave]}
                </button>
              ))}
            </div>
            </div>
          )}
          {cargando ? (
            <div className="h-[140px] animate-pulse rounded-[14px] bg-superficie-hundida" aria-busy />
          ) : vacio ? (
            <p className="text-[15px] text-texto-suave">Anotá el primer gasto y mirá cómo viene el campo.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
                <div>
                  <p className={cn(BAJADA, 'font-semibold')}>{verbo}</p>
                  <p className={cn('titulo-display text-[34px] leading-none', ganando ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>{pesos(Math.abs(anio.resultado))}</p>
                </div>
              </div>
              {/* De dónde sale: lo que entró contra lo que salió, en barras. */}
              <div className="flex flex-col gap-2">
                {[
                  { texto: 'Entró', valor: anio.entro, clase: 'bg-plata-entra', tono: 'text-estado-bien-texto' },
                  { texto: 'Salió', valor: anio.salio, clase: 'bg-plata-sale', tono: 'text-estado-problema-texto' },
                ].map((b) => (
                  <div key={b.texto} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3">
                    <span className={BAJADA}>{b.texto}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-superficie-hundida">
                      <span className={cn('block h-full rounded-full', b.clase)} style={{ width: `${Math.max(b.valor > 0 ? 3 : 0, (b.valor / Math.max(anio.entro, anio.salio, 1)) * 100)}%` }} />
                    </span>
                    <span className={cn(MONTO, b.tono)}>{pesos(b.valor)}</span>
                  </div>
                ))}
              </div>
              {comparacion && (
                <span className={cn('self-start rounded-full px-2.5 py-1 text-[13px] font-bold', comparacion.sube ? 'bg-estado-bien-suave text-estado-bien-texto' : 'bg-estado-problema-suave text-estado-problema-texto')}>
                  {comparacion.sube ? '▲' : '▼'} {comparacion.texto.replace(', en dólares', '')} {CONTRA[clave]}
                </span>
              )}
            </div>
          )}
          {/* Anotar: el teclado del celular, o con la foto del comprobante. */}
          {carga && (
            <div className="flex gap-2 border-t border-borde pt-4">
              <button type="button" onClick={() => onAnotar('teclado')} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-principal text-[15px] font-bold text-principal-texto">
                <Icono nombre="Agregar" tamano={16} />
                Anotar un gasto
              </button>
              <button type="button" onClick={() => onAnotar('foto')} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border-[1.5px] border-borde bg-superficie text-[15px] font-bold text-texto">
                <Icono nombre="Foto" tamano={16} />
                Con la foto
              </button>
            </div>
          )}
        </div>
      </motion.section>

      {!cargando && !vacio && (
        <>
          {/* 3. Para mejorar: un renglón por aviso; tocándolo se ve por qué. */}
          {avisos.length > 0 && (
            <motion.section {...entra(2)} aria-labelledby="plata-mejorar" className={cn(TARJETA, 'p-4')}>
              <Encabezado id="plata-mejorar" titulo="Para mejorar" bajada="Lo que conviene mirar" />
              <ul className="mt-3 divide-y divide-borde">
                {avisos.map((a) => (
                  <FilaAviso key={a.id} aviso={a} abierto={abierto === a.id} onTocar={() => setAbierto((x) => (x === a.id ? null : a.id))} />
                ))}
              </ul>
            </motion.section>
          )}

          {/* 4. Lo que viene. */}
          <motion.section {...entra(3)} aria-labelledby="plata-viene" className={cn(TARJETA, 'p-4')}>
            <Encabezado id="plata-viene" titulo="Lo que viene" bajada="Los próximos pagos y cobros anotados" />
            {viene.length === 0 ? (
              <p className={cn(BAJADA, 'mt-3')}>No hay cobros ni pagos con fecha. Cuando anotes uno que vence, aparece acá.</p>
            ) : (
              <ul className="mt-3 divide-y divide-borde">
                {viene.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', p.tipo === 'ingreso' ? 'bg-estado-bien-suave text-estado-bien-texto' : 'bg-superficie-hundida text-texto-suave')}>
                      <Icono nombre="Plata" tamano={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-texto">{(p.descripcion ?? '').replace(/^./, (x) => x.toLocaleUpperCase('es-AR'))}</span>
                      <span className={BAJADA}>{diaYmes(p.fechaVencimiento!)}</span>
                    </span>
                    <span className={cn(MONTO, p.tipo === 'ingreso' ? 'text-estado-bien-texto' : 'text-texto')}>{conSigno((p.tipo === 'ingreso' ? 1 : -1) * (p.monto ?? 0))}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.section>

          {/* 5. Mes a mes. */}
          <motion.section {...entra(4)} aria-labelledby="plata-meses" className={cn(TARJETA, 'p-4')}>
            <Encabezado id="plata-meses" titulo="Mes a mes" bajada="Lo que quedó cada mes y lo anotado para los que vienen" />
            <MesesChico meses={meses} />
            <Hechos meses={meses} />
          </motion.section>

          {/* 6. En qué se va. */}
          <motion.section {...entra(5)} aria-labelledby="plata-gastos" className={cn(TARJETA, 'p-4')}>
            <Encabezado id="plata-gastos" titulo="En qué se va" bajada={`Los gastos de ${clave === 'doce' ? 'los últimos 12 meses' : `la ${periodo.nombre.toLowerCase()}`}`} />
            {gastos.length === 0 ? (
              <p className={cn(BAJADA, 'mt-3')}>Cuando anotes gastos, acá ves en qué se va la plata.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {gastos.map((g) => (
                  <li key={g.nombre}>
                    <p className="flex items-baseline justify-between gap-3 text-[15px] font-semibold text-texto">
                      <span className="min-w-0">{g.nombre}</span>
                      <span className={MONTO}>
                        {pesos(g.monto)} · {Math.round((g.monto / totalGastos) * 100)} %
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

          {/* 7. Qué rinde. */}
          <motion.section {...entra(6)} aria-labelledby="plata-rinde" className={cn(TARJETA, 'p-4')}>
            <Encabezado id="plata-rinde" titulo="Qué rinde" bajada={vista === 'campo' ? 'Lo que dejó cada campo' : 'Lo que dejó cada actividad'} />
            <div role="tablist" aria-label="Qué rinde" className="mt-3 flex gap-1 rounded-full bg-superficie-hundida p-1">
              {(['campo', 'actividad'] as const).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={vista === v} onClick={() => setVista(v)} className={cn('h-9 flex-1 rounded-full text-[13.5px] font-bold transition-colors', vista === v ? 'bg-superficie text-texto shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-texto-suave')}>
                  {v === 'campo' ? 'Por campo' : 'Por actividad'}
                </button>
              ))}
            </div>
            {rinde.length === 0 ? (
              <p className={cn(BAJADA, 'mt-3')}>Con lo que entra y sale de cada {vista === 'campo' ? 'campo' : 'actividad'}, acá ves cuál deja plata.</p>
            ) : (
              <ul className="mt-3 divide-y divide-borde">
                {rinde.map((r) => (
                  <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-texto">{r.nombre}</span>
                      <span className={BAJADA}>
                        Entró {pesos(r.ingresos)} · salió {pesos(r.gastos)}
                      </span>
                    </span>
                    <span className={cn(MONTO, r.resultado >= 0 ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>{conSigno(r.resultado)}</span>
                    <span className="relative col-span-2 h-2.5">
                      <span aria-hidden className="absolute inset-y-[-4px] left-1/2 w-px bg-texto/30" />
                      <span aria-hidden className={cn('absolute inset-y-0 rounded-[4px]', r.resultado >= 0 ? 'left-1/2 bg-plata-entra' : 'right-1/2 bg-plata-sale')} style={{ width: `${Math.max(1, (Math.abs(r.resultado) / maxRinde) * 50)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </motion.section>

          {/* 8. Campaña por campaña: una fila por campaña (cinco columnas no entran). */}
          {filasCampana.length > 0 && (
            <motion.section {...entra(7)} aria-labelledby="plata-campanas" className={cn(TARJETA, 'p-4')}>
              <Encabezado id="plata-campanas" titulo="Campaña por campaña" bajada="Julio a junio, en pesos y en dólares" />
              <ul className="mt-3 divide-y divide-borde">
                {filasCampana.map((c, i) => {
                  const antes = filasCampana[i + 1]
                  const cambio = c.usd != null && antes?.usd != null && !c.enCurso && antes.usd !== 0 ? (c.usd - antes.usd) / Math.abs(antes.usd) : null
                  return (
                    <li key={c.nombre} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-3 first:pt-0 last:pb-0">
                      <span className="text-[15px] font-semibold text-texto">
                        {c.nombre}
                        {c.enCurso && <span className={cn(BAJADA, 'ml-1.5 font-semibold')}>hasta hoy</span>}
                      </span>
                      <span className={cn(MONTO, c.resultado >= 0 ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>{conSigno(c.resultado)}</span>
                      <span className={cn(BAJADA, 'col-span-2')}>
                        Entró {pesos(c.entro)} · salió {pesos(c.salio)}
                        {c.usd != null && ` · ${c.usd >= 0 ? '+' : '−'}US$ ${Math.round(Math.abs(c.usd) / 1000).toLocaleString('es-AR')} mil`}
                        {cambio != null && (
                          <b className={cn('ml-1.5 whitespace-nowrap', cambio >= 0 ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>
                            {cambio >= 0 ? '▲' : '▼'} {Math.round(Math.abs(cambio) * 100)} %
                          </b>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </motion.section>
          )}
        </>
      )}

      {/* Lugar para que el asistente no tape lo último. */}
    </div>
  )
}

/** Un aviso en un renglón (qué y el número); tocándolo, las dos cifras y el porqué. */
function FilaAviso({ aviso, abierto, onTocar }: { aviso: Aviso; abierto: boolean; onTocar: () => void }) {
  const max = Math.max(aviso.barras[0].valor, aviso.barras[1].valor, 1)
  const mal = aviso.tono === 'mal'
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <button type="button" onClick={onTocar} aria-expanded={abierto} className="flex w-full items-center gap-3 text-left">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', mal ? 'bg-estado-problema-suave text-estado-problema-texto' : 'bg-estado-atencion-suave text-estado-atencion-texto')}>
          <Icono nombre={ICONO_AVISO[aviso.id] ?? 'Plata'} tamano={16} />
        </span>
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-texto ">{aviso.tema}</span>
        <span className={cn(MONTO, mal ? 'text-estado-problema-texto' : 'text-texto')}>{aviso.titulo}</span>
        <Icono nombre="Desplegar" tamano={16} className={cn('shrink-0 text-texto-suave transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <div className="mt-3 flex flex-col gap-2.5 pl-12">
          {aviso.barras.map((b) => (
            <div key={b.texto}>
              <p className="flex items-baseline justify-between text-[13.5px]">
                <span className="font-semibold text-texto-suave">{b.texto}</span>
                <b className={cn(MONTO, b.tono === 'entra' ? 'text-estado-bien-texto' : b.tono === 'sale' ? 'text-estado-problema-texto' : 'text-texto')}>{b.muestra}</b>
              </p>
              <span className="mt-1 block h-2 rounded-full bg-superficie-hundida">
                <span className={cn('block h-full rounded-full', b.tono === 'entra' ? 'bg-plata-entra' : b.tono === 'sale' ? 'bg-plata-sale' : 'bg-neutro-300')} style={{ width: `${Math.max(2, (b.valor / max) * 100)}%` }} />
              </span>
            </div>
          ))}
          <p className={BAJADA}>{aviso.detalle}</p>
        </div>
      )}
    </li>
  )
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** El mes a mes de la compu, entero en el ancho del celular: barras a favor arriba, en contra abajo; lo anotado, rayado. */
function MesesChico({ meses }: { meses: Mes[] }) {
  const W = 311
  const H = 150
  const cero = 78
  const res = meses.map((m) => m.entro - m.salio)
  const max = Math.max(1, ...res.map(Math.abs))
  const paso = W / meses.length
  const ancho = paso - 4
  const primeroFuturo = meses.findIndex((m) => m.futuro)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Lo que quedó cada mes, y lo anotado para los que vienen" className="mt-3">
      <defs>
        <pattern id="raya-bien" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2" height="4" fill="var(--plata-entra)" opacity="0.55" />
        </pattern>
        <pattern id="raya-mal" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2" height="4" fill="var(--plata-sale)" opacity="0.55" />
        </pattern>
      </defs>
      <line x1="0" y1={cero} x2={W} y2={cero} stroke="var(--borde)" />
      {meses.map((m, i) => {
        const v = res[i]!
        const h = v === 0 ? 0 : Math.max(1.5, (Math.abs(v) / max) * 62)
        const x = i * paso + 2
        const color = v >= 0 ? 'var(--plata-entra)' : 'var(--plata-sale)'
        const nm = MES_CORTO[Number(m.mes.slice(5, 7)) - 1]
        return (
          <g key={m.mes}>
            <title>{`${nm} ${m.mes.slice(0, 4)}: ${m.futuro ? 'queda' : 'quedó'} ${conSigno(v)}`}</title>
            {h > 0 && <rect x={x} y={v >= 0 ? cero - h : cero} width={ancho} height={h} rx="3" fill={m.futuro ? `url(#raya-${v >= 0 ? 'bien' : 'mal'})` : color} stroke={m.futuro ? color : 'none'} />}
            {(i % 2 === 0 || i === primeroFuturo) && (
              <text x={x + ancho / 2} y={H - 2} fontSize="10" textAnchor="middle" fill="var(--texto-suave)" fontWeight={i === primeroFuturo ? 700 : 400}>
                {nm}
              </text>
            )}
          </g>
        )
      })}
      {primeroFuturo > 0 && (
        <>
          <line x1={primeroFuturo * paso} y1="6" x2={primeroFuturo * paso} y2={H - 14} stroke="var(--texto)" strokeDasharray="3 3" />
          <text x={primeroFuturo * paso + 4} y="14" fontSize="11" fill="var(--texto-suave)">
            lo que viene
          </text>
        </>
      )}
    </svg>
  )
}

/** Meses a favor, el mejor y el peor de los que ya pasaron. */
function Hechos({ meses }: { meses: Mes[] }) {
  const pasados = meses.filter((m) => !m.futuro).map((m) => ({ m, r: m.entro - m.salio }))
  if (!pasados.length) return null
  const favor = pasados.filter((x) => x.r > 0).length
  const mejor = pasados.reduce((a, b) => (b.r > a.r ? b : a))
  const peor = pasados.reduce((a, b) => (b.r < a.r ? b : a))
  const nombre = (m: Mes) => new Date(`${m.mes}-15T12:00:00`).toLocaleDateString('es-AR', { month: 'long' }).replace(/^\w/, (c) => c.toUpperCase())
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-borde pt-3">
      <span>
        <span className={cn(BAJADA, 'block')}>Meses a favor</span>
        <b className="text-[15px]">
          {favor} de {pasados.length}
        </b>
      </span>
      <span>
        <span className={cn(BAJADA, 'block')}>El mejor</span>
        <b className="block text-[15px] text-estado-bien-texto">{nombre(mejor.m)}</b>
        <b className={cn(MONTO, 'text-estado-bien-texto')}>{conSigno(mejor.r)}</b>
      </span>
      <span>
        <span className={cn(BAJADA, 'block')}>El peor</span>
        <b className="block text-[15px] text-estado-problema-texto">{nombre(peor.m)}</b>
        <b className={cn(MONTO, 'text-estado-problema-texto')}>{conSigno(peor.r)}</b>
      </span>
    </div>
  )
}
