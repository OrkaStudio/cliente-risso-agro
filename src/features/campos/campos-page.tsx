import { Link } from 'react-router-dom'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useCampos } from '@/features/campos/hooks'
import { CampoFormDialog } from '@/features/campos/campos-dialogs'
import { tipoCampoLabel } from '@/features/campos/labels'
import { Card, CardContent } from '@/components/ui/card'

export function CamposPage() {
  const empresa = useEmpresa()
  const campos = useCampos()
  const empresaId = empresa.data?.empresa_id ?? ''

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campos</h1>
        <CampoFormDialog empresaId={empresaId} triggerLabel="+ Nuevo campo" />
      </div>

      {campos.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : campos.error ? (
        <p className="text-sm text-destructive">
          Error: {(campos.error as Error).message}
        </p>
      ) : campos.data && campos.data.length > 0 ? (
        <div className="grid gap-3">
          {campos.data.map((c) => {
            const nPotreros = c.potrero?.[0]?.count ?? 0
            return (
              <Card key={c.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <Link
                      to={`/campos/${c.id}`}
                      className="text-lg font-medium hover:underline"
                    >
                      {c.nombre}
                    </Link>
                    <div className="text-sm text-muted-foreground">
                      {tipoCampoLabel[c.tipo]}
                      {c.hectareas != null && ` · ${c.hectareas} ha`}
                      {' · '}
                      {nPotreros} {nPotreros === 1 ? 'potrero' : 'potreros'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CampoFormDialog
                      empresaId={empresaId}
                      campo={c}
                      triggerLabel="Editar"
                      triggerVariant="outline"
                    />
                    <Link
                      to={`/campos/${c.id}`}
                      className="text-sm text-celeste-700 hover:underline"
                    >
                      Ver potreros →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No hay campos todavía. Creá el primero con “+ Nuevo campo”.
        </p>
      )}
    </div>
  )
}
