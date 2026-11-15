import { Logo } from './logo'

/**
 * Mientras se arma la app (la sesión, la cuenta): la marca, respirando suave.
 * Nunca la pantalla vacía (parece colgada) ni un «Cargando…» suelto.
 */
export function PantallaCargando() {
  return (
    <div role="status" aria-label="Cargando" className="grid min-h-full place-items-center bg-fondo">
      <Logo alto={28} className="motion-safe:animate-[pulse_2.4s_ease-in-out_infinite]" />
    </div>
  )
}

/** Mientras baja una sección: el lugar de la página, sin texto. */
export function SeccionCargando() {
  return <div className="mx-auto h-[280px] w-full ancho-pagina animate-pulse rounded-[22px] bg-superficie-hundida" aria-busy />
}
