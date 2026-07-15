import { motion } from 'framer-motion'
import { MARCA, MARCA_TAGLINE } from '@/lib/marca'

/** Tinta de las siluetas (molino, alambrado): casi negro verdoso. */
const TINTA = '#071609'

/**
 * Escena ambiental del panel de auth: amanecer en la pampa.
 *
 * Sol con ondas que se expanden (la versión agro del "ripple"), lomadas en
 * capas y un molino multipala girando despacio. Todo SVG + framer-motion,
 * paleta de la app (verde profundo del sidebar, sol #d98a18). Decorativa:
 * `aria-hidden`, sin interacción.
 */
export function AuthScene() {
  return (
    <div
      aria-hidden
      className="relative flex h-full flex-col overflow-hidden bg-sidebar p-10 text-sidebar-foreground"
    >
      {/* Cielo: resplandor del amanecer detrás del horizonte */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(135% 95% at 66% 76%, rgba(217,138,24,0.32) 0%, rgba(217,138,24,0.12) 34%, transparent 68%), linear-gradient(to bottom, #10241a 0%, #182c1e 55%, #1e3826 100%)',
        }}
      />

      {/* Grilla cartográfica sutil, misma atmósfera técnica que el body */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(247,245,236,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(247,245,236,0.045) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Sol + ondas expansivas sobre el horizonte */}
      <div className="absolute left-[68%] top-[62%] -translate-x-1/2 -translate-y-1/2">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 rounded-full border border-accent/40"
            style={{ width: 90, height: 90, x: '-50%', y: '-50%' }}
            initial={false}
            // La opacidad entra y sale en fade (0 → 0.5 → 0): si la onda
            // reaparece de golpe al reiniciar el loop, titila como un error.
            animate={{ scale: [1, 3.4], opacity: [0, 0.5, 0] }}
            transition={{
              duration: 7,
              delay: i * 1.75,
              repeat: Infinity,
              ease: 'easeOut',
              opacity: {
                duration: 7,
                delay: i * 1.75,
                repeat: Infinity,
                times: [0, 0.22, 1],
                ease: 'linear',
              },
            }}
          />
        ))}
        <motion.span
          className="absolute left-1/2 top-1/2 block rounded-full bg-accent"
          style={{
            width: 90,
            height: 90,
            x: '-50%',
            y: '-50%',
            boxShadow: '0 0 80px 24px rgba(217,138,24,0.35)',
          }}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
        />
      </div>

      {/* Horizonte: lomadas + molino (aspas girando) */}
      <svg
        className="absolute inset-x-0 bottom-0 h-[42%] w-full"
        viewBox="0 0 800 340"
        preserveAspectRatio="xMidYMax slice"
      >
        {/* Lomadas en capas, del fondo al frente — más claras que la tinta
            de las siluetas para que molino y alambrado se lean nítidos */}
        <path
          d="M0 190 Q 160 150 340 178 T 800 168 V 340 H 0 Z"
          fill="#1c3d27"
        />
        <path
          d="M0 235 Q 220 195 430 224 T 800 216 V 340 H 0 Z"
          fill="#163420"
        />
        <path
          d="M0 285 Q 260 250 520 274 T 800 266 V 340 H 0 Z"
          fill="#102b19"
        />

        {/* Molino multipala. Origen del grupo = eje de la rueda, montado
            sobre la cabeza de la torre. La rueda gira con animateTransform
            (rotación SVG nativa alrededor de (0,0): framer-motion calcula
            mal el transform-origin dentro de un SVG y la rueda se separaba
            de la torre). */}
        <g transform="translate(248 94) scale(1.3)" stroke={TINTA} fill="none">
          {/* Veleta: barral largo + aleta fina tipo timón */}
          <line x1="0" y1="0" x2="50" y2="4" strokeWidth="2.6" />
          <path
            d="M46 -7 L74 -2.5 Q 76.5 -2 76.5 0.5 L76.5 4.5 Q 76.5 7 74 7.5 L47 10 Z"
            fill={TINTA}
            stroke="none"
          />
          {/* Torre reticulada: patas que rematan en el eje */}
          <path
            d="M-15 128 L-2.5 7 M15 128 L2.5 7"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M-12.4 100 H12.4 M-9.6 72 H9.6 M-6.8 44 H6.8"
            strokeWidth="2.2"
          />
          <path
            d="M-12.4 100 L9.6 72 M12.4 100 L-9.6 72 M-9.6 72 L6.8 44 M9.6 72 L-6.8 44"
            strokeWidth="1.6"
          />
          {/* Rueda: 12 aspas en cuña (se leen como aspas, no como rayos) */}
          <g>
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 0 0"
              to="360 0 0"
              dur="30s"
              repeatCount="indefinite"
            />
            <circle r="26.5" strokeWidth="2.4" />
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * 30 * Math.PI) / 180
              const w1 = (5 * Math.PI) / 180 // media-anchura en el cubo
              const w2 = (10 * Math.PI) / 180 // media-anchura en la llanta
              const r1 = 7
              const r2 = 24.5
              const p = [
                [r1 * Math.cos(a - w1), r1 * Math.sin(a - w1)],
                [r1 * Math.cos(a + w1), r1 * Math.sin(a + w1)],
                [r2 * Math.cos(a + w2), r2 * Math.sin(a + w2)],
                [r2 * Math.cos(a - w2), r2 * Math.sin(a - w2)],
              ]
                .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
                .join(' ')
              return <polygon key={i} points={p} fill={TINTA} stroke="none" />
            })}
          </g>
          <circle r="4" fill={TINTA} stroke="none" />
        </g>

        {/* Alambrado en el frente */}
        <g stroke={TINTA}>
          {[80, 240, 400, 560, 720].map((x) => (
            <line key={x} x1={x} y1={294} x2={x} y2={330} strokeWidth="3" />
          ))}
          <path d="M0 304 Q 400 296 800 302" fill="none" strokeWidth="1.8" />
          <path d="M0 319 Q 400 312 800 317" fill="none" strokeWidth="1.8" />
        </g>
      </svg>

      {/* Marca + mensaje */}
      <motion.div
        className="relative"
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        <p className="font-heading text-2xl font-bold tracking-tight">
          {MARCA}
        </p>
        <p className="mt-1 text-sm text-sidebar-foreground/70">
          {MARCA_TAGLINE}
        </p>
      </motion.div>

      {/* El mensaje va arriba, debajo de la marca: el horizonte (molino,
          alambrado) queda despejado abajo. Las tres patas del producto
          van en ámbar (el color del sol de la escena). */}
      <motion.div
        className="relative mt-14 max-w-md"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.35, ease: 'easeOut' }}
      >
        <p className="font-heading text-[32px] font-semibold leading-snug tracking-tight">
          Tu <span className="text-[#e9b45f]">campo</span>, tu{' '}
          <span className="text-[#e9b45f]">hacienda</span> y tus{' '}
          <span className="text-[#e9b45f]">números</span> — en una sola app.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-sidebar-foreground/70">
          Recorridas sin señal, caravanas electrónicas, plata al día. Hecho
          para el productor, no para el contador.
        </p>
      </motion.div>
    </div>
  )
}
