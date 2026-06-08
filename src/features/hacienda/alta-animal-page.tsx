import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { toast } from 'sonner'
import { Constants } from '@/lib/supabase/types'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { usePotreros, useCrearAnimal } from '@/features/hacienda/hooks'
import { categoriaLabel } from '@/features/hacienda/labels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const schema = z.object({
  numeroRfid: z.string().trim().min(1, 'Ingresá el número de caravana'),
  numeroVisual: z.string().trim().optional(),
  categoria: z.enum(Constants.public.Enums.categoria_animal),
  potreroId: z.string().optional(),
  origen: z.string().trim().optional(),
  fechaNacimiento: z.string().optional(),
})

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

export function AltaAnimalPage() {
  const navigate = useNavigate()
  const empresa = useEmpresa()
  const potreros = usePotreros()
  const crear = useCrearAnimal()

  const [numeroRfid, setNumeroRfid] = useState('')
  const [numeroVisual, setNumeroVisual] = useState('')
  const [categoria, setCategoria] = useState('')
  const [potreroId, setPotreroId] = useState('')
  const [origen, setOrigen] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [error, setError] = useState<string | null>(null)

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
      const id = await crear.mutateAsync({
        empresaId,
        numeroRfid: parsed.data.numeroRfid,
        numeroVisual: parsed.data.numeroVisual,
        categoria: parsed.data.categoria,
        potreroId: parsed.data.potreroId || null,
        origen: parsed.data.origen,
        fechaNacimiento: parsed.data.fechaNacimiento || null,
      })
      toast.success('Animal dado de alta')
      navigate(`/hacienda/${id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al dar de alta')
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4">
        <Link to="/hacienda" className="text-sm text-muted-foreground hover:underline">
          ← Hacienda
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo animal</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="rfid">Caravana (RFID) *</Label>
              <Input
                id="rfid"
                inputMode="numeric"
                placeholder="Número de caravana"
                value={numeroRfid}
                onChange={(e) => setNumeroRfid(e.target.value)}
                autoFocus
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="visual">Caravana visual (opcional)</Label>
              <Input
                id="visual"
                value={numeroVisual}
                onChange={(e) => setNumeroVisual(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="categoria">Categoría *</Label>
              <select
                id="categoria"
                className={selectClass}
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              >
                <option value="">Elegí…</option>
                {Constants.public.Enums.categoria_animal.map((c) => (
                  <option key={c} value={c}>
                    {categoriaLabel[c]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                El sexo se completa solo según la categoría.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="potrero">Potrero (opcional)</Label>
              <select
                id="potrero"
                className={selectClass}
                value={potreroId}
                onChange={(e) => setPotreroId(e.target.value)}
              >
                <option value="">Sin asignar</option>
                {(potreros.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={crear.isPending || !empresa.data}
            >
              {crear.isPending ? 'Guardando…' : 'Dar de alta'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
