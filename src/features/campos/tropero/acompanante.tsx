import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useVelocity } from 'framer-motion'
import { Icono } from '@/components/tropero/icono'
import { useAuth } from '@/features/auth/auth-context'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { nombreDe } from '@/features/guia/nombre-usuario'
import { linkWhatsapp } from '@/features/guia/whatsapp'
import { cn } from '@/lib/utils'
import { Mascota, type Animo } from './mascota'

// El asistente de Tropero mientras se arma el mapa en Campos (Lau, 22/10).
// Vive acoplado arriba de la tarjeta: la tarjeta es su voz, así que ahí no
// habla aparte. Sólo sale volando cuando lo que hay que hacer está en el mapa
// (tocar el campo, marcar una esquina), lo señala con una línea corta y vuelve.
// Llega dormido y se despierta cuando la pantalla terminó de acomodarse. Al
// despertar abre solo su ayuda (la primera vez, presentándose), y la vuelve a
// abrir si el productor se queda un rato sin hacer nada: las dudas de ese paso
// y, si no alcanzan, una persona por WhatsApp. También se abre tocándolo. La
// página queda entera y usable: no hay velo.

/**
 * A dónde va:
 * - `tarjeta`: a su lugar arriba de la tarjeta (`data-acompana="dock"`); `resalta` es el botón a tocar.
 * - `punto`: a un punto del mapa en pantalla, con su línea.
 * - `arriba`: arriba a la izquierda del mapa, con su línea.
 */
export type Objetivo = { tipo: 'tarjeta'; resalta?: string } | { tipo: 'punto'; x: number; y: number } | { tipo: 'arriba' }
export type Duda = { pregunta: string; respuesta: string }

const TAM = 64
const ANCHO_GLOBO = 260
const ANCHO_AYUDA = 320
/** El viaje: lento al arrancar, sin rebote al llegar. */
const VUELO = { stiffness: 34, damping: 12.5, mass: 1.15, restDelta: 0.2 }
const GLOBO = { stiffness: 55, damping: 14, mass: 1 }
/** Cuánto duerme al llegar y cuánto tarda en despertarse. */
const DORMIDA_MS = 1300
const DESPIERTA_MS = 900
/** Sin tocar nada este rato, ofrece ayuda; un rato más, se duerme. */
const TRABADO_MS = 15_000
const DORMIR_MS = 45_000

/** Por qué se abrió la ayuda: cambia cómo saluda. */
type Motivo = 'llegada' | 'trabado' | 'toque'

type Caja = { left: number; top: number; width: number; height: number }
const igual = (a: Caja | null, b: Caja | null) => (!a || !b ? a === b : a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height)

