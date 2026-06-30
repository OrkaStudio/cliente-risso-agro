import { useMemo, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Layers, MapPin, Plus, X } from 'lucide-react'
import { Constants } from '@/lib/supabase/types'
import type { Database } from '@/lib/supabase/types'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { usePotreros, useCrearAnimalesMasivo } from '@/features/hacienda/hooks'
import { useCampos } from '@/features/campos/hooks'
import { categoriaLabel } from '@/features/hacienda/labels'
import type { ItemCargaMasiva } from '@/features/hacienda/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dropdown } from '@/components/ui/dropdown'
import { FormDialog, formItem } from '@/components/form-dialog'

type Categoria = Database['public']['Enums']['categoria_animal']

const CATEGORIAS = Constants.public.Enums.categoria_animal

/** Una fila editable de la carga (strings mientras se tipea). */
type Fila = { categoria: string; cantidad: string }

const filaVacia = (): Fila => ({ categoria: '', cantidad: '' })

/** Campo/potrero ya elegido (al abrir desde un potrero del mapa). */
export type PrefillCarga = {
  campoId?: string
  potreroId?: string
  campoNombre?: string
  potreroNombre?: string
}

/**
 * Carga masiva de animales por lote, SIN caravana (se caravanean después en la
 * manga). Reutilizable: sin `prefill` muestra los selectores de campo/potrero;
 * con `prefill` (desde el mapa de un potrero) los fija y solo pide categorías.
 */
