import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { BotonChico } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
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
import { cosasParaHoy, fraseDelDia, franjasDelRodeo, plataCorta, proximos30, saludo, type Cosa } from './dia'
import { useGanadoCampania, useLluvia60 } from './use-dia'

const CURVA = [0.22, 1, 0.36, 1] as const
const TARJETA = 'rounded-[18px] border border-borde bg-superficie p-6'

/**
 * Inicio · El día (página 35): el saludo con lo del día, lo que hay para
 * atender, el rodeo con la plata, lo que dejó la recorrida sobre el campo,
 * los cobros y pagos, el clima y la estructura del rodeo.
 */
export function ElDia() {
  const { user } = useAuth()
  const { data: membresia } = useEmpresa()
  const panorama = usePanoramaInicio()
  const atender = useParaAtender()
  const { data: campos } = useMapa(membresia?.empresa_id)
  const { actual } = useCampoClima()
  const clima = useClima(actual?.ubicacion ?? null)
  const lluvia = useLluvia60(actual?.id ?? null)
  const ganado = useGanadoCampania()
  const reducir = useReducedMotion()

  if (panorama.isLoading || atender.isLoading) return <div className="h-[340px] animate-pulse rounded-[24px] bg-superficie-hundida" aria-busy />
  if (panorama.error || !panorama.data) return <p className="text-texto-suave">No pudimos cargar el Inicio. Revisá la conexión y probá de nuevo.</p>

  const p = panorama.data
  const a = atender.data
  const cosas = cosasParaHoy(a?.potreros ?? [], p.vencimientos, a?.sinRecorrer ?? [])
  const crudo = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const nombre = crudo.charAt(0).toLocaleUpperCase('es-AR') + crudo.slice(1)
  const frase = fraseDelDia({
    temp: clima.data?.temp ?? null,
    lugar: actual?.nombre ?? null,
    lluvia60: lluvia.data?.total ?? null,
    cosas: cosas.length,
  })
  const entra = (i: number) =>
    reducir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.06, ease: CURVA } }

  return (
    <div className="mx-auto flex w-full max-w-[1104px] flex-col gap-9">
      <motion.div {...entra(0)}>
        <Bienvenida titulo={saludo(new Date().getHours(), nombre)} frase={frase} />
      </motion.div>

      <motion.div {...entra(1)} className="grid gap-10 lg:grid-cols-[minmax(0,668px)_minmax(0,380px)] lg:justify-between">
        <ParaAtenderHoy cosas={cosas} />
        <Rodeo total={p.totalCabezas} campos={campos?.length ?? 0} cats={p.porCategoria} ganado={ganado.data ?? null} proximos={proximos30(p.vencimientos)} />
      </motion.div>

      <motion.div {...entra(2)}>
        <LoQueDejoLaRecorrida campos={campos ?? []} atencion={a?.potreros ?? []} ultima={a?.ultimaRecorridaHace ?? null} empresaId={membresia?.empresa_id ?? ''} />
      </motion.div>

      <motion.div {...entra(3)} className="grid gap-5 lg:grid-cols-[minmax(0,684px)_minmax(0,400px)] lg:justify-between">
        <CobrosYPagos vencimientos={p.vencimientos} />
        <Clima />
      </motion.div>

      <motion.div {...entra(4)}>
        <EstructuraDelRodeo cats={p.porCategoria} total={p.totalCabezas} />
      </motion.div>
    </div>
  )
}

// ===== El saludo =====

function Bienvenida({ titulo, frase }: { titulo: string; frase: string }) {
  const navigate = useNavigate()
  return (
    <section className="relative isolate flex h-[340px] flex-col justify-center overflow-hidden rounded-[24px] bg-tinta px-12">
      <img src="/inicio-bienvenida.png" alt="" className="absolute inset-0 -z-20 size-full object-cover" fetchPriority="high" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[rgba(19,27,22,0.82)] via-[rgba(19,27,22,0.35)] to-transparent" />
      <h1 className="font-heading text-[64px] leading-[1.05] font-extrabold tracking-[-0.02em] text-superficie">{titulo}</h1>
      <p className="mt-4 max-w-[540px] text-[18px] leading-[1.45] font-medium text-superficie/90">{frase}</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => navigate('/agenda')}
          className="inline-flex h-12 items-center gap-3 rounded-full bg-principal py-1.5 pr-1.5 pl-6 text-[16px] font-bold text-principal-texto hover:bg-terracota-600"
        >
          Ver la agenda
          <span className="grid size-9 place-items-center rounded-full bg-acento text-acento-texto">
            <Icono nombre="Siguiente" tamano={16} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/campo')}
          className="inline-flex h-12 items-center rounded-full border-[1.5px] border-superficie/70 bg-black/15 px-6 text-[16px] font-semibold text-superficie hover:bg-white/15"
        >
          Pasar al Modo Campo
        </button>
      </div>
    </section>
  )
}

