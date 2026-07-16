import * as React from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Check, Route, Smartphone, WifiOff, X } from 'lucide-react'
import { Orbe, TextoStream } from '@/features/guia/guia'
import {
  cerrarPanel,
  pedirGuia,
  usePanelAbierto,
} from '@/features/guia/guia-store'
import { useChecklist, type ItemChecklist } from '@/features/guia/checklist'
import { FICHAS, type Ficha } from '@/features/guia/fichas'
import { seccionDeRuta } from '@/features/guia/pasos'
import { cn } from '@/lib/utils'

/**
 * Panel del Asistente — Fase 1 (sin IA). La misión arriba: checklist de
 * puesta a punto derivado de la BASE (los ticks los marca la realidad de los
 * datos). Abajo, fichas guionadas por chips. El chat con modelo es Fase 2.
 * Spec: [[clientes/risso-agro/especificaciones/2026-07-16-asistente-conversacional-operativo]].
 */

/** Navega (si hace falta) y clickea el ancla cuando aparece — la página
 *  destino puede ser un chunk lazy, así que se reintenta un ratito. */
function ejecutarEnAncla(ancla: string | null) {
  if (!ancla) return
  let intentos = 0
  const tick = () => {
    const el = document.querySelector<HTMLElement>(`[data-guia="${ancla}"]`)
    if (el) {
      const btn =
        el.tagName === 'BUTTON'
          ? el
          : (el.querySelector<HTMLElement>('button, a') ?? el)
      btn.click()
      return
    }
    if (++intentos < 12) setTimeout(tick, 200)
  }
  setTimeout(tick, 150)
}

type Burbuja = { rol: 'user' | 'ia'; texto: string; accion?: Ficha['accion'] }

export function AsistentePanel() {
  const abierto = usePanelAbierto()
  const navigate = useNavigate()
  const location = useLocation()
  const checklist = useChecklist()
  // "Ver el recorrido" solo donde hay recorrido (las 5 secciones principales).
  const hayRecorrido = seccionDeRuta(location.pathname) !== null
  const [hilo, setHilo] = React.useState<Burbuja[]>([])
  const hiloRef = React.useRef<HTMLDivElement>(null)

  const items = checklist.data ?? []
  const hechos = items.filter((i) => i.hecho).length
  const completo = items.length > 0 && hechos === items.length
  const pendientes = items.filter((i) => !i.hecho)

  // Autoscroll del hilo al agregar burbujas.
  React.useEffect(() => {
    const el = hiloRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [hilo])

  const irA = (item: ItemChecklist) => {
    cerrarPanel()
    navigate(item.ruta)
    ejecutarEnAncla(item.accion)
  }

  const responder = (f: Ficha) => {
    setHilo((h) => [
      ...h,
      { rol: 'user', texto: f.chip },
      { rol: 'ia', texto: f.respuesta, accion: f.accion },
    ])
  }

  const verRecorrido = () => {
    cerrarPanel()
    // El overlay del recorrido reacciona al pedido (misma maquinaria del botón viejo).
    setTimeout(() => pedirGuia(), 150)
  }

  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {abierto && (
          <>
            {/* Click afuera cierra (sin velo: el panel convive con la página). */}
            <div className="fixed inset-0 z-[70]" onClick={cerrarPanel} />
            <motion.aside
              initial={{ x: 440, opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 440, opacity: 0.6 }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              className="fixed bottom-3.5 right-3.5 top-3.5 z-[75] flex w-[400px] max-w-[calc(100vw-28px)] flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_24px_70px_rgba(10,20,14,0.4)]"
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
                    Te ayudo a trabajar la página
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

              {/* ===== La misión: puesta a punto (estado real de la base) ===== */}
              {!completo && (
                <div className="shrink-0 border-b border-border bg-[#fbfcfa] px-4 pb-3 pt-3.5">
                  <div className="flex items-baseline gap-2">
                    <div className="text-[13px] font-bold text-ink">Tu web, lista</div>
                    <div className="tnum ml-auto text-[11px] font-bold text-field-deep">
                      {checklist.isSuccess ? `${hechos} de ${items.length}` : '…'}
                    </div>
                  </div>
                  <div className="mb-2.5 mt-1.5 h-[5px] overflow-hidden rounded-full bg-border">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-field to-lima"
                      initial={false}
                      animate={{
                        width: items.length
                          ? `${(hechos / items.length) * 100}%`
                          : '0%',
                      }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>

                  {checklist.isError ? (
                    <div className="flex items-center gap-2 py-1 text-[12px] text-muted-foreground">
                      <WifiOff className="size-3.5" />
                      Sin conexión — el checklist se actualiza cuando vuelva la señal.
                    </div>
                  ) : (
                    items.map((item) => (
                      <div key={item.id} className="flex items-center gap-2.5 py-[5px]">
                        <span
                          className={cn(
                            'flex size-[19px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
                            item.hecho
                              ? 'border-field bg-field text-white'
                              : 'border-faint',
                          )}
                        >
                          {item.hecho && <Check className="size-3" strokeWidth={3} />}
                        </span>
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-[12.5px]',
                            item.hecho
                              ? 'text-faint line-through'
                              : 'font-medium text-ink',
                          )}
                        >
                          {item.titulo}
                        </span>
                        {!item.hecho &&
                          (item.movil ? (
                            <span className="flex shrink-0 items-center gap-1 text-[10.5px] text-faint">
                              <Smartphone className="size-3" /> desde tu celular
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => irA(item)}
                              className="shrink-0 rounded-full border border-field px-2.5 py-[3px] text-[11.5px] font-bold text-field-deep transition-colors hover:bg-field-soft"
                            >
                              Ir
                            </button>
                          ))}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ===== Hilo de fichas ===== */}
              <div ref={hiloRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                <div className="max-w-[88%] self-start rounded-2xl rounded-bl-md bg-secondary px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink">
                  {completo
                    ? '¡Tu web está lista! Preguntame lo que necesites con los botones de abajo.'
                    : checklist.isSuccess && pendientes.length > 0
                      ? `¡Buenas! Vamos a dejar tu web lista. Te falta: ${pendientes
                          .map((p) => p.titulo.toLowerCase())
                          .join(', ')}. Tocá «Ir» en cualquier paso y te llevo.`
                      : 'Tocá un paso de arriba y te llevo, o preguntame con los botones de abajo.'}
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

              {/* ===== Chips (fichas guionadas — la IA llega en Fase 2) ===== */}
              <div className="shrink-0 border-t border-border px-4 pb-3.5 pt-3">
                <div className="flex flex-wrap gap-1.5">
                  {FICHAS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => responder(f)}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-field-deep transition-colors hover:border-field hover:bg-field-soft"
                    >
                      {f.chip}
                    </button>
                  ))}
                  {hayRecorrido && (
                    <button
                      type="button"
                      onClick={verRecorrido}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-faint hover:text-ink"
                    >
                      <Route className="size-3.5" />
                      Ver el recorrido de esta sección
                    </button>
                  )}
                </div>
                <p className="mt-2.5 text-center text-[10.5px] text-faint">
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
