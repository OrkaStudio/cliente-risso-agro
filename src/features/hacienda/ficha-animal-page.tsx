import { Link, useParams } from 'react-router-dom'
import { useAnimal, useEventos, usePotreros } from '@/features/hacienda/hooks'
import {
  categoriaLabel,
  estadoLabel,
  sexoLabel,
  tipoEventoLabel,
} from '@/features/hacienda/labels'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  )
}

export function FichaAnimalPage() {
  const { id = '' } = useParams()
  const animal = useAnimal(id)
  const eventos = useEventos(id)
  const potreros = usePotreros()

  const potreroNombre =
    animal.data?.potrero_id && potreros.data
      ? (potreros.data.find((p) => p.id === animal.data?.potrero_id)?.nombre ??
        '—')
      : 'Sin asignar'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/hacienda" className="text-sm text-muted-foreground hover:underline">
          ← Hacienda
        </Link>
      </div>

      {animal.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : !animal.data ? (
        <p className="text-sm text-muted-foreground">Animal no encontrado.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="font-mono">
                Caravana {animal.data.caravana_rfid ?? '—'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Dato
                  label="Categoría"
                  value={animal.data.categoria ? categoriaLabel[animal.data.categoria] : '—'}
                />
                <Dato
                  label="Sexo"
                  value={animal.data.sexo ? sexoLabel[animal.data.sexo] : '—'}
                />
                <Dato
                  label="Estado"
                  value={animal.data.estado ? estadoLabel[animal.data.estado] : '—'}
                />
                <Dato label="Potrero" value={potreroNombre} />
                <Dato label="Origen" value={animal.data.origen ?? '—'} />
                <Dato
                  label="Nacimiento"
                  value={animal.data.fecha_nacimiento ?? '—'}
                />
                {animal.data.caravana_visual && (
                  <Dato label="Caravana visual" value={animal.data.caravana_visual} />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historial</CardTitle>
            </CardHeader>
            <CardContent>
              {eventos.isLoading ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : eventos.data && eventos.data.length > 0 ? (
                <ol className="space-y-3">
                  {eventos.data.map((ev) => (
                    <li key={ev.id} className="flex gap-3 text-sm">
                      <span className="w-24 shrink-0 text-muted-foreground">
                        {ev.fecha}
                      </span>
                      <span className="font-medium">{tipoEventoLabel[ev.tipo]}</span>
                      {ev.nota && (
                        <span className="text-muted-foreground">— {ev.nota}</span>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Sin eventos.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
