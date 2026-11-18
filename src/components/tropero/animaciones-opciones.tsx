// Las personalidades del botón principal para /estilo/animaciones.
// Son rediseños de prueba: no reemplazan a BotonPrincipal hasta que se elija.
//   A · Sobria: rápida y quieta. Casi no se mueve, pero contesta siempre.
//   B · Con cuerpo: física. Se hunde, rebota y cambia de forma.
//   C · Con la marca: el trigo llena el botón y el «Listo» cae como un sello.
//   D · Se desliza: el círculo cruza la píldora al apretar y espera del otro lado. Tomado del
//       botón con ícono de shadcnspace (button-01, MIT), que lo hace al pasar el mouse.
// Fran eligió B y C el 18/11 y pidió probar la D; la A queda sólo en Cargando y Listo.
import { animate, AnimatePresence, motion, useAnimate, useMotionValue, useReducedMotion, useTransform } from "framer-motion"
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"

import { CURVA } from "@/lib/animacion"
import { cn } from "@/lib/utils"

import { esperar, MONTO, useAccion, useVelocidad, type Fase } from "./animaciones-base"
import { BotonChico } from "./boton"
import { Icono, type NombreIcono } from "./icono"
import { BotonVolver, Grupo, Opciones } from "./panel-lateral"

export type Personalidad = "cuerpo" | "marca" | "desliza"

type BotonLabProps = {
  fase: Fase
  texto: string
  icono: NombreIcono
  /** Sólo la Sobria lo usa: el texto mientras carga («Anotando…»). */
  textoCargando?: string
  /** Lo que dice al terminar o al fallar. Si falta: «Listo», «En el teléfono» o el texto de siempre. */
  textoFin?: string
  /** El ícono del círculo cuando falla: «Reintentar» si se puede volver a probar. */
  iconoError?: NombreIcono
  /** Se ve apagado pero se puede tocar, para explicar qué falta. */
  apagado?: boolean
  /** Cambia con cada «no» (un error o un toque apagado): dispara la sacudida. */
  sacudida?: number
  /** Desde el toque hasta que termina; la D lo usa para cruzar enseguida, sin esperar al cargando. */
  trabajando?: boolean
  onClick: () => void
}

// La píldora de BotonPrincipal (boton.tsx), sin el «baja 1 px» de hoy: cada personalidad pone el suyo.
const PILDORA =
  "relative inline-flex items-center justify-between gap-3 rounded-full bg-principal py-2 pr-2 text-left text-[16.5px] font-bold whitespace-nowrap text-principal-texto outline-none select-none focus-visible:ring-3 focus-visible:ring-principal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-fondo"

// El color del círculo según cómo salió. Atención va con ícono tinta: blanco sobre ámbar no se lee.
const CAPA: Partial<Record<Fase, string>> = { listo: "bg-estado-bien", telefono: "bg-estado-atencion", error: "bg-estado-problema" }
const TINTA: Partial<Record<Fase, string>> = { listo: "text-superficie", telefono: "text-tinta", error: "text-superficie" }

function iconoDe(fase: Fase, icono: NombreIcono, iconoError?: NombreIcono): NombreIcono {
  if (fase === "listo") return "Guardar"
  if (fase === "telefono") return "Sin señal"
  if (fase === "error") return iconoError ?? "Cerrar"
  return icono
}

function etiquetaDe({ fase, texto, textoFin, textoCargando }: Pick<BotonLabProps, "fase" | "texto" | "textoFin" | "textoCargando">) {
  if (fase === "listo") return textoFin ?? "Listo"
  if (fase === "telefono") return textoFin ?? "En el teléfono"
  if (fase === "error") return textoFin ?? texto
  if (fase === "cargando" && textoCargando) return textoCargando
  return texto
}

const avisoListo = () => toast.success(`Listo: salieron ${MONTO}`, { description: "Lo ves en los movimientos." })

/** El mismo círculo que gira de hoy. */
function Girando() {
  return <span className="size-5 animate-spin rounded-full border-2 border-acento-texto/30 border-t-acento-texto" />
}

