import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BotonPrincipal } from '@/components/tropero/boton'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase/client'
import { aceptar, leerRecordado, type Via } from './aceptacion'
import { BORRADOR, RESUMEN, VERSION_LEGALES } from './textos'

/**
 * Registra, al entrar, que la persona aceptó la versión vigente (Lau, 12/11):
 * - si recién la aceptó al crear la cuenta o al entrar por una invitación, se guarda sola;
 * - si no la aceptó nunca (cuentas de antes o versión nueva), se le pide antes de seguir.
 *   Mientras los textos sean borrador, eso no se pide.
 */
export function AceptacionLegal() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const clave = ['aceptacion-legal', user?.id, VERSION_LEGALES]
  const { data: aceptada } = useQuery({
    queryKey: clave,
    enabled: !!user,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from('aceptacion_legal').select('id').eq('version', VERSION_LEGALES).maybeSingle()
      if (error) throw error
      return !!data
    },
  })

  const recordado = leerRecordado()
  const enLaCuenta = user?.user_metadata?.acepto_legales === VERSION_LEGALES
  const viaSola: Via | null = recordado?.version === VERSION_LEGALES ? recordado.via : enLaCuenta ? 'registro' : null

  useEffect(() => {
    if (aceptada !== false || !viaSola) return
    void aceptar(viaSola).then(() => qc.setQueryData(clave, true), () => {})
  }, [aceptada, viaSola]) // eslint-disable-line react-hooks/exhaustive-deps

  if (aceptada !== false || viaSola || BORRADOR) return null
  return <PedirAceptacion onAceptar={() => aceptar('actualizacion').then(() => qc.setQueryData(clave, true))} />
}

/** Actualizamos los términos: el resumen de lo que importa y un botón. */
function PedirAceptacion({ onAceptar }: { onAceptar: () => Promise<unknown> }) {
  const [mandando, setMandando] = useState(false)
  const [fallo, setFallo] = useState(false)
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-end bg-tinta/40 sm:place-items-center" role="dialog" aria-modal aria-labelledby="legales-titulo">
      <div className="popup-suave flex w-full max-w-[460px] flex-col gap-4 rounded-t-[28px] bg-fondo px-6 pt-7 pb-[max(24px,env(safe-area-inset-bottom))] sm:rounded-[28px]">
        <div className="flex flex-col gap-1.5">
          <h2 id="legales-titulo" className="t-seccion text-texto">Actualizamos los términos</h2>
          <p className="text-[15px] text-texto-suave">Lo importante, en simple:</p>
        </div>
        <ul className="flex flex-col gap-2 text-[14.5px] text-texto">
          {RESUMEN.noHacemos.slice(0, 2).map((r) => (
            <li key={r.titulo} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-principal" />
              {r.titulo}.
            </li>
          ))}
          <li className="flex gap-2">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-principal" />
            Tus datos son tuyos y te los devolvemos cuando quieras.
          </li>
        </ul>
        <p className="text-[13px] text-texto-suave">
          Leé los{' '}
          <a href="/terminos" target="_blank" rel="noreferrer" className="underline decoration-borde underline-offset-2 hover:text-principal">
            Términos
          </a>{' '}
          y la{' '}
          <a href="/privacidad" target="_blank" rel="noreferrer" className="underline decoration-borde underline-offset-2 hover:text-principal">
            Política de privacidad
          </a>{' '}
          completos.
        </p>
        {fallo && <p className="text-[13px] font-semibold text-estado-problema-texto">No se pudo guardar. Probá de nuevo.</p>}
        <BotonPrincipal
          icono="Siguiente"
          cargando={mandando}
          disabled={mandando}
          onClick={() => {
            setMandando(true)
            setFallo(false)
            onAceptar().catch(() => {
              setFallo(true)
              setMandando(false)
            })
          }}
        >
          Acepto, sigamos
        </BotonPrincipal>
      </div>
    </div>
  )
}
