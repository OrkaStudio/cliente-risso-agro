import { animate, useReducedMotion } from 'framer-motion'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Delete, Mic, Square, Trash2 as TrashIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Primitivas del Modo Campo. Mismo lenguaje visual que Oficina (tarjetas
 * blancas, hairline, verde campo, mono para datos); lo field-first está en
 * los targets grandes y en que el color aparece AL ELEGIR — sin ruido en
 * reposo. Ver campo.css.
 */

export type Tono = 'ok' | 'mid' | 'warn' | 'bad' | 'ink'

const TONO_FILL: Record<Tono, string> = {
  ok: 'border-[var(--c-ok)] bg-[var(--c-ok)] text-white',
  mid: 'border-[var(--c-mid)] bg-[var(--c-mid)] text-white',
  warn: 'border-[var(--c-warn)] bg-[var(--c-warn)] text-white',
  bad: 'border-[var(--c-bad)] bg-[var(--c-bad)] text-white',
  ink: 'border-[var(--c-ink)] bg-[var(--c-ink)] text-white',
}
const TONO_TEXT: Record<Tono, string> = {
  ok: 'text-[var(--c-ok-deep)]',
  mid: 'text-[#5c7a15]',
  warn: 'text-[var(--c-warn-deep)]',
  bad: 'text-[var(--c-bad)]',
  ink: 'text-[var(--c-ink)]',
}
export { TONO_TEXT }

export function CLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('c-label block', className)}>{children}</span>
}

/**
 * Botón de estado: en reposo es una tarjeta neutra (sin ruido); al elegirlo
 * se llena con su color semántico. Target alto (h-13) para dedo con guante.
 */
export function CSegBtn({
  label,
  tono,
  selected,
  propuesto,
  onClick,
  className,
}: {
  label: string
  tono: Tono
  selected: boolean
  /** Muestra el valor de la última vez SIN darlo por confirmado: contorno
   *  punteado, no el relleno sólido de una selección real. El productor lo ve
   *  como propuesta y decide si lo confirma o lo cambia. */
  propuesto?: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-14 items-center justify-center rounded-xl border-2 px-1 text-[15px] font-bold transition-colors active:scale-[0.97]',
        selected
          ? cn(TONO_FILL[tono], 'c-hard-sm')
          : propuesto
            ? // Propuesto = lo de la última vez, sin confirmar: punteado ok con
              // texto ok-deep LEGIBLE (no el gris lavado de antes).
              'border-dashed border-[var(--c-ok)] bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]'
            : // Sin elegir: texto TINTA plena (se lee al sol) sobre panel, borde
              // marcado para que el target se vea.
              'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink)]',
        className,
      )}
    >
      {label}
    </button>
  )
}

/** Chip seleccionable (notas rápidas, detalle, categorías). */
export function CChip({
  label,
  selected,
  onClick,
  className,
}: {
  label: string
  selected: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // h-11 = 44px: mínimo táctil para dedo con guante (antes ~34px).
        'flex h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 px-3.5 text-[14px] font-bold transition-colors active:scale-[0.97]',
        selected
          ? 'border-transparent bg-[var(--c-ok)] text-white'
          : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink)]',
        className,
      )}
    >
      {selected && <Check className="size-4 shrink-0" strokeWidth={3} />}
      {label}
    </button>
  )
}

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back'] as const

/**
 * Numpad propio: cero teclado del sistema. Teclas grandes mono, tecla `000`
 * para montos redondos (la mayoría en el campo lo son).
 */
export function CNumpad({
  onDigit,
  onBackspace,
  className,
  fill,
}: {
  onDigit: (d: string) => void
  onBackspace: () => void
  className?: string
  /** Estira las teclas para llenar el alto disponible (no dejar aire muerto
   *  en pantallas altas; teclas más grandes para el guante). */
  fill?: boolean
}) {
  // En modo fill el grid ocupa todo el alto y las 4 filas se reparten parejo.
  const grid = fill ? 'grid grid-cols-3 gap-1.5 h-full auto-rows-fr' : 'grid grid-cols-3 gap-1.5'
  const key = fill ? 'h-full min-h-[46px]' : 'h-11'
  const txt = fill ? 'text-[22px]' : 'text-[19px]'
  return (
    <div className={cn(grid, className)}>
      {NUMPAD_KEYS.map((k) =>
        k === 'back' ? (
          <button
            key={k}
            type="button"
            aria-label="Borrar"
            onClick={onBackspace}
            className={cn(
              'flex items-center justify-center rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-sunk)] text-[var(--c-ink-soft)] transition-transform active:scale-95',
              key,
            )}
          >
            <Delete className="size-5" />
          </button>
        ) : (
          <button
            key={k}
            type="button"
            onClick={() => onDigit(k)}
            className={cn(
              'c-mono flex items-center justify-center rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-panel)] font-bold text-[var(--c-ink)] transition-transform active:scale-95',
              key,
              txt,
            )}
          >
            {k}
          </button>
        ),
      )}
    </div>
  )
}

