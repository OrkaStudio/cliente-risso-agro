import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useVelocity } from 'framer-motion'
import { Chispa, type Animo, type Variante } from './mascota'

/** Para probar las variantes en el tutorial real: /campos?chispa=terracota (ver /estilo/chispa). */
function variantePedida(): Variante | null {
  const v = new URLSearchParams(window.location.search).get('chispa')
  return v === 'terracota' || v === 'terracota-oscura' || v === 'sage' ? v : null
}

// Chispa, el asistente que acompaña en Campos mientras se arma el mapa. Vuela
// por la pantalla hasta lo que hay que hacer, se queda al lado y lo señala con
// un rayito, y lo dice en su globo. Mira el mouse, festeja lo que se termina,
// piensa mientras busca, se apaga a dormir si nadie hace nada y, si la tocás,
// salta y contesta. La página queda entera y usable: no hay velo.

/** A dónde va: un elemento con `data-acompana="<id>"`, o un punto del mapa en pantalla. */
export type Objetivo = { tipo: 'boton'; id: string } | { tipo: 'punto'; x: number; y: number } | { tipo: 'arriba' }

const TAM = 76
/** El viaje: lento al arrancar, sin rebote al llegar. */
const VUELO = { stiffness: 34, damping: 12.5, mass: 1.15, restDelta: 0.2 }
const GLOBO = { stiffness: 55, damping: 14, mass: 1 }
const ANCHO_GLOBO = 260
/** Lo que dice si lo tocan (de a uno, en orden). */
const MIMOS = ['¡Hola! Acá estoy.', 'Seguimos juntos, de a un paso.', 'Si te trabás, escribinos por WhatsApp.', '¡Vamos que sale!']

type Caja = { left: number; top: number; width: number; height: number }

