import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Landmark } from 'lucide-react'
import { useLiquidar } from '@/features/agenda/hooks'
import { medioLabel, type Vencimiento } from '@/features/agenda/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formField, formLabel } from '@/components/form-dialog'
import { cn } from '@/lib/utils'

const hoy = () => new Date().toISOString().slice(0, 10)

/**
 * Marca cualquier vencimiento (no solo cheques) como cobrado/pagado: setea la
 * fecha y lo pasa a liquidado. Genérico por medio de pago.
 */
export function LiquidarDialog({
  item,
  trigger,
}: {
  item: Vencimiento
  /** Disparador propio (ej. el chip del calendario); si no, botón por defecto. */
  trigger?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [fecha, setFecha] = useState(hoy())
  const [error, setError] = useState<string | null>(null)
  const mut = useLiquidar()
  const cobro = item.tipo === 'ingreso'

  async function onConfirm(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await mut.mutateAsync({ id: item.id, fecha })
      toast.success(cobro ? 'Marcado como cobrado' : 'Marcado como pagado')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  const titulo = item.contraparte ?? item.descripcion ?? (cobro ? 'Cobro' : 'Pago')

  return (
    <>
      {trigger ? (
        <span className="contents" onClick={() => setOpen(true)}>
          {trigger}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12.5px] font-semibold text-field-deep transition-colors hover:border-primary hover:bg-field-soft"
        >
          {cobro ? 'Marcar cobrado' : 'Marcar pagado'}
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              {cobro ? 'Marcar como cobrado' : 'Marcar como pagado'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onConfirm} className="grid gap-4">
            <div className="rounded-xl border border-border bg-secondary/50 px-3.5 py-3 text-sm">
              <div className="flex items-center gap-1.5 font-semibold text-ink">
                <Landmark className="size-4 text-faint" />
                <span className="truncate">{titulo}</span>
                <span className="ml-auto shrink-0 text-[11px] font-bold uppercase text-faint">
                  {medioLabel(item.medio, item.esEcheq)}
                </span>
              </div>
              {(item.chequeBanco || item.chequeNumero) && (
                <div className="mt-1 text-[12px] text-muted-foreground">
                  {item.chequeBanco}
                  {item.chequeBanco && item.chequeNumero && ' · '}
                  {item.chequeNumero && `N° ${item.chequeNumero}`}
                </div>
              )}
              <div className="tnum mt-1 text-[15px] font-bold text-ink">
                ${Math.round(item.monto).toLocaleString('es-AR')}
              </div>
            </div>
            <div>
              <label htmlFor="liq-fecha" className={formLabel}>
                Fecha en que se {cobro ? 'cobró' : 'pagó'}
              </label>
              <input
                id="liq-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className={cn(formField, '[color-scheme:light]')}
              />
            </div>
            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}
            <Button
              type="submit"
              disabled={mut.isPending}
              className="h-11 w-full rounded-xl"
            >
              {mut.isPending ? 'Guardando…' : 'Confirmar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