/** La capa de color del círculo: se funde al cambiar de estado. */
function CapaEstado({ fase, duracion }: { fase: Fase; duracion: number }) {
  return (
    <AnimatePresence initial={false}>
      {CAPA[fase] && (
        <motion.span key={fase} aria-hidden className={cn("absolute inset-0", CAPA[fase])} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: duracion }} />
      )}
    </AnimatePresence>
  )
}

/** El «no»: mueve el contenedor de costado cada vez que cambia `sacudida`. */
function useSacudida(sacudida: number | undefined, recorrido: number[], duracion: number) {
  const [scope, animar] = useAnimate<HTMLDivElement>()
  const reducir = useReducedMotion()
  const previo = useRef(sacudida)
  useEffect(() => {
    if (sacudida === previo.current) return
    previo.current = sacudida
    if (!sacudida || reducir) return
    void animar(scope.current, { x: recorrido }, { duration: duracion })
  }, [sacudida, recorrido, duracion, reducir, animar, scope])
  return scope
}

// ===== A · Sobria =====

export function BotonSobrio(props: BotonLabProps) {
  const { fase, icono, iconoError, onClick } = props
  const f = useVelocidad()
  const suave = { duration: 0.15 * f, ease: CURVA }
  const etiqueta = etiquetaDe(props)
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-busy={fase === "cargando" || undefined}
      whileTap={{ scale: 0.98, transition: { duration: 0.08 * f } }}
      transition={suave}
      className={cn(PILDORA, "w-full pl-[26px] transition-colors hover:bg-terracota-600")}
    >
      <span className="grid min-w-0 flex-1">
        <AnimatePresence initial={false}>
          <motion.span key={etiqueta} className="truncate [grid-area:1/1]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={suave}>
            {etiqueta}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-acento text-acento-texto">
        <CapaEstado fase={fase} duracion={0.15 * f} />
        <AnimatePresence initial={false}>
          <motion.span
            key={fase}
            className={cn("relative grid place-items-center [grid-area:1/1]", TINTA[fase])}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={suave}
          >
            {fase === "cargando" ? <Girando /> : <Icono nombre={iconoDe(fase, icono, iconoError)} />}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.button>
  )
}

// ===== B · Con cuerpo =====

const SACUDIDA_B = [0, -10, 9, -6, 4, -2, 0]

