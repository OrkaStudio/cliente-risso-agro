// Página interna de desarrollo (/estilo/colores): el OK del botón B · Con cuerpo.
// Lau (18/11) eligió la B tal como está (terracota con círculo trigo) y pidió mejorar
// la animación del «Listo» y llevar el verde hacia Troppero. Acá se compara el OK de hoy
// con el nuevo en varios verdes; lo demás del botón (cargando, sin señal, falló) no cambia.
import { AnimatePresence, motion, MotionConfig, useAnimate, useReducedMotion } from "framer-motion"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

import { MONTO, useAccion, Velocidad, type Fase } from "./animaciones-base"
import { Icono } from "./icono"
import { Logo } from "./logo"

type Verde = {
  id: string
  nombre: string
  idea: string
  /** El fondo del círculo en el OK. */
  fondo: string
  /** El color del tilde. */
  tilde: string
  /** El OK nuevo (se llena desde el centro, el tilde se dibuja y la píldora asiente) o el de hoy. */
  nuevo: boolean
}

const VERDES: Verde[] = [
  {
    id: "hoy",
    nombre: "Como está hoy",
    idea: "Verde #4e7a4a con tilde blanco; el tilde salta en el círculo. Tiene casi la misma luminosidad que el terracota, por eso se empasta con la píldora.",
    fondo: "#4e7a4a",
    tilde: "#fbfaf6",
    nuevo: false,
  },
  {
    id: "oliva-oscuro",
    nombre: "1 · Oliva oscuro",
    idea: "#4a6136, un verde de monte, más tierra que el de hoy. Al ser más oscuro se despega de la píldora y el tilde blanco se lee mejor.",
    fondo: "#4a6136",
    tilde: "#fbfaf6",
    nuevo: true,
  },
  {
    id: "pasto-claro",
    nombre: "2 · Pasto claro, como el trigo",
    idea: "La misma lógica que el círculo trigo: fondo claro con el ícono oscuro. El OK es pasto tierno (#cbd79a) con tilde verde monte. Cambia el color, no el peso.",
    fondo: "#cbd79a",
    tilde: "#3a4f2a",
    nuevo: true,
  },
  {
    id: "oliva",
    nombre: "3 · Oliva",
    idea: "#6b7a3a, un verde amarillento, pariente del trigo. Es el más cálido de los tres, pero se separa menos del terracota.",
    fondo: "#6b7a3a",
    tilde: "#fbfaf6",
    nuevo: true,
  },
  {
    id: "hoy-nuevo",
    nombre: "4 · El verde de hoy con el OK nuevo",
    idea: "Para separar las dos cosas: el mismo verde #4e7a4a, sólo con la animación nueva.",
    fondo: "#4e7a4a",
    tilde: "#fbfaf6",
    nuevo: true,
  },
]

const SACUDIDA = [0, -10, 9, -6, 4, -2, 0]

/** El tilde de lucide (check), para poder dibujarlo. */
function TildeDibujado({ color, f, dibujar }: { color: string; f: number; dibujar: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <motion.path
        d="M20 6 9 17l-5-5"
        initial={dibujar ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.32 * f, ease: [0.65, 0, 0.35, 1], delay: 0.14 * f }}
      />
    </svg>
  )
}

