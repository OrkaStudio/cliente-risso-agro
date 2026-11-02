import { NavLink, useNavigate } from 'react-router-dom'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { Logo } from '@/components/tropero/logo'
import { useAuth } from '@/features/auth/auth-context'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { colorDeCampo } from '@/features/campos/use-campo-mapa'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { useMapa } from '@/features/mapa/api'
import { abiertoSinMapa, primerPendiente, seccionBloqueada, useMapaPendiente } from '@/features/mapa/bloqueo'
import { prefetch, CHUNKS_OFICINA } from '@/lib/prefetch'
import { cn } from '@/lib/utils'

/** Las secciones de la Oficina (página 35, «Barra lateral · Oficina»). */
const SECCIONES: { to: string; texto: string; icono: NombreIcono; end: boolean }[] = [
  { to: '/', texto: 'Inicio', icono: 'Inicio', end: true },
  { to: '/hacienda', texto: 'Hacienda', icono: 'Hacienda', end: false },
  { to: '/campos', texto: 'Campos', icono: 'Campos', end: false },
  { to: '/analitica', texto: 'Plata', icono: 'Plata', end: false },
  { to: '/agenda', texto: 'Agenda', icono: 'Agenda', end: false },
]

/**
 * La barra lateral de la Oficina: las secciones y tus campos con sus cabezas.
 * «Tus campos» es el único selector de campo de la app: lo elegido filtra todas
 * las pantallas y se queda en la que estás (Lau, 29/10).
 * El asistente vive abajo a la derecha (asistente-panel). El Modo Campo no se abre desde la compu: es del celular, en
 * el potrero (ver `ResponsiveShell`). Hasta terminar el mapa, lo que no se
 * abrió va en gris con candado y lleva al tutorial, que dice por qué.
 */
