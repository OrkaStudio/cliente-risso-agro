import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { AuthScene, MensajeEscenaMovil } from '@/features/auth/auth-scene'
import { Reveal } from '@/features/auth/reveal'
import { Remolque } from '@/features/auth/sembradora'
import { PistaDeScroll } from '@/features/auth/pista-de-scroll'

/**
 * Shell de las pantallas de auth: escena ambiental a la izquierda (solo
 * escritorio) + tarjeta del formulario a la derecha, con el idioma visual
 * de la app (card blanca sobre porcelana, hairline, sombra suave, chip de
 * marca). En móvil queda la tarjeta sola con una banda superior de marca.
 *
 * Altura por porcentaje (no unidades de viewport) por el zoom global 1.06 —
 * ver lección de gotchas del zoom.
 */
export function AuthLayout({
  children,
  solAnimado = false,
  escena,
  entrada = 'suave',
  ciclo,
  pistaDeScroll = false,
  continua = false,
  saliendo = false,
  desvanecer = false,
  sinTarjeta = false,
}: {
  children: ReactNode
  /** Ondas del sol en el teléfono (en escritorio siempre van). */
  solAnimado?: boolean
  /** Contenido de la escena en lugar de la frase de marketing. */
  escena?: ReactNode
  /**
   * Cómo entra la tarjeta. `tractor` sólo en las pantallas que abren o
   * cierran algo —entrar, crear la cuenta, el primer paso del onboarding y
   * el festejo—; el resto entra `suave`. Ver `Remolque`.
   */
  entrada?: 'tractor' | 'suave'
  /** Cambiarlo vuelve a montar la tarjeta y el remolque se repite. */
  ciclo?: string
  /**
   * Llega desde otra pantalla de auth (del registro al onboarding): el
   * paisaje no vuelve a entrar, sólo cambia el mensaje. Sin cortes.
   */
  continua?: boolean
  /** Se va a otra pantalla: la tarjeta y el mensaje se desvanecen antes. */
  saliendo?: boolean
  /** Se va a la app: toda la pantalla se funde con el fondo antes del cambio. */
  desvanecer?: boolean
  /** Todavía no hay qué mostrar: la escena sola; la tarjeta entra una vez, después. */
  sinTarjeta?: boolean
  /**
   * Muestra "Bajá para continuar" cuando el contenido no entra. Sólo donde el
   * botón que importa puede quedar fuera de la vista (el cierre del
   * onboarding); en un formulario corto es ruido.
   */
  pistaDeScroll?: boolean
}) {
  const escena_ref = useRef<HTMLDivElement>(null)
  return (
    // grid-rows-[minmax(0,1fr)]: la única fila mide lo que mide el root, no lo
    // que mide el contenido. Sin eso la columna crece con el formulario, el
    // overflow-hidden de html/body esconde el resto y NO se puede scrollear
    // (a 748px de alto el botón de Continuar quedaba afuera, sin scroll).
    <>
    {/* Fuera del fundido: la barra que se forma NO se desvanece. */}
    {desvanecer && <HaciaLaBarra escena={escena_ref} />}
    <motion.div
      className="grid h-full grid-rows-[minmax(0,1fr)] lg:grid-cols-[1.15fr_1fr]"
      initial={false}
      animate={desvanecer ? { opacity: 0 } : { opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* La sombra ancha y suave hacia la derecha funde el borde entre la
          escena oscura y el panel porcelana (sin línea a cuchillo). */}
      <div ref={escena_ref} className="relative z-10 hidden shadow-[24px_0_70px_-10px_rgba(7,22,9,0.5)] lg:block">
        <AuthScene mensaje={escena} continua={continua} saliendo={saliendo} />
      </div>
      <div className="relative min-h-0 h-full">
        {/* Avisa que hay más abajo cuando el contenido no entra. */}
        {pistaDeScroll && <PistaDeScroll />}
        {/* scroll-smooth: cuando el teclado del teléfono empuja el input a la
            vista, el desplazamiento es un deslizamiento, no un salto. */}
        {/* overscroll-none: sin el rebote elástico al llegar arriba o abajo,
            que se leía como un segundo scroll. */}
        {/* overflow-anchor: none — el navegador no corrige el scroll por su
            cuenta cuando cambia el alto del contenido (eso hacía saltar la
            tarjeta 170 px al terminar un campo). */}
        <div data-auth-scroll className="flex h-full flex-col overflow-y-auto overscroll-none [overflow-anchor:none] scroll-smooth">
          {/* min-h-full + relative: la escena de fondo cubre TODO el contenido
              (no sólo la primera pantalla) y se desplaza con él — frase y sol
              se van hacia arriba junto con la tarjeta, las lomas quedan al
              final. Nada se monta sobre nada. */}
          <div className="relative flex min-h-full shrink-0 flex-col">
            <div className="absolute inset-0 lg:hidden">
              <AuthScene variante="fondo" solAnimado={solAnimado} />
            </div>
            {/* Teléfono: marca + mensaje EN EL FLUJO, arriba de la tarjeta. */}
            <div className="relative lg:hidden">
              <MensajeEscenaMovil mensaje={escena} continua={continua} saliendo={saliendo} />
            </div>
            {/* En móvil la tarjeta va ARRIBA (debajo de la frase), no centrada:
                al abrir el teclado la pantalla se achica y una tarjeta centrada
                se re-centra de golpe (el "sacudón"). */}
            {/* Aire vertical mínimo (1 rem): la tarjeta ya se centra sola cuando
                sobra lugar, así que un padding grande sólo servía para crear
                un scroll que no mostraba nada cuando la tarjeta apenas entra.
                Scroll únicamente si la tarjeta de verdad no entra. */}
            <div className="relative flex flex-1 flex-col items-center px-5 pt-5 pb-3 sm:justify-center sm:px-10 sm:py-4">
              {!sinTarjeta && (
              <motion.div
                className="flex w-full justify-center"
                initial={false}
                animate={saliendo ? { opacity: 0, y: -18, scale: 0.98 } : { opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.35, ease: [0.4, 0, 1, 1] }}
              >
                <Remolque key={ciclo} activo={entrada === 'tractor'}>
                  <div className="auth-forms w-full max-w-[430px] rounded-[20px] border border-border bg-card p-5 shadow-[0_18px_50px_rgba(16,30,20,0.09)] sm:p-9">
                    <AltoSuave>{children}</AltoSuave>
                  </div>
                </Remolque>
              </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
    </>
  )
}

/**
 * El botón principal de cada pantalla de auth: más alto y con más peso que
 * el estándar de la app — acá es la única acción y se toca con el pulgar.
 */
export const BOTON_PRINCIPAL = 'h-11 w-full text-[15px] font-semibold'

/** Mensaje corto bajo un campo. Ocupa lugar sólo cuando hay algo que decir. */
export function ErrorCampo({ mensaje }: { mensaje?: string | null }) {
  if (!mensaje) return null
  return (
    <p className="text-xs text-destructive" role="alert">
      {mensaje}
    </p>
  )
}

/**
 * Encabezado de cada pantalla de auth: un ícono de lo que hace la pantalla
 * en la misma fila que el título (la marca ya está en la escena de al lado /
 * de fondo); el subtítulo abajo, a todo el ancho, alineado al formulario.
 */
export function AuthHeading({
  icono: Icono,
  titulo,
  subtitulo,
  subtituloSoloEscritorio = false,
}: {
  /** Ícono de lo que hace la pantalla (entrar, crear cuenta, recuperar…). */
  icono: LucideIcon
  titulo: ReactNode
  subtitulo?: ReactNode
  /** En el teléfono el subtítulo no entra (registro): se muestra desde sm. */
  subtituloSoloEscritorio?: boolean
}) {
  return (
    <div>
      <Reveal>
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
            <Icono className="size-[18px]" strokeWidth={1.75} />
          </span>
          <h1 className="text-2xl leading-9 font-bold tracking-tight">{titulo}</h1>
        </div>
      </Reveal>
      {subtitulo && (
        <Reveal
          delay={0.08}
          className={subtituloSoloEscritorio ? 'mt-2 hidden sm:block' : 'mt-2'}
        >
          <p className="text-sm leading-relaxed text-muted-foreground">{subtitulo}</p>
        </Reveal>
      )}
    </div>
  )
}

/**
 * La tarjeta cambia de alto con un resorte, no de un salto. Cada paso mide
 * distinto (la empresa es un campo, la hacienda una grilla): sin esto, al
 * cambiar de paso la tarjeta blanca pegaba un tirón y eso era lo brusco.
 *
 * El recorte (`overflow: hidden`) va SÓLO mientras anima: con el contenido
 * quieto tiene que poder salirse, porque la lista de localidades cuelga por
 * debajo del campo y un recorte fijo la cortaba.
 */
function AltoSuave({ children }: { children: ReactNode }) {
  const quieto = useReducedMotion()
  const adentro = useRef<HTMLDivElement>(null)
  // null hasta la primera medida: la primera se aplica SIN animar. Animarla
  // hacía crecer la tarjeta al aparecer (de 667 a 702 px), y como está
  // centrada, se movía entera.
  const [alto, setAlto] = useState<number | null>(null)
  const [animar, setAnimar] = useState(false)
  const [animando, setAnimando] = useState(false)

  useLayoutEffect(() => {
    const el = adentro.current
    if (!el || quieto) return
    let primera = true
    const ro = new ResizeObserver(([e]) => {
      if (!e) return
      setAlto(Math.round(e.contentRect.height))
      if (primera) {
        primera = false
        requestAnimationFrame(() => setAnimar(true))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [quieto])

  if (quieto) return <>{children}</>
  return (
    <motion.div
      initial={false}
      animate={alto === null ? undefined : { height: alto }}
      transition={animar ? { type: 'spring', stiffness: 220, damping: 30, mass: 0.9 } : { duration: 0 }}
      onAnimationStart={() => animar && setAnimando(true)}
      onAnimationComplete={() => setAnimando(false)}
      style={{ overflow: animando ? 'hidden' : 'visible' }}
    >
      <div ref={adentro}>{children}</div>
    </motion.div>
  )
}

/**
 * Del onboarding a la app, en escritorio: el panel oscuro de la escena se
 * CONVIERTE en la barra lateral de la app (mismo verde), mientras todo lo
 * demás se funde. Hay algo que continúa de una pantalla a la otra, en vez de
 * un cambio de página. Se dibuja por encima (fixed), porque la escena y la
 * tarjeta se están desvaneciendo abajo. En el teléfono no hay barra: sólo
 * el fundido.
 */
function HaciaLaBarra({ escena }: { escena: React.RefObject<HTMLDivElement | null> }) {
  const quieto = useReducedMotion()
  const [desde] = useState(() => {
    const r = escena.current?.getBoundingClientRect()
    return r && r.width > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
  })
  if (!desde || quieto) return null
  // La barra lateral de AppShell: m-4, 248 px (76 si la dejó colapsada), radio 20.
  let colapsada = false
  try {
    colapsada = localStorage.getItem('side-collapsed') === '1'
  } catch {
    // sin almacenamiento: la barra arranca abierta
  }
  const hasta = { x: 16, y: 16, w: colapsada ? 76 : 248, h: window.innerHeight - 32 }
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed z-[60] bg-sidebar shadow-[0_12px_40px_rgba(16,30,20,0.12)]"
      style={{ left: 0, top: 0 }}
      initial={{ x: desde.x, y: desde.y, width: desde.w, height: desde.h, borderRadius: 0, opacity: 0 }}
      animate={{ x: hasta.x, y: hasta.y, width: hasta.w, height: hasta.h, borderRadius: 20, opacity: 1 }}
      transition={{
        opacity: { duration: 0.18 },
        default: { duration: 0.62, delay: 0.12, ease: [0.65, 0, 0.35, 1] },
      }}
    />
  )
}
