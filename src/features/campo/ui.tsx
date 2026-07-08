import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Delete, Mic, Square, Trash2 as TrashIcon } from 'lucide-react'
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
  onClick,
  className,
}: {
  label: string
  tono: Tono
  selected: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-13 items-center justify-center rounded-xl border px-1 text-[13.5px] font-semibold transition-colors active:scale-[0.98]',
        selected
          ? cn(TONO_FILL[tono], 'c-hard-sm')
          : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink-soft)]',
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
        'shrink-0 rounded-xl border px-3 py-2 text-[13.5px] font-semibold transition-colors active:scale-[0.98]',
        selected
          ? 'border-[var(--c-ok)] bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]'
          : 'border-[var(--c-line-strong)] bg-[var(--c-panel)] text-[var(--c-ink-soft)]',
        className,
      )}
    >
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
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="c-sheet-back absolute inset-0 bg-[var(--c-ink)]/40"
      />
      <div className="c-sheet-panel relative max-h-[82%] overflow-y-auto rounded-t-2xl border-t border-[var(--c-line)] bg-[var(--c-panel)] px-4 pb-6 pt-3 shadow-[0_-8px_30px_rgba(16,30,20,0.18)]">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[var(--c-line-strong)]" />
        <CLabel className="mb-3 !text-[11px]">{title}</CLabel>
        {children}
      </div>
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
