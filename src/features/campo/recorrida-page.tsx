import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  CloudRain,
  Droplet,
  Flag,
  Hash,
  History,
  MessageSquare,
  PencilRuler,
  Minus,
  Plus,
  RefreshCw,
  Sprout,
  Stethoscope,
  Wifi,
  Zap,
} from 'lucide-react'
import { estadoCicloLabel } from '@/features/campos/labels'
import { cn } from '@/lib/utils'
import { useRecorrida, type RecPotrero } from './recorrida/use-recorrida'
import { Croquis } from './recorrida/croquis'
import { diasDesde, haceCuantoTxt } from './recorrida/api'
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
  // ?cambiar=1 → el hub pide elegir OTRO campo aunque ya haya una recorrida
  // abierta. Sin esto, /campo/recorrida con recorrida abierta va directo al
  // croquis y no hay forma de cambiar de campo sin terminar primero.
  const [sp, setSp] = useSearchParams()
  const cambiando = sp.get('cambiar') === '1'

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
  if (!r.meta || cambiando) {
    return (
      <SelectorCampo
        r={r}
        cambiando={cambiando && r.meta != null}
        onElegido={() => setSp({}, { replace: true })}
      />
    )
  }

  if (vista === 'cierre') {
    return <Cierre r={r} onVolver={() => setVista('stepper')} />
  }

  return <Recorrida r={r} onCierre={() => setVista('cierre')} />
}

