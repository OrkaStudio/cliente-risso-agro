import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import textura from '@/assets/tropero/textura-campo.webp'
import { Icono } from '@/components/tropero/icono'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useNombres } from '@/features/empresa/use-nombres'
import { useAnimal, useEventos, useLote, usePotreros } from '@/features/hacienda/hooks'
import { resumirEventos } from '@/features/hacienda/senales'
import { CaravanaDibujo, SinCaravanaDibujo } from '@/features/hacienda/tropero/caravana-dibujo'
import { avisoDelAnimal, desdeCuando, historiaDelAnimal, loQueHayQueSaber, rasgosDelAnimal, tituloDelAnimal, type Tono } from '@/features/hacienda/tropero/ficha'
import { estadoDe } from '@/features/hacienda/tropero/rodeo'
import { useMapa } from '@/features/mapa/api'
import { CroquisDibujo } from '@/features/mapa/croquis-dibujo'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import { BAJADA, TARJETA } from './sistema'
import { Barra, Encabezado } from './sistema-ui'

/**
 * La ficha del animal en el celular (Lau, 17/11), la misma de la compu para
 * mirar: la caravana como está en la oreja, qué es y qué hay que hacer, sus
 * datos, dónde está en el croquis y su historia. Se corrige en la compu.
 */

