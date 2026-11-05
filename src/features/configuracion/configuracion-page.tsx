import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Icono } from '@/components/tropero/icono'
import { Grupo, Opciones, PanelLateral } from '@/components/tropero/panel-lateral'
import { useAuth } from '@/features/auth/auth-context'
import { ROLES, SECCIONES, esDueno, nombreRol, seccionesSugeridas, type Rol, type Seccion } from '@/features/empresa/secciones'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { nombreDe } from '@/features/guia/nombre-usuario'
import { linkWhatsapp } from '@/features/guia/whatsapp'
import { useAnimales } from '@/features/hacienda/hooks'
import { useMapa } from '@/features/mapa/api'
import { cn } from '@/lib/utils'
import { celularLindo, linkInvitacion, useCambiarNombre, useCambiarSecciones, useInvitar, usePersonas, useQuitarPersona, whatsappInvitacion, type Persona } from './api'

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
const BOTON_CHICO = 'inline-flex h-10 items-center gap-1.5 rounded-full border-[1.5px] border-borde bg-superficie px-4 text-[14.5px] font-bold text-texto transition-colors hover:border-principal hover:text-principal'

/**
 * Configuración (Lau, 05/11): tu cuenta para todos; el dueño además ve las
 * Personas (invitar y elegir qué ve cada una) y el Plan.
 */
export function ConfiguracionPage() {
  const { data: membresia } = useEmpresa()
  const dueno = esDueno(membresia)
  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-10">
      <header>
        <h1 className="titulo-display text-[44px] leading-none text-texto">Configuración</h1>
        <p className="mt-3 text-[17px] text-texto-suave">{dueno ? 'Quién entra a tu campo y qué ve, tu cuenta y tu plan.' : 'Tu nombre y tu número.'}</p>
      </header>
      {dueno && <Personas empresa={membresia?.empresa?.nombre ?? ''} />}
      <TuCuenta />
      {dueno && <Plan />}
    </div>
  )
}

