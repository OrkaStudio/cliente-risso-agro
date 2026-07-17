import * as React from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { ChevronRight, Route, Sparkles, X } from 'lucide-react'
import { Orbe, TextoStream } from '@/features/guia/guia'
import {
  abrirPanel,
  cerrarPanel,
  pedirGuia,
  usePanelAbierto,
} from '@/features/guia/guia-store'
import { ejecutarEnAncla } from '@/features/guia/ejecutar'
import {
  CATEGORIAS,
  FICHAS,
  type CategoriaFicha,
  type Ficha,
} from '@/features/guia/fichas'
import { seccionDeRuta, type SeccionGuia } from '@/features/guia/pasos'
import { cn } from '@/lib/utils'

/**
 * Panel del Asistente — SOLO preguntas (fichas guionadas por chips; el chat
 * con modelo es la Fase 2 del spec). La puesta a punto vive aparte, en su
 * smart checklist flotante (features/guia/puesta-a-punto) — decisión de Lau:
 * el productor se centra en la misión sin información alrededor.
 * Spec: [[clientes/risso-agro/especificaciones/2026-07-16-asistente-conversacional-operativo]].
 */

type Burbuja = { rol: 'user' | 'ia'; texto: string; accion?: Ficha['accion'] }

/** Categoría inicial según dónde está parado el usuario. */
const CATEGORIA_DE_SECCION: Record<SeccionGuia, CategoriaFicha> = {
  inicio: 'hacienda',
  hacienda: 'hacienda',
  campos: 'campos',
  analitica: 'plata',
  agenda: 'plata',
}

