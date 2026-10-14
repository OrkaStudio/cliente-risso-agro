import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BotonPrincipal } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import { Grupo, PanelLateral } from '@/components/tropero/panel-lateral'
import { Segmentos } from '@/components/tropero/segmentos'
import { useCampoElegido } from '@/features/campos/campo-elegido'
import { useAnimales, useAnularSalida, useAsignarCaravanasPlanilla, useIdentificarSalida, usePotreros, useResolverSinSaber, useSalidasSinIdentificar } from '@/features/hacienda/hooks'
import { categoriaNombre } from '@/features/hacienda/labels'
import { cn } from '@/lib/utils'
import { ElegirDeLista, ZonaArchivo } from './caravanas'
import { usePosibles } from './posibles'
import { leerArchivo } from './leer-archivo'
import { leerPlanilla, soloDigitos, type Lectura } from './planilla'
import { bajarPlanillaEjemplo } from './planilla-ejemplo'

const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

/**
 * Las salidas que restaron el número sin decir qué animal fue. Una pregunta
 * por salida («¿Qué vaca se vendió del 3A?»), con las posibles: las vacas que
 * estaban en ese potrero ese día y siguen en el rodeo. Se elige la que fue;
 * si no se sabe, «No sé cuál fue» (sale una cualquiera y su ficha lo dice); si
 * la salida fue un error, se anula.
 */
