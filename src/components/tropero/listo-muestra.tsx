// Página interna de desarrollo (/estilo/listo): cómo dice «Listo» cada familia de botón
// de la app, con las variables nuevas (--listo*, pasto, y el movimiento de lib/animacion).
// Sale del inventario del 18/11: 88 BotonPrincipal, 90 BotonChico, 4 Boton y ~320 <button>
// sueltos en 70 archivos. Es para aprobar antes de llevarlo a toda la web.
import { AnimatePresence, motion, MotionConfig, useAnimate, useReducedMotion } from "framer-motion"
import { createContext, useContext, useEffect, useRef, useState } from "react"

import { HUNDIR, HUNDIR_CHICO, LISTO_ASENTIR, LISTO_LLENAR, LISTO_MS, LISTO_TILDE, SALTO } from "@/lib/animacion"
import { cn } from "@/lib/utils"

import { Icono, type NombreIcono } from "./icono"
import { Logo } from "./logo"

/** Un toque: carga 0,9 s y queda en «Listo» LISTO_MS. */
function useListo(f: number) {
  const [fase, setFase] = useState<"reposo" | "cargando" | "listo">("reposo")
  const ocupado = useRef(false)
  async function tocar() {
    if (ocupado.current) return
    ocupado.current = true
    setFase("cargando")
    await new Promise((r) => setTimeout(r, 900))
    setFase("listo")
    await new Promise((r) => setTimeout(r, LISTO_MS * f))
    setFase("reposo")
    ocupado.current = false
  }
  return { fase, tocar }
}

/** 1 a velocidad normal; 4 en «Lenta». */
const Velocidad = createContext(1)
const useF = () => useContext(Velocidad)

/** El tilde que se dibuja de un trazo. `quieto` lo muestra entero, sin dibujarlo. */
function Tilde({ tamano = 24, quieto, className }: { tamano?: number; quieto?: boolean; className?: string }) {
  const reducir = useReducedMotion()
  const f = useF()
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <motion.path
        d={LISTO_TILDE.camino}
        initial={quieto || reducir ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: LISTO_TILDE.duracion * f, ease: LISTO_TILDE.curva, delay: LISTO_TILDE.demora * f }}
      />
    </svg>
  )
}

function Giro({ className }: { className?: string }) {
  return <span className={cn("size-[18px] animate-spin rounded-full border-2 border-current/30 border-t-current", className)} />
}

/** Que el botón asienta una vez al llegar al «Listo». */
function useAsentir(listo: boolean, quieto?: boolean) {
  const [ref, animar] = useAnimate<HTMLButtonElement>()
  const reducir = useReducedMotion()
  const f = useF()
  useEffect(() => {
    if (!listo || quieto || reducir || !ref.current) return
    void animar(ref.current, { scale: LISTO_ASENTIR.escala as unknown as number[] }, { duration: LISTO_ASENTIR.duracion * f, times: LISTO_ASENTIR.tiempos as unknown as number[], delay: LISTO_ASENTIR.demora * f })
  }, [listo, quieto, reducir, ref, animar, f])
  return ref
}

function Texto({ k, children }: { k: string; children: React.ReactNode }) {
  const f = useF()
  return (
    <span className="grid">
      <AnimatePresence initial={false}>
        <motion.span key={k} className="[grid-area:1/1]" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ ...SALTO, visualDuration: SALTO.visualDuration * f }}>
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

type Props = { fase: "reposo" | "cargando" | "listo"; onClick?: () => void; quieto?: boolean }
const tap = (f: number, chico?: boolean) => ({ scale: (chico ? HUNDIR_CHICO : HUNDIR).escala, transition: { ...HUNDIR.resorte, visualDuration: HUNDIR.resorte.visualDuration * f } })

