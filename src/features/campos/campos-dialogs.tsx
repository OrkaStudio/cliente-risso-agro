import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { LandPlot, MapPin } from 'lucide-react'
import { Constants } from '@/lib/supabase/types'
import type { Campo, Potrero } from '@/features/campos/api'
import {
  useActualizarCampo,
  useActualizarPotrero,
  useCrearCampo,
  useCrearPotrero,
} from '@/features/campos/hooks'
import { USO, tipoCampoLabel } from '@/features/campos/labels'
import { usoDeEstado, usoToEstadoCiclo, type Uso } from '@/features/campos/use-campo-mapa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dropdown } from '@/components/ui/dropdown'
import { FormDialog, formItem } from '@/components/form-dialog'

function parseHa(v: string): number | null {
  const n = Number(v)
  return v.trim() === '' || Number.isNaN(n) ? null : n
}

const footerBtn =
  'h-12 w-full rounded-xl text-[15px] font-semibold shadow-[0_4px_14px_rgba(16,30,20,0.18)]'

// --- Campo ------------------------------------------------------------
export function CampoFormDialog({
  empresaId,
  campo,
  triggerLabel,
  triggerVariant = 'default',
}: {
  empresaId: string
  campo?: Campo
  triggerLabel: string
  triggerVariant?: 'default' | 'outline'
}) {
  const editing = !!campo
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState(campo?.nombre ?? '')
  const [tipo, setTipo] = useState(campo?.tipo ?? 'propio')
  const [hectareas, setHectareas] = useState(
    campo?.hectareas != null ? String(campo.hectareas) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const crear = useCrearCampo()
  const actualizar = useActualizarCampo()
  const pending = crear.isPending || actualizar.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!nombre.trim()) {
      setError('Ingresá el nombre del campo')
      return
    }
    try {
      if (editing) {
        await actualizar.mutateAsync({
          id: campo.id,
          nombre,
          tipo,
          hectareas: parseHa(hectareas),
        })
        toast.success('Campo actualizado')
      } else {
        await crear.mutateAsync({
          empresaId,
          nombre,
          tipo,
          hectareas: parseHa(hectareas),
        })
        toast.success('Campo creado')
      }
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <>
      <Button variant={triggerVariant} size="sm" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        icon={MapPin}
        title={editing ? 'Editar campo' : 'Nuevo campo'}
        subtitle={
          editing
            ? 'Actualizá los datos del campo'
            : 'Un establecimiento propio o alquilado'
        }
        onSubmit={onSubmit}
        footer={
          <Button type="submit" disabled={pending || !empresaId} className={footerBtn}>
            {pending ? 'Guardando…' : editing ? 'Guardar' : 'Crear campo'}
          </Button>
        }
      >
        <motion.div variants={formItem} className="grid gap-2">
          <Label htmlFor="campo-nombre">Nombre</Label>
          <Input
            id="campo-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />
        </motion.div>
        <motion.div variants={formItem} className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Tipo</Label>
            <Dropdown
              block
              ariaLabel="Tipo de campo"
              value={tipo}
              onChange={(v) => setTipo(v as Campo['tipo'])}
              options={Constants.public.Enums.tipo_campo.map((t) => ({
                value: t,
                label: tipoCampoLabel[t],
              }))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="campo-ha">Hectáreas (opcional)</Label>
            <Input
              id="campo-ha"
              type="number"
              inputMode="decimal"
              value={hectareas}
              onChange={(e) => setHectareas(e.target.value)}
            />
          </div>
        </motion.div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </FormDialog>
    </>
  )
}

// --- Potrero ----------------------------------------------------------
export function PotreroFormDialog({
  empresaId,
  campoId,
  letra,
  potrero,
  triggerLabel,
  triggerVariant = 'default',
}: {
  empresaId: string
  campoId: string
  /** Letra FIJA del campo (la fuerza el trigger igual; acá es para mostrarla). */
  letra: string
  potrero?: Potrero
  triggerLabel: string
  triggerVariant?: 'default' | 'outline'
}) {
  const editing = !!potrero
  const [open, setOpen] = useState(false)
  // Solo el NÚMERO se edita; la letra es fija. Al editar, se toma el número del
  // nombre actual (ej. "5B" → "5").
  const [numero, setNumero] = useState(potrero?.nombre.match(/^\d+/)?.[0] ?? '')
  const [estadoCiclo, setEstadoCiclo] = useState(
    potrero?.estado_ciclo ?? 'ganadero',
  )
  const [hectareas, setHectareas] = useState(
    potrero?.hectareas != null ? String(potrero.hectareas) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const crear = useCrearPotrero(campoId)
  const actualizar = useActualizarPotrero(campoId)
  const pending = crear.isPending || actualizar.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      // Se manda número+letra; el trigger fuerza la letra del campo igual. Si el
      // número va vacío (solo al crear), el trigger pone el siguiente.
      const nombre = `${numero.trim()}${letra}`
      if (editing) {
        await actualizar.mutateAsync({
          id: potrero.id,
          nombre,
          estadoCiclo,
          hectareas: parseHa(hectareas),
        })
        toast.success('Potrero actualizado')
      } else {
        await crear.mutateAsync({
          empresaId,
          campoId,
          nombre,
          estadoCiclo,
          hectareas: parseHa(hectareas),
        })
        toast.success('Potrero creado')
      }
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <>
      <Button variant={triggerVariant} size="sm" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        icon={LandPlot}
        title={editing ? 'Editar potrero' : 'Nuevo potrero'}
        subtitle={
          editing
            ? 'Actualizá los datos del potrero'
            : 'Una división dentro del campo'
        }
        onSubmit={onSubmit}
        footer={
          <Button type="submit" disabled={pending || !empresaId} className={footerBtn}>
            {pending ? 'Guardando…' : editing ? 'Guardar' : 'Crear potrero'}
          </Button>
        }
      >
        {/* El NÚMERO lo elige el productor; la LETRA es la del campo y no se
            cambia (la fuerza la DB). Se muestra fija al lado del número. */}
        <motion.div variants={formItem} className="grid gap-2">
          <Label htmlFor="potrero-num">Número de potrero</Label>
          <div className="flex items-stretch gap-2">
            <Input
              id="potrero-num"
              inputMode="numeric"
              value={numero}
              onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))}
              placeholder={editing ? '' : 'siguiente'}
              autoFocus
              className="flex-1"
            />
            <span className="flex min-w-11 items-center justify-center rounded-lg bg-secondary px-3 text-[17px] font-bold text-ink">
              {letra}
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground">
            La letra <b>{letra}</b> es del campo y no se cambia.
          </p>
        </motion.div>
        <motion.div variants={formItem} className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Uso</Label>
            {/* Los mismos tres de todo el resto de la app. Antes acá se
                ofrecían los siete estados crudos de la base y el potrero
                terminaba mostrándose distinto en el mapa que en su diálogo. */}
            <div className="flex gap-1.5">
              {(['ganadero', 'agricola', 'vacio'] as Uso[]).map((u) => {
                const on = usoDeEstado(estadoCiclo) === u
                return (
                  <button
                    key={u}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setEstadoCiclo(usoToEstadoCiclo(u, estadoCiclo))}
                    className="h-11 flex-1 rounded-lg border-2 text-[13px] font-semibold transition-colors"
                    style={
                      on
                        ? {
                            borderColor: USO[u].color,
                            backgroundColor: `color-mix(in srgb, ${USO[u].color} 14%, transparent)`,
                            color: USO[u].color,
                          }
                        : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }
                    }
                  >
                    {USO[u].label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="potrero-ha">Hectáreas (opcional)</Label>
            <Input
              id="potrero-ha"
              type="number"
              inputMode="decimal"
              value={hectareas}
              onChange={(e) => setHectareas(e.target.value)}
            />
          </div>
        </motion.div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </FormDialog>
    </>
  )
}
