import { useEffect, useState, type ReactNode } from 'react'
import {
  Banknote,
  Check,
  ChevronDown,
  CloudOff,
  Footprints,
  LoaderCircle,
  RotateCw,
  Syringe,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useSeedOffline } from '@/features/campo/use-seed-offline'
import { cn } from '@/lib/utils'

/**
 * Estado "listo para el campo" — el botón vivo bajo el header del Modo Campo.
 *
 * Antes esto era una barra que mostraba el ✓ de éxito 4,5s y desaparecía: una
 * vez ido, nada le confirmaba al productor que podía irse sin señal. Ahora es
 * PERSISTENTE: un pill calmo ("Listo para el campo · hace X") con un punto que
 * respira, y al tocarlo se despliega el detalle de qué quedó guardado
 * (Recorrida / Manga / Plata) + "Actualizar ahora" + estado de señal. Los otros
 * estados (preparando / conectate / falló) siguen siendo una barra simple.
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

export function EstadoCampo() {
  const { estado, lastOk, detalle, online, sembrar } = useSeedOffline()
  const [abierto, setAbierto] = useState(false)
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
          onClick={() => void sembrar()}
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
  if (!listo) return null // idle inicial: nada que mostrar todavía

  // --- Botón vivo "Listo para el campo" (persistente + expandible) ---
  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2.5 bg-[var(--c-ok-soft)] px-4 py-2 text-left text-[var(--c-ok-deep)] transition-colors active:bg-[var(--c-mid-soft)]"
      >
        <span className="relative flex size-2.5 shrink-0 items-center justify-center">
          <span className="c-breathe absolute inline-flex size-full rounded-full bg-[var(--c-ok)]" />
          <span className="relative inline-flex size-2 rounded-full bg-[var(--c-ok)]" />
        </span>
        <span className="text-[13px] font-bold">Listo para el campo</span>
        {!online && (
          <span className="c-label rounded-full bg-white/70 px-1.5 py-0.5 !text-[9.5px] !text-[var(--c-ok-deep)]">
            sin señal
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <span className="c-mono text-[11.5px] font-semibold text-[var(--c-ok-deep)]/70">
            {hace}
          </span>
          <ChevronDown
            className={cn('size-4 transition-transform duration-200', abierto && 'rotate-180')}
            strokeWidth={2.4}
          />
        </span>
      </button>

      {abierto && (
        <div className="c-rise border-t border-[var(--c-line)] bg-[var(--c-panel)] px-4 pb-3 pt-2.5">
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
              onClick={() => void sembrar()}
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
      )}
    </div>
  )
}
