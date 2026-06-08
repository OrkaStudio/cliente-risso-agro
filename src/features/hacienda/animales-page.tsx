import { Link } from 'react-router-dom'
import { useAnimales, useStockPorPotrero } from '@/features/hacienda/hooks'
import { categoriaLabel, estadoLabel, sexoLabel } from '@/features/hacienda/labels'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function AnimalesPage() {
  const animales = useAnimales()
  const stock = useStockPorPotrero()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Hacienda</h1>
        <Link to="/hacienda/nuevo" className={buttonVariants()}>
          + Nuevo animal
        </Link>
      </div>

      {/* Stock por potrero */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stock por potrero</CardTitle>
        </CardHeader>
        <CardContent>
          {stock.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : stock.data && stock.data.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {stock.data.map((s) => (
                <div
                  key={s.potrero_id ?? 'sin'}
                  className="rounded-lg border px-4 py-2"
                >
                  <div className="text-xs text-muted-foreground">{s.nombre}</div>
                  <div className="text-xl font-semibold">{s.cabezas}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Todavía no hay animales activos asignados a un potrero.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Lista de animales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Animales{animales.data ? ` (${animales.data.length})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {animales.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : animales.error ? (
            <p className="text-sm text-destructive">
              Error al cargar: {(animales.error as Error).message}
            </p>
          ) : animales.data && animales.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Caravana</th>
                    <th className="py-2 pr-4 font-medium">Categoría</th>
                    <th className="py-2 pr-4 font-medium">Sexo</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {animales.data.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono">
                        {a.caravana_rfid ?? '—'}
                      </td>
                      <td className="py-2 pr-4">
                        {a.categoria ? categoriaLabel[a.categoria] : '—'}
                      </td>
                      <td className="py-2 pr-4">
                        {a.sexo ? sexoLabel[a.sexo] : '—'}
                      </td>
                      <td className="py-2 pr-4">
                        {a.estado ? estadoLabel[a.estado] : '—'}
                      </td>
                      <td className="py-2 text-right">
                        {a.id && (
                          <Link
                            to={`/hacienda/${a.id}`}
                            className="text-celeste-700 hover:underline"
                          >
                            Ver ficha
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay animales todavía. Empezá con “+ Nuevo animal”.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
