// Página interna de desarrollo (/estilo/avisos): las cinco pantallas de aviso de la app
// (error, versión nueva, página que no existe, sin señal, acceso por WhatsApp) con la
// base nueva, para que Lau las vea juntas antes de cambiar `app/pantalla-aviso` (18/11).
// Lo nuevo: el orbe con su aura en lugar del logo en un cuadrado, el granulado de la web,
// un trazo a mano en la palabra que importa y WhatsApp de verdad cuando el texto lo nombra.
import { motion, MotionConfig } from "framer-motion"

import grano from "@/assets/tropero/grano.png"
import { Mascota, type Animo } from "@/features/campos/tropero/mascota"
import { cn } from "@/lib/utils"

import { BotonPrincipal } from "./boton"
import { Icono, type NombreIcono } from "./icono"
import { Logo } from "./logo"

function LogoWhatsapp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.13.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.16-.48-.29Z" />
    </svg>
  )
}

/** El trazo a mano en rojo de la landing, que se dibuja una vez. */
function Trazo({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden className="absolute -left-[2%] -bottom-[0.14em] h-[0.26em] w-[104%] overflow-visible">
        <motion.path
          d="M3 9.5C40 4 92 3.2 130 5.2c24 1.3 44 3.1 67 1.6"
          fill="none"
          stroke="#c8401a"
          strokeWidth={4}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, delay: 0.5, ease: [0.6, 0, 0.2, 1] }}
        />
      </svg>
    </span>
  )
}

/** El orbe con el aura de trigo y terracota que se deshace en el granulado (como en la barra). */
function OrbeConAura({ animo = "normal" }: { animo?: Animo }) {
  return (
    <span className="relative grid size-[132px] place-items-center">
      <span aria-hidden className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle, rgb(236 196 106 / .5) 0%, rgb(201 126 91 / .26) 40%, rgb(184 92 46 / 0) 70%)" }} />
      <span
        aria-hidden
        className="absolute inset-0 rounded-full opacity-70 mix-blend-multiply [background-size:80px_80px]"
        style={{ backgroundImage: `url(${grano})`, maskImage: "radial-gradient(circle, black 28%, transparent 68%)", WebkitMaskImage: "radial-gradient(circle, black 28%, transparent 68%)" }}
      />
      <span className="relative">
        <Mascota tam={96} animo={animo} />
      </span>
    </span>
  )
}

/** WhatsApp como en la landing («Preguntanos»): blanco, borde suave y el logo en verde. */
function BotonWhatsapp({ children, lleno = false }: { children: React.ReactNode; lleno?: boolean }) {
  return (
    <motion.a
      href="#"
      onClick={(e) => e.preventDefault()}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-[16px] font-bold",
        lleno
          ? "text-white shadow-[inset_0_1px_0_rgb(255_255_255/.25),0_12px_24px_-12px_rgb(31_174_85/.8)]"
          : "bg-superficie text-texto shadow-[inset_0_0_0_1.5px_var(--borde)]",
      )}
      style={lleno ? { background: "linear-gradient(180deg, #2bd46d 0%, #1fae55 100%)" } : undefined}
    >
      <LogoWhatsapp className={cn("size-[21px]", lleno ? "text-white" : "text-[#1fae55]")} />
      {children}
    </motion.a>
  )
}

