import { type ReactNode } from 'react'
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
   * Muestra "Seguí para abajo" cuando el contenido no entra. Sólo donde el
   * botón que importa puede quedar fuera de la vista (el cierre del
   * onboarding); en un formulario corto es ruido.
   */
  pistaDeScroll?: boolean
}) {
  return (
    // grid-rows-[minmax(0,1fr)]: la única fila mide lo que mide el root, no lo
    // que mide el contenido. Sin eso la columna crece con el formulario, el
    // overflow-hidden de html/body esconde el resto y NO se puede scrollear
    // (a 748px de alto el botón de Continuar quedaba afuera, sin scroll).
    <div className="grid h-full grid-rows-[minmax(0,1fr)] lg:grid-cols-[1.15fr_1fr]">
      {/* La sombra ancha y suave hacia la derecha funde el borde entre la
          escena oscura y el panel porcelana (sin línea a cuchillo). */}
      <div className="relative z-10 hidden shadow-[24px_0_70px_-10px_rgba(7,22,9,0.5)] lg:block">
        <AuthScene mensaje={escena} />
      </div>
      <div className="relative min-h-0 h-full">
        {/* Avisa que hay más abajo cuando el contenido no entra. */}
        {pistaDeScroll && <PistaDeScroll />}
        {/* scroll-smooth: cuando el teclado del teléfono empuja el input a la
            vista, el desplazamiento es un deslizamiento, no un salto. */}
        <div data-auth-scroll className="flex h-full flex-col overflow-y-auto scroll-smooth">
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
              <MensajeEscenaMovil mensaje={escena} />
            </div>
            {/* En móvil la tarjeta va ARRIBA (debajo de la frase), no centrada:
                al abrir el teclado la pantalla se achica y una tarjeta centrada
                se re-centra de golpe (el "sacudón"). */}
            <div className="relative flex flex-1 flex-col items-center px-5 pt-5 pb-3 sm:justify-center sm:p-10">
              <Remolque key={ciclo} activo={entrada === 'tractor'}>
                <div className="auth-forms w-full max-w-[430px] rounded-[20px] border border-border bg-card p-5 shadow-[0_18px_50px_rgba(16,30,20,0.09)] sm:p-9">
                  {children}
                </div>
              </Remolque>
            </div>
          </div>
        </div>
      </div>
    </div>
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
