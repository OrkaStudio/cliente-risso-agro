import { useState } from 'react'
import { Boton } from '@/components/tropero/boton'
import { useAccion } from '@/components/tropero/use-accion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Icono } from '@/components/tropero/icono'
import { Logo } from '@/components/tropero/logo'
import type { NombreIcono } from '@/components/tropero/iconos-svg'
import { useAuth } from '@/features/auth/auth-context'
import { ROLES, SECCIONES, esDueno, nombreRol, resumenNiveles, type Rol } from '@/features/empresa/secciones'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { nombreDe } from '@/features/guia/nombre-usuario'
import { linkWhatsapp } from '@/features/guia/whatsapp'
import { useAnimales } from '@/features/hacienda/hooks'
import { useMapa } from '@/features/mapa/api'
import { useMapaPendiente } from '@/features/mapa/bloqueo'
import { cn } from '@/lib/utils'
import { celularLindo, useBaja, useCambiarNombre, usePersonas, whatsappInvitacion, type Persona } from './api'
import { nombrePropio } from '@/lib/texto'
import { Baja } from './baja'
import { ListaAccesos } from './accesos'
import { PESTANAS, type Pestana } from './pestanas'
import { EditarPanel, InvitarPanel } from './personas-paneles'

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
const BOTON_CHICO = 'inline-flex h-10 items-center gap-1.5 rounded-full border-[1.5px] border-borde bg-superficie px-4 text-[14.5px] font-bold text-texto transition-colors hover:border-principal hover:text-principal'

/**
 * Configuración (Lau, 05/11), en pestañas, cada una armada para lo suyo:
 * Personas es una tabla de quién ve qué; Tu cuenta, tu ficha; Plan, el estado
 * y el uso. Quien no es dueño ve sólo su cuenta.
 */
