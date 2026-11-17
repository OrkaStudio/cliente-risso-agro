import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { useMapaPendiente } from '@/features/mapa/bloqueo'
import { Leaf, LogOut } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { AvisoEstadoCampo, ChipEstadoCampo } from '@/features/campo/estado-campo'
import { useSeedOffline } from '@/features/campo/use-seed-offline'
import { prefetch, prefetchEnReposo, CHUNKS_CAMPO } from '@/lib/prefetch'
import { MARCA } from '@/lib/marca'
import { WHATSAPP_TROPERO } from '@/features/acceso/reglas'
import { AsistentePanel } from '@/features/guia/asistente-panel'
import { cn } from '@/lib/utils'
import '@/features/campo/campo.css'
import { entraEnCelular, nivelDe } from '@/features/empresa/secciones'
import { useEmpresa } from '@/features/empresa/use-empresa'

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
  // La Recorrida sale de la barra (Lau, 17/11): lo que se ve en el campo se manda por audio.
  // La Manga vuelve después del lanzamiento (Lau, 16/11: sin bastón todavía).
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
  const { data: membresia } = useEmpresa()
  // Precarga los chunks de las secciones en reposo → el salto a Recorrida/
  // Manga/Plata/Historial es instantáneo (sin flash de "Cargando…").
  useEffect(() => prefetchEnReposo(Object.values(CHUNKS_CAMPO)), [])

  // Una sola instancia de la preparación offline para todo el Modo Campo. El
  // chip del header y el cajón de detalle son dos vistas del mismo estado, así
  // que vive acá y no adentro de ninguno de los dos.
  const seed = useSeedOffline()
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  // Hoy y Plata traen su propia cabecera (la marca, el campo y la cuenta).
  const ruta = useLocation().pathname
  const enHoy = ruta === '/campo' || ruta.startsWith('/campo/plata')
  const mapaPendiente = useMapaPendiente()
  // Sólo lo que puede cargar (permisos, 13/11): Hoy lo tienen todos.
  // Mandar un audio: quien carga algo de los campos o la plata (lo demás no se carga por WhatsApp).
  const manda = (sec: 'campos' | 'plata') => ['carga', 'solo_manda'].includes(nivelDe(membresia, sec))
  const puedeMandar = manda('campos') || manda('plata')
  const navegables = NAV.filter(({ to }) => { return entraEnCelular(membresia, to) })

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
      {/* Con una sola sección (el que sólo mira Hoy), la barra no tiene a dónde llevar: no va. */}
      {/* El asistente acompaña todo el celular (Lau, 16/11). */}
      <AsistentePanel celular />
      {(navegables.length > 1 || puedeMandar) && (
      <nav aria-label="Modo Campo" className="shrink-0 bg-fondo px-[18px] pt-2 pb-[max(14px,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between rounded-full bg-superficie p-1.5 shadow-[0_8px_28px_rgba(19,27,22,0.18)]">
          {/* Sólo lo que puede cargar (permisos, 13/11): Hoy lo tienen todos. */}
          {(() => {
            const links = navegables.map(({ to, label, icono, end }) => {
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
            })
            // El audio a Troppero, a la derecha del todo con el logo de WhatsApp (Lau, 17/11).
            if (puedeMandar) links.push(
                <button
                  key="audio"
                  type="button"
                  onClick={() => window.open(`https://wa.me/${WHATSAPP_TROPERO}`, '_blank', 'noopener')}
                  aria-label="Mandale un audio a Troppero"
                  className="flex h-[62px] flex-1 flex-col items-center justify-center gap-1 text-[12px] font-semibold text-texto"
                >
                  <span className="grid size-10 place-items-center rounded-full bg-[#25d366] text-white shadow-[0_4px_12px_rgba(37,211,102,0.35)]">
                    <LogoWhatsapp />
                  </span>
                  Audio
                </button>
            )
            return links
          })()}
        </div>
      </nav>
      )}
    </div>
  )
}

/** El logo de WhatsApp, en blanco sobre su verde. */
function LogoWhatsapp() {
  return (
    <svg viewBox="0 0 24 24" className="size-[22px]" aria-hidden fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.13.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.16-.48-.29Z" />
    </svg>
  )
}
