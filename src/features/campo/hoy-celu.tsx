import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import tranquera from '@/assets/tropero/tranquera.webp'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { Logo } from '@/components/tropero/logo'
import { WHATSAPP_TROPERO } from '@/features/acceso/reglas'
import { useLiquidar, useRevertirLiquidacion } from '@/features/agenda/hooks'
import { useMarcarRevisados } from '@/features/analitica/hooks'
import { useAuth } from '@/features/auth/auth-context'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useCampoClima } from '@/features/cotizaciones/campo-clima'
import { useDolarBlue, useGordoActual, useNovilloCanuelas, useTiempo } from '@/features/cotizaciones/hooks'
import type { DiaPronostico } from '@/features/cotizaciones/api'
import { esDueno, puedeCargar, puedeVer, veePlata } from '@/features/empresa/secciones'
import { useNombres } from '@/features/empresa/use-nombres'
import { useCuentas, useEmpresa } from '@/features/empresa/use-empresa'
import { categoriaNombre } from '@/features/hacienda/labels'
import type { CategoriaConteo, Vencimiento } from '@/features/inicio/api'
import { usePanoramaInicio } from '@/features/inicio/hooks'
import { useParaAtender } from '@/features/inicio/para-atender-api'
import { cosasParaHoy, delCampo, plataCorta, proximos30, saludo, type Cosa } from '@/features/inicio/tropero/dia'
import { IconoDia, SeSoluciono } from '@/features/inicio/tropero/el-dia'
import { useLoUltimoMio } from '@/features/inicio/tropero/lo-ultimo-mio'
import { cn } from '@/lib/utils'
import { useGenteParaRevisar, useLluviasRegistradas, type CargaDeOtro } from './hoy-datos'

/**
 * Hoy en el celular (Lau, 16/11; maqueta elegida tras cuatro vueltas). Qué ve
 * y en qué orden:
 *   1. La portada: la tranquera, con la fecha y el saludo en el cielo y el
 *      clima de ahora encima. Lo primero que se mira a la mañana.
 *   2. La frase del día: lo que tiene que saber, con lo urgente subrayado.
 *   3. Tres números con su gráfico chico: rodeo, plata y lluvia.
 *   4. Para hacer hoy: lo vencido, los potreros que piden ir y lo que cargó su
 *      gente, cada uno con el botón que lo resuelve acá mismo.
 *   5. El contexto: la lluvia (30 días y 7 adelante), el gordo y el dólar, y
 *      el rodeo por categoría.
 * Todo con datos reales; lo que no se sabe no se muestra (sin supuestos).
 */

const CURVA = [0.22, 1, 0.36, 1] as const
/** El cielo de la ilustración de la tranquera: arriba de la imagen sigue el mismo color. */
const CIELO = '#de8c61'
const ICONO_TONO: Record<Cosa['tono'], string> = {
  problema: 'bg-estado-problema-suave text-estado-problema-texto',
  atencion: 'bg-estado-atencion-suave text-estado-atencion-texto',
  aviso: 'bg-superficie-hundida text-texto-suave',
}
const RAYA_TONO: Record<Cosa['tono'], string> = { problema: 'bg-estado-problema', atencion: 'bg-acento', aviso: 'bg-borde' }
/** El color de cada categoría del rodeo: hembras en la gama terracota, machos en la verde. */
const COLOR_CATEGORIA: Partial<Record<CategoriaConteo['categoria'], string>> = {
  vaca: '#b85c2e',
  oveja: '#cfc6b6',
  yegua: '#8f877b',
  vaquillona: '#d98a5f',
  ternera: '#ecc46a',
  ternero: '#9aa384',
  novillo: '#6f775c',
  capon: '#5b6250',
  toro: '#3e4434',
}
const OTRO_COLOR = '#c8c1b4'
const PRIMERAS = 4
const DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const ICONO_MIO: Record<'plata' | 'lluvia' | 'recorrida', NombreIcono> = { plata: 'Plata', lluvia: 'Lluvia', recorrida: 'Recorrida' }

