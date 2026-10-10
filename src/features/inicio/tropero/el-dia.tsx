import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { BotonChico } from '@/components/tropero/boton'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { CargarDialog } from '@/features/analitica/cargar-dialog'
import lotes from '@/assets/tropero/lotes-del-campo.webp'
import { useAuth } from '@/features/auth/auth-context'
import { useCampoClima } from '@/features/cotizaciones/campo-clima'
import { useClima, usePronostico } from '@/features/cotizaciones/hooks'
import type { DiaPronostico } from '@/features/cotizaciones/api'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useMapa } from '@/features/mapa/api'
import { cn } from '@/lib/utils'
import cielo from '@/assets/tropero/molino/cielo.svg'
import campoMolino from '@/assets/tropero/molino/campo.svg'
import rueda from '@/assets/tropero/molino/rueda.svg'
import type { CategoriaConteo, Vencimiento } from '../api'
import { usePanoramaInicio } from '../hooks'
import { invalidarAvisos, useDeshacerMarca, useMarcarSenal } from '../marcar-senal'
import { useParaAtender } from '../para-atender-api'
import { chipsDelDia, cosasParaHoy, franjasDelRodeo, lineaDePlata, plataCorta, proximos30, saludo, type Chip, type Cosa, type PuntoPlata } from './dia'
import { useGanadoCampania, useLluvia60 } from './use-dia'

const CURVA = [0.22, 1, 0.36, 1] as const
const TARJETA = 'rounded-[18px] border border-borde bg-superficie p-6'

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
  const { data: campos } = useMapa(membresia?.empresa_id)
  const { actual } = useCampoClima()
  const clima = useClima(actual?.ubicacion ?? null)
  const pronostico = usePronostico(actual?.ubicacion ?? null)
  const lluvia = useLluvia60(actual?.id ?? null)
  const ganado = useGanadoCampania()
  const reducir = useReducedMotion()

  if (panorama.isLoading || atender.isLoading) return <div className="h-[132px] animate-pulse rounded-[22px] bg-superficie-hundida" aria-busy />
  if (panorama.error || !panorama.data) return <p className="text-texto-suave">No pudimos cargar el Inicio. Revisá la conexión y probá de nuevo.</p>

  const p = panorama.data
  const a = atender.data
  const cosas = cosasParaHoy(a?.potreros ?? [], p.vencimientos, a?.sinRecorrer ?? [])
  const crudo = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const nombre = crudo.charAt(0).toLocaleUpperCase('es-AR') + crudo.slice(1)
  const manana = pronostico.data?.[1]
  const chips = chipsDelDia({ cosas, vencimientos: p.vencimientos, lluviaManana: manana ? manana.lluviaProb : null })
  const entra = (i: number) =>
    reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.06, ease: CURVA } }

  return (
    <div className="mx-auto flex w-full max-w-[1104px] flex-col gap-6">
      <motion.div {...entra(0)}>
        <Cabecera titulo={saludo(new Date().getHours(), nombre)} chips={chips} empresaId={membresia?.empresa_id ?? ''} />
      </motion.div>

      {/* Una sola franja, cuatro celdas: se lee como un tablero, no como cuatro cajas. */}
      <motion.div
        {...entra(1)}
        className="grid grid-cols-2 overflow-hidden rounded-[20px] border border-borde bg-superficie lg:grid-cols-4 [&>*]:border-borde max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(odd)]:border-r lg:[&>*+*]:border-l"
      >
        <PulsoHacienda total={p.totalCabezas} campos={campos?.length ?? 0} cats={p.porCategoria} nacimientos={(a?.nacimientos ?? []).reduce((s, n) => s + n.total, 0)} />
        <PulsoPlata vencimientos={p.vencimientos} ganado={ganado.data ?? null} />
        <PulsoLluvia lugar={actual?.nombre ?? null} mm={lluvia.data?.total ?? null} temp={clima.data?.temp ?? null} manana={manana ?? null} />
        <PulsoRecorrida ultima={a?.ultimaRecorridaHace ?? null} potreros={a?.potreros.length ?? 0} sinRecorrer={a?.sinRecorrer ?? []} />
      </motion.div>

      <motion.div {...entra(2)} className="mt-3">
        <ParaAtenderHoy cosas={cosas} empresaId={membresia?.empresa_id ?? ''} />
      </motion.div>

      <motion.div {...entra(3)} className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <EstructuraDelRodeo cats={p.porCategoria} total={p.totalCabezas} />
        <Clima />
      </motion.div>

      <motion.div {...entra(4)}>
        <LaPlata vencimientos={p.vencimientos} />
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
  problema: 'bg-estado-problema-suave text-estado-problema-texto',
  atencion: 'bg-estado-atencion-suave text-estado-atencion-texto',
  aviso: 'bg-acento/40 text-acento-texto',
  info: 'bg-[#e1ebf2] text-[#215a7e]',
  bien: 'bg-estado-bien-suave text-estado-bien-texto',
}
const PUNTO: Record<Chip['tono'], string> = {
  problema: 'bg-estado-problema',
  atencion: 'bg-estado-atencion',
  aviso: 'bg-acento-texto',
  info: 'bg-[#2779c4]',
  bien: 'bg-estado-bien',
}

