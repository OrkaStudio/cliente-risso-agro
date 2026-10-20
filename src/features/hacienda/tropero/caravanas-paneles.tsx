import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { BotonPrincipal } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import { PanelLateral } from '@/components/tropero/panel-lateral'
import { Segmentos } from '@/components/tropero/segmentos'
import { useAnimales, useCorregirSalida, useIdentificarAnimal, usePotreros, useResolverSinSaber, useSalidasSinIdentificar } from '@/features/hacienda/hooks'
import { categoriaNombre, especiePorCategoria } from '@/features/hacienda/labels'
import { cn } from '@/lib/utils'
import { ElegirDeLista } from './caravanas'
import { usePosibles } from './posibles'
import { Potreros } from './entradas-salidas-panel'
import { useMapa } from '@/features/mapa/api'
import { edadTexto } from './rodeo'

const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

/**
 * Las salidas que restaron el número sin decir qué animal fue. Se resuelve una
 * por vez, de UNA de tres maneras (excluyentes): «Sé cuál fue» (las posibles
 * del potrero, o buscarla en todo el rodeo si se cargó en otro potrero o fue
 * otra), «No sé cuál fue» (queda una, nombrada, y se explica qué implica) o
 * «La cargué mal» (se anula). El botón de abajo dice lo que va a hacer.
 */
