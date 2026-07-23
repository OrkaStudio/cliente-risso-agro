import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  ChevronRight,
  CloudOff,
  Footprints,
  PencilRuler,
  RefreshCw,
  Syringe,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRecorrida } from './recorrida/use-recorrida'
import { CLabel } from './ui'

/**
 * Landing del Modo Campo. NO pregunta en abstracto: refleja el estado.
 *
 * Antes, entrar al Modo Campo caía en Manga por una ruta fija — el productor
 * llegaba a una pantalla que no había pedido y tenía que navegar a Recorrida.
 * Ahora, si hay una recorrida abierta se ofrece retomarla; si no, se eligen
 * las dos sesiones de trabajo. Plata NO va acá: no es una jornada que se
 * elige, es una interrupción de 20 segundos que ya vive en la barra inferior.
 */
export function CampoInicioPage() {
  const r = useRecorrida()

  if (r.cargando) {
    return (
      <div className="c-label flex h-full items-center justify-center !text-[13px]">
        Cargando…
      </div>
    )
  }

  // Cuenta nueva / campo sin dibujar: sin polígonos no hay croquis, que es
  // justamente lo que el productor usa para ubicarse. Se avisa acá y en
  // Oficina (que es donde se dibuja) para que la lógica cierre por los dos lados.
  const sinCroquis =
    r.potrerosRef.length > 0 &&
    r.potrerosRef.every((p) => !p.poligono || p.poligono.length < 3)

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto p-4">
      <div>
        <h1 className="c-display text-[26px] text-[var(--c-ink)]">
          {r.meta ? 'Tenés una recorrida abierta' : '¿Qué vas a hacer?'}
        </h1>
      </div>

      {!r.online && (
        <p className="c-hazard flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold text-[var(--c-ink)]">
          <CloudOff className="size-4 shrink-0" /> Sin señal: podés trabajar
          igual, sube solo cuando vuelva.
        </p>
      )}

      {/* Lo que quedó sin subir AVISA, no bloquea: se puede arrancar otra
          recorrida aunque lo anterior siga esperando señal. */}
      {(r.sinSubir > 0 || r.lluviaPendiente) && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3 py-2.5">
          <RefreshCw
            className={cn(
              'size-4 shrink-0 text-[var(--c-ink-soft)]',
              r.sincronizando && 'animate-spin',
            )}
          />
          <span className="text-[13px] text-[var(--c-ink-soft)]">
            <span className="font-bold text-[var(--c-ink)]">
              {r.sinSubir > 0
                ? r.sinSubir === 1
                  ? '1 observación'
                  : `${r.sinSubir} observaciones`
                : 'La lluvia'}
            </span>{' '}
            sin subir — se sube sola.
          </span>
        </div>
      )}

      {/* Retomar: primero y grande. La recorrida sobrevive a irse a cargar un
          gasto, a la veterinaria o a cerrar la app. */}
      {r.meta && (
        <Link
          to="/campo/recorrida"
          className="c-hard flex items-center gap-3.5 rounded-2xl border-2 border-[var(--c-ok-deep)] bg-[var(--c-ok-soft)] px-4 py-5 text-left active:scale-[0.99]"
        >
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--c-ok)] text-white shadow-[0_2px_8px_rgba(11,88,55,0.3)]">
            <Footprints className="size-7" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="c-display block truncate text-[20px] text-[var(--c-ink)]">
              Seguí en {r.meta.campo_nombre}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5">
              <span className="c-mono text-[13px] font-bold text-[var(--c-ok-deep)]">
                {r.hechos}/{r.total}
              </span>
              <CLabel className="!text-[11px]">potreros hechos</CLabel>
            </span>
          </span>
          <ChevronRight className="size-6 shrink-0 text-[var(--c-ok-deep)]" />
        </Link>
      )}

      {/* Cambiar de campo: la recorrida actual queda guardada y se retoma
          después. Sin esto no había forma de recorrer otro campo sin terminar. */}
      {r.meta && (
        <Link
          to="/campo/recorrida?cambiar=1"
          className="-mt-1.5 flex items-center gap-2 self-start rounded-lg px-2 py-1.5 text-[13px] font-semibold text-[var(--c-ink-soft)] active:scale-[0.98]"
        >
          <ArrowLeftRight className="size-4" />
          Recorrer otro campo
        </Link>
      )}

      <div className="flex flex-col gap-2.5">
        {!r.meta && (
          <AccionGrande
            to="/campo/recorrida"
            icon={<Footprints className="size-7" strokeWidth={2} />}
            titulo="Recorrer"
            detalle="Potrero por potrero, sobre el croquis"
            acento="ok"
          />
        )}
        <AccionGrande
          to="/campo/manga"
          icon={<Syringe className="size-7" strokeWidth={2} />}
          titulo="Manga"
          detalle="Caravanear, pesar, sanidad"
          acento="ink"
        />
      </div>

      {/* Plata no es una jornada que se elige — es la interrupción de la
          estación de servicio o la veterinaria. Vive en la barra de abajo y se
          puede meter en cualquier momento, también con la recorrida abierta:
          al volver, se retoma donde estaba. */}
      <Link
        to="/campo/plata"
        className="flex items-center gap-2.5 rounded-xl border-2 border-[var(--c-line-strong)] bg-[var(--c-panel)] px-3.5 py-3 text-left active:scale-[0.99]"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--c-sunk)] text-[var(--c-ink)]">
          <Banknote className="size-[18px]" />
        </span>
        <span className="flex-1 text-[13px] leading-snug text-[var(--c-ink-soft)]">
          ¿Cargaste nafta o pagaste algo?{' '}
          <span className="font-bold text-[var(--c-ink)]">Anotalo en Plata</span>
          {r.meta && ' — la recorrida te espera'}.
        </span>
        <ChevronRight className="size-5 shrink-0 text-[var(--c-faint)]" />
      </Link>

      {/* Lo que el servidor RECHAZÓ no se descarta nunca en silencio: se
          muestra y se pide confirmación explícita para tirarlo. */}
      {r.errores.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--c-bad)]/45 bg-[var(--c-bad-soft)] p-3.5">
          <div className="c-label flex items-center gap-1.5 !text-[12px] !text-[var(--c-bad)]">
            <AlertTriangle className="size-4" />
            {r.errores.length === 1
              ? '1 observación que el servidor rechazó'
              : `${r.errores.length} observaciones que el servidor rechazó`}
          </div>
          <ul className="flex flex-col gap-1 text-[12.5px] text-[var(--c-ink-soft)]">
            {r.errores.slice(0, 4).map((e) => (
              <li key={`${e.recorrida_id}-${e.potrero_id}`}>
                {e.error ?? 'error al subir'}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void r.descartarErrores()}
            className="c-label mt-1 inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-[var(--c-bad)]/45 bg-[var(--c-panel)] px-3 !text-[12px] !text-[var(--c-bad)] active:scale-[0.98]"
          >
            <Trash2 className="size-4" />
            Descartar los que fallaron
          </button>
        </div>
      )}

      {sinCroquis && (
        <div className="c-hazard flex items-start gap-2.5 rounded-xl border px-3 py-3">
          <PencilRuler className="mt-0.5 size-4 shrink-0 text-[var(--c-ink)]" />
          <p className="text-[13px] leading-snug text-[var(--c-ink)]">
            <span className="font-bold">Todavía no hay potreros dibujados.</span>{' '}
            Vas a poder recorrer igual, por lista, pero sin el croquis para
            ubicarte. Se dibujan una sola vez desde Modo Oficina, en Campos.
          </p>
        </div>
      )}
    </div>
  )
}

function AccionGrande({
  to,
  icon,
  titulo,
  detalle,
  acento,
}: {
  to: string
  icon: React.ReactNode
  titulo: string
  detalle: string
  acento: 'ok' | 'ink'
}) {
  return (
    <Link
      to={to}
      className="c-hard-sm flex items-center gap-3.5 rounded-2xl border-2 border-[var(--c-line-strong)] bg-[var(--c-panel)] px-4 py-4 text-left active:scale-[0.99]"
    >
      <span
        className={cn(
          'flex size-14 shrink-0 items-center justify-center rounded-2xl text-white',
          acento === 'ok' ? 'bg-[var(--c-ok)]' : 'bg-[var(--c-ink)]',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="c-display block truncate text-[19px] text-[var(--c-ink)]">
          {titulo}
        </span>
        <CLabel className="!text-[11.5px]">{detalle}</CLabel>
      </span>
      <ChevronRight className="size-6 shrink-0 text-[var(--c-faint)]" />
    </Link>
  )
}
