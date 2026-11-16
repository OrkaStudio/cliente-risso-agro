import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { WHATSAPP_TROPERO } from '@/features/acceso/reglas'
import { useAuth } from '@/features/auth/auth-context'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useCampoClima } from '@/features/cotizaciones/campo-clima'
import { useDolarBlue, useGordoActual, useNovilloCanuelas, useTiempo } from '@/features/cotizaciones/hooks'
import { hoyEnArgentina } from '@/features/cotizaciones/api'
import { esDueno, puedeCargar, puedeVer, veePlata } from '@/features/empresa/secciones'
import { useNombres } from '@/features/empresa/use-nombres'
import { useCuentas, useEmpresa } from '@/features/empresa/use-empresa'
import { categoriaNombre } from '@/features/hacienda/labels'
import type { CategoriaConteo, Vencimiento } from '@/features/inicio/api'
import { usePanoramaInicio } from '@/features/inicio/hooks'
import { useParaAtender } from '@/features/inicio/para-atender-api'
import { cosasParaHoy, delCampo, escenaDelClima, plataCorta, saludo, type Cosa } from '@/features/inicio/tropero/dia'
import { SeSoluciono } from '@/features/inicio/tropero/el-dia'
import { EscenaClima } from '@/features/inicio/tropero/escena-clima'
import { useLoUltimoMio } from '@/features/inicio/tropero/lo-ultimo-mio'
import { cn } from '@/lib/utils'
import { useLluviasRegistradas, useLoNuevoDeTuGente } from './hoy-datos'

/**
 * Hoy en el celular (Lau, 16/11), pensado desde por qué un productor lo abriría
 * cada mañana: hoy mira el clima en una app, el gordo y el dólar en otra, y le
 * pregunta al encargado qué pasó. Acá, todo junto y sobre su campo:
 *   1. El día: la escena del clima, que cambia con el tiempo.
 *   2. Lluvia: lo que llovió (30 días) y lo que viene (7), con su pluviómetro.
 *   3. El gordo y el dólar de hoy.
 *   4. Su rodeo, de un vistazo.
 *   5. Lo que hay para atender, en una lista corta.
 *   6. Lo nuevo de su gente (al invitado, lo que cargó él).
 *   7. La plata de las próximas 4 semanas.
 * Todo con datos reales; lo que no se sabe no se muestra (sin supuestos).
 */

const CURVA = [0.22, 1, 0.36, 1] as const
const TONO: Record<Cosa['tono'], string> = {
  problema: 'bg-estado-problema-suave text-estado-problema-texto',
  atencion: 'bg-estado-atencion-suave text-estado-atencion-texto',
  aviso: 'bg-superficie-hundida text-texto-suave',
}
/** El color de cada categoría en la barra del rodeo: hembras en terracota, machos en verde. */
const COLOR_CATEGORIA: Partial<Record<CategoriaConteo['categoria'], string>> = {
  vaca: '#b85c2e',
  vaquillona: '#d98a5f',
  ternera: '#ecc46a',
  ternero: '#9aa384',
  novillo: '#6f775c',
  toro: '#3e4434',
}
const PRIMERAS = 3
const ICONO_NUEVO: Record<'plata' | 'lluvia' | 'recorrida', NombreIcono> = { plata: 'Plata', lluvia: 'Lluvia', recorrida: 'Recorrida' }

