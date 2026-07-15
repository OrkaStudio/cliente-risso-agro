import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Banknote, ClipboardList, Leaf, LogOut, Footprints, Syringe } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { MARCA } from '@/lib/marca'
import { cn } from '@/lib/utils'
import '@/features/campo/campo.css'

/**
 * Shell del Modo Campo (móvil). Layout sobrio, pensado para el teléfono en la
 * manga/recorrida: header compacto + contenido scrolleable + nav inferior con
 * pulgar. El móvil ve SOLO campo: los 3 modos de captura viven en la nav de
 * abajo (pulgar) y el Historial (revisar/doble check) va en el header.
 */

const NAV = [
  { to: '/campo/manga', label: 'Manga', icon: Syringe, soon: false },
  { to: '/campo/recorrida', label: 'Recorrida', icon: Footprints, soon: false },
  { to: '/campo/plata', label: 'Plata', icon: Banknote, soon: false },
] as const

export function CampoShell() {
  const { signOut } = useAuth()

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
        <button
          type="button"
          onClick={() => void signOut()}
          title="Salir"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/55 transition-colors hover:bg-white/[0.07] hover:text-white"
        >
          <LogOut className="size-[17px]" />
        </button>
      </header>

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
        {NAV.map(({ to, label, icon: Icon, soon }) =>
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
