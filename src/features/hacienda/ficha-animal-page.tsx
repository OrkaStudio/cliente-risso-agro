import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  FileText,
  HeartPulse,
  MapPin,
  Scissors,
  Stethoscope,
  Tag,
  TriangleAlert,
  Users,
} from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import {
  useAnimal,
  useEventos,
  useLote,
  usePotreros,
} from '@/features/hacienda/hooks'
import {
  categoriaLabel,
  estadoLabel,
  sexoLabel,
  tipoEventoLabel,
} from '@/features/hacienda/labels'
import {
  edadMeses,
  partoEstimado,
  resumirEventos,
  senalesDe,
  type ResumenAnimal,
  type Senal,
} from '@/features/hacienda/senales'
import type { EventoConAudio } from '@/features/hacienda/api'
import {
  CambiarCaravanaDialog,
  DarBajaDialog,
  RegistrarEventoDialog,
} from '@/features/hacienda/acciones-animal'
import { Panel } from '@/components/panel'
import { cn } from '@/lib/utils'

type TipoEvento = Database['public']['Enums']['tipo_evento']

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES[m - 1] ?? ''} ${String(y).slice(2)}`
}

function mesAnio(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return `${MESES[m - 1] ?? ''} ${y}`
}

function edadLabel(fechaNac: string | null): string {
  const meses = edadMeses(fechaNac)
  if (meses == null) return 'edad s/d'
  if (meses < 24) return `${meses} m`
  return `${Math.floor(meses / 12)} años`
}

function campo(datos: unknown, k: string): unknown {
  return datos && typeof datos === 'object' ? (datos as Record<string, unknown>)[k] : undefined
}

/** Título legible del evento: el tipo + su detalle estructurado (datos). */
function eventoTitulo(ev: EventoConAudio): string {
  const d = ev.datos
  switch (ev.tipo) {
    case 'pesaje': {
      const kg = Number(campo(d, 'kg'))
      return kg ? `Pesaje: ${kg} kg` : 'Pesaje'
    }
    case 'tacto': {
      const res = campo(d, 'resultado')
      if (res === 'prenada') {
        const meses = Number(campo(d, 'meses'))
        return `Tacto: preñada${meses ? ` — ${meses} meses` : ''}`
      }
      if (res === 'vacia') return 'Tacto: vacía'
      return 'Tacto'
    }
    case 'sanidad': {
      const t = campo(d, 'tratamiento')
      const hasta = campo(d, 'retiro_hasta')
      let s = typeof t === 'string' && t ? `Sanidad: ${t}` : 'Sanidad'
      if (typeof hasta === 'string' && hasta) s += ` — retiro hasta ${fechaCorta(hasta)}`
      return s
    }
    default:
      return tipoEventoLabel[ev.tipo] ?? ev.tipo
  }
}

/** Color del punto del historial, por tipo (mismo criterio que el mockup). */
const EVENTO_COLOR: Partial<Record<TipoEvento, string>> = {
  alta: 'var(--faint)',
  baja: 'var(--destructive)',
  sanidad: 'var(--destructive)',
  tacto: 'var(--sky)',
  parto: 'var(--field)',
  pesaje: 'var(--g3)',
  movimiento: 'var(--sol)',
  destete: 'var(--sky)',
  servicio: 'var(--lila)',
  castracion: 'var(--tierra)',
  cambio_caravana: 'var(--tierra)',
  caravana_asignada: 'var(--tierra)',
  nota: 'var(--faint)',
}

function Dato({ label, value, to }: { label: string; value: string; to?: string }) {
  return (
    <div className="rounded-xl bg-secondary/50 px-3.5 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">
        {label}
      </div>
      {to ? (
        <Link
          to={to}
          className="mt-0.5 block text-[14px] font-semibold leading-snug text-field-deep hover:underline"
        >
          {value}
        </Link>
      ) : (
        <div className="mt-0.5 text-[14px] font-semibold leading-snug text-ink">
          {value}
        </div>
      )}
    </div>
  )
}

const SENAL_FICHA: Record<Senal, { label: string; icon: typeof Tag; cls: string }> = {
  retiro: { label: 'Retiro vigente', icon: Stethoscope, cls: 'bg-destructive/10 text-destructive' },
  prenada: { label: 'Preñada', icon: HeartPulse, cls: 'bg-field-soft text-field-deep' },
  vender: { label: 'Para vender', icon: Tag, cls: 'bg-sol-soft text-sol-deep' },
  destete: { label: 'Para destetar', icon: Scissors, cls: 'bg-sky-soft text-sky' },
}

export function FichaAnimalPage() {
  const { id = '' } = useParams()
  const animal = useAnimal(id)
  const eventos = useEventos(id)
  const potreros = usePotreros()
  const lote = useLote(animal.data?.lote_id)

  const potreroNombre =
    animal.data?.potrero_id && potreros.data
      ? (potreros.data.find((p) => p.id === animal.data?.potrero_id)?.nombre ?? '—')
      : null

  // Resumen del historial → datos clave + señales de ESTE animal.
  const hoyISO = new Date().toISOString().slice(0, 10)
  const resumen: ResumenAnimal | undefined = useMemo(() => {
    if (!eventos.data) return undefined
    return resumirEventos(
      eventos.data.map((e) => ({
        animal_id: e.animal_id,
        tipo: e.tipo,
        fecha: e.fecha,
        datos: e.datos,
      })),
    ).get(id)
  }, [eventos.data, id])

  const senales: Senal[] = useMemo(() => {
    if (!animal.data || animal.data.estado !== 'activo') return []
    return senalesDe(
      {
        categoria: animal.data.categoria,
        fecha_nacimiento: animal.data.fecha_nacimiento,
      },
      resumen,
      hoyISO,
    )
  }, [animal.data, resumen, hoyISO])

  const retiroVigente = resumen?.retiroHasta && resumen.retiroHasta >= hoyISO

  if (animal.isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>
  }
  if (!animal.data) {
    return <p className="text-sm text-muted-foreground">Animal no encontrado.</p>
  }
  const a = animal.data
  const activo = a.estado === 'activo'

  const clavesVacias =
    !resumen?.ultimoPeso && !resumen?.partos && !resumen?.prenada && senales.length === 0

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <Link
        to="/hacienda"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Hacienda
      </Link>

      {/* Hero: quién es y dónde está */}
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">
              Caravana
            </div>
            <h1
              className={cn(
                'mt-1 font-heading text-[30px] font-bold leading-none tracking-tight',
                a.caravana_rfid ? 'tnum text-ink' : 'text-faint',
              )}
            >
              {a.caravana_rfid ?? 'Sin caravana'}
            </h1>
            {!a.caravana_rfid && activo && (
              <div className="mt-1.5 text-[12px] text-faint">
                se identifica al pasar por la manga
              </div>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-muted-foreground">
              <span className="font-semibold text-ink">
                {a.categoria ? categoriaLabel[a.categoria] : '—'}
              </span>
              <span>· {a.sexo ? sexoLabel[a.sexo] : '—'}</span>
              <span>· {edadLabel(a.fecha_nacimiento)}</span>
              {potreroNombre && a.potrero_id && (
                <span className="inline-flex items-center gap-1">
                  · <MapPin className="size-3.5 text-field" /> en{' '}
                  <Link to={`/potrero/${a.potrero_id}`} className="font-semibold text-field-deep hover:underline">
                    {potreroNombre}
                  </Link>
                </span>
              )}
              {lote.data && (
                <span className="inline-flex items-center gap-1">
                  · <Users className="size-3.5 text-faint" /> tropa{' '}
                  <span className="font-semibold text-ink">{lote.data.nombre}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2.5">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold',
                activo
                  ? 'bg-field-soft text-field-deep'
                  : a.estado === 'vendido'
                    ? 'bg-sol-soft text-sol-deep'
                    : 'bg-destructive/10 text-destructive',
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {a.estado ? estadoLabel[a.estado] : '—'}
            </span>
            {activo && a.empresa_id && (
              <div className="flex flex-wrap justify-end gap-2">
                <RegistrarEventoDialog animalId={id} empresaId={a.empresa_id} />
                <CambiarCaravanaDialog animalId={id} />
                <DarBajaDialog animalId={id} />
              </div>
            )}
          </div>
        </div>

        {/* Señales activas */}
        {senales.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border/70 pt-4">
            {senales.map((s) => {
              const ui = SENAL_FICHA[s]
              const Icon = ui.icon
              return (
                <span
                  key={s}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold',
                    ui.cls,
                  )}
                >
                  <Icon className="size-3.5" />
                  {ui.label}
                </span>
              )
            })}
          </div>
        )}
      </Panel>

      {/* Retiro sanitario vigente: lo primero que hay que saber */}
      {retiroVigente && resumen?.retiroHasta && (
        <div className="flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/[0.06] px-4 py-3 text-[13.5px] font-semibold text-destructive">
          <TriangleAlert className="size-[18px] shrink-0" />
          Retiro sanitario vigente
          {resumen.tratamiento ? ` (${resumen.tratamiento})` : ''} — no vender
          hasta el {fechaCorta(resumen.retiroHasta)}.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Identidad */}
        <Panel title="Identidad">
          <div className="grid grid-cols-2 gap-2.5">
            <Dato label="Categoría" value={a.categoria ? categoriaLabel[a.categoria] : '—'} />
            <Dato label="Sexo" value={a.sexo ? sexoLabel[a.sexo] : '—'} />
            <Dato
              label="Nacimiento"
              value={a.fecha_nacimiento ? `${fechaCorta(a.fecha_nacimiento)} (${edadLabel(a.fecha_nacimiento)})` : 'sin cargar'}
            />
            <Dato
              label="Potrero"
              value={potreroNombre ?? 'Sin asignar'}
              to={a.potrero_id ? `/potrero/${a.potrero_id}` : undefined}
            />
            <Dato label="Tropa" value={lote.data?.nombre ?? 'Suelto (sin tropa)'} />
            <Dato label="Origen" value={a.origen ?? '—'} />
            {a.caravana_visual && (
              <Dato label="Caravana visual" value={a.caravana_visual} />
            )}
          </div>
        </Panel>

        {/* Datos clave, derivados del historial */}
        <Panel title="Datos clave" sub="salen del historial">
          {clavesVacias ? (
            <p className="py-4 text-[13px] leading-relaxed text-muted-foreground">
              Todavía no hay datos productivos. Se completan solos al registrar
              eventos: una <b>pesada</b> deja el último peso, un <b>tacto</b> la
              preñez, un <b>parto</b> suma a la cuenta.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {resumen?.ultimoPeso && (
                <Dato
                  label="Último peso"
                  value={`${resumen.ultimoPeso.kg} kg · ${fechaCorta(resumen.ultimoPeso.fecha)}`}
                />
              )}
              {resumen && resumen.partos > 0 && (
                <Dato
                  label="Partos"
                  value={`${resumen.partos}${resumen.ultimoParto ? ` · último ${mesAnio(resumen.ultimoParto)}` : ''}`}
                />
              )}
              {resumen?.prenada && (
                <Dato
                  label="Preñez"
                  value={`${resumen.prenada.meses ? `${resumen.prenada.meses} meses` : 'confirmada'} · tacto ${fechaCorta(resumen.prenada.fecha)}`}
                />
              )}
              {resumen?.prenada &&
                (() => {
                  const est = partoEstimado(resumen.prenada)
                  return est ? <Dato label="Próximo parto" value={`~${mesAnio(est)}`} /> : null
                })()}
            </div>
          )}
        </Panel>
      </div>

      {/* Historial append-only */}
      <Panel
        title="Historial"
        sub="no se borra nunca"
      >
        {eventos.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : eventos.data && eventos.data.length > 0 ? (
          <div className="flex flex-col">
            {eventos.data.map((ev, i) => (
              <div key={ev.id} className="flex gap-3.5">
                <span className="tnum w-[72px] shrink-0 pt-px text-right text-[12px] font-medium text-faint">
                  {fechaCorta(ev.fecha)}
                </span>
                <span className="relative flex w-3 shrink-0 flex-col items-center">
                  <span
                    className="mt-1 size-2.5 shrink-0 rounded-full ring-4 ring-card"
                    style={{ background: EVENTO_COLOR[ev.tipo] ?? 'var(--faint)' }}
                  />
                  {i < eventos.data.length - 1 && (
                    <span className="w-px flex-1 bg-border" />
                  )}
                </span>
                <div className={cn('min-w-0 flex-1', i < eventos.data.length - 1 && 'pb-5')}>
                  <div className="text-[13.5px] font-semibold leading-tight text-ink">
                    {eventoTitulo(ev)}
                  </div>
                  {ev.nota && (
                    <div className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
                      {ev.nota}
                    </div>
                  )}
                  {ev.audioFirmado && (
                    <audio
                      controls
                      preload="none"
                      src={ev.audioFirmado}
                      className="mt-1.5 h-8 w-full max-w-[300px]"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <FileText className="size-4 text-faint" /> Sin eventos todavía.
          </p>
        )}
      </Panel>

      {/* Nota para bajas */}
      {!activo && (
        <p className="text-[12.5px] text-faint">
          Animal dado de baja — la ficha y su historial quedan para siempre.
        </p>
      )}
    </div>
  )
}
