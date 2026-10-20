import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { BotonChico } from '@/components/tropero/boton'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import lotes from '@/assets/tropero/lotes-del-campo.webp'
import { useAuth } from '@/features/auth/auth-context'
import { useCampoClima, type OpcionClima } from '@/features/cotizaciones/campo-clima'
import { useClima, usePronostico } from '@/features/cotizaciones/hooks'
import type { DiaPronostico } from '@/features/cotizaciones/api'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { WmoIcon } from '@/features/cotizaciones/wmo-icon'
import { categoriaNombre, especiePorCategoria } from '@/features/hacienda/labels'
import { cn } from '@/lib/utils'
import type { CategoriaConteo, Vencimiento } from '../api'
import { usePanoramaInicio } from '../hooks'
import { invalidarAvisos, useDeshacerMarca, useMarcarSenal } from '../marcar-senal'
import { useParaAtender } from '../para-atender-api'
import { delCampo, escenaDelClima, chipsDelDia, cosasParaHoy, franjasDelRodeo, lineaDePlata, plataCorta, proximos30, saludo, type Chip, type Cosa, type PuntoPlata } from './dia'
import { useCampoElegido, type CampoElegible } from '@/features/campos/campo-elegido'
import { QueCampo } from '@/features/campos/que-campo'
import { EscenaClima } from './escena-clima'
import { useGanadoCampania, useLluviaDelMes } from './use-dia'

const CURVA = [0.22, 1, 0.36, 1] as const
const TARJETA = 'rounded-[20px] border border-borde bg-superficie px-6 py-5'
/**
 * La escala del Inicio: todos los paneles usan estos tamaños, así un ajuste se
 * hace una vez y no panel por panel.
 */
const T = {
  /** Título de cada panel. */
  titulo: 'font-heading text-[19px] font-extrabold text-texto',
  /** La línea de «para qué sirve» debajo del título. */
  bajada: 'text-[14px] text-texto-suave',
  /** Nombres, filas y etiquetas dentro de un gráfico. */
  texto: 'text-[15px] text-texto',
  /** Fechas, aclaraciones y ejes. */
  chico: 'text-[13px] text-texto-suave',
  /** Un número destacado dentro de un panel. */
  numero: 'titulo-display leading-none tracking-[-0.02em]',
  /** Un número de fila (pronóstico, montos de una lista). */
  numeroChico: 'cifra text-[20px] leading-none font-bold',
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
  const cosas = cosasParaHoy(v.potreros, v.vencimientos, v.sinRecorrer)
  const crudo = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const nombre = crudo.charAt(0).toLocaleUpperCase('es-AR') + crudo.slice(1)
  const manana = pronostico.data?.[1]
  const chips = chipsDelDia({ cosas, vencimientos: v.vencimientos, lluviaManana: manana ? manana.lluviaProb : null })
  const entra = (i: number) =>
    reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.06, ease: CURVA } }

  return (
    <div className="mx-auto flex w-full max-w-[1104px] flex-col gap-5">
      <motion.div {...entra(0)}>
        <Cabecera titulo={saludo(new Date().getHours(), nombre)} chips={chips} campos={inicio.campos} elegido={inicio.elegido} elegir={inicio.elegir} />
      </motion.div>

      {/* Una sola franja, cuatro celdas: se lee como un tablero, no como cuatro cajas. */}
      <motion.div
        {...entra(1)}
        className="grid grid-cols-2 overflow-hidden rounded-[20px] border border-borde bg-superficie lg:grid-cols-4 [&>*]:border-borde max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(odd)]:border-r lg:[&>*+*]:border-l"
      >
        <PulsoHacienda total={v.totalCabezas} campos={campoId ? 1 : inicio.campos.length} cats={v.porCategoria} nacimientos={v.nacimientos} />
        <PulsoPlata vencimientos={v.vencimientos} ganado={ganado.data ?? null} />
        <PulsoLluvia lugar={lugar?.nombre ?? null} mm={lluvia.data ?? null} manana={manana ?? null} />
        <PulsoRecorrida ultima={v.ultimaRecorridaHace} potreros={v.potreros.length} sinRecorrer={v.sinRecorrer} />
      </motion.div>

      <motion.div {...entra(2)}>
        <ParaAtenderHoy cosas={cosas} empresaId={membresia?.empresa_id ?? ''} />
      </motion.div>

      {/* El campo hoy: el rodeo y el clima en un solo panel, divididos por una línea. */}
      <motion.div
        {...entra(3)}
        className="grid overflow-hidden rounded-[20px] border border-borde bg-superficie lg:grid-cols-[minmax(0,1fr)_360px]"
      >
        <EstructuraDelRodeo cats={v.porCategoria} total={v.totalCabezas} campo={inicio.elegido?.nombre ?? null} />
        <div className="border-borde max-lg:border-t lg:border-l">
          <Clima lugar={lugar} />
        </div>
      </motion.div>

      <motion.div {...entra(4)}>
        <LaPlata vencimientos={v.vencimientos} />
      </motion.div>
    </div>
  )
}

