import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BotonPrincipal } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import { useAuth } from '@/features/auth/auth-context'
import { ListaCambiarCuenta } from '@/features/empresa/elegir-cuenta'
import { useCuentas, useEmpresa } from '@/features/empresa/use-empresa'
import { saludo } from '@/features/inicio/tropero/dia'
import { useMapa } from '@/features/mapa/api'
import { useMapaPendiente } from '@/features/mapa/bloqueo'
import { setForceOficina } from '@/lib/campo-mode'
import { cn } from '@/lib/utils'
import textura from '@/assets/tropero/textura-campo.webp'
import { HoyCelu } from './hoy-celu'
import { useRecorrida } from './recorrida/use-recorrida'


/**
 * Hoy · El día en el celular (página 35): la foto con el campo elegido, lo
 * que hay para hacer hoy en ese campo y sus cabezas. Antes, lo que no puede
 * esperar del Modo Campo: sin señal, lo que falta subir y las recorridas
 * abiertas para retomar. Sin el mapa armado, «Hoy, sin campo».
 */
export function CampoInicioPage() {
  return useMapaPendiente() ? <HoySinCampo /> : <Hoy />
}

function Hoy() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: membresia } = useEmpresa()
  const r = useRecorrida()
  const crudo = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''

  return (
    <div className="h-full overflow-y-auto bg-fondo pb-8">
      <HoyCelu
        cuenta={<MenuCuenta inicial={(crudo || membresia?.empresa?.nombre || 'T').charAt(0)} />}
        antes={
          (!r.online || r.sinSubir > 0 || r.errores.length > 0 || r.abiertas.length > 0) && (
            <div className="flex flex-col gap-3">
              <Pendientes r={r} />
              {r.abiertas.map((a) => (
                <button
                  key={a.recorridaId}
                  type="button"
                  onClick={async () => {
                    await r.activar(a.recorridaId)
                    navigate('/campo/recorrida')
                  }}
                  className="flex items-center gap-3.5 rounded-[18px] border-2 bg-superficie px-4 py-3.5 text-left"
                  style={{ borderColor: a.color.hex }}
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-[14px] font-heading text-[19px] font-extrabold text-white" style={{ background: a.color.hex }}>
                    {a.color.letra}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-heading text-[17px] font-extrabold text-texto">Seguí la recorrida de {a.campoNombre}</span>
                    <span className="text-[13.5px] text-texto-suave">
                      {a.hechos} de {a.total} potreros hechos
                    </span>
                  </span>
                  <Icono nombre="Siguiente" />
                </button>
              ))}
            </div>
          )
        }
      />
    </div>
  )
}

