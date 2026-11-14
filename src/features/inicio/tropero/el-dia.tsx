import { Popover } from '@base-ui/react/popover'
import { Tooltip } from '@base-ui/react/tooltip'
import { BellIcon, CloudRain } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { BotonChico } from '@/components/tropero/boton'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import tranquera from '@/assets/tropero/tranquera.webp'
import { Cabecera as CabeceraSeccion } from '@/components/tropero/cabecera'
import { WHATSAPP_TROPERO } from '@/features/acceso/reglas'
import { useAuth } from '@/features/auth/auth-context'
import { useCampoClima, type OpcionClima } from '@/features/cotizaciones/campo-clima'
import { useClima, usePronostico } from '@/features/cotizaciones/hooks'
import type { DiaPronostico } from '@/features/cotizaciones/api'
import { nivelDe, puedeCargar, puedeVer, veePlata } from '@/features/empresa/secciones'
import { LoQueMandaste } from './lo-que-mandaste'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { WmoIcon } from '@/features/cotizaciones/wmo-icon'
import { categoriaNombre, especiePorCategoria } from '@/features/hacienda/labels'
import { cn } from '@/lib/utils'
import type { CategoriaConteo, Vencimiento } from '../api'
import { usePanoramaInicio } from '../hooks'
import { invalidarAvisos, useDeshacerMarca, useMarcarSenal } from '../marcar-senal'
import { useParaAtender } from '../para-atender-api'
import { delCampo, enCarriles, escenaDelClima, chipsDelDia, cosasParaHoy, franjasDelRodeo, lineaDePlata, plataCorta, proximos30, saludo, type Chip, type Cosa, type PuntoPlata } from './dia'
import { useCampoElegido, type CampoElegible } from '@/features/campos/campo-elegido'
import { CampoVisto } from '@/features/campos/campo-visto'
import { EscenaClima } from './escena-clima'
import { useGanadoCampania, useLluviaDelMes } from './use-dia'
import { useQuienMira } from '@/features/empresa/use-quien-mira'
import { usePermiso } from '@/features/empresa/use-permiso'

const CURVA = [0.22, 1, 0.36, 1] as const
const TARJETA = 'rounded-[20px] border border-borde bg-superficie px-6 py-5'
/**
 * La escala del Inicio: todos los paneles usan estos tamaños, así un ajuste se
 * hace una vez y no panel por panel.
 */
const T = {
  /** Título de cada panel. */
  titulo: 't-seccion text-texto',
  /** La línea de «para qué sirve» debajo del título. */
  bajada: 'text-[14px] text-texto-suave',
  /** Nombres, filas y etiquetas dentro de un gráfico. */
  texto: 'text-[15px] text-texto',
  /** Fechas, aclaraciones y ejes. */
  chico: 'text-[13px] text-texto-suave',
  /** Un número destacado dentro de un panel. */
  numero: 't-numero',
  /** Un número de fila (pronóstico, montos de una lista). */
  numeroChico: 't-cifra font-bold',
} as const

/**
 * Inicio · El día (página 35). Pensado desde el productor que abre la compu a
 * la mañana: primero, si hay algo que atender (y qué); después, el pulso del
 * campo en cuatro números que llevan a su lugar (hacienda, plata, lluvia,
 * recorrida); y a la vista, sin bajar, la lista para atender y los cobros y
 * pagos. El detalle (croquis, rodeo, clima) va abajo, para el que lo busca.
 */
