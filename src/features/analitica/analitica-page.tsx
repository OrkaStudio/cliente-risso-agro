import { useMemo, useState } from 'react'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useMovimientos } from '@/features/analitica/hooks'
import {
  formatARS,
  gastosPorCategoria,
  porCampo,
  resumen,
  type Modo,
} from '@/features/analitica/compute'
import { CargarMovimientoDialog } from '@/features/analitica/cargar-movimiento-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

function Barra({ valor, max }: { valor: number; max: number }) {
  const pct = max > 0 ? Math.round((Math.abs(valor) / max) * 100) : 0
  return (
    <div className="h-2 w-full rounded bg-muted">
      <div
        className={cn('h-2 rounded', valor < 0 ? 'bg-destructive' : 'bg-primary')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function AnaliticaPage() {
  const empresa = useEmpresa()
  const empresaId = empresa.data?.empresa_id ?? ''
  const movs = useMovimientos()
  const [modo, setModo] = useState<Modo>('devengado')

  const data = useMemo(() => movs.data ?? [], [movs.data])
  const res = useMemo(() => resumen(data, modo), [data, modo])
  const campos = useMemo(() => porCampo(data, modo), [data, modo])
  const categorias = useMemo(() => gastosPorCategoria(data, modo), [data, modo])
  const maxCampo = Math.max(1, ...campos.map((c) => Math.abs(c.monto)))
  const maxCat = Math.max(1, ...categorias.map((c) => c.monto))

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Analítica</h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border p-0.5 text-sm">
            {(['devengado', 'caja'] as Modo[]).map((m) => (
              <button
                key={m}
                onClick={() => setModo(m)}
                className={cn(
                  'rounded px-3 py-1 capitalize',
                  modo === m
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <CargarMovimientoDialog empresaId={empresaId} />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {modo === 'devengado'
          ? 'Devengado: la economía real, sin importar cuándo entró/salió la plata.'
          : 'Caja: solo lo que ya se cobró o pagó de verdad.'}
      </p>

      {movs.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="py-4">
                <div className="text-xs text-muted-foreground">Ingresos</div>
                <div className="text-2xl font-semibold">
                  {formatARS(res.ingresos)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="text-xs text-muted-foreground">Gastos</div>
                <div className="text-2xl font-semibold">
                  {formatARS(res.gastos)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="text-xs text-muted-foreground">Resultado</div>
                <div
                  className={cn(
                    'text-2xl font-semibold',
                    res.resultado < 0 && 'text-destructive',
                  )}
                >
                  {formatARS(res.resultado)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resultado por campo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resultado por campo</CardTitle>
            </CardHeader>
            <CardContent>
              {campos.length > 0 ? (
                <div className="space-y-3">
                  {campos.map((c) => (
                    <div key={c.nombre} className="grid gap-1">
                      <div className="flex justify-between text-sm">
                        <span>{c.nombre}</span>
                        <span
                          className={cn(
                            'font-medium tabular-nums',
                            c.monto < 0 && 'text-destructive',
                          )}
                        >
                          {formatARS(c.monto)}
                        </span>
                      </div>
                      <Barra valor={c.monto} max={maxCampo} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin datos.</p>
              )}
            </CardContent>
          </Card>

          {/* Gastos por categoría */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gastos por categoría</CardTitle>
            </CardHeader>
            <CardContent>
              {categorias.length > 0 ? (
                <div className="space-y-3">
                  {categorias.map((c) => (
                    <div key={c.nombre} className="grid gap-1">
                      <div className="flex justify-between text-sm">
                        <span>{c.nombre}</span>
                        <span className="font-medium tabular-nums">
                          {formatARS(c.monto)}
                        </span>
                      </div>
                      <Barra valor={c.monto} max={maxCat} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin gastos.</p>
              )}
            </CardContent>
          </Card>

          {/* Movimientos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Movimientos{data.length ? ` (${data.length})` : ''}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Fecha</th>
                        <th className="py-2 pr-4 font-medium">Categoría</th>
                        <th className="py-2 pr-4 font-medium">Campo</th>
                        <th className="py-2 pr-4 font-medium">Estado</th>
                        <th className="py-2 text-right font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((m) => (
                        <tr key={m.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">{m.fecha_devengo}</td>
                          <td className="py-2 pr-4">
                            {m.categoria?.nombre ?? '—'}
                          </td>
                          <td className="py-2 pr-4">{m.campo?.nombre ?? '—'}</td>
                          <td className="py-2 pr-4">{m.estado}</td>
                          <td
                            className={cn(
                              'py-2 text-right tabular-nums',
                              m.tipo === 'gasto' && 'text-destructive',
                            )}
                          >
                            {m.tipo === 'gasto' ? '−' : '+'}
                            {formatARS(Number(m.monto))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Todavía no cargaste movimientos.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
