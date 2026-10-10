import { NavLink } from 'react-router-dom'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { Logo } from '@/components/tropero/logo'
import { useAuth } from '@/features/auth/auth-context'
import { colorDeCampo } from '@/features/campos/use-campo-mapa'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { abrirPanel } from '@/features/guia/guia-store'
import { useMapa } from '@/features/mapa/api'
import { abiertoSinMapa, seccionBloqueada, useMapaPendiente } from '@/features/mapa/bloqueo'
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
 * La barra lateral de la Oficina: las secciones, tus campos con sus cabezas,
 * el paso al Modo Campo y el asistente. Hasta terminar el mapa, lo que no se
 * abrió va en gris con candado y lleva al tutorial, que dice por qué.
 */
export function BarraLateral({ hoy }: { hoy: number }) {
  const { user, signOut } = useAuth()
  const { data: membresia } = useEmpresa()
  const pendiente = useMapaPendiente()
  const { data: campos } = useMapa(membresia?.empresa_id)
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
              to={bloqueada ? '/mapa' : s.to}
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
            <p className="shrink-0 px-3 pt-7 pb-2 text-[12px] font-semibold tracking-[0.04em] text-texto-suave">Tus campos</p>
            {campos.map((c) => {
              const color = colorDeCampo(c.colorIdx ?? 0)
              const cab = c.potreros.reduce((s, p) => s + p.cabezas, 0)
              return (
                <NavLink
                  key={c.id}
                  to={pendiente ? `/mapa/${c.id}` : '/campos'}
                  className="flex h-10 shrink-0 items-center gap-3 rounded-[12px] px-3 text-[15px] text-texto hover:bg-superficie-hundida/70"
                >
                  <span className="grid size-[22px] shrink-0 place-items-center rounded-[6px] text-[11px] font-extrabold text-white" style={{ background: color.hex }}>
                    {color.letra}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                  <span className="cifra shrink-0 text-[12.5px] text-texto-suave">{cab} cab</span>
                </NavLink>
              )
            })}
          </>
        )}
      </nav>

      <div className="flex flex-col gap-2 px-3 pt-4">
        <NavLink
          to={pendiente ? '/mapa' : '/campo'}
          state={pendiente ? { bloqueada: 'El Modo Campo' } : undefined}
          className={cn(
            'flex h-12 items-center justify-center gap-2.5 rounded-[14px] border-[1.5px] text-[15px] font-semibold transition-colors',
            pendiente ? 'border-principal/35 text-principal/50' : 'border-principal text-principal hover:bg-principal-suave',
          )}
        >
          <Icono nombre="Celular" />
          Pasar al Modo Campo
        </NavLink>
        <button
          type="button"
          onClick={abrirPanel}
          className="flex h-11 items-center justify-center gap-2.5 rounded-[14px] text-[15px] font-semibold text-principal hover:bg-principal-suave"
        >
          <Icono nombre="Asistente" />
          Preguntale al asistente
        </button>
      </div>

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
