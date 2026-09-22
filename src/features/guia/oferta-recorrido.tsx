import * as React from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEstadoPuestaAPunto } from '@/features/guia/checklist'
import { Orbe } from '@/features/guia/guia'
import {
  claveRecorrido,
  pedirGuia,
  useEscenaActiva,
  useMarcarVista,
  usePanelAbierto,
  usePendiente,
} from '@/features/guia/guia-store'
import { NOMBRE_SECCION, seccionDeRuta } from '@/features/guia/pasos'

/**
 * Chip que OFRECE el recorrido de la sección la primera vez que el productor
 * entra (TASK-063). Reemplaza el auto-arranque del velo: un aviso suave al
 * lado de la burbuja del asistente, que se acepta ("Dale") o se descarta (×).
 *
 * - Aceptar lanza el recorrido; cerrarlo lo marca visto (lo hace `Guia`).
 * - Descartar marca visto sin recorrer.
 * - Ignorarlo (navegar a otra sección) no marca nada: se vuelve a ofrecer la
 *   próxima vez, que es inofensivo.
 * - No aparece con una escena activa (recibimiento o recorrido), con el
 *   panel abierto, ni hasta saber qué hay en la empresa.
 */
export function OfertaRecorrido() {
  const location = useLocation()
  const seccion = seccionDeRuta(location.pathname)
  if (!seccion) return null
  // key por sección: cambiar de sección reinicia el retardo y el estado.
  return <OfertaSeccion key={seccion} seccion={seccion} />
}

function OfertaSeccion({ seccion }: { seccion: keyof typeof NOMBRE_SECCION }) {
  const pendiente = usePendiente(claveRecorrido(seccion))
  const escena = useEscenaActiva()
  const panel = usePanelAbierto()
  const estado = useEstadoPuestaAPunto()
  const marcarVista = useMarcarVista()

  // Un respiro después de llegar, y uno más largo después de que termine
  // una escena (el recibimiento acaba de decir "lo que sigue": que lo haga
  // antes de ofrecerle otra cosa). Con un diálogo abierto (el catastro que
  // el CTA acaba de abrir) el chip espera a que lo cierre: nunca encima.
  const puede = pendiente && !escena && !panel && estado.isSuccess
  const [visible, setVisible] = React.useState(false)
  const huboEscena = React.useRef(false)
  React.useEffect(() => {
    if (escena) huboEscena.current = true
  }, [escena])
  React.useEffect(() => {
    if (!puede) {
      const t = setTimeout(() => setVisible(false), 0)
      return () => clearTimeout(t)
    }
    let t: ReturnType<typeof setTimeout>
    const intentar = () => {
      // Base UI (shadcn) marca el velo del diálogo con data-slot; los
      // diálogos propios (campo-fecha) sólo llevan role. Cualquiera de los
      // dos cuenta; la escena del asistente no (se lleva por `escena`).
      if (
        document.querySelector(
          '[data-slot="dialog-overlay"], [role="dialog"]:not([aria-label^="Guía de"])',
        )
      ) {
        t = setTimeout(intentar, 2000)
        return
      }
      setVisible(true)
    }
    t = setTimeout(intentar, huboEscena.current ? 5000 : 1400)
    return () => clearTimeout(t)
  }, [puede])

  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {visible && (
          <motion.div
            key="oferta"
            role="status"
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            // Encima de la burbuja (54px + 16px de margen), pegado a la derecha
            // y debajo de los diálogos (z-50).
            className="fixed bottom-[82px] right-4 z-[41] flex items-center gap-2.5 rounded-full border border-border bg-card py-1.5 pl-2 pr-1.5 shadow-[0_10px_36px_rgba(10,20,14,0.22)]"
          >
            <Orbe />
            <span className="text-[13px] font-semibold text-ink">
              ¿Te muestro {NOMBRE_SECCION[seccion]}?
            </span>
            <button
              type="button"
              onClick={() => {
                setVisible(false)
                pedirGuia()
              }}
              className="rounded-full bg-field-deep px-3.5 py-1.5 text-[12.5px] font-bold text-white shadow-[0_2px_10px_rgba(11,88,55,0.35)] transition-opacity hover:opacity-90"
            >
              Dale
            </button>
            <button
              type="button"
              onClick={() => {
                setVisible(false)
                marcarVista(claveRecorrido(seccion))
              }}
              aria-label="Ahora no"
              title="Ahora no"
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>,
    document.body,
  )
}
