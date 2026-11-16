import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import tranquera from '@/assets/tropero/tranquera.webp'
import { WHATSAPP_TROPERO } from '@/features/acceso/reglas'
import { useAuth } from '@/features/auth/auth-context'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useCampoClima } from '@/features/cotizaciones/campo-clima'
import { useClima, usePronostico } from '@/features/cotizaciones/hooks'
import { puedeCargar, puedeVer, veePlata } from '@/features/empresa/secciones'
import { useCuentas, useEmpresa } from '@/features/empresa/use-empresa'
import { usePanoramaInicio } from '@/features/inicio/hooks'
import { useParaAtender } from '@/features/inicio/para-atender-api'
import { cosasParaHoy, delCampo, plataCorta, proximos30, saludo, type Cosa } from '@/features/inicio/tropero/dia'
import { SeSoluciono } from '@/features/inicio/tropero/el-dia'
import { useLoUltimoMio, type Cargado } from '@/features/inicio/tropero/lo-ultimo-mio'
import { useLluviaDelMes } from '@/features/inicio/tropero/use-dia'
import { cn } from '@/lib/utils'

/**
 * Hoy en el celular, pensado desde el campo (Lau, 16/11: «como si crearas de 0
 * la app de Troppero en el celular», no una compu achicada):
 *   1. El día en tu campo: el tiempo manda afuera (hoy y si llueve mañana).
 *   2. Contarle a Troppero: el audio al bot es la forma de cargar; al lado,
 *      anotar un gasto y recorrer, sólo si la persona puede.
 *   3. Para atender: de a una, deslizando, cada una con su botón.
 *   4. Tu campo en números, en una fila.
 *   5. Lo que cargaste, por día.
 */

