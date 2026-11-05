import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Icono } from '@/components/tropero/icono'
import type { NombreIcono } from '@/components/tropero/iconos-svg'
import { useAuth } from '@/features/auth/auth-context'
import { ROLES, SECCIONES, esDueno, nombreRol, seccionesSugeridas, type Rol } from '@/features/empresa/secciones'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { nombreDe } from '@/features/guia/nombre-usuario'
import { linkWhatsapp } from '@/features/guia/whatsapp'
import { useAnimales } from '@/features/hacienda/hooks'
import { useMapa } from '@/features/mapa/api'
import { cn } from '@/lib/utils'
import { celularLindo, useCambiarNombre, usePersonas, whatsappInvitacion, type Persona } from './api'
import { EditarPanel, InvitarPanel } from './personas-paneles'

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
const BOTON_CHICO = 'inline-flex h-10 items-center gap-1.5 rounded-full border-[1.5px] border-borde bg-superficie px-4 text-[14.5px] font-bold text-texto transition-colors hover:border-principal hover:text-principal'

type Pestana = 'personas' | 'cuenta' | 'plan'
const PESTANAS: { id: Pestana; texto: string; icono: NombreIcono; para: string }[] = [
  { id: 'personas', texto: 'Personas', icono: 'Usuario', para: 'Quién entra y qué ve' },
  { id: 'cuenta', texto: 'Tu cuenta', icono: 'Celular', para: 'Tu nombre y tu número' },
  { id: 'plan', texto: 'Plan', icono: 'Comprobante', para: 'Lo que tenés y usás' },
]

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
        <h1 className="titulo-display text-[44px] leading-none text-texto">Configuración</h1>
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
                className={cn('flex items-center gap-3.5 rounded-[18px] border-[1.5px] px-4 py-3.5 text-left transition-colors', si ? 'border-tinta bg-tinta text-superficie' : 'border-borde bg-superficie text-texto hover:border-neutro-300')}
              >
                <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', si ? 'bg-superficie/15 text-superficie' : 'bg-superficie-hundida text-texto')}>
                  <Icono nombre={p.icono} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[16.5px] font-bold">{p.texto}</span>
                  <span className={cn('block truncate text-[14px]', si ? 'text-superficie/70' : 'text-texto-suave')}>{p.para}</span>
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