const AVISO: Record<Tono, string> = {
  principal: 'bg-principal-suave text-principal',
  bien: 'bg-estado-bien-suave text-estado-bien-texto',
  atencion: 'bg-estado-atencion-suave text-estado-atencion-texto',
  problema: 'bg-estado-problema-suave text-estado-problema-texto',
  neutro: 'bg-superficie-hundida text-texto-suave',
}
const PUNTO: Record<Tono, string> = { principal: 'bg-principal', bien: 'bg-salvia', atencion: 'bg-trigo-500', problema: 'bg-estado-problema', neutro: 'bg-neutro-400' }
const ddmmaa = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(2, 4)}`

export function AnimalCelu() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const animal = useAnimal(id)
  const eventos = useEventos(id)
  const potreros = usePotreros()
  const lote = useLote(animal.data?.lote_id)
  const { campos } = useCampoElegido()
  const { quienCargo } = useNombres()
  const { data: mapa } = useMapa(animal.data?.empresa_id ?? undefined)
  const hoyISO = hoyLocal()
  const resumen = useMemo(() => (eventos.data ? resumirEventos(eventos.data.map((e) => ({ animal_id: e.animal_id, tipo: e.tipo, fecha: e.fecha, datos: e.datos }))).get(id) : undefined), [eventos.data, id])
  const volver = () => (window.history.length > 1 ? navigate(-1) : navigate('/campo/hacienda'))

  if (animal.isLoading) return <div className="m-4 h-[420px] animate-pulse rounded-[20px] bg-superficie-hundida" aria-busy />
  if (!animal.data) return <p className="p-4 text-texto-suave">No encontramos ese animal.</p>

  const a = animal.data
  const activo = a.estado === 'activo'
  const potrero = potreros.data?.find((p) => p.id === a.potrero_id)
  const identidad = campos.find((c) => c.id === potrero?.campo_id)
  const estado = activo ? estadoDe({ id, categoria: a.categoria, fecha_nacimiento: a.fecha_nacimiento, potrero_id: a.potrero_id, caravana_visual: a.caravana_visual, caravana_rfid: a.caravana_rfid }, resumen, hoyISO) : 'nada'
  const aviso = avisoDelAnimal(estado, resumen)
  const evs = (eventos.data ?? []).map((e) => ({ id: e.id, tipo: e.tipo, fecha: e.fecha, datos: e.datos, nota: e.nota }))
  const saber = loQueHayQueSaber(a, resumen, evs, lote.data?.nombre ?? null, new Date(), estado === 'prenada' || estado === 'vacia').filter((f) => f.nombre !== 'Último peso')
  const rasgos = rasgosDelAnimal(a)
  const alta = (eventos.data ?? []).filter((e) => e.tipo === 'alta').sort((x, y) => x.fecha.localeCompare(y.fecha))[0]?.fecha ?? a.created_at?.slice(0, 10)
  const diasDesde = (f: string) => {
    const d = Math.round((Date.parse(hoyISO) - Date.parse(f)) / 86_400_000)
    return d <= 0 ? 'Desde hoy' : d === 1 ? '1 día' : d < 60 ? `${d} días` : d < 730 ? `${Math.floor(d / 30.4)} meses` : `${Math.floor(d / 365.25)} años`
  }
  const datos = [
    { nombre: 'Edad', valor: rasgos.find((r) => r.nombre === 'Edad')?.valor ?? null, sub: undefined as string | undefined },
    { nombre: 'Raza', valor: rasgos.find((r) => r.nombre !== 'Edad')?.valor ?? null, sub: undefined },
    { nombre: 'Último peso', valor: resumen?.ultimoPeso ? `${resumen.ultimoPeso.kg.toLocaleString('es-AR')} kg` : null, sub: resumen?.ultimoPeso ? `el ${ddmmaa(resumen.ultimoPeso.fecha)}` : undefined },
    { nombre: 'En el rodeo', valor: alta ? diasDesde(alta) : null, sub: alta ? `desde el ${ddmmaa(alta)}` : undefined },
  ]
  const campoMapa = mapa?.find((c) => c.potreros.some((p) => p.id === a.potrero_id))
  const historia = historiaDelAnimal(evs)
  const autorDe = (eid: string) => {
    const e = (eventos.data ?? []).find((x) => x.id === eid)
    return e ? quienCargo(e.created_by, e.canal) : null
  }
  const estadoTexto = a.estado === 'activo' ? 'Activo' : a.estado === 'vendido' ? 'Vendido' : a.estado === 'muerto' ? 'Murió' : a.estado === 'corregido' ? 'Corregido' : 'De baja'

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-6 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-6">
        <Barra />
        <button type="button" onClick={volver} className="-mb-2 flex items-center gap-1 self-start text-[14px] font-bold text-principal">
          <Icono nombre="Siguiente" tamano={16} className="rotate-180" />
          Hacienda
        </button>

        {/* La caravana y quién es. */}
        <section aria-labelledby="animal-titulo" className={cn(TARJETA, 'overflow-hidden')}>
          <div className="relative grid h-[210px] place-items-center overflow-hidden bg-tinta">
            <img src={textura} alt="" className="absolute inset-0 size-full object-cover opacity-35" />
            <div className="relative drop-shadow-[0_18px_24px_rgba(0,0,0,0.35)]">
              {a.caravana_visual || a.caravana_rfid ? <CaravanaDibujo visual={a.caravana_visual} rfid={a.caravana_rfid} campo={identidad?.nombre ?? null} ancho={118} /> : <SinCaravanaDibujo ancho={118} />}
            </div>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-bold', activo ? 'bg-estado-bien-suave text-estado-bien-texto' : 'bg-superficie-hundida text-texto-suave')}>
                <span className={cn('size-2 rounded-full', activo ? 'bg-estado-bien' : 'bg-neutro-400')} />
                {estadoTexto}
              </span>
              {aviso && <span className={cn('rounded-full px-2.5 py-1 text-[13px] font-bold', AVISO[aviso.tono])}>{aviso.texto}</span>}
            </div>
            <h1 id="animal-titulo" className="titulo-display text-[28px] leading-tight text-texto">
              {tituloDelAnimal(a.categoria, a.sexo)}
            </h1>
            <dl className="grid grid-cols-2 gap-2">
              {datos.map((d) => (
                <div key={d.nombre} className="flex flex-col gap-0.5 rounded-[14px] bg-fondo px-3 py-2.5">
                  <dt className={BAJADA}>{d.nombre}</dt>
                  <dd className="text-[15px] font-bold text-texto">
                    {d.valor ?? <span className="font-normal text-texto-suave">Sin dato</span>}
                    {d.sub && <span className="block text-[12.5px] font-normal text-texto-suave">{d.sub}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Dónde está. */}
        <section aria-labelledby="animal-donde" className={cn(TARJETA, 'flex flex-col gap-3 p-4')}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="animal-donde" className="flex items-baseline gap-2 titulo-display text-[20px] text-texto">
              {activo ? 'Dónde está' : 'Dónde estaba'}
              <span>{potrero?.nombre ?? '—'}</span>
            </h2>
            {identidad && (
              <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-texto">
                <span className="grid size-5 place-items-center rounded-full text-[11px] font-extrabold text-white" style={{ background: identidad.color }}>
                  {identidad.letra}
                </span>
                {identidad.nombre}
              </span>
            )}
          </div>
          {campoMapa?.potreros.some((p) => p.poligono) && <CroquisDibujo campo={campoMapa} elegido={a.potrero_id} llenar className="h-[200px]" />}
          {potrero && activo ? <p className={BAJADA}>{desdeCuando(evs, potrero.nombre)}</p> : !potrero && <p className={BAJADA}>Todavía no está en un potrero.</p>}
        </section>

        {saber.length > 0 && (
          <section aria-labelledby="animal-saber" className={cn(TARJETA, 'p-4')}>
            <Encabezado id="animal-saber" titulo="Lo que hay que saber" bajada="Lo que se cargó de él" />
            <dl className="mt-3 divide-y divide-borde">
              {saber.map((f) => (
                <div key={f.nombre} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <dt className={BAJADA}>{f.nombre}</dt>
                  <dd className="text-right text-[15px] font-semibold text-texto">{f.valor}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section aria-labelledby="animal-historia" className={cn(TARJETA, 'p-4')}>
          <Encabezado id="animal-historia" titulo="Su historia" bajada="Todo lo que le pasó. No se borra nunca." />
          {historia.length === 0 ? (
            <p className={cn(BAJADA, 'mt-3')}>Todavía no tiene nada anotado.</p>
          ) : (
            <ol className="mt-3 flex flex-col">
              {historia.map((h, i) => (
                <li key={h.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < historia.length - 1 && <span aria-hidden className="absolute top-4 bottom-0 left-[5px] w-px bg-borde" />}
                  <span aria-hidden className={cn('relative mt-1.5 size-[11px] shrink-0 rounded-full', PUNTO[h.tono])} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="text-[15px] font-semibold text-texto">{h.titulo}</span>
                      <span className="shrink-0 text-[13px] font-semibold text-texto-suave">
                        {h.dia} {h.anio}
                      </span>
                    </p>
                    {h.detalle && <p className={BAJADA}>{h.detalle}</p>}
                    {autorDe(h.id) && <p className="text-[12.5px] font-semibold text-acento-texto">{autorDe(h.id)}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
        <div aria-hidden className="h-10" />
      </div>
    </div>
  )
}
