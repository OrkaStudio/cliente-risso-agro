// Muestra (18/11): el encabezado fijo del celular y su pantalla de Configuración, para que
// Lau elija antes de llevarlo a la app. El encabezado es la barra de vidrio de troppero.com
// (como la de abajo): el logo y, a la derecha, Configuración en lugar del avatar. Adentro,
// la cuenta, «Tener Troppero en tu celular» (cambia según el teléfono) y cerrar sesión.
import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"

import { cn } from "@/lib/utils"

import { BotonPrincipal } from "./boton"
import { Icono } from "./icono"
import { Logo } from "./logo"

const VIDRIO =
  "bg-[rgb(255_253_249/.74)] backdrop-blur-[18px] backdrop-saturate-150 shadow-[inset_0_0_0_1.5px_rgb(255_255_255/.9),0_14px_34px_-18px_rgb(168_80_16/.55)]"
const TARJETA = "rounded-[20px] bg-superficie shadow-[inset_0_0_0_1px_var(--borde),0_18px_40px_-30px_rgb(168_80_16/.45)]"

/** El encabezado fijo: el logo y Configuración, en vidrio. Acompaña en todo el celular. */
export function Encabezado({ onConfig }: { onConfig?: () => void }) {
  return (
    <header className={cn("flex h-[58px] items-center justify-between rounded-full pr-[7px] pl-5", VIDRIO)}>
      <Logo alto={22} />
      <motion.button
        type="button"
        onClick={onConfig}
        whileTap={{ scale: 0.92 }}
        aria-label="Configuración"
        className="grid size-11 place-items-center rounded-full bg-superficie text-terracota-900/80 shadow-[inset_0_0_0_1px_var(--borde)]"
      >
        <Icono nombre="Usuario" />
      </motion.button>
    </header>
  )
}

// ===== «Tener Troppero en tu celular» =====

type Telefono = "android" | "iphone" | "whatsapp" | "instalada"

function Compartir({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  )
}

function AgregarInicio({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  )
}

