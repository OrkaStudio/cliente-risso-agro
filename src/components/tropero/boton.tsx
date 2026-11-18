import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { AnimatePresence, motion } from "framer-motion"

import { LISTO_LLENAR, LISTO_RECOGER } from "@/lib/animacion"
import { cn } from "@/lib/utils"

import { tap, useFallo, useMovimiento } from "./boton-movimiento"
import { Giro, Texto, Tilde, Vuelve } from "./boton-partes"
import { Icono, type NombreIcono } from "./icono"
import type { Accion } from "./use-accion"

// Botones de Troppero, con las medidas del Figma (página 34, «Botón» 267:13379).
// Regla de la marca: no hay links; todo lo que se toca es un botón.
//
// Movimiento (B · Con cuerpo, Lau 18/11): todos se hunden y rebotan al tocarlos. Los que
// hacen algo reciben `accion` (de useAccion) y muestran cargando, «Listo» en pasto,
// «Guardado en el teléfono» o el motivo real si no salió. Ver /estilo/listo.

const FOCO =
  "outline-none focus-visible:ring-3 focus-visible:ring-principal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-fondo"
const BASE = `inline-flex shrink-0 items-center justify-center whitespace-nowrap select-none transition-[background-color,border-color,color,box-shadow,opacity] duration-200 disabled:pointer-events-none disabled:opacity-50 ${FOCO}`

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

/** Cómo dice «Listo» cada tipo (muestra de /estilo/listo): los llenos pasan enteros a pasto
 *  (el pasto sobre terracota no se lee), los de borde y el fantasma pasan a verde monte. */
const LISTO_POR_TIPO = {
  principal: "bg-listo text-listo-texto hover:bg-listo",
  destacado: "bg-listo text-listo-texto hover:bg-listo",
  acento: "bg-listo text-listo-texto hover:bg-listo",
  secundario: "border-listo-fuerte bg-listo-suave text-listo-fuerte hover:bg-listo-suave",
  fantasma: "text-listo-fuerte hover:bg-transparent",
} as const

/** La palabra que muestra el botón según cómo va la acción. */
function palabra(accion: Accion | undefined, children: React.ReactNode): { k: string; texto: React.ReactNode } {
  switch (accion?.estado) {
    case "listo":
      return { k: "listo", texto: "Listo" }
    case "telefono":
      return { k: "telefono", texto: "Guardado en el teléfono" }
    case "motivo":
      return { k: `motivo-${accion.sacudidas}`, texto: accion.motivo }
    case "fallo":
      return { k: "fallo", texto: "Probar de nuevo" }
    default:
      return { k: "reposo", texto: children }
  }
}

/** El ícono que corresponde a cómo va la acción. `null` = el de siempre. */
function iconoDeEstado(accion: Accion | undefined, tamano: 16 | 24): React.ReactNode | null {
  switch (accion?.estado) {
    case "cargando":
      return <Giro className={tamano > 20 ? "size-5" : "size-4"} />
    case "listo":
      return <Tilde tamano={tamano} />
    case "telefono":
      return <Icono nombre="Celular" tamano={tamano} />
    case "motivo":
    case "fallo":
      return <Icono nombre="Reintentar" tamano={tamano} />
    default:
      return null
  }
}

/** Lo que oye quien usa lector de pantalla cuando la acción termina. */
function Aviso({ accion }: { accion?: Accion }) {
  if (!accion) return null
  const texto = accion.estado === "listo" ? "Listo" : accion.estado === "telefono" ? "Guardado en el teléfono" : accion.estado === "motivo" ? accion.motivo : ""
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {texto}
    </span>
  )
}

type ConAccion = {
  /** La acción de useAccion. Con ella el botón muestra cargando, «Listo» o el motivo. */
  accion?: Accion
}

