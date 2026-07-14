import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CalendarClock,
  CheckCircle2,
  Droplets,
  Footprints,
  HeartPulse,
  ListChecks,
  Sprout,
  StickyNote,
  Wheat,
  Zap,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Panel } from '@/components/panel'
import { cn } from '@/lib/utils'

/* Umbrales de la sección (ajustables): una observación más vieja que esto ya
 * no es "estado actual" (el aviso pasa a ser "hace N días sin recorrer");
 * las novedades son notas de diario y caducan antes. */
const OBS_VIGENTE_DIAS = 30
const NOVEDAD_VIGENTE_DIAS = 14
const RECORRER_CADA_DIAS = 7
/* El conteo se compara contra el stock de HOY: solo vale muy fresco (si pasaron
 * días pudo haber movimientos de hacienda y la comparación miente). */
const CONTEO_VIGENTE_DIAS = 3

const MS_DIA = 86400000
const diasDesde = (fecha: string): number => {
  const [y, m, d] = fecha.split('-').map(Number)
  return Math.max(0, Math.round((Date.now() - new Date(y, m - 1, d).getTime()) / MS_DIA))
}
const haceLabel = (d: number): string =>
  d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`

type Nivel = 'atender' | 'prevenir' | 'nota'

type Atencion = {
  key: string
  nivel: Nivel
  icon: typeof Droplets
  titulo: string
  /** "1A · La Porteña" (o el campo, para los avisos de recorrida). */
  donde: string
  /** Texto extra (la novedad anotada). */
  detalle?: string
  /** Días desde que se vio. */
  hace: number
  /** Aviso sin fecha propia (ej: campo nunca recorrido) — el chip no muestra "hoy". */
  sinFecha?: boolean
  to: string
}

type ParaAtenderData = {
  items: Atencion[]
  /** Días desde la última recorrida de la empresa (null = nunca hubo). */
  ultimaRecorridaHace: number | null
}

/**
 * Junta la última observación de cada potrero (recorridas del Modo Campo) y
 * la traduce a avisos accionables: qué falta, qué prevenir, qué atender.
 */
async function getParaAtender(): Promise<ParaAtenderData> {
  const [obsRes, recRes, potRes, stockRes] = await Promise.all([
    supabase
      .from('observacion_potrero')
      .select(
        'potrero_id, pasto, agua, electrico, conteo, en_tratamiento, novedad, cultivo, created_at, recorrida:recorrida_id(fecha)',
      )
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase.from('recorrida').select('campo_id, fecha').order('fecha', { ascending: false }),
    supabase.from('potrero').select('id, nombre, campo:campo(id, nombre)'),
    supabase.from('v_stock_potrero').select('potrero_id, cabezas'),
  ])
  if (obsRes.error) throw new Error(obsRes.error.message)
  if (recRes.error) throw new Error(recRes.error.message)
  if (potRes.error) throw new Error(potRes.error.message)
  if (stockRes.error) throw new Error(stockRes.error.message)

  const potreros = new Map(
    (potRes.data ?? []).map((p) => {
      const campo = p.campo as { id: string; nombre: string } | null
      return [
        p.id,
        { nombre: p.nombre, campoId: campo?.id ?? '', campoNombre: campo?.nombre ?? '' },
      ]
    }),
  )
  const stock = new Map(
    (stockRes.data ?? []).map((s) => [s.potrero_id, s.cabezas ?? 0]),
  )

  const items: Atencion[] = []

  // ── Avisos por potrero: la última observación conocida de cada uno ──
  const vistos = new Set<string>()
  for (const o of obsRes.data ?? []) {
    if (vistos.has(o.potrero_id)) continue
    vistos.add(o.potrero_id)

    const p = potreros.get(o.potrero_id)
    if (!p) continue
    const fecha = o.recorrida?.fecha ?? o.created_at.slice(0, 10)
    const hace = diasDesde(fecha)
    if (hace > OBS_VIGENTE_DIAS) continue // ya no es estado actual

    const donde = `${p.nombre} · ${p.campoNombre}`
    const to = `/potrero/${o.potrero_id}`
    const base = { donde, hace, to }

    if (o.agua === 'seca')
      items.push({ ...base, key: `${o.potrero_id}-agua`, nivel: 'atender', icon: Droplets, titulo: 'Aguada seca' })
    else if (o.agua === 'baja')
      items.push({ ...base, key: `${o.potrero_id}-agua`, nivel: 'prevenir', icon: Droplets, titulo: 'Aguada baja' })

    if (o.pasto === 'pelado')
      items.push({ ...base, key: `${o.potrero_id}-pasto`, nivel: 'atender', icon: Sprout, titulo: 'Potrero pelado' })
    else if (o.pasto === 'escaso')
      items.push({ ...base, key: `${o.potrero_id}-pasto`, nivel: 'prevenir', icon: Sprout, titulo: 'Pasto escaso' })

    if (o.electrico === 'cortado')
      items.push({ ...base, key: `${o.potrero_id}-elec`, nivel: 'atender', icon: Zap, titulo: 'Eléctrico cortado' })

    if (o.cultivo === 'mal')
      items.push({ ...base, key: `${o.potrero_id}-cult`, nivel: 'atender', icon: Wheat, titulo: 'Cultivo mal' })
    else if (o.cultivo === 'regular')
      items.push({ ...base, key: `${o.potrero_id}-cult`, nivel: 'prevenir', icon: Wheat, titulo: 'Cultivo regular' })

    if (o.en_tratamiento)
      items.push({ ...base, key: `${o.potrero_id}-trat`, nivel: 'prevenir', icon: HeartPulse, titulo: 'Animales en tratamiento' })

    const esperadas = stock.get(o.potrero_id) ?? 0
    if (
      o.conteo != null &&
      o.conteo > 0 &&
      esperadas > 0 &&
      o.conteo < esperadas &&
      hace <= CONTEO_VIGENTE_DIAS
    )
      items.push({
        ...base,
        key: `${o.potrero_id}-conteo`,
        nivel: 'atender',
        icon: ListChecks,
        titulo: `Conteo bajo: ${o.conteo} de ${esperadas}`,
      })

    if (o.novedad?.trim() && hace <= NOVEDAD_VIGENTE_DIAS)
      items.push({
        ...base,
        key: `${o.potrero_id}-nov`,
        nivel: 'nota',
        icon: StickyNote,
        titulo: 'Novedad anotada',
        detalle: o.novedad.trim(),
      })
  }

  // ── Avisos por campo: hace cuánto no se recorre ──
  const ultimaPorCampo = new Map<string, string>()
  for (const r of recRes.data ?? []) {
    if (r.campo_id && !ultimaPorCampo.has(r.campo_id)) ultimaPorCampo.set(r.campo_id, r.fecha)
  }
  // Campos con hacienda (los vacíos no piden recorrida)
  const camposConHacienda = new Map<string, string>()
  for (const [id, p] of potreros) {
    if ((stock.get(id) ?? 0) > 0 && p.campoId) camposConHacienda.set(p.campoId, p.campoNombre)
  }
  for (const [campoId, campoNombre] of camposConHacienda) {
    const ultima = ultimaPorCampo.get(campoId)
    const hace = ultima ? diasDesde(ultima) : null
    if (hace == null) {
      items.push({
        key: `${campoId}-rec`,
        nivel: 'prevenir',
        icon: Footprints,
        titulo: 'Sin recorridas todavía',
        donde: campoNombre,
        hace: 0,
        sinFecha: true,
        to: '/campos',
      })
    } else if (hace > RECORRER_CADA_DIAS) {
      items.push({
        key: `${campoId}-rec`,
        nivel: 'prevenir',
        icon: CalendarClock,
        titulo: `${haceLabel(hace).replace('hace', 'Hace')} sin recorrer`,
        donde: campoNombre,
        hace,
        to: '/campos',
      })
    }
  }

  const peso: Record<Nivel, number> = { atender: 0, prevenir: 1, nota: 2 }
  items.sort((a, b) => peso[a.nivel] - peso[b.nivel] || a.hace - b.hace)

  const fechas = (recRes.data ?? []).map((r) => r.fecha)
  return {
    items,
    ultimaRecorridaHace: fechas.length ? diasDesde(fechas[0]) : null,
  }
}

const nivelUI: Record<Nivel, { icono: string; chip: string; label: string }> = {
  atender: {
    icono: 'bg-destructive/10 text-destructive',
    chip: 'bg-destructive/10 text-destructive',
    label: 'Atender',
  },
  prevenir: {
    icono: 'bg-sol-soft text-sol-deep',
    chip: 'bg-sol-soft text-sol-deep',
    label: 'Prevenir',
  },
  nota: {
    icono: 'bg-sky-soft text-sky',
    chip: 'bg-secondary text-muted-foreground',
    label: 'Nota',
  },
}

function AtencionRow({ a, i }: { a: Atencion; i: number }) {
  const ui = nivelUI[a.nivel]
  const Icon = a.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.3, ease: 'easeOut' }}
    >
      <Link
        to={a.to}
        className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3 transition-all hover:-translate-y-px hover:border-faint hover:shadow-[0_6px_18px_rgba(16,24,19,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-soft"
      >
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl',
            ui.icono,
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13.5px] font-semibold text-ink">
              {a.titulo}
            </span>
            <span className="shrink-0 text-[12px] font-medium text-faint">
              {a.donde}
            </span>
          </div>
          {a.detalle && (
            <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
              “{a.detalle}”
            </div>
          )}
        </div>
        <span
          className={cn(
            'tnum shrink-0 rounded-md px-2 py-1 text-[11px] font-bold',
            ui.chip,
          )}
        >
          {a.sinFecha
            ? ui.label
            : a.nivel === 'nota' || a.titulo.startsWith('Hace')
              ? haceLabel(a.hace)
              : `${ui.label} · ${haceLabel(a.hace)}`}
        </span>
      </Link>
    </motion.div>
  )
}

/**
 * "Para atender en el campo": traduce las recorridas del Modo Campo a avisos
 * accionables en el Inicio — qué falta (aguadas, pasto, eléctrico), qué
 * prevenir (tratamientos, campos sin recorrer) y las novedades anotadas.
 * Reemplaza a la vieja grilla de potreros (inventario que ya vive en Campos).
 */
export function ParaAtenderCampo() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['para-atender-campo'],
    queryFn: getParaAtender,
  })

  return (
    <Panel
      title="Para atender en el campo"
      info="Lo que dejaron las últimas recorridas: aguadas y pasto al límite, eléctrico cortado, animales en tratamiento, conteos que no cierran y campos sin recorrer. Tocá un aviso para ir al potrero."
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-destructive">
          Error al cargar: {(error as Error).message}
        </p>
      ) : !data || data.ultimaRecorridaHace == null ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4">
          <Footprints className="size-6 shrink-0 text-field/70" />
          <div>
            <p className="text-sm font-medium text-ink">
              Todavía no hay recorridas cargadas.
            </p>
            <p className="text-xs text-faint">
              Recorré el campo desde el teléfono (Modo Campo) y acá vas a ver
              qué atender: aguadas, pasto, eléctrico, tratamientos y novedades.
            </p>
          </div>
        </div>
      ) : data.items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4">
          <CheckCircle2 className="size-6 shrink-0 text-field/70" />
          <div>
            <p className="text-sm font-medium text-ink">
              Todo en orden según las últimas recorridas.
            </p>
            <p className="text-xs text-faint">
              Última recorrida {haceLabel(data.ultimaRecorridaHace)}.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.items.map((a, i) => (
            <AtencionRow key={a.key} a={a} i={i} />
          ))}
        </div>
      )}
    </Panel>
  )
}