function Cabecera({ titulo, chips, empresaId }: { titulo: string; chips: Chip[]; empresaId: string }) {
  const ir = useIr()
  const navigate = useNavigate()
  const acceso =
    'inline-flex h-11 items-center gap-2 rounded-full bg-superficie px-4 text-[14.5px] font-bold text-texto shadow-[0_2px_10px_rgba(19,27,22,0.12)] transition-transform hover:-translate-y-px'
  return (
    <section className="relative isolate flex min-h-[132px] items-center gap-6 overflow-hidden rounded-[22px] border border-borde bg-superficie px-8 py-6">
      {/* La ilustración de la 31 («Lotes y sombra de nube»), a la derecha, fundida con el fondo. */}
      <img src={lotes} alt="" className="absolute inset-y-0 right-0 -z-20 h-full w-[62%] object-cover object-[50%_35%]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,var(--superficie)_38%,color-mix(in_srgb,var(--superficie)_70%,transparent)_58%,transparent_85%)]" />
      <div className="min-w-0 flex-1">
        <h1 className="font-heading text-[34px] leading-tight font-extrabold tracking-[-0.02em] text-texto">{titulo}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => ir(c.destino)}
              className={cn('inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13.5px] font-bold transition-transform hover:-translate-y-px', CHIP[c.tono])}
            >
              <span className={cn('size-2 rounded-full', PUNTO[c.tono])} />
              {c.texto}
            </button>
          ))}
        </div>
      </div>
      <div className="hidden shrink-0 flex-wrap justify-end gap-2.5 md:flex">
        <CargarDialog
          empresaId={empresaId}
          renderTrigger={(abrir) => (
            <button type="button" onClick={abrir} disabled={!empresaId} className={acceso}>
              <Icono nombre="Plata" tamano={16} /> Anotar un gasto
            </button>
          )}
        />
        <button type="button" onClick={() => navigate('/agenda')} className={acceso}>
          <Icono nombre="Agenda" tamano={16} /> Agenda
        </button>
        <button type="button" onClick={() => navigate('/campo')} className={cn(acceso, 'bg-principal text-principal-texto')}>
          <Icono nombre="Celular" tamano={16} /> Modo Campo
        </button>
      </div>
    </section>
  )
}

// ===== El pulso del campo: cuatro números, cada uno lleva a su lugar =====

const NUMERO = 'titulo-display text-[40px] leading-none tracking-[-0.02em] text-texto'

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
    <button type="button" onClick={() => ir(destino)} className="group flex min-h-[150px] flex-col p-6 text-left transition-colors hover:bg-superficie-hundida/50">
      <span className="flex items-center gap-2 text-[14px] font-semibold text-texto-suave">
        <Icono nombre={icono} tamano={16} />
        {titulo}
        <span className="ml-auto text-principal opacity-0 transition-opacity group-hover:opacity-100">
          <Icono nombre="Siguiente" tamano={16} />
        </span>
      </span>
      <span className="mt-3 flex-1">{children}</span>
      <span className="mt-2 text-[13.5px] leading-snug text-texto-suave">{pie}</span>
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
      pie={nacimientos > 0 ? <b className="text-estado-bien-texto">+{nacimientos} nacimientos sin caravana</b> : campos > 1 ? `En ${campos} campos` : 'Ver por potrero'}
    >
      <span className="flex items-baseline gap-2">
        <span className={NUMERO}>{total.toLocaleString('es-AR')}</span>
        <span className="text-[15px] font-semibold text-texto-suave">cabezas</span>
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
      <span className={cn(NUMERO, p30 > 0 ? 'text-estado-bien' : p30 < 0 ? 'text-estado-problema-texto' : 'text-texto')}>
        {p30 === 0 ? '$0' : plataCorta(p30, true)}
      </span>
      <span className="mt-1 block truncate text-[13px] text-texto-suave">cobros menos pagos</span>
    </Pulso>
  )
}

