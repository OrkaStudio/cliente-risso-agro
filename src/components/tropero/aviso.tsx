import { cn } from "@/lib/utils"

import { Icono, type NombreIcono } from "./icono"

// «Aviso» del Figma (270:7011): caja suave con borde del estado, radio 10.
const TIPOS = {
  info: "bg-estado-aviso-suave border-estado-aviso text-estado-aviso-texto",
  atencion: "bg-estado-atencion-suave border-estado-atencion text-estado-atencion-texto",
  problema: "bg-estado-problema-suave border-estado-problema text-estado-problema-texto",
  bien: "bg-estado-bien-suave border-estado-bien text-estado-bien-texto",
} as const

export function Aviso({
  tipo = "info",
  icono,
  titulo,
  children,
  className,
}: {
  tipo?: keyof typeof TIPOS
  icono?: NombreIcono
  titulo: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      role={tipo === "problema" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-[10px] border px-4 py-3.5", TIPOS[tipo], className)}
    >
      {icono && <Icono nombre={icono} className="mt-px" />}
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold text-texto">{titulo}</p>
        {children && <div className="mt-0.5 text-[13px] text-texto-suave">{children}</div>}
      </div>
    </div>
  )
}
