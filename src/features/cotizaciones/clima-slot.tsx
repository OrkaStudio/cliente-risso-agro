import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { MapPin, Snowflake } from 'lucide-react'
import { useCampoClima } from '@/features/cotizaciones/campo-clima'
import { useClima } from '@/features/cotizaciones/hooks'
import { WmoIcon } from '@/features/cotizaciones/wmo-icon'
import { cn } from '@/lib/utils'
import { BotonPrincipal } from '@/components/tropero/boton'
import { PanelLateral } from '@/components/tropero/panel-lateral'
import { useCamposConPotreros } from '@/features/campos/hooks'
import type { CampoConPotreros } from '@/features/campos/api'
import { useActualizarCampo } from '@/features/campos/hooks'
import { useCampoElegidoId } from '@/features/campos/campo-elegido'
import { LocalidadCampo } from '@/features/onboarding/tropero/localidad-campo'
import type { Localidad } from '@/lib/geocoding'
import { ICONO_PILDORA, PILDORA } from './pildora'

/**
 * El clima en la barra superior (Open-Meteo): temperatura, máx/mín y aviso de
 * helada, del campo elegido en la barra izquierda (con «Todos tus campos», el
 * primero con ubicación, con su nombre a la vista). Acá no se elige. Sin campo ubicado, se
 * ubica ahí mismo (Lau, 24/11: el botón tiene que llevar a la acción). Si la fuente falla, no muestra nada (nunca un valor de muestra).
 */
export function ClimaSlot() {
  const [ubicar, setUbicar] = useState(0)
  return (
    <>
      <Pildora onUbicar={() => setUbicar((v) => v + 1)} />
      {/* Afuera de la píldora y armado al abrir: al ubicar uno, la píldora pasa a mostrar el clima
          y el panel sigue abierto para los demás (antes se cerraba solo). */}
      {ubicar > 0 && <UbicarCampo key={ubicar} abierto onCerrar={() => setUbicar(0)} />}
    </>
  )
}

function Pildora({ onUbicar }: { onUbicar: () => void }) {
  const { actual, cargando } = useCampoClima()
  const clima = useClima(actual?.ubicacion ?? null)
  const navigate = useNavigate()
  const campos = useCamposConPotreros()
  const elegidoId = useCampoElegidoId()
  // El campo elegido en la barra sin ubicar: se pide ubicar ése, no se muestra el clima de otro.
  const elegidoSinUbicar = (campos.data ?? []).find((c) => c.id === elegidoId && (c.ubicacion.lat == null || c.ubicacion.lon == null))

  if (cargando) return null
  if (!actual || elegidoSinUbicar) {
    return (
      <>
        {/* Sin ningún campo todavía, lo primero es sumarlo (en Campos); con campos, se ubica acá. */}
        <button type="button" onClick={() => ((campos.data ?? []).length ? onUbicar() : navigate('/campos'))} className={cn(PILDORA, 'text-[13px] font-semibold text-principal')}>
          <span className={cn(ICONO_PILDORA, 'bg-principal-suave')}><MapPin /></span>
          {elegidoSinUbicar ? `Ubicá ${elegidoSinUbicar.nombre} para ver su clima` : 'Ubicá tu campo para ver el clima'}
        </button>
      </>
    )
  }
  if (!clima.data) return null
  const d = clima.data
  return (
    <div
      title={`${d.descripcion} · lluvia ${d.lluviaProb} %${d.lluviaMm > 0 ? ` (${d.lluviaMm} mm)` : ''}`}
      className={cn(PILDORA, 'cursor-default hover:border-borde')}
    >
      <span className={cn(ICONO_PILDORA, 'bg-trigo-100 text-trigo-700')}><WmoIcon code={d.code} className="size-4" /></span>
      <span className="text-[13px] text-texto-suave">{actual.nombre}</span>
      <b className="t-cifra-chica font-bold text-texto">{d.temp}°</b>
      <span className="t-cifra-mini hidden text-texto-suave lg:inline">
        {d.max}° / {d.min}°
      </span>
      {d.helada && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#e1ebf2] px-2 py-0.5 text-[11.5px] font-bold text-[#215a7e]">
          <Snowflake className="size-3" />
          Helada
        </span>
      )}
    </div>
  )
}

