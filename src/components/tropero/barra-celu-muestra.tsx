// Página interna de desarrollo (/estilo/barra-celu): la barra de abajo del celular y la
// tarjeta del audio, para que Lau elija (18/11, segunda vuelta). Sale de troppero.com:
// el vidrio de la barra, el botón tinta con el punto «en línea» de WhatsApp, el trazo a
// mano en rojo y la nota de voz de las historias.
import { useState } from "react"
import { motion, MotionConfig, useReducedMotion } from "framer-motion"

import grano from "@/assets/tropero/grano.png"
import { Mascota } from "@/features/campos/tropero/mascota"
import { cn } from "@/lib/utils"

import { MuestraEncabezadoYConfig } from "./config-celu-muestra"
import { Icono, type NombreIcono } from "./icono"

const TABS: { label: string; icono: NombreIcono }[] = [
  { label: "Hoy", icono: "Inicio" },
  { label: "Campos", icono: "Campos" },
  { label: "Hacienda", icono: "Hacienda" },
  { label: "Plata", icono: "Plata" },
]

// Los colores de la landing.
const TINTA = "#33261a"
const GRIS = "#5c4e40"
const VIDRIO =
  "bg-[rgb(255_253_249/.8)] backdrop-blur-[18px] backdrop-saturate-150 shadow-[inset_0_0_0_1.5px_rgb(255_255_255/.9),0_0_0_1px_rgb(58_26_13/.09),0_14px_34px_-16px_rgb(168_80_16/.55)]"
const RESORTE = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const

function LogoWhatsapp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.13.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.16-.48-.29Z" />
    </svg>
  )
}

/** El «en línea» de WhatsApp, como en el botón de la landing: respira despacio. */
function EnLinea({ borde = TINTA }: { borde?: string }) {
  const quieto = !!useReducedMotion()
  return (
    <span aria-hidden className="absolute -top-[3px] -right-[3px] size-[9px] rounded-full bg-[#25d366]" style={{ boxShadow: `0 0 0 2px ${borde}` }}>
      {!quieto && (
        <motion.span
          className="absolute inset-0 rounded-full bg-[#25d366]"
          initial={{ scale: 1, opacity: 0.7 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{ duration: 2.6, ease: "easeOut", repeat: Infinity, repeatDelay: 0.4 }}
        />
      )}
    </span>
  )
}

/** El trazo a mano en rojo de la landing, que se dibuja una vez. */
function Trazo({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden className="absolute -left-[2%] -bottom-[0.18em] h-[0.3em] w-[104%] overflow-visible">
        <motion.path
          d="M3 9.5C40 4 92 3.2 130 5.2c24 1.3 44 3.1 67 1.6"
          fill="none"
          stroke="#c8401a"
          strokeWidth={3.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, delay: 0.4, ease: [0.6, 0, 0.2, 1] }}
        />
      </svg>
    </span>
  )
}

// ===== La barra =====

/**
 * Vidrio, como la barra de troppero.com, con los colores de Troppero: lo elegido, una
 * pastilla terracota que viaja de sección en sección, con el ícono en trigo; el asistente,
 * su propio botón redondo al final, terracota oscuro con un anillo de trigo.
 */
