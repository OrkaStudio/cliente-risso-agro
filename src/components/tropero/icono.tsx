import { cn } from "@/lib/utils"

import { ICONOS_SVG, type NombreIcono } from "./iconos-svg"

export type { NombreIcono }

// Trazo como en el Figma: 1,75 a 24 px y 1,5 a 16 px. El SVG se dibuja en una
// grilla de 24, así que a 16 px el trazo se escala para que se vea de 1,5.
const TRAZO = { 24: 1.75, 16: 1.5 * (24 / 16) } as const

function expandir(nombre: NombreIcono): string {
  const crudo = ICONOS_SVG[nombre] || ICONOS_SVG.Vaca
  return crudo
    .replaceAll("§", ' stroke="currentColor"')
    .replaceAll("¤", ' fill="currentColor"')
}

const cache = new Map<NombreIcono, string>()

export function Icono({
  nombre,
  tamano = 24,
  className,
  titulo,
}: {
  nombre: NombreIcono
  tamano?: 24 | 16
  className?: string
  /** Texto para lectores de pantalla. Sin título, el ícono es decorativo. */
  titulo?: string
}) {
  let html = cache.get(nombre)
  if (html === undefined) {
    html = expandir(nombre)
    cache.set(nombre, html)
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamano}
      height={tamano}
      fill="none"
      strokeWidth={TRAZO[tamano]}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      role={titulo ? "img" : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
