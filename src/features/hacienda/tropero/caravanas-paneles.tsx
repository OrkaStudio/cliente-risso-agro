import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BotonPrincipal } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import { Grupo, PanelLateral } from '@/components/tropero/panel-lateral'
import { Segmentos } from '@/components/tropero/segmentos'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useAnimales, useAnularSalida, useAsignarCaravanasPlanilla, useIdentificarAnimal, usePotreros, useResolverSinSaber, useSalidasSinIdentificar } from '@/features/hacienda/hooks'
import { categoriaNombre, especiePorCategoria } from '@/features/hacienda/labels'
import { cn } from '@/lib/utils'
import { ElegirDeLista, ZonaArchivo } from './caravanas'
import { usePosibles } from './posibles'
import { edadTexto } from './rodeo'
import { leerArchivo } from './leer-archivo'
import { leerPlanilla, soloDigitos, type Lectura } from './planilla'
import { bajarPlanillaEjemplo } from './planilla-ejemplo'

const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

/**
 * Las salidas que restaron el número sin decir qué animal fue. Se resuelve una
 * por vez, de UNA de tres maneras (excluyentes): «Sé cuál fue» (las posibles
 * del potrero, o buscarla en todo el rodeo si se cargó en otro potrero o fue
 * otra), «No sé cuál fue» (queda una, nombrada, y se explica qué implica) o
 * «La cargué mal» (se anula). El botón de abajo dice lo que va a hacer.
 */