/** La base nueva de los avisos. En la app reemplazaría a `PantallaAviso` (celular; la compu suma la tranquera). */
function Aviso({
  etiqueta,
  titulo,
  texto,
  animo,
  principal,
  whatsapp,
  link,
}: {
  /** Qué pasa, en dos o tres palabras, arriba del título. */
  etiqueta: { texto: string; tono: "rojo" | "trigo" | "gris" | "verde" }
  titulo: React.ReactNode
  texto: string
  animo?: Animo
  principal?: { texto: string; icono: NombreIcono }
  whatsapp?: { texto: string; lleno?: boolean }
  link?: { texto: string; icono?: NombreIcono }
}) {
  const punto = { rojo: "bg-[#c8401a]", trigo: "bg-trigo-500", gris: "bg-texto-suave/50", verde: "bg-[#25d366]" }[etiqueta.tono]
  return (
    <div className="relative isolate flex h-[760px] flex-col overflow-hidden bg-[#fff8ec] px-6 pt-7 pb-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-90 [background-size:120px_120px]" style={{ backgroundImage: `url(${grano})` }} />
      <div className="flex justify-center">
        <Logo alto={24} />
      </div>
      <div className="my-auto flex flex-col items-center text-center">
        <OrbeConAura animo={animo} />
        <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-superficie/80 px-3 py-1 text-[12.5px] font-semibold text-texto-suave shadow-[inset_0_0_0_1px_var(--borde)]">
          <span className={cn("size-[7px] rounded-full", punto)} />
          {etiqueta.texto}
        </span>
        <h1 className="titulo-display mt-4 text-[32px] leading-[1.08] text-balance text-texto">{titulo}</h1>
        <p className="mt-3 max-w-[320px] text-[16.5px] leading-snug text-pretty text-texto-suave">{texto}</p>
      </div>
      <div className="flex flex-col items-center gap-3">
        {principal && (
          <BotonPrincipal icono={principal.icono} className="w-full">
            {principal.texto}
          </BotonPrincipal>
        )}
        {whatsapp && <BotonWhatsapp lleno={whatsapp.lleno}>{whatsapp.texto}</BotonWhatsapp>}
        {link && (
          <button type="button" className="mt-1 inline-flex h-10 items-center gap-1.5 px-3 text-[15px] font-semibold text-texto-suave underline decoration-borde decoration-[1.5px] underline-offset-4 hover:text-texto">
            {link.icono && <Icono nombre={link.icono} tamano={16} />}
            {link.texto}
          </button>
        )}
      </div>
    </div>
  )
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 px-1 text-[12px] font-bold tracking-[0.06em] text-[#5c4e40] uppercase">{children}</p>
}

const AVISOS: { rotulo: string; aviso: React.ComponentProps<typeof Aviso> }[] = [
  {
    rotulo: "1 · Algo falló (error de la app)",
    aviso: {
      etiqueta: { texto: "Se trabó esta pantalla", tono: "rojo" },
      titulo: <>Algo no <Trazo>cargó</Trazo></>,
      texto: "Tus datos están bien guardados. Probá de nuevo; si sigue pasando, avisanos y lo miramos.",
      animo: "piensa",
      principal: { texto: "Volver a intentar", icono: "Reintentar" },
      whatsapp: { texto: "Avisarnos por WhatsApp" },
      link: { texto: "Ir al Inicio", icono: "Inicio" },
    },
  },
  {
    rotulo: "2 · Versión nueva",
    aviso: {
      etiqueta: { texto: "Troppero se actualizó", tono: "trigo" },
      titulo: <>Hay una versión <Trazo>nueva</Trazo></>,
      texto: "Se actualizó mientras lo tenías abierto. Con recargar alcanza; no perdés nada.",
      animo: "festeja",
      principal: { texto: "Recargar", icono: "Reintentar" },
    },
  },
  {
    rotulo: "3 · La página no existe",
    aviso: {
      etiqueta: { texto: "Link viejo o mal escrito", tono: "gris" },
      titulo: <>No encontramos esta <Trazo>página</Trazo></>,
      texto: "Puede que el link sea viejo o que esté mal escrito. Tus datos están bien.",
      animo: "piensa",
      principal: { texto: "Ir al Inicio", icono: "Inicio" },
      link: { texto: "Volver a donde estabas" },
    },
  },
  {
    rotulo: "4 · Sin señal la primera vez",
    aviso: {
      etiqueta: { texto: "Sin señal ahora", tono: "gris" },
      titulo: <>Necesitás señal <Trazo>una vez</Trazo></>,
      texto: "La primera vez en este equipo hay que bajar tu campo. Conectate un momento y volvé a intentar; después anda sin señal.",
      animo: "duerme",
      principal: { texto: "Reintentar", icono: "Reintentar" },
    },
  },
  {
    rotulo: "5 · Acceso sólo por WhatsApp",
    aviso: {
      etiqueta: { texto: "Lo tuyo va por WhatsApp", tono: "verde" },
      titulo: <>Tu acceso es por <Trazo>WhatsApp</Trazo></>,
      texto: "En La Porteña, lo tuyo lo mandás por WhatsApp: novedades, gastos o facturas. No hace falta usar la app.",
      whatsapp: { texto: "Abrir WhatsApp", lleno: true },
      link: { texto: "Entrar con otra cuenta" },
    },
  },
]

export function AvisosMuestra() {
  return (
    <MotionConfig reducedMotion="user">
      <div id="muestra" className="h-dvh overflow-y-auto bg-[#e9e3d6]">
        <div className="mx-auto flex max-w-[420px] flex-col gap-10 px-4 py-6">
          {AVISOS.map(({ rotulo, aviso }) => (
            <div key={rotulo}>
              <Rotulo>{rotulo}</Rotulo>
              <div className="overflow-hidden rounded-[28px] shadow-[0_24px_50px_-28px_rgb(58_26_13/.45)] ring-1 ring-black/5">
                <Aviso {...aviso} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </MotionConfig>
  )
}
