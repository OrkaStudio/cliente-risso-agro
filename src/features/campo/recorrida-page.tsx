import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  CloudRain,
  Copy,
  Flag,
  MapPin,
  PencilRuler,
  Minus,
  Plus,
  RefreshCw,
  Wifi,
} from 'lucide-react'
import { estadoCicloLabel } from '@/features/campos/labels'
import { cn } from '@/lib/utils'
import { useRecorrida } from './recorrida/use-recorrida'
import { Croquis } from './recorrida/croquis'
import type {
  AguaEstado,
  CultivoEstado,
  ElectricoEstado,
  EstadoCiclo,
  PastoEstado,
  UltimaObs,
} from './recorrida/api'
import { CChip, CLabel, CSegBtn, CSheet, NotaVoz, type Tono } from './ui'

const PASTO: { value: PastoEstado; label: string; tono: Tono }[] = [
  { value: 'abundante', label: 'Abund.', tono: 'ok' },
  { value: 'normal', label: 'Normal', tono: 'mid' },
  { value: 'escaso', label: 'Escaso', tono: 'warn' },
  { value: 'pelado', label: 'Pelado', tono: 'bad' },
]
const AGUA: { value: AguaEstado; label: string; tono: Tono }[] = [
  { value: 'llena', label: 'Llena', tono: 'ok' },
  { value: 'normal', label: 'Normal', tono: 'mid' },
  { value: 'baja', label: 'Baja', tono: 'warn' },
  { value: 'seca', label: 'Seca', tono: 'bad' },
]
const ELECTRICO: { value: ElectricoEstado; label: string; tono: Tono }[] = [
  { value: 'ok', label: 'Anda', tono: 'ok' },
  { value: 'cortado', label: 'Cortado', tono: 'bad' },
]
const CULTIVO: { value: CultivoEstado; label: string; tono: Tono }[] = [
  { value: 'bien', label: 'Viene bien', tono: 'ok' },
  { value: 'regular', label: 'Regular', tono: 'warn' },
  { value: 'mal', label: 'Viene mal', tono: 'bad' },
]

/** Potrero en ciclo agrícola: se observa el cultivo, no el pasto. */
const esAgricola = (e: EstadoCiclo) =>
  e === 'preparacion' || e === 'siembra' || e === 'cultivo' || e === 'cosecha'

// Novedades frecuentes: un toque en vez de tipear manejando.
const NOVEDADES = ['Alambre roto', 'Aguada sucia', 'Boyero bajo', 'Hacienda ajena'] as const

type Form = {
  pasto: PastoEstado | null
  agua: AguaEstado | null
  electrico: ElectricoEstado | null
  conteo: number | null
  en_tratamiento: boolean
  novedad: string | null
  cultivo: CultivoEstado | null
}
const FORM_VACIO: Form = {
  pasto: null,
  agua: null,
  electrico: null,
  conteo: null,
  en_tratamiento: false,
  novedad: null,
  cultivo: null,
}

export function RecorridaPage() {
  const r = useRecorrida()
  const [vista, setVista] = useState<'stepper' | 'cierre'>('stepper')

  // Al arrancar OTRA recorrida, la vista vuelve al stepper (si no, quedaba
  // pegada en 'cierre' de la recorrida anterior). Patrón React de "reset de
  // estado al cambiar una prop": setState durante el render, sin effect.
  const recorridaId = r.meta?.recorrida_id
  const [vistaDe, setVistaDe] = useState(recorridaId)
  if (vistaDe !== recorridaId) {
    setVistaDe(recorridaId)
    setVista('stepper')
  }

  if (r.cargando) {
    return (
      <div className="c-label flex h-full items-center justify-center !text-[13px]">
        Cargando…
      </div>
    )
  }

  // Sin recorrida abierta → elegir campo. Lo que haya quedado sin subir NO
  // bloquea: vive en el outbox y avisa con un chip (spec del ciclo de la
  // jornada). Antes esto era una pantalla completa que impedía arrancar otro
  // campo sin señal — justo en el peor momento, en el campo y sin datos.
  if (!r.meta) {
    return <SelectorCampo r={r} />
  }

  if (vista === 'cierre') {
    return <Cierre r={r} onVolver={() => setVista('stepper')} />
  }

  return <Recorrida r={r} onCierre={() => setVista('cierre')} />
}

