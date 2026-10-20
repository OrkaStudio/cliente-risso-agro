import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Icono } from '@/components/tropero/icono'
import { BotonVolver } from '@/components/tropero/panel-lateral'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useAnimal, useEventos, useIdentificarAnimal, useLote, usePotreros, useReabrirSinSaber, useSalidasSinIdentificar } from '@/features/hacienda/hooks'
import { categoriaNombre } from '@/features/hacienda/labels'
import { resumirEventos } from '@/features/hacienda/senales'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import textura from '@/assets/tropero/textura-campo.webp'
import { CroquisDibujo } from '@/features/mapa/croquis-dibujo'
import { useMapa } from '@/features/mapa/api'
import { avisoDelAnimal, desdeCuando, fraseDelAnimal, historiaDelAnimal, loQueHayQueSaber, rasgosDelAnimal, tituloDelAnimal, type Tono } from './ficha'
import { CaravanaDibujo, SinCaravanaDibujo } from './caravana-dibujo'
import { AnotarleAlgo, CorregirDatos, DarDeBaja } from './paneles'
import { estadoDe } from './rodeo'

const AVISO: Record<Tono, string> = {
  principal: 'bg-principal-suave text-principal',
  bien: 'bg-estado-bien-suave text-estado-bien-texto',
  atencion: 'bg-estado-atencion-suave text-estado-atencion-texto',
  problema: 'bg-estado-problema-suave text-estado-problema-texto',
  neutro: 'bg-superficie-hundida text-texto-suave',
}
const PUNTO: Record<Tono, string> = {
  principal: 'bg-principal',
  bien: 'bg-salvia',
  atencion: 'bg-trigo-500',
  problema: 'bg-estado-problema',
  neutro: 'bg-neutro-400',
}
const SECUNDARIO =
  'inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-principal bg-superficie px-4 text-[14.5px] font-bold text-principal transition-colors hover:bg-principal-suave'

/**
 * Hacienda · Ficha del animal (página 35). La caravana como está en la oreja,
 * quién es en una frase, qué hay que hacer con él y su historia.
 */
