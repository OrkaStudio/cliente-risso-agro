import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Beef, ChevronLeft, MapPin, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  colorCategoria,
  categoriaLabel,
  especieColor,
  especieLabel,
  propositoLabel,
  sexoLabelMap,
} from '@/features/lotes/domain'
import {
  borrarLote,
  campoDe,
  codigoLote,
  composicionDe,
  quitarAnimal,
  totalLote,
  useLote,
} from '@/features/lotes/store'
import {
  AgregarAnimalDialog,
  EditarLoteDialog,
  TrasladarPartirDialog,
} from '@/features/lotes/lotes-dialogs'
import { Panel } from '@/components/panel'
import { Button } from '@/components/ui/button'

export function LoteFichaPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const lote = useLote(id)
  const [confirmDel, setConfirmDel] = useState(false)

  if (!lote) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Lote no encontrado.</p>
        <Link
          to="/potreros"
          className="text-sm font-semibold text-field-deep hover:underline"
        >
          ← Volver a Potreros
        </Link>
      </div>
    )
  }

  const campo = campoDe(lote.campoId)
  const total = totalLote(lote)
  const comp = composicionDe(lote)
  const codigo = codigoLote(lote)
  const hex = campo?.color.hex ?? 'var(--field)'

  function onBorrar() {
    borrarLote(lote!.id)
    toast.success('Lote borrado')
    navigate('/potreros')
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div>
        <Link
          to="/potreros"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          Potreros
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="tnum flex size-12 shrink-0 items-center justify-center rounded-2xl font-heading text-[20px] font-bold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
              style={{ background: hex }}
              title={campo ? `Campo ${campo.nombre} · color ${campo.color.nombre}` : undefined}
            >
              {codigo}
            </span>
            <h1 className="font-heading text-[32px] font-bold tracking-[-0.03em] text-ink">
              Lote {codigo}
            </h1>
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ background: especieColor[lote.especie] }}
              title={especieLabel[lote.especie]}
            />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <AgregarAnimalDialog loteId={lote.id} especie={lote.especie} />
            <EditarLoteDialog loteId={lote.id} />
            <TrasladarPartirDialog loteId={lote.id} />
            {confirmDel ? (
              <span className="flex items-center gap-2 text-[13px]">
                <span className="text-muted-foreground">¿Borrar el lote?</span>
                <Button variant="outline" size="sm" onClick={() => setConfirmDel(false)}>
                  Cancelar
                </Button>
                <button
                  type="button"
                  onClick={onBorrar}
                  className="inline-flex h-8 items-center rounded-lg bg-destructive px-3 text-[13px] font-semibold text-white transition-colors hover:bg-destructive/90"
                >
                  Sí, borrar
                </button>
              </span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDel(true)}
              >
                <Trash2 className="size-4" />
                Borrar lote
              </Button>
            )}
          </div>
        </div>
        <p className="mt-1 text-[14.5px] font-medium text-muted-foreground">
          {campo?.nombre} · {especieLabel[lote.especie]} ·{' '}
          {propositoLabel[lote.proposito]} ·{' '}
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" />
            {lote.potreros.length > 1 ? 'Potreros' : 'Potrero'}{' '}
            {lote.potreros.join(' y ') || '—'}
          </span>
        </p>
      </div>

      {/* Composición */}
      <Panel title="Composición" sub={`${total} cabezas`}>
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <Beef className="size-7 text-faint" />
            <p className="text-sm text-muted-foreground">
              El lote no tiene animales todavía. Agregá el primero con “+ Agregar
              animal”.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
              {comp.map((c) => (
                <span
                  key={c.categoria}
                  style={{
                    width: `${(c.cantidad / total) * 100}%`,
                    background: colorCategoria(c.categoria),
                  }}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-[13.5px] sm:grid-cols-3">
              {comp.map((c) => (
                <div key={c.categoria} className="flex items-center gap-2.5">
                  <span
                    className="size-[11px] shrink-0 rounded-[3px]"
                    style={{ background: colorCategoria(c.categoria) }}
                  />
                  <span className="text-ink">{categoriaLabel(c.categoria)}</span>
                  <span className="tnum ml-auto text-[12.5px] font-bold text-ink">
                    {c.cantidad}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* Animales */}
      <Panel title="Animales del lote" sub={`${total} con caravana`}>
        {lote.animales.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sin animales cargados.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
                <th className="pb-2.5 pr-3 font-bold">Caravana</th>
                <th className="pb-2.5 pr-3 font-bold">Categoría</th>
                <th className="pb-2.5 pr-3 font-bold">Sexo</th>
                <th className="pb-2.5 text-right font-bold">Acción</th>
              </tr>
            </thead>
            <tbody>
              {lote.animales.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="tnum py-2.5 pr-3 text-sm font-semibold text-ink">
                    {a.caravana}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="inline-flex items-center gap-2 text-sm text-ink">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: colorCategoria(a.categoria) }}
                      />
                      {categoriaLabel(a.categoria)}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-sm text-muted-foreground">
                    {sexoLabelMap[a.sexo]}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        quitarAnimal(lote.id, a.id)
                        toast.success('Animal quitado')
                      }}
                      title="Quitar del lote"
                      className="inline-flex size-8 items-center justify-center rounded-lg text-faint transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
