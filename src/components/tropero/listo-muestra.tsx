// Página interna de desarrollo (/estilo/listo): cómo dice «Listo» cada familia de botón
// de la app, con las variables nuevas (--listo*, pasto, y el movimiento de lib/animacion).
// Sale del inventario del 18/11: 88 BotonPrincipal, 90 BotonChico, 4 Boton y ~320 <button>
// sueltos en 70 archivos. Es para aprobar antes de llevarlo a toda la web.
import { AnimatePresence, motion, MotionConfig, useAnimate } from "framer-motion"
import { useRef, useState } from "react"

import { LISTO_LLENAR, LISTO_MS, LISTO_RECOGER, RESORTE, SACUDIDA, TELEFONO_MS } from "@/lib/animacion"
import { cn } from "@/lib/utils"

import { tap, useAsentir, useF, Velocidad } from "./boton-movimiento"
import { Giro, Texto, Tilde, Vuelve } from "./boton-partes"
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

type Props = { fase: "reposo" | "cargando" | "listo"; onClick?: () => void; quieto?: boolean }

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
            <motion.span key="ok" className="absolute inset-0 rounded-full bg-listo" initial={quieto ? false : { scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0, transition: { ...LISTO_RECOGER, visualDuration: LISTO_RECOGER.visualDuration * f } }} transition={{ ...LISTO_LLENAR, visualDuration: LISTO_LLENAR.visualDuration * f }} />
          )}
        </AnimatePresence>
        <span className={cn("relative grid place-items-center", listo && "text-listo-texto")}>
          {fase === "cargando" ? <Giro className="size-5" /> : listo ? <Tilde quieto={quieto} /> : <Vuelve><Icono nombre="Siguiente" /></Vuelve>}
        </span>
      </span>
    </motion.button>
  )
}

// ===== 2 · Botones llenos chicos: terracota (Boton principal/destacado) y trigo (Boton acento) =====
function Lleno({ fase, onClick, quieto, color, icono = "Plata", texto = "Anotar gasto" }: Props & { color: "terracota" | "trigo" | "tinta"; icono?: NombreIcono; texto?: string }) {
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
      <span className="grid size-4 place-items-center">{fase === "cargando" ? <Giro className="size-4" /> : listo ? <Tilde tamano={16} quieto={quieto} /> : <Icono nombre={chico ? "Agregar" : "Editar"} tamano={16} />}</span>
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
    <motion.button ref={ref} type="button" aria-label="Descargar" onClick={onClick} whileTap={onClick ? tap(f, true) : undefined} className={cn("relative grid size-11 place-items-center overflow-hidden rounded-full bg-principal-suave text-principal", !onClick && "pointer-events-none")}>
      {/* El rosado queda siempre debajo: el pasto lo tapa desde el centro y al volver se recoge.
          Antes el rosado se apagaba primero y el botón desaparecía un instante. */}
      <AnimatePresence initial={false}>
        {listo && <motion.span key="ok" className="absolute inset-0 rounded-full bg-listo" initial={quieto ? false : { scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0, transition: { ...LISTO_RECOGER, visualDuration: LISTO_RECOGER.visualDuration * f } }} transition={{ ...LISTO_LLENAR, visualDuration: LISTO_LLENAR.visualDuration * f }} />}
      </AnimatePresence>
      <span className={cn("relative grid place-items-center", listo && "text-listo-texto")}>{fase === "cargando" ? <Giro className="size-5 border-principal/25 border-t-principal" /> : listo ? <Tilde tamano={22} quieto={quieto} /> : <Vuelve><Icono nombre="Descargar" /></Vuelve>}</span>
    </motion.button>
  )
}

type Familia = { id: string; nombre: string; cuantos: string; idea: string; Boton: (p: Props) => React.ReactElement }