function Bloque({ titulo, bajada, accion, children }: { titulo: string; bajada: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={titulo} className="rounded-[24px] border border-borde bg-superficie">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-borde px-6 py-5">
        <div>
          <h2 className="font-heading text-[24px] leading-tight font-extrabold text-texto">{titulo}</h2>
          <p className="mt-1 text-[15px] text-texto-suave">{bajada}</p>
        </div>
        {accion}
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------- Personas

function Personas({ empresa }: { empresa: string }) {
  const personas = usePersonas(true)
  const [invitar, setInvitar] = useState(false)
  const [vezInvitar, setVezInvitar] = useState(0)
  const [editar, setEditar] = useState<Persona | null>(null)
  const lista = personas.data ?? []
  return (
    <Bloque
      titulo="Personas"
      bajada="Quién entra a tu campo y qué ve cada uno. Vos ves todo; a los demás les elegís las secciones."
      accion={
        <button type="button" onClick={() => (setVezInvitar((v) => v + 1), setInvitar(true))} className="inline-flex h-12 items-center gap-3 rounded-full bg-principal py-1 pr-1 pl-5 text-[15.5px] font-bold text-principal-texto hover:bg-terracota-600">
          Invitar a alguien
          <span className="grid size-10 place-items-center rounded-full bg-acento text-acento-texto">
            <Icono nombre="Agregar" tamano={16} />
          </span>
        </button>
      }
    >
      {personas.isLoading ? (
        <div className="h-24 animate-pulse rounded-[16px] bg-superficie-hundida" aria-busy />
      ) : personas.error ? (
        <p className="text-texto-suave">No pudimos cargar las personas. Revisá la conexión y probá de nuevo.</p>
      ) : (
        <ul className="-my-1 divide-y divide-borde/70">
          {lista.map((p) => (
            <FilaPersona key={p.userId ?? p.invitacionId} p={p} empresa={empresa} onEditar={() => setEditar(p)} />
          ))}
        </ul>
      )}
      {lista.length === 1 && <p className="mt-3 text-[15px] text-texto-suave">Todavía estás solo. Invitá al encargado, al peón o al veterinario: les llega por WhatsApp y entran con su celular.</p>}
      <InvitarPanel key={vezInvitar} abierto={invitar} empresa={empresa} onCerrar={() => setInvitar(false)} />
      <EditarPanel persona={editar} onCerrar={() => setEditar(null)} />
    </Bloque>
  )
}

function FilaPersona({ p, empresa, onEditar }: { p: Persona; empresa: string; onEditar: () => void }) {
  const pendiente = !!p.invitacionId
  const vencida = pendiente && !!p.venceAt && new Date(p.venceAt) < new Date()
  const ve = p.secciones === null ? 'Ve todo' : `Ve ${SECCIONES.filter((s) => p.secciones!.includes(s.id)).map((s) => s.texto).join(', ')}`
  return (
    <li className="flex flex-wrap items-center gap-4 py-4">
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-full font-heading text-[16px] font-extrabold', pendiente ? 'border-[1.5px] border-dashed border-borde text-texto-suave' : 'bg-principal text-principal-texto')}>
        {p.nombre.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16.5px] font-semibold text-texto">
          {p.nombre}
          {p.soyYo && <span className="font-normal text-texto-suave"> (vos)</span>}
        </p>
        <p className="truncate text-[14.5px] text-texto-suave">
          {[nombreRol(p.rol), celularLindo(p.celular), ve].join(' · ')}
        </p>
        {pendiente && (
          <p className={cn('mt-0.5 text-[14px] font-semibold', vencida ? 'text-estado-problema-texto' : 'text-estado-atencion-texto')}>
            {vencida ? 'La invitación venció: mandale otra' : `Invitado, todavía no entró${p.venceAt ? ` · el link vence el ${fecha(p.venceAt)}` : ''}`}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        {pendiente && p.token && !vencida && (
          <a href={whatsappInvitacion({ celular: p.celular, nombre: p.nombre, empresa, token: p.token })} target="_blank" rel="noreferrer" className={BOTON_CHICO}>
            Mandar por WhatsApp
          </a>
        )}
        {!p.soyYo && (
          <button type="button" onClick={onEditar} className={BOTON_CHICO}>
            {pendiente ? 'Cancelar invitación' : 'Cambiar lo que ve'}
          </button>
        )}
      </div>
    </li>
  )
}

/** Qué secciones ve: cada una con lo que hay adentro, para decidir sabiendo. */
function ElegirSecciones({ elegidas, onCambiar }: { elegidas: Seccion[]; onCambiar: (s: Seccion[]) => void }) {
  return (
    <div role="group" aria-label="Qué ve" className="flex flex-col gap-2">
      {SECCIONES.map((s) => {
        const si = elegidas.includes(s.id)
        return (
          <button
            key={s.id}
            type="button"
            role="checkbox"
            aria-checked={si}
            onClick={() => onCambiar(si ? elegidas.filter((x) => x !== s.id) : [...elegidas, s.id])}
            className={cn('flex items-center gap-4 rounded-[16px] border-[1.5px] px-4 py-3 text-left transition-colors', si ? 'border-principal bg-principal-suave/60' : 'border-borde bg-superficie hover:border-neutro-300')}
          >
            <span className={cn('grid size-7 shrink-0 place-items-center rounded-[8px] border-2', si ? 'border-principal bg-principal text-principal-texto' : 'border-texto/40 bg-superficie')}>{si && <Icono nombre="Guardar" tamano={16} />}</span>
            <Icono nombre={s.icono} />
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold text-texto">{s.texto}</span>
              <span className="block text-[14px] text-texto-suave">{s.queVe}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function InvitarPanel({ abierto, empresa, onCerrar }: { abierto: boolean; empresa: string; onCerrar: () => void }) {
  const invitar = useInvitar()
  const [nombre, setNombre] = useState('')
  const [celular, setCelular] = useState('')
  const [rol, setRol] = useState<Rol | ''>('')
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    setError(null)
    if (!nombre.trim()) return setError('Escribí cómo se llama.')
    if (celular.replace(/\D/g, '').length < 10) return setError('Escribí su celular con la característica, sin el 0 ni el 15.')
    if (!rol) return setError('Tocá qué hace en el campo.')
    if (!secciones.length) return setError('Elegí al menos una sección que va a ver.')
    try {
      setToken(await invitar.mutateAsync({ nombre: nombre.trim(), celular, rol, secciones }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo invitar. Probá de nuevo.')
    }
  }

  const cel = `549${celular.replace(/\D/g, '').slice(-10)}`
  if (token)
    return (
      <PanelLateral
        abierto={abierto}
        onCerrar={onCerrar}
        titulo={`Listo: invitaste a ${nombre.trim().split(' ')[0]}`}
        bajada="Mandale el link por WhatsApp. Entra con su celular, sin contraseña, y ve sólo lo que elegiste. El link vence en 7 días."
        pie={
          <div className="flex flex-col gap-3">
            <a href={whatsappInvitacion({ celular: cel, nombre, empresa, token })} target="_blank" rel="noreferrer" className="inline-flex h-14 w-full items-center justify-between rounded-full bg-principal py-2 pr-2 pl-[26px] text-[16.5px] font-bold text-principal-texto hover:bg-terracota-600">
              Mandárselo por WhatsApp
              <span className="grid size-12 place-items-center rounded-full bg-acento text-acento-texto">
                <Icono nombre="Celular" tamano={16} />
              </span>
            </a>
            <button type="button" onClick={() => void navigator.clipboard.writeText(linkInvitacion(token)).then(() => toast.success('Listo: copiaste el link', { description: 'Pegalo donde quieras mandárselo.' }))} className="h-12 rounded-full border-[1.5px] border-borde bg-superficie text-[15.5px] font-bold text-texto hover:border-principal hover:text-principal">
              Copiar el link
            </button>
          </div>
        }
      >
        <div className="rounded-[18px] border border-borde bg-superficie p-5 text-[15px]">
          <p className="font-semibold text-texto">{nombre.trim()}</p>
          <p className="text-texto-suave">{[nombreRol(rol), celularLindo(cel)].join(' · ')}</p>
          <p className="mt-3 text-texto-suave">Va a ver: {SECCIONES.filter((s) => secciones.includes(s.id)).map((s) => s.texto).join(', ')}.</p>
        </div>
      </PanelLateral>
    )

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Invitar a alguien"
      bajada="Le llega un link por WhatsApp y entra con su celular. Vos elegís qué ve; lo podés cambiar cuando quieras."
      ancho
      pie={
        <>
          {error && <p role="alert" className="mb-3 rounded-[14px] bg-estado-problema-suave px-4 py-2.5 text-[14px] font-semibold text-estado-problema-texto">{error}</p>}
          <BotonPrincipal icono="Siguiente" cargando={invitar.isPending} disabled={invitar.isPending} onClick={() => void enviar()}>
            {nombre.trim() ? `Invitar a ${nombre.trim().split(' ')[0]}` : 'Invitar'}
          </BotonPrincipal>
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <CampoTexto etiqueta="Cómo se llama" placeholder="Juan Pérez" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        <CampoTexto etiqueta="Su celular, el que tiene WhatsApp" inputMode="tel" placeholder="2241 55-8820" value={celular} onChange={(e) => setCelular(e.target.value)} />
      </div>
      <Grupo titulo="Qué hace en el campo" className="mt-6">
        <Opciones
          etiqueta="Qué hace"
          opciones={ROLES}
          elegidas={rol ? [rol] : []}
          onTocar={(r) => {
            setRol(r)
            // Un punto de partida según lo que hace; lo cambiás abajo.
            if (!secciones.length || rol) setSecciones(seccionesSugeridas(r))
          }}
        />
      </Grupo>
      <Grupo titulo={rol ? 'Qué va a ver · te propusimos esto, cambialo como quieras' : 'Qué va a ver'}>
        <ElegirSecciones elegidas={secciones} onCambiar={setSecciones} />
      </Grupo>
      <p className="mt-4 text-[14px] text-texto-suave">Configuración (las personas y el plan) sólo la ves vos.</p>
    </PanelLateral>
  )
}

function EditarPanel({ persona, onCerrar }: { persona: Persona | null; onCerrar: () => void }) {
  // La última abierta queda mientras el panel sale.
  const [ultima, setUltima] = useState(persona)
  if (persona && persona !== ultima) setUltima(persona)
  const p = persona ?? ultima
  if (!p) return null
  return <Editar key={p.userId ?? p.invitacionId} p={p} abierto={!!persona} onCerrar={onCerrar} />
}

function Editar({ p, abierto, onCerrar }: { p: Persona; abierto: boolean; onCerrar: () => void }) {
  const cambiar = useCambiarSecciones()
  const quitar = useQuitarPersona()
  const [secciones, setSecciones] = useState<Seccion[]>(p.secciones ?? [])
  const [seguro, setSeguro] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendiente = !!p.invitacionId
  const nombre = p.nombre.split(' ')[0]

  async function guardar() {
    setError(null)
    if (!secciones.length) return setError('Tiene que ver al menos una sección. Para que no entre más, sacale el acceso.')
    try {
      await cambiar.mutateAsync({ userId: p.userId!, secciones })
      onCerrar()
      toast.success(`Listo: ${nombre} ahora ve ${SECCIONES.filter((s) => secciones.includes(s.id)).map((s) => s.texto).join(', ')}`, { description: 'Lo ve la próxima vez que abra Tropero.' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }
  async function sacar() {
    try {
      await quitar.mutateAsync(p)
      onCerrar()
      toast.success(pendiente ? `Listo: cancelaste la invitación de ${nombre}` : `Listo: ${nombre} ya no entra a tu campo`, { description: pendiente ? 'El link ya no sirve.' : 'Para que vuelva, invitalo de nuevo.' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    }
  }

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={pendiente ? `La invitación de ${nombre}` : `Qué ve ${nombre}`}
      bajada={[nombreRol(p.rol), celularLindo(p.celular)].join(' · ')}
      ancho
      pie={
        <>
          {error && <p role="alert" className="mb-3 rounded-[14px] bg-estado-problema-suave px-4 py-2.5 text-[14px] font-semibold text-estado-problema-texto">{error}</p>}
          {!pendiente && (
            <BotonPrincipal icono="Guardar" cargando={cambiar.isPending} disabled={cambiar.isPending} onClick={() => void guardar()}>
              Guardar lo que ve
            </BotonPrincipal>
          )}
          {seguro ? (
            <div className="mt-3 flex flex-col gap-2 rounded-[16px] bg-estado-problema-suave p-4">
              <p className="text-[14.5px] font-semibold text-estado-problema-texto">{pendiente ? `¿Cancelás la invitación? El link ya no va a servir.` : `¿Le sacás el acceso a ${nombre}? Deja de entrar a tu campo; lo que cargó queda.`}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void sacar()} disabled={quitar.isPending} className="h-11 flex-1 rounded-full bg-estado-problema text-[15px] font-bold text-superficie disabled:opacity-50">
                  {pendiente ? 'Sí, cancelarla' : 'Sí, sacarle el acceso'}
                </button>
                <button type="button" onClick={() => setSeguro(false)} className="h-11 flex-1 rounded-full border-[1.5px] border-borde bg-superficie text-[15px] font-bold text-texto">
                  No
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setSeguro(true)} className="mt-3 h-12 w-full rounded-full border-[1.5px] border-borde bg-superficie text-[15.5px] font-bold text-estado-problema-texto hover:border-estado-problema">
              {pendiente ? 'Cancelar la invitación' : 'Sacarle el acceso'}
            </button>
          )}
        </>
      }
    >
      {pendiente ? (
        <p className="text-[15.5px] text-texto">
          Va a ver: {SECCIONES.filter((s) => (p.secciones ?? []).includes(s.id)).map((s) => s.texto).join(', ')}. Cuando entre, le podés cambiar lo que ve desde acá.
        </p>
      ) : (
        <ElegirSecciones elegidas={secciones} onCambiar={setSecciones} />
      )}
    </PanelLateral>
  )
}

// ---------------------------------------------------------------- Tu cuenta

function TuCuenta() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const cambiar = useCambiarNombre()
  const actual = nombreDe(user?.user_metadata) ?? ''
  const [nombre, setNombre] = useState(actual)
  const celular = user?.phone ? celularLindo(user.phone) : null

  async function guardar() {
    if (!nombre.trim()) return
    try {
      await cambiar.mutateAsync(nombre)
      toast.success('Listo: guardamos tu nombre', { description: 'Así te saluda el asistente.' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }

  return (
    <Bloque titulo="Tu cuenta" bajada="Entrás con tu celular y un código por WhatsApp, sin contraseña.">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-3">
          <CampoTexto className="min-w-[260px] flex-1" etiqueta="Tu nombre" placeholder="Daniel" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <button type="button" onClick={() => void guardar()} disabled={!nombre.trim() || nombre.trim() === actual || cambiar.isPending} className="h-[52px] rounded-full bg-principal px-6 text-[15.5px] font-bold text-principal-texto hover:bg-terracota-600 disabled:opacity-40">
            Guardar el nombre
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-superficie-hundida/60 px-4 py-3.5">
          <div>
            <p className="text-[14px] font-semibold text-texto-suave">Tu número</p>
            <p className="cifra text-[19px] text-texto">{celular ?? '—'}</p>
          </div>
          <button type="button" onClick={() => navigate('/mi-cuenta/numero')} className={BOTON_CHICO}>
            Cambiar mi número
          </button>
        </div>
        <button type="button" onClick={() => void signOut()} className={cn(BOTON_CHICO, 'self-start')}>
          <Icono nombre="Salir" tamano={16} />
          Salir de Tropero en esta compu
        </button>
      </div>
    </Bloque>
  )
}

// ---------------------------------------------------------------- Plan

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
  const uso: [string, string][] = [
    ['Campos', String(mapa.data?.length ?? '—')],
    ['Cabezas', animales.data ? cabezas.toLocaleString('es-AR') : '—'],
    ['Personas', String(personas.data?.filter((p) => p.userId).length ?? '—')],
  ]
  return (
    <Bloque titulo="Plan" bajada="Lo que tenés y lo que usás.">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-estado-bien-suave px-3 py-1 text-[13.5px] font-bold text-estado-bien-texto">Activo</p>
          <p className="titulo-display mt-3 text-[34px] leading-none text-texto">Piloto, sin cargo</p>
          {desde && <p className="mt-2 text-[15px] text-texto-suave">Usás Tropero desde el {fecha(desde)}.</p>}
        </div>
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noreferrer" className={BOTON_CHICO}>
            <Icono nombre="Celular" tamano={16} />
            Hablar con nosotros
          </a>
        )}
      </div>
      <dl className="mt-6 grid grid-cols-3 gap-3">
        {uso.map(([k, v]) => (
          <div key={k} className="rounded-[16px] bg-superficie-hundida/60 px-4 py-3">
            <dt className="text-[14px] font-semibold text-texto-suave">{k}</dt>
            <dd className="cifra text-[26px] text-texto">{v}</dd>
          </div>
        ))}
      </dl>
    </Bloque>
  )
}
