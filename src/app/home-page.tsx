import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Placeholder del Dashboard (D14). Se completa en próximos tracks.
 * Existe para tener una ruta protegida funcional que valide el flujo de auth.
 */
export function HomePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Inicio</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Scaffold listo. La sección de Hacienda llega en la Fase C de este
          track; el Dashboard (D14) y el resto del Modo Oficina, después.
        </CardContent>
      </Card>
    </div>
  )
}
