import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { ArrowDownLeft, ArrowUpRight, Landmark } from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import { useCampos } from '@/features/campos/hooks'
import { useCategorias, useCrearMovimiento } from '@/features/analitica/hooks'
import { Button } from '@/components/ui/button'
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

/**
 * Carga dedicada de cheque/echeq = movimiento con `medio_pago = cheque`. Vive en
 * Analítica (toda la carga centralizada). Aparece luego en la Agenda como un
 * vencimiento más (filtro medio = cheque). La fecha es obligatoria: vencimiento
 * si está pendiente, fecha de cobro/pago si ya se saldó.
 */
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
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={!empresaId}
        className="gap-1.5"
      >
        <Landmark className="size-4" />
        Cheque
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

        <motion.div variants={formItem}>
          <CheckCard checked={esEcheq} onChange={setEsEcheq}>
            Es echeq (cheque electrónico)
          </CheckCard>
        </motion.div>

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
