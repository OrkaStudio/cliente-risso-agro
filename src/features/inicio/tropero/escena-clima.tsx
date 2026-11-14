import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import campoMolino from '@/assets/tropero/molino/campo.svg'
import rueda from '@/assets/tropero/molino/rueda.svg'
import type { Cielo } from './dia'

// La escena del molino (página 31.5) con el clima de ahora: el cielo, el sol o
// la luna, las nubes, la lluvia, los rayos y el viento cambian; el campo, el
// molino y las vacas quedan. Se entiende el día sin leer un número.

const CIELO: Record<Cielo, string> = {
  sol: 'linear-gradient(180deg, #c97e5b 0%, #e5b98b 55%, #f7e3b6 100%)',
  nubes: 'linear-gradient(180deg, #b98d74 0%, #dcc0a4 55%, #efe0c8 100%)',
  nublado: 'linear-gradient(180deg, #8c8c90 0%, #b6b2ab 55%, #d6cfc2 100%)',
  lluvia: 'linear-gradient(180deg, #56636f 0%, #84909a 55%, #aeb2ad 100%)',
  tormenta: 'linear-gradient(180deg, #262b37 0%, #444c5a 55%, #6c7279 100%)',
  noche: 'linear-gradient(180deg, #161d36 0%, #2f3660 55%, #5e5677 100%)',
}
/** Un velo sobre el campo para que tome la luz del día (nublado, lluvia, noche). */
const VELO: Record<Cielo, string | null> = {
  sol: null,
  nubes: null,
  nublado: 'rgb(110 112 118 / 0.22)',
  lluvia: 'rgb(60 78 96 / 0.34)',
  tormenta: 'rgb(30 34 46 / 0.5)',
  noche: 'rgb(18 24 52 / 0.55)',
}
const NUBES: Record<Cielo, { cantidad: number; color: string; opacidad: number }> = {
  sol: { cantidad: 0, color: '#fcf2da', opacidad: 0.55 },
  nubes: { cantidad: 3, color: '#fbf3e4', opacidad: 0.85 },
  nublado: { cantidad: 5, color: '#e9e6e1', opacidad: 0.9 },
  lluvia: { cantidad: 5, color: '#9aa3ab', opacidad: 0.95 },
  tormenta: { cantidad: 5, color: '#4f5664', opacidad: 0.95 },
  noche: { cantidad: 2, color: '#59607f', opacidad: 0.6 },
}

function Nube({ x, y, escala, color, opacidad, segundos }: { x: number; y: number; escala: number; color: string; opacidad: number; segundos: number }) {
  const reducir = useReducedMotion()
  return (
    <motion.svg
      viewBox="0 0 90 46"
      className="absolute"
      style={{ left: `${x}%`, top: y, width: 90 * escala, opacity: opacidad }}
      animate={reducir ? undefined : { x: [0, 40, 0] }}
      transition={{ duration: segundos, repeat: Infinity, ease: 'easeInOut' }}
      aria-hidden
    >
      <g fill={color}>
        <ellipse cx="45" cy="34" rx="44" ry="12" />
        <circle cx="30" cy="26" r="16" />
        <circle cx="52" cy="20" r="20" />
        <circle cx="70" cy="30" r="12" />
      </g>
    </motion.svg>
  )
}

export function EscenaClima({ cielo, ventoso, children }: { cielo: Cielo; ventoso: boolean; children?: React.ReactNode }) {
  const reducir = useReducedMotion()
  const n = NUBES[cielo]
  const lluvia = cielo === 'lluvia' || cielo === 'tormenta'
  const posiciones = [
    { x: 4, y: 18, escala: 1.1 },
    { x: 38, y: 8, escala: 1.4 },
    { x: 66, y: 26, escala: 1.0 },
    { x: 18, y: 46, escala: 0.9 },
    { x: 52, y: 52, escala: 1.2 },
  ]
  return (
    <div className="relative h-[250px] overflow-hidden" style={{ background: CIELO[cielo] }} data-cielo={cielo}>
      {/* El sol o la luna */}
      {(cielo === 'sol' || cielo === 'nubes') && (
        <span className="absolute top-[24px] right-[14px] size-[72px] rounded-full bg-[#fcf2da] shadow-[0_0_60px_20px_rgb(252_242_218/0.45)]" />
      )}
      {cielo === 'noche' && (
        <>
          <span className="absolute top-[22px] right-[22px] size-[48px] rounded-full bg-[#f3ecd8] shadow-[0_0_40px_10px_rgb(243_236_216/0.25)]" />
          {[...Array(14)].map((_, i) => (
            <span
              key={i}
              className="absolute size-[2px] rounded-full bg-white/80"
              style={{ left: `${(i * 37) % 100}%`, top: 10 + ((i * 23) % 90) }}
            />
          ))}
        </>
      )}

      {/* Las nubes: más rápidas si hay viento */}
      {posiciones.slice(0, n.cantidad).map((p, i) => (
        <Nube key={i} {...p} color={n.color} opacidad={n.opacidad} segundos={(ventoso ? 7 : 26) + i * 3} />
      ))}

      {/* El campo, el molino y las vacas */}
      <div className="absolute right-[-70px] bottom-[-48px] h-[320px] w-[569px]">
        <img src={campoMolino} alt="" className="absolute inset-0 size-full" />
        <motion.img
          src={rueda}
          alt=""
          className="absolute top-[42.7px] left-[302.2px] size-[106.7px]"
          animate={reducir ? undefined : { rotate: 360 }}
          transition={{ duration: ventoso ? 2.5 : 18, repeat: Infinity, ease: 'linear' }}
        />
      </div>
      
      {VELO[cielo] && <div className="absolute inset-0" style={{ background: VELO[cielo]! }} />}

      {/* La lluvia */}
      {lluvia && !reducir && (
        <div className="absolute inset-0" style={{ transform: `skewX(${ventoso ? -16 : -6}deg)` }} aria-hidden>
          {[...Array(cielo === 'tormenta' ? 46 : 34)].map((_, i) => (
            <span
              key={i}
              className="escena-gota absolute top-0 h-[14px] w-[1.5px] rounded-full bg-[#dfe9f2]/75"
              style={{ left: `${(i * 29) % 104}%`, animationDelay: `${((i * 13) % 20) / 20}s`, animationDuration: `${0.7 + ((i * 7) % 5) / 10}s` }}
            />
          ))}
        </div>
      )}
      {/* El rayo */}
      {cielo === 'tormenta' && !reducir && <div className="escena-rayo absolute inset-0 bg-white" aria-hidden />}
      {/* El viento */}
      {ventoso && !reducir && (
        <div className="absolute inset-0" aria-hidden>
          {[30, 70, 110].map((top, i) => (
            <span key={top} className={cn('escena-viento absolute h-[2px] w-[90px] rounded-full bg-white/50')} style={{ top, animationDelay: `${i * 0.7}s` }} />
          ))}
        </div>
      )}

      {/* Lo que dice: arriba a la izquierda, con una sombra que lo deja leer */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-black/5 to-transparent" />
      <div className="relative h-full p-6 text-superficie [text-shadow:0_1px_6px_rgba(0,0,0,0.35)]">{children}</div>
    </div>
  )
}
