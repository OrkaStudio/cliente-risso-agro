import { useState } from 'react'
import { toast } from 'sonner'
import { BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Icono } from '@/components/tropero/icono'
import { Grupo, Opciones, PanelLateral } from '@/components/tropero/panel-lateral'
import { ROLES, SECCIONES, nombreRol, seccionesSugeridas, type Rol, type Seccion } from '@/features/empresa/secciones'
import { cn } from '@/lib/utils'
import { celularLindo, linkInvitacion, useCambiarSecciones, useInvitar, useQuitarPersona, whatsappInvitacion, type Persona } from './api'

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

/** Invitar: quién es, qué hace y qué va a ver (el rol propone, el dueño decide). */
export function InvitarPanel({ abierto, empresa, rolInicial, onCerrar }: { abierto: boolean; empresa: string; rolInicial?: Rol; onCerrar: () => void }) {
  const invitar = useInvitar()
  const [nombre, setNombre] = useState('')
  const [celular, setCelular] = useState('')
  const [rol, setRol] = useState<Rol | ''>(rolInicial ?? '')
  const [secciones, setSecciones] = useState<Seccion[]>(rolInicial ? seccionesSugeridas(rolInicial) : [])
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

export function EditarPanel({ persona, onCerrar }: { persona: Persona | null; onCerrar: () => void }) {
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
      toast.success(`Listo: ${nombre} ahora ve ${SECCIONES.filter((s) => secciones.includes(s.id)).map((s) => s.texto).join(', ')}`, { description: 'Lo ve la próxima vez que abra Troppero.' })
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
