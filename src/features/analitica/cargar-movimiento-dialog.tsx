import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { AnimatePresence, motion, type Variants } from 'framer-motion'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  CircleCheck,
  Clock,
} from 'lucide-react'
import { Constants, type Database } from '@/lib/supabase/types'
import { useCampos, usePotreros } from '@/features/campos/hooks'
import { useCategorias, useCrearMovimiento } from '@/features/analitica/hooks'
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

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}
const fade: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 26 } },
}

export function CargarMovimientoDialog({ empresaId }: { empresaId: string }) {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<TipoMov>('gasto')
  const [categoriaId, setCategoriaId] = useState('')
  const [campoId, setCampoId] = useState('')
  const [potreroId, setPotreroId] = useState('')
  const [monto, setMonto] = useState('')
  const [liquidado, setLiquidado] = useState(true) // ya se pagó/cobró
  const [fecha, setFecha] = useState(hoy())
  const [vence, setVence] = useState('')
  const [medioPago, setMedioPago] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [esEcheq, setEsEcheq] = useState(false)
  const [chequeNumero, setChequeNumero] = useState('')
  const [chequeBanco, setChequeBanco] = useState('')
  const [contraparte, setContraparte] = useState('')
  const [masOpciones, setMasOpciones] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const categorias = useCategorias()
  const campos = useCampos()
  const potreros = usePotreros(campoId)
  const crear = useCrearMovimiento()

  const esGasto = tipo === 'gasto'
  const esCheque = medioPago === 'cheque'

  const categoriasFiltradas = useMemo(
    () =>
      (categorias.data ?? []).filter(
        (c) => c.aplica_a === null || c.aplica_a === tipo,
      ),
    [categorias.data, tipo],
  )

  function elegirTipo(t: TipoMov) {
    setTipo(t)
    setCategoriaId('')
  }

  function reset() {
    setCategoriaId('')
    setMonto('')
    setLiquidado(true)
    setFecha(hoy())
    setVence('')
    setMedioPago('')
    setDescripcion('')
    setEsEcheq(false)
    setChequeNumero('')
    setChequeBanco('')
    setContraparte('')
    setMasOpciones(false)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const montoNum = Number(monto)
    if (!monto || Number.isNaN(montoNum) || montoNum <= 0)
      return setError('Ingresá un monto válido')
    if (!categoriaId) return setError('Elegí la categoría')
    if (!campoId) return setError('Elegí el campo')

    try {
      await crear.mutateAsync({
        empresaId,
        tipo,
        categoriaId,
        campoId,
        potreroId: potreroId || null,
        monto: montoNum,
        fechaDevengo: fecha,
        fechaVencimiento: liquidado ? null : vence || null,
        fechaCobroPago: liquidado ? fecha : null,
        medioPago: (medioPago || null) as MedioPago | null,
        descripcion,
        esEcheq,
        chequeNumero,
        chequeBanco,
        contraparte,
      })
      toast.success('Movimiento cargado')
      setOpen(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!empresaId}>
        + Cargar gasto/ingreso
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              Cargar movimiento
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
                onClick={() => elegirTipo('gasto')}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-4 py-3 text-sm font-bold transition-colors',
                  esGasto
                    ? 'border-tierra bg-tierra-soft text-tierra'
                    : 'border-border bg-card text-muted-foreground hover:border-faint',
                )}
              >
                <ArrowUpRight className="size-[18px]" />
                Gasto
              </button>
              <button
                type="button"
                onClick={() => elegirTipo('ingreso')}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-4 py-3 text-sm font-bold transition-colors',
                  !esGasto
                    ? 'border-primary bg-field-soft text-field-deep'
                    : 'border-border bg-card text-muted-foreground hover:border-faint',
                )}
              >
                <ArrowDownLeft className="size-[18px]" />
                Ingreso
              </button>
            </motion.div>

            {/* Monto */}
            <motion.div variants={fade}>
              <label htmlFor="mv-monto" className={label}>
                Monto
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-heading text-lg font-bold text-faint">
                  $
                </span>
                <input
                  id="mv-monto"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  autoFocus
                  value={monto ? Number(monto).toLocaleString('es-AR') : ''}
                  onChange={(e) => setMonto(e.target.value.replace(/\D/g, ''))}
                  className={cn(field, 'tnum h-12 pl-8 text-xl font-bold')}
                />
              </div>
            </motion.div>

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
                    ...categoriasFiltradas.map((c) => ({
                      value: c.id,
                      label: c.nombre,
                    })),
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
                    ...(campos.data ?? []).map((c) => ({
                      value: c.id,
                      label: c.nombre,
                    })),
                  ]}
                />
              </div>
            </motion.div>

            {/* Estado: ya se pagó/cobró vs pendiente */}
            <motion.div variants={fade}>
              <label className={label}>Estado</label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setLiquidado(true)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-3 py-2.5 text-sm font-semibold transition-colors',
                    liquidado
                      ? 'border-primary bg-field-soft text-field-deep'
                      : 'border-border bg-card text-muted-foreground hover:border-faint',
                  )}
                >
                  <CircleCheck className="size-4" />
                  Ya se {esGasto ? 'pagó' : 'cobró'}
                </button>
                <button
                  type="button"
                  onClick={() => setLiquidado(false)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-3 py-2.5 text-sm font-semibold transition-colors',
                    !liquidado
                      ? 'border-sol-deep bg-sol-soft text-sol-deep'
                      : 'border-border bg-card text-muted-foreground hover:border-faint',
                  )}
                >
                  <Clock className="size-4" />
                  Queda pendiente
                </button>
              </div>
            </motion.div>

            {/* Fechas según estado */}
            <motion.div variants={fade}>
              {liquidado ? (
                <div>
                  <label htmlFor="mv-fecha" className={label}>
                    Fecha del {esGasto ? 'pago' : 'cobro'}
                  </label>
                  <input
                    id="mv-fecha"
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className={cn(field, '[color-scheme:light]')}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="mv-fecha" className={label}>
                      Cuándo ocurrió
                    </label>
                    <input
                      id="mv-fecha"
                      type="date"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      className={cn(field, '[color-scheme:light]')}
                    />
                  </div>
                  <div>
                    <label htmlFor="mv-vence" className={label}>
                      Vence el
                    </label>
                    <input
                      id="mv-vence"
                      type="date"
                      value={vence}
                      onChange={(e) => setVence(e.target.value)}
                      className={cn(field, '[color-scheme:light]')}
                    />
                  </div>
                </div>
              )}
            </motion.div>

            {/* Más opciones */}
            <motion.div variants={fade}>
              <button
                type="button"
                onClick={() => setMasOpciones((m) => !m)}
                className="flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-[13px] font-semibold text-field-deep"
              >
                Más opciones (potrero, medio de pago, cheque, nota)
                <ChevronDown
                  className={cn(
                    'size-4 transition-transform',
                    masOpciones && 'rotate-180',
                  )}
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
                    <div className="grid gap-4 pt-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={label}>Potrero</label>
                          <Dropdown
                            block
                            ariaLabel="Potrero"
                            value={potreroId}
                            onChange={setPotreroId}
                            options={[
                              { value: '', label: 'Todo el campo' },
                              ...(potreros.data ?? []).map((p) => ({
                                value: p.id,
                                label: p.nombre,
                              })),
                            ]}
                          />
                        </div>
                        <div>
                          <label className={label}>Medio de pago</label>
                          <Dropdown
                            block
                            ariaLabel="Medio de pago"
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

                      {esCheque && (
                        <div className="grid gap-3 rounded-xl border border-border bg-secondary/50 p-3.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
                              Datos del cheque
                            </span>
                            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink">
                              <input
                                type="checkbox"
                                checked={esEcheq}
                                onChange={(e) => setEsEcheq(e.target.checked)}
                                className="size-4 accent-[var(--primary)]"
                              />
                              Es echeq
                            </label>
                          </div>
                          <input
                            value={contraparte}
                            onChange={(e) => setContraparte(e.target.value)}
                            placeholder={
                              esGasto ? 'Beneficiario' : 'Emisor'
                            }
                            className={field}
                          />
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              value={chequeBanco}
                              onChange={(e) => setChequeBanco(e.target.value)}
                              placeholder="Banco"
                              className={field}
                            />
                            <input
                              value={chequeNumero}
                              onChange={(e) => setChequeNumero(e.target.value)}
                              placeholder="N° de cheque"
                              className={cn(field, 'tnum')}
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label htmlFor="mv-desc" className={label}>
                          Descripción
                        </label>
                        <input
                          id="mv-desc"
                          value={descripcion}
                          onChange={(e) => setDescripcion(e.target.value)}
                          placeholder="Ej: antiparasitario"
                          className={field}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}

            <motion.div variants={fade}>
              <Button
                type="submit"
                disabled={crear.isPending || !empresaId}
                className="h-11 w-full rounded-xl"
              >
                {crear.isPending ? 'Guardando…' : 'Cargar movimiento'}
              </Button>
            </motion.div>
          </motion.form>
        </DialogContent>
      </Dialog>
    </>
  )
}