// ===== 1 · Píldora principal (BotonPrincipal y sus copias a mano) =====
function Pildora({ fase, onClick, quieto }: Props) {
  const f = useF()
  const ref = useAsentir(fase === "listo", quieto)
  const listo = fase === "listo"
  return (
    <motion.button ref={ref} type="button" onClick={onClick} whileTap={onClick ? tap(f) : undefined} className={cn("relative flex w-full items-center justify-between gap-3 rounded-full bg-principal py-2 pr-2 pl-[26px] text-left text-[16.5px] font-bold text-principal-texto", !onClick && "pointer-events-none")}>
      <Texto k={listo ? "l" : "r"}>{listo ? "Listo" : "Anotar $ 45.000"}</Texto>
      <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-acento text-acento-texto">
        <AnimatePresence initial={false}>
          {listo && (
            <motion.span key="ok" className="absolute inset-0 rounded-full bg-listo" initial={quieto ? false : { scale: 0 }} animate={{ scale: 1 }} exit={{ opacity: 0 }} transition={{ ...LISTO_LLENAR, visualDuration: LISTO_LLENAR.visualDuration * f }} />
          )}
        </AnimatePresence>
        <span className={cn("relative grid place-items-center", listo && "text-listo-texto")}>
          {fase === "cargando" ? <Giro className="size-5" /> : listo ? <Tilde quieto={quieto} /> : <Icono nombre="Guardar" />}
        </span>
      </span>
    </motion.button>
  )
}

// ===== 2 · Botones llenos chicos: terracota (Boton principal/destacado) y trigo (Boton acento) =====
function Lleno({ fase, onClick, quieto, color, icono = "Guardar", texto = "Guardar" }: Props & { color: "terracota" | "trigo" | "tinta"; icono?: NombreIcono; texto?: string }) {
  const f = useF()
  const ref = useAsentir(fase === "listo", quieto)
  const listo = fase === "listo"
  // Terracota y trigo pasan enteros a pasto (el pasto sobre terracota no se lee: 3,0).
  // La tinta se queda y el tilde y la palabra van en pasto (11,5).
  const fondo = color === "terracota" ? "bg-principal text-principal-texto" : color === "trigo" ? "bg-acento text-acento-texto" : "bg-tinta text-superficie"
  const fondoListo = color === "tinta" ? "bg-tinta text-listo" : "bg-listo text-listo-texto"
  return (
    <motion.button ref={ref} type="button" onClick={onClick} whileTap={onClick ? tap(f, true) : undefined} className={cn("inline-flex h-11 items-center gap-2 rounded-[10px] px-4 text-[14.5px] font-semibold transition-colors duration-200", listo ? fondoListo : fondo, !onClick && "pointer-events-none")}>
      <span className="grid size-4 place-items-center">{fase === "cargando" ? <Giro className="size-4" /> : listo ? <Tilde tamano={16} quieto={quieto} /> : <Icono nombre={icono} tamano={16} />}</span>
      <Texto k={listo ? "l" : "r"}>{listo ? "Listo" : texto}</Texto>
    </motion.button>
  )
}

// ===== 3 · Borde terracota (Boton secundario, BotonChico y sus copias) =====
function Borde({ fase, onClick, quieto, chico }: Props & { chico?: boolean }) {
  const f = useF()
  const ref = useAsentir(fase === "listo", quieto)
  const listo = fase === "listo"
  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      whileTap={onClick ? tap(f, true) : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 border-[1.5px] font-bold transition-colors duration-200",
        chico ? "min-h-11 rounded-full px-3.5 py-[7px] text-[14.5px]" : "h-11 rounded-[10px] bg-superficie px-4 text-[14.5px] font-semibold",
        listo ? "border-listo-fuerte bg-listo-suave text-listo-fuerte" : "border-principal text-principal",
        !onClick && "pointer-events-none",
      )}
    >
      <span className="grid size-4 place-items-center">{fase === "cargando" ? <Giro className="size-4" /> : listo ? <Tilde tamano={16} quieto={quieto} /> : <Icono nombre={chico ? "Agregar" : "Guardar"} tamano={16} />}</span>
      <Texto k={listo ? "l" : "r"}>{listo ? "Listo" : chico ? "Sumar nota" : "Guardar borrador"}</Texto>
    </motion.button>
  )
}

// ===== 4 · Fantasma (sólo texto terracota) =====
function Fantasma({ fase, onClick, quieto }: Props) {
  const f = useF()
  const listo = fase === "listo"
  return (
    <motion.button type="button" onClick={onClick} whileTap={onClick ? tap(f, true) : undefined} className={cn("inline-flex h-11 items-center gap-1.5 rounded-[10px] px-3 text-[14.5px] font-bold transition-colors duration-200", listo ? "text-listo-fuerte" : "text-principal", !onClick && "pointer-events-none")}>
      <span className="grid size-4 place-items-center">{fase === "cargando" ? <Giro className="size-4" /> : listo ? <Tilde tamano={16} quieto={quieto} /> : <Icono nombre="Reintentar" tamano={16} />}</span>
      <Texto k={listo ? "l" : "r"}>{listo ? "Listo" : "Volver a mandar"}</Texto>
    </motion.button>
  )
}

