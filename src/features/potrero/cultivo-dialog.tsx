import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useActualizarCultivo } from '@/features/potrero/hooks'
import type { PotreroDetalle } from '@/features/potrero/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const CULTIVOS = [
  'Maíz',
  'Soja',
  'Trigo',
  'Girasol',
  'Sorgo',
  'Cebada',
  'Avena',
  'Alfalfa',
  'Pastura',
  'Verdeo',
]

const labelClass =
  'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.06em] text-faint'
const fieldClass =
  'w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-ink shadow-[0_1px_2px_rgba(16,24,19,0.05)] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-field-soft placeholder:text-faint'

/** Diálogo para cargar/editar la campaña agrícola del potrero. */
export function CultivoDialog({
  potrero,
  triggerLabel,
}: {
  potrero: PotreroDetalle
  triggerLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [cultivo, setCultivo] = useState('')
  const [variedad, setVariedad] = useState('')
  const [siembra, setSiembra] = useState('')
  const [cosecha, setCosecha] = useState('')
  const guardar = useActualizarCultivo(potrero.id)

  function abrir() {
    setCultivo(potrero.cultivo ?? '')
    setVariedad(potrero.variedad ?? '')
    setSiembra(potrero.fechaSiembra ?? '')
    setCosecha(potrero.fechaCosechaEstimada ?? '')
    setOpen(true)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await guardar.mutateAsync({
        id: potrero.id,
        cultivo: cultivo.trim() || null,
        variedad: variedad.trim() || null,
        fechaSiembra: siembra || null,
        fechaCosechaEstimada: cosecha || null,
      })
      toast.success('Campaña actualizada')
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:border-faint"
      >
        {triggerLabel}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            Campaña agrícola
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-5">
          <div>
            <label htmlFor="c-cultivo" className={labelClass}>
              Cultivo
            </label>
            <input
              id="c-cultivo"
              list="cultivos"
              value={cultivo}
              onChange={(e) => setCultivo(e.target.value)}
              placeholder="Ej: Maíz"
              className={fieldClass}
            />
            <datalist id="cultivos">
              {CULTIVOS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="c-variedad" className={labelClass}>
              Variedad / semilla{' '}
              <span className="font-medium normal-case">(opcional)</span>
            </label>
            <input
              id="c-variedad"
              value={variedad}
              onChange={(e) => setVariedad(e.target.value)}
              placeholder="Ej: DK 72-10"
              className={fieldClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="c-siembra" className={labelClass}>
                Siembra
              </label>
              <input
                id="c-siembra"
                type="date"
                value={siembra}
                onChange={(e) => setSiembra(e.target.value)}
                className={`${fieldClass} [color-scheme:light]`}
              />
            </div>
            <div>
              <label htmlFor="c-cosecha" className={labelClass}>
                Cosecha estimada
              </label>
              <input
                id="c-cosecha"
                type="date"
                value={cosecha}
                onChange={(e) => setCosecha(e.target.value)}
                className={`${fieldClass} [color-scheme:light]`}
              />
            </div>
          </div>
          <p className="text-xs text-faint">
            Dejá los campos vacíos para limpiar la campaña (cuando el potrero
            vuelve a ganadero o descanso).
          </p>
          <Button type="submit" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
