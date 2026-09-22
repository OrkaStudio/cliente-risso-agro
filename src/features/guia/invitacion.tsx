import * as React from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { useAuth } from '@/features/auth/auth-context'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { dialogoAbierto } from '@/features/guia/burbuja'
import { useEstadoPuestaAPunto } from '@/features/guia/checklist'
import { type Resumen } from '@/features/guia/estado'
import {
  empezarMision,
  useMarcarVista,
  useMisionActiva,
  usePanelAbierto,
  usePendiente,
} from '@/features/guia/guia-store'
import { proximaMision, type Mision } from '@/features/guia/misiones'
import { nombreDe } from '@/features/guia/nombre-usuario'
import { Orbe } from '@/features/guia/orbe'
import { saludo } from '@/features/guia/saludo'
import { seccionDeRuta } from '@/features/guia/secciones'

/**
 * La invitación de llegada — lo primero que dice el asistente después del
 * onboarding, UNA vez por persona (`recibimiento` en guia_vista). Sin velo:
 * una burbuja arriba del orbe, la página entera detrás.
 *
 * Sincera y corta: qué hay cargado, qué propone, cuánto cuesta y qué gana.
 * "Dale" arranca la primera misión; "Después" la guarda sin culpa (queda en
 * la pastilla y en el panel). Sin misión que aplique, saluda y se va.
 */
export function Invitacion() {
  const location = useLocation()
  const seccion = seccionDeRuta(location.pathname)
  const pendiente = usePendiente('recibimiento')
  const estado = useEstadoPuestaAPunto()
  const empresa = useEmpresa()
  const { user } = useAuth()
  const marcarVista = useMarcarVista()
  const mision = useMisionActiva()
  const panel = usePanelAbierto()

  const listo = seccion !== null && estado.isSuccess && empresa.isSuccess
  const puede = listo && pendiente && !mision && !panel

  // Un respiro tras llegar (la página recién carga sus chunks) y nunca
  // encima de un diálogo.
  const [visible, setVisible] = React.useState(false)
  React.useEffect(() => {
    if (!puede) {
      const t = setTimeout(() => setVisible(false), 0)
      return () => clearTimeout(t)
    }
    let t: ReturnType<typeof setTimeout>
    const intentar = () => {
      if (dialogoAbierto()) {
        t = setTimeout(intentar, 1500)
        return
      }
      setVisible(true)
    }
    t = setTimeout(intentar, 1100)
    return () => clearTimeout(t)
  }, [puede])

  const resumen = estado.data?.resumen
  const proxima = resumen ? proximaMision(resumen) : null
  const nombre = nombreDe(user?.user_metadata)
  const nombreEmpresa = empresa.data?.empresa?.nombre ?? null

  const responder = (empezar: boolean) => {
    setVisible(false)
    marcarVista('recibimiento')
    if (empezar && proxima) setTimeout(() => empezarMision(proxima.id), 250)
  }

  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {visible && resumen && (
          <motion.div
            key="invitacion"
            role="dialog"
            aria-label="Asistente"
            initial={{ opacity: 0, y: 14, scale: 0.97, transformOrigin: 'bottom right' }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 220, damping: 26 }}
            className="fixed bottom-[86px] right-4 z-[46] w-[340px] max-w-[calc(100vw-32px)] rounded-[20px] border border-border bg-card p-4 shadow-[0_18px_54px_rgba(10,20,14,0.26)]"
          >
            <div className="flex items-start gap-3">
              <Orbe />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold leading-snug text-ink">
                  {saludo(nombre, nombreEmpresa, resumen)}
                </p>
                {proxima ? (
                  <Propuesta mision={proxima} resumen={resumen} />
                ) : (
                  <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
                    Está todo cargado. Si te trabás con algo, tocá el orbe y te llevo.
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2 pl-11">
              <button
                type="button"
                onClick={() => responder(false)}
                className="rounded-full px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-ink"
              >
                {proxima ? 'Después' : 'Cerrar'}
              </button>
              {proxima && (
                <button
                  type="button"
                  onClick={() => responder(true)}
                  className="rounded-full bg-field-deep px-4 py-1.5 text-[13px] font-bold text-white shadow-[0_2px_10px_rgba(11,88,55,0.35)] transition-opacity hover:opacity-90"
                >
                  Dale
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>,
    document.body,
  )
}

function Propuesta({ mision, resumen }: { mision: Mision; resumen: Resumen }) {
  const inv = mision.invitacion(resumen)
  return (
    <>
      <p className="mt-1.5 text-[14px] leading-snug text-ink">
        {inv.pregunta}{' '}
        <span className="text-muted-foreground">
          {inv.minutos === 1 ? 'Es un minuto.' : `Son ${inv.minutos} minutos.`}
        </span>
      </p>
      <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{inv.porQue}</p>
    </>
  )
}
