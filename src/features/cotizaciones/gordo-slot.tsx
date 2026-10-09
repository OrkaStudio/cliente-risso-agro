import { useState, type FormEvent } from 'react'
import { Beef, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { GORDO_FUENTE } from '@/features/cotizaciones/api'
import { useCargarGordo, useGordoActual, useNovilloCanuelas } from '@/features/cotizaciones/hooks'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CampoFecha } from '@/components/ui/campo-fecha'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import { PILDORA } from './pildora'

const hoy = hoyLocal

function fmtFecha(f: string) {
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

const labelClass =
  'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.06em] text-faint'
/**
 * Slot del gordo en el ticker. El precio sale solo de Cañuelas (edge
 * function); la carga manual queda de respaldo: si el productor cargó uno
 * más nuevo que el remate, o Cañuelas no responde, se muestra el suyo.
 */
export function GordoSlot({ empresaId }: { empresaId: string }) {
  const manual = useGordoActual(empresaId)
  const canuelas = useNovilloCanuelas()
  // El más reciente manda; a igual fecha, el manual (lo puso él a propósito).
  const gordo = {
    ...manual,
    data:
      canuelas.data && (!manual.data || canuelas.data.fecha > manual.data.fecha)
        ? { valor: canuelas.data.valor, fecha: canuelas.data.fecha, auto: true }
        : manual.data
          ? { ...manual.data, auto: false }
          : null,
  }
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
          title={`Gordo — $${gordo.data.valor.toLocaleString('es-AR')}/kg · ${fmtFecha(gordo.data.fecha)}${gordo.data.auto ? ' · Cañuelas, promedio novillos' : ' · cargado a mano'} · tocá para actualizar`}
          className={PILDORA}
        >
          <Beef className="size-4 text-principal" />
          <span className="text-[13px] text-texto-suave">Gordo</span>
          <b className="cifra text-[15px] font-bold text-texto">
            ${Math.round(gordo.data.valor).toLocaleString('es-AR')}
            <span className="ml-0.5 text-[12px] font-medium text-texto-suave">/kg</span>
          </b>
        </button>
      ) : (
        <button
          type="button"
          onClick={abrir}
          disabled={!empresaId}
          title="Cargar el precio del gordo"
          className={cn(PILDORA, 'text-[13px] font-semibold text-principal')}
        >
          <Beef className="size-4 text-principal" />
          Cargar el gordo
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
              <CampoFecha id="g-fecha" value={fecha} onChange={setFecha} />
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
