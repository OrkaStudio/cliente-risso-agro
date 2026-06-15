import { useState, type FormEvent } from 'react'
import { Beef, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { GORDO_FUENTE } from '@/features/cotizaciones/api'
import { useCargarGordo, useGordoActual } from '@/features/cotizaciones/hooks'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const hoy = () => new Date().toISOString().slice(0, 10)

function fmtFecha(f: string) {
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

const labelClass =
  'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.06em] text-faint'
const fieldClass =
  'w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-ink shadow-[0_1px_2px_rgba(16,24,19,0.05)] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-field-soft'

/**
 * Slot del gordo en el ticker. Carga manual (no hay API confiable):
 * muestra el último precio cargado y abre un diálogo para actualizarlo.
 */
export function GordoSlot({ empresaId }: { empresaId: string }) {
  const gordo = useGordoActual(empresaId)
  const cargar = useCargarGordo()
  const [open, setOpen] = useState(false)
  const [valor, setValor] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [error, setError] = useState<string | null>(null)

  function abrir() {
    setValor(gordo.data ? String(gordo.data.valor) : '')
    setFecha(hoy())
    setError(null)
    setOpen(true)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const n = Number(valor)
    if (!valor || Number.isNaN(n) || n <= 0)
      return setError('Ingresá un valor válido')
    try {
      await cargar.mutateAsync({ empresaId, valor: n, fecha })
      toast.success('Precio del gordo actualizado')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <>
      {gordo.data ? (
        <button
          type="button"
          onClick={abrir}
          disabled={!empresaId}
          title={`Gordo — $${gordo.data.valor.toLocaleString('es-AR')}/kg · ${fmtFecha(gordo.data.fecha)} · tocá para actualizar`}
          className="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/[0.07]"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
            <Beef className="size-[15px] text-[#d4b896]" />
            Gordo
          </span>
          <b className="tnum text-sm font-semibold text-white">
            ${gordo.data.valor.toLocaleString('es-AR')}
            <span className="ml-0.5 text-[11px] font-medium text-sidebar-foreground/55">
              /kg
            </span>
          </b>
        </button>
      ) : (
        <button
          type="button"
          onClick={abrir}
          disabled={!empresaId}
          title="Cargar el precio del gordo"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/55 transition-colors hover:bg-white/[0.07] hover:text-white"
        >
          <Beef className="size-[15px] text-[#d4b896]" />+ Gordo
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              Precio del gordo
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-5">
            <div>
              <label htmlFor="g-valor" className={labelClass}>
                Precio por kg vivo
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-heading text-lg font-bold text-faint">
                  $
                </span>
                <input
                  id="g-valor"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  className="tnum w-full rounded-[10px] border border-border bg-card py-3 pl-8 pr-3.5 text-lg font-bold text-ink shadow-[0_1px_2px_rgba(16,24,19,0.05)] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-field-soft"
                />
              </div>
              <a
                href={GORDO_FUENTE.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-field-deep hover:underline"
              >
                <ExternalLink className="size-3.5" />
                Buscá el precio en {GORDO_FUENTE.nombre}
              </a>
            </div>
            <div>
              <label htmlFor="g-fecha" className={labelClass}>
                Fecha
              </label>
              <input
                id="g-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className={`${fieldClass} [color-scheme:light]`}
              />
            </div>
            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}
            <Button type="submit" disabled={cargar.isPending || !empresaId}>
              {cargar.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
