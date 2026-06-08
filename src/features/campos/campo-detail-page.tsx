import { Link, useParams } from 'react-router-dom'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useCampo, usePotreros } from '@/features/campos/hooks'
import { PotreroFormDialog } from '@/features/campos/campos-dialogs'
import { estadoCicloLabel, tipoCampoLabel } from '@/features/campos/labels'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function CampoDetailPage() {
  const { id = '' } = useParams()
  const empresa = useEmpresa()
  const campo = useCampo(id)
  const potreros = usePotreros(id)
  const empresaId = empresa.data?.empresa_id ?? ''

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/campos" className="text-sm text-muted-foreground hover:underline">
          ← Campos
        </Link>
      </div>

      {campo.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : !campo.data ? (
        <p className="text-sm text-muted-foreground">Campo no encontrado.</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{campo.data.nombre}</h1>
              <p className="text-sm text-muted-foreground">
                {tipoCampoLabel[campo.data.tipo]}
                {campo.data.hectareas != null && ` · ${campo.data.hectareas} ha`}
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Potreros</CardTitle>
                <PotreroFormDialog
                  empresaId={empresaId}
                  campoId={id}
                  triggerLabel="+ Nuevo potrero"
                />
              </div>
            </CardHeader>
            <CardContent>
              {potreros.isLoading ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : potreros.data && potreros.data.length > 0 ? (
                <div className="divide-y">
                  {potreros.data.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <div className="font-medium">{p.nombre}</div>
                        <div className="text-sm text-muted-foreground">
                          {estadoCicloLabel[p.estado_ciclo]}
                          {p.hectareas != null && ` · ${p.hectareas} ha`}
                        </div>
                      </div>
                      <PotreroFormDialog
                        empresaId={empresaId}
                        campoId={id}
                        potrero={p}
                        triggerLabel="Editar"
                        triggerVariant="outline"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Este campo no tiene potreros todavía.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
