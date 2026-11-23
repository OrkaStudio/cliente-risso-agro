// El audio por WhatsApp en compacto (elegido por Lau el 18/11 en /estilo/barra-celu):
// WhatsApp a la izquierda (a dónde va), el título con el trazo a mano de la landing y
// el micrófono a la derecha (qué hacés), como el botón de grabar de WhatsApp.
import { motion } from 'framer-motion'

import { cn } from '@/lib/utils'

const TINTA = '#33261a'
const GRIS = '#5c4e40'

export function LogoWhatsapp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.13.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.16-.48-.29Z" />
    </svg>
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

/** El trazo a mano en rojo de la landing, que se dibuja una vez. */
export function Trazo({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden className="absolute -bottom-[0.18em] -left-[2%] h-[0.3em] w-[104%] overflow-visible">
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

/**
 * La tarjeta del audio: tocarla (o el micrófono) abre el chat de Troppero en WhatsApp.
 * `antes` y `marcado` arman el título: «Contame cómo está» + «tu campo» subrayado.
 */
export function AudioWhatsapp({ href, antes, marcado, bajada, className, onClick }: { href: string; antes: string; marcado: string; bajada: string; className?: string; onClick?: () => void }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      aria-label={`${antes} ${marcado}: mandar un audio por WhatsApp`}
      className={cn('flex items-center gap-2.5 rounded-[20px] bg-[#fffdf9] p-3 shadow-[inset_0_0_0_1px_#e6ddcc,0_18px_40px_-30px_rgb(168_80_16/.5)]', className)}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#dcf8c6] text-[#1fae55]">
        <LogoWhatsapp className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] leading-snug font-bold tracking-[-0.015em]" style={{ color: TINTA }}>
          {antes} <Trazo>{marcado}</Trazo>
        </span>
        <span className="mt-1 block text-[12.5px] leading-snug" style={{ color: GRIS }}>
          {bajada}
        </span>
      </span>
      <motion.span
        whileTap={{ scale: 0.94 }}
        aria-hidden
        className="grid size-[48px] shrink-0 place-items-center rounded-full text-white shadow-[inset_0_1px_0_rgb(255_255_255/.25),0_10px_20px_-10px_rgb(31_174_85/.8)]"
        style={{ background: 'linear-gradient(180deg, #2bd46d 0%, #1fae55 100%)' }}
      >
        <Microfono className="size-[21px]" />
      </motion.span>
    </a>
  )
}
