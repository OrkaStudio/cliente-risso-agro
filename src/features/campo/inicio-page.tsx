import { useState, useSyncExternalStore } from 'react'
import { BotonPrincipal } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import { useAuth } from '@/features/auth/auth-context'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { saludo } from '@/features/inicio/tropero/dia'
import { useMapa } from '@/features/mapa/api'
import { useMapaPendiente } from '@/features/mapa/bloqueo'
import tranquera from '@/assets/tropero/tranquera.webp'
import { HoyCelu } from './hoy-celu'


/**
 * Hoy · El día en el celular (página 35): la foto con el campo elegido, lo
 * que hay para hacer hoy en ese campo y sus cabezas. Antes, si no hay señal, el aviso.
 * Sin el mapa armado, «Hoy, sin campo». (La recorrida y sus observaciones sin subir
 * salieron de la app el 18/11: se hacen por WhatsApp con el bot; archivo/.)
 */
export function CampoInicioPage() {
  return useMapaPendiente() ? <HoySinCampo /> : <Hoy />
}

/** Si el teléfono tiene señal (se actualiza al perderla o recuperarla). */
function useEnLinea(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      window.addEventListener('online', avisar)
      window.addEventListener('offline', avisar)
      return () => {
        window.removeEventListener('online', avisar)
        window.removeEventListener('offline', avisar)
      }
    },
    () => navigator.onLine,
    () => true,
  )
}

function Hoy() {
  const enLinea = useEnLinea()

  return (
    // Sin margen propio abajo: HoyCelu ya trae el suyo (pb-6), el mismo que Campos, Hacienda y Plata.
    <div className="h-full overflow-y-auto">
      <HoyCelu
        antes={
          !enLinea && (
            <p className="flex items-center gap-2.5 rounded-[14px] bg-estado-atencion-suave px-4 py-3 text-[14px] font-semibold text-estado-atencion-texto">
              <Icono nombre="Sin señal" tamano={16} /> Sin señal: trabajás igual y se sube solo cuando vuelva.
            </p>
          )
        }
      />
    </div>
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
    <div className="flex h-full flex-col gap-8 overflow-y-auto px-4 pt-[calc(var(--enc,0px)+12px)] pb-[calc(var(--barra,0px)+24px)]">
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