export function AsistentePanel() {
  const abierto = usePanelAbierto()
  const navigate = useNavigate()
  const location = useLocation()
  // "Recorrer esta sección" solo donde hay recorrido (las 5 secciones).
  const seccion = seccionDeRuta(location.pathname)
  const hayRecorrido = seccion !== null
  const [hilo, setHilo] = React.useState<Burbuja[]>([])
  // Categoría activa del menú de preguntas — arranca en la de la sección actual.
  const [categoria, setCategoria] = React.useState<CategoriaFicha>(() =>
    seccion ? CATEGORIA_DE_SECCION[seccion] : 'hacienda',
  )
  const hiloRef = React.useRef<HTMLDivElement>(null)

  // Autoscroll del hilo al agregar burbujas.
  React.useEffect(() => {
    const el = hiloRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [hilo])

  const responder = (f: Ficha) => {
    setHilo((h) => [
      ...h,
      { rol: 'user', texto: f.chip },
      { rol: 'ia', texto: f.respuesta, accion: f.accion },
    ])
  }

  const verRecorrido = () => {
    cerrarPanel()
    // El overlay del recorrido reacciona al pedido (misma maquinaria del botón).
    setTimeout(() => pedirGuia(), 150)
  }

  return createPortal(
    <MotionConfig reducedMotion="user">
      {/* ===== Burbuja flotante (launcher, abajo a la derecha) ===== */}
      <AnimatePresence>
        {!abierto && (
          <motion.button
            key="burbuja"
            type="button"
            onClick={abrirPanel}
            title="Abrí el asistente"
            aria-label="Abrí el asistente"
            initial={{ opacity: 0, scale: 0.6, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 14 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 380, damping: 24 }}
            className="fixed bottom-4 right-4 z-[72] flex size-[54px] items-center justify-center rounded-full shadow-[0_12px_38px_rgba(10,20,14,0.35)]"
          >
            {/* Anillo degradé girando — la identidad del asistente, en grande */}
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  'conic-gradient(from 0deg, var(--field), var(--lima), var(--sky), var(--field))',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 5, ease: 'linear', repeat: Infinity }}
            />
            {/* Ping suave que invita sin gritar */}
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full bg-field"
              animate={{ scale: [1, 1.35], opacity: [0.35, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
            />
            <span className="absolute inset-[3px] rounded-full bg-field-deep" />
            <Sparkles className="relative size-[22px] text-white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ===== Panel de chat, anclado a la burbuja ===== */}
      <AnimatePresence>
        {abierto && (
          <>
            {/* Click afuera cierra (sin velo: el panel convive con la página). */}
            <div className="fixed inset-0 z-[70]" onClick={cerrarPanel} />
            <motion.aside
              initial={{ opacity: 0, y: 40, scale: 0.92, transformOrigin: 'bottom right' }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="fixed bottom-4 right-4 z-[75] flex h-[600px] max-h-[calc(100vh-32px)] w-[390px] max-w-[calc(100vw-28px)] flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_24px_70px_rgba(10,20,14,0.4)]"
              role="dialog"
              aria-label="Asistente"
            >
              <div className="h-[3px] w-full shrink-0 bg-gradient-to-r from-field via-lima to-sky" />

              {/* Header */}
              <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
                <Orbe />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-[14px] font-bold text-ink">Asistente</div>
                  <div className="truncate text-[10px] font-bold uppercase tracking-[0.11em] text-faint">
                    Preguntame y te llevo
                  </div>
                </div>
                <button
                  type="button"
                  onClick={cerrarPanel}
                  aria-label="Cerrar el asistente"
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* ===== Hilo ===== */}
              <div ref={hiloRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                <div className="max-w-[88%] self-start rounded-2xl rounded-bl-md bg-secondary px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink">
                  ¡Buenas! Tocá una pregunta y te la respondo al toque. 👇
                </div>

                {hilo.map((b, i) =>
                  b.rol === 'user' ? (
                    <div
                      key={i}
                      className="max-w-[88%] self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[13.5px] leading-relaxed text-primary-foreground"
                    >
                      {b.texto}
                    </div>
                  ) : (
                    <div
                      key={i}
                      className="max-w-[88%] self-start rounded-2xl rounded-bl-md bg-secondary px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink"
                    >
                      <TextoStream texto={b.texto} />
                      {b.accion && (
                        <button
                          type="button"
                          onClick={() => {
                            const a = b.accion!
                            cerrarPanel()
                            navigate(a.ruta)
                            ejecutarEnAncla(a.ancla)
                          }}
                          className="mt-2.5 w-full rounded-full bg-field-deep px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_2px_10px_rgba(11,88,55,0.35)] transition-opacity hover:opacity-90"
                        >
                          {b.accion.label}
                        </button>
                      )}
                    </div>
                  ),
                )}
              </div>

              {/* ===== Menú de preguntas por categoría ===== */}
              <div className="shrink-0 border-t border-border pb-3 pt-3">
                <div className="mb-2 flex items-center gap-1.5 px-4">
                  {CATEGORIAS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoria(c.id)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors',
                        categoria === c.id
                          ? 'bg-field-deep text-white shadow-[0_2px_8px_rgba(11,88,55,0.3)]'
                          : 'bg-secondary text-muted-foreground hover:text-ink',
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <motion.div
                  key={categoria}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="px-4"
                >
                  {FICHAS.filter((f) => f.categoria === categoria).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => responder(f)}
                      className="group flex w-full items-center gap-2 border-b border-border/60 py-2 text-left text-[13px] font-medium text-ink transition-colors last:border-0 hover:text-field-deep"
                    >
                      <span className="min-w-0 flex-1">{f.chip}</span>
                      <ChevronRight className="size-3.5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-field-deep" />
                    </button>
                  ))}
                  {hayRecorrido && (
                    <button
                      type="button"
                      onClick={verRecorrido}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-border bg-card py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-faint hover:text-ink"
                    >
                      <Route className="size-3.5" />
                      Recorrer esta sección con el asistente
                    </button>
                  )}
                </motion.div>

                <p className="mt-2 px-4 text-center text-[10px] text-faint">
                  El asistente nunca carga ni mueve nada sin tu confirmación.
                </p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </MotionConfig>,
    document.body,
  )
}