// ---------------------------------------------------------------------------
// Selector de campo
// ---------------------------------------------------------------------------
function SelectorCampo({ r }: { r: ReturnType<typeof useRecorrida> }) {
  // Nunca se cacheó nada y no hay señal: no se puede armar la recorrida.
  if (!r.tieneRefs && !r.online) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <CloudOff className="size-10 text-[var(--c-faint)]" />
        <p className="c-display text-[16px] text-[var(--c-ink)]">
          Sin señal y sin campos guardados
        </p>
        <p className="text-[13.5px] text-[var(--c-ink-soft)]">
          Entrá una vez con señal para bajar los campos y potreros; de ahí en
          más la recorrida arranca sin conexión.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto p-4">
      <div>
        <h1 className="c-display text-[26px] text-[var(--c-ink)]">
          Recorrida
        </h1>
        <p className="mt-0.5 text-[14px] text-[var(--c-ink-soft)]">
          Elegí el campo. Un potrero por paso: tocás el estado y seguís.
        </p>
        {r.refsActualizado && (
          <button
            type="button"
            disabled={!r.online}
            onClick={() => void r.cargarRefs()}
            className="c-label mt-1.5 flex items-center gap-1 !text-[11px] underline-offset-2 disabled:no-underline enabled:underline"
          >
            <RefreshCw className="size-3" />
            Campos actualizados {haceCuanto(r.refsActualizado)}
            {r.online && ' · tocá para refrescar'}
          </button>
        )}
      </div>
      {r.error && (
        <p className="rounded-lg border border-[var(--c-bad)]/45 bg-[var(--c-bad-soft)] px-3 py-2.5 text-[13px] font-semibold text-[var(--c-bad)]">
          {r.error}
        </p>
      )}
      {!r.online && (
        <p className="c-hazard flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold text-[var(--c-ink)]">
          <CloudOff className="size-4 shrink-0" /> Sin señal: la recorrida
          arranca igual y sube sola cuando vuelva.
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        {r.campos.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={r.iniciando}
            onClick={() => void r.empezar(c)}
            className="c-panel c-hard-sm group flex items-center justify-between px-4 py-4 text-left disabled:opacity-50"
          >
            <span className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]">
                <MapPin className="size-5" />
              </span>
              <span className="c-display text-[18px] text-[var(--c-ink)]">
                {c.nombre}
              </span>
            </span>
            <ChevronRight className="size-5 text-[var(--c-faint)]" />
          </button>
        ))}
        {r.online && r.campos.length === 0 && !r.error && (
          <p className="text-[13px] text-[var(--c-faint)]">
            No hay campos cargados todavía.
          </p>
        )}
      </div>
    </div>
  )
}