export function BarraLateral({ hoy }: { hoy: number }) {
  const { user, signOut } = useAuth()
  const { data: membresia } = useEmpresa()
  const pendiente = useMapaPendiente()
  const { data: campos } = useMapa(membresia?.empresa_id)
  const { elegido, elegir } = useCampoElegido()
  const navigate = useNavigate()
  const contacto = user?.email || user?.phone || ''

  return (
    <aside className="hidden h-full w-[256px] shrink-0 flex-col border-r border-borde bg-fondo md:flex">
      <div className="px-6 pt-6 pb-7">
        <Logo alto={30} />
      </div>

      <nav aria-label="Oficina" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3">
        <p className="shrink-0 px-3 pb-2 text-[12px] font-semibold tracking-[0.04em] text-texto-suave">Oficina</p>
        {SECCIONES.map((s) => {
          const bloqueada = pendiente && !abiertoSinMapa(s.to)
          return (
            <NavLink
              key={s.to}
              to={bloqueada ? '/campos' : s.to}
              state={bloqueada ? { bloqueada: seccionBloqueada(s.to) } : undefined}
              end={s.end}
              onMouseEnter={() => {
                const t = CHUNKS_OFICINA[s.to]
                if (t) prefetch(t)
              }}
              className={({ isActive }) =>
                cn(
                  'relative flex h-11 shrink-0 items-center gap-3 rounded-[12px] px-3 text-[15px] transition-colors',
                  isActive && !bloqueada
                    ? 'font-bold text-texto'
                    : bloqueada
                      ? 'text-texto-suave/60 hover:bg-superficie-hundida/60'
                      : 'font-medium text-texto hover:bg-superficie-hundida/70',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && !bloqueada && <span aria-hidden className="absolute inset-y-2 -left-3 w-[3px] rounded-full bg-principal" />}
                  <span className={cn(isActive && !bloqueada ? 'text-principal' : bloqueada ? 'opacity-60' : 'text-texto')}>
                    <Icono nombre={s.icono} />
                  </span>
                  {s.texto}
                  {bloqueada && (
                    <span className="ml-auto opacity-60" aria-label="Se abre al terminar el mapa">
                      <Icono nombre="Candado" tamano={16} />
                    </span>
                  )}
                  {s.to === '/' && hoy > 0 && (
                    <span aria-label={`${hoy} para hoy`} className="ml-auto grid size-[22px] place-items-center rounded-full bg-principal text-[12px] font-bold text-principal-texto">
                      {hoy}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )
        })}

        {!!campos?.length && (
          <>
            <p className="shrink-0 px-3 pt-7 pb-2 text-[12px] font-semibold tracking-[0.04em] text-texto-suave">
              Tus campos
            </p>
            {/* El único lugar donde se elige el campo: filtra toda la app y te quedás donde estás. */}
            <div role="radiogroup" aria-label="Qué campo estás viendo" className="-mx-1 flex shrink-0 flex-col gap-0.5">
              {campos.length > 1 && (
                <OpcionCampo
                  activo={!elegido}
                  onClick={() => elegir(null)}
                  marca={
                    <span className="grid size-[22px] shrink-0 place-items-center rounded-[6px] bg-superficie-hundida text-texto">
                      <Icono nombre="Campos" tamano={16} />
                    </span>
                  }
                  nombre="Todos tus campos"
                  cabezas={campos.reduce((n, c) => n + c.potreros.reduce((s, p) => s + p.cabezas, 0), 0)}
                />
              )}
              {campos.map((c) => {
                const color = colorDeCampo(c.colorIdx ?? 0)
                return (
                  <OpcionCampo
                    key={c.id}
                    activo={elegido?.id === c.id}
                    onClick={() => {
                      elegir(c.id)
                      // Sin el mapa, el campo se arma en Campos: lleva a su tutorial.
                      if (pendiente) navigate('/campos')
                    }}
                    marca={
                      <span className="grid size-[22px] shrink-0 place-items-center rounded-[6px] text-[11px] font-extrabold text-white" style={{ background: color.hex }}>
                        {color.letra}
                      </span>
                    }
                    nombre={c.nombre}
                    cabezas={c.potreros.reduce((s, p) => s + p.cabezas, 0)}
                    falta={primerPendiente([c]) !== null}
                  />
                )
              })}
            </div>
          </>
        )}
      </nav>

      <div className="mx-3 mt-3 flex items-center gap-3 border-t border-borde px-2 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-principal font-heading text-[14px] font-extrabold text-principal-texto">
          {(membresia?.empresa?.nombre ?? 'T').charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[14px] font-bold text-texto">{membresia?.empresa?.nombre ?? '—'}</p>
          {contacto && <p className="truncate text-[12px] text-texto-suave">{contacto}</p>}
        </div>
        <button type="button" onClick={() => void signOut()} aria-label="Salir" className="grid size-9 place-items-center rounded-full text-texto-suave hover:bg-superficie-hundida">
          <Icono nombre="Salir" />
        </button>
      </div>
    </aside>
  )
}

/** Una fila de «Tus campos»: el elegido se ve claro, con fondo oscuro. */
function OpcionCampo({ activo, onClick, marca, nombre, cabezas, falta = false }: { activo: boolean; onClick: () => void; marca: React.ReactNode; nombre: string; cabezas: number; falta?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activo}
      onClick={onClick}
      className={cn(
        'flex min-h-10 shrink-0 items-center gap-2.5 rounded-[12px] px-2.5 py-1 text-left text-[15px] transition-colors',
        activo ? 'bg-tinta font-bold text-white' : 'text-texto hover:bg-superficie-hundida/70',
      )}
    >
      {marca}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{nombre}</span>
        {falta && <span className={cn('block text-[12px] font-bold', activo ? 'text-white/75' : 'text-principal')}>Falta el mapa</span>}
      </span>
      <span className={cn('cifra shrink-0 text-[12px]', activo ? 'text-white/70' : 'text-texto-suave')}>{cabezas} cab</span>
    </button>
  )
}
