import { useState } from 'react'
import { toast } from 'sonner'
import { Boton, BotonPrincipal } from '@/components/tropero/boton'
import { useAccion } from '@/components/tropero/use-accion'
import { Icono } from '@/components/tropero/icono'
import { PanelLateral } from '@/components/tropero/panel-lateral'
import { linkWhatsapp } from '@/features/guia/whatsapp'
import { useBaja, useDeshacerBaja, usePedirBaja } from './api'

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * Darse de baja, en el Plan (Lau, 13/11; lo exige la ley). Se ve sin buscarla, pero
 * no compite con el resto: un texto y un botón secundario. Antes de confirmar dice
 * qué va a pasar; después, desde cuándo y hasta cuándo se puede deshacer.
 */
export function Baja({ empresaId, empresa, nombre }: { empresaId: string | undefined; empresa: string; nombre: string | null }) {
  const baja = useBaja(empresaId)
  const pedir = usePedirBaja(empresaId)
  const deshacer = useDeshacerBaja(empresaId)
  const [abierto, setAbierto] = useState(false)
  // Pedir la baja y deshacerla cambian la pantalla (el aviso de la baja aparece o se va): eso
  // confirma, sin «Listo». Si algo no sale, el motivo lo dice el botón.
  const pedirAccion = useAccion(
    async () => {
      await pedir.mutateAsync(undefined)
      return () => toast.success('Listo: pediste la baja', { description: 'Lo ves en el Plan, con la fecha y el número de trámite. Lo podés deshacer ahí.' })
    },
    { sinListo: true, alTerminar: () => setAbierto(false) },
  )
  const deshacerAccion = useAccion(
    async () => {
      await deshacer.mutateAsync(undefined)
      return () => toast.success('Listo: seguís con Troppero', { description: 'Deshiciste la baja. No cambia nada.' })
    },
    { sinListo: true },
  )
  const copia = linkWhatsapp({ nombre, empresa, seccion: 'Configuración, la baja', consulta: 'Me di de baja y quiero la copia de mis datos.' })

  if (baja.data)
    return (
      <section aria-label="Baja" className="flex flex-col gap-4 rounded-[24px] border border-estado-problema/40 bg-estado-problema-suave p-6">
        <div>
          <h2 className="t-tarjeta text-estado-problema-texto">Pediste la baja el {fecha(baja.data.pedidaAt)}</h2>
          <p className="mt-1 text-[15px] text-estado-problema-texto">
            Desde ese día no se cobra nada. Hasta el {fecha(baja.data.borrarDesde)} todo sigue como está; después borramos los datos de {empresa}. Número de trámite: {baja.data.id}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Boton icono="Reintentar" accion={deshacerAccion} className="h-11 gap-2 rounded-full px-5 text-[15px] font-bold">
            Deshacer la baja
          </Boton>
          {copia && (
            <a href={copia} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border-[1.5px] border-borde bg-superficie px-5 text-[15px] font-bold text-texto hover:border-principal hover:text-principal">
              <Icono nombre="Descargar" tamano={16} />
              Pedir la copia de mis datos
            </a>
          )}
        </div>
      </section>
    )

  return (
    <section aria-label="Darte de baja" className="flex flex-wrap items-center justify-between gap-4 border-t border-borde pt-5">
      <div className="max-w-[560px]">
        <h2 className="text-[16px] font-bold text-texto">Darte de baja</h2>
        <p className="mt-0.5 text-[14.5px] text-texto-suave">Si ya no querés usar Troppero, la das de baja acá. Tenés 30 días para arrepentirte o pedir una copia de tus datos.</p>
      </div>
      <button type="button" onClick={() => setAbierto(true)} className="inline-flex h-11 items-center rounded-full border-[1.5px] border-borde bg-superficie px-5 text-[15px] font-bold text-texto hover:border-estado-problema hover:text-estado-problema-texto">
        Dar de baja
      </button>

      <PanelLateral
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        chico
        titulo={`¿Das de baja ${empresa}?`}
        bajada="Sirve para dejar de usar Troppero. Lo podés deshacer durante 30 días."
        pie={
          <BotonPrincipal icono="Cerrar" accion={pedirAccion}>
            Sí, dar de baja
          </BotonPrincipal>
        }
      >
        <div className="flex flex-col gap-2.5">
          <p className="text-[14px] font-bold text-texto">Esto va a pasar</p>
          <ul className="flex flex-col gap-2 text-[15px] text-texto">
            {[
              'Desde hoy no se cobra nada.',
              'Durante 30 días todo sigue igual: podés pedir tu copia o arrepentirte.',
              `Pasados los 30 días borramos los datos de ${empresa}, también los de tu gente.`,
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-principal" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </PanelLateral>
    </section>
  )
}
