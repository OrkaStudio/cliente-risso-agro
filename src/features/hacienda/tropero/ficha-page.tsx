import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useAnimal, useEventos, useLote, usePotreros } from '@/features/hacienda/hooks'
import { resumirEventos } from '@/features/hacienda/senales'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import { avisoDelAnimal, fraseDelAnimal, historiaDelAnimal, loQueHayQueSaber, tituloDelAnimal, type Tono } from './ficha'
import { AnotarleAlgo, CambiarCaravana, DarDeBaja } from './paneles'
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
  const [panel, setPanel] = useState<'anotar' | 'caravana' | 'baja' | null>(null)

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
  const saber = loQueHayQueSaber(a, resumen, evs, lote.data?.nombre ?? null)
  const historia = historiaDelAnimal(evs)
  const titulo = tituloDelAnimal(a.categoria, a.sexo)
  const panelAnimal = { id, empresaId: a.empresa_id ?? '', visual: a.caravana_visual, rfid: a.caravana_rfid, potreroId: a.potrero_id }
  const estadoTexto = a.estado === 'activo' ? 'Activo' : a.estado === 'vendido' ? 'Vendido' : a.estado === 'muerto' ? 'Murió' : 'De baja'

  return (
    <div className="mx-auto flex w-full max-w-[1104px] flex-col gap-6">
      <nav aria-label="Dónde estás" className="flex items-center gap-2 text-[14.5px] text-texto-suave">
        <Link to="/hacienda" className="font-semibold hover:text-texto">
          Hacienda
        </Link>
        <span>/</span>
        <span>{potrero ? `${potrero.nombre}${campo ? `, ${campo}` : ''}` : 'Sin potrero'}</span>
      </nav>

      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        {/* La caravana, como está en la oreja */}
        <div className="rounded-[24px] border border-borde bg-superficie px-8 pt-8 pb-6">
          <Caravana visual={a.caravana_visual} rfid={a.caravana_rfid} campo={campo} />
          <dl className="mt-6 divide-y divide-borde border-y border-borde">
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-[14px] text-texto-suave">Visible, la que se lee de lejos</dt>
              <dd className="cifra text-[24px] font-bold text-texto">{a.caravana_visual ?? '—'}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-[14px] text-texto-suave">Electrónica, la que lee el bastón</dt>
              <dd className="cifra text-[22px] font-bold text-texto">{a.caravana_rfid ?? '—'}</dd>
            </div>
          </dl>
          {!a.caravana_rfid && activo && <p className="mt-3 text-center text-[13.5px] text-texto-suave">Se le pone caravana la próxima vez que pase por la manga.</p>}
        </div>

        {/* Quién es y qué hacer */}
        <div className="flex flex-col items-start gap-4">
          <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13.5px] font-bold', activo ? 'bg-estado-bien-suave text-estado-bien-texto' : 'bg-superficie-hundida text-texto-suave')}>
            <span className={cn('size-2 rounded-full', activo ? 'bg-estado-bien' : 'bg-neutro-400')} />
            {estadoTexto}
          </span>
          <h1 className="font-heading text-[48px] leading-[0.95] font-extrabold tracking-[-0.02em] text-texto">{titulo}</h1>
          <p className="max-w-[460px] text-[16.5px] leading-relaxed text-texto-suave">{fraseDelAnimal(a, potrero ? { potrero: potrero.nombre, campo } : null)}</p>
          {aviso && <span className={cn('rounded-full px-3.5 py-1.5 text-[14px] font-bold', AVISO[aviso.tono])}>{aviso.texto}</span>}
          {activo && a.empresa_id && (
            <div className="mt-2 flex flex-wrap gap-2.5">
              <button type="button" onClick={() => setPanel('anotar')} className="inline-flex h-10 items-center gap-2.5 rounded-full bg-principal py-1 pr-1 pl-4 text-[14.5px] font-bold text-principal-texto hover:bg-terracota-600">
                Anotarle algo
                <span className="grid size-8 place-items-center rounded-full bg-acento text-acento-texto">
                  <Icono nombre="Agregar" tamano={16} />
                </span>
              </button>
              <button type="button" onClick={() => setPanel('caravana')} className={SECUNDARIO}>
                <Icono nombre="Caravana" tamano={16} /> Cambiar caravana
              </button>
              <button type="button" onClick={() => setPanel('baja')} className={SECUNDARIO}>
                <Icono nombre="Borrar" tamano={16} /> Dar de baja
              </button>
            </div>
          )}
          {activo && a.empresa_id && (
            <>
              <AnotarleAlgo animal={panelAnimal} abierto={panel === 'anotar'} onCerrar={() => setPanel(null)} />
              <CambiarCaravana animal={panelAnimal} abierto={panel === 'caravana'} onCerrar={() => setPanel(null)} />
              <DarDeBaja animal={panelAnimal} abierto={panel === 'baja'} onCerrar={() => setPanel(null)} />
            </>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Panel titulo="Lo que hay que saber">
          {saber.length === 0 ? (
            <p className="py-3 text-[14.5px] text-texto-suave">Todavía no hay datos. Se completan solos cuando le anotás una pesada, un tacto o una vacuna.</p>
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

/** La caravana dibujada: el campo arriba, el número visible grande y la electrónica abajo. */
function Caravana({ visual, rfid, campo }: { visual: string | null; rfid: string | null; campo: string | null }) {
  const sin = !visual && !rfid
  const icono: NombreIcono = 'Caravana'
  if (sin)
    return (
      <div className="mx-auto grid h-[220px] w-[200px] place-items-center rounded-[36px] border-2 border-dashed border-neutro-300 text-center text-texto-suave">
        <span className="flex flex-col items-center gap-2">
          <Icono nombre={icono} />
          <span className="text-[14px] font-semibold">Sin caravana</span>
        </span>
      </div>
    )
  return (
    <svg viewBox="0 0 220 260" className="mx-auto h-[240px] w-auto -rotate-6 text-principal" role="img" aria-label={`Caravana ${visual ?? rfid}`}>
      <circle cx="110" cy="34" r="22" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="110" cy="34" r="10" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M78 52 Q110 70 142 52 L176 92 Q186 104 186 120 L186 222 Q186 246 162 246 L58 246 Q34 246 34 222 L34 120 Q34 104 44 92 Z" fill="var(--superficie)" stroke="currentColor" strokeWidth="5" />
      <rect x="52" y="104" width="116" height="124" rx="12" fill="none" stroke="currentColor" strokeWidth="2.5" />
      {campo && (
        <text x="110" y="128" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="700" letterSpacing="2.5">
          {campo.toUpperCase().slice(0, 16)}
        </text>
      )}
      <text x="110" y="182" textAnchor="middle" fill="currentColor" fontFamily="var(--font-cifra)" fontSize={visual && visual.length > 5 ? 34 : 56} fontWeight="800">
        {visual ?? rfid!.slice(-4)}
      </text>
      <line x1="66" y1="196" x2="154" y2="196" stroke="currentColor" strokeWidth="2.5" />
      <text x="110" y="214" textAnchor="middle" fill="currentColor" fontFamily="var(--font-cifra)" fontSize="11" fontWeight="600">
        {rfid ? `ARG · ${rfid}`.slice(0, 26) : 'sin electrónica'}
      </text>
    </svg>
  )
}
