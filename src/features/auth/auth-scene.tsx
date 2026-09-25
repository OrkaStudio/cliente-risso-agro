import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { MARCA_TAGLINE, useVarianteMarca } from '@/lib/marca'
import { LogoTropero, IsotipoTropero } from '@/components/marca/tropero'
import { MARCA_COLOR } from '@/components/marca/geometria'
import { FondoPotreros, FondoSendas } from '@/components/marca/fondos'

/**
 * Escena de marca del panel de auth. Reemplaza al amanecer con sol y molino
 * (TASK-059) por los fondos propios de Tropero, según la variante:
 * - monte y trigo: el campo visto desde arriba (potreros) y una recorrida
 *   que los marca de a uno, en trigo. Es la lámina de cierre del manual.
 * - terracota: las sendas que cruzan el campo y la tropa arreada por la
 *   senda, en hueso.
 * Decorativa (`aria-hidden`) y quieta con "reducir movimiento".
 */
/**
 * `panel`: columna izquierda de escritorio. `fondo`: en el teléfono la escena
 * es TODA la pantalla y la tarjeta del formulario flota encima.
 */
export function AuthScene({
  variante = 'panel',
  solAnimado = true,
  mensaje,
}: {
  variante?: 'panel' | 'fondo'
  /** Anima el fondo. En escritorio siempre; en el teléfono sólo donde se pida. */
  solAnimado?: boolean
  /** Reemplaza la frase de las tres patas (el onboarding pone acá su mapa). */
  mensaje?: ReactNode
}) {
  const compacta = variante === 'fondo'
  const animado = !compacta || solAnimado
  const marca = useVarianteMarca()
  return (
    <div
      aria-hidden
      className={
        compacta
          ? 'relative flex h-full flex-col overflow-hidden bg-marca px-5 pt-4 text-sidebar-foreground'
          : 'relative flex h-full flex-col overflow-hidden bg-marca p-10 text-sidebar-foreground'
      }
    >
      {marca === 'monte' ? (
        <>
          <FondoPotreros
            animado={animado}
            className={
              compacta
                ? 'absolute inset-x-0 bottom-0 h-[46%] w-full opacity-60'
                : 'absolute inset-x-0 bottom-0 h-[72%] w-full opacity-55'
            }
            tonos={['#0b5837', '#0f6440', '#12704a', '#0d5a39', '#178a55']}
            linea={MARCA_COLOR.hueso}
            realce={MARCA_COLOR.trigo}
          />
          {/* Velo: el monte limpio arriba, donde va el texto; el campo abajo. */}
          <div
            className="absolute inset-0"
            style={{
              background: compacta
                ? 'linear-gradient(to bottom, #0b5837 0%, #0b5837 50%, rgba(11,88,55,0.35) 72%, rgba(11,88,55,0) 100%)'
                : 'linear-gradient(to bottom, #0b5837 0%, #0b5837 30%, rgba(11,88,55,0.55) 48%, rgba(11,88,55,0) 70%)',
            }}
          />
        </>
      ) : (
        <>
          {/* Terracota: la tierra abajo, la terracota profunda arriba (texto). */}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, #7a3a1c 0%, #8e4422 45%, #b85c2e 100%)' }}
          />
          <FondoSendas
            animado={animado}
            className={
              compacta
                ? 'absolute inset-x-0 bottom-0 h-[48%] w-full'
                : 'absolute inset-x-0 bottom-0 h-[78%] w-full'
            }
            linea="#e39a6c"
            realce={MARCA_COLOR.hueso}
          />
          <div
            className="absolute inset-0"
            style={{
              background: compacta
                ? 'linear-gradient(to bottom, #7a3a1c 0%, #7a3a1c 48%, rgba(122,58,28,0) 70%)'
                : 'linear-gradient(to bottom, #7a3a1c 0%, rgba(122,58,28,0.9) 30%, rgba(122,58,28,0) 58%)',
            }}
          />
        </>
      )}

      {/* Sello del otro color, abajo a la derecha: en monte, la terracota
          (el tercer color); en terracota, el monte. */}
      {!compacta && !mensaje && (
        <motion.div
          className="absolute bottom-8 right-8 flex size-[68px] items-center justify-center rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
          style={{ background: marca === 'monte' ? MARCA_COLOR.terracota : MARCA_COLOR.monte }}
          initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: -6 }}
          transition={{ duration: 0.8, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <IsotipoTropero
            className="h-[30px] w-auto"
            color={marca === 'monte' ? MARCA_COLOR.hueso : MARCA_COLOR.trigo}
          />
        </motion.div>
      )}

      {/* Marca + mensaje. En 'fondo' (teléfono) el mensaje NO va acá: lo
          dibuja AuthLayout en el flujo, arriba de la tarjeta, para que la
          tarjeta nunca lo tape (ver MensajeEscenaMovil). */}
      {!compacta && (
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <LogoTropero
            className="h-[34px] w-auto"
            iso="var(--marca-iso)"
            palabra="var(--marca-palabra)"
          />
          <p className="mt-2 text-sm text-sidebar-foreground/70">{MARCA_TAGLINE}</p>
        </motion.div>
      )}

      {!compacta && (
        <motion.div
          className={
            mensaje
              ? 'relative mt-5 flex min-h-0 flex-1 flex-col items-center overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
              : 'relative mt-14 max-w-md'
          }
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          {mensaje ?? (
            <>
              <p className="font-heading text-[34px] font-bold leading-[1.1] tracking-[-0.025em]">
                Tu <span className="text-trigo">campo</span>, tu{' '}
                <span className="text-trigo">hacienda</span> y tus{' '}
                <span className="text-trigo">números</span>, en una sola app.
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-sidebar-foreground/80">
                Recorridas sin señal, caravanas electrónicas, plata al día. Hecho
                para el productor, no para el contador.
              </p>
            </>
          )}
        </motion.div>
      )}
    </div>
  )
}

/**
 * Marca + mensaje para el teléfono, en el flujo de la página (no dentro de
 * la escena): la tarjeta va debajo, nunca encima, tenga el mensaje el alto
 * que tenga (la frase de auth o el mapa del viaje del onboarding).
 */
export function MensajeEscenaMovil({ mensaje }: { mensaje?: ReactNode }) {
  return (
    <motion.div
      className="relative px-5 pt-4 text-sidebar-foreground"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <LogoTropero
        className="h-[22px] w-auto"
        iso="var(--marca-iso)"
        palabra="var(--marca-palabra)"
      />
      {mensaje ?? (
        <p className="mt-3 max-w-[310px] font-heading text-[23px] font-bold leading-tight tracking-[-0.02em]">
          Tu <span className="text-trigo">campo</span>, tu{' '}
          <span className="text-trigo">hacienda</span> y tus{' '}
          <span className="text-trigo">números</span>, en una sola app.
        </p>
      )}
    </motion.div>
  )
}