export function CargaMasivaDialog({
  open,
  onOpenChange,
  prefill,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  prefill?: PrefillCarga
}) {
  const empresa = useEmpresa()
  const campos = useCampos()
  const potreros = usePotreros()
  const cargar = useCrearAnimalesMasivo()

  const fijo = !!prefill?.potreroId

  const [campoId, setCampoId] = useState(prefill?.campoId ?? '')
  const [potreroId, setPotreroId] = useState(prefill?.potreroId ?? '')
  const [loteNombre, setLoteNombre] = useState('')
  const [loteProposito, setLoteProposito] = useState('')
  const [origen, setOrigen] = useState('')
  const [filas, setFilas] = useState<Fila[]>([filaVacia()])
  const [error, setError] = useState<string | null>(null)

  // Potreros del campo elegido (cuando no viene fijado por prefill).
  const potrerosDeCampo = useMemo(
    () => (potreros.data ?? []).filter((p) => p.campo_id === campoId),
    [potreros.data, campoId],
  )

  const items = useMemo<ItemCargaMasiva[]>(() => {
    const acc = new Map<Categoria, number>()
    for (const f of filas) {
      const cat = f.categoria as Categoria
      const n = parseInt(f.cantidad, 10)
      if (!cat || !Number.isFinite(n) || n <= 0) continue
      acc.set(cat, (acc.get(cat) ?? 0) + n)
    }
    return [...acc.entries()].map(([categoria, cantidad]) => ({ categoria, cantidad }))
  }, [filas])

  const total = items.reduce((s, it) => s + it.cantidad, 0)

  function reset() {
    setCampoId(prefill?.campoId ?? '')
    setPotreroId(prefill?.potreroId ?? '')
    setLoteNombre('')
    setLoteProposito('')
    setOrigen('')
    setFilas([filaVacia()])
    setError(null)
  }

  function setFila(i: number, patch: Partial<Fila>) {
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  }
  function agregarFila() {
    setFilas((prev) => [...prev, filaVacia()])
  }
  function quitarFila(i: number) {
    setFilas((prev) => (prev.length === 1 ? prev : prev.filter((_, j) => j !== i)))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const empresaId = empresa.data?.empresa_id
    if (!empresaId) {
      setError('No se pudo determinar la empresa.')
      return
    }
    if (total === 0) {
      setError('Agregá al menos una categoría con cantidad.')
      return
    }
    if (total > 2000) {
      setError(`Demasiados de una vez (${total}). Máximo 2000 por carga.`)
      return
    }
    try {
      const n = await cargar.mutateAsync({
        empresaId,
        potreroId: potreroId || null,
        loteNombre: loteNombre || undefined,
        loteProposito: loteProposito || undefined,
        origen: origen || undefined,
        items,
      })
      toast.success(
        `${n} ${n === 1 ? 'animal cargado' : 'animales cargados'} sin caravana`,
      )
      onOpenChange(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    }
  }

  const catOptions = [
    { value: '', label: 'Categoría…' },
    ...CATEGORIAS.map((c) => ({ value: c, label: categoriaLabel[c] })),
  ]

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
      icon={Layers}
      title="Carga masiva"
      subtitle="Por tropa, sin caravana · se taggean en la manga"
      onSubmit={onSubmit}
      footer={
        <Button
          type="submit"
          disabled={cargar.isPending || !empresa.data || total === 0}
          className="h-12 w-full rounded-xl text-[15px] font-semibold shadow-[0_4px_14px_rgba(16,30,20,0.18)]"
        >
          {cargar.isPending
            ? 'Cargando…'
            : total === 0
              ? 'Agregá categorías'
              : `Cargar ${total} ${total === 1 ? 'animal' : 'animales'}`}
        </Button>
      }
    >
      {/* Destino: fijo (desde el mapa) o selectores */}
      {fijo ? (
        <motion.div variants={formItem}>
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/50 px-3.5 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-field-soft text-field-deep">
              <MapPin className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-faint">
                Destino
              </p>
              <p className="truncate text-[13.5px] font-semibold text-ink">
                {prefill?.campoNombre ? `${prefill.campoNombre} · ` : ''}
                Potrero {prefill?.potreroNombre ?? '—'}
              </p>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div variants={formItem} className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Campo</Label>
            <Dropdown
              block
              ariaLabel="Campo"
              value={campoId}
              onChange={(v) => {
                setCampoId(v)
                setPotreroId('')
              }}
              options={[
                { value: '', label: 'Elegí…' },
                ...(campos.data ?? []).map((c) => ({ value: c.id, label: c.nombre })),
              ]}
            />
          </div>
          <div className="grid gap-2">
            <Label>Potrero</Label>
            <Dropdown
              block
              ariaLabel="Potrero"
              value={potreroId}
              onChange={setPotreroId}
              options={[
                { value: '', label: campoId ? 'Sin asignar' : 'Elegí un campo' },
                ...potrerosDeCampo.map((p) => ({ value: p.id, label: p.nombre })),
              ]}
            />
          </div>
        </motion.div>
      )}

      {/* Lote / tropa */}
      <motion.div variants={formItem} className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="lote-nombre">Lote / tropa (opcional)</Label>
          <Input
            id="lote-nombre"
            placeholder="Ej. Lote 1"
            value={loteNombre}
            onChange={(e) => setLoteNombre(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lote-prop">Propósito (opcional)</Label>
          <Input
            id="lote-prop"
            placeholder="Cría, invernada…"
            value={loteProposito}
            onChange={(e) => setLoteProposito(e.target.value)}
          />
        </div>
      </motion.div>

      {/* Categorías + cantidades */}
      <motion.div variants={formItem} className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <Label>Categorías y cantidades *</Label>
          {total > 0 && (
            <span className="tnum text-[12.5px] font-bold text-field-deep">
              {total} {total === 1 ? 'cabeza' : 'cabezas'}
            </span>
          )}
        </div>
        <div className="grid gap-2">
          {filas.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Dropdown
                  block
                  ariaLabel={`Categoría ${i + 1}`}
                  value={f.categoria}
                  onChange={(v) => setFila(i, { categoria: v })}
                  options={catOptions}
                />
              </div>
              <Input
                className="w-24 text-center"
                inputMode="numeric"
                placeholder="0"
                aria-label={`Cantidad ${i + 1}`}
                value={f.cantidad}
                onChange={(e) =>
                  setFila(i, { cantidad: e.target.value.replace(/[^0-9]/g, '') })
                }
              />
              <button
                type="button"
                aria-label="Quitar fila"
                onClick={() => quitarFila(i)}
                disabled={filas.length === 1}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={agregarFila}
          className="mt-0.5 inline-flex w-fit items-center gap-1.5 rounded-lg px-1 py-1 text-[13px] font-semibold text-field-deep transition-colors hover:text-field"
        >
          <Plus className="size-4" />
          Agregar categoría
        </button>
      </motion.div>

      <motion.div variants={formItem} className="grid gap-2">
        <Label htmlFor="origen-masivo">Origen (opcional)</Label>
        <Input
          id="origen-masivo"
          placeholder="Nacido / Compra…"
          value={origen}
          onChange={(e) => setOrigen(e.target.value)}
        />
      </motion.div>

      <motion.p variants={formItem} className="text-xs text-muted-foreground">
        Se crean como animales individuales sin caravana. Después los pasás por la
        manga para asignarles la caravana y completar sus datos.
      </motion.p>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </FormDialog>
  )
}