export function IdentificarSalidas({ abierto, onCerrar, salidaFoco = null }: { empresaId?: string; abierto: boolean; onCerrar: () => void; salidaFoco?: string | null }) {
  const salidasQ = useSalidasSinIdentificar()
  const potreros = usePotreros()
  const animales = useAnimales()
  const identificar = useIdentificarAnimal()
  const sinSaber = useResolverSinSaber()
  const anular = useAnularSalida()
  const [elegida, setElegida] = useState<string | null>(null)
  const [modo, setModo] = useState<'sabe' | 'nosabe' | 'error'>('sabe')
  const [ids, setIds] = useState<string[]>([])
  const [enTodo, setEnTodo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const todas = salidasQ.data ?? []
  // La que se abrió desde una fila o la ficha manda; si no, la que se eligió de la lista.
  const x = todas.find((y) => y.salidaId === (salidaFoco ?? elegida ?? (todas.length === 1 ? todas[0]!.salidaId : '')))
  const nombrePotrero = (id: string | null) => potreros.data?.find((p) => p.id === id)?.nombre ?? ''
  const posiblesIds = new Set(x?.posiblesIds ?? [])
  const posibles = usePosibles((a) => posiblesIds.has(a.id ?? ''))
  const ocupado = identificar.isPending || sinSaber.isPending || anular.isPending

  const reiniciar = () => {
    setModo('sabe')
    setIds([])
    setEnTodo(false)
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
  const porPotrero = [...rodeo.reduce((m, a) => m.set(a.potrero_id ?? '', [...(m.get(a.potrero_id ?? '') ?? []), a]), new Map<string, typeof rodeo>())].sort(([a], [b]) =>
    nombrePotrero(a).localeCompare(nombrePotrero(b), 'es', { numeric: true }),
  )
  const elegidosInfo = ids.map((id) => rodeo.find((a) => a.id === id)).filter(Boolean) as typeof rodeo

  async function confirmar() {
    if (!x) return
    setError(null)
    try {
      if (modo === 'sabe') {
        for (const id of ids) await identificar.mutateAsync({ animalId: id, salidaId: x.salidaId })
        const fuera = elegidosInfo.filter((a) => a.potrero_id !== x.potreroId)
        toast.success(`Listo: ${ids.length === 1 ? 'fue' : 'fueron'} ${nums(elegidosInfo.map((a) => ({ visual: a.caravana_visual, rfid: a.caravana_rfid })))}`, {
          description: fuera.length ? `El ${nombrePotrero(x.potreroId)} recuperó su número y ${fuera.map((a) => `el ${nombrePotrero(a.potrero_id)}`).join(' y ')} perdió la que salió.` : 'El número del rodeo no cambia: ya estaba restado.',
        })
      } else if (modo === 'nosabe') {
        await sinSaber.mutateAsync({ salidaId: x.salidaId, animalIds: quedan.map((p) => p.id) })
        toast.success(`Listo: ${nums(quedan)} ${quedan.length === 1 ? 'quedó' : 'quedaron'} como ${x.motivo === 'muerte' ? 'muerta' : 'vendida'} sin identificar`, {
          description: 'Si después la ves en el campo, desde su ficha tocás «Sigue en el campo».',
        })
      } else {
        const n = await anular.mutateAsync(x.salidaId)
        toast.success('Listo: anulamos esa salida', {
          description: `El ${nombrePotrero(x.potreroId)} volvió a como estaba${n > 0 ? ` y ${n === 1 ? 'vuelve al rodeo el animal que había salido' : `vuelven al rodeo los ${n} que habían salido`}` : ''}. Si salió de otro potrero, cargala de nuevo con «Salieron».`,
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
  const catTodas = categoriaNombre(x.categoria, 2).toLowerCase()
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
        : `Anular la ${x.motivo === 'muerte' ? 'muerte' : 'venta'}`

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={cerrar}
      ancho={modo === 'sabe' && enTodo}
      titulo={`¿Qué ${n === 1 ? cat : `${n} ${cat}`} ${verbo} del ${pot}?`}
      bajada={`Lo anotaste el ${ddmm(x.fecha)} sin decir ${n === 1 ? 'cuál' : 'cuáles'}. El número del rodeo ya está bien: esto pone cada ficha en su lugar.`}
      pie={
        <BotonPrincipal icono={modo === 'error' ? 'Borrar' : 'Guardar'} cargando={ocupado} disabled={ocupado || (modo === 'sabe' && ids.length < n) || (modo === 'nosabe' && quedan.length < n)} onClick={confirmar}>
          {boton}
        </BotonPrincipal>
      }
    >
      {todas.length > 1 && !salidaFoco && (
        <button type="button" onClick={() => (reiniciar(), setElegida(null))} className="-mt-2 mb-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-texto-suave hover:text-texto">
          <Icono nombre="Atrás" tamano={16} /> Las otras salidas
        </button>
      )}

      <div role="radiogroup" aria-label="Cómo se resuelve" className="flex flex-col gap-2">
        {(
          [
            { m: 'sabe', titulo: n === 1 ? 'Sé cuál fue' : 'Sé cuáles fueron', bajada: 'La elegís de la lista.' },
            { m: 'nosabe', titulo: 'No sé cuál fue', bajada: `Queda como ${como} una de las posibles, y se puede corregir después.` },
            { m: 'error', titulo: 'La cargué mal', bajada: 'Otro potrero, otra cantidad, o no salió: se anula.' },
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
        {modo === 'sabe' && !enTodo && (
          <>
            <p className="mb-3 text-[14px] leading-snug text-texto-suave">
              {x.posibles === n
                ? `Sólo ${n === 1 ? 'queda una posible en el ' + pot : `quedan ${n} posibles en el ${pot}`}: las demás que estaban se movieron o salieron después.`
                : `Éstas son las ${posibles.length} ${catTodas} que estaban en el ${pot} ese día y siguen en el rodeo.`}
            </p>
            <ElegirDeLista posibles={posibles.map((p) => ({ ...p, caravana: p.id }))} elegidas={ids} cuantas={n} onCambio={setIds} />
            <button type="button" onClick={() => (setEnTodo(true), setIds([]))} className="mt-4 w-full rounded-[14px] border-[1.5px] border-dashed border-borde px-4 py-3 text-left hover:bg-superficie">
              <span className="block text-[15px] font-bold text-principal">No está acá: buscala en todo el rodeo</span>
              <span className="block text-[13.5px] text-texto-suave">Si al cargarla tocaste otro potrero, o salió otra. Se corrige solo: el {pot} recupera su número.</span>
            </button>
          </>
        )}

        {modo === 'sabe' && enTodo && (
          <>
            <button type="button" onClick={() => (setEnTodo(false), setIds([]))} className="mb-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-texto-suave hover:text-texto">
              <Icono nombre="Atrás" tamano={16} /> Sólo las del {pot}
            </button>
            <p className="mb-3 text-[14px] text-texto-suave">Todo el rodeo, por potrero. Tocá {n === 1 ? 'la que salió' : `las ${n} que salieron`}.</p>
            <div className="flex max-h-[520px] flex-col gap-5 overflow-y-auto pr-1">
              {porPotrero.map(([potId, as]) => {
                const conCaravana = as.filter((a) => a.caravana_visual || a.caravana_rfid)
                const sin = as.filter((a) => !a.caravana_visual && !a.caravana_rfid)
                const tiles = [
                  ...conCaravana.map((a) => ({
                    caravana: a.id!,
                    visual: a.caravana_visual,
                    rfid: a.caravana_rfid,
                    etiqueta: categoriaNombre(a.categoria!, 1),
                    detalle: [edadTexto(a.fecha_nacimiento), posiblesIds.has(a.id!) ? 'posible' : null].filter(Boolean).join(' · '),
                  })),
                  // Las sin caravana no se distinguen: una cualquiera de ellas.
                  ...[...new Set(sin.map((a) => a.categoria!))].map((c) => ({
                    caravana: sin.find((a) => a.categoria === c && !ids.includes(a.id!))?.id ?? sin.find((a) => a.categoria === c)!.id!,
                    visual: null,
                    rfid: null,
                    etiqueta: `${categoriaNombre(c, 1)} sin caravana`,
                    detalle: `una de las ${sin.filter((a) => a.categoria === c).length}`,
                  })),
                ]
                return (
                  <section key={potId}>
                    <p className="mb-2 text-[13.5px] font-bold text-texto">{potId ? nombrePotrero(potId) : 'Sin potrero'}</p>
                    <ElegirDeLista posibles={tiles} elegidas={ids} cuantas={n} onCambio={setIds} />
                  </section>
                )
              })}
            </div>
          </>
        )}

        {modo === 'nosabe' && (
          <div className="rounded-[16px] bg-superficie px-4 py-4 text-[14.5px] leading-relaxed text-texto">
            <p className="font-bold">
              Va a quedar como {como} {quedan.length === 1 ? 'la' : 'las'} {nums(quedan)}
            </p>
            <p className="mt-1 text-texto-suave">No la elegís vos: es {quedan.length === 1 ? 'la primera' : `las primeras ${quedan.length}`} de las {posibles.length} posibles del {pot}. Qué implica:</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              <li>· {quedan.length === 1 ? 'Deja' : 'Dejan'} de aparecer en el rodeo y {quedan.length === 1 ? 'su ficha dice' : 'sus fichas dicen'} «{como} sin identificar».</li>
              <li>· Las otras {posibles.length - quedan.length} quedan como están. El número no cambia: ya estaba restado.</li>
              <li>
                · Si después ves en el campo {quedan.length === 1 ? `la ${nums(quedan)}` : 'alguna de ellas'}, en su ficha tocás «Sigue en el campo»: vuelve al rodeo y la {x.motivo === 'muerte' ? 'muerte' : 'venta'} queda otra vez sin identificar.
              </li>
            </ul>
          </div>
        )}

        {modo === 'error' && (
          <div className="rounded-[16px] bg-superficie px-4 py-4 text-[14.5px] leading-relaxed text-texto">
            <p className="font-bold">Se borra esta {x.motivo === 'muerte' ? 'muerte' : 'venta'} del {pot}</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-texto-suave">
              <li>· El {pot} vuelve a tener {n === 1 ? `la ${cat}` : `las ${n} ${cat}`} que se habían restado.</li>
              <li>· Si en esa misma carga salió algún animal sin caravana, vuelve al rodeo.</li>
              <li>· Si de verdad salió, pero de otro potrero o en otra cantidad, cargala de nuevo con «Salieron».</li>
            </ul>
          </div>
        )}
      </div>

      {error && <p className="mt-5 rounded-[14px] bg-estado-problema-suave px-4 py-3 text-[14px] font-semibold text-estado-problema-texto">{error}</p>}
    </PanelLateral>
  )
}

/**
 * Las caravanas, desde un Excel (página 35): la planilla del veterinario, la de
 * SENASA le pone número a los que se cargaron por categoría.
 * No suma animales: cuenta contra los que ya están.
 */
export function CaravanasPorExcel({ empresaId, abierto, onCerrar }: { empresaId: string; abierto: boolean; onCerrar: () => void }) {
  const animales = useAnimales()
  const potreros = usePotreros()
  const { campos, elegido } = useCampoElegido()
  const asignar = useAsignarCaravanasPlanilla()
  const [campoId, setCampoId] = useState<string | null>(elegido?.id ?? campos[0]?.id ?? null)
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [ver, setVer] = useState<'sinElectronica' | 'corregir' | null>(null)
  const [hecho, setHecho] = useState<{ asignadas: number; sinAnimal: string[]; sinElectronica: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activos = (animales.data ?? []).filter((a) => a.estado === 'activo')
  const sinCaravana = activos.filter((a) => !a.caravana_visual && !a.caravana_rfid).length
  const yaPuestas = useMemo(
    () => ({
      visual: new Set(activos.flatMap((a) => (a.caravana_visual ? [soloDigitos(a.caravana_visual)] : []))),
      rfid: new Set(activos.flatMap((a) => (a.caravana_rfid ? [soloDigitos(a.caravana_rfid)] : []))),
    }),
    [activos],
  )
  // El potrero se busca entre todos los de la empresa (el nombre no se repite);
  // el campo elegido es sólo para las filas que no dicen potrero.
  const todos = potreros.data ?? []
  const listas = lectura ? [...lectura.completas, ...lectura.sinElectronica] : []

  function cerrar() {
    setLectura(null)
    setHecho(null)
    setVer(null)
    setError(null)
    onCerrar()
  }

  async function leer(f: File) {
    setError(null)
    setLeyendo(true)
    try {
      setLectura(leerPlanilla(await leerArchivo(f), todos, yaPuestas))
    } catch {
      setError('No pudimos leer ese archivo. Probá con un Excel (.xlsx) o un CSV.')
    } finally {
      setLeyendo(false)
    }
  }

  async function guardar() {
    if (!campoId || listas.length === 0) return
    setError(null)
    try {
      const r = await asignar.mutateAsync({ empresaId, campoId, filas: listas.map((f) => ({ visual: f.visual, rfid: f.rfid, categoria: f.categoria!, potreroId: f.potreroId, nacimiento: f.nacimiento, raza: f.raza })) })
      setHecho({ ...r, sinElectronica: lectura!.sinElectronica.filter((f) => !r.sinAnimal.includes(f.visual ?? '')).length })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Probá de nuevo.')
    }
  }

  const bajarEjemplo = () => void bajarPlanillaEjemplo(todos.filter((p) => !campoId || p.campo_id === campoId).map((p) => p.nombre))

  const titulo = hecho ? `Listo: ${hecho.asignadas} ${hecho.asignadas === 1 ? 'caravana puesta' : 'caravanas puestas'}` : lectura && !lectura.faltan.length ? `Leímos ${lectura.filas} ${lectura.filas === 1 ? 'fila' : 'filas'}` : 'Las caravanas, desde un Excel'
  const pie = hecho ? (
    <BotonPrincipal icono="Guardar" onClick={cerrar}>
      Listo
    </BotonPrincipal>
  ) : lectura && listas.length > 0 ? (
    <BotonPrincipal icono="Guardar" cargando={asignar.isPending} disabled={asignar.isPending} onClick={guardar}>
      {`Ponerle caravana a ${listas.length}`}
    </BotonPrincipal>
  ) : undefined

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={cerrar}
      titulo={titulo}
      bajada={!lectura && !hecho ? 'Le pone número a los animales que cargaste por categoría. Sirve la planilla del veterinario o la de SENASA.' : undefined}
      pie={pie}
    >
      {hecho ? (
        <div>
          <span className="grid size-12 place-items-center rounded-full bg-estado-bien text-superficie">
            <Icono nombre="Guardar" />
          </span>
          <ul className="mt-5 divide-y divide-borde border-y border-borde text-[15px]">
            {hecho.sinElectronica > 0 && (
              <li className="py-3">
                <b className="text-texto">{hecho.sinElectronica} sin electrónica</b>
                <span className="block text-[13.5px] text-texto-suave">Tienen la visible. La electrónica la sumás después, con otra planilla o desde la ficha de cada uno.</span>
              </li>
            )}
            {hecho.sinAnimal.length > 0 && (
              <li className="py-3">
                <b className="text-texto">{hecho.sinAnimal.length} sin animal</b>
                <span className="block text-[13.5px] text-texto-suave">
                  No había de esa categoría sin caravana en ese potrero: {hecho.sinAnimal.slice(0, 6).join(', ')}
                  {hecho.sinAnimal.length > 6 ? '…' : ''}. Si entraron, sumalos con «Entraron».
                </span>
              </li>
            )}
            <li className="py-3 text-[13.5px] text-texto-suave">Ya se ven en la lista del rodeo, con su caravana.</li>
          </ul>
        </div>
      ) : !lectura || lectura.faltan.length ? (
        <>
          <ZonaArchivo titulo="Soltá acá el Excel" bajada="o tocá para buscarlo en la compu. Excel o CSV." onArchivo={leer} cargando={leyendo} />
          {lectura?.faltan.length ? (
            <p className="mt-3 rounded-[14px] bg-estado-problema-suave px-4 py-3 text-[14px] font-semibold text-estado-problema-texto">No encontramos {lectura.faltan.join(' ni ')}. Fijate que la primera fila tenga los títulos de las columnas.</p>
          ) : null}
          <Grupo titulo="Qué columnas leemos" className="mt-6">
            <dl className="divide-y divide-borde border-y border-borde text-[14.5px]">
              {[
                ['Caravana visible', 'Obligatoria'],
                ['Categoría', 'Obligatoria: vaca, ternero, novillo…'],
                ['Potrero', 'Si falta, va al campo de abajo'],
                ['Electrónica', 'Si falta, queda para emparejar'],
                ['Nacimiento y raza', 'Si están'],
              ].map(([a, b]) => (
                <div key={a} className="flex justify-between gap-4 py-2.5">
                  <dt className="font-semibold text-texto">{a}</dt>
                  <dd className="text-right text-texto-suave">{b}</dd>
                </div>
              ))}
            </dl>
          </Grupo>
          <button type="button" onClick={bajarEjemplo} className="mt-4 inline-flex h-9 items-center gap-2 rounded-full border-[1.5px] border-principal px-3.5 text-[14px] font-bold text-principal hover:bg-principal-suave">
            <Icono nombre="Descargar" tamano={16} /> Bajar la planilla de ejemplo (Excel)
          </button>
          {campos.length > 1 && (
            <Grupo titulo="Si falta el potrero, ¿a qué campo van?" className="mt-6">
              <Segmentos etiqueta="Campo" opciones={campos.slice(0, 4).map((c) => ({ valor: c.id, texto: c.nombre }))} valor={campoId} onCambio={setCampoId} />
            </Grupo>
          )}
        </>
      ) : (
        <div>
          <p className="flex items-baseline gap-3">
            <span className="titulo-display text-[64px] leading-none text-texto">{listas.length}</span>
            <span className="font-heading text-[18px] font-extrabold text-texto">caravanas para tu rodeo</span>
          </p>
          <ul className="mt-5 flex flex-col gap-2.5">
            <Resumen tono="bien" titulo={`${lectura.completas.length} ${lectura.completas.length === 1 ? 'completa' : 'completas'}`} bajada="Se las ponemos a los que ya cargaste, en su potrero." />
            {lectura.sinElectronica.length > 0 && (
              <Resumen tono="atencion" titulo={`${lectura.sinElectronica.length} sin electrónica`} bajada="Se ponen igual; la electrónica la sumás después." onVer={() => setVer(ver === 'sinElectronica' ? null : 'sinElectronica')} />
            )}
            {lectura.paraCorregir.length > 0 && (
              <Resumen tono="problema" titulo={`${lectura.paraCorregir.length} para corregir`} bajada="Quedan aparte. Corregilas en el Excel y volvé a subirlo." onVer={() => setVer(ver === 'corregir' ? null : 'corregir')} />
            )}
          </ul>
          {ver === 'corregir' && (
            <ul className="mt-3 divide-y divide-borde border-y border-borde text-[14px]">
              {lectura.paraCorregir.map((p) => (
                <li key={p.fila} className="flex gap-3 py-2">
                  <span className="cifra w-14 shrink-0 text-[16px] font-bold text-texto">{p.caravana}</span>
                  <span className="text-texto-suave">
                    Fila {p.fila}: {p.problema}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Grupo titulo={ver === 'sinElectronica' ? 'Las que no tienen electrónica' : 'Así quedan, las primeras'} className="mt-6">
            <table className="w-full text-[14.5px]">
              <tbody className="divide-y divide-borde">
                {(ver === 'sinElectronica' ? lectura.sinElectronica : listas).slice(0, ver ? 50 : 5).map((f) => (
                  <tr key={f.fila}>
                    <td className="cifra py-2 text-[16px] font-bold text-texto">{f.visual ?? '—'}</td>
                    <td className="py-2 text-texto">{f.categoria ? categoriaNombre(f.categoria, 1) : ''}</td>
                    <td className="py-2 text-texto-suave">{f.potrero ?? 'en el campo'}</td>
                    <td className={cn('cifra py-2 text-right', f.rfid ? 'text-texto-suave' : 'font-bold text-estado-atencion-texto')}>{f.rfid ?? 'falta'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Grupo>
          <p className="mt-4 text-[13.5px] text-texto-suave">
            No se suman animales: el Excel cuenta contra los {sinCaravana} sin caravana que cargaste.
            {listas.length > sinCaravana ? ` Sobran ${listas.length - sinCaravana}: si entraron, sumalos con «Entraron».` : ''}
          </p>
        </div>
      )}
      {error && <p className="mt-5 rounded-[14px] bg-estado-problema-suave px-4 py-3 text-[14px] font-semibold text-estado-problema-texto">{error}</p>}
    </PanelLateral>
  )
}

function Resumen({ tono, titulo, bajada, onVer }: { tono: 'bien' | 'atencion' | 'problema'; titulo: string; bajada: string; onVer?: () => void }) {
  const raya = { bien: 'bg-estado-bien', atencion: 'bg-trigo-500', problema: 'bg-estado-problema' }[tono]
  return (
    <li className="flex items-center gap-3 rounded-[14px] bg-superficie py-3 pr-3 pl-0">
      <span className={cn('h-10 w-1 shrink-0 rounded-r-full', raya)} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-texto">{titulo}</span>
        <span className="block text-[13.5px] text-texto-suave">{bajada}</span>
      </span>
      {onVer && (
        <button type="button" onClick={onVer} className="h-9 rounded-full border-[1.5px] border-principal px-3.5 text-[14px] font-bold text-principal hover:bg-principal-suave">
          Ver
        </button>
      )}
    </li>
  )
}
