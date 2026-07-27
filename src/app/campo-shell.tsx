import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Banknote,
  Check,
  ClipboardList,
  CloudOff,
  Home,
  Leaf,
  LoaderCircle,
  LogOut,
  Footprints,
  RotateCw,
  Syringe,
} from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { useSeedOffline } from '@/features/campo/use-seed-offline'
import { prefetch, prefetchEnReposo, CHUNKS_CAMPO } from '@/lib/prefetch'
import { MARCA } from '@/lib/marca'
import { cn } from '@/lib/utils'
import '@/features/campo/campo.css'

/**
 * Shell del Modo Campo (móvil). Layout sobrio, pensado para el teléfono en la
 * manga/recorrida: header compacto + contenido scrolleable + nav inferior con
 * pulgar. El móvil ve SOLO campo: los 3 modos de captura viven en la nav de
 * abajo (pulgar) y el Historial (revisar/doble check) va en el header.
 */

// Inicio es el HUB: desde ahí el productor se reparte a las secciones y siempre
// puede volver. `end` = activo SOLO en /campo exacto (no en las sub-rutas).
const NAV = [
  { to: '/campo', label: 'Inicio', icon: Home, soon: false, end: true },
  { to: '/campo/recorrida', label: 'Recorrida', icon: Footprints, soon: false, end: false },
  { to: '/campo/manga', label: 'Manga', icon: Syringe, soon: false, end: false },
  { to: '/campo/plata', label: 'Plata', icon: Banknote, soon: false, end: false },
] as const

/**
 * Cerrar sesión con confirmación de dos toques — el mismo patrón que ya usa
 * "salir" de la recorrida. Antes era un botón de 32px, sin confirmación,
 * pegado al del croquis en la esquina superior derecha: el productor iba a
 * buscar el croquis para ubicarse y se deslogueaba. Prod juntó 9 recorridas
 * con cero observaciones con esa firma exacta. Target a 44px y armado.
 */
function SalirDeLaCuenta() {
  const { signOut } = useAuth()
  const [armado, setArmado] = useState(false)

  return (
    <button
      type="button"
      onClick={() => {
        if (!armado) {
          setArmado(true)
          setTimeout(() => setArmado(false), 3500)
          return
        }
        void signOut()
      }}
      title="Cerrar sesión"
      aria-label="Cerrar sesión"
      className={cn(
        'flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors',
        armado
          ? 'bg-[var(--c-warn)] text-[#1c1400]'
          : 'min-w-11 text-sidebar-foreground/55 hover:bg-white/[0.07] hover:text-white',
      )}
    >
      <LogOut className="size-[17px]" />
      {armado && '¿Cerrar sesión?'}
    </button>
  )
}

/**
 * Barra de "listo para el campo": baja TODO el cache offline apenas hay señal
 * (login/apertura) y le dice al productor que ya puede irse sin datos. Se
 * autooculta cuando todo está bien; aparece para preparar, avisar que falta
 * conectar, o si algo falló. Convierte el requisito invisible del seeding en
 * un estado que se ve y en el que se confía.
 */
