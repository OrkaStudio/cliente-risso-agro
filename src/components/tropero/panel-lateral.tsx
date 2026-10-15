import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { cn } from '@/lib/utils'
import { Icono } from './icono'

/**
 * El panel que entra por la derecha (página 35: «Anotarle algo», «Salieron»,
 * «Un animal nuevo»…). La pantalla de atrás queda a la vista, apagada; arriba
 * el título y para qué sirve, en el medio lo que se elige y abajo, fijo, el
 * botón que lo hace.
 */
export function PanelLateral({
  abierto,
  onCerrar,
  titulo,
  bajada,
  pie,
  children,
  className,
  ancho = false,
  onVolver,
  volverTexto = 'Volver',
}: {
  /** Si está, el panel muestra «← Volver» arriba del título (un paso atrás, sin cerrar). */
  onVolver?: () => void
  volverTexto?: string
  /** Más ancho, para cuando adentro hay un croquis. */
  ancho?: boolean
  abierto: boolean
  onCerrar: () => void
  titulo: React.ReactNode
  bajada?: React.ReactNode
  /** El botón principal (o lo que vaya abajo). */
  pie?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-tinta/40 duration-200 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
        <DialogPrimitive.Popup
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full flex-col transition-[max-width] duration-300',
            ancho ? 'max-w-[680px]' : 'max-w-[520px]',
            ' rounded-l-[28px] bg-fondo shadow-[-12px_0_40px_rgba(19,27,22,0.18)] outline-none duration-300 data-closed:animate-out data-closed:slide-out-to-right data-open:animate-in data-open:slide-in-from-right',
            className,
          )}
        >
          <header className="flex items-start gap-4 px-8 pt-8 pb-5">
            <div className="min-w-0 flex-1">
              {onVolver && <BotonVolver onClick={onVolver} className="mb-4">{volverTexto}</BotonVolver>}
              <DialogPrimitive.Title className="font-heading text-[28px] leading-[1.05] font-extrabold tracking-[-0.02em] text-texto">{titulo}</DialogPrimitive.Title>
              {bajada && <DialogPrimitive.Description className="mt-1.5 text-[15px] text-texto-suave">{bajada}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close aria-label="Cerrar" className="grid size-10 shrink-0 place-items-center rounded-full text-texto-suave transition-colors hover:bg-superficie-hundida hover:text-texto">
              <Icono nombre="Cerrar" />
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-8 pb-6">{children}</div>
          {pie && <footer className="border-t border-borde bg-fondo px-8 py-5">{pie}</footer>}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** Una etiqueta de grupo dentro del panel («Qué le diste», «Cuándo»…). */
export function Grupo({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn('mt-6 first:mt-0', className)}>
      <legend className="mb-2.5 text-[14px] font-semibold text-texto-suave">{titulo}</legend>
      {children}
    </fieldset>
  )
}

/** Opciones que se tocan (chips grandes): una o varias. */
export function Opciones<T extends string>({
  opciones,
  elegidas,
  onTocar,
  etiqueta,
}: {
  opciones: { valor: T; texto: string }[]
  elegidas: T[]
  onTocar: (v: T) => void
  etiqueta: string
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-2">
      {opciones.map((o) => {
        const si = elegidas.includes(o.valor)
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={si}
            onClick={() => onTocar(o.valor)}
            className={cn(
              'inline-flex h-10 items-center rounded-full border-[1.5px] px-4 text-[14.5px] font-semibold transition-colors',
              si ? 'border-acento bg-acento text-acento-texto' : 'border-borde bg-superficie text-texto hover:border-neutro-300',
            )}
          >
            {o.texto}
          </button>
        )
      })}
    </div>
  )
}

/** «← Volver»: un paso atrás. Píldora con borde, para que se vea y se toque fácil. */
export function BotonVolver({ onClick, children = 'Volver', className }: { onClick: () => void; children?: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-borde bg-superficie pr-4 pl-3 text-[14.5px] font-bold text-texto transition-colors hover:border-neutro-300 hover:bg-superficie-hundida',
        className,
      )}
    >
      <Icono nombre="Atrás" tamano={16} />
      {children}
    </button>
  )
}