const FAMILIAS: Familia[] = [
  { id: "pildora", nombre: "1 · Píldora principal", cuantos: "88 BotonPrincipal + 48 copias a mano", idea: "El círculo trigo se llena de pasto desde el centro, el tilde se dibuja y el botón asiente. La píldora no cambia de color.", Boton: Pildora },
  { id: "terracota", nombre: "2 · Lleno terracota", cuantos: "Boton principal y destacado + 26 copias", idea: "Pasa entero a pasto con letra verde monte. El pasto sobre terracota no se lee (contraste 3,0), por eso cambia el fondo y no sólo el ícono.", Boton: (p) => <Lleno {...p} color="terracota" /> },
  { id: "trigo", nombre: "3 · Lleno trigo", cuantos: "Boton acento + 9 copias", idea: "Trigo a pasto: el mismo peso, sólo cambia el color. Es el cambio más natural de todos.", Boton: (p) => <Lleno {...p} color="trigo" texto="Confirmar" icono="Siguiente" /> },
  { id: "tinta", nombre: "4 · Lleno tinta", cuantos: "3 a mano", idea: "La tinta se queda; el tilde y la palabra pasan a pasto (contraste 11,5).", Boton: (p) => <Lleno {...p} color="tinta" texto="Mandar" icono="Siguiente" /> },
  { id: "borde", nombre: "5 · Con borde", cuantos: "Boton secundario + 34 copias", idea: "Borde y letra verde monte sobre pasto suave.", Boton: (p) => <Borde {...p} /> },
  { id: "chico", nombre: "6 · Botón chico", cuantos: "90 BotonChico", idea: "Igual que el de borde, en píldora: borde y letra verde monte sobre pasto suave.", Boton: (p) => <Borde {...p} chico /> },
  { id: "fantasma", nombre: "7 · Sólo texto", cuantos: "11 a mano", idea: "La letra pasa a verde monte con el tilde; sin fondo, como era.", Boton: Fantasma },
  { id: "suelto", nombre: "8 · Ícono suelto", cuantos: "31 a mano (los que guardan; cerrar y + no tienen «Listo»)", idea: "Como el círculo de la píldora: el pasto tapa el rosado desde el centro, el tilde se dibuja y al volver el pasto se recoge.", Boton: Suelto },
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

// ===== Los demás botones: los que no guardan nada y por eso no dicen «Listo» =====
// Todos se hunden y rebotan al tocarlos (es el «te escuché»). Lo que pasa después depende de
// lo que hace el botón: lo borrado se va con Deshacer, el paso avanza, lo elegido se desliza,
// el panel se cierra, y lo que falla se sacude y dice por qué.

/** La píldora de la familia 1, sin «Listo»: para avanzar y para lo que puede fallar. */
function PildoraSimple({ texto, icono, cargando, onClick, controles }: { texto: string; icono: NombreIcono; cargando?: boolean; onClick: () => void; controles?: React.Ref<HTMLButtonElement> }) {
  const f = useF()
  return (
    <motion.button ref={controles} type="button" onClick={onClick} whileTap={tap(f)} className="relative flex w-full items-center justify-between gap-3 rounded-full bg-principal py-2 pr-2 pl-[26px] text-left text-[16.5px] font-bold text-principal-texto">
      <Texto k={texto}>{texto}</Texto>
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-acento text-acento-texto">
        {cargando ? <Giro className="size-5" /> : <Icono nombre={icono} />}
      </span>
    </motion.button>
  )
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Borrar, en dos tipos según lo que la base permite (decisión de Lau, 18/11):
 *  · Se puede deshacer (verificado 18/11: deshacer_caravanas, deshacer_baja —la de la cuenta—,
 *    deshacer la marca de señal, revertir un pago): se tacha en el lugar y el botón pasa a «Deshacer».
 *  · No se puede deshacer (el resto): pregunta antes, en el mismo lugar, y recién ahí borra.
 *    Nada de «Deshacer» donde no existe. */
function Borrar({ deshacible }: { deshacible: boolean }) {
  const f = useF()
  const [estado, setEstado] = useState<"esta" | "pregunta" | "borrando" | "borrada" | "ida">("esta")
  const resorte = { ...RESORTE, visualDuration: RESORTE.visualDuration * f }
  async function borrar() {
    setEstado("borrando")
    await espera(700)
    setEstado(deshacible ? "borrada" : "ida")
  }
  const tachada = estado === "borrada"
  const pregunta = estado === "pregunta"
  // El «Sí, borrar» lleno se queda mientras borra, pero sólo en el tipo que preguntó.
  const confirmando = !deshacible && (pregunta || estado === "borrando")

  return (
    <div className="flex min-h-[62px] flex-col justify-center">
      <AnimatePresence initial={false} mode="popLayout">
        {estado !== "ida" ? (
          <motion.div key="fila" className={cn("relative flex items-center justify-between gap-3 overflow-hidden rounded-[14px] border py-2 pr-2 pl-4 transition-colors duration-300", tachada ? "border-transparent bg-superficie-hundida" : "border-borde bg-fondo")} exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, transition: resorte }}>
            <span className={cn("relative min-w-0 text-[15px] font-semibold transition-colors duration-300", tachada ? "text-texto-suave" : "text-texto")}>
              <Texto k={pregunta ? "p" : "n"}>{pregunta ? "¿Borrar la Vaca 1234?" : "Vaca 1234 · Angus"}</Texto>
              {/* La raya del tachado se dibuja de izquierda a derecha. */}
              <motion.span className="absolute top-1/2 left-0 h-[1.5px] w-full origin-left bg-current" initial={false} animate={{ scaleX: tachada ? 1 : 0 }} transition={resorte} />
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <AnimatePresence initial={false} mode="popLayout">
                {pregunta && (
                  <motion.button key="no" type="button" onClick={() => setEstado("esta")} whileTap={tap(f, true)} className="inline-flex h-11 items-center rounded-full px-3.5 text-[14.5px] font-bold text-texto-suave" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0, transition: resorte }} exit={{ opacity: 0, transition: resorte }}>
                    No
                  </motion.button>
                )}
              </AnimatePresence>
              <motion.button
                type="button"
                onClick={tachada ? () => setEstado("esta") : pregunta ? () => void borrar() : deshacible ? () => void borrar() : () => setEstado("pregunta")}
                whileTap={tap(f, true)}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 text-[14.5px] font-bold transition-colors duration-200",
                  tachada ? "border-[1.5px] border-principal bg-superficie text-principal" : confirmando ? "bg-principal text-principal-texto" : "text-principal",
                )}
              >
                {!tachada && <span className="grid size-4 place-items-center">{estado === "borrando" ? <Giro className="size-4" /> : <Icono nombre="Borrar" tamano={16} />}</span>}
                <Texto k={tachada ? "d" : confirmando ? "s" : "b"}>{tachada ? "Deshacer" : confirmando ? "Sí, borrar" : "Borrar"}</Texto>
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.button key="otra" type="button" onClick={() => setEstado("esta")} whileTap={tap(f, true)} className="inline-flex min-h-11 items-center self-start rounded-full px-1 text-[14.5px] font-bold text-texto-suave" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            (se borró) · Volver a mostrar la muestra
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