const pesos = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('es-AR')}`
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Una fila de «Para hacer hoy»: una cosa del campo o de la plata, o lo que cargó alguien. */
type Fila = { tipo: 'cosa'; cosa: Cosa } | { tipo: 'gente'; quien: string; por: string; cargas: CargaDeOtro[] }

export function HoyCelu({ cuenta, antes }: { cuenta: React.ReactNode; antes?: React.ReactNode }) {
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
  const gente = useGenteParaRevisar(carga.plata)
  const mio = useLoUltimoMio({ plata: !dueno && carga.plata, campos: !dueno && carga.campos, cuantos: 4 })
  const crudo = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const nombre = crudo.charAt(0).toLocaleUpperCase('es-AR') + crudo.slice(1)
  const entra = (i: number) => (reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.05, ease: CURVA } })
  const elegir = (id: string | null) => {
    inicio.elegir(id)
    if (id) clima.elegir(id)
    setEligiendo(false)
  }

  const v = panorama.data ? delCampo(campo?.id ?? null, panorama.data, atender.data) : null
  const vencimientos = v && ve.plata ? v.vencimientos : []
  const cosas = v ? cosasParaHoy(ve.campos ? v.potreros : [], vencimientos, ve.campos ? v.sinRecorrer : [], 12) : []
  // Lo que cargó cada uno, junto: «Revisar lo que cargó Vera» (sus gastos de una).
  const porPersona = new Map<string, CargaDeOtro[]>()
  for (const c of gente.data ?? []) porPersona.set(c.por, [...(porPersona.get(c.por) ?? []), c])
  const deGente: Fila[] = [...porPersona].map(([por, cargas]) => ({ tipo: 'gente', quien: nombreDe(por), por, cargas }))
  // Lo más urgente primero; lo de su gente enseguida, que es lo que no sabe.
  const filas: Fila[] = [...cosas.slice(0, 1).map((c): Fila => ({ tipo: 'cosa', cosa: c })), ...deGente, ...cosas.slice(1).map((c): Fila => ({ tipo: 'cosa', cosa: c }))]
  const visibles = todas ? filas : filas.slice(0, PRIMERAS)

  const vencidos = vencimientos.filter((x) => (x.diasParaVencer ?? 0) < 0 && x.tipo !== 'ingreso')
  const potrerosAtender = ve.campos && v ? v.potreros.filter((p) => p.nivel === 'atender').length : 0
  const cargasGente = gente.data?.length ?? 0
  const t = tiempo.data
  const manana = t?.dias[1]
  const lluviaMes = t ? t.pasado.slice(-30).reduce((s, d) => s + d.mm, 0) : null
  // El gordo: el más reciente entre Cañuelas y el cargado a mano (como la barra de la compu).
  const gordo = canuelas.data && (!manual.data || canuelas.data.fecha > manual.data.fecha) ? { valor: canuelas.data.valor, fecha: canuelas.data.fecha, fuente: 'Cañuelas, novillos' } : manual.data ? { valor: manual.data.valor, fecha: manual.data.fecha, fuente: 'Cargado por vos' } : null
  const fecha = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  // La frase del día: hasta dos cosas, la primera subrayada (es la que pide hacer algo).
  const partes = [
    vencidos.length > 0 ? plural(vencidos.length, 'pago vencido', 'pagos vencidos') : null,
    cargasGente > 0 ? `${plural(cargasGente, 'carga', 'cargas')} de tu gente para revisar` : null,
    potrerosAtender > 0 ? `${plural(potrerosAtender, 'potrero', 'potreros')} para mirar` : null,
  ].filter((x): x is string => !!x)

  return (
    <div className="relative isolate">
      {/* Las luces suaves de fondo, como en la landing. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <span className="absolute top-[300px] -right-20 size-72 rounded-full bg-[radial-gradient(closest-side,rgba(236,196,106,0.32),transparent)]" />
        <span className="absolute top-[760px] -left-24 size-80 rounded-full bg-[radial-gradient(closest-side,rgba(232,150,110,0.22),transparent)]" />
      </div>

      <div className="flex flex-col gap-7 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-6">
        {/* Arriba: la marca, el campo y la cuenta. */}
        <div className="flex items-center gap-2">
          <Logo alto={16} />
          {inicio.campos.length > 0 && (
            <div className="relative ml-auto min-w-0">
              <button
                type="button"
                onClick={() => setEligiendo((x) => !x)}
                aria-expanded={eligiendo}
                aria-label={`Estás viendo ${campo?.nombre ?? 'todos los campos'}. Cambiar`}
                className="flex h-9 max-w-[200px] items-center gap-1 rounded-full border border-borde bg-superficie pr-2 pl-1 text-[13px] font-bold text-texto"
              >
                {campo ? (
                  <span className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-white" style={{ background: campo.color }}>
                    {campo.letra}
                  </span>
                ) : (
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-superficie-hundida text-texto-suave">
                    <Icono nombre="Campos" tamano={16} />
                  </span>
                )}
                <span className="truncate">{campo?.nombre ?? 'Todos los campos'}</span>
                {inicio.campos.length > 1 && <Icono nombre="Desplegar" tamano={16} />}
              </button>
              {eligiendo && inicio.campos.length > 1 && (
                <ul className="absolute top-11 right-0 z-20 min-w-[230px] overflow-hidden rounded-[18px] bg-superficie py-1.5 text-texto shadow-[0_16px_40px_rgba(19,27,22,0.24)]">
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
          <span className={cn(inicio.campos.length === 0 && 'ml-auto')}>{cuenta}</span>
        </div>

        {/* 1. La portada: la tranquera con el saludo en el cielo y el clima encima. */}
        <motion.div {...entra(0)} className="relative h-[272px] overflow-hidden rounded-[26px] shadow-[0_16px_34px_-18px_rgba(90,40,15,0.5)]" style={{ background: CIELO }}>
          <img src={tranquera} alt="" className="absolute bottom-0 left-0 w-full origin-bottom scale-[1.04] [mask-image:linear-gradient(180deg,transparent_0,transparent_6%,#000_14%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_62%,rgba(19,27,22,0.4))]" />
          <div className="absolute inset-x-[18px] top-4 flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold tracking-[0.04em] text-[#5a220c]/85 uppercase">{fecha}</span>
            <h1 className="titulo-display text-[28px] leading-[1.02] text-[#2a1208]">
              {saludo(new Date().getHours(), nombre)}
              {variasCuentas && membresia?.empresa?.nombre ? <span className="mt-1 block text-[14px] font-semibold tracking-normal">{membresia.empresa.nombre}</span> : null}
            </h1>
          </div>
          <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
            {t ? (
              <span className="flex min-w-0 items-center gap-2 rounded-full bg-superficie/92 py-1.5 pr-3 pl-1.5 text-[13.5px] font-semibold text-texto backdrop-blur-md">
                <span className="grid size-8 place-items-center rounded-full bg-superficie-hundida">
                  <IconoDia d={{ ...t.ahora, fecha: '' } as DiaPronostico} />
                </span>
                <b className="cifra text-[20px] font-bold">{t.ahora.temp}°</b>
                <span className="truncate">{t.ahora.descripcion}</span>
              </span>
            ) : (
              <span className="rounded-full bg-superficie/92 px-3 py-2 text-[13.5px] font-semibold text-texto backdrop-blur-md">{lugar ? 'Buscando el clima…' : 'Ubicá tu campo para ver su clima'}</span>
            )}
            {manana && manana.lluviaProb >= 40 && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-sky px-3 py-2 text-[13px] font-bold text-white">
                <Icono nombre="Lluvia" tamano={16} />
                Mañana {manana.lluviaProb} %
              </span>
            )}
          </div>
        </motion.div>

        {antes}

        {/* 2. La frase del día. */}
        {v && (
          <motion.p {...entra(1)} className="-mt-2 text-[18.5px] leading-snug font-medium text-texto">
            {partes.length === 0 ? (
              <>
                Todo en orden{manana && manana.lluviaProb >= 60 ? ', y mañana llueve' : ''}. <span className="text-texto-suave">Nada vencido ni para mirar.</span>
              </>
            ) : (
              <>
                Tenés <Subrayado>{partes[0]}</Subrayado>
                {partes[1] ? ` y ${partes[1]}` : ''}.
              </>
            )}
          </motion.p>
        )}

        {/* 3. Tres números con su gráfico chico. */}
        {v && (
          <motion.div {...entra(2)} className={cn('grid gap-2', [ve.hacienda, ve.plata, !!t].filter(Boolean).length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {ve.hacienda && (
              <Numero icono="Vaca" clase="bg-principal-suave text-principal" titulo="Hacienda" valor={v.totalCabezas.toLocaleString('es-AR')} unidad="cab">
                <Franja cats={v.porCategoria} alto="h-1.5" />
              </Numero>
            )}
            {ve.plata && (
              <Numero icono="Plata" clase="bg-estado-problema-suave text-estado-problema-texto" titulo="30 días" valor={plataCorta(proximos30(v.vencimientos), true)} tono={proximos30(v.vencimientos) < 0 ? 'text-estado-problema-texto' : 'text-estado-bien-texto'}>
                {vencidos.length > 0 && <span className="rounded-full bg-estado-problema-suave px-2 py-0.5 text-[11px] font-bold text-estado-problema-texto">{plural(vencidos.length, 'vencido', 'vencidos')}</span>}
              </Numero>
            )}
            {lluviaMes !== null && t && (
              <Numero icono="Lluvia" clase="bg-sky-soft text-sky" titulo="Lluvia" valor={String(Math.round(lluviaMes))} unidad="mm">
                <BarritasLluvia mm={t.pasado.slice(-30).map((d) => d.mm)} />
              </Numero>
            )}
          </motion.div>
        )}

        {/* 4. Para hacer hoy: lo urgente y lo que cargó su gente, cada uno con su botón. */}
        {v && (ve.campos || ve.plata) && (
          <motion.section {...entra(3)} aria-labelledby="hoy-hacer" className="flex flex-col gap-3">
            <div>
              <h2 id="hoy-hacer" className="titulo-display text-[21px] text-texto">
                Para hacer hoy
              </h2>
              <p className="text-[13.5px] text-texto-suave">De lo más urgente a lo que puede esperar</p>
            </div>
            {filas.length === 0 ? (
              <p className="flex items-center gap-3 rounded-[18px] border border-borde bg-superficie px-4 py-3.5 text-[15px] text-texto">
                <span className="grid size-9 place-items-center rounded-full bg-estado-bien-suave text-estado-bien-texto">
                  <Icono nombre="Guardar" tamano={16} />
                </span>
                Nada pendiente. Lo que cargue tu gente aparece acá.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {visibles.map((f) =>
                  f.tipo === 'cosa' ? (
                    <FilaCosa key={f.cosa.key} c={f.cosa} vencimiento={vencimientos.find((x) => `v-${x.id}` === f.cosa.key)} cargaPlata={carga.plata} cargaCampos={carga.campos} empresaId={membresia?.empresa_id ?? ''} />
                  ) : (
                    <FilaGente key={f.por} quien={f.quien} cargas={f.cargas} />
                  ),
                )}
              </ul>
            )}
            {filas.length > PRIMERAS && (
              <button type="button" onClick={() => setTodas((x) => !x)} className="self-start text-[14px] font-bold text-principal">
                {todas ? 'Ver menos' : `Ver las ${filas.length}`}
              </button>
            )}
          </motion.section>
        )}

        {/* 5. El contexto: la lluvia, el mercado y el rodeo. */}
        {t && (
          <motion.section {...entra(4)} aria-labelledby="hoy-lluvia" className="rounded-[22px] border border-borde bg-superficie px-4 py-3.5">
            <div className="flex items-baseline gap-2">
              <h2 id="hoy-lluvia" className="titulo-display text-[20px] text-texto">
                Lluvia
              </h2>
              <span className="text-[13px] text-texto-suave">30 días y los próximos 7</span>
            </div>
            <GraficoLluvia pasado={t.pasado} dias={t.dias} registradas={registradas.data ?? new Map()} />
            <p className="mt-2 text-[14px] text-texto-suave">
              <b className="t-cifra-chica text-texto">{Math.round(lluviaMes ?? 0)} mm</b> en 30 días
              {registradas.data && registradas.data.size > 0 && (
                <>
                  {' · '}
                  <b className="t-cifra-chica text-texto">{Math.round([...registradas.data.values()].reduce((s, x) => s + x, 0))} mm</b> en tu pluviómetro
                </>
              )}
              <ProximaLluvia dias={t.dias} />
            </p>
            <ul className="mt-3 grid grid-cols-5 border-t border-borde pt-3 text-center">
              {t.dias.slice(1, 6).map((d) => (
                <li key={d.fecha} className="flex flex-col items-center gap-0.5">
                  <span className="text-[12px] font-semibold text-texto-suave">{DIA_CORTO[new Date(`${d.fecha}T12:00:00`).getDay()]}</span>
                  <IconoDia d={d} />
                  <span className="t-cifra-chica font-bold text-texto">{d.max}°</span>
                  <span className={cn('text-[11.5px]', d.lluviaProb >= 40 ? 'font-bold text-sky' : 'text-texto-suave')}>{d.lluviaProb} %</span>
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {(gordo || dolar.data) && (
          <motion.section {...entra(5)} aria-label="El gordo y el dólar" className="grid grid-cols-2 gap-2">
            <Mercado icono="Vaca" clase="bg-principal-suave text-principal" titulo="Gordo" valor={gordo ? `$${Math.round(gordo.valor).toLocaleString('es-AR')}` : '—'} unidad="/kg" pie={gordo ? `${gordo.fuente} · ${fechaCorta(gordo.fecha)}` : 'Sin precio'} />
            <Mercado icono="Plata" clase="bg-estado-bien-suave text-estado-bien-texto" titulo="Dólar blue" valor={dolar.data ? `$${Math.round(dolar.data.venta).toLocaleString('es-AR')}` : '—'} pie={dolar.data ? `Venta · ${fechaCorta(dolar.data.actualizado.slice(0, 10))}` : 'Sin dato'} />
          </motion.section>
        )}

        {v && ve.hacienda && v.totalCabezas > 0 && (
          <motion.section {...entra(6)} aria-labelledby="hoy-rodeo" className="rounded-[22px] border border-borde bg-superficie px-4 py-3.5">
            <h2 id="hoy-rodeo" className="titulo-display text-[20px] text-texto">
              Tu rodeo
            </h2>
            <p className="mt-1 flex items-baseline gap-1.5">
              <b className="titulo-display text-[30px] font-normal text-texto">{v.totalCabezas.toLocaleString('es-AR')}</b>
              <span className="text-[14px] text-texto-suave">{campo ? `cabezas en ${campo.nombre}` : inicio.campos.length > 1 ? `cabezas en tus ${inicio.campos.length} campos` : 'cabezas'}</span>
            </p>
            <Franja cats={v.porCategoria} alto="mt-2.5 h-3" />
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {ordenadas(v.porCategoria).map((c) => (
                <li key={c.categoria} className="inline-flex items-center gap-1.5 rounded-full bg-fondo py-1 pr-2.5 pl-2 text-[13px] text-texto">
                  <span className="size-2.5 rounded-[3px]" style={{ background: COLOR_CATEGORIA[c.categoria] ?? OTRO_COLOR }} />
                  {categoriaNombre(c.categoria, c.cabezas)} <b className="t-cifra-chica">{c.cabezas.toLocaleString('es-AR')}</b>
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {/* Al invitado, lo que cargó él (al dueño, lo de su gente ya está en «Para hacer hoy»). */}
        {!dueno && (mio.data?.length ?? 0) > 0 && (
          <motion.section {...entra(7)} aria-labelledby="hoy-mio" className="flex flex-col gap-1">
            <h2 id="hoy-mio" className="titulo-display text-[20px] text-texto">
              Lo que cargaste
            </h2>
            <ul className="divide-y divide-borde">
              {mio.data!.map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-superficie text-principal">
                    <Icono nombre={ICONO_MIO[x.tipo]} tamano={16} />
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

        {/* Lugar para que el asistente no tape lo último. */}
        <div aria-hidden className="h-10" />
      </div>
    </div>
  )
}

/** El subrayado a mano de la landing, sobre lo que pide hacer algo. */
function Subrayado({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative font-bold whitespace-nowrap">
      {children}
      <svg aria-hidden viewBox="0 0 100 9" preserveAspectRatio="none" className="absolute -bottom-[7px] -left-0.5 h-[9px] w-[calc(100%+4px)]">
        <path d="M2 6 C 25 2, 55 2, 98 5" fill="none" stroke="var(--principal)" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  )
}

function Numero({ icono, clase, titulo, valor, unidad, tono, children }: { icono: NombreIcono; clase: string; titulo: string; valor: string; unidad?: string; tono?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[18px] border border-borde bg-superficie px-2.5 py-2.5">
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-texto-suave">
        <span className={cn('grid size-[22px] shrink-0 place-items-center rounded-full', clase)}>
          <Icono nombre={icono} tamano={16} className="size-[13px]" />
        </span>
        <span className="truncate">{titulo}</span>
      </span>
      <span className={cn('titulo-display text-[19px] leading-tight tracking-[-0.01em] whitespace-nowrap', tono ?? 'text-texto')}>
        {valor}
        {unidad && <span className="ml-1 font-sans text-[11.5px] font-semibold text-texto-suave">{unidad}</span>}
      </span>
      <span className="flex min-h-[18px] items-end">{children}</span>
    </div>
  )
}

function Mercado({ icono, clase, titulo, valor, unidad, pie }: { icono: NombreIcono; clase: string; titulo: string; valor: string; unidad?: string; pie: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[20px] border border-borde bg-superficie px-3.5 py-3">
      <span className="flex items-center gap-2 text-[12.5px] font-semibold text-texto-suave">
        <span className={cn('grid size-6 place-items-center rounded-full', clase)}>
          <Icono nombre={icono} tamano={16} className="size-[14px]" />
        </span>
        {titulo}
      </span>
      <span className="titulo-display text-[22px] text-texto">
        {valor}
        {unidad && <span className="ml-1 font-sans text-[12px] text-texto-suave">{unidad}</span>}
      </span>
      <span className="truncate text-[11.5px] text-texto-suave">{pie}</span>
    </div>
  )
}

/** Una cosa para hacer: lo vencido (se paga acá), el potrero que pide ir o el campo sin recorrer. */
function FilaCosa({ c, vencimiento, cargaPlata, cargaCampos, empresaId }: { c: Cosa; vencimiento?: Vencimiento; cargaPlata: boolean; cargaCampos: boolean; empresaId: string }) {
  const navigate = useNavigate()
  const liquidar = useLiquidar()
  const revertir = useRevertirLiquidacion()
  const [confirmar, setConfirmar] = useState(false)
  const cobro = vencimiento?.tipo === 'ingreso'
  const pagar = (fecha: string) => {
    if (!vencimiento) return
    liquidar.mutate(
      { id: vencimiento.id, fecha },
      {
        onSuccess: () =>
          toast.success(cobro ? 'Listo: quedó cobrado' : 'Listo: quedó pagado', {
            description: `${vencimiento.descripcion} · ${pesos(vencimiento.monto ?? 0)}. Ya no está en lo vencido.`,
            action: { label: 'Deshacer', onClick: () => revertir.mutate({ id: vencimiento.id, fechaVencimiento: vencimiento.fechaVencimiento, fechaCobroPago: fecha }) },
          }),
        onError: () => toast.error('No se pudo guardar. Probá de nuevo.'),
      },
    )
  }
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const esWhatsapp = c.accion.to.startsWith('whatsapp:')
  const accion =
    vencimiento && cargaPlata
      ? { texto: c.accion.texto, hacer: () => setConfirmar((x) => !x) }
      : esWhatsapp && cargaCampos
        ? { texto: c.accion.texto, hacer: () => window.open(`https://wa.me/${WHATSAPP_TROPERO}?text=${encodeURIComponent(c.accion.to.slice(9))}`, '_blank', 'noopener') }
        : c.senal
          ? { texto: 'Recorrerlo', hacer: () => navigate('/campo/recorrida') }
          : null
  const titulo = vencimiento ? `${cobro ? 'Cobrar' : 'Pagar'}: ${vencimiento.descripcion}` : `${c.lugar} · ${c.que}`
  return (
    <li className="relative overflow-hidden rounded-[18px] border border-borde bg-superficie py-3 pr-3 pl-3.5">
      <span aria-hidden className={cn('absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r-full', RAYA_TONO[c.tono])} />
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 grid size-10 shrink-0 place-items-center rounded-full', ICONO_TONO[c.tono])}>
          <Icono nombre={c.icono} tamano={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug font-semibold text-texto">{titulo}</p>
          <p className={cn('text-[12.5px]', c.tono === 'problema' ? 'font-semibold text-estado-problema-texto' : 'text-texto-suave')}>{vencimiento ? c.datos.join(' · ').replace(/^./, (x) => x.toUpperCase()) : c.datos.join(' · ')}</p>
          {(accion || (c.senal && empresaId)) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {accion && (
                <button type="button" onClick={accion.hacer} aria-expanded={vencimiento ? confirmar : undefined} className={cn('h-9 rounded-full px-4 text-[13.5px] font-bold', c.tono === 'problema' ? 'bg-principal text-principal-texto' : 'border-[1.5px] border-principal/55 text-principal')}>
                  {accion.texto}
                </button>
              )}
              {c.senal && empresaId && <SeSoluciono senal={c.senal} empresaId={empresaId} compacto />}
            </div>
          )}
          {confirmar && vencimiento && (
            <div className="mt-3 rounded-[14px] bg-fondo p-3">
              <p className="text-[13.5px] text-texto">{cobro ? '¿Cuándo lo cobraste?' : '¿Cuándo lo pagaste?'} Sale de lo vencido y queda en la plata.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={liquidar.isPending} onClick={() => pagar(hoy)} className="h-9 rounded-full bg-principal px-4 text-[13.5px] font-bold text-principal-texto">
                  Hoy
                </button>
                {vencimiento.fechaVencimiento && (
                  <button type="button" disabled={liquidar.isPending} onClick={() => pagar(vencimiento.fechaVencimiento!)} className="h-9 rounded-full border-[1.5px] border-principal/55 px-4 text-[13.5px] font-bold text-principal">
                    El día que vencía, {fechaCorta(vencimiento.fechaVencimiento)}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        {vencimiento?.monto ? <span className="t-cifra-chica mt-0.5 shrink-0 font-bold text-texto">{plataCorta(vencimiento.monto)}</span> : null}
      </div>
    </li>
  )
}

/** Lo que cargó alguien de su gente y no se miró: se abre, se ve cada cosa y se da por buena. */
function FilaGente({ quien, cargas }: { quien: string; cargas: CargaDeOtro[] }) {
  const [abierto, setAbierto] = useState(false)
  const revisar = useMarcarRevisados()
  const total = cargas.reduce((s, c) => s + (c.tipo === 'ingreso' ? c.monto : -c.monto), 0)
  const porWhatsapp = cargas.some((c) => c.canal === 'whatsapp')
  const que = cargas.length === 1 ? cargas[0]!.descripcion || 'Un gasto' : `${plural(cargas.length, 'carga', 'cargas')}: ${[...new Set(cargas.map((c) => c.descripcion.split(/[:·]/)[0]!.trim()).filter(Boolean))].slice(0, 2).join(', ')}`
  return (
    <li className="relative overflow-hidden rounded-[18px] border border-borde bg-superficie py-3 pr-3 pl-3.5">
      <span aria-hidden className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r-full bg-acento" />
      <div className="flex items-start gap-3">
        <span className="relative mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-[#f7e7bd] text-[15px] font-extrabold text-acento-texto">
          {quien.charAt(0).toLocaleUpperCase('es-AR')}
          {porWhatsapp && (
            <span title="Por WhatsApp" className="absolute -right-1 -bottom-1 grid size-[18px] place-items-center rounded-full border-2 border-superficie bg-[#25a366] text-white">
              <svg viewBox="0 0 24 24" className="size-[9px]" aria-hidden>
                <path d="M5 19l1.2-3.6A7.5 7.5 0 1 1 9 18.3z" fill="currentColor" />
              </svg>
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug font-semibold text-texto">Revisar lo que cargó {quien}</p>
          <p className="truncate text-[12.5px] text-texto-suave">
            {que} · {cuando(cargas[0]!.cuando)}
          </p>
          <button type="button" onClick={() => setAbierto((x) => !x)} aria-expanded={abierto} className="mt-2.5 h-9 rounded-full border-[1.5px] border-principal/55 px-4 text-[13.5px] font-bold text-principal">
            {abierto ? 'Cerrar' : 'Revisar'}
          </button>
          {abierto && (
            <div className="mt-3 rounded-[14px] bg-fondo p-3">
              <ul className="divide-y divide-borde">
                {cargas.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-texto">{c.descripcion || (c.tipo === 'ingreso' ? 'Cobro' : 'Gasto')}</span>
                      <span className="text-[12px] text-texto-suave">{cuando(c.cuando)}</span>
                    </span>
                    <span className="t-cifra-chica shrink-0 font-bold">{c.tipo === 'ingreso' ? '+' : '−'}{pesos(c.monto)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[13px] text-texto-suave">Si está bien, deja de figurar como nuevo. Si algo no cierra, corregilo en Plata desde la compu.</p>
              <button
                type="button"
                disabled={revisar.isPending}
                onClick={() =>
                  revisar.mutate(
                    cargas.map((c) => c.id),
                    { onSuccess: () => toast.success(`Listo: revisaste lo de ${quien}`, { description: 'Ya está en tu plata, sin la marca de nuevo.' }), onError: () => toast.error('No se pudo guardar. Probá de nuevo.') },
                  )
                }
                className="mt-2 h-9 rounded-full bg-principal px-4 text-[13.5px] font-bold text-principal-texto"
              >
                Está bien
              </button>
            </div>
          )}
        </div>
        <span className={cn('t-cifra-chica mt-0.5 shrink-0 font-bold', total < 0 ? 'text-texto' : 'text-estado-bien-texto')}>{plataCorta(total)}</span>
      </div>
    </li>
  )
}

/** Las categorías con cabezas, de la que más a la que menos. */
const ordenadas = (cats: CategoriaConteo[]) => cats.filter((c) => c.cabezas > 0).sort((a, b) => b.cabezas - a.cabezas)

/** La barra del rodeo: el ancho de cada categoría es su cantidad. */
function Franja({ cats, alto }: { cats: CategoriaConteo[]; alto: string }) {
  const con = ordenadas(cats)
  if (!con.length) return null
  return (
    <span className={cn('flex w-full gap-[2px] overflow-hidden rounded-full', alto)}>
      {con.map((c) => (
        <span key={c.categoria} style={{ flexGrow: c.cabezas, background: COLOR_CATEGORIA[c.categoria] ?? OTRO_COLOR }} />
      ))}
    </span>
  )
}

/** Las barritas de la lluvia del mes, en chico. */
function BarritasLluvia({ mm }: { mm: number[] }) {
  const max = Math.max(1, ...mm)
  return (
    <svg viewBox={`0 0 ${mm.length * 2} 18`} preserveAspectRatio="none" className="h-[18px] w-full" aria-hidden>
      {mm.map((x, i) => (x > 0.2 ? <rect key={i} x={i * 2} y={18 - Math.max(2, (x / max) * 18)} width="1.4" height={Math.max(2, (x / max) * 18)} fill="var(--sky)" /> : null))}
    </svg>
  )
}

/** «· el martes vienen 13,6 mm», si en la semana viene algo que valga decir. */
function ProximaLluvia({ dias }: { dias: DiaPronostico[] }) {
  const d = dias.slice(1, 7).find((x) => x.lluviaMm >= 5)
  if (!d) return null
  const dia = d === dias[1] ? 'mañana' : `el ${new Date(`${d.fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long' })}`
  return (
    <>
      {' · '}
      {dia} vienen <b className="t-cifra-chica text-sky">{d.lluviaMm.toLocaleString('es-AR', { maximumFractionDigits: 1 })} mm</b>
    </>
  )
}

/**
 * Barras de lluvia: los últimos 30 días (lo que llovió, según el modelo) y
 * los próximos 7 (lo que viene, más claro), con la línea de hoy. Los días que
 * se anotó el pluviómetro, un punto terracota encima.
 */
function GraficoLluvia({ pasado, dias, registradas }: { pasado: { fecha: string; mm: number }[]; dias: { fecha: string; lluviaMm: number }[]; registradas: Map<string, number> }) {
  const atras = pasado.slice(-30)
  const adelante = dias.slice(0, 7)
  const todos = [...atras.map((d) => ({ ...d, futuro: false })), ...adelante.map((d) => ({ fecha: d.fecha, mm: d.lluviaMm, futuro: true }))]
  const max = Math.max(5, ...todos.map((d) => d.mm), ...registradas.values())
  const W = 330
  const H = 84
  const base = 62
  const paso = W / Math.max(1, todos.length)
  const ancho = Math.max(2.5, paso - 2)
  const alto = (mm: number) => (mm <= 0.1 ? 0 : Math.max(2.5, (mm / max) * 52))
  const hoyX = atras.length * paso - 1
  const corta = (f?: string) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Lluvia de los últimos 30 días y los próximos 7" className="mt-2">
      <line x1="0" y1={base} x2={W} y2={base} stroke="var(--borde)" />
      {todos.map((d, i) => {
        const h = alto(d.mm)
        if (!h) return null
        return <rect key={d.fecha} x={i * paso + 1} y={base - h} width={ancho} height={h} rx="1.5" fill={d.futuro ? 'var(--sky-soft)' : 'var(--sky)'} stroke={d.futuro ? 'var(--sky)' : 'none'} strokeWidth="0.8" strokeDasharray={d.futuro ? '2 2' : undefined} />
      })}
      {todos.map((d, i) => {
        const r = registradas.get(d.fecha)
        if (r == null || d.futuro) return null
        return <circle key={`p-${d.fecha}`} cx={i * paso + 1 + ancho / 2} cy={base - alto(r) - 4} r="3.2" fill="var(--principal)" />
      })}
      <line x1={hoyX} y1="4" x2={hoyX} y2={base + 3} stroke="var(--texto)" strokeDasharray="3 3" />
      <text x={hoyX + 4} y="11" fontSize="11" fill="var(--texto-suave)">
        hoy
      </text>
      <text x="0" y={H - 4} fontSize="11" fill="var(--texto-suave)">
        {corta(atras[0]?.fecha)}
      </text>
      <text x={W} y={H - 4} fontSize="11" textAnchor="end" fill="var(--texto-suave)">
        {corta(adelante.at(-1)?.fecha)}
      </text>
    </svg>
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
