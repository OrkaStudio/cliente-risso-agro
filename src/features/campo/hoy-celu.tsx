import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import tranquera from '@/assets/tropero/tranquera.webp'
import { WHATSAPP_TROPERO } from '@/features/acceso/reglas'
import { useAuth } from '@/features/auth/auth-context'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useCampoClima } from '@/features/cotizaciones/campo-clima'
import { usePronostico } from '@/features/cotizaciones/hooks'
import { puedeCargar, puedeVer, veePlata } from '@/features/empresa/secciones'
import { useCuentas, useEmpresa } from '@/features/empresa/use-empresa'
import { usePanoramaInicio } from '@/features/inicio/hooks'
import { useParaAtender } from '@/features/inicio/para-atender-api'
import { cosasParaHoy, delCampo, plataCorta, proximos30, saludo, type Cosa } from '@/features/inicio/tropero/dia'
import { SeSoluciono } from '@/features/inicio/tropero/el-dia'
import { useLluviaDelMes } from '@/features/inicio/tropero/use-dia'
import { cn } from '@/lib/utils'

/**
 * Hoy en el celular (Lau, 16/11): lo mismo que el Inicio de la compu, pensado
 * para el celular y no copiado. Arriba la tranquera de punta a punta con el
 * campo y la cuenta encima; el saludo; un tablero de cuatro datos separados por
 * líneas (no cuatro tarjetas); y lo que hay para atender como lista, directo
 * sobre el fondo.
 */

const CURVA = [0.22, 1, 0.36, 1] as const
const TONO: Record<Cosa['tono'], { icono: string; dato: string }> = {
  problema: { icono: 'bg-estado-problema-suave text-estado-problema-texto', dato: 'text-estado-problema-texto' },
  atencion: { icono: 'bg-estado-atencion-suave text-estado-atencion-texto', dato: 'text-texto-suave' },
  aviso: { icono: 'bg-superficie-hundida text-texto-suave', dato: 'text-texto-suave' },
}
const PRIMERAS = 4