// ---------------------------------------------------------------------------
// Selector de campo
// ---------------------------------------------------------------------------
function SelectorCampo({
  r,
  cambiando = false,
  onElegido,
}: {
  r: ReturnType<typeof useRecorrida>
  /** true = ya hay una recorrida abierta y se está eligiendo OTRO campo. */
  cambiando?: boolean
  onElegido?: () => void
}) {
  // Campos con una recorrida ABIERTA (pausada o activa) → se retoman con su
  // avance; los demás se empiezan de cero. Nada se cierra al elegir otro.
  const abiertasPorCampo = new Map(r.abiertas.map((a) => [a.campoId, a]))
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
          {cambiando ? 'Cambiar de campo' : 'Recorrida'}
        </h1>
        <p className="mt-0.5 text-[14px] text-[var(--c-ink-soft)]">
          {cambiando
            ? 'Elegí a qué campo vas. Las abiertas quedan guardadas con su avance; saltás entre campos sin perder nada.'
            : 'Elegí el campo. Un potrero por paso: tocás el estado y seguís.'}
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
        {r.campos.map((c) => {
          const abierta = abiertasPorCampo.get(c.id)
          const color = r.colorCampo(c.id)
          return (
            <button
              key={c.id}
              type="button"
              disabled={r.iniciando}
              onClick={async () => {
                // empezar() retoma si ya hay abierta para el campo (no la pisa),
                // o crea una nueva. Las OTRAS abiertas quedan pausadas.
                await r.empezar(c)
                onElegido?.()
              }}
              className="c-hard-sm group flex items-center justify-between rounded-2xl border-2 border-l-[6px] bg-[var(--c-panel)] px-4 py-4 text-left disabled:opacity-50"
              style={{ borderColor: color.hex }}
            >
              <span className="flex items-center gap-3">
                <span
                  className="c-display flex size-11 shrink-0 items-center justify-center rounded-xl text-[19px] text-white"
                  style={{ background: color.hex }}
                >
                  {color.letra}
                </span>
                <span className="min-w-0">
                  <span className="c-display block text-[19px] text-[var(--c-ink)]">
                    {c.nombre}
                  </span>
                  {abierta ? (
                    <CLabel className="!text-[11px] !text-[var(--c-ok-deep)]">
                      Abierta · {abierta.hechos}/{abierta.total} · seguir
                    </CLabel>
                  ) : (
                    <CLabel className="!text-[11px]">Empezar</CLabel>
                  )}
                </span>
              </span>
              <ChevronRight className="size-6 shrink-0 text-[var(--c-faint)]" />
            </button>
          )
        })}
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
  const [panelAbierto, setPanelAbierto] = useState(false)
  const potrero = r.potreros.find((p) => p.id === abierto) ?? null
  // null = todavía no contestó · 0 = no llovió · >0 = mm del pluviómetro.
  const lluvia = r.meta?.lluvia_mm ?? null

  // Pendientes de ESTA sesión, ordenados por atraso: nunca recorridos primero,
  // después de más a menos días. Es lo que alimenta el panel y su conteo.
  const pendientes = r.potreros
    .filter((p) => p.hecho === 0)
    .map((p) => ({ p, dias: diasDesde(p.ultima?.fecha) }))
    .sort((a, b) => {
      if (a.dias == null) return b.dias == null ? 0 : -1
      if (b.dias == null) return 1
      return b.dias - a.dias
    })
  // Sin ningún potrero dibujado no hay croquis: la recorrida cae a lista.
  const conCroquis = r.potreros.some((p) => p.poligono && p.poligono.length >= 3)

  if (r.total === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-[var(--c-faint)]">
        Este campo no tiene potreros cargados.
      </div>
    )
  }

  // Parte de un potrero: PANTALLA COMPLETA, no una hoja a media altura. El
  // productor está en el campo y necesita toda la pantalla — grande, cómoda,
  // sin el mapa oscurecido atrás compitiendo por la atención.
  if (potrero) {
    return (
      <ParteScreen
        potrero={potrero}
        r={r}
        onVolver={() => setAbierto(null)}
      />
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
          {/* Chip de color IDENTIDAD del campo (mismo que Modo Oficina): mientras
              recorrés varios campos, sabés en cuál estás de un vistazo. */}
          <span
            className="c-display flex size-9 shrink-0 items-center justify-center rounded-lg text-[16px] text-white"
            style={{ background: r.colorCampo(r.meta!.campo_id).hex }}
          >
            {r.colorCampo(r.meta!.campo_id).letra}
          </span>
          {/* El progreso ES el disparador del panel: el número que leés
              ("2 de 12") es el que tocás para ver qué falta. Antes había un
              botón ⏱ aparte que decía lo mismo y apretaba el header. */}
          <button
            type="button"
            disabled={pendientes.length === 0}
            onClick={() => setPanelAbierto(true)}
            aria-label={
              pendientes.length > 0
                ? `${pendientes.length} potreros por recorrer — ver la lista`
                : undefined
            }
            className="flex min-w-0 flex-1 flex-col items-start text-left disabled:opacity-100"
          >
            <span className="c-display block max-w-full truncate text-[16px] text-[var(--c-ink)]">
              {r.meta!.campo_nombre}
            </span>
            <span className="flex items-center gap-1.5">
              {r.online ? (
                <Wifi className="size-3.5 shrink-0 text-[var(--c-ok-deep)]" strokeWidth={2.5} />
              ) : (
                <CloudOff className="size-3.5 shrink-0 text-[var(--c-warn)]" strokeWidth={2.5} />
              )}
              <CLabel className="!text-[11px]">
                {r.hechos} de {r.total}
                {lluvia != null && ` · ${lluvia === 0 ? 'sin lluvia' : `${lluvia} mm`}`}
              </CLabel>
              {pendientes.length > 0 && (
                <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--c-sunk)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--c-ink-soft)]">
                  <History className="size-3" strokeWidth={2.5} />
                  {pendientes.length}
                </span>
              )}
            </span>
          </button>
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

      {/* Panel de atrasados: lista, no informe. Cada fila lleva DIRECTO al
          parte de ese potrero — es un atajo de navegación hacia lo que falta. */}
      <CSheet
        open={panelAbierto}
        title="Lo que falta recorrer"
        onClose={() => setPanelAbierto(false)}
      >
        <div className="flex flex-col gap-1.5">
          {pendientes.map(({ p, dias }) => {
            const nunca = dias == null
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPanelAbierto(false)
                  setAbierto(p.id)
                }}
                className="c-hard-sm flex h-14 items-center gap-3 rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-4 text-left"
              >
                <span className="c-display w-14 shrink-0 text-[18px] text-[var(--c-ink)]">
                  {p.nombre}
                </span>
                <span
                  className={cn(
                    'flex-1 text-[14px]',
                    nunca
                      ? 'font-semibold text-[var(--c-warn)]'
                      : 'text-[var(--c-ink-soft)]',
                  )}
                >
                  {nunca ? 'Sin recorrer nunca' : haceCuantoTxt(dias)}
                </span>
                <ChevronRight className="size-5 shrink-0 text-[var(--c-faint)]" />
              </button>
            )
          })}
        </div>
      </CSheet>

      <LluviaSheet
        open={lluviaAbierta}
        valor={lluvia}
        onCerrar={() => setLluviaAbierta(false)}
        onGuardar={(mm) => {
          void r.setLluvia(mm)
          setLluviaAbierta(false)
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Parte de un potrero — PANTALLA COMPLETA
//
// El productor está en el campo: necesita toda la pantalla para leer y tocar
// cómodo, no una hoja a media altura con el mapa oscurecido atrás. Header con
// la identidad del potrero, cuerpo scrolleable y una acción fija abajo (zona
// del pulgar) para volver al croquis.
// ---------------------------------------------------------------------------
function ParteScreen({
  potrero,
  r,
  onVolver,
}: {
  potrero: RecPotrero
  r: ReturnType<typeof useRecorrida>
  onVolver: () => void
}) {
  const cicloTxt = potrero.eliminado
    ? 'Ya no existe en Oficina — tu observación se conserva'
    : estadoCicloLabel[potrero.estado_ciclo]
  const obs = r.obsPorPotrero.get(potrero.id)
  const yaCargado = obs != null

  return (
    <div className="flex h-full flex-col bg-[var(--c-bg)]">
      {/* Header: volver al croquis + identidad del potrero, grande y legible */}
      <header className="shrink-0 border-b border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 py-2.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onVolver}
            aria-label="Volver al croquis"
            className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--c-ink)]/15 bg-[var(--c-panel)] text-[var(--c-ink)] active:scale-95"
          >
            <ChevronLeft className="size-7" strokeWidth={2.5} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="c-display truncate text-[26px] leading-none text-[var(--c-ink)]">
              {potrero.nombre}
            </h1>
            {/* Señal de guardado: no hay botón "Guardar" porque cada toque se
                guarda solo — esta línea lo hace VISIBLE. El chip reanima
                (key=updated_at) en cada guardado, así el productor ve que quedó. */}
            <div className="mt-1 flex items-center gap-1.5">
              <span className="c-label min-w-0 truncate !text-[11px]">{cicloTxt}</span>
              {yaCargado && (
                <span
                  key={obs.updated_at}
                  className="c-stamp inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--c-ok-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--c-ok-deep)]"
                >
                  <Check className="size-3" strokeWidth={3} />
                  Guardado
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 rounded-xl bg-[var(--c-sunk)] px-3 py-1.5 text-center leading-none">
            <span className="c-mono block text-[22px] font-bold text-[var(--c-ink)]">
              {potrero.cabezas}
            </span>
            <CLabel className="mt-1 !text-[9.5px]">cab. esperadas</CLabel>
          </div>
        </div>
      </header>

      {/* Cuerpo scrolleable */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <PotreroForm
          key={potrero.id}
          cabezas={potrero.cabezas}
          estadoCiclo={potrero.estado_ciclo}
          ultima={potrero.ultima ?? null}
          inicial={obsAForm(r.obsPorPotrero.get(potrero.id))}
          yaEnSesion={yaCargado}
          audio={r.obsPorPotrero.get(potrero.id)?.audio ?? null}
          onGuardar={(f) => void r.guardar(potrero.id, f)}
          onAudio={(b) => void r.setAudio(potrero.id, b)}
        />
      </div>

      {/* Acción fija: volver al croquis. Neutro (tinta), NO verde — el verde es
          confirmar; volver es navegación, guarde o no (lo cargado ya se guardó
          al tocar cada control). */}
      <div className="shrink-0 border-t border-[var(--c-line-strong)] bg-[var(--c-bg)] px-4 pb-4 pt-3">
        <button
          type="button"
          onClick={onVolver}
          className="c-display c-hard flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-[var(--c-ink)] text-[17px] text-white active:scale-[0.99]"
        >
          {yaCargado ? (
            <>
              <Check className="size-5" strokeWidth={2.5} />
              Listo, volver al croquis
            </>
          ) : (
            <>
              <ChevronLeft className="size-5" strokeWidth={2.5} />
              Volver al croquis
            </>
          )}
        </button>
      </div>
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
/** Rótulo de sección con ícono: ancla la pregunta para que el productor la
 *  ubique de un vistazo. La PREGUNTA es neutra (ícono en chip tinta); la
 *  RESPUESTA lleva el color (los botones de estado). Así se escanea sin ruido. */
function SeccionLabel({
  icon: Icon,
  children,
}: {
  icon: typeof Sprout
  children: React.ReactNode
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--c-sunk)] text-[var(--c-ink)]">
        <Icon className="size-[15px]" strokeWidth={2.25} />
      </span>
      <span className="c-label !text-[12px] !text-[var(--c-ink-soft)]">{children}</span>
    </div>
  )
}

/** Campos de ESTADO que se pueden proponer desde la última vez (no el conteo
 *  ni la novedad, que son del día). */
type CampoEstado = 'pasto' | 'agua' | 'electrico' | 'cultivo' | 'en_tratamiento'

function PotreroForm({
  cabezas,
  estadoCiclo,
  ultima,
  inicial,
  yaEnSesion,
  audio,
  onGuardar,
  onAudio,
}: {
  cabezas: number
  estadoCiclo: EstadoCiclo
  ultima: UltimaObs | null
  inicial: Form
  /** true = ya se cargó en ESTA recorrida (no proponemos, editamos lo cargado). */
  yaEnSesion: boolean
  audio: Blob | null
  onGuardar: (f: Form) => void
  onAudio: (b: Blob | null) => void
}) {
  const agricola = esAgricola(estadoCiclo)

  // ---- Modo propuesta -------------------------------------------------------
  // Al abrir un potrero con historial que aún no se tocó en esta recorrida, los
  // controles arrancan PRE-CARGADOS con lo de la última vez, pero en estado
  // "propuesto" (punteado), NO confirmado. Nada se escribe en Dexie hasta que el
  // productor hace un acto explícito — tocar un control o "Está igual que la
  // última vez". Así abrir y cerrar sin mirar no registra un parte que nadie vio
  // (ley de la observación fechada, [D8] / TASK-034).
  const propuestaInicial: Set<CampoEstado> = (() => {
    if (yaEnSesion || !ultima) return new Set()
    const s = new Set<CampoEstado>()
    if (agricola) {
      if (ultima.cultivo) s.add('cultivo')
    } else {
      if (ultima.pasto) s.add('pasto')
      if (ultima.agua) s.add('agua')
      if (ultima.electrico) s.add('electrico')
    }
    if (ultima.en_tratamiento) s.add('en_tratamiento')
    return s
  })()

  const formInicial: Form =
    propuestaInicial.size > 0
      ? {
          ...FORM_VACIO,
          pasto: agricola ? null : (ultima?.pasto ?? null),
          agua: agricola ? null : (ultima?.agua ?? null),
          electrico: agricola ? null : (ultima?.electrico ?? null),
          cultivo: agricola ? (ultima?.cultivo ?? null) : null,
          en_tratamiento: ultima?.en_tratamiento ?? false,
        }
      : inicial

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
  const [form, setForm] = useState<Form>(formInicial)
  const [propuestos, setPropuestos] = useState<Set<CampoEstado>>(propuestaInicial)
  const esProp = (k: CampoEstado) => propuestos.has(k)

  // Conteo/tratamiento solo donde hay hacienda: potrero ganadero, o cualquier
  // otro con cabezas esperadas (p. ej. pastoreando un rastrojo).
  const conHacienda = estadoCiclo === 'ganadero' || cabezas > 0

  const componer = (chips: Set<string>, libre: string): string | null => {
    const s = [...chips, libre.trim()].filter(Boolean).join(' · ')
    return s || null
  }

  // Persiste apenas cambia algo (upsert idempotente en Dexie + cola). El primer
  // commit ES el acto explícito que confirma el potrero.
  const commit = (next: Form, confirma?: CampoEstado) => {
    setForm(next)
    if (confirma && propuestos.has(confirma)) {
      const s = new Set(propuestos)
      s.delete(confirma)
      setPropuestos(s)
    }
    onGuardar(next)
  }

  /** "Está igual que la última vez": confirma TODO lo propuesto de un toque. */
  const confirmarTodo = () => {
    setPropuestos(new Set())
    onGuardar(form)
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

  const hayPropuesta = propuestos.size > 0

  return (
    <div className="flex flex-col gap-4">
      {/* Franja "así estaba": cuando hay propuesta, los controles muestran lo
          de la última vez PUNTEADO (propuesto, sin confirmar). Un toque en
          "Está igual" confirma todo; tocar un control confirma ese campo. Abrir
          y cerrar sin tocar nada NO registra observación. */}
      {ultima && hayPropuesta && (
        <div className="c-hard-sm rounded-xl border-2 border-dashed border-[var(--c-ok)] bg-[var(--c-ok-soft)] px-3.5 py-3">
          <div className="flex items-start gap-2">
            <History className="mt-0.5 size-[18px] shrink-0 text-[var(--c-ok-deep)]" strokeWidth={2.25} />
            <div className="min-w-0 flex-1">
              <span className="c-display block text-[15px] text-[var(--c-ok-deep)]">
                Así estaba {fmtFecha(ultima.fecha)}
                {diasDesde(ultima.fecha) != null && ` · ${haceCuantoTxt(diasDesde(ultima.fecha))}`}
              </span>
              <span className="mt-0.5 block text-[13px] font-semibold text-[var(--c-ink-soft)]">
                {resumenUltima(ultima, agricola)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={confirmarTodo}
            className="c-display c-hard mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-[var(--c-ok)] text-[16px] text-white active:scale-[0.99]"
          >
            <Check className="size-5" strokeWidth={2.5} />
            Está igual que la última vez
          </button>
        </div>
      )}

      {agricola ? (
        <div>
          <SeccionLabel icon={Sprout}>Cultivo · ¿cómo viene?</SeccionLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {CULTIVO.map((o) => (
              <CSegBtn
                key={o.value}
                label={o.label}
                tono={o.tono}
                selected={form.cultivo === o.value && !esProp('cultivo')}
                propuesto={form.cultivo === o.value && esProp('cultivo')}
                onClick={() => commit({ ...form, cultivo: o.value }, 'cultivo')}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div>
            <SeccionLabel icon={Sprout}>Pasto · ¿cómo está?</SeccionLabel>
            <Segmento
              opciones={PASTO}
              value={form.pasto}
              propuesto={esProp('pasto')}
              onChange={(v) => commit({ ...form, pasto: v }, 'pasto')}
            />
          </div>

          <div>
            <SeccionLabel icon={Droplet}>Agua · aguadas y bebederos</SeccionLabel>
            <Segmento
              opciones={AGUA}
              value={form.agua}
              propuesto={esProp('agua')}
              onChange={(v) => commit({ ...form, agua: v }, 'agua')}
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <SeccionLabel icon={Zap}>Boyero eléctrico</SeccionLabel>
              <Segmento
                opciones={ELECTRICO}
                value={form.electrico}
                propuesto={esProp('electrico')}
                onChange={(v) => commit({ ...form, electrico: v }, 'electrico')}
              />
            </div>
            {conHacienda && (
              <div>
                <SeccionLabel icon={Stethoscope}>Tratam.</SeccionLabel>
                <CSegBtn
                  label={form.en_tratamiento ? 'Sí' : 'No'}
                  tono="warn"
                  selected={form.en_tratamiento && !esProp('en_tratamiento')}
                  propuesto={form.en_tratamiento && esProp('en_tratamiento')}
                  onClick={() =>
                    commit({ ...form, en_tratamiento: !form.en_tratamiento }, 'en_tratamiento')
                  }
                  className="h-14 w-24"
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
        <SeccionLabel icon={Hash}>Conteo de cabezas · opcional</SeccionLabel>
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => ajustarConteo(-1)}
            aria-label="Restar"
            className="c-hard-sm flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink)] active:scale-95"
          >
            <Minus className="size-7" strokeWidth={2.5} />
          </button>
          <div className="flex h-16 min-w-0 flex-1 flex-col items-center justify-center rounded-xl border-2 border-[var(--c-line-strong)] bg-[var(--c-sunk)]">
            <span
              className={cn(
                'c-mono text-[30px] font-bold leading-none',
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
            className="c-hard-sm flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink)] active:scale-95"
          >
            <Plus className="size-7" strokeWidth={2.5} />
          </button>
          {cabezas > 0 && (
            <button
              type="button"
              onClick={() => commit({ ...form, conteo: cabezas })}
              className={cn(
                'c-display flex h-16 shrink-0 flex-col items-center justify-center rounded-xl border-2 px-3 leading-none active:scale-95',
                form.conteo === cabezas
                  ? 'border-transparent bg-[var(--c-ok)] text-white'
                  : 'border-[var(--c-ok)]/40 bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]',
              )}
            >
              <span className="text-[11px] uppercase opacity-80">esperado</span>
              <span className="c-mono text-[18px] font-bold">{cabezas}</span>
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

      {/* Novedad: primero los chips de un toque, después VOZ (en el campo se
          habla, no se tipea), y recién al final el teclado como último recurso. */}
      <div>
        <SeccionLabel icon={MessageSquare}>Novedades · opcional</SeccionLabel>
        <div className="c-strip -mx-4 flex gap-1.5 px-4">
          {NOVEDADES.map((n) => (
            <CChip key={n} label={n} selected={novChips.has(n)} onClick={() => toggleNovedad(n)} />
          ))}
        </div>
        <div className="mt-2">
          <NotaVoz audio={audio} onAudio={onAudio} />
        </div>
        <input
          value={novLibre}
          onChange={(e) => setNovLibre(e.target.value)}
          onBlur={() => onGuardar({ ...form, novedad: componer(novChips, novLibre) })}
          autoComplete="off"
          placeholder="…o escribí otra novedad"
          className="mt-2 h-12 w-full rounded-xl border-2 border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3.5 text-[15px] text-[var(--c-ink)] outline-none placeholder:text-[var(--c-faint)] focus:border-[var(--c-ok)]"
        />
      </div>
    </div>
  )
}


function Segmento<T extends string>({
  opciones,
  value,
  propuesto,
  onChange,
}: {
  opciones: { value: T; label: string; tono: Tono }[]
  value: T | null
  /** true = `value` viene de la última vez y aún no se confirmó. */
  propuesto?: boolean
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
          selected={value === o.value && !propuesto}
          propuesto={value === o.value && propuesto}
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
  const [lluviaAbierta, setLluviaAbierta] = useState(false)
  const [terminando, setTerminando] = useState(false)
  // La lluvia YA se pregunta durante la recorrida (barra de arriba). Acá no se
  // vuelve a cargar con otro widget: se MUESTRA lo contestado, con opción de
  // cambiarlo abriendo la misma hoja. `meta` es reactivo (Dexie), así que la
  // fila se actualiza sola tras guardar.
  const lluvia = r.meta?.lluvia_mm ?? null

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
    // La lluvia ya se guardó al contestarla (durante la recorrida o en la hoja
    // de acá) — terminar NO la vuelve a escribir, así no pisa lo cargado.
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

        {/* Lluvia: se muestra lo ya contestado. Si falta, un toque abre la
            MISMA hoja que en la recorrida (con "No llovió" de primera clase). */}
        {lluvia != null ? (
          <div className="c-panel flex items-center gap-2.5 px-4 py-3">
            <CloudRain className="size-[18px] shrink-0 text-[var(--c-ok-deep)]" />
            <span className="flex-1 text-[15px] font-semibold text-[var(--c-ink)]">
              {lluvia === 0 ? 'No llovió hoy' : `Llovió ${lluvia} mm`}
            </span>
            <button
              type="button"
              onClick={() => setLluviaAbierta(true)}
              className="c-label rounded-lg border border-[var(--c-line-strong)] px-3 py-2 !text-[11px] !text-[var(--c-ink-soft)]"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLluviaAbierta(true)}
            className="c-panel flex items-center gap-2.5 px-4 py-3.5 text-left"
          >
            <CloudRain className="size-[18px] shrink-0 text-[var(--c-warn-deep)]" />
            <span className="flex-1 text-[15px] font-semibold text-[var(--c-ink)]">
              ¿Llovió hoy? Anotalo
            </span>
            <ChevronRight className="size-5 shrink-0 text-[var(--c-faint)]" />
          </button>
        )}
      </div>

      <LluviaSheet
        open={lluviaAbierta}
        valor={lluvia}
        onCerrar={() => setLluviaAbierta(false)}
        onGuardar={(mm) => {
          void r.setLluvia(mm)
          setLluviaAbierta(false)
        }}
      />

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