/** Ir a una sección del Inicio («#clima») o a otra pantalla («/agenda»). */
function useIr() {
  const navigate = useNavigate()
  return (destino: string) => {
    if (destino.startsWith('#')) document.getElementById(destino.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else navigate(destino)
  }
}

// ===== La cabecera: el saludo, lo importante en chips y los accesos =====

const CHIP: Record<Chip['tono'], string> = {
  problema: 'border border-borde bg-superficie text-texto',
  atencion: 'border border-borde bg-superficie text-texto',
  aviso: 'border border-borde bg-superficie text-texto',
  info: 'border border-borde bg-superficie text-texto',
  bien: 'border border-borde bg-superficie text-texto',
}
const PUNTO: Record<Chip['tono'], string> = {
  problema: 'bg-estado-problema',
  atencion: 'bg-estado-atencion',
  aviso: 'bg-acento-texto',
  info: 'bg-neutro-500',
  bien: 'bg-estado-bien',
}

function Cabecera({
  titulo,
  chips,
  campos,
  elegido,
  elegir,
}: {
  titulo: string
  chips: Chip[]
  campos: CampoElegible[]
  elegido: CampoElegible | null
  elegir: (id: string | null) => void
}) {
  const ir = useIr()
  return (
    <section className="relative isolate flex min-h-[112px] flex-wrap items-center gap-x-6 gap-y-4 overflow-hidden rounded-[20px] border border-borde bg-superficie px-7 py-5">
      {/* La ilustración de la 31 («Lotes y sombra de nube»), a la derecha, fundida con el fondo. */}
      <img src={lotes} alt="" className="absolute inset-y-0 right-0 -z-20 h-full w-[62%] object-cover object-[50%_35%]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,var(--superficie)_38%,color-mix(in_srgb,var(--superficie)_70%,transparent)_58%,transparent_85%)]" />
      <div className="min-w-0 flex-1">
        <h1 className="font-heading text-[28px] leading-tight font-extrabold tracking-[-0.02em] text-texto">{titulo}</h1>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => ir(c.destino)}
              className={cn('inline-flex h-7 items-center gap-2 rounded-full px-3 text-[13px] font-bold transition-transform hover:-translate-y-px', CHIP[c.tono])}
            >
              <span className={cn('size-2 rounded-full', PUNTO[c.tono])} />
              {c.texto}
            </button>
          ))}
        </div>
      </div>
      <QueCampo campos={campos} elegido={elegido} elegir={elegir} />
    </section>
  )
}

// ===== El pulso del campo: cuatro números, cada uno lleva a su lugar =====

const NUMERO = 'titulo-display text-[32px] leading-none tracking-[-0.02em] text-texto'

function Pulso({
  titulo,
  icono,
  destino,
  pie,
  children,
}: {
  titulo: string
  icono: NombreIcono
  destino: string
  pie: React.ReactNode
  children: React.ReactNode
}) {
  const ir = useIr()
  return (
    <button type="button" onClick={() => ir(destino)} className="group flex min-h-[128px] flex-col px-5 py-4 text-left transition-colors hover:bg-superficie-hundida/50">
      <span className="flex items-center gap-2 text-[13.5px] font-semibold text-texto-suave">
        <Icono nombre={icono} tamano={16} />
        {titulo}
        <span className="ml-auto text-principal opacity-0 transition-opacity group-hover:opacity-100">
          <Icono nombre="Siguiente" tamano={16} />
        </span>
      </span>
      <span className="mt-3 flex-1">{children}</span>
      <span className="mt-2 text-[13px] leading-snug text-texto-suave">{pie}</span>
    </button>
  )
}