function PulsoLluvia({ lugar, mm, temp, manana }: { lugar: string | null; mm: number | null; temp: number | null; manana: DiaPronostico | null }) {
  return (
    <Pulso
      titulo={lugar ? `Lluvia en ${lugar}` : 'Lluvia'}
      icono="Lluvia"
      destino="#clima"
      pie={manana ? (manana.lluviaProb >= 40 ? <b className="text-[#215a7e]">Mañana {manana.lluviaProb} % de lluvia</b> : `Mañana ${manana.max}°, sin lluvia`) : 'Pronóstico abajo'}
    >
      <span className="flex items-baseline gap-2">
        <span className={NUMERO}>{mm === null ? '—' : Math.round(mm)}</span>
        <span className="text-[15px] font-semibold text-texto-suave">mm</span>
      </span>
      <span className="mt-1 block truncate text-[13px] text-texto-suave">en 60 días{temp !== null ? ` · ahora ${temp}°` : ''}</span>
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
          <span className="text-[15px] font-semibold text-texto-suave">hace</span>
          <span className={NUMERO}>{ultima}</span>
          <span className="text-[15px] font-semibold text-texto-suave">días</span>
        </span>
      )}
    </Pulso>
  )
}

// ===== Para atender hoy: tarjetas que se entienden sin leer =====

const TONO = {
  problema: { borde: 'border-estado-problema/45', fondo: 'bg-estado-problema-suave/50', icono: 'bg-estado-problema text-superficie', dato: 'text-estado-problema-texto' },
  atencion: { borde: 'border-estado-atencion/45', fondo: 'bg-superficie', icono: 'bg-estado-atencion text-superficie', dato: 'text-estado-atencion-texto' },
  aviso: { borde: 'border-borde', fondo: 'bg-superficie', icono: 'bg-acento text-acento-texto', dato: 'text-texto-suave' },
} as const