export function HoyCelu({ cuenta, antes }: { cuenta: React.ReactNode; antes?: React.ReactNode }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: membresia } = useEmpresa()
  const variasCuentas = (useCuentas().data?.cuentas.length ?? 0) > 1
  const inicio = useCampoElegido()
  const clima = useCampoClima()
  const panorama = usePanoramaInicio()
  const atender = useParaAtender()
  const campo = inicio.elegido
  const lugar = (campo ? clima.opciones.find((o) => o.id === campo.id) : null) ?? clima.actual
  const tiempo = useTiempo(lugar?.ubicacion ?? null, (t) => t)
  const registradas = useLluviasRegistradas(campo?.id ?? null)
  const dolar = useDolarBlue()
  const canuelas = useNovilloCanuelas()
  const manual = useGordoActual(membresia?.empresa_id ?? '')
  const { nombreDe } = useNombres()
  const reducir = useReducedMotion()
  const [eligiendo, setEligiendo] = useState(false)
  const [todas, setTodas] = useState(false)

  const ve = { campos: puedeVer(membresia, 'campos'), hacienda: puedeVer(membresia, 'hacienda'), plata: veePlata(membresia) }
  const carga = { campos: puedeCargar(membresia, 'campos'), plata: puedeCargar(membresia, 'plata') }
  const dueno = esDueno(membresia)
  const nuevo = useLoNuevoDeTuGente({ enabled: dueno, nombreDe })
  const mio = useLoUltimoMio({ plata: !dueno && carga.plata, campos: !dueno && carga.campos, cuantos: 4 })
  const crudo = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const nombre = crudo.charAt(0).toLocaleUpperCase('es-AR') + crudo.slice(1)
  const entra = (i: number) => (reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.06, ease: CURVA } })
  const elegir = (id: string | null) => {
    inicio.elegir(id)
    if (id) clima.elegir(id)
    setEligiendo(false)
  }
  const ir = (destino: string) => {
    if (destino.startsWith('whatsapp:')) return void window.open(`https://wa.me/${WHATSAPP_TROPERO}?text=${encodeURIComponent(destino.slice(9))}`, '_blank', 'noopener')
    navigate(destino)
  }

  const v = panorama.data ? delCampo(campo?.id ?? null, panorama.data, atender.data) : null
  const cosas = v
    ? cosasParaHoy(ve.campos ? v.potreros : [], ve.plata ? v.vencimientos : [], ve.campos ? v.sinRecorrer : []).map((c) =>
        !carga.campos && c.accion.to.startsWith('whatsapp:') ? { ...c, accion: { texto: 'Ver', to: '/campos' } } : !carga.plata && c.accion.to.startsWith('/agenda?mov=') ? { ...c, accion: { ...c.accion, texto: 'Ver' } } : c,
      )
    : []
  const visibles = todas ? cosas : cosas.slice(0, PRIMERAS)
  const t = tiempo.data
  const escena = t ? escenaDelClima(t.ahora.code, t.ahora.viento, t.ahora.dia) : { cielo: 'sol' as const, ventoso: false }
  // El gordo: el más reciente entre Cañuelas y el cargado a mano (como la barra de la compu).
  const gordo = canuelas.data && (!manual.data || canuelas.data.fecha > manual.data.fecha) ? { valor: canuelas.data.valor, fecha: canuelas.data.fecha, fuente: 'Cañuelas, novillos' } : manual.data ? { valor: manual.data.valor, fecha: manual.data.fecha, fuente: 'Cargado por vos' } : null

  return (
    <div>
      {/* 1. El día: la escena del clima, que cambia con el tiempo de cada día. */}
      <EscenaClima cielo={escena.cielo} ventoso={escena.ventoso}>
        <div className="-m-6 flex h-[calc(100%+48px)] flex-col px-[18px] pt-[max(14px,env(safe-area-inset-top))] pb-5">
          <div className="flex items-center gap-2 [text-shadow:none]">
            {inicio.campos.length > 0 && (
              <div className="relative min-w-0">
                <button
                  type="button"
                  onClick={() => setEligiendo((x) => !x)}
                  aria-expanded={eligiendo}
                  aria-label={`Estás viendo ${campo?.nombre ?? 'todos los campos'}. Cambiar`}
                  className="flex h-10 max-w-full items-center gap-2 rounded-full bg-superficie/90 pr-3 pl-1.5 text-[15px] font-bold text-texto backdrop-blur-md"
                >
                  {campo ? (
                    <span className="grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-extrabold text-white" style={{ background: campo.color }}>
                      {campo.letra}
                    </span>
                  ) : (
                    <span className="grid size-7 shrink-0 place-items-center text-texto-suave">
                      <Icono nombre="Campos" tamano={16} />
                    </span>
                  )}
                  <span className="truncate">{campo?.nombre ?? 'Todos los campos'}</span>
                  {inicio.campos.length > 1 && <Icono nombre="Desplegar" tamano={16} />}
                </button>
                {eligiendo && inicio.campos.length > 1 && (
                  <ul className="absolute top-12 left-0 z-20 min-w-[230px] overflow-hidden rounded-[18px] bg-superficie py-1.5 text-texto shadow-[0_16px_40px_rgba(19,27,22,0.24)]">
                    {[null, ...inicio.campos].map((c) => (
                      <li key={c?.id ?? 'todos'}>
                        <button type="button" onClick={() => elegir(c?.id ?? null)} className={cn('flex w-full items-center gap-2.5 px-4 py-3 text-left text-[15px]', (c?.id ?? null) === (campo?.id ?? null) && 'font-bold')}>
                          {c ? (
                            <span className="grid size-6 place-items-center rounded-full text-[11px] font-extrabold text-white" style={{ background: c.color }}>
                              {c.letra}
                            </span>
                          ) : (
                            <span className="grid size-6 place-items-center text-texto-suave">
                              <Icono nombre="Campos" tamano={16} />
                            </span>
                          )}
                          {c?.nombre ?? 'Todos los campos'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {cuenta}
          </div>
          <motion.div {...entra(0)} className="mt-auto">
            <p className="text-[15px] font-semibold opacity-95">
              {saludo(new Date().getHours(), nombre).replace(/\.$/, '')}
              {variasCuentas && membresia?.empresa?.nombre ? ` · ${membresia.empresa.nombre}` : ''}
            </p>
            {t ? (
              <div className="mt-1 flex items-end gap-3">
                <span className="cifra text-[58px] leading-[0.9] font-semibold">{t.ahora.temp}°</span>
                <span className="pb-1 text-[14.5px] leading-snug">
                  <b className="block font-bold">{t.ahora.descripcion}</b>
                  Máx {t.ahora.max}° · mín {t.ahora.min}°
                </span>
              </div>
            ) : (
              <p className="mt-1 text-[16px] font-semibold">{lugar ? 'Buscando el clima…' : 'Ubicá tu campo en el mapa para ver su clima.'}</p>
            )}
          </motion.div>
        </div>
      </EscenaClima>

      <div className="flex flex-col gap-9 px-[18px] pt-6">
        {antes}

        {/* 2. Lluvia: lo que llovió y lo que viene. */}
        {t && (
          <motion.section {...entra(1)} aria-labelledby="hoy-lluvia" className="flex flex-col gap-2.5">
            <Titulo id="hoy-lluvia" texto="Lluvia" />
            <GraficoLluvia pasado={t.pasado} dias={t.dias} registradas={registradas.data ?? new Map()} />
            <p className="text-[14.5px] text-texto-suave">
              <b className="t-cifra-chica text-texto">{Math.round(t.pasado.slice(-30).reduce((s, d) => s + d.mm, 0))} mm</b> en 30 días, según el pronóstico
              {registradas.data && registradas.data.size > 0 && (
                <>
                  {' · '}
                  <b className="t-cifra-chica text-texto">{Math.round([...registradas.data.values()].reduce((s, x) => s + x, 0))} mm</b> en tu pluviómetro
                </>
              )}
              {t.dias[1] && t.dias[1].lluviaProb >= 40 && <b className="whitespace-nowrap text-sky"> · mañana {t.dias[1].lluviaProb} %</b>}
            </p>
          </motion.section>
        )}

        {/* 3. El gordo y el dólar de hoy. */}
        {(gordo || dolar.data) && (
          <motion.section {...entra(2)} aria-label="El gordo y el dólar" className="grid grid-cols-2 border-y border-borde">
            <div className="flex min-w-0 flex-col py-3 pr-3">
              <span className="text-[12.5px] font-semibold text-texto-suave">Gordo</span>
              <span className="t-cifra text-[24px] font-bold text-texto">{gordo ? `$${Math.round(gordo.valor).toLocaleString('es-AR')}` : '—'}<span className="text-[13px] font-semibold text-texto-suave"> /kg</span></span>
              <span className="truncate text-[12px] text-texto-suave">{gordo ? `${gordo.fuente} · ${fechaCorta(gordo.fecha)}` : 'Sin precio'}</span>
            </div>
            <div className="flex min-w-0 flex-col border-l border-borde py-3 pl-4">
              <span className="text-[12.5px] font-semibold text-texto-suave">Dólar blue</span>
              <span className="t-cifra text-[24px] font-bold text-texto">{dolar.data ? `$${Math.round(dolar.data.venta).toLocaleString('es-AR')}` : '—'}</span>
              <span className="truncate text-[12px] text-texto-suave">{dolar.data ? `Venta · ${fechaCorta(dolar.data.actualizado.slice(0, 10))}` : 'Sin dato'}</span>
            </div>
          </motion.section>
        )}

        {/* 4. El rodeo de un vistazo. */}
        {v && ve.hacienda && v.totalCabezas > 0 && (
          <motion.section {...entra(3)} aria-labelledby="hoy-rodeo" className="flex flex-col gap-3">
            <Titulo id="hoy-rodeo" texto="Tu rodeo" derecha={`${v.totalCabezas.toLocaleString('es-AR')} cab`} />
            <Rodeo cats={v.porCategoria} />
          </motion.section>
        )}

        {/* 5. Lo que hay para atender: una lista corta. */}
        {(ve.campos || ve.plata) && v && (
          <motion.section {...entra(4)} aria-labelledby="hoy-atender" className="flex flex-col gap-1">
            <Titulo id="hoy-atender" texto="Para atender" contador={cosas.length} derecha={cosas.length > PRIMERAS ? (todas ? 'Ver menos' : `Ver las ${cosas.length}`) : undefined} onDerecha={() => setTodas((x) => !x)} />
            {cosas.length === 0 ? (
              <p className="flex items-center gap-2.5 py-2 text-[15px] text-texto-suave">
                <span className="grid size-8 place-items-center rounded-full bg-estado-bien-suave text-estado-bien-texto">
                  <Icono nombre="Guardar" tamano={16} />
                </span>
                Todo en orden.
              </p>
            ) : (
              <ul className="divide-y divide-borde">
                {visibles.map((c) => (
                  <li key={c.key} className="flex items-center gap-3 py-2.5">
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-[11px]', TONO[c.tono])}>
                      <Icono nombre={c.icono} tamano={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-texto">
                        {c.lugar} · {c.que}
                      </span>
                      <span className={cn('block truncate text-[13px]', c.tono === 'problema' ? 'font-semibold text-estado-problema-texto' : 'text-texto-suave')}>{c.datos.join(' · ')}</span>
                    </span>
                    {c.senal && membresia && <SeSoluciono senal={c.senal} empresaId={membresia.empresa_id} compacto />}
                    <button type="button" onClick={() => ir(c.accion.to)} className="h-9 shrink-0 rounded-full border-[1.5px] border-principal/60 px-3 text-[13.5px] font-bold text-principal">
                      {c.accion.texto}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.section>
        )}

        {/* 6. Lo nuevo de su gente (al dueño) o lo que cargó (al invitado). */}
        {dueno
          ? (nuevo.data?.length ?? 0) > 0 && (
              <motion.section {...entra(5)} aria-labelledby="hoy-nuevo" className="flex flex-col gap-1">
                <Titulo id="hoy-nuevo" texto="Lo nuevo de tu gente" />
                <ul className="divide-y divide-borde">
                  {nuevo.data!.map((x) => (
                    <li key={x.id} className="flex items-center gap-3 py-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-principal-suave text-[14px] font-extrabold text-principal">{x.quien.charAt(0)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-texto">{x.titulo}</span>
                        <span className="flex items-center gap-1.5 text-[13px] text-texto-suave">
                          <Icono nombre={ICONO_NUEVO[x.tipo]} tamano={16} />
                          {x.quien} · {cuando(x.cuando)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.section>
            )
          : (mio.data?.length ?? 0) > 0 && (
              <motion.section {...entra(5)} aria-labelledby="hoy-mio" className="flex flex-col gap-1">
                <Titulo id="hoy-mio" texto="Lo que cargaste" />
                <ul className="divide-y divide-borde">
                  {mio.data!.map((x) => (
                    <li key={x.id} className="flex items-center gap-3 py-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-superficie text-principal">
                        <Icono nombre={ICONO_NUEVO[x.tipo]} tamano={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-texto">{x.titulo}</span>
                        <span className="block truncate text-[13px] text-texto-suave">{[x.detalle, cuando(x.cuando)].filter(Boolean).join(' · ')}</span>
                      </span>
                      {x.valor && <span className="t-cifra-chica shrink-0 font-bold text-texto">{x.valor}</span>}
                    </li>
                  ))}
                </ul>
              </motion.section>
            )}

        {/* 7. La plata de las próximas 4 semanas. */}
        {v && ve.plata && (
          <motion.section {...entra(6)} aria-labelledby="hoy-plata" className="flex flex-col gap-2.5">
            <Titulo id="hoy-plata" texto="La plata, próximas 4 semanas" />
            <PlataSemanas vencimientos={v.vencimientos} />
          </motion.section>
        )}
      </div>
    </div>
  )
}

function Titulo({ id, texto, contador, derecha, onDerecha }: { id: string; texto: string; contador?: number; derecha?: string; onDerecha?: () => void }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 id={id} className="titulo-display text-[20px] text-texto">
        {texto}
      </h2>
      {!!contador && <span className="grid h-[22px] min-w-[22px] place-items-center self-center rounded-full bg-estado-problema px-1.5 text-[12.5px] font-bold text-white">{contador}</span>}
      {derecha &&
        (onDerecha ? (
          <button type="button" onClick={onDerecha} className="ml-auto text-[14px] font-bold text-principal">
            {derecha}
          </button>
        ) : (
          <span className="t-cifra-chica ml-auto font-bold text-texto-suave">{derecha}</span>
        ))}
    </div>
  )
}

/**
 * Barras de lluvia: los últimos 30 días (lo que llovió, según el pronóstico) y
 * los próximos 7 (lo que viene, más claro), con la línea de hoy. Los días que
 * se anotó el pluviómetro, un punto terracota encima.
 */
function GraficoLluvia({ pasado, dias, registradas }: { pasado: { fecha: string; mm: number }[]; dias: { fecha: string; lluviaMm: number; lluviaProb: number }[]; registradas: Map<string, number> }) {
  const atras = pasado.slice(-30)
  const adelante = dias.slice(0, 7)
  const todos = [...atras.map((d) => ({ ...d, futuro: false })), ...adelante.map((d) => ({ fecha: d.fecha, mm: d.lluviaMm, futuro: true }))]
  const max = Math.max(5, ...todos.map((d) => d.mm), ...[...registradas.values()])
  const W = 354
  const H = 92
  const base = 72
  const paso = W / todos.length
  const ancho = Math.max(3, paso - 3)
  const alto = (mm: number) => (mm <= 0 ? 0 : Math.max(3, (mm / max) * 62))
  const hoyX = atras.length * paso - 1.5
  const hoy = hoyEnArgentina()
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Lluvia de los últimos 30 días y los próximos 7">
      <line x1="0" y1={base} x2={W} y2={base} stroke="var(--borde)" />
      {todos.map((d, i) => {
        const h = alto(d.mm)
        if (!h) return null
        return <rect key={d.fecha} x={i * paso + 1.5} y={base - h} width={ancho} height={h} rx="2" fill={d.futuro ? 'var(--sky-soft)' : 'var(--sky)'} stroke={d.futuro ? 'var(--sky)' : 'none'} strokeDasharray={d.futuro ? '2 2' : undefined} />
      })}
      {todos.map((d, i) => {
        const r = registradas.get(d.fecha)
        if (r == null || d.futuro) return null
        return <circle key={`p-${d.fecha}`} cx={i * paso + 1.5 + ancho / 2} cy={base - alto(r) - 4} r="3.5" fill="var(--principal)" />
      })}
      <line x1={hoyX} y1="4" x2={hoyX} y2={base + 4} stroke="var(--texto)" strokeDasharray="3 3" />
      <text x={hoyX + 4} y="12" fontSize="12" fill="var(--texto-suave)" fontFamily="var(--font-cifra)">
        hoy
      </text>
      <text x="0" y={H - 4} fontSize="12" fill="var(--texto-suave)" fontFamily="var(--font-cifra)">
        hace 30 días
      </text>
      <text x={W} y={H - 4} fontSize="12" textAnchor="end" fill="var(--texto-suave)" fontFamily="var(--font-cifra)">
        {adelante.length ? `hasta el ${Number((adelante.at(-1)?.fecha ?? hoy).slice(8))}` : ''}
      </text>
    </svg>
  )
}

/** Una barra con cada categoría (su ancho, la cantidad) y debajo su nombre y número. */
function Rodeo({ cats }: { cats: CategoriaConteo[] }) {
  const con = [...cats].filter((c) => c.cabezas > 0).sort((a, b) => b.cabezas - a.cabezas)
  return (
    <>
      <div className="flex h-3 gap-[3px] overflow-hidden rounded-full">
        {con.map((c) => (
          <span key={c.categoria} style={{ flexGrow: c.cabezas, background: COLOR_CATEGORIA[c.categoria] ?? 'var(--neutro-400, #a59d91)' }} />
        ))}
      </div>
      <ul className="grid grid-cols-3 gap-x-3 gap-y-1.5">
        {con.map((c) => (
          <li key={c.categoria} className="flex min-w-0 items-center gap-1.5 text-[13px] text-texto-suave">
            <span className="size-2 shrink-0 rounded-[3px]" style={{ background: COLOR_CATEGORIA[c.categoria] ?? '#a59d91' }} />
            <span className="truncate">{categoriaNombre(c.categoria, c.cabezas)}</span>
            <b className="t-cifra-chica text-texto">{c.cabezas.toLocaleString('es-AR')}</b>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Lo que sale (abajo) y lo que entra (arriba) cada semana, las próximas 4. */
function PlataSemanas({ vencimientos }: { vencimientos: Vencimiento[] }) {
  const semanas = [0, 1, 2, 3].map((s) => {
    const de = vencimientos.filter((x) => x.diasParaVencer != null && x.diasParaVencer >= s * 7 && x.diasParaVencer < (s + 1) * 7)
    return {
      sale: de.filter((x) => x.tipo !== 'ingreso').reduce((t, x) => t + (x.monto ?? 0), 0),
      entra: de.filter((x) => x.tipo === 'ingreso').reduce((t, x) => t + (x.monto ?? 0), 0),
    }
  })
  const max = Math.max(1, ...semanas.flatMap((s) => [s.sale, s.entra]))
  const sale = semanas.reduce((t, s) => t + s.sale, 0)
  const entra = semanas.reduce((t, s) => t + s.entra, 0)
  if (!sale && !entra) return <p className="text-[15px] text-texto-suave">No vence nada en las próximas 4 semanas.</p>
  const NOMBRE = ['Esta semana', 'La que viene', 'En 2 semanas', 'En 3 semanas']
  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {semanas.map((s, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            {entra > 0 && <div className="flex h-[44px] w-full items-end justify-center">
              {s.entra > 0 && <span className="w-[60%] rounded-t-[5px] bg-estado-bien" style={{ height: `${Math.max(6, (s.entra / max) * 44)}px` }} />}
            </div>}
            <div className="h-px w-full bg-borde" />
            <div className="flex h-[44px] w-full items-start justify-center">
              {s.sale > 0 && <span className="w-[60%] rounded-b-[5px] bg-estado-problema/85" style={{ height: `${Math.max(6, (s.sale / max) * 44)}px` }} />}
            </div>
            <span className="text-center text-[12px] leading-tight text-texto-suave">{NOMBRE[i]}</span>
            <span className={cn('t-cifra-mini font-bold', s.sale > s.entra ? 'text-estado-problema-texto' : s.entra ? 'text-estado-bien-texto' : 'text-texto-suave')}>{s.sale || s.entra ? plataCorta(s.entra - s.sale, true) : '—'}</span>
          </div>
        ))}
      </div>
      <p className="text-[14.5px] text-texto-suave">
        Salen <b className="t-cifra-chica text-estado-problema-texto">{plataCorta(sale)}</b>
        {entra > 0 && (
          <>
            {' · '}entran <b className="t-cifra-chica text-estado-bien-texto">{plataCorta(entra)}</b>
          </>
        )}
      </p>
    </>
  )
}

/** «12 nov» */
function fechaCorta(ymd: string): string {
  if (!ymd) return ''
  return new Date(`${ymd.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

/** «Hoy 7:40», «Ayer», «12 nov». */
function cuando(iso: string): string {
  const d = new Date(iso)
  const hoy = new Date()
  if (d.toDateString() === hoy.toDateString()) return `Hoy ${d.toLocaleTimeString('es-AR', { hour: 'numeric', minute: '2-digit' })}`
  if (d.toDateString() === new Date(hoy.getTime() - 86_400_000).toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}
