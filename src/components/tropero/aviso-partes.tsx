// Las piezas de los avisos del celular (18/11): el orbe con su aura de trigo que se deshace
// en el granulado de la web, el trazo a mano en rojo de troppero.com y el logo de WhatsApp.
import { motion } from "framer-motion"

import grano from "@/assets/tropero/grano.png"
import { Mascota, type Animo } from "@/features/campos/tropero/mascota"

export function LogoWhatsapp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.13.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.16-.48-.29Z" />
    </svg>
  )
}

/** El trazo a mano en rojo de la landing debajo de una palabra; se dibuja una vez. */
export function Trazo({ children }: { children: React.ReactNode }) {
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

/** Un título con una palabra subrayada a mano (si está en el título). */
export function ConTrazo({ texto, subrayar }: { texto: string; subrayar?: string }) {
  const i = subrayar ? texto.lastIndexOf(subrayar) : -1
  if (!subrayar || i < 0) return <>{texto}</>
  return (
    <>
      {texto.slice(0, i)}
      <Trazo>{subrayar}</Trazo>
      {texto.slice(i + subrayar.length)}
    </>
  )
}

/** El orbe con el aura de trigo y terracota que se deshace en el granulado. Quieta: nada titila. */
export function OrbeConAura({ animo = "normal", tam = 96 }: { animo?: Animo; tam?: number }) {
  const caja = Math.round(tam * 1.375)
  return (
    <span className="relative grid place-items-center" style={{ width: caja, height: caja }}>
      <span aria-hidden className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle, rgb(236 196 106 / .5) 0%, rgb(201 126 91 / .26) 40%, rgb(184 92 46 / 0) 70%)" }} />
      <span
        aria-hidden
        className="absolute inset-0 rounded-full opacity-70 mix-blend-multiply [background-size:80px_80px]"
        style={{ backgroundImage: `url(${grano})`, maskImage: "radial-gradient(circle, black 28%, transparent 68%)", WebkitMaskImage: "radial-gradient(circle, black 28%, transparent 68%)" }}
      />
      <span className="relative">
        <Mascota tam={tam} animo={animo} />
      </span>
    </span>
  )
}