function ParaAtenderHoy({ cosas, empresaId }: { cosas: Cosa[]; empresaId: string }) {
  const [primera, ...resto] = cosas
  return (
    <section id="para-atender" aria-labelledby="atender-hoy" className="scroll-mt-6">
      <h2 id="atender-hoy" className="mb-3 font-heading text-[20px] font-extrabold text-texto">
        Para atender hoy
      </h2>
      {!primera ? (
        <div className="flex items-center gap-4 rounded-[20px] border border-estado-bien/30 bg-estado-bien-suave px-6 py-5">
          <span className="grid size-12 place-items-center rounded-full bg-estado-bien text-superficie">
            <Icono nombre="Guardar" />
          </span>
          <div>
            <p className="font-heading text-[19px] font-extrabold text-estado-bien-texto">Todo en orden</p>
            <p className="text-[14px] text-estado-bien-texto">Lo que deje la recorrida o venza en la agenda aparece acá.</p>
          </div>
        </div>
      ) : (
        // Un solo panel con jerarquía: lo primero en grande, lo demás en filas.
        <div className={cn('overflow-hidden rounded-[20px] border border-borde bg-superficie', resto.length > 0 && 'lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]')}>
          <Destacada c={primera} empresaId={empresaId} />
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
    <article className={cn('flex flex-col p-7', t.fondo)}>
      <div className="flex items-center gap-3">
        <span className={cn('grid size-14 shrink-0 place-items-center rounded-[16px]', t.icono)}>
          <Icono nombre={c.icono} />
        </span>
        <span className={cn('rounded-full px-3 py-1 text-[12.5px] font-bold', c.tono === 'problema' ? 'bg-estado-problema text-superficie' : 'bg-estado-atencion-suave text-estado-atencion-texto')}>
          Lo primero
        </span>
      </div>
      <p className="mt-5 truncate font-heading text-[44px] leading-none font-extrabold tracking-[-0.02em] text-texto">{c.lugar}</p>
      <p className="mt-2 text-[19px] leading-snug font-semibold text-texto">{c.que}</p>
      <p className={cn('mt-1 text-[14.5px] font-semibold', t.dato)}>{c.datos.join(' · ')}</p>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(c.accion.to)}
          className="inline-flex h-11 items-center gap-2.5 rounded-full bg-principal py-1 pr-1 pl-5 text-[15px] font-bold text-principal-texto hover:bg-terracota-600"
        >
          {c.accion.texto}
          <span className="grid size-9 place-items-center rounded-full bg-acento text-acento-texto">
            <Icono nombre="Siguiente" tamano={16} />
          </span>
        </button>
        {c.senal && <SeSoluciono senal={c.senal} empresaId={empresaId} />}
      </div>
    </article>
  )
}

/** El resto: una fila compacta con el color de la urgencia a la izquierda. */
function FilaCosa({ c, empresaId }: { c: Cosa; empresaId: string }) {
  const navigate = useNavigate()
  const t = TONO[c.tono]
  return (
    <li className="flex items-center gap-4 px-6 py-4">
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-[12px]', t.icono)}>
        <Icono nombre={c.icono} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] text-texto">
          <b className="font-heading font-extrabold">{c.lugar}</b>
          <span className="text-texto-suave"> · </span>
          <span className="font-semibold">{c.que}</span>
        </p>
        <p className={cn('text-[13.5px] font-semibold', t.dato)}>{c.datos.join(' · ')}</p>
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
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full text-[14px] font-bold text-texto-suave hover:bg-superficie-hundida disabled:opacity-50',
        compacto ? 'size-9 border border-borde' : 'px-3 py-[7px]',
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

function LaPlata({ vencimientos }: { vencimientos: Vencimiento[] }) {
  const navigate = useNavigate()
  const l = lineaDePlata(vencimientos, HORIZONTE)
  const hoy = new Date()
  const fechaDe = (dia: number) => {
    const d = new Date(hoy)
    d.setDate(d.getDate() + dia)
    return `${d.getDate()} ${MES[d.getMonth()]}`
  }
  // Tamaño por monto (área ∝ plata), entre 14 y 52 px.
  const tam = (m: number) => 14 + 38 * Math.sqrt(m / l.maximo)
  // Dos niveles de etiqueta para que no se pisen las que caen cerca.
  const nivel = (lista: PuntoPlata[]) => {
    const orden = [...lista].sort((a, b) => a.dia - b.dia)
    return new Map(orden.map((p, i) => [p.id, i > 0 && p.dia - orden[i - 1]!.dia < 6 && i % 2 === 1 ? 1 : 0]))
  }
  const nivelArriba = nivel(l.futuros.filter((p) => p.cobro))
  const nivelAbajo = nivel(l.futuros.filter((p) => !p.cobro))
  const vacio = l.futuros.length === 0 && l.vencidos.length === 0

  return (
    <section className={TARJETA} aria-labelledby="la-plata">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="la-plata" className="font-heading text-[20px] font-extrabold text-texto">
            La plata de los próximos 30 días
          </h2>
          <p className="text-[13.5px] text-texto-suave">Arriba lo que entra, abajo lo que sale. El tamaño es el monto.</p>
        </div>
        <BotonChico type="button" onClick={() => navigate('/agenda')}>
          Ver en Agenda
        </BotonChico>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-3">
        <Cifra nombre="Entra" valor={plataCorta(l.entra)} clase="text-estado-bien" />
        <Cifra nombre="Sale" valor={plataCorta(-l.sale)} clase="text-principal" />
        <Cifra nombre="Queda" valor={plataCorta(l.queda, true)} clase={l.queda >= 0 ? 'text-texto' : 'text-estado-problema-texto'} grande />
        {l.vencidos.length > 0 && (
          <span className="mb-1 rounded-full bg-estado-problema-suave px-3 py-1.5 text-[13.5px] font-bold text-estado-problema-texto">
            {plataCorta(l.vencido)} vencido sin pagar
          </span>
        )}
      </div>

      {vacio ? (
        <p className="mt-6 rounded-[14px] bg-superficie-hundida/60 px-5 py-4 text-[15px] text-texto-suave">Nada por cobrar ni por pagar en los próximos 30 días.</p>
      ) : (
        <div className="relative mt-6 h-[230px]">
          {/* Lo vencido, antes de hoy */}
          <div className="absolute inset-y-0 left-0 w-[112px] rounded-[12px] bg-estado-problema-suave/45">
            <p className="pt-2 text-center text-[11.5px] font-bold text-estado-problema-texto">Vencido</p>
          </div>
          {/* El eje: hoy → 30 días */}
          <div className="absolute top-1/2 right-0 left-[112px] h-[2px] -translate-y-1/2 bg-borde" />
          {[0, 7, 14, 21, 30].map((d) => (
            <span
              key={d}
              className="absolute top-1/2 -translate-x-1/2 translate-y-2 text-[11.5px] font-semibold whitespace-nowrap text-texto-suave"
              style={{ left: `calc(112px + (100% - 150px) * ${d / HORIZONTE} + 16px)` }}
            >
              {d === 0 ? 'Hoy' : fechaDe(d)}
            </span>
          ))}
          {l.vencidos.map((p, i) => (
            <Burbuja key={p.id} p={p} tam={tam(p.monto)} izquierda="56px" arriba={p.cobro} nivel={i % 2} vencido onClick={() => navigate('/agenda')} />
          ))}
          {l.futuros.map((p) => (
            <Burbuja
              key={p.id}
              p={p}
              tam={tam(p.monto)}
              izquierda={`calc(112px + (100% - 150px) * ${p.dia / HORIZONTE} + 16px)`}
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
      <p className="text-[13px] font-semibold text-texto-suave">{nombre}</p>
      <p className={cn('titulo-display leading-none tracking-[-0.02em]', grande ? 'text-[40px]' : 'text-[28px]', clase)}>{valor}</p>
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
  vencido = false,
  onClick,
}: {
  p: PuntoPlata
  tam: number
  izquierda: string
  arriba: boolean
  nivel: number
  vencido?: boolean
  onClick: () => void
}) {
  const color = vencido ? 'bg-estado-problema' : p.cobro ? 'bg-estado-bien' : 'bg-principal'
  const tallo = 18 + nivel * 34
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${p.cobro ? 'Cobro' : 'Pago'} de ${plataCorta(p.monto)}: ${p.descripcion}`}
      className="group absolute top-1/2 flex flex-col items-center"
      style={{ left: izquierda, transform: `translate(-50%, ${arriba ? `calc(-100% - 1px)` : '1px'})`, flexDirection: arriba ? 'column' : 'column-reverse' }}
    >
      <span className="flex flex-col items-center" style={{ flexDirection: arriba ? 'column' : 'column-reverse' }}>
        <span className={cn('cifra text-[13px] font-bold whitespace-nowrap', vencido ? 'text-estado-problema-texto' : p.cobro ? 'text-estado-bien' : 'text-principal')}>
          {p.cobro ? '+' : '−'}
          {plataCorta(p.monto)}
        </span>
        <span className={cn('truncate text-[11.5px] text-texto-suave', vencido ? 'max-w-[100px]' : 'max-w-[120px]')}>{p.descripcion}</span>
      </span>
      <span className={cn('my-1 rounded-full opacity-90 shadow-sm transition-transform group-hover:scale-110', color)} style={{ width: tam, height: tam }} />
      <span className="w-[2px] bg-borde" style={{ height: tallo }} />
    </button>
  )
}

// ===== Clima =====

const DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function Clima() {
  const { actual } = useCampoClima()
  const navigate = useNavigate()
  const clima = useClima(actual?.ubicacion ?? null)
  const pronostico = usePronostico(actual?.ubicacion ?? null)
  const lluvia = useLluvia60(actual?.id ?? null)
  const reducir = useReducedMotion()
  if (!actual) {
    return (
      <section className={cn(TARJETA, 'flex flex-col items-start justify-center gap-3')}>
        <h2 className="font-heading text-[20px] font-extrabold text-texto">El clima de tu campo</h2>
        <p className="text-[15px] text-texto-suave">Con el campo en el mapa, acá ves el pronóstico y la lluvia de los últimos dos meses.</p>
        <BotonChico type="button" icono="Campos" onClick={() => navigate('/campos')}>
          Ver mis campos
        </BotonChico>
      </section>
    )
  }
  const dias = (pronostico.data ?? []).slice(0, 5)
  const ultima = lluvia.data?.ultima
  return (
    <section id="clima" aria-label={`El clima en ${actual.nombre}`} className="scroll-mt-6 overflow-hidden rounded-[18px] border border-borde bg-superficie">
      {/* Escena del Figma: el molino al atardecer, con la rueda girando despacio. */}
      <div className="relative h-[120px] overflow-hidden bg-[#e8c0ae]">
        <div className="absolute top-[-120px] left-[-150px] h-[320px] w-[569px]">
          <img src={cielo} alt="" className="absolute inset-0 size-full" />
          <img src={campoMolino} alt="" className="absolute inset-0 size-full" />
          <motion.img
            src={rueda}
            alt=""
            className="absolute top-[42.7px] left-[302.2px] size-[106.7px]"
            animate={reducir ? undefined : { rotate: 360 }}
            transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
          />
        </div>
        <div className="relative px-5 pt-4 text-superficie [text-shadow:0_1px_3px_rgba(0,0,0,0.25)]">
          <p className="text-[13px] font-semibold">{actual.nombre}</p>
          <p className="cifra text-[35px] leading-tight font-semibold">{clima.data ? `${clima.data.temp}°` : '—'}</p>
          {clima.data && <p className="text-[12px] font-medium">Mín {clima.data.min}° · Máx {clima.data.max}°</p>}
        </div>
      </div>
      <ul className="px-5 pt-3">
        {dias.map((d, i) => (
          <FilaPronostico key={d.fecha} d={d} hoy={i === 0} />
        ))}
      </ul>
      <div className="px-5 pt-2 pb-5">
        {lluvia.data && lluvia.data.total > 0 ? (
          <>
            <p className="text-[14.5px] font-semibold text-texto">Llovieron {Math.round(lluvia.data.total)} mm en los últimos 60 días</p>
            {ultima && (
              <p className="text-[12.5px] text-texto-suave">
                La última: {Math.round(ultima.mm)} mm el {new Date(`${ultima.fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })}
                {ultima.fuente === 'manual' ? ', anotada en la recorrida' : ''}
              </p>
            )}
          </>
        ) : (
          <p className="text-[13.5px] text-texto-suave">Sin lluvia anotada en los últimos 60 días.</p>
        )}
      </div>
    </section>
  )
}