/** Lo que el Modo Campo no puede callar: sin señal, lo que falta subir y lo que se rechazó. */
function Pendientes({ r }: { r: ReturnType<typeof useRecorrida> }) {
  return (
    <>
      {!r.online && (
        <p className="flex items-center gap-2.5 rounded-[14px] bg-estado-atencion-suave px-4 py-3 text-[14px] font-semibold text-estado-atencion-texto">
          <Icono nombre="Sin señal" tamano={16} /> Sin señal: trabajás igual y se sube solo cuando vuelva.
        </p>
      )}
      {r.sinSubir > 0 && (
        <p className="flex items-center gap-2.5 rounded-[14px] bg-superficie px-4 py-3 text-[14px] text-texto-suave">
          <span className={cn('inline-flex', r.sincronizando && 'animate-spin')}>
            <Icono nombre="Reintentar" tamano={16} />
          </span>
          <span>
            <b className="text-texto">
              {r.sinSubir === 1 ? '1 observación' : `${r.sinSubir} observaciones`}
            </b>{' '}
            sin subir: se sube sola.
          </span>
        </p>
      )}
      {r.errores.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[14px] bg-estado-problema-suave px-4 py-3">
          <p className="text-[14px] font-bold text-estado-problema-texto">
            {r.errores.length === 1 ? 'Una observación no se pudo guardar' : `${r.errores.length} observaciones no se pudieron guardar`}
          </p>
          <ul className="text-[13px] text-estado-problema-texto">
            {r.errores.slice(0, 3).map((e) => (
              <li key={`${e.recorrida_id}-${e.potrero_id}`}>{e.error ?? 'Error al subir'}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void r.descartarErrores()}
            className="h-10 self-start rounded-full border-[1.5px] border-estado-problema-texto/50 bg-superficie px-4 text-[14px] font-bold text-estado-problema-texto"
          >
            Descartarlas
          </button>
        </div>
      )}
    </>
  )
}

/** El avatar: el historial, la Oficina en el celular y salir (con confirmación de dos toques). */
function MenuCuenta({ inicial }: { inicial: string }) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [salir, setSalir] = useState(false)
  // Con varias cuentas (un veterinario que atiende varios campos), el cambio vive acá.
  const varias = (useCuentas().data?.cuentas.length ?? 0) > 1
  const [cuentas, setCuentas] = useState(false)
  return (
    <div className="relative ml-auto">
      <button
        type="button"
        aria-label="Tu cuenta"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="grid size-10 place-items-center rounded-full bg-acento font-heading text-[16px] font-extrabold text-acento-texto"
      >
        {inicial.toUpperCase()}
      </button>
      {abierto && (
        <ul className="absolute top-12 right-0 z-20 min-w-[230px] overflow-hidden rounded-[14px] bg-superficie py-1.5 text-texto shadow-lg">
          {varias && (
            <li className="border-b border-borde">
              {cuentas ? (
                <ListaCambiarCuenta onElegido={() => setCuentas(false)} />
              ) : (
                <button type="button" onClick={() => setCuentas(true)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[15px] font-semibold">
                  <Icono nombre="Usuario" tamano={16} /> Cambiar de cuenta
                </button>
              )}
            </li>
          )}
          <li>
            <button
              type="button"
              onClick={() => {
                setForceOficina(true)
                navigate('/')
              }}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[15px]"
            >
              <Icono nombre="Oficina" tamano={16} /> Ir a la Oficina
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => (salir ? void signOut() : setSalir(true))}
              className={cn('flex w-full items-center gap-2.5 px-4 py-3 text-left text-[15px]', salir && 'bg-estado-problema-suave font-bold text-estado-problema-texto')}
            >
              <Icono nombre="Salir" tamano={16} /> {salir ? '¿Seguro? Tocá de nuevo' : 'Cerrar sesión'}
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

/** Celu · Hoy, sin campo (página 35): el campo se arma mejor en la compu. */
function HoySinCampo() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: membresia } = useEmpresa()
  const { data: campos } = useMapa(membresia?.empresa_id)
  const [mandado, setMandado] = useState(false)
  const crudo = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const nombre = crudo.charAt(0).toLocaleUpperCase('es-AR') + crudo.slice(1)
  const primero = campos?.find((c) => !c.contorno) ?? campos?.[0]
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-fondo px-[18px] pt-[max(20px,env(safe-area-inset-top))] pb-6">
      <h1 className="titulo-display text-[34px] leading-tight text-texto">{saludo(new Date().getHours(), nombre).replace(/\.$/, '')}</h1>
      <div className="relative mt-4 grid h-[260px] place-items-center overflow-hidden rounded-[24px] bg-superficie-hundida">
        <img src={textura} alt="" className="absolute inset-0 size-full object-cover opacity-30" />
        <div className="relative grid h-[160px] w-[78%] place-items-center rounded-[18px] border-2 border-dashed border-texto-suave/50">
          <p className="font-heading text-[16px] font-extrabold text-texto-suave">Tu campo va a estar acá</p>
        </div>
      </div>
      <h2 className="mt-7 font-heading text-[22px] font-extrabold text-texto">Todavía no armaste tu campo</h2>
      <p className="mt-2 text-[15px] leading-snug text-texto-suave">
        Con el campo y sus potreros cargados, el celular te ubica en cada uno en la recorrida y en la manga.
      </p>
      <p className="mt-5 flex items-center gap-2.5 rounded-[14px] bg-estado-atencion-suave px-4 py-3 text-[14px] font-semibold text-estado-atencion-texto">
        <Icono nombre="Campos" tamano={16} /> Lo primero es armar el campo. Después se abre todo.
      </p>
      <div className="mt-auto flex flex-col gap-3 pt-6">
        {mandado ? (
          <p role="status" className="rounded-[18px] bg-estado-bien-suave px-4 py-3 text-center text-[15px] font-semibold text-estado-bien-texto">
            Listo: abrí el link en la compu.
          </p>
        ) : (
          <BotonPrincipal
            icono="Mail"
            onClick={() => {
              const link = `${window.location.origin}/mapa${primero ? `/${primero.id}` : ''}`
              const celular = (user?.phone ?? '').replace(/\D/g, '')
              window.open(`https://wa.me/${celular}?text=${encodeURIComponent(`Troppero: abrí este link en la compu para armar tu campo en el mapa ${link}`)}`, '_blank', 'noopener')
              setMandado(true)
            }}
          >
            Mandame el link a la compu
          </BotonPrincipal>
        )}
        <button
          type="button"
          onClick={() => navigate(primero ? `/mapa/${primero.id}` : '/mapa')}
          className="h-14 rounded-full border-[1.5px] border-principal text-[16.5px] font-bold text-principal"
        >
          Armarlo desde el celular
        </button>
      </div>
    </div>
  )
}