export function IdentificarSalidas({ empresaId, abierto, onCerrar, salidaFoco = null }: { empresaId: string; abierto: boolean; onCerrar: () => void; salidaFoco?: string | null }) {
  const salidasQ = useSalidasSinIdentificar()
  const potreros = usePotreros()
  const identificar = useIdentificarSalida()
  const sinSaber = useResolverSinSaber()
  const anular = useAnularSalida()
  const [elegidas, setElegidas] = useState<Record<string, string[]>>({})
  const [confirmar, setConfirmar] = useState<{ salidaId: string; que: 'sinSaber' | 'anular' } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const todas = salidasQ.data ?? []
  const salidas = salidaFoco ? todas.filter((x) => x.salidaId === salidaFoco) : todas
  const posiblesIds = new Set(salidas.flatMap((x) => x.posiblesIds))
  const posibles = usePosibles((a) => posiblesIds.has(a.id ?? ''))
  const nombrePotrero = (id: string) => potreros.data?.find((p) => p.id === id)?.nombre ?? ''
  const total = Object.values(elegidas).reduce((t, xs) => t + xs.length, 0)
  const ocupado = identificar.isPending || sinSaber.isPending || anular.isPending

  const cerrar = () => {
    setElegidas({})
    setConfirmar(null)
    setError(null)
    onCerrar()
  }

  async function guardar() {
    setError(null)
    try {
      let n = 0
      for (const [salidaId, caravanas] of Object.entries(elegidas)) {
        if (!caravanas.length) continue
        n += (await identificar.mutateAsync({ empresaId, caravanas, salidaId })).identificadas
      }
      toast.success(`Listo: ${n === 1 ? 'la ficha quedó' : 'las fichas quedaron'} en su lugar`, { description: 'El número del rodeo no cambia: ya estaba restado.' })
      cerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Probá de nuevo.')
    }
  }

  async function hacer(c: NonNullable<typeof confirmar>) {
    setError(null)
    try {
      if (c.que === 'sinSaber') {
        await sinSaber.mutateAsync(c.salidaId)
        toast.success('Listo: salió una cualquiera de las posibles', { description: 'Su ficha dice «dada de baja sin identificar».' })
      } else {
        const n = await anular.mutateAsync(c.salidaId)
        toast.success('Listo: anulamos esa salida', { description: n > 0 ? `${n === 1 ? 'Vuelve al rodeo el animal que había salido' : `Vuelven al rodeo los ${n} que habían salido`}.` : 'El número del potrero volvió a como estaba.' })
      }
      setConfirmar(null)
      setElegidas((e) => {
        const { [c.salidaId]: _, ...resto } = e
        void _
        return resto
      })
      if (salidas.length <= 1) cerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo. Probá de nuevo.')
    }
  }

  const unaSola = salidas.length === 1 && salidas[0]!.pendientes === 1
  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={cerrar}
      titulo={unaSola ? '¿Cuál salió?' : '¿Cuáles salieron?'}
      bajada="El número del rodeo ya está bien: esto pone cada ficha en su lugar. No hace falta hacerlo ahora."
      pie={
        <BotonPrincipal icono="Guardar" cargando={identificar.isPending} disabled={ocupado || total === 0} onClick={guardar}>
          {total === 0 ? (unaSola ? 'Tocá la que fue' : 'Tocá las que fueron') : 'Guardar'}
        </BotonPrincipal>
      }
    >
      {salidas.length === 0 && <p className="text-[15px] text-texto-suave">No queda ninguna salida sin identificar.</p>}
      <div className="flex flex-col gap-8">
        {salidas.map((x) => {
          const n = x.pendientes
          const cat = categoriaNombre(x.categoria, n).toLowerCase()
          const catTodas = categoriaNombre(x.categoria, 2).toLowerCase()
          const pot = nombrePotrero(x.potreroId)
          const verbo = x.motivo === 'muerte' ? (n === 1 ? 'murió' : 'murieron') : n === 1 ? 'se vendió' : 'se vendieron'
          const lista = posibles.filter((p) => x.posiblesIds.includes(p.id))
          const justas = x.posibles === n
          const c = confirmar?.salidaId === x.salidaId ? confirmar : null
          return (
            <section key={x.salidaId} aria-label={`Salida del ${pot}`}>
              <h3 className="font-heading text-[18px] font-extrabold text-texto">
                ¿{n === 1 ? `Qué ${cat}` : `Qué ${n} ${cat}`} {verbo} {x.motivo === 'muerte' ? 'en el' : 'del'} {pot}?
              </h3>
              <p className="mt-1 mb-3 text-[14px] leading-snug text-texto-suave">
                {justas
                  ? `Sólo ${n === 1 ? 'queda una posible: tiene que ser ésa' : `quedan ${n} posibles: tienen que ser ésas`}. Las demás ${catTodas} que estaban se movieron o salieron después.`
                  : `El ${ddmm(x.fecha)} anotaste que ${verbo} ${n} sin decir ${n === 1 ? 'cuál' : 'cuáles'}. Éstas son las ${lista.length} ${catTodas} que estaban en el ${pot} ese día y siguen en el rodeo: ${n === 1 ? 'una' : `${n}`} de ellas es la que salió.`}
              </p>
              <ElegirDeLista posibles={lista} elegidas={elegidas[x.salidaId] ?? []} cuantas={n} onCambio={(xs) => setElegidas((e) => ({ ...e, [x.salidaId]: xs }))} />

              {c ? (
                <div className="mt-3 rounded-[14px] border border-borde bg-superficie px-4 py-3">
                  <p className="text-[14px] text-texto">
                    {c.que === 'sinSaber'
                      ? `Damos de baja ${n === 1 ? 'una cualquiera' : `${n} cualesquiera`} de estas ${lista.length}. ${n === 1 ? 'Su ficha va' : 'Sus fichas van'} a decir «dada de baja sin identificar». Si después te enterás de cuál fue, lo corregís desde la ficha.`
                      : `Borramos esta salida: el ${pot} vuelve a tener ${n === 1 ? `la ${cat}` : `las ${n} ${cat}`}${x.motivo === 'muerte' ? '' : ' (y lo de la venta que se haya anotado por cantidad)'}. Usalo si la cargaste por error.`}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <button type="button" disabled={ocupado} onClick={() => hacer(c)} className="h-9 rounded-full bg-principal px-4 text-[14px] font-bold text-principal-texto hover:bg-terracota-600 disabled:opacity-50">
                      {c.que === 'sinSaber' ? 'Sí, que salga cualquiera' : 'Sí, anular la salida'}
                    </button>
                    <button type="button" onClick={() => setConfirmar(null)} className="h-9 rounded-full px-3 text-[14px] font-bold text-texto-suave hover:text-texto">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  <button type="button" onClick={() => setConfirmar({ salidaId: x.salidaId, que: 'sinSaber' })} className="text-[14px] font-bold text-principal hover:underline">
                    No sé cuál fue
                  </button>
                  <button type="button" onClick={() => setConfirmar({ salidaId: x.salidaId, que: 'anular' })} className="text-[14px] font-bold text-texto-suave hover:text-texto hover:underline">
                    Fue un error: anular la salida
                  </button>
                </div>
              )}
            </section>
          )
        })}
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