function FilaPronostico({ d, hoy }: { d: DiaPronostico; hoy: boolean }) {
  const f = new Date(`${d.fecha}T12:00:00`)
  const llueve = d.lluviaProb >= 20
  return (
    <li className="flex items-center gap-3 py-2 text-[14px]">
      <span className="w-12 font-medium text-texto">{hoy ? 'Hoy' : DIA_CORTO[f.getDay()]}</span>
      <span className="ml-auto flex items-center gap-1.5 text-[12.5px] text-texto-suave">
        {llueve ? <Icono nombre="Lluvia" tamano={16} /> : <span className="size-3 rounded-full bg-acento" />}
        {llueve ? `${d.lluviaProb} %` : 'Sol'}
      </span>
      <span className="cifra w-9 text-right font-bold text-texto">{d.max}°</span>
      <span className="cifra w-7 text-right text-texto-suave">{d.min}°</span>
    </li>
  )
}

// ===== Estructura del rodeo =====

const HEMBRA = 'bg-principal'
const MACHO = 'bg-[#7c8b69]'

function EstructuraDelRodeo({ cats, total }: { cats: CategoriaConteo[]; total: number }) {
  const navigate = useNavigate()
  const n = (c: CategoriaConteo['categoria']) => cats.find((x) => x.categoria === c)?.cabezas ?? 0
  const filas = [
    { etapa: 'Adultos', h: ['Vacas', n('vaca')], m: ['Toros', n('toro')] },
    { etapa: 'Recría', h: ['Vaquillonas', n('vaquillona')], m: ['Novillos', n('novillo') + n('capon')] },
    { etapa: 'Cría', h: ['Terneras', n('ternera')], m: ['Terneros', n('ternero')] },
  ] as const
  const hembras = filas.reduce((s, f) => s + f.h[1], 0)
  const machos = filas.reduce((s, f) => s + f.m[1], 0)
  const max = Math.max(1, ...filas.flatMap((f) => [f.h[1], f.m[1]]))
  const vacas = n('vaca')
  const vientres = vacas + n('vaquillona')
  const toroVaca = n('toro') > 0 ? Math.round(vacas / n('toro')) : null
  const enRango = toroVaca !== null && toroVaca >= 20 && toroVaca <= 30
  const destete = vacas > 0 ? Math.round(((n('ternero') + n('ternera')) / vacas) * 100) : null

  return (
    <section className={TARJETA} aria-labelledby="estructura">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="estructura" className="font-heading text-[20px] font-extrabold text-texto">
            Estructura del rodeo
          </h2>
          <p className="text-[13.5px] text-texto-suave">Hembras y machos por edad, y cómo viene la cría.</p>
        </div>
        <BotonChico type="button" onClick={() => navigate('/hacienda')}>
          Ver hacienda
        </BotonChico>
      </div>
      {total === 0 ? (
        <p className="mt-4 text-[15.5px] text-texto-suave">Todavía no hay hacienda cargada.</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-[1fr_96px_1fr] items-baseline">
            <p className="text-right text-[16px] font-bold text-principal">Hembras {hembras}</p>
            <p className="titulo-display text-center text-[40px] text-texto">{total}</p>
            <p className="text-[16px] font-bold text-[#5f6d4f]">Machos {machos}</p>
          </div>
          <div className="mt-4 flex flex-col gap-4">
            {filas.map((f) => (
              <div key={f.etapa} className="grid grid-cols-[1fr_96px_1fr] items-center">
                <div className="flex items-center gap-3">
                  <span className="w-[140px] shrink-0 text-[16px] text-texto">
                    {f.h[0]} <b className="cifra">{f.h[1]}</b>
                  </span>
                  <div className="flex h-8 flex-1 justify-end">
                    <div className={cn('h-full rounded-l-[6px]', HEMBRA)} style={{ width: `${(f.h[1] / max) * 100}%` }} />
                  </div>
                </div>
                <span className="text-center text-[13px] font-semibold text-texto-suave">{f.etapa}</span>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 flex-1">
                    <div className={cn('h-full rounded-r-[6px]', MACHO)} style={{ width: `${(f.m[1] / max) * 100}%` }} />
                  </div>
                  <span className="w-[140px] shrink-0 text-right text-[16px] text-texto">
                    {f.m[0]} <b className="cifra">{f.m[1]}</b>
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-3 border-t border-borde pt-5 text-center">
            <Indicador nombre="Vientres" valor={String(vientres)} nota={`${Math.round((vientres / total) * 100)} % del rodeo`} tono="neutro" />
            <Indicador
              nombre="Toro y vaca"
              valor={toroVaca === null ? '—' : `1 : ${toroVaca}`}
              nota={toroVaca === null ? 'Sin toros' : enRango ? 'En rango (ideal 1:25)' : toroVaca > 30 ? 'Faltan toros (ideal 1:25)' : 'Sobran toros (ideal 1:25)'}
              tono={toroVaca === null ? 'neutro' : enRango ? 'bien' : 'atencion'}
            />
            <Indicador nombre="Destete" valor={destete === null ? '—' : `${destete} %`} nota="Terneros por vaca" tono="acento" />
          </div>
        </>
      )}
    </section>
  )
}

function Indicador({ nombre, valor, nota, tono }: { nombre: string; valor: string; nota: string; tono: 'neutro' | 'bien' | 'atencion' | 'acento' }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <p className="text-[14px] font-semibold text-texto-suave">{nombre}</p>
      <p className="titulo-display text-[34px] leading-none text-texto">{valor}</p>
      <span
        className={cn(
          'rounded-full px-3 py-1 text-[13.5px] font-semibold',
          tono === 'bien' ? 'bg-estado-bien-suave text-estado-bien-texto' : tono === 'atencion' ? 'bg-estado-atencion-suave text-estado-atencion-texto' : tono === 'acento' ? 'bg-acento/35 text-acento-texto' : 'bg-superficie-hundida text-texto-suave',
        )}
      >
        {nota}
      </span>
    </div>
  )
}
