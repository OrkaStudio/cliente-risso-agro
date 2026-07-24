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
import { cn } from '@/lib/utils'

/**
 * Recorrido asistido por sección (Modo Oficina).
 *
 * No es un tour de tarjetas: es un VIAJE narrado. Un único velo con una luz de
 * borde difuminado (SVG + máscara con blur) se desliza de elemento a elemento
 * con spring; el texto del asistente se ESCRIBE directo sobre el velo oscuro
 * (máquina de escribir, sin card) y viaja con la luz. Tocar la página avanza —
 * el clic acompaña el viaje, no lo corta. Al terminar, la página vuelve arriba
 * del todo: el recorrido no deja al usuario situado en cualquier lado.
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
 * - IMPORTANTE: el bloque de narración se posiciona con left/top que anima
 *   framer — nunca con transform CSS (framer controla `transform` y lo pisa).
 */

type Rect = { top: number; left: number; width: number; height: number }

/** Margen de la luz alrededor del elemento señalado. */
const PAD = 8
/** Ancho del bloque de narración (px, en espacio zoomeado). */
const CAP_W = 380
/** Alto inicial estimado del bloque hasta que el ResizeObserver lo mide. */
const CAP_H_EST = 190
const MARGEN = 16
/** Color del velo. Más oscuro que un velo de modal: el texto blanco se narra
 *  directo encima y necesita contraste. */
