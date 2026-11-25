// Cómo agregar Troppero al inicio del iPhone (Lau, 19/11: «explicarlo mejor, con imágenes o
// un mini video»). Safari no deja instalar con un botón, así que se muestra el camino en un
// teléfono dibujado que se repite solo: un toque marca cada botón y abajo se lee el paso.
// iOS 26 cambió la barra de Safari: Compartir quedó adentro de los tres puntos. Antes
// (iOS 18 y anteriores) estaba en la barra de abajo. Se elige el camino por la versión.
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import { Logo } from '@/components/tropero/logo'
import { cn } from '@/lib/utils'

type Escena = 'puntos' | 'menu' | 'compartir-viejo' | 'hoja' | 'agregar' | 'inicio'

const PASOS_26: { escena: Escena; texto: React.ReactNode }[] = [
  { escena: 'puntos', texto: <>Tocá los <b>tres puntos</b>, abajo a la derecha</> },
  { escena: 'menu', texto: <>Tocá <b>Compartir</b></> },
  { escena: 'hoja', texto: <>Bajá y tocá <b>Agregar a inicio</b></> },
  { escena: 'agregar', texto: <>Tocá <b>Agregar</b>, arriba a la derecha</> },
  { escena: 'inicio', texto: <>Listo: Troppero queda en tu pantalla</> },
]
const PASOS_VIEJO: { escena: Escena; texto: React.ReactNode }[] = [
  { escena: 'compartir-viejo', texto: <>Tocá <b>Compartir</b>, abajo en el medio</> },
  { escena: 'hoja', texto: <>Bajá y tocá <b>Agregar a inicio</b></> },
  { escena: 'agregar', texto: <>Tocá <b>Agregar</b>, arriba a la derecha</> },
  { escena: 'inicio', texto: <>Listo: Troppero queda en tu pantalla</> },
]

/** Safari 26 trae «Version/26» en el userAgent; sin dato, se asume el iPhone nuevo. */
function esIos26(): boolean {
  const m = /Version\/(\d+)/.exec(navigator.userAgent)
  return !m || Number(m[1]) >= 26
}

const AZUL = '#0a7aff'
const MS_PASO = 2600

/** El dedo: un círculo que se aprieta sobre el botón a tocar. */
function Toque({ className }: { className: string }) {
  return (
    <motion.span
      aria-hidden
      className={cn('pointer-events-none absolute z-20 size-7 rounded-full border-2 border-white bg-[rgb(10_122_255/.35)] shadow-[0_2px_8px_rgb(0_0_0/.25)]', className)}
      initial={{ scale: 1.6, opacity: 0 }}
      animate={{ scale: [1.6, 1, 0.82, 1], opacity: [0, 1, 1, 1] }}
      transition={{ duration: 0.9, delay: 0.7, times: [0, 0.45, 0.7, 1] }}
    />
  )
}

function IconoCompartir({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  )
}

function IconoAgregar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  )
}

/** El ícono de Troppero tal como queda en la pantalla de inicio. */
function IconoApp({ tam }: { tam: number }) {
  return (
    <span className="grid place-items-center rounded-[22%] shadow-[inset_0_1px_0_rgb(255_255_255/.25)]" style={{ width: tam, height: tam, background: 'linear-gradient(180deg, #c46a3a 0%, #a9532a 100%)' }}>
      <Logo soloIsotipo tono="hueso" alto={tam * 0.46} />
    </span>
  )
}

/** La página de Troppero detrás, en chiquito. */
function Pagina() {
  return (
    <div className="absolute inset-0 flex flex-col gap-2 bg-[#fff8ec] px-2.5 pt-7">
      <div className="flex h-6 items-center justify-between rounded-full bg-white/90 px-2.5 shadow-[0_0_0_1px_rgb(58_26_13/.08)]">
        <Logo alto={9} />
        <span className="size-3.5 rounded-full bg-[#f1ebdf]" />
      </div>
      <div className="h-16 rounded-[10px] bg-[#de8c61]" />
      <div className="grid grid-cols-2 gap-1.5">
        <div className="h-11 rounded-[9px] bg-white shadow-[0_0_0_1px_#e6ddcc]" />
        <div className="h-11 rounded-[9px] bg-white shadow-[0_0_0_1px_#e6ddcc]" />
      </div>
      <div className="h-14 rounded-[9px] bg-white shadow-[0_0_0_1px_#e6ddcc]" />
    </div>
  )
}

/** La barra de Safari de iOS 26: atrás, la dirección y los tres puntos, flotando. */
function BarraSafari26({ toca }: { toca: boolean }) {
  return (
    <div className="absolute inset-x-2 bottom-3 flex items-center gap-1.5">
      <span className="grid size-7 place-items-center rounded-full bg-white/85 text-[13px] text-[#1c1c1e] shadow-[0_2px_8px_rgb(0_0_0/.12)] backdrop-blur">‹</span>
      <span className="flex h-7 flex-1 items-center justify-center rounded-full bg-white/85 text-[8.5px] font-medium text-[#1c1c1e] shadow-[0_2px_8px_rgb(0_0_0/.12)] backdrop-blur">app.troppero.com</span>
      <span className="relative grid size-7 place-items-center rounded-full bg-white/85 text-[11px] font-bold tracking-[1px] text-[#1c1c1e] shadow-[0_2px_8px_rgb(0_0_0/.12)] backdrop-blur">
        •••
        {toca && <Toque className="-top-0 -left-0" />}
      </span>
    </div>
  )
}

