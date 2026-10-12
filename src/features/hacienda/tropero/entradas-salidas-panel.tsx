import { useMemo, useState } from 'react'
import { BotonPrincipal } from '@/components/tropero/boton'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { Grupo, PanelLateral } from '@/components/tropero/panel-lateral'
import { Segmentos } from '@/components/tropero/segmentos'
import { CampoFecha } from '@/components/ui/campo-fecha'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useAnimales, useCrearAnimalesMasivo, useMoverAnimales, useSalidaPorCantidad } from '@/features/hacienda/hooks'
import { categoriaNombre } from '@/features/hacienda/labels'
import { CroquisElegir } from '@/features/mapa/croquis-elegir'
import { CaravanasQueSalieron, type Conocida } from './caravanas'
import { useMapa } from '@/features/mapa/api'
import type { CampoMapa } from '@/features/mapa/reglas'
import type { Database } from '@/lib/supabase/types'
import { hoyLocal } from '@/lib/fecha'
import { cn } from '@/lib/utils'
import {
  botonConfirmar,
  categoriasParaContar,
  composicionPorPotrero,
  cuantosTexto,
  OPCIONES_ENTRADA,
  OPCIONES_SALIDA,
  pendientesDeIdentificar,
  tituloListo,
  type Que,
} from './entradas-salidas'

type Categoria = Database['public']['Enums']['categoria_animal']
type Paso = 'que' | 'cuantos' | 'adonde' | 'revisa' | 'listo'
type Resultado = { titulo: string; quedan: string; pendientes: number }

const ICONO_QUE: Record<string, NombreIcono> = {
  venta: 'Plata',
  muerte: 'Borrar',
  otroCampo: 'Campos',
  correccion: 'Editar',
  compra: 'Plata',
  nacimiento: 'Ternero',
  deOtroCampo: 'Campos',
}

/**
 * Entraron · Salieron (página 35). La hacienda que entra o sale por cantidad,
 * sin leer caravanas: qué pasó → de qué potrero y cuántos, sobre el croquis →
 * revisá (antes y después) → listo, con lo que queda por hacer.
 */
