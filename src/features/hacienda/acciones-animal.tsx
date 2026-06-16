import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  TIPOS_EVENTO_MANUAL,
  type TipoEventoManual,
} from '@/features/hacienda/api'
import {
  useCambiarCaravana,
  useDarBaja,
  useRegistrarEvento,
} from '@/features/hacienda/hooks'
import { tipoEventoLabel } from '@/features/hacienda/labels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dropdown } from '@/components/ui/dropdown'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const hoy = () => new Date().toISOString().slice(0, 10)

/** Shell de diálogo controlado: un botón que abre + el contenido del form. */
function AccionDialog({
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

// --- Registrar evento -------------------------------------------------
export function RegistrarEventoDialog({
  animalId,
  empresaId,
}: {
  animalId: string
  empresaId: string
}) {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<TipoEventoManual | ''>('')
  const [fecha, setFecha] = useState(hoy())
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mut = useRegistrarEvento(animalId)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!tipo) {
      setError('Elegí el tipo de evento')
      return
    }
    try {
      await mut.mutateAsync({ empresaId, animalId, tipo, fecha, nota })
      toast.success('Evento registrado')
      setOpen(false)
      setTipo('')
      setNota('')
      setFecha(hoy())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <AccionDialog
      open={open}
      setOpen={setOpen}
      titulo="Registrar evento"
      trigger={<Button variant="outline" size="sm">Registrar evento</Button>}
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label>Tipo</Label>
          <Dropdown
            block
            ariaLabel="Tipo de evento"
            value={tipo}
            onChange={(v) => setTipo(v as TipoEventoManual)}
            options={[
              { value: '', label: 'Elegí…' },
              ...TIPOS_EVENTO_MANUAL.map((t) => ({
                value: t,
                label: tipoEventoLabel[t],
              })),
            ]}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ev-fecha">Fecha</Label>
          <Input
            id="ev-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ev-nota">Nota (opcional)</Label>
          <Textarea
            id="ev-nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={mut.isPending}>
          {mut.isPending ? 'Guardando…' : 'Registrar'}
        </Button>
      </form>
    </AccionDialog>
  )
}

// --- Cambiar caravana -------------------------------------------------
export function CambiarCaravanaDialog({ animalId }: { animalId: string }) {
  const [open, setOpen] = useState(false)
  const [nuevoRfid, setNuevoRfid] = useState('')
  const [nuevaVisual, setNuevaVisual] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mut = useCambiarCaravana(animalId)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!nuevoRfid.trim()) {
      setError('Ingresá la nueva caravana')
      return
    }
    try {
      await mut.mutateAsync({ animalId, nuevoRfid, nuevaVisual, motivo })
      toast.success('Caravana cambiada')
      setOpen(false)
      setNuevoRfid('')
      setNuevaVisual('')
      setMotivo('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <AccionDialog
      open={open}
      setOpen={setOpen}
      titulo="Cambiar caravana"
      trigger={<Button variant="outline" size="sm">Cambiar caravana</Button>}
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          La caravana actual queda en el historial; el animal conserva su identidad.
        </p>
        <div className="grid gap-2">
          <Label htmlFor="cc-rfid">Nueva caravana (RFID)</Label>
          <Input
            id="cc-rfid"
            inputMode="numeric"
            value={nuevoRfid}
            onChange={(e) => setNuevoRfid(e.target.value)}
            autoFocus
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cc-visual">Caravana visual (opcional)</Label>
          <Input
            id="cc-visual"
            value={nuevaVisual}
            onChange={(e) => setNuevaVisual(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cc-motivo">Motivo (opcional)</Label>
          <Input
            id="cc-motivo"
            placeholder="Rotura / pérdida…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={mut.isPending}>
          {mut.isPending ? 'Guardando…' : 'Confirmar cambio'}
        </Button>
      </form>
    </AccionDialog>
  )
}

// --- Dar de baja ------------------------------------------------------
export function DarBajaDialog({ animalId }: { animalId: string }) {
  const [open, setOpen] = useState(false)
  const [estado, setEstado] = useState<'vendido' | 'muerto' | ''>('')
  const [fecha, setFecha] = useState(hoy())
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mut = useDarBaja(animalId)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!estado) {
      setError('Elegí el motivo de baja')
      return
    }
    try {
      await mut.mutateAsync({ animalId, estado, fecha, motivo })
      toast.success('Baja registrada')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <AccionDialog
      open={open}
      setOpen={setOpen}
      titulo="Dar de baja"
      trigger={<Button variant="destructive" size="sm">Dar de baja</Button>}
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label>Motivo</Label>
          <Dropdown
            block
            ariaLabel="Motivo de baja"
            value={estado}
            onChange={(v) => setEstado(v as 'vendido' | 'muerto')}
            options={[
              { value: '', label: 'Elegí…' },
              { value: 'vendido', label: 'Vendido' },
              { value: 'muerto', label: 'Muerto' },
            ]}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="db-fecha">Fecha</Label>
          <Input
            id="db-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="db-motivo">Nota (opcional)</Label>
          <Input
            id="db-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" variant="destructive" disabled={mut.isPending}>
          {mut.isPending ? 'Guardando…' : 'Confirmar baja'}
        </Button>
      </form>
    </AccionDialog>
  )
}