/** La barra de Safari de antes: la dirección arriba de la fila de botones, con Compartir al medio. */
function BarraSafariVieja({ toca }: { toca: boolean }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-[#f6f6f6]/95 px-2 pt-1.5 pb-3 backdrop-blur">
      <span className="flex h-6 items-center justify-center rounded-[8px] bg-white text-[8.5px] font-medium text-[#1c1c1e] shadow-[0_0_0_1px_rgb(0_0_0/.06)]">app.troppero.com</span>
      <div className="flex items-center justify-around px-1 text-[#0a7aff]">
        <span className="text-[14px] leading-none">‹</span>
        <span className="text-[14px] leading-none opacity-40">›</span>
        <span className="relative grid size-6 place-items-center">
          <IconoCompartir className="size-[15px]" />
          {toca && <Toque className="-top-0.5 -left-0.5" />}
        </span>
        <span className="size-3.5 rounded-[3px] border-[1.5px] border-current" />
        <span className="size-3.5 rounded-[3px] border-[1.5px] border-current" />
      </div>
    </div>
  )
}

/** El menú de los tres puntos (iOS 26), con Compartir arriba. */
function MenuPuntos() {
  const filas = ['Compartir', 'Agregar a favoritos', 'Buscar en la página', 'Vista de lectura']
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      style={{ transformOrigin: '90% 100%' }}
      className="absolute right-2 bottom-12 w-[150px] overflow-hidden rounded-[14px] bg-white/95 shadow-[0_10px_30px_rgb(0_0_0/.22)] backdrop-blur"
    >
      {filas.map((f, i) => (
        <div key={f} className={cn('relative flex items-center justify-between px-3 py-[7px] text-[10px] text-[#1c1c1e]', i > 0 && 'border-t border-black/5', i === 0 && 'bg-[#eaf3ff] font-semibold')}>
          {f}
          {i === 0 && <IconoCompartir className="size-3" />}
          {i === 0 && <Toque className="top-0 right-5" />}
        </div>
      ))}
    </motion.div>
  )
}

/** La hoja de Compartir: se baja hasta «Agregar a inicio». */
function HojaCompartir() {
  const filas = ['Copiar', 'Agregar a favoritos', 'Buscar en la página', 'Imprimir', 'Agregar a inicio']
  return (
    <>
      <motion.div aria-hidden className="absolute inset-0 bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        className="absolute inset-x-0 bottom-0 h-[78%] overflow-hidden rounded-t-[16px] bg-[#f2f2f7]"
      >
        <div className="mx-auto mt-1.5 h-1 w-8 rounded-full bg-black/20" />
        <div className="flex items-center gap-2 px-3 pt-2 pb-2">
          <IconoApp tam={22} />
          <span className="min-w-0">
            <span className="block text-[9.5px] font-semibold text-[#1c1c1e]">Troppero</span>
            <span className="block text-[8px] text-[#8e8e93]">app.troppero.com</span>
          </span>
        </div>
        {/* Baja como cuando uno arrastra con el dedo; lo de arriba (el nombre) queda quieto. */}
        <div className="h-full overflow-hidden border-t border-black/5 pt-2">
        <motion.div className="px-2.5" initial={{ y: 0 }} animate={{ y: -34 }} transition={{ delay: 0.35, duration: 0.7, ease: [0.4, 0, 0.2, 1] }}>
          <div className="mb-2 flex justify-between px-1">
            {['#34c759', '#0a7aff', '#ffcc00', '#ff3b30'].map((c) => (
              <span key={c} className="size-7 rounded-[8px]" style={{ background: c, opacity: 0.85 }} />
            ))}
          </div>
          <div className="overflow-hidden rounded-[10px] bg-white">
            {filas.map((f, i) => {
              const esta = i === filas.length - 1
              return (
                <div key={f} className={cn('relative flex items-center justify-between px-3 py-[7px] text-[10px] text-[#1c1c1e]', i > 0 && 'border-t border-black/5', esta && 'bg-[#eaf3ff] font-semibold')}>
                  {f}
                  {esta ? <IconoAgregar className="size-3.5" /> : <span className="size-3 rounded-[3px] bg-black/10" />}
                  {esta && <Toque className="top-0 right-6" />}
                </div>
              )
            })}
          </div>
        </motion.div>
        </div>
      </motion.div>
    </>
  )
}

/** La ventanita «Agregar a inicio»: el ícono, el nombre, «Abrir como app web» prendido y Agregar. */
function VentanaAgregar() {
  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      className="absolute inset-x-0 bottom-0 top-6 rounded-t-[16px] bg-[#f2f2f7] px-2.5"
    >
      <div className="flex items-center justify-between gap-1 py-2.5 text-[9.5px]">
        <span style={{ color: AZUL }}>Cancelar</span>
        <span className="font-semibold whitespace-nowrap text-[#1c1c1e]">Agregar a inicio</span>
        <span className="relative font-bold" style={{ color: AZUL }}>
          Agregar
          <Toque className="-top-2 -left-1" />
        </span>
      </div>
      <div className="flex items-center gap-2.5 rounded-[10px] bg-white p-2.5">
        <IconoApp tam={34} />
        <span className="min-w-0 flex-1 border-b border-black/10 pb-1 text-[10.5px] text-[#1c1c1e]">Troppero</span>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-[10px] bg-white px-2.5 py-2 text-[9.5px] whitespace-nowrap text-[#1c1c1e]">
        Abrir como app web
        <span className="flex h-3.5 w-6 items-center justify-end rounded-full bg-[#34c759] px-[1.5px]">
          <span className="size-[11px] rounded-full bg-white" />
        </span>
      </div>
    </motion.div>
  )
}

/** La pantalla de inicio con Troppero recién llegado. */
function PantallaInicio() {
  const colores = ['#8e8e93', '#34c759', '#ff9500', '#0a7aff', '#ff2d55', '#5ac8fa', '#af52de', '#ffcc00', '#30b0c7', '#a2845e', '#ff3b30']
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-[linear-gradient(160deg,#f7c59f_0%,#e98a5a_55%,#8a4a2c_100%)] px-3 pt-8">
      <div className="grid grid-cols-4 gap-x-2.5 gap-y-3">
        {colores.map((c) => (
          <span key={c} className="flex flex-col items-center gap-1">
            <span className="size-9 rounded-[22%] opacity-90" style={{ background: c }} />
            <span className="h-1 w-6 rounded-full bg-white/50" />
          </span>
        ))}
        <motion.span className="flex flex-col items-center gap-1" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.35, type: 'spring', stiffness: 320, damping: 16 }}>
          <span className="rounded-[22%] ring-2 ring-white/90">
            <IconoApp tam={36} />
          </span>
          <span className="text-[7.5px] font-semibold text-white [text-shadow:0_1px_2px_rgb(0_0_0/.4)]">Troppero</span>
        </motion.span>
      </div>
    </motion.div>
  )
}