export function EntradasSalidas({ modo, empresaId, abierto, onCerrar }: { modo: 'entraron' | 'salieron'; empresaId: string; abierto: boolean; onCerrar: () => void }) {
  const { data: mapa } = useMapa(empresaId)
  const animales = useAnimales()
  const { elegido } = useCampoElegido()
  const salida = useSalidaPorCantidad()
  const alta = useCrearAnimalesMasivo()
  const mover = useMoverAnimales()

  const [paso, setPaso] = useState<Paso>('que')
  const [q, setQ] = useState<Que | null>(null)
  const [campoId, setCampoId] = useState<string | null>(null)
  const [potreroId, setPotreroId] = useState<string | null>(null)
  const [destCampoId, setDestCampoId] = useState<string | null>(null)
  const [destinoId, setDestinoId] = useState<string | null>(null)
  const [cuantos, setCuantos] = useState<Partial<Record<Categoria, number>>>({})
  const [cuando, setCuando] = useState<'hoy' | 'otro'>('hoy')
  const [fecha, setFecha] = useState(hoyLocal())
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<Resultado | null>(null)
  const [caravanas, setCaravanas] = useState<string[]>([])

  const campos = useMemo(() => (mapa ?? []).filter((c) => c.potreros.length > 0), [mapa])
  const comp = useMemo(() => composicionPorPotrero(animales.data ?? []), [animales.data])
  const campo = campos.find((c) => c.id === campoId) ?? null
  const potrero = campo?.potreros.find((p) => p.id === potreroId) ?? null
  const destCampo = campos.find((c) => c.id === destCampoId) ?? null
  const destino = destCampo?.potreros.find((p) => p.id === destinoId) ?? null
  const enPotrero = potreroId ? comp.get(potreroId) : undefined
  const items = Object.entries(cuantos)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([categoria, cantidad]) => ({ categoria: categoria as Categoria, cantidad: cantidad! }))
  const total = items.reduce((s, it) => s + it.cantidad, 0)
  const mueve = q && (q.modo === 'salieron' ? q.que === 'otroCampo' : q.que === 'deOtroCampo')
  const sacan = q?.modo === 'salieron' || (q?.modo === 'entraron' && q.que === 'deOtroCampo')
  const ocupado = salida.isPending || alta.isPending || mover.isPending
  // Las caravanas del potrero que pueden ser las que salieron (de las categorías que salen).
  const posibles: (Conocida & { categoria: Categoria })[] = (animales.data ?? []).flatMap((a) =>
    a.estado === 'activo' && a.potrero_id === potreroId && a.categoria && cuantos[a.categoria] && (a.caravana_visual || a.caravana_rfid)
      ? [{ caravana: (a.caravana_visual ?? a.caravana_rfid)!, visual: a.caravana_visual, rfid: a.caravana_rfid, etiqueta: categoriaNombre(a.categoria, 1), categoria: a.categoria }]
      : [],
  )
  const identificadasPor = (c: Categoria) => caravanas.filter((x) => posibles.find((p) => p.caravana === x)?.categoria === c).length

  function reiniciar() {
    setPaso('que')
    setQ(null)
    setPotreroId(null)
    setDestinoId(null)
    setCuantos({})
    setCuando('hoy')
    setFecha(hoyLocal())
    setError(null)
    setHecho(null)
    setCaravanas([])
  }
  function cerrar() {
    reiniciar()
    onCerrar()
  }
  function elegirQue(nuevo: Que) {
    setQ(nuevo)
    // De dónde salen: el campo que estás viendo; si viene de otro campo, otro que no sea ése.
    const visto = elegido?.id ?? campos[0]?.id ?? null
    const otro = campos.find((c) => c.id !== visto)?.id ?? null
    const traer = nuevo.modo === 'entraron' && nuevo.que === 'deOtroCampo'
    setCampoId(traer ? otro : visto)
    setDestCampoId(traer ? visto : nuevo.modo === 'salieron' && nuevo.que === 'otroCampo' ? otro : null)
    setPaso('cuantos')
  }

  async function confirmar() {
    if (!q || !potreroId || total === 0) return
    setError(null)
    const antes = [...(enPotrero?.values() ?? [])].reduce((s, h) => s + h.total, 0)
    try {
      if (q.modo === 'salieron' && q.que !== 'otroCampo') {
        const r = await salida.mutateAsync({ empresaId, potreroId, items, motivo: q.que === 'venta' ? 'venta' : q.que === 'muerte' ? 'muerte' : 'correccion', fecha: cuando === 'hoy' ? hoyLocal() : fecha, caravanas })
        setHecho({ titulo: tituloListo(q, items), quedan: `En el ${potrero!.nombre} quedan ${antes - r.salieron}.`, pendientes: r.pendientesIdentificar })
      } else if (mueve) {
        if (!destinoId) return
        await mover.mutateAsync({ empresaId, potreroOrigenId: potreroId, potreroDestinoId: destinoId, loteId: null, seleccion: { items } })
        setHecho({ titulo: tituloListo(q, items), quedan: `Ahora están en el ${destino!.nombre} de ${destCampo!.nombre}.`, pendientes: 0 })
      } else {
        await alta.mutateAsync({ empresaId, campoId, origen: q.que === 'compra' ? 'compra' : q.que === 'nacimiento' ? 'nacimiento' : 'correccion', bloques: [{ potreroId, items }] })
        setHecho({ titulo: tituloListo(q, items), quedan: `En el ${potrero!.nombre} ahora hay ${antes + total}.`, pendientes: 0 })
      }
      setPaso('listo')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Probá de nuevo.')
    }
  }

  const titulo =
    paso === 'que'
      ? modo === 'salieron'
        ? 'Salieron'
        : 'Entraron'
      : paso === 'listo'
        ? (hecho?.titulo ?? 'Listo')
        : paso === 'revisa'
          ? 'Revisá'
          : paso === 'adonde'
            ? '¿A qué potrero van?'
            : q
              ? ((q.modo === 'salieron' ? OPCIONES_SALIDA : OPCIONES_ENTRADA).find((o) => o.que === q.que)?.titulo ?? '')
              : ''
  const bajada =
    paso === 'que'
      ? modo === 'salieron'
        ? '¿Qué pasó?'
        : '¿De dónde vienen?'
      : paso === 'cuantos'
        ? sacan
          ? '¿De qué potrero y cuántos?'
          : '¿A qué potrero y cuántos?'
        : paso === 'adonde'
          ? `${cuantosTexto(items)} del ${potrero?.nombre ?? ''}`
          : undefined

  const pie =
    paso === 'cuantos' ? (
      <BotonPrincipal icono="Siguiente" disabled={!potreroId || total === 0} onClick={() => setPaso(mueve ? 'adonde' : 'revisa')}>
        {total === 0 ? (potreroId ? 'Contá cuántos' : 'Tocá un potrero') : `Revisar: ${cuantosTexto(items)}`}
      </BotonPrincipal>
    ) : paso === 'adonde' ? (
      <BotonPrincipal icono="Siguiente" disabled={!destinoId} onClick={() => setPaso('revisa')}>
        {destino ? `Revisar: al ${destino.nombre}` : 'Tocá el potrero'}
      </BotonPrincipal>
    ) : paso === 'revisa' && q ? (
      <BotonPrincipal icono="Guardar" cargando={ocupado} disabled={ocupado} onClick={confirmar}>
        {botonConfirmar(q, items, destino?.nombre)}
      </BotonPrincipal>
    ) : paso === 'listo' ? (
      <BotonPrincipal icono="Guardar" onClick={cerrar}>
        Listo
      </BotonPrincipal>
    ) : undefined

  return (
    <PanelLateral abierto={abierto} onCerrar={cerrar} titulo={titulo} bajada={bajada} pie={pie}>
      {paso !== 'que' && paso !== 'listo' && (
        <button
          type="button"
          onClick={() => setPaso(paso === 'revisa' ? (mueve ? 'adonde' : 'cuantos') : paso === 'adonde' ? 'cuantos' : 'que')}
          className="-mt-2 mb-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-texto-suave hover:text-texto"
        >
          <Icono nombre="Atrás" tamano={16} /> Volver
        </button>
      )}

      {paso === 'que' && (
        <ul className="flex flex-col gap-3">
          {(modo === 'salieron' ? OPCIONES_SALIDA : OPCIONES_ENTRADA)
            .filter((o) => campos.length > 1 || (o.que !== 'otroCampo' && o.que !== 'deOtroCampo'))
            .map((o) => (
              <li key={o.que}>
                <button
                  type="button"
                  onClick={() => elegirQue(modo === 'salieron' ? { modo, que: o.que as never } : { modo, que: o.que as never })}
                  className="flex w-full items-center gap-4 rounded-[18px] bg-superficie px-5 py-4 text-left transition-colors hover:bg-superficie-hundida"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-superficie-hundida text-texto">
                    <Icono nombre={ICONO_QUE[o.que] ?? 'Hacienda'} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-heading text-[18px] font-extrabold text-texto">{o.titulo}</span>
                    <span className="block text-[14px] text-texto-suave">{o.bajada}</span>
                  </span>
                  <Icono nombre="Siguiente" tamano={16} />
                </button>
              </li>
            ))}
        </ul>
      )}

      {paso === 'cuantos' && q && (
        <>
          <ElegirCampo campos={campos} valor={campoId} onCambio={(id) => (setCampoId(id), setPotreroId(null), setCuantos({}))} excepto={q.modo === 'entraron' && q.que === 'deOtroCampo' ? destCampoId : null} />
          {campo && (
            <Potreros
              campo={campo}
              elegido={potreroId}
              onElegir={(id) => (setPotreroId(id), setCuantos({}), setCaravanas([]))}
              apagado={sacan ? (p) => !(comp.get(p.id)?.size) : undefined}
              dato={sacan ? (p) => (comp.get(p.id) ? `${[...comp.get(p.id)!.values()].reduce((s, h) => s + h.total, 0)} cab` : null) : undefined}
            />
          )}
          {potrero && (
            <Contar
              filas={categoriasParaContar(q, enPotrero)}
              cuantos={cuantos}
              setCuantos={setCuantos}
              potrero={potrero.nombre}
              sacan={!!sacan}
            />
          )}
        </>
      )}

      {paso === 'adonde' && (
        <>
          <ElegirCampo campos={campos} valor={destCampoId} onCambio={(id) => (setDestCampoId(id), setDestinoId(null))} excepto={campoId} />
          {destCampo && <Potreros campo={destCampo} elegido={destinoId} onElegir={setDestinoId} />}
        </>
      )}

      {paso === 'revisa' && q && potrero && (
        <Revisa
          q={q}
          items={items}
          antes={[...(enPotrero?.values() ?? [])].reduce((s, h) => s + h.total, 0)}
          potrero={potrero.nombre}
          destino={destino ? `${destino.nombre} de ${destCampo?.nombre}` : null}
          pendientes={q.modo === 'salieron' && q.que !== 'otroCampo' ? pendientesDeIdentificar(items.map((it) => ({ ...it, cantidad: it.cantidad - identificadasPor(it.categoria) })), enPotrero) : 0}
          caravanas={
            q.modo === 'salieron' && (q.que === 'venta' || q.que === 'muerte') && posibles.length > 0 ? (
              <CaravanasQueSalieron posibles={posibles} elegidas={caravanas} onCambio={setCaravanas} cuantas={total} />
            ) : null
          }
          cuando={cuando}
          setCuando={setCuando}
          fecha={fecha}
          setFecha={setFecha}
        />
      )}

      {paso === 'listo' && hecho && q && (
        <div>
          <span className="grid size-12 place-items-center rounded-full bg-estado-bien text-superficie">
            <Icono nombre="Guardar" />
          </span>
          <p className="mt-4 text-[16px] text-texto-suave">{hecho.quedan}</p>
          <ul className="mt-5 divide-y divide-borde border-y border-borde">
            {hecho.pendientes > 0 && (
              <Siguiente icono="Caravana" titulo={`Decir cuáles fueron: ${hecho.pendientes} con caravana`} bajada="En la próxima manga, el bastón los reconoce. Mientras, quedan «pendientes de identificar»." />
            )}
            {q.modo === 'salieron' && q.que === 'venta' && <Siguiente icono="Comprobante" titulo="La liquidación" bajada="Cuando llegue, sacale una foto desde Plata." />}
            {q.modo === 'entraron' && q.que === 'compra' && <Siguiente icono="Comprobante" titulo="La liquidación" bajada="Cuando llegue, sacale una foto desde Plata." />}
            {q.modo === 'entraron' && (q.que === 'compra' || q.que === 'nacimiento' || q.que === 'correccion') && (
              <Siguiente icono="Caravana" titulo="Caravanearlos" bajada="Entran sin caravana: se la ponés en la próxima manga." />
            )}
            {sacan && (
              <li className="flex items-center gap-4 py-3.5">
                <span className="text-principal">
                  <Icono nombre="Agregar" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-texto">Sumar de otro potrero</span>
                  <span className="block text-[13.5px] text-texto-suave">Lo mismo, con hacienda de otro potrero.</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const que = q
                    reiniciar()
                    elegirQue(que)
                  }}
                  className="inline-flex h-9 items-center rounded-full border-[1.5px] border-principal px-3.5 text-[14px] font-bold text-principal hover:bg-principal-suave"
                >
                  Sumar
                </button>
              </li>
            )}
          </ul>
        </div>
      )}

      {error && <p className="mt-5 rounded-[14px] bg-estado-problema-suave px-4 py-3 text-[14px] font-semibold text-estado-problema-texto">{error}</p>}
    </PanelLateral>
  )
}

