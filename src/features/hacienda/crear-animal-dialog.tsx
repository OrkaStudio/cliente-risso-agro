import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { z } from 'zod'
import { toast } from 'sonner'
import { Beef } from 'lucide-react'
import { Constants } from '@/lib/supabase/types'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { usePotreros, useCrearAnimal } from '@/features/hacienda/hooks'
import {
  categoriaLabel,
  categoriasPorEspecie,
  especieLabel,
  type Especie,
} from '@/features/hacienda/labels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown'
import { FormDialog, formItem } from '@/components/form-dialog'

const ESPECIES: Especie[] = ['bovino', 'ovino', 'equino']

/** Opciones de categoría agrupadas por especie (Bovino/Ovino/Equino). */
const CAT_OPTIONS: DropdownOption[] = [
  { value: '', label: 'Elegí…' },
  ...ESPECIES.flatMap((esp) =>
    categoriasPorEspecie[esp].map((c) => ({
      value: c,
      label: categoriaLabel[c],
      group: especieLabel[esp],
    })),
  ),
]

const schema = z.object({
  numeroRfid: z.string().trim().min(1, 'Ingresá el número de caravana'),
  numeroVisual: z.string().trim().optional(),
  categoria: z.enum(Constants.public.Enums.categoria_animal),
  potreroId: z.string().optional(),
  origen: z.string().trim().optional(),
  fechaNacimiento: z.string().optional(),
})

/** Alta de animal por caravana (RFID), en diálogo (misma lógica que el resto). */
export function CrearAnimalDialog() {
  const empresa = useEmpresa()
  const potreros = usePotreros()
  const crear = useCrearAnimal()

  const [open, setOpen] = useState(false)
  const [numeroRfid, setNumeroRfid] = useState('')
  const [numeroVisual, setNumeroVisual] = useState('')
  const [categoria, setCategoria] = useState('')
  const [potreroId, setPotreroId] = useState('')
  const [origen, setOrigen] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setNumeroRfid('')
    setNumeroVisual('')
    setCategoria('')
    setPotreroId('')
    setOrigen('')
    setFechaNacimiento('')
    setError(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = schema.safeParse({
      numeroRfid,
      numeroVisual,
      categoria,
      potreroId,
      origen,
      fechaNacimiento,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    const empresaId = empresa.data?.empresa_id
    if (!empresaId) {
      setError('No se pudo determinar la empresa.')
      return
    }
    try {
      await crear.mutateAsync({
        empresaId,
        numeroRfid: parsed.data.numeroRfid,
        numeroVisual: parsed.data.numeroVisual,
        categoria: parsed.data.categoria,
        potreroId: parsed.data.potreroId || null,
        origen: parsed.data.origen,
        fechaNacimiento: parsed.data.fechaNacimiento || null,
      })
      toast.success('Animal dado de alta')
      setOpen(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al dar de alta')
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nuevo animal</Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        icon={Beef}
        title="Nuevo animal"
        subtitle="Alta por caravana (RFID)"
        onSubmit={onSubmit}
        footer={
          <Button
            type="submit"
            disabled={crear.isPending || !empresa.data}
            className="h-12 w-full rounded-xl text-[15px] font-semibold shadow-[0_4px_14px_rgba(16,30,20,0.18)]"
          >
            {crear.isPending ? 'Guardando…' : 'Dar de alta'}
          </Button>
        }
      >
        <motion.div variants={formItem} className="grid gap-2">
          <Label htmlFor="rfid">Caravana (RFID) *</Label>
          <Input
            id="rfid"
            inputMode="numeric"
            placeholder="Número de caravana"
            value={numeroRfid}
            onChange={(e) => setNumeroRfid(e.target.value)}
            autoFocus
          />
        </motion.div>

        <motion.div variants={formItem} className="grid gap-2">
          <Label htmlFor="visual">Caravana visual (opcional)</Label>
          <Input
            id="visual"
            value={numeroVisual}
            onChange={(e) => setNumeroVisual(e.target.value)}
          />
        </motion.div>

        <motion.div variants={formItem} className="grid gap-2">
          <Label>Categoría *</Label>
          <Dropdown
            block
            ariaLabel="Categoría"
            value={categoria}
            onChange={setCategoria}
            options={CAT_OPTIONS}
          />
          <p className="text-xs text-muted-foreground">
            El sexo se completa solo según la categoría.
          </p>
        </motion.div>

        <motion.div variants={formItem} className="grid gap-2">
          <Label>Potrero (opcional)</Label>
          <Dropdown
            block
            ariaLabel="Potrero"
            value={potreroId}
            onChange={setPotreroId}
            options={[
              { value: '', label: 'Sin asignar' },
              ...(potreros.data ?? []).map((p) => ({
                value: p.id,
                label: p.nombre,
              })),
            ]}
          />
        </motion.div>

        <motion.div variants={formItem} className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="origen">Origen (opcional)</Label>
            <Input
              id="origen"
              placeholder="Nacido / Compra…"
              value={origen}
              onChange={(e) => setOrigen(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nacimiento">Nacimiento (opcional)</Label>
            <Input
              id="nacimiento"
              type="date"
              value={fechaNacimiento}
              onChange={(e) => setFechaNacimiento(e.target.value)}
            />
          </div>
        </motion.div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </FormDialog>
    </>
  )
}
