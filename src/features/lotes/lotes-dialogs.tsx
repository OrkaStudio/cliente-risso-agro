import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  categoriaLabel,
  categoriasPorEspecie,
  colorCategoria,
  especieLabel,
  propositoLabel,
  sexoLabelMap,
  type Especie,
  type PropositoLote,
} from '@/features/lotes/domain'
import {
  actualizarLote,
  agregarAnimal,
  agregarAnimalesPorCantidad,
  campos,
  composicionDe,
  crearLote,
  numeroLote,
  partirLote,
  sexoPorCategoria,
  useLote,
} from '@/features/lotes/store'
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
import { cn } from '@/lib/utils'

function parsePotreros(v: string): string[] {
  return v
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)
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

const ESPECIES: Especie[] = ['bovino', 'ovino', 'equino']
const PROPOSITOS: PropositoLote[] = [
  'cria',
  'recria',
  'invernada',
  'engorde',
  'general',
]

/* ===== Crear lote ===== */
export function CrearLoteDialog({
  campoIdInicial,
  triggerLabel = '+ Nuevo lote',
  triggerVariant = 'default',
}: {
  campoIdInicial?: string
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline'
}) {
  const [open, setOpen] = useState(false)
  const [numero, setNumero] = useState('')
  const [campoId, setCampoId] = useState(campoIdInicial ?? campos[0]?.id ?? '')
  const [especie, setEspecie] = useState<Especie>('bovino')
  const [proposito, setProposito] = useState<PropositoLote>('cria')
  const [potreros, setPotreros] = useState('')
  const [error, setError] = useState<string | null>(null)

  const campo = campos.find((c) => c.id === campoId)
  const codigo = numero.trim() ? `${numero.trim()}${campo?.color.letra ?? ''}` : ''

  function reset() {
    setNumero('')
    setEspecie('bovino')
    setProposito('cria')
    setPotreros('')
    setError(null)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!numero.trim()) {
      setError('Ingresá el número del lote')
      return
    }
    if (!campoId) {
      setError('Elegí el campo')
      return
    }
    crearLote({
      nombre: `Lote ${numero.trim()}`,
      campoId,
      especie,
      proposito,
      potreros: potreros
        .split(/[,\s]+/)
        .map((p) => p.trim())
        .filter(Boolean),
    })
    toast.success(`Lote ${codigo} creado`)
    reset()
    setOpen(false)
  }

  return (
    <Shell
      open={open}
      setOpen={setOpen}
      titulo="Nuevo lote"
      trigger={
        <Button variant={triggerVariant} size="sm">
          {triggerLabel}
        </Button>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor="lote-numero">Número de lote</Label>
            <Input
              id="lote-numero"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              inputMode="numeric"
              placeholder="1"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label>Código</Label>
            <span
              className="tnum flex h-10 min-w-[3.5rem] items-center justify-center rounded-xl px-3 font-heading text-[17px] font-bold text-white"
              style={{
                background: codigo
                  ? (campo?.color.hex ?? 'var(--field)')
                  : 'var(--secondary)',
              }}
            >
              {codigo || '—'}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Campo</Label>
            <Dropdown
              block
              ariaLabel="Campo"
              value={campoId}
              onChange={setCampoId}
              options={campos.map((c) => ({
                value: c.id,
                label: `${c.nombre} (${c.color.nombre})`,
              }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Especie</Label>
            <Dropdown
              block
              ariaLabel="Especie"
              value={especie}
              onChange={(v) => setEspecie(v as Especie)}
              options={ESPECIES.map((e) => ({ value: e, label: especieLabel[e] }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Propósito</Label>
            <Dropdown
              block
              ariaLabel="Propósito"
              value={proposito}
              onChange={(v) => setProposito(v as PropositoLote)}
              options={PROPOSITOS.map((p) => ({
                value: p,
                label: propositoLabel[p],
              }))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lote-potreros">Potrero(s)</Label>
            <Input
              id="lote-potreros"
              value={potreros}
              onChange={(e) => setPotreros(e.target.value)}
              placeholder="9 10"
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit">Crear lote</Button>
      </form>
    </Shell>
  )
}

/* ===== Cargar animales a un lote (por cantidad o individual) ===== */
type ModoCarga = 'cantidad' | 'individual'

export function AgregarAnimalDialog({
  loteId,
  especie,
  triggerLabel = '+ Cargar animales',
  triggerVariant = 'default',
}: {
  loteId: string
  especie: Especie
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline'
}) {
  const cats = categoriasPorEspecie[especie]
  const [open, setOpen] = useState(false)
  const [modo, setModo] = useState<ModoCarga>('cantidad')
  const [caravana, setCaravana] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [categoria, setCategoria] = useState(cats[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!categoria) {
      setError('Elegí la categoría')
      return
    }
    if (modo === 'individual') {
      if (!caravana.trim()) {
        setError('Ingresá el número de caravana')
        return
      }
      agregarAnimal(loteId, { caravana: caravana.trim(), categoria })
      toast.success('Animal agregado')
      setCaravana('')
      setOpen(false)
      return
    }
    const n = parseInt(cantidad, 10)
    if (!n || n <= 0) {
      setError('Ingresá una cantidad')
      return
    }
    agregarAnimalesPorCantidad(loteId, { categoria, cantidad: n })
    toast.success(`${n} animales agregados`)
    setCantidad('')
    setOpen(false)
  }

  const modos: [ModoCarga, string][] = [
    ['cantidad', 'Por cantidad'],
    ['individual', 'Individual'],
  ]

  return (
    <Shell
      open={open}
      setOpen={setOpen}
      titulo="Cargar animales"
      trigger={
        <Button variant={triggerVariant} size="sm">
          {triggerLabel}
        </Button>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label>Cómo cargar</Label>
          <div className="flex gap-1.5">
            {modos.map(([m, l]) => (
              <button
                key={m}
                type="button"
                onClick={() => setModo(m)}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors',
                  modo === m
                    ? 'border-field bg-field-soft text-field-deep'
                    : 'border-border text-muted-foreground hover:bg-secondary',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Categoría</Label>
          <Dropdown
            block
            ariaLabel="Categoría"
            value={categoria}
            onChange={setCategoria}
            options={cats.map((c) => ({ value: c.id, label: c.label }))}
          />
          <p className="text-[12px] text-muted-foreground">
            Sexo: {sexoLabelMap[sexoPorCategoria(categoria)]} (según la categoría)
          </p>
        </div>

        {modo === 'individual' ? (
          <div className="grid gap-2">
            <Label htmlFor="animal-caravana">Caravana</Label>
            <Input
              id="animal-caravana"
              value={caravana}
              onChange={(e) => setCaravana(e.target.value)}
              placeholder="A1-0001"
            />
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="animal-cantidad">Cantidad</Label>
            <Input
              id="animal-cantidad"
              type="number"
              inputMode="numeric"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="87"
            />
            <p className="text-[12px] text-muted-foreground">
              Se crean con caravana provisoria automática (editable después).
            </p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit">
          {modo === 'individual' ? 'Agregar' : 'Cargar'}
        </Button>
      </form>
    </Shell>
  )
}

/* ===== Editar lote ===== */
export function EditarLoteDialog({
  loteId,
  triggerLabel = 'Editar',
  triggerVariant = 'outline',
}: {
  loteId: string
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline'
}) {
  const lote = useLote(loteId)
  const [open, setOpen] = useState(false)
  const [numero, setNumero] = useState('')
  const [campoId, setCampoId] = useState('')
  const [proposito, setProposito] = useState<PropositoLote>('cria')
  const [potreros, setPotreros] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!lote) return null
  const campo = campos.find((c) => c.id === campoId)
  const codigo = numero.trim() ? `${numero.trim()}${campo?.color.letra ?? ''}` : ''

  function abrir() {
    setNumero(numeroLote(lote!))
    setCampoId(lote!.campoId)
    setProposito(lote!.proposito)
    setPotreros(lote!.potreros.join(' '))
    setError(null)
    setOpen(true)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!numero.trim()) {
      setError('Ingresá el número del lote')
      return
    }
    actualizarLote(loteId, {
      nombre: `Lote ${numero.trim()}`,
      campoId,
      proposito,
      potreros: parsePotreros(potreros),
    })
    toast.success('Lote actualizado')
    setOpen(false)
  }

  return (
    <>
      <Button variant={triggerVariant} size="sm" onClick={abrir}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar lote</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <div className="grid gap-2">
                <Label htmlFor="edit-numero">Número de lote</Label>
                <Input
                  id="edit-numero"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  inputMode="numeric"
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label>Código</Label>
                <span
                  className="tnum flex h-10 min-w-[3.5rem] items-center justify-center rounded-xl px-3 font-heading text-[17px] font-bold text-white"
                  style={{
                    background: codigo
                      ? (campo?.color.hex ?? 'var(--field)')
                      : 'var(--secondary)',
                  }}
                >
                  {codigo || '—'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Campo</Label>
                <Dropdown
                  block
                  ariaLabel="Campo"
                  value={campoId}
                  onChange={setCampoId}
                  options={campos.map((c) => ({
                    value: c.id,
                    label: `${c.nombre} (${c.color.nombre})`,
                  }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Propósito</Label>
                <Dropdown
                  block
                  ariaLabel="Propósito"
                  value={proposito}
                  onChange={(v) => setProposito(v as PropositoLote)}
                  options={PROPOSITOS.map((p) => ({
                    value: p,
                    label: propositoLabel[p],
                  }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-potreros">Potrero(s)</Label>
              <Input
                id="edit-potreros"
                value={potreros}
                onChange={(e) => setPotreros(e.target.value)}
                placeholder="9 10"
              />
            </div>
            <p className="text-[12px] text-muted-foreground">
              Especie: {especieLabel[lote.especie]} (no se cambia)
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit">Guardar</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ===== Trasladar / partir lote ===== */
type ModoMover = 'todo' | 'categoria' | 'cantidad'

export function TrasladarPartirDialog({
  loteId,
  triggerLabel = 'Trasladar / partir',
  triggerVariant = 'outline',
}: {
  loteId: string
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline'
}) {
  const lote = useLote(loteId)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [modo, setModo] = useState<ModoMover>('todo')
  const [destino, setDestino] = useState('')
  const [selCats, setSelCats] = useState<Set<string>>(new Set())
  const [catCantidad, setCatCantidad] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!lote) return null
  const comp = composicionDe(lote)
  const maxCat = comp.find((c) => c.categoria === catCantidad)?.cantidad ?? 0

  function abrir() {
    setModo('todo')
    setDestino(lote!.potreros.join(' '))
    setSelCats(new Set())
    setCatCantidad(composicionDe(lote!)[0]?.categoria ?? '')
    setCantidad('')
    setError(null)
    setOpen(true)
  }

  function toggleCat(id: string) {
    setSelCats((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const dest = parsePotreros(destino)
    if (dest.length === 0) {
      setError('Indicá el/los potrero(s) destino')
      return
    }
    if (modo === 'todo') {
      actualizarLote(loteId, { potreros: dest })
      toast.success('Lote trasladado')
      setOpen(false)
      return
    }
    let ids: string[] = []
    if (modo === 'categoria') {
      if (selCats.size === 0) {
        setError('Elegí al menos una categoría')
        return
      }
      ids = lote!.animales.filter((a) => selCats.has(a.categoria)).map((a) => a.id)
    } else {
      const n = parseInt(cantidad, 10)
      if (!n || n <= 0) {
        setError('Ingresá una cantidad')
        return
      }
      if (n > maxCat) {
        setError(`Solo hay ${maxCat} ${categoriaLabel(catCantidad)}`)
        return
      }
      ids = lote!.animales
        .filter((a) => a.categoria === catCantidad)
        .slice(0, n)
        .map((a) => a.id)
    }
    const nuevo = partirLote(loteId, { animalIds: ids, potrerosDestino: dest })
    if (nuevo) {
      toast.success('Lote partido')
      setOpen(false)
      navigate(`/potreros/${nuevo}`)
    } else {
      setError('No se movió ningún animal')
    }
  }

  const modos: [ModoMover, string][] = [
    ['todo', 'Todo el lote'],
    ['categoria', 'Por categoría'],
    ['cantidad', 'Por cantidad'],
  ]

  return (
    <>
      <Button variant={triggerVariant} size="sm" onClick={abrir}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trasladar / partir lote</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label>Qué mover</Label>
              <div className="flex gap-1.5">
                {modos.map(([m, l]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModo(m)}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors',
                      modo === m
                        ? 'border-field bg-field-soft text-field-deep'
                        : 'border-border text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mover-destino">Potrero(s) destino</Label>
              <Input
                id="mover-destino"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                placeholder="4"
              />
            </div>

            {modo === 'categoria' && (
              <div className="grid gap-2">
                <Label>Categorías a mover</Label>
                <div className="flex flex-wrap gap-2">
                  {comp.map((c) => (
                    <button
                      key={c.categoria}
                      type="button"
                      onClick={() => toggleCat(c.categoria)}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
                        selCats.has(c.categoria)
                          ? 'border-field bg-field-soft text-field-deep'
                          : 'border-border text-muted-foreground hover:bg-secondary',
                      )}
                    >
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: colorCategoria(c.categoria) }}
                      />
                      {categoriaLabel(c.categoria)}{' '}
                      <b className="tnum">{c.cantidad}</b>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {modo === 'cantidad' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Categoría</Label>
                  <Dropdown
                    block
                    ariaLabel="Categoría"
                    value={catCantidad}
                    onChange={setCatCantidad}
                    options={comp.map((c) => ({
                      value: c.categoria,
                      label: `${categoriaLabel(c.categoria)} (${c.cantidad})`,
                    }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mover-cant">Cantidad (máx {maxCat})</Label>
                  <Input
                    id="mover-cant"
                    type="number"
                    inputMode="numeric"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                  />
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit">
              {modo === 'todo' ? 'Trasladar lote' : 'Partir lote'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