// ---------------------------------------------------------------------------
// La recorrida: el croquis ES la pantalla
//
// Antes era un stepper lineal (potrero 1 → 2 → 3) con el croquis escondido en
// un modal detrás de un botón de 28px. Pero el productor no recorre en orden de
// lista: mira el dibujo, decide a qué potrero va, frena, carga y sigue. Ahora
// el mapa es la navegación y vuelve solo después de cada potrero, así que nunca
// tiene que ir a buscarlo (que era cuando se deslogueaba sin querer).
// ---------------------------------------------------------------------------
function Recorrida({
  r,
  onCierre,
}: {
  r: ReturnType<typeof useRecorrida>
  onCierre: () => void
}) {
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [lluviaAbierta, setLluviaAbierta] = useState(false)
  const potrero = r.potreros.find((p) => p.id === abierto) ?? null
  // null = todavía no contestó · 0 = no llovió · >0 = mm del pluviómetro.
  const lluvia = r.meta?.lluvia_mm ?? null
  // Sin ningún potrero dibujado no hay croquis: la recorrida cae a lista.
  const conCroquis = r.potreros.some((p) => p.poligono && p.poligono.length >= 3)

  if (r.total === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-[var(--c-faint)]">
        Este campo no tiene potreros cargados.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header compacto: el mapa se queda con el alto. Volver PAUSA. */}
      <header className="shrink-0 border-b border-[var(--c-line)] bg-[var(--c-bg)] px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void r.pausar()
              navigate('/campo')
            }}
            aria-label="Volver — la recorrida queda abierta"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink)]"
          >
            <ChevronLeft className="size-5" strokeWidth={2.5} />
          </button>
          <span className="min-w-0 flex-1">
            <span className="c-display block truncate text-[16px] text-[var(--c-ink)]">
              {r.meta!.campo_nombre}
            </span>
            <span className="flex items-center gap-1.5">
              {r.online ? (
                <Wifi className="size-3.5 shrink-0 text-[var(--c-ok-deep)]" strokeWidth={2.5} />
              ) : (
                <CloudOff className="size-3.5 shrink-0 text-[var(--c-warn)]" strokeWidth={2.5} />
              )}
              <CLabel className="!text-[11px]">
                {r.hechos} de {r.total} potreros
                {lluvia != null && ` · ${lluvia === 0 ? 'sin lluvia' : `${lluvia} mm`}`}
              </CLabel>
            </span>
          </span>
          <button
            type="button"
            onClick={onCierre}
            className="c-display flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 text-[14px] text-[var(--c-ink)]"
          >
            <Flag className="size-4" />
            Terminar
          </button>
        </div>
      </header>

      {/* La lluvia es un dato del DÍA, no del cierre. Antes vivía solo en la
          pantalla de Cierre y se guardaba recién al terminar: si no terminaba
          la recorrida —que es lo que pasa casi siempre— no se registraba nunca.
          Ahora se pregunta arriba, se guarda al toque y desaparece. */}
      {lluvia == null && (
        <button
          type="button"
          onClick={() => setLluviaAbierta(true)}
          className="flex h-12 shrink-0 items-center justify-center gap-2 border-b border-[var(--c-line)] bg-[var(--c-warn-soft,#fdf3e0)] px-3 text-[14px] font-semibold text-[var(--c-ink)]"
        >
          <CloudRain className="size-[18px]" />
          ¿Llovió? Anotalo ahora
        </button>
      )}

      {conCroquis ? (
        <Croquis potreros={r.potreros} onAbrir={setAbierto} />
      ) : (
        <ListaPotreros r={r} onAbrir={setAbierto} />
      )}

      <LluviaSheet
        open={lluviaAbierta}
        valor={lluvia}
        onCerrar={() => setLluviaAbierta(false)}
        onGuardar={(mm) => {
          void r.setLluvia(mm)
          setLluviaAbierta(false)
        }}
      />

      {/* El parte del potrero sube en una hoja y, al cerrarse, devuelve al
          croquis con el potrero ya pintado. Ese ida y vuelta ES la recorrida. */}
      <CSheet
        open={potrero != null}
        title={potrero ? `Potrero ${potrero.nombre}` : ''}
        onClose={() => setAbierto(null)}
      >
        {potrero && (
          <>
            <PotreroForm
              key={potrero.id}
              nombre={potrero.nombre}
              cabezas={potrero.cabezas}
              estadoCiclo={potrero.estado_ciclo}
              ciclo={
                potrero.eliminado
                  ? 'Ya no existe en Oficina — tu observación se conserva'
                  : estadoCicloLabel[potrero.estado_ciclo]
              }
              ultima={potrero.ultima ?? null}
              inicial={obsAForm(r.obsPorPotrero.get(potrero.id))}
              audio={r.obsPorPotrero.get(potrero.id)?.audio ?? null}
              onGuardar={(f) => void r.guardar(potrero.id, f)}
              onAudio={(b) => void r.setAudio(potrero.id, b)}
            />
            <button
              type="button"
              onClick={() => setAbierto(null)}
              className="c-display c-hard mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-[var(--c-ok)] text-[17px] text-white"
            >
              <Check className="size-5" strokeWidth={2.5} />
              Listo, volver al croquis
            </button>
          </>
        )}
      </CSheet>
    </div>
  )
}

