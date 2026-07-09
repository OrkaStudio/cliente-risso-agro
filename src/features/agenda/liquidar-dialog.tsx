import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Hash,
  Landmark,
  MapPin,
  Sparkles,
} from 'lucide-react'
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
const ddmmaaaa = (f: string) => f.split('-').reverse().join('/')

function diasChip(fecha: string): { texto: string; urgente: boolean } {
  const [y, m, d] = fecha.split('-').map(Number)
  const dias = Math.round(
    (new Date(y, m - 1, d).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000,
  )
  if (dias < 0) return { texto: `vencido hace ${-dias} d`, urgente: true }
  if (dias === 0) return { texto: 'vence hoy', urgente: true }
  if (dias === 1) return { texto: 'mañana', urgente: true }
  return { texto: `en ${dias} días`, urgente: dias <= 3 }
}

/**
 * Modal de un cobro/pago: muestra el detalle (tipo, medio, monto, vencimiento)
 * y permite marcarlo como cobrado/pagado. Se abre por su disparador (chip del
 * calendario, botón de la tabla) o controlado por deep-link (`?mov=` desde el
 * Inicio). Es el mismo modal que se ve al tocar una tarjeta del carrusel.
 */
export function LiquidarDialog({
  item,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  item: Vencimiento
  /** Disparador propio (ej. el chip del calendario); si no, botón por defecto. */
  trigger?: ReactNode
  /** Modo controlado (ej. deep-link `?mov=` desde el Inicio): sin disparador. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const controlado = openProp !== undefined
  const [openState, setOpenState] = useState(false)
  const open = controlado ? openProp : openState
  const setOpen = (v: boolean) => {
    if (controlado) onOpenChange?.(v)
    else setOpenState(v)
  }
  const [fecha, setFecha] = useState(hoy())
  const [error, setError] = useState<string | null>(null)
  const mut = useLiquidar()

  const cobro = item.tipo === 'ingreso'
  const liquidado = item.estado === 'liquidado'
  const titulo = item.contraparte ?? item.descripcion ?? (cobro ? 'Cobro' : 'Pago')
  const dias = item.fechaVencimiento ? diasChip(item.fechaVencimiento) : null

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

  return (
    <>
      {controlado ? null : trigger ? (
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
        <DialogContent className="overflow-hidden rounded-2xl sm:max-w-[400px]">
          {/* Franja superior con el color del tipo */}
          <div
            aria-hidden
            className={cn(
              'absolute inset-x-0 top-0 h-1',
              liquidado ? 'bg-field-deep' : cobro ? 'bg-field' : 'bg-tierra',
            )}
          />
          <DialogHeader className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {liquidado ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-field-deep/12 px-1.5 py-0.5 text-[10.5px] font-bold uppercase text-field-deep">
                  <CheckCircle2 className="size-3" />
                  {cobro ? 'Cobrado' : 'Pagado'}
                </span>
              ) : (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase',
                    cobro ? 'bg-field-soft text-field-deep' : 'bg-tierra-soft text-tierra',
                  )}
                >
                  {cobro ? (
                    <ArrowDownLeft className="size-3" />
                  ) : (
                    <ArrowUpRight className="size-3" />
                  )}
                  {cobro ? 'A cobrar' : 'A pagar'}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[10.5px] font-bold uppercase text-muted-foreground">
                {item.medio === 'cheque' && <Landmark className="size-3" />}
                {medioLabel(item.medio, item.esEcheq)}
              </span>
            </div>
            <DialogTitle className="text-left font-heading text-[19px] leading-snug">
              {titulo}
            </DialogTitle>
          </DialogHeader>

          <div
            className={cn(
              'tnum -mt-1 text-[26px] font-extrabold leading-none',
              liquidado ? 'text-ink/55' : cobro ? 'text-field-deep' : 'text-tierra',
            )}
          >
            {cobro ? '+' : '−'}${Math.round(item.monto).toLocaleString('es-AR')}
          </div>

          <div className="grid gap-1.5 rounded-xl border border-border bg-secondary/40 px-3.5 py-3 text-[12.5px]">
            {item.chequeBanco && (
              <div className="flex items-center gap-2">
                <Landmark className="size-3.5 text-faint" />
                <span className="text-muted-foreground">Banco</span>
                <span className="ml-auto font-semibold text-ink">{item.chequeBanco}</span>
              </div>
            )}
            {item.chequeNumero && (
              <div className="flex items-center gap-2">
                <Hash className="size-3.5 text-faint" />
                <span className="text-muted-foreground">N° de cheque</span>
                <span className="tnum ml-auto font-semibold text-ink">
                  {item.chequeNumero}
                </span>
              </div>
            )}
            {item.campo && (
              <div className="flex items-center gap-2">
                <MapPin className="size-3.5 text-faint" />
                <span className="text-muted-foreground">Campo</span>
                <span className="ml-auto font-semibold text-ink">{item.campo}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <CalendarClock className="size-3.5 text-faint" />
              <span className="text-muted-foreground">Vence</span>
              <span className="ml-auto flex items-center gap-1.5 font-semibold text-ink">
                {item.fechaVencimiento ? (
                  <>
                    <span className="tnum">{ddmmaaaa(item.fechaVencimiento)}</span>
                    {dias && (
                      <span
                        className={cn(
                          'rounded px-1 text-[10.5px] font-bold',
                          dias.urgente
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-secondary text-faint',
                        )}
                      >
                        {dias.texto}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-faint">sin fecha</span>
                )}
              </span>
            </div>
          </div>

          {liquidado ? (
            <div className="flex items-center justify-center gap-1.5 rounded-xl bg-field-soft py-2.5 text-[12.5px] font-semibold text-field-deep">
              <CheckCircle2 className="size-4" />
              {cobro ? 'Cobrado' : 'Pagado'}
              {item.fechaCobroPago && ` el ${ddmmaaaa(item.fechaCobroPago)}`}
            </div>
          ) : (
            <form onSubmit={onConfirm} className="grid gap-3">
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
              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
              <Button
                type="submit"
                disabled={mut.isPending}
                className="h-11 w-full gap-2 rounded-xl"
              >
                <Sparkles className="size-4" />
                {mut.isPending
                  ? 'Guardando…'
                  : cobro
                    ? 'Marcar como cobrado'
                    : 'Marcar como pagado'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
