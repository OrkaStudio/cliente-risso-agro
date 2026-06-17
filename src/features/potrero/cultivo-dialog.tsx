import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import type { Database } from '@/lib/supabase/types'
import { useActualizarCultivo } from '@/features/potrero/hooks'
import type { PotreroDetalle } from '@/features/potrero/api'
import { Button } from '@/components/ui/button'
import { Dropdown } from '@/components/ui/dropdown'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Destino = Database['public']['Enums']['destino_campania']
type Aprovechamiento = Database['public']['Enums']['aprovechamiento_forraje']

const CULTIVOS = [
  'Maíz',
  'Soja',
  'Trigo',
  'Girasol',
  'Sorgo',
  'Cebada',
  'Avena',
  'Raigrás',
  'Alfalfa',
  'Moha',
  'Festuca',
  'Pastura',
  'Verdeo',
]

const aprovechamientoLabel: Record<Aprovechamiento, string> = {
  pastoreo: 'Pastoreo directo',
  rollo: 'Rollo',
  silo: 'Silo',
  fardo: 'Fardo',
  diferido: 'Diferido',
}

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
  const [destino, setDestino] = useState('')
  const [aprovechamiento, setAprovechamiento] = useState('')
  const guardar = useActualizarCultivo(potrero.id)

  const esConsumo = destino === 'consumo'

  function abrir() {
    setCultivo(potrero.cultivo ?? '')
    setVariedad(potrero.variedad ?? '')
    setSiembra(potrero.fechaSiembra ?? '')
    setCosecha(potrero.fechaCosechaEstimada ?? '')
    setDestino(potrero.destino ?? '')
    setAprovechamiento(potrero.aprovechamiento ?? '')
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
        destino: (destino || null) as Destino | null,
        aprovechamiento: (aprovechamiento || null) as Aprovechamiento | null,
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
              <label className={labelClass}>Cultivo</label>
              <Dropdown
                block
                ariaLabel="Cultivo"
                value={cultivo}
                onChange={setCultivo}
                options={[
                  { value: '', label: 'Elegí…' },
                  ...CULTIVOS.map((c) => ({ value: c, label: c })),
                ]}
              />
            </div>

            {/* Destino: define si es centro de ganancia o de costo */}
            <div>
              <label className={labelClass}>¿Para qué?</label>
              <Dropdown
                block
                ariaLabel="Destino de la campaña"
                value={destino}
                onChange={(v) => {
                  setDestino(v)
                  if (v !== 'consumo') setAprovechamiento('')
                }}
                options={[
                  { value: '', label: 'Sin definir' },
                  { value: 'venta', label: 'Cosechar y vender' },
                  { value: 'consumo', label: 'Consumo animal (forraje)' },
                ]}
              />
              <p className="mt-1.5 text-[11.5px] text-faint">
                {esConsumo
                  ? 'Forraje: es un costo que alimenta a la hacienda, no una venta.'
                  : destino === 'venta'
                    ? 'Se cosecha y se vende: la rentabilidad se mide por la venta.'
                    : 'Definí si la cosecha se vende o se la comen los animales.'}
              </p>
            </div>

            {esConsumo && (
              <div>
                <label className={labelClass}>Aprovechamiento</label>
                <Dropdown
                  block
                  ariaLabel="Aprovechamiento"
                  value={aprovechamiento}
                  onChange={setAprovechamiento}
                  options={[
                    { value: '', label: 'Sin especificar' },
                    ...Object.entries(aprovechamientoLabel).map(([v, l]) => ({
                      value: v,
                      label: l,
                    })),
                  ]}
                />
              </div>
            )}

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
                  {esConsumo ? 'Uso estimado' : 'Cosecha estimada'}
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
