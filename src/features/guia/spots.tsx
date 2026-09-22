import * as React from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import {
  anclaDestapada,
  dialogoAbierto,
  medirAncla,
  recortar,
  ubicarJunto,
  useAltoReal,
  type Rect,
} from '@/features/guia/burbuja'
import {
  useGuiasVistas,
  useMarcarVista,
  useMisionActiva,
  usePanelAbierto,
  usePendiente,
} from '@/features/guia/guia-store'
import { Orbe } from '@/features/guia/orbe'
import { seccionDeRuta } from '@/features/guia/secciones'
import { MAX_SPOTS, SPOTS } from '@/features/guia/spots-texto'

/**
 * Los puntitos del asistente: un punto lima que respira en la esquina de
 * cada panel nuevo. Tocarlo abre una línea; "Entendido" lo apaga para
 * siempre. Reemplaza al recorrido por sección (TASK-063).
 *
 * Se esconden mientras hay misión, invitación, panel o diálogo: el asistente
 * habla de a una cosa.
 */
export function Spots() {
  const location = useLocation()
  const seccion = seccionDeRuta(location.pathname)
  if (!seccion) return null
  return <SpotsDeSeccion key={seccion} />
}

type Punto = { ancla: string; rect: Rect }

function SpotsDeSeccion() {
  const vistas = useGuiasVistas()
  const mision = useMisionActiva()
  const panel = usePanelAbierto()
  const invitacionPendiente = usePendiente('recibimiento')
  const marcarVista = useMarcarVista()
  const [puntos, setPuntos] = React.useState<Punto[]>([])
  const [abierto, setAbierto] = React.useState<string | null>(null)

  const quieto = !mision && !panel && !invitacionPendiente && vistas.isSuccess
  const vistasSet = vistas.data

  React.useEffect(() => {
    if (!quieto || !vistasSet) {
      const t = setTimeout(() => setPuntos([]), 0)
      return () => clearTimeout(t)
    }
    const buscar = () => {
      if (dialogoAbierto()) {
        setPuntos([])
        return
      }
      // Orden del documento = orden de lectura; los primeros tres.
      const out: Punto[] = []
      document.querySelectorAll<HTMLElement>('[data-guia]').forEach((el) => {
        if (out.length >= MAX_SPOTS) return
        const ancla = el.getAttribute('data-guia') ?? ''
        if (!(ancla in SPOTS) || vistasSet.has(`spot.${ancla}`)) return
        const r = medirAncla(ancla)
        const rec = r ? recortar(r) : null
        if (rec && anclaDestapada(ancla, rec)) out.push({ ancla, rect: rec })
      })
      setPuntos(out)
    }
    const t = setTimeout(buscar, 900)
    const iv = setInterval(buscar, 1000)
    window.addEventListener('scroll', buscar, true)
    window.addEventListener('resize', buscar)
    return () => {
      clearTimeout(t)
      clearInterval(iv)
      window.removeEventListener('scroll', buscar, true)
      window.removeEventListener('resize', buscar)
    }
  }, [quieto, vistasSet])

  const activo = puntos.find((p) => p.ancla === abierto) ?? null
  const [capRef, capH] = useAltoReal<HTMLDivElement>(64)
  const pos = activo ? ubicarJunto(activo.rect, 300, capH) : null

  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {puntos.map((p) => (
          <motion.button
            key={p.ancla}
            type="button"
            aria-label={`Qué es esto: ${p.ancla}`}
            title="¿Qué es esto?"
            onClick={() => setAbierto((a) => (a === p.ancla ? null : p.ancla))}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1, left: p.rect.left + p.rect.width - 10, top: p.rect.top - 6 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="fixed z-[44] flex size-5 items-center justify-center rounded-full"
          >
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full bg-lima"
              animate={{ scale: [1, 1.9, 1.9], opacity: [0.45, 0, 0] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
            />
            <span className="relative size-3 rounded-full border-2 border-white bg-lima shadow-[0_1px_4px_rgba(0,0,0,0.25)]" />
          </motion.button>
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {activo && pos && (
          <motion.div
            key={`spot:${activo.ancla}`}
            ref={capRef}
            role="status"
            initial={{ opacity: 0, y: 6, left: pos.left, top: pos.top }}
            animate={{ opacity: 1, y: 0, left: pos.left, top: pos.top }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            className="fixed z-[45] flex w-[300px] max-w-[calc(100vw-24px)] items-start gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-3 shadow-[0_14px_44px_rgba(10,20,14,0.22)]"
          >
            <Orbe className="size-7 [&>svg]:size-3.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium leading-snug text-ink">
                {SPOTS[activo.ancla]}
              </p>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setAbierto(null)
                    marcarVista(`spot.${activo.ancla}`)
                  }}
                  className="rounded-full bg-secondary px-3 py-1 text-[12px] font-bold text-field-deep transition-colors hover:bg-field-soft"
                >
                  Entendido
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>,
    document.body,
  )
}