// ===== 5 · Ícono suelto (redondo, sin texto) =====
function Suelto({ fase, onClick, quieto }: Props) {
  const f = useF()
  const ref = useAsentir(fase === "listo", quieto)
  const listo = fase === "listo"
  return (
    <motion.button ref={ref} type="button" aria-label="Guardar" onClick={onClick} whileTap={onClick ? tap(f, true) : undefined} className={cn("relative grid size-11 place-items-center overflow-hidden rounded-full text-principal transition-colors duration-200", listo ? "text-listo-fuerte" : "bg-principal-suave", !onClick && "pointer-events-none")}>
      <AnimatePresence initial={false}>
        {listo && <motion.span key="ok" className="absolute inset-0 rounded-full bg-listo-suave" initial={quieto ? false : { scale: 0 }} animate={{ scale: 1 }} exit={{ opacity: 0 }} transition={{ ...LISTO_LLENAR, visualDuration: LISTO_LLENAR.visualDuration * f }} />}
      </AnimatePresence>
      <span className="relative">{fase === "cargando" ? <Giro /> : listo ? <Tilde tamano={24} quieto={quieto} /> : <Icono nombre="Guardar" />}</span>
    </motion.button>
  )
}

type Familia = { id: string; nombre: string; cuantos: string; idea: string; Boton: (p: Props) => React.ReactElement }

const FAMILIAS: Familia[] = [
  { id: "pildora", nombre: "1 · Píldora principal", cuantos: "88 BotonPrincipal + 48 copias a mano", idea: "El círculo trigo se llena de pasto desde el centro, el tilde se dibuja y el botón asiente. La píldora no cambia de color.", Boton: Pildora },
  { id: "terracota", nombre: "2 · Lleno terracota", cuantos: "Boton principal y destacado + 26 copias", idea: "Pasa entero a pasto con letra verde monte. El pasto sobre terracota no se lee (contraste 3,0), por eso cambia el fondo y no sólo el ícono.", Boton: (p) => <Lleno {...p} color="terracota" /> },
  { id: "trigo", nombre: "3 · Lleno trigo", cuantos: "Boton acento + 9 copias", idea: "Trigo a pasto: el mismo peso, sólo cambia el color. Es el cambio más natural de todos.", Boton: (p) => <Lleno {...p} color="trigo" texto="Confirmar" /> },
  { id: "tinta", nombre: "4 · Lleno tinta", cuantos: "3 a mano", idea: "La tinta se queda; el tilde y la palabra pasan a pasto (contraste 11,5).", Boton: (p) => <Lleno {...p} color="tinta" texto="Mandar" icono="Siguiente" /> },
  { id: "borde", nombre: "5 · Con borde", cuantos: "Boton secundario + 34 copias", idea: "Borde y letra verde monte sobre pasto suave.", Boton: (p) => <Borde {...p} /> },
  { id: "chico", nombre: "6 · Botón chico", cuantos: "90 BotonChico", idea: "Igual que el de borde, en píldora: borde y letra verde monte sobre pasto suave.", Boton: (p) => <Borde {...p} chico /> },
  { id: "fantasma", nombre: "7 · Sólo texto", cuantos: "11 a mano", idea: "La letra pasa a verde monte con el tilde; sin fondo, como era.", Boton: Fantasma },
  { id: "suelto", nombre: "8 · Ícono suelto", cuantos: "31 a mano (los que guardan; cerrar y + no tienen «Listo»)", idea: "El círculo se llena de pasto suave y el ícono pasa a tilde verde monte.", Boton: Suelto },
]

function Fila({ familia, f }: { familia: Familia; f: number }) {
  const { fase, tocar } = useListo(f)
  const { Boton } = familia
  return (
    <section className="grid gap-5 rounded-[28px] border border-borde bg-superficie p-6 lg:grid-cols-[1fr_minmax(260px,340px)_minmax(220px,340px)] lg:items-center">
      <div>
        <h2 className="font-heading text-[20px] leading-tight font-extrabold tracking-[-0.02em] text-texto">{familia.nombre}</h2>
        <p className="mt-0.5 text-[13px] font-semibold text-texto-suave">{familia.cuantos}</p>
        <p className="mt-1.5 max-w-[520px] text-[15px] text-texto-suave">{familia.idea}</p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <p className="text-[13px] font-semibold text-texto-suave">Tocalo</p>
        <Boton fase={fase} onClick={() => void tocar()} />
      </div>
      <div className="flex flex-col items-start gap-2">
        <p className="text-[13px] font-semibold text-texto-suave">Quieto en Listo</p>
        <Boton fase="listo" quieto />
      </div>
    </section>
  )
}