function Barra({ activa, setActiva }: { activa: number; setActiva: (i: number) => void }) {
  return (
    <nav aria-label="Secciones" className={cn("flex items-center gap-1 rounded-full p-[5px]", VIDRIO)}>
      {TABS.map((t, i) => {
        const esta = i === activa
        return (
          <motion.button
            key={t.label}
            type="button"
            onClick={() => setActiva(i)}
            whileTap={{ scale: 0.94 }}
            aria-current={esta ? "page" : undefined}
            className="relative flex h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-[5px] rounded-full"
          >
            {esta && (
              <motion.span
                layoutId="pastilla"
                transition={RESORTE}
                className="absolute inset-x-[2px] inset-y-[3px] rounded-full shadow-[inset_0_1px_0_rgb(255_255_255/.22),inset_0_-1px_0_rgb(58_26_13/.18),0_4px_10px_-6px_rgb(152_75_37/.7)]"
                style={{ background: "linear-gradient(180deg, #c46a3a 0%, #b85c2e 55%, #a9532a 100%)" }}
              />
            )}
            <span className={cn("relative transition-colors duration-200", esta ? "text-trigo-300" : "text-[#5c4e40]")}>
              <Icono nombre={t.icono} />
            </span>
            <span className={cn("relative text-[11.5px] leading-none tracking-[-0.01em] transition-colors duration-200", esta ? "font-bold text-white" : "font-semibold text-[#5c4e40]")}>
              {t.label}
            </span>
          </motion.button>
        )
      })}
      <span aria-hidden className="mx-0.5 h-8 w-px shrink-0 bg-terracota-900/10" />
      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        aria-label="El asistente de Troppero"
        className="relative grid size-[58px] shrink-0 place-items-center rounded-full"
      >
        {/* Sin fondo: sólo el orbe, con un aura de trigo y terracota que se deshace en el
            granulado de la web (Lau, 18/11). Quieta: nada titila. */}
        <span
          aria-hidden
          className="absolute -inset-1 rounded-full"
          style={{ background: "radial-gradient(circle, rgb(236 196 106 / .45) 0%, rgb(201 126 91 / .32) 42%, rgb(184 92 46 / 0) 70%)" }}
        />
        <span
          aria-hidden
          className="absolute -inset-1.5 rounded-full opacity-70 mix-blend-multiply [background-size:60px_60px]"
          style={{
            backgroundImage: `url(${grano})`,
            maskImage: "radial-gradient(circle, black 30%, transparent 68%)",
            WebkitMaskImage: "radial-gradient(circle, black 30%, transparent 68%)",
          }}
        />
        {/* El cuerpo del orbe es la mitad de su `tam`: con 86 queda un poco más chico que el botón (Lau, 19/11). */}
        <span className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <Mascota tam={86} />
        </span>
      </motion.button>
    </nav>
  )
}

// ===== El audio =====

const ONDA = [30, 55, 80, 45, 95, 60, 35, 70, 100, 55, 30, 65, 85, 40, 70, 35, 55, 80, 30, 45, 65, 35, 50, 25]

/** La nota de voz de las historias de la landing: play verde, la onda y los dos tildes. */
function NotaDeVoz() {
  return (
    <div className="ml-auto w-[88%] rounded-[12px] rounded-tr-[3px] bg-[#dcf8c6] px-2.5 pt-2 pb-1.5 shadow-[0_1px_0_rgb(0_0_0/.06)]">
      <div className="flex items-center gap-2.5">
        <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-[#1fae55]">
          <span className="ml-0.5 border-y-[6px] border-l-[10px] border-y-transparent border-l-white" />
        </span>
        <span className="flex h-6 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
          {ONDA.map((a, i) => (
            <i key={i} className={cn("w-[3px] shrink-0 rounded-[2px]", i < 9 ? "bg-[#3f6b4c]" : "bg-[#7f9a86]")} style={{ height: `${a}%` }} />
          ))}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between pl-[40px] text-[11px] text-[#5c4e40]">
        <span className="tabular-nums">0:24</span>
        <span>
          7:42 <span className="tracking-[-2px] text-[#34a7dc]">✓✓</span>
        </span>
      </div>
    </div>
  )
}

/** El botón tinta de la landing, con WhatsApp y su punto «en línea». */
function BotonAudio({ ancho = true }: { ancho?: boolean }) {
  return (
    <motion.a
      href="#"
      onClick={(e) => e.preventDefault()}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "flex items-center justify-center gap-2.5 rounded-full text-[15.5px] font-semibold text-[#fff8ec] shadow-[0_10px_22px_-12px_rgb(51_38_26/.7)]",
        ancho ? "h-[50px] w-full" : "size-[50px] shrink-0",
      )}
      style={{ background: TINTA }}
      aria-label={ancho ? undefined : "Mandar un audio por WhatsApp"}
    >
      <span className="relative inline-grid">
        <LogoWhatsapp className="size-[20px]" />
        <EnLinea />
      </span>
      {ancho && "Mandar un audio"}
    </motion.a>
  )
}

