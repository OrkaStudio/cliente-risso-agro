import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { AnimatePresence, motion, type Variants } from 'framer-motion'
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Repeat } from 'lucide-react'
import { Constants, type Database } from '@/lib/supabase/types'
import { useCampos, usePotreros } from '@/features/campos/hooks'
import { useCategorias, useCrearSerie } from '@/features/analitica/hooks'
import { actividadLabel } from '@/features/analitica/compute'
import { frecuenciaLabel, type Frecuencia } from '@/features/analitica/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Dropdown } from '@/components/ui/dropdown'
import { cn } from '@/lib/utils'

type TipoMov = Database['public']['Enums']['tipo_movimiento']
type MedioPago = Database['public']['Enums']['medio_pago']
type ActividadMov = Database['public']['Enums']['actividad_movimiento']

const label = 'mb-1.5 block text-[12px] font-semibold text-ink'
const field =
  'h-10 w-full rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-ink shadow-[0_1px_2px_rgba(16,24,19,0.05)] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-field-soft placeholder:text-faint'

const medioPagoLabel: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  mercadopago: 'MercadoPago',
  otro: 'Otro',
}

const hoy = () => new Date().toISOString().slice(0, 10)
const OFFSET: Record<Frecuencia, number> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
}
const fmtMes = (f: string) => {
  const [y, m] = f.split('-')
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${MESES[Number(m) - 1]}-${y.slice(2)}`
}
const addMeses = (f: string, meses: number) => {
  const [y, m, d] = f.split('-').map(Number)
  const dt = new Date(y, m - 1 + meses, d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
const fmtMonto = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
    : n >= 1_000
      ? `$${Math.round(n / 1_000)}k`
      : `$${n}`

const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const fade: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 26 } },
}

/** Alta de un gasto/ingreso recurrente o en cuotas: genera toda la serie. */
export function CargarRecurrenteDialog({ empresaId }: { empresaId: string }) {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<TipoMov>('gasto')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('mensual')
  const [cantidad, setCantidad] = useState('12')
  const [primera, setPrimera] = useState(hoy())
  const [categoriaId, setCategoriaId] = useState('')
  const [campoId, setCampoId] = useState('')
  const [potreroId, setPotreroId] = useState('')
  const [actividad, setActividad] = useState('')
  const [medioPago, setMedioPago] = useState('')
  const [masOpciones, setMasOpciones] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const categorias = useCategorias()
  const campos = useCampos()
  const potreros = usePotreros(campoId)
  const crear = useCrearSerie()

  const esGasto = tipo === 'gasto'
  const montoNum = Number(monto)
  const cant = Math.max(0, Math.floor(Number(cantidad) || 0))
  const total = montoNum > 0 ? montoNum * cant : 0
  const ultima = cant > 0 ? addMeses(primera, (cant - 1) * OFFSET[frecuencia]) : primera

  const categoriasFiltradas = useMemo(
    () =>
      (categorias.data ?? []).filter(
        (c) => c.aplica_a === null || c.aplica_a === tipo,
      ),
    [categorias.data, tipo],
  )

  function reset() {
    setTipo('gasto')
    setDescripcion('')
    setMonto('')
    setFrecuencia('mensual')
    setCantidad('12')
    setPrimera(hoy())
    setCategoriaId('')
    setCampoId('')
    setPotreroId('')
    setActividad('')
    setMedioPago('')
    setMasOpciones(false)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!descripcion.trim()) return setError('Ponele un nombre (ej: Cuota camioneta)')
    if (!monto || Number.isNaN(montoNum) || montoNum <= 0)
      return setError('Ingresá el monto de cada cuota')
    if (cant < 1) return setError('La cantidad de cuotas debe ser 1 o más')
    if (!categoriaId) return setError('Elegí la categoría')
    if (!campoId) return setError('Elegí el campo')
    try {
      await crear.mutateAsync({
        empresaId,
        tipo,
        categoriaId,
        campoId,
        potreroId: potreroId || null,
        actividad: (actividad || null) as ActividadMov | null,
        montoCuota: montoNum,
        frecuencia,
        primeraFecha: primera,
        cantidad: cant,
        descripcion,
        medioPago: (medioPago || null) as MedioPago | null,
      })
      toast.success(`Serie creada: ${cant} cuotas`)
      setOpen(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!empresaId} variant="outline">
        <Repeat className="size-4" />
        Recurrente / cuotas
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              Gasto recurrente o en cuotas
            </DialogTitle>
          </DialogHeader>

          <motion.form
            onSubmit={onSubmit}
            variants={stagger}
            initial="hidden"
            animate="show"
            className="grid gap-4"
          >
            {/* Tipo */}
            <motion.div variants={fade} className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setTipo('gasto')
                  setCategoriaId('')
                }}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-4 py-3 text-sm font-bold transition-colors',
                  esGasto
                    ? 'border-tierra bg-tierra-soft text-tierra'
                    : 'border-border bg-card text-muted-foreground hover:border-faint',
                )}
              >
                <ArrowUpRight className="size-[18px]" />
                Pago
              </button>
              <button
                type="button"
                onClick={() => {
                  setTipo('ingreso')
                  setCategoriaId('')
                }}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-4 py-3 text-sm font-bold transition-colors',
                  !esGasto
                    ? 'border-primary bg-field-soft text-field-deep'
                    : 'border-border bg-card text-muted-foreground hover:border-faint',
                )}
              >
                <ArrowDownLeft className="size-[18px]" />
                Cobro
              </button>
            </motion.div>

            {/* Descripción */}
            <motion.div variants={fade}>
              <label htmlFor="r-desc" className={label}>
                ¿Qué es?
              </label>
              <input
                id="r-desc"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: Cuota camioneta · Alquiler La Lucía"
                autoFocus
                className={field}
              />
            </motion.div>

            {/* Monto por cuota */}
            <motion.div variants={fade}>
              <label htmlFor="r-monto" className={label}>
                Monto de cada cuota
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-heading text-lg font-bold text-faint">
                  $
                </span>
                <input
                  id="r-monto"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={monto ? Number(monto).toLocaleString('es-AR') : ''}
                  onChange={(e) => setMonto(e.target.value.replace(/\D/g, ''))}
                  className={cn(field, 'tnum h-12 pl-8 text-xl font-bold')}
                />
              </div>
            </motion.div>

            {/* Frecuencia + Cantidad */}
            <motion.div variants={fade} className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Cada</label>
                <Dropdown
                  block
                  ariaLabel="Frecuencia"
                  value={frecuencia}
                  onChange={(v) => setFrecuencia(v as Frecuencia)}
                  options={Object.entries(frecuenciaLabel).map(([v, l]) => ({
                    value: v,
                    label: l,
                  }))}
                />
              </div>
              <div>
                <label htmlFor="r-cant" className={label}>
                  Cuotas
                </label>
                <input
                  id="r-cant"
                  type="number"
                  min={1}
                  max={120}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className={cn(field, 'tnum')}
                />
              </div>
            </motion.div>

            {/* Primera fecha */}
            <motion.div variants={fade}>
              <label htmlFor="r-primera" className={label}>
                Primer vencimiento
              </label>
              <input
                id="r-primera"
                type="date"
                value={primera}
                onChange={(e) => setPrimera(e.target.value)}
                className={cn(field, '[color-scheme:light]')}
              />
            </motion.div>

            {/* Preview */}
            {montoNum > 0 && cant > 0 && (
              <motion.div
                variants={fade}
                className="rounded-xl border border-border bg-secondary/60 px-3.5 py-2.5 text-[13px]"
              >
                <span className="font-bold text-ink">
                  {cant} cuotas de {fmtMonto(montoNum)}
                </span>
                <span className="text-muted-foreground">
                  {' '}· total {fmtMonto(total)} · de {fmtMes(primera)} a{' '}
                  {fmtMes(ultima)}
                </span>
              </motion.div>
            )}

            {/* Categoría + Campo */}
            <motion.div variants={fade} className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Categoría</label>
                <Dropdown
                  block
                  ariaLabel="Categoría"
                  value={categoriaId}
                  onChange={setCategoriaId}
                  options={[
                    { value: '', label: 'Elegí…' },
                    ...categoriasFiltradas.map((c) => ({ value: c.id, label: c.nombre })),
                  ]}
                />
              </div>
              <div>
                <label className={label}>Campo</label>
                <Dropdown
                  block
                  ariaLabel="Campo"
                  value={campoId}
                  onChange={(v) => {
                    setCampoId(v)
                    setPotreroId('')
                  }}
                  options={[
                    { value: '', label: 'Elegí…' },
                    ...(campos.data ?? []).map((c) => ({ value: c.id, label: c.nombre })),
                  ]}
                />
              </div>
            </motion.div>

            {/* Actividad */}
            <motion.div variants={fade}>
              <label className={label}>Actividad</label>
              <Dropdown
                block
                ariaLabel="Actividad"
                value={actividad}
                onChange={setActividad}
                options={[
                  { value: '', label: 'Sin asignar' },
                  ...Constants.public.Enums.actividad_movimiento.map((a) => ({
                    value: a,
                    label: actividadLabel[a],
                  })),
                ]}
              />
            </motion.div>

            {/* Más opciones */}
            <motion.div variants={fade}>
              <button
                type="button"
                onClick={() => setMasOpciones((m) => !m)}
                className="flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-[13px] font-semibold text-field-deep"
              >
                Más opciones (potrero, medio de pago)
                <ChevronDown
                  className={cn('size-4 transition-transform', masOpciones && 'rotate-180')}
                />
              </button>
              <AnimatePresence initial={false}>
                {masOpciones && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-2 gap-3 pt-3">
                      <div>
                        <label className={label}>Potrero</label>
                        <Dropdown
                          block
                          ariaLabel="Potrero"
                          value={potreroId}
                          onChange={setPotreroId}
                          options={[
                            { value: '', label: campoId ? 'Todo el campo' : 'Elegí campo' },
                            ...(potreros.data ?? []).map((p) => ({ value: p.id, label: p.nombre })),
                          ]}
                        />
                      </div>
                      <div>
                        <label className={label}>
                          {esGasto ? 'Medio de pago' : 'Medio de cobro'}
                        </label>
                        <Dropdown
                          block
                          ariaLabel="Medio"
                          value={medioPago}
                          onChange={setMedioPago}
                          options={[
                            { value: '', label: '—' },
                            ...Constants.public.Enums.medio_pago.map((m) => ({
                              value: m,
                              label: medioPagoLabel[m],
                            })),
                          ]}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {error && <p className="text-sm font-medium text-destructive">{error}</p>}

            <motion.div variants={fade}>
              <Button
                type="submit"
                disabled={crear.isPending || !empresaId}
                className="h-11 w-full rounded-xl"
              >
                {crear.isPending ? 'Generando…' : `Crear ${cant || ''} cuotas`}
              </Button>
            </motion.div>
          </motion.form>
        </DialogContent>
      </Dialog>
    </>
  )
}