export function HoyCelu({ cuenta, antes, abajo }: { cuenta: React.ReactNode; antes?: React.ReactNode; abajo?: React.ReactNode }) {
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
  const lluvia = useLluviaDelMes(lugar?.ubicacion ?? null)
  const pronostico = usePronostico(lugar?.ubicacion ?? null)
  const reducir = useReducedMotion()
  const [eligiendo, setEligiendo] = useState(false)
  const [todas, setTodas] = useState(false)

  const ve = { campos: puedeVer(membresia, 'campos'), hacienda: puedeVer(membresia, 'hacienda'), plata: veePlata(membresia) }
  const carga = { campos: puedeCargar(membresia, 'campos'), plata: puedeCargar(membresia, 'plata') }
  const crudo = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const nombre = crudo.charAt(0).toLocaleUpperCase('es-AR') + crudo.slice(1)
  const entra = (i: number) => (reducir ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: i * 0.06, ease: CURVA } })
  const elegir = (id: string | null) => {
    inicio.elegir(id)
    if (id) clima.elegir(id)
    setEligiendo(false)
  }
  const ir = (destino: string) => {
    if (destino.startsWith('whatsapp:')) return void window.open(`https://wa.me/${WHATSAPP_TROPERO}?text=${encodeURIComponent(destino.slice(9))}`, '_blank', 'noopener')
    navigate(destino)
  }

  const listo = panorama.data && !atender.isLoading
  const v = panorama.data ? delCampo(campo?.id ?? null, panorama.data, atender.data) : null
  const cosas = v
    ? cosasParaHoy(ve.campos ? v.potreros : [], ve.plata ? v.vencimientos : [], ve.campos ? v.sinRecorrer : []).map((c) =>
        !carga.campos && c.accion.to.startsWith('whatsapp:') ? { ...c, accion: { texto: 'Ver', to: '/campos' } } : !carga.plata && c.accion.to.startsWith('/agenda?mov=') ? { ...c, accion: { ...c.accion, texto: 'Ver' } } : c,
      )
    : []
  const visibles = todas ? cosas : cosas.slice(0, PRIMERAS)
  const manana = pronostico.data?.[1]

  // El tablero: sólo lo que la persona ve (permisos, 13/11).
  const datos: { titulo: string; icono: NombreIcono; valor: string; unidad?: string; pie: string; tono?: 'problema' | 'bien' }[] = []
  if (v && ve.hacienda) datos.push({ titulo: 'Hacienda', icono: 'Vaca', valor: v.totalCabezas.toLocaleString('es-AR'), unidad: 'cab', pie: campo ? campo.nombre : `En ${inicio.campos.length} campos` })
  if (v && ve.plata) {
    const p30 = proximos30(v.vencimientos)
    const vencidos = v.vencimientos.filter((x) => (x.diasParaVencer ?? 0) < 0).length
    datos.push({ titulo: 'Próximos 30 días', icono: 'Plata', valor: p30 === 0 ? '$0' : plataCorta(p30, true), pie: vencidos ? `${vencidos} vencidos` : 'Nada vencido', tono: p30 < 0 ? 'problema' : p30 > 0 ? 'bien' : undefined })
  }
  datos.push({ titulo: 'Lluvia', icono: 'Lluvia', valor: lluvia.data == null ? '—' : `≈${lluvia.data}`, unidad: 'mm', pie: manana ? (manana.lluviaProb >= 40 ? `Mañana ${manana.lluviaProb} %` : 'Mañana sin lluvia') : 'En 30 días' })
  if (v && ve.campos)
    datos.push({
      titulo: 'Recorrida',
      icono: 'Recorrida',
      valor: v.ultimaRecorridaHace === null ? 'Todavía no' : v.ultimaRecorridaHace === 0 ? 'Hoy' : v.ultimaRecorridaHace === 1 ? 'Ayer' : `Hace ${v.ultimaRecorridaHace} d`,
      pie: v.potreros.length ? `${v.potreros.length} potreros para mirar` : v.ultimaRecorridaHace === null ? 'La primera, por WhatsApp' : 'Todo en orden',
    })

  return (
    <div>
      {/* La tranquera de punta a punta, como portada; encima, el campo y la cuenta. */}
      <section className="relative isolate">
        <img src={tranquera} alt="" className="absolute inset-0 -z-20 h-[230px] w-full object-cover object-[50%_45%]" />
        <div className="absolute inset-x-0 top-0 -z-10 h-[230px] bg-[linear-gradient(180deg,transparent_30%,color-mix(in_srgb,var(--fondo)_70%,transparent)_62%,var(--fondo)_90%)]" />
        <div className="flex items-center gap-2 px-[18px] pt-[max(14px,env(safe-area-inset-top))]">
          {inicio.campos.length > 0 && (
            <div className="relative min-w-0">
              <button
                type="button"
                onClick={() => setEligiendo((x) => !x)}
                aria-expanded={eligiendo}
                aria-label={`Estás viendo ${campo?.nombre ?? 'todos los campos'}. Cambiar`}
                className="flex h-10 max-w-full items-center gap-2 rounded-full bg-superficie/90 pr-3 pl-1.5 text-[15px] font-bold text-texto shadow-[0_4px_14px_rgba(19,27,22,0.12)] backdrop-blur-sm"
              >
                {campo ? (
                  <span className="grid size-7 shrink-0 place-items-center rounded-[8px] text-[12px] font-extrabold text-white" style={{ background: campo.color }}>
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
                <ul className="absolute top-12 left-0 z-20 min-w-[220px] overflow-hidden rounded-[16px] bg-superficie py-1.5 text-texto shadow-[0_14px_36px_rgba(19,27,22,0.22)]">
                  {[null, ...inicio.campos].map((c) => (
                    <li key={c?.id ?? 'todos'}>
                      <button type="button" onClick={() => elegir(c?.id ?? null)} className={cn('flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[15px]', (c?.id ?? null) === (campo?.id ?? null) && 'font-bold')}>
                        {c ? (
                          <span className="grid size-6 place-items-center rounded-[6px] text-[11px] font-extrabold text-white" style={{ background: c.color }}>
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
        <motion.div {...entra(0)} className="px-[18px] pt-[104px]">
          {variasCuentas && <p className="text-[14px] font-semibold text-texto-suave">En {membresia?.empresa?.nombre}</p>}
          <h1 className="titulo-display text-[34px] leading-[1.02] text-texto">{saludo(new Date().getHours(), nombre)}</h1>
          <p className="mt-1.5 text-[15.5px] text-texto-suave">
            {!listo ? ' ' : cosas.length === 0 ? 'No hay nada urgente hoy.' : cosas.length === 1 ? 'Hay una cosa para atender.' : `Hay ${cosas.length} cosas para atender.`}
          </p>
        </motion.div>
      </section>

      <div className="flex flex-col gap-7 px-[18px] pt-5">
        {antes}
        {/* El tablero: cuatro datos separados por líneas, en dos columnas. */}
        {v && (
          <motion.dl {...entra(1)} className="grid grid-cols-2 border-y border-borde [&>div:nth-child(even)]:border-l [&>div:nth-child(n+3)]:border-t [&>div]:border-borde">
            {datos.map((d) => (
              <div key={d.titulo} className="flex min-w-0 flex-col gap-1 py-3.5 pr-3 [&:nth-child(even)]:pl-4">
                <dt className="flex items-center gap-1.5 text-[13px] font-semibold text-texto-suave">
                  <Icono nombre={d.icono} tamano={16} />
                  {d.titulo}
                </dt>
                <dd className="flex items-baseline gap-1.5">
                  <span className={cn('t-numero truncate !text-[26px]', d.tono === 'problema' ? 'text-estado-problema-texto' : d.tono === 'bien' ? 'text-estado-bien-texto' : 'text-texto')}>{d.valor}</span>
                  {d.unidad && <span className="text-[13.5px] font-semibold text-texto-suave">{d.unidad}</span>}
                </dd>
                <dd className="truncate text-[13px] text-texto-suave">{d.pie}</dd>
              </div>
            ))}
          </motion.dl>
        )}

        {/* Lo que hay para atender: una lista sobre el fondo, de lo más urgente a lo que puede esperar. */}
        {(ve.campos || ve.plata) && listo && (
          <motion.section {...entra(2)} aria-labelledby="hoy-atender">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="hoy-atender" className="titulo-display text-[22px] text-texto">
                Para atender hoy
              </h2>
              {cosas.length > 0 && <span className="t-cifra-chica text-texto-suave">{cosas.length}</span>}
            </div>
            {cosas.length === 0 ? (
              <p className="mt-2 flex items-center gap-2.5 text-[15px] text-texto-suave">
                <span className="grid size-8 place-items-center rounded-full bg-estado-bien-suave text-estado-bien-texto">
                  <Icono nombre="Guardar" tamano={16} />
                </span>
                Todo en orden. Lo que deje la recorrida o venza aparece acá.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-borde">
                {visibles.map((c, i) => {
                  const t = TONO[c.tono]
                  return (
                    <li key={c.key} className="flex items-center gap-3 py-3">
                      <span className={cn('grid size-11 shrink-0 place-items-center rounded-[14px]', t.icono)}>
                        <Icono nombre={c.icono} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn('truncate text-texto', i === 0 ? 'text-[17px]' : 'text-[15.5px]')}>
                          <b className="t-tarjeta">{c.lugar}</b>
                        </p>
                        <p className="truncate text-[14px] text-texto">{c.que}</p>
                        <p className={cn('truncate text-[13px] font-semibold', t.dato)}>{c.datos.join(' · ')}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {c.senal && membresia && <SeSoluciono senal={c.senal} empresaId={membresia.empresa_id} compacto />}
                        <button
                          type="button"
                          onClick={() => ir(c.accion.to)}
                          className={cn('h-10 rounded-full px-3.5 text-[14px] font-bold', i === 0 ? 'bg-principal text-principal-texto' : 'border-[1.5px] border-principal/60 text-principal')}
                        >
                          {c.accion.texto}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {cosas.length > PRIMERAS && (
              <button type="button" onClick={() => setTodas((x) => !x)} className="mt-1 text-[14.5px] font-bold text-principal">
                {todas ? 'Ver menos' : `Ver las ${cosas.length}`}
              </button>
            )}
          </motion.section>
        )}

        {abajo}
      </div>
    </div>
  )
}