/** 1 · Completa: lo que va a pasar, a la vista (tu audio y la respuesta), y el botón. */
function AudioCompleta() {
  return (
    <section className="flex flex-col gap-4 rounded-[24px] bg-[#fffdf9] p-4 shadow-[inset_0_0_0_1px_#e6ddcc,0_24px_50px_-32px_rgb(168_80_16/.5)]">
      <div>
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#1f8f4e]">
          <LogoWhatsapp className="size-[14px]" />
          Por WhatsApp
        </p>
        <p className="mt-1.5 text-[19px] leading-[1.2] font-bold tracking-[-0.02em]" style={{ color: TINTA }}>
          Contame cómo está <Trazo>tu campo</Trazo>
        </p>
        <p className="mt-1.5 text-[13.5px] leading-snug" style={{ color: GRIS }}>
          El agua, el pasto, los animales. Lo anoto en cada potrero.
        </p>
      </div>
      {/* La conversación en chiquito: tu audio y lo que contesta. */}
      <div className="flex flex-col gap-1.5 rounded-[16px] bg-[#ece5da] p-2.5">
        <NotaDeVoz />
        <div className="mr-auto flex max-w-[82%] items-center gap-2 rounded-[12px] rounded-tl-[3px] bg-[#fffdf9] px-2.5 py-1.5 text-[13px] shadow-[0_1px_0_rgb(0_0_0/.06)]" style={{ color: TINTA }}>
          <Mascota tam={18} />
          <span>
            Listo, lo anoté en cada potrero.
          </span>
        </div>
      </div>
      <BotonAudio />
    </section>
  )
}

function Microfono({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="2.5" width="6" height="11.5" rx="3" fill="currentColor" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  )
}

/**
 * 2 · Compacta: WhatsApp a la izquierda (a dónde va) y el micrófono a la derecha (qué hacés),
 * como el botón de grabar de WhatsApp. Tocar el micrófono abre el chat (Lau, 18/11).
 */
function AudioCompacta() {
  return (
    <section className="flex items-center gap-2.5 rounded-[22px] bg-[#fffdf9] p-3 shadow-[inset_0_0_0_1px_#e6ddcc,0_24px_50px_-32px_rgb(168_80_16/.5)]">
      <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-[#dcf8c6] text-[#1fae55]">
        <LogoWhatsapp className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] leading-snug font-bold tracking-[-0.015em] whitespace-nowrap" style={{ color: TINTA }}>
          Contame cómo está <Trazo>tu campo</Trazo>
        </span>
        <span className="mt-1 block text-[12.5px] leading-snug" style={{ color: GRIS }}>
          Un audio por WhatsApp y lo anoto
        </span>
      </span>
      <motion.a
        href="#"
        onClick={(e) => e.preventDefault()}
        whileTap={{ scale: 0.94 }}
        aria-label="Grabar un audio por WhatsApp"
        className="grid size-[52px] shrink-0 place-items-center rounded-full text-white shadow-[inset_0_1px_0_rgb(255_255_255/.25),0_10px_20px_-10px_rgb(31_174_85/.8)]"
        style={{ background: "linear-gradient(180deg, #2bd46d 0%, #1fae55 100%)" }}
      >
        <Microfono className="size-[22px]" />
      </motion.a>
    </section>
  )
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 px-1 text-[12px] font-bold tracking-[0.06em] uppercase" style={{ color: GRIS }}>{children}</p>
}

export function BarraCeluMuestra() {
  const [activa, setActiva] = useState(0)
  return (
    <MotionConfig reducedMotion="user">
      <div id="muestra" className="relative isolate h-dvh overflow-y-auto bg-[#fff8ec]">
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 opacity-90 [background-size:120px_120px]" style={{ backgroundImage: `url(${grano})` }} />
        <div className="mx-auto flex max-w-[420px] flex-col gap-10 px-4 py-6">
          <MuestraEncabezadoYConfig Rotulo={Rotulo} />
          <div>
            <Rotulo>La barra · tocá las secciones</Rotulo>
            {/* Contenido detrás, como en la app: el vidrio deja ver lo que pasa por debajo. */}
            <div className="relative">
              <div aria-hidden className="mb-[-34px] rounded-[20px] bg-[#fffdf9] p-4 pb-12 shadow-[inset_0_0_0_1px_#e6ddcc]">
                <span className="mr-2 inline-block rounded-full bg-[#f1ebdf] px-3 py-1 text-[14px]">Terneras <b>2</b></span>
                <span className="inline-block rounded-full bg-[#f1ebdf] px-3 py-1 text-[14px]">Terneros <b>2</b></span>
              </div>
              <Barra activa={activa} setActiva={setActiva} />
            </div>
          </div>

          <div>
            <Rotulo>El audio · completa</Rotulo>
            <AudioCompleta />
          </div>
          <div>
            <Rotulo>El audio · compacta</Rotulo>
            <AudioCompacta />
          </div>
        </div>
      </div>
    </MotionConfig>
  )
}
