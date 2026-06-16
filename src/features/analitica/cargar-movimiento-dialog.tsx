import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleCheck,
  TriangleAlert,
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
import { cn } from '@/lib/utils'

type TipoMov = Database['public']['Enums']['tipo_movimiento']

const fieldClass =
  'w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-ink shadow-[0_1px_2px_rgba(16,24,19,0.05)] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-field-soft placeholder:text-faint'
const labelClass =
  'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.06em] text-faint'

const medioPagoLabel: Record<
  Database['public']['Enums']['medio_pago'],
  string
> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  mercadopago: 'MercadoPago',
  otro: 'Otro',
}

const hoy = () => new Date().toISOString().slice(0, 10)

export function CargarMovimientoDialog({ empresaId }: { empresaId: string }) {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<TipoMov>('gasto')
  const [categoriaId, setCategoriaId] = useState('')
  const [campoId, setCampoId] = useState('')
  const [potreroId, setPotreroId] = useState('')
  const [monto, setMonto] = useState('')
  const [fechaDevengo, setFechaDevengo] = useState(hoy())
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [fechaCobroPago, setFechaCobroPago] = useState('')
  const [medioPago, setMedioPago] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [esEcheq, setEsEcheq] = useState(false)
  const [chequeNumero, setChequeNumero] = useState('')
  const [chequeBanco, setChequeBanco] = useState('')
  const [contraparte, setContraparte] = useState('')
  const [error, setError] = useState<string | null>(null)

  const categorias = useCategorias()
  const campos = useCampos()
  const potreros = usePotreros(campoId)
  const crear = useCrearMovimiento()

  // categorías que aplican al tipo elegido (aplica_a null = sirve para ambos)
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const montoNum = Number(monto)
    if (!categoriaId) return setError('Elegí la categoría')
    if (!campoId) return setError('Elegí el campo')
    if (!monto || Number.isNaN(montoNum) || montoNum <= 0)
      return setError('Ingresá un monto válido')

    try {
      await crear.mutateAsync({
        empresaId,
        tipo,
        categoriaId,
        campoId,
        potreroId: potreroId || null,
        monto: montoNum,
        fechaDevengo,
        fechaVencimiento: fechaVencimiento || null,
        fechaCobroPago: fechaCobroPago || null,
        medioPago: (medioPago ||
          null) as Database['public']['Enums']['medio_pago'] | null,
        descripcion,
        esEcheq,
        chequeNumero,
        chequeBanco,
        contraparte,
      })
      toast.success('Movimiento cargado')
      setOpen(false)
      setCategoriaId('')
      setMonto('')
      setDescripcion('')
      setFechaVencimiento('')
      setFechaCobroPago('')
      setEsEcheq(false)
      setChequeNumero('')
      setChequeBanco('')
      setContraparte('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  const esGasto = tipo === 'gasto'

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!empresaId}>
        + Cargar gasto/ingreso
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              Cargar movimiento
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-5">
            {/* Tipo: toggle con color */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => elegirTipo('gasto')}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-[11px] border-[1.5px] px-4 py-3 text-sm font-bold transition-colors',
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
                  'flex items-center justify-center gap-2 rounded-[11px] border-[1.5px] px-4 py-3 text-sm font-bold transition-colors',
                  !esGasto
                    ? 'border-primary bg-field-soft text-field-deep'
                    : 'border-border bg-card text-muted-foreground hover:border-faint',
                )}
              >
                <ArrowDownLeft className="size-[18px]" />
                Ingreso
              </button>
            </div>

            {/* Monto destacado */}
            <div>
              <label htmlFor="mv-monto" className={labelClass}>
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
                  value={monto ? Number(monto).toLocaleString('es-AR') : ''}
                  onChange={(e) =>
                    setMonto(e.target.value.replace(/\D/g, ''))
                  }
                  className={cn(fieldClass, 'tnum py-3 pl-8 text-lg font-bold')}
                />
              </div>
            </div>

            {/* Categoría */}
            <div>
              <label htmlFor="mv-categoria" className={labelClass}>
                Categoría
              </label>
              <select
                id="mv-categoria"
                className={fieldClass}
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
              >
                <option value="">Elegí…</option>
                {categoriasFiltradas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Campo + Potrero */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="mv-campo" className={labelClass}>
                  Campo
                </label>
                <select
                  id="mv-campo"
                  className={fieldClass}
                  value={campoId}
                  onChange={(e) => {
                    setCampoId(e.target.value)
                    setPotreroId('')
                  }}
                >
                  <option value="">Elegí…</option>
                  {(campos.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="mv-potrero" className={labelClass}>
                  Potrero <span className="font-medium normal-case">(opcional)</span>
                </label>
                <select
                  id="mv-potrero"
                  className={cn(fieldClass, 'disabled:opacity-50')}
                  value={potreroId}
                  onChange={(e) => setPotreroId(e.target.value)}
                  disabled={!campoId}
                >
                  <option value="">Todo el campo</option>
                  {(potreros.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="mv-devengo" className={labelClass}>
                  Cuándo ocurrió
                </label>
                <input
                  id="mv-devengo"
                  type="date"
                  value={fechaDevengo}
                  onChange={(e) => setFechaDevengo(e.target.value)}
                  className={cn(fieldClass, '[color-scheme:light]')}
                />
              </div>
              <div>
                <label htmlFor="mv-vence" className={labelClass}>
                  Vence el{' '}
                  <span className="font-medium normal-case">(opcional)</span>
                </label>
                <input
                  id="mv-vence"
                  type="date"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                  className={cn(fieldClass, '[color-scheme:light]')}
                />
              </div>
              <div>
                <label htmlFor="mv-cobro" className={labelClass}>
                  {esGasto ? 'Pagado' : 'Cobrado'}{' '}
                  <span className="font-medium normal-case">(opcional)</span>
                </label>
                <input
                  id="mv-cobro"
                  type="date"
                  value={fechaCobroPago}
                  onChange={(e) => setFechaCobroPago(e.target.value)}
                  className={cn(fieldClass, '[color-scheme:light]')}
                />
              </div>
            </div>

            {/* Medio + descripción */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="mv-medio" className={labelClass}>
                  Medio de pago{' '}
                  <span className="font-medium normal-case">(opcional)</span>
                </label>
                <select
                  id="mv-medio"
                  className={fieldClass}
                  value={medioPago}
                  onChange={(e) => setMedioPago(e.target.value)}
                >
                  <option value="">—</option>
                  {Constants.public.Enums.medio_pago.map((m) => (
                    <option key={m} value={m}>
                      {medioPagoLabel[m]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="mv-desc" className={labelClass}>
                  Descripción{' '}
                  <span className="font-medium normal-case">(opcional)</span>
                </label>
                <input
                  id="mv-desc"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej: antiparasitario"
                  className={fieldClass}
                />
              </div>
            </div>

            {/* Datos del cheque (solo si el medio es cheque) */}
            {medioPago === 'cheque' && (
              <div className="grid gap-4 rounded-[11px] border border-border bg-secondary/50 p-4">
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
                    Es echeq (electrónico)
                  </label>
                </div>
                <div>
                  <label htmlFor="mv-contraparte" className={labelClass}>
                    {esGasto ? 'Beneficiario' : 'Emisor'}{' '}
                    <span className="font-medium normal-case">(opcional)</span>
                  </label>
                  <input
                    id="mv-contraparte"
                    value={contraparte}
                    onChange={(e) => setContraparte(e.target.value)}
                    placeholder={esGasto ? 'A quién se lo das' : 'Quién lo libró'}
                    className={fieldClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="mv-cheque-banco" className={labelClass}>
                      Banco{' '}
                      <span className="font-medium normal-case">(opcional)</span>
                    </label>
                    <input
                      id="mv-cheque-banco"
                      value={chequeBanco}
                      onChange={(e) => setChequeBanco(e.target.value)}
                      placeholder="Ej: Nación"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="mv-cheque-num" className={labelClass}>
                      N° de cheque{' '}
                      <span className="font-medium normal-case">(opcional)</span>
                    </label>
                    <input
                      id="mv-cheque-num"
                      value={chequeNumero}
                      onChange={(e) => setChequeNumero(e.target.value)}
                      placeholder="Ej: 4412"
                      className={cn(fieldClass, 'tnum')}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Estado en vivo según la fecha de cobro/pago */}
            {fechaCobroPago ? (
              <p className="flex items-start gap-2 rounded-[10px] bg-field-soft px-3.5 py-2.5 text-xs text-field-deep">
                <CircleCheck className="mt-0.5 size-3.5 shrink-0" />
                Queda <b className="font-semibold">liquidado</b> — ya{' '}
                {esGasto ? 'pagado' : 'cobrado'} el{' '}
                {fechaCobroPago.split('-').reverse().join('/')}.
              </p>
            ) : (
              <p className="flex items-start gap-2 rounded-[10px] bg-secondary px-3.5 py-2.5 text-xs text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-sol-deep" />
                Queda <b className="font-semibold">pendiente</b> (entra en lo
                devengado, todavía no en caja)
                {fechaVencimiento
                  ? ` · vence el ${fechaVencimiento.split('-').reverse().join('/')}.`
                  : '. Cargá "Vence el" para seguir el vencimiento.'}
              </p>
            )}

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}
            <Button type="submit" disabled={crear.isPending || !empresaId}>
              {crear.isPending ? 'Guardando…' : 'Cargar movimiento'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
