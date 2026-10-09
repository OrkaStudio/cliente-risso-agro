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
import type { CampoMapa } from '@/features/mapa/reglas'
import { cn } from '@/lib/utils'
import cielo from '@/assets/tropero/molino/cielo.svg'
import campoMolino from '@/assets/tropero/molino/campo.svg'
import rueda from '@/assets/tropero/molino/rueda.svg'
import type { CategoriaConteo, Vencimiento } from '../api'
import { usePanoramaInicio } from '../hooks'
import { invalidarAvisos, useDeshacerMarca, useMarcarSenal } from '../marcar-senal'
import { useParaAtender, type Aviso, type PotreroAtencion } from '../para-atender-api'
import { CroquisRecorrida } from './croquis-recorrida'
import { chipsDelDia, cosasParaHoy, franjasDelRodeo, plataCorta, proximos30, saludo, type Chip, type Cosa } from './dia'
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

      <motion.div {...entra(1)} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <PulsoHacienda total={p.totalCabezas} campos={campos?.length ?? 0} cats={p.porCategoria} nacimientos={(a?.nacimientos ?? []).reduce((s, n) => s + n.total, 0)} />
        <PulsoPlata vencimientos={p.vencimientos} ganado={ganado.data ?? null} />
        <PulsoLluvia lugar={actual?.nombre ?? null} mm={lluvia.data?.total ?? null} temp={clima.data?.temp ?? null} manana={manana ?? null} />
        <PulsoRecorrida ultima={a?.ultimaRecorridaHace ?? null} potreros={a?.potreros.length ?? 0} sinRecorrer={a?.sinRecorrer ?? []} />
      </motion.div>

      <motion.div {...entra(2)} className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <ParaAtenderHoy cosas={cosas} />
        <CobrosYPagos vencimientos={p.vencimientos} />
      </motion.div>

      <motion.div {...entra(3)} className="mt-3">
        <LoQueDejoLaRecorrida campos={campos ?? []} atencion={a?.potreros ?? []} ultima={a?.ultimaRecorridaHace ?? null} empresaId={membresia?.empresa_id ?? ''} />
      </motion.div>

      <motion.div {...entra(4)} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <EstructuraDelRodeo cats={p.porCategoria} total={p.totalCabezas} />
        <Clima />
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
    <button
      type="button"
      onClick={() => ir(destino)}
      className="group flex min-h-[148px] flex-col rounded-[18px] border border-borde bg-superficie p-5 text-left transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(19,27,22,0.08)]"
    >
      <span className="flex items-center gap-2 text-[13.5px] font-semibold text-texto-suave">
        <Icono nombre={icono} tamano={16} />
        {titulo}
        <span className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">
          <Icono nombre="Siguiente" tamano={16} />
        </span>
      </span>
      <span className="mt-2 flex-1">{children}</span>
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
      destino="#recorrida"
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

// ===== Para atender hoy =====

const BARRA: Record<Cosa['tono'], string> = { problema: 'bg-[#b3372a]', atencion: 'bg-[#d38f1d]', aviso: 'bg-acento' }

