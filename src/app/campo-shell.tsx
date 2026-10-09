import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { useMapaPendiente } from '@/features/mapa/bloqueo'
import { ClipboardList, Leaf, LogOut } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { AvisoEstadoCampo, ChipEstadoCampo } from '@/features/campo/estado-campo'
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
const NAV: { to: string; label: string; icono: NombreIcono; end: boolean }[] = [
  { to: '/campo', label: 'Hoy', icono: 'Inicio', end: true },
  { to: '/campo/recorrida', label: 'Recorrida', icono: 'Recorrida', end: false },
  { to: '/campo/manga', label: 'Manga', icono: 'Manga', end: false },
  { to: '/campo/plata', label: 'Plata', icono: 'Plata', end: false },
]

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
          : 'min-w-11 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground',
      )}
    >
      <LogOut className="size-[17px]" />
      {armado && '¿Cerrar sesión?'}
    </button>
  )
}

export function CampoShell() {
  // Precarga los chunks de las secciones en reposo → el salto a Recorrida/
  // Manga/Plata/Historial es instantáneo (sin flash de "Cargando…").
  useEffect(() => prefetchEnReposo(Object.values(CHUNKS_CAMPO)), [])

  // Una sola instancia de la preparación offline para todo el Modo Campo. El
  // chip del header y el cajón de detalle son dos vistas del mismo estado, así
  // que vive acá y no adentro de ninguno de los dos.
  const seed = useSeedOffline()
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  // Hoy trae su propia cabecera (la foto, el campo y la cuenta).
  const enHoy = useLocation().pathname === '/campo'
  const mapaPendiente = useMapaPendiente()

  return (
    <div className="campo relative flex h-full flex-col overflow-hidden">
      {/* Header — placa de máquina */}
      {!enHoy && (
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--c-line)] bg-sidebar px-3 py-2.5 text-sidebar-foreground">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary">
          <Leaf className="size-[18px] text-[var(--principal-texto)]" strokeWidth={2} />
        </div>
        {/* Sólo el nombre. "Modo Campo" lo dice la nav de abajo con más fuerza
            que un subtítulo, y a 390px —con el zoom 1.06 encima— esa segunda
            línea le comía el ancho al nombre hasta dejarlo en "Riss…". */}
        <div className="min-w-0 flex-1">
          <span className="c-display block truncate text-[16px] leading-none text-sidebar-foreground">
            {MARCA}
          </span>
        </div>
        <ChipEstadoCampo
          estado={seed.estado}
          lastOk={seed.lastOk}
          online={seed.online}
          abierto={detalleAbierto}
          onToggle={() => setDetalleAbierto((v) => !v)}
        />
        <NavLink
          to="/campo/historial"
          onPointerDown={() => prefetch(CHUNKS_CAMPO['/campo/historial'])}
          className={({ isActive }) =>
            cn(
              'flex h-11 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-semibold transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-foreground'
                : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground',
            )
          }
        >
          <ClipboardList className="size-[17px]" />
          Historial
        </NavLink>
        <SalirDeLaCuenta />
      </header>
      )}

      {/* Sólo lo que pide atención se lleva una franja del alto; el estado
          "listo" vive como punto en el header. Acá baja además su detalle. */}
      <AvisoEstadoCampo
        estado={seed.estado}
        lastOk={seed.lastOk}
        detalle={seed.detalle}
        online={seed.online}
        sembrar={() => void seed.sembrar()}
        abierto={detalleAbierto}
      />

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

      {/* Nav inferior (página 35): una píldora flotante; la sección activa, en
          un círculo terracota. Sin el mapa, sólo Hoy: lo demás necesita el campo. */}
      {/* En flujo (no flotando encima): así no tapa los pies fijos de la recorrida y la manga. */}
      <nav aria-label="Modo Campo" className="shrink-0 bg-fondo px-[18px] pt-2 pb-[max(14px,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between rounded-full bg-superficie p-1.5 shadow-[0_8px_28px_rgba(19,27,22,0.18)]">
          {NAV.map(({ to, label, icono, end }) => {
            const cerrada = mapaPendiente && to !== '/campo'
            return (
              <NavLink
                key={to}
                to={cerrada ? '/campo' : to}
                end={end}
                aria-disabled={cerrada || undefined}
                onPointerDown={() => {
                  const t = CHUNKS_CAMPO[to]
                  if (t) prefetch(t)
                }}
                className={({ isActive }) =>
                  cn(
                    'flex h-[62px] flex-1 flex-col items-center justify-center gap-1 rounded-full text-[12px] font-semibold transition-colors',
                    isActive && !cerrada ? 'bg-principal text-principal-texto' : cerrada ? 'text-texto-suave/40' : 'text-texto-suave',
                  )
                }
              >
                <Icono nombre={icono} />
                {label}
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