/** Hoja inferior simple (elegir categoría en la manga) — dentro del shell. */
export function CSheet({
  open,
  title,
  header,
  footer,
  onClose,
  children,
}: {
  open: boolean
  title: string
  /** Encabezado propio en lugar de la etiqueta de `title` (que sigue usándose
   *  como nombre accesible). Para hojas donde importa QUÉ se está tocando. */
  header?: ReactNode
  /** Acción principal fija al pie: queda SIEMPRE bajo el pulgar y el contenido
   *  scrollea detrás. Sin esto, una hoja larga esconde su propio botón. */
  footer?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null
  const encabezado = (
    <>
      <div className="mx-auto mb-3 h-1.5 w-12 shrink-0 rounded-full bg-[var(--c-line-strong)]" />
      {header ?? <CLabel className="mb-3 !text-[11px]">{title}</CLabel>}
    </>
  )
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="c-sheet-back absolute inset-0 bg-[var(--c-ink)]/40"
      />
      {/* Con pie fijo el panel deja de ser el scroller: scrollea sólo el
          cuerpo, así el botón no se monta encima del contenido ni se va. */}
      {footer ? (
        // Más alto que la variante sin pie: el botón fijo se come 68px y el
        // contenido no puede quedar cortado por eso.
        <div className="c-sheet-panel relative flex max-h-[92%] flex-col rounded-t-2xl border-t border-[var(--c-line)] bg-[var(--c-panel)] px-4 pb-6 pt-3 shadow-[0_-8px_30px_rgba(16,30,20,0.18)]">
          {encabezado}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          <div className="shrink-0 pt-3">{footer}</div>
        </div>
      ) : (
        <div className="c-sheet-panel relative max-h-[82%] overflow-y-auto rounded-t-2xl border-t border-[var(--c-line)] bg-[var(--c-panel)] px-4 pb-6 pt-3 shadow-[0_-8px_30px_rgba(16,30,20,0.18)]">
          {encabezado}
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * Nota de voz: en el campo se habla, no se tipea. Graba OFFLINE
 * (MediaRecorder es local); el blob viaja por el outbox de cada sección y
 * sube al bucket al volver la señal. Compartida por recorrida y manga.
 */
export function NotaVoz({
  audio,
  onAudio,
}: {
  audio: Blob | null
  onAudio: (b: Blob | null) => void
}) {
  const [grabando, setGrabando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)

  // ObjectURL del blob para el reproductor; el effect SOLO revoca (cleanup),
  // sin setState — el lint del repo lo exige así.
  const url = useMemo(() => (audio ? URL.createObjectURL(audio) : null), [audio])
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])

  const empezar = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const chunks: BlobPart[] = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setGrabando(false)
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
        if (blob.size > 0) onAudio(blob)
      }
      recRef.current = rec
      rec.start()
      setGrabando(true)
    } catch {
      setError('No pude usar el micrófono (¿permiso?)')
    }
  }

  const frenar = () => recRef.current?.stop()

  if (audio && url) {
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <audio controls src={url} className="h-10 min-w-0 flex-1" />
        <button
          type="button"
          onClick={() => onAudio(null)}
          aria-label="Borrar nota de voz"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-bad)] active:scale-95"
        >
          <TrashIcon className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={grabando ? frenar : () => void empezar()}
        className={cn(
          'flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-[14px] font-semibold transition-colors',
          grabando
            ? 'border-[var(--c-bad)]/60 bg-[var(--c-bad-soft)] text-[var(--c-bad)]'
            : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink-soft)]',
        )}
      >
        {grabando ? (
          <>
            <Square className="size-4 animate-pulse fill-current" />
            Grabando… tocá para frenar
          </>
        ) : (
          <>
            <Mic className="size-4.5" />
            Grabar nota de voz
          </>
        )}
      </button>
      {error && (
        <p className="c-label mt-1 !text-[11px] !text-[var(--c-warn-deep)]">{error}</p>
      )}
    </div>
  )
}

/**
 * Un número que se MUEVE hasta su valor nuevo en vez de saltar.
 *
 * Las cabezas de un potrero son el dato que el productor mira, y cuando anota
 * algo cambian: verlas correr de 45 a 46 hace que el sistema se sienta vivo y
 * que el cambio sea imposible de perderse. Saltar de golpe es lo que hace que
 * uno dude de si pasó algo.
 *
 * Resorte corto (no rebota) y respeta prefers-reduced-motion: con la
 * preferencia puesta, el número aparece directo en su valor.
 */
export function NumeroVivo({
  valor,
  className,
}: {
  valor: number
  className?: string
}) {
  const reducido = useReducedMotion()
  const [mostrado, setMostrado] = useState(valor)
  const anterior = useRef(valor)

  useEffect(() => {
    if (reducido || anterior.current === valor) {
      anterior.current = valor
      setMostrado(valor)
      return
    }
    const desde = anterior.current
    anterior.current = valor
    const controles = animate(desde, valor, {
      type: 'spring',
      stiffness: 190,
      damping: 26,
      mass: 0.6,
      onUpdate: (v) => setMostrado(Math.round(v)),
    })
    return () => controles.stop()
  }, [valor, reducido])

  return <span className={className}>{mostrado}</span>
}