export function Boton({
  tipo,
  tamano,
  icono,
  accion,
  className,
  children,
  onClick,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof botonVariantes> & { icono?: NombreIcono } & ConAccion) {
  const scope = useMovimiento(accion)
  const t: 16 | 24 = tamano === "grande" ? 24 : 16
  const listo = accion?.estado === "listo"
  const { k, texto } = palabra(accion, children)
  const estadoIcono = iconoDeEstado(accion, t)
  return (
    <>
      <ButtonPrimitive
        ref={scope}
        render={<motion.button data-movimiento="" whileTap={tap(1, true)} />}
        className={cn(botonVariantes({ tipo, tamano }), listo && LISTO_POR_TIPO[tipo ?? "principal"], className)}
        aria-busy={accion?.estado === "cargando" || undefined}
        onClick={accion ? () => void accion.correr() : onClick}
        {...props}
      >
        {estadoIcono ?? (icono && (accion ? <Vuelve><Icono nombre={icono} tamano={t} /></Vuelve> : <Icono nombre={icono} tamano={t} />))}
        {accion ? <Texto k={k}>{texto}</Texto> : children}
      </ButtonPrimitive>
      <Aviso accion={accion} />
    </>
  )
}

/** El botón principal de las pantallas de la 35: píldora terracota a lo ancho,
 *  texto a la izquierda y el ícono en un círculo trigo a la derecha. Al «Listo», el
 *  círculo se llena de pasto desde el centro; al volver, el pasto se recoge. */
export function BotonPrincipal({
  icono,
  cargando = false,
  accion: propia,
  fallo,
  className,
  children,
  onClick,
  ...props
}: ButtonPrimitive.Props & {
  icono: NombreIcono
  cargando?: boolean
  /** Para los flujos con su propio `correr`: el motivo del último fallo. El botón se sacude,
   *  lo dice un momento y pasa a «Probar de nuevo» (como con `accion`), sin cambiar su onClick. */
  fallo?: string | null
} & ConAccion) {
  // Lo que se muestra sale de la acción propia o, si no hay, del fallo del flujo.
  const delFlujo = useFallo(propia ? undefined : fallo, propia ? false : cargando)
  const accion = propia ?? delFlujo
  const scope = useMovimiento(accion)
  const listo = accion?.estado === "listo"
  const ocupado = cargando || accion?.estado === "cargando"
  const { k, texto } = palabra(accion, children)
  const estadoIcono = iconoDeEstado(accion, 24)
  return (
    <>
      <ButtonPrimitive
        ref={scope}
        render={<motion.button data-movimiento="" whileTap={tap(1)} />}
        className={cn(
          BASE,
          "group/principal w-full justify-between rounded-full bg-principal py-2 pr-2 pl-[26px] text-left text-[16.5px] font-bold text-principal-texto hover:bg-terracota-600",
          // Apagado (no cargando): gris de la marca, que se distingue hasta en blanco y negro (QA 10/11, B3).
          "disabled:opacity-100 [&:disabled:not([aria-busy])]:opacity-60",
          className,
        )}
        aria-busy={ocupado || undefined}
        onClick={propia ? () => void propia.correr() : onClick}
        {...props}
      >
        <span className="min-w-0 flex-1 truncate">{accion ? <Texto k={k}>{texto}</Texto> : children}</span>
        <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-acento text-acento-texto">
          <AnimatePresence initial={false}>
            {listo && (
              <motion.span
                key="listo"
                className="absolute inset-0 rounded-full bg-listo"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0, transition: LISTO_RECOGER }}
                transition={LISTO_LLENAR}
              />
            )}
          </AnimatePresence>
          <span className={cn("relative grid place-items-center", listo && "text-listo-texto")}>
            {cargando ? <Giro className="size-5" /> : (estadoIcono ?? (accion ? <Vuelve><Icono nombre={icono} /></Vuelve> : <Icono nombre={icono} />))}
          </span>
        </span>
      </ButtonPrimitive>
      <Aviso accion={accion} />
    </>
  )
}

/** «Botón chico»: píldora con borde terracota. Es el nivel más chico de acción
 *  (reemplaza a los links). Al «Listo», borde y letra verde monte sobre pasto suave. */
export function BotonChico({ className, icono, accion, children, onClick, ...props }: ButtonPrimitive.Props & { icono?: NombreIcono } & ConAccion) {
  const scope = useMovimiento(accion)
  const listo = accion?.estado === "listo"
  const { k, texto } = palabra(accion, children)
  const estadoIcono = iconoDeEstado(accion, 16)
  return (
    <>
      <ButtonPrimitive
        ref={scope}
        render={<motion.button data-movimiento="" whileTap={tap(1, true)} />}
        className={cn(
          BASE,
          // 44 px de alto como mínimo: se toca con el dedo (QA 10/11, A7).
          "min-h-11 gap-1.5 rounded-full border-[1.5px] border-principal px-3.5 py-[7px] text-[14.5px] font-bold text-principal hover:bg-principal-suave",
          listo && "border-listo-fuerte bg-listo-suave text-listo-fuerte hover:bg-listo-suave",
          className,
        )}
        aria-busy={accion?.estado === "cargando" || undefined}
        onClick={accion ? () => void accion.correr() : onClick}
        {...props}
      >
        {estadoIcono ?? (icono && (accion ? <Vuelve><Icono nombre={icono} tamano={16} /></Vuelve> : <Icono nombre={icono} tamano={16} />))}
        {accion ? <Texto k={k}>{texto}</Texto> : children}
      </ButtonPrimitive>
      <Aviso accion={accion} />
    </>
  )
}
