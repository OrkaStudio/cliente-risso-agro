import * as React from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import {
  abrirPanel,
  guiaVista,
  marcarGuiaVista,
  useGuiaPedida,
} from '@/features/guia/guia-store'
import {
  GUIAS,
  seccionDeRuta,
  type PasoGuia,
  type SeccionGuia,
} from '@/features/guia/pasos'
import { rootZoom } from '@/lib/zoom'
import { cn } from '@/lib/utils'

/**
 * Guía asistida por sección (tour de coach marks sobre la UI real).
 *
 * Implementación propia, sin lib de tours: driver.js/react-joyride posicionan
 * con getBoundingClientRect sin dividir por el zoom global 1.06 → spotlight
 * corrido ([[lecciones/2026-06-29-zoom-global-gotchas]] gotcha 2). Acá todas
 * las coordenadas se dividen por rootZoom(), como el Dropdown del sistema.
 *
 * - Auto-arranca la primera vez que el usuario entra a cada sección
 *   (persistencia en localStorage por usuario+sección).
 * - El botón "Guía" de la topbar la relanza cuando quieran.
 * - Un paso cuyo ancla no está en el DOM (panel que no renderiza sin datos)
 *   se saltea solo — la guía funciona con la sección vacía.
 * - Navegar a otra sección desmonta la guía por `key` SIN marcarla vista:
 *   vuelve a ofrecerse la próxima vez que entren a esa sección.
 */

type Rect = { top: number; left: number; width: number; height: number }

/** Margen del spotlight alrededor del elemento resaltado. */
const PAD = 6
/** Ancho máximo de la tarjeta (px, en espacio zoomeado). */
const CARD_W = 380
/** Alto estimado de la burbuja para decidir arriba/abajo antes de medirla.
 *  Con header + texto + CTA ronda los 250px — quedarse corto acá hacía que
 *  eligiera "abajo" sin lugar y la tarjeta se cortara con el borde. */
const CARD_H_EST = 260
const MARGEN = 16
/** Color del velo que oscurece lo que no es el paso actual. */
const VELO = 'rgba(13, 24, 17, 0.62)'