export function BotonConCuerpo(props: BotonLabProps) {
  const { fase, icono, iconoError, apagado, sacudida, onClick } = props
  const f = useVelocidad()
  const reducir = useReducedMotion()
  const scope = useSacudida(sacudida, SACUDIDA_B, 0.42 * f)
  const [ancho, setAncho] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = scope.current
    if (!el) return
    const ro = new ResizeObserver(() => setAncho(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [scope])
  const resorte = { type: "spring", visualDuration: 0.35 * f, bounce: 0.25 } as const
  const salto = { type: "spring", visualDuration: 0.3 * f, bounce: 0.55 } as const
  // Mientras carga, la píldora se encoge hasta quedar sólo el círculo (64 px = círculo y su borde).
  const encogido = fase === "cargando" && !reducir
  const etiqueta = etiquetaDe(props)
  return (
    <div ref={scope} className="flex w-full justify-end">
      <motion.button
        type="button"
        onClick={onClick}
        aria-busy={fase === "cargando" || undefined}
        aria-disabled={apagado || undefined}
        initial={false}
        animate={{ width: encogido ? 64 : (ancho ?? "100%"), paddingLeft: encogido ? 8 : 26, columnGap: encogido ? 0 : 12, opacity: apagado ? 0.6 : 1 }}
        whileTap={{ scale: 0.95 }}
        transition={{ ...resorte, scale: { type: "spring", visualDuration: 0.2 * f, bounce: 0.55 }, opacity: { duration: 0.15 * f } }}
        className={cn(PILDORA, "overflow-hidden", !apagado && "transition-colors hover:bg-terracota-600")}
      >
        <motion.span className="grid min-w-0 flex-1" animate={{ opacity: encogido ? 0 : 1 }} transition={{ duration: 0.12 * f }}>
          <AnimatePresence initial={false}>
            <motion.span
              key={etiqueta}
              className="truncate [grid-area:1/1]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={salto}
            >
              {etiqueta}
            </motion.span>
          </AnimatePresence>
        </motion.span>
        <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-acento text-acento-texto">
          <CapaEstado fase={fase} duracion={0.12 * f} />
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={fase}
              className={cn("relative grid place-items-center", TINTA[fase])}
              initial={{ opacity: 0, scale: CAPA[fase] ? 0.3 : 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={salto}
            >
              {fase === "cargando" ? (
                <Girando />
              ) : fase === "telefono" && !reducir ? (
                // Late mientras dice que quedó en el teléfono: falta subir.
                <motion.span className="grid place-items-center" animate={{ scale: [1, 1.14, 1] }} transition={{ duration: 1.1 * f, repeat: Infinity, ease: "easeInOut" }}>
                  <Icono nombre="Sin señal" />
                </motion.span>
              ) : (
                <Icono nombre={iconoDe(fase, icono, iconoError)} />
              )}
            </motion.span>
          </AnimatePresence>
        </span>
      </motion.button>
    </div>
  )
}

// ===== C · Con la marca =====

const SACUDIDA_C = [0, -3, 3, -3, 3, -2, 2, 0]

export function BotonConMarca(props: BotonLabProps) {
  const { fase, texto, icono, iconoError, apagado, sacudida, onClick } = props
  const f = useVelocidad()
  const reducir = useReducedMotion()
  const scope = useSacudida(sacudida, SACUDIDA_C, 0.36 * f)
  // Cuánto del botón cubre el trigo, de 0 a 100. Donde pasa, el texto se invierte a tinta.
  const lleno = useMotionValue(0)
  const recorte = useTransform(lleno, (v) => `inset(0 ${100 - v}% 0 0)`)
  const cubre = fase === "listo" || fase === "telefono"
  useEffect(() => {
    if (reducir) {
      lleno.set(cubre ? 100 : 0)
      return
    }
    // Sin saber cuánto falta, avanza rápido al principio y se frena antes del final.
    const c =
      fase === "cargando"
        ? animate(lleno, 92, { duration: 2.4 * f, ease: [0.1, 0.6, 0.3, 1] })
        : cubre
          ? animate(lleno, 100, { duration: 0.18 * f, ease: CURVA })
          : animate(lleno, 0, { duration: (fase === "error" ? 0.25 : 0.45) * f, ease: CURVA })
    return () => c.stop()
  }, [fase, cubre, f, lleno, reducir])
  const empuje = { type: "spring", visualDuration: 0.18 * f, bounce: 0.5 } as const
  const etiqueta = fase === "error" ? (props.textoFin ?? texto) : texto
  return (
    <div ref={scope} className="w-full">
      <motion.button
        type="button"
        onClick={onClick}
        aria-busy={fase === "cargando" || undefined}
        aria-disabled={apagado || undefined}
        whileTap="apretado"
        initial={false}
        animate={{ opacity: apagado ? 0.6 : 1 }}
        transition={{ duration: 0.15 * f }}
        className={cn(PILDORA, "w-full overflow-hidden pl-[26px]")}
      >
        <span className="grid min-w-0 flex-1">
          <AnimatePresence initial={false}>
            <motion.span key={etiqueta} className="truncate [grid-area:1/1]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 * f }}>
              {etiqueta}
            </motion.span>
          </AnimatePresence>
        </span>
        <motion.span variants={{ apretado: { x: 5 } }} transition={empuje} className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-acento text-acento-texto">
          <CapaEstado fase={fase === "error" ? "error" : "reposo"} duracion={0.12 * f} />
          <span className={cn("relative grid place-items-center", fase === "error" && "text-superficie")}>
            {fase === "cargando" && reducir ? <Girando /> : <Icono nombre={fase === "error" ? (iconoError ?? "Cerrar") : icono} />}
          </span>
        </motion.span>
        {/* La capa de trigo: el mismo botón invertido, recortado hasta donde llegó. */}
        <motion.span
          aria-hidden
          style={{ clipPath: recorte }}
          className="pointer-events-none absolute inset-0 flex items-center justify-between gap-3 rounded-full bg-acento py-2 pr-2 pl-[26px] text-acento-texto"
        >
          <span className="flex min-w-0 flex-1 items-center">
            {cubre ? (
              // El sello: «Listo» con borde lleno; «En el teléfono» punteado, porque todavía falta subir.
              <motion.span
                key={fase}
                initial={{ scale: 1.8, opacity: 0, rotate: -14 }}
                animate={{ scale: 1, opacity: 1, rotate: -5 }}
                transition={{ type: "spring", visualDuration: 0.28 * f, bounce: 0.35 }}
                className={cn(
                  "titulo-display rounded-[8px] border-[2.5px] border-acento-texto px-2.5 py-0.5 tracking-[0.06em] uppercase",
                  fase === "telefono" ? "border-dashed text-[14px]" : "text-[17px]",
                )}
              >
                {fase === "telefono" ? "En el teléfono" : "Listo"}
              </motion.span>
            ) : (
              <span className="truncate">{etiqueta}</span>
            )}
          </span>
          <motion.span variants={{ apretado: { x: 5 } }} transition={empuje} className="grid size-12 shrink-0 place-items-center rounded-full bg-principal text-principal-texto">
            <Icono nombre={fase === "listo" ? "Guardar" : fase === "telefono" ? "Sin señal" : icono} />
          </motion.span>
        </motion.span>
      </motion.button>
    </div>
  )
}

// ===== D · Se desliza =====

export function BotonDesliza(props: BotonLabProps) {
  const { fase, icono, iconoError, apagado, sacudida, trabajando, onClick } = props
  const f = useVelocidad()
  const reducir = useReducedMotion()
  const scope = useSacudida(sacudida, SACUDIDA_C, 0.36 * f)
  const [ancho, setAncho] = useState(0)
  useLayoutEffect(() => {
    const el = scope.current
    if (!el) return
    const ro = new ResizeObserver(() => setAncho(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [scope])
  const [apretado, setApretado] = useState(false)
  // Cruza al apretar y se queda del otro lado mientras trabaja y mientras muestra cómo salió.
  const cruza = !apagado && !reducir && (apretado || !!trabajando || fase !== "reposo")
  // De la derecha a la izquierda: el ancho menos el círculo (48) y sus dos márgenes (8 y 8).
  const recorrido = Math.max(ancho - 64, 0)
  const viaje = { duration: 0.5 * f, ease: CURVA }
  const etiqueta = etiquetaDe(props)
  return (
    <div ref={scope} className="w-full">
      <motion.button
        type="button"
        onClick={onClick}
        aria-busy={fase === "cargando" || undefined}
        aria-disabled={apagado || undefined}
        onTapStart={() => setApretado(true)}
        onTap={() => setApretado(false)}
        onTapCancel={() => setApretado(false)}
        initial={false}
        animate={{ paddingLeft: cruza ? 74 : 26, paddingRight: cruza ? 26 : 74, opacity: apagado ? 0.6 : 1 }}
        transition={{ ...viaje, opacity: { duration: 0.15 * f } }}
        className={cn(PILDORA, "h-16 w-full overflow-hidden", !apagado && "transition-colors hover:bg-terracota-600")}
      >
        <span className="grid min-w-0 flex-1">
          <AnimatePresence initial={false}>
            <motion.span key={etiqueta} className="truncate [grid-area:1/1]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 * f }}>
              {etiqueta}
            </motion.span>
          </AnimatePresence>
        </span>
        <motion.span
          className="absolute top-2 right-2 grid size-12 place-items-center overflow-hidden rounded-full bg-acento text-acento-texto"
          initial={false}
          animate={{ x: cruza ? -recorrido : 0 }}
          transition={viaje}
        >
          <CapaEstado fase={fase} duracion={0.15 * f} />
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={fase}
              className={cn("relative grid place-items-center", TINTA[fase])}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.2 * f, ease: CURVA }}
            >
              {fase === "cargando" ? <Girando /> : <Icono nombre={iconoDe(fase, icono, iconoError)} />}
            </motion.span>
          </AnimatePresence>
        </motion.span>
      </motion.button>
    </div>
  )
}

// ===== Los botones chicos (Boton y BotonChico), para «Tocar» =====

const SIMPLE = {
  principal: "h-11 gap-2 rounded-[10px] bg-principal px-4 text-[14.5px] font-semibold text-principal-texto hover:bg-terracota-600",
  secundario: "h-11 gap-2 rounded-[10px] border-[1.5px] border-principal bg-superficie px-4 text-[14.5px] font-semibold text-principal hover:bg-principal-suave",
  chico: "min-h-11 gap-1.5 rounded-full border-[1.5px] border-principal px-3.5 py-[7px] text-[14.5px] font-bold text-principal hover:bg-principal-suave",
} as const

function BotonSimple({ p, tipo, icono, children }: { p: Personalidad; tipo: keyof typeof SIMPLE; icono?: NombreIcono; children: React.ReactNode }) {
  const f = useVelocidad()
  const clase = cn(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap outline-none select-none transition-colors focus-visible:ring-3 focus-visible:ring-principal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-fondo",
    SIMPLE[tipo],
  )
  if (p === "cuerpo") {
    return (
      <motion.button type="button" whileTap={{ scale: 0.93 }} transition={{ type: "spring", visualDuration: 0.2 * f, bounce: 0.55 }} className={clase}>
        {icono && <Icono nombre={icono} tamano={16} />}
        {children}
      </motion.button>
    )
  }
  // Con la marca: la píldora no se mueve; el ícono empuja hacia adelante y el fondo se oscurece.
  return (
    <motion.button type="button" whileTap="apretado" className={cn(clase, tipo === "principal" ? "active:bg-terracota-700" : "active:bg-principal-suave")}>
      {icono && (
        <motion.span variants={{ apretado: { x: 3 } }} transition={{ type: "spring", visualDuration: 0.18 * f, bounce: 0.5 }} className="inline-flex">
          <Icono nombre={icono} tamano={16} />
        </motion.span>
      )}
      {children}
    </motion.button>
  )
}

// ===== Las demostraciones de cada momento =====

const BOTON: Record<Personalidad, ComponentType<BotonLabProps>> = { cuerpo: BotonConCuerpo, marca: BotonConMarca, desliza: BotonDesliza }

/** Cómo aparece un mensaje (el motivo de un error, lo que falta subir): con resorte o deslizándose como el trigo. */
function useEntrada(p: Personalidad) {
  const f = useVelocidad()
  return p === "cuerpo"
    ? {
        initial: { opacity: 0, y: 10, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -6 },
        transition: { type: "spring", visualDuration: 0.35 * f, bounce: 0.3 } as const,
      }
    : {
        initial: { opacity: 0, clipPath: "inset(0 100% 0 0 round 14px)" },
        animate: { opacity: 1, clipPath: "inset(0 0% 0 0 round 14px)" },
        exit: { opacity: 0 },
        transition: { duration: 0.4 * f, ease: CURVA },
      }
}

function Rotulo({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[13px] font-semibold text-texto-suave", className)}>{children}</p>
}

/** Dos botones: uno que tarda y otro que contesta enseguida (ahí se ve si parpadea). */
export function DemoCargando({ Boton, textoCargando }: { Boton: ComponentType<BotonLabProps>; textoCargando?: string }) {
  const lento = useAccion()
  const rapido = useAccion()
  return (
    <div className="flex flex-col gap-2">
      <Rotulo>Tarda 2 segundos</Rotulo>
      <Boton fase={lento.fase} trabajando={lento.trabajando} texto={`Anotar ${MONTO}`} textoCargando={textoCargando} icono="Guardar" onClick={() => void lento.correr(2000, null)} />
      <Rotulo className="mt-2">Tarda 0,2 segundos</Rotulo>
      <Boton fase={rapido.fase} trabajando={rapido.trabajando} texto={`Anotar ${MONTO}`} textoCargando={textoCargando} icono="Guardar" onClick={() => void rapido.correr(200, null)} />
    </div>
  )
}

/** Anotar: carga, dice que salió en el mismo botón y deja el aviso de abajo para el detalle. */
export function DemoListo({ Boton, textoCargando }: { Boton: ComponentType<BotonLabProps>; textoCargando?: string }) {
  const accion = useAccion()
  return <Boton fase={accion.fase} trabajando={accion.trabajando} texto={`Anotar ${MONTO}`} textoCargando={textoCargando} icono="Guardar" onClick={() => void accion.correr(1200, "listo", avisoListo)} />
}

export function DemoTocar({ p }: { p: Personalidad }) {
  const Boton = BOTON[p]
  return (
    <div className="flex flex-col gap-3">
      <Boton fase="reposo" texto="Seguir" icono="Siguiente" onClick={() => {}} />
      <div className="flex flex-wrap items-center gap-2">
        <BotonSimple p={p} tipo="principal" icono="Guardar">
          Guardar
        </BotonSimple>
        <BotonSimple p={p} tipo="secundario">
          Cancelar
        </BotonSimple>
        <BotonSimple p={p} tipo="chico" icono="Agregar">
          Agregar
        </BotonSimple>
      </div>
    </div>
  )
}

/** Sin señal: se guarda en el teléfono al instante y queda anotado lo que falta subir. */
export function DemoTelefono({ p }: { p: Personalidad }) {
  const Boton = BOTON[p]
  const entrada = useEntrada(p)
  const accion = useAccion()
  const [sinSubir, setSinSubir] = useState(0)
  const [subiendo, setSubiendo] = useState(false)
  async function volvioLaSenal() {
    setSubiendo(true)
    await esperar(1500)
    setSubiendo(false)
    setSinSubir(0)
  }
  return (
    <div className="flex flex-col gap-3">
      <Boton fase={accion.fase} trabajando={accion.trabajando} texto="Anotar sin señal" icono="Guardar" onClick={() => void accion.correr(0, "telefono", () => setSinSubir((n) => n + 1))} />
      <AnimatePresence initial={false}>
        {sinSubir > 0 && (
          <motion.p key="pendiente" {...entrada} className="flex items-center gap-2.5 rounded-[14px] bg-fondo px-4 py-3 text-[14px] text-texto-suave">
            <span className={cn("inline-flex", subiendo && "animate-spin")}>
              <Icono nombre="Reintentar" tamano={16} />
            </span>
            <span>
              <b className="text-texto">{sinSubir === 1 ? "1 observación" : `${sinSubir} observaciones`}</b> sin subir: se sube sola.
            </span>
          </motion.p>
        )}
      </AnimatePresence>
      {sinSubir > 0 && !subiendo && (
        <BotonChico icono="Reintentar" onClick={() => void volvioLaSenal()} className="self-start">
          Volvió la señal
        </BotonChico>
      )}
    </div>
  )
}

/** Falla de dos formas: falta un dato (al instante) o no se pudo guardar (después de cargar). */
export function DemoFallo({ p }: { p: Personalidad }) {
  const Boton = BOTON[p]
  const entrada = useEntrada(p)
  const [error, setError] = useState<string | null>(null)
  const [toques, setToques] = useState(0)
  const guardar = useAccion()
  const intentos = useRef(0)
  return (
    <div className="flex flex-col gap-2">
      <Rotulo>Falta un dato</Rotulo>
      <AnimatePresence initial={false}>
        {error && (
          <motion.p key="error" role="alert" {...entrada} className="rounded-[14px] bg-estado-problema-suave px-4 py-2.5 text-[14px] font-semibold text-estado-problema-texto">
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      <Boton
        fase={error ? "error" : "reposo"}
        texto="Seguir"
        icono="Siguiente"
        sacudida={toques}
        onClick={() => {
          setError("Escribí cuánto fue.")
          setToques((n) => n + 1)
        }}
      />
      {error && (
        <BotonChico onClick={() => setError(null)} className="self-start">
          Empezar de nuevo
        </BotonChico>
      )}
      <Rotulo className="mt-3">No se pudo guardar (el segundo intento sale)</Rotulo>
      <Boton
        fase={guardar.fase}
        trabajando={guardar.trabajando}
        texto={`Anotar ${MONTO}`}
        textoFin={guardar.fase === "error" ? "Falló. Tocá de nuevo" : undefined}
        icono="Guardar"
        iconoError="Reintentar"
        sacudida={guardar.fallos}
        onClick={() => {
          const falla = intentos.current % 2 === 0
          intentos.current += 1
          void guardar.correr(1200, falla ? "error" : "listo", falla ? undefined : avisoListo)
        }}
      />
    </div>
  )
}

/** Apagado, pero se puede tocar: dice que no y explica qué falta. */
export function DemoApagado({ p }: { p: Personalidad }) {
  const Boton = BOTON[p]
  const entrada = useEntrada(p)
  const [toques, setToques] = useState(0)
  return (
    <div className="flex flex-col gap-2">
      <Boton fase="reposo" texto="Prendido" icono="Siguiente" onClick={() => {}} />
      <Rotulo className="mt-2">Tocá el apagado</Rotulo>
      <Boton fase="reposo" texto="Seguir" icono="Siguiente" apagado sacudida={toques} onClick={() => setToques((n) => n + 1)} />
      <AnimatePresence initial={false}>
        {toques > 0 && (
          <motion.p key="motivo" {...entrada} className="rounded-[14px] bg-fondo px-4 py-2.5 text-[14px] font-semibold text-texto-suave">
            Para seguir, elegí el campo.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

const PASOS = ["Cuánto y en qué", "De dónde y cuándo", "El detalle, si querés"] as const

/** «Anotar plata» en tres pasos, con el paso que entra por el costado hacia donde se avanza. */
export function DemoPasos({ p }: { p: Personalidad }) {
  const f = useVelocidad()
  const reducir = useReducedMotion()
  const Boton = BOTON[p]
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [direccion, setDireccion] = useState(1)
  const [de, setDe] = useState<string[]>(["caja"])
  const fin = useAccion()
  function ir(n: 1 | 2 | 3) {
    setDireccion(n > paso ? 1 : -1)
    setPaso(n)
  }
  const mov = p === "cuerpo" ? ({ type: "spring", visualDuration: 0.4 * f, bounce: 0.22 } as const) : { duration: 0.34 * f, ease: CURVA }
  const distancia = reducir ? 0 : p === "cuerpo" ? 64 : 40
  return (
    <div className="flex flex-col gap-4 overflow-hidden rounded-[22px] border border-borde bg-fondo p-5">
      <div>
        {paso > 1 && (
          <BotonVolver onClick={() => ir((paso - 1) as 1 | 2)} className="mb-3">
            Volver
          </BotonVolver>
        )}
        <p className="font-heading text-[22px] leading-[1.05] font-extrabold tracking-[-0.02em] text-texto">Anotar plata</p>
        <span className="mt-1.5 flex flex-col gap-2 text-[14px] text-texto-suave">
          <span className="flex gap-1.5" aria-hidden>
            {[1, 2, 3].map((n) => (
              <span key={n} className="relative h-1.5 w-8 overflow-hidden rounded-full bg-borde">
                {/* Con la marca, el paso que estás llenando es trigo; los terminados, terracota. */}
                <motion.span
                  className={cn("absolute inset-0 origin-left rounded-full", p === "marca" && n === paso ? "bg-acento" : "bg-principal")}
                  initial={false}
                  animate={{ scaleX: n <= paso ? 1 : 0 }}
                  transition={mov}
                />
              </span>
            ))}
          </span>
          <span className="grid">
            <AnimatePresence initial={false}>
              <motion.span key={paso} className="[grid-area:1/1]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 * f }}>
                Paso {paso} de 3: {PASOS[paso - 1]}
              </motion.span>
            </AnimatePresence>
          </span>
        </span>
      </div>
      <div className="relative min-h-[88px]">
        <AnimatePresence initial={false} custom={direccion} mode="popLayout">
          <motion.div
            key={paso}
            custom={direccion}
            variants={{
              entra: (d: number) => ({ x: distancia * d, opacity: 0 }),
              centro: { x: 0, opacity: 1 },
              sale: (d: number) => ({ x: -distancia * d, opacity: 0 }),
            }}
            initial="entra"
            animate="centro"
            exit="sale"
            transition={mov}
          >
            {paso === 1 && <p className="titulo-display cifra text-[40px] leading-tight text-estado-problema-texto">−{MONTO}</p>}
            {paso === 2 && (
              <Grupo titulo="De dónde salió">
                <Opciones
                  etiqueta="De dónde salió"
                  opciones={[
                    { valor: "caja", texto: "Caja" },
                    { valor: "banco", texto: "Banco" },
                  ]}
                  elegidas={de}
                  onTocar={(v) => setDe([v])}
                />
              </Grupo>
            )}
            {paso === 3 && <p className="text-[15px] text-texto-suave">Una nota, la foto del comprobante o el IVA.</p>}
          </motion.div>
        </AnimatePresence>
      </div>
      {paso < 3 ? (
        <Boton fase="reposo" texto="Seguir" icono="Siguiente" onClick={() => ir((paso + 1) as 2 | 3)} />
      ) : (
        <Boton fase={fin.fase} trabajando={fin.trabajando} texto={`Anotar ${MONTO}`} icono="Guardar" onClick={() => void fin.correr(1200, "listo", avisoListo).then((corrio) => corrio && ir(1))} />
      )}
    </div>
  )
}

/** Un panel de prueba que entra con la personalidad y se cierra solo después del «Listo». */
export function DemoPanel({ p }: { p: Personalidad }) {
  const f = useVelocidad()
  const reducir = useReducedMotion()
  const Boton = BOTON[p]
  const [abierto, setAbierto] = useState(false)
  const accion = useAccion()
  useEffect(() => {
    if (!abierto) return
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false)
    window.addEventListener("keydown", alTeclear)
    return () => window.removeEventListener("keydown", alTeclear)
  }, [abierto])
  const entrada = p === "cuerpo" ? ({ type: "spring", visualDuration: 0.45 * f, bounce: 0.2 } as const) : { duration: 0.34 * f, ease: CURVA }
  const afuera = reducir ? { opacity: 0 } : { x: "115%" }
  return (
    <>
      <Boton fase="reposo" texto="Anotar plata" icono="Agregar" onClick={() => setAbierto(true)} />
      {createPortal(
        <AnimatePresence>
          {abierto && (
            <motion.div
              key="fondo"
              className="fixed inset-0 z-50 bg-tinta/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 * f }}
              onClick={() => setAbierto(false)}
            />
          )}
          {abierto && (
            <motion.div
              key="panel"
              role="dialog"
              aria-modal="true"
              aria-label="Anotar plata"
              initial={afuera}
              animate={{ x: 0, opacity: 1 }}
              exit={afuera}
              transition={entrada}
              className="fixed top-4 right-4 z-50 flex w-full max-w-[460px] flex-col rounded-[28px] bg-fondo shadow-[-12px_0_40px_rgba(19,27,22,0.18)] max-sm:inset-x-3 max-sm:top-auto max-sm:bottom-3 max-sm:w-auto max-sm:max-w-none"
            >
              <header className="flex items-start gap-4 px-8 pt-7 pb-5">
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-[28px] leading-[1.05] font-extrabold tracking-[-0.02em] text-texto">Anotar plata</p>
                  <p className="mt-1.5 text-[15px] text-texto-suave">Un panel de prueba con la entrada y la salida de esta opción.</p>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={() => setAbierto(false)}
                  className="grid size-10 shrink-0 place-items-center rounded-full text-texto-suave transition-colors hover:bg-superficie-hundida hover:text-texto"
                >
                  <Icono nombre="Cerrar" />
                </button>
              </header>
              <div className="px-8 pb-6">
                <p className="titulo-display cifra text-[44px] leading-tight text-estado-problema-texto">−{MONTO}</p>
              </div>
              <footer className="rounded-b-[28px] border-t border-borde px-8 py-5">
                <Boton
                  fase={accion.fase}
                  trabajando={accion.trabajando}
                  texto={`Anotar ${MONTO}`}
                  icono="Guardar"
                  onClick={() =>
                    void accion.correr(1200, "listo", () => {
                      avisoListo()
                      // Se cierra solo, después de que se vio el «Listo».
                      setTimeout(() => setAbierto(false), 700 * f)
                    })
                  }
                />
              </footer>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
