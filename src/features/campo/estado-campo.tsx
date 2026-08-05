import { useEffect, useState, type ReactNode } from 'react'
import {
  Banknote,
  Check,
  CloudOff,
  Footprints,
  LoaderCircle,
  RotateCw,
  Syringe,
  Wifi,
  WifiOff,
} from 'lucide-react'
import type { SeedDetalle } from '@/features/campo/seed-offline'
import type { SeedEstado } from '@/features/campo/use-seed-offline'
import { cn } from '@/lib/utils'

/**
 * Estado "listo para el campo".
 *
 * Antes esto era una barra que mostraba el ✓ de éxito 4,5s y desaparecía: una
 * vez ido, nada le confirmaba al productor que podía irse sin señal. Se volvió
 * PERSISTENTE, y así se quedó — pero ocupaba una franja entera del alto en
 * TODAS las pantallas del Modo Campo, que es el recurso más escaso del
 * teléfono (la manga ya arranca con header + barra + instrumento antes de
 * mostrar nada).
 *
 * Reparto actual, por lo que cada estado necesita:
 *
 *  · **listo** (el 99% del tiempo) → `ChipEstadoCampo`, un punto que respira en
 *    el header. Sigue estando SIEMPRE a la vista —esa era la razón de ser— pero
 *    no le cobra una fila a la pantalla. Al tocarlo baja el detalle completo.
 *  · **preparando / sin preparar / falló** → `AvisoEstadoCampo`, la barra ancha
 *    de siempre. Son transitorios y accionables: ahí la fila se gana.
 *
 * El estado vive en el `CampoShell`, que tiene la única instancia de
 * `useSeedOffline` para todo el Modo Campo; estos componentes solo pintan.
 */

function formatHace(ms: number): string {
  const seg = Math.max(0, Math.floor(ms / 1000))
  if (seg < 45) return 'recién'
  const min = Math.round(seg / 60)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return h === 1 ? 'hace 1 hora' : `hace ${h} horas`
  const d = Math.floor(h / 24)
  return d === 1 ? 'hace 1 día' : `hace ${d} días`
}

/** "hace X" en vivo. `ahora` avanza por intervalo (setState sólo en el callback
 *  del timer, no síncrono en el effect); el texto se deriva en render. */
function useHaceCuanto(ts: number | null): string {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  if (ts == null) return ''
  return formatHace(ahora - ts)
}

const ITEMS = [
  { key: 'recorrida', label: 'Recorrida', desc: 'Campos y potreros', Icon: Footprints },
  { key: 'manga', label: 'Manga', desc: 'Animales para caravanear', Icon: Syringe },
  { key: 'plata', label: 'Plata', desc: 'Categorías y gastos', Icon: Banknote },
] as const

export type EstadoCampoProps = {
  estado: SeedEstado
  lastOk: number | null
  detalle: SeedDetalle | null
  online: boolean
  sembrar: () => void
}

/** Barra simple para los estados que no son "listo" (preparando / aviso). */
function Barra({ tono, children }: { tono: 'info' | 'warn'; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 px-4 py-2 text-[13px] font-semibold',
        tono === 'warn'
          ? 'bg-[var(--c-warn-soft)] text-[var(--c-warn-deep)]'
          : 'bg-[var(--c-sunk)] text-[var(--c-ink-soft)]',
      )}
    >
      {children}
    </div>
  )
}

/**
 * El punto vivo del header. Sólo existe cuando el teléfono YA está listo: es la
 * confirmación calma de que se puede salir sin señal.
 *
 * Va sobre el fondo oscuro del header, así que tiene su propia paleta — el
 * verde de la barra clara no se lee ahí.
 */