/** Un paso con su número y el ícono tal como lo va a ver en el teléfono. */
function Paso({ n, children, icono }: { n: number; children: React.ReactNode; icono: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-trigo-100 text-[13px] font-bold text-trigo-800">{n}</span>
      <span className="min-w-0 flex-1 text-[15px] leading-snug text-texto">{children}</span>
      <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-fondo text-[#1a73e8] shadow-[inset_0_0_0_1px_var(--borde)]">{icono}</span>
    </li>
  )
}

function TenerEnTuCelular({ telefono }: { telefono: Telefono }) {
  return (
    <section className={cn(TARJETA, "flex flex-col gap-4 p-4")}>
      <div className="flex items-center gap-3.5">
        {/* Cómo se va a ver en la pantalla de inicio. */}
        <span className="grid size-[52px] shrink-0 place-items-center rounded-[14px] shadow-[inset_0_1px_0_rgb(255_255_255/.25),0_8px_16px_-8px_rgb(152_75_37/.7)]" style={{ background: "linear-gradient(180deg, #c46a3a 0%, #a9532a 100%)" }}>
          <Logo soloIsotipo tono="hueso" alto={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] leading-snug font-bold text-texto">Tené Troppero en tu celular</span>
          <span className="mt-0.5 block text-[13.5px] leading-snug text-texto-suave">Se abre de un toque, como una app, y anda sin señal.</span>
        </span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={telefono} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
          {telefono === "android" && (
            <BotonPrincipal icono="Descargar" className="w-full">
              Agregar a tu celular
            </BotonPrincipal>
          )}
          {telefono === "iphone" && (
            <ol className="flex flex-col gap-3 rounded-[16px] bg-fondo/70 p-3.5">
              <Paso n={1} icono={<Compartir className="size-[22px]" />}>
                Tocá <b>Compartir</b>, abajo en Safari
              </Paso>
              <Paso n={2} icono={<AgregarInicio className="size-[22px]" />}>
                Elegí <b>Agregar a inicio</b>
              </Paso>
            </ol>
          )}
          {telefono === "whatsapp" && (
            <p className="rounded-[16px] bg-trigo-50 p-3.5 text-[14.5px] leading-snug text-texto shadow-[inset_0_0_0_1px_var(--color-trigo-200)]">
              Lo abriste desde WhatsApp. Tocá <b>⋮</b> arriba y elegí <b>Abrir en el navegador</b>: ahí te aparece el botón.
            </p>
          )}
          {telefono === "instalada" && (
            <p className="flex items-center gap-2 rounded-full bg-[var(--listo-suave,#ecf1d6)] px-4 py-2.5 text-[14.5px] font-semibold text-pasto-800">
              <span className="grid size-6 place-items-center rounded-full bg-pasto-600 text-white">
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
              </span>
              Ya lo tenés en tu celular
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  )
}

/** Una fila de la lista de cuenta: ícono, qué hace y la flecha. */
function Fila({ icono, children, onClick, tono = "normal" }: { icono: "Usuario" | "Salir"; children: React.ReactNode; onClick?: () => void; tono?: "normal" | "aviso" }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", tono === "aviso" ? "bg-[#fbe6dc] text-[#c8401a]" : "bg-fondo text-texto-suave")}>
        <Icono nombre={icono} tamano={16} />
      </span>
      <span className={cn("min-w-0 flex-1 text-[15.5px] font-semibold", tono === "aviso" ? "text-[#c8401a]" : "text-texto")}>{children}</span>
      {tono === "normal" && <Icono nombre="Siguiente" tamano={16} className="text-texto-suave/60" />}
    </button>
  )
}

/** La pantalla de Configuración del celular. */
export function ConfigCelu({ telefono, onVolver }: { telefono: Telefono; onVolver?: () => void }) {
  const [salir, setSalir] = useState(false)
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <motion.button type="button" onClick={onVolver} whileTap={{ scale: 0.92 }} aria-label="Volver" className={cn("grid size-11 shrink-0 place-items-center rounded-full text-texto", VIDRIO)}>
          <Icono nombre="Atrás" />
        </motion.button>
        <h1 className="titulo-display text-[30px] leading-tight text-texto">Configuración</h1>
      </div>

      {/* Quién sos y en qué cuenta estás. */}
      <section className={cn(TARJETA, "flex items-center gap-3.5 p-4")}>
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-trigo-300 font-heading text-[18px] font-extrabold text-trigo-900">P</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] leading-snug font-bold text-texto">Prueba</span>
          <span className="block text-[13.5px] text-texto-suave tabular-nums">+54 9 2240 00-0001</span>
        </span>
        <span className="rounded-full bg-fondo px-3 py-1 text-[12.5px] font-semibold text-texto-suave shadow-[inset_0_0_0_1px_var(--borde)]">E2E Pruebas</span>
      </section>

      <TenerEnTuCelular telefono={telefono} />

      <section className={cn(TARJETA, "divide-y divide-borde overflow-hidden")}>
        <Fila icono="Usuario">Cambiar de cuenta</Fila>
        <Fila icono="Salir" tono="aviso" onClick={() => setSalir((v) => !v)}>
          {salir ? "Tocá de nuevo para cerrar sesión" : "Cerrar sesión"}
        </Fila>
      </section>
    </div>
  )
}

/** El bloque de la muestra: el encabezado sobre una pantalla, y Configuración con el teléfono elegible. */
export function MuestraEncabezadoYConfig({ Rotulo }: { Rotulo: (p: { children: React.ReactNode }) => React.ReactNode }) {
  const [telefono, setTelefono] = useState<Telefono>("android")
  const opciones: [Telefono, string][] = [["android", "Android"], ["iphone", "iPhone"], ["whatsapp", "Desde WhatsApp"], ["instalada", "Ya instalada"]]
  return (
    <>
      <div>
        <Rotulo>El encabezado · fijo arriba, en todo el celular</Rotulo>
        <div className="relative">
          <Encabezado />
          <div aria-hidden className="mt-4 rounded-[20px] bg-superficie p-4 shadow-[inset_0_0_0_1px_var(--borde)]">
            <p className="titulo-display text-[26px] text-texto">Buenas tardes, Prueba.</p>
            <p className="mt-1 text-[14px] text-texto-suave">Así arranca Hoy, debajo del encabezado.</p>
          </div>
        </div>
      </div>
      <div>
        <Rotulo>Configuración · elegí el teléfono</Rotulo>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {opciones.map(([v, t]) => (
            <button key={v} type="button" onClick={() => setTelefono(v)} className={cn("h-8 rounded-full px-3 text-[13px] font-semibold", telefono === v ? "bg-terracota-500 text-white" : "bg-superficie text-texto-suave shadow-[inset_0_0_0_1px_var(--borde)]")}>
              {t}
            </button>
          ))}
        </div>
        <ConfigCelu telefono={telefono} />
      </div>
    </>
  )
}
