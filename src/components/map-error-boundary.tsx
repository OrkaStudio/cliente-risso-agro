import { Component, type ReactNode } from 'react'
import { Boton } from '@/components/tropero/boton'

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
        <div className="flex min-h-[360px] w-full flex-col items-center justify-center gap-3 rounded-[24px] border border-borde bg-superficie-hundida p-6 text-center">
          <p className="text-[17px] font-bold text-texto">No se pudo cargar el mapa</p>
          <p className="max-w-xs text-[15px] leading-snug text-texto-suave">El resto de la app sigue andando. Probá recargar la página.</p>
          <Boton tipo="secundario" icono="Reintentar" onClick={() => window.location.reload()}>
            Recargar
          </Boton>
        </div>
      )
    }
    return this.props.children
  }
}
