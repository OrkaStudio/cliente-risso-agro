import * as React from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion, useMotionValue, useReducedMotion, useSpring, useVelocity } from 'framer-motion'
import { Icono } from '@/components/tropero/icono'
import { useAuth } from '@/features/auth/auth-context'
import { Mascota, type Animo } from '@/features/campos/tropero/mascota'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { avisosDe, progresoDe, type Aviso } from '@/features/guia/avisos'
import { responderLocal, sugerenciasDe, type Mensaje } from '@/features/guia/conversacion'
import { useEstadoPuestaAPunto } from '@/features/guia/checklist'
import { nombreDe } from '@/features/guia/nombre-usuario'
import { linkWhatsapp } from '@/features/guia/whatsapp'
import { abrirPanel, cerrarPanel, useHayAyudaLocal, usePanelAbierto } from '@/features/guia/guia-store'
import { FICHAS, type CategoriaFicha } from '@/features/guia/fichas'
import { NOMBRE_SECCION, seccionDeRuta, type SeccionGuia } from '@/features/guia/secciones'
import { useMapa } from '@/features/mapa/api'
import { useMapaPendiente } from '@/features/mapa/bloqueo'
import { cn } from '@/lib/utils'
import { registrar } from '@/lib/telemetria'

/**
 * El asistente de Troppero en toda la Oficina (Lau, 28–29/10). Cerrado es una
 * barra oscura abajo a la derecha con el orbe adentro y «Preguntale a Troppero»:
 * que se entienda que es una IA. Abierto es una tarjeta angosta: lo que vio en
 * los campos (avisos.ts), ejemplos de qué preguntarle y la charla, con la caja
 * para escribir abajo. Lo que propone lo hace: el orbe sale de la barra, vuela
 * hasta el botón, lo marca, lo toca y vuelve. Festeja cada paso que se completa.
 * Mientras el del mapa está en pantalla, se corre: nunca hay dos (guia-store).
 * Spec: [[clientes/risso-agro/especificaciones/2026-07-16-asistente-conversacional-operativo]].
 */

/** El orbe dentro de la barra; al volar se agranda un poco. */
const TAM = 40
/** El viaje: el mismo resorte que en el mapa. */
const VUELO = { stiffness: 34, damping: 12.5, mass: 1.15, restDelta: 0.2 }
/** Cuánto muestra el botón antes de tocarlo, y cuánto se queda después. */
const MARCA_MS = 1300
const VUELTA_MS = 700
const DORMIR_MS = 60_000

/** Categoría de dudas según dónde está parado. */
const CATEGORIA_DE_SECCION: Record<SeccionGuia, CategoriaFicha> = {
  inicio: 'hacienda',
  hacienda: 'hacienda',
  campos: 'campos',
  analitica: 'plata',
  agenda: 'plata',
}

type Caja = { left: number; top: number; width: number; height: number }

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}
function guardar(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    /* sin almacenamiento: sólo se pierde el recuerdo */
  }
}

