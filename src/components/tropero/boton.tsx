import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

import { Icono, type NombreIcono } from "./icono"

// Botones de Tropero, con las medidas del Figma (página 34, «Botón» 267:13379).
// Regla de la marca: no hay links; todo lo que se toca es un botón.

const FOCO =
  "outline-none focus-visible:ring-3 focus-visible:ring-principal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-fondo"
const BASE = `inline-flex shrink-0 items-center justify-center whitespace-nowrap select-none transition-[background-color,box-shadow,transform,opacity] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ${FOCO}`

const botonVariantes = cva(BASE, {
  variants: {
    tipo: {
      principal: "bg-principal text-principal-texto hover:bg-terracota-600",
      destacado: "bg-destacado text-destacado-texto hover:bg-terracota-600",
      acento: "bg-acento text-acento-texto hover:bg-trigo-500",
      secundario:
        "border-[1.5px] border-principal bg-superficie text-principal hover:bg-principal-suave",
      fantasma: "text-principal hover:bg-principal-suave",
    },
    tamano: {
      normal: "h-11 gap-2 rounded-[10px] px-4 text-[14.5px] font-semibold",
      grande: "h-14 gap-2.5 rounded-[14px] px-6 text-[17px] font-bold",
    },
  },
  defaultVariants: { tipo: "principal", tamano: "normal" },
})

export function Boton({
  tipo,
  tamano,
  icono,
  className,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof botonVariantes> & { icono?: NombreIcono }) {
  return (
    <ButtonPrimitive className={cn(botonVariantes({ tipo, tamano }), className)} {...props}>
      {icono && <Icono nombre={icono} tamano={tamano === "grande" ? 24 : 16} />}
      {children}
    </ButtonPrimitive>
  )
}

/** El botón principal de las pantallas de la 35: píldora terracota a lo ancho,
 *  texto a la izquierda y el ícono en un círculo trigo a la derecha. */
export function BotonPrincipal({
  icono,
  cargando = false,
  className,
  children,
  ...props
}: ButtonPrimitive.Props & { icono: NombreIcono; cargando?: boolean }) {
  return (
    <ButtonPrimitive
      className={cn(
        BASE,
        "w-full justify-between rounded-full bg-principal py-2 pr-2 pl-[26px] text-left text-[16.5px] font-bold text-principal-texto hover:bg-terracota-600",
        className,
      )}
      aria-busy={cargando || undefined}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className="grid size-12 place-items-center rounded-full bg-acento text-acento-texto">
        {cargando ? (
          <span className="size-5 animate-spin rounded-full border-2 border-acento-texto/30 border-t-acento-texto" />
        ) : (
          <Icono nombre={icono} />
        )}
      </span>
    </ButtonPrimitive>
  )
}

/** «Botón chico»: píldora con borde terracota. Es el nivel más chico de acción
 *  (reemplaza a los links). */
export function BotonChico({ className, icono, children, ...props }: ButtonPrimitive.Props & { icono?: NombreIcono }) {
  return (
    <ButtonPrimitive
      className={cn(
        BASE,
        "gap-1.5 rounded-full border-[1.5px] border-principal px-3.5 py-[7px] text-[14.5px] font-bold text-principal hover:bg-principal-suave",
        className,
      )}
      {...props}
    >
      {icono && <Icono nombre={icono} tamano={16} />}
      {children}
    </ButtonPrimitive>
  )
}
