import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

/**
 * Aísla los fallos del mapa (Leaflet / Geoman) a su propio recuadro. Si el mapa
 * se cae —al cargar su chunk o al renderizar— el resto de la app sigue viva y
 * acá se muestra un aviso, en vez de blanquear toda la pantalla.
 */
export class MapErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[mapa] fallo contenido en la vista satelital:', error)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-[360px] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-secondary/40 p-6 text-center">
          <p className="text-sm font-semibold text-ink">No se pudo cargar el mapa</p>
          <p className="max-w-xs text-[12.5px] text-muted-foreground">
            El resto de la app sigue funcionando normalmente. Probá recargar la
            página.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-secondary"
          >
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