const VELO = 'rgba(11, 20, 15, 0.68)'
/** Spring compartido del viaje: la luz y la narración se mueven juntas. */
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
    // Devolver la página arriba del todo: el recorrido scrolleó buscando
    // anclas y no debe dejar al usuario situado en cualquier lado.
    document
      .querySelector('main')
      ?.scrollTo({ top: 0, behavior: 'smooth' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

/** La escena del recorrido: velo con luz viajera + narración escrita encima. */
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

  // Alto REAL del bloque de narración (medido, no estimado): así nunca queda
  // cortado abajo — el corte de "Saltar" fuera de pantalla venía de estimar.
  const capRef = React.useRef<HTMLDivElement>(null)
  const [capH, setCapH] = React.useState(CAP_H_EST)
  React.useLayoutEffect(() => {
    const el = capRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setCapH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Un ancla más grande que la pantalla (ej. el mapa satelital) rompería la
  // luz: el hueco se RECORTA a lo visible, así el velo y la narración siempre
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

  // Destino de la narración. Debajo del elemento si hay lugar; arriba si no;
  // con un hueco casi a pantalla completa, abajo al centro (el scrim propio
  // del bloque garantiza que se lea también sobre la zona iluminada).
  const ancho = Math.min(CAP_W, vw - MARGEN * 2)
  let capX = (vw - ancho) / 2
  let capY = Math.max(vh / 2 - capH / 2 - 40, MARGEN)
  if (hueco) {
    capX = Math.min(
      Math.max(hueco.left + hueco.width / 2 - ancho / 2, MARGEN),
      vw - ancho - MARGEN,
    )
    const abajo = vh - (hueco.top + hueco.height)
    if (abajo >= capH + MARGEN + 20) {
      capY = hueco.top + hueco.height + PAD + 20
    } else if (hueco.top >= capH + MARGEN + 20) {
      capY = hueco.top - PAD - 20 - capH
    } else {
      capY = vh - capH - MARGEN
    }
  }
  // Pase lo que pase, el bloque queda entero a la vista.
  capY = Math.min(Math.max(capY, MARGEN), vh - capH - MARGEN)

  // La luz: el rect de la máscara. Sin ancla colapsa a un punto sobre la
  // narración — el velo se cierra suave en vez de cortar a "velo pleno".
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

  // La narración arranca recién cuando el usuario YA ESTÁ situado: primero el
  // viaje (scroll + luz), después la escritura — si no, todo choca. `listo` se
  // enciende 500 ms después de que la luz dejó de moverse (cada movimiento
  // resetea el timer). El reset por paso es ajuste de estado durante render.
  const [vistoIdx, setVistoIdx] = React.useState(idx)
  const [listo, setListo] = React.useState(false)
  const [finNarracion, setFinNarracion] = React.useState(false)
  if (vistoIdx !== idx) {
    setVistoIdx(idx)
    setListo(false)
    setFinNarracion(false)
  }
  // Bucket de 8px: el jitter de re-mediciones no resetea el timer.
  const luzKey = `${idx}:${Math.round(luz.x / 8)}:${Math.round(luz.y / 8)}:${Math.round(luz.width / 8)}`
  React.useEffect(() => {
    const t = setTimeout(() => setListo(true), 500)
    return () => clearTimeout(t)
  }, [luzKey])

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
          omite al componer capas grandes). La luz difuminada ES el resaltado:
          sin marcos ni bordes verdes alrededor del elemento. */}
      <svg className="pointer-events-none fixed inset-0 h-full w-full">
        <defs>
          <filter id="guia-pluma" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
          <mask id="guia-luz">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Pluma exterior: borde de luz difuminado. */}
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
            {/* Núcleo sólido: el blur difumina hacia adentro también y en
                elementos chicos (un botón) el centro quedaba semi-velado,
                "apagado". Este rect sin blur garantiza el interior 100%
                despejado; la pluma de arriba queda solo como halo. */}
            <motion.rect
              fill="black"
              rx={14}
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

      {/* Tocar la página avanza: el clic acompaña el viaje, no lo corta.
          Para salir están "Saltar" y Escape. */}
      <div
        className="fixed inset-0 cursor-pointer"
        onClick={() => ir(idx, 1)}
      />

      {/* Narración viajera: SIN card blanca — un scrim oscuro parejo (siempre,
          no a veces: quedaba inconsistente) con el texto escribiéndose a
          máquina. Viaja con la luz. */}
      <motion.div
        ref={capRef}
        className="pointer-events-auto fixed rounded-[20px] bg-[rgba(11,20,15,0.78)] p-5 backdrop-blur-md"
        style={{ width: ancho }}
        initial={{ opacity: 0, left: capX, top: capY }}
        animate={{ opacity: 1, left: capX, top: capY }}
        transition={VIAJE}
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div
          key={idx}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.05 }}
        >
          <div className="flex items-start gap-3">
            <Orbe />
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="font-heading text-[19px] font-bold leading-snug text-white">
                {paso.titulo}
              </h2>
              <TextoStream
                texto={paso.texto}
                activo={listo}
                onFin={() => setFinNarracion(true)}
                className="text-white/85"
              />

              {/* Acción del paso: el asistente no solo señala — abre el
                  formulario o dispara la herramienta ahí mismo. Aparece
                  cuando la narración terminó de escribirse. */}
              {paso.accion && (
                <motion.button
                  type="button"
                  initial={false}
                  animate={{
                    opacity: finNarracion ? 1 : 0,
                    y: finNarracion ? 0 : 4,
                  }}
                  style={{ pointerEvents: finNarracion ? 'auto' : 'none' }}
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
                  className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-field-deep shadow-[0_4px_18px_rgba(0,0,0,0.35)] transition-opacity hover:opacity-90"
                >
                  <Sparkles className="size-3.5" />
                  {paso.accion.label}
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Hilo de progreso: se va llenando a lo largo del viaje. */}
        <div className="ml-11 mt-4 h-[2px] overflow-hidden rounded-full bg-white/15">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-field via-lima to-sky"
            initial={false}
            animate={{
              width: `${(nroActual / Math.max(visibles.length, 1)) * 100}%`,
            }}
            transition={{ type: 'spring', stiffness: 140, damping: 26 }}
          />
        </div>

        <div className="ml-11 mt-2.5 flex items-center justify-between">
          {/* "Saltar", no "Salir": el sidebar ya tiene un "Salir" (cerrar
              sesión) y la colisión confunde — acá solo se salta el tour. */}
          <button
            type="button"
            onClick={cerrar}
            className="text-[12.5px] font-medium text-white/55 transition-colors hover:text-white"
          >
            Saltar
          </button>
          <div className="flex items-center gap-1">
            {!esPrimero && (
              <button
                type="button"
                onClick={() => ir(idx, -1)}
                aria-label="Paso anterior"
                className="flex size-7 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ChevronLeft className="size-4" />
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={() => (esUltimo ? cerrar() : ir(idx, 1))}
              className="rounded-full px-3.5 py-1.5 text-[13.5px] font-bold text-white transition-colors hover:bg-white/10"
            >
              {esUltimo ? 'Listo' : 'Seguir →'}
            </button>
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

/** Milisegundos por carácter de la máquina de escribir. */
const MS_POR_CHAR = 14

/** El texto del paso se ESCRIBE como una máquina de escribir DE VERDAD: los
 *  caracteres se agregan de a uno y el cursor va pegado a lo último escrito
 *  (sólido mientras escribe — nada de palito titilando suelto al principio o
 *  al final — y desaparece al terminar). El texto completo reserva su lugar
 *  invisible desde el arranque, así el bloque no cambia de alto mientras
 *  escribe. `activo` difiere el arranque (ej.: hasta que la luz llegó).
 *  Con reduced-motion el texto aparece entero al instante.
 *  Lo usa también el panel del asistente. */
export function TextoStream({
  texto,
  activo = true,
  onFin,
  className,
  style,
}: {
  texto: string
  /** La escritura arranca recién cuando pasa a true (default: enseguida). */
  activo?: boolean
  /** Se llama una vez cuando terminó de escribirse el texto completo. */
  onFin?: () => void
  className?: string
  style?: React.CSSProperties
}) {
  const instantaneo = React.useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const [n, setN] = React.useState(0)
  // Reset ante texto nuevo: ajuste de estado DURANTE el render (patrón de
  // React para "state from props"), no un setState sincrónico en un effect.
  const [prevTexto, setPrevTexto] = React.useState(texto)
  if (prevTexto !== texto) {
    setPrevTexto(texto)
    setN(0)
  }

  React.useEffect(() => {
    if (!activo || instantaneo) return
    const iv = setInterval(() => {
      setN((v) => {
        if (v >= texto.length) {
          clearInterval(iv)
          return v
        }
        return v + 1
      })
    }, MS_POR_CHAR)
    return () => clearInterval(iv)
  }, [activo, instantaneo, texto])

  // Aviso de fin (para el CTA del paso): por timer, no por setState sync.
  // El ref se actualiza en un effect (no en render — regla del linter); corre
  // antes que el timer de abajo dispare, así siempre llama al onFin vigente.
  const onFinRef = React.useRef(onFin)
  React.useEffect(() => {
    onFinRef.current = onFin
  }, [onFin])
  React.useEffect(() => {
    if (!activo) return
    const durMs = instantaneo ? 0 : texto.length * MS_POR_CHAR + 120
    const t = setTimeout(() => onFinRef.current?.(), durMs)
    return () => clearTimeout(t)
  }, [activo, instantaneo, texto])

  const mostrado = instantaneo && activo ? texto.length : n
  const escribiendo = activo && !instantaneo && mostrado < texto.length

  return (
    <p
      aria-label={texto}
      className={cn(
        'relative mt-1 text-[14.5px] leading-relaxed',
        className ?? 'text-muted-foreground',
      )}
      style={style}
    >
      {/* El texto entero, invisible: reserva el alto/ancho definitivos. */}
      <span aria-hidden className="invisible">
        {texto}
      </span>
      {/* Lo escrito hasta ahora, superpuesto (misma tipografía → mismos
          cortes de línea), con el cursor pegado al último carácter. */}
      <span aria-hidden className="absolute inset-0">
        {texto.slice(0, mostrado)}
        {escribiendo && <span className="opacity-90">▍</span>}
      </span>
    </p>
  )
}

// El launcher del Asistente es la burbuja flotante (asistente-panel.tsx);
// el botón de topbar se retiró (decisión de Lau: checklist arriba, chat abajo).