function ParaAtenderHoy({ cosas }: { cosas: Cosa[] }) {
  const navigate = useNavigate()
  return (
    <section id="para-atender" aria-labelledby="atender-hoy" className={cn(TARJETA, 'scroll-mt-6')}>
      <h2 id="atender-hoy" className="font-heading text-[20px] font-extrabold text-texto">
        Para atender hoy
      </h2>
      <p className="text-[13.5px] text-texto-suave">Lo urgente primero, con el botón para resolverlo.</p>
      {cosas.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-[16px] bg-estado-bien-suave px-5 py-4 text-estado-bien-texto">
          <span className="grid size-8 place-items-center rounded-full bg-estado-bien text-superficie">
            <Icono nombre="Guardar" tamano={16} />
          </span>
          <p className="text-[15.5px] font-semibold">Nada urgente hoy. Lo que venga de la recorrida o de la agenda aparece acá.</p>
        </div>
      ) : (
        <ul className="mt-2 flex flex-col">
          {cosas.map((c) => (
            <li key={c.key} className="flex items-center gap-4 border-b border-borde py-3.5 last:border-b-0 last:pb-0">
              <span aria-hidden className={cn('w-1 self-stretch rounded-full', BARRA[c.tono])} />
              <div className="min-w-0 flex-1">
                <p className="text-[16.5px] font-semibold text-texto">{c.titulo}</p>
                <p className="text-[14px] text-texto-suave">{c.detalle}</p>
              </div>
              <BotonChico type="button" onClick={() => navigate(c.accion.to)}>
                {c.accion.texto}
              </BotonChico>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ===== Lo que dejó la recorrida =====

function LoQueDejoLaRecorrida({
  campos,
  atencion,
  ultima,
  empresaId,
}: {
  campos: CampoMapa[]
  atencion: PotreroAtencion[]
  ultima: number | null
  empresaId: string
}) {
  const navigate = useNavigate()
  // El campo del potrero más urgente; si no hay nada, el primero.
  const campo = campos.find((c) => c.nombre === atencion[0]?.campo) ?? campos[0]
  const [abierto, setAbierto] = useState<string | null>(atencion[0]?.nivel === 'atender' ? atencion[0].key : null)
  return (
    <section id="recorrida" className={cn(TARJETA, 'scroll-mt-6')} aria-labelledby="recorrida-titulo">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="recorrida-titulo" className="font-heading text-[20px] font-extrabold text-texto">
            Lo que dejó la recorrida
          </h2>
          <p className="text-[13.5px] text-texto-suave">Cada potrero como lo vio el que recorrió. Si ya se arregló, marcalo.</p>
        </div>
        <BotonChico type="button" onClick={() => navigate('/campo/historial')}>
          Historial
        </BotonChico>
      </div>
      {ultima === null ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-[14px] bg-superficie-hundida/70 px-5 py-4">
          <p className="text-[15.5px] text-texto">Todavía no hubo recorrida. Con la primera, acá ves cómo quedó cada potrero.</p>
          <BotonChico type="button" icono="Recorrida" onClick={() => navigate('/campo/recorrida')}>
            Hacer la primera
          </BotonChico>
        </div>
      ) : (
        <>
          {campo?.contorno && (
            <div className="mt-4">
              <CroquisRecorrida campo={campo} atencion={atencion} />
            </div>
          )}
          {atencion.length === 0 ? (
            <p className="mt-4 text-[15.5px] text-texto-suave">
              La última recorrida, {ultima === 0 ? 'de hoy' : ultima === 1 ? 'de ayer' : `de hace ${ultima} días`}, no dejó nada para atender.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {atencion.map((p) => (
                <PotreroDeLaRecorrida
                  key={p.key}
                  p={p}
                  abierto={abierto === p.key}
                  onAbrir={() => setAbierto(abierto === p.key ? null : p.key)}
                  empresaId={empresaId}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

const NIVEL = {
  atender: { chip: 'bg-estado-problema-suave text-estado-problema-texto', icono: 'bg-estado-problema-suave text-estado-problema-texto', texto: 'Atender' },
  prevenir: { chip: 'bg-estado-atencion-suave text-estado-atencion-texto', icono: 'bg-estado-atencion-suave text-estado-atencion-texto', texto: 'Prevenir' },
  nota: { chip: 'bg-superficie-hundida text-texto-suave', icono: 'bg-superficie-hundida text-texto-suave', texto: 'Para saber' },
} as const

const DIAS_SEMANA = ['el domingo', 'el lunes', 'el martes', 'el miércoles', 'el jueves', 'el viernes', 'el sábado']
function vistoEl(hace: number): string {
  if (hace <= 0) return 'Visto hoy'
  if (hace === 1) return 'Visto ayer'
  if (hace < 7) {
    const d = new Date()
    d.setDate(d.getDate() - hace)
    return `Visto ${DIAS_SEMANA[d.getDay()]}`
  }
  return `Visto hace ${hace} días`
}

function PotreroDeLaRecorrida({
  p,
  abierto,
  onAbrir,
  empresaId,
}: {
  p: PotreroAtencion
  abierto: boolean
  onAbrir: () => void
  empresaId: string
}) {
  const n = NIVEL[p.nivel]
  const Primero = p.avisos[0]!.icon
  const resumen = [p.campo, p.cabezas > 0 ? `${p.cabezas} animales` : null, ...p.avisos.map((a) => a.titulo)].filter(Boolean).join(' · ')
  return (
    <div className={cn('rounded-[14px] border bg-superficie', abierto ? 'border-acento' : 'border-borde')}>
      <button type="button" onClick={onAbrir} aria-expanded={abierto} className="flex w-full items-center gap-4 px-4 py-3.5 text-left">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-[10px]', n.icono)}>
          <Primero className="size-5" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-[16px] font-extrabold text-texto">{p.potrero}</span>
          <span className="block truncate text-[13.5px] text-texto-suave">{resumen}</span>
        </span>
        <span className={cn('shrink-0 rounded-full px-3 py-1 text-[13px] font-bold', n.chip)}>
          {n.texto}
          {p.hace > 0 ? ` · hace ${p.hace} ${p.hace === 1 ? 'día' : 'días'}` : ''}
        </span>
        <span className={cn('shrink-0 text-texto-suave transition-transform', abierto && 'rotate-180')}>
          <Icono nombre="Desplegar" tamano={16} />
        </span>
      </button>
      {abierto && (
        <div className="flex flex-col gap-1 px-4 pb-3">
          {p.avisos.map((a) => (
            <SenalDeLaRecorrida key={a.key} p={p} a={a} empresaId={empresaId} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Una señal con «Se solucionó». Queda confirmada con «Deshacer»; la lista se refresca al salir. */
function SenalDeLaRecorrida({ p, a, empresaId }: { p: PotreroAtencion; a: Aviso; empresaId: string }) {
  const qc = useQueryClient()
  const marcar = useMarcarSenal()
  const deshacer = useDeshacerMarca()
  const [marca, setMarca] = useState<string | null>(null)
  const Icon = a.icon
  return (
    <div className={cn('flex items-center gap-4 rounded-[12px] px-1 py-2.5 transition-colors', marca && 'bg-estado-bien-suave/60')}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-estado-atencion-suave text-estado-atencion-texto">
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-texto">{a.titulo}</p>
        <p className="text-[13.5px] text-texto-suave">{a.detalle ? `«${a.detalle}» · ` : ''}{vistoEl(p.hace)}</p>
      </div>
      {marca ? (
        <span className="flex items-center gap-2 text-[14px] font-semibold text-estado-bien-texto">
          <Icono nombre="Guardar" tamano={16} /> Solucionado
          <button
            type="button"
            className="ml-1 rounded-full px-2 py-1 text-[13.5px] font-bold text-principal hover:bg-principal-suave"
            onClick={() => deshacer.mutate(marca, { onSuccess: () => setMarca(null) })}
          >
            Deshacer
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={marcar.isPending}
          onClick={() =>
            marcar.mutate(
              { empresaId, potreroId: p.key, observacionId: p.observacionId, tipo: a.tipo, estado: 'resuelto' },
              {
                onSuccess: (id) => {
                  setMarca(id)
                  // La lista se actualiza un rato después: primero se ve la confirmación.
                  window.setTimeout(() => invalidarAvisos(qc, p.key), 6000)
                },
              },
            )
          }
          className="h-9 shrink-0 rounded-full border-[1.5px] border-borde bg-superficie px-4 text-[14px] font-bold text-texto hover:border-texto-suave/60 disabled:opacity-50"
        >
          Se solucionó
        </button>
      )}
    </div>
  )
}

// ===== Cobros y pagos =====

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function CobrosYPagos({ vencimientos }: { vencimientos: Vencimiento[] }) {
  const navigate = useNavigate()
  const vista = vencimientos.filter((v) => v.diasParaVencer !== null && v.diasParaVencer <= 30).slice(0, 4)
  return (
    <section className={TARJETA} aria-labelledby="cobros-pagos">
      <div className="flex items-start justify-between gap-4 border-b border-borde pb-4">
        <div>
          <h2 id="cobros-pagos" className="font-heading text-[20px] font-extrabold text-texto">
            Cobros y pagos
          </h2>
          <p className="text-[13.5px] text-texto-suave">Lo que vence en 30 días</p>
        </div>
        <BotonChico type="button" onClick={() => navigate('/agenda')}>
          Ver en Agenda
        </BotonChico>
      </div>
      {vista.length === 0 ? (
        <p className="pt-5 text-[15.5px] text-texto-suave">Nada por cobrar ni por pagar en los próximos 30 días.</p>
      ) : (
        <ul>
          {vista.map((v) => {
            const d = v.diasParaVencer ?? 0
            const f = v.fechaVencimiento ? new Date(`${v.fechaVencimiento}T12:00:00`) : null
            const cobro = v.tipo === 'ingreso'
            return (
              <li key={v.id} className="flex items-center gap-4 border-b border-borde py-3.5 last:border-b-0 last:pb-0">
                <span className={cn('flex w-12 shrink-0 flex-col items-center rounded-[10px] py-1.5', d < 0 ? 'bg-estado-problema-suave' : 'bg-superficie-hundida')}>
                  <span className="cifra text-[19px] leading-none font-bold text-texto">{f ? f.getDate() : '—'}</span>
                  <span className="text-[11px] text-texto-suave">{f ? MES[f.getMonth()] : ''}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[15px] leading-snug font-semibold text-texto">{v.descripcion}</p>
                  <span
                    className={cn(
                      'mt-1 inline-block rounded-full px-2.5 py-0.5 text-[12.5px] font-bold',
                      d < 0 ? 'bg-estado-problema-suave text-estado-problema-texto' : d <= 7 ? 'bg-estado-atencion-suave text-estado-atencion-texto' : 'bg-superficie-hundida text-texto-suave',
                    )}
                  >
                    {d < 0 ? 'Venció' : d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `En ${d} días`}
                  </span>
                </div>
                <span className={cn('cifra shrink-0 text-[17px] font-bold', cobro ? 'text-estado-bien' : 'text-texto')}>
                  {v.monto ? `${cobro ? '+' : '−'}$${Math.round(v.monto).toLocaleString('es-AR')}` : '—'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
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
          <div className="mt-5 grid grid-cols-[1fr_80px_1fr] items-baseline">
            <p className="text-right text-[13px] font-semibold text-principal">Hembras {hembras}</p>
            <p className="titulo-display text-center text-[28px] text-texto">{total}</p>
            <p className="text-[13px] font-semibold text-texto-suave">Machos {machos}</p>
          </div>
          <div className="mt-4 flex flex-col gap-4">
            {filas.map((f) => (
              <div key={f.etapa} className="grid grid-cols-[1fr_80px_1fr] items-center">
                <div className="flex items-center gap-3">
                  <span className="w-[120px] shrink-0 text-[14px] text-texto">
                    {f.h[0]} <b className="cifra">{f.h[1]}</b>
                  </span>
                  <div className="flex h-6 flex-1 justify-end">
                    <div className={cn('h-full rounded-l-[6px]', HEMBRA)} style={{ width: `${(f.h[1] / max) * 100}%` }} />
                  </div>
                </div>
                <span className="text-center text-[11.5px] font-semibold text-texto-suave">{f.etapa}</span>
                <div className="flex items-center gap-3">
                  <div className="flex h-6 flex-1">
                    <div className={cn('h-full rounded-r-[6px]', MACHO)} style={{ width: `${(f.m[1] / max) * 100}%` }} />
                  </div>
                  <span className="w-[120px] shrink-0 text-right text-[14px] text-texto">
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
      <p className="text-[12.5px] font-semibold text-texto-suave">{nombre}</p>
      <p className="cifra text-[24px] font-bold text-texto">{valor}</p>
      <span
        className={cn(
          'rounded-full px-3 py-0.5 text-[12.5px] font-semibold',
          tono === 'bien' ? 'bg-estado-bien-suave text-estado-bien-texto' : tono === 'atencion' ? 'bg-estado-atencion-suave text-estado-atencion-texto' : tono === 'acento' ? 'bg-acento/35 text-acento-texto' : 'bg-superficie-hundida text-texto-suave',
        )}
      >
        {nota}
      </span>
    </div>
  )
}
