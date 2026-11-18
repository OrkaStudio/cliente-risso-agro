// La marca en vidrio: la T de Troppero aparece grande detrás del borde de un vidrio que la
// dobla en color, el vidrio la suelta y entran la palabra y el lema. Se repite al tocarla.
// Motor: components/ui/liquid-glass-logo-reveal.tsx (WebGL2; sin WebGL queda la T quieta).
import { motion } from "framer-motion"
import { useState } from "react"

import { GlassIconReveal } from "@/components/ui/liquid-glass-logo-reveal"
import { CURVA } from "@/lib/animacion"
import { cn } from "@/lib/utils"

import { Logo } from "./logo"

// El isotipo de logo.tsx (ISOTIPO), como SVG suelto: el motor arma su forma desde acá.
const ISOTIPO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 5.06 117.46 112.76"><path d="M0 5.0625H117.456V33.2519H81.0444C61.582 33.2519 45.8077 49.0262 45.8077 68.4886V117.82H14.0947V33.2519H0V5.0625Z"/></svg>'

// El vidrio pinta su propio fondo: tiene que ser el de la página (--fondo de index.css).
// La palabra va por encima del lienzo (z-10): si no, cuando el vidrio se va, el lienzo la tapa.
// Hueso es base/hueso del manual (#f4f1e9). «placa»: vidrio oscuro, como ícono de app, sobre hueso.
const TONOS = {
  dia: { look: "light", fondo: "#f4f1e9", placa: "#fbfaf6", quedaPlaca: false },
  // Termina en la placa tinta firme, como el ícono: deshecha sobre hueso se veía gris y borrosa.
  placa: { look: "dark", fondo: "#f4f1e9", placa: "#131b16", quedaPlaca: true },
  noche: { look: "dark", fondo: "#131b16", placa: "#0d130f", quedaPlaca: false },
} as const

/** Cuándo suelta el vidrio la T (el motor la presenta 2,4 s): ahí entran la palabra y el lema. */
const SUELTA = 2.5

/** «troppero» sin la T (la T ya la dibuja el vidrio): el Logo entero, corrido para que la T
 *  quede fuera del recuadro. En logo.tsx la caja mide 906 × 150 y la palabra arranca en x = 186;
 *  así no hace falta tocar el componente de la app. */
function Palabra({ alto }: { alto: number }) {
  const escala = alto / 150
  return (
    <span className="block overflow-hidden" style={{ width: 720 * escala, height: alto }}>
      <span className="block" style={{ marginLeft: -186 * escala }}>
        <Logo tono="tinta" alto={alto} />
      </span>
    </span>
  )
}

export function MarcaVidrio({ tono = "dia", conLema = true, className }: { tono?: keyof typeof TONOS; conLema?: boolean; className?: string }) {
  // Cada toque repite el vidrio (lo hace el motor) y vuelve a hacer entrar la palabra.
  const [vuelta, setVuelta] = useState(0)
  const t = TONOS[tono]
  return (
    <div className={cn("flex flex-col items-center", tono === "noche" && "dark", className)} style={{ backgroundColor: t.fondo }}>
      <GlassIconReveal
        logo={ISOTIPO_SVG}
        label="Troppero"
        look={t.look}
        background={t.fondo}
        plateColor={t.placa}
        keepPlate={t.quedaPlaca}
        logoColor="#b85c2e"
        logoScale={0.6}
        finalScale={0.78}
        loop={false}
        // Poca saturación: dentro del vidrio la terracota se volvía naranja fluo.
        tuning={{ vivid: 0.12 }}
        className="h-[300px] w-full"
        onClick={() => setVuelta((v) => v + 1)}
      />
      <motion.div
        key={vuelta}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: SUELTA, duration: 0.7, ease: CURVA }}
        className="relative z-10 -mt-10 flex flex-col items-center gap-3 px-6 pb-10 text-center"
      >
        <Palabra alto={34} />
        {conLema && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: SUELTA + 0.35, duration: 0.7, ease: CURVA }}
            className="font-heading text-[19px] font-bold tracking-[-0.01em] text-texto-suave"
          >
            Tu campo, donde lo dejaste.
          </motion.p>
        )}
      </motion.div>
    </div>
  )
}
