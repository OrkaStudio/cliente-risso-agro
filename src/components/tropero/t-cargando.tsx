// La T de Troppero con volumen, girando y flotando sobre su propia sombra: para la pantalla
// de carga. Idea tomada de «loader-3» de 21st.dev (un cubo 3D sobre una base), con la T en
// lugar del cubo y su sombra en lugar de la base. Sin halo: el brillo de trigo se veía sucio.
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

// El isotipo de logo.tsx (ISOTIPO) y su caja.
const ISOTIPO = "M0 5.0625H117.456V33.2519H81.0444C61.582 33.2519 45.8077 49.0262 45.8077 68.4886V117.82H14.0947V33.2519H0V5.0625Z"
const CAJA = "0 5.06 117.46 112.76"
const PROPORCION = 117.46 / 112.76

/** Capas apiladas de 1 px: hacen el grosor de la T. Con menos, de perfil se ven los huecos. */
const CAPAS = 14

export function TCargando({ alto = 64, className }: { alto?: number; className?: string }) {
  const ancho = alto * PROPORCION
  const vuelta = { duration: 4.2, repeat: Infinity, ease: "linear" } as const
  // Un ciclo de flotar: arriba la T, la sombra se achica y se aclara; abajo, al revés.
  const flotar = { duration: 2.4, repeat: Infinity, ease: "easeInOut" } as const
  return (
    <div role="status" aria-label="Cargando" className={cn("flex flex-col items-center", className)}>
      <div style={{ perspective: 700 }}>
        <motion.div animate={{ y: [0, -12, 0] }} transition={flotar} style={{ transformStyle: "preserve-3d" }}>
          <motion.div
            className="relative"
            style={{ width: ancho, height: alto, transformStyle: "preserve-3d" }}
            initial={{ rotateX: -12, rotateY: 0 }}
            animate={{ rotateX: -12, rotateY: 360 }}
            transition={vuelta}
          >
            {Array.from({ length: CAPAS }, (_, i) => {
              const cara = i === 0 || i === CAPAS - 1
              return (
                <svg
                  key={i}
                  aria-hidden
                  viewBox={CAJA}
                  className="absolute inset-0 size-full overflow-visible"
                  style={{ transform: `translateZ(${i - (CAPAS - 1) / 2}px)` }}
                >
                  <path
                    d={ISOTIPO}
                    fill={cara ? "var(--principal)" : "var(--color-terracota-700)"}
                    stroke={cara ? "var(--acento)" : "none"}
                    strokeWidth={cara ? 3 : 0}
                    strokeLinejoin="round"
                  />
                </svg>
              )
            })}
          </motion.div>
        </motion.div>
      </div>
      {/* La sombra es la misma T acostada en el piso. Al girar se angosta (de perfil casi no
          hay sombra) y se da vuelta (de espaldas); cuando la T sube, se achica y se aclara. */}
      <div aria-hidden className="mt-3 grid place-items-center" style={{ width: ancho * 1.6, height: alto * 0.55, perspective: 400 }}>
        <motion.div animate={{ scale: [1, 0.82, 1], opacity: [0.24, 0.14, 0.24] }} transition={flotar}>
          <div style={{ transform: "rotateX(72deg)" }}>
            <motion.svg
              viewBox={CAJA}
              width={ancho}
              height={alto}
              className="block overflow-visible blur-[2px]"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: [1, 0, -1, 0, 1] }}
              // El ancho de la sombra sigue al coseno del giro: lento de frente, rápido de perfil.
              transition={{ ...vuelta, times: [0, 0.25, 0.5, 0.75, 1], ease: ["easeIn", "easeOut", "easeIn", "easeOut"] }}
            >
              <path d={ISOTIPO} fill="var(--texto)" />
            </motion.svg>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