const PASOS = ["¿Cuántos entraron?", "¿A qué campo van?", "¿Cuándo llegaron?"]

/** Avanzar: se hunde y el paso siguiente entra de la derecha. Sin «Listo»: todavía no guardó. */
function Avanzar() {
  const f = useF()
  const [paso, setPaso] = useState(0)
  const ultimo = paso === PASOS.length - 1
  const resorte = { ...RESORTE, visualDuration: RESORTE.visualDuration * f }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        {PASOS.map((_, i) => (
          <motion.span key={i} className={cn("h-1.5 rounded-full", i <= paso ? "bg-principal" : "bg-borde")} animate={{ width: i === paso ? 28 : 10 }} transition={resorte} />
        ))}
      </div>
      <div className="relative h-7 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.p key={paso} className="font-heading text-[19px] font-extrabold text-texto" initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0, transition: resorte }} exit={{ opacity: 0, x: -32, transition: resorte }}>
            {PASOS[paso]}
          </motion.p>
        </AnimatePresence>
      </div>
      <PildoraSimple texto={ultimo ? "Volver a empezar" : "Siguiente"} icono="Siguiente" onClick={() => setPaso(ultimo ? 0 : paso + 1)} />
    </div>
  )
}

const OPCIONES = ["Todas", "Vacas", "Terneros", "Toros"]