export function ConfiguracionPage() {
  const { data: membresia } = useEmpresa()
  const dueno = esDueno(membresia)
  const [params, setParams] = useSearchParams()
  const pedida = params.get('tab') as Pestana | null
  const tab: Pestana = !dueno ? 'cuenta' : pedida && PESTANAS.some((p) => p.id === pedida) ? pedida : 'personas'
  const elegir = (t: Pestana) => setParams({ tab: t }, { replace: true })

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-7">
      <header>
        <h1 className="t-pagina text-texto">Configuración</h1>
        <p className="mt-3 text-[17px] text-texto-suave">{dueno ? `Quién entra a ${membresia?.empresa?.nombre ?? 'tu campo'} y qué ve, tu cuenta y tu plan.` : 'Tu nombre y tu número.'}</p>
      </header>

      {dueno && (
        <div role="tablist" aria-label="Configuración" className="grid gap-2 sm:grid-cols-3">
          {PESTANAS.map((p) => {
            const si = tab === p.id
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={si}
                onClick={() => elegir(p.id)}
                className={cn('flex items-center gap-3.5 rounded-[18px] border-[1.5px] px-4 py-3.5 text-left transition-colors', si ? 'border-principal bg-principal-suave text-texto shadow-[0_8px_22px_-14px_rgba(184,92,46,0.6)]' : 'border-borde bg-superficie text-texto hover:border-principal/50')}
              >
                <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', si ? 'bg-principal text-principal-texto' : 'bg-superficie-hundida text-texto')}>
                  <Icono nombre={p.icono} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[16.5px] font-bold">{p.texto}</span>
                  <span className={cn('block truncate text-[14px]', si ? 'text-acento-texto' : 'text-texto-suave')}>{p.para}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div role={dueno ? 'tabpanel' : undefined} aria-label={PESTANAS.find((p) => p.id === tab)!.texto}>
        {tab === 'personas' && <Personas empresa={membresia?.empresa?.nombre ?? ''} />}
        {tab === 'cuenta' && <TuCuenta empresa={membresia?.empresa?.nombre ?? ''} rol={membresia?.rol ?? ''} />}
        {tab === 'plan' && <Plan />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Personas: quién ve qué, de un vistazo

export function Personas({ empresa }: { empresa: string }) {
  const personas = usePersonas(true)
  const [invitar, setInvitar] = useState<{ vez: number; rol?: Rol } | null>(null)
  const [vez, setVez] = useState(0)
  const [editar, setEditar] = useState<Persona | null>(null)
  const lista = personas.data ?? []
  const adentro = lista.filter((p) => p.userId)
  const invitados = lista.filter((p) => p.invitacionId)
  // Primero el mapa (Lau, 16/11): sin el campo y sus potreros dibujados no se suma gente; se va a terminarlo.
  const sinMapa = useMapaPendiente()
  const irAlMapa = useNavigate()
  const abrir = (rol?: Rol) => (sinMapa ? irAlMapa('/campos') : (setVez((v) => v + 1), setInvitar({ vez: vez + 1, rol })))

  if (personas.isLoading) return <div className="h-64 animate-pulse rounded-[24px] bg-superficie-hundida" aria-busy />
  if (personas.error) return <p className="text-texto-suave">No pudimos cargar las personas. Revisá la conexión y probá de nuevo.</p>

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <p className="text-[15px] text-texto sm:text-[17px]">
          <b className="t-cifra">{adentro.length}</b> {adentro.length === 1 ? 'persona entra' : 'personas entran'} a tu campo
          {invitados.length > 0 && (
            <span className="text-texto-suave">
              {' '}
              · {invitados.length} {invitados.length === 1 ? 'invitación esperando' : 'invitaciones esperando'}
            </span>
          )}
        </p>
        <button type="button" onClick={() => abrir()} className="inline-flex h-11 items-center gap-2.5 rounded-full bg-principal py-1 pr-1 pl-4 text-[14.5px] font-bold text-principal-texto hover:bg-terracota-600 sm:h-12 sm:gap-3 sm:pl-5 sm:text-[15.5px]">
          {sinMapa ? 'Terminar el mapa' : 'Invitar a alguien'}
          <span className="grid size-9 place-items-center rounded-full bg-acento text-acento-texto sm:size-10">
            <Icono nombre={sinMapa ? 'Campos' : 'Agregar'} tamano={16} />
          </span>
        </button>
      </div>
      {sinMapa && (
        <p className="-mt-2 rounded-[16px] bg-estado-atencion-suave px-4 py-3 text-[15px] text-texto">
          Para sumar a tu gente, primero terminá el mapa: el borde de tus campos y sus potreros. Así, el que entra ve el campo como es.
        </p>
      )}

      {/* Quién ve qué: tocar a alguien abre su ficha y ahí se cambia (Lau, 19/11, opción A). */}
      <ListaAccesos personas={adentro} />

      {invitados.length > 0 && (
        <section aria-label="Invitaciones esperando" className="rounded-[20px] border border-dashed border-borde bg-superficie/60 px-3 py-1 sm:rounded-[24px] sm:px-5 sm:py-2">
          <p className="pt-2.5 pb-1 text-[12px] font-bold tracking-[0.04em] text-texto-suave uppercase sm:text-[13px]">Invitaciones esperando</p>
          <ul className="divide-y divide-borde/70">
            {invitados.map((p) => {
              const vencida = !!p.venceAt && new Date(p.venceAt) < new Date()
              return (
                <li key={p.invitacionId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:gap-4 sm:py-3.5">
                  <span className="grid size-8 shrink-0 sm:size-10 place-items-center rounded-full border-[1.5px] border-dashed border-borde font-heading text-[15px] font-extrabold text-texto-suave">{p.nombre.charAt(0).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold text-texto sm:text-[16px]">{p.nombre}</p>
                    <p className="truncate text-[12.5px] text-texto-suave sm:text-[14px]">
                      {nombreRol(p.rol)}{p.acceso === 'whatsapp' ? ' · por WhatsApp' : ''} · {resumenNiveles(p.niveles ?? {})}
                    </p>
                    <p className={cn('text-[12.5px] font-semibold sm:text-[14px]', vencida ? 'text-estado-problema-texto' : 'text-estado-atencion-texto')}>
                      {p.rechazada ? 'No aceptó la invitación' : vencida ? 'El link venció: cancelala e invitalo de nuevo' : `Invitado, todavía no entró${p.venceAt ? ` · el link vence el ${fecha(p.venceAt)}` : ''}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2 max-sm:w-full max-sm:pl-11">
                    {p.token && !vencida && (
                      <a href={whatsappInvitacion({ celular: p.celular, nombre: p.nombre, empresa, token: p.token })} target="_blank" rel="noreferrer" className={BOTON_CHICO}>
                        Mandar por WhatsApp
                      </a>
                    )}
                    <button type="button" onClick={() => setEditar(p)} className={BOTON_CHICO}>
                      Cancelar invitación
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Sin nadie más: a quién se suele sumar, con lo que vería, para invitar de un toque. */}
      {adentro.length === 1 && invitados.length === 0 && (
        <section aria-label="A quién sumar">
          <p className="mb-3 text-[15px] text-texto-suave">Todavía estás solo. ¿A quién sumás?</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {ROLES.map((r) => (
              <button key={r.valor} type="button" onClick={() => abrir(r.valor)} className="group flex flex-col items-start gap-2 rounded-[20px] border-[1.5px] border-borde bg-superficie p-5 text-left transition-colors hover:border-principal">
                <span className="text-[17px] font-bold text-texto group-hover:text-principal">Al {r.texto.toLowerCase()}</span>
                <span className="text-[14px] text-texto-suave">Elegís vos qué ve y qué carga en cada sección.</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {invitar && <InvitarPanel key={invitar.vez} abierto empresa={empresa} rolInicial={invitar.rol} onCerrar={() => setInvitar(null)} />}
      <EditarPanel persona={editar} empresa={empresa} onCerrar={() => setEditar(null)} />
    </div>
  )
}

// ---------------------------------------------------------------- Tu cuenta: tu ficha

/**
 * `celular`: la misma pantalla en el teléfono (Lau, 19/11), con «Salir en este celular».
 * `antesDeSalir`: lo que el celular suma antes de salir (cambiar de cuenta).
 */
export function TuCuenta({ empresa, rol, celular: enCelular = false, antesDeSalir }: { empresa: string; rol: string; celular?: boolean; antesDeSalir?: React.ReactNode }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const cambiar = useCambiarNombre()
  const actual = nombreDe(user?.user_metadata) ?? ''
  const [nombre, setNombre] = useState(actual)
  const [guardado, setGuardado] = useState(actual)
  const celular = user?.phone ? celularLindo(user.phone) : null

  async function guardar() {
    if (!nombre.trim()) return 'falta'
    await cambiar.mutateAsync(nombre)
    setGuardado(nombre.trim())
    return () => toast.success('Listo: guardamos tu nombre', { description: 'Así te saluda el asistente.' })
  }
  const guardarNombre = useAccion(guardar)

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* La ficha: quién sos para Troppero. */}
      <section aria-label="Tu ficha" className="relative flex flex-col items-start self-start overflow-hidden rounded-[24px] border border-principal/25 bg-gradient-to-br from-terracota-50 to-trigo-100 p-7 text-texto">
        <span className="grid size-20 place-items-center rounded-full bg-principal font-heading text-[34px] font-extrabold text-principal-texto">{(guardado || empresa || 'T').charAt(0).toUpperCase()}</span>
        <p className="t-seccion mt-5">{guardado || 'Sin nombre'}</p>
        <p className="mt-1 text-[15.5px] text-texto-suave">
          {nombreRol(rol)} de {empresa}
        </p>
        {celular && <p className="t-cifra mt-5 rounded-full bg-superficie/80 px-4 py-1.5 text-texto">{celular}</p>}
        <p className="mt-2 text-[14px] text-texto-suave">Entrás con este número y un código por WhatsApp. Sin contraseña.</p>
      </section>

      <div className="flex flex-col gap-4">
        <section aria-label="Tu cuenta" className="rounded-[24px] border border-borde bg-superficie p-6">
          <h2 className="t-tarjeta text-texto">Tu nombre</h2>
          <p className="mt-1 text-[15px] text-texto-suave">Con este te saluda el asistente y te ven las personas que invitás.</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <CampoTexto className="min-w-[240px] flex-1" etiqueta="Cómo te llamás" placeholder="Daniel" autoCapitalize="words" value={nombre} onChange={(e) => setNombre(nombrePropio(e.target.value))} />
            <Boton accion={guardarNombre} disabled={guardarNombre.estado === 'reposo' && (!nombre.trim() || nombre.trim() === guardado)} className="h-[52px] rounded-full px-6 text-[15.5px] font-bold disabled:opacity-40">
              Guardar el nombre
            </Boton>
          </div>
        </section>

        <section aria-label="Tu número" className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-borde bg-superficie p-6">
          <div>
            <h2 className="t-tarjeta text-texto">¿Cambiaste de número?</h2>
            <p className="mt-1 text-[15px] text-texto-suave">Te mandamos un código al nuevo para confirmar que es tuyo. Tus datos quedan iguales.</p>
          </div>
          <button type="button" onClick={() => navigate('/mi-cuenta/numero')} className={BOTON_CHICO}>
            Cambiar mi número
          </button>
        </section>

        {antesDeSalir}
        <section aria-label="Salir" className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-borde bg-superficie p-6">
          <div>
            <h2 className="t-tarjeta text-texto">{enCelular ? 'Salir en este celular' : 'Salir en esta compu'}</h2>
            <p className="mt-1 text-[15px] text-texto-suave">Para volver a entrar te pedimos un código nuevo.</p>
          </div>
          <button type="button" onClick={() => void signOut()} className={BOTON_CHICO}>
            <Icono nombre="Salir" tamano={16} />
            Salir de Troppero
          </button>
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Plan: el estado y el uso

/** Lo que es verdad hoy: el piloto, sin cargo, y lo que ya usa (Lau, 05/11: sin precios inventados). */
/** `celular`: la misma pantalla, más compacta (Lau, 19/11: nada tan maximizado). */
export function Plan({ celular = false }: { celular?: boolean } = {}) {
  const { user } = useAuth()
  const { data: membresia } = useEmpresa()
  const mapa = useMapa(membresia?.empresa_id)
  const animales = useAnimales()
  const personas = usePersonas(true)
  const baja = useBaja(membresia?.empresa_id)
  const cabezas = (animales.data ?? []).filter((a) => a.estado === 'activo').length
  const desde = membresia?.empresa?.created_at
  const whatsapp = linkWhatsapp({ nombre: nombreDe(user?.user_metadata), empresa: membresia?.empresa?.nombre ?? null, seccion: 'Configuración, el plan', consulta: 'Quiero saber sobre mi plan.' })
  const uso: { titulo: string; valor: string; icono: NombreIcono }[] = [
    { titulo: 'Campos', valor: String(mapa.data?.length ?? '—'), icono: 'Campos' },
    { titulo: 'Cabezas', valor: animales.data ? cabezas.toLocaleString('es-AR') : '—', icono: 'Hacienda' },
    { titulo: 'Personas', valor: String(personas.data?.filter((p) => p.userId).length ?? '—'), icono: 'Usuario' },
  ]
  return (
    <div className={cn('flex flex-col', celular ? 'gap-4' : 'gap-5')}>
      {/* El plan, como una tarjeta: qué tenés y desde cuándo. */}
      <section aria-label="Tu plan" className={cn('relative flex flex-wrap items-end justify-between overflow-hidden bg-principal text-principal-texto', celular ? 'gap-4 rounded-[20px] p-5' : 'gap-6 rounded-[24px] p-8')}>
        <Logo soloIsotipo tono="hueso" alto={celular ? 150 : 220} className="pointer-events-none absolute -top-6 -right-8 opacity-[0.12]" />
        <div className="relative">
          {baja.data ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-superficie px-3 py-1 text-[13.5px] font-bold text-estado-problema-texto">
              <span className="size-2 rounded-full bg-estado-problema" />
              Baja pedida
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-superficie px-3 py-1 text-[13.5px] font-bold text-estado-bien-texto">
              <span className="size-2 rounded-full bg-estado-bien" />
              Activo
            </span>
          )}
          <p className={cn('text-principal-texto/80', celular ? 'mt-3 text-[13.5px]' : 'mt-4 text-[15px]')}>Tu plan</p>
          <p className={celular ? 't-seccion' : 't-pagina'}>Piloto, sin cargo</p>
          {desde && <p className={cn('text-principal-texto/85', celular ? 'mt-1.5 text-[13.5px]' : 'mt-3 text-[15.5px]')}>Usás Troppero desde el {fecha(desde)}.</p>}
        </div>
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noreferrer" className={cn('relative inline-flex items-center gap-2 rounded-full bg-acento font-bold text-acento-texto hover:bg-trigo-300', celular ? 'h-10 px-4 text-[14px]' : 'h-12 px-5 text-[15.5px]')}>
            <Icono nombre="Celular" tamano={16} />
            Hablar con nosotros
          </a>
        )}
      </section>

      <section aria-label="Lo que usás">
        <h2 className={cn('t-tarjeta text-texto', celular ? 'mb-2 px-1 !text-[16px]' : 'mb-3')}>Lo que usás</h2>
        {/* En el celular, los tres números en una sola fila. */}
        {celular ? (
          <dl className="grid grid-cols-3 divide-x divide-borde rounded-[20px] bg-superficie py-3.5 shadow-[inset_0_0_0_1px_var(--borde)]">
            {uso.map((u) => (
              <div key={u.titulo} className="flex flex-col items-center gap-1 px-2">
                <dt className="flex items-center gap-1.5 text-[12.5px] font-semibold text-texto-suave">
                  <Icono nombre={u.icono} tamano={16} />
                  {u.titulo}
                </dt>
                <dd className="t-seccion text-texto tabular-nums">{u.valor}</dd>
              </div>
            ))}
          </dl>
        ) : (
        <dl className="grid gap-3 sm:grid-cols-3">
          {uso.map((u) => (
            <div key={u.titulo} className="flex items-center gap-4 rounded-[20px] border border-borde bg-superficie px-5 py-4">
              <span className="grid size-11 place-items-center rounded-full bg-superficie-hundida text-texto">
                <Icono nombre={u.icono} />
              </span>
              <div>
                <dt className="text-[14px] font-semibold text-texto-suave">{u.titulo}</dt>
                <dd className="t-numero text-texto">{u.valor}</dd>
              </div>
            </div>
          ))}
        </dl>
        )}
      </section>

      <section aria-label="Qué incluye" className={cn('border border-borde bg-superficie', celular ? 'rounded-[20px] p-4' : 'rounded-[24px] p-6')}>
        <h2 className={cn('t-tarjeta text-texto', celular && '!text-[16px]')}>Qué incluye</h2>
        <p className={cn('mt-1 text-texto-suave', celular ? 'text-[13.5px]' : 'text-[15px]')}>En el piloto usás Troppero entero.</p>
        <ul className={cn('grid sm:grid-cols-2', celular ? 'mt-3 gap-1.5' : 'mt-4 gap-2')}>
          {[...SECCIONES.map((s) => `${s.texto}: ${s.queVe.toLowerCase()}`), 'El asistente de Troppero, para tus dudas'].map((t) => (
            <li key={t} className={cn('flex items-center gap-2.5 text-texto', celular ? 'text-[13.5px]' : 'text-[15px]')}>
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-estado-bien-suave text-estado-bien-texto">
                <Icono nombre="Guardar" tamano={16} />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </section>

      <Baja empresaId={membresia?.empresa_id} empresa={membresia?.empresa?.nombre ?? 'tu campo'} nombre={nombreDe(user?.user_metadata)} />
    </div>
  )
}