/**
 * Ubicar los campos (Lau, 24/11): todos los que no tienen ubicación, cada uno con su pueblo
 * y su botón (no sólo el primero). El elegido en la barra va arriba. Guarda lo mismo que el
 * alta del campo (pueblo, provincia y coordenadas): con eso se ve el clima, la ficha del campo
 * dice dónde está y el mapa arranca en ese pueblo (y en Buenos Aires, por la partida de ARBA).
 */
function UbicarCampo({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const campos = useCamposConPotreros()
  const elegidoId = useCampoElegidoId()
  // Los que faltan, tomados al abrir: uno que se ubica queda en la lista con su tilde.
  const sinUbicar = (campos.data ?? []).filter((c) => c.ubicacion.lat == null || c.ubicacion.lon == null)
  const [lista] = useState(() => [...sinUbicar].sort((a, b) => Number(b.id === elegidoId) - Number(a.id === elegidoId)))
  const [hechos, setHechos] = useState<Record<string, string>>({})
  const quedan = lista.filter((c) => !hechos[c.id]).length
  if (!lista.length) return null
  return (
    <PanelLateral
      chico
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={lista.length === 1 ? `¿Dónde está ${lista[0]!.nombre}?` : '¿Dónde están tus campos?'}
      bajada="Escribí el pueblo más cercano y elegilo de la lista. Con eso ves el clima y si viene helada, y el mapa arranca ahí."
      pie={
        <BotonPrincipal icono="Siguiente" className="w-full" onClick={onCerrar}>
          {quedan === 0 ? 'Listo' : Object.keys(hechos).length ? `Listo por ahora (faltan ${quedan})` : 'Después'}
        </BotonPrincipal>
      }
    >
      <ul className="flex flex-col gap-3">
        {lista.map((c) => (
          <li key={c.id}>
            {hechos[c.id] ? (
              <p className="flex items-center gap-2.5 rounded-[16px] bg-pasto-50 px-3.5 py-3 text-[14.5px] text-texto shadow-[inset_0_0_0_1px_var(--color-pasto-200)]">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-pasto-600 text-white">
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                </span>
                <span>
                  <b>{c.nombre}</b> quedó en {hechos[c.id]}
                </span>
              </p>
            ) : (
              <UbicarUno campo={c} varios={lista.length > 1} onListo={(pueblo) => setHechos((h) => ({ ...h, [c.id]: pueblo }))} />
            )}
          </li>
        ))}
      </ul>
    </PanelLateral>
  )
}

function UbicarUno({ campo, varios, onListo }: { campo: CampoConPotreros; varios: boolean; onListo: (pueblo: string) => void }) {
  const actualizar = useActualizarCampo()
  const [localidad, setLocalidad] = useState<Localidad | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function guardar() {
    if (!localidad) return setError('Elegí el pueblo de la lista.')
    try {
      // Se manda todo lo del campo tal cual: sólo cambia dónde está.
      await actualizar.mutateAsync({ id: campo.id, nombre: campo.nombre, tipo: campo.tipo, hectareas: campo.hectareas, actividad: campo.actividad, ubicacion: { localidad: localidad.nombre, provincia: localidad.provincia, lat: localidad.lat, lon: localidad.lon } })
      onListo(`${localidad.nombre}, ${localidad.provincia}`)
      toast.success(`Listo: ubicaste ${campo.nombre}`, { description: 'Arriba ya ves el clima.' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se guardó. Probá de nuevo.')
    }
  }
  return (
    <div className={cn('flex flex-col gap-2.5', varios && 'rounded-[18px] bg-superficie p-3 shadow-[inset_0_0_0_1px_var(--borde)]')}>
      <LocalidadCampo enLinea etiqueta={varios ? campo.nombre : 'Dónde está'} valor={localidad} onCambio={(l) => (setLocalidad(l), setError(null))} error={error ?? undefined} />
      {localidad && (
        <button type="button" onClick={() => void guardar()} disabled={actualizar.isPending} className="flex h-11 items-center justify-center rounded-full bg-principal text-[15px] font-bold text-principal-texto disabled:opacity-60">
          Ubicar {campo.nombre} en {localidad.nombre}
        </button>
      )}
    </div>
  )
}