/**
 * ¿Llovió? Se responde durante la recorrida, no al cerrarla.
 *
 * "No llovió" es una respuesta de primera clase (0 mm), no la ausencia de
 * respuesta: misma filosofía que el parte del potrero, donde "sin novedad"
 * también es dato. Sin eso no se puede distinguir un día seco de un día que
 * nadie registró — y la serie de lluvias es lo que después sostiene la
 * comparación contra el promedio.
 */
function LluviaSheet({
  open,
  valor,
  onCerrar,
  onGuardar,
}: {
  open: boolean
  valor: number | null
  onCerrar: () => void
  onGuardar: (mm: number) => void
}) {
  const [mm, setMm] = useState(valor ?? 10)
  return (
    <CSheet open={open} title="Lluvia de hoy" onClose={onCerrar}>
      <button
        type="button"
        onClick={() => onGuardar(0)}
        className="c-hard-sm mb-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[16px] font-semibold text-[var(--c-ink)]"
      >
        No llovió
      </button>
      <CLabel className="mb-2 !text-[12px]">Sí llovió — cuántos mm</CLabel>
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          onClick={() => setMm((v) => Math.max(1, v - 5))}
          aria-label="Restar 5 mm"
          className="c-hard-sm flex size-14 shrink-0 items-center justify-center rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-panel)]"
        >
          <Minus className="size-6" strokeWidth={2.5} />
        </button>
        <div className="flex h-14 min-w-0 flex-1 items-center justify-center rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-sunk)]">
          <span className="c-mono text-[24px] font-bold text-[var(--c-ink)]">
            {mm} mm
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMm((v) => v + 5)}
          aria-label="Sumar 5 mm"
          className="c-hard-sm flex size-14 shrink-0 items-center justify-center rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-panel)]"
        >
          <Plus className="size-6" strokeWidth={2.5} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => onGuardar(mm)}
        className="c-display c-hard mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-[var(--c-ok)] text-[17px] text-white"
      >
        <CloudRain className="size-5" />
        Guardar {mm} mm
      </button>
    </CSheet>
  )
}