// ===== Para atender hoy =====

const BARRA: Record<Cosa['tono'], string> = { problema: 'bg-[#b3372a]', atencion: 'bg-[#d38f1d]', aviso: 'bg-acento' }

function ParaAtenderHoy({ cosas }: { cosas: Cosa[] }) {
  const navigate = useNavigate()
  return (
    <section aria-labelledby="atender-hoy">
      <h2 id="atender-hoy" className="font-heading text-[22px] font-extrabold text-texto">
        Para atender hoy
      </h2>
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
            <li key={c.key} className="flex items-center gap-4 border-b border-borde py-4 last:border-b-0">
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

// ===== El rodeo y la plata =====

function Rodeo({
  total,
  campos,
  cats,
  ganado,
  proximos,
}: {
  total: number
  campos: number
  cats: CategoriaConteo[]
  ganado: number | null
  proximos: number
}) {
  const franjas = franjasDelRodeo(cats)
  return (
    <section aria-label="El rodeo" className="flex flex-col">
      <p className="titulo-display text-[150px] leading-[0.95] tracking-[-0.04em] text-texto">{total.toLocaleString('es-AR')}</p>
      <p className="mt-2 text-[18px] font-semibold text-texto-suave">
        cabezas{campos > 0 ? ` en ${campos === 1 ? 'tu campo' : `${campos} campos`}` : ''}
      </p>
      {franjas.length > 0 && (
        <div className="mt-2 flex h-2 gap-1" aria-label={franjas.map((f) => `${f.nombre} ${f.cabezas}`).join(', ')}>
          {franjas.map((f) => (
            <span key={f.nombre} className={cn('rounded-full', f.clase)} style={{ flexGrow: f.cabezas }} title={`${f.nombre}: ${f.cabezas}`} />
          ))}
        </div>
      )}
      <div className="mt-5 flex gap-8">
        <div>
          <p className="text-[13.5px] text-texto-suave">Ganado desde julio</p>
          <p className="font-heading text-[26px] font-extrabold text-texto">{ganado === null ? '—' : plataCorta(ganado)}</p>
        </div>
        <div>
          <p className="text-[13.5px] text-texto-suave">Próximos 30 días</p>
          <p className={cn('font-heading text-[26px] font-extrabold', proximos >= 0 ? 'text-estado-bien' : 'text-estado-problema-texto')}>
            {proximos === 0 ? '—' : plataCorta(proximos, true)}
          </p>
        </div>
      </div>
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
    <section className={TARJETA} aria-labelledby="recorrida">
      <div className="flex items-center justify-between gap-4">
        <h2 id="recorrida" className="font-heading text-[20px] font-extrabold text-texto">
          Lo que dejó la recorrida
        </h2>
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
        <span className={cn('shrink-0 text-texto-suave transition-transform', abierto ? 'rotate-90' : '-rotate-90')}>
          <Icono nombre="Atrás" tamano={16} />
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
      <div className="flex items-center justify-between gap-4 border-b border-borde pb-4">
        <h2 id="cobros-pagos" className="font-heading text-[20px] font-extrabold text-texto">
          Cobros y pagos que se vienen
        </h2>
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
              <li key={v.id} className="flex items-center gap-4 border-b border-borde py-4 last:border-b-0">
                <span className={cn('flex w-12 shrink-0 flex-col items-center rounded-[10px] py-1.5', d < 0 ? 'bg-estado-problema-suave' : 'bg-superficie-hundida')}>
                  <span className="cifra text-[19px] leading-none font-bold text-texto">{f ? f.getDate() : '—'}</span>
                  <span className="text-[11px] text-texto-suave">{f ? MES[f.getMonth()] : ''}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-texto">{v.descripcion}</p>
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
    <section aria-label={`El clima en ${actual.nombre}`} className="overflow-hidden rounded-[18px] border border-borde bg-superficie">
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
        <h2 id="estructura" className="font-heading text-[20px] font-extrabold text-texto">
          Estructura del rodeo
        </h2>
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