function medirAncla(ancla: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-guia="${ancla}"]`)
  if (!el) return null
  const z = rootZoom()
  const r = el.getBoundingClientRect()
  // Un wrapper de un componente que no renderizó nada (sección vacía) queda
  // con alto ~0: no hay nada que señalar → el paso se saltea.
  if (r.width < 2 || r.height < 2) return null
  return {
    top: r.top / z,
    left: r.left / z,
    width: r.width / z,
    height: r.height / z,
  }
}

function anclaResoluble(paso: PasoGuia): boolean {
  if (paso.ancla === null) return true
  return medirAncla(paso.ancla) !== null
}

export function Guia() {
  const { user } = useAuth()
  const location = useLocation()
  const seccion = seccionDeRuta(location.pathname)
  if (!seccion || !user) return null
  // key por sección+usuario: cambiar de sección desmonta y resetea todo el
  // estado del tour sin efectos de limpieza manual.
  return (
    <GuiaSeccion
      key={`${seccion}:${user.id}`}
      seccion={seccion}
      userId={user.id}
    />
  )
}

function GuiaSeccion({
  seccion,
  userId,
}: {
  seccion: SeccionGuia
  userId: string
}) {
  const guia = GUIAS[seccion]
  const pedida = useGuiaPedida()

  // Índice del paso activo; null = guía cerrada.
  const [idx, setIdx] = React.useState<number | null>(null)
  // Última medición, junto con el ancla a la que pertenece: un paso nuevo con
  // otra ancla invalida la medición vieja por derivación (sin setState sync).
  const [medida, setMedida] = React.useState<{ ancla: string; rect: Rect } | null>(
    null,
  )

  const paso = idx !== null ? guia.pasos[idx] : null
  const rect =
    paso && paso.ancla !== null && medida?.ancla === paso.ancla
      ? medida.rect
      : null

  const cerrar = React.useCallback(() => {
    setIdx(null)
    marcarGuiaVista(seccion, userId)
  }, [seccion, userId])

  // Navegación salteando pasos cuyo ancla no existe (sección vacía).
  const ir = React.useCallback(
    (desde: number, dir: 1 | -1) => {
      let i = desde + dir
      while (i >= 0 && i < guia.pasos.length && !anclaResoluble(guia.pasos[i])) {
        i += dir
      }
      if (i < 0) return
      if (i >= guia.pasos.length) {
        cerrar()
        return
      }
      setIdx(i)
    },
    [guia, cerrar],
  )

  const abrir = React.useCallback(() => {
    const i = guia.pasos.findIndex(anclaResoluble)
    if (i >= 0) setIdx(i)
  }, [guia])

  // Primera visita a la sección: auto-arranca tras dejar renderizar la página
  // (el timeout también difiere el setState — regla del repo).
  React.useEffect(() => {
    if (guiaVista(seccion, userId)) return
    const t = setTimeout(() => abrir(), 700)
    return () => clearTimeout(t)
  }, [seccion, userId, abrir])

  // Botón "Guía" de la topbar: relanzar. El contador arranca en el valor que
  // tenga el store al montar — sólo reaccionamos a cambios posteriores.
  const pedidaInicial = React.useRef(pedida)
  React.useEffect(() => {
    if (pedida === pedidaInicial.current) return
    const t = setTimeout(() => abrir(), 0)
    return () => clearTimeout(t)
  }, [pedida, abrir])

  // Medir el ancla del paso activo: scrollearla a la vista y seguirla en
  // scroll/resize (mismo patrón que el Dropdown del sistema). La medición
  // ocurre en rAF/eventos (async) — nunca setState sincrónico en el effect.
  const ancla = paso?.ancla ?? null
  React.useLayoutEffect(() => {
    if (!ancla) return
    const el = document.querySelector<HTMLElement>(`[data-guia="${ancla}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
    const medir = () => {
      const r = medirAncla(ancla)
      setMedida(r ? { ancla, rect: r } : null)
    }
    const raf = requestAnimationFrame(medir)
    window.addEventListener('scroll', medir, true)
    window.addEventListener('resize', medir)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', medir, true)
      window.removeEventListener('resize', medir)
    }
  }, [ancla])

  // Teclado: ← → navegan, Escape cierra.
  React.useEffect(() => {
    if (idx === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar()
      if (e.key === 'ArrowRight') ir(idx, 1)
      if (e.key === 'ArrowLeft') ir(idx, -1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [idx, ir, cerrar])

  if (idx === null || !paso) return null

  const z = rootZoom()
  const vw = window.innerWidth / z
  const vh = window.innerHeight / z

  // Un ancla más grande que la pantalla (ej. el mapa satelital) rompería el
  // spotlight: el hueco se RECORTA a lo visible, así el velo y la tarjeta
  // siempre tienen dónde vivir.
  let hueco: Rect | null = null
  if (rect) {
    const top = Math.max(rect.top, 8)
    const left = Math.max(rect.left, 8)
    const bottom = Math.min(rect.top + rect.height, vh - 8)
    const right = Math.min(rect.left + rect.width, vw - 8)
    if (bottom > top && right > left) {
      hueco = { top, left, width: right - left, height: bottom - top }
    }
  }

  // Posición de la tarjeta: centrada (paso sin ancla), pegada al hueco (abajo
  // si entra, arriba si no), o fija abajo al centro cuando el hueco ocupa casi
  // toda la pantalla y no queda lugar ni arriba ni abajo.
  let cardStyle: React.CSSProperties
  if (hueco) {
    const abajo = vh - (hueco.top + hueco.height)
    const arriba = hueco.top
    const left = Math.min(
      Math.max(hueco.left + hueco.width / 2 - CARD_W / 2, MARGEN),
      vw - CARD_W - MARGEN,
    )
    const ancho = Math.min(CARD_W, vw - MARGEN * 2)
    if (abajo >= CARD_H_EST + MARGEN) {
      cardStyle = {
        position: 'fixed',
        width: ancho,
        left,
        // Clamp: aunque la burbuja real supere el estimado, nunca puede
        // pasarse del borde de la pantalla.
        top: Math.min(
          hueco.top + hueco.height + PAD + 12,
          vh - CARD_H_EST - MARGEN,
        ),
      }
    } else if (arriba >= CARD_H_EST + MARGEN) {
      cardStyle = {
        position: 'fixed',
        width: ancho,
        left,
        bottom: Math.max(vh - hueco.top + PAD + 12, MARGEN),
      }
    } else {
      // Hueco casi a pantalla completa: la tarjeta flota abajo, sobre el hueco.
      cardStyle = {
        position: 'fixed',
        width: ancho,
        left: '50%',
        bottom: MARGEN,
        transform: 'translateX(-50%)',
      }
    }
  } else {
    cardStyle = {
      position: 'fixed',
      width: Math.min(CARD_W, vw - MARGEN * 2),
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }

  // Progreso sobre los pasos que existen ahora (los no resolubles no cuentan).
  const visibles = guia.pasos.filter(anclaResoluble)
  const nroActual = visibles.indexOf(paso) + 1
  const esUltimo = nroActual === visibles.length
  const esPrimero = nroActual <= 1

  return createPortal(
    <MotionConfig reducedMotion="user">
      <div
        className="fixed inset-0 z-[90]"
        role="dialog"
        aria-label={`Guía de ${guia.nombre}`}
      >
        {/* Velo + spotlight. Con ancla: 4 paneles oscuros alrededor del hueco
            (nada de box-shadow con spread gigante — Chromium a veces lo omite
            al componer capas grandes) + marco lima sobre el elemento. Sin
            ancla: velo pleno. */}
        {hueco ? (
          <Velo4Paneles rect={hueco} vw={vw} vh={vh} />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0"
            style={{ backgroundColor: VELO }}
          />
        )}

        {/* Bloquea interacción con la página mientras la guía está abierta. */}
        <div className="fixed inset-0" onClick={cerrar} />

        {/* Burbuja del asistente: viaja de paso a paso (entra con blur+spring,
            el spotlight vuela con ella), el texto se ESCRIBE como un chat y
            los controles son chips de respuesta rápida. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 16, scale: 0.96, filter: 'blur(5px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, scale: 0.98, filter: 'blur(4px)' }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            style={cardStyle}
            className="overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_24px_70px_rgba(10,20,14,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Firma del asistente: hairline degradé vivo */}
            <div className="h-[3px] w-full bg-gradient-to-r from-field via-lima to-sky" />
            <div className="p-5">
              <div className="flex items-center gap-2.5">
                <Orbe />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-[13px] font-bold text-ink">Asistente</div>
                  <div className="truncate text-[10.5px] font-bold uppercase tracking-[0.11em] text-faint">
                    {guia.nombre} · paso {nroActual} de {visibles.length}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={cerrar}
                  aria-label="Cerrar el asistente"
                  className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </div>

              <h2 className="mt-3 font-heading text-[19px] font-bold leading-snug text-ink">
                {paso.titulo}
              </h2>
              <TextoStream texto={paso.texto} />

              {/* Acción del paso: el asistente no solo señala — abre el
                  formulario o dispara la herramienta ahí mismo. */}
              {paso.accion && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  onClick={() => {
                    const ancla = paso.accion!.click
                    cerrar()
                    setTimeout(() => {
                      const el = document.querySelector<HTMLElement>(
                        `[data-guia="${ancla}"]`,
                      )
                      if (!el) return
                      const btn =
                        el.tagName === 'BUTTON'
                          ? el
                          : (el.querySelector<HTMLElement>('button, a') ?? el)
                      btn.click()
                    }, 60)
                  }}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-field-deep px-4 py-2.5 text-[14px] font-bold text-white shadow-[0_2px_12px_rgba(11,88,55,0.4)] transition-opacity hover:opacity-90"
                >
                  <Sparkles className="size-4" />
                  {paso.accion.label}
                </motion.button>
              )}

              <div className="mt-4 flex items-center justify-between">
                {/* "Cerrar", no "Salir": el sidebar ya tiene un "Salir" (cerrar
                    sesión) y la colisión confunde — acá solo se cierra el tour. */}
                <button
                  type="button"
                  onClick={cerrar}
                  className="text-[13px] font-semibold text-muted-foreground transition-colors hover:text-ink"
                >
                  Cerrar
                </button>
                <div className="flex items-center gap-2">
                  {!esPrimero && (
                    <button
                      type="button"
                      onClick={() => ir(idx, -1)}
                      className="rounded-full border border-border bg-card px-4 py-2 text-[13.5px] font-semibold text-ink transition-colors hover:border-faint"
                    >
                      Anterior
                    </button>
                  )}
                  <button
                    type="button"
                    autoFocus
                    onClick={() => (esUltimo ? cerrar() : ir(idx, 1))}
                    className="rounded-full bg-primary px-4.5 py-2 text-[13.5px] font-bold text-primary-foreground shadow-[0_2px_10px_rgba(23,138,85,0.35)] transition-opacity hover:opacity-90"
                  >
                    {esUltimo ? 'Listo' : 'Seguime →'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </MotionConfig>,
    document.body,
  )
}

/** Orbe del asistente: anillo degradé girando (la identidad "IA" de la
 *  burbuja), con el brote de la marca adentro. Lo usa también el panel. */
export function Orbe() {
  return (
    <span className="relative inline-flex size-8 shrink-0 items-center justify-center">
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
      <span className="absolute inset-[2.5px] rounded-full bg-card" />
      <Sparkles className="relative size-4 text-field-deep" />
    </span>
  )
}

/** El texto del paso se ESCRIBE palabra por palabra, como un asistente que
 *  responde en vivo. Solo opacidad (cero reflow); respeta reduced-motion vía
 *  el MotionConfig del overlay. Lo usa también el panel. */
export function TextoStream({ texto }: { texto: string }) {
  const palabras = texto.split(' ')
  return (
    <motion.p
      initial="oculto"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: 0.026, delayChildren: 0.12 } },
      }}
      className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground"
    >
      {palabras.map((p, i) => (
        <motion.span
          key={i}
          variants={{
            oculto: { opacity: 0 },
            visible: { opacity: 1, transition: { duration: 0.14 } },
          }}
        >
          {p}
          {i < palabras.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </motion.p>
  )
}

/** Velo con hueco: 4 paneles opacos alrededor del elemento resaltado + marco
 *  lima. El movimiento entre pasos se anima con spring (los 4 paneles siguen
 *  el mismo rect, así el hueco viaja como una unidad). */
function Velo4Paneles({ rect, vw, vh }: { rect: Rect; vw: number; vh: number }) {
  const x = rect.left - PAD
  const y = rect.top - PAD
  const w = rect.width + PAD * 2
  const h = rect.height + PAD * 2
  const spring = { type: 'spring', stiffness: 380, damping: 36 } as const
  const panel = 'pointer-events-none fixed'
  return (
    <>
      {/* arriba / abajo / izquierda / derecha */}
      <motion.div
        className={panel}
        initial={false}
        animate={{ top: 0, left: 0, width: vw, height: Math.max(y, 0) }}
        transition={spring}
        style={{ backgroundColor: VELO }}
      />
      <motion.div
        className={panel}
        initial={false}
        animate={{ top: y + h, left: 0, width: vw, height: Math.max(vh - (y + h), 0) }}
        transition={spring}
        style={{ backgroundColor: VELO }}
      />
      <motion.div
        className={panel}
        initial={false}
        animate={{ top: y, left: 0, width: Math.max(x, 0), height: h }}
        transition={spring}
        style={{ backgroundColor: VELO }}
      />
      <motion.div
        className={panel}
        initial={false}
        animate={{ top: y, left: x + w, width: Math.max(vw - (x + w), 0), height: h }}
        transition={spring}
        style={{ backgroundColor: VELO }}
      />
      {/* marco sobre el elemento */}
      <motion.div
        className="pointer-events-none fixed rounded-[14px] border-2 border-lima"
        initial={false}
        animate={{ top: y, left: x, width: w, height: h }}
        transition={spring}
      />
    </>
  )
}

/** Botón "Asistente" de la topbar: abre el PANEL (checklist + fichas). El
 *  recorrido de la sección se relanza desde adentro del panel — conviven. */
export function BotonGuia() {
  return (
    <button
      type="button"
      onClick={abrirPanel}
      title="Abrí el asistente"
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold',
        'border border-white/15 text-sidebar-foreground/75 transition-colors hover:bg-white/[0.08] hover:text-white',
      )}
    >
      <Sparkles className="size-[15px] text-lima" />
      <span className="hidden md:inline">Asistente</span>
    </button>
  )
}