export function AsistentePanel() {
  const quieto = !!useReducedMotion()
  const abierto = usePanelAbierto()
  const hayAyudaLocal = useHayAyudaLocal()
  const navigate = useNavigate()
  const location = useLocation()
  const seccion = seccionDeRuta(location.pathname)
  const mapaPendiente = useMapaPendiente()
  const { user } = useAuth()
  const empresa = useEmpresa()
  const estado = useEstadoPuestaAPunto()
  const { data: campos } = useMapa(empresa.data?.empresa_id)
  const nombre = nombreDe(user?.user_metadata)

  const resumen = estado.data?.resumen
  const avisos = React.useMemo(() => (resumen ? avisosDe(resumen, campos ?? [], mapaPendiente) : []), [resumen, campos, mapaPendiente])
  const progreso = React.useMemo(() => (resumen ? progresoDe(resumen, campos ?? [], mapaPendiente) : []), [resumen, campos, mapaPendiente])
  const hechos = progreso.filter((p) => p.hecho).length

  // ===== La conversación =====
  // Se le escribe lo que sea. Arranca con lo que notó y ejemplos hechos con sus campos.
  const categoria = mapaPendiente ? 'campos' : seccion ? CATEGORIA_DE_SECCION[seccion] : 'hacienda'
  const sugerencias = sugerenciasDe(campos ?? [], categoria, FICHAS)
  const [mensajes, setMensajes] = React.useState<Mensaje[]>([])
  const [borrador, setBorrador] = React.useState('')
  const [pensando, setPensando] = React.useState(false)
  const [ultimaPregunta, setUltimaPregunta] = React.useState('')
  const hilo = React.useRef<HTMLDivElement>(null)
  const idMensaje = React.useRef(0)
  React.useEffect(() => {
    const el = hilo.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: quieto ? 'auto' : 'smooth' })
  }, [mensajes, pensando, quieto])
  const preguntar = (texto: string) => {
    const t = texto.trim()
    if (!t || pensando) return
    registrar('asistente_pregunta', { ficha: 'texto' })
    setBorrador('')
    setUltimaPregunta(t)
    setMensajes((m) => [...m, { id: ++idMensaje.current, de: 'yo', texto: t }])
    setPensando(true)
    // Un instante pensando: la respuesta no aparece de golpe.
    setTimeout(() => {
      const r = responderLocal(t, FICHAS)
      setMensajes((m) => [...m, { id: ++idMensaje.current, de: 'tropero', ...r }])
      setPensando(false)
    }, quieto ? 0 : 700)
  }
  const whatsappConsulta = linkWhatsapp({ nombre, empresa: empresa.data?.empresa?.nombre ?? null, seccion: seccion ? NOMBRE_SECCION[seccion] : null, consulta: ultimaPregunta })

  React.useEffect(() => {
    if (!abierto) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && cerrarPanel()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [abierto])

  // ===== Dónde está y a dónde va =====
  // Su casa es el hueco dentro de la barra: se mide en pantalla (la barra cambia de ancho con el texto).
  const hueco = React.useRef<HTMLSpanElement>(null)
  const [casa, setCasa] = React.useState({ x: window.innerWidth - 24 - 48, y: window.innerHeight - 24 - 48 })
  React.useLayoutEffect(() => {
    const el = hueco.current
    if (!el) return
    const medir = () => {
      const b = el.getBoundingClientRect()
      setCasa((c) => (c.x === b.left && c.y === b.top ? c : { x: b.left, y: b.top }))
    }
    medir()
    const ro = new ResizeObserver(medir)
    if (el.parentElement) ro.observe(el.parentElement)
    window.addEventListener('resize', medir)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [hayAyudaLocal])
  const [marca, setMarca] = React.useState<Caja | null>(null)
  const destino = marca
    ? {
        // Al lado del botón, del lado que tenga lugar.
        x: marca.left - TAM - 10 > 8 ? marca.left - TAM - 10 : Math.min(marca.left + marca.width + 10, window.innerWidth - TAM - 8),
        y: Math.max(8, Math.min(marca.top + marca.height / 2 - TAM / 2, window.innerHeight - TAM - 8)),
      }
    : casa
  const metaX = useMotionValue(destino.x)
  const metaY = useMotionValue(destino.y)
  const posX = useSpring(metaX, VUELO)
  const posY = useSpring(metaY, VUELO)
  // Vuela con resorte sólo al ir a un botón y al volver; si la barra cambia de
  // ancho (texto, scroll), el orbe va derecho a su hueco, sin quedar corrido.
  const volando = React.useRef(false)
  React.useEffect(() => {
    if (marca) volando.current = true
    const viaja = !quieto && volando.current
    if (viaja) {
      metaX.set(destino.x)
      metaY.set(destino.y)
    } else {
      for (const [v, n] of [[metaX, destino.x], [metaY, destino.y], [posX, destino.x], [posY, destino.y]] as const) v.jump(n)
    }
    if (marca || !volando.current) return
    // Ya de vuelta en la barra: lo que siga es acomodarse, no volar.
    const t = setTimeout(() => (volando.current = false), 2500)
    return () => clearTimeout(t)
  }, [marca, destino.x, destino.y, quieto, metaX, metaY, posX, posY])
  const velX = useVelocity(posX)
  const velY = useVelocity(posY)

  // Hacer lo que propone: ir a la pantalla, volar al botón, marcarlo y tocarlo.
  const guia = React.useRef<ReturnType<typeof setTimeout>[]>([])
  React.useEffect(() => () => guia.current.forEach(clearTimeout), [])
  const hacer = (a: Pick<NonNullable<Aviso['accion']>, 'ruta' | 'ancla'>, id: string) => {
    registrar('asistente_pregunta', { ficha: `aviso:${id}` })
    cerrarPanel()
    navigate(a.ruta)
    const ancla = a.ancla
    if (!ancla) return
    guia.current.forEach(clearTimeout)
    guia.current = []
    let intentos = 0
    const buscar = () => {
      const el = document.querySelector<HTMLElement>(`[data-guia="${ancla}"]`)
      if (!el) {
        if (++intentos < 15) guia.current.push(setTimeout(buscar, 200))
        return
      }
      el.scrollIntoView({ block: 'center', behavior: quieto ? 'auto' : 'smooth' })
      guia.current.push(
        setTimeout(() => {
          const b = el.getBoundingClientRect()
          setMarca({ left: b.left, top: b.top, width: b.width, height: b.height })
          guia.current.push(
            setTimeout(() => {
              const boton = el.tagName === 'BUTTON' ? el : (el.querySelector<HTMLElement>('button, a') ?? el)
              boton.click()
              guia.current.push(setTimeout(() => setMarca(null), VUELTA_MS))
            }, MARCA_MS),
          )
        }, 350),
      )
    }
    guia.current.push(setTimeout(buscar, 150))
  }

  // ===== Vida: parpadea, mira el mouse, se duerme si nadie hace nada =====
  const [parpadea, setParpadea] = React.useState(false)
  React.useEffect(() => {
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
  const [mouse, setMouse] = React.useState<{ x: number; y: number } | null>(null)
  const [duerme, setDuerme] = React.useState(false)
  React.useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const activo = () => {
      setDuerme(false)
      clearTimeout(t)
      t = setTimeout(() => setDuerme(true), DORMIR_MS)
    }
    const mover = (e: MouseEvent) => {
      setMouse({ x: e.clientX, y: e.clientY })
      activo()
    }
    activo()
    window.addEventListener('mousemove', mover)
    window.addEventListener('pointerdown', activo)
    window.addEventListener('keydown', activo)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('pointerdown', activo)
      window.removeEventListener('keydown', activo)
    }
  }, [])
  const centro = { x: destino.x + TAM / 2, y: destino.y + TAM / 2 }
  const mira = marca
    ? { x: (marca.left + marca.width / 2 - centro.x) / 120, y: (marca.top + marca.height / 2 - centro.y) / 120 }
    : abierto
      ? { x: -0.4, y: -0.6 }
      : mouse && Math.hypot(mouse.x - centro.x, mouse.y - centro.y) < 520
        ? { x: (mouse.x - centro.x) / 160, y: (mouse.y - centro.y) / 160 }
        : { x: 0, y: 0 }

  // ===== Lo que dice sin que lo abran =====
  // Festeja cada paso nuevo; si no, una vez por sesión cuenta lo que notó.
  const uid = user?.id ?? ''
  const [globo, setGlobo] = React.useState<string | null>(null)
  const [festeja, setFesteja] = React.useState(false)
  const clave = `tropero:asistente:hechos:${uid}`
  const [hechosVistos, setHechosVistos] = React.useState<number | null>(null)
  // Recién con todo cargado: un cálculo a medias no es un paso cumplido.
  if (uid && resumen && campos && empresa.data && hechosVistos !== hechos) {
    const guardado = leer(clave)
    const antes = hechosVistos ?? (guardado === null ? null : Number(guardado))
    setHechosVistos(hechos)
    if (antes !== null && hechos > antes) {
      const nuevo = progreso.filter((p) => p.hecho).at(-1)
      setFesteja(true)
      setGlobo(nuevo ? `¡Bien! ${nuevo.texto}: listo.` : '¡Bien!')
    }
  }
  React.useEffect(() => {
    if (uid && hechosVistos !== null) guardar(clave, String(hechosVistos))
  }, [uid, clave, hechosVistos])
  React.useEffect(() => {
    if (!festeja) return
    const t = setTimeout(() => setFesteja(false), 2600)
    return () => clearTimeout(t)
  }, [festeja])
  React.useEffect(() => {
    if (!uid || avisos.length === 0) return
    const clave = `tropero:asistente:saludo:${uid}`
    try {
      if (sessionStorage.getItem(clave) === '1') return
    } catch {
      /* sin almacenamiento: saluda igual */
    }
    // Se marca al saludar, no antes: si el efecto se repite, el saludo no se pierde.
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(clave, '1')
      } catch {
        /* idem */
      }
      setGlobo((g) => g ?? `Noté ${avisos.length === 1 ? 'una cosa' : `${avisos.length} cosas`} en tus campos.`)
    }, 1800)
    return () => clearTimeout(t)
  }, [uid, avisos.length])
  React.useEffect(() => {
    if (!globo) return
    const t = setTimeout(() => setGlobo(null), 8000)
    return () => clearTimeout(t)
  }, [globo])
  if (abierto && globo) setGlobo(null)

  const [compacta, setCompacta] = React.useState(false)
  const [sobre, setSobre] = React.useState(false)
  React.useEffect(() => {
    const alBajar = (e: Event) => {
      const t = e.target
      // Lo que se scrollea adentro del panel no cuenta.
      if (t instanceof Element && t.closest('[role="dialog"]')) return
      const y = t instanceof Element ? t.scrollTop : window.scrollY
      setCompacta(y > 24)
    }
    document.addEventListener('scroll', alBajar, true)
    return () => document.removeEventListener('scroll', alBajar, true)
  }, [])
  // Cada pantalla nueva arranca arriba, con la barra entera.
  const [rutaVista, setRutaVista] = React.useState(location.pathname)
  if (rutaVista !== location.pathname) {
    setRutaVista(location.pathname)
    setCompacta(false)
  }

  if (hayAyudaLocal) return null

  const animo: Animo = festeja ? 'festeja' : duerme && !abierto && !marca ? 'duerme' : 'normal'

  const nAvisos = avisos.length
  // Al bajar por la página la barra se achica al orbe y el número: no tapa la tabla.
  const verTexto = !compacta || sobre || !!globo || abierto
  const etiqueta = nAvisos > 0 ? `El asistente de Troppero: notó ${nAvisos === 1 ? 'una cosa' : `${nAvisos} cosas`}` : 'El asistente de Troppero'
  // Debajo de los diálogos (z-50) mientras espera; arriba cuando está abierto o trabajando.
  const arriba = abierto || !!marca

  return createPortal(
    <MotionConfig reducedMotion="user">
      {/* La marca sobre el botón que va a tocar. */}
      <AnimatePresence>
        {marca && (
          <motion.span
            key="marca"
            aria-hidden
            className="pointer-events-none fixed z-[80]"
            style={{ left: marca.left - 5, top: marca.top - 5, width: marca.width + 10, height: marca.height + 10, borderRadius: Math.min((marca.height + 10) / 2, 20) }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, boxShadow: '0 0 0 2.5px rgba(236,196,106,0.9), 0 0 14px 4px rgba(169,85,44,0.2)' }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {abierto && (
          <>
            {/* Click afuera cierra (sin velo: el panel convive con la página). */}
            <div className="fixed inset-0 z-[70]" onClick={cerrarPanel} />
            <motion.aside
              role="dialog"
              aria-label="¿En qué te ayudo?"
              className="fixed z-[75] flex flex-col overflow-hidden bg-superficie text-texto shadow-[0_24px_60px_rgba(40,22,10,0.28)] ring-1 ring-[#a9552c]/12 max-md:inset-x-2 max-md:bottom-2 max-md:h-[85dvh] max-md:rounded-[24px] md:right-6 md:bottom-[92px] md:h-[min(720px,calc(100dvh-116px))] md:w-[380px] md:rounded-[24px]"
              style={{ transformOrigin: 'bottom right' }}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 170, damping: 22, opacity: { duration: 0.25 } }}
            >
              {/* Cabecera: quién es y para qué sirve. */}
              <header className="flex items-center gap-3 border-b border-borde/70 px-5 py-4">
                <Mascota tam={40} parpadea={parpadea} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15.5px] leading-tight font-bold">Asistente de Troppero</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-texto-suave">Te respondo sobre tus campos y cómo usar la app</p>
                </div>
                <button type="button" aria-label="Cerrar el asistente" onClick={cerrarPanel} className="grid size-9 shrink-0 place-items-center rounded-full text-texto-suave hover:bg-fondo hover:text-texto">
                  <Icono nombre="Cerrar" tamano={16} />
                </button>
              </header>

              <div ref={hilo} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
                <Burbuja>{nombre ? `Hola, ${nombre}. ¿Qué querés saber?` : '¡Hola! ¿Qué querés saber?'}</Burbuja>

                {/* Lo que la app detectó en sus datos, cada cosa con el botón que la resuelve. */}
                {nAvisos > 0 && (
                  <section className="flex flex-col gap-2">
                    <Titulo>Lo que vi en tus campos</Titulo>
                    {avisos.map((a) => (
                      <div key={a.id} className="rounded-[18px] border border-borde bg-fondo/60 p-3.5">
                        <div className="flex items-start gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-principal-suave text-principal">
                            <Icono nombre={a.icono} tamano={16} />
                          </span>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <p className="text-[14.5px] leading-snug font-bold">{a.titulo}</p>
                            <p className="mt-0.5 text-[13px] leading-snug text-texto-suave">{a.detalle}</p>
                          </div>
                        </div>
                        {a.accion ? (
                          <button
                            type="button"
                            onClick={() => hacer(a.accion!, a.id)}
                            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-principal text-[14px] font-bold text-principal-texto hover:bg-terracota-600"
                          >
                            {a.accion.texto}
                            <Icono nombre="Siguiente" tamano={16} />
                          </button>
                        ) : (
                          <p className="mt-3 flex h-10 items-center justify-center gap-2 rounded-full bg-superficie text-[13.5px] font-semibold text-texto-suave ring-1 ring-borde">
                            <Icono nombre="Celular" tamano={16} />
                            Se hace desde el celular
                          </p>
                        )}
                      </div>
                    ))}
                  </section>
                )}

                {/* Ejemplos de lo que se le puede preguntar; se van apenas pregunta algo. */}
                {mensajes.length === 0 && (
                  <section className="flex flex-col gap-2">
                    <Titulo>Probá preguntarme</Titulo>
                    <ul className="flex flex-col overflow-hidden rounded-[18px] border border-borde">
                      {sugerencias.map((q) => (
                        <li key={q.texto} className="border-b border-borde/70 last:border-b-0">
                          <button type="button" onClick={() => preguntar(q.texto)} className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-principal-suave/50">
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fondo text-principal">
                              <Icono nombre={q.icono} tamano={16} />
                            </span>
                            <span className="flex-1 text-[14px] leading-snug font-semibold">{q.texto}</span>
                            <Icono nombre="Siguiente" tamano={16} className="shrink-0 text-texto-suave transition-transform group-hover:translate-x-0.5 group-hover:text-principal" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {mensajes.map((m) =>
                  m.de === 'yo' ? (
                    <p key={m.id} className="max-w-[85%] self-end rounded-[18px] rounded-br-[6px] bg-principal px-3.5 py-2.5 text-[14.5px] leading-snug text-principal-texto">
                      {m.texto}
                    </p>
                  ) : (
                    <Burbuja key={m.id}>
                      {m.texto}
                      {m.accion && (
                        <button
                          type="button"
                          onClick={() => hacer(m.accion!, `respuesta:${m.accion!.ruta}`)}
                          className="mt-2.5 flex h-9 w-fit items-center gap-1.5 rounded-full bg-principal px-3.5 text-[14px] font-bold text-principal-texto hover:bg-terracota-600"
                        >
                          {m.accion.texto}
                          <Icono nombre="Siguiente" tamano={16} />
                        </button>
                      )}
                      {m.persona && whatsappConsulta && (
                        <a
                          href={whatsappConsulta}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => registrar('soporte_whatsapp', { seccion })}
                          className="mt-2.5 flex h-9 w-fit items-center gap-1.5 rounded-full bg-principal px-3.5 text-[14px] font-bold text-principal-texto hover:bg-terracota-600"
                        >
                          <Icono nombre="Celular" tamano={16} />
                          Preguntar por WhatsApp
                        </a>
                      )}
                    </Burbuja>
                  ),
                )}
                {pensando && (
                  <p role="status" aria-label="Pensando" className="flex gap-1.5 self-start rounded-[18px] rounded-bl-[6px] bg-fondo px-4 py-3.5">
                    {[0, 1, 2].map((i) => (
                      <motion.span key={i} className="size-1.5 rounded-full bg-texto-suave" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }} />
                    ))}
                  </p>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  preguntar(borrador)
                }}
                className="flex items-center gap-2 border-t border-borde/70 bg-fondo/60 p-3"
              >
                <input
                  autoFocus
                  value={borrador}
                  onChange={(e) => setBorrador(e.target.value)}
                  placeholder="Escribí tu pregunta"
                  aria-label="Escribí tu pregunta"
                  className="h-11 min-w-0 flex-1 rounded-full bg-superficie px-4 text-[15px] text-texto ring-1 ring-borde outline-none placeholder:text-texto-suave focus:ring-principal/50"
                />
                <button
                  type="submit"
                  aria-label="Preguntar"
                  disabled={!borrador.trim() || pensando}
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-principal text-principal-texto transition-opacity hover:bg-terracota-600 disabled:opacity-35"
                >
                  <Icono nombre="Siguiente" tamano={16} className="-rotate-90" />
                </button>
              </form>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Cerrado: la barra oscura con el orbe adentro. Se entiende que es una IA y a qué invita. */}
      <button
        type="button"
        onClick={() => {
          setGlobo(null)
          if (abierto) cerrarPanel()
          else abrirPanel()
        }}
        onMouseEnter={() => setSobre(true)}
        onMouseLeave={() => setSobre(false)}
        aria-label={etiqueta}
        aria-expanded={abierto}
        className={cn(
          'fixed right-6 bottom-6 flex h-14 items-center gap-3 rounded-full bg-tinta p-2 text-white shadow-[0_12px_32px_rgba(28,18,10,0.35)] ring-1 ring-white/10 transition-colors hover:bg-tinta/90',
          verTexto ? 'md:pr-5' : nAvisos > 0 ? 'pr-3' : '',
          arriba ? 'z-[76]' : 'z-[45]',
        )}
      >
        <span ref={hueco} aria-hidden className="size-10 shrink-0" />
        <AnimatePresence mode="wait" initial={false}>
          {verTexto && (
          <motion.span
            key={abierto ? 'cerrar' : (globo ?? 'invita')}
            role={globo && !abierto ? 'status' : undefined}
            className="max-w-[260px] truncate text-[15px] font-bold max-md:hidden"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {abierto ? 'Cerrar' : (globo ?? 'Preguntale a Troppero')}
          </motion.span>
          )}
        </AnimatePresence>
        {nAvisos > 0 && !abierto && (
          <span className="cifra grid size-6 shrink-0 place-items-center rounded-full bg-principal text-[12.5px] font-bold text-principal-texto">{nAvisos}</span>
        )}
      </button>

      {/* El orbe: descansa en su hueco de la barra y sale a volar cuando hace algo. */}
      <motion.div
        aria-hidden
        className={cn('pointer-events-none fixed top-0 left-0', arriba ? 'z-[77]' : 'z-[46]')}
        style={{ width: TAM, height: TAM, x: posX, y: posY }}
        animate={{ scale: marca ? 1.35 : 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
      >
        <Mascota tam={TAM} mira={mira} parpadea={parpadea} animo={animo} habla={!!globo} viaje={{ vx: velX, vy: velY }} />
      </motion.div>
    </MotionConfig>,
    document.body,
  )
}

/** El título de cada bloque: dice para qué es. */
function Titulo({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] font-bold tracking-[0.03em] text-texto-suave uppercase">{children}</p>
}

/** Lo que dice el asistente en la charla. */
function Burbuja({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[88%] self-start rounded-[18px] rounded-bl-[6px] bg-fondo px-4 py-3 text-[14.5px] leading-relaxed text-texto">{children}</div>
}
