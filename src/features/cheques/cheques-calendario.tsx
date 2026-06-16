import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Cheque } from '@/features/cheques/api'
import { LiquidarChequeDialog } from '@/features/cheques/cheques-dialogs'
import { Panel } from '@/components/panel'
import { cn } from '@/lib/utils'

const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000)
    return `$${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `$${Math.round(abs / 1_000)}k`
  return `$${abs}`
}

function estaVencido(fecha: string | null): boolean {
  if (!fecha) return false
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(y, m - 1, d).getTime() < new Date().setHours(0, 0, 0, 0)
}

/** Chip de un cheque dentro de una celda del calendario; abre el diálogo de liquidar. */
function ChequeChip({ c }: { c: Cheque }) {
  const cobro = c.tipo === 'ingreso'
  const vencido = estaVencido(c.fechaVencimiento)
  return (
    <LiquidarChequeDialog
      cheque={c}
      trigger={
        <button
          type="button"
          title={`${c.contraparte ?? c.descripcion ?? 'Cheque'} · ${cobro ? 'a cobrar' : 'a pagar'}${c.banco ? ` · ${c.banco}` : ''}`}
          className={cn(
            'flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] font-bold transition-colors',
            cobro
              ? 'bg-field-soft text-field-deep hover:brightness-95'
              : 'bg-tierra-soft text-tierra hover:brightness-95',
            vencido && 'ring-1 ring-destructive/50',
          )}
        >
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              cobro ? 'bg-field-deep' : 'bg-tierra',
            )}
          />
          <span className="tnum truncate">
            {cobro ? '+' : '−'}
            {fmtCompact(c.monto)}
          </span>
          {c.esEcheq && (
            <span className="ml-auto text-[8.5px] font-bold uppercase opacity-70">
              e
            </span>
          )}
        </button>
      }
    />
  )
}

/** Calendario mensual de cheques pendientes por fecha de vencimiento. */
export function ChequesCalendario({ cheques }: { cheques: Cheque[] }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  const { semanas, sinFecha } = useMemo(() => {
    const porDia = new Map<number, Cheque[]>()
    const sin: Cheque[] = []
    for (const c of cheques) {
      if (!c.fechaVencimiento) {
        sin.push(c)
        continue
      }
      const [y, m, d] = c.fechaVencimiento.split('-').map(Number)
      if (y === year && m - 1 === month) {
        const arr = porDia.get(d) ?? []
        arr.push(c)
        porDia.set(d, arr)
      }
    }
    const offset = (new Date(year, month, 1).getDay() + 6) % 7 // lunes = 0
    const diasEnMes = new Date(year, month + 1, 0).getDate()
    type Celda = { dia: number; items: Cheque[] } | null
    const celdas: Celda[] = []
    for (let i = 0; i < offset; i++) celdas.push(null)
    for (let d = 1; d <= diasEnMes; d++)
      celdas.push({ dia: d, items: porDia.get(d) ?? [] })
    while (celdas.length % 7 !== 0) celdas.push(null)
    const sem: Celda[][] = []
    for (let i = 0; i < celdas.length; i += 7) sem.push(celdas.slice(i, i + 7))
    return { semanas: sem, sinFecha: sin }
  }, [cheques, year, month])

  const hoy = new Date()
  const esMesActual = hoy.getFullYear() === year && hoy.getMonth() === month
  const diaHoy = hoy.getDate()

  const mesLabel = cursor.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  })

  const botonNav =
    'flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-faint hover:text-ink'

  return (
    <Panel className="p-0">
      {/* Navegación */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <span className="font-heading text-[16px] font-bold text-ink">
          {mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className={botonNav}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(hoy.getFullYear(), hoy.getMonth(), 1))}
            className="h-8 rounded-lg border border-border bg-card px-3 text-[13px] font-semibold text-ink transition-colors hover:border-faint"
          >
            Hoy
          </button>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className={botonNav}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Encabezado de días */}
      <div className="grid grid-cols-7 border-b border-border">
        {DIAS.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[0.04em] text-faint"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grilla */}
      <div>
        {semanas.map((sem, i) => (
          <div
            key={i}
            className="grid grid-cols-7 border-b border-border/60 last:border-0"
          >
            {sem.map((cel, j) => (
              <div
                key={j}
                className={cn(
                  'min-h-[94px] border-r border-border/60 p-1.5 last:border-r-0',
                  !cel && 'bg-secondary/30',
                )}
              >
                {cel && (
                  <>
                    <div className="mb-1 flex justify-end">
                      <span
                        className={cn(
                          'flex size-6 items-center justify-center rounded-full text-[12px] font-semibold',
                          esMesActual && cel.dia === diaHoy
                            ? 'bg-field-deep text-white'
                            : 'text-muted-foreground',
                        )}
                      >
                        {cel.dia}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {cel.items.slice(0, 3).map((c) => (
                        <ChequeChip key={c.id} c={c} />
                      ))}
                      {cel.items.length > 3 && (
                        <span className="px-1 text-[10.5px] font-semibold text-faint">
                          +{cel.items.length - 3} más
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Sin fecha de vencimiento */}
      {sinFecha.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          <span className="text-[12px] font-semibold text-faint">
            Sin fecha de vencimiento:
          </span>
          {sinFecha.map((c) => (
            <ChequeChip key={c.id} c={c} />
          ))}
        </div>
      )}
    </Panel>
  )
}
