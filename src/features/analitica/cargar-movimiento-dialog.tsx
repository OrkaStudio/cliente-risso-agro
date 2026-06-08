import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Constants, type Database } from '@/lib/supabase/types'
import { useCampos, usePotreros } from '@/features/campos/hooks'
import { useCategorias, useCrearMovimiento } from '@/features/analitica/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type TipoMov = Database['public']['Enums']['tipo_movimiento']

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

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
  const [fechaCobroPago, setFechaCobroPago] = useState('')
  const [medioPago, setMedioPago] = useState('')
  const [descripcion, setDescripcion] = useState('')
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
        fechaCobroPago: fechaCobroPago || null,
        medioPago:
          (medioPago || null) as Database['public']['Enums']['medio_pago'] | null,
        descripcion,
      })
      toast.success('Movimiento cargado')
      setOpen(false)
      setCategoriaId('')
      setMonto('')
      setDescripcion('')
      setFechaCobroPago('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>
        <Button size="sm" disabled={!empresaId}>
          + Cargar gasto/ingreso
        </Button>
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cargar gasto / ingreso</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="mv-tipo">Tipo</Label>
                <select
                  id="mv-tipo"
                  className={selectClass}
                  value={tipo}
                  onChange={(e) => {
                    setTipo(e.target.value as TipoMov)
                    setCategoriaId('')
                  }}
                >
                  <option value="gasto">Gasto</option>
                  <option value="ingreso">Ingreso</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mv-monto">Monto (ARS)</Label>
                <Input
                  id="mv-monto"
                  type="number"
                  inputMode="decimal"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mv-categoria">Categoría</Label>
              <select
                id="mv-categoria"
                className={selectClass}
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

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="mv-campo">Campo</Label>
                <select
                  id="mv-campo"
                  className={selectClass}
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
              <div className="grid gap-2">
                <Label htmlFor="mv-potrero">Potrero (opcional)</Label>
                <select
                  id="mv-potrero"
                  className={selectClass}
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

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="mv-devengo">Fecha (cuándo ocurrió)</Label>
                <Input
                  id="mv-devengo"
                  type="date"
                  value={fechaDevengo}
                  onChange={(e) => setFechaDevengo(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mv-cobro">Cobrado/pagado (opcional)</Label>
                <Input
                  id="mv-cobro"
                  type="date"
                  value={fechaCobroPago}
                  onChange={(e) => setFechaCobroPago(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="mv-medio">Medio de pago (opcional)</Label>
                <select
                  id="mv-medio"
                  className={selectClass}
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
              <div className="grid gap-2">
                <Label htmlFor="mv-desc">Descripción (opcional)</Label>
                <Input
                  id="mv-desc"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Si no cargás la fecha de cobro/pago, queda como pendiente.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={crear.isPending || !empresaId}>
              {crear.isPending ? 'Guardando…' : 'Cargar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
