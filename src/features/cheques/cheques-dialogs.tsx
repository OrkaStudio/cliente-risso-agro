import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { motion, type Variants } from 'framer-motion'
import { ArrowDownLeft, ArrowUpRight, CircleCheck, Landmark } from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import { useCampos } from '@/features/campos/hooks'
import { useCategorias, useCrearMovimiento } from '@/features/analitica/hooks'
import { useLiquidarCheque } from '@/features/cheques/hooks'
import type { Cheque } from '@/features/cheques/api'
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

const label = 'mb-1.5 block text-[12px] font-semibold text-ink'
const field =
  'h-10 w-full rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-ink shadow-[0_1px_2px_rgba(16,24,19,0.05)] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-field-soft placeholder:text-faint'

const hoy = () => new Date().toISOString().slice(0, 10)

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}
const fade: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 320, damping: 26 },
  },
}

// --- Carga dedicada de cheque ----------------------------------------
export function CargarChequeDialog({ empresaId }: { empresaId: string }) {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<TipoMov>('gasto')
  const [categoriaId, setCategoriaId] = useState('')
  const [campoId, setCampoId] = useState('')
  const [monto, setMonto] = useState('')
  const [contraparte, setContraparte] = useState('')
  const [banco, setBanco] = useState('')
  const [numero, setNumero] = useState('')
  const [esEcheq, setEsEcheq] = useState(false)
  const [vence, setVence] = useState('')
  const [error, setError] = useState<string | null>(null)

  const categorias = useCategorias()
  const campos = useCampos()
  const crear = useCrearMovimiento()

  const esPago = tipo === 'gasto'

  const categoriasFiltradas = useMemo(
    () =>
      (categorias.data ?? []).filter(
        (c) => c.aplica_a === null || c.aplica_a === tipo,
      ),
    [categorias.data, tipo],
  )

  function reset() {
    setTipo('gasto')
    setCategoriaId('')
    setCampoId('')
    setMonto('')
    setContraparte('')
    setBanco('')
    setNumero('')
    setEsEcheq(false)
    setVence('')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const montoNum = Number(monto)
    if (!monto || Number.isNaN(montoNum) || montoNum <= 0)
      return setError('Ingresá un monto válido')
    if (!categoriaId) return setError('Elegí la categoría')
    if (!campoId) return setError('Elegí el campo')
    if (!vence) return setError('Ingresá la fecha de vencimiento')

    try {
      await crear.mutateAsync({
        empresaId,
        tipo,
        categoriaId,
        campoId,
        monto: montoNum,
        fechaDevengo: hoy(),
        fechaVencimiento: vence,
        fechaCobroPago: null, // pendiente hasta que se cobre/pague
        medioPago: 'cheque',
        descripcion: '',
        esEcheq,
        chequeNumero: numero,
        chequeBanco: banco,
        contraparte,
      })
      toast.success(esEcheq ? 'Echeq cargado' : 'Cheque cargado')
      setOpen(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!empresaId}>
        + Cargar cheque
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              Cargar cheque
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
                  setTipo('ingreso')
                  setCategoriaId('')
                }}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-4 py-3 text-sm font-bold transition-colors',
                  !esPago
                    ? 'border-primary bg-field-soft text-field-deep'
                    : 'border-border bg-card text-muted-foreground hover:border-faint',
                )}
              >
                <ArrowDownLeft className="size-[18px]" />
                A cobrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setTipo('gasto')
                  setCategoriaId('')
                }}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-4 py-3 text-sm font-bold transition-colors',
                  esPago
                    ? 'border-tierra bg-tierra-soft text-tierra'
                    : 'border-border bg-card text-muted-foreground hover:border-faint',
                )}
              >
                <ArrowUpRight className="size-[18px]" />
                A pagar
              </button>
            </motion.div>

            {/* Monto */}
            <motion.div variants={fade}>
              <label htmlFor="ch-monto" className={label}>
                Monto
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-heading text-lg font-bold text-faint">
                  $
                </span>
                <input
                  id="ch-monto"
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

            {/* Es echeq */}
            <motion.div variants={fade}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-secondary/50 px-3.5 py-2.5 text-sm font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={esEcheq}
                  onChange={(e) => setEsEcheq(e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                Es echeq (cheque electrónico)
              </label>
            </motion.div>

            {/* Contraparte + banco + número */}
            <motion.div variants={fade} className="grid gap-3">
              <div>
                <label className={label}>
                  {esPago ? 'Beneficiario' : 'Emisor'}
                </label>
                <input
                  value={contraparte}
                  onChange={(e) => setContraparte(e.target.value)}
                  placeholder={esPago ? 'A quién se le paga' : 'Quién lo emitió'}
                  className={field}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Banco</label>
                  <input
                    value={banco}
                    onChange={(e) => setBanco(e.target.value)}
                    placeholder="Banco"
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>N° de cheque</label>
                  <input
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    placeholder="N°"
                    className={cn(field, 'tnum')}
                  />
                </div>
              </div>
            </motion.div>

            {/* Vencimiento */}
            <motion.div variants={fade}>
              <label htmlFor="ch-vence" className={label}>
                Vence el
              </label>
              <input
                id="ch-vence"
                type="date"
                value={vence}
                onChange={(e) => setVence(e.target.value)}
                className={cn(field, '[color-scheme:light]')}
              />
            </motion.div>

            {/* Categoría + campo */}
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
                  onChange={setCampoId}
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

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}

            <motion.div variants={fade}>
              <Button
                type="submit"
                disabled={crear.isPending || !empresaId}
                className="h-11 w-full rounded-xl"
              >
                {crear.isPending ? 'Guardando…' : 'Cargar cheque'}
              </Button>
            </motion.div>
          </motion.form>
        </DialogContent>
      </Dialog>
    </>
  )
}

// --- Liquidar (marcar cobrado/pagado) --------------------------------
export function LiquidarChequeDialog({
  cheque,
  trigger,
}: {
  cheque: Cheque
  /** Si se pasa, se usa como disparador en vez del botón por defecto. */
  trigger?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [fecha, setFecha] = useState(hoy())
  const [error, setError] = useState<string | null>(null)
  const mut = useLiquidarCheque()
  const cobro = cheque.tipo === 'ingreso'

  async function onConfirm(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await mut.mutateAsync({ id: cheque.id, fecha })
      toast.success(cobro ? 'Cheque cobrado' : 'Cheque pagado')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

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
          <CircleCheck className="size-3.5" />
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
                {cheque.contraparte ?? cheque.descripcion ?? 'Cheque'}
                {cheque.numero && (
                  <span className="tnum text-faint">· N° {cheque.numero}</span>
                )}
              </div>
              <div className="tnum mt-1 text-[15px] font-bold text-ink">
                ${Math.round(cheque.monto).toLocaleString('es-AR')}
              </div>
            </div>
            <div>
              <label htmlFor="liq-fecha" className={label}>
                Fecha en que se {cobro ? 'cobró' : 'pagó'}
              </label>
              <input
                id="liq-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className={cn(field, '[color-scheme:light]')}
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
