import { useMemo, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { MapPinned } from 'lucide-react'
import { useCamposConPotreros } from '@/features/campos/hooks'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useUbicarAnimales } from '@/features/hacienda/hooks'
import type { AnimalConCaravana } from '@/features/hacienda/api'
import { categoriaNombre } from '@/features/hacienda/labels'
import { CantidadRow } from '@/features/hacienda/mover-animales-dialog'
import { Button } from '@/components/ui/button'
import { Dropdown } from '@/components/ui/dropdown'
import { FormDialog, formItem, formLabel } from '@/components/form-dialog'
import type { Database } from '@/lib/supabase/types'

type Categoria = Database['public']['Enums']['categoria_animal']

/**
 * Ubicar en un potrero los animales que están SIN potrero. Llegan así desde
 * el onboarding (cargó la hacienda antes que los potreros) o desde una carga
 * sin destino. Es el único camino para sacarlos de "Sin potrero": el
 * diálogo de mover del mapa arranca de un potrero de origen, y acá no hay.
 *
 * Qué se lleva: cantidades por categoría (todas por defecto). Al elegir de
 * a cantidad, van primero los sin caravana — los identificados quedan para
 * ubicarlos a mano, como en el mapa.
 */
export function UbicarAnimalesDialog({
  open,
  onOpenChange,
  animales,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Los activos sin potrero (ya filtrados por quien abre el diálogo). */
  animales: AnimalConCaravana[]
}) {
  const empresa = useEmpresa()
  const campos = useCamposConPotreros()
  const ubicar = useUbicarAnimales()

  const [campoId, setCampoId] = useState('')
  const [potreroId, setPotreroId] = useState('')
  const [cant, setCant] = useState<Partial<Record<Categoria, string>>>({})

  // Composición de lo que hay sin potrero, en orden canónico de categoría.
  const composicion = useMemo(() => {
    const map = new Map<Categoria, number>()
    for (const a of animales) if (a.categoria) map.set(a.categoria, (map.get(a.categoria) ?? 0) + 1)
    return [...map.entries()].map(([categoria, hay]) => ({ categoria, hay }))
  }, [animales])

  // Sin tocar nada se llevan todos: el caso común es "los cargué en el
  // onboarding, ahora los pongo en su potrero".
  const cantidadDe = (c: Categoria, hay: number) => {
    const v = cant[c]
    return v === undefined ? hay : Math.max(0, Math.min(hay, parseInt(v || '', 10) || 0))
  }
  const total = composicion.reduce((s, x) => s + cantidadDe(x.categoria, x.hay), 0)

  const lista = campos.data ?? []
  // Sólo campos con potreros: sin potrero no hay dónde ubicar.
  const conPotreros = lista.filter((c) => c.potreros.length > 0)
  const campo = conPotreros.find((c) => c.id === campoId) ?? (conPotreros.length === 1 ? conPotreros[0] : null)
  const potrero = campo?.potreros.find((p) => p.id === potreroId) ?? null

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!empresa.data || !potrero || total === 0) return
    // Elegir los ids: por categoría, primero los sin caravana, después los
    // más viejos — el mismo criterio que mover por cantidad en la RPC.
    const ids: string[] = []
    for (const { categoria, hay } of composicion) {
      const n = cantidadDe(categoria, hay)
      if (n === 0) continue
      const candidatos = animales
        .filter((a) => a.categoria === categoria && a.id)
        .sort((a, b) => {
          const ca = a.caravana_rfid ? 1 : 0
          const cb = b.caravana_rfid ? 1 : 0
          if (ca !== cb) return ca - cb
          return (a.created_at ?? '').localeCompare(b.created_at ?? '')
        })
        .slice(0, n)
      for (const a of candidatos) ids.push(a.id!)
    }
    ubicar.mutate(
      { empresaId: empresa.data.empresa_id, potreroDestinoId: potrero.id, animalIds: ids },
      {
        onSuccess: (movidos) => {
          toast.success(`${movidos} ${movidos === 1 ? 'animal ubicado' : 'animales ubicados'} en ${potrero.nombre}`)
          onOpenChange(false)
          setCant({})
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={MapPinned}
      title="Ubicar en un potrero"
      subtitle={`${animales.length} ${animales.length === 1 ? 'animal' : 'animales'} sin potrero. Elegí adónde van.`}
      onSubmit={onSubmit}
      footer={
        <Button type="submit" className="w-full" disabled={ubicar.isPending || !potrero || total === 0}>
          {ubicar.isPending
            ? 'Ubicando…'
            : !potrero
              ? 'Elegí el potrero'
              : total === 0
                ? 'Anotá cuántos van'
                : `Ubicar ${total} ${total === 1 ? 'animal' : 'animales'} en ${potrero.nombre}`}
        </Button>
      }
    >
      {conPotreros.length === 0 ? (
        <motion.p variants={formItem} className="text-[13px] text-muted-foreground">
          Todavía no hay potreros. Cargalos desde Campos y volvé acá para ubicar la hacienda.
        </motion.p>
      ) : (
        <>
          {conPotreros.length > 1 && (
            <motion.div variants={formItem} className="grid gap-2">
              <span className={formLabel}>Campo</span>
              <Dropdown
                block
                ariaLabel="Campo"
                value={campo?.id ?? ''}
                onChange={(v) => {
                  setCampoId(v)
                  setPotreroId('')
                }}
                options={[
                  { value: '', label: 'Elegí…' },
                  ...conPotreros.map((c) => ({ value: c.id, label: c.nombre })),
                ]}
              />
            </motion.div>
          )}
          <motion.div variants={formItem} className="grid gap-2">
            <span className={formLabel}>Potrero{campo && conPotreros.length === 1 ? ` de ${campo.nombre}` : ''}</span>
            <Dropdown
              block
              ariaLabel="Potrero"
              value={potreroId}
              onChange={setPotreroId}
              options={[
                { value: '', label: campo ? 'Elegí el potrero' : 'Elegí un campo' },
                ...(campo?.potreros ?? []).map((p) => ({
                  value: p.id,
                  label: p.hectareas ? `${p.nombre} · ${p.hectareas} ha` : p.nombre,
                })),
              ]}
            />
          </motion.div>
          <motion.div variants={formItem}>
            <span className={formLabel}>¿Cuántos van?</span>
            <div className="grid gap-2">
              {composicion.map(({ categoria, hay }) => (
                <CantidadRow
                  key={categoria}
                  label={categoriaNombre(categoria, hay)}
                  hay={hay}
                  value={cant[categoria] ?? String(hay)}
                  onSet={(v) => setCant((x) => ({ ...x, [categoria]: v }))}
                />
              ))}
            </div>
          </motion.div>
        </>
      )}
    </FormDialog>
  )
}
