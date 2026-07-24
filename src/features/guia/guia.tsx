import * as React from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { ChevronLeft, Sparkles } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import {
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

/**
 * Recorrido asistido por sección (Modo Oficina).
 *
 * No es un tour de tarjetas: es un VIAJE. Un único velo con una luz de borde
 * difuminado (SVG + máscara con blur) se desliza de elemento a elemento con
 * spring; la caption del asistente viaja con la luz (nunca se desmonta entre
 * pasos) y el texto se escribe al llegar. Tocar la página avanza — el clic
 * acompaña el viaje, no lo corta.
 *
 * Implementación propia, sin lib de tours: driver.js/react-joyride posicionan
 * con getBoundingClientRect sin dividir por el zoom global 1.06 → spotlight
 * corrido ([[lecciones/2026-06-29-zoom-global-gotchas]] gotcha 2). Acá todas
 * las coordenadas se dividen por rootZoom(), como el Dropdown del sistema.
 *
 * - Auto-arranca la primera vez que el usuario entra a cada sección
 *   (persistencia en localStorage por usuario+sección).
 * - Un paso cuyo ancla no está en el DOM (panel que no renderiza sin datos)
 *   se saltea solo — el recorrido funciona con la sección vacía.
 * - Navegar a otra sección desmonta el recorrido por `key`.
 * - IMPORTANTE: la caption se posiciona con left/top que anima framer — nunca
 *   con transform CSS (framer controla `transform` y lo pisa).
 */

type Rect = { top: number; left: number; width: number; height: number }

/** Margen de la luz alrededor del elemento señalado. */
const PAD = 6
/** Ancho de la caption del asistente (px, en espacio zoomeado). */
const CAP_W = 352
/** Alto estimado de la caption para decidir arriba/abajo antes de medirla. */
const CAP_H_EST = 200
const MARGEN = 16
/** Color del velo que atenúa lo que no es el paso actual. */
const VELO = 'rgba(13, 24, 17, 0.55)'
/** Spring compartido del viaje: la luz, el halo y la caption se mueven juntos. */
const VIAJE = { type: 'spring', stiffness: 190, damping: 27 } as const

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
  // estado del recorrido sin efectos de limpieza manual.
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

  // Índice del paso activo; null = recorrido cerrado.
  const [idx, setIdx] = React.useState<number | null>(null)
  // Última medición del ancla activa. Cuando el paso cambia, la medición vieja
  // queda como destino provisorio (la luz espera ahí) hasta que el rAF mide la
  // nueva — así el viaje nunca "salta al centro" entre pasos.
  const [medida, setMedida] = React.useState<{ ancla: string; rect: Rect } | null>(
    null,
  )

  const paso = idx !== null ? guia.pasos[idx] : null
  const rect = paso && paso.ancla !== null ? (medida?.rect ?? null) : null

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
  // (el timeout también difiere el setState — regla del repo). Se marca "vista"
  // apenas se MUESTRA (no solo al cerrar): así aparece UNA vez por sección, aunque
  // el usuario navegue a otra pantalla sin cerrarla.
  React.useEffect(() => {
    if (guiaVista(seccion, userId)) return
    const t = setTimeout(() => {
      abrir()
      marcarGuiaVista(seccion, userId)
    }, 700)
    return () => clearTimeout(t)
  }, [seccion, userId, abrir])

  // Relanzamiento a pedido (burbuja del asistente). El contador arranca en el
  // valor que tenga el store al montar — sólo reaccionamos a cambios posteriores.
  const pedidaInicial = React.useRef(pedida)
  React.useEffect(() => {
    if (pedida === pedidaInicial.current) return
    const t = setTimeout(() => abrir(), 0)
    return () => clearTimeout(t)
  }, [pedida, abrir])

  // Medir el ancla del paso activo: scrollearla a la vista (suave — la luz
  // sigue el scroll en vivo, parte del viaje) y re-medir en scroll/resize
  // (mismo patrón que el Dropdown del sistema). La medición ocurre en
  // rAF/eventos (async) — nunca setState sincrónico en el effect.
  const ancla = paso?.ancla ?? null
  React.useLayoutEffect(() => {
    if (!ancla) return
    const el = document.querySelector<HTMLElement>(`[data-guia="${ancla}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
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

  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {idx !== null && paso && (
          <Escena
            key="escena"
            guia={guia}
            paso={paso}
            idx={idx}
            rect={rect}
            ir={ir}
            cerrar={cerrar}
          />
        )}
      </AnimatePresence>
    </MotionConfig>,
    document.body,
  )
}

/** La escena del recorrido: velo con luz viajera + caption del asistente. */
function Escena({
  guia,
  paso,
  idx,
  rect,
  ir,
  cerrar,
}: {
  guia: (typeof GUIAS)[SeccionGuia]
  paso: PasoGuia
  idx: number
  rect: Rect | null
  ir: (desde: number, dir: 1 | -1) => void
  cerrar: () => void
}) {
  const z = rootZoom()
  const vw = window.innerWidth / z
  const vh = window.innerHeight / z

  // Un ancla más grande que la pantalla (ej. el mapa satelital) rompería la
  // luz: el hueco se RECORTA a lo visible, así el velo y la caption siempre
  // tienen dónde vivir.
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

  // Destino de la caption. Debajo del elemento si hay lugar; arriba si no; con
  // un hueco casi a pantalla completa, flota abajo al centro. Sin ancla
  // (bienvenida): centrada.
  const ancho = Math.min(CAP_W, vw - MARGEN * 2)
  let capX = (vw - ancho) / 2
  let capY = Math.max(vh / 2 - 150, MARGEN)
  if (hueco) {
    capX = Math.min(
      Math.max(hueco.left + hueco.width / 2 - ancho / 2, MARGEN),
      vw - ancho - MARGEN,
    )
    const abajo = vh - (hueco.top + hueco.height)
    if (abajo >= CAP_H_EST + MARGEN) {
      capY = hueco.top + hueco.height + PAD + 16
    } else if (hueco.top >= CAP_H_EST + MARGEN) {
      capY = hueco.top - PAD - 16 - CAP_H_EST
    } else {
      capY = vh - CAP_H_EST - MARGEN
    }
  }

  // La luz: el rect de la máscara. Sin ancla colapsa a un punto sobre la
  // caption — el velo se cierra suave en vez de cortar a "velo pleno".
  const luz = hueco
    ? {
        x: hueco.left - PAD,
        y: hueco.top - PAD,
        width: hueco.width + PAD * 2,
        height: hueco.height + PAD * 2,
      }
    : { x: capX + ancho / 2, y: capY + 40, width: 0, height: 0 }

  // Progreso sobre los pasos que existen ahora (los no resolubles no cuentan).
  const visibles = guia.pasos.filter(anclaResoluble)
  const nroActual = visibles.indexOf(paso) + 1
  const esUltimo = nroActual === visibles.length
  const esPrimero = nroActual <= 1

  return (
    <motion.div
      className="fixed inset-0 z-[90]"
      role="dialog"
      aria-label={`Guía de ${guia.nombre}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3, ease: 'easeOut' } }}
    >
      {/* Velo con la luz viajera: máscara SVG cuyo hueco (rect con blur de
          borde) se desliza con spring de un elemento al otro. Nada de 4
          paneles con bordes duros ni box-shadow gigante (Chromium a veces lo
          omite al componer capas grandes). */}
      <svg className="pointer-events-none fixed inset-0 h-full w-full">
        <defs>
          <filter id="guia-pluma" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
          <mask id="guia-luz">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <motion.rect
              fill="black"
              rx={20}
              filter="url(#guia-pluma)"
              initial={false}
              animate={{
                x: luz.x,
                y: luz.y,
                width: luz.width,
                height: luz.height,
              }}
              transition={VIAJE}
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill={VELO}
          mask="url(#guia-luz)"
        />
      </svg>

      {/* Halo tenue sobre el elemento señalado (viaja con la luz). */}
      <motion.div
        className="pointer-events-none fixed rounded-[18px]"
        initial={false}
        animate={{
          left: luz.x,
          top: luz.y,
          width: luz.width,
          height: luz.height,
          opacity: hueco ? 1 : 0,
        }}
        transition={VIAJE}
        style={{
          boxShadow:
            '0 0 0 1.5px color-mix(in srgb, var(--lima) 55%, transparent), 0 0 44px 6px color-mix(in srgb, var(--lima) 18%, transparent)',
        }}
      />

      {/* Tocar la página avanza: el clic acompaña el viaje, no lo corta.
          Para salir están "Saltar" y Escape. */}
      <div
        className="fixed inset-0 cursor-pointer"
        onClick={() => ir(idx, 1)}
      />

      {/* Caption viajera del asistente: UNA sola burbuja liviana que se
          desliza con la luz; adentro el contenido del paso hace crossfade y
          el texto se escribe al llegar. */}
      <motion.div
        className="pointer-events-auto fixed"
        style={{ width: ancho }}
        initial={{ opacity: 0, scale: 0.97, left: capX, top: capY }}
        animate={{ opacity: 1, scale: 1, left: capX, top: capY }}
        transition={VIAJE}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-[20px] bg-white/95 p-5 shadow-[0_18px_60px_rgba(10,20,14,0.32)] ring-1 ring-black/5 backdrop-blur-xl">
          <motion.div
            key={idx}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.28, delay: 0.05 }}
          >
            <div className="flex items-start gap-3">
              <Orbe />
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 className="font-heading text-[16.5px] font-bold leading-snug text-ink">
                  {paso.titulo}
                </h2>
                <TextoStream texto={paso.texto} />

                {/* Acción del paso: el asistente no solo señala — abre el
                    formulario o dispara la herramienta ahí mismo. */}
                {paso.accion && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    onClick={() => {
                      const destino = paso.accion!.click
                      cerrar()
                      setTimeout(() => {
                        const el = document.querySelector<HTMLElement>(
                          `[data-guia="${destino}"]`,
                        )
                        if (!el) return
                        const btn =
                          el.tagName === 'BUTTON'
                            ? el
                            : (el.querySelector<HTMLElement>('button, a') ?? el)
                        btn.click()
                      }, 60)
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-field-deep px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_2px_10px_rgba(11,88,55,0.35)] transition-opacity hover:opacity-90"
                  >
                    <Sparkles className="size-3.5" />
                    {paso.accion.label}
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>

          {/* Hilo de progreso: se va llenando a lo largo del viaje. */}
          <div className="mt-4 h-[2.5px] overflow-hidden rounded-full bg-black/[0.06]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-field via-lima to-sky"
              initial={false}
              animate={{
                width: `${(nroActual / Math.max(visibles.length, 1)) * 100}%`,
              }}
              transition={{ type: 'spring', stiffness: 140, damping: 26 }}
            />
          </div>

          <div className="mt-2.5 flex items-center justify-between">
            {/* "Saltar", no "Salir": el sidebar ya tiene un "Salir" (cerrar
                sesión) y la colisión confunde — acá solo se salta el tour. */}
            <button
              type="button"
              onClick={cerrar}
              className="text-[12.5px] font-medium text-faint transition-colors hover:text-ink"
            >
              Saltar
            </button>
            <div className="flex items-center gap-1">
              {!esPrimero && (
                <button
                  type="button"
                  onClick={() => ir(idx, -1)}
                  aria-label="Paso anterior"
                  className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
                >
                  <ChevronLeft className="size-4" />
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={() => (esUltimo ? cerrar() : ir(idx, 1))}
                className="rounded-full px-3.5 py-1.5 text-[13.5px] font-bold text-field-deep transition-colors hover:bg-field-deep/10"
              >
                {esUltimo ? 'Listo' : 'Seguir →'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
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
      className="mt-1 text-[14px] leading-relaxed text-muted-foreground"
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

// El launcher del Asistente es la burbuja flotante (asistente-panel.tsx);
// el botón de topbar se retiró (decisión de Lau: checklist arriba, chat abajo).