function Personas({ empresa }: { empresa: string }) {
  const personas = usePersonas(true)
  const [invitar, setInvitar] = useState<{ vez: number; rol?: Rol } | null>(null)
  const [vez, setVez] = useState(0)
  const [editar, setEditar] = useState<Persona | null>(null)
  const lista = personas.data ?? []
  const adentro = lista.filter((p) => p.userId)
  const invitados = lista.filter((p) => p.invitacionId)
  const abrir = (rol?: Rol) => (setVez((v) => v + 1), setInvitar({ vez: vez + 1, rol }))

  if (personas.isLoading) return <div className="h-64 animate-pulse rounded-[24px] bg-superficie-hundida" aria-busy />
  if (personas.error) return <p className="text-texto-suave">No pudimos cargar las personas. Revisá la conexión y probá de nuevo.</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[17px] text-texto">
          <b className="cifra text-[22px]">{adentro.length}</b> {adentro.length === 1 ? 'persona entra' : 'personas entran'} a tu campo
          {invitados.length > 0 && (
            <span className="text-texto-suave">
              {' '}
              · {invitados.length} {invitados.length === 1 ? 'invitación esperando' : 'invitaciones esperando'}
            </span>
          )}
        </p>
        <button type="button" onClick={() => abrir()} className="inline-flex h-12 items-center gap-3 rounded-full bg-principal py-1 pr-1 pl-5 text-[15.5px] font-bold text-principal-texto hover:bg-terracota-600">
          Invitar a alguien
          <span className="grid size-10 place-items-center rounded-full bg-acento text-acento-texto">
            <Icono nombre="Agregar" tamano={16} />
          </span>
        </button>
      </div>

      {/* La tabla: una fila por persona, una columna por sección. Se lee quién ve qué sin abrir nada. */}
      <section aria-label="Quién ve qué" className="overflow-hidden rounded-[24px] border border-borde bg-superficie">
        <div className="grid grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,0.8fr))_150px] items-center border-b border-borde bg-superficie-hundida/60 px-5 py-3 text-[13px] font-bold tracking-[0.04em] text-texto-suave uppercase">
          <span>Persona</span>
          {SECCIONES.map((s) => (
            <span key={s.id} className="text-center">
              {s.texto}
            </span>
          ))}
          <span />
        </div>
        <ul className="divide-y divide-borde/70">
          {adentro.map((p) => (
            <li key={p.userId} className="grid grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,0.8fr))_150px] items-center px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className={cn('grid size-10 shrink-0 place-items-center rounded-full font-heading text-[15px] font-extrabold', p.rol === 'dueno' ? 'bg-tinta text-superficie' : 'bg-principal text-principal-texto')}>{p.nombre.charAt(0).toUpperCase()}</span>
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold text-texto">
                    {p.nombre}
                    {p.soyYo && <span className="font-normal text-texto-suave"> (vos)</span>}
                  </p>
                  <p className="truncate text-[14px] text-texto-suave">{[nombreRol(p.rol), celularLindo(p.celular)].join(' · ')}</p>
                </div>
              </div>
              {SECCIONES.map((s) => {
                const ve = p.secciones === null || p.secciones.includes(s.id)
                return (
                  <span key={s.id} className="flex justify-center" aria-label={`${s.texto}: ${ve ? 'lo ve' : 'no lo ve'}`}>
                    {ve ? (
                      <span className="grid size-8 place-items-center rounded-full bg-estado-bien-suave text-estado-bien-texto">
                        <Icono nombre="Guardar" tamano={16} />
                      </span>
                    ) : (
                      <span className="h-[2px] w-4 rounded-full bg-neutro-200" />
                    )}
                  </span>
                )
              })}
              <span className="flex justify-end">
                {p.soyYo || p.rol === 'dueno' ? (
                  <span className="text-[14px] font-semibold text-texto-suave">Ve todo</span>
                ) : (
                  <button type="button" onClick={() => setEditar(p)} className={BOTON_CHICO}>
                    Cambiar
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {invitados.length > 0 && (
        <section aria-label="Invitaciones esperando" className="rounded-[24px] border border-dashed border-borde bg-superficie/60 px-5 py-2">
          <ul className="divide-y divide-borde/70">
            {invitados.map((p) => {
              const vencida = !!p.venceAt && new Date(p.venceAt) < new Date()
              return (
                <li key={p.invitacionId} className="flex flex-wrap items-center gap-4 py-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-borde font-heading text-[15px] font-extrabold text-texto-suave">{p.nombre.charAt(0).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold text-texto">{p.nombre}</p>
                    <p className="truncate text-[14px] text-texto-suave">
                      {nombreRol(p.rol)} · va a ver {SECCIONES.filter((s) => (p.secciones ?? []).includes(s.id)).map((s) => s.texto).join(', ')}
                    </p>
                    <p className={cn('text-[14px] font-semibold', vencida ? 'text-estado-problema-texto' : 'text-estado-atencion-texto')}>
                      {vencida ? 'El link venció: cancelala e invitalo de nuevo' : `Invitado, todavía no entró${p.venceAt ? ` · el link vence el ${fecha(p.venceAt)}` : ''}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
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
                <span className="text-[14px] text-texto-suave">Vería {SECCIONES.filter((s) => seccionesSugeridas(r.valor).includes(s.id)).map((s) => s.texto).join(', ')}. Lo cambiás antes de invitarlo.</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {invitar && <InvitarPanel key={invitar.vez} abierto empresa={empresa} rolInicial={invitar.rol} onCerrar={() => setInvitar(null)} />}
      <EditarPanel persona={editar} onCerrar={() => setEditar(null)} />
    </div>
  )
}

// ---------------------------------------------------------------- Tu cuenta: tu ficha

function TuCuenta({ empresa, rol }: { empresa: string; rol: string }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const cambiar = useCambiarNombre()
  const actual = nombreDe(user?.user_metadata) ?? ''
  const [nombre, setNombre] = useState(actual)
  const [guardado, setGuardado] = useState(actual)
  const celular = user?.phone ? celularLindo(user.phone) : null

  async function guardar() {
    if (!nombre.trim()) return
    try {
      await cambiar.mutateAsync(nombre)
      setGuardado(nombre.trim())
      toast.success('Listo: guardamos tu nombre', { description: 'Así te saluda el asistente.' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* La ficha: quién sos para Tropero. */}
      <section aria-label="Tu ficha" className="flex flex-col items-start self-start rounded-[24px] bg-tinta p-7 text-superficie">
        <span className="grid size-20 place-items-center rounded-full bg-principal font-heading text-[34px] font-extrabold text-principal-texto">{(guardado || empresa || 'T').charAt(0).toUpperCase()}</span>
        <p className="titulo-display mt-5 text-[30px] leading-tight">{guardado || 'Sin nombre'}</p>
        <p className="mt-1 text-[15.5px] text-superficie/75">
          {nombreRol(rol)} de {empresa}
        </p>
        {celular && <p className="cifra mt-5 text-[20px]">{celular}</p>}
        <p className="mt-1 text-[14px] text-superficie/60">Entrás con este número y un código por WhatsApp. Sin contraseña.</p>
      </section>

      <div className="flex flex-col gap-4">
        <section aria-label="Tu cuenta" className="rounded-[24px] border border-borde bg-superficie p-6">
          <h2 className="font-heading text-[20px] font-extrabold text-texto">Tu nombre</h2>
          <p className="mt-1 text-[15px] text-texto-suave">Con este te saluda el asistente y te ven las personas que invitás.</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <CampoTexto className="min-w-[240px] flex-1" etiqueta="Cómo te llamás" placeholder="Daniel" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <button type="button" onClick={() => void guardar()} disabled={!nombre.trim() || nombre.trim() === guardado || cambiar.isPending} className="h-[52px] rounded-full bg-principal px-6 text-[15.5px] font-bold text-principal-texto hover:bg-terracota-600 disabled:opacity-40">
              Guardar el nombre
            </button>
          </div>
        </section>

        <section aria-label="Tu número" className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-borde bg-superficie p-6">
          <div>
            <h2 className="font-heading text-[20px] font-extrabold text-texto">¿Cambiaste de número?</h2>
            <p className="mt-1 text-[15px] text-texto-suave">Te mandamos un código al nuevo para confirmar que es tuyo. Tus datos quedan iguales.</p>
          </div>
          <button type="button" onClick={() => navigate('/mi-cuenta/numero')} className={BOTON_CHICO}>
            Cambiar mi número
          </button>
        </section>

        <section aria-label="Salir" className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-borde bg-superficie p-6">
          <div>
            <h2 className="font-heading text-[20px] font-extrabold text-texto">Salir en esta compu</h2>
            <p className="mt-1 text-[15px] text-texto-suave">Para volver a entrar te pedimos un código nuevo.</p>
          </div>
          <button type="button" onClick={() => void signOut()} className={BOTON_CHICO}>
            <Icono nombre="Salir" tamano={16} />
            Salir de Tropero
          </button>
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Plan: el estado y el uso

/** Lo que es verdad hoy: el piloto, sin cargo, y lo que ya usa (Lau, 05/11: sin precios inventados). */
function Plan() {
  const { user } = useAuth()
  const { data: membresia } = useEmpresa()
  const mapa = useMapa(membresia?.empresa_id)
  const animales = useAnimales()
  const personas = usePersonas(true)
  const cabezas = (animales.data ?? []).filter((a) => a.estado === 'activo').length
  const desde = membresia?.empresa?.created_at
  const whatsapp = linkWhatsapp({ nombre: nombreDe(user?.user_metadata), empresa: membresia?.empresa?.nombre ?? null, seccion: 'Configuración, el plan', consulta: 'Quiero saber sobre mi plan.' })
  const uso: { titulo: string; valor: string; icono: NombreIcono }[] = [
    { titulo: 'Campos', valor: String(mapa.data?.length ?? '—'), icono: 'Campos' },
    { titulo: 'Cabezas', valor: animales.data ? cabezas.toLocaleString('es-AR') : '—', icono: 'Hacienda' },
    { titulo: 'Personas', valor: String(personas.data?.filter((p) => p.userId).length ?? '—'), icono: 'Usuario' },
  ]
  return (
    <div className="flex flex-col gap-5">
      {/* El plan, como una tarjeta: qué tenés y desde cuándo. */}
      <section aria-label="Tu plan" className="flex flex-wrap items-end justify-between gap-6 rounded-[24px] bg-tinta p-8 text-superficie">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-estado-bien px-3 py-1 text-[13.5px] font-bold text-superficie">
            <span className="size-2 rounded-full bg-superficie" />
            Activo
          </span>
          <p className="mt-4 text-[15px] text-superficie/70">Tu plan</p>
          <p className="titulo-display text-[44px] leading-none">Piloto, sin cargo</p>
          {desde && <p className="mt-3 text-[15.5px] text-superficie/75">Usás Tropero desde el {fecha(desde)}.</p>}
        </div>
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center gap-2 rounded-full bg-acento px-5 text-[15.5px] font-bold text-acento-texto hover:bg-trigo-300">
            <Icono nombre="Celular" tamano={16} />
            Hablar con nosotros
          </a>
        )}
      </section>

      <section aria-label="Lo que usás">
        <h2 className="mb-3 font-heading text-[20px] font-extrabold text-texto">Lo que usás</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          {uso.map((u) => (
            <div key={u.titulo} className="flex items-center gap-4 rounded-[20px] border border-borde bg-superficie px-5 py-4">
              <span className="grid size-11 place-items-center rounded-full bg-superficie-hundida text-texto">
                <Icono nombre={u.icono} />
              </span>
              <div>
                <dt className="text-[14px] font-semibold text-texto-suave">{u.titulo}</dt>
                <dd className="cifra text-[28px] leading-none text-texto">{u.valor}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Qué incluye" className="rounded-[24px] border border-borde bg-superficie p-6">
        <h2 className="font-heading text-[20px] font-extrabold text-texto">Qué incluye</h2>
        <p className="mt-1 text-[15px] text-texto-suave">En el piloto usás Tropero entero.</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {[...SECCIONES.map((s) => `${s.texto}: ${s.queVe.toLowerCase()}`), 'El asistente de Tropero, para tus dudas'].map((t) => (
            <li key={t} className="flex items-center gap-2.5 text-[15px] text-texto">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-estado-bien-suave text-estado-bien-texto">
                <Icono nombre="Guardar" tamano={16} />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
