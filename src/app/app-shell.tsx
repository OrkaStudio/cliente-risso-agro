import { Suspense, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { prefetchEnReposo, CHUNKS_OFICINA } from '@/lib/prefetch'
import {
  BarChart3,
  Beef,
  CalendarClock,
  CircleDollarSign,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Map as MapIcon,
} from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { AsistentePanel } from '@/features/guia/asistente-panel'
import { useMedirPuestaAPunto } from '@/features/guia/medir'
import { Mision } from '@/features/guia/mision'
import { Spots } from '@/features/guia/spots'
import { ClimaSlot } from '@/features/cotizaciones/clima-slot'
import { GordoSlot } from '@/features/cotizaciones/gordo-slot'
import { useDolarBlue } from '@/features/cotizaciones/hooks'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { abiertoSinMapa, seccionBloqueada, useMapaPendiente } from '@/features/mapa/bloqueo'
import { MARCA } from '@/lib/marca'
import { useIsMobile } from '@/lib/use-is-mobile'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { PILDORA } from '@/features/cotizaciones/pildora'
import { BarraLateral } from './barra-lateral'
import { useCuantasHoy } from '@/features/inicio/tropero/use-dia'

function fechaHoy(): string {
  const s = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Strip de mercado: gordo (manual), dólar blue (dolarapi) y clima
 *  (open-meteo). Si una fuente falla, no muestra ese dato (nunca un valor
 *  de muestra). Los slots presentes se separan con un divisor. */
function Ticker() {
  const blue = useDolarBlue()
  const empresa = useEmpresa()
  const empresaId = empresa.data?.empresa_id ?? ''

  const slots: ReactNode[] = [
    empresaId ? <GordoSlot key="gordo" empresaId={empresaId} /> : null,
    blue.data ? (
      <div
        key="blue"
        className={PILDORA}
        title={`Dólar blue: compra $${blue.data.compra.toLocaleString('es-AR')} · venta $${blue.data.venta.toLocaleString('es-AR')}`}
      >
        <CircleDollarSign className="size-4 text-estado-bien" />
        <span className="text-[13px] text-texto-suave">Blue</span>
        <b className="cifra text-[15px] font-bold text-texto">${blue.data.venta.toLocaleString('es-AR')}</b>
      </div>
    ) : null,
    // El slot del clima decide solo si tiene algo que mostrar (campo elegido
    // con ubicación y respuesta de Open-Meteo) o si pide ubicar el campo.
    <ClimaSlot key="clima" />,
  ].filter(Boolean)

  return <div className="ml-auto flex min-w-0 items-center gap-2">{slots}</div>
}

/**
 * Layout del área autenticada (Modo Oficina, escritorio).
 * Sidebar fijo (colapsable) + topbar; sólo el contenido scrollea.
 * Guía visual: design/dashboard-agro-ai.html. El Modo Campo
 * (Recorrida/Clima) es mobile y vive aparte; acá solo Oficina.
 */

const NAV = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/hacienda', label: 'Hacienda', icon: Beef, end: false },
  { to: '/campos', label: 'Campos', icon: MapIcon, end: false },
  { to: '/analitica', label: 'Plata', icon: BarChart3, end: false },
  { to: '/agenda', label: 'Agenda', icon: CalendarClock, end: false },
]

export function AppShell() {
  useMedirPuestaAPunto()
  const isMobile = useIsMobile()
  const { signOut } = useAuth()
  const { data: membresia } = useEmpresa()

  /* Una sola consulta compartida con el Inicio (misma queryKey): el contador y la
   * cabecera "Hoy" no pueden decir números distintos. */
  const hoy = useCuantasHoy()
  // Recién llegó del onboarding: la barra ya se formó en su lugar (ver
  // `HaciaLaBarra`), así que aparece al instante; lo de adentro, el
  // encabezado y el contenido entran con un fundido escalonado.
  const location = useLocation()
  const quieto = useReducedMotion()
  const [bienvenida] = useState(
    () => !quieto && !!(location.state as { bienvenida?: boolean } | null)?.bienvenida,
  )
  const contenido = useRef<HTMLDivElement>(null)
  const contenidoListo = useEntradaDeTarjetas(bienvenida, contenido)
  const entra = (demora: number) =>
    bienvenida
      ? {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          // La misma curva y duración que la barra (ver `HaciaLaBarra`).
          transition: { duration: 0.62, delay: demora, ease: [0.65, 0, 0.35, 1] as const },
        }
      : {}

  // Precarga los chunks de las secciones en reposo → navegar entre Hacienda/
  // Campos/Analítica/Agenda es instantáneo (sin flash de "Cargando…").
  useEffect(() => prefetchEnReposo(Object.values(CHUNKS_OFICINA)), [])
  return (
    <div className="flex h-full overflow-hidden bg-fondo">
      {/* ===== Barra lateral (página 35, «Barra lateral · Oficina») ===== */}
      <motion.div className="flex h-full" {...entra(0.05)}>
        <BarraLateral hoy={hoy} />
      </motion.div>

      {/* ===== Columna principal ===== */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <motion.header {...entra(0.15)} className="flex h-14 shrink-0 items-center gap-4 border-b border-borde bg-fondo px-4 text-texto sm:px-10">
          <div className="hidden shrink-0 text-[14px] font-semibold text-texto sm:block">
            {fechaHoy()}
          </div>

          {isMobile && (
            <OficinaMobileMenu
              empresaNombre={membresia?.empresa?.nombre ?? MARCA}
              onSignOut={signOut}
            />
          )}
          <Ticker />
        </motion.header>

        {/* Sólo el contenido scrollea. El padding inferior deja aire para la
            burbuja flotante del Asistente (no tapa la última card). */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div
            ref={contenido}
            className="w-full px-4 pb-12 pt-7 sm:px-10 sm:pt-8"
            style={bienvenida && !contenidoListo ? { opacity: 0 } : undefined}
          >
            <Suspense
              fallback={
                <div className="text-sm text-muted-foreground">Cargando…</div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      {/* El asistente enseña haciendo (TASK-063): la misión en curso pegada al
          botón real y un puntito por panel la primera vez. La invitación y la
          lista «Tu campo, en marcha» se reemplazaron por el Inicio «Antes del
          mapa» de Tropero, que muestra los mismos pasos en un solo lugar. */}
      <Mision />
      <Spots />

      {/* Panel del Asistente (preguntas + WhatsApp): se abre desde la barra lateral. */}
      <AsistentePanel />
    </div>
  )
}

/** La Oficina es una opción explícita en teléfono; su menú no ocupa el ancho del contenido. */
function OficinaMobileMenu({ empresaNombre, onSignOut }: {
  empresaNombre: string
  onSignOut: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const mapaPendiente = useMapaPendiente()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="Abrir menú de Oficina"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sidebar-foreground hover:bg-sidebar-accent"
      >
        <Menu className="size-5" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Modo Oficina</DialogTitle>
        <DialogDescription>{empresaNombre}</DialogDescription>
        <nav aria-label="Secciones de Oficina" className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => {
            const bloqueada = mapaPendiente && !abiertoSinMapa(to)
            return (
            <NavLink
              key={to}
              to={bloqueada ? '/mapa' : to}
              state={bloqueada ? { bloqueada: seccionBloqueada(to) } : undefined}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) => cn(
                'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold',
                isActive ? 'bg-secondary text-principal' : 'text-ink hover:bg-secondary',
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
              {bloqueada && <Lock aria-label="Se abre al terminar el mapa" className="ml-auto size-4 text-texto-suave" />}
            </NavLink>
            )
          })}
        </nav>
        <button
          type="button"
          onClick={() => { setOpen(false); void onSignOut() }}
          className="flex items-center gap-3 border-t border-border px-3 pt-3 text-sm text-texto-suave"
        >
          <LogOut className="size-5" aria-hidden="true" />
          Cerrar sesión
        </button>
      </DialogContent>
    </Dialog>
  )
}

/** La curva y la duración de la barra que se forma al salir del onboarding. */
const CURVA_BARRA = 'cubic-bezier(0.65, 0, 0.35, 1)'
const DURACION_BARRA = 620

/**
 * La página, al llegar del onboarding, entra con la misma fluidez que la
 * barra lateral: bloque por bloque (título, tarjetas, secciones), de arriba
 * abajo, con su curva. Nada aparece de golpe mientras lo otro se funde.
 *
 * Antes el contenedor hacía su fundido VACÍO y las tarjetas aparecían de
 * golpe después, cuando llegaban sus datos (1,28 s, 1,37 s, 1,54 s). Ahora la
 * página espera lista —datos cargados y el contenido quieto, hasta 1,8 s—
 * y recién ahí entra cada tarjeta. Las que llegan más tarde entran igual.
 * Genérico: no depende de cómo esté armada cada página.
 */
function useEntradaDeTarjetas(activo: boolean, raiz: RefObject<HTMLDivElement | null>): boolean {
  const qc = useQueryClient()
  const [listo, setListo] = useState(!activo)
  useEffect(() => {
    if (!activo) return
    const t0 = performance.now()
    let anterior = -1
    let quietos = 0
    const vistas = new WeakSet<Element>()
    let orden = 0
    const animar = (tarjetas: Element[]) => {
      for (const el of tarjetas) {
        if (vistas.has(el)) continue
        vistas.add(el)
        const i = Math.min(orden++, 8)
        ;(el as HTMLElement).animate(
          [
            { opacity: 0, transform: 'translateY(14px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: DURACION_BARRA, delay: i * 70, easing: CURVA_BARRA, fill: 'backwards' },
        )
      }
    }
    // Los BLOQUES de la página, en orden: títulos, tarjetas, secciones.
    // Se baja mientras haya un solo hijo (envoltorios) y se toman los hijos
    // de ahí: así entra todo lo que se ve, no sólo lo que parece tarjeta.
    const tarjetas = (): Element[] => {
      let nivel: Element | null | undefined = raiz.current?.firstElementChild
      while (nivel && nivel.children.length === 1) nivel = nivel.firstElementChild
      if (!nivel) return []
      return [...nivel.children].filter((e) => e.getBoundingClientRect().height > 8)
    }
    let mo: MutationObserver | null = null
    let primeraTarjeta = 0
    const intervalo = window.setInterval(() => {
      const n = tarjetas().length
      if (n > 0 && !primeraTarjeta) primeraTarjeta = performance.now()
      // Quietas y con los datos cargados; datos secundarios (el clima) no
      // hacen esperar más de 250 ms desde que aparece la primera tarjeta.
      const datos = qc.isFetching() === 0 || performance.now() - primeraTarjeta > 250
      quietos = n > 0 && n === anterior && datos ? quietos + 1 : 0
      anterior = n
      if (quietos >= 2 || performance.now() - t0 > 1800) {
        window.clearInterval(intervalo)
        animar(tarjetas())
        setListo(true)
        // Lo que aparece en el siguiente segundo y medio entra igual.
        mo = new MutationObserver(() => animar(tarjetas()))
        if (raiz.current) mo.observe(raiz.current, { childList: true, subtree: true })
        window.setTimeout(() => mo?.disconnect(), 1500)
      }
    }, 60)
    return () => {
      window.clearInterval(intervalo)
      mo?.disconnect()
    }
  }, [activo, qc, raiz])
  return listo
}
