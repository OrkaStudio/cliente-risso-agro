import { useEffect } from 'react'
import { useRouteError } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

const RECARGA_KEY = 'risso.recarga-por-version'

/** Un chunk que ya no existe: la pestaña tiene un build viejo y se acaba de deployar otro. */
function esErrorDeVersion(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /dynamically imported module|Importing a module script failed|Loading chunk|Loading CSS chunk/i.test(msg)
}

/**
 * Pantalla de error de las rutas. El caso que importa es el del deploy con
 * la app abierta: el `index.html` viejo pide un chunk con el hash anterior,
 * que ya no está, y React Router muestra "Unexpected Application Error".
 * Acá se recarga sola UNA vez (la marca en sessionStorage evita el loop si
 * el problema es otro); si vuelve a fallar, lo dice en castellano con un
 * botón. Para cualquier otro error, lo mismo sin la recarga automática.
 */
export function ErrorNuevaVersion() {
  const error = useRouteError()
  const deVersion = esErrorDeVersion(error)

  useEffect(() => {
    if (!deVersion) return
    let yaRecargo = false
    try {
      yaRecargo = sessionStorage.getItem(RECARGA_KEY) === '1'
      if (!yaRecargo) sessionStorage.setItem(RECARGA_KEY, '1')
    } catch {
      /* sin storage: recargamos igual, una vez por render */
    }
    if (!yaRecargo) window.location.reload()
  }, [deVersion])

  function recargar() {
    try {
      sessionStorage.removeItem(RECARGA_KEY)
    } catch {
      /* nada */
    }
    window.location.reload()
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <RefreshCw className="size-8 text-muted-foreground" />
      <div>
        <p className="text-base font-semibold">
          {deVersion ? 'Hay una versión nueva de la app' : 'Algo salió mal'}
        </p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {deVersion
            ? 'Se actualizó mientras la tenías abierta. Con recargar alcanza; no perdés nada.'
            : 'Recargá la página. Si sigue pasando, avisanos.'}
        </p>
      </div>
      <Button onClick={recargar}>
        <RefreshCw className="size-4" /> Recargar
      </Button>
    </div>
  )
}