function Pantalla({ escena, ios26 }: { escena: Escena; ios26: boolean }) {
  if (escena === 'inicio') return <PantallaInicio />
  return (
    <>
      <Pagina />
      {ios26 ? <BarraSafari26 toca={escena === 'puntos'} /> : <BarraSafariVieja toca={escena === 'compartir-viejo'} />}
      {escena === 'menu' && <MenuPuntos />}
      {escena === 'hoja' && <HojaCompartir />}
      {escena === 'agregar' && <VentanaAgregar />}
    </>
  )
}

/** El teléfono que muestra el camino, con los pasos debajo. Se repite solo; tocar un paso lo muestra. */
export function AgregarIphone() {
  const [ios26] = useState(esIos26)
  const pasos = ios26 ? PASOS_26 : PASOS_VIEJO
  const [i, setI] = useState(0)
  const [pausa, setPausa] = useState(false)
  const quieto = !!useReducedMotion()
  useEffect(() => {
    if (pausa || quieto) return
    const t = setTimeout(() => setI((n) => (n + 1) % pasos.length), i === pasos.length - 1 ? MS_PASO + 900 : MS_PASO)
    return () => clearTimeout(t)
  }, [i, pausa, quieto, pasos.length])
  const paso = pasos[i]

  return (
    <div className="flex flex-col items-center gap-4">
      {/* El teléfono. */}
      <div aria-hidden className="relative h-[330px] w-[180px] shrink-0 overflow-hidden rounded-[30px] border-[5px] border-[#1c1c1e] bg-[#fff8ec] shadow-[0_18px_36px_-18px_rgb(58_26_13/.6)]">
        <span className="absolute top-1.5 left-1/2 z-30 h-3.5 w-12 -translate-x-1/2 rounded-full bg-[#1c1c1e]" />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={paso.escena} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <Pantalla escena={paso.escena} ios26={ios26} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Los pasos: el que se está mostrando, marcado. */}
      <ol className="flex w-full flex-col gap-1">
        {pasos.map((p, n) => {
          const esta = n === i
          return (
            <li key={p.escena}>
              <button
                type="button"
                onClick={() => {
                  setI(n)
                  setPausa(true)
                }}
                aria-current={esta ? 'step' : undefined}
                className={cn('flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left transition-colors', esta ? 'bg-superficie shadow-[inset_0_0_0_1px_var(--borde)]' : '')}
              >
                <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold transition-colors', esta ? 'bg-principal text-principal-texto' : 'bg-trigo-100 text-trigo-800')}>{n + 1}</span>
                <span className={cn('min-w-0 flex-1 text-[15px] leading-snug transition-colors', esta ? 'text-texto' : 'text-texto-suave')}>{p.texto}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {pausa && (
        <button type="button" onClick={() => setPausa(false)} className="-mt-2 text-[13.5px] font-semibold text-principal">
          Ver de nuevo solo
        </button>
      )}
    </div>
  )
}