const VARIABLES = [
  { nombre: "--listo", valor: "pasto/300 · #cbd79a", clase: "bg-listo", uso: "El botón o su círculo lleno" },
  { nombre: "--listo-texto", valor: "pasto/800 · #3a4f2a", clase: "bg-listo-texto", uso: "Tilde y letra sobre --listo (5,9)" },
  { nombre: "--listo-suave", valor: "pasto/100 · #ecf1d6", clase: "bg-listo-suave", uso: "Fondo de borde, chico e ícono" },
  { nombre: "--listo-fuerte", valor: "pasto/800 · #3a4f2a", clase: "bg-listo-fuerte", uso: "Borde, letra y tilde sobre claro (7,8)" },
]

const PASTO = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"] as const
const PASTO_CLASE: Record<(typeof PASTO)[number], string> = {
  "50": "bg-pasto-50", "100": "bg-pasto-100", "200": "bg-pasto-200", "300": "bg-pasto-300", "400": "bg-pasto-400",
  "500": "bg-pasto-500", "600": "bg-pasto-600", "700": "bg-pasto-700", "800": "bg-pasto-800", "900": "bg-pasto-900",
}

export function ListoMuestra() {
  const [lenta, setLenta] = useState(false)
  const [noche, setNoche] = useState(false)
  return (
    <Velocidad.Provider value={lenta ? 4 : 1}>
    <MotionConfig reducedMotion="user">
      <main className={cn("h-dvh overflow-y-auto bg-fondo px-4 py-8 text-texto sm:px-10", noche && "dark")}>
        <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Logo />
              <h1 className="titulo-display mt-4 text-[40px] leading-none text-texto">«Listo» en cada botón</h1>
              <p className="mt-3 max-w-[760px] text-[16px] text-texto-suave">
                Todas las familias de botones de la app, con las variables nuevas. «Listo» es sólo el resultado de una acción (guardar, anotar, mandar). Elegir, abrir, navegar y borrar no lo usan: esos no tienen un «salió».
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setNoche((v) => !v)} className="rounded-full border-[1.5px] border-principal px-4 py-2 text-[14.5px] font-bold text-principal">
                {noche ? "Día" : "Noche"}
              </button>
              <button type="button" onClick={() => setLenta((v) => !v)} className="rounded-full border-[1.5px] border-principal px-4 py-2 text-[14.5px] font-bold text-principal">
                {lenta ? "Velocidad normal" : "Lenta"}
              </button>
            </div>
          </header>

          <section className="rounded-[28px] border border-borde bg-superficie p-6">
            <h2 className="font-heading text-[20px] font-extrabold tracking-[-0.02em] text-texto">Las variables</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {VARIABLES.map((v) => (
                <div key={v.nombre} className="flex items-center gap-3">
                  <span className={cn("size-12 shrink-0 rounded-[12px] border border-borde", v.clase)} />
                  <span className="min-w-0">
                    <code className="block text-[13.5px] font-semibold text-texto">{v.nombre}</code>
                    <span className="block text-[12.5px] text-texto-suave">{v.valor}</span>
                    <span className="block text-[12.5px] text-texto-suave">{v.uso}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[13px] font-semibold text-texto-suave">La escala pasto, como la de trigo y terracota</p>
            <div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
              {PASTO.map((n) => (
                <span key={n} className="flex flex-col gap-1">
                  <span className={cn("h-10 rounded-[8px] border border-borde", PASTO_CLASE[n])} />
                  <span className="text-[12px] text-texto-suave">{n}</span>
                </span>
              ))}
            </div>
            <p className="mt-5 text-[13px] text-texto-suave">
              El movimiento está en <code>lib/animacion.ts</code>: HUNDIR, RESORTE, SALTO, SACUDIDA, LISTO_LLENAR, LISTO_TILDE, LISTO_ASENTIR y LISTO_MS.
            </p>
          </section>

          {FAMILIAS.map((fam) => (
            <Fila key={fam.id} familia={fam} f={lenta ? 4 : 1} />
          ))}
        </div>
      </main>
    </MotionConfig>
    </Velocidad.Provider>
  )
}
