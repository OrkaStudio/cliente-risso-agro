import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Landmark } from 'lucide-react'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useCheques } from '@/features/cheques/hooks'
import type { Cheque } from '@/features/cheques/api'
import { CargarMovimientoDialog } from '@/features/analitica/cargar-movimiento-dialog'
import { Panel } from '@/components/panel'
import { cn } from '@/lib/utils'

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

function diasInfo(c: Cheque): { texto: string; urgente: boolean } {
  if (c.estado === 'liquidado') {
    return { texto: c.tipo === 'ingreso' ? 'cobrado' : 'pagado', urgente: false }
  }
  if (!c.fechaVencimiento) return { texto: 'sin fecha', urgente: false }
  const [y, m, d] = c.fechaVencimiento.split('-').map(Number)
  const dias = Math.round(
    (new Date(y, m - 1, d).getTime() - new Date().setHours(0, 0, 0, 0)) /
      86400000,
  )
  if (dias < 0) return { texto: `vencido hace ${-dias} d`, urgente: true }
  if (dias === 0) return { texto: 'vence hoy', urgente: true }
  return { texto: `en ${dias} d`, urgente: dias <= 3 }
}

type Filtro = 'todos' | 'cobrar' | 'pagar'

export function ChequesPage() {
  const empresa = useEmpresa()
  const empresaId = empresa.data?.empresa_id ?? ''
  const cheques = useCheques()
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [verLiquidados, setVerLiquidados] = useState(false)

  const data = useMemo(() => cheques.data ?? [], [cheques.data])

  const porCobrar = useMemo(
    () =>
      data
        .filter((c) => c.estado === 'pendiente' && c.tipo === 'ingreso')
        .reduce((s, c) => s + c.monto, 0),
    [data],
  )
  const porPagar = useMemo(
    () =>
      data
        .filter((c) => c.estado === 'pendiente' && c.tipo === 'gasto')
        .reduce((s, c) => s + c.monto, 0),
    [data],
  )

  const lista = useMemo(
    () =>
      data.filter((c) => {
        if (!verLiquidados && c.estado !== 'pendiente') return false
        if (filtro === 'cobrar' && c.tipo !== 'ingreso') return false
        if (filtro === 'pagar' && c.tipo !== 'gasto') return false
        return true
      }),
    [data, filtro, verLiquidados],
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[32px] font-bold tracking-[-0.03em] text-ink">
            Cheques y echeqs
          </h1>
          <p className="mt-1 text-[14.5px] font-medium text-muted-foreground">
            Cobros y pagos con cheque, por vencimiento
          </p>
        </div>
        <CargarMovimientoDialog empresaId={empresaId} />
      </div>

      {/* KPIs */}
      <div className="flex flex-wrap overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,19,0.05),0_4px_14px_rgba(16,24,19,0.04)] [&>*+*]:border-l [&>*+*]:border-border">
        <div className="min-w-44 flex-1 px-[22px] py-[18px]">
          <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            <ArrowDownLeft className="size-4 text-field" />
            Por cobrar
          </div>
          <div className="tnum mt-2 text-[24px] font-bold leading-none text-field-deep">
            {porCobrar === 0 ? '—' : fmt(porCobrar)}
          </div>
        </div>
        <div className="min-w-44 flex-1 px-[22px] py-[18px]">
          <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            <ArrowUpRight className="size-4 text-tierra" />
            Por pagar
          </div>
          <div className="tnum mt-2 text-[24px] font-bold leading-none text-ink">
            {porPagar === 0 ? '—' : fmt(porPagar)}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 rounded-[10px] border border-border bg-secondary p-0.5">
          {(
            [
              ['todos', 'Todos'],
              ['cobrar', 'A cobrar'],
              ['pagar', 'A pagar'],
            ] as [Filtro, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setFiltro(v)}
              className={cn(
                'rounded-[7px] px-4 text-[13.5px] font-semibold transition-colors',
                filtro === v
                  ? 'bg-card text-ink shadow-[0_1px_3px_rgba(16,24,19,0.08)]'
                  : 'text-muted-foreground hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13.5px] font-medium text-muted-foreground">
          <input
            type="checkbox"
            checked={verLiquidados}
            onChange={(e) => setVerLiquidados(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          Ver cobrados/pagados
        </label>
      </div>

      {/* Lista */}
      <Panel>
        {cheques.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Cargando…
          </p>
        ) : cheques.error ? (
          <p className="py-8 text-center text-sm text-destructive">
            Error: {(cheques.error as Error).message}
          </p>
        ) : lista.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {data.length === 0
              ? 'Todavía no cargaste cheques. Cargá uno con “+ Cargar gasto/ingreso” (medio de pago: cheque).'
              : 'Sin cheques con ese filtro.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-[0.06em] text-faint">
                  <th className="pb-2.5 pr-3">Vencimiento</th>
                  <th className="pb-2.5 pr-3">Detalle</th>
                  <th className="pb-2.5 pr-3">Banco</th>
                  <th className="pb-2.5 pr-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const di = diasInfo(c)
                  const cobro = c.tipo === 'ingreso'
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-3 pr-3">
                        <span
                          className={cn(
                            'tnum text-[13px] font-bold',
                            di.urgente ? 'text-destructive' : 'text-ink',
                          )}
                        >
                          {di.texto}
                        </span>
                        {c.fechaVencimiento && c.estado === 'pendiente' && (
                          <div className="tnum text-[11px] text-faint">
                            {c.fechaVencimiento.split('-').reverse().join('/')}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase',
                              cobro
                                ? 'bg-field-soft text-field-deep'
                                : 'bg-tierra-soft text-tierra',
                            )}
                          >
                            {cobro ? 'Cobro' : 'Pago'}
                          </span>
                          {c.esEcheq && (
                            <span className="rounded-md bg-sky/15 px-1.5 py-0.5 text-[10.5px] font-bold uppercase text-sky">
                              echeq
                            </span>
                          )}
                          <span className="text-sm font-semibold text-ink">
                            {c.contraparte ?? c.descripcion ?? '—'}
                          </span>
                        </div>
                        {c.numero && (
                          <div className="tnum mt-0.5 text-[11px] text-faint">
                            N° {c.numero}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Landmark className="size-3.5 text-faint" />
                          {c.banco ?? '—'}
                        </span>
                      </td>
                      <td
                        className={cn(
                          'tnum py-3 text-right text-sm font-bold',
                          cobro ? 'text-field-deep' : 'text-ink',
                        )}
                      >
                        {cobro ? '+' : '−'}
                        {fmt(c.monto)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