export function ElDia() {
  const { user } = useAuth()
  const { data: membresia } = useEmpresa()
  const plata = veePlata(membresia)
  // Cada bloque, sólo si la persona ve esa sección (permisos, 13/11). Lo que no ve
  // no se muestra: un «Nunca se recorrió» sobre datos que no puede leer sería falso.
  const veCampos = puedeVer(membresia, 'campos')
  const veHacienda = puedeVer(membresia, 'hacienda')
  const mandaPlata = !!membresia && nivelDe(membresia, 'plata') === 'solo_manda'
  const mandaCampos = !!membresia && nivelDe(membresia, 'campos') === 'solo_manda'
  const panorama = usePanoramaInicio()
  const atender = useParaAtender()
  const inicio = useCampoElegido()
  const campoId = inicio.elegido?.id ?? null
  // El clima del campo elegido; con todos, el que se eligió para el clima.
  const { actual, opciones } = useCampoClima()
  const lugar = (campoId ? opciones.find((o) => o.id === campoId) : null) ?? actual
  const pronostico = usePronostico(lugar?.ubicacion ?? null)
  const lluvia = useLluviaDelMes(lugar?.ubicacion ?? null)
  const ganado = useGanadoCampania(campoId)
  const reducir = useReducedMotion()

  if (panorama.isLoading || atender.isLoading) return <div className="h-[132px] animate-pulse rounded-[22px] bg-superficie-hundida" aria-busy />
  if (panorama.error || !panorama.data) return <p className="text-texto-suave">No pudimos cargar el Inicio. Revisá la conexión y probá de nuevo.</p>

  const v = delCampo(campoId, panorama.data, atender.data)
  // Con Campos en «Ve» se ve lo que hay que atender, pero «Mandar la recorrida» es cargar: lleva a mirar el campo.
  const cargaCampos = puedeCargar(membresia, 'campos')
  const cosas = cosasParaHoy(veCampos ? v.potreros : [], plata ? v.vencimientos : [], veCampos ? v.sinRecorrer : []).map((c) =>
    !cargaCampos && c.accion.to.startsWith('whatsapp:') ? { ...c, accion: { texto: 'Ver el campo', to: '/campos' } } : c,
  )
  const crudo = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const nombre = crudo.charAt(0).toLocaleUpperCase('es-AR') + crudo.slice(1)
  const manana = pronostico.data?.[1]
  const chips = chipsDelDia({ cosas, vencimientos: v.vencimientos, lluviaManana: manana ? manana.lluviaProb : null })
  const entra = (i: number) =>
    reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.06, ease: CURVA } }

  return (
    <div className="mx-auto flex w-full ancho-pagina flex-col gap-5">
      <motion.div {...entra(0)}>
        <Cabecera veAlgo={veCampos || plata} titulo={saludo(new Date().getHours(), nombre)} cosas={cosas} lluvia={chips.find((c) => c.key === 'lluvia') ?? null} campos={inicio.campos} elegido={inicio.elegido} />
      </motion.div>

      {/* Una sola franja, cuatro celdas: se lee como un tablero, no como cuatro cajas. */}
      <motion.div
        {...entra(1)}
        className={cn('grid grid-cols-2 overflow-hidden rounded-[20px] border border-borde bg-superficie [&>*]:border-borde max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(odd)]:border-r lg:[&>*+*]:border-l', ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4'][1 + Number(veHacienda) + Number(plata) + Number(veCampos)])}
      >
        {veHacienda && <PulsoHacienda total={v.totalCabezas} campos={campoId ? 1 : inicio.campos.length} cats={v.porCategoria} nacimientos={v.nacimientos} />}
        {/* La plata sólo para quien el dueño se la habilitó (Configuración → Personas). */}
        {plata && <PulsoPlata vencimientos={v.vencimientos} ganado={ganado.data ?? null} />}
        <PulsoLluvia lugar={lugar?.nombre ?? null} mm={lluvia.data ?? null} manana={manana ?? null} />
        {veCampos && <PulsoRecorrida ultima={v.ultimaRecorridaHace} potreros={v.potreros.length} sinRecorrer={v.sinRecorrer} />}
      </motion.div>

      {/* Quien sólo manda: cómo mandar y lo último que mandó (permisos, 14/11). */}
      {(mandaPlata || mandaCampos) && (
        <motion.div {...entra(2)}>
          <LoQueMandaste plata={mandaPlata} campos={mandaCampos} />
        </motion.div>
      )}

      {(veCampos || plata) && (
        <motion.div {...entra(2)}>
          <ParaAtenderHoy cosas={cosas} empresaId={membresia?.empresa_id ?? ''} />
        </motion.div>
      )}

      {/* El campo hoy: el rodeo y el clima en un solo panel, divididos por una línea. */}
      <motion.div
        {...entra(3)}
        className={cn('grid overflow-hidden rounded-[20px] border border-borde bg-superficie', veHacienda && 'lg:grid-cols-[minmax(0,1fr)_360px]')}
      >
        {veHacienda && <EstructuraDelRodeo cats={v.porCategoria} total={v.totalCabezas} campo={inicio.elegido?.nombre ?? null} />}
        <div className={cn('border-borde', veHacienda && 'max-lg:border-t lg:border-l')}>
          <Clima lugar={lugar} />
        </div>
      </motion.div>

      {/* Sólo para quien tiene la plata habilitada (permisos, 13/11): antes salía en $0. */}
      {plata && (
        <motion.div {...entra(4)}>
          <LaPlata vencimientos={v.vencimientos} />
        </motion.div>
      )}
    </div>
  )
}

/** Ir a una sección del Inicio («#clima») o a otra pantalla («/agenda»). */
function useIr() {
  const navigate = useNavigate()
  return (destino: string) => {
    // «whatsapp:texto»: el WhatsApp de Troppero con el mensaje empezado (la recorrida se cuenta ahí).
    if (destino.startsWith('whatsapp:')) return void window.open(`https://wa.me/${WHATSAPP_TROPERO}?text=${encodeURIComponent(destino.slice(9))}`, '_blank', 'noopener')
    if (destino.startsWith('#')) document.getElementById(destino.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else navigate(destino)
  }
}

// ===== La cabecera: el saludo, lo importante en chips y los accesos =====


function Cabecera({
  veAlgo = true,
  titulo,
  cosas,
  lluvia,
  campos,
  elegido,
}: {
  titulo: string
  cosas: Cosa[]
  lluvia: Chip | null
  campos: CampoElegible[]
  elegido: CampoElegible | null
  veAlgo?: boolean
}) {
  const ir = useIr()
  return (
    // La tranquera y el camino (Figma 233:113): el mismo encabezado de todas las secciones.
    <CabeceraSeccion imagen={tranquera} posicion="50% 42%" encima={<CampoVisto campos={campos} elegido={elegido} />}>
        <h1 className="t-pagina text-texto">{titulo}</h1>
        {/* Los avisos del día, en un botón con su número: se abren en un panelito, cada uno con su acción (Lau, 07/11). */}
        {/* «Todo en orden» sólo lo puede decir quien ve el campo o la plata (permisos, 14/11). */}
        {(veAlgo || lluvia) && <Avisos cosas={cosas} lluvia={lluvia} onIr={ir} />}
    </CabeceraSeccion>
  )
}

/**
 * Los avisos del día (Lau, 07/11): lo mismo que «Para atender hoy», cosa por
 * cosa (el número de la barra lateral y éste son el mismo), cada una con su
 * ícono, qué pasa, cuándo y su botón. La lluvia, aparte, al pie.
 */
function Avisos({ cosas, lluvia, onIr }: { cosas: Cosa[]; lluvia: Chip | null; onIr: (destino: string) => void }) {
  const urgentes = cosas.filter((c) => c.tono === 'problema').length
  if (!cosas.length && !lluvia)
    return (
      <p className="mt-2.5 inline-flex items-center gap-2 text-[15px] font-semibold text-estado-bien-texto">
        <span className="size-2 rounded-full bg-estado-bien" />
        Todo en orden hoy
      </p>
    )
  return (
    <Popover.Root>
      <Popover.Trigger className="group mt-2.5 inline-flex h-10 items-center gap-2.5 rounded-full border-[1.5px] border-borde bg-superficie/95 py-1 pr-3.5 pl-1 text-[14.5px] font-bold text-texto transition-colors hover:border-principal data-[popup-open]:border-principal">
        <span className={cn('relative grid size-8 place-items-center rounded-full', urgentes ? 'bg-estado-problema text-superficie' : 'bg-acento text-acento-texto')}>
          <BellIcon className="size-4" />
        </span>
        {cosas.length === 0 ? 'Mañana llueve' : cosas.length === 1 ? 'Una cosa para hoy' : `${cosas.length} cosas para hoy`}
        <span className="text-texto-suave transition-transform duration-300 group-data-[popup-open]:rotate-90">
          <Icono nombre="Siguiente" tamano={16} />
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={10} collisionPadding={16} className="z-40">
          <Popover.Popup className="popup-suave w-[480px] overflow-hidden rounded-[24px] border border-borde bg-superficie shadow-[0_24px_56px_-16px_rgba(58,26,13,0.38)] outline-none">
            <div className="flex items-center justify-between gap-3 border-b border-borde bg-fondo/60 px-5 py-3.5">
              <Popover.Title className="t-tarjeta text-texto">Para hoy</Popover.Title>
              {urgentes > 0 && <span className="rounded-full bg-estado-problema-suave px-2.5 py-0.5 text-[12.5px] font-bold text-estado-problema-texto">{urgentes === 1 ? '1 urgente' : `${urgentes} urgentes`}</span>}
            </div>
            <ul className="flex max-h-[min(440px,60vh)] flex-col divide-y divide-borde/70 overflow-y-auto">
              {cosas.map((c) => {
                const tono = TONO[c.tono as keyof typeof TONO] ?? TONO.aviso
                return (
                  <li key={c.key}>
                    <Popover.Close onClick={() => onIr(c.accion.to)} className="group flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-principal-suave/40">
                      <span className={cn('grid size-10 shrink-0 place-items-center rounded-[12px]', tono.icono)}>
                        <Icono nombre={c.icono} tamano={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold text-texto">
                          {c.lugar} <span className="font-semibold text-texto-suave">· {c.que}</span>
                        </span>
                        {c.datos[0] && <span className={cn('block truncate text-[13.5px] font-semibold', tono.dato)}>{c.datos[0]}</span>}
                      </span>
                      <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-superficie-hundida px-3 text-[13px] font-bold text-texto transition-colors group-hover:bg-principal group-hover:text-principal-texto">
                        {c.accion.texto}
                        <Icono nombre="Siguiente" tamano={16} />
                      </span>
                    </Popover.Close>
                  </li>
                )
              })}
            </ul>
            {lluvia && (
              <Popover.Close onClick={() => onIr(lluvia.destino)} className="flex w-full items-center gap-3 border-t border-borde bg-trigo-50/70 px-5 py-3 text-left text-[14px] font-semibold text-texto hover:bg-trigo-100/70">
                <CloudRain className="size-4 text-trigo-700" />
                <span className="flex-1">{lluvia.texto}</span>
                <span className="text-[13px] font-bold text-principal">Pronóstico</span>
              </Popover.Close>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

// ===== El pulso del campo: cuatro números, cada uno lleva a su lugar =====

const NUMERO = 't-numero text-texto'

/**
 * Una tarjeta del pulso, leída en orden (Lau, 08/11): 1) el número grande;
 * 2) el estado, en una etiqueta de color si pide atención; 3) de qué es y el
 * detalle, en chico. El ícono, en el color de su tema.
 */
function Pulso({
  titulo,
  icono,
  tinte,
  destino,
  pie,
  pieTono = null,
  children,
}: {
  titulo: string
  icono: NombreIcono
  /** El círculo del ícono: el color del tema de la tarjeta. */
  tinte: string
  destino: string
  pie: React.ReactNode
  /** Si el pie pide atención, va en una etiqueta de ese color. */
  pieTono?: 'problema' | 'atencion' | 'bien' | null
  children: React.ReactNode
}) {
  const ir = useIr()
  return (
    <button type="button" onClick={() => ir(destino)} className="group flex min-h-[136px] flex-col px-5 py-4 text-left transition-colors hover:bg-superficie-hundida/50">
      <span className="flex items-center gap-2.5 text-[13.5px] font-semibold text-texto-suave">
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', tinte)}>
          <Icono nombre={icono} tamano={16} />
        </span>
        {titulo}
        <span className="ml-auto text-principal opacity-0 transition-opacity group-hover:opacity-100">
          <Icono nombre="Siguiente" tamano={16} />
        </span>
      </span>
      <span className="mt-3 flex-1">{children}</span>
      <span
        className={cn(
          'mt-2.5 w-fit text-[13px] leading-snug',
          pieTono === 'problema' && 'font-bold text-estado-problema-texto',
          pieTono === 'atencion' && 'font-bold text-estado-atencion-texto',
          pieTono === 'bien' && 'font-bold text-estado-bien-texto',
          !pieTono && 'text-texto-suave',
        )}
      >
        {pie}
      </span>
    </button>
  )
}

function PulsoHacienda({ total, campos, cats, nacimientos }: { total: number; campos: number; cats: CategoriaConteo[]; nacimientos: number }) {
  const quien = useQuienMira()
  const franjas = franjasDelRodeo(cats)
  return (
    <Pulso
      titulo="Hacienda"
      icono="Vaca"
      tinte="bg-principal-suave text-principal"
      destino="/hacienda"
      pieTono={nacimientos > 0 ? 'atencion' : null}
      pie={nacimientos > 0 ? `+${nacimientos} nacimientos sin caravana` : campos > 1 ? `En ${quien.dueno ? 'tus' : 'los'} ${campos} campos` : 'Ver por potrero'}
    >
      <span className="flex items-baseline gap-2">
        <span className={NUMERO}>{total.toLocaleString('es-AR')}</span>
        <span className="text-[14px] font-semibold text-texto-suave">cabezas</span>
      </span>
      {franjas.length > 0 && (
        <span className="mt-3 flex h-1.5 gap-1">
          {franjas.map((f) => (
            <span key={f.nombre} className={cn('rounded-full', f.clase)} style={{ flexGrow: f.cabezas }} />
          ))}
        </span>
      )}
    </Pulso>
  )
}

function PulsoPlata({ vencimientos, ganado }: { vencimientos: Vencimiento[]; ganado: number | null }) {
  const p30 = proximos30(vencimientos)
  const vencidos = vencimientos.filter((v) => (v.diasParaVencer ?? 0) < 0)
  const deuda = vencidos.reduce((s, v) => s + (v.tipo === 'gasto' ? v.monto ?? 0 : 0), 0)
  return (
    <Pulso
      titulo="Próximos 30 días"
      icono="Plata"
      tinte={p30 < 0 ? 'bg-estado-problema-suave text-estado-problema-texto' : 'bg-estado-bien-suave text-estado-bien-texto'}
      destino="/agenda"
      pieTono={vencidos.length > 0 ? 'problema' : null}
      pie={
        vencidos.length > 0 ? (
          <>
            {vencidos.length === 1 ? '1 vencido' : `${vencidos.length} vencidos`}
            {deuda > 0 ? ` · ${plataCorta(deuda)}` : ''}
          </>
        ) : ganado !== null && ganado !== 0 ? (
          `Desde julio: ${plataCorta(ganado, true)}`
        ) : (
          'Nada vencido'
        )
      }
    >
      <span className={cn(NUMERO, p30 < 0 ? 'text-estado-problema-texto' : 'text-estado-bien-texto')}>
        {p30 === 0 ? '$0' : plataCorta(p30, true)}
      </span>
      <span className="mt-1 block truncate text-[12.5px] text-texto-suave">cobros menos pagos</span>
    </Pulso>
  )
}

function PulsoLluvia({ lugar, mm, manana }: { lugar: string | null; mm: number | null; manana: DiaPronostico | null }) {
  return (
    <Pulso
      titulo={lugar ? `Lluvia en ${lugar}` : 'Lluvia'}
      icono="Lluvia"
      tinte="bg-sky-soft text-sky"
      destino="#clima"
      pieTono={manana && manana.lluviaProb >= 40 ? 'atencion' : null}
      pie={manana ? (manana.lluviaProb >= 40 ? `Mañana ${manana.lluviaProb} % de lluvia` : `Mañana ${manana.max}°, sin lluvia`) : 'Pronóstico abajo'}
    >
      <span className="flex items-baseline gap-2">
        <span className={NUMERO}>
          {mm === null ? '—' : `≈${mm}`}
        </span>
        <span className="text-[14px] font-semibold text-texto-suave">mm</span>
      </span>
      <span className="mt-1 block truncate text-[12.5px] text-texto-suave">
        en 30 días, según el pronóstico
      </span>
    </Pulso>
  )
}

function PulsoRecorrida({ ultima, potreros, sinRecorrer }: { ultima: number | null; potreros: number; sinRecorrer: { campo: string }[] }) {
  // Más de dos semanas sin recorrer (o nunca): el número en color de atención.
  const vieja = ultima === null || ultima > 14
  return (
    <Pulso
      titulo="Última recorrida"
      icono="Recorrida"
      tinte={vieja ? 'bg-estado-atencion-suave text-estado-atencion-texto' : 'bg-estado-bien-suave text-estado-bien-texto'}
      destino="#para-atender"
      pieTono={potreros > 0 ? 'problema' : sinRecorrer.length > 0 ? 'atencion' : 'bien'}
      pie={
        potreros > 0 ? (
          `Dejó ${potreros} ${potreros === 1 ? 'potrero' : 'potreros'} para mirar`
        ) : sinRecorrer.length > 0 ? (
          `${sinRecorrer[0]!.campo} sin recorrer`
        ) : (
          'Todo en orden'
        )
      }
    >
      {ultima === null || ultima <= 1 ? (
        <span className={cn(NUMERO, vieja && 'text-estado-atencion-texto')}>{ultima === null ? 'Nunca' : ultima === 0 ? 'Hoy' : 'Ayer'}</span>
      ) : (
        <span className="flex items-baseline gap-2">
          <span className="text-[14px] font-semibold text-texto-suave">hace</span>
          <span className={cn(NUMERO, vieja && 'text-estado-atencion-texto')}>{ultima}</span>
          <span className="text-[14px] font-semibold text-texto-suave">días</span>
        </span>
      )}
    </Pulso>
  )
}

// ===== Para atender hoy: tarjetas que se entienden sin leer =====

const TONO = {
  problema: { icono: 'bg-estado-problema-suave text-estado-problema-texto', dato: 'text-estado-problema-texto' },
  atencion: { icono: 'bg-estado-atencion-suave text-estado-atencion-texto', dato: 'text-texto-suave' },
  aviso: { icono: 'bg-superficie-hundida text-texto-suave', dato: 'text-texto-suave' },
} as const

function ParaAtenderHoy({ cosas, empresaId }: { cosas: Cosa[]; empresaId: string }) {
  const [primera, ...resto] = cosas
  return (
    <section id="para-atender" aria-labelledby="atender-hoy" className="scroll-mt-6 overflow-hidden rounded-[20px] border border-borde bg-superficie">
      <div className="flex items-baseline gap-3 border-b border-borde px-6 py-4">
        <h2 id="atender-hoy" className={T.titulo}>
          Para atender hoy
        </h2>
        {resto.length > 0 && <span className={T.bajada}>De lo más urgente a lo que puede esperar</span>}
      </div>
      {!primera ? (
        <div className="flex items-center gap-4 px-6 py-5">
          <span className="grid size-11 place-items-center rounded-full bg-estado-bien-suave text-estado-bien-texto">
            <Icono nombre="Guardar" />
          </span>
          <div>
            <p className="t-tarjeta text-texto">Todo en orden</p>
            <p className="text-[14px] text-texto-suave">Lo que deje la recorrida o venza en la agenda aparece acá.</p>
          </div>
        </div>
      ) : (
        // Lo primero en grande, lo demás en filas.
        <div className={cn(resto.length > 0 && 'lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]')}>
          {resto.length > 0 ? <Destacada c={primera} empresaId={empresaId} /> : <Unica c={primera} empresaId={empresaId} />}
          {resto.length > 0 && (
            <ul className="divide-y divide-borde border-borde max-lg:border-t lg:border-l">
              {resto.map((c) => (
                <FilaCosa key={c.key} c={c} empresaId={empresaId} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

/** Lo primero que hay que hacer: grande, con el color de su urgencia. */
function Destacada({ c, empresaId }: { c: Cosa; empresaId: string }) {
  const ir = useIr()
  const t = TONO[c.tono]
  return (
    <article className="flex flex-col p-6">
      <div className="flex items-center gap-3">
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-[14px]', t.icono)}>
          <Icono nombre={c.icono} />
        </span>
        <span className="text-[13px] font-bold tracking-[0.02em] text-texto-suave uppercase">Lo primero</span>
      </div>
      <p className="t-numero mt-4 truncate text-texto">{c.lugar}</p>
      <p className="mt-2 text-[17px] leading-snug font-semibold text-texto">{c.que}</p>
      <p className={cn('mt-1 text-[14px] font-semibold', t.dato)}>{c.datos.join(' · ')}</p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => ir(c.accion.to)}
          className="inline-flex h-10 items-center gap-2.5 rounded-full bg-principal py-1 pr-1 pl-4 text-[14.5px] font-bold text-principal-texto hover:bg-terracota-600"
        >
          {c.accion.texto}
          <span className="grid size-8 place-items-center rounded-full bg-acento text-acento-texto">
            <Icono nombre="Siguiente" tamano={16} />
          </span>
        </button>
        {c.senal && <SeSoluciono senal={c.senal} empresaId={empresaId} />}
      </div>
    </article>
  )
}

/** Una sola cosa para atender: en una franja, no un bloque grande y vacío. */
function Unica({ c, empresaId }: { c: Cosa; empresaId: string }) {
  const ir = useIr()
  const t = TONO[c.tono]
  return (
    <article className="flex flex-wrap items-center gap-x-5 gap-y-3 px-6 py-5">
      <span className={cn('grid size-12 shrink-0 place-items-center rounded-[14px]', t.icono)}>
        <Icono nombre={c.icono} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] text-texto">
          <b className="t-tarjeta">{c.lugar}</b>
          <span className="text-texto-suave"> · </span>
          <span className="font-semibold">{c.que}</span>
        </p>
        <p className={cn('text-[14px] font-semibold', t.dato)}>{c.datos.join(' · ')}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {c.senal && <SeSoluciono senal={c.senal} empresaId={empresaId} />}
        <button
          type="button"
          onClick={() => ir(c.accion.to)}
          className="inline-flex h-10 items-center gap-2.5 rounded-full bg-principal py-1 pr-1 pl-4 text-[14.5px] font-bold text-principal-texto hover:bg-terracota-600"
        >
          {c.accion.texto}
          <span className="grid size-8 place-items-center rounded-full bg-acento text-acento-texto">
            <Icono nombre="Siguiente" tamano={16} />
          </span>
        </button>
      </div>
    </article>
  )
}

/** El resto: una fila compacta con el color de la urgencia a la izquierda. */
function FilaCosa({ c, empresaId }: { c: Cosa; empresaId: string }) {
  const ir = useIr()
  const t = TONO[c.tono]
  return (
    <li className="flex items-center gap-4 px-5 py-3.5">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-[12px]', t.icono)}>
        <Icono nombre={c.icono} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] text-texto">
          <b className="font-heading font-extrabold">{c.lugar}</b>
          <span className="text-texto-suave"> · </span>
          <span className="font-semibold">{c.que}</span>
        </p>
        <p className={cn('text-[13px] font-semibold', t.dato)}>{c.datos.join(' · ')}</p>
      </div>
      {c.senal && <SeSoluciono senal={c.senal} empresaId={empresaId} compacto />}
      <BotonChico type="button" onClick={() => ir(c.accion.to)}>
        {c.accion.texto.replace(' el potrero', '')}
      </BotonChico>
    </li>
  )
}

/** «Se solucionó»: marca la señal de la recorrida. Queda confirmada con «Deshacer»; la lista se refresca después. */
export function SeSoluciono({ senal, empresaId, compacto = false }: { senal: NonNullable<Cosa['senal']>; empresaId: string; compacto?: boolean }) {
  const qc = useQueryClient()
  const marcar = useMarcarSenal()
  const deshacer = useDeshacerMarca()
  const [marca, setMarca] = useState<string | null>(null)
  // Marcarlo solucionado es cargar en Campos (permisos, 13/11).
  const { carga } = usePermiso('campos')
  if (!carga) return null
  if (marca)
    return (
      <span className="flex shrink-0 items-center justify-center gap-1 text-[13.5px] font-bold text-estado-bien-texto">
        <Icono nombre="Guardar" tamano={16} /> {compacto ? '' : 'Solucionado'}
        <button
          type="button"
          className="rounded-full px-2 py-1 text-[13px] text-principal hover:bg-principal-suave"
          onClick={() => deshacer.mutate(marca, { onSuccess: () => setMarca(null) })}
        >
          Deshacer
        </button>
      </span>
    )
  return (
    <button
      type="button"
      disabled={marcar.isPending}
      onClick={() =>
        marcar.mutate(
          { empresaId, potreroId: senal.potreroId, observacionId: senal.observacionId, tipo: senal.tipo, estado: 'resuelto' },
          {
            onSuccess: (id) => {
              setMarca(id)
              // Primero se ve la confirmación; la lista se actualiza un rato después.
              window.setTimeout(() => invalidarAvisos(qc, senal.potreroId), 6000)
            },
          },
        )
      }
      aria-label="Se solucionó"
      title="Se solucionó"
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-neutro-300 bg-superficie text-[14.5px] font-bold text-texto transition-colors hover:border-neutro-500 hover:bg-superficie-hundida disabled:opacity-50',
        compacto ? 'size-9' : 'h-10 px-4',
      )}
    >
      <Icono nombre="Guardar" tamano={16} />
      {!compacto && 'Se solucionó'}
    </button>
  )
}

// ===== La plata de los próximos 30 días: una línea de tiempo =====

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const HORIZONTE = 30
/** Ancho de la columna de lo vencido, a la izquierda de la línea. */
const VENCIDO = 190

/** Lo que ocupa cada burbuja a lo ancho (con su monto y su nombre), para repartirlas sin que se pisen. */
const ANCHO_ETIQUETA = 124
/** Alto de un carril: la burbuja más grande, su monto y su nombre, y aire. */
const CARRIL = 104

function LaPlata({ vencimientos }: { vencimientos: Vencimiento[] }) {
  const navigate = useNavigate()
  const l = lineaDePlata(vencimientos, HORIZONTE)
  const hoy = new Date()
  const fechaDe = (dia: number) => {
    const d = new Date(hoy)
    d.setDate(d.getDate() + dia)
    return `${d.getDate()} ${MES[d.getMonth()]}`
  }
  // El ancho real de la línea: las posiciones se calculan en píxeles para repartir en carriles.
  const [ancho, setAncho] = useState(900)
  const medir = (el: HTMLDivElement | null) => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e!.contentRect.width)))
    ro.observe(el)
  }
  const largo = Math.max(200, ancho - VENCIDO - 38)
  const xDe = (dia: number) => VENCIDO + 16 + (largo * Math.max(0, dia)) / HORIZONTE
  // Lo del mismo día y del mismo lado, en una burbuja («3 pagos»): el detalle, al pasar el mouse.
  const juntos = (lista: PuntoPlata[]) => {
    const m = new Map<string, PuntoPlata[]>()
    for (const p of lista) m.set(`${p.dia}-${p.cobro}`, [...(m.get(`${p.dia}-${p.cobro}`) ?? []), p])
    return [...m.values()].map((g) => (g.length === 1 ? g[0]! : { ...g[0]!, id: g.map((x) => x.id).join('+'), monto: g.reduce((t, x) => t + x.monto, 0), descripcion: `${g.length} ${g[0]!.cobro ? 'cobros' : 'pagos'}: ${g.map((x) => x.descripcion).join(', ')}`, grupo: g }))
  }
  const futuros = juntos(l.futuros)
  // Tamaño por monto (área ∝ plata), entre 16 y 48 px.
  const maxFuturo = Math.max(1, ...futuros.map((p) => p.monto))
  const tam = (m: number) => 16 + 32 * Math.sqrt(m / maxFuturo)
  const reparto = (lista: PuntoPlata[]) => enCarriles(lista.map((p) => ({ id: p.id, x: xDe(p.dia), ancho: Math.max(tam(p.monto), ANCHO_ETIQUETA) })))
  const arriba = reparto(futuros.filter((p) => p.cobro))
  const abajo = reparto(futuros.filter((p) => !p.cobro))
  // Arriba se deja lugar para los carriles; abajo, además, la fila de fechas pegada a la línea.
  const alto = Math.max(1, arriba.carriles) * CARRIL + 16
  const altoAbajo = 34 + Math.max(1, abajo.carriles) * CARRIL
  const lugarDe = new Map([...arriba.ubicadas, ...abajo.ubicadas].map((u) => [u.id, u]))
  const vacio = l.futuros.length === 0 && l.vencidos.length === 0
  // Lo vencido no es todo pérdida: lo que no se pagó y lo que no se cobró van separados.
  const sinPagar = l.vencidos.filter((p) => !p.cobro).reduce((t, p) => t + p.monto, 0)
  const sinCobrar = l.vencidos.filter((p) => p.cobro).reduce((t, p) => t + p.monto, 0)
  // Uno solo abre «¿Lo pagaste?»; varios del mismo día, la Agenda en ese mes.
  const abrir = (p: PuntoPlata & { grupo?: PuntoPlata[] }) => navigate(p.grupo ? `/agenda?mes=${(p.fecha ?? '').slice(0, 7)}` : `/agenda?mov=${p.id}`)

  return (
    <section className={TARJETA} aria-labelledby="la-plata">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="la-plata" className={cn(T.titulo)}>
            La plata de los próximos 30 días
          </h2>
          <p className={T.bajada}>Arriba lo que entra, abajo lo que sale. El tamaño es el monto; pasá el mouse para ver cada uno.</p>
        </div>
        <BotonChico type="button" onClick={() => navigate('/agenda')}>
          Ver en Agenda
        </BotonChico>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-3">
        <Cifra nombre="Entra" valor={plataCorta(l.entra)} clase="text-estado-bien-texto" />
        <Cifra nombre="Sale" valor={plataCorta(-l.sale)} clase="text-estado-problema-texto" />
        <Cifra nombre="Queda" valor={plataCorta(l.queda, true)} clase={l.queda >= 0 ? 'text-texto' : 'text-estado-problema-texto'} />
        {sinPagar > 0 && <span className="mb-1.5 inline-flex items-center gap-2 text-[14.5px] font-bold text-estado-problema-texto"><span className="size-2 rounded-full bg-estado-problema" />{plataCorta(sinPagar)} vencido sin pagar</span>}
        {sinCobrar > 0 && <span className="mb-1.5 inline-flex items-center gap-2 text-[14.5px] font-bold text-estado-bien-texto"><span className="size-2 rounded-full bg-estado-bien" />{plataCorta(sinCobrar)} vencido sin cobrar</span>}
      </div>

      {vacio ? (
        <p className="mt-6 rounded-[14px] bg-superficie-hundida/60 px-5 py-4 text-[15px] text-texto-suave">Nada por cobrar ni por pagar en los próximos 30 días.</p>
      ) : (
        <Tooltip.Provider delay={150} closeDelay={60}>
          <div ref={medir} className="relative mt-6" style={{ height: alto + altoAbajo }}>
            {/* Lo vencido: una lista de botones (cada uno abre «¿Lo pagaste?»), de lo más grande a lo más chico. */}
            <div className="absolute inset-y-0 left-0 flex flex-col gap-1.5 rounded-[12px] bg-superficie-hundida/70 px-2.5 py-3" style={{ width: VENCIDO - 12 }}>
              <p className="px-1.5 text-[14px] font-bold text-texto">Vencido</p>
              {l.vencidos.length === 0 ? (
                <p className="px-1.5 text-[13px] text-texto-suave">Nada</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {[...l.vencidos]
                    .sort((x, y) => y.monto - x.monto)
                    .slice(0, 4)
                    .map((p) => (
                      <li key={p.id}>
                        <ConDetalle p={p} hoy={hoy}>
                          <button type="button" onClick={() => abrir(p)} className="group flex w-full items-center gap-2 rounded-[10px] border border-borde bg-superficie px-2.5 py-2 text-left transition-colors hover:border-principal" aria-label={`${p.cobro ? 'Cobro' : 'Pago'} vencido de ${plataCorta(p.monto)}: ${p.descripcion}`}>
                            <span className="min-w-0 flex-1">
                              <span className={cn('t-cifra-chica block font-bold', p.cobro ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>
                                {p.cobro ? '+' : '−'}
                                {plataCorta(p.monto)}
                              </span>
                              <span className="block truncate text-[12.5px] text-texto-suave">{p.descripcion}</span>
                            </span>
                            <span className="shrink-0 text-texto-suave transition-colors group-hover:text-principal">
                              <Icono nombre="Siguiente" tamano={16} />
                            </span>
                          </button>
                        </ConDetalle>
                      </li>
                    ))}
                  {l.vencidos.length > 4 && (
                    <li>
                      <button type="button" onClick={() => navigate('/agenda?revisar=1')} className="w-full rounded-[10px] px-2.5 py-1.5 text-left text-[13px] font-bold text-principal hover:bg-superficie">
                        Ver los {l.vencidos.length}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
            {/* El eje: hoy → 30 días, con las fechas pegadas abajo (los pagos van más abajo, nunca encima). */}
            <div className="absolute right-0 h-[2px] bg-borde" style={{ left: VENCIDO, top: alto }} />
            {[0, 7, 14, 21, 30].map((d) => (
              <span key={d} className="absolute -translate-x-1/2 text-[13.5px] font-semibold whitespace-nowrap text-texto-suave" style={{ left: xDe(d), top: alto + 8 }}>
                {d === 0 ? 'Hoy' : fechaDe(d)}
              </span>
            ))}
            {futuros.map((p) => {
              const u = lugarDe.get(p.id)!
              return <Burbuja key={p.id} p={p} hoy={hoy} tam={tam(p.monto)} x={u.x} xb={u.xb} eje={alto} carril={u.carril} onClick={() => abrir(p)} />
            })}
          </div>
        </Tooltip.Provider>
      )}
    </section>
  )
}

function Cifra({ nombre, valor, clase }: { nombre: string; valor: string; clase: string }) {
  return (
    <div>
      <p className="text-[14px] font-semibold text-texto-suave">{nombre}</p>
      <p className={cn('t-numero', clase)}>{valor}</p>
    </div>
  )
}

/** La tarjeta al pasar el mouse, como en el calendario de la Agenda. */
function ConDetalle({ p, hoy, children }: { p: PuntoPlata; hoy: Date; children: React.ReactElement }) {
  const dias = p.dia
  const estado = dias < 0 ? `Venció hace ${-dias === 1 ? 'un día' : `${-dias} días`}` : dias === 0 ? 'Vence hoy' : dias === 1 ? 'Vence mañana' : `En ${dias} días`
  const fecha = p.fecha ? new Date(`${p.fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }) : null
  void hoy
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={10} collisionPadding={16} className="z-40">
          <Tooltip.Popup className="w-[270px] popup-suave rounded-[20px] border border-borde bg-superficie p-4 shadow-[0_18px_40px_-12px_rgba(19,27,22,0.35)]">
            <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-[12.5px] font-bold', dias < 0 ? 'bg-estado-problema text-superficie' : p.cobro ? 'bg-estado-bien-suave text-estado-bien-texto' : 'bg-estado-problema-suave text-estado-problema-texto')}>
              {estado}
              {dias < 0 ? (p.cobro ? ', sin cobrar' : ', sin pagar') : ''}
            </span>
            <p className="mt-2 text-[16px] leading-snug font-bold text-texto">
              {p.cobro ? 'Cobrás' : 'Pagás'}: {p.descripcion}
            </p>
            <p className={cn('t-numero mt-1', p.cobro ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>
              {p.cobro ? '+' : '−'}
              {`$${Math.round(p.monto).toLocaleString('es-AR')}`}
            </p>
            {fecha && <p className="mt-2 border-t border-borde pt-2 text-[14px] text-texto-suave">{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</p>}
            <p className="mt-2 text-[13px] font-bold text-principal">{p.cobro ? 'Tocá si ya lo cobraste' : 'Tocá si ya lo pagaste'}</p>
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

/**
 * Un cobro o un pago en la línea: la burbuja (tamaño = monto), su monto y su
 * nombre, en su carril (`enCarriles`): así nunca se pisan. Al pasar el mouse,
 * su detalle; al tocarla, «¿Lo pagaste?».
 */
function Burbuja({ p, hoy, tam, x, xb, eje, carril, onClick }: { p: PuntoPlata; hoy: Date; tam: number; x: number; xb: number; eje: number; carril: number; onClick: () => void }) {
  const arriba = p.cobro
  // Distancia del centro de la burbuja a la línea: el carril y, abajo, la fila de fechas.
  const desde = arriba ? 14 + carril * CARRIL : 34 + carril * CARRIL
  const centro = arriba ? eje - desde - CARRIL / 2 + 10 : eje + desde + CARRIL / 2 - 10
  const etiqueta = (
    <span className="flex flex-col items-center rounded-[8px] bg-superficie/90 px-1.5">
      <span className={cn('t-cifra-chica font-bold whitespace-nowrap', p.cobro ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>
        {p.cobro ? '+' : '−'}
        {plataCorta(p.monto)}
      </span>
      <span className="max-w-[118px] truncate text-[12.5px] text-texto-suave">{p.descripcion}</span>
    </span>
  )
  return (
    <>
      {/* El tallo, de la línea a la burbuja: queda debajo de todo. */}
      {/* El tallo: del día en la línea a la burbuja. Abajo arranca después de la fila de fechas (no las
          cruza); si la burbuja quedó corrida porque el día estaba ocupado, se dobla hasta ella. */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
        <polyline
          points={arriba ? `${x},${eje} ${x},${eje - 6} ${xb},${eje - 14} ${xb},${centro}` : `${x},${eje + 30} ${xb},${eje + 38} ${xb},${centro}`}
          fill="none"
          stroke="var(--borde)"
          strokeWidth={2}
        />
      </svg>
      <span aria-hidden className={cn('absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full', p.cobro ? 'bg-estado-bien' : 'bg-estado-problema')} style={{ left: x, top: eje + 1 }} />
      <ConDetalle p={p} hoy={hoy}>
        <button
          type="button"
          onClick={onClick}
          aria-label={`${p.cobro ? 'Cobro' : 'Pago'} de ${plataCorta(p.monto)}: ${p.descripcion}`}
          className="group absolute z-10 flex w-[124px] flex-col items-center gap-1"
          style={{ left: xb - 62, top: arriba ? centro - tam / 2 - 38 : centro - tam / 2, flexDirection: arriba ? 'column' : 'column-reverse' }}
        >
          {etiqueta}
          <span className={cn('rounded-full shadow-sm ring-2 ring-superficie transition-transform group-hover:scale-110', p.cobro ? 'bg-[color-mix(in_srgb,var(--estado-bien)_85%,var(--superficie))]' : 'bg-[color-mix(in_srgb,var(--estado-problema)_80%,var(--superficie))]')} style={{ width: tam, height: tam }} />
        </button>
      </ConDetalle>
    </>
  )
}

// ===== Clima =====

const DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function Clima({ lugar: actual }: { lugar: OpcionClima | null }) {
  const navigate = useNavigate()
  const clima = useClima(actual?.ubicacion ?? null)
  const pronostico = usePronostico(actual?.ubicacion ?? null)
  const lluvia = useLluviaDelMes(actual?.ubicacion ?? null)
  if (!actual) {
    return (
      <section className="flex h-full flex-col items-start justify-center gap-3 p-6">
        <h2 className={cn(T.titulo)}>El clima de tu campo</h2>
        <p className="text-[15px] text-texto-suave">Con el campo en el mapa, acá ves el pronóstico y la lluvia del último mes.</p>
        <BotonChico type="button" icono="Campos" onClick={() => navigate('/campos')}>
          Ver mis campos
        </BotonChico>
      </section>
    )
  }
  const dias = (pronostico.data ?? []).slice(1, 6)
  const escena = clima.data ? escenaDelClima(clima.data.code, clima.data.viento, clima.data.dia) : { cielo: 'sol' as const, ventoso: false }
  const ahora = new Date().getHours()
  return (
    <section id="clima" aria-label={`El clima en ${actual.nombre}`} className="flex h-full scroll-mt-6 flex-col">
      {/* El día de hoy se ve en la escena: cambia con el cielo, la lluvia y el viento. */}
      <EscenaClima cielo={escena.cielo} ventoso={escena.ventoso}>
        <p className="text-[15px] font-semibold">{actual.nombre}</p>
        <p className="cifra mt-1 text-[52px] leading-none font-semibold">{clima.data ? `${clima.data.temp}°` : '—'}</p>
        {clima.data && (
          <p className="mt-2 text-[15px] font-semibold">
            {clima.data.descripcion}
            {escena.ventoso ? ` · viento ${clima.data.viento} km/h` : ''}
          </p>
        )}
        {clima.data && (
          <p className="t-cifra-chica opacity-90">
            {ahora < 18 ? 'Hoy' : 'Hoy hasta la noche'} {clima.data.max}° / {clima.data.min}°
          </p>
        )}
      </EscenaClima>

      {/* Los próximos 5 días, en una franja */}
      <ul className="grid grid-cols-5 px-4 py-5">
        {dias.map((d) => (
          <DiaCorto key={d.fecha} d={d} />
        ))}
      </ul>

      <LluviaDelCampo mm={lluvia.data} />
    </section>
  )
}

/** Lo que llovió en el último mes, según el pronóstico (no se carga a mano). */
function LluviaDelCampo({ mm }: { mm: number | undefined }) {
  return (
    <div className="mt-auto flex items-center gap-3 border-t border-borde px-6 py-4">
      <span className="text-[#2779c4]">
        <Icono nombre="Lluvia" />
      </span>
      <p className="text-[14px] text-texto-suave">
        {mm === undefined ? (
          'Calculando la lluvia…'
        ) : (
          <>
            <b className={cn(T.numeroChico, 'text-texto')}>≈ {mm} mm</b> en 30 días
            <span className="block text-[13px]">Según el pronóstico para tu campo</span>
          </>
        )}
      </p>
    </div>
  )
}

/** Un día de la franja: el nombre, el ícono, la máxima y la mínima; la lluvia sólo si es probable. */
function DiaCorto({ d }: { d: DiaPronostico }) {
  const f = new Date(`${d.fecha}T12:00:00`)
  return (
    <li className="flex flex-col items-center gap-2">
      <span className={cn(T.texto, 'font-semibold text-texto-suave')}>{DIA_CORTO[f.getDay()]}</span>
      <IconoDia d={d} />
      <span className={cn(T.numeroChico, 'text-texto')}>{d.max}°</span>
      <span className="t-cifra text-texto-suave">{d.min}°</span>
      <span className="t-cifra-chica h-5 font-bold text-texto-suave">{d.lluviaProb >= 40 ? `${d.lluviaProb} %` : ''}</span>
    </li>
  )
}

/** El ícono del día con su color: sol trigo, nube gris, lluvia celeste, tormenta violeta, helada azul. */
function IconoDia({ d }: { d: DiaPronostico }) {
  const c = d.code
  const tono =
    c >= 95
      ? 'text-[#6a4c9c]'
      : (c >= 51 && c <= 67) || (c >= 80 && c <= 82)
        ? 'text-[#2779c4]'
        : (c >= 71 && c <= 77) || c === 85 || c === 86 || d.helada
          ? 'text-[#4a90c8]'
          : c <= 1
            ? 'text-[#d39b1c]'
            : 'text-texto-suave'
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center', tono)} title={d.descripcion}>
      <WmoIcon code={c} className="size-[28px]" />
    </span>
  )
}

// ===== Estructura del rodeo =====

const HEMBRA = 'bg-principal'
const MACHO = 'bg-[#7c8b69]'

function EstructuraDelRodeo({ cats, total, campo }: { cats: CategoriaConteo[]; total: number; campo: string | null }) {
  const navigate = useNavigate()
  const n = (c: CategoriaConteo['categoria']) => cats.find((x) => x.categoria === c)?.cabezas ?? 0
  const filas = [
    { etapa: 'Adultos', h: ['Vacas', n('vaca')], m: ['Toros', n('toro')] },
    { etapa: 'Recría', h: ['Vaquillonas', n('vaquillona')], m: ['Novillos', n('novillo')] },
    { etapa: 'Cría', h: ['Terneras', n('ternera')], m: ['Terneros', n('ternero')] },
  ] as const
  const hembras = filas.reduce((s, f) => s + f.h[1], 0)
  const machos = filas.reduce((s, f) => s + f.m[1], 0)
  // El rodeo es la hacienda vacuna; los caballos y ovejas se nombran aparte.
  const otras = cats.filter((c) => especiePorCategoria[c.categoria] !== 'bovino' && c.cabezas > 0)
  const max = Math.max(1, ...filas.flatMap((f) => [f.h[1], f.m[1]]))
  const vacas = n('vaca')
  const vientres = vacas + n('vaquillona')
  const bovinos = Math.max(1, hembras + machos)
  const toroVaca = n('toro') > 0 ? Math.round(vacas / n('toro')) : null
  const enRango = toroVaca !== null && toroVaca >= 20 && toroVaca <= 30
  const destete = vacas > 0 ? Math.round(((n('ternero') + n('ternera')) / vacas) * 100) : null

  return (
    <section className="flex h-full flex-col px-6 py-5" aria-labelledby="estructura">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="estructura" className={cn(T.titulo)}>
            Estructura del rodeo
          </h2>
          <p className={T.bajada}>Hembras y machos por edad, y cómo viene la cría.</p>
        </div>
        <BotonChico type="button" onClick={() => navigate('/hacienda')}>
          Ver hacienda
        </BotonChico>
      </div>
      {total === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-superficie-hundida text-texto-suave">
            <Icono nombre="Vaca" />
          </span>
          <p className="t-tarjeta text-texto">{campo ? `${campo} no tiene hacienda` : 'Todavía no hay hacienda'}</p>
          <p className="max-w-[340px] text-[14px] text-texto-suave">Cuando entren animales, acá ves cuántas vacas, toros y terneros hay, y cómo viene la cría.</p>
        </div>
      ) : (
        // Se reparte en todo el alto del panel (el clima de al lado manda la altura).
        <div className="flex flex-1 flex-col justify-evenly gap-6 pt-4">
          {/* La leyenda: el total y de qué color es cada lado. */}
          <p className="flex items-center justify-center gap-6 text-[15px] text-texto-suave">
            <span className="flex items-center gap-2">
              <span className={cn('size-3.5 rounded-[4px]', HEMBRA)} /> {hembras} hembras
            </span>
            <span className="t-numero text-texto">{hembras + machos} cabezas</span>
            <span className="flex items-center gap-2">
              <span className={cn('size-3.5 rounded-[4px]', MACHO)} /> {machos} machos
            </span>
          </p>
          {otras.length > 0 && (
            <p className="-mt-3 text-center text-[13.5px] text-texto-suave">
              Además: {otras.map((c) => `${c.cabezas} ${categoriaNombre(c.categoria, c.cabezas).toLocaleLowerCase('es')}`).join(', ')}
            </p>
          )}
          {/* Espejo: nombres afuera, números adentro junto a la barra, la etapa al medio. */}
          <div className="flex flex-col gap-4">
            {filas.map((f) => (
              <div key={f.etapa} className="grid grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)] items-center">
                <div className="flex items-center gap-3">
                  <span className="w-[108px] shrink-0 text-[16px] text-texto">{f.h[0]}</span>
                  <div className="flex h-10 flex-1 items-center justify-end gap-2.5">
                    <span className={cn('t-cifra font-bold', f.h[1] ? 'text-texto' : 'text-texto-suave/50')}>{f.h[1]}</span>
                    <div
                      className={cn('h-full rounded-l-[10px]', f.h[1] ? HEMBRA : 'bg-superficie-hundida')}
                      style={{ width: f.h[1] ? `${(f.h[1] / max) * 82}%` : 6 }}
                    />
                  </div>
                </div>
                <span className="text-center text-[13.5px] font-semibold text-texto-suave">{f.etapa}</span>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 flex-1 items-center gap-2.5">
                    <div
                      className={cn('h-full rounded-r-[10px]', f.m[1] ? MACHO : 'bg-superficie-hundida')}
                      style={{ width: f.m[1] ? `${(f.m[1] / max) * 82}%` : 6 }}
                    />
                    <span className={cn('t-cifra font-bold', f.m[1] ? 'text-texto' : 'text-texto-suave/50')}>{f.m[1]}</span>
                  </div>
                  <span className="w-[108px] shrink-0 text-right text-[16px] text-texto">{f.m[0]}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 border-t border-borde pt-5 text-center">
            <Indicador nombre="Vientres" valor={String(vientres)} nota={`${Math.round((vientres / bovinos) * 100)} % del rodeo`} />
            <Indicador
              nombre="Toro y vaca"
              valor={toroVaca === null ? '—' : `1 : ${toroVaca}`}
              nota={toroVaca === null ? 'Sin toros' : enRango ? 'En rango' : toroVaca > 30 ? 'Faltan toros' : 'Sobran toros'}
              alerta={toroVaca === null || !enRango}
            />
            <Indicador nombre="Destete" valor={destete === null ? '—' : `${destete} %`} nota="terneros por vaca" />
          </div>
        </div>
      )}
    </section>
  )
}

/** Un número del rodeo con su aclaración. El color sólo cuando algo está fuera de rango. */
function Indicador({ nombre, valor, nota, alerta = false }: { nombre: string; valor: string; nota: string; alerta?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-[14px] font-semibold text-texto-suave">{nombre}</p>
      <p className="t-numero text-texto">{valor}</p>
      <p className={cn('text-[14px]', alerta ? 'font-semibold text-estado-atencion-texto' : 'text-texto-suave')}>{nota}</p>
    </div>
  )
}