export function Acompanante({
  raiz,
  objetivo,
  texto,
  medir,
  animo = 'normal',
  margenDerecho = 0,
}: {
  /** Lo que ocupa la tarjeta a la derecha (px): el globo y el vuelo libre no se meten ahí. */
  margenDerecho?: number
  raiz: React.RefObject<HTMLElement | null>
  objetivo: Objetivo | null
  texto: string | null
  medir: number
  /** `festeja` al terminar algo; `piensa` mientras busca. */
  animo?: Exclude<Animo, 'duerme'>
}) {
  const quieto = useReducedMotion()
  const [caja, setCaja] = useState<Caja | null>(null)
  const [base, setBase] = useState({ w: 0, h: 0 })
  const idBoton = objetivo?.tipo === 'boton' ? objetivo.id : null

  // Medir el botón (cambia al hacer scroll en la tarjeta o al animarse la tarjeta).
  useEffect(() => {
    const leer = () => {
      const r = raiz.current
      if (!r) return
      const rr = r.getBoundingClientRect()
      // Sólo si cambió: cada medida nueva re-dibuja, y se mide seguido.
      setBase((x) => (x.w === rr.width && x.h === rr.height ? x : { w: rr.width, h: rr.height }))
      const el = idBoton ? r.querySelector<HTMLElement>(`[data-acompana="${idBoton}"]`) : null
      const b = el?.getBoundingClientRect()
      const nueva = b ? { left: b.left - rr.left, top: b.top - rr.top, width: b.width, height: b.height } : null
      setCaja((x) => (x && nueva && x.left === nueva.left && x.top === nueva.top && x.width === nueva.width && x.height === nueva.height ? x : nueva))
    }
    leer()
    const iv = setInterval(leer, 400)
    window.addEventListener('resize', leer)
    const r = raiz.current
    r?.addEventListener('scroll', leer, true)
    return () => {
      clearInterval(iv)
      window.removeEventListener('resize', leer)
      r?.removeEventListener('scroll', leer, true)
    }
  }, [raiz, idBoton, medir])

  // ===== Dónde se para y hacia dónde mira =====
  // Junto a un botón: a su izquierda, mirándolo (la tarjeta va a la derecha); si no entra, arriba.
  // Junto a un punto del mapa: a su derecha, mirándolo. Sin lugar: arriba a la izquierda.
  let x = 16
  let y = 16
  let destino: { x: number; y: number } | null = null
  if (objetivo?.tipo === 'boton' && caja) {
    destino = { x: caja.left + Math.min(caja.width / 2, 40), y: caja.top + caja.height / 2 }
    if (caja.left - TAM - 4 > 8) {
      x = caja.left - TAM - 10
      y = caja.top + caja.height / 2 - TAM * 0.5
    } else {
      x = caja.left + 4
      y = caja.top - TAM + 6
    }
  } else if (objetivo?.tipo === 'punto') {
    destino = { x: objetivo.x, y: objetivo.y }
    x = objetivo.x + 22
    y = objetivo.y - TAM * 0.55
  }
  // Junto a un punto o arriba, se queda en el mapa: no se mete debajo de la tarjeta.
  const tope = objetivo?.tipo === 'boton' ? base.w : base.w - margenDerecho
  x = Math.max(4, Math.min(x, tope - TAM - 4))
  y = Math.max(4, Math.min(y, base.h - TAM - 4))
  const centro = { x: x + TAM / 2, y: y + TAM / 2 }
  const aLaDerecha = destino ? destino.x >= centro.x : true

  // ===== Viaja con un resorte suave =====
  // Antes de un viaje largo mira a dónde va y recién después arranca, como quien
  // piensa antes de moverse. En viaje se inclina hacia donde va y se estira según
  // la velocidad real (no por un rato fijo), así arranca y frena sin cortes.
  const visible = !!objetivo && !(objetivo.tipo === 'boton' && !caja) && base.w > 0
  const metaX = useMotionValue(x)
  const metaY = useMotionValue(y)
  const posX = useSpring(metaX, VUELO)
  const posY = useSpring(metaY, VUELO)
  const prepara = useMotionValue(0)
  const aparecio = useRef(false)
  useEffect(() => {
    if (!visible) return
    if (!aparecio.current || quieto) {
      aparecio.current = true
      posX.jump(x)
      posY.jump(quieto ? y : y + 14)
      metaX.jump(x)
      metaY.set(y)
      return
    }
    // Los ajustes chicos (scroll, el mapa que se mueve) lo siguen sin demora.
    if (Math.hypot(x - metaX.get(), y - metaY.get()) < 60) {
      metaX.set(x)
      metaY.set(y)
      return
    }
    // Mientras mira a dónde va, se agacha para tomar impulso.
    prepara.set(1)
    const t = setTimeout(() => {
      prepara.set(0)
      metaX.set(x)
      metaY.set(y)
    }, 280)
    return () => {
      clearTimeout(t)
      prepara.set(0)
    }
  }, [x, y, visible, quieto, metaX, metaY, posX, posY, prepara])
  const velX = useVelocity(posX)
  const velY = useVelocity(posY)
  // El globo lo sigue con un poco de demora, como colgado de él.
  const globoSigueX = useSpring(posX, GLOBO)
  const globoSigueY = useSpring(posY, GLOBO)

  // ===== Vida: parpadeo, mira el mouse, se duerme =====
  const [parpadea, setParpadea] = useState(false)
  useEffect(() => {
    if (quieto) return
    let t: ReturnType<typeof setTimeout>
    const siguiente = () => {
      t = setTimeout(() => {
        setParpadea(true)
        setTimeout(() => setParpadea(false), 140)
        siguiente()
      }, 2400 + Math.random() * 2600)
    }
    siguiente()
    return () => clearTimeout(t)
  }, [quieto])

  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null)
  const [duerme, setDuerme] = useState(false)
  const dormir = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    const despertar = () => {
      setDuerme(false)
      clearTimeout(dormir.current)
      dormir.current = setTimeout(() => setDuerme(true), 25_000)
    }
    const mover = (e: MouseEvent) => {
      const r = raiz.current?.getBoundingClientRect()
      if (r) setMouse({ x: e.clientX - r.left, y: e.clientY - r.top })
      despertar()
    }
    despertar()
    window.addEventListener('mousemove', mover)
    window.addEventListener('pointerdown', despertar)
    window.addEventListener('keydown', despertar)
    return () => {
      clearTimeout(dormir.current)
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('pointerdown', despertar)
      window.removeEventListener('keydown', despertar)
    }
  }, [raiz])
  // Cada paso nuevo lo despierta.
  const [textoVisto, setTextoVisto] = useState(texto)
  if (textoVisto !== texto) {
    setTextoVisto(texto)
    setDuerme(false)
  }

  // Mira lo que hay que hacer y, a medida que el mouse se acerca, pasa a mirarlo
  // a él: mezcla las dos miradas en vez de saltar de una a otra.
  const hacia = (p: { x: number; y: number } | null) => (p ? { x: (p.x - centro.x) / 120, y: (p.y - centro.y) / 120 } : { x: 0, y: 0 })
  const alObjetivo = hacia(destino)
  const alMouse = mouse ? hacia(mouse) : alObjetivo
  const cerca = mouse ? Math.hypot(mouse.x - centro.x, mouse.y - centro.y) : Infinity
  const peso = Math.max(0, Math.min(1, (440 - cerca) / 200))
  const mira = { x: alObjetivo.x + (alMouse.x - alObjetivo.x) * peso, y: alObjetivo.y + (alMouse.y - alObjetivo.y) * peso }

  // ===== Si lo tocan: guiña y contesta =====
  const [mimo, setMimo] = useState<string | null>(null)
  const nMimo = useRef(0)
  const tocar = () => {
    setMimo(MIMOS[nMimo.current++ % MIMOS.length]!)
    setTimeout(() => setMimo(null), 2600)
  }

  const dice = duerme ? null : (mimo ?? texto)
  // Mueve la boca mientras el globo se escribe, no todo el tiempo.
  const [hablando, setHablando] = useState(false)
  const [diceVisto, setDiceVisto] = useState<string | null>(null)
  if (diceVisto !== dice) {
    setDiceVisto(dice)
    setHablando(!!dice && !quieto)
  }
  useEffect(() => {
    if (!dice) return
    const t = setTimeout(() => setHablando(false), dice.length * 20 + 150)
    return () => clearTimeout(t)
  }, [dice])
  if (!objetivo || (objetivo.tipo === 'boton' && !caja) || base.w === 0) return null

  const animoChispa: Animo = duerme ? 'duerme' : mimo ? 'guina' : animo
  // La etiqueta va al costado, del lado contrario de lo que señala (no tapa el botón ni la tarjeta);
  // si no entra al costado, arriba.
  const alCostado = aLaDerecha ? x - ANCHO_GLOBO - 6 > 4 : x + TAM + ANCHO_GLOBO + 6 < base.w - margenDerecho
  const globoArriba = !alCostado
  const globoX = alCostado
    ? aLaDerecha
      ? x - 6
      : x + TAM + 6
    : Math.max(4, Math.min(x + TAM / 2 - ANCHO_GLOBO / 2, base.w - margenDerecho - ANCHO_GLOBO - 8))
  const globoY = alCostado ? y + TAM / 2 : y - 6

  return (
    <>
      {/* El halo sobre el botón que hay que tocar: la misma luz de Chispa. */}
      <AnimatePresence>
        {caja && !duerme && (
          <motion.span
            key="halo"
            aria-hidden
            className="pointer-events-none absolute z-[650]"
            style={{ borderRadius: Math.min((caja.height + 10) / 2, 20) }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              left: caja.left - 5,
              top: caja.top - 5,
              width: caja.width + 10,
              height: caja.height + 10,
              boxShadow: '0 0 0 2.5px rgba(236,196,106,0.85), 0 0 14px 4px rgba(169,85,44,0.18)',
            }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ type: 'spring', stiffness: 60, damping: 17, opacity: { duration: 0.5 } }}
          />
        )}
      </AnimatePresence>

      {/* El globo: lo que dice, escrito de a poco. Cuelga de Chispa y la sigue. */}
      <motion.div className="pointer-events-none absolute top-0 left-0 z-[670]" style={{ x: globoSigueX, y: globoSigueY }}>
      <AnimatePresence>
        {dice && (
          <motion.div
            key="globo"
            role="status"
            aria-live="polite"
            data-testid="acompanante"
            className="absolute rounded-[14px] bg-superficie/95 px-3.5 py-2 text-[14px] leading-snug font-semibold text-texto shadow-[0_8px_28px_rgba(76,29,11,0.22)] ring-1 ring-[#a9552c]/20 backdrop-blur"
            style={{ width: 'max-content', maxWidth: ANCHO_GLOBO }}
            initial={{ opacity: 0, scale: 0.94, left: globoX - x, top: globoY - y }}
            animate={{
              opacity: 1,
              scale: 1,
              left: globoX - x,
              top: globoY - y,
              translateX: alCostado && aLaDerecha ? '-100%' : '0%',
              translateY: globoArriba ? '-100%' : '-50%',
            }}
            exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.3, ease: 'easeOut' } }}
            transition={{ type: 'spring', stiffness: 70, damping: 18, opacity: { duration: 0.4 } }}
          >
            <Escribe texto={dice} />
          </motion.div>
        )}
      </AnimatePresence>
      </motion.div>

      {/* Chispa: viaja con resorte hasta su lugar, inclinada hacia donde va. */}
      <motion.button
        type="button"
        aria-label="El ayudante del mapa"
        onClick={tocar}
        className="absolute top-0 left-0 z-[668] cursor-pointer rounded-full outline-none focus-visible:ring-3 focus-visible:ring-principal/40"
        style={{ width: TAM, height: TAM, x: posX, y: posY }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <Chispa tam={TAM} variante={variantePedida() ?? 'terracota-oscura'} mira={mira} habla={hablando && !duerme} parpadea={parpadea} animo={animoChispa} viaje={{ vx: velX, vy: velY, prepara }} />
      </motion.button>
    </>
  )
}

/** La línea se escribe de a poco, como quien habla; el lugar se reserva entero para no saltar. */
function Escribe({ texto }: { texto: string }) {
  const quieto = useReducedMotion()
  const [n, setN] = useState(0)
  const [antes, setAntes] = useState(texto)
  if (antes !== texto) {
    setAntes(texto)
    setN(0)
  }
  useEffect(() => {
    if (quieto) return
    const iv = setInterval(() => setN((x) => (x >= texto.length ? x : x + 1)), 20)
    return () => clearInterval(iv)
  }, [texto, quieto])
  const visto = quieto ? texto.length : n
  return (
    <span className="relative block">
      <span className="invisible">{texto}</span>
      <span className="absolute inset-0">{texto.slice(0, visto)}</span>
    </span>
  )
}
