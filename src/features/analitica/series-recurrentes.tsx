import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Repeat } from 'lucide-react'
import type { MovimientoConDetalle } from '@/features/analitica/api'
import { useCancelarSerie } from '@/features/analitica/hooks'
import { formatARS } from '@/features/analitica/compute'
import { Panel } from '@/components/panel'
import { cn } from '@/lib/utils'

const ddmmaa = (f: string | null) =>
  f ? f.split('-').reverse().join('/') : '—'

type Serie = {
  serieId: string
  descripcion: string
  tipo: 'ingreso' | 'gasto'
  montoCuota: number
  total: number
  restantes: number
  proxima: string | null
}

/** Fila de una serie con confirmación inline para cancelar las cuotas restantes. */
function FilaSerie({ s }: { s: Serie }) {
  const [confirmar, setConfirmar] = useState(false)
  const cancelar = useCancelarSerie()
  const cobro = s.tipo === 'ingreso'

  async function onCancelar() {
    try {
      await cancelar.mutateAsync(s.serieId)
      toast.success('Cuotas restantes canceladas')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/60 py-3 last:border-0">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-xl"
        style={{
          color: cobro ? 'var(--field-deep)' : 'var(--tierra)',
          background: cobro ? 'var(--field-soft)' : 'var(--tierra-soft)',
        }}
      >
        <Repeat className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">
          {s.descripcion}
        </div>
        <div className="tnum text-[12px] text-faint">
          {s.restantes} de {s.total} cuotas · {formatARS(s.montoCuota)} c/u
          {s.proxima && ` · próxima ${ddmmaa(s.proxima)}`}
        </div>
      </div>
      <span
        className={cn(
          'tnum shrink-0 text-sm font-bold',
          cobro ? 'text-field-deep' : 'text-ink',
        )}
      >
        {cobro ? '+' : '−'}
        {formatARS(s.montoCuota * s.restantes)}
      </span>
      {confirmar ? (
        <span className="flex shrink-0 items-center gap-2 text-[12.5px]">
          <span className="text-muted-foreground">¿Anular {s.restantes}?</span>
          <button
            type="button"
            onClick={onCancelar}
            disabled={cancelar.isPending}
            className="rounded-lg bg-destructive px-2.5 py-1 font-semibold text-white"
          >
            Sí
          </button>
          <button
            type="button"
            onClick={() => setConfirmar(false)}
            className="rounded-lg border border-border px-2.5 py-1 font-semibold text-muted-foreground"
          >
            No
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmar(true)}
          className="shrink-0 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
        >
          Cancelar restantes
        </button>
      )}
    </div>
  )
}

/** Series activas (gastos recurrentes / en cuotas) con cuotas pendientes. */
export function SeriesRecurrentes({
  movimientos,
}: {
  movimientos: MovimientoConDetalle[]
}) {
  const series = useMemo<Serie[]>(() => {
    const map = new Map<string, MovimientoConDetalle[]>()
    for (const m of movimientos) {
      if (!m.serie_id) continue
      const arr = map.get(m.serie_id) ?? []
      arr.push(m)
      map.set(m.serie_id, arr)
    }
    return [...map.entries()]
      .map(([serieId, items]) => {
        const pend = items.filter((i) => i.estado === 'pendiente')
        const proxima = pend
          .map((i) => i.fecha_vencimiento)
          .filter((f): f is string => !!f)
          .sort()[0]
        return {
          serieId,
          descripcion:
            items[0].descripcion?.replace(/\s*\(cuota \d+\/\d+\)\s*$/, '') ??
            'Serie',
          tipo: items[0].tipo,
          montoCuota: Number(items[0].monto),
          total: items.length,
          restantes: pend.length,
          proxima: proxima ?? null,
        }
      })
      .filter((s) => s.restantes > 0)
      .sort((a, b) => (a.proxima ?? '9999').localeCompare(b.proxima ?? '9999'))
  }, [movimientos])

  if (series.length === 0) return null

  return (
    <Panel
      title="Recurrentes y cuotas"
      info="Tus gastos/ingresos en cuotas o que se repiten. Cada serie generó sus vencimientos; podés cancelar las cuotas que faltan (las ya pagadas quedan)."
    >
      <div className="flex flex-col">
        {series.map((s) => (
          <FilaSerie key={s.serieId} s={s} />
        ))}
      </div>
    </Panel>
  )
}
