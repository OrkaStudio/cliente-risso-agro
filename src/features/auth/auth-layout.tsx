import { type ReactNode } from 'react'
import { Leaf } from 'lucide-react'
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
    <div className="grid h-full lg:grid-cols-[1.15fr_1fr]">
      {/* La sombra ancha y suave hacia la derecha funde el borde entre la
          escena oscura y el panel porcelana (sin línea a cuchillo). */}
      <div className="relative z-10 hidden shadow-[24px_0_70px_-10px_rgba(7,22,9,0.5)] lg:block">
        <AuthScene />
      </div>
      {/* scroll-smooth: cuando el teclado del teléfono empuja el input a la
          vista, el desplazamiento es un deslizamiento, no un salto. */}
      <div className="flex h-full flex-col overflow-y-auto scroll-smooth">
        {/* Banda de marca, solo cuando la escena no se ve */}
        <div className="flex items-center gap-2.5 border-b border-border bg-sidebar px-5 py-3 text-sidebar-foreground lg:hidden">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-white">
            <Leaf className="size-4" strokeWidth={1.75} />
          </span>
          <span className="font-heading text-[15px] font-bold">{MARCA}</span>
        </div>
        {/* En móvil la tarjeta va ARRIBA, no centrada: al abrir el teclado la
            pantalla se achica y una tarjeta centrada se re-centra de golpe
            (el "sacudón"). Anclada arriba, sólo se desplaza lo justo. */}
        <div className="flex flex-1 items-start justify-center p-5 pt-6 sm:items-center sm:p-10">
          <div className="w-full max-w-[430px]">
            <div className="auth-forms rounded-[20px] border border-border bg-card p-6 shadow-[0_18px_50px_rgba(16,30,20,0.09)] sm:p-9">
              {children}
            </div>
            <p className="mt-5 text-center text-xs text-muted-foreground/80">
              {MARCA} · {MARCA_TAGLINE}
              <span className="ml-1.5 text-muted-foreground/50">· {__BUILD_SHA__}</span>
            </p>
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
 * Encabezado de cada pantalla de auth: el chip de marca (mismo sello que el
 * sidebar) en la misma fila que el título; el subtítulo abajo, a todo el
 * ancho, alineado al margen del formulario. En móvil el chip no va — la
 * banda superior ya lleva la marca.
 */
export function AuthHeading({
  titulo,
  subtitulo,
}: {
  titulo: ReactNode
  subtitulo: ReactNode
}) {
  return (
    <div>
      <Reveal>
        <div className="flex items-center gap-3">
          <span className="hidden size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] lg:flex">
            <Leaf className="size-[18px] text-white" strokeWidth={1.75} />
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
