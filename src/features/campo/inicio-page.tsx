import { useState } from 'react'
import { BotonPrincipal } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import { useAuth } from '@/features/auth/auth-context'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { saludo } from '@/features/inicio/tropero/dia'
import { useMapa } from '@/features/mapa/api'
import { useMapaPendiente } from '@/features/mapa/bloqueo'
import { cn } from '@/lib/utils'
import tranquera from '@/assets/tropero/tranquera.webp'
import { Logo } from '@/components/tropero/logo'
import { HoyCelu } from './hoy-celu'
import { MenuCuenta } from './menu-cuenta'
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
  const { user } = useAuth()
  const { data: membresia } = useEmpresa()
  const r = useRecorrida()
  const crudo = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''

  return (
    <div className="h-full overflow-y-auto pb-8">
      <HoyCelu
        cuenta={<MenuCuenta inicial={(crudo || membresia?.empresa?.nombre || 'T').charAt(0)} />}
        antes={
          (!r.online || r.sinSubir > 0 || r.errores.length > 0) && (
            <div className="flex flex-col gap-3">
              <Pendientes r={r} />
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



/** Celu · Hoy, sin campo (página 35): el campo se arma mejor en la compu. */
function HoySinCampo() {
  const { user } = useAuth()
  const { data: membresia } = useEmpresa()
  const { data: campos } = useMapa(membresia?.empresa_id)
  const [mandado, setMandado] = useState(false)
  const crudo = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const nombre = crudo.charAt(0).toLocaleUpperCase('es-AR') + crudo.slice(1)
  const primero = campos?.find((c) => !c.contorno) ?? campos?.[0]
  return (
    <div className="flex h-full flex-col gap-8 overflow-y-auto px-4 pt-[max(12px,env(safe-area-inset-top))] pb-6">
      <div className="flex items-center justify-between gap-2">
        <Logo alto={24} />
        <MenuCuenta inicial={(crudo || membresia?.empresa?.nombre || 'T').charAt(0)} />
      </div>
      {/* La misma portada que Hoy: el campo todavía está por armarse. */}
      <div className="relative h-[240px] overflow-hidden rounded-[20px] bg-[#de8c61]">
        <img src={tranquera} alt="" className="absolute bottom-0 left-0 w-full origin-bottom scale-[1.04] [mask-image:linear-gradient(180deg,transparent_0,transparent_6%,#000_14%)]" />
        <h1 className="absolute inset-x-[18px] top-5 titulo-display text-[28px] leading-[1.02] text-[#2a1208]">{saludo(new Date().getHours(), nombre)}</h1>
      </div>
      <section aria-labelledby="sin-campo" className="flex flex-col gap-4 rounded-[20px] border border-borde bg-superficie p-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="sin-campo" className="titulo-display text-[20px] leading-tight text-texto">
            Primero, tu campo en el mapa
          </h2>
          <p className="text-[13.5px] text-texto-suave">Con el campo y sus potreros, Troppero sabe dónde pasa cada cosa que le mandás. Se arma en la compu, en unos minutos.</p>
        </div>
        {mandado ? (
          <p role="status" className="rounded-full bg-estado-bien-suave px-4 py-2.5 text-center text-[15px] font-semibold text-estado-bien-texto">
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
      </section>
    </div>
  )
}
