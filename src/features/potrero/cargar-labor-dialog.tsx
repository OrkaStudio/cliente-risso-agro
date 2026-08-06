import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Sprout } from 'lucide-react'
import { FormDialog, formItem } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useCategorias } from '@/features/analitica/hooks'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { LABORES, laborPorTipo, type TipoLabor } from '@/features/potrero/labores'
import { useRegistrarLabor } from '@/features/potrero/hooks'

/**
 * Cargar una labor agrícola.
 *
 * La forma es SIEMPRE la misma —qué, cuándo, una nota y cuánto costó— y sólo
 * cambia una fila según el tipo: la siembra pregunta qué se sembró, la cosecha
 * cuántos kilos salieron. Ningún otro tipo agrega nada; lo que no tiene campo
 * propio va en la nota, a propósito, hasta que alguien necesite filtrar por eso.
 *
 * El monto es opcional y es lo que convierte esto en algo más que un bloc de
 * notas: si se carga, el gasto queda imputado a ESTE potrero y a la actividad
 * agrícola, y la Analítica por potrero se llena sola con lo que el productor
 * iba a cargar igual.
 */
export function CargarLaborDialog({
  potreroId,
  potreroNombre,
  open,
  onOpenChange,
}: {
  potreroId: string
  potreroNombre: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { data: membresia } = useEmpresa()
  const empresaId = membresia?.empresa_id
  const categorias = useCategorias()
  const registrar = useRegistrarLabor(potreroId)

  const [tipo, setTipo] = useState<TipoLabor>('siembra')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [cultivo, setCultivo] = useState('')
  const [kg, setKg] = useState('')
  const [nota, setNota] = useState('')
  const [monto, setMonto] = useState('')
  const [error, setError] = useState<string | null>(null)

  const labor = laborPorTipo.get(tipo)!

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!empresaId) return

    const montoNum = monto.trim() ? Number(monto) : null
    if (montoNum != null && (Number.isNaN(montoNum) || montoNum <= 0)) {
      setError('El monto tiene que ser un número mayor a cero.')
      return
    }
    if (labor.pideCultivo && !cultivo.trim()) {
      setError('Decí qué se sembró — es lo que se lee sobre el potrero en el mapa.')
      return
    }

    // La categoría se resuelve por NOMBRE: son globales y compartidas, así que
    // hardcodear un uuid ataría el código a esta base.
    const categoriaId = montoNum
      ? (categorias.data?.find((c) => c.nombre === labor.categoria)?.id ?? null)
      : null
    if (montoNum && !categoriaId) {
      setError(
        `No encontré la categoría "${labor.categoria}" para imputar el gasto. Cargá la labor sin monto y sumá el gasto desde Plata.`,
      )
      return
    }

    try {
      await registrar.mutateAsync({
        empresaId,
        potreroId,
        tipo,
        fecha,
        nota: nota.trim() || null,
        cultivo: labor.pideCultivo ? cultivo.trim() : null,
        kg: labor.pideKg && kg.trim() ? Number(kg) : null,
        monto: montoNum,
        categoriaId,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la labor')
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Sprout}
      title="Cargar labor"
      subtitle={`Potrero ${potreroNombre}`}
      onSubmit={onSubmit}
      footer={
        <Button
          type="submit"
          disabled={registrar.isPending || !empresaId}
          className="w-full"
        >
          {registrar.isPending ? 'Guardando…' : 'Guardar labor'}
        </Button>
      }
    >
      <motion.div variants={formItem} className="grid gap-2">
        <Label>¿Qué se hizo?</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {LABORES.map((l) => {
            const on = tipo === l.tipo
            return (
              <button
                key={l.tipo}
                type="button"
                aria-pressed={on}
                onClick={() => setTipo(l.tipo)}
                className={cn(
                  'flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-xl border-2 px-1.5 py-2 text-[12px] font-semibold transition-colors',
                  on
                    ? 'border-field bg-field-soft text-field-deep'
                    : 'border-border bg-background text-muted-foreground hover:border-field/40',
                )}
              >
                <l.Icon className="size-[18px]" />
                <span className="text-center leading-tight">{l.label}</span>
              </button>
            )
          })}
        </div>
        <p className="text-[12px] text-muted-foreground">{labor.ayuda}</p>
      </motion.div>

      <motion.div variants={formItem} className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="labor-fecha">¿Cuándo?</Label>
          <Input
            id="labor-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </div>

        {/* La única fila que cambia según el tipo. */}
        {labor.pideCultivo && (
          <div className="grid gap-2">
            <Label htmlFor="labor-cultivo">¿Qué se sembró?</Label>
            <Input
              id="labor-cultivo"
              value={cultivo}
              onChange={(e) => setCultivo(e.target.value)}
              placeholder="Raigrás, avena, soja…"
              autoComplete="off"
            />
          </div>
        )}
        {labor.pideKg && (
          <div className="grid gap-2">
            <Label htmlFor="labor-kg">Kilos cosechados</Label>
            <Input
              id="labor-kg"
              type="number"
              inputMode="decimal"
              min="0"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              placeholder="38000"
            />
          </div>
        )}
      </motion.div>

      <motion.div variants={formItem} className="grid gap-2">
        <Label htmlFor="labor-nota">Nota · opcional</Label>
        <Input
          id="labor-nota"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Variedad, producto, dosis, quién lo hizo…"
          autoComplete="off"
        />
      </motion.div>

      <motion.div variants={formItem} className="grid gap-2">
        <Label htmlFor="labor-monto">¿Cuánto costó? · opcional</Label>
        <Input
          id="labor-monto"
          type="number"
          inputMode="decimal"
          min="0"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="Dejalo vacío si todavía no sabés"
        />
        <p className="text-[12px] text-muted-foreground">
          {monto.trim()
            ? `Se carga como gasto en "${labor.categoria}", imputado a este potrero.`
            : 'Si lo cargás, el gasto queda imputado a este potrero sin volver a tipearlo.'}
        </p>
      </motion.div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </FormDialog>
  )
}