/** Campo sin potreros dibujados: mismo flujo, lista en vez de mapa. */
function ListaPotreros({
  r,
  onAbrir,
}: {
  r: ReturnType<typeof useRecorrida>
  onAbrir: (id: string) => void
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="c-hazard mb-3 flex items-start gap-2.5 rounded-xl border px-3 py-2.5">
        <PencilRuler className="mt-0.5 size-4 shrink-0 text-[var(--c-ink)]" />
        <p className="text-[12.5px] leading-snug text-[var(--c-ink)]">
          Este campo todavía no tiene los potreros dibujados, así que no hay
          croquis para ubicarte. Se dibujan una vez desde Modo Oficina, en Campos.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {r.potreros.map((p) => {
          const hecho = p.hecho === 1
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onAbrir(p.id)}
              className={cn(
                'c-hard-sm flex h-16 items-center gap-3 rounded-xl border px-4 text-left',
                hecho
                  ? 'border-transparent bg-[var(--c-ok)] text-white'
                  : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink)]',
              )}
            >
              <span className="c-display flex-1 truncate text-[19px]">{p.nombre}</span>
              {hecho ? (
                <Check className="size-5 shrink-0" strokeWidth={3} />
              ) : (
                <ChevronRight className="size-5 shrink-0 text-[var(--c-faint)]" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function obsAForm(
  o: ReturnType<ReturnType<typeof useRecorrida>['obsPorPotrero']['get']>,
): Form {
  if (!o) return FORM_VACIO
  return {
    pasto: o.pasto,
    agua: o.agua,
    electrico: o.electrico,
    conteo: o.conteo,
    en_tratamiento: o.en_tratamiento,
    novedad: o.novedad,
    cultivo: o.cultivo,
  }
}

const fmtFecha = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** "hace 3 min" / "hace 2 h" / "hace 3 días" para la frescura del cache. */
function haceCuanto(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} días`
}

function resumenUltima(u: UltimaObs, agricola: boolean): string {
  const partes: string[] = []
  if (agricola) {
    if (u.cultivo) partes.push(`cultivo ${u.cultivo}`)
  } else {
    if (u.pasto) partes.push(`pasto ${u.pasto}`)
    if (u.agua) partes.push(`agua ${u.agua}`)
    if (u.electrico) partes.push(`boyero ${u.electrico === 'ok' ? 'anda' : 'cortado'}`)
  }
  if (u.en_tratamiento) partes.push('en tratamiento')
  return partes.length ? partes.join(' · ') : 'sin estados cargados'
}

// ---------------------------------------------------------------------------
// Formulario de un potrero
// ---------------------------------------------------------------------------
function PotreroForm({
  nombre,
  cabezas,
  estadoCiclo,
  ciclo,
  ultima,
  inicial,
  audio,
  onGuardar,
  onAudio,
}: {
  nombre: string
  cabezas: number
  estadoCiclo: EstadoCiclo
  ciclo: string
  ultima: UltimaObs | null
  inicial: Form
  audio: Blob | null
  onGuardar: (f: Form) => void
  onAudio: (b: Blob | null) => void
}) {
  // La novedad guardada se descompone: chips conocidos → seleccionados,
  // el resto queda como texto libre.
  const [novChips, setNovChips] = useState<Set<string>>(() => {
    const partes = (inicial.novedad ?? '').split(' · ')
    return new Set(partes.filter((p) => (NOVEDADES as readonly string[]).includes(p)))
  })
  const [novLibre, setNovLibre] = useState(() =>
    (inicial.novedad ?? '')
      .split(' · ')
      .filter((p) => !(NOVEDADES as readonly string[]).includes(p))
      .join(' · '),
  )
  const [form, setForm] = useState<Form>(inicial)

  const agricola = esAgricola(estadoCiclo)
  // Conteo/tratamiento solo donde hay hacienda: potrero ganadero, o cualquier
  // otro con cabezas esperadas (p. ej. pastoreando un rastrojo).
  const conHacienda = estadoCiclo === 'ganadero' || cabezas > 0

  const componer = (chips: Set<string>, libre: string): string | null => {
    const s = [...chips, libre.trim()].filter(Boolean).join(' · ')
    return s || null
  }

  // Persiste apenas cambia algo (upsert idempotente en Dexie + cola).
  const commit = (next: Form) => {
    setForm(next)
    onGuardar(next)
  }

  const toggleNovedad = (n: string) => {
    const chips = new Set(novChips)
    if (chips.has(n)) chips.delete(n)
    else chips.add(n)
    setNovChips(chips)
    commit({ ...form, novedad: componer(chips, novLibre) })
  }

  const ajustarConteo = (delta: number) => {
    const base = form.conteo ?? (delta > 0 ? 0 : 0)
    commit({ ...form, conteo: Math.max(0, base + delta) })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Contexto del potrero: lo que el productor necesita saber al pisar */}
      <div className="c-panel px-4 py-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="c-display min-w-0 truncate text-[24px] text-[var(--c-ink)]">
            {nombre}
          </h2>
          <div className="shrink-0 text-right leading-none">
            <span className="c-mono text-[22px] font-bold text-[var(--c-ink)]">
              {cabezas}
            </span>
            <CLabel className="mt-0.5">cab. esperadas</CLabel>
          </div>
        </div>
        <CLabel className="mt-1">{ciclo}</CLabel>
      </div>

      {/* Trae los ESTADOS de la última observación (no el conteo ni la novedad
          — esos son del día) para que el productor los REVISE y ajuste; no
          avanza solo (puede que no se acuerde y quiera cambiar algo). */}
      {ultima && (
        <button
          type="button"
          onClick={() =>
            commit({
              ...form,
              pasto: agricola ? null : ultima.pasto,
              agua: agricola ? null : ultima.agua,
              electrico: agricola ? null : ultima.electrico,
              cultivo: agricola ? ultima.cultivo : null,
              en_tratamiento: ultima.en_tratamiento,
            })
          }
          className="c-hard-sm flex items-center justify-between gap-2 rounded-lg border border-[var(--c-ok)]/45 bg-[var(--c-ok-soft)] px-3.5 py-3 text-left"
        >
          <span className="min-w-0">
            <span className="c-display block text-[15px] text-[var(--c-ok-deep)]">
              Traer la última vez
            </span>
            <span className="c-label mt-0.5 block truncate">
              {resumenUltima(ultima, agricola)} · {fmtFecha(ultima.fecha)}
            </span>
          </span>
          <Copy className="size-5 shrink-0 text-[var(--c-ok-deep)]" />
        </button>
      )}

      {agricola ? (
        <div>
          <CLabel className="mb-1.5">Cultivo · ¿cómo viene?</CLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {CULTIVO.map((o) => (
              <CSegBtn
                key={o.value}
                label={o.label}
                tono={o.tono}
                selected={form.cultivo === o.value}
                onClick={() => commit({ ...form, cultivo: o.value })}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div>
            <CLabel className="mb-1.5">Pasto · ¿cómo está?</CLabel>
            <Segmento opciones={PASTO} value={form.pasto} onChange={(v) => commit({ ...form, pasto: v })} />
          </div>

          <div>
            <CLabel className="mb-1.5">Agua · aguadas y bebederos</CLabel>
            <Segmento opciones={AGUA} value={form.agua} onChange={(v) => commit({ ...form, agua: v })} />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <CLabel className="mb-1.5">Boyero eléctrico</CLabel>
              <Segmento
                opciones={ELECTRICO}
                value={form.electrico}
                onChange={(v) => commit({ ...form, electrico: v })}
              />
            </div>
            {conHacienda && (
              <div>
                <CLabel className="mb-1.5">¿En tratam.?</CLabel>
                <CSegBtn
                  label={form.en_tratamiento ? 'Sí' : 'No'}
                  tono="warn"
                  selected={form.en_tratamiento}
                  onClick={() => commit({ ...form, en_tratamiento: !form.en_tratamiento })}
                  className="w-20"
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Conteo: −/+ y un toque "= esperado" — sin teclado. Solo donde hay
          (o debería haber) hacienda. */}
      {conHacienda && (
      <div>
        <CLabel className="mb-1.5">Conteo de cabezas · opcional</CLabel>
        <div className="flex items-stretch gap-1.5">
          <button
            type="button"
            onClick={() => ajustarConteo(-1)}
            aria-label="Restar"
            className="c-hard-sm flex h-13 w-13 shrink-0 items-center justify-center rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink)]"
          >
            <Minus className="size-5" strokeWidth={2.5} />
          </button>
          <div className="c-panel flex h-13 min-w-0 flex-1 items-center justify-center">
            <span
              className={cn(
                'c-mono text-[24px] font-bold',
                form.conteo != null ? 'text-[var(--c-ink)]' : 'text-[var(--c-faint)]',
              )}
            >
              {form.conteo ?? '—'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => ajustarConteo(1)}
            aria-label="Sumar"
            className="c-hard-sm flex h-13 w-13 shrink-0 items-center justify-center rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink)]"
          >
            <Plus className="size-5" strokeWidth={2.5} />
          </button>
          {cabezas > 0 && (
            <button
              type="button"
              onClick={() => commit({ ...form, conteo: cabezas })}
              className={cn(
                'c-display shrink-0 rounded-lg border-2 px-2.5 text-[13px] uppercase',
                form.conteo === cabezas
                  ? 'border-[var(--c-ink)] bg-[var(--c-ok)] text-white'
                  : 'border-[var(--c-ink)]/30 bg-[var(--c-panel)] text-[var(--c-ok-deep)]',
              )}
            >
              = {cabezas}
            </button>
          )}
        </div>
        {form.conteo != null && cabezas > 0 && form.conteo !== cabezas && (
          <p className="c-label mt-1 !text-[11px] !text-[var(--c-warn)]">
            {form.conteo < cabezas
              ? `Faltan ${cabezas - form.conteo} de las esperadas`
              : `${form.conteo - cabezas} de más que lo esperado`}
          </p>
        )}
      </div>
      )}

      {/* Novedad por chips + libre */}
      <div>
        <CLabel className="mb-1.5">Novedades · opcional</CLabel>
        <div className="c-strip -mx-4 flex gap-1.5 px-4">
          {NOVEDADES.map((n) => (
            <CChip key={n} label={n} selected={novChips.has(n)} onClick={() => toggleNovedad(n)} />
          ))}
        </div>
        <input
          value={novLibre}
          onChange={(e) => setNovLibre(e.target.value)}
          onBlur={() => onGuardar({ ...form, novedad: componer(novChips, novLibre) })}
          autoComplete="off"
          placeholder="Otra novedad…"
          className="mt-1.5 h-10 w-full rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 text-[14px] text-[var(--c-ink)] outline-none focus:border-[var(--c-ok)]"
        />
        <NotaVoz audio={audio} onAudio={onAudio} />
      </div>
    </div>
  )
}


function Segmento<T extends string>({
  opciones,
  value,
  onChange,
}: {
  opciones: { value: T; label: string; tono: Tono }[]
  value: T | null
  onChange: (v: T) => void
}) {
  return (
    <div
      className={cn(
        'grid gap-1.5',
        opciones.length === 2 ? 'grid-cols-2' : 'grid-cols-4',
      )}
    >
      {opciones.map((o) => (
        <CSegBtn
          key={o.value}
          label={o.label}
          tono={o.tono}
          selected={value === o.value}
          onClick={() => onChange(o.value)}
        />
      ))}
    </div>
  )
}


// ---------------------------------------------------------------------------
// Cierre
// ---------------------------------------------------------------------------
function Cierre({
  r,
  onVolver,
}: {
  r: ReturnType<typeof useRecorrida>
  onVolver: () => void
}) {
  const [mm, setMm] = useState<number | null>(r.meta?.lluvia_mm ?? null)
  const [terminando, setTerminando] = useState(false)

  // Potreros que necesitan atención (para el resumen).
  const atencion = useMemo(() => {
    const items: { nombre: string; motivos: string[] }[] = []
    for (const p of r.potreros) {
      const o = r.obsPorPotrero.get(p.id)
      if (!o) continue
      const motivos: string[] = []
      if (o.pasto === 'escaso' || o.pasto === 'pelado') motivos.push(`pasto ${o.pasto}`)
      if (o.agua === 'baja' || o.agua === 'seca') motivos.push(`agua ${o.agua}`)
      if (o.electrico === 'cortado') motivos.push('boyero cortado')
      if (o.cultivo === 'regular' || o.cultivo === 'mal') motivos.push(`cultivo ${o.cultivo}`)
      if (o.en_tratamiento) motivos.push('en tratamiento')
      if (o.novedad) motivos.push(o.novedad)
      if (o.audio || o.audio_path) motivos.push('nota de voz')
      if (motivos.length) items.push({ nombre: p.nombre, motivos })
    }
    return items
  }, [r.potreros, r.obsPorPotrero])

  const terminar = async () => {
    setTerminando(true)
    await r.setLluvia(mm)
    await r.terminar()
    // al terminar, meta se limpia → RecorridaPage vuelve al selector
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="c-panel flex size-10 shrink-0 items-center justify-center text-[var(--c-ok-deep)]">
            <Flag className="size-5" />
          </span>
          <h1 className="c-display text-[22px] text-[var(--c-ink)]">
            Cierre de recorrida
          </h1>
        </div>

        <div className="c-panel px-4 py-3 text-[15px] text-[var(--c-ink)]">
          Recorriste{' '}
          <span className="c-mono font-bold text-[var(--c-ok-deep)]">
            {r.hechos}/{r.total}
          </span>{' '}
          potreros de {r.meta?.campo_nombre}.
        </div>

        {/* Necesita atención */}
        <div>
          <CLabel className="mb-2 flex items-center gap-1.5 !text-[12px]">
            <AlertTriangle className="size-4 text-[var(--c-warn)]" /> Necesita atención
          </CLabel>
          {atencion.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-[var(--c-ok)]/45 bg-[var(--c-ok-soft)] px-3 py-2.5 text-[14px] font-semibold text-[var(--c-ok-deep)]">
              <Check className="size-4" /> Todo en orden.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {atencion.map((a) => (
                <div
                  key={a.nombre}
                  className="rounded-lg border border-[var(--c-warn)]/45 bg-[var(--c-warn-soft)] px-3 py-2"
                >
                  <span className="c-display text-[14px] uppercase text-[var(--c-ink)]">
                    {a.nombre}
                  </span>
                  <span className="ml-2 text-[13px] text-[var(--c-ink-soft)]">
                    {a.motivos.join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lluvia: stepper de a 5 mm, sin teclado */}
        <div className="c-panel p-3.5">
          <CLabel className="mb-2 flex items-center gap-1.5 !text-[12px]">
            <CloudRain className="size-4 text-[var(--c-ok-deep)]" /> Lluvia de hoy · opcional
          </CLabel>
          <div className="flex items-stretch gap-1.5">
            <button
              type="button"
              onClick={() => setMm((v) => Math.max(0, (v ?? 0) - 5))}
              aria-label="Restar lluvia"
              className="c-hard-sm flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)]"
            >
              <Minus className="size-5" strokeWidth={2.5} />
            </button>
            <div className="flex h-12 min-w-0 flex-1 items-center justify-center rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-sunk)]">
              <span
                className={cn(
                  'c-mono text-[22px] font-bold',
                  mm != null ? 'text-[var(--c-ink)]' : 'text-[var(--c-faint)]',
                )}
              >
                {mm != null ? `${mm} mm` : '— mm'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMm((v) => (v ?? 0) + 5)}
              aria-label="Sumar lluvia"
              className="c-hard-sm flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-panel)]"
            >
              <Plus className="size-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Acciones (footer fijo) */}
      <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--c-line)] bg-[var(--c-bg)] px-4 pb-4 pt-3">
        <button
          type="button"
          disabled={terminando}
          onClick={() => void terminar()}
          className="c-display c-hard flex h-14 items-center justify-center gap-2.5 rounded-xl border border-transparent bg-[var(--c-ok)] text-[17px] text-white disabled:opacity-60"
        >
          <Check className="size-6" strokeWidth={2.5} />
          {terminando ? 'Guardando…' : 'Terminar y guardar'}
        </button>
        <button
          type="button"
          onClick={onVolver}
          className="c-display flex h-11 items-center justify-center rounded-xl border border-[var(--c-line-strong)] text-[14px] text-[var(--c-ink-soft)]"
        >
          Volver a los potreros
        </button>
      </div>
    </div>
  )
}
