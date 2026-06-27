import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
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
import {
  CheckCard,
  FormDialog,
  formField,
  formItem,
  formLabel,
} from '@/components/form-dialog'
import { cn } from '@/lib/utils'

type TipoMov = Database['public']['Enums']['tipo_movimiento']

const hoy = () => new Date().toISOString().slice(0, 10)

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
  const [yaSaldado, setYaSaldado] = useState(false)
  const [fechaSaldado, setFechaSaldado] = useState(hoy())
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
    setYaSaldado(false)
    setFechaSaldado(hoy())
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const montoNum = Number(monto)
    if (!monto || Number.isNaN(montoNum) || montoNum <= 0)
      return setError('Ingresá un monto válido')
    if (!categoriaId) return setError('Elegí la categoría')
    if (!campoId) return setError('Elegí el campo')
    // Si ya se cobró/pagó, el vencimiento es opcional; si no, es obligatorio.
    if (!yaSaldado && !vence)
      return setError('Ingresá la fecha de vencimiento')
    if (yaSaldado && !fechaSaldado)
      return setError(`Ingresá la fecha en que se ${esPago ? 'pagó' : 'cobró'}`)

    try {
      await crear.mutateAsync({
        empresaId,
        tipo,
        categoriaId,
        campoId,
        monto: montoNum,
        fechaDevengo: hoy(),
        fechaVencimiento: vence || null,
        // Si ya está saldado → liquidado (lo deriva crearMovimiento).
        fechaCobroPago: yaSaldado ? fechaSaldado : null,
        medioPago: 'cheque',
        descripcion: '',
        esEcheq,
        chequeNumero: numero,
        chequeBanco: banco,
        contraparte,
      })
      toast.success(
        yaSaldado
          ? esPago
            ? 'Cheque pagado cargado'
            : 'Cheque cobrado cargado'
          : esEcheq
            ? 'Echeq cargado'
            : 'Cheque cargado',
      )
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
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        icon={Landmark}
        title="Cargar cheque"
        subtitle="Registrá un cobro o pago con cheque o echeq"
        onSubmit={onSubmit}
        footer={
          <Button
            type="submit"
            disabled={crear.isPending || !empresaId}
            className="h-12 w-full rounded-xl text-[15px] font-semibold shadow-[0_4px_14px_rgba(16,30,20,0.18)]"
          >
            {crear.isPending
              ? 'Guardando…'
              : yaSaldado
                ? `Cargar cheque ${esPago ? 'pagado' : 'cobrado'}`
                : 'Cargar cheque'}
          </Button>
        }
      >
        {/* Tipo */}
        <motion.div variants={formItem} className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setTipo('ingreso')}
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
            onClick={() => setTipo('gasto')}
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
        <motion.div variants={formItem}>
          <label htmlFor="ch-monto" className={formLabel}>
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
              className={cn(formField, 'tnum h-12 pl-8 text-xl font-bold')}
            />
          </div>
        </motion.div>

        {/* Es echeq */}
        <motion.div variants={formItem}>
          <CheckCard checked={esEcheq} onChange={setEsEcheq}>
            Es echeq (cheque electrónico)
          </CheckCard>
        </motion.div>

        {/* Contraparte + banco + número */}
        <motion.div variants={formItem} className="grid gap-3">
          <div>
            <label className={formLabel}>{esPago ? 'Beneficiario' : 'Emisor'}</label>
            <input
              value={contraparte}
              onChange={(e) => setContraparte(e.target.value)}
              placeholder={esPago ? 'A quién se le paga' : 'Quién lo emitió'}
              className={formField}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={formLabel}>Banco</label>
              <input
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
                placeholder="Banco"
                className={formField}
              />
            </div>
            <div>
              <label className={formLabel}>N° de cheque</label>
              <input
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="N°"
                className={cn(formField, 'tnum')}
              />
            </div>
          </div>
        </motion.div>

        {/* Vencimiento */}
        <motion.div variants={formItem}>
          <label htmlFor="ch-vence" className={formLabel}>
            Vence el{' '}
            {yaSaldado && <span className="font-normal text-faint">(opcional)</span>}
          </label>
          <input
            id="ch-vence"
            type="date"
            value={vence}
            onChange={(e) => setVence(e.target.value)}
            className={cn(formField, '[color-scheme:light]')}
          />
        </motion.div>

        {/* Ya cobrado / pagado */}
        <motion.div variants={formItem} className="grid gap-3">
          <CheckCard checked={yaSaldado} onChange={setYaSaldado}>
            {esPago ? 'Ya está pagado' : 'Ya está cobrado'}
          </CheckCard>
          {yaSaldado && (
            <div>
              <label htmlFor="ch-fecha-saldado" className={formLabel}>
                Fecha en que se {esPago ? 'pagó' : 'cobró'}
              </label>
              <input
                id="ch-fecha-saldado"
                type="date"
                value={fechaSaldado}
                onChange={(e) => setFechaSaldado(e.target.value)}
                className={cn(formField, '[color-scheme:light]')}
              />
            </div>
          )}
        </motion.div>

        {/* Categoría + Campo */}
        <motion.div variants={formItem} className="grid grid-cols-2 gap-3">
          <div>
            <label className={formLabel}>Categoría</label>
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
            <label className={formLabel}>Campo</label>
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

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      </FormDialog>
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
