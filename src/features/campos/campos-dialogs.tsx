import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Constants } from '@/lib/supabase/types'
import type { Campo, Potrero } from '@/features/campos/api'
import {
  useActualizarCampo,
  useActualizarPotrero,
  useCrearCampo,
  useCrearPotrero,
} from '@/features/campos/hooks'
import { estadoCicloLabel, tipoCampoLabel } from '@/features/campos/labels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Dropdown } from '@/components/ui/dropdown'

function parseHa(v: string): number | null {
  const n = Number(v)
  return v.trim() === '' || Number.isNaN(n) ? null : n
}

function Shell({
  trigger,
  titulo,
  open,
  setOpen,
  children,
}: {
  trigger: ReactNode
  titulo: string
  open: boolean
  setOpen: (v: boolean) => void
  children: ReactNode
}) {
  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    </>
  )
}

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
    <Shell
      open={open}
      setOpen={setOpen}
      titulo={editing ? 'Editar campo' : 'Nuevo campo'}
      trigger={
        <Button variant={triggerVariant} size="sm">
          {triggerLabel}
        </Button>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="campo-nombre">Nombre</Label>
          <Input
            id="campo-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
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
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending || !empresaId}>
          {pending ? 'Guardando…' : editing ? 'Guardar' : 'Crear campo'}
        </Button>
      </form>
    </Shell>
  )
}

// --- Potrero ----------------------------------------------------------
export function PotreroFormDialog({
  empresaId,
  campoId,
  potrero,
  triggerLabel,
  triggerVariant = 'default',
}: {
  empresaId: string
  campoId: string
  potrero?: Potrero
  triggerLabel: string
  triggerVariant?: 'default' | 'outline'
}) {
  const editing = !!potrero
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState(potrero?.nombre ?? '')
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
    if (!nombre.trim()) {
      setError('Ingresá el nombre del potrero')
      return
    }
    try {
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
    <Shell
      open={open}
      setOpen={setOpen}
      titulo={editing ? 'Editar potrero' : 'Nuevo potrero'}
      trigger={
        <Button variant={triggerVariant} size="sm">
          {triggerLabel}
        </Button>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="potrero-nombre">Nombre</Label>
          <Input
            id="potrero-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Estado del ciclo</Label>
            <Dropdown
              block
              ariaLabel="Estado del ciclo"
              value={estadoCiclo}
              onChange={(v) => setEstadoCiclo(v as Potrero['estado_ciclo'])}
              options={Constants.public.Enums.estado_ciclo_potrero.map((s) => ({
                value: s,
                label: estadoCicloLabel[s],
              }))}
            />
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
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending || !empresaId}>
          {pending ? 'Guardando…' : editing ? 'Guardar' : 'Crear potrero'}
        </Button>
      </form>
    </Shell>
  )
}
