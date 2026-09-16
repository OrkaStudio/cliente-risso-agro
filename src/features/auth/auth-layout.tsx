import { type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AuthScene } from '@/features/auth/auth-scene'
import { Reveal } from '@/features/auth/reveal'
import { MARCA, MARCA_TAGLINE } from '@/lib/marca'

/**
 * Shell de las pantallas de auth: escena ambiental a la izquierda (solo
 * escritorio) + tarjeta del formulario a la derecha, con el idioma visual
 * de la app (card blanca sobre porcelana, hairline, sombra suave, chip de
 * marca). En móvil queda la tarjeta sola con una banda superior de marca.
 *
 * Altura por porcentaje (no unidades de viewport) por el zoom global 1.06 —
 * ver lección de gotchas del zoom.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    // grid-rows-[minmax(0,1fr)]: la única fila mide lo que mide el root, no lo
    // que mide el contenido. Sin eso la columna crece con el formulario, el
    // overflow-hidden de html/body esconde el resto y NO se puede scrollear
    // (a 748px de alto el botón de Continuar quedaba afuera, sin scroll).
    <div className="grid h-full grid-rows-[minmax(0,1fr)] lg:grid-cols-[1.15fr_1fr]">
      {/* La sombra ancha y suave hacia la derecha funde el borde entre la
          escena oscura y el panel porcelana (sin línea a cuchillo). */}
      <div className="relative z-10 hidden shadow-[24px_0_70px_-10px_rgba(7,22,9,0.5)] lg:block">
        <AuthScene />
      </div>
      <div className="relative min-h-0 h-full">
        {/* Móvil: la escena es el fondo de TODA la pantalla y no se desplaza
            con el formulario: frase arriba, sol y lomas abajo del todo. En
            escritorio la escena es el panel izquierdo. */}
        <div className="absolute inset-0 lg:hidden">
          <AuthScene variante="fondo" />
        </div>
        {/* scroll-smooth: cuando el teclado del teléfono empuja el input a la
            vista, el desplazamiento es un deslizamiento, no un salto. */}
        <div className="relative flex h-full flex-col overflow-y-auto scroll-smooth">
          {/* En móvil la tarjeta va ARRIBA (debajo de la frase), no centrada:
              al abrir el teclado la pantalla se achica y una tarjeta centrada
              se re-centra de golpe (el "sacudón"). */}
          <div className="flex flex-1 items-start justify-center px-5 pt-[118px] pb-6 sm:items-center sm:p-10">
            <div className="w-full max-w-[430px]">
              <div className="auth-forms rounded-[20px] border border-border bg-card p-6 shadow-[0_18px_50px_rgba(16,30,20,0.09)] sm:p-9">
                {children}
              </div>
              <p className="mt-5 text-center text-xs text-white/60 lg:text-muted-foreground/80">
                {MARCA} · {MARCA_TAGLINE}
                <span className="ml-1.5 opacity-70">· {__BUILD_SHA__}</span>
              </p>
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
}: {
  /** Ícono de lo que hace la pantalla (entrar, crear cuenta, recuperar…). */
  icono: LucideIcon
  titulo: ReactNode
  subtitulo: ReactNode
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
      <Reveal delay={0.08} className="mt-2">
        <p className="text-sm leading-relaxed text-muted-foreground">{subtitulo}</p>
      </Reveal>
    </div>
  )
}