/** La B · Con cuerpo de animaciones-opciones.tsx, con el OK que elija el verde. */
function BotonB({ verde, fase, sacudida, onClick, factor }: { verde: Verde; fase: Fase; sacudida?: number; onClick?: () => void; factor: number }) {
  const f = factor
  const reducir = useReducedMotion()
  const [scope, animar] = useAnimate<HTMLDivElement>()
  const previo = useRef(sacudida)
  useEffect(() => {
    if (sacudida === previo.current) return
    previo.current = sacudida
    if (!sacudida || reducir || !scope.current) return
    void animar(scope.current, { x: SACUDIDA }, { duration: 0.42 * f })
  }, [sacudida, reducir, animar, scope, f])
  const [ancho, setAncho] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = scope.current
    if (!el) return
    const ro = new ResizeObserver(() => setAncho(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [scope])
  // El OK nuevo: la píldora asiente una vez (sube apenas y vuelve) cuando el verde llena el círculo.
  const [boton, animarBoton] = useAnimate<HTMLButtonElement>()
  const enVivo = !!onClick
  useEffect(() => {
    if (!verde.nuevo || reducir || fase !== "listo" || !enVivo || !boton.current) return
    void animarBoton(boton.current, { scale: [1, 1.035, 1] }, { duration: 0.45 * f, times: [0, 0.4, 1], ease: "easeOut", delay: 0.1 * f })
  }, [verde.nuevo, fase, reducir, enVivo, f, boton, animarBoton])
  const resorte = { type: "spring", visualDuration: 0.35 * f, bounce: 0.25 } as const
  const salto = { type: "spring", visualDuration: 0.3 * f, bounce: 0.55 } as const
  const encogido = fase === "cargando" && !reducir
  const etiqueta = fase === "listo" ? "Listo" : fase === "telefono" ? "En el teléfono" : fase === "error" ? "Falló. Tocá de nuevo" : `Anotar ${MONTO}`
  const capa = fase === "telefono" ? "bg-estado-atencion text-tinta" : fase === "error" ? "bg-estado-problema text-superficie" : null
  return (
    <div ref={scope} className="flex w-full justify-end">
      <motion.button
        ref={boton}
        type="button"
        onClick={onClick}
        tabIndex={onClick ? undefined : -1}
        initial={false}
        animate={{ width: encogido ? 64 : (ancho ?? "100%"), paddingLeft: encogido ? 8 : 26, columnGap: encogido ? 0 : 12 }}
        whileTap={onClick ? { scale: 0.95 } : undefined}
        transition={{ ...resorte, scale: { type: "spring", visualDuration: 0.2 * f, bounce: 0.55 } }}
        className={cn(
          "relative inline-flex items-center justify-between overflow-hidden rounded-full bg-principal py-2 pr-2 text-left text-[16.5px] font-bold whitespace-nowrap text-principal-texto outline-none transition-colors select-none hover:bg-terracota-600",
          !onClick && "pointer-events-none",
        )}
      >
        <motion.span className="grid min-w-0 flex-1" animate={{ opacity: encogido ? 0 : 1 }} transition={{ duration: 0.12 * f }}>
          <AnimatePresence initial={false}>
            <motion.span key={etiqueta} className="truncate [grid-area:1/1]" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={salto}>
              {etiqueta}
            </motion.span>
          </AnimatePresence>
        </motion.span>
        <span className={cn("relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-acento text-acento-texto transition-colors duration-150", capa)}>
          {/* El verde del OK. Hoy: se funde. Nuevo: se llena desde el centro con un resorte. */}
          <AnimatePresence initial={false}>
            {fase === "listo" && (
              <motion.span
                key="ok"
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: verde.fondo }}
                initial={enVivo ? (verde.nuevo && !reducir ? { scale: 0 } : { opacity: 0 }) : false}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={verde.nuevo ? { type: "spring", visualDuration: 0.3 * f, bounce: 0.35 } : { duration: 0.12 * f }}
              />
            )}
          </AnimatePresence>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={fase}
              className="relative grid place-items-center"
              initial={{ opacity: 0, scale: fase === "listo" && verde.nuevo ? 1 : capa || fase === "listo" ? 0.3 : 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={salto}
            >
              {fase === "cargando" ? (
                <span className="size-5 animate-spin rounded-full border-2 border-acento-texto/30 border-t-acento-texto" />
              ) : fase === "listo" ? (
                <TildeDibujado color={verde.tilde} f={f} dibujar={verde.nuevo && enVivo && !reducir} />
              ) : fase === "telefono" && !reducir ? (
                <motion.span className="grid place-items-center" animate={{ scale: [1, 1.14, 1] }} transition={{ duration: 1.1 * f, repeat: Infinity, ease: "easeInOut" }}>
                  <Icono nombre="Sin señal" />
                </motion.span>
              ) : (
                <Icono nombre={fase === "error" ? "Reintentar" : "Guardar"} />
              )}
            </motion.span>
          </AnimatePresence>
        </span>
      </motion.button>
    </div>
  )
}

function Fila({ verde, factor }: { verde: Verde; factor: number }) {
  const accion = useAccion()
  return (
    <section className="rounded-[28px] border border-borde bg-superficie p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(300px,360px)_minmax(240px,300px)] lg:items-center">
        <div className="max-w-[560px]">
          <h2 className="font-heading text-[22px] leading-tight font-extrabold tracking-[-0.02em] text-texto">{verde.nombre}</h2>
          <p className="mt-1 text-[15px] text-texto-suave">{verde.idea}</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold text-texto-suave">Tocalo</p>
          <BotonB verde={verde} factor={factor} fase={accion.fase} onClick={() => void accion.correr(1200, "listo")} />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold text-texto-suave">Quieto en Listo</p>
          <BotonB verde={verde} factor={factor} fase="listo" />
        </div>
      </div>
    </section>
  )
}

export function ColoresMuestra() {
  const [lenta, setLenta] = useState(false)
  const factor = lenta ? 4 : 1
  return (
    <Velocidad.Provider value={factor}>
      <MotionConfig reducedMotion="user">
        <main className="h-dvh overflow-y-auto bg-fondo px-4 py-8 sm:px-10">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
            <header className="flex items-start justify-between gap-4">
              <div>
                <Logo />
                <h1 className="titulo-display mt-4 text-[40px] leading-none text-texto">El OK del botón</h1>
                <p className="mt-3 max-w-[720px] text-[16px] text-texto-suave">
                  La B tal como está, con un «Listo» nuevo: el verde se llena desde el centro con un resorte, el tilde se dibuja de un trazo y la píldora asiente una vez. Arriba, el de hoy para comparar; abajo, el nuevo en cuatro verdes.
                </p>
              </div>
              <button type="button" onClick={() => setLenta((v) => !v)} className="shrink-0 rounded-full border-[1.5px] border-principal px-4 py-2 text-[14.5px] font-bold text-principal">
                {lenta ? "Velocidad normal" : "Lenta"}
              </button>
            </header>
            {VERDES.map((v) => (
              <Fila key={v.id} verde={v} factor={factor} />
            ))}
          </div>
        </main>
      </MotionConfig>
    </Velocidad.Provider>
  )
}
