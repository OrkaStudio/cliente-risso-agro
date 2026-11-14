import { useId } from "react"

import { cn } from "@/lib/utils"

// Campo de texto como en las pantallas de la 35: etiqueta Inter SemiBold 14,
// caja superficie con borde 1,5 y radio 16, texto Inter 16. Foco en terracota,
// error en el color de problema con la ayuda debajo.

export function CampoTexto({
  etiqueta,
  ayuda,
  error,
  unidad,
  className,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  etiqueta: React.ReactNode
  ayuda?: React.ReactNode
  error?: React.ReactNode
  unidad?: string
}) {
  const auto = useId()
  const campoId = id ?? auto
  const ayudaId = `${campoId}-ayuda`
  const mensaje = error ?? ayuda
  return (
    <div className={cn("flex flex-col gap-[7px]", className)}>
      <label htmlFor={campoId} className="text-[14px] font-semibold text-texto">
        {etiqueta}
      </label>
      <div
        className={cn(
          "flex items-center rounded-2xl border-[1.5px] bg-superficie px-[18px] transition-colors focus-within:border-principal",
          error ? "border-estado-problema" : "border-borde",
          props.disabled && "opacity-60",
        )}
      >
        <input
          id={campoId}
          aria-invalid={error ? true : undefined}
          aria-describedby={mensaje ? ayudaId : undefined}
          className="min-w-0 flex-1 bg-transparent py-4 text-[16px] text-texto outline-none placeholder:text-texto-suave/70"
          {...props}
        />
        {unidad && <span className="pl-2 text-[14px] text-texto-suave">{unidad}</span>}
      </div>
      {mensaje && (
        <p
          id={ayudaId}
          className={cn("text-[12.5px]", error ? "text-estado-problema-texto" : "text-texto-suave")}
        >
          {mensaje}
        </p>
      )}
    </div>
  )
}