const CURVA = [0.22, 1, 0.36, 1] as const
const TONO: Record<Cosa['tono'], { icono: string; dato: string; borde: string }> = {
  problema: { icono: 'bg-estado-problema-suave text-estado-problema-texto', dato: 'text-estado-problema-texto', borde: 'before:bg-estado-problema' },
  atencion: { icono: 'bg-estado-atencion-suave text-estado-atencion-texto', dato: 'text-estado-atencion-texto', borde: 'before:bg-estado-atencion' },
  aviso: { icono: 'bg-superficie-hundida text-texto-suave', dato: 'text-texto-suave', borde: 'before:bg-acento' },
}
const ICONO_CARGADO: Record<Cargado['tipo'], NombreIcono> = { plata: 'Plata', lluvia: 'Lluvia', recorrida: 'Recorrida' }

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
  const tiempo = useClima(lugar?.ubicacion ?? null)
  const pronostico = usePronostico(lugar?.ubicacion ?? null)
  const lluvia = useLluviaDelMes(lugar?.ubicacion ?? null)
  const reducir = useReducedMotion()
  const [eligiendo, setEligiendo] = useState(false)
  const [actual, setActual] = useState(0)

  const ve = { campos: puedeVer(membresia, 'campos'), hacienda: puedeVer(membresia, 'hacienda'), plata: veePlata(membresia) }
  const carga = { campos: puedeCargar(membresia, 'campos'), plata: puedeCargar(membresia, 'plata') }
  const cargados = useLoUltimoMio({ plata: carga.plata, campos: carga.campos, cuantos: 4 })
  const crudo = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const nombre = crudo.charAt(0).toLocaleUpperCase('es-AR') + crudo.slice(1)
  const entra = (i: number) => (reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.07, ease: CURVA } })
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
  const manana = pronostico.data?.[1]
  const t = tiempo.data

  // Tu campo en números (sólo lo que la persona ve).
  const numeros: { titulo: string; valor: string; unidad?: string; tono?: string }[] = []
  if (v && ve.hacienda) numeros.push({ titulo: 'Hacienda', valor: v.totalCabezas.toLocaleString('es-AR'), unidad: 'cab' })
  if (v && ve.plata) {
    const p30 = proximos30(v.vencimientos)
    numeros.push({ titulo: '30 días', valor: p30 === 0 ? '$0' : plataCorta(p30, true), tono: p30 < 0 ? 'text-estado-problema-texto' : p30 > 0 ? 'text-estado-bien-texto' : undefined })
  }
  numeros.push({ titulo: 'Lluvia, mes', valor: lluvia.data == null ? '—' : `${lluvia.data}`, unidad: 'mm' })
  if (v && ve.campos) numeros.push({ titulo: 'Recorrida', valor: v.ultimaRecorridaHace === null ? '—' : v.ultimaRecorridaHace === 0 ? 'Hoy' : `${v.ultimaRecorridaHace} d` })

  // Tres entran cómodos en una fila del celular; la recorrida ya está en «Para atender».
  const fila = numeros.slice(0, 3)

  // Lo que cargaste, por día.
  const porDia = new Map<string, Cargado[]>()
  for (const x of cargados.data ?? []) {
    const d = diaDe(x.cuando)
    porDia.set(d, [...(porDia.get(d) ?? []), x])
  }

  return (
    <div>
      {/* 1. El día en tu campo. La ilustración un poco agrandada: su borde de papel no se ve. */}
      <section className="relative isolate overflow-hidden">
        <img src={tranquera} alt="" className="absolute inset-x-0 top-0 -z-20 h-[300px] w-full scale-[1.08] object-cover object-[50%_40%]" />
        <div className="absolute inset-x-0 top-0 -z-10 h-[301px] bg-[linear-gradient(180deg,transparent_25%,color-mix(in_srgb,var(--fondo)_75%,transparent)_62%,var(--fondo)_92%)]" />
        <div className="flex items-center gap-2 px-[18px] pt-[max(14px,env(safe-area-inset-top))]">
          {inicio.campos.length > 0 && (
            <div className="relative min-w-0">
              <button
                type="button"
                onClick={() => setEligiendo((x) => !x)}
                aria-expanded={eligiendo}
                aria-label={`Estás viendo ${campo?.nombre ?? 'todos los campos'}. Cambiar`}
                className="flex h-10 max-w-full items-center gap-2 rounded-full bg-superficie/85 pr-3 pl-1.5 text-[15px] font-bold text-texto shadow-[0_6px_18px_rgba(19,27,22,0.14)] backdrop-blur-md"
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
        <motion.div {...entra(0)} className="px-[18px] pt-[118px] pb-2">
          <p className="text-[15px] font-semibold text-texto-suave">
            {saludo(new Date().getHours(), nombre).replace(/\.$/, '')}
            {variasCuentas && membresia?.empresa?.nombre ? ` · ${membresia.empresa.nombre}` : ''}
          </p>
          {t ? (
            <div className="mt-0.5 flex items-end gap-3">
              <span className="titulo-display text-[64px] leading-[0.9] text-texto">{t.temp}°</span>
              <span className="pb-1.5 text-[15px] leading-snug text-texto">
                <b className="block font-bold">{t.descripcion}</b>
                <span className="text-texto-suave">
                  Máx {t.max}° · mín {t.min}°
                </span>
              </span>
            </div>
          ) : (
            <p className="titulo-display mt-1 text-[34px] leading-none text-texto">Tu campo, hoy</p>
          )}
          {manana && (
            <p className={cn('mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-bold', manana.lluviaProb >= 40 ? 'bg-sky-soft text-sky' : 'bg-superficie text-texto-suave')}>
              <Icono nombre="Lluvia" tamano={16} />
              {manana.lluviaProb >= 40 ? `Mañana ${manana.lluviaProb} % de lluvia` : `Mañana ${manana.max}°, sin lluvia`}
            </p>
          )}
        </motion.div>
      </section>

      <div className="flex flex-col gap-7 px-[18px] pt-4">
        {antes}

        {/* 2. Contarle a Troppero: lo que se carga en el campo, de un toque. */}
        {(carga.campos || carga.plata) && (
          <motion.div {...entra(1)} className="flex flex-col gap-2.5">
            <button type="button" onClick={() => ir('whatsapp:')} className="flex items-center gap-3.5 rounded-[22px] bg-texto py-3 pr-3 pl-5 text-left text-superficie">
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-bold">Contale a Troppero</span>
                <span className="block text-[13.5px] text-superficie/70">Un audio con lo que viste o la foto de un ticket</span>
              </span>
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-principal text-principal-texto">
                <Icono nombre="Celular" />
              </span>
            </button>
            {carga.plata && carga.campos ? (
              <div className="grid grid-cols-2 gap-2.5">
                <Atajo icono="Plata" texto="Anotar un gasto" onClick={() => navigate('/campo/plata')} />
                <Atajo icono="Recorrida" texto="Recorrer" onClick={() => navigate('/campo/recorrida')} />
              </div>
            ) : carga.plata ? (
              <Atajo icono="Plata" texto="Anotar un gasto" onClick={() => navigate('/campo/plata')} />
            ) : (
              <Atajo icono="Recorrida" texto="Recorrer" onClick={() => navigate('/campo/recorrida')} />
            )}
          </motion.div>
        )}

        {/* 3. Para atender: de a una, deslizando. */}
        {(ve.campos || ve.plata) && v && (
          <motion.section {...entra(2)} aria-labelledby="hoy-atender">
            <div className="flex items-center gap-2.5">
              <h2 id="hoy-atender" className="titulo-display text-[22px] text-texto">
                Para atender
              </h2>
              {cosas.length > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-estado-problema px-1.5 text-[13px] font-bold text-white">{cosas.length}</span>}
              {cosas.length > 1 && (
                <span className="ml-auto text-[13.5px] font-semibold text-texto-suave">
                  {actual + 1} de {cosas.length}
                </span>
              )}
            </div>
            {cosas.length === 0 ? (
              <p className="mt-3 flex items-center gap-3 rounded-[20px] bg-superficie px-4 py-3.5 text-[15px] text-texto">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-estado-bien text-white">
                  <Icono nombre="Guardar" tamano={16} />
                </span>
                Todo en orden. Lo que deje la recorrida o venza, aparece acá.
              </p>
            ) : (
              <div
                className="-mx-[18px] mt-3 flex snap-x snap-mandatory scroll-px-[18px] gap-3 overflow-x-auto px-[18px] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                onScroll={(e) => {
                  const el = e.currentTarget
                  const ancho = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 1
                  setActual(Math.min(cosas.length - 1, Math.round(el.scrollLeft / (ancho + 12))))
                }}
              >
                {cosas.map((c) => {
                  const tono = TONO[c.tono]
                  return (
                    <article key={c.key} className={cn('relative flex w-[84%] shrink-0 snap-start flex-col gap-3 overflow-hidden rounded-[22px] bg-superficie p-4 pl-5 shadow-[0_8px_24px_-12px_rgba(19,27,22,0.25)] before:absolute before:inset-y-0 before:left-0 before:w-1.5', tono.borde)}>
                      <div className="flex items-start gap-3">
                        <span className={cn('grid size-11 shrink-0 place-items-center rounded-[14px]', tono.icono)}>
                          <Icono nombre={c.icono} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="t-tarjeta truncate text-[18px] text-texto">{c.lugar}</p>
                          <p className="truncate text-[14.5px] text-texto">{c.que}</p>
                        </div>
                      </div>
                      <p className={cn('text-[14px] font-semibold', tono.dato)}>{c.datos.join(' · ')}</p>
                      <div className="mt-auto flex items-center gap-2">
                        <button type="button" onClick={() => ir(c.accion.to)} className="h-11 flex-1 rounded-full bg-principal text-[15px] font-bold text-principal-texto">
                          {c.accion.texto}
                        </button>
                        {c.senal && membresia && <SeSoluciono senal={c.senal} empresaId={membresia.empresa_id} compacto />}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </motion.section>
        )}

        {/* 4. Tu campo en una fila. */}
        {v && fila.length > 0 && (
          <motion.section {...entra(3)} aria-label="Tu campo" className="flex rounded-[22px] bg-superficie py-3.5">
            {fila.map((n, i) => (
              <div key={n.titulo} className={cn('flex min-w-0 flex-1 flex-col gap-1 px-3', i > 0 && 'border-l border-borde')}>
                <span className="truncate text-[12px] font-semibold text-texto-suave">{n.titulo}</span>
                <span className="flex items-baseline gap-1">
                  <span className={cn('t-cifra truncate text-[21px] font-bold', n.tono ?? 'text-texto')}>{n.valor}</span>
                  {n.unidad && <span className="text-[12px] font-semibold text-texto-suave">{n.unidad}</span>}
                </span>
              </div>
            ))}
          </motion.section>
        )}

        {/* 5. Lo que cargaste, por día. */}
        {porDia.size > 0 && (
          <motion.section {...entra(4)} aria-labelledby="hoy-cargaste" className="flex flex-col gap-3">
            <h2 id="hoy-cargaste" className="titulo-display text-[22px] text-texto">
              Lo que cargaste
            </h2>
            {[...porDia].map(([dia, xs]) => (
              <div key={dia}>
                <p className="mb-1 text-[12.5px] font-bold tracking-[0.06em] text-texto-suave uppercase">{dia}</p>
                <ul className="flex flex-col">
                  {xs.map((x) => (
                    <li key={x.id} className="flex items-center gap-3 py-2">
                      <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-superficie text-principal">
                        <Icono nombre={ICONO_CARGADO[x.tipo]} tamano={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15.5px] font-semibold text-texto">{x.titulo}</span>
                        {x.detalle && <span className="block truncate text-[13px] text-texto-suave">{x.detalle}</span>}
                      </span>
                      {x.valor && <span className="t-cifra-chica shrink-0 font-bold text-texto">{x.valor}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </motion.section>
        )}
      </div>
    </div>
  )
}

function Atajo({ icono, texto, onClick }: { icono: NombreIcono; texto: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2.5 rounded-[18px] bg-superficie px-3.5 py-3 text-left text-[15px] font-bold text-texto">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-principal-suave text-principal">
        <Icono nombre={icono} tamano={16} />
      </span>
      {texto}
    </button>
  )
}

/** «Hoy», «Ayer» o «12 de noviembre». */
function diaDe(iso: string): string {
  const d = new Date(iso)
  const hoy = new Date()
  const ayer = new Date(hoy.getTime() - 86_400_000)
  if (d.toDateString() === hoy.toDateString()) return 'Hoy'
  if (d.toDateString() === ayer.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
}