export function FichaPage() {
  const { id = '' } = useParams()
  const animal = useAnimal(id)
  const eventos = useEventos(id)
  const potreros = usePotreros()
  const lote = useLote(animal.data?.lote_id)
  const { campos } = useCampoElegido()
  const hoyISO = hoyLocal()
  const [panel, setPanel] = useState<'anotar' | 'corregir' | 'baja' | null>(null)
  const navigate = useNavigate()
  const salidasQ = useSalidasSinIdentificar()
  const fueEsta = useIdentificarAnimal()
  const reabrir = useReabrirSinSaber()
  const { data: mapa } = useMapa(animal.data?.empresa_id ?? undefined)

  const resumen = useMemo(
    () => (eventos.data ? resumirEventos(eventos.data.map((e) => ({ animal_id: e.animal_id, tipo: e.tipo, fecha: e.fecha, datos: e.datos }))).get(id) : undefined),
    [eventos.data, id],
  )

  if (animal.isLoading) return <div className="mx-auto h-[420px] w-full max-w-[1104px] animate-pulse rounded-[24px] bg-superficie-hundida" aria-busy />
  if (!animal.data) return <p className="text-texto-suave">No encontramos ese animal.</p>

  const a = animal.data
  const activo = a.estado === 'activo'
  const potrero = potreros.data?.find((p) => p.id === a.potrero_id)
  const campo = potrero ? (campos.find((c) => c.id === potrero.campo_id)?.nombre ?? null) : null
  const estado = activo ? estadoDe({ id, categoria: a.categoria, fecha_nacimiento: a.fecha_nacimiento, potrero_id: a.potrero_id, caravana_visual: a.caravana_visual, caravana_rfid: a.caravana_rfid }, resumen, hoyISO) : 'nada'
  const aviso = avisoDelAnimal(estado, resumen)
  const evs = (eventos.data ?? []).map((e) => ({ id: e.id, tipo: e.tipo, fecha: e.fecha, datos: e.datos, nota: e.nota }))
  // El peso ya está arriba.
  const saber = loQueHayQueSaber(a, resumen, evs, lote.data?.nombre ?? null, new Date(), estado === 'prenada' || estado === 'vacia').filter((f) => f.nombre !== 'Último peso')
  const rasgos = rasgosDelAnimal(a)
  const alta = (eventos.data ?? []).filter((e) => e.tipo === 'alta').sort((x, y) => x.fecha.localeCompare(y.fecha))[0]?.fecha ?? a.created_at?.slice(0, 10)
  const diasDesde = (f: string, hoy: string) => {
    const d = Math.round((Date.parse(hoy) - Date.parse(f)) / 86_400_000)
    return d <= 0 ? 'Desde hoy' : d === 1 ? '1 día' : d < 60 ? `${d} días` : d < 730 ? `${Math.floor(d / 30.4)} meses` : `${Math.floor(d / 365.25)} años`
  }
  const ddmmaa = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(2, 4)}`
  const datos: { nombre: string; valor: string | null; sub?: string; vacio?: string; cargar?: boolean }[] = [
    { nombre: 'Edad', valor: rasgos.find((r) => r.nombre === 'Edad')?.valor ?? null, cargar: true },
    { nombre: 'Raza', valor: rasgos.find((r) => r.nombre !== 'Edad')?.valor ?? null, cargar: true },
    { nombre: 'Último peso', valor: resumen?.ultimoPeso ? `${resumen.ultimoPeso.kg.toLocaleString('es-AR')} kg` : null, sub: resumen?.ultimoPeso ? `el ${ddmmaa(resumen.ultimoPeso.fecha)}` : undefined, vacio: 'Sin pesar' },
    { nombre: 'En el rodeo', valor: alta ? diasDesde(alta, hoyISO) : null, sub: alta ? `desde el ${ddmmaa(alta)}` : undefined, vacio: '—' },
  ]
  const campoMapa = mapa?.find((c) => c.potreros.some((p) => p.id === a.potrero_id))
  const identidad = campos.find((c) => c.id === potrero?.campo_id)
  const historia = historiaDelAnimal(evs)
  const titulo = tituloDelAnimal(a.categoria, a.sexo)
  // Si ya no está: la fecha de su última baja (la del hecho, no la de la carga).
  const ultimaBaja = !activo ? (eventos.data ?? []).filter((e) => e.tipo === 'baja').sort((x, y) => y.created_at.localeCompare(x.created_at))[0] : undefined
  const salio = ultimaBaja ? { fecha: ultimaBaja.fecha, murio: a.estado === 'muerto', corregido: a.estado === 'corregido' } : null
  const panelAnimal = { id, empresaId: a.empresa_id ?? '', visual: a.caravana_visual, rfid: a.caravana_rfid, potreroId: a.potrero_id }
  const editable = activo && !!a.empresa_id
  const estadoTexto = a.estado === 'activo' ? 'Activo' : a.estado === 'vendido' ? 'Vendido' : a.estado === 'muerto' ? 'Murió' : a.estado === 'corregido' ? 'Corregido: estaba cargado de más' : 'De baja'

  return (
    <div className="mx-auto flex w-full max-w-[1104px] flex-col gap-6">
      <nav aria-label="Dónde estás">
        <BotonVolver onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/hacienda'))}>Hacienda</BotonVolver>
      </nav>

      <section className="grid overflow-hidden rounded-[26px] border border-borde bg-superficie md:grid-cols-[210px_minmax(0,1fr)] lg:grid-cols-[210px_minmax(0,1fr)_minmax(300px,0.75fr)]">
        {/* La caravana, una sola vez: como está en la oreja, sobre el campo */}
        <div className="relative grid place-items-center overflow-hidden bg-tinta px-4 pt-7 pb-5">
          <img src={textura} alt="" className="absolute inset-0 size-full object-cover opacity-35" />
          <div className="relative drop-shadow-[0_18px_24px_rgba(0,0,0,0.35)]">
            {a.caravana_visual || a.caravana_rfid ? (
              <CaravanaDibujo visual={a.caravana_visual} rfid={a.caravana_rfid} campo={campo} ancho={150} />
            ) : (
              <SinCaravanaDibujo ancho={150} onPoner={editable ? () => setPanel('corregir') : undefined} />
            )}
          </div>
        </div>

        {/* Quién es y qué hacer */}
        <div className="flex min-w-0 flex-col justify-center gap-3.5 p-5 md:px-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13.5px] font-bold', activo ? 'bg-estado-bien-suave text-estado-bien-texto' : 'bg-superficie-hundida text-texto-suave')}>
              <span className={cn('size-2 rounded-full', activo ? 'bg-estado-bien' : 'bg-neutro-400')} />
              {estadoTexto}
            </span>
            {aviso && <span className={cn('rounded-full px-3 py-1 text-[13.5px] font-bold', AVISO[aviso.tono])}>{aviso.texto}</span>}
          </div>
          <h1 className="font-heading text-[40px] leading-[0.95] font-extrabold tracking-[-0.02em] text-texto">{titulo}</h1>
          {!activo && <p className="max-w-[460px] text-[15.5px] text-texto-suave">{fraseDelAnimal({ fecha_nacimiento: null, raza: null, pelaje: null }, potrero ? { potrero: potrero.nombre, campo } : null, new Date(), salio)}</p>}

          {/* Lo primero que se mira: cada dato una vez; lo que falta, para cargarlo */}
          <dl className="grid grid-cols-2 gap-2">
            {datos.map((d) => (
              <div key={d.nombre} className={cn('flex flex-col gap-0.5 rounded-[12px] px-3 py-2', d.valor ? 'bg-fondo' : 'border-[1.5px] border-dashed border-borde')}>
                <dt className="text-[11px] font-semibold tracking-[0.05em] text-texto-suave uppercase">{d.nombre}</dt>
                {d.valor ? (
                  <dd>
                    <span className="text-[16px] font-bold text-texto">{d.valor}</span>
                    {d.sub && <span className="ml-1.5 text-[12.5px] text-texto-suave">{d.sub}</span>}
                  </dd>
                ) : (
                  <dd>
                    {d.cargar && editable ? (
                      <button type="button" onClick={() => setPanel('corregir')} className="text-[14px] font-bold text-principal hover:underline">
                        + Cargar
                      </button>
                    ) : (
                      <span className="text-[14px] text-texto-suave">{d.vacio}</span>
                    )}
                  </dd>
                )}
              </div>
            ))}
          </dl>

          {editable && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setPanel('anotar')} className="inline-flex h-10 items-center gap-2 rounded-full bg-principal py-1 pr-1 pl-4 text-[14.5px] font-bold text-principal-texto hover:bg-terracota-600">
                Anotarle algo
                <span className="grid size-8 place-items-center rounded-full bg-acento text-acento-texto">
                  <Icono nombre="Agregar" tamano={16} />
                </span>
              </button>
              <button type="button" onClick={() => setPanel('corregir')} className={SECUNDARIO}>
                <Icono nombre="Editar" tamano={16} /> Corregir datos
              </button>
              <button type="button" onClick={() => setPanel('baja')} className="inline-flex h-10 items-center rounded-full border-[1.5px] border-borde px-4 text-[14px] font-semibold text-texto-suave hover:border-neutro-300 hover:text-texto">
                Dar de baja
              </button>
            </div>
          )}
          {editable && (
            <>
              <AnotarleAlgo animal={panelAnimal} abierto={panel === 'anotar'} onCerrar={() => setPanel(null)} />
              <CorregirDatos
                animal={{ ...panelAnimal, categoria: a.categoria, fechaNacimiento: a.fecha_nacimiento, raza: a.raza, pelaje: a.pelaje }}
                abierto={panel === 'corregir'}
                onCerrar={() => setPanel(null)}
              />
              <DarDeBaja animal={panelAnimal} abierto={panel === 'baja'} onCerrar={() => setPanel(null)} />
            </>
          )}
        </div>
          {/* Dónde está, en el croquis del campo */}
          <section className="flex min-w-0 flex-col gap-2.5 border-t border-borde p-5 md:col-span-2 md:[&>*]:max-w-[440px] lg:col-span-1 lg:border-t-0 lg:border-l lg:[&>*]:max-w-none">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="flex items-baseline gap-2 font-heading text-[16px] font-extrabold text-texto">
                {activo ? 'Dónde está' : 'Dónde estaba'}
                <span className="cifra text-[24px] leading-none">{potrero?.nombre ?? '—'}</span>
              </h2>
              {identidad && (
                <span className="inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-texto">
                  <span className="grid size-5 place-items-center rounded-[6px] text-[11px] font-extrabold text-white" style={{ background: identidad.color }}>
                    {identidad.letra}
                  </span>
                  {identidad.nombre}
                </span>
              )}
            </div>
            {campoMapa?.potreros.some((p) => p.poligono) && <CroquisDibujo campo={campoMapa} elegido={a.potrero_id} llenar className="min-h-[220px] flex-1" />}
            {campoMapa && campoMapa.potreros.some((p) => !p.poligono) ? (
              // Los potreros que todavía no están dibujados, con éste marcado.
              <ul className="flex flex-wrap gap-1.5" aria-label={`Potreros de ${campoMapa.nombre} sin dibujar`}>
                {campoMapa.potreros.filter((p) => !p.poligono).map((p) => (
                  <li key={p.id} aria-current={p.id === a.potrero_id || undefined} className={cn('cifra grid h-8 min-w-[42px] place-items-center rounded-[9px] px-2 text-[15px] font-bold', p.id === a.potrero_id ? 'bg-principal text-principal-texto' : 'bg-superficie-hundida text-texto-suave')}>
                    {p.nombre}
                  </li>
                ))}
              </ul>
            ) : (
              !potrero && <p className="text-[14px] text-texto-suave">Todavía no está en un potrero.</p>
            )}
            {potrero && activo && <p className="text-[13px] text-texto-suave">{desdeCuando(evs, potrero.nombre)}</p>}
            {!potrero && editable && (
              <button type="button" onClick={() => setPanel('corregir')} className={cn(SECUNDARIO, 'self-start')}>
                Elegir el potrero
              </button>
            )}
          </section>
      </section>

      {/* Salió «sin identificar»: la eligió Tropero porque no se supo cuál fue. */}
      {(() => {
        const baja = !activo ? (eventos.data ?? []).filter((e) => e.tipo === 'baja').sort((x, y) => y.created_at.localeCompare(x.created_at))[0] : undefined
        const d = baja?.datos as Record<string, unknown> | undefined
        if (!baja || !d?.sin_identificar) return null
        const como = a.estado === 'muerto' ? 'muerta' : 'vendida'
        const fecha = `${baja.fecha.slice(8, 10)}/${baja.fecha.slice(5, 7)}`
        return (
          <section className="flex flex-wrap items-center gap-4 rounded-[20px] border border-borde bg-superficie px-6 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-superficie-hundida text-texto-suave">
              <Icono nombre="Caravana" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15.5px] font-bold text-texto">
                Figura como {como} sin identificar
              </p>
              <p className="text-[14px] text-texto-suave">
                El {fecha} salió una del {potrero?.nombre ?? 'potrero'} y no se supo cuál; la eligió Tropero. Si la ves en el campo, no fue ésta: vuelve al rodeo y la salida queda otra vez sin identificar.
              </p>
            </div>
            <button
              type="button"
              disabled={reabrir.isPending}
              onClick={async () => {
                try {
                  await reabrir.mutateAsync(id)
                  toast.success('Listo: volvió al rodeo', { description: 'La salida quedó otra vez sin identificar, ya sin ésta entre las posibles.' })
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'No se pudo.')
                }
              }}
              className={SECUNDARIO}
            >
              Sigue en el campo
            </button>
          </section>
        )
      })()}

      {/* Puede ser la que salió: estaba en ese potrero el día de una salida sin identificar. */}
      {activo &&
        (salidasQ.data ?? [])
          .filter((x) => x.posiblesIds.includes(id))
          .map((x) => {
            const pot = potreros.data?.find((p) => p.id === x.potreroId)?.nombre ?? ''
            const que = `${x.pendientes} ${categoriaNombre(x.categoria, x.pendientes).toLowerCase()}`
            const verbo = x.motivo === 'muerte' ? (x.pendientes === 1 ? 'murió' : 'murieron') : x.pendientes === 1 ? 'se vendió' : 'se vendieron'
            const fecha = `${x.fecha.slice(8, 10)}/${x.fecha.slice(5, 7)}`
            return (
              <section key={x.salidaId} className="flex flex-wrap items-center gap-4 rounded-[20px] border border-estado-atencion/40 bg-estado-atencion-suave/40 px-6 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-estado-atencion-suave text-estado-atencion-texto">
                  <Icono nombre="Caravana" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15.5px] font-bold text-texto">¿Fue ésta?</p>
                  <p className="text-[14px] text-texto-suave">
                    El {fecha} {verbo} {que} del {pot} sin decir {x.pendientes === 1 ? 'cuál' : 'cuáles'}. Ésta estaba ahí ese día: puede ser {x.pendientes === 1 ? 'la que salió' : 'una de las que salieron'} ({x.posibles} posibles).
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={fueEsta.isPending}
                    onClick={async () => {
                      try {
                        await fueEsta.mutateAsync({ animalId: id, salidaId: x.salidaId })
                        toast.success(`Listo: quedó como ${x.motivo === 'muerte' ? 'muerta' : 'vendida'} el ${fecha}`, { description: 'El número del rodeo no cambia: ya estaba restado.' })
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
                      }
                    }}
                    className="inline-flex h-10 items-center rounded-full bg-principal px-4 text-[14.5px] font-bold text-principal-texto hover:bg-terracota-600 disabled:opacity-50"
                  >
                    Sí, fue ésta
                  </button>
                  <button type="button" onClick={() => navigate(`/hacienda?salida=${x.salidaId}`)} className={SECUNDARIO}>
                    Ver las {x.posibles} posibles
                  </button>
                </div>
              </section>
            )
          })}

      <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel titulo="Su historia" bajada="No se borra nunca">
          {historia.length === 0 ? (
            <p className="py-3 text-[14.5px] text-texto-suave">Sin nada anotado todavía.</p>
          ) : (
            <ol>
              {historia.map((h, i) => (
                <li key={h.id} className="flex gap-4">
                  <span className="w-[64px] shrink-0 pt-0.5 text-right">
                    <span className="cifra block text-[17px] leading-none font-bold text-texto">{h.dia}</span>
                    {i > 0 && historia[i - 1]!.anio !== h.anio && <span className="text-[12px] text-texto-suave">{h.anio}</span>}
                  </span>
                  <span className="flex w-3 shrink-0 flex-col items-center">
                    <span className={cn('mt-1 size-3 shrink-0 rounded-full ring-4 ring-superficie', PUNTO[h.tono])} />
                    {i < historia.length - 1 && <span className="w-px flex-1 bg-borde" />}
                  </span>
                  <div className={cn('min-w-0 flex-1', i < historia.length - 1 && 'pb-5')}>
                    <p className="text-[15px] leading-tight font-bold text-texto">{h.titulo}</p>
                    {h.detalle && <p className="mt-0.5 text-[14px] text-texto-suave">{h.detalle}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <Panel titulo="Lo que hay que saber">
            {saber.length === 0 ? (
              <p className="py-3 text-[14.5px] text-texto-suave">Se completa solo cuando le anotás una pesada, un tacto o una vacuna.</p>
            ) : (
              <dl className="divide-y divide-borde">
                {saber.map((f) => (
                  <div key={f.nombre} className="flex items-baseline justify-between gap-6 py-3">
                    <dt className="shrink-0 text-[14.5px] text-texto-suave">{f.nombre}</dt>
                    <dd className="text-right text-[15px] font-semibold text-texto">{f.valor}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Panel>
      </section>
    </div>
  )
}

function Panel({ titulo, bajada, children }: { titulo: string; bajada?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-borde bg-superficie px-6 py-5">
      <h2 className="mb-2 flex items-baseline gap-3 font-heading text-[19px] font-extrabold text-texto">
        {titulo}
        {bajada && <span className="font-sans text-[13.5px] font-normal text-texto-suave">{bajada}</span>}
      </h2>
      {children}
    </section>
  )
}
