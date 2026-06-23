import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { MapPin } from 'lucide-react'
import { buscarParcelaRural, type ParcelaCatastro } from '@/features/lotes/catastro'
import { deleteCampoView, setCampoBoundary } from '@/features/lotes/geo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Trae el contorno real del campo desde el catastro de ARBA por nomenclatura
 * rural (Partido / Circunscripción / Parcela) y lo guarda como límite del
 * campo. `onAplicado` avisa para refrescar el mapa.
 */
export function CatastroDialog({
  campoId,
  onAplicado,
  triggerLabel = 'Traer del catastro',
  triggerVariant = 'outline',
}: {
  campoId: string
  onAplicado: () => void
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline'
}) {
  const [open, setOpen] = useState(false)
  // Las Flores = partido 058 (confirmado en el catastro de ARBA). Editable.
  const [partido, setPartido] = useState('058')
  const [circ, setCirc] = useState('')
  const [parcela, setParcela] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opciones, setOpciones] = useState<ParcelaCatastro[]>([])

  function reset() {
    setPartido('058')
    setCirc('')
    setParcela('')
    setError(null)
    setOpciones([])
  }

  async function onBuscar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setOpciones([])
    setCargando(true)
    try {
      const res = await buscarParcelaRural({ partido, circ, parcela })
      if (res.length === 0) {
        setError('No se encontró una parcela con esa nomenclatura.')
      } else if (res.length === 1) {
        aplicar(res[0])
      } else {
        setOpciones(res)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al consultar catastro')
    } finally {
      setCargando(false)
    }
  }

  function aplicar(p: ParcelaCatastro) {
    setCampoBoundary(campoId, p.anillo)
    deleteCampoView(campoId) // que el mapa re-encuadre a la parcela traída
    toast.success(`Contorno traído (${p.areaHa} ha)`)
    setOpen(false)
    reset()
    onAplicado()
  }

  return (
    <>
      <Button
        variant={triggerVariant}
        size="sm"
        onClick={() => {
          reset()
          setOpen(true)
        }}
      >
        <MapPin className="size-4" />
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Traer contorno del catastro (ARBA)</DialogTitle>
          </DialogHeader>
          <form onSubmit={onBuscar} className="grid gap-4">
            <p className="text-[12.5px] text-muted-foreground">
              Nomenclatura catastral rural de Buenos Aires. Trae el contorno real
              de la parcela; los potreros internos se trazan aparte.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="cat-partido">Partido</Label>
                <Input
                  id="cat-partido"
                  value={partido}
                  onChange={(e) => setPartido(e.target.value)}
                  inputMode="numeric"
                  placeholder="072"
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cat-circ">Circ. (opc.)</Label>
                <Input
                  id="cat-circ"
                  value={circ}
                  onChange={(e) => setCirc(e.target.value)}
                  placeholder="opcional"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cat-parcela">Parcela</Label>
                <Input
                  id="cat-parcela"
                  value={parcela}
                  onChange={(e) => setParcela(e.target.value)}
                  placeholder="1758A"
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {opciones.length > 0 && (
              <div className="grid gap-1.5">
                <Label>Varias parcelas — elegí cuál:</Label>
                <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                  {opciones.map((p) => (
                    <button
                      key={p.cca}
                      type="button"
                      onClick={() => aplicar(p)}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-[13px] transition-colors hover:bg-secondary"
                    >
                      <span className="tnum truncate text-muted-foreground">
                        …{p.cca.slice(-10)}
                      </span>
                      <span className="tnum shrink-0 font-bold text-ink">
                        {p.areaHa} ha
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button type="submit" disabled={cargando}>
              {cargando ? 'Consultando catastro…' : 'Buscar parcela'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