export function Acompanante({
  raiz,
  objetivo,
  texto,
  medir,
  animo = 'normal',
  margenDerecho = 0,
  dudas = [],
  presentarse = false,
}: {
  raiz: React.RefObject<HTMLElement | null>
  objetivo: Objetivo | null
  /** Lo que dice en su línea, sólo cuando está en el mapa (en la tarjeta habla la tarjeta). */
  texto: string | null
  medir: number
  /** `festeja` al terminar algo; `piensa` mientras busca. */
  animo?: Exclude<Animo, 'duerme' | 'despierta'>
  /** Lo que ocupa la tarjeta a la derecha (px): en el mapa no se mete ahí. */
  margenDerecho?: number
  /** Las preguntas de este paso, para cuando lo tocan. */
  dudas?: Duda[]
  /** Es la primera vez que lo ven: al abrir su ayuda se presenta. */
  presentarse?: boolean
}) {
  const quieto = !!useReducedMotion()
  const [base, setBase] = useState({ w: 0, h: 0 })
  const [dock, setDock] = useState<Caja | null>(null)
  const [halo, setHalo] = useState<Caja | null>(null)
  const idResalta = objetivo?.tipo === 'tarjeta' ? (objetivo.resalta ?? null) : null

  // ===== Aparece cuando la pantalla se quedó quieta =====
  // La tarjeta entra animada y el mapa carga: si apareciera enseguida, se ubicaría
  // donde la tarjeta estaba a mitad de camino y después saldría corriendo.
  const [aparecio, setAparecio] = useState(false)
  const [ayuda, setAyuda] = useState<Motivo | null>(null)
  const hayDudas = useRef(dudas.length > 0)
  useEffect(() => {
    hayDudas.current = dudas.length > 0
  }, [dudas.length])
  const estable = useRef({ veces: 0, ultimo: null as Caja | null, desde: 0 })

  // Medir su lugar en la tarjeta y el botón que hay que tocar (cambian con el scroll y las animaciones).
  useEffect(() => {
    const e = estable.current
    if (!e.desde) e.desde = Date.now()
    const leer = () => {
      const r = raiz.current
      if (!r) return
      const rr = r.getBoundingClientRect()
      const caja = (sel: string): Caja | null => {
        const b = r.querySelector<HTMLElement>(sel)?.getBoundingClientRect()
        return b ? { left: b.left - rr.left, top: b.top - rr.top, width: b.width, height: b.height } : null
      }
      // Sólo si cambió: cada medida nueva re-dibuja, y se mide seguido.
      setBase((x) => (x.w === rr.width && x.h === rr.height ? x : { w: rr.width, h: rr.height }))
      const d = caja('[data-acompana="dock"]')
      setDock((x) => (igual(x, d) ? x : d))
      const h = idResalta ? caja(`[data-acompana="${idResalta}"]`) : null
      setHalo((x) => (igual(x, h) ? x : h))
      e.veces = igual(e.ultimo, d) ? e.veces + 1 : 0
      e.ultimo = d
      if (d && e.veces >= 2 && Date.now() - e.desde > 700) setAparecio(true)
    }
    leer()
    const iv = setInterval(leer, 250)
    window.addEventListener('resize', leer)
    const r = raiz.current
    r?.addEventListener('scroll', leer, true)
    return () => {
      clearInterval(iv)
      window.removeEventListener('resize', leer)
      r?.removeEventListener('scroll', leer, true)
    }
  }, [raiz, idResalta, medir])

  // Llega dormido, se despierta estirándose y recién ahí se pone a trabajar.
  const [fase, setFase] = useState<'dormida' | 'despierta' | 'activa'>(quieto ? 'activa' : 'dormida')
  useEffect(() => {
    if (!aparecio || quieto) return
    const t1 = setTimeout(() => setFase('despierta'), DORMIDA_MS)
    const t2 = setTimeout(() => {
      setFase('activa')
      // Recién despierto, abre su ayuda: así se presenta y deja a mano las dudas.
      if (hayDudas.current) setAyuda((a) => a ?? 'llegada')
    }, DORMIDA_MS + DESPIERTA_MS)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [aparecio, quieto])
  const activo = fase === 'activa'

  // ===== Dónde se para y hacia dónde mira =====
  const enTarjeta = objetivo?.tipo === 'tarjeta' || !activo
  let x = 16
  let y = 16
  let destino: { x: number; y: number } | null = null
  if (enTarjeta && dock) {
    x = dock.left + (dock.width - TAM) / 2
    y = dock.top + (dock.height - TAM) / 2
    if (halo) destino = { x: halo.left + halo.width / 2, y: halo.top + halo.height / 2 }
  } else if (objetivo?.tipo === 'punto') {
    destino = { x: objetivo.x, y: objetivo.y }
    x = objetivo.x + 22
    y = objetivo.y - TAM * 0.55
  }
  // En el mapa no se mete debajo de la tarjeta.
  if (!enTarjeta) {
    x = Math.max(4, Math.min(x, base.w - margenDerecho - TAM - 4))
    y = Math.max(4, Math.min(y, base.h - TAM - 4))
  }
  const centro = { x: x + TAM / 2, y: y + TAM / 2 }
  const aLaDerecha = destino ? destino.x >= centro.x : true

  // ===== Viaja con un resorte suave =====
  // Antes de un viaje largo mira a dónde va, toma impulso y recién después arranca.
  const visible = aparecio && !!objetivo && base.w > 0 && (!enTarjeta || !!dock)
  const metaX = useMotionValue(x)
  const metaY = useMotionValue(y)
  const posX = useSpring(metaX, VUELO)
  const posY = useSpring(metaY, VUELO)
  // La línea lo sigue con un poco de demora, como colgada de él.
  const globoSigueX = useSpring(posX, GLOBO)
  const globoSigueY = useSpring(posY, GLOBO)
  const prepara = useMotionValue(0)
  const ubicado = useRef(false)
  useEffect(() => {
    if (!visible) return
    // La primera vez aparece en su lugar: nada viene volando desde una esquina.
    if (!ubicado.current || quieto) {
      ubicado.current = true
      for (const [v, n] of [
        [metaX, x],
        [metaY, y],
        [posX, x],
        [posY, y],
        [globoSigueX, x],
        [globoSigueY, y],
      ] as const)
        v.jump(n)
      return
    }
    // Los ajustes chicos (scroll, el mapa que se mueve) los sigue sin demora.
    if (Math.hypot(x - metaX.get(), y - metaY.get()) < 60) {
      metaX.set(x)
      metaY.set(y)
      return
    }
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
  }, [x, y, visible, quieto, metaX, metaY, posX, posY, globoSigueX, globoSigueY, prepara])
  const velX = useVelocity(posX)
  const velY = useVelocity(posY)

  // ===== Vida: parpadeo, mira el mouse, se duerme si nadie hace nada =====
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

  const cajaAyuda = useRef<HTMLDivElement>(null)
  const botonAsistente = useRef<HTMLButtonElement>(null)
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null)
  const [duerme, setDuerme] = useState(false)
  const [despertando, setDespertando] = useState(false)
  const dormido = useRef(false)
  const dormir = useRef<ReturnType<typeof setTimeout>>(undefined)
  const trabado = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    const despertar = () => {
      if (dormido.current) {
        dormido.current = false
        setDuerme(false)
        setDespertando(true)
        setTimeout(() => setDespertando(false), DESPIERTA_MS)
      }
      clearTimeout(dormir.current)
      clearTimeout(trabado.current)
      // Un rato quieto en el mismo paso: «¿Te trabaste?».
      trabado.current = setTimeout(() => {
        if (hayDudas.current) setAyuda((a) => a ?? 'trabado')
      }, TRABADO_MS)
      dormir.current = setTimeout(() => {
        dormido.current = true
        setDuerme(true)
        setAyuda(null)
      }, DORMIR_MS)
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
      clearTimeout(trabado.current)
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('pointerdown', despertar)
      window.removeEventListener('keydown', despertar)
    }
  }, [raiz])

  // Mira lo que hay que hacer y, a medida que el mouse se acerca, pasa a mirarlo a él.
  const hacia = (p: { x: number; y: number } | null) => (p ? { x: (p.x - centro.x) / 120, y: (p.y - centro.y) / 120 } : { x: 0, y: 0 })
  const alObjetivo = hacia(destino)
  const alMouse = mouse ? hacia(mouse) : alObjetivo
  const cerca = mouse ? Math.hypot(mouse.x - centro.x, mouse.y - centro.y) : Infinity
  const peso = Math.max(0, Math.min(1, (440 - cerca) / 200))
  const mira = { x: alObjetivo.x + (alMouse.x - alObjetivo.x) * peso, y: alObjetivo.y + (alMouse.y - alObjetivo.y) * peso }

  // ===== Si lo tocan: «¿en qué te ayudo?» =====
  const [elegida, setElegida] = useState<number | null>(null)
  // Cada paso nuevo cierra la ayuda: las dudas eran del paso anterior.
  const clavePaso = `${objetivo?.tipo}-${idResalta}-${texto}-${dudas[0]?.pregunta}`
  const [pasoVisto, setPasoVisto] = useState(clavePaso)
  if (pasoVisto !== clavePaso) {
    setPasoVisto(clavePaso)
    setAyuda(null)
    setElegida(null)
  }
  const { user } = useAuth()
  const empresa = useEmpresa()
  const whatsapp = linkWhatsapp({ nombre: nombreDe(user?.user_metadata), empresa: empresa.data?.empresa?.nombre ?? null, seccion: 'Campos' })
  useEffect(() => {
    if (!ayuda) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAyuda(null)
    // Tocar afuera (el mapa, la tarjeta) la cierra; tocar el asistente, también (eso lo maneja él).
    const afuera = (e: PointerEvent) => {
      const t = e.target as Node
      if (!cajaAyuda.current?.contains(t) && !botonAsistente.current?.contains(t)) setAyuda(null)
    }
    window.addEventListener('keydown', esc)
    window.addEventListener('pointerdown', afuera)
    return () => {
      window.removeEventListener('keydown', esc)
      window.removeEventListener('pointerdown', afuera)
    }
  }, [ayuda])

  const dice = !activo || duerme || ayuda || enTarjeta ? null : texto
  // Mueve la boca mientras escribe su línea o contesta una duda.
  const respuesta = ayuda && elegida != null ? (dudas[elegida]?.respuesta ?? null) : null
  const voz = ayuda ? respuesta : dice
  const [hablando, setHablando] = useState(false)
  const [vozVista, setVozVista] = useState<string | null>(null)
  if (vozVista !== voz) {
    setVozVista(voz)
    setHablando(!!voz && !quieto)
  }
  useEffect(() => {
    if (!voz) return
    const t = setTimeout(() => setHablando(false), Math.min(voz.length * 20 + 150, 2600))
    return () => clearTimeout(t)
  }, [voz])

  if (!visible) return null

  const animoMascota: Animo = fase === 'dormida' || duerme ? 'duerme' : fase === 'despierta' || despertando ? 'despierta' : ayuda ? 'normal' : animo

  // La línea va al costado, del lado contrario de lo que señala; si no entra, arriba.
  const alCostado = aLaDerecha ? x - ANCHO_GLOBO - 6 > 4 : x + TAM + ANCHO_GLOBO + 6 < base.w - margenDerecho
  const globoArriba = !alCostado
  const globoX = alCostado
    ? aLaDerecha
      ? x - 6
      : x + TAM + 6
    : Math.max(4, Math.min(x + TAM / 2 - ANCHO_GLOBO / 2, base.w - margenDerecho - ANCHO_GLOBO - 8))
  const globoY = alCostado ? y + TAM / 2 : y - 6
  // La ayuda se abre a la izquierda (sobre el mapa, sin tapar la tarjeta); si no entra, arriba.
  const ayudaIzquierda = x - ANCHO_AYUDA - 12 > 4
  const ayudaX = ayudaIzquierda ? x - 12 : Math.max(4, Math.min(x + TAM / 2 - ANCHO_AYUDA / 2, base.w - ANCHO_AYUDA - 8))
  const ayudaY = ayudaIzquierda ? Math.max(4, Math.min(y - 8, base.h - 360)) : y - 10
  // Dónde cae la colita: a la altura de los ojos del asistente.
  const colita = Math.max(22, Math.min(y + TAM / 2 - ayudaY, 300))
  const encabezado =
    ayuda === 'llegada' && presentarse
      ? { titulo: '¡Hola! Soy tu asistente', texto: 'Te marco dónde tocar y te saco las dudas en el camino. Esto es lo que más se pregunta al empezar:' }
      : ayuda === 'trabado'
        ? { titulo: '¿Te trabaste?', texto: 'Es lo más común en este paso. Fijate si es alguna de estas:' }
        : ayuda === 'llegada'
          ? { titulo: '¿Te doy una mano?', texto: 'Lo que más se pregunta en este paso:' }
          : { titulo: '¿En qué te ayudo?', texto: 'Lo que más se pregunta en este paso:' }

  return (
    <>
      {/* El halo sobre el botón que hay que tocar: nace en su lugar y se desliza al siguiente. */}
      <AnimatePresence>
        {halo && activo && !duerme && !ayuda && (
          <motion.span
            key="halo"
            aria-hidden
            className="pointer-events-none absolute z-[650]"
            style={{ borderRadius: Math.min((halo.height + 10) / 2, 20) }}
            initial={{ opacity: 0, left: halo.left - 5, top: halo.top - 5, width: halo.width + 10, height: halo.height + 10 }}
            animate={{
              opacity: 1,
              left: halo.left - 5,
              top: halo.top - 5,
              width: halo.width + 10,
              height: halo.height + 10,
              boxShadow: '0 0 0 2.5px rgba(236,196,106,0.85), 0 0 14px 4px rgba(169,85,44,0.18)',
            }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ type: 'spring', stiffness: 60, damping: 17, opacity: { duration: 0.5 } }}
          />
        )}
      </AnimatePresence>

      {/* Su línea en el mapa, escrita de a poco. Cuelga del asistente y lo sigue. */}
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

      {/* La ayuda: las dudas de este paso y, si no alcanzan, una persona. La colita apunta al asistente. */}
      <AnimatePresence>
        {ayuda && (
          <motion.div
            key="ayuda"
            ref={cajaAyuda}
            role="dialog"
            aria-label="¿En qué te ayudo?"
            className="absolute z-[675] text-texto"
            style={{ width: ANCHO_AYUDA, left: ayudaX, top: ayudaY, transformOrigin: ayudaIzquierda ? `100% ${colita}px` : '50% 100%' }}
            initial={{ opacity: 0, scale: 0.94, translateX: ayudaIzquierda ? '-100%' : '0%', translateY: ayudaIzquierda ? '0%' : '-100%' }}
            animate={{ opacity: 1, scale: 1, translateX: ayudaIzquierda ? '-100%' : '0%', translateY: ayudaIzquierda ? '0%' : '-100%' }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 150, damping: 20, opacity: { duration: 0.3 } }}
          >
            <span
              aria-hidden
              className={cn('absolute size-3.5 rotate-45 bg-superficie', ayudaIzquierda ? '-right-[7px] border-t border-r' : '-bottom-[7px] border-r border-b', 'border-[#a9552c]/15')}
              style={ayudaIzquierda ? { top: colita - 7 } : { left: x + TAM / 2 - ayudaX - 7 }}
            />
            <div className="relative overflow-hidden rounded-[20px] bg-superficie shadow-[0_18px_44px_rgba(76,29,11,0.26)] ring-1 ring-[#a9552c]/15">
              <div className="flex items-start gap-3 px-5 pt-4 pb-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {respuesta ? (
                    <button type="button" onClick={() => setElegida(null)} className="mb-1 flex items-center gap-1 self-start text-[13px] font-bold text-principal hover:underline">
                      <Icono nombre="Siguiente" tamano={16} className="rotate-180" />
                      Otras dudas
                    </button>
                  ) : null}
                  <p className="titulo-display text-[19px] leading-tight">{respuesta ? dudas[elegida!]?.pregunta : encabezado.titulo}</p>
                  {!respuesta && <p className="text-[14px] leading-snug text-texto-suave">{encabezado.texto}</p>}
                </div>
                <button type="button" aria-label="Cerrar la ayuda" onClick={() => setAyuda(null)} className="-mt-1 -mr-2 grid size-8 shrink-0 place-items-center rounded-full text-texto-suave hover:bg-fondo">
                  <Icono nombre="Cerrar" tamano={16} />
                </button>
              </div>
              {respuesta ? (
                <p className="px-5 pb-4 text-[15px] leading-relaxed text-texto">
                  <Escribe texto={respuesta} />
                </p>
              ) : (
                <ul className="flex flex-col border-t border-borde/70">
                  {dudas.map((d, i) => (
                    <li key={d.pregunta} className="border-b border-borde/70 last:border-b-0">
                      <button type="button" onClick={() => setElegida(i)} className="group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-principal-suave/60">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-principal-suave text-principal">
                          <Icono nombre="Ayuda" tamano={16} />
                        </span>
                        <span className="flex-1 text-[14.5px] font-semibold">{d.pregunta}</span>
                        <Icono nombre="Siguiente" tamano={16} className="shrink-0 text-texto-suave transition-transform group-hover:translate-x-0.5 group-hover:text-principal" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noreferrer" className="flex items-center gap-3 border-t border-borde/70 bg-fondo/60 px-5 py-3 transition-colors hover:bg-fondo">
                  <Icono nombre="Celular" tamano={16} className="text-principal" />
                  <span className="flex-1 text-[13.5px] text-texto-suave">
                    ¿Preferís hablarlo? <span className="font-bold text-principal">Escribinos por WhatsApp</span>
                  </span>
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* El asistente: llega dormido en su lugar y desde ahí viaja con resorte. */}
      <motion.button
        ref={botonAsistente}
        type="button"
        aria-label="El asistente de Tropero: tocalo si tenés una duda"
        aria-expanded={!!ayuda}
        onClick={() => {
          setAyuda((a) => (a ? null : 'toque'))
          setElegida(null)
        }}
        className="absolute top-0 left-0 z-[668] cursor-pointer rounded-full outline-none focus-visible:ring-3 focus-visible:ring-principal/40"
        style={{ width: TAM, height: TAM, x: posX, y: posY }}
        initial={quieto ? false : { opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ opacity: { duration: 0.8, ease: 'easeOut' }, scale: { type: 'spring', stiffness: 70, damping: 14 } }}
      >
        <Mascota tam={TAM} mira={mira} habla={hablando && !duerme} parpadea={parpadea} animo={animoMascota} viaje={{ vx: velX, vy: velY, prepara }} />
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