/** Elegir: se hunde y lo elegido se desliza hasta la opción nueva. */
function Elegir() {
  const f = useF()
  const [elegida, setElegida] = useState("Todas")
  return (
    <div className="flex flex-wrap gap-1.5 rounded-full bg-fondo p-1">
      {OPCIONES.map((o) => (
        <motion.button key={o} type="button" onClick={() => setElegida(o)} whileTap={tap(f, true)} className={cn("relative min-h-11 rounded-full px-3.5 text-[14.5px] font-bold transition-colors duration-200", elegida === o ? "text-principal-texto" : "text-texto-suave")}>
          {elegida === o && <motion.span layoutId="elegida-muestra" className="absolute inset-0 rounded-full bg-principal" transition={{ ...RESORTE, visualDuration: RESORTE.visualDuration * f }} />}
          <span className="relative">{o}</span>
        </motion.button>
      ))}
    </div>
  )
}

/** Cerrar: se hunde y el panel se achica un poco mientras se va. */
function Cerrar() {
  const f = useF()
  const [abierto, setAbierto] = useState(true)
  const resorte = { ...RESORTE, visualDuration: RESORTE.visualDuration * f }
  return (
    <div className="flex min-h-[92px] items-center">
      <AnimatePresence initial={false} mode="popLayout">
        {abierto ? (
          <motion.div key="panel" className="flex w-full items-start justify-between gap-3 rounded-[16px] border border-borde bg-fondo py-3 pr-2 pl-4" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1, transition: resorte }} exit={{ opacity: 0, scale: 0.96, transition: resorte }}>
            <span>
              <span className="block text-[15px] font-bold text-texto">Ternero 452</span>
              <span className="block text-[13.5px] text-texto-suave">Nació el 12/11 en el potrero 4</span>
            </span>
            <motion.button type="button" aria-label="Cerrar" onClick={() => setAbierto(false)} whileTap={tap(f, true)} className="grid size-11 shrink-0 place-items-center rounded-full text-texto-suave">
              <Icono nombre="Cerrar" />
            </motion.button>
          </motion.div>
        ) : (
          <motion.button key="abrir" type="button" onClick={() => setAbierto(true)} whileTap={tap(f, true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] border-principal px-3.5 text-[14.5px] font-bold text-principal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Icono nombre="Ver" tamano={16} />
            Abrir de nuevo
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Lo que no sale, en tres versiones para elegir. Sin texto abajo: lo dice el botón.
 *  A · El botón lo dice: se sacude y queda «No salió · probá de nuevo».
 *  B · Lo dice y vuelve: se sacude, dice el motivo un momento y pasa a «Probar de nuevo».
 *  C · Sin señal no es un error: queda en el teléfono y sube cuando hay señal con la app
 *      abierta (drenarOffline). Sólo para lo que tiene cola: recorrida, manga, nacimientos y
 *      movimientos del Modo Campo, y la plata del celular. La planilla con IA no puede. */
function Falla({ modo }: { modo: "dice" | "vuelve" | "telefono" }) {
  const f = useF()
  const [fase, setFase] = useState<"reposo" | "cargando" | "fallo" | "motivo" | "telefono" | "listo">("reposo")
  const intentos = useRef(0)
  const [ref, animar] = useAnimate<HTMLButtonElement>()
  function sacudir() {
    if (ref.current) void animar(ref.current, { x: [...SACUDIDA.recorrido] }, { duration: SACUDIDA.duracion * f })
  }
  async function mandar() {
    if (fase === "cargando" || fase === "listo" || fase === "telefono") return
    setFase("cargando")
    await espera(900)
    intentos.current += 1
    const primera = intentos.current % 2 === 1
    if (modo === "telefono") {
      // Queda en el teléfono; cuando vuelve la señal se manda sola y dice «Listo».
      setFase("telefono")
      await espera(TELEFONO_MS * f)
      setFase("listo")
      await espera(LISTO_MS * f)
      setFase("reposo")
      return
    }
    if (primera) {
      sacudir()
      if (modo === "vuelve") {
        setFase("motivo")
        await espera(1800 * f)
      }
      setFase("fallo")
      return
    }
    setFase("listo")
    await espera(LISTO_MS * f)
    setFase("reposo")
  }
  if (fase === "listo") return <Pildora fase="listo" />
  const texto =
    fase === "telefono" ? "Guardado en el teléfono"
    : fase === "motivo" ? "No salió: se cortó la conexión"
    : fase === "fallo" ? (modo === "dice" ? "No salió · probá de nuevo" : "Probar de nuevo")
    : modo === "telefono" ? "Anotar $ 45.000"
    : "Mandar planilla"
  const icono: NombreIcono = fase === "telefono" ? "Celular" : fase === "fallo" || fase === "motivo" ? "Reintentar" : "Siguiente"
  return <PildoraSimple controles={ref} texto={texto} icono={icono} cargando={fase === "cargando"} onClick={() => void mandar()} />
}

/** Varias versiones apiladas, cada una con su letra. */
function Versiones({ items }: { items: { letra: string; nombre: string; muestra: React.ReactNode }[] }) {
  return (
    <div className="flex flex-col gap-4">
      {items.map((v) => (
        <div key={v.letra} className="flex flex-col gap-1.5">
          <p className="text-[13px] font-bold text-texto-suave">
            {v.letra} · {v.nombre}
          </p>
          {v.muestra}
        </div>
      ))}
    </div>
  )
}

const DEMAS: { nombre: string; idea: string; Muestra: () => React.ReactElement }[] = [
  { nombre: "Borra o anula", idea: "Dos tipos, según lo que la base permite. Nunca un «Deshacer» donde no existe.", Muestra: () => <Versiones items={[{ letra: "1", nombre: "Se puede deshacer (carga de caravanas, baja de la cuenta, señal marcada, pago)", muestra: <Borrar deshacible /> }, { letra: "2", nombre: "No se puede deshacer: pregunta antes", muestra: <Borrar deshacible={false} /> }]} /> },
  { nombre: "Avanza un paso", idea: "El paso nuevo entra desde la derecha y la rayita de arriba avanza. Todavía no guardó nada, así que no dice «Listo».", Muestra: Avanzar },
  { nombre: "Elige", idea: "Lo elegido se desliza hasta la opción nueva. Sirve para filtros, especie, campo y pestañas.", Muestra: Elegir },
  { nombre: "Cierra o cancela", idea: "El panel se achica un poco mientras se va. Queda un botón para volver a abrirlo.", Muestra: Cerrar },
  { nombre: "No salió", idea: "Sin texto abajo: lo dice el botón. En A y B la primera vez falla a propósito y la segunda sale. En C no hay error: queda en el teléfono y sube sola cuando hay señal (sólo lo que tiene cola en el celular).", Muestra: () => <Versiones items={[{ letra: "A", nombre: "El botón lo dice", muestra: <Falla modo="dice" /> }, { letra: "B", nombre: "Lo dice y vuelve", muestra: <Falla modo="vuelve" /> }, { letra: "C", nombre: "Sin señal: queda en el teléfono", muestra: <Falla modo="telefono" /> }]} /> },
]

function LosDemas() {
  return (
    <section className="flex flex-col gap-4 pt-4">
      <div>
        <h2 className="titulo-display text-[30px] leading-none text-texto">Los demás botones</h2>
        <p className="mt-2 max-w-[760px] text-[16px] text-texto-suave">
          Los que no guardan nada. Todos se hunden y rebotan al tocarlos; lo que pasa después depende de lo que hace el botón.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {DEMAS.map(({ nombre, idea, Muestra }) => (
          <div key={nombre} className="flex flex-col gap-4 rounded-[28px] border border-borde bg-superficie p-6">
            <div>
              <h3 className="font-heading text-[20px] leading-tight font-extrabold tracking-[-0.02em] text-texto">{nombre}</h3>
              <p className="mt-1.5 text-[15px] text-texto-suave">{idea}</p>
            </div>
            <div className="mt-auto">
              <Muestra />
            </div>
          </div>
        ))}
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
              El movimiento está en <code>lib/animacion.ts</code>: HUNDIR, RESORTE, SALTO, SACUDIDA, LISTO_LLENAR, LISTO_RECOGER, LISTO_TILDE, LISTO_ASENTIR, LISTO_MS y CAMBIO_ANCHO.
            </p>
          </section>

          {FAMILIAS.map((fam) => (
            <Fila key={fam.id} familia={fam} f={lenta ? 4 : 1} />
          ))}

          <LosDemas />
        </div>
      </main>
    </MotionConfig>
    </Velocidad.Provider>
  )
}
