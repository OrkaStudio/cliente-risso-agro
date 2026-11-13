import { useState } from 'react'
import { toast } from 'sonner'
import { BotonPrincipal } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Icono } from '@/components/tropero/icono'
import { Grupo, Opciones, PanelLateral } from '@/components/tropero/panel-lateral'
import { CampoCelular } from '@/features/acceso/campo-celular'
import { NIVELES, ROLES, SECCIONES_CON_PERMISO, nombreRol, resumenNiveles, type Niveles, type Rol, type RolConocido } from '@/features/empresa/secciones'
import { normalizarCelularAR } from '@/lib/telefono'
import { nombrePropio, primeraMayuscula } from '@/lib/texto'
import { cn } from '@/lib/utils'
import { celularLindo, linkInvitacion, useCambiarNiveles, useInvitar, useQuitarPersona, whatsappInvitacion, type Persona } from './api'

/**
 * Qué puede hacer en cada sección (permisos, 13/11): una fila por sección, con
 * lo que hay adentro, y los cuatro niveles. Nada viene elegido: decide el dueño.
 * Debajo, en palabras simples, qué significa lo elegido.
 */
function ElegirNiveles({ niveles, onCambiar }: { niveles: Niveles; onCambiar: (n: Niveles) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {SECCIONES_CON_PERMISO.map((s) => {
        const elegido = niveles[s.id]
        return (
          <div key={s.id} className="rounded-[18px] border border-borde bg-superficie px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-superficie-hundida text-texto">
                <Icono nombre={s.icono} tamano={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-texto">{s.texto}</span>
                <span className="block text-[13.5px] text-texto-suave">{s.queHay}</span>
              </span>
            </div>
            <div role="radiogroup" aria-label={`Qué puede hacer en ${s.texto}`} className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {NIVELES.map((n) => {
                const si = elegido === n.id
                return (
                  <button
                    key={n.id}
                    type="button"
                    role="radio"
                    aria-checked={si}
                    onClick={() => onCambiar({ ...niveles, [s.id]: n.id })}
                    className={cn(
                      'h-10 rounded-full border-[1.5px] px-3 text-[14px] font-semibold transition-colors',
                      si ? 'border-acento bg-acento text-acento-texto' : 'border-borde bg-superficie text-texto hover:border-neutro-300',
                    )}
                  >
                    {n.texto}
                  </button>
                )
              })}
            </div>
            {elegido && <p className="mt-2 text-[13.5px] text-texto-suave">{NIVELES.find((n) => n.id === elegido)!.explica}</p>}
          </div>
        )
      })}
    </div>
  )
}

const SIN_ELEGIR = 'Elegí qué puede hacer en cada sección.'
const SIN_NADA = 'Tiene que poder ver o cargar al menos una sección.'

/** Falta elegir alguna sección, o todo quedó en «No ve». */
function faltaElegir(n: Niveles): string | null {
  if (SECCIONES_CON_PERMISO.some((s) => !n[s.id])) return SIN_ELEGIR
  if (SECCIONES_CON_PERMISO.every((s) => n[s.id] === 'no')) return SIN_NADA
  return null
}

/** Invitar: quién es, qué hace (sólo lo nombra) y qué puede hacer en cada sección (lo elige el dueño). */
export function InvitarPanel({ abierto, empresa, rolInicial, onCerrar }: { abierto: boolean; empresa: string; rolInicial?: Rol; onCerrar: () => void }) {
  const invitar = useInvitar()
  const [nombre, setNombre] = useState('')
  const [celular, setCelular] = useState('')
  // Qué hace: uno de los conocidos u «Otro», que escribe el dueño («Contador»).
  const [tipoRol, setTipoRol] = useState<RolConocido | 'otro' | ''>((rolInicial as RolConocido | undefined) ?? '')
  const [otroRol, setOtroRol] = useState('')
  const rol: Rol | '' = tipoRol === 'otro' ? otroRol.trim() : tipoRol
  const [niveles, setNiveles] = useState<Niveles>({})
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    setError(null)
    if (!nombre.trim()) return setError('Escribí cómo se llama.')
    if (!cel) return setError('Ese número no parece un celular argentino: característica y número, sin el 0 ni el 15.')
    if (!tipoRol) return setError('Tocá qué hace en el campo.')
    if (tipoRol === 'otro' && otroRol.trim().length < 2) return setError('Escribí qué hace en el campo.')
    const falta = faltaElegir(niveles)
    if (falta) return setError(falta)
    try {
      setToken(await invitar.mutateAsync({ nombre: nombre.trim(), celular: cel, rol, niveles }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo invitar. Probá de nuevo.')
    }
  }

  const cel = normalizarCelularAR(celular)?.slice(1) ?? null
  if (token && cel)
    return (
      <PanelLateral
        abierto={abierto}
        onCerrar={onCerrar}
        titulo={`Listo: invitaste a ${nombre.trim().split(' ')[0]}`}
        bajada="Mandale el link por WhatsApp: entra con su celular, sin contraseña. Vence en 7 días."
        chico
        pie={
          <div className="flex flex-col gap-2.5">
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
        <TarjetaPersona nombre={nombre.trim()} rol={rol} celular={cel} niveles={niveles} />
      </PanelLateral>
    )

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Invitar a alguien"
      bajada="Le llega un link por WhatsApp y entra con su celular. Vos elegís qué ve y qué carga; lo cambiás cuando quieras."
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
        <CampoTexto etiqueta="Cómo se llama" placeholder="Juan Pérez" autoCapitalize="words" value={nombre} onChange={(e) => setNombre(nombrePropio(e.target.value))} autoFocus />
        <CampoCelular etiqueta="Su celular, el que tiene WhatsApp" valor={celular} onCambio={setCelular} />
      </div>
      <Grupo titulo="Qué hace en el campo" className="mt-6">
        <Opciones
          etiqueta="Qué hace"
          opciones={[...ROLES, { valor: 'otro' as const, texto: 'Otro' }]}
          elegidas={tipoRol ? [tipoRol] : []}
          // El rol sólo lo nombra: no trae permisos armados (Lau, 13/11).
          onTocar={setTipoRol}
        />
        {tipoRol === 'otro' && (
          <CampoTexto className="mt-3" etiqueta="Qué hace" placeholder="Contador, ingeniero agrónomo…" value={otroRol} onChange={(e) => setOtroRol(primeraMayuscula(e.target.value))} autoFocus maxLength={40} />
        )}
      </Grupo>
      <Grupo titulo="Qué puede hacer en cada sección">
        <ElegirNiveles niveles={niveles} onCambiar={setNiveles} />
      </Grupo>
      <Resumen niveles={niveles} nombre={nombre} />
    </PanelLateral>
  )
}

export function EditarPanel({ persona, empresa, onCerrar }: { persona: Persona | null; empresa: string; onCerrar: () => void }) {
  // La última abierta queda mientras el panel sale.
  const [ultima, setUltima] = useState(persona)
  if (persona && persona !== ultima) setUltima(persona)
  const p = persona ?? ultima
  if (!p) return null
  return <Editar key={p.userId ?? p.invitacionId} p={p} empresa={empresa} abierto={!!persona} onCerrar={onCerrar} />
}

function Editar({ p, empresa, abierto, onCerrar }: { p: Persona; empresa: string; abierto: boolean; onCerrar: () => void }) {
  const cambiar = useCambiarNiveles()
  const quitar = useQuitarPersona()
  const [niveles, setNiveles] = useState<Niveles>(p.niveles ?? {})
  const [seguro, setSeguro] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendiente = !!p.invitacionId
  const vencida = pendiente && !!p.venceAt && new Date(p.venceAt) < new Date()
  const venceEl = p.venceAt ? new Date(p.venceAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }) : ''
  const nombre = p.nombre.split(' ')[0]

  async function guardar() {
    setError(null)
    const falta = faltaElegir(niveles)
    if (falta) return setError(falta === SIN_NADA ? `${falta} Para que no entre más, sacale el acceso.` : falta)
    try {
      await cambiar.mutateAsync({ userId: p.userId!, niveles })
      onCerrar()
      toast.success(`Listo: cambiaste lo que puede hacer ${nombre}`, { description: `${resumenNiveles(niveles)} Rige la próxima vez que abra Troppero.` })
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
      titulo={pendiente ? `La invitación de ${nombre}` : `Qué puede hacer ${nombre}`}
      bajada={pendiente ? (vencida ? 'El link venció. Cancelala e invitalo de nuevo.' : `Todavía no entró. El link vence el ${venceEl}.`) : [nombreRol(p.rol), celularLindo(p.celular)].join(' · ')}
      ancho={!pendiente}
      chico={pendiente}
      pie={
        <>
          {error && <p role="alert" className="mb-3 rounded-[14px] bg-estado-problema-suave px-4 py-2.5 text-[14px] font-semibold text-estado-problema-texto">{error}</p>}
          {pendiente && p.token && !vencida && !seguro && (
            <a href={whatsappInvitacion({ celular: p.celular, nombre: p.nombre, empresa, token: p.token })} target="_blank" rel="noreferrer" className="inline-flex h-14 w-full items-center justify-between rounded-full bg-principal py-2 pr-2 pl-[26px] text-[16.5px] font-bold text-principal-texto hover:bg-terracota-600">
              Mandárselo de nuevo por WhatsApp
              <span className="grid size-12 place-items-center rounded-full bg-acento text-acento-texto">
                <Icono nombre="Celular" tamano={16} />
              </span>
            </a>
          )}
          {!pendiente && (
            <BotonPrincipal icono="Guardar" cargando={cambiar.isPending} disabled={cambiar.isPending} onClick={() => void guardar()}>
              Guardar
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
        <>
          <TarjetaPersona nombre={p.nombre} rol={p.rol} celular={p.celular} niveles={p.niveles ?? {}} pendiente />
          <p className="mt-3 text-[14px] text-texto-suave">Cuando entre, le cambiás lo que puede hacer desde la tabla.</p>
        </>
      ) : (
        <>
          <ElegirNiveles niveles={niveles} onCambiar={setNiveles} />
          <Resumen niveles={niveles} nombre={p.nombre} />
        </>
      )}
    </PanelLateral>
  )
}

/** Quién es y qué va a ver, de un vistazo: para confirmar una invitación o revisarla. */
function TarjetaPersona({ nombre, rol, celular, niveles, pendiente = false }: { nombre: string; rol: string; celular: string; niveles: Niveles; pendiente?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-principal/25 bg-gradient-to-br from-terracota-50 to-trigo-100">
      <div className="flex items-center gap-4 px-5 pt-5">
        <span className={cn('grid size-14 shrink-0 place-items-center rounded-full font-heading text-[22px] font-extrabold', pendiente ? 'border-2 border-dashed border-principal/60 bg-superficie text-principal' : 'bg-principal text-principal-texto')}>
          {nombre.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[19px] font-bold text-texto">{nombre}</p>
          <p className="truncate text-[14.5px] text-texto-suave">{nombreRol(rol)}</p>
          <p className="t-cifra text-texto">{celularLindo(celular)}</p>
        </div>
      </div>
      <div className="mt-4 border-t border-principal/15 bg-superficie/70 px-5 py-4">
        <p className="text-[13px] font-bold tracking-[0.04em] text-texto-suave uppercase">Va a poder</p>
        <p className="mt-1.5 text-[15px] text-texto">{resumenNiveles(niveles)}</p>
      </div>
    </div>
  )
}

/** En una frase, lo que va a poder hacer, para confirmar antes de invitar o guardar. */
function Resumen({ niveles, nombre }: { niveles: Niveles; nombre: string }) {
  if (faltaElegir(niveles)) return <p className="mt-4 text-[14px] text-texto-suave">Configuración (las personas, el plan y la baja) sólo la ves vos.</p>
  return (
    <p className="mt-4 rounded-[16px] bg-principal-suave/60 px-4 py-3 text-[15px] text-texto">
      <b>{nombre.trim().split(' ')[0] || 'Esta persona'}:</b> {resumenNiveles(niveles)}
    </p>
  )
}
