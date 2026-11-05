import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useVelocity } from 'framer-motion'
import { Icono } from '@/components/tropero/icono'
import { useAuth } from '@/features/auth/auth-context'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { registrarAyudaLocal } from '@/features/guia/guia-store'
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
  // Se queda siempre en su lugar de la tarjeta (Lau, 02/11: en el medio del mapa tapaba todo).
  // Lo que hay que hacer en el mapa lo dice la franja de arriba; él mira hacia ahí.
  const enTarjeta = true
  let x = 16
  let y = 16
  let destino: { x: number; y: number } | null = null
  if (dock) {
    x = dock.left + (dock.width - TAM) / 2
    y = dock.top + (dock.height - TAM) / 2
    if (halo) destino = { x: halo.left + halo.width / 2, y: halo.top + halo.height / 2 }
  }
  const enMapa = !!objetivo && objetivo.tipo !== 'tarjeta'
  const punto = objetivo?.tipo === 'punto' ? { x: objetivo.x, y: objetivo.y } : null
  if (punto) destino = punto
  const centro = { x: x + TAM / 2, y: y + TAM / 2 }

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
  // «Preguntale al asistente» (barra lateral) abre esta misma ayuda: un solo asistente.
  // Desde que se monta, aunque todavía esté llegando: si lo llaman antes, abre al aparecer.
  const conAyuda = dudas.length > 0
  useEffect(() => {
    if (!conAyuda) return
    return registrarAyudaLocal(() => {
      setAyuda('toque')
      setElegida(null)
    })
  }, [conAyuda])
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

  const dice = !activo || duerme || ayuda || !enMapa ? null : texto
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

  // El botón que hay que tocar se marca en sí mismo (atributo + CSS): se mueve con el
  // scroll sin retraso, no flota encima (Lau, 02/11: «se sacude»). Sólo botones, no bloques.
  const marcar = activo && !duerme && !ayuda ? idResalta : null
  useEffect(() => {
    if (!marcar) return
    const el = raiz.current?.querySelector<HTMLElement>(`[data-acompana="${marcar}"]`)
    if (!el || el.getBoundingClientRect().height > 72) return
    el.setAttribute('data-resaltado', '')
    return () => el.removeAttribute('data-resaltado')
  }, [marcar, raiz, medir, halo])

  if (!visible) return null

  const animoMascota: Animo = fase === 'dormida' || duerme ? 'duerme' : fase === 'despierta' || despertando ? 'despierta' : ayuda ? 'normal' : animo

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
      {/* Lo que hay que hacer en el mapa: una franja arriba, sobre el mapa, que no tapa nada. */}
      <AnimatePresence mode="wait">
        {dice && (
          <motion.div
            key={dice}
            role="status"
            aria-live="polite"
            data-testid="acompanante"
            className="pointer-events-none absolute top-4 z-[670] flex w-max max-w-[min(520px,calc(100%-32px))] items-center gap-3 rounded-[16px] bg-tinta/92 py-2.5 pr-5 pl-2.5 text-[14.5px] leading-snug font-semibold text-superficie shadow-[0_12px_32px_rgba(19,27,22,0.35)] ring-1 ring-white/10 backdrop-blur"
            style={{ left: Math.max(16, (base.w - margenDerecho) / 2), translateX: '-50%' }}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
          >
            {/* El orbe habla en la franja: un punto que late, en vez de una flecha o una mano. */}
            <span className="relative grid size-8 shrink-0 place-items-center">
              <motion.span className="absolute inset-0 rounded-full bg-principal/40" animate={{ scale: [1, 1.5], opacity: [0.6, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
              <span className="size-3 rounded-full bg-principal" />
            </span>
            <span>{dice}</span>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Dónde: un punto que respira, sin tapar el mapa. */}
      <AnimatePresence>
        {dice && punto && (
          <motion.span
            key="punto"
            aria-hidden
            className="pointer-events-none absolute z-[660] size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-superficie ring-4 ring-principal/70"
            style={{ left: punto.x, top: punto.y }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: [1, 1.25, 1] }}
            exit={{ opacity: 0 }}
            transition={{ scale: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.3 } }}
          />
        )}
      </AnimatePresence>

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
                    <button type="button" onClick={() => setElegida(null)} className="mb-1 self-start inline-flex h-9 items-center gap-1.5 rounded-full border-[1.5px] border-borde bg-superficie px-3.5 text-[14px] font-bold text-texto transition-colors hover:border-principal hover:text-principal">
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
