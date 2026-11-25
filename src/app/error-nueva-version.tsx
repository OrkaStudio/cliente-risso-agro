import { useEffect } from 'react'
import { useRouteError } from 'react-router-dom'
import { WHATSAPP_TROPERO } from '@/features/acceso/reglas'
import { PantallaAviso } from './pantalla-aviso'

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
    <PantallaAviso
      pantallaEntera
      titulo={deVersion ? 'Hay una versión nueva' : 'Algo no cargó'}
      texto={deVersion ? 'Troppero se actualizó mientras lo tenías abierto. Con recargar alcanza; no perdés nada.' : 'Tus datos están bien guardados. Probá de nuevo; si sigue pasando, avisanos y lo miramos.'}
      etiqueta={deVersion ? { texto: 'Troppero se actualizó', tono: 'trigo' } : { texto: 'Se trabó esta pantalla', tono: 'rojo' }}
      animo={deVersion ? 'festeja' : 'piensa'}
      subrayar={deVersion ? 'nueva' : 'cargó'}
      accion={deVersion ? 'Recargar' : 'Volver a intentar'}
      icono="Reintentar"
      onAccion={recargar}
      // El texto dice «avisanos»: el botón lo hace, con el mensaje ya escrito y la pantalla donde pasó.
      whatsapp={deVersion ? undefined : { texto: 'Avisarnos por WhatsApp', href: `https://wa.me/${WHATSAPP_TROPERO}?text=${encodeURIComponent(`Hola, se me trabó una pantalla de Troppero (${window.location.pathname}).`)}` }}
      secundaria={deVersion ? undefined : { texto: 'Ir al Inicio', onClick: () => window.location.assign('/') }}
    />
  )
}
