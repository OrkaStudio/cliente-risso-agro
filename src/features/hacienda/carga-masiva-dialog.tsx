import { useMemo, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Layers, MapPin, Plus, X } from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { usePotreros, useCrearAnimalesMasivo } from '@/features/hacienda/hooks'
import { useCampos } from '@/features/campos/hooks'
import {
  categoriaLabel,
  categoriasPorEspecie,
  especieLabel,
  type Especie,
} from '@/features/hacienda/labels'
import type { BloqueCarga, ItemCargaMasiva } from '@/features/hacienda/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown'
import { FormDialog, formItem } from '@/components/form-dialog'

type Categoria = Database['public']['Enums']['categoria_animal']

const ESPECIES: Especie[] = ['bovino', 'ovino', 'equino']

/** Opciones de categoría agrupadas por especie (Bovino/Ovino/Equino). */
const CAT_OPTIONS: DropdownOption[] = [
  { value: '', label: 'Categoría…' },
  ...ESPECIES.flatMap((esp) =>
    categoriasPorEspecie[esp].map((c) => ({
      value: c,
      label: categoriaLabel[c],
      group: especieLabel[esp],
    })),
  ),
]

/** Una fila editable de la carga (strings mientras se tipea). */
type Fila = { categoria: string; cantidad: string }
/** Un destino: un potrero del campo con sus filas de categoría/cantidad. */
type Bloque = { potreroId: string; filas: Fila[] }

const filaVacia = (): Fila => ({ categoria: '', cantidad: '' })
const bloqueVacio = (potreroId = ''): Bloque => ({
  potreroId,
  filas: [filaVacia()],
})

/** Agrega las filas de un bloque en items (una entrada por categoría). */
function itemsDeFilas(filas: Fila[]): ItemCargaMasiva[] {
  const acc = new Map<Categoria, number>()
  for (const f of filas) {
    const cat = f.categoria as Categoria
    const n = parseInt(f.cantidad, 10)
    if (!cat || !Number.isFinite(n) || n <= 0) continue
    acc.set(cat, (acc.get(cat) ?? 0) + n)
  }
  return [...acc.entries()].map(([categoria, cantidad]) => ({ categoria, cantidad }))
}

const totalDeFilas = (filas: Fila[]) =>
  itemsDeFilas(filas).reduce((s, it) => s + it.cantidad, 0)

/** Campo/potrero ya elegido (al abrir desde un potrero o un campo del mapa). */
export type PrefillCarga = {
  campoId?: string
  potreroId?: string
  campoNombre?: string
  potreroNombre?: string
}