/** El croquis satelital si el campo está dibujado; si no, sus potreros como botones. */
function Potreros(props: React.ComponentProps<typeof CroquisElegir>) {
  const { campo, elegido, onElegir, dato, apagado } = props
  if (campo.potreros.some((p) => p.poligono)) return <CroquisElegir {...props} />
  return (
    <div className="flex flex-wrap gap-2">
      {campo.potreros.map((p) => {
        const off = apagado?.(p) ?? false
        const d = dato?.(p)
        return (
          <button
            key={p.id}
            type="button"
            disabled={off}
            aria-pressed={elegido === p.id}
            onClick={() => onElegir(p.id)}
            className={cn(
              'flex min-w-[64px] flex-col items-center rounded-[14px] border-[1.5px] px-3 py-2 transition-colors disabled:opacity-40',
              elegido === p.id ? 'border-principal bg-principal text-principal-texto' : 'border-borde bg-superficie text-texto hover:border-neutro-300',
            )}
          >
            <span className="cifra text-[18px] leading-none font-bold">{p.nombre}</span>
            {d && <span className="mt-0.5 text-[11.5px] font-semibold opacity-80">{d}</span>}
          </button>
        )
      })}
    </div>
  )
}

function ElegirCampo({ campos, valor, onCambio, excepto }: { campos: CampoMapa[]; valor: string | null; onCambio: (id: string) => void; excepto?: string | null }) {
  const opciones = campos.filter((c) => c.id !== excepto)
  if (opciones.length <= 1) return null
  if (opciones.length > 4)
    return (
      <label className="mb-3 flex flex-col gap-1.5">
        <span className="text-[14px] font-semibold text-texto-suave">Campo</span>
        <select
          value={valor ?? ''}
          onChange={(e) => onCambio(e.target.value)}
          className="h-11 rounded-full border-[1.5px] border-borde bg-superficie px-4 text-[15px] font-semibold text-texto"
        >
          {opciones.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>
    )
  return (
    <div className="mb-3">
      <Segmentos etiqueta="Campo" opciones={opciones.map((c) => ({ valor: c.id, texto: c.nombre }))} valor={valor} onCambio={onCambio} />
    </div>
  )
}

/** Cuántos de cada categoría: − número + (en una salida, hasta lo que hay). */
function Contar({
  filas,
  cuantos,
  setCuantos,
  potrero,
  sacan,
}: {
  filas: { categoria: Categoria; max: number | null; hay: number }[]
  cuantos: Partial<Record<Categoria, number>>
  setCuantos: (f: (c: Partial<Record<Categoria, number>>) => Partial<Record<Categoria, number>>) => void
  potrero: string
  sacan: boolean
}) {
  if (filas.length === 0) return <p className="mt-5 text-[14.5px] text-texto-suave">En el {potrero} no hay hacienda.</p>
  return (
    <ul className="mt-4 divide-y divide-borde border-y border-borde">
      {filas.map((f) => {
        const n = cuantos[f.categoria] ?? 0
        const tope = f.max ?? 9999
        const poner = (v: number) => setCuantos((c) => ({ ...c, [f.categoria]: Math.max(0, Math.min(tope, v)) }))
        return (
          <li key={f.categoria} className="flex items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-bold text-texto">{categoriaNombre(f.categoria, 2)}</span>
              {sacan ? (
                <span className="block text-[13px] text-texto-suave">
                  de {f.hay} en el {potrero}
                  {f.max !== null && f.max < f.hay ? ` · ${f.max} sin caravana` : ''}
                </span>
              ) : (
                f.hay > 0 && <span className="block text-[13px] text-texto-suave">hoy hay {f.hay}</span>
              )}
            </span>
            <button type="button" aria-label={`Uno menos: ${categoriaNombre(f.categoria, 2)}`} onClick={() => poner(n - 1)} disabled={n === 0} className="grid size-9 place-items-center rounded-full bg-superficie-hundida text-[18px] font-bold text-texto disabled:opacity-40">
              −
            </button>
            <input
              aria-label={`Cuántos ${categoriaNombre(f.categoria, 2).toLowerCase()}`}
              inputMode="numeric"
              value={n}
              onChange={(e) => poner(Number(e.target.value.replace(/\D/g, '')) || 0)}
              className={cn('cifra w-14 bg-transparent text-center text-[24px] font-bold outline-none', n ? 'text-texto' : 'text-texto-suave/60')}
            />
            <button type="button" aria-label={`Uno más: ${categoriaNombre(f.categoria, 2)}`} onClick={() => poner(n + 1)} disabled={n >= tope} className="grid size-9 place-items-center rounded-full bg-principal text-[18px] font-bold text-principal-texto disabled:opacity-40">
              +
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Revisa({
  q,
  items,
  antes,
  potrero,
  destino,
  pendientes,
  cuando,
  setCuando,
  fecha,
  setFecha,
  caravanas,
}: {
  caravanas: React.ReactNode
  q: Que
  items: { categoria: Categoria; cantidad: number }[]
  antes: number
  potrero: string
  destino: string | null
  pendientes: number
  cuando: 'hoy' | 'otro'
  setCuando: (v: 'hoy' | 'otro') => void
  fecha: string
  setFecha: (v: string) => void
}) {
  const total = items.reduce((s, it) => s + it.cantidad, 0)
  const sale = q.modo === 'salieron' || q.que === 'deOtroCampo'
  const despues = sale ? antes - total : antes + total
  const frase =
    q.modo === 'salieron'
      ? q.que === 'venta'
        ? `se van en venta`
        : q.que === 'muerte'
          ? `murieron`
          : q.que === 'otroCampo'
            ? `pasan al ${destino}`
            : `estaban cargados de más`
      : q.que === 'deOtroCampo'
        ? `pasan al ${destino}`
        : q.que === 'nacimiento'
          ? 'nacieron'
          : q.que === 'compra'
            ? 'entran comprados'
            : 'faltaban cargar'
  return (
    <div>
      <p className="flex items-center gap-4">
        <span className="titulo-display text-[56px] leading-none text-texto-suave">{antes}</span>
        <Icono nombre="Siguiente" />
        <span className="titulo-display text-[56px] leading-none text-texto">{despues}</span>
      </p>
      <p className="mt-3 text-[16px] font-semibold text-texto">
        {cuantosTexto(items)} {sale ? `del ${potrero}` : `en el ${potrero}`} {frase}.
      </p>
      {q.modo === 'salieron' && q.que !== 'otroCampo' && (
        <Grupo titulo="Cuándo" className="mt-6">
          <Segmentos etiqueta="Cuándo" opciones={[{ valor: 'hoy', texto: 'Hoy' }, { valor: 'otro', texto: 'Otro día' }]} valor={cuando} onCambio={setCuando} />
          {cuando === 'otro' && (
            <div className="mt-3">
              <CampoFecha value={fecha} onChange={setFecha} ariaLabel="Qué día" max={hoyLocal()} />
            </div>
          )}
        </Grupo>
      )}
      {caravanas && (
        <Grupo titulo="Las caravanas" className="mt-6">
          {caravanas}
        </Grupo>
      )}
      {pendientes > 0 && (
        <p className="mt-6 rounded-[14px] bg-superficie px-4 py-3 text-[14.5px] text-texto">
          Salen primero los que no tienen caravana. <b>{pendientes}</b> {pendientes === 1 ? 'tiene' : 'tienen'} caravana: {pendientes === 1 ? 'queda' : 'quedan'} «pendiente de identificar» hasta que digas cuál fue, en la próxima manga.
        </p>
      )}
      {q.modo === 'salieron' && q.que === 'correccion' && (
        <p className="mt-6 rounded-[14px] bg-superficie px-4 py-3 text-[14.5px] text-texto-suave">No cuenta como venta ni como muerte: es un error de carga. Quedan en la historia como «corregidos».</p>
      )}
    </div>
  )
}

function Siguiente({ icono, titulo, bajada }: { icono: NombreIcono; titulo: string; bajada: string }) {
  return (
    <li className="flex items-center gap-4 py-3.5">
      <span className="text-principal">
        <Icono nombre={icono} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-texto">{titulo}</span>
        <span className="block text-[13.5px] text-texto-suave">{bajada}</span>
      </span>
    </li>
  )
}