function PulsoHacienda({ total, campos, cats, nacimientos }: { total: number; campos: number; cats: CategoriaConteo[]; nacimientos: number }) {
  const franjas = franjasDelRodeo(cats)
  return (
    <Pulso
      titulo="Hacienda"
      icono="Vaca"
      destino="/hacienda"
      pie={nacimientos > 0 ? <b className="text-texto">+{nacimientos} nacimientos sin caravana</b> : campos > 1 ? `En tus ${campos} campos` : 'Ver por potrero'}
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
      destino="/agenda"
      pie={
        vencidos.length > 0 ? (
          <b className="text-estado-problema-texto">
            {vencidos.length === 1 ? '1 vencido' : `${vencidos.length} vencidos`}
            {deuda > 0 ? ` · ${plataCorta(deuda)}` : ''}
          </b>
        ) : ganado !== null && ganado !== 0 ? (
          `Desde julio: ${plataCorta(ganado, true)}`
        ) : (
          'Nada vencido'
        )
      }
    >
      <span className={cn(NUMERO, p30 < 0 ? 'text-estado-problema-texto' : 'text-texto')}>
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
      destino="#clima"
      pie={manana ? (manana.lluviaProb >= 40 ? <b className="text-texto">Mañana {manana.lluviaProb} % de lluvia</b> : `Mañana ${manana.max}°, sin lluvia`) : 'Pronóstico abajo'}
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
  return (
    <Pulso
      titulo="Última recorrida"
      icono="Recorrida"
      destino="#para-atender"
      pie={
        potreros > 0 ? (
          <b className="text-estado-problema-texto">Dejó {potreros} {potreros === 1 ? 'potrero' : 'potreros'} para mirar</b>
        ) : sinRecorrer.length > 0 ? (
          `${sinRecorrer[0]!.campo} sin recorrer`
        ) : (
          'Todo en orden'
        )
      }
    >
      {ultima === null || ultima <= 1 ? (
        <span className={NUMERO}>{ultima === null ? 'Nunca' : ultima === 0 ? 'Hoy' : 'Ayer'}</span>
      ) : (
        <span className="flex items-baseline gap-2">
          <span className="text-[14px] font-semibold text-texto-suave">hace</span>
          <span className={NUMERO}>{ultima}</span>
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
            <p className="font-heading text-[17px] font-extrabold text-texto">Todo en orden</p>
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
  const navigate = useNavigate()
  const t = TONO[c.tono]
  return (
    <article className="flex flex-col p-6">
      <div className="flex items-center gap-3">
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-[14px]', t.icono)}>
          <Icono nombre={c.icono} />
        </span>
        <span className="text-[13px] font-bold tracking-[0.02em] text-texto-suave uppercase">Lo primero</span>
      </div>
      <p className="mt-4 truncate font-heading text-[36px] leading-none font-extrabold tracking-[-0.02em] text-texto">{c.lugar}</p>
      <p className="mt-2 text-[17px] leading-snug font-semibold text-texto">{c.que}</p>
      <p className={cn('mt-1 text-[14px] font-semibold', t.dato)}>{c.datos.join(' · ')}</p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(c.accion.to)}
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
  const navigate = useNavigate()
  const t = TONO[c.tono]
  return (
    <article className="flex flex-wrap items-center gap-x-5 gap-y-3 px-6 py-5">
      <span className={cn('grid size-12 shrink-0 place-items-center rounded-[14px]', t.icono)}>
        <Icono nombre={c.icono} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] text-texto">
          <b className="font-heading text-[22px] font-extrabold tracking-[-0.01em]">{c.lugar}</b>
          <span className="text-texto-suave"> · </span>
          <span className="font-semibold">{c.que}</span>
        </p>
        <p className={cn('text-[14px] font-semibold', t.dato)}>{c.datos.join(' · ')}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {c.senal && <SeSoluciono senal={c.senal} empresaId={empresaId} />}
        <button
          type="button"
          onClick={() => navigate(c.accion.to)}
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
  const navigate = useNavigate()
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
      <BotonChico type="button" onClick={() => navigate(c.accion.to)}>
        {c.accion.texto.replace(' el potrero', '')}
      </BotonChico>
    </li>
  )
}

/** «Se solucionó»: marca la señal de la recorrida. Queda confirmada con «Deshacer»; la lista se refresca después. */
function SeSoluciono({ senal, empresaId, compacto = false }: { senal: NonNullable<Cosa['senal']>; empresaId: string; compacto?: boolean }) {
  const qc = useQueryClient()
  const marcar = useMarcarSenal()
  const deshacer = useDeshacerMarca()
  const [marca, setMarca] = useState<string | null>(null)
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

function LaPlata({ vencimientos }: { vencimientos: Vencimiento[] }) {
  const navigate = useNavigate()
  const l = lineaDePlata(vencimientos, HORIZONTE)
  const hoy = new Date()
  const fechaDe = (dia: number) => {
    const d = new Date(hoy)
    d.setDate(d.getDate() + dia)
    return `${d.getDate()} ${MES[d.getMonth()]}`
  }
  // Tamaño por monto (área ∝ plata), entre 20 y 72 px.
  const maxFuturo = Math.max(1, ...l.futuros.map((p) => p.monto))
  const tam = (m: number) => 20 + 52 * Math.sqrt(m / maxFuturo)
  // Dos niveles de etiqueta para que no se pisen las que caen cerca.
  const nivel = (lista: PuntoPlata[]) => {
    const orden = [...lista].sort((a, b) => a.dia - b.dia)
    return new Map(orden.map((p, i) => [p.id, i > 0 && p.dia - orden[i - 1]!.dia < 6 && i % 2 === 1 ? 1 : 0]))
  }
  const nivelArriba = nivel(l.futuros.filter((p) => p.cobro))
  const nivelAbajo = nivel(l.futuros.filter((p) => !p.cobro))
  const vacio = l.futuros.length === 0 && l.vencidos.length === 0
  // Lo vencido no es todo pérdida: lo que no se pagó y lo que no se cobró van separados.
  const sinPagar = l.vencidos.filter((p) => !p.cobro).reduce((t, p) => t + p.monto, 0)
  const sinCobrar = l.vencidos.filter((p) => p.cobro).reduce((t, p) => t + p.monto, 0)

  return (
    <section className={TARJETA} aria-labelledby="la-plata">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="la-plata" className={cn(T.titulo)}>
            La plata de los próximos 30 días
          </h2>
          <p className={T.bajada}>Arriba lo que entra, abajo lo que sale. El tamaño es el monto.</p>
        </div>
        <BotonChico type="button" onClick={() => navigate('/agenda')}>
          Ver en Agenda
        </BotonChico>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-3">
        <Cifra nombre="Entra" valor={plataCorta(l.entra)} clase="text-texto" />
        <Cifra nombre="Sale" valor={plataCorta(-l.sale)} clase="text-texto" />
        <Cifra nombre="Queda" valor={plataCorta(l.queda, true)} clase={l.queda >= 0 ? 'text-texto' : 'text-estado-problema-texto'} grande />
        {sinPagar > 0 && <span className="mb-1 rounded-full bg-estado-problema-suave px-3.5 py-1.5 text-[14px] font-bold text-estado-problema-texto">{plataCorta(sinPagar)} vencido sin pagar</span>}
        {sinCobrar > 0 && <span className="mb-1 rounded-full bg-estado-bien-suave px-3.5 py-1.5 text-[14px] font-bold text-estado-bien-texto">{plataCorta(sinCobrar)} vencido sin cobrar</span>}
      </div>

      {vacio ? (
        <p className="mt-6 rounded-[14px] bg-superficie-hundida/60 px-5 py-4 text-[15px] text-texto-suave">Nada por cobrar ni por pagar en los próximos 30 días.</p>
      ) : (
        <div className="relative mt-6 h-[290px]">
          {/* Lo vencido, antes de hoy */}
          {/* Lo vencido no tiene lugar en la línea: va en lista, de lo más grande a lo más chico */}
          <div className="absolute inset-y-0 left-0 flex flex-col gap-1.5 rounded-[12px] bg-superficie-hundida/70 px-3 py-3" style={{ width: VENCIDO - 12 }}>
            <p className="text-[14px] font-bold text-texto">Vencido</p>
            {l.vencidos.length === 0 ? (
              <p className="text-[13px] text-texto-suave">Nada</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {[...l.vencidos]
                  .sort((x, y) => y.monto - x.monto)
                  .slice(0, 4)
                  .map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => navigate('/agenda')} className="flex w-full flex-col items-start rounded-[8px] px-1.5 py-1 text-left hover:bg-superficie/70" aria-label={`${p.cobro ? 'Cobro' : 'Pago'} vencido de ${plataCorta(p.monto)}: ${p.descripcion}`}>
                        <span className={cn('flex items-center gap-1.5 text-[15px] leading-tight font-bold', p.cobro ? 'text-estado-bien-texto' : 'text-estado-problema-texto')}>
                          <span className={cn('size-2 shrink-0 rounded-full', p.cobro ? 'bg-salvia' : 'bg-estado-problema')} aria-hidden />
                          <span className="cifra">
                            {p.cobro ? '+' : '−'}
                            {plataCorta(p.monto)}
                          </span>
                          <span className="text-[11.5px] font-semibold">{p.cobro ? 'sin cobrar' : 'sin pagar'}</span>
                        </span>
                        <span className="w-full truncate text-[12.5px] text-texto-suave">{p.descripcion}</span>
                      </button>
                    </li>
                  ))}
                {l.vencidos.length > 4 && <li className="px-1.5 text-[12.5px] font-semibold text-texto-suave">y {l.vencidos.length - 4} más</li>}
              </ul>
            )}
          </div>
          {/* El eje: hoy → 30 días */}
          <div className="absolute top-1/2 right-0 h-[2px] -translate-y-1/2 bg-borde" style={{ left: VENCIDO }} />
          {[0, 7, 14, 21, 30].map((d) => (
            <span
              key={d}
              className="absolute top-1/2 -translate-x-1/2 translate-y-2.5 text-[14px] font-semibold whitespace-nowrap text-texto-suave"
              style={{ left: `calc(${VENCIDO}px + (100% - ${VENCIDO + 38}px) * ${d / HORIZONTE} + 16px)` }}
            >
              {d === 0 ? 'Hoy' : fechaDe(d)}
            </span>
          ))}
          {l.futuros.map((p) => (
            <Burbuja
              key={p.id}
              p={p}
              tam={tam(p.monto)}
              izquierda={`calc(${VENCIDO}px + (100% - ${VENCIDO + 38}px) * ${p.dia / HORIZONTE} + 16px)`}
              arriba={p.cobro}
              nivel={(p.cobro ? nivelArriba : nivelAbajo).get(p.id) ?? 0}
              onClick={() => navigate('/agenda')}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function Cifra({ nombre, valor, clase, grande = false }: { nombre: string; valor: string; clase: string; grande?: boolean }) {
  return (
    <div>
      <p className="text-[14px] font-semibold text-texto-suave">{nombre}</p>
      <p className={cn('titulo-display leading-none tracking-[-0.02em]', grande ? 'text-[38px]' : 'text-[28px]', clase)}>{valor}</p>
    </div>
  )
}

/** Un cobro o un pago en la línea: la burbuja (tamaño = monto) y su etiqueta corta. */
function Burbuja({
  p,
  tam,
  izquierda,
  arriba,
  nivel,
  onClick,
}: {
  p: PuntoPlata
  tam: number
  izquierda: string
  arriba: boolean
  nivel: number
  onClick: () => void
}) {
  const color = p.cobro ? 'bg-salvia' : 'bg-principal'
  const tallo = 20 + nivel * 44
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${p.cobro ? 'Cobro' : 'Pago'} de ${plataCorta(p.monto)}: ${p.descripcion}`}
      className="group absolute top-1/2 flex flex-col items-center"
      style={{ left: izquierda, transform: `translate(-50%, ${arriba ? `calc(-100% - 1px)` : '1px'})`, flexDirection: arriba ? 'column' : 'column-reverse' }}
    >
      <span className="flex flex-col items-center" style={{ flexDirection: arriba ? 'column' : 'column-reverse' }}>
        <span className={'cifra text-[15px] font-bold whitespace-nowrap text-texto'}>
          {p.cobro ? '+' : '−'}
          {plataCorta(p.monto)}
        </span>
        <span className={'max-w-[150px] truncate text-[13px] text-texto-suave'}>{p.descripcion}</span>
      </span>
      <span className={cn('my-1 rounded-full opacity-90 shadow-sm transition-transform group-hover:scale-110', color)} style={{ width: tam, height: tam }} />
      <span className="w-[2px] bg-borde" style={{ height: tallo }} />
    </button>
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
          <p className="cifra text-[14px] opacity-90">
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
      <span className="cifra text-[16px] leading-none text-texto-suave">{d.min}°</span>
      <span className="cifra h-5 text-[15px] font-bold text-texto-suave">{d.lluviaProb >= 40 ? `${d.lluviaProb} %` : ''}</span>
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
          <p className="font-heading text-[17px] font-extrabold text-texto">{campo ? `${campo} no tiene hacienda` : 'Todavía no hay hacienda'}</p>
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
            <span className="titulo-display text-[28px] text-texto">{hembras + machos} cabezas</span>
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
                    <span className={cn('cifra text-[22px] font-bold', f.h[1] ? 'text-texto' : 'text-texto-suave/50')}>{f.h[1]}</span>
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
                    <span className={cn('cifra text-[22px] font-bold', f.m[1] ? 'text-texto' : 'text-texto-suave/50')}>{f.m[1]}</span>
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
      <p className="titulo-display text-[36px] leading-none text-texto">{valor}</p>
      <p className={cn('text-[14px]', alerta ? 'font-semibold text-estado-atencion-texto' : 'text-texto-suave')}>{nota}</p>
    </div>
  )
}