/**
 * Carga masiva de animales por lote, SIN caravana (se caravanean después en la
 * manga). El mismo lote se puede repartir en varios potreros del campo (un
 * bloque por potrero). Reutilizable:
 *  · `prefill.potreroId` → destino fijo a un potrero (un solo bloque).
 *  · `prefill.campoId` (sin potrero) → campo fijo, elegís los potreros.
 *  · sin prefill → elegís campo y potreros.
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

  const potreroFijo = !!prefill?.potreroId

  const [campoId, setCampoId] = useState(prefill?.campoId ?? '')
  const [loteNombre, setLoteNombre] = useState('')
  const [loteProposito, setLoteProposito] = useState('')
  const [origen, setOrigen] = useState('')
  const [bloques, setBloques] = useState<Bloque[]>([
    bloqueVacio(prefill?.potreroId ?? ''),
  ])
  const [error, setError] = useState<string | null>(null)

  // Potreros del campo elegido.
  const potrerosDeCampo = useMemo(
    () => (potreros.data ?? []).filter((p) => p.campo_id === campoId),
    [potreros.data, campoId],
  )

  const total = useMemo(
    () => bloques.reduce((s, b) => s + totalDeFilas(b.filas), 0),
    [bloques],
  )

  function reset() {
    setCampoId(prefill?.campoId ?? '')
    setLoteNombre('')
    setLoteProposito('')
    setOrigen('')
    setBloques([bloqueVacio(prefill?.potreroId ?? '')])
    setError(null)
  }

  // --- edición de bloques y filas ---
  function setBloque(bi: number, patch: Partial<Bloque>) {
    setBloques((prev) => prev.map((b, j) => (j === bi ? { ...b, ...patch } : b)))
  }
  function agregarBloque() {
    setBloques((prev) => [...prev, bloqueVacio()])
  }
  function quitarBloque(bi: number) {
    setBloques((prev) => (prev.length === 1 ? prev : prev.filter((_, j) => j !== bi)))
  }
  function setFila(bi: number, fi: number, patch: Partial<Fila>) {
    setBloques((prev) =>
      prev.map((b, j) =>
        j === bi
          ? { ...b, filas: b.filas.map((f, k) => (k === fi ? { ...f, ...patch } : f)) }
          : b,
      ),
    )
  }
  function agregarFila(bi: number) {
    setBloques((prev) =>
      prev.map((b, j) => (j === bi ? { ...b, filas: [...b.filas, filaVacia()] } : b)),
    )
  }
  function quitarFila(bi: number, fi: number) {
    setBloques((prev) =>
      prev.map((b, j) =>
        j === bi
          ? { ...b, filas: b.filas.length === 1 ? b.filas : b.filas.filter((_, k) => k !== fi) }
          : b,
      ),
    )
  }

  /** Potreros disponibles para el bloque `bi` (sin repetir los ya elegidos). */
  function potrerosDisponibles(bi: number) {
    const tomados = new Set(
      bloques.filter((_, j) => j !== bi).map((b) => b.potreroId).filter(Boolean),
    )
    return potrerosDeCampo.filter(
      (p) => p.id === bloques[bi].potreroId || !tomados.has(p.id),
    )
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
    const bloquesPayload: BloqueCarga[] = bloques.map((b) => ({
      potreroId: b.potreroId || null,
      items: itemsDeFilas(b.filas),
    }))
    try {
      const n = await cargar.mutateAsync({
        empresaId,
        campoId: campoId || null,
        loteNombre: loteNombre || undefined,
        loteProposito: loteProposito || undefined,
        origen: origen || undefined,
        bloques: bloquesPayload,
      })
      const potrerosConAnimales = bloquesPayload.filter((b) => b.items.length > 0).length
      toast.success(
        `${n} ${n === 1 ? 'animal cargado' : 'animales cargados'} sin caravana` +
          (potrerosConAnimales > 1 ? ` en ${potrerosConAnimales} potreros` : ''),
      )
      onOpenChange(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    }
  }

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
      {/* Destino: potrero fijo, o campo (los potreros van por bloque) */}
      {potreroFijo ? (
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
        <motion.div variants={formItem} className="grid gap-2">
          <Label>Campo</Label>
          <Dropdown
            block
            ariaLabel="Campo"
            value={campoId}
            onChange={(v) => {
              setCampoId(v)
              // Al cambiar de campo, los potreros elegidos ya no aplican.
              setBloques((prev) => prev.map((b) => ({ ...b, potreroId: '' })))
            }}
            options={[
              { value: '', label: 'Elegí…' },
              ...(campos.data ?? []).map((c) => ({ value: c.id, label: c.nombre })),
            ]}
          />
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

      {/* Bloques: un potrero con sus categorías. El mismo lote, repartido. */}
      <motion.div variants={formItem} className="grid gap-3">
        <div className="flex items-baseline justify-between">
          <Label>{potreroFijo ? 'Categorías y cantidades *' : 'Reparto por potrero *'}</Label>
          {total > 0 && (
            <span className="tnum text-[12.5px] font-bold text-field-deep">
              {total} {total === 1 ? 'cabeza' : 'cabezas'}
            </span>
          )}
        </div>

        {bloques.map((b, bi) => {
          const subtotal = totalDeFilas(b.filas)
          return (
            <div
              key={bi}
              className={
                potreroFijo
                  ? 'grid gap-2'
                  : 'grid gap-2.5 rounded-xl border border-border bg-secondary/30 p-3'
              }
            >
              {/* Cabecera del bloque: potrero + subtotal + quitar */}
              {!potreroFijo && (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Dropdown
                      block
                      ariaLabel={`Potrero del bloque ${bi + 1}`}
                      value={b.potreroId}
                      onChange={(v) => setBloque(bi, { potreroId: v })}
                      options={[
                        {
                          value: '',
                          label: campoId ? 'Sin asignar' : 'Elegí un campo',
                        },
                        ...potrerosDisponibles(bi).map((p) => ({
                          value: p.id,
                          label: p.nombre,
                        })),
                      ]}
                    />
                  </div>
                  {subtotal > 0 && (
                    <span className="tnum shrink-0 text-[12px] font-semibold text-muted-foreground">
                      {subtotal}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label="Quitar potrero"
                    onClick={() => quitarBloque(bi)}
                    disabled={bloques.length === 1}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              )}

              {/* Filas de categoría/cantidad */}
              <div className="grid gap-2">
                {b.filas.map((f, fi) => (
                  <div key={fi} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Dropdown
                        block
                        ariaLabel={`Categoría ${bi + 1}.${fi + 1}`}
                        value={f.categoria}
                        onChange={(v) => setFila(bi, fi, { categoria: v })}
                        options={CAT_OPTIONS}
                      />
                    </div>
                    <Input
                      className="w-24 text-center"
                      inputMode="numeric"
                      placeholder="0"
                      aria-label={`Cantidad ${bi + 1}.${fi + 1}`}
                      value={f.cantidad}
                      onChange={(e) =>
                        setFila(bi, fi, {
                          cantidad: e.target.value.replace(/[^0-9]/g, ''),
                        })
                      }
                    />
                    <button
                      type="button"
                      aria-label="Quitar categoría"
                      onClick={() => quitarFila(bi, fi)}
                      disabled={b.filas.length === 1}
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => agregarFila(bi)}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg px-1 py-0.5 text-[13px] font-semibold text-field-deep transition-colors hover:text-field"
              >
                <Plus className="size-4" />
                Agregar categoría
              </button>
            </div>
          )
        })}

        {!potreroFijo && (
          <button
            type="button"
            onClick={agregarBloque}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg px-1 py-1 text-[13px] font-semibold text-field-deep transition-colors hover:text-field"
          >
            <Plus className="size-4" />
            Agregar potrero
          </button>
        )}
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