function BarraSeed() {
  const { estado, lastOk, online, sembrar } = useSeedOffline()
  // Al TRANSICIONAR a 'listo' se muestra el ✓ un rato y se oculta (no molestar).
  // El disparo es ajuste de estado durante el render (patrón "state from props");
  // el ocultado va por timer. `okNonce` reinicia el timer si vuelve a 'listo'.
  const [mostrarOk, setMostrarOk] = useState(false)
  const [okNonce, setOkNonce] = useState(0)
  const [prevEstado, setPrevEstado] = useState(estado)
  if (prevEstado !== estado) {
    setPrevEstado(estado)
    if (estado === 'listo') {
      setMostrarOk(true)
      setOkNonce((n) => n + 1)
    }
  }
  useEffect(() => {
    if (!mostrarOk) return
    const t = setTimeout(() => setMostrarOk(false), 4500)
    return () => clearTimeout(t)
  }, [mostrarOk, okNonce])

  const faltaConectar = !online && lastOk == null

  let tono: 'ok' | 'info' | 'warn' | null = null
  let Icon = Check
  let texto = ''
  let reintentar = false
  if (estado === 'sembrando') {
    tono = 'info'
    Icon = LoaderCircle
    texto = 'Preparando para el campo…'
  } else if (estado === 'error') {
    tono = 'warn'
    Icon = CloudOff
    texto = 'No se pudo preparar del todo'
    reintentar = true
  } else if (faltaConectar) {
    tono = 'warn'
    Icon = CloudOff
    texto = 'Conectate un momento para preparar el campo'
  } else if (mostrarOk) {
    tono = 'ok'
    Icon = Check
    texto = 'Listo para usar sin señal'
  }
  if (!tono) return null

  const clasesTono =
    tono === 'ok'
      ? 'bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]'
      : tono === 'warn'
        ? 'bg-[var(--c-warn-soft)] text-[var(--c-warn-deep)]'
        : 'bg-[var(--c-sunk)] text-[var(--c-ink-soft)]'

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 px-4 py-2 text-[13px] font-semibold',
        clasesTono,
      )}
    >
      <Icon
        className={cn('size-4 shrink-0', estado === 'sembrando' && 'animate-spin')}
        strokeWidth={2.4}
      />
      <span className="min-w-0 flex-1 truncate">{texto}</span>
      {reintentar && (
        <button
          type="button"
          onClick={() => void sembrar()}
          className="flex shrink-0 items-center gap-1 rounded-full border border-current/30 px-2.5 py-1 text-[12px]"
        >
          <RotateCw className="size-3.5" strokeWidth={2.4} />
          Reintentar
        </button>
      )}
    </div>
  )
}

export function CampoShell() {
  // Precarga los chunks de las secciones en reposo → el salto a Recorrida/
  // Manga/Plata/Historial es instantáneo (sin flash de "Cargando…").
  useEffect(() => prefetchEnReposo(Object.values(CHUNKS_CAMPO)), [])

  return (
    <div className="campo flex h-full flex-col overflow-hidden">
      {/* Header — placa de máquina */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--c-line)] bg-sidebar px-4 py-2.5 text-sidebar-foreground">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-primary">
          <Leaf className="size-5 text-white" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="c-display truncate text-[16px] text-white">
            {MARCA}
          </div>
          <div className="c-label truncate !text-sidebar-foreground/60">
            Modo Campo
          </div>
        </div>
        <NavLink
          to="/campo/historial"
          onPointerDown={() => prefetch(CHUNKS_CAMPO['/campo/historial'])}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors',
              isActive
                ? 'bg-white/[0.12] text-white'
                : 'text-sidebar-foreground/60 hover:bg-white/[0.07] hover:text-white',
            )
          }
        >
          <ClipboardList className="size-[17px]" />
          Historial
        </NavLink>
        <SalirDeLaCuenta />
      </header>

      {/* Preparación offline: baja todo apenas hay señal + estado visible. */}
      <BarraSeed />

      {/* Contenido — caja acotada (min-h-0 para que el flex hijo pueda encoger).
          Cada página se estructura como app: header fijo + región scrolleable
          interna + footer fijo. main NO scrollea; scrollea la región interna.
          `relative`: las hojas (CSheet) se posicionan contra esta caja. */}
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="c-label p-6 !text-[13px]">Cargando…</div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      {/* Nav inferior (pulgar) — bloques de tablero, el activo se llena */}
      <nav className="flex shrink-0 items-stretch gap-1.5 border-t border-[var(--c-line)] bg-[var(--c-sunk)] p-1.5">
        {NAV.map(({ to, label, icon: Icon, soon, end }) =>
          soon ? (
            <div
              key={to}
              className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-2 text-[var(--c-faint)]"
              title="Próximamente"
            >
              <Icon className="size-[22px]" strokeWidth={1.75} />
              <span className="c-label !text-[10px] !text-[var(--c-faint)]">{label}</span>
            </div>
          ) : (
            <NavLink
              key={to}
              to={to}
              end={end}
              onPointerDown={() => {
                const t = CHUNKS_CAMPO[to]
                if (t) prefetch(t)
              }}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-1 rounded-xl py-2 transition-colors',
                  isActive
                    ? 'bg-[var(--c-ok-soft)] text-[var(--c-ok-deep)]'
                    : 'text-[var(--c-ink-soft)]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="size-[22px]" strokeWidth={2} />
                  <span
                    className={cn(
                      'c-label !text-[10.5px]',
                      isActive
                        ? '!text-[var(--c-ok-deep)]'
                        : '!text-[var(--c-faint)]',
                    )}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ),
        )}
      </nav>
    </div>
  )
}