export function ChipEstadoCampo({
  estado,
  lastOk,
  online,
  abierto,
  onToggle,
}: Pick<EstadoCampoProps, 'estado' | 'lastOk' | 'online'> & {
  abierto: boolean
  onToggle: () => void
}) {
  const listo = lastOk != null
  if (!listo || estado === 'sembrando') return null

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={abierto}
      aria-label={
        online
          ? 'Listo para el campo — ver detalle'
          : 'Listo para el campo, sin señal — ver detalle'
      }
      className={cn(
        'flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 transition-colors',
        abierto ? 'bg-white/[0.14]' : 'hover:bg-white/[0.07]',
      )}
    >
      <span className="relative flex size-2.5 shrink-0 items-center justify-center">
        <span
          className={cn(
            'c-breathe absolute inline-flex size-full rounded-full',
            online ? 'bg-[var(--c-ok)]' : 'bg-[var(--c-warn)]',
          )}
        />
        <span
          className={cn(
            'relative inline-flex size-2 rounded-full',
            online ? 'bg-[var(--c-ok)]' : 'bg-[var(--c-warn)]',
          )}
        />
      </span>
      <span className="text-[12.5px] font-semibold text-white/85">Listo</span>
    </button>
  )
}

/**
 * La barra ancha, ahora solo para lo que pide atención, + el cajón de detalle
 * que despliega el chip. Va debajo del header.
 */
export function AvisoEstadoCampo({
  estado,
  lastOk,
  detalle,
  online,
  sembrar,
  abierto,
}: EstadoCampoProps & { abierto: boolean }) {
  const hace = useHaceCuanto(lastOk)
  const listo = lastOk != null

  if (estado === 'sembrando') {
    return (
      <Barra tono="info">
        <LoaderCircle className="size-4 shrink-0 animate-spin" strokeWidth={2.4} />
        <span className="min-w-0 flex-1 truncate">Preparando para el campo…</span>
      </Barra>
    )
  }
  if (estado === 'error' && !listo) {
    return (
      <Barra tono="warn">
        <CloudOff className="size-4 shrink-0" strokeWidth={2.4} />
        <span className="min-w-0 flex-1 truncate">No se pudo preparar del todo</span>
        <button
          type="button"
          onClick={sembrar}
          disabled={!online}
          className="flex shrink-0 items-center gap-1 rounded-full border border-current/30 px-2.5 py-1 text-[12px] disabled:opacity-50"
        >
          <RotateCw className="size-3.5" strokeWidth={2.4} />
          Reintentar
        </button>
      </Barra>
    )
  }
  if (!online && !listo) {
    return (
      <Barra tono="warn">
        <WifiOff className="size-4 shrink-0" strokeWidth={2.4} />
        <span className="min-w-0 flex-1 truncate">
          Conectate un momento para preparar el campo
        </span>
      </Barra>
    )
  }
  if (!listo || !abierto) return null

  return (
    <div className="c-rise shrink-0 border-b border-[var(--c-line)] bg-[var(--c-panel)] px-4 pb-3 pt-2.5">
      <p className="c-label !normal-case !tracking-normal !text-[11px] !font-medium !text-[var(--c-faint)]">
        Guardado en el teléfono · actualizado {hace}
      </p>

      <ul className="mt-2 space-y-1.5">
        {ITEMS.map(({ key, label, desc, Icon }) => {
          const ok = (detalle?.[key] ?? 'ok') === 'ok'
          return (
            <li key={key} className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-lg',
                  ok
                    ? 'bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]'
                    : 'bg-[var(--c-warn-soft)] text-[var(--c-warn-deep)]',
                )}
              >
                {ok ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : (
                  <CloudOff className="size-3.5" strokeWidth={2.4} />
                )}
              </span>
              <Icon className="size-4 shrink-0 text-[var(--c-ink-soft)]" strokeWidth={2} />
              <span className="text-[13px] font-semibold text-[var(--c-ink)]">{label}</span>
              <span className="ml-auto text-[11.5px] font-medium text-[var(--c-faint)]">
                {desc}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex items-center gap-2.5">
        <button
          type="button"
          onClick={sembrar}
          disabled={!online}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
            online
              ? 'c-hard-sm bg-[var(--c-ok)] text-white'
              : 'bg-[var(--c-sunk)] text-[var(--c-faint)]',
          )}
        >
          <RotateCw className="size-3.5" strokeWidth={2.4} />
          Actualizar ahora
        </button>
        <span className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--c-faint)]">
          {online ? (
            <>
              <Wifi className="size-3.5" strokeWidth={2.2} /> con señal
            </>
          ) : (
            <>
              <WifiOff className="size-3.5" strokeWidth={2.2} /> sin señal
            </>
          )}
        </span>
      </div>
    </div>
  )
}