export function IdentificarSalidas({ empresaId, abierto, onCerrar, salidaFoco = null }: { empresaId: string; abierto: boolean; onCerrar: () => void; salidaFoco?: string | null }) {
  const salidasQ = useSalidasSinIdentificar()
  const potreros = usePotreros()
  const animales = useAnimales()
  const identificar = useIdentificarAnimal()
  const sinSaber = useResolverSinSaber()
  const corregir = useCorregirSalida()
  const navigate = useNavigate()
  const [elegida, setElegida] = useState<string | null>(null)
  const [modo, setModo] = useState<'sabe' | 'nosabe' | 'error'>('sabe')
  const [ids, setIds] = useState<string[]>([])
  const [buscar, setBuscar] = useState('')
  const [mal, setMal] = useState<'potrero' | 'cantidad' | 'nosalio'>('potrero')
  const [potCorrecto, setPotCorrecto] = useState<string | null>(null)
  const [cantCorrecta, setCantCorrecta] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const todas = salidasQ.data ?? []
  // La que se abrió desde una fila o la ficha manda; si no, la que se eligió de la lista.
  const x = todas.find((y) => y.salidaId === (salidaFoco ?? elegida ?? (todas.length === 1 ? todas[0]!.salidaId : '')))
  const nombrePotrero = (id: string | null) => potreros.data?.find((p) => p.id === id)?.nombre ?? ''
  const posiblesIds = new Set(x?.posiblesIds ?? [])
  const posibles = usePosibles((a) => posiblesIds.has(a.id ?? ''))
  const ocupado = identificar.isPending || sinSaber.isPending || corregir.isPending
  const { data: mapa } = useMapa(empresaId)
  const camposMapa = (mapa ?? []).filter((c) => c.potreros.length > 0)
  const [campoMapaId, setCampoMapaId] = useState<string | null>(null)
  const campoMapa = camposMapa.find((c) => c.id === campoMapaId) ?? camposMapa.find((c) => c.potreros.some((p) => p.id === x?.potreroId)) ?? camposMapa[0]

  const reiniciar = () => {
    setModo('sabe')
    setIds([])
    setBuscar('')
    setMal('potrero')
    setPotCorrecto(null)
    setCantCorrecta(null)
    setError(null)
  }
  const cerrar = () => {
    reiniciar()
    setElegida(null)
    onCerrar()
  }

  // Lo que va a quedar si «No sé cuál fue»: las primeras de la lista, nombradas.
  const quedan = x ? posibles.slice(0, x.pendientes) : []
  const nums = (xs: { visual: string | null; rfid: string | null }[]) => xs.map((p) => p.visual ?? p.rfid?.slice(-4) ?? 's/c').join(', ')

  // «Buscala en todo el rodeo»: los animales activos de la misma especie, por potrero.
  const especie = x ? especiePorCategoria[x.categoria] : 'bovino'
  const rodeo = (animales.data ?? []).filter((a) => a.estado === 'activo' && a.id && a.categoria && especiePorCategoria[a.categoria] === especie)
  const elegidosInfo = ids.map((id) => rodeo.find((a) => a.id === id)).filter(Boolean) as typeof rodeo

  async function confirmar() {
    if (!x) return
    setError(null)
    try {
      if (modo === 'sabe') {
        for (const id of ids) await identificar.mutateAsync({ animalId: id, salidaId: x.salidaId })
        const fuera = elegidosInfo.filter((a) => a.potrero_id !== x.potreroId)
        toast.success(`Listo: ${ids.length === 1 ? 'fue' : 'fueron'} ${nums(elegidosInfo.map((a) => ({ visual: a.caravana_visual, rfid: a.caravana_rfid })))}`, {
          description: fuera.length ? `El ${nombrePotrero(x.potreroId)} recuperó su número y ${fuera.map((a) => `el ${nombrePotrero(a.potrero_id)}`).join(' y ')} perdió la que salió.` : 'La ves en Hacienda, pestaña «Salieron».',
          action: ids.length === 1 ? { label: 'Ver su ficha', onClick: () => navigate(`/hacienda/${ids[0]}`) } : undefined,
        })
      } else if (modo === 'nosabe') {
        await sinSaber.mutateAsync({ salidaId: x.salidaId, animalIds: quedan.map((p) => p.id) })
        toast.success(`Listo: ${nums(quedan)} ${quedan.length === 1 ? 'quedó' : 'quedaron'} como ${x.motivo === 'muerte' ? 'muerta' : 'vendida'} sin identificar`, {
          description: 'La ves en Hacienda, pestaña «Salieron».',
          action: quedan.length === 1 ? { label: 'Ver su ficha', onClick: () => navigate(`/hacienda/${quedan[0]!.id}`) } : undefined,
        })
      } else {
        const cant = mal === 'nosalio' ? 0 : mal === 'cantidad' ? (cantCorrecta ?? x.pendientes) : x.pendientes
        const potDestino = mal === 'potrero' ? potCorrecto! : x.potreroId
        await corregir.mutateAsync({ salidaId: x.salidaId, categoria: x.categoria, potreroId: potDestino, cantidad: cant })
        toast.success('Listo: quedó corregida', {
          description:
            mal === 'nosalio'
              ? `El ${nombrePotrero(x.potreroId)} vuelve a tener lo que se había restado.`
              : mal === 'potrero'
                ? `El ${nombrePotrero(x.potreroId)} recupera su número y se restó del ${nombrePotrero(potDestino)}.`
                : `Ahora son ${cant} ${categoriaNombre(x.categoria, cant).toLowerCase()} del ${nombrePotrero(x.potreroId)}.`,
        })
      }
      reiniciar()
      if (salidaFoco || todas.length <= 1) cerrar()
      else setElegida(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Probá de nuevo.')
    }
  }

  // ===== Varias salidas: primero se elige cuál =====
  if (!x) {
    return (
      <PanelLateral abierto={abierto} onCerrar={cerrar} titulo="Salidas sin identificar" bajada="El número del rodeo ya está bien. Elegí una para decir cuál fue, o resolverla.">
        {todas.length === 0 && <p className="text-[15px] text-texto-suave">No queda ninguna salida sin identificar.</p>}
        <ul className="flex flex-col gap-2.5">
          {todas.map((y) => (
            <li key={y.salidaId}>
              <button type="button" onClick={() => setElegida(y.salidaId)} className="flex w-full items-center gap-4 rounded-[16px] bg-superficie px-5 py-4 text-left hover:bg-superficie-hundida">
                <span className="grid h-8 w-11 place-items-center rounded-[8px] border-[1.5px] border-dashed border-estado-atencion text-[15px] font-bold text-estado-atencion-texto">?</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15.5px] font-bold text-texto">
                    {y.pendientes} {categoriaNombre(y.categoria, y.pendientes).toLowerCase()} {y.motivo === 'muerte' ? (y.pendientes === 1 ? 'muerta' : 'muertas') : y.pendientes === 1 ? 'vendida' : 'vendidas'} del {nombrePotrero(y.potreroId)}
                  </span>
                  <span className="block text-[13.5px] text-texto-suave">El {ddmm(y.fecha)} · {y.posibles} posibles</span>
                </span>
                <Icono nombre="Siguiente" tamano={16} />
              </button>
            </li>
          ))}
        </ul>
      </PanelLateral>
    )
  }

  const n = x.pendientes
  const cat = categoriaNombre(x.categoria, n).toLowerCase()
  const pot = nombrePotrero(x.potreroId)
  const verbo = x.motivo === 'muerte' ? (n === 1 ? 'murió' : 'murieron') : n === 1 ? 'se vendió' : 'se vendieron'
  const como = x.motivo === 'muerte' ? 'muerta' : 'vendida'
  const boton =
    modo === 'sabe'
      ? ids.length < n
        ? n === 1
          ? 'Tocá la que fue'
          : `Tocá las ${n} que fueron (${ids.length} de ${n})`
        : `Guardar: ${ids.length === 1 ? 'fue la' : 'fueron'} ${nums(elegidosInfo.map((a) => ({ visual: a.caravana_visual, rfid: a.caravana_rfid })))}`
      : modo === 'nosabe'
        ? `Que ${quedan.length === 1 ? 'quede la' : 'queden'} ${nums(quedan)}`
        : mal === 'nosalio'
          ? `Anular: no ${x.motivo === 'muerte' ? 'murió' : 'se vendió'}`
          : mal === 'potrero'
            ? potCorrecto
              ? `Corregir: salió del ${nombrePotrero(potCorrecto)}`
              : 'Tocá el potrero correcto'
            : cantCorrecta == null || cantCorrecta === n
              ? 'Poné la cantidad correcta'
              : `Corregir: fueron ${cantCorrecta}`
  const listoParaConfirmar =
    modo === 'sabe' ? ids.length >= n : modo === 'nosabe' ? quedan.length >= n : mal === 'nosalio' || (mal === 'potrero' ? !!potCorrecto : cantCorrecta != null && cantCorrecta !== n && cantCorrecta > 0)
  // Para buscar por número: dígitos, sin espacios.
  const q = buscar.replace(/\D/g, '')
  const coincide = (a: { caravana_visual: string | null; caravana_rfid: string | null }) =>
    !q || (a.caravana_visual ?? '').replace(/\D/g, '').includes(q) || (a.caravana_rfid ?? '').replace(/\D/g, '').includes(q)

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={cerrar}
      ancho={modo === 'error' && mal === 'potrero'}
      onVolver={todas.length > 1 && !salidaFoco ? () => (reiniciar(), setElegida(null)) : undefined}
      volverTexto="Las otras salidas"
      titulo={`¿Qué ${n === 1 ? cat : `${n} ${cat}`} ${verbo} del ${pot}?`}
      bajada={`Lo anotaste el ${ddmm(x.fecha)} sin decir ${n === 1 ? 'cuál' : 'cuáles'}. El número del rodeo ya está bien.`}
      pie={
        <BotonPrincipal icono={modo === 'error' && mal === 'nosalio' ? 'Borrar' : 'Guardar'} cargando={ocupado} disabled={ocupado || !listoParaConfirmar} onClick={confirmar}>
          {boton}
        </BotonPrincipal>
      }
    >
      <div role="radiogroup" aria-label="Cómo se resuelve" className="flex flex-col gap-2">
        {(
          [
            { m: 'sabe', titulo: n === 1 ? 'Sé cuál fue' : 'Sé cuáles fueron', bajada: 'La tocás o la buscás por su caravana.' },
            { m: 'nosabe', titulo: 'No sé cuál fue', bajada: `Tropero marca una como ${como}; se puede corregir.` },
            { m: 'error', titulo: 'Me equivoqué al cargarla', bajada: 'Corregís el potrero o la cantidad, o la anulás.' },
          ] as const
        ).map((o) => (
          <button
            key={o.m}
            type="button"
            role="radio"
            aria-checked={modo === o.m}
            onClick={() => (setModo(o.m), setError(null))}
            className={cn('flex items-start gap-3 rounded-[16px] border-[1.5px] px-4 py-3 text-left transition-colors', modo === o.m ? 'border-principal bg-principal-suave' : 'border-borde bg-superficie hover:border-neutro-300')}
          >
            <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2', modo === o.m ? 'border-principal' : 'border-neutro-300')}>
              {modo === o.m && <span className="size-2.5 rounded-full bg-principal" />}
            </span>
            <span>
              <span className="block text-[15.5px] font-bold text-texto">{o.titulo}</span>
              <span className="block text-[13.5px] text-texto-suave">{o.bajada}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6">
        {modo === 'sabe' && (
          <>
            <label className="relative mb-4 flex h-11 items-center">
              <span className="pointer-events-none absolute left-4 text-texto-suave">
                <Icono nombre="Buscar" tamano={16} />
              </span>
              <span className="sr-only">Buscá por número de caravana</span>
              <input
                value={buscar}
                onChange={(e) => (setBuscar(e.target.value), setIds([]))}
                inputMode="numeric"
                placeholder="Buscá por número de caravana"
                className="h-full w-full rounded-full border-[1.5px] border-borde bg-superficie pr-10 pl-11 text-[15px] text-texto outline-none placeholder:text-texto-suave focus:border-principal"
              />
              {buscar && (
                <button type="button" aria-label="Borrar la búsqueda" onClick={() => (setBuscar(''), setIds([]))} className="absolute right-3 grid size-7 place-items-center rounded-full text-texto-suave hover:bg-superficie-hundida">
                  <Icono nombre="Cerrar" tamano={16} />
                </button>
              )}
            </label>
            <p className="mb-3 text-[14px] text-texto-suave">
              {q
                ? `Caravanas con «${q}» en todo el rodeo.`
                : x.posibles === n
                  ? `${n === 1 ? 'Sólo queda una posible' : `Quedan ${n} posibles`}: las demás se movieron o salieron.`
                  : `Las ${posibles.length} que estaban en el ${pot} ese día. Si no es ninguna, buscala.`}
            </p>
            {q ? (
              (() => {
                const halladas = rodeo.filter((a) => (a.caravana_visual || a.caravana_rfid) && coincide(a))
                if (!halladas.length) return <p className="text-[14.5px] text-texto-suave">Ninguna caravana tiene «{q}».</p>
                return (
                  <ElegirDeLista
                    posibles={halladas.map((a) => ({
                      caravana: a.id!,
                      visual: a.caravana_visual,
                      rfid: a.caravana_rfid,
                      etiqueta: categoriaNombre(a.categoria!, 1),
                      detalle: [edadTexto(a.fecha_nacimiento), nombrePotrero(a.potrero_id)].filter(Boolean).join(' · '),
                    }))}
                    elegidas={ids}
                    cuantas={n}
                    onCambio={setIds}
                  />
                )
              })()
            ) : (
              <ElegirDeLista posibles={posibles.map((p) => ({ ...p, caravana: p.id }))} elegidas={ids} cuantas={n} onCambio={setIds} />
            )}
          </>
        )}

        {modo === 'nosabe' && (
          <div className="rounded-[16px] bg-superficie px-4 py-4 text-[14.5px] leading-relaxed text-texto">
            <p className="font-bold">
              Queda como {como} la {nums(quedan)}
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-texto-suave">
              <li>· La elige Tropero entre las {posibles.length} posibles del {pot}.</li>
              <li>· Su ficha dice «{como} sin identificar». Las demás no cambian.</li>
              <li>· Si la ves en el campo, en su ficha tocás «Sigue en el campo».</li>
            </ul>
          </div>
        )}

        {modo === 'error' && (
          <div>
            <p className="mb-2.5 text-[14px] font-semibold text-texto-suave">¿Qué estuvo mal?</p>
            <Segmentos
              etiqueta="Qué estuvo mal"
              opciones={[
                { valor: 'potrero', texto: 'El potrero' },
                { valor: 'cantidad', texto: 'La cantidad' },
                { valor: 'nosalio', texto: x.motivo === 'muerte' ? 'No murió' : 'No se vendió' },
              ]}
              valor={mal}
              onCambio={(v) => (setMal(v), setError(null))}
            />
            <div className="mt-4 rounded-[16px] bg-superficie px-4 py-4 text-[14.5px] text-texto">
              {mal === 'potrero' && (
                <>
                  <p className="mb-3">¿De qué potrero {n === 1 ? 'salió' : 'salieron'}? Tocalo en el mapa.</p>
                  {camposMapa.length > 1 && (
                    <div className="mb-3">
                      <Segmentos etiqueta="Campo" opciones={camposMapa.map((c) => ({ valor: c.id, texto: c.nombre }))} valor={campoMapa?.id ?? null} onCambio={(id) => (setCampoMapaId(id), setPotCorrecto(null))} />
                    </div>
                  )}
                  {campoMapa && (
                    <Potreros
                      campo={campoMapa}
                      elegido={potCorrecto}
                      onElegir={setPotCorrecto}
                      apagado={(p) => p.id === x.potreroId || !rodeo.some((a) => a.potrero_id === p.id && a.categoria === x.categoria)}
                      dato={(p) => {
                        if (p.id === x.potreroId) return 'el que cargaste'
                        const hay = rodeo.filter((a) => a.potrero_id === p.id && a.categoria === x.categoria).length
                        return hay ? `${hay} ${categoriaNombre(x.categoria, hay).toLowerCase()}` : null
                      }}
                    />
                  )}
                </>
              )}
              {mal === 'cantidad' && (
                <>
                  <p className="mb-3">¿Cuántas fueron? Anotaste {n}.</p>
                  <div className="flex items-center gap-3">
                    <button type="button" aria-label="Una menos" onClick={() => setCantCorrecta(Math.max(1, (cantCorrecta ?? n) - 1))} className="grid size-10 place-items-center rounded-full bg-superficie-hundida text-[20px] font-bold">
                      −
                    </button>
                    <span className="cifra w-12 text-center text-[28px] font-bold">{cantCorrecta ?? n}</span>
                    <button type="button" aria-label="Una más" onClick={() => setCantCorrecta((cantCorrecta ?? n) + 1)} className="grid size-10 place-items-center rounded-full bg-principal text-[20px] font-bold text-principal-texto">
                      +
                    </button>
                  </div>
                  <p className="mt-3 text-[13.5px] text-texto-suave">Se corrige con la misma fecha.</p>
                </>
              )}
              {mal === 'nosalio' && <p>Se borra la {x.motivo === 'muerte' ? 'muerte' : 'venta'} y el {pot} recupera lo que se había restado.</p>}
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-5 rounded-[14px] bg-estado-problema-suave px-4 py-3 text-[14px] font-semibold text-estado-problema-texto">{error}</p>}
    </PanelLateral>
  )
}
