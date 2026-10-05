import { cn } from "@/lib/utils"

import { Icono, type NombreIcono } from "./icono"

// «Chip» del Figma (268:6988): píldora de 25 px, Inter SemiBold 12,5.
const TIPOS = {
  neutro: "bg-superficie-hundida text-texto",
  bien: "bg-estado-bien-suave text-estado-bien-texto",
  atencion: "bg-estado-atencion-suave text-estado-atencion-texto",
  problema: "bg-estado-problema-suave text-estado-problema-texto",
  aviso: "bg-estado-aviso-suave text-estado-aviso-texto",
  marca: "bg-acento text-acento-texto",
} as const

export function Chip({
  tipo = "neutro",
  icono,
  className,
  children,
}: {
  tipo?: keyof typeof TIPOS
  icono?: NombreIcono
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[25px] items-center gap-1.5 rounded-full pr-3 pl-2.5 text-[12.5px] font-semibold whitespace-nowrap",
        !icono && "pl-3",
        TIPOS[tipo],
        className,
      )}
    >
      {icono && <Icono nombre={icono} tamano={16} />}
      {children}
    </span>
  )
}
